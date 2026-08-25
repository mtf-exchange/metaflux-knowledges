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
`coin`) is rejected with `400 {"error":"missing field coin"}`. These market reads
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

```json
{ "type": "markets" }
```

Filter to one product with `kind`, or to one market with `coin` (both absent ⇒
every section, every market):

```json
{ "type": "markets", "kind": "perp" }
{ "type": "markets", "coin": "BTC" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter — absent = both; `"perp"` = the perp array only; `"spot"` = the spot section only |
| `coin` | string | no | Market filter — keep only the row for this symbol. Unknown symbol → `404 {"error":"market not found"}` |

**`coin` narrows the SAME rows; it does not change the shape.** The response is
still `{perp: [...], spot: {...}}`, with the arrays cut to the matching row. A
client that wants one market pays one round trip and parses one shape.

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
          "signing_id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
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

Each `perp` row is the **dynamic** half of a market; the **static** counterpart
lives on [`markets_meta`](#markets_meta), joined on `(coin, kind)`.
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

```json
{ "type": "markets_meta" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Section filter — absent = both; `"perp"` = the perp array only; `"spot"` = the spot section only |
| `coin` | string | no | Market filter — keep only the row for this symbol. Unknown symbol → `404 {"error":"market not found"}` |

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
        "open":            true,
        "disable_close":   false,
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "signing_id":      0,
        "risk_override":   null
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

Each `perp` row is the **static** half of a market, joined to its dynamic
[`markets`](#markets) row on `(coin, kind)`. None of
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
| `perp[*].margin_tiers` | array | Notional-banded leverage ladder; each `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`, ascending upper-bound bands, `null` = unbounded top tier |
| `perp[*].strict_isolated` | bool | Market forces strict-isolated margin |
| `perp[*].open` / `close` | bool | Whether opening / closing is ALLOWED on this market. They state what is permitted, not what is forbidden |
| `perp[*].oi_cap` | Decimal string | Governance open-interest cap, in the market's size units; **OMITTED** entirely when the market is uncapped (never a fabricated `"0"`) |
| `perp[*].mark_source` | `"oracle_median"` \| `"sync_oracle"` \| `"custom"` | Mark-price source descriptor tracking the committed mark mode — `"oracle_median"` = the default live 3-component median, `"sync_oracle"` = mark follows the oracle price directly, `"custom"` = mark frozen at a governance-set custom price |
| `perp[*].fba_enabled` | bool | Frequent-batch-auction enabled for this market |
| `perp[*].signing_id` | uint32 | **The number you put in the EIP-712 `market` field when you sign an order for this market.** It has no other meaning on the read plane — do not use it as a sort key, a join key, or a market identity. See below |
| `perp[*].risk_override` | object \| null | The governance risk override in force on this market, or `null` when the market runs on the defaults. See below |
| `spot.pairs` / `spot.tokens` | array | Spot pair / token registry, identical to [`markets`](#markets) (see [the spot registry](./spot.md#spot_meta)) |

For the spot pair / token field semantics see [the spot registry](./spot.md#spot_meta).

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
  "maint_margin_ratio": "250",
  "init_margin_ratio":  "500",
  "funding_rate_cap":   "0.02",
  "oi_cap":             "1000000"
}
```

Every key inside is optional: an override that moves only `max_leverage`
carries only `max_leverage`. A key that is absent is not overridden, and the
market's default (the sibling field on this same row) applies.

**`null` and an empty object are different answers.** `null` means no override
exists. An object with no overridden keys means an override record exists and
overrides nothing. Rendering the two the same way is the exact confusion this
field was added to end — the market's own row is where a caller looks, so the
answer belongs here and not on a separate read.

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
    "bids": [ { "px": "61663.1", "sz": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "sz": "0.04862", "n_orders": 1 } ]
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

### Get public trades, recent or windowed {#trades}

Market-scoped public trade tape. One read answers both asks: send `coin` alone
for the recent window, or add `start_time` / `end_time` for a time window.

> ⬆️ **Upgrade notice — not live yet.** Today the node answers this tape under
> two older names, `recent_trades` (un-ranged) and `trades_by_time` (ranged).
> Both go away at the release that ships `trades`; until then a
> `{"type":"trades"}` request answers `400 {"error":"unknown info type: trades"}`.

```json
{ "type": "trades", "coin": "BTC" }
{ "type": "trades", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol |
| `limit` | uint32 | no | Cap the number of **most-recent** records returned; absent / `0` ⇒ the full ring |
| `start_time` | uint64 | no | Window start (consensus ms, inclusive); filters on trade `time`. Absent ⇒ open lower bound |
| `end_time` | uint64 | no | Window end (consensus ms, inclusive). Absent ⇒ open upper bound |

Response:

```json
{
  "type": "trades",
  "data": {
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
        "tid":   17691615279761551171,
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

An **un-ranged** ask returns records NEWEST-FIRST (the newest trade is element
0). A **ranged** ask returns them oldest-first. The node ring is bounded, so an
un-ranged ask is a recent window, not all history. An unknown / never-traded
market returns `"trades": []` and `last_trade: 0`.

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Echoed market symbol |
| `last_trade` | uint64 | Timestamp of the newest trade in this answer (`0` if none). The key is `last_trade`, NOT `last_trade_ms` |
| `start_time` / `end_time` | uint64 \| null | Echoed window bounds; `null` for a bound you omitted |
| `trades[*].coin` | string | Market symbol the trade executed on |
| `trades[*].side` | `"B"` / `"A"` | Taker (aggressor) side token — `"B"` = buy, `"A"` = sell |
| `trades[*].px` | Decimal string | Execution price, **decimal USDC** (human-readable) |
| `trades[*].sz` | Decimal string | Filled size, **base units** (whole-unit) |
| `trades[*].time` | uint64 | Trade timestamp (consensus ms) |
| `trades[*].tid` | uint64 | Deterministic trade id (shared by both legs of the print); may exceed 2⁵³ — parse as a 64-bit / big integer, not a JS number |
| `trades[*].block` | uint64 | Committed block height the trade settled in (on-chain locator) |
| `trades[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex — lets a print be traced on-chain. **Empty string (`""`) when there is no signed taker action** behind the print (a system / begin-block print, or a maker leg whose submit hash is not carried) |

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

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "candle_type": "mark", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | yes | Market symbol, e.g. `"BTC"` |
| `interval` | string | yes | Bucket token — one of `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `candle_type` | string | no | Series — `mark` (default), `oracle` or `trade`. Lower-case, exact match |
| `start_time` | uint64 | no | Window start (ms); filters on bar open. Default `0` |
| `end_time` | uint64 | no | Window end (ms); filters on bar open. Default unbounded |

Missing `coin` → `400 {"error":"missing field coin"}`; missing `interval` →
`400 {"error":"missing field interval"}`. An unknown `candle_type` →
``400 {"error":"invalid candle_type: <token> (expected `mark`, `oracle` or `trade`)"}``.
A rejected value is never served as another series.

**`trade` is accepted.** All three tokens in the table above are live. An earlier
version of this page said `trade` was retired and quoted a two-value rejection
message. That was wrong on both counts.

Response:

```json
{
  "type": "candle_snapshot",
  "data": {
    "candles": [
      {
        "t": 1783000020000,
        "T": 1783000079999,
        "s": "BTC",
        "i": "1m",
        "o": "61646.1",
        "c": "61652.7",
        "h": "61652.7",
        "l": "61646.1",
        "v": "0",
        "q": "0",
        "n": 12
      }
    ]
  }
}
```

Bars are ordered oldest-first by `t` (open time); the newest element is the
forming bar. A bar needs **no trade**: a price exists at all times, so the series
covers every window the samples cover. A market that has never traded still has
bars. A window with no sample carries the previous close forward as a flat bar
(`o = h = l = c`, `n = 0`).

An empty `candles` array is the honest-empty answer for a market with no history
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

| Field | Type | Description |
|-------|------|-------------|
| `t` | uint64 | Bar **open** timestamp (ms, bucket-aligned) |
| `T` | uint64 | Bar **close** timestamp (ms) |
| `s` | string | Market symbol |
| `i` | string | Interval bucket token |
| `o` / `c` / `h` / `l` | Decimal string | **O**pen / **c**lose / **h**igh / **l**ow price, **whole-unit decimal** string (e.g. `"61652.7"`) — the same plane [`markets`](#markets) reports `mark_px` in |
| `v` | Decimal string | Always `"0"`. A price bar folds no trades, so it carries no base-asset volume |
| `q` | Decimal string | Always `"0"`. A price bar folds no trades, so it carries no quote volume |
| `n` | uint64 | **Sample count** — how many price samples the bar folded. It is **not** a trade count. `0` on a carry-forward bar |

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

| Field | Type | Description |
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
    "max_trade_size": null, "max_trade_szs": ["0", "0"],
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
| `max_trade_size` | decimal string \| null | Open-interest headroom left on the WHOLE market, in **size** units: `oi_cap − total_open_interest`, floored at `0`. `null` when the market carries no cap. **Not a per-user limit** — see below |
| `max_trade_szs` | [decimal string, decimal string] | Size the CALLER can still trade `[buy, sell]`, from their own margin |
| `available_to_trade` | [decimal string, decimal string] | Notional the CALLER can still open `[buy, sell]` |
| `has_position` | bool | Whether the user has a non-zero position on this market |

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
`400 {"error":"unknown info type: margin_table"}`.
:::

### List perp DEXs and their limits {#perp_dexs}

The perp DEX(es) plus the governance-set permissionless-deploy (MIP-3) and
per-market limit configuration. No parameters. The unit planes are load-bearing
and deliberately explicit in the field names.

```json
{ "type": "perp_dexs" }
```

Response:

```json
{
  "type": "perp_dexs",
  "data": {
    "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ],
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

| Field | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | DEX index in `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Number of asset books in the DEX |
| `dexs[*].assets` | uint32[] | Asset ids in the DEX |
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

State source: `Exchange.perp_dexs` + `Exchange.mip3_config` (+ its `per_market_limits`).


## See also {#see-also}

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Spot & margin queries](./spot.md) — spot / spot-margin / Earn reads
- [Perpetuals](../../../products/perpetuals.md) — the product
