---
description: "The bounded history lanes: funding payments, TWAP history, and the archive-backed windows."
---

# Account history reads

These queries read account history through [`POST /info`](../info.md). That page defines the endpoint, the request envelope, the number planes and the error shape. They apply to every query here.

## Account history query types {#account-history-query-types}

These reads return per-account history: funding payments, past orders,
TWAP slice fills and staking rewards. They use the same `{type, data}` envelope and
MTF-native conventions as the reads above: decimal-string money, `0x`-hex
addresses and coin symbols. Every type here requires `address` (`0x` hex).
A missing or malformed `address` returns `400`. An unknown address is never an error. It
returns `200` with the empty shape, the zeroed-default convention that this reference uses
elsewhere.

[`user_funding`](#user_funding), [`historical_orders`](#historical_orders) and
[`user_twap_slice_fills`](#user_twap_slice_fills) are active and populated.

An empty array alone does not show which case applies. An account with
no matching history also reads `[]`, and a node-local retention window is empty
right after a restart. Read the notice on the type itself.

`user_ledger_updates` is removed. For balance ledger history, see its row in
[removed reads](../info.md#retired-reads).

An empty array from real state differs from a hardcoded empty array. A read that
could only answer `[]` is deleted, not documented. See
[removed reads](../info.md#retired-reads).

### Realized funding-payment history {#user_funding}

Realized funding payments for an account, over an optional time window.

This read is active and populated. For a push feed of the same payments,
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

The response does not echo `start_time` or `end_time`. It carries `address`
and `fundings` and nothing else. A caller that reads back the window it sent
gets `undefined`. Keep the window you requested on your own side.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `fundings` | array | Funding-payment records, newest first |
| `fundings[*].coin` | string | Market symbol the payment settled on |
| `fundings[*].usdc` | Decimal string | The payment, whole USDC, signed. The amount key is `usdc`. A negative value means that the account pays |
| `fundings[*].szi` | Decimal string | Signed position size at settlement, whole units |
| `fundings[*].funding_rate` | Decimal string | Funding rate applied, signed |
| `fundings[*].time` | uint64 | Settlement timestamp, consensus ms |

The amount field is `usdc`, never `payment`. `payment` is the internal name
and it is not emitted on the wire. A client that reads `payment` reads
`undefined` on every row.

The page cap is 500 rows. History goes past it. A request with no window
returns the newest 500 payments, which is not the whole history. To walk
back, request again with `end_time` set to the oldest `time` you received.

`end_time` is inclusive. The row at exactly `end_time` comes back again on
the next page. Drop the duplicate by `time`. Stop when a page returns only
rows you already hold. Otherwise a pager that sends the same `end_time`
again never advances.

### Daily traded volume for an account {#user_volume_history}

This read returns, per UTC day, the traded volume of the whole exchange beside the maker
and taker volume of this account. It also returns the trailing 14-day maker share of the account. It serves
a "Your Volume History" panel.

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
| `days` | array | One row per UTC day, newest first |
| `days[*].date` | string | The UTC day, `YYYY-MM-DD` |
| `days[*].exchange_volume` | Decimal string | The traded notional of every account that day, each print counted once |
| `days[*].maker_volume` | Decimal string | This account's notional as the resting side |
| `days[*].taker_volume` | Decimal string | This account's notional as the aggressor |
| `maker_volume_share_14d` | Decimal string | `maker_volume / exchange_volume` over the trailing 14 full days. A fraction, not a percent: `"0.0002"` is 0.02% |
| `flag` | string | The scope and plane caveats, restated below |

**Rules**

- The read always excludes the current UTC day. A partial day reads as a collapse
  in volume and makes a fee tier look like it moved. `end_time` cannot open it.
- `maker_volume_share_14d` covers the trailing 14 full days and does not follow
  the window. `start_time`, `end_time` and `limit` page the table. The share is
  the same number on every page. It is `"0"` when the exchange traded nothing.
- A quiet day has no row. A day on which nobody traded is absent, not a zero
  row. A day on which the exchange traded but this account did not is present, with the
  two figures of the account at `"0"`.
- `exchange_volume` counts each print once. Both sides of a match record a
  fill, so the sum of every account's `maker_volume` equals `exchange_volume`,
  and so does the sum of every `taker_volume`.
- Every fill counts, with no product weighting. Perp and spot notional enter
  at 1x alike, because [the chain weights them alike](../../../concepts/fees.md).
  This wire carries no doubled spot volume.

:::note
This read is not your fee tier, and the two differ by design. The fee ladder
reads a 30-day window, counts each product separately and rolls only
volume that paid a protocol fee. A zero-fee pair adds nothing to it. This
read counts every fill over the window you ask for. Read the tier itself,
and the volume that the tier saw, from [`fee_schedule`](./fees-credit.md#fee_schedule) with an
`address`.
:::

:::note
The volumes are on the raw node plane. `px` is scaled by `1e8` and `sz`
by `10^sz_decimals`, so `px x sz` carries a per-market factor. The figure is a
true USDC notional only within one market, and a total across markets is not
a dollar amount. `maker_volume_share_14d` divides two such totals, so it is
exact only while the account and the exchange trade the same size planes. The
archive holds no market registry to normalize with. `leaderboard` `volume` and
`portfolio` `volume` are on the same plane. For volume in whole USDC, read
`fee_schedule`.
:::

### Borrow interest an account owes {#user_interest}

This read returns every open borrow, with what it costs. One read serves every lane that charges
interest. Spot margin is the only lane today. A lane added later joins the same `borrows`
array and does not get a query type of its own.

The request key was `user` first, as on
[`spot_margin_state`](../info/spot.md#spot_margin_state), and `user` still works. Send `address` in new code.

```json
{ "type": "user_interest", "address": "0x<addr>" }
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
| `borrows[*].accrued` | Decimal string | `principal x (pool_index / index_snapshot)`. This is the figure that a repay charges |
| `borrows[*].interest` | Decimal string | `accrued - principal` |
| `borrows[*].index_snapshot` | Decimal string | The pool's borrow index when this borrow was opened or last re-based |
| `borrows[*].pool_index` | Decimal string | The pool's borrow index now |
| `earned` | `null` | Always. See below |

The answer carries both indices so that you can check the arithmetic. The chain
divides before it multiplies, and `Decimal` keeps 28 significant digits, so the
two orders do not always agree. An account that owes 3 units against a 1:3 index
ratio accrues `0.9999999999999999999999999999`, not `1`. Reproduce the order that
the chain uses, or read `accrued` and do not derive it again.

`earned` is always `null`. This follows from the chain, not from this read. An Earn pool stores the `shares` of a supplier and nothing else.
Committed state holds no cost basis, so the earnings of a supplier cannot be derived.
A number that looks like profit and is not would be worse than no number. Read shares and their current value from
[`earn_state`](../info/spot.md#earn_state) with a `user`.

An account with no borrow answers an empty `borrows` and `owed: "0"`. It does not return an
error.

### Past executed orders {#historical_orders}

This read returns the past orders of an account, newest first. A record is one order transition,
not one order. An order that rested and then filled contributes at least two
records: one `resting` record, then one `filled` record for every block in
which it executed. So `oid` is not unique across the array.

A resting order that a taker hits gets a `filled` record too, with one exception.
This page calls that a maker execution record. The maker sent no action in
that block, so the node derives the record from the fill. A liquidation, a TWAP
slice and a trigger order all produce the same record for the maker they hit.
Every order lane records the fill of the maker. Node 0.9.5 records the `modify`
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

`limit: 0` returns one record, not all of them. `limit` clamps to a minimum
of `1`, so `0` and any negative value both return a single record. Omit the key
to get everything. Do not pass a computed `0`. The read rejects a `limit` that is not a number.
See [malformed requests](../info.md#malformed-request).

**Response**

```json
{
  "data": {
    "type": "historical_orders",
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

The history archive serves this read. `type` sits inside `data`, the same as
every other `/info` read. The lane differs in its rejection shape only. See
[the archive lane](../info.md#archive-lane).

| Field | Type | Meaning |
|-------|------|---------|
| `orders[*].oid` | decimal-digit string | Order id. Not unique. See the rules below. `"0"` on an `"error"` record, which never reached the book |
| `orders[*].coin` | string | Market symbol the order was placed on |
| `orders[*].side` | `"B"` / `"A"` | Side token: `"B"` is buy or bid, `"A"` is sell or ask. It is the same token as [`user_fills`](./orders-fills.md#user_fills) |
| `orders[*].status` | `"filled"` \| `"resting"` \| `"error"` | The transition this record reports. `"filled"` is not a terminal flag. See the maker execution rule below |
| `orders[*].time` | uint64 | Timestamp of the transition, consensus ms |
| `orders[*].px` | Decimal string | `avg_px` when the order filled, else `limit_px`. Absent, not null, when the record carries neither |
| `orders[*].limit_px` | Decimal string | The limit price submitted |
| `orders[*].avg_px` | Decimal string \| null | Realized average fill price. `null` unless `status` is `"filled"`. Equals `limit_px` on a maker execution record: a resting order executes at its own price |
| `orders[*].sz` | Decimal string | Size on the record, whole units. On a maker execution record: the size executed in that block |
| `orders[*].orig_sz` | Decimal string | Size as submitted, whole units. `"0"` on a maker execution record, because a fill does not carry the request size. Read it from the same order's `resting` record, same `oid` |
| `orders[*].total_sz` | Decimal string \| null | Total executed size. `null` unless `status` is `"filled"`. On a maker execution record: the size executed in that block, not the lifetime total |
| `orders[*].filled_sz` | Decimal string | Executed size. `"0"` unless `status` is `"filled"`. It is a string zero, never null. On a maker execution record: the size executed in that block, not the lifetime total. For the lifetime total read [`user_fills`](./orders-fills.md#user_fills) |
| `orders[*].tif` | string \| null | Time in force: `"Gtc"`, `"Ioc"` or `"Alo"`. `null` on a maker execution record, because a fill does not carry it |
| `orders[*].reduce_only` | bool | Whether the order was submitted reduce-only. `false` on a maker execution record, whatever the order carried, because a fill does not carry it |
| `orders[*].cloid` | string \| null | Client order id. `null` when the order carried none, and on every maker execution record even when the order carried one |
| `orders[*].cancel_reason` | string \| null | Why the order was cancelled. `null` when it was not |
| `orders[*].error` | string \| null | The rejection message. Non-null only when `status` is `"error"` |
| `orders[*].hash` | string | Always the empty string `""`. This read records no transaction hash. Do not key on it |

**Rules**

- Records list newest first by `time`. The underlying history is bounded, so
  the read returns a recent window, not the full account history.
- `oid` is not a unique key. Do not use it to deduplicate. A record is one
  order transition, so one `oid` can appear more than once. Also, every
  `"error"` record carries `oid: "0"`, so an account with many rejections holds
  many records that share that single id. Key on `oid` plus `time` plus `status`,
  or do not key at all.
- Maker execution records. A resting order that a taker hits sends no action, so
  the node derives its record from the fills of the block. A fill describes the
  fill, not the order. Four fields are therefore missing from it: `tif` and
  `cloid` read `null`, `reduce_only` reads `false`, and `orig_sz` reads `"0"`,
  whatever the order carried. Join to the `resting` record of that order on the
  same `oid` for the real values.
  A `resting` record exists only for an order that a signed
  [`order`](../exchange/orders.md#submit_order), `batch_order`, `scale_order`,
  `spot_order` or `chase_order` placed. So for two groups of order the join
  has no target.
  The first group is the two kinds that the node rests by itself.
  One is a [chase](../../../concepts/order-types.md) leg after a reprice, because a reprice
  cancels the leg and rests a new `oid`. The other is a TP/SL trigger leg that fired as
  a limit order. The first leg of a chase is not in this group: `chase_order` is a
  signed action and its opening leg does get a `resting` record. Only the legs
  that a reprice rests lack one. For these two kinds of order, recover what you can and treat the rest
  as gone. While the order still rests, [`open_orders`](./orders-fills.md#open_orders) carries
  its real `tif` (lowercase on that read) and its real `cloid` under the same
  `oid`. It is also where the new `oid` of a repriced chase leg appears.
  `reduce_only` is not recoverable from that read: it is a constant there,
  `false` on every book row, whatever the order carried. `orig_sz` is not
  recoverable anywhere: that read serves `null` for it, and no action ever
  submitted a request size for the leg. When the order leaves the book, `tif`
  and `cloid` go too. Only the two values fixed by construction survive. A chase
  leg is always `"Alo"` and never reduce-only. A fired trigger leg is always
  `"Gtc"` and always reduce-only, so `reduce_only: false` is wrong on exactly
  that record, and `open_orders` repeats that same wrong `false` while the leg
  rests.
  The second group is any order that an
  [unrecorded-fill lane](./orders-fills.md#unrecorded-fills) rested: a CoreWriter
  `LimitOrder` that rested before node 0.9.6. It rested an order with no `resting`
  record. After that, the order is an ordinary resting order, so an ordinary
  taker does give it a maker execution record later, and that record has
  nothing to join to. Its `tif`, `cloid`,
  `reduce_only` and `orig_sz` stay missing for the whole life of the order.
  The record reports what executed in that block, and `"filled"` is not a
  terminal flag. A maker that a taker hits in three blocks yields three `filled` records,
  and the order can still rest after all three. For the lifetime executed size
  read [`user_fills`](./orders-fills.md#user_fills). Do not read the `total_sz` of the newest record
  as cumulative.
  The node sums every match against one `oid` inside one block into one record,
  so `(oid, time, status)` stays unique within a block. Edge case: consensus time
  never moves backward, so two adjacent blocks can carry the same `time`. Two
  maker execution records for one `oid` then share the key. They are two
  separate executions. Add them and never drop one.
- Some order lanes record no transition here at all. These are the
  [unrecorded fills](./orders-fills.md#unrecorded-fills).
  A [`multi_sig`](../../../concepts/multi-sig.md) envelope is the committed action
  and reports only its own outcome, so an inner `order`, `spot_order`,
  `batch_order`, `scale_order`, `modify` or `batch_modify` produces no
  `resting`, no `filled` and no `error` record.
  A [`modify`](../exchange/orders.md#modify) or
  [`batch_modify`](../exchange/orders.md#batch_modify) sent on its own records no
  transition either: not the fill, and not the rest of the replacement. The
  new `oid` of the replacement appears only on [`open_orders`](./orders-fills.md#open_orders), so
  poll that read after an amend if you track order ids.
  A CoreWriter `LimitOrder` records nothing here.
  A [frequent batch auction](../../../concepts/fba.md) clearing records nothing
  here for either side.
  None of them writes a [`user_fills`](./orders-fills.md#user_fills) entry, and the maker that each
  one hits gets no maker execution record. So a missing maker record does not
  prove that nothing hit the order.
- `"error"` is a real status, and it carries a human-readable `error`
  string. The read records an order rejected at commit time and does not drop it. The
  message is prose for a human and can change in any release. Do not match on
  it. Example: `"precondition failed: hedge leg-reducing order must be
  reduce_only"`.
- The read does not serve `block`. Earlier drafts of this page listed it. No
  record has a block field.
- Every key above is present on every record. The optional ones hold `null`.
  None of them is omitted. The one exception is `px`, which is absent when the
  record has neither an average nor a limit price.
- Resting orders and parked triggers are also readable from
  [`open_orders`](./orders-fills.md#open_orders) or [`order_status`](./orders-fills.md#order_status), which carry
  the current book state and not a transition history.

### Commit-time verdict on a submitted action {#action_outcome}

:::danger[Removed]
`action_outcome` no longer exists. The public gateway answers `410` with
`error.code: "UNKNOWN_TYPE"` and `details.use: "/exchange"`. A node called
directly answers `400` with the same code and no `details`. A
type that never existed gets the same error. Match on the code, not on the status: the two
entry points differ on the status and agree on the code.

There is nothing to migrate to, because the answer already arrives earlier.
`POST /exchange` waits for the commit and returns the real outcome. An order
gets its assigned `oid` and its resting or filled state. Any other action gets
a committed confirmation, or a rejection with its reason. Read
[the submit response](../exchange.md) instead of calling this read a second time.

The read served two residual cases, and neither needs a second endpoint:

- The wait expired. `/exchange` bounds its wait at about fifty blocks. If
  it gives up, the chain is not keeping up, and the action may still commit.
  Read again the state that the action was meant to change. Do not treat the timeout
  as a failure.
- You passed `?confirm=async`, so you asked not to wait. For orders,
  subscribe to the `order_updates` [WS channel](../../ws/subscriptions.md)
  instead.

:::caution[Re-submitting the same nonce answers nothing]
Re-submitting is replay-safe, because the committed nonce window rejects the
duplicate. It is usually silent. The block builder drops a committed
replay before the commit loop sees it, so no verdict is produced, and the
second call times out like the first. Read state again instead.
:::
:::

### TWAP slice-fill history {#user_twap_slice_fills}

This read returns the fill history of individual TWAP order slices. These are the executions of one TWAP
parent, so a caller can attribute fills to the order that produced them. The
active TWAP parents of the account are on [`user_twaps`](./node.md#user_twaps). Active slices
also stream on the `user_twap_slice_fills`
[WS channel](../../ws/subscriptions.md#user_twap_slice_fills).

The read serves a node-local retention window, not a history. A node restart empties
it, so an empty `fills` after a restart does not mean "this account has
never run a TWAP". Read the coverage envelope to tell the two cases apart.

The gateway adds the archive. It merges the node answer with the archive
fills of the same `address` that carry a `twap_id`, and it returns no fill twice. Since
[block 25,599,540](../../../changelog/block-25599540.md#tape-retirement-reads), the node keeps no fill
ring, so the archive supplies the slices. The gateway reads the newest 5,000
archive fills of the `address`. A slice older than those is not in the answer.

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
| `fills` | array | Slice-fill records, newest first |
| `fills[*].twap_id` | uint64 | The parent TWAP this slice belongs to. It stays a number: a small per-account counter, not a derived 64-bit value |
| `fills[*].fill` | object | A full [`user_fills`](./orders-fills.md#user_fills) record for the slice, `oid` / `tid` decimal-digit strings included |

### Per-validator staking reward accruals {#delegator_rewards}

This read returns the current per-validator reward accruals of a delegator, plus the total that a
claim-all pays now.

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
| `claimable_rewards` | Decimal string | What a claim-all ([`claim_rewards`](../exchange/staking.md#claim_rewards) without `validator`) pays the delegator now: the sum of every row's `unclaimed`, plus the account's legacy reward roll-up bucket, which drains on claim. Delegator side only. The separate validator-commission credit that a claim also pays out is not delegator-claimable and is excluded |
| `rewards[*].validator` | hex address | Validator the delegation accrues under |
| `rewards[*].unclaimed` | Decimal string | Current unclaimed reward accrued on this delegation, whole MTF |
| `rewards[*].last_claim_time` | uint64 | Last claim timestamp on this delegation, consensus ms. `0` if never claimed |

**Rules**

- Rows list in ascending validator-address order.
- An account with no staking state returns `claimable_rewards: "0"` and an
  empty `rewards` array.
