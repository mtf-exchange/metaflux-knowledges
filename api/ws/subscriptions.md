# WS subscription channels

{% hint style="info" %}
**Status.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `fills`, `user_events`, `candles`, `order_updates`, `notifications`, `ledger_updates`, `active_asset_data`, `user_fundings`, `user_twap_slice_fills`, `user_twap_history`, `account_state`, `spot_state`, and `web_data2` are live and push real committed data per block. Everything else under [Roadmap](#roadmap--not-yet-available) is not wired. The connection lifecycle and frame format are in the [WS README](./README.md). Per-market channels (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) require a `coin`; `candles` requires a `coin` **and** an `interval`; per-account channels (`fills`, `user_events`) require a `user` (the 0x address); `active_asset_data` requires **both** a `user` and a `coin`; `all_mids` takes neither.
{% endhint %}

{% hint style="info" %}
**Channel names are snake_case (MTF-native).** This is the node `/ws` native surface, so channel wire names are snake_case (`l2_book`, `user_events`, …). Clients wanting the HL-camelCase channel names (`l2Book`, `userEvents`, `userFills`, `candle`, …) connect to the gateway's **`/hl/ws`** (HL-compat), which translates to these native snake_case channels underneath. Per the unified-gateway routing: `<net>-gateway.mtf.exchange/ws` = native snake_case, `/hl/ws` = HL camelCase.
{% endhint %}

The frame protocol mirrors HL's; the **channel names are MTF-native snake_case**. You subscribe with:

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

and receive an ack (`subscriptionResponse`), an initial snapshot, then live `{"channel":...,"data":...}` pushes. `coin` is **required** for the per-market channels (`l2_book`, `bbo`); see [Coin parameter](./README.md#coin-parameter) for how it is canonicalized (numeric asset id or symbol → asset-id key).

## Channel status at a glance

| Channel | Status | key | Live source |
|---------|--------|:-------:|-------------|
| `l2_book` | **live** | `coin` (required) | committed book, per commit |
| `bbo` | **live** | `coin` (required) | committed book, per commit |
| `trades` | **live** | `coin` (required) | committed-block fills, per commit |
| `active_asset_ctx` | **live** | `coin` (required) | per-market mark / oracle / funding / OI, per commit |
| `all_mids` | **live** | none | per-market mark, per commit |
| `fills` | **live** | `user`/`address` (required) | committed-block fills for that account |
| `user_events` | **live** | `user`/`address` (required) | committed-block fills for that account (more event kinds to come) |
| `candles` | **live** | `coin` + `interval` (both required) | committed-block fills folded into OHLCV bars, per commit |
| `order_updates` | **live** | `user`/`address` (required) | per-account order lifecycle (place / fill / cancel / reject), per commit |
| `notifications` | **live** | `user`/`address` (required) | per-account margin / liquidation notices, per commit |
| `ledger_updates` | **live** | `user`/`address` (required) | per-account money movement (deposit / withdraw / transfer), per commit |
| `active_asset_data` | **live** | `user` **and** `coin` (both required) | per-(user, coin) leverage / margin-mode / max-trade context, per commit |
| `user_fundings` | **live** | `user`/`address` (required) | per-account realized funding payments, per commit |
| `user_twap_slice_fills` | **live** | `user`/`address` (required) | per-account TWAP slice fills (`{fill, twapId}`), per commit |
| `user_twap_history` | **live** | `user`/`address` (required) | per-account TWAP lifecycle (`{time, state, status}`: activated / finished / terminated), per commit |
| `account_state` | **live** | `user`/`address` (required) | per-account PERP clearinghouse state — margin scalars, positions, balances — per commit |
| `spot_state` | **live** | `user`/`address` (required) | per-account SPOT clearinghouse state — per-token balances — per commit |
| `web_data2` | **live** | `user`/`address` (required) | per-account composite UI snapshot — clearinghouse + spot balances + open orders + vault equities + exchange status — per commit |

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

Each push is a **full snapshot of the top 20 levels**, not a diff — there are no `is_snapshot` / `updates` / diff frames. Replace your local book on each frame.

Frequency: one frame per committed block in which this market has a live subscriber. If the coin maps to no known market, you still get the ack but the snapshot body is the empty book (`"levels": [[], []]`, `"time": 0`) and no pushes follow.

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

Frequency: one frame per committed block in which this market has a live subscriber.

---

### `trades`

Public trade tape for one market — one record per fill on that market each commit. `px`/`sz` are raw **1e8-plane** integer strings; `side` is the taker's side (`"B"` buy / `"A"` sell); `time` is the consensus block ts (ms); `tid` is a deterministic trade id; `users` is `[taker, maker]` (taker first, the aggressor).

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

```json
{ "channel": "trades", "data": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] } }
```

### `active_asset_ctx`

Per-market context for one market — mark / oracle price, funding, and open
interest — pushed each commit. **Requires `coin`.** The body carries the same
fields and units as the REST [`market_info`](../rest/info.md#market_info) read:
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

Frequency: one frame per committed block in which this market has a live subscriber.

If the coin maps to no known market you still get the ack, but the snapshot is the
**honest-empty** body — zeroed prices / OI and a `null` funding block — and no
pushes follow (so a client deserializing a fixed ctx struct never breaks):

```json
{ "channel": "active_asset_ctx", "data": { "coin": "DOGE", "mark_px": "0", "oracle_px": "0", "funding": null, "open_interest": "0" } }
```

### `all_mids`

Global mid map — every market's mark price, pushed each commit. Keyed by coin; values are the tick-snapped whole-USDC mark the REST [`markets`](../rest/info.md#markets) read reports. No `coin` parameter.

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

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

The native channel name is `user_events` (snake_case); on the gateway's `/hl/ws` (HL-compat) the equivalent is HL's `userEvents`.

{% hint style="warning" %}
`user_events` is per-account data but currently has **no authentication** — any connection can subscribe to any address's feed. Do not treat it as a private channel until the auth-at-subscribe gate lands; for authenticated reads/writes use `post` with a signed action.
{% endhint %}

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
  { "coin": "BTC", "interval": "1m", "t": 1735689600000, "T": 1735689659999, "o": "6700000000000", "h": "6700500000000", "l": "6699000000000", "c": "6700250000000", "v": "12000000", "n": 8 }
] }
```

Each **push** is a **single bar object** (not the array) — the current open bar for that `(coin, interval)`, re-emitted on every committed block whose fills land in this market:

```json
{ "channel": "candles", "data": { "coin": "BTC", "interval": "1m", "t": 1735689600000, "T": 1735689659999, "o": "6700000000000", "h": "6700500000000", "l": "6699000000000", "c": "6700250000000", "v": "12000000", "n": 8 } }
```

- `t` / `T` — bar open / close epoch-ms (consensus-derived); the bar covers `[t, T]` and a fill rolls into a new bar when its block timestamp crosses `T`.
- `o` / `h` / `l` / `c` — open / high / low / close, **raw 1e8-plane** decimal strings (same plane as `l2_book` / `trades` px; per-asset tick scaling is applied downstream in the gateway), NOT the whole-USDC plane `market_info` reports.
- `v` — base-asset volume folded into the bar (1e8-plane size string). `n` — number of fills in the bar.
- `coin` — the canonical market symbol; `interval` — the bar size, echoed.

A store keeps up to **1000 bars per `(coin, interval)`** series; cold series (no subscriber) are evicted, so an unwatched market/interval costs nothing. On the gateway's `/hl/ws` (HL-compat) the equivalent channel name is HL's `candle` (singular).

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

- `status` ∈ `open` (resting; `sz` is the post-commit book remainder) / `filled` (a taker carries cumulative `filled_sz` + `avg_px`; a maker leg reports the per-match `filled_sz` with `status` still `open` while any size rests) / `canceled` / `rejected` (+`reason`, null `oid`) / `cancel_rejected` (+`reason`).
- `limit_px` / `sz` / `orig_sz` / `avg_px` are 1e8-plane decimal strings; `time` is consensus-ms; unknown fields are `null`.
- **Not** emitted today: `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / TWAP transitions and engine-initiated (BOLE T0) cancels — the dispatch observation for those is an opaque ok/err with no per-order payload.

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

Per-account money movement, attributed to its **cause** (read from the committed block payload — a record appears only when the action applied). Requires `user`; initial snapshot `[]`.

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
re-emits it each committed block.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "data": {
  "address": "0x<addr>", "asset_id": 0, "leverage": 7, "margin_mode": "isolated",
  "max_trade_size": "5000000000", "has_position": true } }
```

- `margin_mode` ∈ `cross` / `isolated` / `strict_iso`; `max_trade_size` is the
  OI-cap-derived size ceiling (raw-lot string); fields are identical to the REST
  [`active_asset_data`](../rest/info.md) read. On the gateway's `/hl/ws` the
  equivalent channel name is HL's `activeAssetData`.

### `account_state`

Per-account **PERP** clearinghouse state — the margin summary, open positions,
and balances for one account — pushed each commit. Requires `user` (the 0x
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

Frequency: one frame per committed block while the account has a live subscriber.

{% hint style="warning" %}
`account_state` is per-account data but currently has **no authentication** — any
connection can subscribe to any address. Do not treat it as private until the
auth-at-subscribe gate lands.
{% endhint %}

### `spot_state`

Per-account **SPOT** clearinghouse state — the per-token spot balances for one
account — pushed each commit. Requires `user`. The initial snapshot is the live
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

Frequency: one frame per committed block while the account has a live subscriber.

### `web_data2`

Per-account **composite** "everything for the frontend" snapshot — the perp
clearinghouse summary, spot balances, open orders, vault equities, and the global
exchange status for one account, all in one frame, pushed each commit. Requires
`user` (the 0x address; `address` is also accepted) — NOT a `coin`. The body is
the byte-identical composite the REST [`web_data2`](../rest/info.md#web_data2)
read returns (it composes the same sub-readers), so a WS push never drifts from
that read. The initial snapshot is the live composite (zeroed-config defaults
when the account has no funds / positions / orders), not an empty array.

```json
{ "method": "subscribe", "subscription": { "type": "web_data2", "user": "0x<address>" } }
```

```json
{
  "channel": "web_data2",
  "data": {
    "address": "0x<addr>",
    "clearinghouse": {
      "account_value": "10000",
      "margin_used": "300",
      "positions": [
        { "asset": 0, "size": "600", "entry_ntl": "2500", "mode": "cross", "lev": 10 }
      ]
    },
    "spot_balances": [
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ],
    "open_orders": [
      { "oid": 42, "market_id": 0, "side": "bid", "px": "6700000000000", "size": "10000000",
        "tif": "gtc", "cloid": "0xab..", "trigger": null, "inserted_at_ms": 1735689600123 }
    ],
    "vault_equities": [
      { "vault_id": 1, "vault_address": "0x<vault>", "shares": "1000", "equity": "1050" }
    ],
    "exchange_status": {
      "spot_disabled": false,
      "post_only_until_time_ms": 0,
      "post_only_until_height": 0,
      "scheduled_freeze_height": null,
      "mip3_enabled": true,
      "frozen": false,
      "replay_complete": true
    }
  }
}
```

The composite carries exactly these sections (each composed from the matching
sub-reader, so the shapes never drift from the standalone reads):

- `address` — the canonical lowercase 0x address the frame is keyed on.
- `clearinghouse` — the perp account summary: `account_value` (cross account
  value, whole-USDC decimal string), `margin_used` (Σ per-asset maintenance
  margin used, whole-USDC), and `positions[]`. Each position row is
  `{asset, size, entry_ntl, mode, lev}`: `asset` is the numeric
  market id, `size` is the signed 1e8-plane size string (one row per non-zero
  leg, so a hedge-mode account reports both legs), `entry_ntl` is whole-USDC,
  `mode` ∈ `cross` / `isolated` / `strict_iso`, `lev` is the
  position's max leverage. Zero-size legs are omitted.
- `spot_balances` — the `balances` array from [`spot_state`](#spot_state) /
  REST `spot_clearinghouse_state`: one entry per held spot token,
  `{asset, name, total, hold}`.
- `open_orders` — the `orders` array from REST `frontend_open_orders`: one entry
  per resting order **and** per parked TP/SL / stop trigger,
  `{oid, market_id, side, px, size, tif, cloid, trigger, inserted_at_ms}`.
  `side` ∈ `bid` / `ask`; `px` / `size` are 1e8-plane decimal strings; `tif` ∈
  `alo` / `ioc` / `gtc` (or `trigger` for an off-book parked stop); `cloid` is the
  client order id or `null`; `trigger` is `null` for a plain book order, otherwise
  `{trigger_px, trigger_above}` (parked stops also carry `is_parked: true`).
- `vault_equities` — the `equities` array from REST `user_vault_equities`: one
  entry per vault the account has shares in,
  `{vault_id, vault_address, shares, equity}` (`equity` is whole-USDC, `shares`
  is a raw integer string). Empty when the account follows no vault.
- `exchange_status` — the global trading-status scalars (same body as REST
  `exchange_status`): `{spot_disabled, post_only_until_time_ms,
  post_only_until_height, scheduled_freeze_height, mip3_enabled, frozen,
  replay_complete}`. This block is identical for every subscriber on a given
  commit.

Frequency: one frame per committed block while the account has a live subscriber.
On each commit the current composite is re-emitted for every subscribed account.

{% hint style="warning" %}
`web_data2` is per-account data but currently has **no authentication** — any
connection can subscribe to any address. Do not treat it as private until the
auth-at-subscribe gate lands; for authenticated reads use `post` with a signed
action.
{% endhint %}

---

## `post` — request/response over WS

Not a subscription channel, but the way to do one-shot reads and signed writes over the same socket. The `request` is the same `{type, payload}` envelope as the REST routes; it is dispatched through the identical handlers (`POST /info`, `POST /exchange`). See [`post` in the WS README](./README.md#post-requestresponse-over-ws) for the full request/response shapes and signing rules.

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

- **Diff-based `l2_book`** (`is_snapshot` / `updates` frames) — current `l2_book` always sends full top-20 snapshots.
- **`seq` / `resume` / resume tokens** — every (re)subscribe starts from a fresh snapshot.
- **Auth-at-subscribe envelope** for private channels — use `post` with a signed action for authenticated operations.

---

## Ordering & delivery

- **Per subscription**, frames arrive in commit order (one frame per committed block that touches a watched market). There is no `seq`; ordering is implicit in arrival order on the single socket.
- **Across subscriptions**, there is no ordering guarantee — interleave is arbitrary. Demux on `channel` + the `coin` inside `data`.
- Delivery is **at-most-once per commit** and **not buffered for resume**: a subscription that lags more than 256 frames behind is dropped with a `lagged` error frame (see [Backpressure & lag](./README.md#backpressure--lag)). Re-subscribe to recover; you get a fresh snapshot.

## See also

- [WS README](./README.md) — connection lifecycle, frames, coin parameter, `post`, backpressure
- [`POST /info`](../rest/info.md) — REST equivalents for one-shot reads (also reachable via `post`)
- [`POST /exchange`](../rest/exchange.md) — signed-action envelope shared by the `post` action path
