---
description: POST /info read queries for perpetual markets — market state, order books, trades, funding, liquidation, and perp deploy state.
---

# `POST /info` — perpetual queries

Read queries for **perpetual** markets. Same `POST /info` endpoint, envelope, and conventions as the [base page](../info.md) — these are the perp-market-specific `type`s.

:::info
**Markets are keyed by `coin` (symbol).** Every market-scoped read
(`markets`, `markets_meta`, `l2_book`, `trades`, `funding_history`,
`active_asset_data`, …) resolves the market by its **`coin`
symbol** (`"BTC"`, `"ETH"`, …). The legacy numeric `asset_id` / `market_id`
request arguments have been **removed** — a request that supplies them (and omits
`coin`) is rejected with `400 INVALID_REQUEST`. These market reads
echo the `coin` symbol in their responses.

The signed `/exchange` write path still addresses a market by a **number**, and
that number is on the wire as [`markets_meta[*].signing_id`](#markets_meta) — see
[`POST /exchange`](../exchange.md).
:::

## Perpetual query types {#perpetual-query-types}

### Get live state for all markets {#markets}

Every registered market's **live (dynamic)** state — the per-commit fields that
move every block (mark / oracle / mid price, funding premium, open interest, the
rolling-24h ticker, `halted`) plus the `(coin, kind)` join keys — together with
the spot pair/token registry. The long-lived **static** metadata (precision grids,
leverage / margin ladders, mark source, trade-control flags) is served separately
by [`markets_meta`](#markets_meta), joined on `(coin, kind)`.

**Request**

```json
{ "type": "markets" }
```

Filter to one product with `kind`, or to one market with `coin` (both absent ⇒
every section, every market):

```json
{ "type": "markets", "kind": "perp" }
{ "type": "markets", "coin": "BTC" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter — absent = both; `"perp"` = the perp array only; `"spot"` = the spot section only. **An unrecognized value is rejected `400`**, naming `perp` and `spot`. It used to be ignored, so a typo quietly returned BOTH sections — a superset, with no diagnostic |
| `coin` | string | no | Market filter — keep only the row for this symbol. Unknown symbol → `404 MARKET_NOT_FOUND` |

**Response**

The `data` payload is an **object** with a `perp` array (each a **dynamic** row)
and a `spot` `{pairs, tokens}` object. `perp` rows are ordered deterministically by
ascending market id; `spot.pairs` / `spot.tokens` in pair-/token-id order.

Response (truncated to one entry per list):

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
| `perp[*].coin` | string | Market symbol, e.g. `"BTC"` (the join key) |
| `perp[*].kind` | `"perp"` | Market kind (lowercase, join key) |
| `perp[*].mark_px` | Decimal string | On-book mark, **human-decimal plane**, tick-snapped (oracle fallback; `"0"` if unset) |
| `perp[*].oracle_px` | Decimal string | Index price, human-decimal plane, tick-snapped (`"0"` if unset) |
| `perp[*].mid_px` | Decimal string | Order-book mid `(best_bid + best_ask) / 2`, human-decimal, tick-snapped; **omitted** when one-sided / empty |
| `perp[*].impact_pxs` | [Decimal string, Decimal string] | Depth-aware impact prices `[bid, ask]` — the book-walk prices for the funding impact notional (the same walk the funding premium samples), human-decimal, tick-snapped; **omitted** entirely when either side of the book cannot fill the impact notional |
| `perp[*].premium` | Decimal string \| null | Latest committed funding premium sample (signed), an **8-decimal** string (truncated toward zero); `null` when none |
| `perp[*].funding.rate_per_hr` | bps string | The hourly funding rate that would be **charged** — the derived rate clamped to the per-asset cap (the same clamp settlement applies), decimal bps. It carries **sub-bps precision**: it used to truncate to whole bps, so a rate below one bps served `"0"`, and that `"0"` did NOT mean "no funding". A `"0"` is now a true zero |
| `perp[*].funding.cap_per_hr` | bps string | Per-hour funding-rate cap, decimal bps |
| `perp[*].funding.interval_ms` | uint64 | Per-asset funding cadence (1h = `3600000`) |
| `perp[*].funding.next_payment_ts` | uint64 | Next aligned funding-settlement boundary (epoch-ms); `0` until the first sample |
| `perp[*].open_interest` | Decimal string | Current open interest (size units) |
| `perp[*].day_ntl_vlm` | Decimal string | 24h notional volume |
| `perp[*].prev_day_px` | Decimal string \| null | Price 24h ago; `null` if unknown |
| `perp[*].change_24h` | Decimal string \| null | 24h price change (fraction, signed); `null` when no prior px |
| `perp[*].halted` | bool | Market halted |
| `spot.pairs` | array | Spot pair registry (same rows as [the spot registry](./spot.md#spot_meta) `pairs`, plus live `mark_px` / `mid_px` / `day_ntl_vlm`) |
| `spot.tokens` | array | Spot token registry (same rows as [the spot registry](./spot.md#spot_meta) `tokens`) |

**Rules**

- `coin` narrows the SAME rows; it does not change the shape. The response is
  still `{perp: [...], spot: {...}}`, with the arrays cut to the matching row. A
  client that wants one market pays one round trip and parses one shape.
- Each `perp` row is the **dynamic** half of a market; the **static** counterpart
  lives on [`markets_meta`](#markets_meta), joined on `(coin, kind)`.
  `mid_px` is **omitted** from a row when the book is one-sided (never sent as
  `null`). The live WS [`markets`](../../ws/subscriptions.md#markets) channel streams
  these same dynamic rows (a full snapshot on subscribe, then changed-row deltas).
- The **static** per-market fields (`sz_decimals`, `tick_size`, `step_size`,
  `min_order`, `max_leverage`, `maint_margin_ratio`, `init_margin_ratio`,
  `margin_tiers`, `strict_isolated`, `open` / `close`, `oi_cap`,
  `mark_source`, `fba_enabled`, `signing_id`, `risk_override`) are **not** on this
  read — fetch them from [`markets_meta`](#markets_meta). For the spot pair / token field semantics
  see [the spot registry](./spot.md#spot_meta).

### Get static metadata for all markets {#markets_meta}

Every registered market's **static** metadata — the long-lived fields a market
publishes once and rarely changes (precision grids, leverage / margin ladders,
trade-control flags, mark source) plus the `(coin, kind)` join keys — together
with the spot pair/token registry. The static counterpart to [`markets`](#markets):
a client caches this half and polls only the dynamic [`markets`](#markets) half.
Same optional `kind` and `coin` filters.

**Request**

```json
{ "type": "markets_meta" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter — absent = both; `"perp"` = the perp array only; `"spot"` = the spot section only. **An unrecognized value is rejected `400`**, naming `perp` and `spot`. It used to be ignored, so a typo quietly returned BOTH sections — a superset, with no diagnostic |
| `coin` | string | no | Market filter — keep only the row for this symbol. Unknown symbol → `404 MARKET_NOT_FOUND` |

**Response**

The `data` payload is an **object** with a `perp` array (each a **static** row) and
the same `spot` `{pairs, tokens}` object [`markets`](#markets) returns. `perp` rows
are ordered by ascending market id.

Response (perp truncated to one entry; the `spot` section is identical to
[`markets`](#markets)):

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
        "oi_cap":          "1000000",
        "max_market_order_ntl": "400000",
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
| `perp[*].coin` | string | Market symbol (the join key) |
| `perp[*].kind` | `"perp"` | Market kind (lowercase, join key) |
| `perp[*].sz_decimals` | uint8 | Size display decimals |
| `perp[*].tick_size` | Decimal string | Minimum price increment (human-decimal, e.g. `"0.1"`) |
| `perp[*].step_size` | Decimal string | Minimum size increment / lot size (human-decimal) |
| `perp[*].min_order` | Decimal string | Minimum order size (human-decimal) |
| `perp[*].max_leverage` | uint8 | Max leverage (the margin-tier ladder's top rung) |
| `perp[*].maint_margin_ratio` | bps string | Base maintenance-margin ratio, decimal bps |
| `perp[*].init_margin_ratio` | bps string | Base initial-margin ratio, decimal bps |
| `perp[*].margin_tiers` | array | Notional-banded leverage ladder; each `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`, ascending upper-bound bands, `null` = unbounded top tier |
| `perp[*].strict_isolated` | bool | Market forces strict-isolated margin |
| `perp[*].open` / `close` | bool | Whether opening / closing is ALLOWED on this market. They state what is permitted, not what is forbidden |
| `perp[*].oi_cap` | Decimal string | Governance open-interest cap, in the market's size units; **OMITTED** entirely when the market is uncapped (never a fabricated `"0"`) |
| `perp[*].max_market_order_ntl` | Decimal string \| null | Remaining open-interest headroom on the WHOLE market, in the market's **size** units: `oi_cap − open_interest`, floored at `0`. `null` = the market is UNCAPPED. `"0"` = the market sits AT its cap. Despite the name, this is a size, not a notional. See below |
| `perp[*].mark_source` | `"oracle_median"` \| `"sync_oracle"` \| `"custom"` | Mark-price source descriptor tracking the committed mark mode — `"oracle_median"` = the default live 3-component median, `"sync_oracle"` = mark follows the oracle price directly, `"custom"` = mark frozen at a governance-set custom price |
| `perp[*].fba_enabled` | bool | Frequent-batch-auction enabled for this market |
| `perp[*].signing_id` | uint32 | **The number you put in the EIP-712 `market` field when you sign an order for this market.** It has no other meaning on the read plane — do not use it as a sort key, a join key, or a market identity. See below |
| `perp[*].risk_override` | object \| null | The governance risk override in force on this market, or `null` when the market runs on the defaults. See below |
| `perp[*].token` | object | The **base token record** of the market — the registry row for the coin the market is written on. **The key is OMITTED on a market that has no token record**; it is never sent as `null`. See below |
| `spot.pairs` / `spot.tokens` | array | Spot pair / token registry, identical to [`markets`](#markets) (see [the spot registry](./spot.md#spot_meta)) |

**Rules**

- Each `perp` row is the **static** half of a market, joined to its dynamic
  [`markets`](#markets) row on `(coin, kind)`. None of the per-commit dynamic
  fields (`mark_px`, `oracle_px`, `mid_px`, `impact_pxs`, `premium`, `funding`,
  `open_interest`, `day_ntl_vlm`, `prev_day_px`, `change_24h`, `halted`) appear
  here.
- **`max_market_order_ntl` is the one exception, and it MOVES.** It is derived
  from live open interest, so it changes on every fill. Do not cache it with the
  rest of the row. See below.
- For the spot pair / token field semantics see [the spot registry](./spot.md#spot_meta).

#### `max_market_order_ntl` is served — do not reconstruct it {#max_market_order_ntl}

The chain already computes the headroom. Read the field. Do **not** subtract
[`markets`](#markets) `open_interest` from `oi_cap` yourself: that arithmetic
loses the two conventions the served field carries.

- **`null` means UNCAPPED, not zero headroom.** The reconstruction cannot
  produce it, because `oi_cap` is OMITTED from an uncapped row. A client that
  reads a missing `oi_cap` as `0` computes a negative headroom and blocks every
  order on a market that has no limit at all. This is the inverse mistake, and it
  is the worse one.
- **`"0"` means the market sits AT its cap.** The value is floored at `0` and
  never goes negative.
- **The name says notional; the value is a SIZE.** It is in the same units as
  `oi_cap` and `open_interest`, on the market's `sz_decimals` grid. Do not
  divide it by a price.
- **It is market-wide, not yours.** It is the room left in the whole market, not
  a limit on your order. For your own per-order limit read `max_trade_szs` on
  [`active_asset_data`](#active_asset_data).

**`active_asset_data.max_trade_size` is the SAME number under another name.**
Both fields are the one headroom figure. Read whichever response you already
have; never expect the two to differ.

#### `signing_id` is the write handle, and nothing else {#signing_id}

Every read on this API keys a market by its **`coin` symbol**. The signed
`/exchange` write path does not: its typed-data string is consensus-frozen at
`uint32 market`, so a signer must put a NUMBER there. `signing_id` is that
number, published so the value is on the wire instead of being knowledge a
client has to carry out of band.

Use it in exactly one place — the `market` field of a typed action you sign. Do
NOT treat it as the market's identity: read responses key by `coin`, and a
client that joins on `signing_id` is joining on the write plane. See
[typed-data signing](../../../integration/typed-data-signing.md).

#### `risk_override` says what governance changed {#risk_override}

A governance vote can replace this market's default risk parameters. When it
has, `risk_override` is an object naming the replaced values; when it has not,
`risk_override` is **`null`**.

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
| `max_leverage` | uint8 | Leverage ceiling the vote set |
| `maint_margin_ratio` | bps string | Maintenance-margin ratio, decimal basis points — the SAME plane as the top-level `perp[*].maint_margin_ratio` |
| `funding_rate_cap` | Decimal string | Per-interval funding clamp, a raw fraction (`"0.04"` = 4%) |
| `realized_vol_30d` | Decimal string | The 30-day realized volatility the vote priced the row on, a raw fraction |
| `updated_at_block` | uint64 | Block height at which the vote wrote this row |
| `liq_floor_ppm` | uint \| null | Liquidation-price floor in parts per million. `null` = the vote set none |
| `liq_fee_bps` | Decimal string \| null | Liquidation-fee override, decimal bps. `null` = the vote set none |
| `margin_tiers` | array | The override ladder — each `{lower_bound_notional, max_leverage, maint_margin_ratio}`, `maint_margin_ratio` a bps string on the same plane as everywhere else on this row |

:::info
**`maint_margin_ratio` is decimal basis points EVERYWHERE on this row.** It used
not to be. `perp[*].maint_margin_ratio` was bps while
`perp[*].risk_override.maint_margin_ratio` was a raw fraction — the same rung
under the same name, **10,000x apart**, inside one response. Measured live on
BTC, the top-level ladder said `"50"` where the override ladder said `"0.005"`.

A caller that read the override as bps computed a maintenance margin four orders
of magnitude too small and believed an unsafe position was safe. One concept now
has one plane. See the
[upgrade notice](../../upgrade-notice-ids-and-shapes.md#one-plane) — this row
changes when that release lands.
:::

**The two `margin_tiers` ladders still band on different keys.**
`perp[*].margin_tiers` bands on `max_open_interest` (an ascending upper bound,
`null` on the top tier). `risk_override.margin_tiers` bands on
`lower_bound_notional` (an ascending **lower** bound, `"0"` on the first tier).
The bound runs the opposite way — that is the shape of the committed ladder, and
it is NOT unified by the plane change above. A ladder walked with the wrong
comparison selects the wrong tier.

**`init_margin_ratio` and `oi_cap` are NOT override keys.** Neither appears
inside `risk_override` on any market. Read them from the top level of the same
row.

Every key inside is optional: an override that moves only `max_leverage`
carries only `max_leverage`. A key that is absent is not overridden, and the
market's default (the sibling field on this same row) applies. A key present
with `null` is a set field holding "none" — `liq_floor_ppm` and `liq_fee_bps`
both do that. Absent and `null` are different answers.

**`null` and an empty object are different answers.** `null` means no override
exists. An object with no overridden keys means an override record exists and
overrides nothing. Rendering the two the same way is the exact confusion this
field was added to end — the market's own row is where a caller looks, so the
answer belongs here and not on a separate read.

#### `token` is the market's base token record {#markets_meta-token}

The token registry row for the coin the market is written on. It is the same
record the spot registry publishes, carried here so a perp client needs no
second read.

| Field | Type | Meaning |
|-------|------|-------------|
| `token.id` | uint32 | Token registry id |
| `token.token_id` | string | 32-byte token hash, `0x` plus 64 hex characters |
| `token.wei_decimals` | uint8 | Base-unit decimals of the token |
| `token.is_canonical` | bool | Whether this is the canonical token for the symbol |
| `token.circulating_supply` | Decimal string | Circulating supply, whole units |
| `token.system_address` | string | The system address that holds the token's core-side balance |
| `token.evm_contract` | object \| null | The token's EVM contract binding, or `null` when the token has no EVM contract |
| `token.evm_contract.address` | string | Contract address on the unified EVM |
| `token.evm_contract.variant` | uint | Contract variant tag |
| `token.evm_contract.evm_extra_wei_decimals` | int | Decimal shift between the core plane and the EVM contract plane. Add it to `wei_decimals` to get the EVM-side decimals |

**Absent, and `null`, are two different answers here.**

- **`token` ABSENT** — the market has no base token record at all. Some deployed
  markets are written on a symbol with no registry row. Read a missing `token`
  as "no record", never as an empty one.
- **`token.evm_contract` `null`** — the token record exists and states that the
  token has **no** EVM contract. The key is present and holds `null`.

A client that treats the two the same reports a token that does not exist.

### Get aggregated order book levels {#l2_book}

Market-scoped aggregated bid/ask levels — full tick-precise depth by default,
optionally grouped to a coarser significant-figure price grid.

**Request**

```json
{ "type": "l2_book", "coin": "BTC" }
```

Grouped to a coarser grid:

```json
{ "type": "l2_book", "coin": "BTC", "n_sig_figs": 5, "mantissa": 5 }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol — a perp symbol (`"BTC"`) or a spot pair name (`"BTC/USDC"`); a spot pair renders its spot order-book depth in the pair's own tick / size planes |
| `n_sig_figs` | uint | no | Group levels to this many significant figures — an integer `2`–`5`. Absent ⇒ the full-depth, tick-precise book |
| `mantissa` | uint | no | Sub-step for `n_sig_figs: 5` **only** — one of `1`, `2`, `5` (the grid step is `mantissa ×` the 5-sig-fig step). Invalid with any other `n_sig_figs` |
| `n_levels` | uint | no | Per-side depth cap — keep only the best `n_levels` aggregated levels per side (applied **after** grouping, so a capped grouped book covers more raw depth). Absent ⇒ no cap |

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

Bids are best-first (descending price), asks ascending. Each level aggregates
the summed `size` and the resting-order `n_orders` count. An unknown / empty
market returns empty `bids` / `asks` arrays.

| Field | Type | Meaning |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `bids[*].px` / `asks[*].px` | Decimal string | Level price, **human-decimal** (tick-snapped; the grouped grid price when grouping args are sent) |
| `bids[*].sz` / `asks[*].sz` | Decimal string | Summed size at the level (whole units). The key is `sz`, not `size` |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Resting orders aggregated into the level |

**Errors**

- Missing `coin` → `400 INVALID_REQUEST`.

**Rules**

- Grouping is a GATEWAY-side aggregation: the node always serves the full-depth
  book, and the gateway applies `n_sig_figs` / `mantissa` to the response.
- Grouped levels round **away from the spread** — bid prices round **down**
  (floor), ask prices round **up** (ceil) onto the grid — so a grouped level
  never displays a better price than its orders actually rest at.
- The sizes of collapsed levels are **summed**; per-side total size is
  conserved.
- The `n_levels` depth cap is likewise gateway-applied, counted over the
  AGGREGATED levels.
- A request without grouping / depth args is forwarded verbatim and returns
  the live book untouched.
- Querying a bare node directly, the grouping / depth args are ignored — full
  depth either way.

### Get public trades, recent or windowed {#trades}

Market-scoped public trade tape. One read answers both asks: send `coin` alone
for the recent window, or add `start_time` / `end_time` for a time window.

:::info
**`trades` is the only tape name. Two older names are removed.** `recent_trades`
(un-ranged) and `trades_by_time` (ranged) both answer `400 UNKNOWN_TYPE` now.
Send `trades` for both asks: `coin` alone for the recent window, `coin` plus
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
| `limit` | uint32 | no | Cap the number of **most-recent** records returned; absent / `0` ⇒ the full ring |
| `start_time` | uint64 | no | Window start (consensus ms, inclusive); filters on trade `time`. Absent ⇒ open lower bound |
| `end_time` | uint64 | no | Window end (consensus ms, inclusive). Absent ⇒ open upper bound |

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
| `last_trade` | uint64 | Timestamp of the newest trade in this answer (`0` if none). The key is `last_trade`, NOT `last_trade_ms` |
| `start_time` / `end_time` | uint64 \| null | Echoed window bounds; `null` for a bound you omitted |
| `trades[*].coin` | string | Market symbol the trade executed on |
| `trades[*].side` | `"B"` / `"A"` | Taker (aggressor) side token — `"B"` = buy, `"A"` = sell |
| `trades[*].px` | Decimal string | Execution price, **decimal USDC** (human-readable) |
| `trades[*].sz` | Decimal string | Filled size, **base units** (whole-unit) |
| `trades[*].time` | uint64 | Trade timestamp (consensus ms) |
| `trades[*].tid` | decimal-digit string | Deterministic trade id, shared by both legs of the print. It is a 64-bit hash-derived value and routinely exceeds 2⁵³, so it is a STRING: a JSON number loses its low digits in JavaScript, and a `user_fills` to `trades` join by `tid` then matches nothing, silently. Compare it as a string, or convert it with `BigInt` |
| `trades[*].block` | uint64 | Committed block height the trade settled in (on-chain locator) |
| `trades[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex — lets a print be traced on-chain. **Empty string (`""`) when there is no signed taker action** behind the print (a system / begin-block print, or a maker leg whose submit hash is not carried) |

**Rules**

- An **un-ranged** ask returns records NEWEST-FIRST (the newest trade is
  element 0). A **ranged** ask returns them oldest-first. The node ring is
  bounded, so an un-ranged ask is a recent window, not all history. An unknown
  / never-traded market returns `"trades": []` and `last_trade: 0`.

#### Deep history, past the ring {#trades-archive}

**A RANGED ask reaches the archive; an UN-RANGED ask does not.** That split is
the rule, not a stage. A request that carries `start_time` or `end_time` asks
for a window, and a window can reach past the node's bounded ring, so the
archive answers it. A request with neither is the live ring's job and always
answers from the ring.

**Your parser does not change.** The gateway relabels the archive record to the
shape above, so one parser reads both sources. Three fields read differently on
an archive-served print:

| Field | On an archive-served print |
|-------|----------------------------|
| `hash` | **ABSENT — the key is omitted, and that is deliberate.** On a node print `""` is a real value: it says there was no signed taker action. The archive's trade table stores no trace hash at all, which is a different fact. Emitting `""` would report an unknown as a known. Treat a missing `hash` as "not recorded" and a `""` as "recorded, and there was none" |
| `last_trade` | The newest print **in this answer**, not the market's all-time newest |
| `time` at the live edge | The archive consumes the node stream on a poll interval (**default 5 s**), so the newest prints reach it late. A window that runs up to now can stop a few seconds short of the tape's true end. Re-ask, or read the live [`trades` WS channel](../../ws/subscriptions.md#trades) for a sub-block tape |

**No archive, no change.** On a deployment with no archive wired, the node's
live ring answers a ranged ask too — the same records, the same window filter,
and `"trades": []` once the window falls past the ring.


### Get historical OHLCV candles {#candle_snapshot}

Historical price bars for `(coin, candle_type, interval)`. The single candle
query (the standalone `candle` type has been **removed**): archive-first —
served from the archive when one is wired, falling back to bars folded from the
live price stream otherwise. The REST companion to the live
[`candles`](../../ws/subscriptions.md#candles) WS channel.

`candle_type` selects the price series:

| `candle_type` | Series | Available on |
|---------------|--------|--------------|
| `mark` (**default**) | [Mark price](../../../concepts/mark-prices.md) — the price positions mark at | perp and spot markets |
| `oracle` | [Oracle index price](../../../concepts/oracle-prices.md) | perp markets only |
| `trade` | Executed-trade OHLCV, folded from prints | perp and spot markets |

:::warning
**The three series are NOT interchangeable, and one never falls back to another.**
An unknown `candle_type` is rejected rather than silently answered with a
different series — charting the wrong price is a trading hazard.

**A price bar and a trade bar differ in more than price.** A price series has a
bar in every window its samples cover. A **trade** series is SPARSE: a window
with no fill has **no bar at all**, never a carried-forward one. And `v` / `n`
mean different things — a price bar reports `v` as `"0"` with `n` as the sample
count, while a trade bar carries real volume and a real trade count.
:::

#### A bad input is rejected; a quiet window is not {#candle_snapshot-rejections}

An unknown `coin` and an unknown `interval` are each rejected `400`. They used to
answer `200` with an empty `candles` array — **the identical answer a genuinely
quiet window gives** — so a typo in a symbol read as "this market did not trade".
[`l2_book`](#l2_book) already answered `404` for the same unknown coin, so the
surface disagreed with itself.

**A quiet window is still `200` with an empty array**, and the `coverage`
envelope below still says so. The two cases are now different answers: "you asked
for something that does not exist" is an error, "nothing happened there" is data.

**Request**

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "candle_type": "mark", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol, e.g. `"BTC"`. **An unknown coin is rejected `400`** |
| `interval` | string | yes | Bucket token — one of `1m`, `5m`, `15m`, `1h`, `4h`, `1d`. **An unknown token is rejected `400`**, naming that set |
| `candle_type` | string | no | Series — `mark` (default), `oracle` or `trade`. Lower-case, exact match |
| `start_time` | uint64 | no | Window start (ms); filters on bar open. Default `0` |
| `end_time` | uint64 | no | Window end (ms); filters on bar open. Default unbounded |

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
| `coverage.start` | uint64 \| null | Open time of the oldest bar in THIS answer. **`null` when `candles` is empty** |
| `coverage.end` | uint64 \| null | Open time of the newest bar in THIS answer. **`null` when `candles` is empty** |
| `coverage.reaches_newest` | bool | `true` = the answer runs to the newest bar the store holds. `false` = **newer bars exist that this answer does not include** |
| `t` | uint64 | Bar **open** timestamp (ms, bucket-aligned) |
| `T` | uint64 | Bar **close** timestamp (ms) |
| `s` | string | Market symbol |
| `i` | string | Interval bucket token |
| `o` / `c` / `h` / `l` | Decimal string | **O**pen / **c**lose / **h**igh / **l**ow price, **whole-unit decimal** string (e.g. `"78778.1"`) — the same plane [`markets`](#markets) reports `mark_px` in |
| `v` | Decimal string | Base-asset volume. `"0"` on a `mark` / `oracle` bar — a price bar folds no trades. Real volume on a `trade` bar. **May be ABSENT** — see below |
| `q` | Decimal string | Quote volume. `"0"` on a `mark` / `oracle` bar. Real quote volume on a `trade` bar folded from live prints. **May be ABSENT** — see below |
| `n` | uint64 | Count. On a `mark` / `oracle` bar it is a **sample count**, not a trade count, and it is `0` on a carry-forward bar. On a `trade` bar it is a real **trade count**. **May be ABSENT** — see below |
| `f` | bool | Forward-filled flag. `true` = the bar carries the previous close forward and folded no new input; `false` = a real folded bar |

**`coverage` reports the span of THIS answer.** It tells you whether the series
is cut. Read `reaches_newest: false` as "keep paging forward", never as "the
market stopped". `coverage.start` and `coverage.end` are both `null` when
`candles` is empty.

#### `v`, `q` and `n` can be ABSENT, and absent is not `"0"` {#candle_snapshot-volume}

A bar folded from the live price and trade streams carries all three keys. A bar
served from durable history may **omit** them, because the durable store holds
no volume for that bucket.

**The two answers mean opposite things:**

- `"v": "0"` states **"no trades in this bucket"**. It is a measured zero.
- **`v` absent** states **"no volume data for this bucket"**. Nothing was
  measured.

Serving `"0"` for the second case would put a false zero-to-real step in the
series, so the key is dropped instead. Test for key presence, not for a zero
value. A client that defaults a missing `v` to `0` charts a volume collapse that
did not happen.

All three states appear in one ordinary answer. A three-bar `mark` window can
hold a bar with real `v` / `q` / `n`, a bar with all three keys **missing**, and
a bar carrying `"0"` / `"0"` / `0`.

:::warning
**Some bars carry extra `tn` and `tv` keys. Ignore them.** They are passthrough
columns from the durable store, and **`tv` is not on the same plane as `v`** —
one measured bar carried `"v": "0.09690"` beside `"tv": "92888"`. They are not
documented, not guaranteed to appear, and not interchangeable with `v` / `n`.

Read `v`, `q` and `n`. Treat any other volume-looking key as absent.
:::

**Errors**

- Missing `coin` → `400 INVALID_REQUEST`; missing `interval` →
  `400 INVALID_REQUEST`. An unknown `candle_type` →
  ``400 INVALID_REQUEST``.
  A rejected value is never served as another series.

**Rules**

- `trade` is accepted. All three tokens in the table above are live.
- Bars are ordered oldest-first by `t` (open time); the newest element is the
  forming bar. A bar needs **no trade**: a price exists at all times, so the series
  covers every window the samples cover. A market that has never traded still has
  bars. A window with no sample carries the previous close forward as a flat bar
  (`o = h = l = c`, `n = 0`).
- An empty `candles` array is the honest-empty answer for a market with no history
  in that series. A spot pair asked for `oracle` always answers empty — a spot pair
  has no oracle price.

#### The bar cap, and how to page past it {#candle_snapshot-max-bars}

> ⬆️ **Upgrade notice — landed, not yet released.** The bar cap below is
> written, tested and merged. It is **not on the live chain**: a wide window is
> still answered in full there. The cap goes live with the next node release.
> Page your queries now, and that release changes nothing for you.

A response carries at most **5000 bars**. Over that, the answer keeps the **5000
most recent** and drops the older ones. The cap exists because the window is
caller-chosen and otherwise unbounded: one request for years of `1m` bars would
fold and serialize an arbitrarily large series, and a few of those in parallel
are enough to hurt every other caller on the node.

**The cap trims the OLD end, not the new one.** A default chart load asks for the
recent window and is unaffected. You only meet the cap when you ask for more
history than 5000 bars of your chosen `interval` — about 3.5 days at `1m`, or
about 13 years at `1d`.

**No history is unreachable.** Walk backwards with `start_time` and `end_time`:
take the oldest `t` you received, ask again with `end_time` set to it, and repeat.
Each page returns its own 5000 most recent bars within the window you named. A
wider `interval` reaches further per request.

:::warning
**These bars come from a SAMPLED price series, not from the continuous price
path.** The archived history samples each market price every **5 seconds** of
block time. The live fallback folds one sample per price push.

- `o` and `c` are the **first and last sample** of the window.
- `h` and `l` are the **highest and lowest sample** of the window.

`h` and `l` are therefore the extremes **of the samples**, not the true extremes
of the price. A spike that starts and ends between two samples leaves no trace in
the bar.

Do not build wick analysis, liquidation-trigger reconstruction, or any
"did the price touch X?" test on these bars. They answer only "where was the
price at each sample". For a specific instant, read the price on
[`markets`](#markets) or use the trade tape.
:::

### Get funding premium history {#funding_history}

Market-scoped funding premium samples (the premium ring).

**Request**

```json
{ "type": "funding_history", "coin": "BTC" }
```

| Field | Type | Required | Meaning |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `start_time` | uint64 | no | Window start (ms); filters on sample `ts` |
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
| `source` | string | Which store answered — `"archive"` for durable history, `"live_ring"` for the node's in-memory premium ring |
| `range_honored` | bool | Whether the answer applied your `start_time` / `end_time`. `false` = the window was **ignored** and you got the live ring instead |
| `coverage.start` | uint64 | Timestamp of the oldest sample in THIS answer |
| `coverage.end` | uint64 | Timestamp of the newest sample in THIS answer |
| `coverage.reaches_oldest` | bool | `true` = the answer reaches the oldest sample the store holds. `false` = **older samples exist that this answer does not include** |
| `samples[*].ts` | uint64 | Sample timestamp (consensus ms). The key is `ts`, not `ts_ms` |
| `samples[*].premium` | decimal string | Raw funding premium sample, pre-clamp (signed) |
| `samples[*].funding_rate` | decimal string | Realized rate = `premium` clamped to the per-asset cap (signed) |

#### `coverage` and `range_honored` say what the answer MISSES {#funding_history-coverage}

The samples alone cannot tell you whether you got the series you asked for.
These three fields do, and a caller that charts funding must read them.

- **`range_honored: false` means your window was not applied.** A window the
  archive cannot answer does **not** come back empty. It falls back to the live
  ring, so the body holds samples at "now" and `source` reads `"live_ring"`.
  Ask for a window years in the past and you still get 64 samples from the last
  few minutes. Charting them against your own axis plots recent samples in a
  historical slot. **Check `range_honored` before you plot; the sample count
  never warns you.**
- **`reaches_oldest: false` means the series is CUT, not empty.** Older samples
  exist. Page back with an earlier `end_time` to reach them. A chart that reads
  the first returned sample as the market's first sample draws a start that
  never happened.
- **`coverage` describes THIS answer, not the store.** `start` / `end` are the
  span of the samples in this body.

**Errors**

- Missing `coin` → `400 INVALID_REQUEST`.

**Rules**

- Samples are the ordered ring of premium snapshots from the funding tracker.
  `premium` is the exact pre-clamp `Decimal` rendered as a string (signed, full
  precision); `funding_rate` is that premium passed through the per-asset funding
  cap — the realized rate that would actually be charged. When the premium is
  within the cap, `funding_rate == premium`; above it, `funding_rate` is clamped
  to the signed cap. An unknown / empty market returns `"samples": []`.

### Get perp-deploy gas-auction state {#mip3_active_bids}

MIP-3 permissionless perp-deploy gas-auction snapshot.

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
| `bids[*].tag` | string | Bid tag (e.g. the proposed market name) |

### `liquidatable` is removed {#liquidatable}

**This read no longer exists.** A `{"type":"liquidatable"}` request answers
`400` with `error.code` `UNKNOWN_TYPE`.

**There is no replacement read, and no other read lists the flagged accounts.**
The list named other accounts, so it is not something an account query can
return. Read your own liquidation distance from your own
[`account_state`](../info.md#account_state) health fields instead.

### Get a user's market trading limits {#active_asset_data}

A user's per-market leverage / margin-mode / max trade size.

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
| `leverage` | uint32 | Position leverage if open, else account default, else market max |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Effective margin mode |
| `mark_px` | decimal string | Current mark, human-decimal plane |
| `max_trade_size` | decimal string \| null | Open-interest headroom left on the WHOLE market, in **size** units: `oi_cap − total_open_interest`, floored at `0`. `null` when the market carries no cap. **Not a per-user limit** — see below. [`markets_meta`](#markets_meta) serves the same number per market as `max_market_order_ntl` |
| `max_trade_szs` | [decimal string, decimal string] | Size the CALLER can still trade `[buy, sell]`, from their own margin |
| `available_to_trade` | [decimal string, decimal string] | Notional the CALLER can still open `[buy, sell]` |
| `has_position` | bool | Whether the user has a non-zero position on this market |

**Errors**

- Missing `address` → `400 INVALID_REQUEST`; missing `coin`
  → `400 INVALID_REQUEST`.

#### `max_trade_size` is market-wide, not yours {#max-trade-size}

`max_trade_size` is the open-interest cap minus the market's TOTAL open interest
— every account's positions summed, not the caller's. The chain refuses an
OI-increasing order once total open interest reaches the cap, so this field says
how much fresh exposure the market as a whole can still absorb.

That headroom is **shared and racing**. Any other account can consume it in the
next block, so the value is a snapshot, never a reservation. Size an order
against `max_trade_szs` — the caller's own limit — and treat `max_trade_size` as
the ceiling both of you compete for.

Two values need care:

- **`null` means UNCAPPED** — the market has no OI cap, so no OI ceiling applies.
  Do not clamp an order to `0` here. A client that reads a missing number as "no
  size allowed" blocks trading on exactly the markets that are most open.
- **`"0"` means AT THE CAP** — the market is full and an OI-increasing order is
  refused right now. A reducing order still works.

The cap is read from the market's committed annotation only. There is **no
fallback to a configured default**: a read surface must never advertise a ceiling
the chain does not enforce, so an unannotated market reports `null` rather than
borrowing a global number.

`available_to_trade` and `max_trade_szs` are budgets from the caller's own free
collateral, side-aware and never negative. The reducing side is larger because
closing the open position releases its margin. They are still an estimate against
a moving mark: both fall when the mark moves against the caller, and neither is a
guarantee that the order is admitted.

### `margin_table` — removed {#margin_table--removed}

:::warning
**`margin_table` has been REMOVED.** The margin ladder now rides **inline** on
each market record as `margin_tiers` — read it from
[`markets_meta`](#markets_meta). Each tier is `{max_open_interest: string|null, max_leverage: u8,
maint_margin_ratio: bps-string}`: ascending upper-bound bands, `null` = unbounded
top tier. A `margin_table` request now returns
`400 UNKNOWN_TYPE`.
:::

### List perp DEXs and their limits {#perp_dexs}

The perp DEX(es) plus the governance-set permissionless-deploy (MIP-3) and
per-market limit configuration. The unit planes are load-bearing and
deliberately explicit in the field names.

:::warning Not live yet
`name` and `deployer` land with the next network upgrade, in the same release
that keys [`clearinghouse_state`](../info.md#clearinghouse_state) by name. Until
that upgrade fires, each row carries `index`, `n_assets` and `assets` only. The
name rule, the name each existing dex receives, and the re-join for a cached
address key are all in [the dex key](../info.md#dex-key).
:::

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
| `dexs[*].index` | uint64 | DEX index in the perp-DEX registry. A position in a list, not a name — see below |
| `dexs[*].name` | string | The dex NAME, `""` for the core dex. 1 to 16 ASCII alphanumeric bytes, unique without regard to case, set once when the dex is created and never renamed. It prefixes every market symbol on the dex (`NAME:SUFFIX`) and it keys [`clearinghouse_state`](../info.md#clearinghouse_state) |
| `dexs[*].deployer` | hex address \| null | The account that deployed the dex. **`null` for the core dex** — the core dex has no deployer, and `""` is a reserved name, not an address |
| `dexs[*].n_assets` | uint64 | Number of asset books in the DEX |
| `dexs[*].assets` | string[] | Market symbols in the DEX, e.g. `["BTC","ETH","SOL"]`. They are **symbols, not ids** — a symbol is the key every market read uses |
| `limits.mip3_enabled` | bool | Permissionless (MIP-3) perp deploy enabled |
| `limits.min_deploy_stake_base` | u128 string | Deployer **self-stake floor**, MTF base units |
| `limits.min_deploy_stake_mtf` | Decimal string | Permissionless-deploy **staking bond**, whole-MTF. An independent governance knob from `min_deploy_stake_base` — two thresholds, not one value on two planes |
| `limits.gas_auction_min_bid` | Decimal string | Deploy gas-auction minimum bid, whole-USDC |
| `limits.auction_duration_blocks` | uint64 | Gas-auction window length, in blocks |
| `limits.deployer_fee_cap_bps` | string | Ceiling on the per-market deployer fee share, a decimal string of whole basis points |
| `limits.dutch_start_multiplier` | Decimal string | Dutch-auction start-price multiplier over the minimum bid |
| `limits.per_market_limits.max_oi` | u128 string | Per-market open-interest cap, size base units |
| `limits.per_market_limits.max_leverage` | uint | Max leverage a deployed market may offer |
| `limits.per_market_limits.max_taker_fee_bps` | bps string | Per-market taker-fee ceiling, decimal bps (same render as [`fee_schedule`](../info.md#fee_schedule)) |
| `limits.per_market_limits.max_oi_per_second` | u128 string | Per-market open-interest growth-rate cap, size base units per second |

**`name` is the join key; `index` is not.** `clearinghouse_state` keys its
position buckets by `name`, so `name` is the one field that joins an account's
positions to the dex that lists them. `index` is a subscript into this list: it
still answers, and it is still stable today, but it is not the identifier any
other read speaks. Do not key a cache on it.

**`deployer` is served so an old cache can be repaired.** Before the upgrade,
`clearinghouse_state` keyed its buckets by the deployer address. An integrator
that cached those keys reads this list once and maps each address to its `name`.
That is the whole recovery — see [the dex key](../info.md#dex-key).


## See also {#see-also}

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Spot & margin queries](./spot.md) — spot / spot-margin / Earn reads
- [Perpetuals](../../../products/perpetuals.md) — the product
