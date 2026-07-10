---
description: Devnet/testnet test faucet — one-shot grant of test USDC + MTF. Refused on mainnet.
---

# `POST /faucet` — devnet/testnet test funds

:::warning
**Devnet / testnet only.** The faucet mints free collateral + spot tokens out of
nothing. It is **structurally refused on mainnet** (chain id `8964`): the route
is never even mounted there. Never depend on it in a production flow.
:::

## TL;DR {#tldr}

One `POST /faucet` claim grants **3000 USDC** cross-collateral **and 10 MTF** spot
tokens (token id `104`) to an arbitrary address. **Once-ever per address.** The
response is `"queued"` — the credits land after ~1 block (they are injected as
validator system actions, not committed synchronously). Served as `POST /faucet`
on the gateway front door, alongside the native `/info` + `/exchange` default
path.

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
prepended to the next proposed block. Poll [`account_state`](./info.md#account_state)
(or [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state)) ~1 block
later to see the balance:

```json
// account_state after the credit commits:
{ "account_value": "3000", "balances": { "usdc": "3000", "spot": { "MTF": "10" } }, ... }
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

## Limits {#limits}

- **Once-ever per address.** Tracked in an in-memory set (resets on node restart;
  devnet is ephemeral). A second claim for the same address — even from a different
  IP, even much later — returns `429 address already funded`. A *rejected* request
  does NOT consume the once-ever slot.
- **Per-IP throttle.** Default 1 request / minute / source IP. Distinct addresses
  from the same IP within the window get `429 rate limit`.
- **USDC cap.** The optional `amount` only caps downward; you can never get more
  than the configured 3000 USDC.

## Why this is NOT on `/exchange` {#why-this-is-not-on-exchange}

The faucet's two credits are **system / privileged actions**
(`SystemUserModify`, `SystemSpotSend`) — minting collateral and spot out of
nothing. These are in the System action-id range and are **never** part of the
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

- [`POST /info`](./info.md) — read `account_state` / `spot_clearinghouse_state` to confirm the credit
- [`POST /exchange`](./exchange.md) — the user-action write path (system actions like the faucet's credits never transit it)
- [Networks](../../networks.md) — chain ids per network
