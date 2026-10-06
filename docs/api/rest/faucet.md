---
description: The testnet faucet. One claim transfers test USDC and MTF from a funded reserve. Mainnet refuses it.
---

# Testnet faucet {#post-faucet--testnet-test-funds}

`POST /faucet` sends test USDC and MTF to an address on testnet.

:::warning
**Test networks only.** Mainnet (chain id `8964`) refuses it by design: the
route is not mounted there. Never depend on it in a production flow.
:::

:::warning
**The reserve is finite, and an empty reserve refuses every claim.** The faucet
no longer creates tokens. It moves them out of a reserve account that ⅔-stake
governance votes fund. Read the reserve balance before you blame the endpoint.
Testnet held **276,000 USDC + 920 MTF** on 2026-09-09 (about 92 grants), and
devnet holds nothing. See [the reserve](#reserve).
:::

## Summary {#tldr}

One `POST /faucet` claim transfers up to 3000 USDC of cross collateral and 10
MTF spot tokens (token id `104`) to any address. Each address can claim once
only. The response is `"queued"`. The credits are staged for the next block.
They are not committed synchronously.

**`"queued"` is not acceptance.** When the block applies the claim, the chain
checks it again against the reserve balance and against a per-address cap in
committed state. A claim that passes every HTTP check can still be refused
there, and you get no reply when that happens. Always confirm with
[`account_state`](./info/account.md#account_state). The gateway serves
`POST /faucet` next to the native `/info` and `/exchange` default path.

## URL {#url}

```
POST  https://api.<net>.mtf.exchange/faucet
```

A node that you run yourself serves the same `/faucet` route directly at
`http://localhost:8080`.

| Where | Mounted? |
|-------|----------|
| Devnet (`31337`) / testnet (`114514`), faucet enabled | yes |
| Mainnet (`8964`) | **no**. The route is never mounted. A stray request gets `403` from the defensive handler guard |
| Faucet disabled in node config | no |

The node merges the route into the main API router only when its faucet config
is enabled and the network is not mainnet. The route has its own handler state.
The `/exchange` handler tree cannot reach it.

## Request {#request}

```json
{ "address": "0x00000000000000000000000000000000000ca11e" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `0x`-hex 20-byte address | yes | Recipient. Accepts 40 or 42 chars (`0x` optional). The zero address is rejected. |
| `amount` | uint64 (whole USDC) | no | Optional USDC grant. It only caps downward, at the configured maximum (3000). A larger value clamps to 3000, never above. `0` is rejected. The MTF grant (10) is fixed. See [Limits](#limits). |

```bash
curl -s -X POST https://api.testnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x00000000000000000000000000000000000ca11e"}'
```

## Response {#response}

### `200 OK` queued {#200-ok--queued}

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
| `address` | `0x`-hex string | The recipient, normalized to lowercase |
| `usdc` | uint64 | Granted USDC (whole, after any downward cap) |
| `mtf` | uint64 | Granted MTF spot tokens (whole, fixed at 10) |
| `status` | `"queued"` | The credits are staged for the next block. They are not committed yet |

`"queued"` is literal. The grant is two system actions that a validator
injects: `SystemUserModify{AdjustCrossAccountValue}` for USDC and
`SystemSpotSend` for MTF. The validator puts them at the start of the next
proposed block. **The block checks each one again when it applies it, and it
can refuse either one.** See [refused after queueing](#refused-after-queueing).
Poll [`account_state`](./info/account.md#account_state) about 1 block later to
see the balance:

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
| 400 | `{"error":"invalid address: <detail>"}` | `address` is not valid `0x`-hex, for example the wrong length |
| 400 | `{"error":"zero address not allowed"}` | The recipient is the zero address |
| 400 | `{"error":"amount must be positive"}` | An explicit `amount` of `0` |
| 429 | `{"error":"address already funded"}` | This address claimed before. Each address claims once only. The faucet reads the committed claim record before it queues, so the refusal holds across a node restart. See [Limits](#limits) |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | The source IP claimed inside the per-IP window. The window is a node setting. See [Limits](#limits) |
| 403 | `{"error":"faucet disabled on this network"}` | Defensive guard. It should be unreachable, because mainnet never mounts the route |
| 503 | `{"error":"faucet reserve is empty; ask an operator to refill it"}` | The reserve cannot pay this grant. The node checks the reserve before it queues, so it refuses the claim and does not drop it silently. See [the reserve](#reserve) |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | The injection queue is full. This is temporary backpressure. Retry |

```json
// second claim for the same address:
{ "error": "address already funded" }   // HTTP 429
```

## Refusal after queueing {#refused-after-queueing}

The HTTP checks are not the binding checks. The two credits are ordinary
consensus actions. The block validates each one again when it applies it.
There is no reply channel at that point, so a refusal is silent. The
`200 queued` that you hold does not change, and the balance does not move.

Four rules can refuse a queued claim. The chain evaluates all four on committed
state:

| Rule | Effect |
|---|---|
| **The reserve must hold the amount.** The lane debits a reserve account. It never creates tokens | The chain refuses a claim larger than the reserve balance in full. It does not fill it in part and does not clamp it down |
| **A per-address rule in committed state.** There is one row for each lane: the USDC leg, and each spot token id | The row is cumulative and limits a lifetime value: 3000 USDC, 10 tokens. It survives a node restart |
| **The recipient must not be the reserve** | Refused |
| **The amount must be positive** | Refused |

The two legs are independent. The USDC leg can commit while the chain refuses
the MTF leg, or the reverse. A partial credit is a normal outcome. Read both
balances back.

**The cap is in committed state for a reason.** The `[faucet]` config flag of
the node and its claimed-address set are local to the host. The flag gates only
the HTTP route. The set is in memory and resets on restart. The block does not
read either one when it applies the action, so neither can limit what the lane
gives out. Only the committed cap can, so the binding limit is there.

The handler does not read the per-address rows before it queues. It first
checks the claimed-address set and the IP window, which are both local to the
node. It then checks the reserve balance, which is committed. A `200` can
therefore name a grant that the committed per-address cap then refuses. Read
the balance back.

That order also decides the cost of a `503`. When either `503` fires, the node
has already marked the address and advanced the IP window. A reserve-empty or
backlog-full refusal therefore uses the slot on that node until the node
restarts.

## The reserve {#reserve}

The faucet takes funds from a fixed reserve account, `0x5555…5555`. **No
private key can produce that address.** An address is the low 20 bytes of
`keccak256` over a secp256k1 public key. A repeated-byte address needs a 2^160
preimage search. The reserve accepts a pre-fund, but no signer can spend it.
The lane accepts no other source, and the source is not a request parameter.

The claim is a transfer, so supply does not change:
`total_supply == sum(balances) + sum(reserved)` holds before and after. The
faucet used to create the value that it gave out. That broke the identity by
the granted amount. It no longer does.

**The reserve starts empty, and nothing funds it automatically.** Two ⅔-stake
validator governance votes fund it, one for each leg:

| Leg | Vote | Note |
|---|---|---|
| USDC cross-value | `GovAdjustSpotValue` | Sets the cross-account value of the reserve |
| MTF spot | `GovAdjustSpotBalance` | Sets the spot balance of the reserve, and moves `total_supply` by the same delta |

When they land, both appear on
[`validator_votes`](./info/governance.md#validator_votes) with those names in
the `action` field. Filter on `status: "enacted"` to confirm that the reserve
was funded.

The chain refuses a claim that the reserve cannot pay, and credits nothing. If
the faucet of a network seems dead, check this first: read `account_state` for
`0x5555…5555` and see if the reserve holds anything. Testnet held
276,000 USDC + 920 MTF on 2026-09-09. Devnet holds nothing.

## Limits {#limits}

- **One claim per address.** A second claim for the same address returns
  `429 address already funded`, also from a different IP and also much later.

  The committed row is a one-time claim record. The handler reads it before it
  queues and answers `429` at once. A request for less than the full grant uses
  the slot. You cannot come back for the remainder. A set in the memory of the
  faucet node closes the window between the queue and the commit inside one
  block. The rule is in force since
  [block 11,550,001](../../changelog/block-11550001.md#faucet-rules). Before
  that height, the committed row was a value cap, so an address that asked for
  less could come back for the rest.

  A `400` or `429` refusal records nothing. A `503` is different. When the
  queue refuses the claim, the node has already marked the address and advanced
  the IP window. That node then refuses the address until it restarts. No
  committed row is written, so the address can claim again after the restart.
- **Per-IP window.** Different addresses behind one IP inside the window get
  `429 rate limit`. The window is a node setting. The testnet faucet uses one
  minute. The default for a node that sets no value is one day (86400 s).

  **The window slows claims. It is not an anti-sybil control.** It is in the
  memory of the faucet node, it is not chain-wide, and it resets when that node
  restarts. The committed per-address rule and the reserve balance limit what
  the faucet gives out.
- **USDC cap.** The optional `amount` only caps downward. You can never get
  more than the configured 3000 USDC.

## Separation from `/exchange` {#why-this-is-not-on-exchange}

The two faucet credits are system actions with privileges (`SystemUserModify`,
`SystemSpotSend`). They are in the System action-id range, and they are never
part of the `/exchange` user-action allowlist. The faucet puts them into a
separate injection queue that only validators use. This is not the public
mempool. The runtime drains the queue into the block payload in the same way as
the oracle feed. The sender is the validator address of the node, so the
`require_system_authority` check admits them. No code path goes from the public
user mempool to this queue. See
[never expose system actions on /exchange](./exchange/transfers.md#non-bridged-actions).

## Determinism boundary {#determinism-boundary}

The faucet HTTP edge is fully non-deterministic: the IP throttle uses the wall
clock, and the claimed-address set is local to the host. Only the recipient and
the amounts in the two system actions go into consensus. They go through the
unchanged deterministic handlers. The local rate-limit and claimed-address
state is never hashed into the AppHash.

## See also {#see-also}

- [`POST /info`](./info.md): read `account_state` to confirm the credit
- [`POST /exchange`](./exchange.md): the user-action write path. System actions, such as the faucet credits, never go through it
- [Networks](../../networks.md): the chain id of each network
