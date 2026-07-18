---
description: POST /info read queries for perpetual markets — market info, order books, trades, funding, liquidation, and perp deploy state.
---

# `POST /info` — perpetual queries

Read queries for **perpetual** markets. Same `POST /info` endpoint, envelope, and conventions as the [base page](../info.md) — these are the perp-market-specific `type`s.

:::info
**Markets are keyed by `coin` (symbol).** Every market-scoped read
(`market_info`, `l2_book`, `recent_trades`, `trades_by_time`, `funding_history`,
`oracle_sources`, `active_asset_data`, `fba_batch_state`, …) resolves the market
by its **`coin` symbol** (`"BTC"`, `"ETH"`, …). The legacy numeric `asset_id` /
`market_id` request arguments have been **removed** — a request that supplies
them (and omits `coin`) is rejected with `400 {"error":"missing field coin"}`.
These market reads echo the `coin` symbol in their responses. (Only the signed
`/exchange` write path still addresses markets by numeric `asset` — that field is
consensus-frozen; see [`POST /exchange`](../exchange.md).)
:::

## Perpetual query types {#perpetual-query-types}

### Get per-market metadata {#market_info}

Per-market metadata. Resolve the market by its `coin` symbol.

```json
{ "type": "market_info", "coin": "BTC" }
```

| Arg | Type | Required |
|-----|------|----------|
| `coin` | symbol | yes |

Missing `coin` → `400 {"error":"missing field coin"}`; unknown symbol → `404 {"error":"market not found"}`.

Response:

```json
{
  "type": "market_info",
  "data": {
    "coin":               "BTC",
    "kind":               "perp",
    "sz_decimals":        5,
    "mark_px":            "61550.2",
    "oracle_px":          "61501.7",
    "mid_px":             "61669.4",
    "impact_pxs":         ["61663.1", "61675.7"],
    "premium":            "0.00209225",
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
    "funding": {
      "rate_per_hr":     "21",
      "cap_per_hr":      "1120",
      "interval_ms":     3600000,
      "next_payment_ts": 1783011600000
    },
    "mark_source":   "oracle_median",
    "fba_enabled":   false,
    "open_interest": "0.02346",
    "day_ntl_vlm":   "3772.890084",
    "change_24h":    "-0.00274143",
    "prev_day_px":   "61719.4",
    "disable_open":  false,
    "disable_close": false,
    "halted":        false,
    "strict_isolated": false,
    "asset_id":      0,
    "token": {
      "id":                 101,
      "wei_decimals":       8,
      "token_id":           "0x0000000000000000000000000000000000000000000000000000000000000065",
      "system_address":     "0x2000000000000000000000000000000000000065",
      "evm_contract":       null,
      "is_canonical":       true,
      "circulating_supply": "0"
    }
  }
}
```

:::warning
**`asset_id` is DEPRECATED.** It is retained temporarily as an indexer-shim
convenience only — do **not** build against it, and do **not** use it as a request
argument (it is no longer accepted). Address markets by `coin` everywhere. It may
be dropped without a wire-version bump.
:::

:::info
**Price reporting plane.** `mark_px`, `oracle_px`, `mid_px`, `tick_size`,
`step_size`, and `min_order` are reported in the **human-decimal plane**
(`"61550.2"`, `"0.1"`, `"0.00001"`), the same unit as account positions' mark.
`mark_px` is the on-book mark, falling back to the oracle px when the book has no
mark yet; `oracle_px` is the latest committed index price; either is `"0"` when
unset. The **order submission plane is a separate 1e8 fixed-point plane** — an
`/exchange` order `limit_px` is a raw 1e8 magnitude, NOT a human decimal; MTF
keeps those two scale planes distinct. Read surfaces (including
[`l2_book`](#l2_book) level prices) report human-decimal strings.
:::

:::info
**`margin_tiers` — the inline notional-banded leverage ladder.** `market_info`
(and each row of [`markets`](#markets)) carries the market's maintenance-margin
ladder **inline** as `margin_tiers` — an ascending list of upper-bound bands:

- `max_open_interest` — **upper bound** of the band (decimal string, in the
  market's size units); `null` marks the **unbounded top tier**.
- `max_leverage` — max leverage allowed while open interest sits in this band (`u8`).
- `maint_margin_ratio` — maintenance-margin ratio for the band, **decimal bps
  string** (`"100"` = 1.00%).

A position's tier is the first band whose `max_open_interest` bound its open
interest does not exceed (the `null` top band catches everything above the last
finite bound). Leverage falls and the maintenance ratio rises as open interest
grows. This replaces the removed standalone `margin_table` query — the ladder now
rides on the market record itself.
:::

:::info
**Price precision vs `sz_decimals`.** `sz_decimals` is **SIZE** precision (order
quantity granularity — `5` ⇒ `0.00001` units); it does **not** govern price
decimals, which are set by the price tick (`tick_size`). The two are independent
axes.
:::

:::info
**`token` — the perp's underlying spot-token identity + issuance (optional).**
When the token registry hosts a token whose name matches the perp's symbol, the
record carries a `token` object so a consumer needs no name-join into the spot
registry. It mirrors the corresponding `markets_meta` spot-token row field-for-field:

- `id` — the token's registry id (`u32`).
- `wei_decimals` — the token's native wei precision (`u8`).
- `token_id` — the 32-byte token id, `0x`-hex.
- `system_address` — the token's system address, `0x`-hex.
- `evm_contract` — `{ address, evm_extra_wei_decimals }` when the token has a bound
  EVM contract, else `null`.
- `is_canonical` — whether this is the canonical token for the symbol (`bool`).
- `circulating_supply` — committed issuance, a decimal string (`"0"` when none).

The whole object is **omitted** for a perp with no registered underlying token
(never fabricated). The identical block is emitted on each
[`markets_meta`](#markets_meta) perp row.
:::

`market_info` returns the **full** record — the union of the **dynamic** fields
served by [`markets`](#markets) (`mark_px`, `oracle_px`, `mid_px`, `impact_pxs`,
`premium`, `funding`, `open_interest`, `day_ntl_vlm`, `prev_day_px`,
`change_24h`, `halted`) and the **static** fields served by
[`markets_meta`](#markets_meta) (`sz_decimals`, `tick_size`, `step_size`,
`min_order`, `max_leverage`, the margin ratios, `margin_tiers`,
`strict_isolated`, `disable_open` / `disable_close`, `oi_cap`, `mark_source`,
`fba_enabled`, `asset_id`, the optional `token` block). See those two reads for per-field semantics.

### Get live state for all markets {#markets}

Every registered market's **live (dynamic)** state — the per-commit fields that
move every block (mark / oracle / mid price, funding premium, open interest, the
rolling-24h ticker, `halted`) plus the `(coin, kind)` join keys — together with
the spot pair/token registry. The long-lived **static** metadata (precision grids,
leverage / margin ladders, mark source, trade-control flags) is served separately
by [`markets_meta`](#markets_meta); [`market_info`](#market_info) returns both
halves for a single coin.

```json
{ "type": "markets" }
```

Filter to one product with `kind` (absent ⇒ both sections):

```json
{ "type": "markets", "kind": "perp" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter — absent = both; `"perp"` = the perp array only; `"spot"` = the spot section only |

The `data` payload is an **object** with a `perp` array (each a **dynamic** row)
and a `spot` `{pairs, tokens}` object. `perp` rows are ordered deterministically by
ascending market id; `spot.pairs` / `spot.tokens` in pair-/token-id order.

Response (truncated to one entry per list):

```json
{
  "type": "markets",
  "data": {
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
          "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "active": true, "mark_px": "50000", "mid_px": "50000", "prev_day_px": null,
          "day_ntl_vlm": "0", "min_notional": "1", "taker_fee_bps": "5",
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

Each `perp` row is the **dynamic** half of the [`market_info`](#market_info)
bundle — built from the same builder, so the two never drift; the **static**
counterpart lives on [`markets_meta`](#markets_meta), joined on `(coin, kind)`.
`mid_px` is **omitted** from a row when the book is one-sided (never sent as
`null`). The live WS [`markets`](../../ws/subscriptions.md#markets) channel streams
these same dynamic rows (a full snapshot on subscribe, then changed-row deltas).

| Field | Type | Description |
|-------|------|-------------|
| `perp[*].coin` | string | Market symbol, e.g. `"BTC"` (the join key) |
| `perp[*].kind` | `"perp"` | Market kind (lowercase, join key) |
| `perp[*].mark_px` | Decimal string | On-book mark, **human-decimal plane**, tick-snapped (oracle fallback; `"0"` if unset) |
| `perp[*].oracle_px` | Decimal string | Index price, human-decimal plane, tick-snapped (`"0"` if unset) |
| `perp[*].mid_px` | Decimal string | Order-book mid `(best_bid + best_ask) / 2`, human-decimal, tick-snapped; **omitted** when one-sided / empty |
| `perp[*].impact_pxs` | [Decimal string, Decimal string] | Depth-aware impact prices `[bid, ask]` — the book-walk prices for the funding impact notional (the same walk the funding premium samples), human-decimal, tick-snapped; **omitted** entirely when either side of the book cannot fill the impact notional |
| `perp[*].premium` | Decimal string \| null | Latest committed funding premium sample (signed), an **8-decimal** string (truncated toward zero); `null` when none |
| `perp[*].funding.rate_per_hr` | bps string | The hourly funding rate that would be **charged** — the derived rate clamped to the per-asset cap (the same clamp settlement applies), decimal bps |
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

The **static** per-market fields (`sz_decimals`, `tick_size`, `step_size`,
`min_order`, `max_leverage`, `maint_margin_ratio`, `init_margin_ratio`,
`margin_tiers`, `strict_isolated`, `disable_open` / `disable_close`, `oi_cap`,
`mark_source`, `fba_enabled`, `asset_id`) are **not** on this read — fetch them
from [`markets_meta`](#markets_meta). For the spot pair / token field semantics
see [the spot registry](./spot.md#spot_meta).

### Get static metadata for all markets {#markets_meta}

Every registered market's **static** metadata — the long-lived fields a market
publishes once and rarely changes (precision grids, leverage / margin ladders,
trade-control flags, mark source) plus the `(coin, kind)` join keys — together
with the spot pair/token registry. The static counterpart to [`markets`](#markets):
the two halves together cover every field [`market_info`](#market_info) returns, so
a client can cache the static half and poll only the dynamic [`markets`](#markets)
half. Same optional `kind` filter.

```json
{ "type": "markets_meta" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter — absent = both; `"perp"` = the perp array only; `"spot"` = the spot section only |

The `data` payload is an **object** with a `perp` array (each a **static** row) and
the same `spot` `{pairs, tokens}` object [`markets`](#markets) returns. `perp` rows
are ordered by ascending market id.

Response (perp truncated to one entry; the `spot` section is identical to
[`markets`](#markets)):

```json
{
  "type": "markets_meta",
  "data": {
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
        "disable_open":    false,
        "disable_close":   false,
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "asset_id":        0
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

Each `perp` row is the **static** half of the [`market_info`](#market_info)
bundle, joined to its dynamic [`markets`](#markets) row on `(coin, kind)`. None of
the per-commit dynamic fields (`mark_px`, `oracle_px`, `mid_px`, `impact_pxs`,
`premium`, `funding`, `open_interest`, `day_ntl_vlm`, `prev_day_px`, `change_24h`,
`halted`) appear here.

| Field | Type | Description |
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
| `perp[*].margin_tiers` | array | Notional-banded leverage ladder (see [`market_info`](#market_info)); each `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`, ascending upper-bound bands, `null` = unbounded top tier |
| `perp[*].strict_isolated` | bool | Market forces strict-isolated margin |
| `perp[*].disable_open` / `disable_close` | bool | Open / close disabled for this market |
| `perp[*].oi_cap` | Decimal string | Governance open-interest cap, in the market's size units; **OMITTED** entirely when the market is uncapped (never a fabricated `"0"`) |
| `perp[*].mark_source` | `"oracle_median"` \| `"sync_oracle"` \| `"custom"` | Mark-price source descriptor tracking the committed mark mode — `"oracle_median"` = the default live 3-component median, `"sync_oracle"` = mark follows the oracle price directly, `"custom"` = mark frozen at a governance-set custom price |
| `perp[*].fba_enabled` | bool | Frequent-batch-auction enabled for this market |
| `perp[*].asset_id` | uint32 | **DEPRECATED** indexer-shim field — do not build against it |
| `spot.pairs` / `spot.tokens` | array | Spot pair / token registry, identical to [`markets`](#markets) (see [the spot registry](./spot.md#spot_meta)) |

For the spot pair / token field semantics see [the spot registry](./spot.md#spot_meta).

### Get aggregated order book levels {#l2_book}

Market-scoped aggregated bid/ask levels — full tick-precise depth by default,
optionally grouped to a coarser significant-figure price grid.

```json
{ "type": "l2_book", "coin": "BTC" }
```

Grouped to a coarser grid:

```json
{ "type": "l2_book", "coin": "BTC", "n_sig_figs": 5, "mantissa": 5 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol — a perp symbol (`"BTC"`) or a spot pair name (`"BTC/USDC"`); a spot pair renders its spot order-book depth in the pair's own tick / size planes |
| `n_sig_figs` | uint | no | Group levels to this many significant figures — an integer `2`–`5`. Absent ⇒ the full-depth, tick-precise book |
| `mantissa` | uint | no | Sub-step for `n_sig_figs: 5` **only** — one of `1`, `2`, `5` (the grid step is `mantissa ×` the 5-sig-fig step). Invalid with any other `n_sig_figs` |
| `n_levels` | uint | no | Per-side depth cap — keep only the best `n_levels` aggregated levels per side (applied **after** grouping, so a capped grouped book covers more raw depth). Absent ⇒ no cap |

Missing `coin` → `400 {"error":"missing field coin"}`.

:::info
**Grouping is a GATEWAY-side aggregation.** The node always serves the full-depth
book; the gateway applies `n_sig_figs` / `mantissa` to the response. Grouped
levels round **away from the spread** — bid prices round **down** (floor), ask
prices round **up** (ceil) onto the grid — so a grouped level never displays a
better price than its orders actually rest at, and the sizes of collapsed levels
are **summed** (per-side total size is conserved). The `n_levels` depth cap is
likewise gateway-applied, counted over the AGGREGATED levels. A request without
grouping / depth args is forwarded verbatim and returns the live book untouched.
Querying a bare node directly, the grouping / depth args are ignored — full
depth either way.
:::

Response:

```json
{
  "type": "l2_book",
  "data": {
    "coin": "BTC",
    "bids": [ { "px": "61663.1", "size": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "size": "0.04862", "n_orders": 1 } ]
  }
}
```

Bids are best-first (descending price), asks ascending. Each level aggregates
the summed `size` and the resting-order `n_orders` count. An unknown / empty
market returns empty `bids` / `asks` arrays.

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `bids[*].px` / `asks[*].px` | Decimal string | Level price, **human-decimal** (tick-snapped; the grouped grid price when grouping args are sent) |
| `bids[*].size` / `asks[*].size` | Decimal string | Summed size at the level (whole units) |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Resting orders aggregated into the level |

### Get recent public trades {#recent_trades}

Market-scoped public trade tape, served directly from committed on-node state
(a bounded per-market trade ring folded into the AppHash — no external indexer).

```json
{ "type": "recent_trades", "coin": "BTC" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `limit` | uint32 | no | Cap the number of **most-recent** records returned; absent / `0` ⇒ the full ring |

Response:

```json
{
  "type": "recent_trades",
  "data": {
    "coin":           "BTC",
    "last_trade_ms":  1783001424768,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783001424768,
        "tid":   17691615279761551171,
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
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
| `coin` | string | Echoed market symbol |
| `last_trade_ms` | uint64 | Timestamp of the last trade (`0` if none) |
| `trades[*].coin` | string | Market symbol the trade executed on |
| `trades[*].side` | `"B"` / `"A"` | Taker (aggressor) side token — `"B"` = buy, `"A"` = sell |
| `trades[*].px` | Decimal string | Execution price, **decimal USDC** (human-readable) |
| `trades[*].sz` | Decimal string | Filled size, **base units** (whole-unit) |
| `trades[*].time` | uint64 | Trade timestamp (consensus ms) |
| `trades[*].tid` | uint64 | Deterministic trade id (shared by both legs of the print); may exceed 2⁵³ — parse as a 64-bit / big integer, not a JS number |
| `trades[*].block` | uint64 | Committed block height the trade settled in (on-chain locator) |
| `trades[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex — lets a print be traced on-chain. **Empty string (`""`) when there is no signed taker action** behind the print (a system / begin-block print, or a maker leg whose submit hash is not carried) |

### Get trades in a time window {#trades_by_time}

Like [`recent_trades`](#recent_trades), but filtered to a `[start_time, end_time]`
window over the per-market trade ring — the bounded recent window. For deep
history beyond the ring, use the gateway archive types.

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `start_time` | uint64 | no | Window start (ms, inclusive); filters on trade `time`. Absent ⇒ open lower bound |
| `end_time` | uint64 | no | Window end (ms, inclusive). Absent ⇒ open upper bound |

Response:

```json
{
  "type": "trades_by_time",
  "data": {
    "coin":       "BTC",
    "start_time": 1783000000000,
    "end_time":   1783011600000,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783000781368,
        "tid":   4898317237641214538,
        "block": 37692,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

`trades` uses the same per-trade shape as [`recent_trades`](#recent_trades),
oldest-first. `start_time` / `end_time` are echoed back (either `null` when
omitted). An out-of-window / never-traded market returns `"trades": []`.

### Get historical OHLCV candles {#candle_snapshot}

Historical OHLCV bars for `(coin, interval)`. The single candle query
(the standalone `candle` type has been **removed**): archive-first —
served from the archive when one is wired, falling back to bars folded from the
public trade stream otherwise. The REST companion to the live
[`candles`](../../ws/subscriptions.md#candles) WS channel.

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol, e.g. `"BTC"` |
| `interval` | string | yes | Bucket token — one of `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | no | Window start (ms); filters on bar open. Default `0` |
| `end_time` | uint64 | no | Window end (ms); filters on bar open. Default unbounded |

Missing `coin` → `400 {"error":"missing field coin"}`; missing `interval` →
`400 {"error":"missing field interval"}`.

Response:

```json
{
  "type": "candle_snapshot",
  "data": {
    "candles": [
      {
        "t": 1783000020000,
        "T": 1783000080000,
        "i": "1m",
        "o": "6164610000000",
        "c": "6165270000000",
        "h": "6165270000000",
        "l": "6164610000000",
        "v": "576",
        "n": 24
      }
    ]
  }
}
```

Bars are ordered oldest-first by `t` (open time); the newest element is the
forming bar. An empty `candles` array is the honest-empty answer for a market
with no history (or no archive/fold source wired).

| Field | Type | Description |
|-------|------|-------------|
| `t` | uint64 | Bar **open** timestamp (ms, bucket-aligned) |
| `T` | uint64 | Bar **close** timestamp (ms) |
| `i` | string | Interval bucket token |
| `o` / `c` / `h` / `l` | Decimal string | **O**pen / **c**lose / **h**igh / **l**ow price, **1e8 fixed-point** string (e.g. `"6165270000000"` = `61652.7`) |
| `v` | Decimal string | **Base-asset volume** — Σ traded size in the bar (size units, NOT notional) |
| `n` | uint64 | Trade (fill) count in the bar |

### Get funding premium history {#funding_history}

Market-scoped funding premium samples (the premium ring).

```json
{ "type": "funding_history", "coin": "BTC" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `start_time` | uint64 | no | Window start (ms); filters on sample `ts_ms` |
| `end_time` | uint64 | no | Window end (ms) |

Missing `coin` → `400 {"error":"missing field coin"}`.

Response:

```json
{
  "type": "funding_history",
  "data": {
    "coin": "BTC",
    "samples": [
      { "ts_ms": 1783008579269, "premium": "0.00027179", "funding_rate": "0.00027179" },
      { "ts_ms": 1783008587316, "premium": "0.0005469",  "funding_rate": "0.0005469" }
    ]
  }
}
```

Samples are the ordered ring of premium snapshots from the funding tracker.
`premium` is the exact pre-clamp `Decimal` rendered as a string (signed, full
precision); `funding_rate` is that premium passed through the per-asset funding
cap — the realized rate that would actually be charged. When the premium is
within the cap, `funding_rate == premium`; above it, `funding_rate` is clamped to
the signed cap. An unknown / empty market returns `"samples": []`.

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `samples[*].ts_ms` | uint64 | Sample timestamp (consensus ms) |
| `samples[*].premium` | decimal string | Raw funding premium sample, pre-clamp (signed) |
| `samples[*].funding_rate` | decimal string | Realized rate = `premium` clamped to the per-asset cap (signed) |

### Get predicted funding rates {#predicted_fundings}

Per-market predicted funding rate + next settlement time, across every registered
perp market. No parameters.

```json
{ "type": "predicted_fundings" }
```

The `data` payload is an **array**, one entry per registered perp market, in
ascending market order. An empty universe returns `"data": []`.

Response:

```json
{
  "type": "predicted_fundings",
  "data": [
    { "coin": "BTC", "predicted_rate": "0.0020702132945825193491902456", "next_funding_time": 1783011600000 },
    { "coin": "ETH", "predicted_rate": "0.0091563951859402408793685995", "next_funding_time": 1783011600000 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Market symbol |
| `predicted_rate` | decimal string | The **clamped** rate that would actually be charged at the upcoming boundary — the premium passed through the per-asset `±cap`, signed (`"0"` before the first sample) |
| `next_funding_time` | uint64 | The **next aligned per-asset settlement boundary** (epoch-ms); `0` before the first sample |

:::info
**`predicted_rate` is the charged rate, not the raw premium.** It reflects the
per-asset funding cap applied — the number a position would be debited/credited if
funding settled now. Funding settles **discretely** at the per-asset boundary
(`next_funding_time`), on a per-asset `interval_ms` cadence (1h default). For the
raw pre-clamp premium series see [`funding_history`](#funding_history); for the
cadence / boundary see [`market_info`](#market_info) `funding.interval_ms` /
`funding.next_payment_ts`.
:::

### Get perp-deploy gas-auction state {#mip3_active_bids}

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

### Get perp-deploy and per-market limits {#perp_dex_limits}

The governance-set permissionless-deploy (MIP-3) and per-market limit
configuration. No parameters. The unit planes are load-bearing and deliberately
explicit in the field names.

```json
{ "type": "perp_dex_limits" }
```

Response:

```json
{
  "type": "perp_dex_limits",
  "data": {
    "mip3_enabled":            true,
    "min_deploy_stake_base":   "100000000000",
    "min_deploy_stake_mtf":    "500000",
    "gas_auction_min_bid":     "100",
    "auction_duration_blocks": 1000,
    "deployer_fee_cap_bps":    300,
    "dutch_start_multiplier":  "2",
    "per_market_limits": {
      "max_oi":            "1000000000000",
      "max_leverage":      50,
      "max_taker_fee_bps": "10.0",
      "max_oi_per_second": "10000000000"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mip3_enabled` | bool | Permissionless (MIP-3) perp deploy enabled |
| `min_deploy_stake_base` | u128 string | Deployer **self-stake floor**, MTF base units |
| `min_deploy_stake_mtf` | Decimal string | Permissionless-deploy **staking bond**, whole-MTF. An independent governance knob from `min_deploy_stake_base` — two thresholds, not one value on two planes |
| `gas_auction_min_bid` | Decimal string | Deploy gas-auction minimum bid, whole-USDC |
| `auction_duration_blocks` | uint64 | Gas-auction window length, in blocks |
| `deployer_fee_cap_bps` | uint | Ceiling on the per-market deployer fee share (bps) |
| `dutch_start_multiplier` | Decimal string | Dutch-auction start-price multiplier over the minimum bid |
| `per_market_limits.max_oi` | u128 string | Per-market open-interest cap, size base units |
| `per_market_limits.max_leverage` | uint | Max leverage a deployed market may offer |
| `per_market_limits.max_taker_fee_bps` | bps string | Per-market taker-fee ceiling, decimal bps (same render as [`fee_schedule`](../info.md#fee_schedule)) |
| `per_market_limits.max_oi_per_second` | u128 string | Per-market open-interest growth-rate cap, size base units per second |

State source: `Exchange.mip3_config` (+ its `per_market_limits`).

### List accounts flagged for liquidation {#liquidatable}

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

### Get a user's market trading limits {#active_asset_data}

A user's per-market leverage / margin-mode / max trade size. Required: `address`
(0x hex) + `coin` (symbol).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "coin": "BTC" }
```

| Arg | Type | Required |
|-----|------|----------|
| `address` | hex address | yes |
| `coin` | symbol | yes |

Missing `address` → `400 {"error":"missing field: address"}`; missing `coin` →
`400 {"error":"missing field coin"}`.

Response:

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "coin": "BTC", "leverage": 50,
    "margin_mode": "cross", "mark_px": "61550.29664777",
    "max_trade_size": "0", "max_trade_szs": ["0", "0"],
    "available_to_trade": ["0", "0"], "has_position": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `leverage` | uint32 | Position leverage if open, else account default, else market max |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Effective margin mode |
| `mark_px` | decimal string | Current mark, human-decimal plane |
| `max_trade_size` | decimal string | Per-market max-order ceiling (see [`max_market_order_ntls`](#max_market_order_ntls)) |
| `max_trade_szs` | [decimal string, decimal string] | Max tradable size `[buy, sell]` |
| `available_to_trade` | [decimal string, decimal string] | Notional available to open `[buy, sell]` |
| `has_position` | bool | Whether the user has a non-zero position on this market |

### Get max market-order notional caps {#max_market_order_ntls}

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

### List assets at the open-interest cap {#perps_at_open_interest_cap}

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

### `margin_table` — removed {#margin_table--removed}

:::warning
**`margin_table` has been REMOVED.** The margin ladder now rides **inline** on
each market record as `margin_tiers` — read it from
[`market_info`](#market_info) (single market) or [`markets`](#markets) (all
markets). Each tier is `{max_open_interest: string|null, max_leverage: u8,
maint_margin_ratio: bps-string}`: ascending upper-bound bands, `null` = unbounded
top tier. A `margin_table` request now returns
`400 {"error":"unknown info type: margin_table"}`.
:::

### List perp DEXs {#perp_dexs}

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


## See also {#see-also}

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Spot & margin queries](./spot.md) — spot / spot-margin / Earn reads
- [Perpetuals](../../../products/perpetuals.md) — the product
