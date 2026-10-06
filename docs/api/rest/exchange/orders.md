---
description: "Place, amend and cancel orders on a perpetual market: the single order, the batched forms, TWAP, scale ladders, chase legs and trigger orders."
---

# Perpetual order actions {#perpetual-order-actions}

These actions place, amend and cancel orders on perpetual markets through [`POST /exchange`](../exchange.md).

That page defines the request envelope, the EIP-712 signing rules, the number planes and the response shape. They apply to every action here.

The actions on this page act on a perp `market` id and use the shared CLOB. The [spot](./spot.md) and [spot margin](./spot-margin.md) trading actions have their own pages. Perp leverage and margin controls are under [Perpetual margin & risk actions](./margin-risk.md).

### Place a single order {#submit_order}

`submit_order` places one order. The order body sits under `action.order`. `owner` is the claimed account. The recovered signer must equal it or be an approved agent of it. To place many orders under one signature, use [`batch_order`](#batch_order).

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
| `owner` | hex address | 40 hex chars | The claimed account. It must equal the recovered signer or an approved agent of it. It is wire-only, and the node drops it on lowering |
| `market` | uint32 | `[0, market_count)` | Asset/market id (identity-mapped to `AssetId`) |
| `side` | enum | `"bid"` / `"ask"` | — |
| `kind` | enum | `"limit"` / `"market"` / `"stop_loss"` / `"take_profit"` | `limit` and `market` place a live order. `stop_loss` and `take_profit` are accepted only when a `trigger` block is also present. That pair parks one reduce-only TP/SL leg (see [trigger orders](#trigger-orders-stop_loss--take_profit)). A `stop_loss` or `take_profit` without a `trigger` block is rejected (`unsupported order kind`) |
| `trigger` | object \| null | — | An optional [trigger block](#trigger-orders-stop_loss--take_profit). If it is present on any `kind`, the `submit_order` parks one reduce-only TP/SL leg and places no live order. The shape is `{ "trigger_px": <u64>, "is_market": <bool>, "tpsl": "tp" \| "sl" }`. `is_market: true` fires a market (IOC) exit. `is_market: false` rests a limit exit at the order's `limit_px`. See [trigger orders](#trigger-orders-stop_loss--take_profit) |
| `size` | uint64 | `> 0` | Fixed-point tick units (widened to `u128`) |
| `limit_px` | uint64 | `> 0` | Fixed-point tick units (widened to `i128`) |
| `tif` | enum | `"gtc"`, `"ioc"`, `"alo"` | `"aon"` is rejected (`unsupported time-in-force`, no core equivalent) |
| `stp_mode` | enum | `"cancel_oldest"`, `"cancel_newest"`, `"cancel_both"` | `"reject"` is rejected (`unsupported stp_mode`, no core equivalent) |
| `reduce_only` | bool | — | If true, the commit rejects the order when it would grow the position |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | An optional client order id. It enables `cancel_by_cloid` and dedup |
| `builder` | object \| null | — | An optional [broker fee](../../../concepts/broker-codes.md), charged on top of the taker fee: `{ "fee": <bps u16>, "user": <0x-hex address> }`. The field keeps the `builder` name |
| `position_side` | enum \| null | `"long"` / `"short"` | [Hedge mode](../../../concepts/hedge-mode.md) only. It names the target leg of the order. Omit it on a one-way account (the default). Send it on a hedge account. The node rejects a one-way account that sends it and a hedge account that omits it. `reduce_only` is evaluated against the named leg only. See [hedge mode](#position_side-hedge-mode) below |

A `cloid` names exactly one order. Admission refuses a `cloid` that is already in use on this account with `ORDER_DUPLICATE_CLOID`. Use `cloid` as your client-side dedup key.

The check runs per leg. [`batch_order`](#batch_order) checks every leg that carries a `cloid`. [`scale_order`](#scale_order) checks its ladder handle. If two legs of one action share a `cloid`, the node refuses the whole action with the message `duplicate cloid within one action`. The action is one signature on one nonce, so no leg is admitted.

The rule exists because [`cancel_by_cloid`](#cancel_by_cloid) and [`order_status`](../info/orders-fills.md#order_status) by `cloid` both resolve the lowest `oid` that carries the handle. One `cloid` on two orders makes both orders unreachable.

An attempt that the commit refused gives its `cloid` back, so a re-signed retry can reuse the handle. The dedup set is admission-local and bounded, so the node can admit a very old `cloid` again. Committed-nonce uniqueness is the hard replay guard, not this set.

Common errors:

- `px` is not tick-aligned.
- `size` is below the market minimum.
- `reduce_only` would grow the position.
- `stp` rejected via STP.
- The account is in a T1+ liquidation tier.

Each order gets one status entry, in order. The full union is under [the 200 OK response](../exchange.md#200-ok--order-path-synchronous-oid).

```json
{"resting": {"oid": "12345", "cloid": "0x..."}}                     // posted to book
{"filled":  {"oid": "12345", "total_sz": "100000000", "avg_px": "10050000000"}}
{"error":   {"code": "ORDER_INVALID_PRICE", "message": "..."}}      // this entry was rejected
{"noop":    {"reason": "..."}}                                      // accepted, nothing to do — DO NOT RETRY
{"parked":  {"oid": "12345", "cloid": "0x..."}}                     // trigger leg accepted, and held off the book
{"pending": {"action_hash": "0x...", "nonce": 1735689600001}}       // admitted, no commit in the wait window
```

The `error` of a failed leg is the same error object that the envelope carries: `code`, `message`, and `details` when the rejection names a bound. Match on `code`, never on `message`. See [per-order statuses](../exchange.md#per-order-statuses).

#### Hedge mode position side {#position_side-hedge-mode}

The optional `position_side` field selects which leg an order applies to when the account is in [hedge mode](../../../concepts/hedge-mode.md).

- A one-way account (the default) omits `position_side`. The node rejects an order that sends it.
- A hedge account sends `position_side` on every order, as `"long"` or `"short"`. The node rejects an order that omits it.

The order names the leg. The node never infers the leg from `side`. So a `bid` that is meant to reduce a short cannot open or grow a long. When `reduce_only` is set, the node evaluates it against the named leg only. A `reduce_only` order on `short` cannot touch the `long` leg, and the reverse holds too. There is no implicit flip: closing the long leg never opens a short.

| `side` | `position_side` | `reduce_only` | Effect (hedge account) |
|--------|-----------------|---------------|------------------------|
| `bid` | `long` | false | Open / add to the long leg |
| `ask` | `long` | true | Reduce / close the long leg |
| `ask` | `short` | false | Open / add to the short leg |
| `bid` | `short` | true | Reduce / close the short leg |

To switch an account into hedge mode while it is flat, use [`set_position_mode`](./account.md#set_position_mode).

#### Trigger orders {#trigger-orders-stop_loss--take_profit}

A trigger order is a single protective leg: a stop-loss or a take-profit. You express it as a `submit_order` whose `order` body carries a `trigger` block. The presence of the block routes the order, not the `kind`. The node parks the order in the canonical trigger registry and does not send it to the book.

When the mark price crosses `trigger_px`, the leg fires in one of two ways:

- A reduce-only market exit (a slippage-bounded IOC).
- A reduce-only limit that rests at the order's `limit_px`, if `is_market: false`.

Both variants always reduce. A trigger never opens or grows a position.

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
| `trigger.trigger_px` | uint64 | `> 0` | The trigger price in fixed-point tick units (widened to `i128`). The mark crossing this price fires the leg. For a market trigger it is also the fired price. For a limit trigger it sets the fire direction only, and the resting price is `limit_px` |
| `trigger.is_market` | bool | — | Selects the fired exit. `true` is a market trigger: it fires a reduce-only slippage-bounded IOC. `false` is a limit trigger: it rests a reduce-only `gtc` limit at the order's `limit_px` (rules below) |
| `trigger.tpsl` | enum | `"tp"` / `"sl"` | The take-profit or stop-loss label, shown in [`/info`](../info/orders-fills.md#order_status). The fire direction comes from the leg `side` versus the mark, not from this label |
| `trigger.trail_px` | uint64 | `> 0`, optional | Optional. It makes the leg a trailing stop. It is the callback offset, in the same fixed-point tick units as `trigger_px`. The parked level ratchets toward the mark by this offset once per block and never away from it. It is signed: sending the key changes the EIP-712 type string and the digest, so omit it unless you want a trail. See [trailing stops](#trailing-stops) |

:::info
`is_market` controls the exit type. Before the upgrade, the field is a label only, and every trigger fires as a market IOC. After the upgrade, `is_market: false` selects the new limit trigger. A submit that omits `is_market` defaults to `false`. After the upgrade that is a limit trigger, so a market stop must send `is_market: true`. A limit trigger with `limit_px: 0` (or an omitted `is_market` plus `limit_px: 0`) is rejected `InvalidParams`.
:::

For a market trigger (`is_market: true`), the leg fires a reduce-only IOC on the mark cross. The mark band bounds the IOC, and the node clamps it to what actually reduces the position. `limit_px` is ignored. This is the only behavior before the upgrade.

For a limit trigger (`is_market: false`), the leg places a reduce-only `gtc` limit at the order's `limit_px` on the mark cross. That order rests on the book until it fills or you cancel it. Admission applies these rules to a limit trigger:

- `limit_px > 0`. A limit trigger with `limit_px: 0` is rejected `InvalidParams`.
- `tif` must be `gtc`. The node rejects `alo` and `ioc` on a limit trigger.
- `trigger_px` keeps every role: park price, fire direction and mark cross. `limit_px` is only the price of the resting order.

This limit-trigger example rests a reduce-only sell at `41000.00` once the mark crosses `42000.00`:

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

Trigger semantics:

- Reduce-only is forced. A trigger leg always closes, whatever the `reduce_only` wire value is. It never opens or grows a position.
- The leg `side` chooses what the leg protects. An `ask` trigger closes a long. A `bid` trigger closes a short. On a [hedge account](#position_side-hedge-mode), carry `position_side` to name the leg, as for a live order.
- A fired limit gets a new `oid`. At conversion the parked leg retires, and the node assigns a fresh `oid` to the new resting limit. Afterwards the parked `oid` reads terminal or unknown. The resting limit appears in [`open_orders`](../info/orders-fills.md#open_orders). The node does not carry `cloid` onto the fired order.
- A fired limit that rests persists until it fills or you cancel it through the normal path.
- The OCO collapse point differs by variant. A market trigger and its sibling collapse on the first fill. A limit trigger and its sibling collapse at conversion, the instant the node places the resting limit. They do not wait for a fill, because the live limit order is now the protection.
- A fired limit rests like any closing `gtc` order, and a resting order carries no reduce-only flag. On a one-way account, the position can shrink by other means before the limit fills. The eventual fill can then grow exposure the other way. A manual resting close order behaves the same way.

Admission returns the same per-order status union as a live `submit_order`. A trigger that parks reports through the order path. The eventual fire is a committed effect that you can observe on the [WS feed](../../ws/subscriptions.md) and in `/info`. For entry-plus-protective baskets with several legs, use [`batch_order`](#batch_order) with `grouping: "normalTpsl"` or `"positionTpsl"`.

#### Trailing stops {#trailing-stops}

:::tip
Live. The release that binds `trail_px` has shipped. The frozen EIP-712 type that carries `uint64 trailPx` runs in the node, and admission accepts the field. No fork gate guards either half. The signer picks the type by whether the field is present, so an order without it keeps the older digest unchanged.

The node enforces two rules. Both refuse the request and do not reinterpret it:

- `trail_px` must be greater than zero. Sending `0` is not the same as omitting it: `0` selects the trailing type string and then fails admission.
- A trailing leg must be the stop-loss. The node refuses a trailing take-profit. The ratchet moves the level toward the mark. On a take-profit it would move the level away from a winning position and fire at a price nobody asked for.
:::

A trigger leg becomes a trailing stop when its `trigger` block carries `trail_px`, the callback offset. The parked level then ratchets toward the mark by that offset, once per block, and never away from it.

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

The level that you sign is a floor, not the fire price. For the stop of a long, the level becomes `max(level, mark - trail_px)` on every mark update. It rises with a winning position and holds when the mark falls back. The leg fires at the ratcheted level. So [`open_orders`](../info/orders-fills.md#open_orders) and [`order_status`](../info/orders-fills.md#order_status) serve a `trigger_px` that differs from the one you sent. Read the served value as the current high-water level, and `trail_px` as the offset that produced it.

A trailing leg must be the stop-loss. The ratchet follows a winning position, so it only makes sense on the leg below a long (or above a short). A trailing take-profit would move its level away from the position and fire at a price nobody asked for, so the chain refuses it.

##### Trailing stop signing {#trailing-stops-signing}

`trail_px` moves where a position closes, so it is a control field. The signature must cover it. Otherwise a relay could add or strip it while the signature still verifies. The signature does cover it. Sending `trail_px` changes the EIP-712 type string and the digest. A client that computes the old digest and sends `trail_px` anyway gets its signature recovered to a different address, and the node rejects the action.

The rule is presence, not value. The [action expiry](../../../integration/typed-data-signing.md#action-expiry-expiresafter) uses the same fold.

| What you send | Type string | Digest |
|---|---|---|
| No `trail_px` key on any leg | The frozen one, unchanged | Byte-identical to the digest before this field existed. An older client signs exactly as it always did |
| `trail_px` present on any leg | The trailing variant | Differs. See [order type strings](../../../integration/typed-data-signing.md#order-type-strings-and-the-trailing-fold) |

Do not send `trail_px: 0` to mean "no trail". Presence selects the type string, so an explicit `0` is a present trail. It takes the trailing digest and then the node rejects it `InvalidParams` (`trailing callback must be > 0`). Omit the key.

The exact type strings, the per-leg `trailPxs` hash that [`batch_order`](#batch_order) uses, and the pinned known-answer digests are in [order type strings in typed-data signing](../../../integration/typed-data-signing.md#order-type-strings-and-the-trailing-fold).

Rejections:

| Message | Cause |
|---|---|
| `trailing callback must be > 0` | `trail_px` is present and `0` (or negative once widened). Omit the key instead |
| `a trailing trigger leg must be the stop-loss, not the take-profit` | The trailing leg fires on the wrong side of the mark for the position it guards |
| A signature-recovery failure (see [errors](../../errors.md)) | The client computed the digest without the trailing fold, while the wire carried `trail_px` |

---

### Place multiple orders in one signature {#batch_order}

`batch_order` places N orders under one signed envelope and one nonce. Each entry is a full [`submit_order`](#submit_order) order body, with the same fields, including the per-order `owner`, `cloid` and `builder`.

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
| `owner` | hex address \| omitted | 40 hex chars | An optional batch-level owner that the signer acts for (an approved agent or operator). If omitted, the batch is sender-authorized and trades for the signer. A distinct type string binds it into the digest |
| `orders[*]` | order | — | Each entry has the full `submit_order` order shape |
| `grouping` | enum | `"na"`, `"normalTpsl"`, `"positionTpsl"` | The order-family grouping. It defaults to `"na"` if omitted |

:::warning
Only `params.owner` routes a batch. The schema requires the per-leg `orders[*].owner`, but the server ignores it. It is not in the signed digest, and it authorizes nothing. Set the account that you act for at `params.owner`.
:::

The reply is an array of per-leg statuses, with the same union as `submit_order`. It has one entry per leg, in input order, and each entry echoes its own `cloid`. A parked TP/SL leg gets its own [`parked`](../exchange.md#statuses-parked) entry. A batch carries at most 1000 orders. The node rejects an empty `orders` array with `INVALID_REQUEST`.

:::danger
`grouping` decides whether the batch is atomic. Read this before you send a batch.

- `grouping: "na"` is ungrouped and per-leg. Each leg runs the full order gate on its own. A rejected leg does not roll back the others. The good legs rest, and the bad leg reports its failure in its own `statuses` entry, as an [error object](../exchange.md#per-order-statuses). Walk every entry.
- Any other `grouping` is grouped and atomic. `"normalTpsl"` and `"positionTpsl"` are all-or-nothing. If any leg cannot be admitted, the node rejects the whole action and places nothing. A protective leg that cannot park counts as such a leg. The rejection is at the action level: the response carries one `error` object and no `statuses` array to walk.

The grouped rule exists because the old per-leg behavior could fill the entry leg, fail the protective leg and leave the position with no stop. A grouped batch now places the whole family or places nothing.
:::

#### Position TP/SL and the scaled ladder {#position-tpsl-ladder}

`grouping: "positionTpsl"` parks protective legs against a position that you already hold. There is no entry order, and every leg parks. The leg count decides the shape, and the three shapes behave differently:

| Legs | Shape | What the parked rows carry |
|------|-------|----------------------------|
| 1 | A lone trigger | No `group` |
| 2 | An OCO pair. A fill of either leg cancels the other | No `group` |
| 3 or more | A scaled ladder, not an OCO set | Every leg shares one `group` |

The ladder is the new shape. Its legs share a `group` handle, the `oid` of the first parked leg of the ladder. Every leg reports it on [`open_orders`](../info/orders-fills.md#open_orders) and [`order_status`](../info/orders-fills.md#order_status). Group the rows by that value to show one ladder as one control. The legs of a ladder are not OCO. A fill of one leg does not cancel the others. That is the point of scaling out of a position in steps.

A ladder retires whole. It parks only against a live position. When that position is gone, by any close path including a liquidation, every leg of the ladder retires together on the next block. You do not cancel the survivors yourself.

A tpsl group is not leg-independent. It is grouped, so it is atomic. If one leg cannot park, the node rejects the whole action at the action level and parks nothing. `grouping: "na"` is the opposite: one bad leg leaves the others resting.

A ladder adds these admission rules:

- It needs an open position to close. Three or more legs against a flat position are rejected `Precondition` (`a scaled tpsl ladder needs an open position to close`). A ladder parked against nothing would die on the next block anyway.
- Each leg infers its own fire direction against the mark. A pair reads its two directions off the two leg prices and needs no mark. A lone leg and every ladder leg need an effective mark. Without one, the node rejects them `Precondition` (`no mark price to infer the trigger direction`).
- The per-account parked-trigger cap still applies to every leg. A ladder that crosses the governed cap is rejected whole, like any other grouped batch. No part of it parks.

One or two legs behave as before. A caller that never sends three legs sees no change.

---

### Cancel a single order by ID {#cancel_order}

`cancel_order` cancels one order by `oid`. The cancel body sits under `action.cancel`. `owner` is the claimed account. The recovered signer must equal it or be an approved agent of it. To cancel many orders under one signature, use [`batch_cancel`](#batch_cancel).

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
| `owner` | hex address | The claimed account. It is wire-only |
| `market` | uint32 | Asset/market id |
| `oid` | uint64 | The server order id, returned in the `submit_order` response. Required. The node rejects a cancel with only a `cloid` (`cancel requires an oid`). Use [`cancel_by_cloid`](#cancel_by_cloid) instead |
| `cloid` | hex string \| null | Accepted on the wire, but not used to cancel here |

The action is idempotent. A cancel of an order that is already cancelled or filled is refused with `ORDER_NOT_FOUND`, and this is harmless.

---

### Cancel multiple orders in one signature {#batch_cancel}

`batch_cancel` carries N cancels in one signed envelope. Each entry is a [`cancel_order`](#cancel_order) cancel body. Each entry needs an `oid`, and the node rejects cloid-only entries.

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
| `owner` | hex address \| omitted | An optional batch-level owner that the signer acts for (an approved agent). If omitted, the batch is sender-authorized and cancels for the signer. The digest binds it when present |
| `cancels[*]` | cancel | Each entry has the full [`cancel_order`](#cancel_order) cancel shape |

:::warning
Only `params.owner` routes a batch. The schema requires the per-entry `cancels[*].owner`, but the server ignores it. Set the account that you act for at `params.owner`.
:::

#### The batch_cancel reply {#batch_cancel-reply}

A committed `batch_cancel` answers `200` with the admission fields that every non-order action carries: `accepted`, `committed`, `nonce`, `action_hash` and `mempool_depth`. It also carries a `statuses` array with one entry per `cancels[*]` entry, in request order:

```json
{ "data": {
  "accepted": true, "committed": true, "nonce": 1735689600001,
  "action_hash": "0x...", "mempool_depth": 0,
  "statuses": [
    { "canceled": { "oid": "10" } },
    { "error": { "code": "ORDER_NOT_FOUND", "message": "precondition failed: order not found" } }
  ] } }
```

| Entry | Meaning | What to do |
|-------|---------|------------|
| `canceled` | The leg removed its order. `oid` is a decimal-digit string | Nothing. The order is gone |
| `error` | The node refused the leg, and it changed nothing. It is the same `{code, message, details?}` object as a [per-order `error`](../exchange.md#per-order-statuses) | Match on `code`. `ORDER_NOT_FOUND` means that the order is already gone, or the oid is wrong |

Each leg has its own entry because the legs run one by one, and a refused leg does not refuse the batch. So `committed: true` says only that the action committed. It does not say that every order is gone. Read `statuses` for that.

A leg that names a modified order answers `ORDER_NOT_FOUND`. A [`modify`](#modify) gives the order a new oid, so a leg that names the old oid finds no order.

Each `canceled` leg also pushes one [`order_updates`](../../ws/subscriptions.md#order_updates) record with `status: "canceled"`. A refused leg pushes nothing, because it changed nothing. Its reason is in this reply.

The fields `accepted`, `committed`, `nonce`, `action_hash` and `mempool_depth` keep their meaning, so a caller that reads only them keeps working. If the wait window expires before the commit, the reply is `202` with `committed: false` and no `statuses`. To learn which orders are gone, read [`open_orders`](../info/orders-fills.md#open_orders).

---

### Cancel an order by client ID {#cancel_by_cloid}

`cancel_by_cloid` cancels by client order id. Use it when the caller has not yet seen the server-side `oid`, for example in a race between the `submit_order` response and a decision to cancel. The action is sender-authorized by default: omit `owner` and the recovered signer is the actor. An approved agent can cancel as an `owner` that it acts for.

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
| `owner` | hex address \| omitted | Optional. Cancel as this account (approved agents only). The digest binds it when present |
| `asset` | uint32 | Asset/market id |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes) |

The response has the same shape as `cancel_order`.

---

### Cancel all resting orders {#cancel_all_orders}

`cancel_all_orders` cancels all resting orders of the sender, with an optional filter for one asset. The action is sender-authorized by default. An approved agent can cancel as an `owner` that it acts for.

```json
{
  "type": "cancel_all_orders",
  "params": { "asset": 3 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional. Cancel as this account (approved agents only). The digest binds it when present |
| `asset` | uint32 \| null | `null` or omitted cancels all assets. `Some(a)` cancels only asset `a` |

The reply is a count of cancelled orders.

---

### Amend a resting order's price or size {#modify}

`modify` amends the price, the size or both of a resting order. At least one of `new_px` and `new_size` must be present. You address the target order by `oid` or by `cloid` (the client order id that the order was placed with). Send one or the other. The action is sender-authorized by default. An approved agent can amend as an `owner` that it acts for.

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

To address the order by `cloid`, omit `oid` or leave it `0`:

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
| `owner` | hex address \| omitted | Optional. Amend as this account (approved agents only). The digest binds it when present |
| `market` | uint32 | Asset/market id |
| `oid` | uint64 | The target order id. It defaults to `0` (address by `cloid`) when omitted |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes). When set, the node resolves the target by client order id instead of `oid`, with the same resolver that [`cancel_by_cloid`](#cancel_by_cloid) uses. Admission rejects a malformed `cloid` |
| `new_px` | uint64 \| null | The new price in fixed-point tick units (`null` or omitted leaves it unchanged) |
| `new_size` | uint64 \| null | The new size in fixed-point tick units (`null` or omitted leaves it unchanged) |
| `always_place` | bool | When `true`, a target that no longer rests is a best-effort no-op and not a rejection. It defaults to `false` |

The chain cancels the target and rests a replacement under a new `oid`. The amend is still atomic: if the pre-trade gates reject the replacement, the node restores the original. But every successful amend changes the order id. The replacement keeps the `cloid`, `tif` and reduce-only flag of the original, so a client that tracks orders by `cloid` keeps its handle. A client that tracks by `oid` must read [`open_orders`](../info/orders-fills.md#open_orders) again, because nothing else carries the new id.

The replacement can cross the book when it is placed, and nothing records that fill. See [unrecorded fills](../info/orders-fills.md#unrecorded-fills). A `modify` also writes no [`historical_orders`](../info/account-history.md#historical_orders) transition at all: not the fill, and not the rest of the replacement. It also sends no [`order_updates`](../../ws/subscriptions.md#order_updates) message.

The reply is a per-action ok or error verdict only. It carries no order id.

---

### Amend multiple orders in one signature {#batch_modify}

`batch_modify` applies N `modify`s under one signature. Each entry has the same shape as `modify.params`.

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
| `owner` | hex address \| omitted | An optional batch-level owner that the signer acts for (an approved agent). If omitted, the batch is sender-authorized and amends for the signer. The digest binds it when present |
| `modifications[*]` | modify | Each entry has the full [`modify`](#modify) params shape (`market`, `oid`, optional `new_px` and `new_size`) |

:::warning
Only `params.owner` routes a batch. The schema accepts a per-entry `owner` inside `modifications[*]`, but the server ignores it. Set the account that you act for at `params.owner`.
:::

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 3, "nonce": 1735689600001, "action_hash": "0x..." } }
```

At commit, the node applies the entries in input order. The batch is not all-or-nothing. Each modify applies or errors with a reason on its own. The commit outcome carries one status per entry, in input order, plus the applied count. The HTTP response carries no per-entry statuses, so track the commit through the returned `action_hash`. The node rejects an empty `modifications` array (`empty batch`). It rejects more than 1000 entries (throttled). An entry with both `new_px` and `new_size` null errors (`nothing to modify`).

---

### Schedule a future cancel-all trigger {#schedule_cancel}

`schedule_cancel` arms a cancel-all at a future block, as a dead-man's switch. At `cancel_at_block`, the node cancels all open orders of the sender. The action is sender-authorized by default. An approved agent can arm it as an `owner` that it acts for.

```json
{
  "type": "schedule_cancel",
  "params": { "cancel_at_block": 999 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional. Arm as this account (approved agents only). The digest does not bind it. Admission resolves it |
| `cancel_at_block` | uint64 | The block height at which the node cancels the open orders of the sender |

---

### Schedule a sliced TWAP order {#twap_order}

:::danger
`position_side` is required on a hedge account and refused on a one-way account. If you get it wrong, the mempool admits the action and the commit then rejects it:

| Account `position_mode` | `position_side` | Outcome |
|---|---|---|
| `"one_way"` | omitted | Accepted |
| `"one_way"` | sent | `one-way account cannot specify a position_side` |
| `"hedge"` | sent | Accepted. Every child slice inherits the leg |
| `"hedge"` | omitted | `hedge account requires an explicit position_side` |

No channel reports the rejection. See [`accepted` is not `committed`](../exchange.md#accepted-is-not-committed). The `202` body still says `accepted: true`. Read `position_mode` from [`account_state`](../info/account.md#account_state) before you submit.

The presence of the field also selects the signing string. So it is more than an admission rule: sign the payload that you send. See [typed-data signing](../../../integration/typed-data-signing.md).
:::

`twap_order` schedules a sliced (time-weighted) order. The node slices the parent into `slice_count` child orders spaced `delay_ms` apart. The action is sender-authorized by default. An approved agent can schedule it as an `owner` that it acts for.

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
| `owner` | hex address \| omitted | Optional. Schedule as this account (approved agents only). The digest does not bind it. Admission resolves it |
| `market` | uint32 | A perp market id or a spot pair id. See [the spot lane](#twap_order-spot) |
| `side` | enum | `"bid"` / `"ask"` |
| `total_size` | uint64 | The total size in fixed-point tick units (widened to `u128`) |
| `slice_count` | uint32 | The number of child slices (`> 0`, and at most the governed slice ceiling, default `10000`) |
| `delay_ms` | uint64 | The delay between slices in ms. The node clamps it up to the governed minimum and does not reject it. See below |
| `reduce_only` | bool | — |
| `position_side` | enum \| omitted | `"long"` / `"short"`. [Hedge mode](../../../concepts/hedge-mode.md) only. It is required there and refused on a one-way account. Every child slice inherits it |
| `randomize` | bool \| omitted | Randomize the slice schedule. Omit it or send `false` to keep the fixed schedule, byte for byte. See below |

#### A spot pair {#twap_order-spot}

A spot pair id runs the TWAP on the spot book. Each slice is an IOC through the ordinary spot order path. The node prices it off the oracle mark of the base token, not off the touch.

The node refuses three fields on a spot pair. It does not ignore them:

| Field | Refusal |
|---|---|
| `reduce_only: true` | `spot has no position to reduce: reduce_only is not supported` |
| `position_side` (any value) | `spot has no position side` |
| `randomize: true` | `spot twap does not support randomize` |

The node rejects the whole action and creates no parent. It refuses the field and does not drop it, because a dropped field still carries your signature. You would execute something that you did not sign. Clear the field and sign again.

Two more refusals size the parent. Both judge one slice. The reason is the same for both. The fire path floors each slice to the lot grid of the pair and checks it against the min-notional floor of the pair. A slice that the node cannot place still spends its turn in the schedule. A parent whose every slice fails would burn its whole schedule and fill nothing, so admission refuses it.

| Refusal | When |
|---|---|
| `slice below one lot` | `total_size / slice_count` floors to zero lots |
| `below min notional` | The pair carries `min_notional_cents`, and one slice, priced at the reference mark, is worth less. A total that clears the floor does not help |
| `no mark price for spot twap admission` | The pair carries `min_notional_cents` but has no oracle index and no last trade, so the node cannot price the slice |

A halt pauses a parent and does not cancel it. While the pair is delisted or the global spot switch is on, the node refuses `twap_order` (`spot trading disabled` or `spot pair inactive`). An existing parent freezes: no slice fires, and no counter moves. It resumes where it stopped when the halt lifts. See [A halted spot pair PAUSES](../../../concepts/order-types.md#synth-on-spot-halt).

Two more rules apply. The concurrent-parent limit below counts your perp and spot parents together. [`twap_cancel`](#twap_cancel) takes the `twap_id` of a spot parent with no wire change. Read [The three on a spot pair](../../../concepts/order-types.md#synth-on-spot) before you build for it.

There is no `duration` and no USD-denominated size. You choose `slice_count` and `delay_ms` yourself. To run a TWAP over a wall-clock window, divide the window yourself. For a one-hour TWAP in 60-second slices, send `slice_count: 60` and `delay_ms: 60000`.

`randomize` trades predictability for jitter. If you omit it, the schedule is exactly `slice_count` slices of equal size, spaced `delay_ms` apart. Anyone who watches the tape can predict that schedule. If you send `randomize: true`, the chain draws each slice size and each delay between slices from a digest over committed inputs. The schedule is then harder to front-run. It stays deterministic: every validator draws the same numbers, and the sizes still sum to `total_size`. `randomize: true` also selects its own signing string, whatever the leg. So a one-way randomized parent signs an empty `position_side`.

Three governed limits apply. All three are governance parameters. Read the values as defaults, not constants:

| Limit | Default | On breach |
|-------|---------|-----------|
| Minimum `delay_ms` | `10000` (hard floor `1000`) | The node clamps it up at registration. It accepts a smaller `delay_ms`, and the parent runs at the floor, so the TWAP takes longer than you asked |
| Maximum `slice_count` | `10000` | The commit rejects it |
| Concurrent parents per account | `100` | The commit rejects it (throttled). Perp and spot parents count against the same number. See [the spot lane](#twap_order-spot) |

The clamp is a snapshot. The parent keeps the delay that it was clamped to, so a later governance retune never rewrites a TWAP that is already running.

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

`accepted: true` does not mean that a TWAP is placed. It means that the action entered the mempool. Every check above runs at commit, and no channel reports a commit-time rejection (see [`accepted` is not `committed`](../exchange.md#accepted-is-not-committed)).

The commit assigns the parent `twap_id` (uint64) from a deterministic per-chain counter. It is not in the HTTP response, and you cannot look up the returned `action_hash`. Confirm the TWAP by its effect. An `activated` record on [`user_twap_history`](../../ws/subscriptions.md#user_twap_history) carries the `twapId`, and the parent appears on [`user_twaps`](../info/node.md#user_twaps). If neither shows the parent within a few blocks, the node rejected the action. Slice fills arrive on [`user_twap_slice_fills`](../../ws/subscriptions.md#user_twap_slice_fills).

---

### Cancel a running TWAP order {#twap_cancel}

`twap_cancel` cancels a running TWAP parent. Slices that already filled stay filled, and future slices stop. The action is sender-authorized by default. An approved agent can cancel as an `owner` that it acts for.

```json
{
  "type": "twap_cancel",
  "params": { "twap_id": 17 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional. Cancel as this account (approved agents only). The digest binds it when present |
| `twap_id` | uint64 | The TWAP parent id that `twap_order` returned |

One cancel covers both order homes. The id is enough. A [spot parent](#twap_order-spot) cancels through this same action with the same fields. There is no separate spot cancel and no market field to get wrong.

---

### Place a scale ladder {#scale_order}

:::info
Live on the hosted sandbox and on mainnet. The scale ladder is active from block 0 on chain `114514` and on chain `8964`, with no vote and no activation height. A node that you run yourself under the default chain id `31337` starts with the feature dormant. A validator vote must arm it first. Until then, the node rejects a `scale_order` with `scale_order feature not active`.
:::

`scale_order` places one scale ladder. It is a compact request that the node expands into `n` resting limit rungs on one perpetual market, spread evenly across `[px_low, px_high]`. You sign the compact request (about ten fields), not the rung array. Every rung shares the one `cloid` that you supply. That `cloid` is the ladder handle for [`cancel_scale`](#cancel_scale). The body sits under `action.params`. `owner` is optional: an approved agent or operator routes for the named account.

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
| `market` | uint32 | `[0, market_count)` | The perpetual market id (identity-mapped to `AssetId`), or a spot pair id. See [the spot lane](#scale_order-spot) |
| `side` | enum | `"bid"` / `"ask"` | The ladder side. Rung `0` sits at `px_low` for both sides |
| `n` | uint32 | `2 … 100` | The rung count |
| `px_low` | uint64 | `> 0`, on-tick, `< px_high` | The low end of the ladder, in the `1e8` price plane |
| `px_high` | uint64 | on-tick | The high end of the ladder, in the `1e8` price plane |
| `total_size` | uint64 | `> 0`, on-lot | The total base size across every rung, in raw lots |
| `dist` | enum | `"flat"` / `"lin_asc"` / `"lin_desc"` / `"custom"` | The size distribution across the rungs (see below) |
| `weights` | uint32 array | length `n` for `custom`; empty otherwise | Per-rung weights. Send an empty array for any `dist` other than `custom`. The node rejects a non-empty array on a `dist` other than `custom` |
| `tif` | enum | `"alo"` / `"gtc"` | The time-in-force, uniform across rungs. The node rejects `"ioc"` and `"aon"`, because a ladder must rest |
| `reduce_only` | bool | — | Uniform across rungs |
| `stp_mode` | enum | `"cancel_oldest"` / `"cancel_newest"` / `"cancel_both"` | Self-trade prevention, uniform across rungs. The node rejects `"reject"` |
| `position_side` | enum \| null | `"long"` / `"short"` | [Hedge mode](../../../concepts/hedge-mode.md) only, uniform across rungs. Omit it on a one-way account. Send it on a hedge account |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes), required | The ladder handle. Every rung carries it. None of your resting orders on `market` may already use it |
| `owner` | hex address \| null | 40 hex chars | Optional. Place as this account (approved agents only). The digest binds it when present. Omit it for plain sender-authorized placement |

The node derives the weight of each rung from `dist`. It then splits `total_size` in proportion. The split uses an integer floor and gives any leftover lots to the low rungs first. It is deterministic and conserves `total_size` exactly.

| `dist` | Per-rung weight | Effect |
|--------|-----------------|--------|
| `flat` | equal | The same size on every rung |
| `lin_asc` | rises with rung index | Smallest at `px_low`, largest at `px_high` |
| `lin_desc` | falls with rung index | Largest at `px_low`, smallest at `px_high` |
| `custom` | your `weights[i]` | Each weight is `≥ 1`. The array length must equal `n` |

Admission rejects the whole ladder, and nothing rests, if any of these checks fails:

- `2 ≤ n ≤ 100`.
- `px_low > 0` and `px_low < px_high`, and both are on the market tick grid.
- The span is wide enough for distinct rungs: `px_high − px_low ≥ (n − 1) × tick`. If the span is too narrow, the rungs would collide, and the node rejects the ladder.
- `total_size > 0` and on the lot grid, and every derived rung size is `≥ 1` lot. If a rung would round to zero, raise `total_size` or lower `n`.
- For `custom`, the `weights` length equals `n`, and every weight is `≥ 1`.
- `cloid` is not already carried by one of your resting orders on `market`.

The node places the rungs in order, rung `0` first, as it places the legs of a [`batch_order`](#batch_order). Placement is not all-or-nothing. Each rung runs the full order gate on its own. An `alo` rung that would cross the book is rejected in its own slot. Once free collateral runs out, the node rejects the remaining rungs, and the earlier ones stay. The response echoes the exact price, size and assigned `oid` (or the error) of every rung, in rung order. So one reply gives you the ladder that the node derived. You can also rebuild the ladder later from [`open_orders`](../info/orders-fills.md#open_orders), filtered by the shared `cloid`.

Two seams need care:

- The ladder handle is reserved. Every rung carries the one `cloid` that you supply. Admission refuses a later single order that reuses it with `ORDER_DUPLICATE_CLOID`. Use a fresh handle for each ladder. The SDKs tag ladder handles with a `0x5c` prefix.
- A reduce-only ladder does not clamp per rung. A resting order carries no reduce-only flag. If the `total_size` of a reduce-only ladder is larger than your net position, the ladder over-rests. After the position closes, the extra rungs can open the opposite side. Size the ladder to your position.

#### A spot pair {#scale_order-spot}

A spot pair id builds the ladder on the spot book. Rung prices floor onto the tick grid of the pair, and rung sizes floor onto its lot grid. Each rung runs the ordinary spot admission on its own. The node refuses `reduce_only: true` and `position_side`. The shared-`cloid` seam above applies on the spot book too, and [`cancel_scale`](#cancel_scale) then sweeps a spot pair. Read [The three on a spot pair](../../../concepts/order-types.md#synth-on-spot) before you build for it.

A halt refuses the action. While the pair is delisted or the global spot switch is on, the node refuses `scale_order` (`spot trading disabled` or `spot pair inactive`). A scale keeps no parent. So the node cancels and refunds the rungs that already rest, like any other resting order. See [A halted spot pair PAUSES](../../../concepts/order-types.md#synth-on-spot-halt).

An unfunded rung fails alone. Each rung posts in ladder order and locks its own escrow. The node refuses a rung that the spot wallet cannot fund in the status of that rung (`insufficient spot balance`), and the earlier rungs stay.

---

### Cancel a scale ladder {#cancel_scale}

:::info
Live on the hosted sandbox and on mainnet. It has the same gate as [`scale_order`](#scale_order).
:::

`cancel_scale` cancels a whole ladder in one action. It cancels every resting order of yours on `market` that carries `cloid` (cancel-all-by-`cloid`). It needs no `oid` and no read-before-cancel round trip. The body sits under `action.params`. `owner` is optional (agent or operator routing).

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
| `market` | uint32 | `[0, market_count)` | The perpetual market id or spot pair id that the ladder rests on. A spot pair id sweeps a spot ladder. See [the spot lane](#scale_order-spot) |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes), required | The ladder handle to sweep |
| `owner` | hex address \| null | 40 hex chars | Optional. Cancel as this account (approved agents only). The digest binds it when present |

The action sweeps only resting orders. Rungs that already filled are gone. A ladder with no live rungs left returns `order not found`. The node rejects a cancel from a signer that is not the owner.

A parked trigger that shares the handle survives. `cancel_scale` reaches only the resting book. It does not sweep a parked [TP/SL trigger leg](#trigger-orders-stop_loss--take_profit) that carries the same `cloid`. That leg can later fire into the group after the ladder is gone. Keep trigger legs on their own `cloid`.

---

### Place a chase order {#chase_order}

:::info
Live on the hosted sandbox and on mainnet. The chase order type is active from block 0 on chain `114514` and on chain `8964`, with no vote and no activation height. A node that you run yourself under the default chain id `31337` starts with the feature dormant. A validator vote must arm it first. Until then, the node rejects a `chase_order` with `chase_order feature not active`.
:::

`chase_order` places one chase order. It is a single resting post-only leg that the node re-prices automatically to stay one tick inside the top of the book. You sign one compact request. The node places the leg and re-prices it on every eligible block, so the quote tracks the best price with no client round trip. The leg is post-only: it always rests and never takes liquidity, so it never pays a taker fee. The body sits under `action.params`. `owner` is optional: an approved agent or operator routes for the named account.

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
| `market` | uint32 | `[0, market_count)` | The perpetual market id (identity-mapped to `AssetId`), or a spot pair id. See [the spot lane](#chase_order-spot) |
| `side` | enum | `"bid"` / `"ask"` | `bid` is a buy chase. `ask` is a sell chase |
| `size` | uint64 | `> 0`, on-lot | The leg size in raw lots (`10^sz_decimals` per whole unit). A partial fill shrinks the leg, and the next reprice places the remainder again |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | An optional client handle. The node stamps it again on every reprice, so correlate the leg across reprices by `cloid` |
| `stp_mode` | enum | `"cancel_oldest"` / `"cancel_newest"` / `"cancel_both"` / `"reject"` | Self-trade prevention, applied again on every leg. The node accepts all four values. The leg always rests strictly inside the spread, so self-trade prevention rarely fires |
| `position_side` | enum \| null | `"long"` / `"short"` | [Hedge mode](../../../concepts/hedge-mode.md) only. Omit it on a one-way account. Send it on a hedge account |
| `interval_blocks` | uint32 | `2 … 28800` | The reprice debounce: reprice at most once per this many committed blocks. The unit is blocks, not time. Read [the cadence section](#chase_order-cadence) before you convert it to seconds |
| `ttl_ms` | uint64 | `60000 … 604800000` | The time-to-live in consensus milliseconds (1 minute to 7 days). When it elapses, the node cancels the leg and the chase ends |
| `max_reprices` | uint32 | `1 … 100000` | The maximum number of reprices. When the chase reaches it, the node cancels the leg and the chase ends |
| `owner` | hex address \| null | 40 hex chars | Optional. Place as this account (approved agents only). The digest binds it when present. Omit it for plain sender-authorized placement |

The node pegs the leg one tick inside the touch. A buy chase rests one tick above the best bid. A sell chase rests one tick below the best ask. The leg stays strictly inside the spread, so it can never cross. The peg ignores your own resting orders on both sides. So a two-sided pair of your own chases both track the real market and never cancel each other. On each eligible block, the node cancels the old leg and places a new leg at the fresh target, under the same re-stamped `cloid`. A client that watches the account sees an ordinary cancel followed by a new resting order.

#### Reprice cadence {#chase_order-cadence}

A reprice happens at most once per `interval_blocks` committed blocks. Three cases pause the leg at its current price:

- A reprice that would cross the book.
- A book that is too thin to peg against.
- A market that is halted or has trading disabled.

The old leg keeps resting, and the node retries on a later block. No reprice ever takes liquidity.

`interval_blocks` is blocks, not seconds. Do not convert it. The block cadence is a configured target that the chain does not hold to. It is a node setting, it differs between deployments, and the rate that the chain actually commits at has measured well away from the configured value. So `2` blocks is not a fixed number of milliseconds, and `28800` blocks is not a fixed number of hours. If you need a wall-clock bound, measure the chain: sample the committed height twice with a known gap and divide. Do not size a strategy off a number in a config file or off any figure quoted in this reference.

`ttl_ms` is the one schedule bound that has a time unit: consensus milliseconds, `60000 … 604800000` (1 minute to 7 days). When you mean a duration, use `ttl_ms` and not `interval_blocks`.

The node also caps the total reprice work per block. All chases share one per-block reprice budget. When a block spends its budget, the legs that are still due wait for the next block. A busy chain can therefore stretch your effective interval past `interval_blocks`. Meanwhile the leg keeps resting at its old price. Nothing is cancelled, and nothing takes liquidity. Treat `interval_blocks` as a floor on the gap between reprices, never as a guarantee.

The chase ends, and the node cancels its leg, when `ttl_ms` elapses or `max_reprices` is reached. If the leg fills completely, or any other path cancels it, the chase ends and the node does not place it again. A partial fill keeps the chase running on the remaining size.

Admission rejects the chase, and nothing rests, if any of these checks fails:

- `interval_blocks` is in `2 … 28800`, else `chase interval_blocks must be in 2..=28800`.
- `ttl_ms` is in `60000 … 604800000`, else `chase ttl_ms must be in 60000..=604800000`.
- `max_reprices` is in `1 … 100000`, else `chase max_reprices must be in 1..=100000`.
- The market carries a positive tick / lot grid, else `chase market has no tick/lot grid` or `chase market tick_size must be positive`.
- `size > 0` and on the lot grid.
- The position mode matches (one-way omits `position_side`, hedge sends it).
- The caps hold: at most 5 active chases per account (`chase_cap`) and a global active-chase cap (`chase global cap reached`).
- The book is deep enough to peg against (`chase book too thin`), and the initial target does not cross the book (`chase target would cross the book`).
- The initial leg rests (`chase leg did not rest`).
- On a spot pair, your balance funds the initial leg, else `insufficient spot balance`.

A `chase_order` is an order-type action, so it returns the per-order `statuses` array. The success entry is a single-key `chase` object:

```json
{ "data": { "statuses": [ { "chase": { "chase_oid": "12345", "leg_oid": "12346", "leg_px": "6800000000", "cloid": "0x5c000000000000000000000000000002" } } ] } }
```

- `chase_oid` (decimal-digit string) is the stable cancel handle. It is not the `oid` of the leg. Parse it back to a `uint64` before you sign a [`cancel_chase`](#cancel_chase). Every id on a response is a string, and the signed request field stays a number.
- `leg_oid` (decimal-digit string) is the id of the initial resting leg. The node stamps it again on every reprice, so it is not stable. Correlate the leg by `cloid` instead.
- `leg_px` is the placed price of the leg, a fixed-point integer string on the `1e8` plane.
- `cloid` is echoed only when the chase carried one.

A rejected chase returns the [rejection envelope](../exchange.md#rejection-envelope): an `error` object and no `data` key.

#### A spot pair {#chase_order-spot}

A spot pair id runs the chase on the spot book. The leg pegs one tick inside the touch in the same way, and the node refuses `position_side`. Two outcomes apply only to spot. A reprice that needs more free quote balance than you have is skipped, and the node does not cancel the current leg. A failed re-place retires the chase and does not restore the old leg. Read [The three on a spot pair](../../../concepts/order-types.md#synth-on-spot) before you build for it.

A halt pauses a chase and keeps its escrow. While the pair is delisted or the global spot switch is on, the node refuses `chase_order` (`spot trading disabled` or `spot pair inactive`). The node keeps an existing chase. The leg stays on the book with its escrow still reserved, no reprice runs, and the reprice count does not move. This is the one case where a halt does not refund a resting order. The node does refund the orders of third parties on the pair. The escrow is never trapped. [`cancel_chase`](#cancel_chase) works through the halt, and an expiry of `ttl_ms` or `max_reprices` during the halt still retires the chase and refunds it. See [A halted spot pair PAUSES](../../../concepts/order-types.md#synth-on-spot-halt).

No chase-specific WS channel exists. The initial placement and every reprice appear on the existing per-account [`order_updates`](../../ws/subscriptions.md#order_updates) stream and the [`open_orders`](../../ws/subscriptions.md#open_orders) snapshots, as an ordinary cancel plus a new resting order. Leg fills appear on [`fills`](../../ws/subscriptions.md#fills) and [`order_updates`](../../ws/subscriptions.md#order_updates). Correlate reprices by `cloid`: each reprice carries a new `leg_oid` under the same `cloid`. Keep the `chase_oid` from this response for [`cancel_chase`](#cancel_chase).

---

### Cancel a chase order {#cancel_chase}

:::info
Live on the hosted sandbox and on mainnet. It has the same gate as [`chase_order`](#chase_order).
:::

`cancel_chase` cancels one chase by its handle, the `chase_oid` that [`chase_order`](#chase_order) returned. It cancels the current resting leg of the chase and stops further reprices. The body sits under `action.params`. `owner` is optional (agent or operator routing).

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
| `market` | uint32 | `[0, market_count)` | The market that the chase runs on: a perp market, or a spot pair (see [the spot lane](#chase_order-spot)). It must match the market of the chase |
| `chase_oid` | uint64 | a live chase handle | The handle from the `chase_order` response (the cancel key), not the `oid` of the leg. The request signs this field, so it stays a number. The response gives you a decimal-digit string, and you parse it back |
| `owner` | hex address \| null | 40 hex chars | Optional. Cancel as this account (approved agents only). The digest binds it when present |

Only the account that owns the chase can cancel it. An unknown handle, a handle of the wrong owner and a handle of the wrong market all return `order not found`. If the leg already filled or something cancelled it out of band, the handle still retires cleanly.

---
