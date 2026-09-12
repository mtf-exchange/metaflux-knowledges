---
description: "Place, amend and cancel orders on a perpetual market — the single order, the batched forms, TWAP, scale ladders, chase legs and trigger orders."
---

# Perpetual order actions {#perpetual-order-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

Order placement and lifecycle on **perpetual** markets (a perp `market` id). These
use the shared CLOB; the [spot](./spot.md) and
[spot margin](./spot-margin.md) trading actions are separate sections
below. Perp leverage and margin controls are under
[Perpetual margin & risk actions](./margin-risk.md).

### Place a single order {#submit_order}

Place a single order. The order body is carried under `action.order`; `owner` is
the claimed account (the server requires the recovered signer to equal it or be an
approved agent). To place many orders under one signature, use
[`batch_order`](#batch_order).

```json
{
  "type": "submit_order",
  "order": {
    "owner":       "0x00000000000000000000000000000000000000aa",
    "market":       7,
    "side":         "bid",
    "kind":         "limit",
    "size":         100000000,
    "limit_px":     10050000000,
    "tif":          "gtc",
    "stp_mode":     "cancel_oldest",
    "reduce_only":  false,
    "cloid":        "0xabababababababababababababababab",
    "builder":      { "fee": 5, "user": "0x00000000000000000000000000000000000000ff" },
    "position_side": "long"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address | 40 hex chars | Claimed account; must equal the recovered signer or an approved agent of it. Wire-only — dropped on lowering |
| `market` | uint32 | `[0, market_count)` | Asset/market id (identity-mapped to `AssetId`) |
| `side` | enum | `"bid"` / `"ask"` | — |
| `kind` | enum | `"limit"` / `"market"` / `"stop_loss"` / `"take_profit"` | `limit` / `market` place a live order. `stop_loss` / `take_profit` are accepted **only when a `trigger` block is also present** — that pair parks a single reduce-only TP/SL leg (see [trigger orders](#trigger-orders-stop_loss--take_profit)); a `stop_loss` / `take_profit` *without* a `trigger` block is rejected (`unsupported order kind`) |
| `trigger` | object \| null | — | Optional [trigger block](#trigger-orders-stop_loss--take_profit). Its presence — on **any** `kind` — turns this `submit_order` into a single parked reduce-only TP/SL leg instead of a live order: `{ "trigger_px": <u64>, "is_market": <bool>, "tpsl": "tp" \| "sl" }`. `is_market: true` fires a market (IOC) exit; `is_market: false` rests a limit exit at the order's `limit_px` — see [trigger orders](#trigger-orders-stop_loss--take_profit) |
| `size` | uint64 | `> 0` | Fixed-point tick units (widened to `u128`) |
| `limit_px` | uint64 | `> 0` | Fixed-point tick units (widened to `i128`) |
| `tif` | enum | `"gtc"`, `"ioc"`, `"alo"` | `"aon"` is rejected (`unsupported time-in-force` — no core equivalent) |
| `stp_mode` | enum | `"cancel_oldest"`, `"cancel_newest"`, `"cancel_both"` | `"reject"` is rejected (`unsupported stp_mode` — no core equivalent) |
| `reduce_only` | bool | — | If true, rejected at commit if it would grow position |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | Optional client order id; enables `cancel_by_cloid` and dedup |
| `builder` | object \| null | — | Optional [broker fee](../../../concepts/broker-codes.md), charged on top of the taker fee: `{ "fee": <bps u16>, "user": <0x-hex address> }`. The field keeps the `builder` name |
| `position_side` | enum \| null | `"long"` / `"short"` | **[Hedge mode](../../../concepts/hedge-mode.md) only.** Target leg for the order. **Omit on a one-way account** (the default) and **send it on a hedge account** — a one-way account that sends it, or a hedge account that omits it, is rejected. `reduce_only` is evaluated against the named leg only. See [hedge mode](#position_side-hedge-mode) below |

**Idempotency**: a `cloid` names exactly one order. A `cloid` already in use on
this account is refused at admission with `ORDER_DUPLICATE_CLOID`. Use `cloid` as
your client-side dedup key.

**The check runs PER LEG.** [`batch_order`](#batch_order) checks every leg that
carries a `cloid`, and [`scale_order`](#scale_order) checks its ladder handle.
Two legs of ONE action that share a `cloid` refuse the WHOLE action, with the
message `duplicate cloid within one action`. The action is one signature on one
nonce, so no leg is admitted.

**Why the rule exists.** [`cancel_by_cloid`](#cancel_by_cloid) and
[`order_status`](../info/orders-fills.md#order_status) by `cloid` both resolve the
LOWEST `oid` that carries the handle. One `cloid` on two orders makes both
unreachable by construction.

**An attempt the COMMIT refused gives its `cloid` back**, so a re-signed retry
may reuse the handle. The dedup set is admission-local and bounded, so a very old
`cloid` may be admitted again. Committed-nonce uniqueness, not this set, is the
hard replay guard.

**Not live yet:** the per-leg check, the within-action refusal and the release of
a refused `cloid` all ship with the next node release. A live node checks the
single-order handle only, and it keeps the handle of an order the commit refused.

**Common errors**: `px` not tick-aligned, `size` below market minimum, `reduce_only` would grow position, `stp` rejected via STP, account in T1+ liquidation tier.

**Response status entries** (per order, in order — see the full union under
[Response → 200 OK](../exchange.md#200-ok--order-path-synchronous-oid)):

```json
{"resting": {"oid": "12345", "cloid": "0x..."}}                     // posted to book
{"filled":  {"oid": "12345", "total_sz": "100000000", "avg_px": "10050000000"}}
{"error":   {"code": "ORDER_INVALID_PRICE", "message": "..."}}      // this entry was rejected
{"noop":    {"reason": "..."}}                                      // accepted, nothing to do — DO NOT RETRY
{"parked":  {"oid": "12345", "cloid": "0x..."}}                     // trigger leg accepted, and held off the book
{"pending": {"action_hash": "0x...", "nonce": 1735689600001}}       // admitted, no commit in the wait window
```

A failed leg's `error` is the **same error object** the envelope carries —
`code`, `message`, and `details` when the rejection names a bound. Match on
`code`, never on `message`. See
[per-order statuses](../exchange.md#per-order-statuses).

#### `position_side` (hedge mode) {#position_side-hedge-mode}

The optional `position_side` field on the order body selects which leg an order
applies to when the account is in [hedge mode](../../../concepts/hedge-mode.md).

- **One-way account (default):** **omit** `position_side`. Sending it on a
  one-way account is rejected.
- **Hedge account:** `position_side` is **required** on every order (`"long"`
  or `"short"`). Omitting it on a hedge account is rejected.

The leg is chosen explicitly — it is **never inferred** from `side` — so a `bid`
meant to *reduce a short* can never accidentally open or grow a long. When
`reduce_only` is set, it is evaluated **against the named leg only**: a
`reduce_only` order on `short` can never touch the `long` leg, and vice-versa.
There is no implicit flip — closing the long leg never opens a short.

| `side` | `position_side` | `reduce_only` | Effect (hedge account) |
|--------|-----------------|---------------|------------------------|
| `bid` | `long` | false | Open / add to the long leg |
| `ask` | `long` | true | Reduce / close the long leg |
| `ask` | `short` | false | Open / add to the short leg |
| `bid` | `short` | true | Reduce / close the short leg |

Switch an account into hedge mode (while flat) with
[`set_position_mode`](./account.md#set_position_mode).

#### Trigger orders (`stop_loss` / `take_profit`) {#trigger-orders-stop_loss--take_profit}

A single-leg protective trigger (a stop-loss or take-profit) is expressed as a
`submit_order` whose `order` body carries a `trigger` block. The block's
**presence** — not the `kind` — is what routes it: the order is **parked** in the
canonical trigger registry instead of going to the book. When the mark price
crosses `trigger_px`, the leg fires as a **reduce-only market exit** (a
slippage-bounded IOC) or, if `is_market: false`, **rests a reduce-only limit** at
the order's `limit_px`. Both variants always reduce — a trigger can never open or
grow a position.

```json
{
  "type": "submit_order",
  "order": {
    "owner":       "0x00000000000000000000000000000000000000aa",
    "market":       7,
    "side":         "ask",
    "kind":         "take_profit",
    "size":         50000000,
    "limit_px":     0,
    "tif":          "ioc",
    "stp_mode":     "cancel_oldest",
    "reduce_only":  false,
    "trigger":     { "trigger_px": 4200000000000, "is_market": true, "tpsl": "tp" }
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `trigger.trigger_px` | uint64 | `> 0` | Trigger price in fixed-point tick units (widened to `i128`). The mark crossing this price fires the leg. For a **market** trigger it is also the fired price; for a **limit** trigger it drives the fire direction only (the resting price is `limit_px`) |
| `trigger.is_market` | bool | — | Selects the fired exit. `true` = **market trigger**: fire a reduce-only slippage-bounded IOC. `false` = **limit trigger**: rest a reduce-only `gtc` limit at the order's `limit_px` (rules below) |
| `trigger.tpsl` | enum | `"tp"` / `"sl"` | Take-profit / stop-loss label, surfaced in [`/info`](../info/orders-fills.md#order_status). The fire direction comes from the leg `side` versus the mark, not from this label |
| `trigger.trail_px` | uint64 | `> 0`, optional | **Optional — makes the leg a trailing stop.** The callback offset, in the same fixed-point tick units as `trigger_px`. The parked level ratchets toward the mark by this offset once per block and never away from it. It is **signed**: sending the key changes the EIP-712 type string and the digest, so omit it unless you want a trail. See [trailing stops](#trailing-stops) |

:::info
**`is_market` controls the exit type .** Before
the upgrade the field is a label only and every trigger fires as a market IOC.
`is_market` is **control**:
`false` selects the new **limit** trigger. A submit that **omits** `is_market`
defaults to `false` — after the upgrade that is a **limit** trigger, so a market
stop **must** send `is_market: true`. A limit trigger with `limit_px: 0` (or an
omitted `is_market` plus `limit_px: 0`) is rejected `InvalidParams`.
:::

**Market trigger (`is_market: true`).** On the mark cross the leg fires a
reduce-only IOC bounded by the mark band, clamped to what actually reduces the
position. `limit_px` is ignored. This is the only behaviour before the upgrade.

**Limit trigger (`is_market: false`).** On the mark cross the leg places a
reduce-only `gtc` limit at the order's `limit_px`, and that order rests on the
book until it fills or you cancel it. Admission rules for a limit trigger:

- `limit_px > 0` — a limit trigger with `limit_px: 0` is rejected `InvalidParams`.
- `tif` must be `gtc`. `alo` / `ioc` on a limit trigger are rejected.
- `trigger_px` keeps every role (park price, fire direction, mark cross);
  `limit_px` is only the resting order's price.

A limit-trigger example — rest a reduce-only sell at `41000.00` once the mark
crosses `42000.00`:

```json
{
  "type": "submit_order",
  "order": {
    "owner":       "0x00000000000000000000000000000000000000aa",
    "market":       7,
    "side":         "ask",
    "kind":         "take_profit",
    "size":         50000000,
    "limit_px":     4100000000000,
    "tif":          "gtc",
    "stp_mode":     "cancel_oldest",
    "reduce_only":  false,
    "trigger":     { "trigger_px": 4200000000000, "is_market": false, "tpsl": "tp" }
  }
}
```

Semantics:

- **Reduce-only is forced.** A trigger leg always closes — it can never open or
  grow a position — regardless of the order's `reduce_only` wire value.
- **The leg `side` chooses what is protected.** An `ask` trigger closes a long;
  a `bid` trigger closes a short. On a [hedge account](#position_side-hedge-mode),
  carry `position_side` to name the leg, exactly as for a live order.
- **A fired limit gets a new `oid`.** At conversion the parked leg retires and the
  new resting limit is assigned a fresh `oid`; the parked `oid` reads terminal /
  unknown afterwards, and the resting limit appears in
  [`open_orders`](../info/orders-fills.md#open_orders). `cloid` is **not** carried onto the fired
  order.
- **A resting fired limit persists** until it fills or you cancel it through the
  normal path.
- **OCO collapse point differs by variant.** A market trigger and its sibling
  collapse on the first fill. A **limit** trigger and its sibling collapse at
  **conversion** — the instant the resting limit is placed, not when it fills —
  because the live limit order is now the protection.
- **One-way resting-closer.** A fired limit rests like any closing `gtc` order (a
  resting order carries no reduce-only flag). On a one-way account, if the position
  shrinks by other means before the limit fills, the eventual fill can grow
  exposure the other way — the same behaviour as a manual resting close order.

Admission returns the same per-order status union as a live `submit_order`. A
trigger that parks reports through the order path; the eventual fire is a
committed effect observable on the [WS feed](../../ws/subscriptions.md) / `/info`.
Multi-leg entry-plus-protective baskets use [`batch_order`](#batch_order) with
`grouping: "normalTpsl"` / `"positionTpsl"`.

#### Trailing stops (`trail_px`) {#trailing-stops}

:::tip
**LIVE.** The release that binds `trail_px` has shipped. The frozen EIP-712 type
carrying `uint64 trailPx` is in the running node, admission accepts the field,
and no fork gate guards either half — the signer picks the type by whether the
field is PRESENT, so an order without it keeps the older digest unchanged.

Two rules the node enforces, and both refuse rather than reinterpret:

- `trail_px` must be greater than zero. Sending `0` is not the same as omitting
  it: `0` selects the trailing type string and then fails admission.
- A trailing leg must be the STOP-LOSS. A trailing take-profit is refused. The
  ratchet moves the level toward the mark, so on a take-profit it would chase
  its level away from a winning position and fire at a price nobody asked for.
:::

A trigger leg becomes a **trailing stop** when its `trigger` block carries
`trail_px`, the callback offset. The parked level then ratchets toward the mark
by that offset, once per block, and never away from it.

```json
{
  "type": "submit_order",
  "order": {
    "owner":       "0x00000000000000000000000000000000000000aa",
    "market":       7,
    "side":         "ask",
    "kind":         "stop_loss",
    "size":         50000000,
    "limit_px":     0,
    "tif":          "ioc",
    "stp_mode":     "cancel_oldest",
    "reduce_only":  false,
    "trigger":     { "trigger_px": 4000000000000, "is_market": true, "tpsl": "sl",
                     "trail_px": 100000000000 }
  }
}
```

**The level you sign is a floor, not the fire price.** For a long's stop the
level becomes `max(level, mark - trail_px)` on every mark update, so it rises
with a winning position and holds when the mark falls back. The leg fires at the
**ratcheted** level. This is why [`open_orders`](../info/orders-fills.md#open_orders) and
[`order_status`](../info/orders-fills.md#order_status) serve a `trigger_px` that is not the one
you sent — read the served value as the current high-water level, and `trail_px`
as the offset that produced it.

**A trailing leg must be the stop-loss.** The ratchet follows a winning
position, so it only makes sense on the leg below a long (or above a short). A
trailing take-profit would chase its level away from the position and fire at a
price nobody asked for, so the chain refuses it.

##### Signing — `trail_px` is BOUND, and it changes the digest {#trailing-stops-signing}

`trail_px` moves WHERE a position closes, so it is a **control** field: it must
be covered by the signature, or a relay could add or strip it while the
signature still verifies. It is covered. **Sending `trail_px` changes the EIP-712
type string and the digest.** A client that computes the old digest and sends
`trail_px` anyway gets its signature recovered to a different address and the
action rejected.

The rule is **presence, not value** — the same fold the
[action expiry](../../../integration/typed-data-signing.md#action-expiry-expiresafter)
uses:

| What you send | Type string | Digest |
|---|---|---|
| No `trail_px` key on any leg | The frozen one — unchanged | **Byte-identical to before this field existed.** An older client signs exactly as it always did |
| `trail_px` present on any leg | The trailing variant | Differs — see [order type strings](../../../integration/typed-data-signing.md#order-type-strings-and-the-trailing-fold) |

**Do not send `trail_px: 0` to mean "no trail".** Presence is what selects the
type string, so an explicit `0` is a *present* trail — it takes the trailing
digest and is then rejected `InvalidParams` (`trailing callback must be > 0`).
Omit the key.

The exact type strings, the per-leg `trailPxs` hash used by
[`batch_order`](#batch_order), and pinned known-answer digests are in
[typed-data signing → order type strings](../../../integration/typed-data-signing.md#order-type-strings-and-the-trailing-fold).

**Rejections.**

| Message | Cause |
|---|---|
| `trailing callback must be > 0` | `trail_px` present and `0` (or negative once widened). Omit the key instead |
| `a trailing trigger leg must be the stop-loss, not the take-profit` | The trailing leg fires on the wrong side of the mark for the position it guards |
| A signature-recovery failure (see [errors](../../errors.md)) | The digest was computed without the trailing fold while the wire carried `trail_px` |

---

### Place multiple orders in one signature {#batch_order}

N orders carried by ONE signed envelope / one nonce. Each entry is a full
[`submit_order`](#submit_order) order body (same fields, including per-order
`owner` / `cloid` / `builder`).

```json
{
  "type": "batch_order",
  "params": {
    "orders": [
      { "owner": "0x...aa", "market": 1, "side": "bid", "kind": "limit",
        "size": 1000, "limit_px": 5000, "tif": "gtc",
        "stp_mode": "cancel_oldest", "reduce_only": false },
      { "owner": "0x...aa", "market": 2, "side": "ask", "kind": "limit",
        "size": 2000, "limit_px": 6000, "tif": "gtc",
        "stp_mode": "cancel_oldest", "reduce_only": false }
    ],
    "grouping": "na"
  }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional **batch-level** owner the signer acts for (an approved agent / operator). Omitted = sender-authorized (the batch trades for the signer). Bound into the digest via a distinct type string |
| `orders[*]` | order | — | Each entry has the full `submit_order` order shape |
| `grouping` | enum | `"na"`, `"normalTpsl"`, `"positionTpsl"` | Order-family grouping; defaults to `"na"` if omitted |

:::warning
**Only `params.owner` routes a batch.** The per-leg `orders[*].owner` is required
by the schema but the server **ignores** it — it is not in the signed digest and
it does not authorize anything. Set the account you act for at `params.owner`.
:::

Returns an array of per-leg statuses (same union as `submit_order`) — **one entry
per leg**, in input order, each echoing its own `cloid`. A parked TP/SL leg gets
its own [`parked`](../exchange.md#statuses-parked) entry (**not live yet:** a live
node leaves it out, so the array is shorter than the request). A batch carries at
most **1000** orders; an empty `orders` array is rejected with
`INVALID_REQUEST`.

:::danger
**`grouping` decides whether the batch is atomic. Read this before you send
one.**

- **`grouping: "na"` — UNGROUPED, per-leg.** Each leg runs the full order gate
  on its own. A rejected leg does **not** roll back the others: the good legs
  rest, and the bad leg reports its failure in its own `statuses` entry, as an
  [error object](../exchange.md#per-order-statuses). Walk every entry.
- **`grouping` not `"na"` — GROUPED, ATOMIC.** `"normalTpsl"` and
  `"positionTpsl"` are all-or-nothing. If **any** leg cannot be admitted —
  including a protective leg that cannot park — the **whole action is
  rejected and nothing is placed**. The rejection is at the ACTION level: the
  response carries one `error` object and **no** `statuses` array to walk.

The grouped rule exists because the old per-leg behaviour could fill the entry
leg and fail the protective leg, and leave the position with no stop. A grouped
batch now either places the whole family or places nothing.
:::

#### `positionTpsl` — protective legs, and the scaled ladder {#position-tpsl-ladder}

`grouping: "positionTpsl"` parks protective legs against a position you already
hold. There is no entry order: **every** leg parks. The **LEG COUNT decides the
shape**, and the three shapes behave differently:

| Legs | Shape | What the parked rows carry |
|------|-------|----------------------------|
| 1 | A lone trigger | No `group` |
| 2 | An **OCO pair** — a fill of either leg cancels the other | No `group` |
| 3 or more | A scaled **LADDER**, NOT an OCO set | Every leg shares one `group` |

**The ladder is the new shape.** Its legs share a `group` handle — the `oid` of
the ladder's first parked leg — which every leg reports on
[`open_orders`](../info/orders-fills.md#open_orders) and
[`order_status`](../info/orders-fills.md#order_status). Group the rows by that value to render
one ladder as one control. Legs of a ladder are **not** OCO: a fill of one leg
does not cancel the others, which is the point of scaling out of a position in
steps.

**A ladder retires WHOLE.** It parks only against a live position, so the moment
that position is gone — by any close path, including a liquidation — every leg
of the ladder retires together on the next block. You do not have to cancel the
survivors yourself.

**A tpsl group is NOT leg-independent.** It is grouped, so it is atomic: one
leg that cannot park rejects the WHOLE action, at the action level, and parks
nothing. That is the opposite of `grouping: "na"`, where one bad leg leaves the
others resting.

Admission rules a ladder adds:

- **It needs an open position to close.** Three or more legs against a flat
  position are rejected `Precondition` (`a scaled tpsl ladder needs an open
  position to close`) — a ladder parked against nothing would die on the next
  block anyway.
- **Each leg infers its own fire direction against the mark.** A PAIR reads its
  two directions off the two leg prices and needs no mark; a lone leg and every
  ladder leg need an effective mark, and are rejected `Precondition` (`no mark
  price to infer the trigger direction`) without one.
- **The per-account parked-trigger cap still applies to every leg.** A ladder
  that crosses the governed cap is rejected whole, like any other grouped
  batch. No part of it parks.

One or two legs behave exactly as before. A caller that never sends three legs
sees no change at all.

---

### Cancel a single order by ID {#cancel_order}

Cancel a single order by `oid`. The cancel body is under `action.cancel`; `owner`
is the claimed account (recovered signer must equal it or be an approved agent).
For many cancels under one signature, use [`batch_cancel`](#batch_cancel).

```json
{
  "type": "cancel_order",
  "cancel": {
    "owner":  "0x00000000000000000000000000000000000000aa",
    "market": 3,
    "oid":    12345
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address | Claimed account; wire-only |
| `market` | uint32 | Asset/market id |
| `oid` | uint64 | Server order id (returned in the `submit_order` response). **Required** — a cancel with only `cloid` is rejected (`cancel requires an oid`); use [`cancel_by_cloid`](#cancel_by_cloid) instead |
| `cloid` | hex string \| null | Accepted on the wire but **not** used to cancel here |

**Idempotent**: cancel of an already-cancelled / already-filled order is refused with `ORDER_NOT_FOUND` and is harmless.

---

### Cancel multiple orders in one signature {#batch_cancel}

N cancels carried by one signed envelope. Each entry is a
[`cancel_order`](#cancel_order) cancel body (an `oid` is required per entry;
cloid-only entries are rejected).

```json
{
  "type": "batch_cancel",
  "params": {
    "owner": "0x...aa",
    "cancels": [
      { "owner": "0x...aa", "market": 1, "oid": 10 },
      { "owner": "0x...aa", "market": 2, "oid": 11 }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional **batch-level** owner the signer acts for (an approved agent). Omitted = sender-authorized (the batch cancels for the signer). **Digest-bound** when present |
| `cancels[*]` | cancel | Each entry has the full [`cancel_order`](#cancel_order) cancel shape |

:::warning
**Only `params.owner` routes a batch.** The per-entry `cancels[*].owner` is
required by the schema but the server **ignores** it — set the account you act
for at `params.owner`.
:::

Same per-entry response shape as `cancel_order`.

---

### Cancel an order by client ID {#cancel_by_cloid}

Cancel by client order id. Useful when the caller hasn't seen the server-side
`oid` yet (race between the `submit_order` response and a decision to cancel).
**Sender-authorized by default** — omit `owner` and the recovered signer is the
actor; an approved agent may cancel **as** an `owner` it acts for.

```json
{
  "type": "cancel_by_cloid",
  "params": {
    "asset": 7,
    "cloid": "0xabababababababababababababababab"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: cancel **as** this account (approved agents only). **Digest-bound** when present |
| `asset` | uint32 | Asset/market id |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes) |

Same response shape as `cancel_order`.

---

### Cancel all resting orders {#cancel_all_orders}

Cancel all of the sender's resting orders, optionally filtered to one asset.
**Sender-authorized by default**; an approved agent may cancel **as** an `owner`
it acts for.

```json
{
  "type": "cancel_all_orders",
  "params": { "asset": 3 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: cancel **as** this account (approved agents only). **Digest-bound** when present |
| `asset` | uint32 \| null | `null` / omitted = all assets; `Some(a)` = only asset `a` |

Returns a count of cancelled orders.

---

### Amend a resting order's price or size {#modify}

Amend a resting order's price and/or size. At least one of `new_px` /
`new_size` must be present. The target order is addressed **by `oid`** or **by
`cloid`** (the client order id the order was placed with) — send one or the other.
**Sender-authorized by default**; an approved agent may amend **as** an `owner`
it acts for.

```json
{
  "type": "modify",
  "params": {
    "market":   3,
    "oid":      12345,
    "new_px":   10049000000,
    "new_size": 100000000
  }
}
```

Address by `cloid` instead of `oid` (omit `oid`, or leave it `0`):

```json
{
  "type": "modify",
  "params": {
    "market":       3,
    "cloid":        "0xabababababababababababababababab",
    "new_px":       10049000000,
    "always_place": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: amend **as** this account (approved agents only). **Digest-bound** when present |
| `market` | uint32 | Asset/market id |
| `oid` | uint64 | Target order id. Defaults to `0` (= address by `cloid`) when omitted |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes). When set, the target is resolved by client order id (the same resolver [`cancel_by_cloid`](#cancel_by_cloid) uses) instead of `oid`. A malformed `cloid` is rejected at admission |
| `new_px` | uint64 \| null | New price in fixed-point tick units (`null` / omitted = unchanged) |
| `new_size` | uint64 \| null | New size in fixed-point tick units (`null` / omitted = unchanged) |
| `always_place` | bool | When `true`, a target that no longer rests is a best-effort no-op rather than a rejection. Defaults to `false` |

**The chain cancels the target and rests a replacement under a NEW `oid`.** The
amend is still atomic — a replacement the pre-trade gates reject restores the
original — but the order id changes on every successful amend. The replacement
keeps the original's `cloid`, `tif` and reduce-only flag, so a client that
tracks orders by `cloid` keeps its handle. A client that tracks by `oid` must
re-read [`open_orders`](../info/orders-fills.md#open_orders): nothing else carries the new id.

**The replacement can cross the book on placement, and that fill is recorded
nowhere.** See [unrecorded fills](../info/orders-fills.md#unrecorded-fills). A `modify` also
writes no [`historical_orders`](../info/account-history.md#historical_orders) transition at all —
not the fill, and not the replacement's rest — and no
[`order_updates`](../../ws/subscriptions.md#order_updates) message.

Returns a per-action ok / error verdict only. It carries no order id.

---

### Amend multiple orders in one signature {#batch_modify}

Apply N `modify`s under one signature. Each entry has the same shape as
`modify.params`.

```json
{
  "type": "batch_modify",
  "params": {
    "modifications": [
      { "market": 1, "oid": 5, "new_px": 100, "new_size": null },
      { "market": 2, "oid": 6, "new_px": null, "new_size": 7 }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional **batch-level** owner the signer acts for (an approved agent). Omitted = sender-authorized (the batch amends for the signer). **Digest-bound** when present |
| `modifications[*]` | modify | Each entry has the full [`modify`](#modify) params shape (`market`, `oid`, optional `new_px` / `new_size`) |

:::warning
**Only `params.owner` routes a batch.** A per-entry `owner` inside
`modifications[*]` is accepted by the schema but **ignored** — set the account
you act for at `params.owner`.
:::

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 3, "nonce": 1735689600001, "action_hash": "0x..." } }
```

**At commit** the entries are applied **in input order** and are **not
all-or-nothing**: each modify independently applies or errors with a reason
(the commit outcome carries one status per entry, in input order, plus the
applied count). The HTTP response carries no per-entry statuses — track the
commit via the returned `action_hash`. An empty `modifications` array is
rejected (`empty batch`); more than **1000** entries is rejected (throttled);
an entry with both `new_px` and `new_size` null errors (`nothing to modify`).

---

### Schedule a future cancel-all trigger {#schedule_cancel}

Arm a future-block cancel-all: at `cancel_at_block`, all the sender's open orders
are cancelled (a dead-man's switch). **Sender-authorized by default**; an
approved agent may arm it **as** an `owner` it acts for.

```json
{
  "type": "schedule_cancel",
  "params": { "cancel_at_block": 999 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: arm **as** this account (approved agents only). **Not** digest-bound — resolved at admission |
| `cancel_at_block` | uint64 | Block height at which the sender's open orders are cancelled |

---

### Schedule a sliced TWAP order {#twap_order}

:::danger
**`position_side` is REQUIRED on a hedge account and REFUSED on a one-way one.**
Get it wrong and the action is admitted to the mempool and then **rejected at
commit**:

| Account `position_mode` | `position_side` | Outcome |
|---|---|---|
| `"one_way"` | omitted | Accepted |
| `"one_way"` | sent | `one-way account cannot specify a position_side` |
| `"hedge"` | sent | Accepted. Every child slice inherits the leg |
| `"hedge"` | omitted | `hedge account requires an explicit position_side` |

**The rejection reaches you through no channel** — see
[`accepted` is not `committed`](../exchange.md#accepted-is-not-committed). The `202` body still
says `accepted: true`. Read `position_mode` from
[`account_state`](../info/account.md#account_state) BEFORE you submit.

**The field's PRESENCE also selects the signing string**, so it is not only an
admission rule — sign the payload you send. See
[typed-data signing](../../../integration/typed-data-signing.md).
:::

Schedule a sliced (time-weighted) order. The parent is sliced into `slice_count`
child orders spaced `delay_ms` apart. **Sender-authorized by default**; an
approved agent may schedule it **as** an `owner` it acts for.

```json
{
  "type": "twap_order",
  "params": {
    "market":      4,
    "side":        "ask",
    "total_size":  1000000000,
    "slice_count": 10,
    "delay_ms":    500,
    "reduce_only": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: schedule **as** this account (approved agents only). **Not** digest-bound — resolved at admission |
| `market` | uint32 | Perp market id or spot pair id — see [the spot lane](#twap_order-spot) |
| `side` | enum | `"bid"` / `"ask"` |
| `total_size` | uint64 | Total size in fixed-point tick units (widened to `u128`) |
| `slice_count` | uint32 | Number of child slices (`> 0`, and at most the governed slice ceiling — default `10000`) |
| `delay_ms` | uint64 | Inter-slice delay in ms. **Clamped UP** to the governed minimum, not rejected — see below |
| `reduce_only` | bool | — |
| `position_side` | enum \| omitted | `"long"` / `"short"`. **[Hedge mode](../../../concepts/hedge-mode.md) only** — required there, refused on a one-way account. Every child slice inherits it |
| `randomize` | bool \| omitted | Randomize the slice schedule. Omit or `false` keeps the fixed schedule, byte for byte — see below |

#### A spot pair {#twap_order-spot}

A spot pair id runs the TWAP on the spot book: each slice is an IOC through the
ordinary spot order path, priced off the base token's oracle mark rather than off
the touch.

**Three fields are REFUSED on a spot pair, not ignored:**

| Field | Refusal |
|---|---|
| `reduce_only: true` | `spot has no position to reduce: reduce_only is not supported` |
| `position_side` (any value) | `spot has no position side` |
| `randomize: true` | `spot twap does not support randomize` |

The whole action is rejected and no parent is created. The chain refuses rather
than dropping a field, because a dropped field still carries your signature — you
would be executing something you did not sign. Clear the field and re-sign.

**Two more refusals size the parent, and both judge ONE SLICE.** The WHY is the
same for both: the fire path floors each slice to the pair's lot grid and checks
it against the pair's min-notional floor, and a slice it cannot place still spends
its turn in the schedule. A parent whose every slice fails would therefore burn
its whole schedule and fill nothing, so it is refused at admission.

| Refusal | When |
|---|---|
| `slice below one lot` | `total_size / slice_count` floors to zero lots |
| `below min notional` | The pair carries `min_notional_cents` and ONE slice, priced at the reference mark, is worth less. **A total that clears the floor does not help** |
| `no mark price for spot twap admission` | The pair carries `min_notional_cents` but has no oracle index and no last trade, so the slice cannot be priced |

**A halt pauses a parent, it does not cancel it.** While the pair is delisted or
the global spot switch is on, `twap_order` is REFUSED (`spot trading disabled` or
`spot pair inactive`) and an EXISTING parent freezes: no slice fires and no
counter moves. It resumes where it stopped when the halt lifts. See
[A halted spot pair PAUSES](../../../concepts/order-types.md#synth-on-spot-halt).

Two further rules: the concurrent-parent limit below counts your perp and spot
parents **together**, and [`twap_cancel`](#twap_cancel) takes a spot parent's
`twap_id` with no wire change. Read
[The three on a spot pair](../../../concepts/order-types.md#synth-on-spot) before you
build for it.

**There is no `duration` and no USD-denominated size.** You choose `slice_count`
and `delay_ms` yourself. To place a TWAP that runs for a wall-clock window, divide
the window yourself — for a one-hour TWAP in 60-second slices, send
`slice_count: 60`, `delay_ms: 60000`.

**`randomize` trades predictability for jitter.** Omit it and the schedule is
exactly `slice_count` slices spaced `delay_ms` apart, with equal sizes — which is
predictable to anyone watching the tape. Send `randomize: true` and the chain
draws each slice size and each inter-slice delay from a digest over committed
inputs, so the schedule is harder to front-run. It stays deterministic: every
validator draws the same numbers, and the sizes still sum to `total_size`.
**`randomize: true` also selects its own signing string, whatever the leg** — so a
one-way randomized parent signs an empty `position_side`.

**The three governed limits.** All three are governance parameters, so read them
as defaults, not constants:

| Limit | Default | On breach |
|-------|---------|-----------|
| Minimum `delay_ms` | `10000` (hard floor `1000`) | **Clamped up** at registration. A smaller `delay_ms` is accepted and the parent runs at the floor, so the TWAP takes longer than you asked |
| Maximum `slice_count` | `10000` | Rejected at commit |
| Concurrent parents per account | `100` | Rejected at commit (throttled). ONE allowance: perp and spot parents count against the same number — see [the spot lane](#twap_order-spot) |

The clamp is a **snapshot**: the parent keeps the delay it was clamped to, so a
later governance retune never rewrites a TWAP already in flight.

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

**`accepted: true` is not a placed TWAP** — it means the action entered the
mempool. Every check above runs at COMMIT, and a commit-time rejection is
reported on no channel (see
[`accepted` is not `committed`](../exchange.md#accepted-is-not-committed)).

The parent `twap_id` (uint64) is assigned **at commit** from a deterministic
per-chain counter — it is **not** in the HTTP response, and the returned
`action_hash` cannot be looked up. Confirm the TWAP by its EFFECT: an
`activated` record on
[`user_twap_history`](../../ws/subscriptions.md#user_twap_history) carries the
`twapId`, and the parent appears on [`user_twaps`](../info/node.md#user_twaps). If
neither shows the parent within a few blocks, the action was rejected. Slice
fills ride [`user_twap_slice_fills`](../../ws/subscriptions.md#user_twap_slice_fills).

---

### Cancel a running TWAP order {#twap_cancel}

Cancel a running TWAP parent. Already-filled slices stay filled; future slices stop.
**Sender-authorized by default**; an approved agent may cancel **as** an `owner`
it acts for.

```json
{
  "type": "twap_cancel",
  "params": { "twap_id": 17 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: cancel **as** this account (approved agents only). **Digest-bound** when present |
| `twap_id` | uint64 | The TWAP parent id returned by `twap_order` |

**One cancel covers both order homes.** The id is enough: a
[spot parent](#twap_order-spot) cancels through this same
action with the same fields. There is no separate spot cancel and no market field
to get wrong.

---

### Place a scale ladder {#scale_order}

:::info
**Live on the hosted sandbox and on mainnet.** The scale ladder is active from
block 0 on chain `114514` and on chain `8964` — no vote, no activation height. A
node you run yourself under the default chain id `31337` starts with the feature
DORMANT: it must be armed by a validator vote first, and until then a
`scale_order` is rejected with `scale_order feature not active`.
:::

Place one **scale ladder** — a compact request that the node expands into `n`
resting limit rungs on one perpetual market, spread evenly across `[px_low,
px_high]`. You sign the compact request (about ten fields), not the rung array.
Every rung shares the one `cloid` you supply, which is the ladder handle for
[`cancel_scale`](#cancel_scale). The body is carried under `action.params`;
`owner` is optional (an approved agent / operator routes for the named account).

```json
{
  "type": "scale_order",
  "params": {
    "market":       7,
    "side":         "bid",
    "n":            5,
    "px_low":       9800000000,
    "px_high":      10000000000,
    "total_size":   500000000,
    "dist":         "flat",
    "weights":      [],
    "tif":          "alo",
    "reduce_only":  false,
    "stp_mode":     "cancel_oldest",
    "cloid":        "0x5c000000000000000000000000000001"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `market` | uint32 | `[0, market_count)` | Perpetual market id (identity-mapped to `AssetId`), or a spot pair id — see [the spot lane](#scale_order-spot) |
| `side` | enum | `"bid"` / `"ask"` | Ladder side. Rung `0` sits at `px_low` for **both** sides |
| `n` | uint32 | `2 … 100` | Rung count |
| `px_low` | uint64 | `> 0`, on-tick, `< px_high` | Low end of the ladder, in the `1e8` price plane |
| `px_high` | uint64 | on-tick | High end of the ladder, in the `1e8` price plane |
| `total_size` | uint64 | `> 0`, on-lot | Total base size across every rung, in raw lots |
| `dist` | enum | `"flat"` / `"lin_asc"` / `"lin_desc"` / `"custom"` | Size distribution across the rungs (see below) |
| `weights` | uint32 array | length `n` for `custom`; **empty** otherwise | Per-rung weights. Send an **empty** array for any non-`custom` `dist` — a non-empty array on a non-`custom` `dist` is rejected |
| `tif` | enum | `"alo"` / `"gtc"` | Time-in-force, uniform across rungs. `"ioc"` / `"aon"` are rejected (a ladder must rest) |
| `reduce_only` | bool | — | Uniform across rungs |
| `stp_mode` | enum | `"cancel_oldest"` / `"cancel_newest"` / `"cancel_both"` | Self-trade prevention, uniform across rungs. `"reject"` is rejected |
| `position_side` | enum \| null | `"long"` / `"short"` | **[Hedge mode](../../../concepts/hedge-mode.md) only**, uniform across rungs. Omit on a one-way account; send it on a hedge account |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes), **required** | The ladder handle. Every rung carries it. Must not already be in use by one of your resting orders on `market` |
| `owner` | hex address \| null | 40 hex chars | Optional: place **as** this account (approved agents only). **Digest-bound** when present. Omit for plain sender-authorized placement |

**Size distribution.** The node derives each rung's weight from `dist`, then
splits `total_size` in proportion (integer floor, with any leftover lots handed to
the low rungs first — the split is deterministic and conserves `total_size`
exactly):

| `dist` | Per-rung weight | Effect |
|--------|-----------------|--------|
| `flat` | equal | Same size on every rung |
| `lin_asc` | rises with rung index | Smallest at `px_low`, largest at `px_high` |
| `lin_desc` | falls with rung index | Largest at `px_low`, smallest at `px_high` |
| `custom` | your `weights[i]` | Each weight `≥ 1`; the array length must equal `n` |

**Admission** (the whole ladder is rejected, nothing rests, if any check fails):

- `2 ≤ n ≤ 100`.
- `px_low > 0`, `px_low < px_high`, both on the market tick grid.
- The span is wide enough for distinct rungs: `px_high − px_low ≥ (n − 1) ×
  tick`. Too narrow and the ladder is rejected (rungs would collide).
- `total_size > 0` and on the lot grid; every derived rung size is `≥ 1` lot. If
  a rung would round to zero, raise `total_size` or lower `n`.
- `custom`: `weights` length equals `n`, every weight `≥ 1`.
- `cloid` is not already carried by one of your resting orders on `market`.

**Per-rung placement.** The rungs are placed in order, rung `0` first, exactly as
the [`batch_order`](#batch_order) legs are — placement is **not** all-or-nothing.
Each rung runs the full order gate on its own: an `alo` rung that would cross the
book is rejected in its own slot, and once free collateral runs out the remaining
rungs are rejected while the earlier ones stay. The response echoes every rung's
exact price, size, and assigned `oid` (or its error), in rung order, so you get
the node-derived ladder back in one reply. You can also rebuild the ladder later
from [`open_orders`](../info/orders-fills.md#open_orders) filtered by the shared `cloid`.

**Seams to know:**

- **The ladder handle is reserved.** Every rung carries the one `cloid` you
  supply. A later single order that reuses it is refused at admission with
  `ORDER_DUPLICATE_CLOID`. Use a fresh handle per ladder — the SDKs tag ladder
  handles with a `0x5c` prefix. **Not live yet:** the reservation ships with the
  next node release. On a live node that reused order **joins** the group
  instead, and a later [`cancel_scale`](#cancel_scale) cancels it too.
- **A reduce-only ladder does not clamp per rung.** A resting order carries no
  reduce-only flag, so a reduce-only ladder whose `total_size` is larger than your
  net position over-rests: once the position closes, the extra rungs can open the
  opposite side. Size the ladder to your position.

#### A spot pair {#scale_order-spot}

A spot pair id builds the ladder on the spot book. Rung prices floor onto the
pair's tick grid and rung sizes onto its lot grid. Each rung runs the ordinary
spot admission on its own. `reduce_only: true` and `position_side` are both
refused. The shared-`cloid` seam above applies on the spot book too, and
[`cancel_scale`](#cancel_scale) then sweeps a spot pair. Read
[The three on a spot pair](../../../concepts/order-types.md#synth-on-spot) before you
build for it.

**A halt refuses the action.** While the pair is delisted or the global spot
switch is on, `scale_order` is REFUSED (`spot trading disabled` or `spot pair
inactive`). A scale keeps no parent, so rungs already resting are cancelled and
refunded like any other resting order. See
[A halted spot pair PAUSES](../../../concepts/order-types.md#synth-on-spot-halt).

:::caution Not live yet
With the next node release after 0.9.7, a rung the spot wallet cannot fund is refused
in that rung's own status (`insufficient spot balance`) and the earlier rungs stay.
Until then a live node accepts the unfunded rung as a no-op.
:::

---

### Cancel a scale ladder {#cancel_scale}

:::info
**Live on the hosted sandbox and on mainnet.** Same gate as
[`scale_order`](#scale_order).
:::

Cancel a **whole ladder** in one action — every one of your resting orders on
`market` that carries `cloid` is cancelled (cancel-all-by-`cloid`). This needs no
`oid` and no read-before-cancel round trip. The body is carried under
`action.params`; `owner` is optional (agent / operator routing).

```json
{
  "type": "cancel_scale",
  "params": {
    "market": 7,
    "cloid":  "0x5c000000000000000000000000000001"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `market` | uint32 | `[0, market_count)` | Perpetual market id or spot pair id the ladder rests on. A spot pair id sweeps a spot ladder — see [the spot lane](#scale_order-spot) |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes), **required** | The ladder handle to sweep |
| `owner` | hex address \| null | 40 hex chars | Optional: cancel **as** this account (approved agents only). **Digest-bound** when present |

**Semantics.** Only **resting** orders are swept. Rungs that already filled are
gone. A ladder with no live rungs left returns `order not found`. A cancel
by a signer who is not the owner is rejected.

**Seam — a parked trigger sharing the handle survives.** `cancel_scale` reaches
only the resting book. A parked [TP/SL trigger leg](#trigger-orders-stop_loss--take_profit)
that carries the same `cloid` is **not** swept, and can later fire into the group
after the ladder is gone. Keep trigger legs on their own `cloid`.

---

### Place a chase order {#chase_order}

:::info
**Live on the hosted sandbox and on mainnet.** The chase order type is active
from block 0 on chain `114514` and on chain `8964` — no vote, no activation
height. A node you run yourself under the default chain id `31337` starts with
the feature DORMANT: it must be armed by a validator vote first, and until then a
`chase_order` is rejected with `chase_order feature not active`.
:::

Place one **chase order** — a single resting post-only leg that the node
automatically re-prices to stay one tick inside the top of the book. You sign one
compact request; the node places the leg and re-prices it every eligible block, so
the quote tracks the best price with **no client round-trip**. The leg is
**post-only** — it always rests and never takes liquidity, so it never pays a
taker fee. The body is carried under `action.params`; `owner` is optional (an
approved agent / operator routes for the named account).

```json
{
  "type": "chase_order",
  "params": {
    "market":          7,
    "side":            "bid",
    "size":            100000000,
    "cloid":           "0x5c000000000000000000000000000002",
    "stp_mode":        "cancel_oldest",
    "interval_blocks": 4,
    "ttl_ms":          3600000,
    "max_reprices":    500
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `market` | uint32 | `[0, market_count)` | Perpetual market id (identity-mapped to `AssetId`), or a spot pair id — see [the spot lane](#chase_order-spot) |
| `side` | enum | `"bid"` / `"ask"` | `bid` = buy chase, `ask` = sell chase |
| `size` | uint64 | `> 0`, on-lot | Leg size in raw lots (`10^sz_decimals` per whole unit). A partial fill shrinks the leg; the next reprice re-places the remainder |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | Optional client handle. It is **re-stamped on every reprice** — correlate the leg across reprices by `cloid` |
| `stp_mode` | enum | `"cancel_oldest"` / `"cancel_newest"` / `"cancel_both"` / `"reject"` | Self-trade prevention, re-applied on every leg. All four values are accepted. The leg always rests strictly inside the spread, so self-trade prevention rarely fires |
| `position_side` | enum \| null | `"long"` / `"short"` | **[Hedge mode](../../../concepts/hedge-mode.md) only.** Omit on a one-way account; send it on a hedge account |
| `interval_blocks` | uint32 | `2 … 28800` | Reprice debounce: reprice at most once per this many **committed blocks**. The unit is blocks, not time — see [the cadence note](#chase_order-cadence) before you convert it to seconds |
| `ttl_ms` | uint64 | `60000 … 604800000` | Time-to-live in consensus milliseconds (1 min .. 7 days). When it elapses the leg is cancelled and the chase ends |
| `max_reprices` | uint32 | `1 … 100000` | Maximum reprices. When reached the leg is cancelled and the chase ends |
| `owner` | hex address \| null | 40 hex chars | Optional: place **as** this account (approved agents only). **Digest-bound** when present. Omit for plain sender-authorized placement |

**How the leg tracks the book.** The node pegs the leg one tick inside the touch:
a buy chase rests one tick above the best bid, a sell chase one tick below the best
ask, always kept strictly inside the spread so it can never cross. The peg ignores
your own resting orders on both sides, so a two-sided pair of your own chases both
track the real market and never cancel each other. Each eligible block the node
cancels the old leg and places a new leg at the fresh target — under the same
re-stamped `cloid` — so a client watching the account sees an ordinary cancel
followed by a new resting order.

#### Reprice cadence {#chase_order-cadence}

A reprice happens at most once per `interval_blocks` committed
blocks. A reprice that would cross the book, a book too thin to peg against, or a
market that is halted or has trading disabled **pauses** the leg at its current
price — the old leg keeps resting and the node retries on a later block. No reprice
ever takes liquidity.

**`interval_blocks` is blocks, not seconds — do not convert it.** The block
cadence is a **configured target the chain does not hold to**. It is a node
setting, it differs between deployments, and the rate the chain actually commits
at has measured well away from the configured value. So `2` blocks is not a fixed
number of milliseconds, and `28800` blocks is not a fixed number of hours. If you
need a wall-clock bound, **measure the chain**: sample the committed height twice
with a known gap and divide. Do not size a strategy off a number in a config file
or off any figure quoted in this reference.

`ttl_ms` is the one schedule bound that **is** denominated in time — consensus
milliseconds, `60000 … 604800000` (1 minute to 7 days). Use it, not
`interval_blocks`, when what you mean is a duration.

**The node also caps total reprice work per block.** All chases share one
per-block reprice budget. When a block's budget is spent, the legs still due wait
for the next block, so a busy chain can stretch your effective interval past
`interval_blocks`. The leg keeps resting at its old price meanwhile — nothing is
cancelled and nothing takes liquidity. Treat `interval_blocks` as a **floor** on
the gap between reprices, never as a guarantee.

**Termination.** The chase ends and its leg is cancelled when `ttl_ms` elapses or
`max_reprices` is reached. If the leg fills completely, or is cancelled by any
other path, the chase ends and is **not** re-placed. A partial fill keeps the chase
running on the remaining size.

**Admission** (the chase is rejected, nothing rests, if any check fails):

- `interval_blocks` in `2 … 28800`, else `chase interval_blocks must be in 2..=28800`.
- `ttl_ms` in `60000 … 604800000`, else `chase ttl_ms must be in 60000..=604800000`.
- `max_reprices` in `1 … 100000`, else `chase max_reprices must be in 1..=100000`.
- The market carries a positive tick / lot grid, else `chase market has no tick/lot grid` or `chase market tick_size must be positive`.
- `size > 0` and on the lot grid.
- Position mode matches (one-way omits `position_side`; hedge sends it).
- Under the caps: at most **5** active chases per account (`chase_cap`) and a global active-chase cap (`chase global cap reached`).
- The book is deep enough to peg against (`chase book too thin`) and the initial target does not cross the book (`chase target would cross the book`).
- The initial leg rests (`chase leg did not rest`).
- On a spot pair, your balance funds the initial leg, else `insufficient spot balance`. **Not live yet:** the refusal ships with the next node release after 0.9.7. Until then an unfunded spot leg answers `chase leg did not rest`.

**Response.** A `chase_order` is an order-type action, so it returns the per-order
`statuses` array. The success entry is a single-key `chase` object:

```json
{ "data": { "statuses": [ { "chase": { "chase_oid": "12345", "leg_oid": "12346", "leg_px": "6800000000", "cloid": "0x5c000000000000000000000000000002" } } ] } }
```

- `chase_oid` (decimal-digit string) — the stable **cancel handle**. It is **not** the leg's `oid`. **Parse it back to a `uint64` before you sign a [`cancel_chase`](#cancel_chase)**: every id on a RESPONSE is a string, and the signed request field stays a number.
- `leg_oid` (decimal-digit string) — the initial resting leg id. It is re-stamped on every reprice, so do not treat it as stable — correlate the leg by `cloid` instead.
- `leg_px` — the leg's placed price, a fixed-point integer string on the `1e8` plane.
- `cloid` — echoed only when the chase carried one.

A rejected chase returns the [rejection envelope](../exchange.md#rejection-envelope) — an `error` object, and no `data` key.

#### A spot pair {#chase_order-spot}

A spot pair id runs the chase on the spot book, pegged one tick inside the touch
the same way, with `position_side` refused. Two outcomes are spot-only: a reprice
that needs more free quote balance than you have is skipped without cancelling the
current leg, and a failed re-place retires the chase instead of restoring the old
leg. Read
[The three on a spot pair](../../../concepts/order-types.md#synth-on-spot) before you
build for it.

**A halt pauses a chase and KEEPS its escrow.** While the pair is delisted or the
global spot switch is on, `chase_order` is REFUSED (`spot trading disabled` or
`spot pair inactive`). An EXISTING chase is retained: the leg stays on the book
with its escrow still reserved, no reprice runs, and the reprice count does not
move. This is the one case where a halt does NOT refund a resting order — third
parties' orders on the pair ARE refunded. The escrow is never trapped:
[`cancel_chase`](#cancel_chase) works through the halt, and a `ttl_ms` or
`max_reprices` expiry during it still retires and refunds. See
[A halted spot pair PAUSES](../../../concepts/order-types.md#synth-on-spot-halt).

**Watching the chase.** There is **no chase-specific WS channel**. The initial
placement and every reprice surface on the existing per-account
[`order_updates`](../../ws/subscriptions.md#order_updates) stream and
[`open_orders`](../../ws/subscriptions.md#open_orders) snapshots as an ordinary cancel
plus a new resting order; leg fills surface on
[`fills`](../../ws/subscriptions.md#fills) and
[`order_updates`](../../ws/subscriptions.md#order_updates). Correlate reprices by `cloid`
(each reprice carries a new `leg_oid` under the same `cloid`); keep the `chase_oid`
from this response for [`cancel_chase`](#cancel_chase).

---

### Cancel a chase order {#cancel_chase}

:::info
**Live on the hosted sandbox and on mainnet.** Same gate as
[`chase_order`](#chase_order).
:::

Cancel one chase by its **handle** — the `chase_oid` returned by
[`chase_order`](#chase_order). This cancels the chase's current resting leg and
stops further reprices. The body is carried under `action.params`; `owner` is
optional (agent / operator routing).

```json
{
  "type": "cancel_chase",
  "params": {
    "market":    7,
    "chase_oid": 12345
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `market` | uint32 | `[0, market_count)` | The market the chase runs on — a perp market, or a spot pair — see [the spot lane](#chase_order-spot). Must match the chase's market |
| `chase_oid` | uint64 | a live chase handle | The **handle** from the `chase_order` response (the cancel key) — **not** the leg's `oid`. This is a SIGNED field, so it stays a number: the response gives you a decimal-digit string, and you parse it back |
| `owner` | hex address \| null | 40 hex chars | Optional: cancel **as** this account (approved agents only). **Digest-bound** when present |

**Semantics.** Only the account that owns the chase may cancel it. An unknown
handle, a wrong-owner handle, or a wrong-market handle all return
`order not found`. If the leg already filled or was cancelled out of band, the
handle still retires cleanly.

---
