# WS subscription channels

{% hint style="info" %}
**Status.** `l2_book` and `bbo` are live and stream real committed book data per market. `trades`, `fills`, `candles`, and `user_events` are recognized channel names — you can subscribe and you get an ack + an empty initial snapshot — but they have **no live event source yet** and never push. Everything else listed under [Roadmap](#roadmap--not-yet-available) is not wired at all. The connection lifecycle and frame format are in the [WS README](./README.md).
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

| Channel | Status | `coin`? | Live source |
|---------|--------|:-------:|-------------|
| `l2_book` | **live** | required | committed book, per commit |
| `bbo` | **live** | required | committed book, per commit |
| `trades` | stub (ack + empty snapshot, no pushes) | optional | none yet |
| `fills` | stub (ack + empty snapshot, no pushes) | optional | none yet |
| `candles` | stub (ack + empty snapshot, no pushes) | optional | none yet |
| `user_events` | stub (ack + empty snapshot, no pushes) | none | none yet |

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

## Stub channels (subscribe works, no live data yet)

These channels are recognized so SDKs can wire them ahead of the data source. A subscribe succeeds and returns an ack plus an **empty initial snapshot**, but no live frames are pushed yet. Do not rely on them for data until promoted to "live".

### `trades`

Public trade tape for one market. Empty snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

```json
{ "channel": "trades", "data": [] }
```

There is no committed trade event log to read yet, so this stays honest-empty. (`coin` is accepted but, until a source is wired, all subscriptions share the empty path.)

### `fills`

Per-account fill stream. Empty snapshot is `[]`. No live source yet.

```json
{ "channel": "fills", "data": [] }
```

### `candles`

OHLCV bar updates. Empty snapshot is `[]`. No live source yet.

```json
{ "channel": "candles", "data": [] }
```

### `user_events` <a id="userevents"></a>

Per-account order-lifecycle / liquidation / funding event firehose. Carries **no `coin`** (it is a coinless `(channel, None)` subscription). Empty snapshot is `[]`. No live source and no auth gate yet.

The native channel name is `user_events` (snake_case); on the gateway's `/hl/ws` (HL-compat) the equivalent is HL's `userEvents`.

```json
{ "method": "subscribe", "subscription": { "type": "user_events" } }
```

```json
{ "channel": "user_events", "data": [] }
```

{% hint style="warning" %}
`user_events` is per-account data but currently has **no authentication** — it accepts any subscribe and emits an empty snapshot. Do not treat it as a private channel until the auth gate and event source land.
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
