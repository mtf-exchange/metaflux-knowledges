# Idempotency

{% hint style="success" %}
**Stable.**
{% endhint %}

How to retry safely without double-spending nonces or duplicating orders.

## TL;DR

- Every action has a `nonce`. Reusing one returns `400 nonce_must_increase`.
- Set a unique `cloid` on every `Order` / `ModifyOrder`; the server rejects duplicate `cloid` on the same account, so retry is safe.
- For non-order actions, the **state machine** is naturally idempotent (cancel of a non-existent order is harmless; transfer is enforced by balance check).
- The network error model splits into three classes — admission rejection, commit-time error, network drop — each with a different retry rule.

## Three error classes

```
                  POST /exchange
                        │
        ┌───────────────┼───────────────┐
        │               │               │
       2xx            4xx/5xx        network drop
        │               │               │
        ▼               ▼               ▼
    admitted to      synchronous     unknown — did it
    mempool          rejection;      land?
                    consume the
                    nonce?  see
                    table below

                        │
                        ▼
                  ┌──────────────┐
                  │ committed?   │
                  └──────────────┘
                        │
              ┌─────────┼─────────┐
              │                   │
        commit ok           commit error
        (state changed)     (state machine
                             rejected post-admit)
```

## Nonce consumption

| Outcome | Nonce consumed? | Safe to retry? |
|---------|:---------------:|:--------------:|
| `202 admitted` | YES | NO — duplicate effect |
| `400 nonce_must_increase` | NO (already past it) | NO — submit at a higher nonce |
| `400 invalid_msgpack` / other parse errors | NO | YES — fix and resubmit at same nonce |
| `401 signer_*` | NO | NO until the signing issue is fixed; the nonce is unconsumed |
| `422 reduce_only_violation` and other admit-time logical errors | NO | YES once the logical issue is fixed |
| `429 rate_limit` | NO | YES after `retry_after_ms` |
| `503 mempool_full` | NO | YES after `retry_after_ms` |
| Network drop (no response) | UNKNOWN | RECONCILE — see [reconcile after drop](#reconcile-after-network-drop) below |

The rule: **a request gets a server response → the nonce decision is made**. A network drop is the only ambiguous case.

## Strategy: cloid

For order placement, the client order id is the strongest dedup primitive.

```typescript
const cloid = crypto.randomBytes(16);  // 16 bytes

await client.order({
  asset: 0, side: 'Buy', priceE8: '...', sizeE8: '...',
  tif: 'Gtc', cloid: '0x' + cloid.toString('hex'),
});
```

The server returns:

| Server response | What it means |
|-----------------|---------------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | Order placed, dedup confirmed |
| `{"error":"duplicate cloid"}` | A prior request with the same cloid was admitted; **the order is already on the book**. Look it up by cloid. |
| `{"error":"<other>"}` | This entry failed; you can retry with a fresh cloid or the same one |

Retry rule for orders: **same cloid + same params** is idempotent end-to-end. If the first try landed, the second sees `duplicate cloid` and you know the original is in place.

```
attempt 1: send cloid=X, lose network, no response
attempt 2: send cloid=X again (same params)
  if {"resting":{"oid":N,...}}: first try never landed; this one did
  if {"error":"duplicate cloid"}: first try landed; this one is dedup'd
  in both cases: there is exactly one order with cloid=X on the book
```

The same logic applies to `ModifyOrder` — set a new cloid for the modify, dedup the modify.

## Strategy: state-machine idempotence

Most non-order actions are idempotent at the state-machine level:

| Action | Idempotent? | Why |
|--------|:-----------:|-----|
| `Cancel` | yes | Cancelling a non-existent / already-cancelled order returns `{"error":"order not found"}` — harmless |
| `CancelByCloid` | yes | Same |
| `UpdateLeverage` | yes | Setting leverage to the current value is a no-op |
| `UpdateMarginMode` | yes | Same |
| `UserPortfolioMargin` | yes | Same |
| `ApproveAgent` | yes | Same approval data overwrites the existing record |
| `UsdcTransfer` | NO | Transfers a fresh amount each time |
| `WithdrawUsdc` | NO | Same |
| `Delegate` / `Undelegate` | NO | Add to the action queue each call |

For NOT-idempotent actions, use either:
- **The nonce as your dedup key**: track which nonces you've submitted, never submit twice with the same nonce. The server enforces this regardless.
- **An external dedup table**: keep a `{request_id → nonce}` map; if your retry sees an existing nonce for this request_id, you've already submitted.

## Reconcile after network drop

When the response is lost (TCP closed, timeout, etc.) you don't know if the action committed. Reconcile:

### For orders

Query by cloid:

```bash
curl -X POST $BASE/info \
  -d '{"type":"openOrders","user":"0x..."}' | jq '.[] | select(.cloid == "0x<cloid>")'
```

If present → admitted; treat as success.
If absent → check `userFills` for a fill against that cloid.
If still absent → admission failed (or was evicted from mempool). Submit again with the same cloid.

### For transfers / withdrawals

Query the account's `userFills` (which includes funding + transfers) or `block_info` around the time of the drop. Match by the action_hash you computed locally — every action has a deterministic hash regardless of admission outcome.

```typescript
const actionHash = keccak256(msgpack(action));
// search for events with this action_hash in WS history or info queries
```

If you can't determine outcome:
- **For an idempotent action**: retry safely (use a fresh nonce, since the old one may already be consumed).
- **For a non-idempotent action**: pause; query the account state to see if the side-effect happened; resume only after certainty.

## Sequence — retry with cloid after timeout

```
T=0      attempt 1: POST /exchange Order { cloid: X }
T=2s     (no response — network drop)
T=2s     attempt 2: POST /exchange Order { cloid: X }  (same params, NEW nonce)
T=2.1s   response: {"error":"nonce_too_small"}
           → original was admitted! the new nonce is needed but the order itself is already in place.

         OR: response: {"resting":{"oid":N}}
           → original never landed; this one did

         OR: response: {"error":"duplicate cloid"}
           → original landed too; we're already dedup'd

T=2.2s   query openOrders by cloid: confirm presence
```

The cloid + the server-side checks make the retry safe even when the network is unreliable.

## Nonce-issue troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `nonce_must_increase` on every request | Local clock skew (using `Date.now()`) | Sync clock; or use a monotonic counter |
| Two scripts collide on nonce | Sharing the same account | Use a shared nonce service, or one script per account |
| `nonce_too_small` after a reconnect | Local nonce counter reset to pre-drop value | Persist last-submitted nonce across restarts |

## See also

- [`POST /exchange`](../api/rest/exchange.md) — full envelope including `nonce`
- [Errors](../api/errors.md) — every error string + remediation
- [Error handling](./error-handling.md) — admission vs commit vs network decision tree
- [Rate limits](../api/rate-limits.md) — pace your retries

## FAQ

**Q: Should I use `Date.now()` or a counter?**
A: `Date.now()` is fine for single-instance clients. For multi-instance clients on one account, use a shared monotonic counter (Redis `INCR`, e.g.) so two instances don't collide.

**Q: What if I want to deliberately replay an action (idempotent flow)?**
A: Use the same `cloid` (for orders) and a fresh `nonce`. The server enforces dedup via cloid; the nonce just keeps the wire intact.

**Q: Are cloids reusable after the original order is cancelled / filled?**
A: No. Cloids are globally unique per account, forever. Use a fresh one for every order.

**Q: Does the WS feed give me commit-time confirmation I can use for reconcile?**
A: Yes. Subscribe to `userEvents` and match on `action_hash` or `cloid`. The WS feed is the recommended way to confirm commit state during retry.
