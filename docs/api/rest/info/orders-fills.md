---
description: "Resting orders across all books, recent fill history, and a single order's lifecycle from placement to terminal state."
---

# Order & fill reads

These queries read orders and fills through [`POST /info`](../info.md). That page defines the endpoint, the request envelope, the number planes and the error shape. They apply to every query here.

### Account's resting orders across all books {#open_orders}

Returns an account's resting orders, across every perp book and every spot book.

**Request**

```json
{ "type": "open_orders", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "open_orders",
    "address":    "0x<addr>",
    "orders": [
      {
        "oid":         "12345",
        "coin":        "BTC",
        "side":        "B",
        "px":          "99000",
        "sz":          "0.007",
        "orig_sz":     null,
        "cloid":       "0x000000000000000000000000cafef00d",
        "tif":         "gtc",
        "reduce_only": false,
        "trigger":     null,
        "inserted_at": 1700000000000
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `orders[*].oid` | decimal-digit string | Server order id. It is the real resting id, and a cancel can target it. Send it back unchanged on a cancel: a request takes the string or a number |
| `orders[*].coin` | string | Market symbol the order rests on (e.g. `"BTC"`, or a pair name like `"BTC/USDC"`) |
| `orders[*].side` | `"B"` / `"A"` | Order side: `B` is bid and `A` is ask. The `/exchange` order body uses `"bid"` / `"ask"` instead |
| `orders[*].px` | Decimal string | Resting price, whole units, tick-snapped |
| `orders[*].sz` | Decimal string | Remaining size, whole units |
| `orders[*].orig_sz` | Decimal string \| null | Always `null`. This read keeps no request size. `sz` is the size still resting |
| `orders[*].cloid` | hex string \| null | Client order id the order was placed with (`0x` and 32 hex chars). `null` when the order set none. A parked TP/SL row carries it too |
| `orders[*].tif` | string | Lowercase time-in-force (`"gtc"` / `"ioc"` / `"alo"`), or the literal `"trigger"` on a parked TP/SL row |
| `orders[*].reduce_only` | bool | A label for the kind of row. It is not the order's flag. `false` on every book row, `true` on every parked TP/SL row. See the rule below |
| `orders[*].trigger` | object \| null | Trigger detail when the row is a trigger or carries one. `null` otherwise |
| `orders[*].inserted_at` | uint64 | Placement timestamp, consensus ms |

**Errors**

- A missing `address` returns `400 INVALID_REQUEST`.

**Rules**

- A spot entry labels `coin` with the pair name (for example `"BTC/USDC"`). It renders `px` and `sz` in the pair's own planes: the pair tick and the base-token size decimals.
- Every row has the same canonical shape as the WS [`open_orders`](../../ws/subscriptions.md#open_orders) snapshot, so REST and WS agree. An unknown field renders `null`.
- A parked TP/SL leg is an open order too: it renders with `tif: "trigger"` and a populated `trigger` block.
- `reduce_only` here comes from the row kind. The read never takes it from the order. A
  resting book row renders `false`. A parked TP/SL row renders `true`. So a
  reduce-only limit order reads `false`. A fired TP/SL leg is reduce-only and rests as an
  ordinary book order, so it also reads `false`.
  Do not recover an order's reduce-only flag from this read. Read it from the
  order the account submitted. When no action submitted the order, you cannot
  recover the flag.
- The read takes `tif` and `cloid` from the order. Both are recoverable here while
  the order rests.

**Inside the `trigger` block**

A resting book order with an attached trigger carries `trigger_px` and
`trigger_above` only. A parked (off-book) leg also carries `is_parked`,
`is_market`, and `limit_px`. Two more keys appear only on the leg that owns
them.

| Key | Type | When it is present |
|-----|------|--------------------|
| `trigger_px` | Decimal string | Always. The mark level the leg fires at |
| `trigger_above` | bool | Always. `true` = fire when the mark rises to `trigger_px` |
| `is_parked` | bool | Parked legs only. Absent on a resting book order's block |
| `is_market` | bool | Parked legs only. `true` = fires a market exit; `false` = rests a limit exit |
| `limit_px` | Decimal string \| null | Parked legs only. The resting price of a limit trigger; `null` on a market trigger |
| `group` | uint64 | Ladder legs only. The handle every leg of one scaled TP/SL ladder shares |
| `trail_px` | Decimal string | Trailing legs only. The callback offset the level ratchets by |

`group` and `trail_px` are absent unless the leg owns them. Absence means "not a ladder leg" and "not a trailing leg". A decoder that types them as
optional needs no change when they first appear on a leg. A decoder that
makes them required fails on every ordinary trigger.

`group` is the scaled TP/SL ladder. A
[`positionTpsl`](../exchange/orders.md#position-tpsl-ladder) batch of three or more
protective legs parks a ladder. The legs share one `group`. They are not
OCO: a fill of one leg does not cancel the others. That is the purpose of
scaling out in steps. One or two legs keep the older shapes: a lone trigger,
or an OCO pair whose first fill cancels its partner. Group the rows by this
value to render one ladder as one control. The whole ladder retires together
when the position it protects closes, by any path.

`trail_px` is the trailing stop. Once per block, the parked level ratchets toward the mark
by this offset, and never away from it. When `trail_px`
is present, `trigger_px` is the ratcheted level. It is not the level the owner
sent. Do not render it as a static order that the user placed. A trailing leg is
always a stop-loss. The chain refuses a trailing take-profit, because it would
chase its level away from a winning position. `trail_px` is submittable:
see [trailing stops](../exchange/orders.md#trailing-stops). Sending it
changes the order's signing digest.

### Recent fill history for an account {#user_fills}

This read returns the fill history of one account, with one row per execution. The gateway serves it from
the archive and merges the node's answer, so you need no external indexer. The
node keeps no fill ring since
[block 25,599,540](../../../changelog/block-25599540.md#tape-retirement-reads), so the archive carries
every row. For one row per
opened-then-closed position, use
[position history](../info/position-history.md). That row folds peak size, average entry, average
close, realized PnL and funding over the whole life of the position.

#### Every order lane records its fill {#unrecorded-fills}

Four lanes used to settle a fill that nothing reported. The chain matched the
order, moved both positions and moved the money. No read and no stream
carried the fill, for either party. All four are fixed:

| The order was placed by | Fixed in |
|---|---|
| [`modify`](../exchange/orders.md#modify) / [`batch_modify`](../exchange/orders.md#batch_modify), when the replacement crosses on placement | node 0.9.5 |
| a [`multi_sig`](../../../concepts/multi-sig.md) envelope holding an order action | node 0.9.5 |
| [CoreWriter `LimitOrder`](../../../evm/interacting-with-core.md) from MetaFluxEVM, when it crosses on placement | node 0.9.6 |
| a [frequent batch auction](../../../concepts/fba.md) clearing | node 0.9.6 |

A fill now reaches this read, [`historical_orders`](./account-history.md#historical_orders), the
[public trade tape](../info/perpetuals.md#trades), the WS
[`fills`](../../ws/subscriptions.md#fills) and
[`trades`](../../ws/subscriptions.md#trades) channels, and the
[node streams](../../../nodes/data-streams.md), whichever lane placed the order.

Two properties remain after the fix. A caller must know both.

A position change is authoritative. A fill list is a report. Read the
position and the balance from [`account_state`](./account.md#account_state) for anything
that must balance. Sum fills for reporting, never for a balance check. This held
before the lanes were fixed and it still holds. A fill list is a stream of
events, and a stream can be behind.

A `modify` replacement rests under a new order id. This is how the action works. It is not a recording
gap. A caller that tracks an order by id must
follow the new id. Read that id on [`open_orders`](#open_orders).

**Request**

```json
{ "type": "user_fills", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address. A missing `address` returns `400 INVALID_REQUEST` |
| `limit` | uint32 | no | Cap on the number of most-recent records returned. Absent or `0` returns the full ring |
| `start_time` | uint64 | no | Window start (consensus ms, inclusive), filtered on the fill `time`. Absent is an open lower bound |
| `end_time` | uint64 | no | Window end (consensus ms, inclusive). Absent is an open upper bound |
| `aggregate` | bool | no | Default `false`. `true` folds the legs of one order's execution in one block into a single row and adds `n`. A node without it ignores the field silently. Test for `n`, not for the row count. See [aggregated rows](#user_fills-aggregate) |

Send `address` alone for the recent window, or add `start_time` / `end_time` to
filter the same records by time. The response echoes both bounds back as
`start_time` / `end_time` (`null` for a bound you omit). The fill-record shape
is the same either way.

**Response**

```json
{
  "data": {
    "type": "user_fills",
    "address":    "0x<addr>",
    "start_time": null,
    "end_time":   null,
    "fills": [
      {
        "coin":           "BTC",
        "side":           "B",
        "px":             "67042.50",
        "sz":             "0.125",
        "time":           1700000000555,
        "oid":            "12345",
        "tid":            "16613428288414605024",
        "fee":            "4.19",
        "fee_token":      "USDC",
        "closed_pnl":     "0",
        "cause":          "twap",
        "twap_id":        41,
        "dir":            "Open Long",
        "start_position": "0",
        "block":          562,
        "hash":           "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
      }
    ]
  }
}
```

Records are ordered newest first: the most recent fill is `fills[0]`. The ring
is bounded, so the response is a recent window. It is not the full history of the account. An
account with no fills returns `"fills": []`.

A request whose `start_time` is older than the oldest ring record is answered
from the archive instead. A request with no time bound always answers from the
ring.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `fills[*].coin` | string | Market symbol the fill executed on |
| `fills[*].side` | `"B"` / `"A"` | This leg's side: `"B"` = buy/bid, `"A"` = sell/ask |
| `fills[*].px` | Decimal string | Execution price, decimal USDC (human-readable) |
| `fills[*].sz` | Decimal string | Filled size, base units (whole-unit) |
| `fills[*].time` | uint64 | Fill timestamp (consensus ms) |
| `fills[*].oid` | decimal-digit string | This party's order id |
| `fills[*].tid` | decimal-digit string | Deterministic trade id, shared by both legs of the print. It is a 64-bit hash-derived value and often exceeds 2^53, so it is a string. A JSON number loses its low digits in JavaScript, and a join of `user_fills` to `trades` by `tid` then silently matches nothing. Compare it as a string, or convert it with `BigInt` |
| `fills[*].fee` | Decimal string | Fee this party paid. Read `fee_token` for the denomination, because it is not always USDC. Warning: on a spot fill this field reads `"0"` on both legs today. The chain does charge the seller's USDC fee, and it leaves the unified balance. The spot lane records no fee on the fill, so the row cannot report it. Derive a spot fee from the balance delta, or from the pair's rate times the notional. Do not read `"0"` as free |
| `fills[*].fee_token` | string | Coin symbol the `fee` is charged in. A perp fill and a spot sell pay `"USDC"`. A spot buy pays the base token, so a `BTC/USDC` buy pays its fee in BTC. That rule has been in effect since block 6,565,000. The field is derived per record, so an older fill correctly reports `"USDC"` on both sides. Without this field, a sum of `fee` across a spot account adds one token to another. On a spot buy it also shows that `fee` is not the whole charge. The base fee is netted out of the size delivered, not debited, so `fee` can read `"0"` while the real charge is the gap between `sz` and the balance credit. See [a spot buy pays its fee in the base token](../../../concepts/fees.md#spot-buy-fee-in-base) |
| `fills[*].closed_pnl` | Decimal string | Realized PnL on the closed portion, decimal USDC (signed). Always `"0"` on a spot fill, because spot holds no position and realizes no PnL |
| `fills[*].dir` | string | Direction label. A perp fill uses six tokens: `"Open Long"`, `"Close Long"`, `"Open Short"`, `"Close Short"`, and `"Long > Short"` or `"Short > Long"` when the fill crosses through zero. A spot fill uses `"Buy"` (side `"B"`) or `"Sell"` (side `"A"`). Spot holds no position, so no open or close token applies. Switch on `side` for spot and on this field for perps |
| `fills[*].start_position` | Decimal string | Signed leg size before the fill, base units (whole-unit, signed). A spot fill holds no position leg, so the value is zero. It renders at the market's `sz_decimals`, the same plane as `sz`: a two-decimal market reads `"0.00"`. In effect from node 0.9.7. An older node renders a bare `"0"` on a spot row |
| `fills[*].block` | uint64 | Committed block height the fill settled in |
| `fills[*].cause` | string | Present only when this leg did not execute by its own order crossing. `"forced_close_partial"` and `"forced_close_full"` mean the liquidation ladder. `"forced_close_isolated"` means an isolated leg breached its own bucket. `"forced_close_governance"` means a validator-quorum forced close settled against the book. `"trigger"` means a TP/SL fired. `"twap"` means a TWAP slice. Absent on an ordinary fill and on every maker leg, because a counterparty that was only hit is not itself forced. `forced_close_governance` is a forced close that is not a liquidation. It charges no liquidation fee and does not count toward liquidation totals |
| `fills[*].liquidated_user` | hex address | Present on a forced-close leg only, on both sides of the print. The account whose position was closed. A taker can see whose liquidation it absorbed |
| `fills[*].mark_px` | Decimal string | Present with `liquidated_user`. The mark the liquidation ladder priced from when it classified the leg. It is not the fill price and not a later mark |
| `fills[*].broker` | hex address | Present when a [broker code](../../../concepts/broker-codes.md) routed the order. Taker leg only |
| `fills[*].broker_fee` | Decimal string | Present with `broker`. The carve charged on this fill, decimal USDC. `"0"` is legal: a zero-rate broker is still attributed |
| `fills[*].twap_id` | uint64 | Present on a TWAP slice (`cause` is `"twap"`). The parent order this slice belongs to. Taker leg only |
| `fills[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex. It lets you trace the fill on-chain. A taker leg carries its order's hash. A maker leg carries the hash of the maker's own resting order (its original order-submit action), so both legs of a match trace to the action that placed them. The value is an empty string (`""`) when no signed user order stands behind the leg (a system, begin-block or liquidation print) and, for maker legs, on fills recorded before the network upgrade |

**Rules**

- Archive-served fills (a window older than the fill ring) carry the
  attribution fields (`liquidated_user`, `mark_px`, `broker`, `broker_fee`,
  `twap_id`, `hash`) but never `cause`. Classify a forced close by
  `liquidated_user` and a TWAP slice by `twap_id`. Both work on every row. A
  `cause` test silently misses archive-era rows.
- Rows that the archive folded before node 0.9.7 carry no forced close, TWAP slice
  or trigger. Those fills reached the committed ring but not the stream that the
  archive folds. An archive window over that period returns nothing for them,
  while a ring window over the same period returns them. From 0.9.7 the two
  windows agree. Read the ring window when your window reaches back past that
  release.

#### Aggregated rows: `aggregate` {#user_fills-aggregate}

This feature is active from node 0.9.7. An older node does not reject `aggregate`. It ignores
the field and returns the per-leg rows with no `n` key, and a caller cannot see
this failure. Detect it by the presence of `n`, never by the row count. A
response whose rows carry no `n` came from a node without this feature. A folded
response always carries `n`, and `n` is `1` for a fill that stood alone.

One order that sweeps 24 resting orders writes 24 rows. Send `"aggregate":
true` to get one row for that order instead, with a new field `n` that counts
the legs folded into it. The default is `false`. A request that omits the
field gets the per-leg rows unchanged, with no `n` key.

Rows fold only when they agree on all of `oid`, `block`, `time`, `coin`,
`side`, `hash`, `fee_token`, `cause`, `liquidated_user`, `mark_px`, `broker`
and `twap_id`. `time` alone is not the key. Callers
get this rule wrong: `time` is the consensus timestamp of the block, one value for the whole
block. A [`batch_order`](../exchange/orders.md#batch_order) places several orders under
one timestamp. An account whose resting order is hit in the same block it
takes in has two orders at one timestamp. A key on time alone merges orders
that have nothing to do with each other, and merges opposite sides.

| Field | How it folds |
|---|---|
| `px` | Size-weighted average: `Σ(px × sz) / Σsz`, truncated toward zero. The chain uses the same rule for the average fill price of an order. A plain mean of the leg prices is wrong whenever the legs differ in size |
| `sz` | Sum of the leg sizes |
| `fee` | Sum. This is safe because `fee_token` is part of the key, so one row never adds two tokens |
| `closed_pnl` | Sum. Each leg is already priced against the entry average at that leg, so the sum is exactly the realized PnL of the group |
| `broker_fee` | Sum, when `broker` is present |
| `dir` | Classified from the whole folded size. It is not copied from a leg. A sweep from −10 to +14 records `Close Short`, `Short > Long`, `Open Long` on its three legs; the folded row reads `Short > Long` |
| `start_position` | The position the order started from. It is the first leg's value, not the newest leg's |
| `tid` | The first leg's `tid`. A folded row therefore joins [`trades`](../info/perpetuals.md#trades) on one of its `n` prints, not all of them. Read `n` before you treat a `tid` as the whole fill |
| `n` | uint. The number of legs folded. `1` on a fill that stands alone |
| everything else | Shared by every leg in the group, so it carries over unchanged |

`limit` counts the rows you receive, so it applies after the fold: `"limit":
10` with `"aggregate": true` returns up to 10 orders, not 10 legs. `start_time`
and `end_time` apply before the fold. A group never straddles a bound, because every
leg in it shares one `time`.

:::warning
Use `aggregate` on the recent window only. The fold runs on the ring.
A window old enough to be answered from the archive returns the rows of the archive
per leg, beside the folded ring rows. Send `aggregate` with no time bound, or
with a `start_time` inside the ring.
:::

### A single order's lifecycle {#order_status}

This read returns the lifecycle of one order, looked up by `oid` (server order id) or `cloid` (client
order id). It reads the resting books and the trigger registry. The fill legs of
a filled order come from the archive. See
[fill legs from the archive](#order_status-archive-legs).

**Request**

```json
{ "type": "order_status", "oid": 12345 }
```

Or by client order id:

```json
{ "type": "order_status", "cloid": "0x000000000000000000000000cafef00d" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `oid` | uint64 \| decimal-digit string | one of `oid` / `cloid` | Server order id. A number and a string are both accepted, so an `oid` read back off any response can be sent straight back |
| `cloid` | hex string | one of `oid` / `cloid` | Client order id: `0x` and 32 hex chars |
| `address` | hex address | no | The order's owner. The gateway reads the fill legs of a filled order from the archive with it. See [below](#order_status-archive-legs). A node ignores it |

If neither field is present, the read returns `400 INVALID_REQUEST`. A
malformed `cloid` returns `400`. Resolution stops at the first hit, in this
order: resting order, then parked trigger, then the fills of the order, then terminal outcome, then unknown.

A `cloid` resolves at every one of those stages. It used to stop resolving when
the write completed: the fill ring is keyed by `oid` and carried no cloid, so a
filled order stopped answering by `cloid`. The node now carries the cloid into
its read-side rings.

A parked leg resolves by `cloid` from committed state, not from a node-local
index, so it keeps resolving after a node restart. Two parked legs that share a
`cloid` resolve to the lowest `oid`.

:::info
`parked` is the one term for one state. A trigger leg held off the book is
parked on [`open_orders`](#open_orders), on the
[`/exchange` status union](../exchange.md#statuses-parked), on the
[`order_updates`](../../ws/subscriptions.md#order_updates) feed and in the node's
streams. `order_status` answers the legacy token `triggered` for the same state.
That one endpoint is the only place the older token appears, and it does not
change.
:::

**Response**

The `data.status` field discriminates which shape follows.

`"resting"` is an order open in a perp or spot book:

```json
{
  "data": {
    "type": "order_status",
    "status": "resting",
    "order": {
      "oid":         "12345",
      "coin":        "BTC",
      "side":        "B",
      "px":          "67000",
      "sz":          "700",
      "inserted_at": 1700000000000,
      "cloid":       "0x000000000000000000000000cafef00d"
    }
  }
}
```

`"triggered"` is a parked TP/SL/stop entry that waits for its mark cross:

```json
{
  "data": {
    "type": "order_status",
    "status": "triggered",
    "trigger": {
      "oid":           "12345",
      "coin":          "BTC",
      "side":          "A",
      "trigger_px":    "66000",
      "trigger_above": false,
      "is_market":     false,
      "limit_px":      "65000",
      "sz":            "700",
      "registered_at": 1700000000000,
      "fired":         false,
      "cloid":         "0x000000000000000000000000cafef00d"
    }
  }
}
```

`cloid` is the leg's client order id, or `null` when the submitted order set
none.

A ladder leg adds `group`, and a trailing leg adds `trail_px`. Both
keys follow the same absence rule as on [`open_orders`](#open_orders). The
node writes each one only on the leg that owns it, so an ordinary trigger
carries neither:

```json
{
  "data": {
    "type": "order_status",
    "status": "triggered",
    "trigger": {
      "oid":           "12346",
      "coin":          "BTC",
      "side":          "A",
      "trigger_px":    "65750",
      "trigger_above": false,
      "is_market":     true,
      "limit_px":      null,
      "sz":            "250",
      "registered_at": 1700000000000,
      "fired":         false,
      "group":         12345,
      "trail_px":      "250"
    }
  }
}
```

`"filled"` returns every matching leg, plus the summed size:

```json
{
  "data": {
    "type": "order_status",
    "status": "filled",
    "fills": [ /* each leg, newest first — same shape as a user_fills record */ ],
    "total_filled_sz": "1.49"
  }
}
```

`fills` is a list because an order can fill in more than one print. The read
used to serve a single `fill` object that held one arbitrary leg, with nothing to
mark it partial. Measured on testnet, order `32535358` filled `0.62` and then `0.87`,
and the read answered `0.62`, which is wrong by 58%. Compare `total_filled_sz` with the
size of the order to tell a full fill from a partial one. To get one leg,
read `fills[0]`.

#### Fill legs from the archive {#order_status-archive-legs}

Send `address` with the owner of the order. Since
[block 25,599,540](../../../changelog/block-25599540.md#tape-retirement-reads), the node keeps no fill
ring, so it holds no legs for a filled order. The gateway then reads the legs from the archive fills of
`address` for that `oid`, and serves `fills` and `total_filled_sz`. An
answer that the node gives as `unknown` then reads `filled`. Without
`address`, the answer carries no `fills`, and a filled order can answer
`unknown`. The gateway reads the newest 5,000 archive fills of `address`. An
order whose legs are all older than those can also answer `unknown`.

`"canceled"`, `"cancel_rejected"` and `"rejected"` mean the order reached a terminal
state without filling. All three carry the same `outcome` object:

```json
{
  "data": {
    "type": "order_status",
    "status": "canceled",
    "outcome": {
      "oid":    "32535358",
      "coin":   "BTC",
      "side":   null,
      "time":   1788004665371,
      "reason": null
    }
  }
}
```

There are exactly three terminal tokens. Branch on `status`. `reason` is
prose and its wording changes:

| Token | What it means |
|-------|---------------|
| `canceled` | The cancel ran and succeeded. `reason` is `null` |
| `cancel_rejected` | The cancel request failed. The order had already left the current view of this node. The order is gone, and the cancel did not run. `reason` carries the refusal text |
| `rejected` | The node refused the order itself. It never rested and it never got an id, so only `cloid` reaches it, and `outcome.oid` is `null`. `reason` carries the refusal text |

There is no `expired` token. No node path writes one. Do not code a branch
for it.

`outcome` carries five fields and no others. It has no `sz`, no `filled_sz`
and no `cloid`. Two rules put them out of reach, and both are permanent:

- A fill wins before an outcome does. Resolution reaches the fill ring
  before the terminal window, so an order with even one fill answers `"filled"`
  and never reaches this branch. An order that does reach it has no fills, so a
  `filled_sz` here could only read `"0"`.
- A cancel names the order, not its shape. The event that the node records
  carries the id, the market and the time. It carries no size and no side. That
  is why `side` is `null` on both cancel outcomes.

`outcome` is a separate key from the `order` of a resting hit. The two answer
different questions. One name over two field sets would lead a caller to read the
wrong one.

`"unknown"` means the order is outside the retention view of this node. It does not prove that the order
never existed:

```json
{ "data": { "type": "order_status", "status": "unknown", "outcome_coverage": 42 } }
```

`outcome_coverage` appears on the `unknown` answer alone. It counts the orders that the
terminal window holds now. Read it before you trust an `unknown`. A
`0` means the window is empty because the node restarted, so the `unknown` says
nothing about your order.

Two orders no longer answer `unknown`. A cancelled spot order answers
`canceled`. A spot order or a scale rung that neither rests nor matches answers
`rejected`, with `reason: "Order could not immediately match against any resting
orders."` Both answered `unknown` before, because neither wrote a fill that the ring
could serve.

These orders still answer `unknown`, by design. The old `oid` of a
[`modify`](../exchange/orders.md#modify) is one: ask by `cloid`, or by the new `oid`.
Any order cancelled through
[`cancel_all_orders`](../exchange/orders.md#cancel_all_orders),
[`cancel_scale`](../exchange/orders.md#cancel_scale) or
[`cancel_chase`](../exchange/orders.md#cancel_chase) is the other. Each of those carries one
verdict for the whole action, so the node does not claim a per-order outcome that it
cannot prove.

An order that a [`batch_cancel`](../exchange/orders.md#batch_cancel) leg removed
answers `canceled` here. Each leg carries its own verdict, so the node records
only the legs that removed an order. A refused leg names an order that is
already gone, and it leaves the earlier terminal state of that order untouched.

The terminal states above come from a node-local retention window, not from
committed state. A node restart empties that window, so after a restart the node
answers `unknown` for orders that it would have named before. For the archive answer,
read [`historical_orders`](./account-history.md#historical_orders). `historical_orders` carries the same retention
contract.

| Field | Type | Meaning |
|-------|------|---------|
| `status` | `"resting" \| "triggered" \| "filled" \| "canceled" \| "cancel_rejected" \| "rejected" \| "unknown"` | Resolved lifecycle state. These seven tokens are the whole set |
| `order` | object | Present on `"resting"`: `oid` (decimal-digit string), `coin` (market symbol or spot pair name), `side` (`"B"` = bid / `"A"` = ask), `px` / `sz` (decimal strings), `inserted_at`, `cloid` (hex \| null) |
| `trigger` | object | Present on `"triggered"`: `oid` (decimal-digit string), `coin`, `side` (`"B"` / `"A"`), `trigger_px` / `sz` (decimal strings), `trigger_above` (bool: fire when mark crosses above), `is_market` (bool: `true` = fires a market exit, `false` = rests a limit exit), `limit_px` (decimal string \| `null`: the resting price for a limit trigger, `null` for a market trigger), `registered_at`, `fired` (bool), `cloid` (hex \| `null`). Ladder legs only: `group` (uint64, the shared ladder handle). Trailing legs only: `trail_px` (decimal string, the callback; `trigger_px` is then the ratcheted level). Both keys are absent on every other trigger. See [`open_orders`](#open_orders) |
| `fills` | array | Present on `"filled"`: every matching leg, newest first, each the shape of one [`user_fills`](#user_fills) record |
| `total_filled_sz` | Decimal string | Present on `"filled"`: the sum of `fills[*].sz` |
| `outcome` | object | Present on `"canceled"`, `"cancel_rejected"` and `"rejected"`. Exactly five fields: `oid` (decimal-digit string \| `null`; `null` when the node holds no id for the record, always on `rejected` and on a `cancel_rejected` for a `cloid` that never mapped to an order), `coin` (market symbol or spot pair name), `side` (`"B"` / `"A"` \| `null`; `null` on both cancel outcomes, because a cancel names the order, not its side), `time` (uint64, consensus ms of the transition), `reason` (string \| `null`; `null` on a successful cancel. Branch on `status`, never on this string). No `sz`, no `filled_sz`, no `cloid`. See [above](#order_status) |
| `outcome_coverage` | uint | Present on `"unknown"` only. How many orders the terminal window holds. `0` means the window is empty (a restart), so the `unknown` says nothing about your order |
