# Rate limits

{% hint style="info" %}
**Preview.** The gateway enforces the limits below; the bare node accepts unbounded traffic from authenticated mTLS peers (intended for trusted infra only — do not expose `8080` to the open internet in production).
{% endhint %}

## TL;DR

- Two budgets: **per-IP weight** (anonymous traffic) and **per-account QPS** (signed traffic).
- Bursty workloads spend a token bucket; sustained traffic is gated by the refill rate.
- `429` always carries `retry_after_ms`. Respect it.
- `/info` queries are cheap (weight 1); WS subscriptions are even cheaper (1 weight at subscribe, 0 per message). `/exchange` is weight 5 per request.
- The mempool has an independent per-account cap on outstanding actions.

## Budgets

| Budget | Limit (default) | Refill | Burst |
|--------|-----------------|--------|-------|
| Per-IP weight | 1200 weight / minute | 20 weight / second | 1200 (full bucket) |
| Per-account QPS | 30 req / second | 30 / s | 60 |
| Mempool actions per account | 50 outstanding | drains as actions commit | — |
| WS subscriptions per connection | 256 | — | — |

All limits are governance-controlled. A per-account budget snapshot is available
via the native [`user_rate_limit`](./rest/info.md) read on the gateway default
path (the gateway also exposes the same data as HL-compat `userRateLimit` under
`/hl`):

```bash
curl -X POST https://gateway.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"user_rate_limit","address":"0x<addr>"}'
```

> **Planned read.** A dedicated `GET /limits` route publishing the *static*
> per-IP / per-account config below is **not yet implemented** — the values are
> the configured defaults, not yet served from an endpoint. Treat the JSON below
> as reference defaults:

```json
{
  "per_ip": {
    "weight_per_minute": 1200,
    "burst":             1200,
    "refill_per_second": 20
  },
  "per_account": {
    "qps":          30,
    "burst":        60,
    "refill":       30
  },
  "mempool_per_account": 50,
  "ws_subs_per_conn":    256
}
```

## Weight by endpoint

| Endpoint | Weight |
|----------|--------|
| `POST /info` (most types) | 1 |
| `POST /info` `l2Book`, `metaAndAssetCtxs` | 2 |
| `POST /info` `userFills`, `historicalOrders` (paginated) | 2 |
| `POST /exchange` | 5 |
| `GET /ccxt/markets`, `GET /ccxt/ticker` | 1 |
| `GET /ccxt/orderbook`, `GET /ccxt/ohlcv` | 2 |
| `GET /ccxt/balance`, `/positions`, `/myTrades` | 2 |
| `POST /ccxt/orders`, `DELETE /ccxt/orders/{id}` | 5 |
| WS `subscribe` | 1 |
| WS published message | 0 |
| WS `unsubscribe` | 0 |

A client making one order per second and polling `clearinghouseState` once per second spends `5 + 1 = 6 weight/s = 360 weight/min` — well within budget.

## Per-account QPS

Once a request is signed, the gateway authenticates the `sender` and counts against the per-account budget instead of (or in addition to) the per-IP budget.

| Sender state | Counted against |
|--------------|-----------------|
| Anonymous (no signature, e.g. `GET /ccxt/markets`) | per-IP |
| Signed by master | per-IP + per-account |
| Signed by agent | per-IP + per-account-of-master |

Signed requests effectively double-count against per-IP and per-account; clients hammering from a single IP on behalf of one account will hit whichever budget is tighter.

## Mempool cap

Independent from the rate limits. The state machine refuses to admit > 50 outstanding (not-yet-committed) actions per `sender`. This prevents one account from monopolising mempool space.

If you submit a 51st action while 50 are outstanding:

```json
{ "error": "mempool_per_account_full", "retry_after_ms": 100 }
```

In practice this is hit only by misbehaving clients — a healthy block time of ~100 ms drains 30 QPS easily. If you hit this, you're rate-limit-correct on per-account but spamming faster than blocks commit.

## Burst behaviour

The buckets fill to `burst` and refill at `refill` per second. A burst of `N ≤ burst` requests fits immediately; subsequent requests are throttled to the refill rate.

```
                          .--- burst capacity ---.
                          |                      |
        budget:   ████████████████████████████████
        burst:    1200

        a 600-weight request burst all-at-once:
        budget:   ██████████████  ← drains
        refill:   ↑ +20/s
```

A `429` response with `retry_after_ms` tells you exactly when the bucket will hold enough for one more weight-1 request. For batch jobs prefer pacing client-side; for interactive workloads exponential backoff with the hint is fine.

## Strategies

### Order-flow bot

- Pre-emptively rate-limit on the client to ~25 QPS to leave headroom.
- Use `Order` batching: one request with 10 orders costs 5 weight (same as one order); the per-account QPS counts requests, not legs.
- Use `BatchModify` instead of N separate `ModifyOrder`s.
- Keep market-data on the WS feed, not on polling `/info`.

### Market-data consumer

- Subscribe to WS channels (`l2Book`, `trades`, `userEvents`); do not poll.
- `subscribe` weight is 1, in-stream messages cost 0.
- Reconnect with `resume_token` rather than re-subscribing all channels from scratch (subs spend weight again on the new connection).

### High-frequency liquidator

- Run from your own self-hosted node (mTLS-authenticated, `localhost:8080`), bypassing the public gateway's limits.
- Acknowledge this requires running infra peered with a validator.
- Public gateway access is enough for tens-of-orders-per-second workloads; not enough for HFT.

## Sequence — getting throttled and recovering

```
client                  gateway
  │                       │
  │ POST /exchange #28    │ bucket: full, debit 5 → 25 left
  ├──────────────────────►│
  │ POST /exchange #29    │ debit 5 → 20 left
  ├──────────────────────►│
  │  ...                  │
  │ POST /exchange #41    │ debit 5 → 0
  ├──────────────────────►│
  │ POST /exchange #42    │ bucket empty
  ├──────────────────────►│
  │ 429 retry_after=200ms │
  │◄──────────────────────│
  │ wait 200 ms           │
  │ POST /exchange #42'   │ bucket: ~5 (refilled at 30/s)
  ├──────────────────────►│
  │ 202 Accepted          │
  │◄──────────────────────│
```

## Override channels

| Channel | Notes |
|---------|-------|
| mTLS peer of a validator | Bypasses gateway rate-limits (you're on the trusted path) |
| Whitelisted IP / account (operator-side) | Operators may publish raised budgets for designated market makers |
| Special endpoints (`/limits`, `/health`) | Not rate-limited |

Public defaults assume neither override applies.

## See also

- [Errors](./errors.md)
- [WS subscriptions](./ws/subscriptions.md)
- [Idempotency](../integration/idempotency.md) — how to retry within rate-limit budget

## FAQ

**Q: Are limits per-key-pair or per-address?**
A: Per-`sender` (address). All agents of the same master share the budget, because admission counts the master.

**Q: Can I batch one order across 10 markets to save weight?**
A: Yes. `Order { orders: [<10 legs>] }` costs 5 weight, not 50.

**Q: Do `/info` polls and WS subscribes share a budget?**
A: Yes — same per-IP / per-account bucket. WS subscribes cost 1 each, then 0 per message; for high-rate data feeds WS is always cheaper than polling.

**Q: What about devnet?**
A: Devnet has higher budgets and no mempool cap. Don't tune your client against devnet; rerun the budget math against `/limits` on the network you'll deploy to.
