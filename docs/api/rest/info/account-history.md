---
description: "The bounded history lanes: ledger updates, funding payments, TWAP history, and the archive-backed windows."
---

# Account history reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

## Account history query types {#account-history-query-types}

Per-account history reads — funding payments, ledger updates, past orders,
TWAP slice fills, and staking rewards. Same `{type, data}` envelope and
MTF-native conventions as the reads above (decimal-string money, `0x`-hex
addresses, coin **symbols**). Every type here requires `address` (0x hex;
missing or malformed → `400`); an **unknown address is never an error** — it
returns **200** with the empty shape (the zeroed-default convention used
elsewhere in this reference).

[`user_funding`](#user_funding), [`historical_orders`](#historical_orders) and
[`user_twap_slice_fills`](#user_twap_slice_fills) are live and populated.

An empty array alone does not tell you which case you are in: an account with
no matching history also reads `[]`, and a node-local retention window is empty
right after a restart. Read the notice on the type itself.

[`user_ledger_updates`](#user_ledger_updates) is empty for a different reason:
its records live in the archive, not on the node. Read its own notice below.

**An honest-empty array is not the same as a hardcoded one.** A read that
could only ever answer `[]` was deleted rather than documented — see
[removed reads](../info.md#retired-reads).
### Realized funding-payment history {#user_funding}

Realized funding payments for an account, over an optional time window.

This read is **live and populated**. For a push feed of the same payments,
subscribe to the
[`user_fundings` WS channel](../../ws/subscriptions.md#user_fundings).

**Request**

```json
{ "type": "user_funding", "address": "0x<addr>", "start_time": 1700000000000, "end_time": 1700003600000 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `start_time` | uint64 | no | Window start, ms. Echoed back; `null` when omitted |
| `end_time` | uint64 | no | Window end, ms. Echoed back; `null` when omitted |

**Response**

```json
{
  "data": {
    "type": "user_funding",
    "address": "0x<addr>",
    "fundings": [
      {
        "coin":         "BTC",
        "funding_rate": "-0.00037488090540037165490589",
        "szi":          "-0.13362",
        "time":         1788148800041,
        "usdc":         "-3.8933688206827414955873986380"
      }
    ]
  }
}
```

**The response does NOT echo `start_time` or `end_time`.** It carries `address`
and `fundings` and nothing else. A caller that reads back the window it sent
gets `undefined`. Keep the window you requested on your own side.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `fundings` | array | Funding-payment records, **newest first** |
| `fundings[*].coin` | string | Market symbol the payment settled on |
| `fundings[*].usdc` | Decimal string | The payment, whole USDC, signed. **The amount key is `usdc`.** A negative value is paid BY the account |
| `fundings[*].szi` | Decimal string | Signed position size at settlement, whole units |
| `fundings[*].funding_rate` | Decimal string | Funding rate applied, signed |
| `fundings[*].time` | uint64 | Settlement timestamp, consensus ms |

**The amount field is `usdc`, never `payment`.** `payment` is the internal name
and it is not emitted on the wire. A client that reads `payment` reads
`undefined` on every row.

**The page cap is 500 rows. History goes past it.** A request with no window
returns the newest 500 payments, and that is not the whole history. To walk
back, re-request with `end_time` set to the oldest `time` you received.

**`end_time` is INCLUSIVE.** The row at exactly `end_time` comes back again on
the next page. Drop the duplicate by `time`, and stop when a page returns only
rows you already hold — otherwise a pager that re-sends the same `end_time`
never advances.

### Daily traded volume for an account {#user_volume_history}

Per UTC day, the whole exchange's traded volume beside this account's own maker
and taker volume, plus the account's trailing 14-day maker share. It is the read
behind a "Your Volume History" panel.

> ⚠️ **NOT LIVE YET.** The archive serves it and the gateway routes it, but
> neither is released. A live gateway answers `400 UNKNOWN_TYPE` until the next
> release. Read [`fee_schedule`](./fees-credit.md#fee_schedule) for volume you can query today.

**Request**

```json
{ "type": "user_volume_history", "address": "0x<addr>", "limit": 30 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `start_time` | uint64 | no | Window start, ms. Snapped down to its UTC day. Default: 30 days ago. Send `0` for all history |
| `end_time` | uint64 | no | Window end, ms. Snapped down to its UTC day, and never past yesterday |
| `limit` | uint | no | Most days to return. Default `500`, capped at `5000` |

**Response**

```json
{
  "data": {
    "type": "user_volume_history",
    "address": "0x<addr>",
    "days": [
      { "date": "2026-09-06", "exchange_volume": "470", "maker_volume": "200", "taker_volume": "0" }
    ],
    "maker_volume_share_14d": "0.42553191",
    "flag": "traded notional on the RAW node plane …"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `days` | array | One row per UTC day, **newest first** |
| `days[*].date` | string | The UTC day, `YYYY-MM-DD` |
| `days[*].exchange_volume` | Decimal string | EVERY account's traded notional that day, each print counted once |
| `days[*].maker_volume` | Decimal string | This account's notional as the RESTING side |
| `days[*].taker_volume` | Decimal string | This account's notional as the AGGRESSOR |
| `maker_volume_share_14d` | Decimal string | `maker_volume / exchange_volume` over the trailing 14 full days. A fraction, not a percent: `"0.0002"` is 0.02% |
| `flag` | string | The scope and plane caveats, restated below |

**Rules**

- **The current UTC day is EXCLUDED, always.** A partial day reads as a collapse
  in volume and makes a fee tier look like it moved. `end_time` cannot open it.
- **`maker_volume_share_14d` is the trailing 14 FULL days and does not follow
  the window.** `start_time` / `end_time` / `limit` page the table; the share is
  the same number on every page. It is `"0"` when the exchange traded nothing.
- **A quiet day has NO ROW.** A day on which nobody traded is absent, not a zero
  row. A day the EXCHANGE traded but this account did not IS present, with the
  account's two figures at `"0"`.
- **`exchange_volume` counts each print once.** Both sides of a match record a
  fill, so the sum of every account's `maker_volume` equals `exchange_volume`,
  and so does the sum of every `taker_volume`.
- **Every fill counts, with NO product weighting.** Perp and spot notional enter
  at 1x alike, because [the chain weights them alike](../../../concepts/fees.md).
  This wire carries no doubled spot volume.

> ⚠️ **This is NOT your fee tier, and the two disagree on purpose.** The ladder
> reads a **30-day** window, counts each product separately, and rolls only
> volume that PAID a protocol fee — a zero-fee pair adds nothing to it. This
> read counts every fill over whatever window you ask for. Read the tier itself,
> and the volume the tier saw, from [`fee_schedule`](./fees-credit.md#fee_schedule) with an
> `address`.

> ⚠️ **The volumes are on the RAW node plane.** `px` is scaled by `1e8` and `sz`
> by `10^sz_decimals`, so `px x sz` carries a per-market factor. The figure is a
> true USDC notional only within ONE market, and a total across markets is not
> a dollar amount. `maker_volume_share_14d` divides two such totals, so it is
> exact only while the account and the exchange trade the same size planes. The
> archive holds no market registry to normalize with. `leaderboard` `volume` and
> `portfolio` `volume` are on the same plane. For volume in whole USDC, read
> `fee_schedule`.

### Borrow interest an account owes {#user_interest}

Every open borrow, with what it costs. One read for every lane that charges
interest — spot margin today, and anything added later joins the same `borrows`
array rather than getting a query type of its own.

**The request key is `user`, NOT `address`.** It follows
[`spot_margin_state`](../info/spot.md#spot_margin_state), not the account-history reads.

```json
{ "type": "user_interest", "user": "0x<addr>" }
```

**Response**

```json
{
  "data": {
    "type": "user_interest",
    "user": "0x<addr>",
    "owed": "12.5",
    "borrows": [
      {
        "lane": "spot_margin",
        "pair": "MTF/USDC",
        "principal": "1000",
        "accrued": "1012.5",
        "interest": "12.5",
        "index_snapshot": "1.0",
        "pool_index": "1.0125"
      }
    ],
    "earned": null
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `owed` | Decimal string | Sum of every row's `interest`. What the account owes in interest right now |
| `borrows[*].lane` | string | Which lane created the debt. `spot_margin` today |
| `borrows[*].pair` | string | The market symbol the borrow funds |
| `borrows[*].principal` | Decimal string | Borrowed, before interest |
| `borrows[*].accrued` | Decimal string | `principal x (pool_index / index_snapshot)` — the figure a repay charges |
| `borrows[*].interest` | Decimal string | `accrued - principal` |
| `borrows[*].index_snapshot` | Decimal string | The pool's borrow index when this borrow was opened or last re-based |
| `borrows[*].pool_index` | Decimal string | The pool's borrow index now |
| `earned` | `null` | Always. See below |

**Both indices are in the answer so you can check the arithmetic.** The chain
divides before it multiplies, and `Decimal` keeps 28 significant digits, so the
two orders do not always agree — an account owing 3 units against a 1:3 index
ratio accrues `0.9999999999999999999999999999`, not `1`. Reproduce it the way
the chain does, or read `accrued` and do not re-derive it.

**`earned` is permanently `null`, and that is a fact about the chain rather than
this read.** An Earn pool stores a supplier's `shares` and nothing else — there
is no cost basis in committed state, so a supplier's earnings are not derivable.
Serving a number that looks like profit and is not would be worse than serving
nothing. Read shares and their current value from
[`earn_state`](../info/spot.md#earn_state) with a `user`.

**An account with no borrow answers an empty `borrows` and `owed: "0"`**, not an
error. That is a fact about the account.

### Balance ledger update history {#user_ledger_updates}

> ⚠️ **This read answers `[]` today, and it is not scheduled.** The node keeps
> no per-account ledger history for REST. The archive does retain the deltas,
> but in the node stream's own record shape: a signed `delta` and a numeric
> token id. The locked record shape below instead matches the
> [`ledger_updates` WS record](../../ws/subscriptions.md#ledger_updates), which
> carries an unsigned `amount` and a fine-grained `kind`. The gateway will not
> route the archive's data through a shape it does not match. This opens when
> the archive stores the matching record shape, not before.

**Neither side can answer this read today.** The node emits each balance delta
once, on the [`ledger_updates` WS channel](../../ws/subscriptions.md#ledger_updates),
and keeps nothing after. The archive keeps the deltas, in the different shape
above. Use the WS channel for live movement; there is no REST history for it
yet.

**A deployment with no archive answers typed-empty**: `updates` is `[]`, never
an error. So `[]` carries two meanings — "no archive here" and "no delta in
this window" — and the reply does not tell them apart. For a live per-account
feed, subscribe to the WS channel instead.

**Request**

```json
{ "type": "user_ledger_updates", "address": "0x<addr>", "start_time": 1700000000000, "end_time": 1700003600000 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `start_time` / `end_time` | uint64 | no | Window, ms. Echoed back; `null` when omitted |

**Response**

```json
{
  "data": {
    "type": "user_ledger_updates",
    "address":    "0x<addr>",
    "start_time": 1700000000000,
    "end_time":   1700003600000,
    "updates":    []
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `start_time` | uint64 \| null | Echoes the request window start |
| `end_time` | uint64 \| null | Echoes the request window end |
| `updates` | array | Ledger-update records. Always `[]` today |

Locked record shape: the
[`ledger_updates` WS record](../../ws/subscriptions.md#ledger_updates) verbatim —
`{kind, amount, time}` plus the kind-specific fields
(`destination`, `token`, `asset`, `to_perp`, `via`). Every `amount` is a
whole-token decimal string; no record carries raw base units. The underlying
deltas, once retention lands, come from the archive's
[`node_ledger`](../../../nodes/data-streams.md#node_ledger) stream.

### Past executed orders {#historical_orders}

An account's past orders, newest first. A record is one **order transition**,
not one order. An order that rested and then filled contributes at least two
records: one `resting` record, then one `filled` record for every block in
which it executed. So `oid` is not unique across the array.

A resting order that is HIT gets a `filled` record too, with one exception.
This page calls that a **maker execution record**. The maker sent no action in
that block, so the node derives the record from the fill. A liquidation, a TWAP
slice and a trigger order all produce the same record for the maker they hit.
**Every order lane records the maker's fill.** Node 0.9.5 records the `modify`
and `multi_sig` lanes. Node 0.9.6 records all four lanes: a CoreWriter
`LimitOrder` that crosses on placement and a batch-auction clearing also derive
the maker record. See [every order lane records its fill](./orders-fills.md#unrecorded-fills).

**Request**

```json
{ "type": "historical_orders", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `limit` | int | no | Cap on the number of most-recent records returned. Absent returns every retained record |

**`limit: 0` returns ONE record, not all of them.** `limit` clamps to a minimum
of `1`, so `0` and any negative value both return a single record. Omit the key
to get everything; do not pass a computed `0`. A `limit` that is not a number is
rejected — see [malformed requests](../info.md#malformed-request).

**Response**

```json
{
  "type": "historical_orders",
  "data": {
    "address": "0x<addr>",
    "orders": [
      {
        "oid":           "32535358",
        "coin":          "GRAD:000001SH",
        "side":          "A",
        "status":        "filled",
        "time":          1787982042382,
        "px":            "585.56189134",
        "limit_px":      "558.58000000",
        "avg_px":        "585.56189134",
        "sz":            "4.97",
        "orig_sz":       "4.97",
        "total_sz":      "4.97",
        "filled_sz":     "4.97",
        "tif":           "Ioc",
        "reduce_only":   true,
        "cloid":         null,
        "cancel_reason": null,
        "error":         null,
        "hash":          ""
      }
    ]
  }
}
```

**`type` sits at the TOP level on this read until the next gateway release.**
The history archive serves it — see [the archive lane](../info.md#archive-lane). Read
`body.data.type ?? body.type` and both answers work.

| Field | Type | Meaning |
|-------|------|---------|
| `orders[*].oid` | decimal-digit string | Order id. **Not unique** — see the rules below. `"0"` on an `"error"` record, which never reached the book |
| `orders[*].coin` | string | Market symbol the order was placed on |
| `orders[*].side` | `"B"` / `"A"` | Side token — `"B"` = buy/bid, `"A"` = sell/ask. Same token as [`user_fills`](./orders-fills.md#user_fills) |
| `orders[*].status` | `"filled"` \| `"resting"` \| `"error"` | The transition this record reports. **`"filled"` is not a terminal flag** — see the maker execution rule below |
| `orders[*].time` | uint64 | Timestamp of the transition, consensus ms |
| `orders[*].px` | Decimal string | `avg_px` when the order filled, else `limit_px`. **Absent**, not null, if the record carries neither |
| `orders[*].limit_px` | Decimal string | The limit price submitted |
| `orders[*].avg_px` | Decimal string \| null | Realized average fill price. **`null` unless `status` is `"filled"`**. Equals `limit_px` on a maker execution record: a resting order executes at its own price |
| `orders[*].sz` | Decimal string | Size on the record, whole units. On a maker execution record: the size executed in THAT block |
| `orders[*].orig_sz` | Decimal string | Size as submitted, whole units. **`"0"` on a maker execution record** — a fill does not carry the request size. Read it from the same order's `resting` record, same `oid` |
| `orders[*].total_sz` | Decimal string \| null | Total executed size. **`null` unless `status` is `"filled"`**. On a maker execution record: the size executed in THAT block, not the lifetime total |
| `orders[*].filled_sz` | Decimal string | Executed size. **`"0"` unless `status` is `"filled"`** — a string zero, never null. On a maker execution record: the size executed in THAT block, not the lifetime total. For the lifetime total read [`user_fills`](./orders-fills.md#user_fills) |
| `orders[*].tif` | string \| null | Time in force: `"Gtc"`, `"Ioc"` or `"Alo"`. **`null` on a maker execution record** — a fill does not carry it |
| `orders[*].reduce_only` | bool | Whether the order was submitted reduce-only. **`false` on a maker execution record, whatever the order carried** — a fill does not carry it |
| `orders[*].cloid` | string \| null | Client order id. `null` when the order carried none, **and on every maker execution record even when the order carried one** |
| `orders[*].cancel_reason` | string \| null | Why the order was cancelled. `null` when it was not |
| `orders[*].error` | string \| null | The rejection message. **Non-null only when `status` is `"error"`** |
| `orders[*].hash` | string | **Always the empty string `""`.** This read records no transaction hash. Never key on it |

**Rules**

- Records list newest-first by `time`. The underlying history is bounded, so
  this is a recent window, not the full account history.
- **`oid` is not a unique key. Do not use it to deduplicate.** A record is one
  order transition, so one `oid` can appear more than once. Worse, every
  `"error"` record carries `oid: "0"`, so an account with many rejections holds
  many records sharing that single id. Key on `oid` plus `time` plus `status`,
  or do not key at all.
- **Maker execution records.** A resting order that is HIT sends no action, so
  the node derives its record from the block's fills. **A fill describes the
  fill, not the order.** Four fields are therefore missing from it: `tif` and
  `cloid` read `null`, `reduce_only` reads `false`, and `orig_sz` reads `"0"` —
  whatever the order carried. Join to that order's own `resting` record on the
  same `oid` for the real values.
  **A `resting` record exists only for an order that a signed
  [`order`](../exchange/orders.md#submit_order), `batch_order`, `scale_order`,
  `spot_order` or `chase_order` placed**, so for two groups of order the join
  has no target.
  The first group is the two the node rests by itself:
  a [chase](../../../concepts/order-types.md) leg after a reprice — a reprice
  cancels the leg and rests a NEW `oid` — and a TP/SL trigger leg that fired as
  a limit order. A chase's FIRST leg is not in this group: `chase_order` is a
  signed action and its opening leg does get a `resting` record. Only the legs
  a reprice rests are missing one. For these two orders, recover what you can and treat the rest
  as gone. While the order still rests, [`open_orders`](./orders-fills.md#open_orders) carries
  its real `tif` (lowercase on that read) and its real `cloid` under the same
  `oid`, and it is where the new `oid` of a repriced chase leg appears.
  **`reduce_only` is NOT recoverable from that read**: it is a constant there,
  `false` on every book row, whatever the order carried. **`orig_sz` is not
  recoverable anywhere**: that read serves `null` for it, and no action ever
  submitted a request size for the leg. Once the order leaves the book, `tif`
  and `cloid` go too. Only the two values fixed by construction survive: a chase
  leg is always `"Alo"` and never reduce-only; a fired trigger leg is always
  `"Gtc"` and always reduce-only, so `reduce_only: false` is wrong on exactly
  that record — and `open_orders` repeats that same wrong `false` while the leg
  rests.
  **The second group is any order an
  [unrecorded-fill lane](./orders-fills.md#unrecorded-fills) rested** — a CoreWriter
  `LimitOrder` that rested before node 0.9.6. It rested an order with no `resting`
  record. That order is an ordinary resting order after that, so an ordinary
  taker DOES give it a maker execution record later — and that record has
  nothing to join to. Its `tif`, `cloid`,
  `reduce_only` and `orig_sz` stay missing for the whole life of the order.
  **The record reports what executed IN THAT BLOCK, and `"filled"` is not a
  terminal flag.** A maker hit in three blocks yields three `filled` records,
  and the order can still rest after all three. For the lifetime executed size
  read [`user_fills`](./orders-fills.md#user_fills); do not read the newest record's `total_sz`
  as cumulative.
  The node sums every match against one `oid` inside one block into ONE record,
  so `(oid, time, status)` stays unique within a block. **EDGE:** consensus time
  never moves backward, so two adjacent blocks can carry the same `time`. Two
  maker execution records for one `oid` then share the key. They are two
  separate executions: add them, never drop one.
- **Some order lanes record no transition here at all** — the
  [unrecorded fills](./orders-fills.md#unrecorded-fills).
  A [`multi_sig`](../../../concepts/multi-sig.md) envelope is the committed action
  and reports only its own outcome, so an inner `order`, `spot_order`,
  `batch_order`, `scale_order`, `modify` or `batch_modify` produces no
  `resting`, no `filled` and no `error` record.
  A [`modify`](../exchange/orders.md#modify) or
  [`batch_modify`](../exchange/orders.md#batch_modify) sent on its own records no
  transition either — not the fill, and not the replacement's rest. **The
  replacement's new `oid` appears only on [`open_orders`](./orders-fills.md#open_orders)**, so
  poll that read after an amend if you track order ids.
  A CoreWriter `LimitOrder` records nothing here.
  A [frequent batch auction](../../../concepts/fba.md) clearing records nothing
  here for either side.
  None of them writes a [`user_fills`](./orders-fills.md#user_fills) entry, and the maker each
  one hits gets no maker execution record. So a missing maker record is not
  proof that the order was not hit.
- **`"error"` is a real status, and it carries a human-readable `error`
  string.** An order rejected at commit time is recorded here, not dropped. The
  message is prose for a human and can change in any release — do not match on
  it. Example: `"precondition failed: hedge leg-reducing order must be
  reduce_only"`.
- **`block` is not served.** Earlier drafts of this page listed it. There is no
  block field on any record.
- Every key above is present on every record. The optional ones hold `null`;
  none of them is omitted. The one exception is `px`, which is absent when the
  record has neither an average nor a limit price.
- Live resting orders and parked triggers are also readable from
  [`open_orders`](./orders-fills.md#open_orders) or [`order_status`](./orders-fills.md#order_status), which carry
  the current book state rather than a transition history.

### Commit-time verdict on a submitted action {#action_outcome}

:::danger[Removed]
**`action_outcome` no longer exists.** The public gateway answers `410` with
`error.code: "UNKNOWN_TYPE"` and `details.use: "/exchange"`. A node called
directly answers `400` with the same code and no `details` — the same error a
type that never existed gets. **Match on the code, not on the status**: the two
entry points disagree on the status and agree on the code.

There is nothing to migrate to, because the answer already arrives earlier.
`POST /exchange` waits for the commit and returns the real outcome: an order
gets its assigned `oid` and its resting or filled state; any other action gets
a committed confirmation, or a rejection with its reason. Read
[the submit response](../exchange.md) instead of calling this a second time.

The read existed for two residual cases, and neither needs a second endpoint:

- **The wait expired.** `/exchange` bounds its wait at about fifty blocks. If
  it gives up, the chain is not keeping up; the action may still commit.
  Re-read the state the action was meant to change. Do not treat the timeout
  as a failure.
- **You passed `?confirm=async`.** You asked not to wait. For orders,
  subscribe to the `order_updates` [WS channel](../../ws/subscriptions.md)
  instead.

:::caution[Re-submitting the same nonce answers nothing]
Re-submitting is replay-safe — the committed nonce window rejects the
duplicate — but it is usually silent. The block builder drops a committed
replay before the commit loop sees it, so no verdict is ever produced, and the
second call times out exactly like the first. Re-read state instead.
:::
:::

### TWAP slice-fill history {#user_twap_slice_fills}

Fill history for individual TWAP order slices — the executions of one TWAP
parent, so a caller can attribute fills to the order that produced them. The
account's active TWAP parents are on [`user_twaps`](./node.md#user_twaps); live slices
also stream on the `user_twap_slice_fills`
[WS channel](../../ws/subscriptions.md#user_twap_slice_fills).

**It is a node-local RETENTION WINDOW, not a history.** A node restart empties
it, so an empty `fills` after a restart is not the same fact as "this account has
never run a TWAP". Read the coverage envelope to tell the two apart.

**Request**

```json
{ "type": "user_twap_slice_fills", "address": "0x<addr>" }
```

No parameters beyond `address`, which is required (hex address).

**Response**

```json
{ "data": { "type": "user_twap_slice_fills", "address": "0x<addr>", "fills": [
  { "twap_id": 41, "fill": { /* same shape as a user_fills record */ } }
] } }
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `fills` | array | Slice-fill records, oldest first |
| `fills[*].twap_id` | uint64 | The parent TWAP this slice belongs to. It stays a NUMBER — a small per-account counter, not a derived 64-bit value |
| `fills[*].fill` | object | A full [`user_fills`](./orders-fills.md#user_fills) record for the slice, `oid` / `tid` decimal-digit strings included |

### Per-validator staking reward accruals {#delegator_rewards}

The delegator's live per-validator reward accruals, plus the total a
claim-all would pay right now.

**Request**

```json
{ "type": "delegator_rewards", "address": "0x<addr>" }
```

No parameters beyond `address`, which is required (hex address).

**Response**

```json
{
  "data": {
    "type": "delegator_rewards",
    "address":           "0x<addr>",
    "claimable_rewards": "9",
    "rewards": [
      { "validator": "0x<val_a>", "unclaimed": "3", "last_claim_time": 1700000000000 },
      { "validator": "0x<val_b>", "unclaimed": "4", "last_claim_time": 1700000500000 }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `claimable_rewards` | Decimal string | What a claim-all ([`claim_rewards`](../exchange/staking.md#claim_rewards) without `validator`) pays the delegator now: the sum of every row's `unclaimed`, plus the account's legacy reward roll-up bucket, which drains on claim. Delegator side only — the separate validator-commission credit a claim also pays out is not delegator-claimable, and is excluded |
| `rewards[*].validator` | hex address | Validator the delegation accrues under |
| `rewards[*].unclaimed` | Decimal string | Live unclaimed reward accrued on this delegation, whole MTF |
| `rewards[*].last_claim_time` | uint64 | Last claim timestamp on this delegation, consensus ms. `0` if never claimed |

**Rules**

- Rows list in ascending validator-address order.
- An account with no staking state returns `claimable_rewards: "0"` and an
  empty `rewards` array.
