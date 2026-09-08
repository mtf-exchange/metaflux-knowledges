---
description: "Resting orders across all books, recent fill history, and a single order's lifecycle from placement to terminal state."
---

# Order & fill reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

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
| `orders[*].oid` | decimal-digit string | Server order id — the real resting id, cancellable per-`oid`. Send it straight back on a cancel: a request takes the string or a number |
| `orders[*].coin` | string | Market symbol the order rests on (e.g. `"BTC"`, or a pair name like `"BTC/USDC"`) |
| `orders[*].side` | `"B"` / `"A"` | Order side. `B` = bid, `A` = ask. The `/exchange` order body uses `"bid"` / `"ask"` instead |
| `orders[*].px` | Decimal string | Resting price, whole units, tick-snapped |
| `orders[*].sz` | Decimal string | Remaining size, whole units |
| `orders[*].orig_sz` | Decimal string \| null | **Always `null`.** This read keeps no request size. `sz` is the size still resting |
| `orders[*].cloid` | hex string \| null | Client order id the order was placed with (`0x` + 32 hex chars); `null` when the order set none |
| `orders[*].tif` | string | Lowercase time-in-force (`"gtc"` / `"ioc"` / `"alo"`), or the literal `"trigger"` on a parked TP/SL row |
| `orders[*].reduce_only` | bool | **A row-kind label, not the order's flag.** `false` on every book row, `true` on every parked TP/SL row. See the rule below |
| `orders[*].trigger` | object \| null | Trigger detail when the row is, or carries, a trigger; `null` otherwise |
| `orders[*].inserted_at` | uint64 | Placement / insertion timestamp, consensus ms |

**Errors**

- Missing `address` → `400 INVALID_REQUEST`.

**Rules**

- A spot entry labels `coin` with the pair name (e.g. `"BTC/USDC"`) and renders `px` / `sz` in the pair's own planes: pair tick, base-token size decimals.
- Every row is the same canonical shape the WS [`open_orders`](../../ws/subscriptions.md#open_orders) snapshot renders, so REST and WS never drift. An unknown field renders `null`.
- A parked TP/SL leg is an open order too: it renders with `tif: "trigger"` and a populated `trigger` block.
- **`reduce_only` here is set by row kind and never read from the order.** A
  resting book row renders `false`; a parked TP/SL row renders `true`. So a
  reduce-only limit order reads `false`, and a fired TP/SL leg — which IS
  reduce-only and rests as an ordinary book order — reads `false` as well.
  **Never recover an order's reduce-only flag from this read.** Read it from the
  order the account submitted. When no action submitted the order, the flag is
  not recoverable at all.
- `tif` and `cloid` ARE read from the order, so both are recoverable here for as
  long as the order rests.

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

`group` and `trail_px` are absent unless the leg owns them. Read absence as
"not a ladder leg" and "not a trailing leg". A decoder that types them as
optional needs no change when they first appear on a leg; a decoder that
makes them required fails on every ordinary trigger.

**`group` — the scaled TP/SL ladder.** A
[`positionTpsl`](../exchange/orders.md#position-tpsl-ladder) batch of three or more
protective legs parks a ladder: the legs share one `group`, and they are not
OCO — a fill of one leg does not cancel the others, which is the point of
scaling out in steps. One or two legs stay the older shapes: a lone trigger,
or an OCO pair whose first fill cancels its partner. Group the rows by this
value to render one ladder as one control. The whole ladder retires together
the moment the position it protects is closed, by any path.

**`trail_px` — the trailing stop.** The parked level ratchets toward the mark
by this offset, and never away from it, once per block. So when `trail_px`
is present, `trigger_px` is the ratcheted level, not the level the owner
sent — do not render it as a static order the user placed. A trailing leg is
always a stop-loss; the chain refuses a trailing take-profit, which would
chase its level away from a winning position. `trail_px` is submittable —
see [trailing stops](../exchange/orders.md#trailing-stops), and sending it
changes the order's signing digest.
### Recent fill history for an account {#user_fills}

Account-scoped fill history: one row per execution, served directly from the
node's committed on-chain state (a bounded per-account fill ring folded into
the AppHash — no external indexer). For one row per
**opened-then-closed position** instead — peak size, average entry, average
close, realized PnL and funding folded over the whole life — use
[position history](../info/position-history.md).

#### Every order lane records its fill {#unrecorded-fills}

Four lanes used to settle a fill that nothing reported — the chain matched the
order, moved both positions and moved the money, and no read and no stream
carried it, for either party. All four are fixed:

| The order was placed by | Fixed in |
|---|---|
| [`modify`](../exchange/orders.md#modify) / [`batch_modify`](../exchange/orders.md#batch_modify), when the replacement crosses on placement | node 0.9.5 |
| a [`multi_sig`](../../../concepts/multi-sig.md) envelope holding an order action | node 0.9.5 |
| [CoreWriter `LimitOrder`](../../../evm/interacting-with-core.md) from MetaFluxEVM, when it crosses on placement | the next release |
| a [frequent batch auction](../../../concepts/fba.md) clearing | the next release |

> **Other pages still describe all four lanes as unrecorded.** This section is
> the current answer; where another page enumerates four, read it as the two
> above that are not yet live.

> ⚠️ **The last two ship with the NEXT node release.** Until it swaps, a
> CoreWriter order that crosses on placement and an FBA clearing still record
> nothing. The two rows above them are live now.

So a fill reaches this read, [`historical_orders`](./account-history.md#historical_orders), the
[public trade tape](../info/perpetuals.md#trades), the WS
[`fills`](../../ws/subscriptions.md#fills) and
[`trades`](../../ws/subscriptions.md#trades) channels, and the
[node streams](../../../nodes/data-streams.md), whichever lane placed the order.

**Two properties survive the fix, and a caller still has to know them.**

**A position change is authoritative; a fill list is a report.** Read the
position and the balance from [`account_state`](./account.md#account_state) for anything
that must balance. Sum fills for reporting, never for a balance check. That was
true before these lanes were fixed and it stays true: a fill list is a stream of
events, and a stream can be behind.

**A `modify` replacement rests under a NEW order id.** That is not a recording
gap, it is how the action works — but a caller tracking an order by id has to
follow the new one. Read that id on [`open_orders`](#open_orders).

**Request**

```json
{ "type": "user_fills", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address. Missing `address` returns `400 INVALID_REQUEST` |
| `limit` | uint32 | no | Cap on the number of most-recent records returned. Absent or `0` returns the full ring |
| `start_time` | uint64 | no | Window start (consensus ms, inclusive), filtered on the fill `time`. Absent is an open lower bound |
| `end_time` | uint64 | no | Window end (consensus ms, inclusive). Absent is an open upper bound |
| `aggregate` | bool | no | Default `false`. `true` folds the legs of ONE order's execution in ONE block into a single row and adds `n`. See [aggregated rows](#user_fills-aggregate) |

Send `address` alone for the recent window, or add `start_time` / `end_time` to
filter the same records by time. The response echoes both bounds back as
`start_time` / `end_time` (`null` for a bound you omit); the fill-record shape
is identical either way.

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

Records are ordered newest-first (the most recent fill is `fills[0]`). The ring
is bounded, so this is a recent window, not the account's full history. An
account with no fills returns `"fills": []`.

A request whose `start_time` is older than the oldest ring record is answered
from the archive instead. A request with no time bound always answers from the
ring.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `fills[*].coin` | string | Market symbol the fill executed on |
| `fills[*].side` | `"B"` / `"A"` | This leg's side: `"B"` = buy/bid, `"A"` = sell/ask |
| `fills[*].px` | Decimal string | Execution price, **decimal USDC** (human-readable) |
| `fills[*].sz` | Decimal string | Filled size, **base units** (whole-unit) |
| `fills[*].time` | uint64 | Fill timestamp (consensus ms) |
| `fills[*].oid` | decimal-digit string | This party's order id |
| `fills[*].tid` | decimal-digit string | Deterministic trade id, shared by both legs of the print. It is a 64-bit hash-derived value and routinely exceeds 2^53, so it is a STRING: a JSON number loses its low digits in JavaScript, and a `user_fills` to `trades` join by `tid` then matches nothing, silently. Compare it as a string, or convert it with `BigInt` |
| `fills[*].fee` | Decimal string | Fee this party paid. **Read `fee_token` for the denomination — it is not always USDC.** ⚠️ On a SPOT fill this field reads `"0"` on BOTH legs today. The seller's USDC fee IS charged — it leaves the unified balance — but the spot lane records no fee on the fill, so the row cannot report it. Derive a spot fee from the balance delta, or from the pair's rate times the notional; do not read `"0"` as free. A node release will record it |
| `fills[*].fee_token` | string | Coin symbol the `fee` is charged in. A perp fill and a spot SELL pay `"USDC"`; a **spot BUY pays the BASE token**, so a `BTC/USDC` buy pays its fee in BTC. That rule has been live since block 6,565,000; the field is derived per record, so an older fill correctly reports `"USDC"` on both sides. **Without it, summing `fee` across a spot account adds one token to another.** On a spot BUY it also warns you that `fee` is not the whole story: the base fee is NETTED out of the size delivered, not debited, so `fee` can read `"0"` while the real charge is the gap between `sz` and the balance credit — see [a spot BUY pays its fee in the base token](../../../concepts/fees.md#spot-buy-fee-in-base) |
| `fills[*].closed_pnl` | Decimal string | Realized PnL on the closed portion, **decimal USDC** (signed). Always `"0"` on a spot fill — spot holds no position, so it realizes no PnL |
| `fills[*].dir` | string | Direction label. A PERP fill uses six tokens: `"Open Long"`, `"Close Long"`, `"Open Short"`, `"Close Short"`, and — when the fill crosses through zero — `"Long > Short"` or `"Short > Long"`. A SPOT fill uses `"Buy"` (side `"B"`) or `"Sell"` (side `"A"`): spot holds no position, so no open/close token applies. Switch on `side` for spot and on this field for perps |
| `fills[*].start_position` | Decimal string | Signed leg size before the fill, **base units** (whole-unit, signed). Always `"0"` on a spot fill — spot holds no position leg |
| `fills[*].block` | uint64 | Committed block height the fill settled in |
| `fills[*].cause` | string | Present only when this leg did not execute by its own order crossing. `"forced_close_partial"` / `"forced_close_full"` — the liquidation ladder; `"forced_close_isolated"` — an isolated leg breached its own bucket; `"forced_close_governance"` — a validator-quorum forced close settled against the book; `"trigger"` — a TP/SL fired; `"twap"` — a TWAP slice. Absent on an ordinary fill and on every maker leg: a counterparty that was merely hit is not itself forced. `forced_close_governance` is a forced close that is NOT a liquidation — it charges no liquidation fee and does not count toward liquidation totals |
| `fills[*].liquidated_user` | hex address | Present on a forced-close leg only, on both sides of the print. The account whose position was closed — so a taker can see whose liquidation it absorbed |
| `fills[*].mark_px` | Decimal string | Present with `liquidated_user`. The mark the liquidation ladder priced from when it classified the leg — not the fill price, and not a later mark |
| `fills[*].broker` | hex address | Present when a [broker code](../../../concepts/broker-codes.md) routed the order. Taker leg only |
| `fills[*].broker_fee` | Decimal string | Present with `broker`. The carve charged on this fill, **decimal USDC**. `"0"` is legal — a zero-rate broker is still attributed |
| `fills[*].twap_id` | uint64 | Present on a TWAP slice (`cause` is `"twap"`). The parent order this slice belongs to. Taker leg only |
| `fills[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex, letting the fill be traced on-chain. A taker leg carries its order's hash; a **maker leg carries the hash of the maker's own resting order** (its original order-submit action), so both legs of a match trace to the action that placed them. **Empty string (`""`)** when no signed user order stands behind the leg — a system, begin-block, or liquidation print — and, for maker legs, on fills recorded before the network upgrade |

**Rules**

- Archive-served fills (a window older than the fill ring) carry the
  attribution fields (`liquidated_user`, `mark_px`, `broker`, `broker_fee`,
  `twap_id`, `hash`) but never `cause`. Classify a forced close by
  `liquidated_user` and a TWAP slice by `twap_id` — both work on every row; a
  `cause` test silently misses archive-era rows.
- **The archive holds no forced-close, TWAP-slice or trigger row before the
  next node release.** Those fills reach the committed ring, but they never
  reached the stream the archive folds. So a ring-window read has always
  returned them, and an archive-window read over that earlier period returns
  nothing for them. From that release on, both windows agree.

#### Aggregated rows: `aggregate` {#user_fills-aggregate}

One order that sweeps 24 resting orders writes 24 rows. Send `"aggregate":
true` to get ONE row for that order instead, with a new field `n` that counts
the legs folded into it. The default is `false`, and a request that omits the
field gets the per-leg rows unchanged, with no `n` key.

**Rows fold only when they agree on ALL of** `oid`, `block`, `time`, `coin`,
`side`, `hash`, `fee_token`, `cause`, `liquidated_user`, `mark_px`, `broker`
and `twap_id`. **`time` alone is NOT the key**, and this is the rule callers
get wrong: `time` is the block's consensus timestamp, one value for the whole
block. A [`batch_order`](../exchange/orders.md#batch_order) places several orders under
one timestamp, and an account whose resting order is hit in the same block it
takes in has two orders at one timestamp. Keying on time alone merges orders
that have nothing to do with each other, and merges opposite sides.

| Field | How it folds |
|---|---|
| `px` | Size-weighted average: `Σ(px × sz) / Σsz`, truncated toward zero — the same rule the chain uses for an order's own average fill price. A plain mean of the leg prices is wrong whenever the legs differ in size |
| `sz` | Sum of the leg sizes |
| `fee` | Sum. Safe because `fee_token` is part of the key, so one row never adds two tokens |
| `closed_pnl` | Sum. Each leg is already priced against the entry average at that leg, so the sum is the group's realized PnL exactly |
| `broker_fee` | Sum, when `broker` is present |
| `dir` | Classified from the WHOLE folded size, not copied from a leg. A sweep from −10 to +14 records `Close Short`, `Short > Long`, `Open Long` on its three legs; the folded row reads `Short > Long` |
| `start_position` | The position the order STARTED from — the first leg's, not the newest leg's |
| `tid` | The first leg's `tid`. A folded row therefore joins [`trades`](../info/perpetuals.md#trades) on ONE of its `n` prints, not all of them. Read `n` before you treat a `tid` as the whole fill |
| `n` | uint — the number of legs folded. `1` on a fill that stands alone |
| everything else | Shared by every leg in the group, so it carries over unchanged |

`limit` counts the rows you receive, so it applies AFTER the fold: `"limit":
10` with `"aggregate": true` returns up to 10 orders, not 10 legs. `start_time`
/ `end_time` apply before it, and a group never straddles a bound because every
leg in it shares one `time`.

> ⚠️ **Use `aggregate` on the recent window only, for now.** A window old
> enough to be answered from the archive returns the archive's rows per-leg
> beside the folded ring rows. Send `aggregate` with no time bound, or with a
> `start_time` inside the ring, until a later release folds the archive side
> too.

### A single order's lifecycle {#order_status}

Single-order lifecycle lookup by `oid` (server order id) or `cloid` (client
order id). Reads the resting books, the trigger registry, and the committed
fill ring.

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
| `cloid` | hex string | one of `oid` / `cloid` | Client order id — `0x` + 32 hex chars |

Neither field present returns `400 INVALID_REQUEST`. A
malformed `cloid` returns `400`. Resolution stops at the first hit, in this
order: live resting order, then parked trigger, then the order's fills, then a
terminal outcome, then unknown.

**A `cloid` resolves at every one of those stages.** It used to die the moment
the write completed — the fill ring is keyed by `oid` and carried no cloid, so a
filled order stopped answering by `cloid`. The node now carries the cloid into
its read-side rings.

**Response**

The `data.status` field discriminates which shape follows.

`"resting"` — a live order open in a perp or spot book:

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

`"triggered"` — a parked TP/SL/stop entry awaiting its mark cross:

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
      "fired":         false
    }
  }
}
```

A **ladder** leg adds `group`, and a **trailing** leg adds `trail_px`. Both
keys follow the same absence rule as on [`open_orders`](#open_orders) — the
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

`"filled"` — EVERY matching leg, plus the summed size:

```json
{
  "data": {
    "type": "order_status",
    "status": "filled",
    "fills": [ /* each leg, oldest first — same shape as a user_fills record */ ],
    "total_filled_sz": "1.49"
  }
}
```

**`fills` is a LIST because an order fills in more than one print.** The read
used to serve a single `fill` object holding one arbitrary leg, with nothing to
mark it partial: measured live, order `32535358` filled `0.62` and then `0.87`,
and the read answered `0.62` — wrong by 58%. Compare `total_filled_sz` with the
order's own size to tell a full fill from a partial one. If you want one leg,
read `fills[0]` and know that is what you chose.

`"canceled"` / `"cancel_rejected"` / `"rejected"` — the order reached a terminal
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

**There are exactly three terminal tokens.** Branch on `status`. `reason` is
prose and its wording changes:

| Token | What it means |
|-------|---------------|
| `canceled` | The cancel ran and it succeeded. `reason` is `null` |
| `cancel_rejected` | The CANCEL request failed. The order had already left this node's live view. The ORDER is gone; it is the cancel that did not run. `reason` carries the refusal text |
| `rejected` | The order itself was refused. It never rested and it never got an id, so it is reachable by `cloid` only, and `outcome.oid` is `null`. `reason` carries the refusal text |

**There is no `expired` token.** No node path writes one. Do not code a branch
for it.

**`outcome` carries five fields and no others.** It has no `sz`, no `filled_sz`
and no `cloid`. Two rules put them out of reach, and both are permanent:

- **A fill wins before an outcome does.** Resolution reaches the fill ring
  BEFORE the terminal window, so an order with even one fill answers `"filled"`
  and never reaches this branch. An order that does reach it has no fills, so a
  `filled_sz` here could only ever read `"0"`.
- **A cancel names the order, not its shape.** The event the node records
  carries the id, the market and the time — not the size and not the side. That
  is why `side` is `null` on both cancel outcomes.

`outcome` is a SEPARATE key from the `order` of a resting hit. The two answer
different questions, and one name over two field sets is how a caller reads the
wrong one.

`"unknown"` — **outside this node's retention view.** It is not proof the order
never existed:

```json
{ "data": { "type": "order_status", "status": "unknown", "outcome_coverage": 42 } }
```

`outcome_coverage` rides the `unknown` answer alone. It counts the orders the
terminal window holds right now. **Read it before you trust an `unknown`:** a
`0` says the window is empty — the node restarted — so the `unknown` carries no
information about your order at all.

The terminal states above come from a **node-local retention window**, not from
committed state. A node restart empties that window, so after a restart the node
answers `unknown` for orders it would have named before. For the archive answer,
read [`historical_orders`](./account-history.md#historical_orders). This is the same retention
contract `historical_orders` already carries.

| Field | Type | Meaning |
|-------|------|---------|
| `status` | `"resting" \| "triggered" \| "filled" \| "canceled" \| "cancel_rejected" \| "rejected" \| "unknown"` | Resolved lifecycle state. These seven tokens are the whole set |
| `order` | object | Present on `"resting"` — `oid` (decimal-digit string), `coin` (market symbol or spot pair name), `side` (`"B"` = bid / `"A"` = ask), `px` / `sz` (decimal strings), `inserted_at`, `cloid` (hex \| null) |
| `trigger` | object | Present on `"triggered"` — `oid` (decimal-digit string), `coin`, `side` (`"B"` / `"A"`), `trigger_px` / `sz` (decimal strings), `trigger_above` (bool: fire when mark crosses above), `is_market` (bool: `true` = fires a market exit, `false` = rests a limit exit), `limit_px` (decimal string \| `null`: the resting price for a limit trigger, `null` for a market trigger), `registered_at`, `fired` (bool). **Ladder legs only:** `group` (uint64, the shared ladder handle). **Trailing legs only:** `trail_px` (decimal string, the callback; `trigger_px` is then the RATCHETED level). Both keys are absent on every other trigger — see [`open_orders`](#open_orders) |
| `fills` | array | Present on `"filled"` — EVERY matching leg, oldest first, each the shape of one [`user_fills`](#user_fills) record |
| `total_filled_sz` | Decimal string | Present on `"filled"` — the sum of `fills[*].sz` |
| `outcome` | object | Present on `"canceled"` / `"cancel_rejected"` / `"rejected"` — exactly five fields: `oid` (decimal-digit string \| `null`; `null` when the node holds no id for the record — always on `rejected`, and on a `cancel_rejected` for a `cloid` that never mapped to an order), `coin` (market symbol or spot pair name), `side` (`"B"` / `"A"` \| `null`; `null` on both cancel outcomes — a cancel names the order, not its side), `time` (uint64, consensus ms of the transition), `reason` (string \| `null`; `null` on a successful cancel — **branch on `status`, never on this string**). No `sz`, no `filled_sz`, no `cloid` — see [above](#order_status) |
| `outcome_coverage` | uint | Present on `"unknown"` ONLY — how many orders the terminal window holds. `0` means the window is empty (a restart), so the `unknown` says nothing about your order |
