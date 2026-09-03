---
description: Devnet/testnet test faucet — one-shot transfer of test USDC + MTF from a funded reserve. Refused on mainnet.
---

# `POST /faucet` — devnet/testnet test funds

:::warning
**Devnet / testnet only.** It is **structurally refused on mainnet** (chain id
`8964`): the route is never even mounted there. Never depend on it in a
production flow.
:::

:::danger
**The reserve is EMPTY on the live chain, so every claim is refused today.** The
faucet no longer creates tokens; it moves them out of a reserve account that must
be funded first, by two separate ⅔-stake governance votes. Until both land, a
claim returns `200 queued` and then quietly credits nothing. See
[the reserve](#reserve).
:::

## TL;DR {#tldr}

One `POST /faucet` claim transfers up to **3000 USDC** cross-collateral **and 10
MTF** spot tokens (token id `104`) to an arbitrary address. **Once-ever per
address.** The response is `"queued"` — the credits are staged for the next
block, not committed synchronously.

**`"queued"` is not acceptance.** The claim is checked again when the block
applies it, against the reserve balance and against a per-address cap held in
committed state. A claim that passes every HTTP check can still be refused there,
and nothing is returned to you when it is. Always confirm with
[`account_state`](./info.md#account_state). Served as `POST /faucet` on the
gateway front door, alongside the native `/info` + `/exchange` default path.

## URL {#url}

```
POST  https://api.<net>.mtf.exchange/faucet
```

Running the node yourself, the same `/faucet` route is served directly at
`http://localhost:8080`.

| Where | Mounted? |
|-------|----------|
| Devnet (`31337`) / testnet (`114514`), faucet enabled | yes |
| Mainnet (`8964`) | **no** — route never mounted; a stray hit gets `403` from the defensive handler guard |
| Faucet disabled in node config | no |

The route is merged into the main API router only when the node's faucet config
is **enabled AND off mainnet**. It carries its own handler state and is
structurally unreachable from the `/exchange` handler tree.

## Request {#request}

```json
{ "address": "0x00000000000000000000000000000000000ca11e" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `0x`-hex 20-byte address | yes | Recipient. Accepts 40 or 42 chars (`0x` optional). The zero address is rejected. |
| `amount` | uint64 (whole USDC) | no | Optional USDC grant; **caps DOWNWARD** at the configured max (3000) — a larger value clamps to 3000, never above. `0` is rejected. MTF (10) is fixed regardless. |

```bash
curl -s -X POST https://api.devnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x00000000000000000000000000000000000ca11e"}'
```

## Response {#response}

### `200 OK` — queued {#200-ok--queued}

```json
{
  "address": "0x00000000000000000000000000000000000ca11e",
  "usdc":    3000,
  "mtf":     10,
  "status":  "queued"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | `0x`-hex string | Echoed recipient, normalized lowercase |
| `usdc` | uint64 | Granted USDC (whole, after any downward cap) |
| `mtf` | uint64 | Granted MTF spot tokens (whole, fixed at 10) |
| `status` | `"queued"` | The credits are **staged for the next block**, not yet committed |

`"queued"` is literal: the grant is two validator-injected system actions
(`SystemUserModify{AdjustCrossAccountValue}` for USDC + `SystemSpotSend` for MTF)
prepended to the next proposed block. **Each one is re-checked when that block
applies it, and either can be refused there** — see
[refused after queueing](#refused-after-queueing). Poll
[`account_state`](./info.md#account_state) ~1 block later to see the balance:

```json
// account_state after the credit commits:
{
  "account_value": "3000",
  "spot": { "balances": [
    { "name": "USDC", "signing_id": 100, "total": "3000", "hold": "0", "avg_entry_px": null },
    { "name": "MTF",  "signing_id": 3,   "total": "10",   "hold": "0", "avg_entry_px": null }
  ] }
}
```

### Errors {#errors}

| HTTP | Body | Cause |
|------|------|-------|
| 400 | `{"error":"invalid address: <detail>"}` | `address` not valid `0x`-hex (e.g. wrong length) |
| 400 | `{"error":"zero address not allowed"}` | Recipient is the zero address |
| 400 | `{"error":"amount must be positive"}` | Explicit `amount` of `0` |
| 429 | `{"error":"address already funded"}` | This address claimed before (**once-ever**, permanent for the node's lifetime) |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | Source IP claimed within the per-IP cool-down (default 1/min/IP) |
| 403 | `{"error":"faucet disabled on this network"}` | Defensive guard (should be unreachable — mainnet never mounts the route) |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | Injection queue saturated (transient backpressure; retry) |

```json
// second claim for the same address:
{ "error": "address already funded" }   // HTTP 429
```

## A queued claim can be refused {#refused-after-queueing}

The HTTP checks are **not** the binding ones. The two credits are ordinary
consensus actions, and each is validated again at the moment the block applies
it. There is no reply channel from that point, so a refusal is silent: the
`200 queued` you already hold does not change, and the balance simply never
moves.

Four rules refuse a queued claim. All four are evaluated on committed state:

| Rule | Effect |
|---|---|
| **The reserve must hold the amount.** The lane debits a reserve account; it never creates tokens | A claim larger than the reserve balance is refused **whole**. It is not partly filled and not clamped down |
| **A per-address lifetime cap, in committed state.** 3000 USDC on the USDC leg, 10 tokens per token id on the spot leg | Cumulative, not per-request. Once an address has taken its cap, every later claim for that address is refused forever — including after a node restart |
| **The recipient must not be the reserve itself** | Refused |
| **The amount must be positive** | Refused |

The two legs are independent. The USDC leg can commit while the MTF leg is
refused, or the reverse, so a partial credit is a normal outcome. Read both
balances back.

**Why the cap lives in committed state.** The node's `[faucet]` config flag and
its once-ever address set are host-local: the flag gates the HTTP route only, and
the set is in memory and resets on restart. Neither is read when the block
applies the action, so neither can bound what the lane hands out. Only the
committed cap can, so that is where the binding limit sits.

## The reserve, and how it gets funded {#reserve}

The faucet's source is a fixed reserve account, `0x5555…5555`. **No private key
can produce that address**: an address is the low 20 bytes of `keccak256` over a
secp256k1 public key, so a repeated-byte image needs a 2^160 preimage search. The
reserve therefore accepts a pre-fund but no signer can ever spend it. The lane
accepts no other source; the source is not a request parameter.

Because the claim is a **transfer**, supply is unchanged across it:
`total_supply == sum(balances) + sum(reserved)` holds before and after. The
faucet used to create the value it handed out, which broke that identity by the
amount granted. It no longer does.

**The reserve starts empty and nothing funds it automatically.** Two ⅔-stake
validator governance votes fund it, one per leg:

| Leg | Vote | Note |
|---|---|---|
| USDC cross-value | `GovAdjustSpotValue` | Sets the reserve's cross-account value |
| MTF spot | `GovAdjustSpotBalance` | Sets the reserve's spot balance, and moves `total_supply` by the same delta |

Both appear on [`governance_history`](./info/governance.md) under those `action`
names once they land, so that read is how you confirm the reserve was funded.

Until both land, every claim returns `200 queued` and credits nothing. If you are
integrating against a network whose faucet appears dead, this is the first thing
to check: read `account_state` for `0x5555…5555` and see whether the reserve holds
anything.

## Limits {#limits}

- **Once-ever per address.** The HTTP layer tracks it in an in-memory set (resets
  on node restart; devnet is ephemeral), so a second claim for the same address —
  even from a different IP, even much later — returns `429 address already
  funded`. A *rejected* request does NOT consume the in-memory slot. **That set is
  only a cheap early refusal.** The limit that binds is the per-address cap in
  committed state, which survives a restart and refuses on the apply path.
- **Per-IP throttle.** Default 1 request / minute / source IP. Distinct addresses
  from the same IP within the window get `429 rate limit`.
- **USDC cap.** The optional `amount` only caps downward; you can never get more
  than the configured 3000 USDC.

## Why this is NOT on `/exchange` {#why-this-is-not-on-exchange}

The faucet's two credits are **system / privileged actions**
(`SystemUserModify`, `SystemSpotSend`). These are in the System action-id range
and are **never** part of the
`/exchange` user-action allowlist. The faucet enqueues them into a **separate
validator-only injection queue** (not the public mempool); the runtime drains it
into the block payload exactly like the oracle feed, with the node's own
validator address as sender so the `require_system_authority` check admits them.
There is no code path from the public user mempool to this queue. See
[never expose system actions on /exchange](./exchange.md#non-bridged-actions).

## Determinism boundary {#determinism-boundary}

Everything in the faucet HTTP edge is non-deterministic (wall-clock IP throttle,
host-local claimed-set). The ONLY values that cross into consensus are the
recipient + amounts in the two system actions, which flow through the unchanged
deterministic handlers. The host-local rate-limit / claimed-set state is never
hashed into the AppHash.

## See also {#see-also}

- [`POST /info`](./info.md) — read `account_state` to confirm the credit
- [`POST /exchange`](./exchange.md) — the user-action write path (system actions like the faucet's credits never transit it)
- [Networks](../../networks.md) — chain ids per network
