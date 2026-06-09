# WS subscription channels

{% hint style="info" %}
**Status.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `fills`, `user_events`, and `candles` are live and push real committed data per block. Everything else under [Roadmap](#roadmap--not-yet-available) is not wired. The connection lifecycle and frame format are in the [WS README](./README.md). Per-market channels (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) require a `coin`; `candles` requires a `coin` **and** an `interval`; per-account channels (`fills`, `user_events`) require a `user` (the 0x address); `all_mids` takes neither.
{% endhint %}

{% hint style="info" %}
**Channel names are snake_case (MTF-native).** This is the node `/ws` native surface, so channel wire names are snake_case (`l2_book`, `user_events`, …). Clients wanting the HL-camelCase channel names (`l2Book`, `userEvents`, `userFills`, `candle`, …) connect to the gateway's **`/hl/ws`** (HL-compat), which translates to these native snake_case channels underneath. Per the unified-gateway routing: `gateway.<net>.mtf.exchange/ws` = native snake_case, `/hl/ws` = HL camelCase.
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

- **Public market data:** `meta` (universe metadata), `allMids` (per-asset mids), `mark` (mark/oracle price), `fundingTicks` (funding-rate updates).
- **Per-user (would require auth):** `userFills`, `orderEvents`, `marginEvents`, `vaultEvents`, `twapEvents`, `rfqEvents`.

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
