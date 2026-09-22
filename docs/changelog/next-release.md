---
description: Wire rules that were staged for a future release and are LIVE on node 0.9.11 — every raw-size row states its own size plane, four relocated reads answer 410, a vault_modify signing type that refuses the old one, a parked per-order status, a replayed-nonce verdict, a faucet slot spent by a partial claim, per-leg cloid dedup, and refusals that replace three silent accepts. One row, the rejected-leg error level, is not settled.
---

# Staged wire rules — LIVE on node 0.9.11

:::danger
**CORRECTED 2026-09-22 — this page is LIVE, not a preview. Every rule below is
in force on node 0.9.11 except one.**

The page said "nothing here is live" and named 0.9.7 as the release to wait for.
It was wrong for the whole page, and it was wrong in the direction that costs a
client the most: the [`vault_modify`](#vault_modify) row is labelled Breaking and
changes a SIGNING type, so anyone who believed the banner kept signing the
shorter type and had **every such call refused**.

Verified live by CALLING the endpoint:

- [Every raw-size row states its own size plane](#size-plane) — `sz_decimals` is
  present on written rows.
- [Four relocated reads answer 410](#relocated-reads) — `spot_meta`, `all_mids`,
  `active_asset_ctx` and `user_events` each answer `410` with `details.use`.
- [`trades`](#read-side) — `limit` caps the answer, on a ranged ask too, and
  `last_trade` is the newest print in THAT answer.

Verified live in the shipped release:

- [Breaking: `vault_modify` signs a new type](#vault_modify)
- [`statuses` gains `parked`](#parked)
- [A replayed nonce gets a verdict](#nonce-replayed)
- [`order_status` stops answering `unknown` twice](#order_status)
- [Three silent accepts become refusals](#refusals) — all three
- [The faucet gives one claim per address, ever](#faucet-rules) — a partial
  claim forfeits the rest, and the per-IP interval is enforced
- [`cloid` dedup runs per leg](#cloid)
- The remaining [read-side and WebSocket rows](#read-side)

**One row is NOT settled either way:** [a rejected leg's `error`
level](#leg-error). Settling it needs a signed action whose leg is refused, and
that was not run. Treat that one row as unconfirmed.

**Each row still names the OLD behaviour beside it.** Where a row says "a live
node does X", that is the behaviour BEFORE the boundary — history, not the
present.

This page is also in the wrong PLACE. An activated rule belongs in a
`block-<height>` activation notice, and these rules shipped across several
releases whose individual activation heights are not recoverable from here, so
no faithful per-height split could be written. That split is outstanding; naming
one wrong height would be worse than naming none.

`{"type":"account_state","address":"0x…"}` carries the live `height` if you need
to check where the chain is.
:::

## Every raw-size row states its own size plane {#size-plane}

`node_fills`, `node_trades` and `node_order_statuses` each gain a `sz_decimals`
field. It is the plane THAT ROW was written on, and it is what you divide the
row's raw size by.

Archive candles gain the same field, and the `candle` read normalizes a bar by
the plane the bar states rather than by the market's current one.

**Why it matters, and why it is not cosmetic.** A market's size precision can
RISE by a governance vote. The vote multiplies every stored lot count, so no
real quantity moves — but a row written before the vote keeps the smaller lot
count. A reader that divides every row by the market's CURRENT precision reports
each of those older rows `10^Δ` too small. That error is silent: the numbers
stay well-formed and understate.

**Before the swap** these fields are absent. A row with no `sz_decimals` means
"not recorded" — fall back to the market's current precision, which is exact
only while no raise has happened since that row was written. No raise has
enacted yet, so the fallback is exact today.

**Checklist**

1. Read `sz_decimals` per ROW; treat an absent value as the market's current
   precision, and only that.
2. Stop caching a market's precision across a read. It is per-row now.
3. A perp's precision NEVER comes from a spot token, even where the names match.
   Read it from the market.

Two ceilings also change unit, with no change to their stored values:
`per_market_limits.max_oi` and `max_oi_per_second` are documented as WHOLE UNITS
of the base asset, not raw lots. They are one pair of numbers for every perp, and
a lot means a different real quantity on each market, so a shared lot count could
not state one real limit.

## Four relocated reads answer 410 instead of 400 {#relocated-reads}

`spot_meta`, `all_mids`, `active_asset_ctx` and `user_events` answer a bare `400`
`UNKNOWN_TYPE` today, even though this reference names a replacement for each. They
join the `410` set and carry `details.use`, naming the read to call instead.

Nothing that works today stops working: a `400` and a `410` both mean "do not call
this name". Branch on `error.code` rather than on the status, and a client is correct
on both sides of the swap.

## The faucet gives one claim per address, ever, and one grant per IP per day {#faucet-rules}

Two rules change together.

**Once ever becomes a claim COUNT, not a value cap.** The committed row accumulates
toward 3000 USDC / 10 MTF today, so it bounds a lifetime VALUE: an address that asked
for less kept the remainder and could come back. After the swap the row records that
the address has claimed. **Asking for less than the full grant spends the slot**, and
the handler answers `429` before it queues rather than after.

**The per-IP window goes from one MINUTE to one DAY** (86400 s, configurable). It is
node-local and resets on restart, before and after — a speed bump, not an anti-sybil
control.

**Checklist**

1. Ask for the FULL grant. There is no second call for the remainder.
2. Treat `429 address already funded` as final for that address.
3. Expect one grant per source IP per day, not per minute.

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
