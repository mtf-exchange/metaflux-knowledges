---
description: POST /info read queries for perpetual markets. They cover market state, order books, trades, funding, liquidation and perp deploy state.
---

# Perpetual queries {#post-info--perpetual-queries}

These `POST /info` queries return perpetual market data: market state, order books, trades, candles, funding and deploy state. They use the envelope and the conventions of the [base page](../info.md).

:::info
Every market-scoped read resolves the market by its `coin` symbol (`"BTC"`,
`"ETH"`, …). This includes `markets`, `markets_meta`, `l2_book`, `trades`,
`funding_history`, `active_asset_data` and the other market reads. The numeric
`asset_id` / `market_id` request arguments are removed. A request that sends
them and omits `coin` is rejected with `400 INVALID_REQUEST`. These market reads
echo the `coin` symbol in their responses.

The signed `/exchange` write path still addresses a market by a number. That
number is on the wire as [`markets_meta[*].signing_id`](#markets_meta). See
[`POST /exchange`](../exchange.md).
:::

## Perpetual query types {#perpetual-query-types}

### Current market state {#markets}

Returns the *dynamic* state of every registered market, and the spot pair and
token registry. Dynamic fields change every commit: the mark, oracle and mid
prices, the funding premium, open interest, the rolling 24-hour ticker and
`halted`. Each row also carries the `(coin, kind)` join keys.
[`markets_meta`](#markets_meta) serves the *static* metadata: precision grids,
leverage and margin ladders, the mark source and the trade-control flags. Join
the two reads on `(coin, kind)`.

**Request**

```json
{ "type": "markets" }
```

Filter to one product with `kind`, or to one market with `coin`. With neither
field, the read returns every section and every market:

```json
{ "type": "markets", "kind": "perp" }
{ "type": "markets", "coin": "BTC" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter. Absent: both sections. `"perp"`: the perp array only. `"spot"`: the spot section only. An unrecognized value is rejected with `400`, and the error names `perp` and `spot`. Before, the read ignored an unknown value, so a typo returned both sections with no diagnostic |
| `coin` | string | no | Market filter. Keeps only the row for this symbol. An unknown symbol answers `404 MARKET_NOT_FOUND` |

**Response**

The `data` payload is an object. It holds a `perp` array of dynamic rows and a
`spot` `{pairs, tokens}` object. `perp` rows are in ascending market id order.
`spot.pairs` / `spot.tokens` are in pair id and token id order.

This response is cut to one entry per list:

```json
{
  "data": {
    "type": "markets",
    "perp": [
      {
        "coin":            "BTC",
        "kind":            "perp",
        "mark_px":         "61521.1",
        "oracle_px":       "61529.3",
        "mid_px":          "61669.4",
        "impact_pxs":      ["61663.1", "61675.7"],
        "premium":         "0.0018587",
        "funding": {
          "rate_per_hr":     "20",
          "cap_per_hr":      "1120",
          "interval_ms":     3600000,
          "next_payment_ts": 1783011600000
        },
        "open_interest":   "0.02346",
        "day_ntl_vlm":     "3772.890084",
        "prev_day_px":     "61719.4",
        "change_24h":      "-0.00300293",
        "halted":          false
      }
    ],
    "spot": {
      "pairs": [
        {
          "signing_id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "active": true, "mark_px": "50000", "mid_px": "50000", "prev_day_px": null,
          "day_ntl_vlm": "0", "min_notional": "1", "taker_fee_bps": null,
          "circulating_supply": "0"
        }
      ],
      "tokens": [
        {
          "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6,
          "is_canonical": true, "evm_contract": null,
          "system_address": "0x80abd3bd8c42d2a279e4fa00f20bb30637734371",
          "token_id": "0xf23ea17597e324c04f842e6d8bfffe75636f0af88e7c7ab93ea755d9056396bc"
        }
      ]
    }
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `time` | uint64 | The block time of the read (consensus ms). The gateway anchors its 24-hour window on it |
| `perp[*].coin` | string | Market symbol, for example `"BTC"`. The join key |
| `perp[*].kind` | `"perp"` | Market kind, lowercase. The join key |
| `perp[*].mark_px` | Decimal string | On-book mark, human-decimal plane, tick-snapped. Falls back to the oracle. `"0"` if unset |
| `perp[*].oracle_px` | Decimal string | Index price, human-decimal plane, tick-snapped. `"0"` if unset |
| `perp[*].mid_px` | Decimal string | Order-book mid `(best_bid + best_ask) / 2`, human-decimal, tick-snapped. Omitted when the book is one-sided or empty |
| `perp[*].impact_pxs` | [Decimal string, Decimal string] | Depth-aware impact prices `[bid, ask]`. These are the book-walk prices for the funding impact notional, the same walk that the funding premium samples. Human-decimal, tick-snapped. Omitted when either side of the book cannot fill the impact notional |
| `perp[*].premium` | Decimal string \| null | Latest committed funding premium sample, signed. An 8-decimal string, truncated toward zero. `null` when there is none |
| `perp[*].funding.rate_per_hr` | bps string | The hourly funding rate that settlement would charge. It is the derived rate clamped to the per-asset cap, the same clamp that settlement applies. Decimal bps, with sub-bps precision. Before, it truncated to whole bps, so a rate below one bps served a `"0"` that did not mean "no funding". A `"0"` is now a true zero |
| `perp[*].funding.cap_per_hr` | bps string | Per-hour funding-rate cap, decimal bps |
| `perp[*].funding.interval_ms` | uint64 | Per-asset funding cadence (1h = `3600000`) |
| `perp[*].funding.next_payment_ts` | uint64 | Next aligned funding-settlement boundary, in epoch ms. `0` until the first sample |
| `perp[*].open_interest` | Decimal string | Current open interest, in size units |
| `perp[*].day_ntl_vlm` | Decimal string | 24h notional volume, whole USDC. A lower bound when the row carries `day_ntl_vlm_lower_bound_from`. See [below](#day-ntl-vlm-bound) |
| `perp[*].day_ntl_vlm_lower_bound_from` | uint64 \| absent | Consensus ms. Present only when `day_ntl_vlm` does not cover the whole 24h window. The volume then covers `[day_ntl_vlm_lower_bound_from, now]`. Absent when the figure is complete. Never `null` |
| `perp[*].prev_day_px` | Decimal string \| null | Price 24h ago. `null` if unknown |
| `perp[*].change_24h` | Decimal string \| null | 24h price change as a signed fraction. `null` when there is no prior price |
| `perp[*].halted` | bool | `true`: a governance delist stopped the market. An order that opens or extends a position is refused: `market delisted — only reduce-only / closing orders allowed`. A settled market also reads `true` |
| `perp[*].settled` | bool \| absent | `true`: the market is permanently closed. A delist closed every position on it. Every order is refused, reduce-only orders included: `market settled — trading closed`. The key is absent on every other market. It is never `false`. See [Delisting a perp market](../../../products/perpetuals.md#delisting) |
| `perp[*].settled_px` | Decimal string \| absent | Whole-USDC price at which every position closed. It is the price that the delist vote named, cut to 8 decimals, or the risk mark when the vote named none. Absent when no position was open at the delist, and on every market that is not settled |
| `spot.pairs` | array | Spot pair registry. The same rows as [the spot registry](./spot.md#spot_meta) `pairs`, plus current `mark_px` / `mid_px` / `day_ntl_vlm` |
| `spot.tokens` | array | Spot token registry. The same rows as [the spot registry](./spot.md#spot_meta) `tokens` |

**Rules**

- Test `settled` before `halted`. A settled market also reads `halted: true`.
  Only a halted market that is not settled accepts a closing order. A settled
  market never trades again, and no vote reopens it.
- `coin` narrows the same rows and does not change the shape. The response is
  still `{perp: [...], spot: {...}}`, with the arrays cut to the matching row. A
  client that wants one market makes one round trip and parses one shape.
- Each `perp` row is the dynamic half of a market. The static half is on
  [`markets_meta`](#markets_meta), joined on `(coin, kind)`. A row omits
  `mid_px` when the book is one-sided. It never sends `mid_px` as `null`. The
  real-time WS [`markets`](../../ws/subscriptions.md#markets) channel streams the same
  dynamic rows: a full snapshot on subscribe, then deltas for changed rows.
- The static per-market fields are not on this read: `sz_decimals`,
  `tick_size`, `step_size`, `min_order`, `max_leverage`, `maint_margin_ratio`,
  `init_margin_ratio`, `margin_tiers`, `strict_isolated`, `open` / `close`,
  `oi_cap`, `oi_cap_usd`, `oi_cap_bound`, `mark_source`, `fba_enabled`,
  `signing_id` and `risk_override`. Get them from
  [`markets_meta`](#markets_meta). For the meaning of the spot pair and token
  fields, see [the spot registry](./spot.md#spot_meta).

#### `day_ntl_vlm` as a lower bound {#day-ntl-vlm-bound}

Since [block 25,599,540](../../../changelog/block-25599540.md#tape-retirement-reads),
the node keeps no trade ring, so it holds no 24-hour window of its own. When a
figure cannot cover the whole 24 hours, the row says so. It carries
`day_ntl_vlm_lower_bound_from`, the oldest instant that the sum covers. The same
rule holds on a spot pair row.

- The gateway fills the figure from its own window. The gateway keeps a
  24-hour trade window for each market. When its data covers the whole 24
  hours, it serves the sum from that window in `day_ntl_vlm` and removes
  `day_ntl_vlm_lower_bound_from`. On a spot pair, it also serves the price of
  the first print in the window as `prev_day_px`.
- A gateway whose data starts later keeps the marker. After a gateway restart,
  its data can start inside the 24 hours. The gateway then serves its sum as a
  lower bound, with `day_ntl_vlm_lower_bound_from` at the oldest instant that
  its data covers. It leaves `prev_day_px` as the node sent it, because the
  first print that it holds is not a price from 24 hours ago.
- A marker at the time of the read means no window. The node serves `"0"` with
  `day_ntl_vlm_lower_bound_from` equal to `time`. When the gateway holds no
  window either, the row reaches you in that form. Read that `"0"` as no data.
  Never read it as a quiet market.
- A row that still carries the marker is a lower bound. Show it as "at least",
  or show no figure. Do not rank markets by it.

No field changes its type.

### Static market metadata {#markets_meta}

Returns the static metadata of every registered market, and the spot pair and
token registry. Static fields are long-lived. A market publishes them once and
seldom changes them: precision grids, leverage and margin ladders,
trade-control flags and the mark source. Each row also carries the
`(coin, kind)` join keys. This read is the static half of
[`markets`](#markets). Cache this half, and poll only the dynamic
[`markets`](#markets) half. The read takes the same optional `kind` and `coin`
filters.

**Request**

```json
{ "type": "markets_meta" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter. Absent: both sections. `"perp"`: the perp array only. `"spot"`: the spot section only. An unrecognized value is rejected with `400`, and the error names `perp` and `spot`. Before, the read ignored an unknown value, so a typo returned both sections with no diagnostic |
| `coin` | string | no | Market filter. Keeps only the row for this symbol. An unknown symbol answers `404 MARKET_NOT_FOUND` |

**Response**

The `data` payload is an object. It holds a `perp` array of static rows and the
same `spot` `{pairs, tokens}` object that [`markets`](#markets) returns. `perp`
rows are in ascending market id order.

This response cuts `perp` to one entry. The `spot` section is identical to
[`markets`](#markets):

```json
{
  "data": {
    "type": "markets_meta",
    "perp": [
      {
        "coin":               "BTC",
        "kind":               "perp",
        "sz_decimals":        5,
        "tick_size":          "0.1",
        "step_size":          "0.00001",
        "min_order":          "0.00001",
        "max_leverage":       50,
        "maint_margin_ratio": "1320",
        "init_margin_ratio":  "200",
        "margin_tiers": [
          { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
          { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
          { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
          { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
        ],
        "strict_isolated": false,
        "open":            true,
        "close":           true,
        "oi_cap":          "31.25",
        "oi_cap_usd":      "2500000",
        "oi_cap_bound":    "capacity",
        "max_market_order_ntl": "30.84",
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "signing_id":      0,
        "risk_override":   null,
        "token": {
          "id":                 101,
          "token_id":           "0x83bc…9894",
          "wei_decimals":       8,
          "is_canonical":       true,
          "circulating_supply": "0",
          "system_address":     "0x8c45…dd1b",
          "evm_contract": {
            "address":                "0x9b31…c5cc",
            "variant":                0,
            "evm_extra_wei_decimals": 0
          }
        }
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `perp[*].coin` | string | Market symbol. The join key |
| `perp[*].kind` | `"perp"` | Market kind, lowercase. The join key |
| `perp[*].sz_decimals` | uint8 | Size display decimals |
| `perp[*].tick_size` | Decimal string | Minimum price increment, human-decimal, for example `"0.1"` |
| `perp[*].step_size` | Decimal string | Minimum size increment (lot size), human-decimal |
| `perp[*].min_order` | Decimal string | Minimum order size, human-decimal |
| `perp[*].max_leverage` | uint8 | Maximum leverage: the top rung of the margin-tier ladder |
| `perp[*].maint_margin_ratio` | bps string | Base maintenance-margin ratio, decimal bps |
| `perp[*].init_margin_ratio` | bps string | Base initial-margin ratio, decimal bps |
| `perp[*].margin_tiers` | array | Leverage ladder banded by notional. Each tier is `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`. Bands have ascending upper bounds. `null` marks the unbounded top tier |
| `perp[*].strict_isolated` | bool | The market forces strict-isolated margin |
| `perp[*].open` / `close` | bool | Whether the market allows opening / closing. They state what is permitted. They do not state what is forbidden. A delist does not change them, so a halted or settled market can still read `true`. Read `halted` and `settled` on [`markets`](#markets) |
| `perp[*].oi_cap` | Decimal string | The open-interest cap that the chain enforces, in the size units of the market. On a native perp market, it is the lower of the governance-set cap and the capacity cap. On a deployer market, it is the cap of the deployer: the value that its deployer set with [`perp_set_oi_cap`](../exchange/deploy-perp.md#perp_set_oi_cap), or the governance default that it started at. A deployer market has no capacity cap, because the protocol backstop never takes its risk. Omitted only when no cap exists. It is never a made-up `"0"`. See [the capacity cap](#oi-cap-capacity) |
| `perp[*].oi_cap_usd` | Decimal string | USDC value of `oi_cap` at the committed risk mark: the mark clamped to the oracle band. Omitted with `oi_cap`, and when the market has no mark |
| `perp[*].oi_cap_bound` | `"voted"` \| `"capacity"` \| `"floor"` \| `"ceiling"` \| `"deployer"` | The source that set `oi_cap`. `"voted"`: the governance-set cap. `"capacity"`, `"floor"` and `"ceiling"` are the capacity cap: the capacity result, the floor or the ceiling. `"deployer"`: a deployer market, with the cap that its deployer set or the governance default that it started at. A deployer market never reads another value. Omitted with `oi_cap` |
| `perp[*].max_market_order_ntl` | Decimal string \| null | Remaining open-interest headroom on the whole market, in the size units of the market: `oi_cap − open_interest`, floored at `0`. `null`: the market is uncapped. `"0"`: the market is at its cap. The value is a size. The name says notional, but it is not a notional. An order whose new exposure is larger than this headroom takes the [at-cap rules](#oi-cap-capacity). See below |
| `perp[*].mark_source` | `"oracle_median"` \| `"sync_oracle"` \| `"custom"` | Mark-price source. It follows the committed mark mode. `"oracle_median"`: the default 3-component median. `"sync_oracle"`: the mark follows the oracle price directly. `"custom"`: the mark is frozen at a governance-set custom price |
| `perp[*].fba_enabled` | bool | Frequent batch auction is enabled for this market |
| `perp[*].signing_id` | uint32 | The number that you put in the EIP-712 `market` field when you sign an order for this market. It has no other meaning on the read plane. Do not use it as a sort key, a join key or a market identity. See below |
| `perp[*].risk_override` | object \| null | The governance risk override in force on this market, or `null` when the market runs on the defaults. See below |
| `perp[*].token` | object | The base token record of the market: the registry row for the coin that the market is written on. The key is omitted on a market that has no token record. It is never sent as `null`. See below |
| `spot.pairs` / `spot.tokens` | array | Spot pair / token registry, identical to [`markets`](#markets). See [the spot registry](./spot.md#spot_meta) |

**Rules**

- Each `perp` row is the static half of a market, joined to its dynamic
  [`markets`](#markets) row on `(coin, kind)`. None of the dynamic fields that
  change every commit appear here: `mark_px`, `oracle_px`, `mid_px`,
  `impact_pxs`, `premium`, `funding`, `open_interest`, `day_ntl_vlm`,
  `prev_day_px`, `change_24h`, `halted`, `settled` and `settled_px`.
- The open-interest fields move. `max_market_order_ntl` is derived from current
  open interest, so it changes on every fill. On a native perp market, `oi_cap`,
  `oi_cap_usd` and `oi_cap_bound` follow the
  [capacity cap](#oi-cap-capacity), which the chain recomputes every block. On
  a deployer market, `oi_cap` changes when its deployer sends
  [`perp_set_oi_cap`](../exchange/deploy-perp.md#perp_set_oi_cap). Do not cache
  these fields with the rest of the row. See below.
- For the meaning of the spot pair and token fields, see [the spot registry](./spot.md#spot_meta).

#### `max_market_order_ntl` headroom {#max_market_order_ntl}

The chain computes the headroom. Read the field. Do not subtract
[`markets`](#markets) `open_interest` from `oi_cap` yourself. That arithmetic
loses the two conventions that the served field carries.

- `null` means uncapped. It does not mean zero headroom. The arithmetic cannot
  produce it, because an uncapped row omits `oi_cap`. A client that reads a
  missing `oi_cap` as `0` computes a negative headroom. It then blocks every
  order on a market that has no limit. This inverse mistake is the worse one.
  Every native perp market has a [capacity cap](#oi-cap-capacity), so `null` is
  rare there. On a native market, `null` stays only when there is no
  governance-set cap and no capacity cap. That is a market that never had a
  mark, or any market while governance has the capacity cap switched off. A
  deployer market reads `null` when it has no cap: its deployer sent `0`, or
  the governance default is `0`.
- `"0"` means that the market is at its cap. The value is floored at `0` and
  never goes negative.
- The value is a size, although the name says notional. It is in the same
  units as `oi_cap` and `open_interest`, on the `sz_decimals` grid of the
  market. Do not divide it by a price.
- It is market-wide. It is the room left in the whole market. It is not a limit
  on your order. For your own per-order limit, read `max_trade_szs` on
  [`active_asset_data`](#active_asset_data).

`active_asset_data.max_trade_size` is the same number with another name. Both
fields hold the one headroom figure. Read the response that you already have.
The two never differ.

#### Capacity cap {#oi-cap-capacity}

:::info
**In effect since block 25,599,540.** Before that block, `oi_cap` was the
governance-set cap only. No market had one, so every market was uncapped. See
[the release notice](../../../changelog/block-25599540.md#oi-cap-capacity).
:::

The capacity cap applies to native perps only. A deployer market has no
capacity cap. Its deployer sets its cap with
[`perp_set_oi_cap`](../exchange/deploy-perp.md#perp_set_oi_cap), and
`oi_cap_bound` reads `"deployer"`. The governance cap vote does not apply to a
deployer market. The capacity cap measures what the backstops of the protocol
can pay. The Metaliquidity vault backstop never takes the risk of a deployer
market, so that measure does not apply to one. The rules under "At the cap"
below apply to every capped market, deployer markets included.

**Purpose.** A liquidation can leave a deficit. This happens when the price
moves past the maintenance margin before the close completes. The protocol
pays the deficit from money that it holds. The capacity cap limits open
interest to what that money can cover. The chain recomputes the cap every
block, from committed state only.

**Capacity.** The capacity of a market is the sum of these amounts, in whole USDC:

| Amount | Counts when |
|---|---|
| The market's [insurance fund](../../../concepts/tiered-liquidation.md#t4--the-deficit-waterfall) | Always |
| An equal share of the [Metaliquidity vault](../../../concepts/tiered-liquidation.md#mlp-first-bite) backstop: the room left under its equity-fraction bound, divided by the number of native perp markets | The vault backstop is enabled |
| The market's treasury reserve | The treasury reserve is configured |

ADL does not count. It takes gains back from winners. It is not money that the
protocol holds.

**Loss per unit of notional.** A position liquidates when its equity falls below
its maintenance margin. The price can move further before the close completes.
The loss per unit of notional is the largest such move, minus the smallest
maintenance margin ratio that the market allows on any tier:

- On an oracle-priced market, the move is two widths of the
  [oracle band](../../../concepts/contract-specifications.md#mark-price) of the
  risk mark. A trade on the book cannot push the risk mark past the band, but
  the risk mark can go from one edge of the band to the other.
- On a [self-priced market](../../../concepts/oracle-prices.md#self-priced-markets),
  the move is two index updates at the move band. One update takes the account
  below maintenance. The chain allows one more update for the close.
- The loss per unit is never less than 1%. This also applies when the move is
  not larger than the maintenance ratio.

**Formula.** Governance sets the share, the floor and the ceiling.

```text
target  = share × capacity ÷ loss per unit      whole USDC, toward zero
usd cap = target, clamped to [floor, ceiling]
oi_cap  = usd cap ÷ committed risk mark         size units, toward zero, at least one lot
```

If governance sets the floor above the ceiling, the ceiling applies.

| `oi_cap_bound` | Meaning |
|---|---|
| `"capacity"` | The target lies between the floor and the ceiling |
| `"floor"` | The target is below the floor. A market with little capacity shows this |
| `"ceiling"` | The target is above the ceiling |
| `"voted"` | The governance-set cap is not higher than the capacity cap, or it is the only cap |
| `"deployer"` | A deployer market. The cap is the one that its deployer set, or the governance default that it started at. The capacity cap does not apply |

**Cap movement.**

- A lower cap applies in the same block.
- A higher cap applies slowly. `oi_cap` grows by at most a governance-set
  percentage per hour, counted from the last change of the cap. A fast rise in
  capacity, or a fast fall of the mark, loosens the cap only at that rate.
- When the mark is stale, the chain keeps the previous cap.
- A governance-set cap only makes the cap tighter. The chain enforces the lower
  of the two.
- Governance can switch the capacity cap off. The governance-set cap then
  applies alone.

`oi_cap` is a size, so `oi_cap_usd` moves with the mark. After the mark falls,
`oi_cap_usd` can read below the floor until `oi_cap` catches up.

**At the cap.** The cap limits new exposure. It never closes a position.

- A cap below the current open interest does not change any position, balance
  or margin.
- The chain checks an order that opens, extends or flips a position when open
  interest is at or above the cap. It also checks such an order when its new
  exposure would take open interest past the cap. The error is `MARKET_OI_CAP`.
- On an oracle-priced market, the chain refuses a checked order that is priced
  through the committed mark: a bid above it or an ask below it. A passive
  checked order rests. The sweep below cancels it if the mark moves through it
  while the market is at the cap.
- On a self-priced market, the chain refuses every checked order.
- An order that can only close the position of its owner passes. The
  reduce-only flag alone does not make an order pass.
- At most once per second, on a market at or above its cap, the chain cancels
  each resting order that is priced through the committed mark: a bid above it
  or an ask below it. It keeps passive orders, and orders that can only close
  the position of their owner.

#### `signing_id` write handle {#signing_id}

Every read on this API keys a market by its `coin` symbol. The signed
`/exchange` write path does not. Its typed-data string is consensus-frozen at
`uint32 market`, so a signer must put a number there. `signing_id` is that
number. The read publishes it, so a client does not need to carry the value
out of band.

Use it in one place only: the `market` field of a typed action that you sign.
Do not treat it as the identity of the market. Read responses key by `coin`. A
client that joins on `signing_id` joins on the write plane. See
[typed-data signing](../../../integration/typed-data-signing.md).

#### Governance risk override {#risk_override}

A governance vote can replace the default risk parameters of this market. When
a vote did this, `risk_override` is an object that names the replaced values.
When no vote did, `risk_override` is `null`.

```json
"risk_override": {
  "max_leverage":       20,
  "maint_margin_ratio": "1660",
  "funding_rate_cap":   "0.04",
  "realized_vol_30d":   "0.4",
  "updated_at_block":   8103798,
  "liq_floor_ppm":      null,
  "liq_fee_bps":        null,
  "margin_tiers": [
    { "lower_bound_notional": "0", "max_leverage": 100, "maint_margin_ratio": "50" }
  ]
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `max_leverage` | uint8 | Leverage ceiling that the vote set |
| `maint_margin_ratio` | bps string | Maintenance-margin ratio, decimal basis points. The same plane as the top-level `perp[*].maint_margin_ratio` |
| `funding_rate_cap` | Decimal string | Per-interval funding clamp, a raw fraction (`"0.04"` = 4%) |
| `realized_vol_30d` | Decimal string | The 30-day realized volatility on which the vote priced the row, a raw fraction |
| `updated_at_block` | uint64 | Block height at which the vote wrote this row |
| `liq_floor_ppm` | uint \| null | Liquidation-price floor in parts per million. `null`: the vote set none |
| `liq_fee_bps` | Decimal string \| null | Liquidation-fee override, decimal bps. `null`: the vote set none |
| `margin_tiers` | array | The override ladder. Each tier is `{lower_bound_notional, max_leverage, maint_margin_ratio}`. `maint_margin_ratio` is a bps string on the same plane as everywhere else on this row |

:::info
`maint_margin_ratio` is in decimal basis points everywhere on this row.
`perp[*].maint_margin_ratio` and `perp[*].risk_override.maint_margin_ratio` are
the same rung on the same plane. A caller that reads either one as a raw
fraction computes a maintenance margin four orders of magnitude too small. It
then treats an unsafe position as safe.
[Ids and wire shapes](../../../changelog/ids-and-wire-shapes.md#one-plane)
records the change.
:::

The two `margin_tiers` ladders band on different keys.
`perp[*].margin_tiers` bands on `max_open_interest`, an ascending upper bound
with `null` on the top tier. `risk_override.margin_tiers` bands on
`lower_bound_notional`, an ascending lower bound with `"0"` on the first tier.
The bound runs the opposite way. That is the shape of the committed ladder, and
the plane change above does not unify it. A ladder walked with the wrong
comparison selects the wrong tier.

`init_margin_ratio` and `oi_cap` are not override keys. Neither appears inside
`risk_override` on any market. Read them from the top level of the same row.

Every key inside is optional. An override that moves only `max_leverage`
carries only `max_leverage`. An absent key is not overridden, and the market
default applies. The default is the sibling field on the same row. A key
present with `null` is a set field that holds "none". `liq_floor_ppm` and
`liq_fee_bps` both do this. Absent and `null` are different answers.

`null` and an empty object are different answers. `null` means that no
override exists. An object with no overridden keys means that an override
record exists and overrides nothing. Do not render the two the same way. This
field exists to end that confusion. A caller looks at the row of the market, so
the answer is on that row and not on a separate read.

#### Base token record {#markets_meta-token}

`token` is the token registry row for the coin that the market is written on.
It is the same record that the spot registry publishes. It is on this row so
that a perp client needs no second read.

| Field | Type | Meaning |
|-------|------|-------------|
| `token.id` | uint32 | Token registry id |
| `token.token_id` | string | 32-byte token hash, `0x` plus 64 hex characters |
| `token.wei_decimals` | uint8 | Base-unit decimals of the token |
| `token.is_canonical` | bool | Whether this is the canonical token for the symbol |
| `token.circulating_supply` | Decimal string | Circulating supply, whole units |
| `token.system_address` | string | The system address that holds the core-side balance of the token |
| `token.evm_contract` | object \| null | The EVM contract binding of the token, or `null` when the token has no EVM contract |
| `token.evm_contract.address` | string | Contract address on the unified EVM |
| `token.evm_contract.variant` | uint | Contract variant tag |
| `token.evm_contract.evm_extra_wei_decimals` | int | Decimal shift between the core plane and the EVM contract plane. Add it to `wei_decimals` to get the EVM-side decimals |

Absent and `null` are two different answers here:

- `token` absent: the market has no base token record. Some deployed markets
  are written on a symbol with no registry row. Read a missing `token` as "no
  record". Never read it as an empty record.
- `token.evm_contract` `null`: the token record exists and states that the
  token has no EVM contract. The key is present and holds `null`.

A client that treats the two the same reports a token that does not exist.

### Order book levels {#l2_book}

Returns the aggregated bid and ask levels of one market. By default, the book
has full depth at tick precision. A request can group the levels to a coarser
significant-figure price grid.

**Request**

```json
{ "type": "l2_book", "coin": "BTC" }
```

To group to a coarser grid:

```json
{ "type": "l2_book", "coin": "BTC", "n_sig_figs": 5, "mantissa": 5 }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol: a perp symbol (`"BTC"`) or a spot pair name (`"BTC/USDC"`). A spot pair renders its spot order-book depth in the tick and size planes of the pair |
| `n_sig_figs` | uint | no | Groups levels to this many significant figures, an integer from `2` to `5`. Absent: the full-depth, tick-precise book |
| `mantissa` | uint | no | Sub-step for `n_sig_figs: 5` only. One of `1`, `2`, `5`. The grid step is `mantissa ×` the 5-sig-fig step. Invalid with any other `n_sig_figs` |
| `n_levels` | uint | no | Depth cap for each side. Keeps only the best `n_levels` aggregated levels on each side. The cap applies after grouping, so a capped grouped book covers more raw depth. Absent: no cap |

**Response**

```json
{
  "data": {
    "type": "l2_book",
    "coin": "BTC",
    "bids": [ { "px": "61663.1", "sz": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "sz": "0.04862", "n_orders": 1 } ]
  }
}
```

Bids are best first, in descending price. Asks are in ascending price. Each
level holds the summed size and the `n_orders` count of resting orders. An
unknown or empty market returns empty `bids` / `asks` arrays.

| Field | Type | Meaning |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `bids[*].px` / `asks[*].px` | Decimal string | Level price, human-decimal, tick-snapped. The grouped grid price when the request sends grouping arguments |
| `bids[*].sz` / `asks[*].sz` | Decimal string | Summed size at the level, in whole units. The key is `sz`, not `size` |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Resting orders aggregated into the level |

**Errors**

- A missing `coin` answers `400 INVALID_REQUEST`.

**Rules**

- The gateway does the grouping. The node always serves the full-depth book,
  and the gateway applies `n_sig_figs` / `mantissa` to the response.
- Grouped levels round away from the spread. Bid prices round down (floor)
  onto the grid, and ask prices round up (ceil). A grouped level never shows a
  better price than the price at which its orders rest.
- The sizes of collapsed levels are summed. The total size of each side does
  not change.
- The gateway also applies the `n_levels` depth cap, counted over the
  aggregated levels.
- The gateway forwards a request without grouping or depth arguments unchanged,
  and the read returns the current book as it is.
- A bare node ignores the grouping and depth arguments. It returns full depth
  in both cases.

### Public trades {#trades}

Returns the public trade tape of one market. One read serves two requests.
Send `coin` alone for the recent window. Add `start_time` / `end_time` for a
time window.

:::info
`trades` is the only tape name. Two older names are removed: `recent_trades`
(no range) and `trades_by_time` (ranged). Both answer `400 UNKNOWN_TYPE`. Send
`trades` for both requests: `coin` alone for the recent window, `coin` plus
`start_time` / `end_time` for a ranged one.
:::

**Request**

```json
{ "type": "trades", "coin": "BTC" }
{ "type": "trades", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `limit` | uint32 | no | Caps the number of most recent records returned. Absent or `0`: no cap. It caps the answer after the merge of every source. The trim drops the oldest rows |
| `start_time` | uint64 | no | Window start, consensus ms, inclusive. Filters on trade `time`. Absent: open lower bound |
| `end_time` | uint64 | no | Window end, consensus ms, inclusive. Absent: open upper bound |

**Response**

```json
{
  "data": {
    "type": "trades",
    "coin":        "BTC",
    "last_trade":  1783001424768,
    "start_time":  null,
    "end_time":    null,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783001424768,
        "tid":   "17691615279761551171",
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `last_trade` | uint64 | Timestamp of the newest trade in this answer, `0` if none. The key is `last_trade`, not `last_trade_ms` |
| `start_time` / `end_time` | uint64 \| null | Echoed window bounds. `null` for a bound that you omitted |
| `trades[*].coin` | string | Market symbol on which the trade executed |
| `trades[*].side` | `"B"` / `"A"` | Taker (aggressor) side token. `"B"`: buy. `"A"`: sell |
| `trades[*].px` | Decimal string | Execution price in decimal USDC, human-readable |
| `trades[*].sz` | Decimal string | Filled size in base units, whole-unit |
| `trades[*].time` | uint64 | Trade timestamp (consensus ms) |
| `trades[*].tid` | decimal-digit string | Deterministic trade id, shared by both legs of the print. It is a 64-bit hash-derived value and often exceeds 2⁵³, so it is a string. A JSON number loses its low digits in JavaScript, and a `user_fills` to `trades` join by `tid` then matches nothing, with no error. Compare it as a string, or convert it with `BigInt` |
| `trades[*].block` | uint64 \| absent | Committed block height in which the trade settled. It locates the trade on-chain. Absent on a row whose source did not record it. See [below](#trades-archive) |
| `trades[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex. It traces a print on-chain. Empty string (`""`) when no signed taker action is behind the print: a system or begin-block print, or a maker leg whose submit hash is not carried |

**Rules**

- An un-ranged request returns records newest first: the newest trade is
  element 0. A ranged request returns them oldest first. An un-ranged request
  returns a recent window, not all history. An unknown or never-traded market
  returns `"trades": []` and `last_trade: 0`.

#### Deep history {#trades-archive}

Every request reaches the archive. The gateway merges three sources: the
bounded ring of the node, the 24-hour trade window of the gateway and the
archive. No `tid` appears twice. A ranged request reads the archive over its
window. An un-ranged request reads the newest prints of the archive, then trims
the merged answer to `limit`.

Since [block 25,599,540](../../../changelog/block-25599540.md#tape-retirement-reads),
the node keeps no trade ring. An un-ranged request that read only the node
would answer `"trades": []` for a market that trades.

Your parser does not change. The gateway relabels an archive record and a
gateway-window record to the shape above, so one parser reads every source.
Three fields read differently on a print that the archive or the gateway
window serves:

| Field | On a print from the archive or the gateway window |
|-------|----------------------------|
| `hash` | Absent. The key is omitted on purpose. On a node print, `""` is a real value: it says that there was no signed taker action. The trade table of the archive and the gateway window store no trace hash, which is a different fact. A `""` would report an unknown as a known. Treat a missing `hash` as "not recorded", and a `""` as "recorded, and there was none". A gateway-window row also has no `block` key |
| `last_trade` | The newest print in this answer. It is not the newest print of the market of all time |
| `time` at the leading edge | The archive reads the node stream on a poll interval (default 5 s), so the newest prints reach it late. A window that runs up to now can stop a few seconds before the true end of the tape. Ask again, or read the real-time [`trades` WS channel](../../ws/subscriptions.md#trades) for a sub-block tape |

A deployment with no archive has no history. On such a deployment, a ranged
request answers `"trades": []`, because the node keeps no trade ring.


### OHLCV candles {#candle_snapshot}

Returns historical price bars for `(coin, candle_type, interval)`. It is the
only candle query. The standalone `candle` type is removed. The archive serves
the bars when one is wired. Otherwise the read falls back to bars folded from
the real-time price stream. It is the REST companion of the real-time
[`candles`](../../ws/subscriptions.md#candles) WS channel.

`candle_type` selects the price series:

| `candle_type` | Series | Available on |
|---------------|--------|--------------|
| `mark` (**default**) | [Mark price](../../../concepts/mark-prices.md): the price at which positions mark | perp and spot markets |
| `oracle` | [Oracle index price](../../../concepts/oracle-prices.md) | perp markets only |
| `trade` | Executed-trade OHLCV, folded from prints | perp and spot markets |

:::warning
The three series are not interchangeable. One series never falls back to
another. An unknown `candle_type` is rejected. The read never answers it with a
different series, because a chart of the wrong price is a trading hazard.

A price bar and a trade bar differ in more than price. A price series has a bar
in every window that its samples cover. A trade series is sparse. A window with
no fill has no bar. It never gets a carried-forward bar. `v` / `n` also mean
different things. A price bar reports `v` as `"0"` with `n` as the sample count.
A trade bar carries real volume and a real trade count.
:::

#### Rejected inputs and quiet windows {#candle_snapshot-rejections}

An unknown `coin` and an unknown `interval` are each rejected with `400`.
Before, they answered `200` with an empty `candles` array. A quiet window gives
the same answer, so a typo in a symbol read as "this market did not trade".
[`l2_book`](#l2_book) already answered `404` for the same unknown coin, so the
two reads disagreed.

A quiet window still answers `200` with an empty array, and the `coverage`
envelope below says so. The two cases are now different answers. "You asked for
something that does not exist" is an error. "Nothing happened there" is data.

**Request**

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "candle_type": "mark", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol, for example `"BTC"`. An unknown coin is rejected with `400` |
| `interval` | string | yes | Bucket token: one of `1m`, `5m`, `15m`, `1h`, `4h`, `1d`. An unknown token is rejected with `400`, and the error names that set |
| `candle_type` | string | no | Series: `mark` (default), `oracle` or `trade`. Lower-case, exact match |
| `start_time` | uint64 | no | Window start (ms). Filters on bar open. Default `0` |
| `end_time` | uint64 | no | Window end (ms). Filters on bar open. Default unbounded |

**Response**

```json
{
  "data": {
    "type": "candle_snapshot",
    "coverage": {
      "start": 1788102000000,
      "end": 1788148800000,
      "reaches_newest": true
    },
    "candles": [
      {
        "t": 1788102000000,
        "T": 1788105599999,
        "s": "BTC",
        "i": "1h",
        "o": "78748",
        "c": "78778.1",
        "h": "78859.9",
        "l": "78591.4",
        "v": "0",
        "q": "0",
        "n": 0,
        "f": false
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `coverage.start` | uint64 \| null | Open time of the oldest bar in this answer. `null` when `candles` is empty |
| `coverage.end` | uint64 \| null | Open time of the newest bar in this answer. `null` when `candles` is empty |
| `coverage.reaches_newest` | bool | `true`: the answer runs to the newest bar that the store holds. `false`: newer bars exist that this answer does not include. The read proves it against the newest bar in the store, never against the `end_time` that you asked for. So a page that fully answers a past window still reads `false`. This makes "page until `reaches_newest`" stop at the leading edge and not at your own window |
| `t` | uint64 | Bar open timestamp (ms, bucket-aligned) |
| `T` | uint64 | Bar close timestamp (ms). Always `t + interval − 1`, on every bar from every source |
| `s` | string | Market symbol |
| `i` | string | Interval bucket token |
| `o` / `c` / `h` / `l` | Decimal string | Open / close / high / low price, as a whole-unit decimal string, for example `"78778.1"`. The same plane in which [`markets`](#markets) reports `mark_px` |
| `v` | Decimal string | Base-asset volume of the trade bucket at the open of this bar, joined at read time. A `mark` or `oracle` bar carries the same volume as its `trade` bar. Can be absent. See below |
| `q` | Decimal string | Quote volume of the same trade bucket. Can be absent. See below |
| `n` | uint64 | The trade count of that bucket. It is not a sample count on any series. Can be absent. See below |
| `f` | bool | Forward-filled flag. `true`: the bar carries the previous close forward and folded no new input. `false`: a real folded bar |

`coverage` reports the span of this answer. It tells you whether the series is
cut. Read `reaches_newest: false` as "keep paging forward". Never read it as
"the market stopped". With no folded coverage for a coin, the gateway can prove
nothing, so the flag stays `false`. The answer then reads as short, not as
current, and a stale chart never passes as current. `coverage.start` and
`coverage.end` are both `null` when `candles` is empty.

#### Trade volume on price bars {#candle_snapshot-volume-join}

**Correction.** An earlier version of this page said that `v` and `q` read
`"0"` on a `mark` or `oracle` bar, and that `n` was a sample count there.
Neither statement is true, and neither was true before. The serving layer folds
the price series for charting and joins the trade bucket of the same open. The
histogram under a mark chart is real traded volume. A bar with no proven trade
coverage omits all three keys. See below. The `trade` series carries its own
volume, from the same bucket.

#### Absent volume keys {#candle_snapshot-volume}

A bar folded from the real-time price and trade streams carries all three keys.

For a `trade` bar, durable history carries its own volume. The read serves `v`,
`q` and `n` for the whole range that the durable store covers, not only for the
recent window that the real-time fold holds. Deep history and volume come together.

For a `mark` or `oracle` bar, the read joins the volume from the trade bucket
of the same open. A durable bar outside that join omits all three keys, because
nothing measured that bucket.

The two answers mean opposite things:

- `"v": "0"` states "no trades in this bucket". It is a measured zero.
- An absent `v` states "no volume data for this bucket". Nothing was measured.

A `"0"` in the second case would put a false step from zero to real in the
series, so the read drops the key. Test for the key, not for a zero value. A
client that defaults a missing `v` to `0` charts a volume collapse that did not
happen.

All three states appear in one ordinary answer. A three-bar `mark` window can
hold a bar with real `v` / `q` / `n`, a bar with all three keys missing, and a
bar with `"0"` / `"0"` / `0`.

:::warning
Some bars carry extra `tn` and `tv` keys. Ignore them. They are passthrough
columns from the durable store. `tv` is not on the same plane as `v`: one
measured bar carried `"v": "0.09690"` next to `"tv": "92888"`. These keys are
not documented, they can be missing, and they do not replace `v` / `n`.

Read `v`, `q` and `n`. Treat any other key that looks like volume as absent.
:::

**Errors**

- A missing `coin` answers `400 INVALID_REQUEST`. A missing `interval` answers
  `400 INVALID_REQUEST`. An unknown `candle_type` answers
  `400 INVALID_REQUEST`. A rejected value is never served as another series.

**Rules**

- `trade` is accepted. All three tokens in the table above are active.
- Bars are in oldest-first order by `t` (open time). The newest element is the
  forming bar. A bar needs no trade. A price exists at all times, so the series
  covers every window that the samples cover. A market that never traded still
  has bars. A window with no sample carries the previous close forward as a flat
  bar (`o = h = l = c`, `n = 0`).
- An empty `candles` array is the true empty answer for a market with no history
  in that series. A request for `oracle` on a spot pair always answers empty,
  because a spot pair has no oracle price.

#### Bar cap and paging {#candle_snapshot-max-bars}

A response carries at most 500 bars. Above that, the answer keeps the 500 most
recent bars and drops the older ones. The caller chooses the window, and
without the cap the window has no bound. One request for years of `1m` bars
would fold and serialize a series of any size. A few such requests in parallel
can slow every other caller on the node.

The cap trims the old end. A default chart load asks for the recent window, and
the cap does not affect it. The cap applies only when you ask for more than 500
bars of your `interval`: about 8 hours at `1m`, or about 16 months at `1d`.

All history is reachable. To page back with `start_time` and `end_time`:

1. Take the oldest `t` that you received.
2. Ask again with `end_time` set to it.
3. Repeat.

Each page returns the 500 most recent bars inside the window that you named. A
wider `interval` reaches further per request.

:::warning
These bars come from a sampled price series. They do not follow the continuous
price path. The archived history samples each market price every 5 seconds of
block time. The real-time fallback folds one sample per price push.

- `o` and `c` are the first and last sample of the window.
- `h` and `l` are the highest and lowest sample of the window.

So `h` and `l` are the extremes of the samples. They are not the true extremes
of the price. A spike that starts and ends between two samples leaves no trace
in the bar.

Do not build wick analysis, liquidation-trigger reconstruction, or any
"did the price touch X?" test on these bars. They answer only "where was the
price at each sample". For a specific instant, read the price on
[`markets`](#markets) or use the trade tape.
:::

### Funding premium history {#funding_history}

Returns the funding premium samples of one market, from the premium ring.

**Request**

```json
{ "type": "funding_history", "coin": "BTC" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `start_time` | uint64 | no | Window start (ms). Filters on sample `ts` |
| `end_time` | uint64 | no | Window end (ms) |

**Response**

```json
{
  "data": {
    "type": "funding_history",
    "coin": "BTC",
    "source": "archive",
    "range_honored": true,
    "coverage": {
      "start": 1788145200064,
      "end": 1788148800041,
      "reaches_oldest": false
    },
    "samples": [
      { "ts": 1788145200064, "premium": "-0.0004297698662718041731241326", "funding_rate": "-0.0004281328157157344421589469" },
      { "ts": 1788148800041, "premium": "-0.0003715847511785635511176017", "funding_rate": "-0.00037488090540037165490589" }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `source` | string | The store that answered. `"archive"` for durable history. `"live_ring"` for the in-memory premium ring of the node |
| `range_honored` | bool | Whether the answer applied your `start_time` / `end_time`. `false`: the read ignored the window and returned the current ring |
| `coverage.start` | uint64 | Timestamp of the oldest sample in this answer |
| `coverage.end` | uint64 | Timestamp of the newest sample in this answer |
| `coverage.reaches_oldest` | bool | `true`: the answer reaches the oldest sample that the store holds. `false`: older samples exist that this answer does not include |
| `samples[*].ts` | uint64 | Sample timestamp (consensus ms). The key is `ts`, not `ts_ms` |
| `samples[*].premium` | decimal string | Raw funding premium sample, before the clamp. Signed |
| `samples[*].funding_rate` | decimal string | Realized rate: `premium` clamped to the per-asset cap. Signed |

#### Coverage fields {#funding_history-coverage}

The samples alone do not show whether you got the series that you asked for.
These three fields show it. A caller that charts funding must read them.

- `range_honored: false` means that the read did not apply your window. A
  window that the archive cannot answer does not come back empty. It falls back
  to the current ring, so the body holds samples at "now" and `source` reads
  `"live_ring"`. Ask for a window years in the past, and you still get 64
  samples from the last few minutes. A chart of them against your own axis puts
  recent samples in a historical slot. Check `range_honored` before you plot.
  The sample count never warns you.
- `reaches_oldest: false` means that the series is cut. It is not empty. Older
  samples exist. Page back with an earlier `end_time` to reach them. A chart
  that reads the first returned sample as the first sample of the market draws
  a start that never happened.
- `coverage` describes this answer. It does not describe the store. `start` /
  `end` are the span of the samples in this body.

**Errors**

- A missing `coin` answers `400 INVALID_REQUEST`.

**Rules**

- Samples are the ordered ring of premium snapshots from the funding tracker.
  `premium` is the exact pre-clamp `Decimal` as a string, signed, at full
  precision. `funding_rate` is that premium passed through the per-asset
  funding cap. It is the realized rate that settlement would charge. When the
  premium is within the cap, `funding_rate == premium`. Above the cap,
  `funding_rate` is clamped to the signed cap. An unknown or empty market
  returns `"samples": []`.

### Perp-deploy gas auction {#mip3_active_bids}

Returns a snapshot of the MIP-3 permissionless perp-deploy gas auction.

**Request**

```json
{ "type": "mip3_active_bids" }
```

No parameters.

**Response**

```json
{
  "data": {
    "type": "mip3_active_bids",
    "auction_round":   2,
    "current_bid":     "12345",
    "current_winner":  "0x<bidder>",
    "auction_end":  1700086400000,
    "started_at":   1700000000000,
    "bids": [
      {
        "bidder":       "0x<bidder>",
        "amount":       "12345",
        "submitted_at": 1700000000500,
        "tag":          "ETH-PERP"
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `auction_round` | uint64 | Current auction round |
| `current_bid` | decimal string | Leading bid amount |
| `current_winner` | hex address \| null | Current winning bidder, `null` if none |
| `auction_end` | uint64 | Auction close timestamp (consensus ms) |
| `started_at` | uint64 | Auction start timestamp (consensus ms) |
| `bids[*].bidder` | hex address | Bidder address |
| `bids[*].amount` | decimal string | Bid amount |
| `bids[*].submitted_at` | uint64 | Bid submission timestamp (consensus ms) |
| `bids[*].tag` | string | Bid tag, for example the proposed market name |

### `liquidatable` (removed) {#liquidatable}

This read no longer exists. A `{"type":"liquidatable"}` request answers `400`
with `error.code` `UNKNOWN_TYPE`.

There is no replacement read. No other read lists the flagged accounts. The
list named other accounts, so an account query cannot return it. Read your own
liquidation distance from the health fields of your own
[`account_state`](./account.md#account_state).

### Account trading limits {#active_asset_data}

Returns the leverage, margin mode and maximum trade size of one account on one
market.

**Request**

```json
{ "type": "active_asset_data", "address": "0x<addr>", "coin": "BTC" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `address` | hex address | yes | Account address |
| `coin` | symbol | yes | Market symbol |

**Response**

```json
{
  "data": {
    "type": "active_asset_data",
    "address": "0x<addr>", "coin": "BTC", "leverage": 50,
    "margin_mode": "cross", "mark_px": "61550.29664777",
    "max_trade_size": null, "max_trade_szs": ["0", "0"],
    "available_to_trade": ["0", "0"], "has_position": false
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `leverage` | uint32 | Position leverage if a position is open, else the account default, else the market maximum |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Effective margin mode |
| `mark_px` | decimal string | Current mark, human-decimal plane |
| `max_trade_size` | decimal string \| null | Open-interest headroom left on the whole market, in size units: `oi_cap − total_open_interest`, floored at `0`. `null` when the market has no cap. It is not a per-user limit. See below. [`markets_meta`](#markets_meta) serves the same number for each market as `max_market_order_ntl` |
| `max_trade_szs` | [decimal string, decimal string] | Size that the caller can still trade `[buy, sell]`, from the caller's own margin |
| `available_to_trade` | [decimal string, decimal string] | Notional that the caller can still open `[buy, sell]` |
| `has_position` | bool | Whether the account has a non-zero position on this market |

**Errors**

- A missing `address` answers `400 INVALID_REQUEST`. A missing `coin` answers
  `400 INVALID_REQUEST`.

#### Market-wide `max_trade_size` {#max-trade-size}

`max_trade_size` is the open-interest cap minus the total open interest of the
market. The total sums the positions of every account, not only the positions
of the caller. The chain refuses an OI-increasing order when total open
interest reaches the cap. So this field shows how much new exposure the whole
market can still take.

All accounts share this headroom and compete for it. Any other account can use
it in the next block, so the value is a snapshot. It is never a reservation.
Size an order against `max_trade_szs`, the limit of the caller. Treat
`max_trade_size` as the ceiling that all accounts compete for.

Two values need care:

- `null` means uncapped. The market has no OI cap, so no OI ceiling applies.
  Do not clamp an order to `0` here. A client that reads a missing number as
  "no size allowed" blocks trading on the markets that are most open.
- `"0"` means at the cap. The market is full, and the chain refuses an
  OI-increasing order now. A reducing order still works.

The cap is the open-interest cap that the chain enforces, the same number as
[`markets_meta`](#markets_meta) `oi_cap`. There is no fallback to a configured
default. A read must never show a ceiling that the chain does not enforce. So a
market with no cap reports `null` and does not borrow a global number. Every
native perp market has the [capacity cap](#oi-cap-capacity), so
`max_trade_size` is a number on such a market whenever it has a mark. On a
deployer market, it follows the cap that its deployer set.

`available_to_trade` and `max_trade_szs` are budgets from the free collateral
of the caller. They are side-aware and never negative. The reducing side is
larger, because a close of the open position releases its margin. They are an
estimate against a moving mark. Both fall when the mark moves against the
caller. Neither guarantees that the chain admits the order.

On a split `standard` account, the free collateral is the collateral of the
perp wallet, with no reservation cap. On a `standard` account that entered
before the split, the `perp` reservation also caps both figures.

### `margin_table` (removed) {#margin_table--removed}

:::warning
`margin_table` is removed. The margin ladder is now inline on each market
record as `margin_tiers`. Read it from [`markets_meta`](#markets_meta). Each
tier is `{max_open_interest: string|null, max_leverage: u8,
maint_margin_ratio: bps-string}`. Bands have ascending upper bounds, and `null`
marks the unbounded top tier. A `margin_table` request returns
`400 UNKNOWN_TYPE`.
:::

### Perp DEXs and limits {#perp_dexs}

Returns the perp DEXs, with the governance-set limits for permissionless deploy
(MIP-3) and for each market. The field names state the unit planes on purpose,
because the planes matter.

**Request**

```json
{ "type": "perp_dexs" }
```

No parameters.

**Response**

```json
{
  "data": {
    "type": "perp_dexs",
    "dexs": [
      { "index": 0, "name": "", "deployer": null,
        "n_assets": 5, "assets": ["BTC", "ETH", "SOL", "MTF", "PUMP"] },
      { "index": 1, "name": "GRAD", "deployer": "0x10572bc485ee62403eb8778c1303857d6f4f9913",
        "n_assets": 1, "assets": ["GRAD:000001SH"] }
    ],
    "limits": {
      "mip3_enabled":            true,
      "min_deploy_stake_base":   "100000000000",
      "min_deploy_stake_mtf":    "500000",
      "gas_auction_min_bid":     "100",
      "auction_duration_blocks": 1000,
      "deployer_fee_cap_bps":    "300",
      "dutch_start_multiplier":  "2",
      "per_market_limits": {
        "max_oi":            "1000000000000",
        "max_leverage":      50,
        "max_taker_fee_bps": "10.0",
        "max_oi_per_second": "10000000000"
      }
    }
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `dexs[*].index` | uint64 | DEX index in the perp-DEX registry. It is a position in a list. It is not a name. See below |
| `dexs[*].name` | string | The dex name. `""` for the core dex. 1 to 16 ASCII alphanumeric bytes, unique without regard to case. It is set once when the dex is created, and it never changes. It prefixes every market symbol on the dex (`NAME:SUFFIX`), and it keys [`clearinghouse_state`](./account.md#clearinghouse_state) |
| `dexs[*].deployer` | hex address \| null | The account that deployed the dex. `null` for the core dex. The core dex has no deployer, and `""` is a reserved name, not an address |
| `dexs[*].n_assets` | uint64 | Number of asset books in the DEX |
| `dexs[*].assets` | string[] | Market symbols in the DEX, for example `["BTC","ETH","SOL"]`. They are symbols, not ids. Every market read uses the symbol as its key |
| `limits.mip3_enabled` | bool | Permissionless (MIP-3) perp deploy is enabled |
| `limits.min_deploy_stake_base` | u128 string | Deployer self-stake floor, in MTF base units |
| `limits.min_deploy_stake_mtf` | Decimal string | Permissionless-deploy staking bond, in whole MTF. Governance sets it apart from `min_deploy_stake_base`. These are two thresholds, not one value on two planes |
| `limits.gas_auction_min_bid` | Decimal string | Deploy gas-auction minimum bid, whole-USDC |
| `limits.auction_duration_blocks` | uint64 | Gas-auction window length, in blocks |
| `limits.deployer_fee_cap_bps` | string | Ceiling on the per-market deployer fee share, a decimal string of whole basis points |
| `limits.dutch_start_multiplier` | Decimal string | Dutch-auction start-price multiplier over the minimum bid |
| `limits.per_market_limits.max_oi` | u128 string | The open-interest cap at which a deployer market starts when it activates with no cap, in whole units of the base asset. Its deployer can then change it with [`perp_set_oi_cap`](../exchange/deploy-perp.md#perp_set_oi_cap). Read the cap of the market from [`markets_meta`](#markets_meta) `oi_cap` |
| `limits.per_market_limits.max_leverage` | uint | Maximum leverage that a deployed market can offer |
| `limits.per_market_limits.max_taker_fee_bps` | bps string | Taker-fee ceiling for each market, decimal bps. The same render as [`fee_schedule`](./fees-credit.md#fee_schedule) |
| `limits.per_market_limits.max_oi_per_second` | u128 string | Open-interest growth-rate cap, in whole units of the base asset per second |

`per_market_limits` is global, and it is in whole units. The name says
per-market, but the values are one pair of numbers that applies to every perp.
For this reason they are not order sizes. An order size is an integer count of
lots. One lot is a different real quantity on each market, because each market
sets its own `sz_decimals`. So one shared lot count would mean a thousand times
more real size on a market with three size decimals than on a market with
none. These two limits are in whole units. The chain converts each one into the
size plane of a market when it applies it. Read `sz_decimals` from
[`meta`](./perpetuals.md) to convert a position or an order size. Do not apply
it to these two fields.

`name` is the join key. `index` is not. `clearinghouse_state` keys its position
buckets by `name`, so `name` is the one field that joins the positions of an
account to the dex that lists them. `index` is a subscript into this list. It
still answers, and it is stable today. No other read uses it as an identifier.
Do not key a cache on it.

The read serves `deployer` so that an old cache can be repaired. Before the
upgrade, `clearinghouse_state` keyed its buckets by the deployer address. An
integrator that cached those keys reads this list once and maps each address to
its `name`. That is the whole recovery. See [the dex key](./account.md#dex-key).


## See also {#see-also}

- [`POST /info`](../info.md): the base read endpoint, with the envelope, the conventions and the account and infrastructure queries
- [Spot & margin queries](./spot.md): the spot, spot-margin and Earn reads
- [Perpetuals](../../../products/perpetuals.md): the product
