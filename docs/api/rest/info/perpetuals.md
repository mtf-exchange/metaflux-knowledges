---
description: POST /info read queries for perpetual markets — market info, order books, trades, funding, liquidation, and perp deploy state.
---

# `POST /info` — perpetual queries

Read queries for **perpetual** markets. Same `POST /info` endpoint, envelope, and conventions as the [base page](../info.md) — these are the perp-market-specific `type`s. (Order-book / trade / candle reads also serve spot pairs by `pair` id.)

## Perpetual query types

### `market_info`

Per-market metadata.

```json
{ "type": "market_info", "asset_id": 0 }
```

Or by name:

```json
{ "type": "market_info", "coin": "BTC" }
```

Response:

```json
{
  "type": "market_info",
  "data": {
    "asset_id":        0,
    "name":            "BTC",
    "kind":            "perp",
    "sz_decimals":     5,
    "mark_px":         "67079.265",
    "oracle_px":       "67073.35",
    "mid_px":          "67079.27",
    "premium":         "0.0015",
    "tick_size":       "1000000",
    "step_size":       "1",
    "min_order":       "1",
    "max_leverage":    50,
    "maint_margin_ratio": "300",
    "init_margin_ratio":  "200",
    "funding": {
      "rate_per_hr":  "0",
      "cap_per_hr":   "400",
      "interval_ms":     3600000,
      "next_payment_ts": 0
    },
    "mark_source": "MedianOfOraclesAndMid",
    "fba_enabled": false,
    "open_interest": "0"
  }
}
```

:::info
**Price reporting plane.** On this read both `mark_px` and `oracle_px` are in the
**whole-USDC Decimal plane** (human dollars — `"67079.265"` / `"67073.35"`), the
same unit as account positions' mark. `mark_px` is the on-book mark scaled down
from the engine's internal 1e8 fixed-point representation, falling back to the
oracle px when the book has no mark yet; `oracle_px` is the latest committed index
price. Either is `"0"` when unset. Note the **order/book submission plane stays
1e8 fixed-point** — `l2_book` level px and order `limit_px` are NOT whole-USDC; MTF
keeps those two scale planes distinct, and only the human-facing reads (`market_info`,
`markets`, positions) report prices in whole-USDC. Field semantics for the rest of
the record are in the [`markets`](#markets) table below.
:::

:::info
**Price precision vs `sz_decimals`.** `mark_px` and `oracle_px` are **snapped to
the market's price tick** (`tick_size`, truncated toward zero) so a read never
shows sub-tick noise — at a `$0.01` tick (`tick_size: "1000000"` in the 1e8 plane)
`66735.255` is reported as `"66735.25"`. Note `sz_decimals` is **SIZE** precision
(order quantity granularity — `5` ⇒ `0.00001` units), it does **not** govern price
decimals; the price tick does. The two are independent axes (same split HL uses).
:::

### `markets`

Every registered MIP-3 perp market, in one call. No parameters.

```json
{ "type": "markets" }
```

The `data` payload is an **array** of the same rich per-market record that
[`market_info`](#market_info) returns for a single asset. Records are ordered
deterministically by ascending `asset_id` (the node iterates the
`mip3_market_specs` `BTreeMap`). An empty universe returns `"data": []`.

Response:

```json
{
  "type": "markets",
  "data": [
    {
      "asset_id":        0,
      "name":            "BTC",
      "kind":            "perp",
      "sz_decimals":     5,
      "mark_px":         "67042.335",
      "oracle_px":       "67042.335",
      "mid_px":          "67042.33",
      "premium":         "0.0015",
      "tick_size":       "1000000",
      "step_size":       "1",
      "min_order":       "1",
      "max_leverage":    50,
      "maint_margin_ratio": "300",
      "init_margin_ratio":  "200",
      "funding": {
        "rate_per_hr":  "0",
        "cap_per_hr":   "400",
        "interval_ms":     3600000,
        "next_payment_ts": 0
      },
      "mark_source": "MedianOfOraclesAndMid",
      "fba_enabled": false,
      "open_interest": "0"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | uint32 | Canonical asset id (sort key) |
| `name` | string | Market symbol, e.g. `"BTC"` |
| `kind` | `"perp"` | Market kind (lowercase) |
| `sz_decimals` | uint8 | Size display decimals (from the underlying spot token registry; `0` if no token spec) |
| `mark_px` | Decimal string | On-book mark, **whole-USDC plane** (book mark scaled out of 1e8, oracle fallback; `"0"` if unset) |
| `oracle_px` | Decimal string | Index price, **whole-USDC plane** (`"0"` if unset) |
| `mid_px` | Decimal string \| null | Real order-book mid `(best_bid + best_ask) / 2`, **whole-USDC plane** (tick-snapped); `null` when the book is one-sided / empty |
| `premium` | Decimal string \| null | Latest committed funding premium sample (signed); `null` when no sample exists |
| `tick_size` | i128 string | Minimum price increment, **1e8 fixed-point** (order/book submission plane) |
| `step_size` | u128 string | Minimum size increment (lot size), fixed-point |
| `min_order` | u128 string | Minimum order size |
| `max_leverage` | uint8 | Maximum leverage |
| `maint_margin_ratio` | bps string | Maintenance margin ratio, decimal bps |
| `init_margin_ratio` | bps string | Initial margin ratio (`1 / max_leverage`), decimal bps |
| `funding.rate_per_hr` | bps string | Latest funding premium sample, decimal bps |
| `funding.cap_per_hr` | bps string | Funding rate cap per hour, decimal bps |
| `funding.interval_ms` | uint64 | Funding cadence (1h = `3600000`) |
| `funding.next_payment_ts` | uint64 | Next funding payment ts (`0` until a sample exists) |
| `mark_source` | string | Mark-price descriptor (`"MedianOfOraclesAndMid"`) |
| `fba_enabled` | bool | Frequent-batch-auction enabled for this market |
| `open_interest` | u128 string | Current open interest, fixed-point |

Each element is byte-identical to the corresponding single-asset `market_info`
response's `data` — both are built from the same per-market record builder, so
the single and bulk shapes never drift. See [`market_info`](#market_info) for
the field-level semantics and FLAGGED-proxy notes (`mark_source`,
`next_payment_ts`).

### `l2_book`

Market-scoped aggregated bid/ask levels.

```json
{ "type": "l2_book", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Response:

```json
{
  "type": "l2_book",
  "data": {
    "market_id": 0,
    "bids": [ { "px": "99000", "size": "700", "n_orders": 1 } ],
    "asks": [ { "px": "101000", "size": "750", "n_orders": 2 } ]
  }
}
```

Bids are best-first (descending price), asks ascending. Each level aggregates
the summed `size` and the resting-order `n_orders` count. An unknown / empty
market returns empty `bids` / `asks` arrays.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `bids[*].px` / `asks[*].px` | i128 string | Level price, fixed-point decimal string |
| `bids[*].size` / `asks[*].size` | u128 string | Summed size at the level |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Resting orders at the level |

### `recent_trades`

Market-scoped public trade tape, served directly from committed on-node state
(a bounded per-market trade ring folded into the AppHash — no external indexer).

```json
{ "type": "recent_trades", "market_id": 0 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `market_id` | uint32 | yes | Asset / market id |
| `limit` | uint32 | no | Cap the number of **most-recent** records returned; absent / `0` ⇒ the full ring |

Response:

```json
{
  "type": "recent_trades",
  "data": {
    "market_id":      0,
    "last_trade_ms":  1700000000555,
    "trades": [
      {
        "coin":  0,
        "side":  "B",
        "px":    "67042.50",
        "sz":    "0.125",
        "time":  1700000000555,
        "tid":   90123,
        "block": 562,
        "hash":  "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
      }
    ]
  }
}
```

Records are ordered oldest-first (newest last). The ring is bounded, so this is
a recent window, not all history. An unknown / never-traded market returns
`"trades": []` and `last_trade_ms: 0`.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `last_trade_ms` | uint64 | Timestamp of the last trade (`0` if none) |
| `trades[*].coin` | uint32 | Asset / market id the trade executed on |
| `trades[*].side` | `"B"` / `"A"` | Taker (aggressor) side token — `"B"` = buy, `"A"` = sell |
| `trades[*].px` | Decimal string | Execution price, **decimal USDC** (human-readable) |
| `trades[*].sz` | Decimal string | Filled size, **base units** (whole-unit) |
| `trades[*].time` | uint64 | Trade timestamp (consensus ms) |
| `trades[*].tid` | uint64 | Deterministic trade id (shared by both legs of the print) |
| `trades[*].block` | uint64 | Committed block height the trade settled in (on-chain locator) |
| `trades[*].hash` | hex string | Transaction hash of the originating order, `0x`-prefixed hex — lets a print be traced on-chain |

### `candle`

Historical OHLCV bars for `(coin, interval)` over a time window. The REST
companion to the live [`candles`](../../ws/subscriptions.md#candles) WS channel —
the WS pushes the forming bar as trades land, this read returns the closed
history.

```json
{ "type": "candle", "coin": "BTC", "interval": "1m" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | string | yes | Market symbol, e.g. `"BTC"` |
| `interval` | string | yes | Bucket token — one of `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | no | Window start (ms); filters on bar open. Default `0` |
| `end_time` | uint64 | no | Window end (ms); filters on bar open. Default unbounded |

Args may be passed flat (above) or nested under a `req` object; `start_time` /
`end_time` also accept the camelCase `startTime` / `endTime` spelling. Missing
`coin` or `interval` → `400 {"error":"missing field <name>"}`.

Response:

```json
{
  "type": "candle",
  "data": [
    {
      "t": 1700000040000,
      "T": 1700000099999,
      "s": "BTC",
      "i": "1m",
      "o": "67000.00",
      "c": "67042.50",
      "h": "67080.00",
      "l": "66990.00",
      "v": "12.5",
      "q": "837843.75",
      "n": 37
    }
  ]
}
```

Bars are ordered oldest-first by `t` (open time); the newest element is the
forming bar. An empty array is the honest-empty answer for an unsupported
`interval` token, a market with no indexed trades, or a deployment with no
indexer wired.

| Field | Type | Description |
|-------|------|-------------|
| `t` | uint64 | Bar **open** timestamp (ms, bucket-aligned) |
| `T` | uint64 | Bar **close** timestamp (ms) — `t + interval − 1` |
| `s` | string | Coin / market symbol |
| `i` | string | Interval bucket token |
| `o` / `c` / `h` / `l` | Decimal string | **O**pen / **c**lose / **h**igh / **l**ow price, **decimal USDC** (human dollars, e.g. `"67042.50"`) |
| `v` | Decimal string | **Base-asset volume** — Σ traded size in the bar (coin size, NOT notional) |
| `q` | Decimal string | **Quote (USD) volume** — `Σ price × size` over the bar's fills |
| `n` | uint64 | Trade (fill) count in the bar |

:::info
**The series is gapless.** An interval with **no trades** still emits a flat bar
that carries the prior bar's close forward: `o = h = l = c = previous close`, and
`v = q = 0`, `n = 0`. Consumers get a continuous bar-per-interval series with no
holes to interpolate. **No bar is emitted before the market's first trade** — the
series begins at the bucket of the first print, so an empty array means the market
has never traded (or no history is wired), not that early buckets were dropped.
:::

:::info
**This type is served by the gateway, not the node.** Candles are derived
display data folded from the public trade stream — they are **not** committed
chain state, never touch the app-hash, and carry no consensus guarantee. The
gateway answers `candle` from its own rolling store; a bare node queried
directly returns `unknown info type: candle`. Honest-empty (`"data": []`) when
the gateway has no trade history for the market yet.
:::

### `funding_history`

Market-scoped funding premium samples.

```json
{ "type": "funding_history", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Response:

```json
{
  "type": "funding_history",
  "data": {
    "market_id": 0,
    "samples": [
      { "ts_ms": 1700000000000, "premium": "0.0015", "funding_rate": "0.0015" },
      { "ts_ms": 1700000008000, "premium": "-0.0007", "funding_rate": "-0.0007" }
    ]
  }
}
```

Samples are the ordered ring of premium snapshots from the funding tracker.
`premium` is the exact pre-clamp `Decimal` rendered as a string (signed, full
precision); `funding_rate` is that premium passed through the per-asset funding
cap (`±funding_rate_cap`, the dynamic-risk override else the `0.04`/hr baseline)
— i.e. the realized rate that would actually be charged. When the premium is
within the cap, `funding_rate == premium`; above it, `funding_rate` is clamped to
the signed cap. An unknown / empty market returns `"samples": []`.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `samples[*].ts_ms` | uint64 | Sample timestamp (consensus ms) |
| `samples[*].premium` | decimal string | Raw funding premium sample, pre-clamp (signed) |
| `samples[*].funding_rate` | decimal string | Realized rate = `premium` clamped to the per-asset cap (signed) |

### `predicted_fundings`

Per-market predicted funding rate + next payment time, across every registered
perp market. No parameters.

```json
{ "type": "predicted_fundings" }
```

The `data` payload is an **array**, ordered deterministically by ascending
`asset` (the node iterates the market-spec `BTreeMap`). An empty universe returns
`"data": []`.

Response:

```json
{
  "type": "predicted_fundings",
  "data": [
    { "asset": 0, "predicted_rate": "0.0015", "next_funding_time": 1700003600000 }
  ]
}
```

`predicted_rate` is the latest premium sample (the per-hour rate proxy, decimal
string) — `"0"` before the first sample. `next_funding_time` is the derived next
payment timestamp (`last_sample_ts + 1h`), `0` before the first sample.

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Asset / market id |
| `predicted_rate` | decimal string | Latest premium sample (per-hour rate proxy); `"0"` pre-sample |
| `next_funding_time` | uint64 | Next funding payment timestamp (consensus ms); `0` pre-sample |

### `mip3_active_bids`

MIP-3 permissionless perp-deploy gas-auction snapshot. No parameters.

```json
{ "type": "mip3_active_bids" }
```

Response:

```json
{
  "type": "mip3_active_bids",
  "data": {
    "auction_round":   2,
    "current_bid":     "12345",
    "current_winner":  "0x<bidder>",
    "auction_end_ms":  1700086400000,
    "started_at_ms":   1700000000000,
    "bids": [
      {
        "bidder":          "0x<bidder>",
        "amount":          "12345",
        "submitted_at_ms": 1700000000500,
        "tag":             "ETH-PERP"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Current auction round |
| `current_bid` | decimal string | Leading bid amount |
| `current_winner` | hex address \| null | Current winning bidder, `null` if none |
| `auction_end_ms` | uint64 | Auction close timestamp (consensus ms) |
| `started_at_ms` | uint64 | Auction start timestamp (consensus ms) |
| `bids[*].bidder` | hex address | Bidder address |
| `bids[*].amount` | decimal string | Bid amount |
| `bids[*].submitted_at_ms` | uint64 | Bid submission timestamp (consensus ms) |
| `bids[*].tag` | string | Bid tag (e.g. the proposed market name) |

### `liquidatable`

Accounts currently flagged for liquidation. No parameters.

```json
{ "type": "liquidatable" }
```

Response:

```json
{
  "type": "liquidatable",
  "data": { "accounts": [ { "address": "0x<addr>", "tier": "PartialMarket50" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accounts[*].address` | hex address | Needs-action account |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | BOLE tier |

State source: `Exchange.bole_index.tier` (the BOLE needs-action index — **not** a full account rescan).

> **FLAGGED.** `bole_index` is `#[serde(skip)]` derived, non-canonical state, rebuilt by a full scan on first use / after snapshot load. On a freshly published snapshot it is empty until the runtime has run the BOLE pass at least once.

### `active_asset_data`

A user's per-asset leverage / margin-mode / max trade size. Required: `address` (0x hex) + `asset_id` (u32).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "asset_id": 0 }
```

Response:

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "asset_id": 0, "leverage": 7,
    "margin_mode": "isolated", "max_trade_size": "5000000000", "has_position": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `leverage` | uint32 | Position leverage if open, else account default, else market max |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Effective margin mode |
| `max_trade_size` | decimal string | Per-asset max-order ceiling (see `max_market_order_ntls`) |
| `has_position` | bool | Whether the user has a non-zero position on this asset |

State source: `locus.clearinghouses[asset].positions[addr]`, `locus.user_account_configs[addr]`, market spec / dynamic risk.

### `max_market_order_ntls`

Per-asset max market-order notional. No parameters.

```json
{ "type": "max_market_order_ntls" }
```

Response:

```json
{
  "type": "max_market_order_ntls",
  "data": { "ntls": [ { "asset_id": 0, "max_market_order_ntl": "5000000000" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | Asset id |
| `ntls[*].max_market_order_ntl` | decimal string | OI-cap-derived size ceiling |

State source: per-market `PerpAnnotation.oi_cap`, else `default_mip3_limits.max_oi_per_market`.

> **FLAGGED.** No dedicated per-asset "max market-order notional" field exists in committed state; the OI cap is the closest committed risk ceiling, reported in **size** units (the matching layer converts to notional at the live mark).

### `perps_at_open_interest_cap`

Assets whose open interest is at/over the cap. No parameters.

```json
{ "type": "perps_at_open_interest_cap" }
```

Response:

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `assets` | uint32[] | Asset ids at/over their `oi_cap`, ascending |

State source: per-book `open_interest` vs `PerpAnnotation.oi_cap` (books with no positive cap are skipped).

### `margin_table`

The margin-tier table (leverage → maint / init ratios). No parameters.

```json
{ "type": "margin_table" }
```

Response:

```json
{
  "type": "margin_table",
  "data": { "tiers": [ { "asset_id": 0, "max_leverage": 50, "maint_margin_ratio": "300", "init_margin_ratio": "200" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tiers[*].asset_id` | uint32 | Asset id |
| `tiers[*].max_leverage` | uint8 | Effective max leverage (override else static) |
| `tiers[*].maint_margin_ratio` | bps string | Maintenance margin ratio (override else 3% static floor) |
| `tiers[*].init_margin_ratio` | bps string | `1 / max_leverage` |

State source: `dynamic_risk_overrides[asset]` else the static baseline.

> **FLAGGED.** Committed state stores a single effective risk tier per market (override or static), not the multi-row leverage ladder HL serves. The proxy is one tier per market — the row the engine enforces today.

### `perp_dexs`

List the perp DEX(es). No parameters.

```json
{ "type": "perp_dexs" }
```

Response:

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | DEX index in `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Number of asset books in the DEX |
| `dexs[*].assets` | uint32[] | Asset ids in the DEX |

State source: `Exchange.perp_dexs`.


## See also

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Spot & margin queries](./spot.md) — spot / spot-margin / Earn reads
- [Perpetuals](../../../products/perpetuals.md) — the product
