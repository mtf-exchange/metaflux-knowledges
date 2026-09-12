---
description: What moves on the public wire at the next release — a new vault_modify signing type, a parked per-order status, a replayed-nonce verdict, per-leg cloid dedup, two order_status answers that stop reading unknown, and refusals that replace three silent accepts.
---

# Next release — not live yet

:::warning
**Nothing on this page is live. The height is not pinned yet.**

Every rule here ships with the next node release after 0.9.7, and the gateway
rows ship with the gateway of the same release. Until the swap, a live chain
answers the OLD behaviour named beside each row. Read this page to prepare a
client, not to explain what you see today.

`{"type":"account_state","address":"0x…"}` carries the live `height` if you need
to check where the chain is.
:::

## Breaking: `vault_modify` signs a new type {#vault_modify}

The EIP-712 type string gains six words, so every field the action applies is
inside the digest:

```
MetaFluxTransaction:VaultModify(string metafluxChain,uint64 vaultId,string newName,bool hasNewLockPeriodSecs,uint64 newLockPeriodSecs,bool hasNewManagementFeeBps,uint16 newManagementFeeBps,bool hasNewPaused,bool newPaused,uint64 nonce)
```

Each optional field signs as two words: a presence `bool`, then the value. An
absent key and a key sent as `0` are different digests, so one signature covers
exactly one wire form.

**A signature made with the four-field string stops verifying at the swap.** The
capability is unreachable from a client that has not moved. Update the signing
type, then re-sign.

Why: the old digest bound `new_name` alone, and a relay could add a fee change or
a pause to a signature the leader gave for a rename.

**Checklist**

1. Move to the new type string — see
   [typed-data signing](../integration/typed-data-signing.md#account-staking--vault).
2. Send the exact field set you signed. An added or removed key is refused.
3. Update both client SDKs before the swap. An old SDK cannot sign the action.

## `statuses` gains `parked`, and the array gets longer {#parked}

A TP/SL or stop leg accepted off the book now reports
[`{"parked":{"oid","cloid"}}`](../api/rest/exchange.md#statuses-parked). A
`position_tpsl` group used to answer an empty `statuses` array, and a mixed
`normal_tpsl` batch answered fewer entries than it sent legs.

The same token lands on the [`order_updates`](../api/ws/subscriptions.md#order_updates)
feed and in the node's `node_order_statuses` stream.

**A closed union breaks on it.** A client that parses `statuses` into a closed
enum fails the WHOLE response on the new key. Add the arm first.

`parked` is the term across this reference.
[`order_status`](../api/rest/info/orders-fills.md#order_status) answers the legacy
token `triggered` for the same state, and that one endpoint does not change.

## A rejected leg's `error` loses a level {#leg-error}

`statuses[i].error` IS the `{code, message, details?}` object. A live node wraps
it once more, so a caller reading `statuses[i].error.error.code` must drop one
level. The reference has always documented the flat shape, and both client SDKs
already type it.

## A replayed nonce gets a verdict {#nonce-replayed}

An action the block builder drops as a replay now answers
[`NONCE_REPLAYED`](../api/errors.md#nonce_replayed) at HTTP `200`. A live node
drops it in silence, so the caller waits out the order window and the gateway
answers a `502`.

`nonce_must_increase` and `nonce_too_small` never existed on this API. Branch on
the code.

## `cloid` dedup runs per leg {#cloid}

[`batch_order`](../api/rest/exchange/orders.md#batch_order) checks every leg that
carries a `cloid`, and [`scale_order`](../api/rest/exchange/orders.md#scale_order)
checks its ladder handle. Two legs of one action that share a `cloid` refuse the
whole action.

Two consequences:

- A ladder handle is reserved. A later single order that reuses it is refused. On
  a live node that order JOINS the group instead.
- An attempt the COMMIT refused gives its `cloid` back, so a re-signed retry may
  reuse the handle.

## `order_status` stops answering `unknown` twice {#order_status}

A cancelled SPOT order answers `canceled`. A spot order or scale rung that
neither rests nor matches answers `rejected`, with
`reason: "Order could not immediately match against any resting orders."` A
parked leg also resolves by `cloid` from committed state, so it keeps resolving
after a node restart, and its `trigger` object carries `cloid`.

## Three silent accepts become refusals {#refusals}

| Action | New refusal |
|---|---|
| [`agent_set_abstraction`](../api/rest/exchange/account.md#agent_set_abstraction) | `PRECONDITION_FAILED` — `agentSetAbstraction is not available; the account owner must sign userSetAbstraction`. It never set a config; a live node accepts the call and writes nothing |
| [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage) | `PRECONDITION_FAILED` — `no perp market for asset`. A live node writes a leverage row for a market that does not exist |
| [`c_deposit`](../api/rest/exchange/staking.md#c_deposit) / [`c_withdraw`](../api/rest/exchange/staking.md#c_withdraw) | `INVALID_REQUEST` — `amount is finer than the token's wei_decimals`. A live node commits a sub-wei amount and leaves dust no ledger row can render |

## Read-side and WebSocket rows {#read-side}

- [`active_asset_data`](../api/ws/subscriptions.md#active_asset_data) refuses a
  spot pair, an unknown coin and a coin that names no perp, with
  `{"channel":"error","data":{"error":"market not found"}}`. A live gateway
  answers a zeroed snapshot that blanks your own `address` and `coin`.
- A subscribe answers ONE snapshot frame.
  [`open_orders`](../api/ws/subscriptions.md#open_orders) stays the exception.
- [`trades`](../api/rest/info/perpetuals.md#trades): `limit` caps the merged
  answer. A live gateway can return up to twice the number you asked for on a
  ranged ask.
- `trades.last_trade` is the newest print in THIS answer, which is what the
  reference has always said. A live node stamps the MARKET's newest print on a
  windowed page, so the page reads as if it ran later than it does.
- [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot):
  `coverage.reaches_newest` is proved against the newest bar the store holds, not
  against your `end_time`. An archive-served bar stamps `T` as `t + interval − 1`
  like every other source.

## Two corrections to this reference {#corrections}

Neither is a change to the chain. The reference was wrong and the code was right.

- [`top_up_isolated_only_margin`](../api/rest/exchange/margin-risk.md#top_up_isolated_only_margin)
  accepts a PLAIN isolated position, not strict-isolated only.
- [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot-volume-join)
  serves real trade volume in `v`, `q` and `n` on a `mark` or `oracle` bar. They
  are not `"0"`, and `n` is not a sample count.
