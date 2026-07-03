# WS subscription channels

:::info
**Status.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `markets`, `fills`, `user_events`, `candles`, `order_updates`, `open_orders`, `notifications`, `ledger_updates`, `active_asset_data`, `user_fundings`, `user_twap_slice_fills`, `user_twap_history`, `account_state`, `spot_state`, `explorer_block`, and `explorer_txs` are live and push real committed data — change-driven, a channel emits a frame only when its state actually changed since the last commit. Everything else under [Roadmap](#roadmap--not-yet-available) is not wired. The connection lifecycle and frame format are in the [WS README](./index.md). Per-market channels (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) require a `coin`; `candles` requires a `coin` **and** an `interval`; per-account channels (`fills`, `user_events`, `open_orders`) require a `user` (the 0x address); `active_asset_data` requires **both** a `user` and a `coin`; the global channels `all_mids`, `markets`, `explorer_block`, and `explorer_txs` take neither.

:::warning
**`web_data2` (REST + WS) has been REMOVED.** Compose the equivalent from
[`account_state`](#account_state) + [`spot_state`](#spot_state) + `order_updates`
(or the REST focused reads). Subscribing to `web_data2` now returns
`{"channel":"error","data":{"error":"unknown channel: web_data2"}}`.
:::
:::

:::info
**Channel names are snake_case (MTF-native).** This is the node `/ws` native surface, so channel wire names are snake_case (`l2_book`, `user_events`, …). The gateway serves this same native WS at `<net>-gateway.mtf.exchange/ws`.
:::

The frame protocol mirrors HL's; the **channel names are MTF-native snake_case**. You subscribe with:

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

and receive an ack (`subscriptionResponse`), an initial snapshot (`is_snapshot: true`), then live change-driven `{"channel":...,"data":...}` pushes (`is_snapshot: false`). A push lands only when that channel's state actually changed since the last commit; an unchanged channel emits nothing. `coin` is **required** for the per-market channels (`l2_book`, `bbo`); see [Coin parameter](./index.md#coin-parameter) for how it is canonicalized (numeric asset id or symbol → asset-id key).

## Channel status at a glance

| Channel | Status | key | Live source |
|---------|--------|:-------:|-------------|
| `l2_book` | **live** | `coin` (required) | committed book, on change |
| `bbo` | **live** | `coin` (required) | committed book, on change |
| `trades` | **live** | `coin` (required) | committed-block fills, on new fills |
| `active_asset_ctx` | **live** | `coin` (required) | per-market mark / oracle / funding / OI, on change |
| `all_mids` | **live** | none | per-market mark, on change |
| `markets` | **live** | none | per-market dynamic state (mark / oracle / mid / premium / funding / OI / 24h ticker / halted) — full snapshot, then changed-row deltas |
| `fills` | **live** | `user`/`address` (required) | committed-block fills for that account |
| `user_events` | **live** | `user`/`address` (required) | committed-block fills for that account (more event kinds to come) |
| `candles` | **live** | `coin` + `interval` (both required) | committed-block fills folded into OHLCV bars, on change |
| `order_updates` | **live** | `user`/`address` (required) | per-account order lifecycle (place / fill / cancel / reject), on change |
| `open_orders` | **live** | `user`/`address` (required) | per-account resting-order set — a FULL snapshot re-emitted on every change |
| `notifications` | **live** | `user`/`address` (required) | per-account margin / liquidation notices, on change |
| `ledger_updates` | **live** | `user`/`address` (required) | per-account money movement (deposit / withdraw / transfer), on change |
| `active_asset_data` | **live** | `user` **and** `coin` (both required) | per-(user, coin) leverage / margin-mode / max-trade context, on change |
| `user_fundings` | **live** | `user`/`address` (required) | per-account realized funding payments, on change |
| `user_twap_slice_fills` | **live** | `user`/`address` (required) | per-account TWAP slice fills (`{fill, twapId}`), on change |
| `user_twap_history` | **live** | `user`/`address` (required) | per-account TWAP lifecycle (`{time, state, status}`: activated / finished / terminated), on change |
| `account_state` | **live** | `user`/`address` (required) | per-account PERP clearinghouse state — margin scalars, positions, balances — on change |
| `spot_state` | **live** | `user`/`address` (required) | per-account SPOT clearinghouse state — per-token balances — on change |
| `explorer_block` | **live** | none | latest committed block header, on each new block |
| `explorer_txs` | **live** | none | transactions in the latest committed block, on each new block |

Subscribing to any other `type` returns `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

---

## Live channels

### `l2_book`

Aggregated L2 order book for one market. **Requires `coin`.**

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC" } }
```

Initial snapshot and every push share this shape:

```json
{
  "channel": "l2_book",
  "data": {
    "coin": "BTC",
    "levels": [
      [ { "px": "10050000000", "sz": "12", "n": 2 }, { "px": "10049000000", "sz": "3", "n": 1 } ],
      [ { "px": "10051000000", "sz": "4", "n": 1 }, { "px": "10052000000", "sz": "6", "n": 1 } ]
    ],
    "time": 1735689600000
  }
}
```

- `levels` is `[bids, asks]`. Bids are best (highest) first; asks are best (lowest) first.
- Each level is `{ px, sz, n }`: `px` / `sz` are raw fixed-point magnitudes as decimal **strings** (per-asset tick scaling is applied downstream in the gateway), `n` is the number of resting orders at that price.
- Each side is capped at **20 aggregated levels**.
- `time` is the book's `last_trade_ms` (consensus-derived); `0` until the book has traded.

Each push is a **full snapshot of the top 20 levels**, not a partial diff. The frame envelope carries an `is_snapshot` boolean — `true` on the initial on-subscribe snapshot, `false` on the subsequent change-driven pushes — but the **body is the full top-20 book either way**, so the field is informational: keep replacing your local book on each frame and you stay correct.

Frequency: change-driven — a frame is sent only when the book actually changed since the last commit; a commit that leaves this book untouched emits nothing. If the coin maps to no known market, you still get the ack but the snapshot body is the empty book (`"levels": [[], []]`, `"time": 0`) and no pushes follow.

### `bbo`

Top-of-book best bid / offer for one market. A thinner `l2_book`. **Requires `coin`.**

```json
{ "method": "subscribe", "subscription": { "type": "bbo", "coin": "BTC" } }
```

```json
{
  "channel": "bbo",
  "data": {
    "coin": "BTC",
    "time": 1735689600000,
    "bbo": [
      { "px": "10050000000", "sz": "12", "n": 2 },
      { "px": "10051000000", "sz": "4", "n": 1 }
    ]
  }
}
```

- `bbo` is `[best_bid, best_ask]`. Each entry is a `{ px, sz, n }` level, or `null` when that side is empty.
- `time` is `last_trade_ms`, same as `l2_book`.

Frequency: change-driven — a frame is sent only when the top-of-book actually changed since the last commit; an unchanged book emits nothing this commit.

---

### `trades`

Public trade tape for one market. **Requires `coin`.** Each frame's `data` is an
**array** of trade records; `px`/`sz` are raw **1e8-plane** integer strings; `side`
is the taker's side (`"B"` buy / `"A"` sell); `time` is the consensus block ts (ms);
`tid` is a deterministic trade id.

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

**On-subscribe snapshot** (`is_snapshot: true`) — a **non-empty** array of the
market's bounded recent prints (up to the **64** most-recent, newest-first;
empty only if the market has never traded). Snapshot rows carry **`users: null`**
— the counterparty addresses are not reconstructed for historical prints:

```json
{ "channel": "trades", "is_snapshot": true, "data": [
  { "coin": "BTC", "side": "A", "px": "6164370000000", "sz": "24000", "time": 1735689500000, "tid": 4898317237641214538, "users": null }
] }
```

**Live pushes** (`is_snapshot: false`) — the new prints from the just-committed
block; each row's `users` is `[taker, maker]` (taker first, the aggressor):

```json
{ "channel": "trades", "is_snapshot": false, "data": [
  { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] }
] }
```

- `tid` may exceed 2⁵³ — parse it as a 64-bit / big integer, not a JS number.

### `active_asset_ctx`

Per-market context for one market — mark / oracle price, funding, and open
interest — pushed when it changes. **Requires `coin`.** The body carries the same
fields and units as the REST [`market_info`](../rest/info/perpetuals.md#market_info) read:
`mark_px` / `oracle_px` are **whole-USDC**, tick-snapped (truncated to the market's
price tick), and the `funding` block mirrors `market_info.funding`. Built from the
same per-market record builder as the REST read, so a WS ctx push never drifts
from `market_info`.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_ctx", "coin": "BTC" } }
```

```json
{
  "channel": "active_asset_ctx",
  "data": {
    "coin": "BTC",
    "mark_px": "66735.25",
    "oracle_px": "66700",
    "funding": {
      "rate_per_hr": "0",
      "cap_per_hr": "400",
      "interval_ms": 3600000,
      "next_payment_ts": 0
    },
    "open_interest": "5000000000"
  }
}
```

- `mark_px` / `oracle_px` — whole-USDC, tick-snapped (`"0"` when unset). Same plane as `market_info`, NOT the 1e8 book plane.
- `funding` — `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, identical to the REST `market_info.funding` block (`null` for an unknown market — see below). `rate_per_hr` is the latest hourly funding-rate sample (pre-cap) and `cap_per_hr` the per-market rate cap, both **bps strings** truncated toward zero (e.g. `"400"` = 0.04/hr); `interval_ms` is the funding cadence (`3600000` = 1h); `next_payment_ts` is epoch-ms, `0` until the market has its first funding sample.
- `open_interest` — current open interest, fixed-point string (`"0"` when no book).

Frequency: change-driven — a frame is sent only when this market's ctx actually changed since the last commit; an unchanged ctx emits nothing this commit.

If the coin maps to no known market you still get the ack, but the snapshot is the
**honest-empty** body — zeroed prices / OI and a `null` funding block — and no
pushes follow (so a client deserializing a fixed ctx struct never breaks):

```json
{ "channel": "active_asset_ctx", "data": { "coin": "DOGE", "mark_px": "0", "oracle_px": "0", "funding": null, "open_interest": "0" } }
```

### `all_mids`

Global mid map — every market's mark price, pushed when the mids change. Keyed by coin; values are the tick-snapped whole-USDC mark the REST [`markets`](../rest/info/perpetuals.md#markets) read reports. No `coin` parameter.

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### `markets`

Global per-market **dynamic** state tape — every market's live mark / oracle / mid price, funding premium, open interest, 24h ticker, and halted flag, one row per market. GLOBAL: takes **no `coin` and no `user`** (like [`all_mids`](#all_mids)). The rows share the REST [`markets`](../rest/info/perpetuals.md#markets) dynamic builder, so the WS feed and the REST read never drift.

```json
{ "method": "subscribe", "subscription": { "type": "markets" } }
```

The **on-subscribe** frame (`is_snapshot: true`) is an **array of every market's row** (perp **and** spot):

```json
{ "channel": "markets", "is_snapshot": true, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "66735.25", "oracle_px": "66700",
    "mid_px": "66735.30", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.01", "halted": false },
  { "coin": "BTC/USDC", "kind": "spot", "mark_px": "66730", "mid_px": "66731",
    "day_ntl_vlm": "58000", "prev_day_px": "66000" }
] }
```

Each subsequent **push** (`is_snapshot: false`) carries the **changed rows only** — the full row for each market whose row moved this commit, unchanged markets omitted (a quiet commit pushes nothing):

```json
{ "channel": "markets", "is_snapshot": false, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "70000", "oracle_px": "70000",
    "mid_px": "70001", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.06", "halted": false }
] }
```

So the **snapshot is all rows** and a **delta is the changed rows only** — demux each row on its `(coin, kind)` and replace it in your local table. Every row self-labels `kind` (`"perp"` / `"spot"`). Perp rows carry:

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Market symbol (join key) |
| `kind` | `"perp"` | Market kind (join key) |
| `mark_px` | Decimal string | Mark price, **whole-USDC**, tick-snapped (`"0"` when unset) |
| `oracle_px` | Decimal string | Index price, **whole-USDC**, tick-snapped (`"0"` when unset) |
| `mid_px` | Decimal string | Real order-book mid, **whole-USDC**, tick-snapped — **omitted** when the book is one-sided (never sent as `null`) |
| `premium` | Decimal string \| null | Latest funding premium sample, an **8-decimal** string (truncated toward zero); `null` when no sample exists |
| `funding` | object | `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, identical to the REST `market_info.funding` block |
| `open_interest` | Decimal string | Current open interest, whole-unit size |
| `day_ntl_vlm` | Decimal string | Rolling-24h notional volume (whole-USDC) |
| `prev_day_px` | Decimal string \| null | Mark ~24h ago (whole-USDC); `null` when no 24h-ago sample |
| `change_24h` | Decimal string \| null | Signed 24h change fraction (`"0.05"` = +5%); `null` when no prior px |
| `halted` | bool | Whether the market is halted |

Spot rows carry only the fields with a spot analogue — `coin`, `kind` (`"spot"`), `mark_px`, `mid_px` (omitted when one-sided), `day_ntl_vlm`, `prev_day_px`; the perp-only fields (`oracle_px` / `premium` / `funding` / `open_interest` / `change_24h` / `halted`) are absent.

Frequency: change-driven — a delta frame lands only on commits where at least one market's row moved; a commit that changes nothing emits nothing.

### `fills` <a id="fills"></a>

Per-account fill stream. Requires `user` (the 0x address; `address` is also accepted) — NOT a `coin`. Each executed match delivers a record to BOTH parties, each from its own perspective, with the same field set `{coin, side, px, sz, time, oid, cloid, tid, crossed}`:

- the **taker** record — the taker's own `oid`, its `cloid` (or `null`), the taker's side, `crossed: true`;
- the **maker** record — the maker's own `oid`, `cloid: null` (no cloid is captured for the resting side), the **opposite** side, `crossed: false`.

Both legs of one match share the same `tid` (the same value the public `trades` print carries). `px`/`sz` are 1e8-plane strings. Per-account fill records carry **no `users` array** — counterparty addresses appear only on the public [`trades`](#trades) tape, never on the account-scoped feed.

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

The initial snapshot is the empty array `[]`; each push is an array holding one fill record:

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] }
```

### `user_events` <a id="userevents"></a>

Per-account event feed. Requires `user` (the 0x address) — NOT a `coin`. Today it tags `fills`; liquidation / funding event kinds will land as sibling keys.

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

The native channel name is `user_events` (snake_case).

:::warning
`user_events` is per-account data but currently has **no authentication** — any connection can subscribe to any address's feed. Do not treat it as a private channel until the auth-at-subscribe gate lands; for authenticated reads/writes use `post` with a signed action.
:::

### `candles`

Rolling OHLCV bars for one market at one bar size. **Requires both `coin` and `interval`** — they form the routing key together, so a `1m` and a `5m` subscription on the same market are independent subscriptions, each with its own snapshot and pushes.

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m" } }
```

- `interval` ∈ `1m` / `5m` / `15m` / `1h` / `4h` / `1d`. A missing or unrecognized `interval` is normalized to **`1m`** (the ack echoes the interval actually used).
- The ack echoes `interval` back in the subscription so a client can correlate `(coin, interval)`.

The **initial snapshot** is an **array** of the recent bars (closed + the open bar), oldest first — `[]` until the market has traded:

```json
{ "channel": "candles", "data": [
  { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 }
] }
```

Each **push** is a **single bar object** (not the array) — the current open bar for that `(coin, interval)`, re-emitted on every committed block whose fills land in this market:

```json
{ "channel": "candles", "data": { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 } }
```

- `t` / `T` — bar open / close epoch-ms (consensus-derived); the bar covers `[t, T]` and a fill rolls into a new bar when its block timestamp crosses `T`.
- `s` — coin / market symbol; `i` — interval bucket token.
- `o` / `c` / `h` / `l` — open / close / high / low, **decimal USDC** strings (human dollars, e.g. `"67002.50"`).
- `v` — base-asset volume folded into the bar (coin size). `q` — quote (USD) volume = `Σ price × size` over the bar's fills. `n` — number of fills in the bar.

The series is **gapless**: an interval with no trades emits a flat bar carrying the prior close forward (`o = h = l = c = previous close`, `v = q = 0`, `n = 0`). No bar is emitted before the market's first trade — the series begins at the bucket of the first print.

A store keeps up to **1000 bars per `(coin, interval)`** series; cold series (no subscriber) are evicted, so an unwatched market/interval costs nothing.

### `order_updates`

Per-account order lifecycle. Requires `user` (the 0x address). Each push is an array of order-update records for that account from the just-committed block; the initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": 42, "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` ∈ `open` (resting; `order.sz` is the post-commit book remainder, `order.orig_sz` the size the order was placed with) / `filled` / `canceled` / `rejected` (+`reason`, null `oid`) / `cancel_rejected` (+`reason`).
- On a **`filled`** record, `order.sz` = the **FILLED** size and `order.orig_sz` = the **original** order size (so `sz / orig_sz` is the fill fraction); a taker also carries cumulative `filled_sz` + `avg_px`, while a maker leg reports the per-match `filled_sz` with `status` still `open` while any size rests.
- `limit_px` / `sz` / `orig_sz` / `avg_px` are 1e8-plane decimal strings; `time` is consensus-ms; unknown fields are `null`.
- **Not** emitted today: `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / TWAP transitions and engine-initiated (BOLE T0) cancels — the dispatch observation for those is an opaque ok/err with no per-order payload.

### `open_orders`

Per-account resting-order **set**. Requires `user` (the 0x address; `address` is also accepted) — NOT a `coin`. Unlike [`order_updates`](#order_updates) (per-event deltas), **every** `open_orders` frame is a FULL snapshot of the account's current resting orders — `is_snapshot` is `true` on the on-subscribe frame **and on every re-emission**. The node re-emits the complete set whenever any order-lifecycle change touches it (place / fill / cancel / modify / engine-initiated cancel), so a client simply **replaces its whole open-order set on each frame**; there are no partial deltas to reconcile. This sidesteps the [`order_updates`](#order_updates) gap where `modify` / `batchModify` / engine-initiated cancels carry no per-order delta.

```json
{ "method": "subscribe", "subscription": { "type": "open_orders", "user": "0x<address>" } }
```

The snapshot is an **array** of records, each in the same fixed shape as an [`order_updates`](#order_updates) `status: "open"` element — `[]` when the account has no resting orders:

```json
{ "channel": "open_orders", "is_snapshot": true, "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": null,
             "oid": 42, "cloid": null, "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- Each element is one resting order: the nested `order` object (`coin`, `side`, `limit_px`, `sz` = remaining size, `orig_sz`, `oid`, `cloid`, `tif`, `reduce_only`), with `filled_sz` / `avg_px` / `reason` all `null` (a standing order, not an event) and `time` the order's insertion timestamp (consensus ms). On this snapshot `orig_sz` is `null` (the placed size is not re-derived for a standing order) and `reduce_only` is `false`; `cloid` is the client id or `null`. `limit_px` is whole-USDC, `sz` is size-plane.
- Because every frame is a full snapshot, `is_snapshot` is always `true` here — treat each frame as the account's complete current resting set, not an incremental change.

### `notifications`

Per-account margin / liquidation notices, derived by diffing consecutive committed states. Requires `user`. One array frame per affected commit; initial snapshot `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "notifications", "user": "0x<address>" } }
```

```json
{ "channel": "notifications", "data": [
  { "kind": "yellow_card", "tier": "yellow_card", "message": "...", "time": 1735689600123 },
  { "kind": "forced_close_tier", "tier": "partial_market_50", "message": "...", "time": 1735689600123 },
  { "kind": "tier_cleared", "tier": null, "message": "...", "time": 1735689600123 },
  { "kind": "forced_close", "coin": "BTC", "side": "long", "closed_sz": "600", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual", "coin": "BTC", "side": "long", "lots": "120", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual_cleared", "coin": "BTC", "side": "long", "message": "...", "time": 1735689600123 } ] }
```

- `kind` is the machine tag; `message` is the human-readable text. `tier` ∈ `yellow_card` / `partial_market_50` / `full_market` / `backstop_takeover` (or `null` on clear).
- `yellow_card` is the one-block margin-warning grace (the [tiered-liquidation](../../concepts/tiered-liquidation.md) T0 contract); `forced_close` fires when a liquidation actually executes against the account.

### `ledger_updates`

Per-account money movement, attributed to its **cause** (read from the committed block payload — a record appears only when the action applied). Requires `user`. The on-subscribe snapshot is an **array** of the account's most-recent ledger records, **newest-first**, bounded to the last **100** (`[]` when the account has no recent records); each subsequent push is an array holding the new record(s) for the just-committed block.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` ∈ `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (+`token`), `asset_send` / `asset_receive` (+`asset`, `to_perp`), `withdraw` (`via`: `cctp` | `metabridge`), `deposit` (`amount` may be `null` for an inbound CCTP credit), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer`, `vault_transfer`. A transfer emits one record per party (sender + receiver).
- Amounts are whole-token decimal strings except `withdraw` via MetaBridge, which carries `amount_units` (raw base units). Inbound bridge credit amounts and CoreWriter-delayed actions (which dispatch in a later block) are not yet attributed.

### `active_asset_data`

Per-(user, coin) trading context — leverage, margin mode, and the current
max-trade-size ceiling for one account on one market. Requires **both** `user`
(0x) and `coin`. The initial snapshot is the live context (zeroed-config
defaults when the account has no position), not an empty array; a push
re-emits it only when that context changes.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "is_snapshot": true, "data": {
  "address": "0x<addr>", "coin": "BTC", "leverage": 50, "margin_mode": "cross",
  "mark_px": "61742.69625702", "max_trade_size": "0", "max_trade_szs": ["0", "0"],
  "available_to_trade": ["0", "0"], "has_position": false } }
```

- Keyed by `coin` (symbol). `margin_mode` ∈ `cross` / `isolated` / `strict_iso`;
  `max_trade_size` is the OI-cap-derived size ceiling, `max_trade_szs` /
  `available_to_trade` are `[buy, sell]` pairs; fields are identical to the REST
  [`active_asset_data`](../rest/info/perpetuals.md#active_asset_data) read.

### `account_state`

Per-account **PERP** clearinghouse state — the margin summary, open positions,
and balances for one account — pushed when it changes. Requires `user` (the 0x
address; `address` is also accepted) — NOT a `coin`. The body is built from the
same record builder as the REST focused account read, so a WS push never drifts
from that read. The initial snapshot is the live state (zeroed for an account
with no funds), not an empty array.

```json
{ "method": "subscribe", "subscription": { "type": "account_state", "user": "0x<address>" } }
```

```json
{
  "channel": "account_state",
  "data": {
    "address": "0x<addr>",
    "account_value": "10000", "free_collateral": "8500", "maint_margin": "300",
    "init_margin": "1500", "health": "0.97", "tier": 0,
    "mode": "cross", "pm_enabled": false,
    "positions": [
      { "asset": 0, "size": "600", "entry": "62000", "upnl": "441",
        "isolated": false, "lev": 7, "side": "long" }
    ],
    "balances": { "usdc": "10000", "spot": { "MTF": { "total": "12.5", "hold": "0" } } }
  }
}
```

- Margin scalars (`account_value` / `free_collateral` / `maint_margin` /
  `init_margin` / `health`) are **whole-USDC** decimal strings, identical to the
  REST account read's `MarginScalars`; `tier` is the liquidation tier index,
  `mode` the account default, `pm_enabled` whether portfolio margin is on.
- `positions[]` — one entry per open perp position: `asset` (numeric id), `size`
  (signed 1e8-plane string), `entry` / `upnl` (whole-USDC),
  `isolated`, `lev`, and `side` (`long` / `short`, present in
  hedge mode).
- `balances` — `{usdc, spot}`: `usdc` is the quote collateral (whole-USDC); `spot`
  maps token → `{total, hold}`.

Frequency: change-driven — a frame is sent only when the account's state actually changed since the last commit; an unchanged account emits nothing this commit.

:::warning
`account_state` is per-account data but currently has **no authentication** — any
connection can subscribe to any address. Do not treat it as private until the
auth-at-subscribe gate lands.
:::

### `spot_state`

Per-account **SPOT** clearinghouse state — the per-token spot balances for one
account — pushed when they change. Requires `user`. The initial snapshot is the live
balance set (`[]` for an account with no spot holdings).

```json
{ "method": "subscribe", "subscription": { "type": "spot_state", "user": "0x<address>" } }
```

```json
{
  "channel": "spot_state",
  "data": {
    "address": "0x<addr>",
    "balances": [
      { "asset": 1, "name": "USDC", "total": "2500", "hold": "100" },
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ]
  }
}
```

- `balances[]` — one entry per held spot token: `asset` (numeric id), `name`
  (token symbol), `total` (whole-token decimal string), `hold` (amount reserved
  by resting spot orders). Identical to the REST spot-balances read.

Frequency: change-driven — a frame is sent only when the spot balances actually changed since the last commit; an unchanged account emits nothing this commit.

### `user_fundings`

Per-account **realized funding payments** — one record each time funding settles
against the account on a market. Requires `user` (the 0x address; `address` is
also accepted) — NOT a `coin`. Each frame's `data` is an array of funding records
from the just-committed settlement; the initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_fundings", "user": "0x<address>" } }
```

```json
{ "channel": "user_fundings", "data": [
  { "coin": "BTC", "payment": "-0.42", "szi": "600", "fundingRate": "0.0001", "time": 1735689600123 }
] }
```

- `coin` — market symbol the payment settled on.
- `payment` — the funding amount applied, **whole-USDC** decimal string, **signed**:
  negative = the account paid, positive = the account received.
- `szi` — the signed position size the payment was computed against (base units).
- `fundingRate` — the per-asset rate applied at this settlement (decimal string).
- `time` — settlement timestamp (consensus ms).

### `explorer_block`

Latest committed **block header**, pushed on each new block. No `coin` / `user`
parameter. Each frame's `data` is an array (the newly-committed header(s));
`is_snapshot: true` on the first frame after subscribe.

```json
{ "method": "subscribe", "subscription": { "type": "explorer_block" } }
```

```json
{ "channel": "explorer_block", "is_snapshot": true, "data": [
  { "height": 72399, "round": 72399, "epoch": 0, "proposer": 5,
    "hash": "0x3a0572f514cb6bf4517c40b1511728d460b4f7c9b98a68932c6801f5aee80dfd",
    "time": 1783009348137, "tx_count": 0 }
] }
```

- `height` / `round` — committed block height / consensus round.
- `epoch` — staking epoch.
- `proposer` — proposing validator index.
- `hash` — block hash (`0x`-prefixed).
- `time` — block timestamp (consensus ms).
- `tx_count` — number of transactions in the block.

### `explorer_txs`

Transactions in the latest committed block, pushed on each new block. No
`coin` / `user` parameter. Each frame's `data` is an array of transaction
records (empty for a block with no transactions); `is_snapshot: true` on the
first frame after subscribe.

```json
{ "method": "subscribe", "subscription": { "type": "explorer_txs" } }
```

```json
{ "channel": "explorer_txs", "is_snapshot": false, "data": [
  { "hash": "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c" }
] }
```

- Each row carries a `hash` field — the `0x` action hash of the transaction —
  which is **empty (`""`)** for a **systemic** entry (an engine-internal action
  with no user-signed hash). A block with no transactions pushes `"data": []`.

---

## `post` — request/response over WS

Not a subscription channel, but the way to do one-shot reads and signed writes over the same socket. The `request` is the same `{type, payload}` envelope as the REST routes; it is dispatched through the identical handlers (`POST /info`, `POST /exchange`). See [`post` in the WS README](./index.md#post-requestresponse-over-ws) for the full request/response shapes and signing rules.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

This is the supported path for authenticated reads and for submitting signed actions over WS today.

---

## Roadmap — not yet available

The following channels appeared in earlier drafts but are **not implemented** on the node WS surface. They are not recognized channel names; subscribing returns an `unknown channel` error. Listed here so integrators are not misled by older SDK stubs.

- **Public market data:** `meta` (universe metadata), `mark` (mark/oracle price), `fundingTicks` (funding-rate updates).
- **Per-user (would require auth):** `vaultEvents`, `rfqEvents`.

Also not implemented today:

- **Diff-based `l2_book`** (partial `updates` frames) — current `l2_book` always sends full top-20 bodies. The frame does carry an `is_snapshot` flag (`true` on the initial snapshot, `false` on change-driven pushes), but every body is a full snapshot — there are no partial-diff `updates` frames.
- **`seq` / `resume` / resume tokens** — every (re)subscribe starts from a fresh snapshot.
- **Auth-at-subscribe envelope** for private channels — use `post` with a signed action for authenticated operations.

---

## Ordering & delivery

- **Per subscription**, frames arrive in commit order (a frame is emitted only on the commits where the watched channel's state changed). There is no `seq`; ordering is implicit in arrival order on the single socket.
- **Across subscriptions**, there is no ordering guarantee — interleave is arbitrary. Demux on `channel` + the `coin` inside `data`.
- Delivery is **at-most-once per change** and **not buffered for resume**: a subscription that lags more than 256 frames behind is dropped with a `lagged` error frame (see [Backpressure & lag](./index.md#backpressure--lag)). Re-subscribe to recover; you get a fresh snapshot.

## See also

- [WS README](./index.md) — connection lifecycle, frames, coin parameter, `post`, backpressure
- [`POST /info`](../rest/info.md) — REST equivalents for one-shot reads (also reachable via `post`)
- [`POST /exchange`](../rest/exchange.md) — signed-action envelope shared by the `post` action path
