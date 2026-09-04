# WS subscription channels

::::info
Channels are **change-driven**: a channel emits a frame only when its state actually changed since the last commit. The exception is the four account-state channels — `account_state`, `clearinghouse_state`, `option_state` and `spot_margin_state` — which additionally re-send an unchanged snapshot every 4 committed blocks as a commit-count liveness heartbeat, not a wall-clock interval. Anything under [Roadmap](#roadmap--not-yet-available) is not wired. The connection lifecycle and frame format are in the [WS README](./index.md).

:::warning
**`web_data2` (REST + WS) has been REMOVED.** Compose the equivalent from
[`account_state`](#account_state) + [`clearinghouse_state`](#clearinghouse_state) +
[`spot_margin_state`](#spot_margin_state) + `order_updates` (or the REST focused
reads). Subscribing to `web_data2` now returns
`{"channel":"error","data":{"error":"unknown channel: web_data2"}}`.
:::

:::warning
**The WS `web_data` channel goes away at the next node release.** The push
channel is retired. Subscribing to `web_data` then returns
`{"channel":"error","data":{"error":"unknown channel: web_data"}}`.

**The REST read keeps serving as a depth on the account read.** Poll
[`account_state`](../rest/info.md#account_state-overview) with
`detail: "overview"` — the same body the channel pushed. Only the push goes
away.

This channel was never listed in this reference, so a client that follows this
page is not affected. A client that subscribed to it after finding it in a
client SDK is.
:::
::::

:::info
**Channel names are snake_case (MTF-native).** This is the node `/ws` native surface, so channel wire names are snake_case (`l2_book`, `order_updates`, …). The gateway serves this same native WS at `api.<net>.mtf.exchange/ws`. One channel, [`candles`](#candles), is served by the gateway ONLY.
:::

The frame protocol mirrors HL's; the **channel names are MTF-native snake_case**. You subscribe with:

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

and receive an ack (`subscriptionResponse`), an initial snapshot (`is_snapshot: true`), then live change-driven `{"channel":...,"data":...}` pushes (`is_snapshot: false`). A push lands only when that channel's state actually changed since the last commit; an unchanged channel emits nothing. `coin` is **required** for the per-market channels (`l2_book`, `bbo`); see [Coin parameter](./index.md#coin-parameter) for how it is canonicalized (numeric asset id or symbol → asset-id key).

## Channels at a glance {#channels-at-a-glance}

| Channel | key | Source |
|---------|:-------:|--------|
| `l2_book` | `coin` (required) | committed book, on change |
| `bbo` | `coin` (required) | committed book, on change |
| `trades` | `coin` (required) | committed-block fills, on new fills — from the next node release this includes forced-close, TWAP-slice and trigger fills |
| `markets` | none | per-market dynamic state (mark / oracle / mid / premium / funding / OI / 24h ticker / halted) — full snapshot, then changed-row deltas |
| `fills` | `user`/`address` (required) | committed-block fills for that account — from the next node release this includes forced-close, TWAP-slice and trigger fills |
| `candles` | `coin` + `interval` (both required), `candle_type` (optional) | **gateway only** — price samples or trades folded into OHLCV bars, on change |
| `order_updates` | `user`/`address` (required) | per-account order lifecycle (place / fill / cancel / reject), on change — from the next node release a resting order hit by a forced close, a TWAP slice or a trigger also reports its fill |
| `open_orders` | `user`/`address` (required) | per-account resting-order set — a FULL snapshot re-emitted on every change |
| `notifications` | `user`/`address` (required) | per-account margin / liquidation notices, on change |
| `ledger_updates` | `user`/`address` (required) | per-account money movement (deposit / withdraw / transfer), on change |
| `active_asset_data` | `user` **and** `coin` (both required) | per-(user, coin) leverage / margin-mode / max-trade context, on change |
| `user_fundings` | `user`/`address` (required) | per-account realized funding payments, on change |
| `user_twap_slice_fills` | `user`/`address` (required) | per-account TWAP slice fills (`{fill, twapId}`), on change |
| `user_twap_history` | `user`/`address` (required) | per-account TWAP lifecycle (`{time, state, status}`; `state.twapId` is the parent id to pass to `twap_cancel`, alongside coin/side/sz/executedSz/minutes/reduceOnly: activated / finished / terminated), on change |
| `account_state` | `user`/`address` (required) | per-account collateral and margin health — cross-account scalars plus the `perp` / `spot` / `margin` / `option` lane summaries — on change + heartbeat every 4 committed blocks |
| `clearinghouse_state` | `user`/`address` (required) | per-account PERP position detail, keyed by dex — on change + heartbeat every 4 committed blocks |
| `option_state` | `user`/`address` (required) | per-account OPTION leg detail — on change + heartbeat every 4 committed blocks |
| `spot_margin_state` | `user`/`address` (required) | per-account spot-margin positions — on change + heartbeat every 4 committed blocks |

Subscribing to any other `type` returns `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

> ⬆️ **Upgrade notice — not live yet.** The three clauses above ship with the
> next node release. Until it lands, a fill that no signed action produced
> reaches none of those three channels: the chain settles it, and no subscriber
> is told. A market maker watching `fills` therefore misses the liquidation it
> just absorbed.

:::warning
**Some order lanes send a fill to NONE of these channels, and that release does
not change it.** An order placed by `modify` or `batch_modify`, an order placed
by CoreWriter `LimitOrder`, any order inside a `multi_sig` envelope, and every
clearing of a [frequent batch auction](../../concepts/fba.md) each settle with
no message on `trades`, on `fills` or on `order_updates` — for either party. See [unrecorded fills](../rest/info.md#unrecorded-fills). So a
market maker cannot read `fills` as the complete record of its own executions,
and must reconcile its position from
[`account_state`](../rest/info.md#account_state) instead.

An account that SENDS a `modify` still gets an `open_orders` re-snapshot for
it, because that channel re-emits on every `/exchange` action a subscribed
account sends. So the sender sees its resting set change with no fill message to
explain the change. **Read the new snapshot, not the difference between two of
them**: the difference cannot tell an amend from a fill. To size the fill, read
the replacement order id's `sz`: the fill is the size you sent minus that `sz`.

**A `multi_sig` re-snapshot goes to the SUBMITTER, not to `user`.** The envelope
executes as `user`, and the re-emission keys on the account that sent the
envelope. Any signer may submit, so when the submitter is not `user`, the
submitter gets a frame with an unchanged set and `user` — whose set really
changed — gets no frame at all.

**The MAKER gets no frame either, on any of these lanes.** The channel re-emits
when a fill touches an account, and these fills touch nothing. So a maker's
`open_orders` view keeps the consumed order at its old size until some other
event on that account forces a new frame. Poll
[`open_orders`](../rest/info.md#open_orders) over REST to settle what is really
resting.
:::

:::warning
**`all_mids`, `active_asset_ctx` and `user_events` are RETIRED.** Each one
duplicated a channel above, so a client had to pick, and a wrong pick was
silent.

| Retired channel | Subscribe to instead |
|---|---|
| `all_mids` | [`markets`](#markets) — every row carries `mid_px`, and the same frame carries mark, oracle, funding and OI |
| `active_asset_ctx` | [`markets`](#markets) — the same per-market row, for every market in one subscription |
| `user_events` | [`fills`](#fills) for executions, [`order_updates`](#order_updates) for order lifecycle, [`ledger_updates`](#ledger_updates) for money movement, [`notifications`](#notifications) for margin notices. Every event `user_events` carried has exactly one typed home among those four |

Subscribing to a retired name returns
`{"channel":"error","data":{"error":"unknown channel: <name>"}}`.
:::

:::danger
**`explorer_block` and `explorer_txs` are REMOVED.**

`explorer_txs` was a per-status firehose that did per-event work **on a
validator**, once for every watcher. A validator's job is consensus, not serving.
Both channels are gone rather than moved, because the archive already serves the
same data.

| Removed channel | Read this instead |
|---|---|
| `explorer_block` | [`recent_blocks`](../rest/info.md#recent_blocks) — an `/info` read, archive-backed, optional `limit` |
| `explorer_txs` | [`recent_transactions`](../rest/info.md#recent_transactions) — the same |

**Two fields do not survive the move**, and both are real losses:
`recent_blocks` carries no `proposer`, and `recent_transactions` carries no
`hash`. Correlate a submitted action by `cloid`, or read
[`action_outcome`](../rest/info.md#action_outcome).

**Size a poll so it cannot gap.** The block cadence is about 100 ms, so 100 rows
span roughly 10 seconds of chain and a 2-second poll always overlaps. Do not treat
that cadence as a constant — it moves between releases.

See the [upgrade notice](../upgrade-notice-ids-and-shapes.md#explorer-channels-removed).
:::

---

## Live channels {#live-channels}

### Aggregated L2 order book for one market {#l2_book}

Aggregated L2 order book for one market — perp or spot. **Requires `coin`** (a
perp symbol like `"BTC"`, or a spot pair name like `"BTC/USDC"`; a spot pair
streams its spot book depth in the pair's own tick / size planes, with `time: 0`
— the spot book carries no last-trade timestamp).

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

**Optional depth / precision aggregation.** The `l2_book` subscription accepts the same aggregation params as the [REST `l2_book`](../rest/info/perpetuals.md#l2_book) read, applied to every frame (snapshot and pushes):

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC", "n_sig_figs": 5, "mantissa": 5, "n_levels": 5 } }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `n_sig_figs` | uint | no | Group price levels to this many significant figures — an integer `2`–`5`. Absent ⇒ full-depth, tick-precise book |
| `mantissa` | uint | no | Sub-step for `n_sig_figs: 5` **only** — one of `1`, `2`, `5`. Invalid with any other `n_sig_figs` |
| `n_levels` | uint | no | Per-side depth cap — keep only the best `n_levels` levels per side (applied **after** grouping). Absent ⇒ up to the 20-level default |

Grouping is deterministic and away from the spread (bids round down, asks round up, so a grouped book is never tighter than the raw one); sizes of merged levels are **summed** (per-side total size is conserved). A connection holds one `l2_book` view per coin: re-subscribing to a coin with different aggregation params **replaces** the prior view (open a second connection if you want two groupings of one coin side by side). The subscription ack echoes the params you set. Invalid params return an `error` frame (the connection stays open).

### Top-of-book best bid and offer {#bbo}

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

### Public trade tape for one market {#trades}

Public trade tape for one market. **Requires `coin`.** Each frame's `data` is an
**array** of trade records; `px`/`sz` are **human decimal strings** — price tick-snapped in whole USDC, size on the market's `sz_decimals` plane, never raw 1e8; `side`
is the taker's side (`"B"` buy / `"A"` sell); `time` is the consensus block ts (ms);
`tid` is a deterministic trade id, served as a **decimal-digit string**.

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

**On-subscribe snapshot** (`is_snapshot: true`) — a **non-empty** array of the
market's bounded recent prints (up to the **64** most-recent, newest-first;
empty only if the market has never traded). Snapshot rows carry **`users: null`**
— the counterparty addresses are not reconstructed for historical prints:

```json
{ "channel": "trades", "is_snapshot": true, "data": [
  { "coin": "BTC", "side": "A", "px": "6164370000000", "sz": "24000", "time": 1735689500000, "tid": "4898317237641214538", "users": null }
] }
```

**Live pushes** (`is_snapshot: false`) — the new prints from the just-committed
block; each row's `users` carries the AGGRESSOR ONLY:

> ⬆️ **Upgrade notice — `users` drops to ONE element at the next node
> release.** It carried `[taker, maker]`; it will carry `[taker]`. The taker
> chose to cross and is named; the resting maker did not choose to be hit and
> is not. `users[0]` is unchanged, so a caller that reads only the aggressor
> needs no change. A caller that reads `users[1]` must stop.


```json
{ "channel": "trades", "is_snapshot": false, "data": [
  { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": "1234567890", "users": ["0x..taker"] }
] }
```

- `tid` is a **decimal-digit string**, not a number. It is a 64-bit hash-derived
  value and routinely exceeds 2⁵³, so a JSON number would silently lose its low
  digits in JavaScript and a join by `tid` would match nothing. Compare it as a
  string, or convert it with `BigInt`.

### Global dynamic state for all markets {#markets}

Global per-market **dynamic** state tape — every market's live mark / oracle / mid price, funding premium, open interest, 24h ticker, and halted flag, one row per market. GLOBAL: takes **no `coin` and no `user`**. The rows share the REST [`markets`](../rest/info/perpetuals.md#markets) dynamic builder, so the WS feed and the REST read never drift.

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
| `funding` | object | `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, identical to the REST `markets` row's `funding` block |
| `open_interest` | Decimal string | Current open interest, whole-unit size |
| `day_ntl_vlm` | Decimal string | Rolling-24h notional volume (whole-USDC) |
| `prev_day_px` | Decimal string \| null | Mark ~24h ago (whole-USDC); `null` when no 24h-ago sample |
| `change_24h` | Decimal string \| null | Signed 24h change fraction (`"0.05"` = +5%); `null` when no prior px |
| `halted` | bool | Whether the market is halted |

Spot rows carry only the fields with a spot analogue — `coin`, `kind` (`"spot"`), `mark_px`, `mid_px` (omitted when one-sided), `day_ntl_vlm`, `prev_day_px`; the perp-only fields (`oracle_px` / `premium` / `funding` / `open_interest` / `change_24h` / `halted`) are absent.

Frequency: change-driven — a delta frame lands only on commits where at least one market's row moved; a commit that changes nothing emits nothing.

### Per-account fill stream {#fills}

Per-account fill stream. Requires `user` (the 0x address; `address` is also accepted) — NOT a `coin`. Each executed match delivers a record to BOTH parties, each from its own perspective, with the same field set `{coin, side, px, sz, time, oid, cloid, tid, crossed}`:

- the **taker** record — the taker's own `oid`, its `cloid` (or `null`), the taker's side, `crossed: true`;
- the **maker** record — the maker's own `oid`, `cloid: null` (no cloid is captured for the resting side), the **opposite** side, `crossed: false`.

Both legs of one match share the same `tid` (the same value the public `trades` print carries). `oid` and `tid` are **decimal-digit strings** — see the [`trades`](#trades) note on why. `px`/`sz` are **human decimal strings**, the same plane the public `trades` tape uses — not raw 1e8. Per-account fill records carry **no `users` array**. The public [`trades`](#trades) tape names the AGGRESSOR only; no surface discloses the resting maker of a print.

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

The initial snapshot is the empty array `[]`; each push is an array holding one fill record:

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": "42", "cloid": "0xab..", "tid": "1234567890", "fee_token": "USDC", "crossed": true } ] }
```

### Rolling price bars for one market {#candles}

:::info
**`candles` is served by the GATEWAY only.** The node does not aggregate OHLCV. The gateway builds every bar itself, from the node's `trades` firehose and its price-sample tape. Subscribe on `wss://api.<net>.mtf.exchange/ws`. A node-direct subscribe (`ws://localhost:8080/ws`) is refused with `{"channel":"error","data":{"error":"unknown channel: candles"}}` and gets no ack.
:::

Rolling OHLCV bars for one market, one price series, at one bar size. **Requires both `coin` and `interval`**, and takes an optional `candle_type`. The three form the routing key together, so `1m` and `5m` on the same market — or `mark` and `oracle` at the same interval — are independent subscriptions, each with its own snapshot and pushes.

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m", "candle_type": "mark" } }
```

- `interval` ∈ `1m` / `5m` / `15m` / `1h` / `4h` / `1d`. `interval` is REQUIRED: a subscribe without it is rejected with `` {"channel":"error","data":{"error":"`candles` requires `interval`"}} ``. It is never normalized to a default.
- `candle_type` ∈ `mark` (**default**) / `oracle` / `trade`. `mark` is the [mark price](../../concepts/mark-prices.md) series and serves perp and spot markets; `oracle` is the [oracle index price](../../concepts/oracle-prices.md) series and serves perp markets only; `trade` is executed-trade OHLCV and serves perp and spot markets. An unknown value is rejected with ``{"channel":"error","data":{"error":"invalid candle_type: <token> (expected `mark`, `oracle` or `trade`)"}}``. It is never served as another series.
- **`trade` is accepted.** An earlier version of this page said it was retired and quoted a two-value rejection message. That was wrong on both counts. A `trade` series is SPARSE — a window with no fill has **no bar**, never a carried-forward one. A `mark` or `oracle` bar also carries real `v` / `q` / `n`, joined from the trade tape for the same bucket, whenever the coverage rule above is met. See the REST [`candle_snapshot`](../rest/info/perpetuals.md#candle_snapshot) read.
- The ack echoes `interval` and `candle_type` (including the applied `mark` default) so a client can correlate `(coin, interval, candle_type)` and learn which series it reads.

Both legs use the SAME envelope: `data` is an object `{ snapshot, candles }` — never a bare array, never a bare bar. Read `data.snapshot` to tell them apart; the frame-level `is_snapshot` is always `false` on this channel.

The **subscribe snapshot** (`"snapshot": true`) carries the recent bars, oldest first. `candles` is `[]` until the market has its first sample in that series:

```json
{ "channel": "candles",
  "data": { "snapshot": true, "candles": [
    { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "f": false, "v": "3.5", "q": "234500.00", "n": 4 }
  ] },
  "is_snapshot": false }
```

Each **push** (`"snapshot": false`) carries exactly ONE bar in the same array — the bar that just changed:

```json
{ "channel": "candles",
  "data": { "snapshot": false, "candles": [
    { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "f": false }
  ] },
  "is_snapshot": false }
```

REPLACE your history on a snapshot. UPDATE or APPEND the last bar on a push.

- `t` / `T` — bar open / close epoch-ms; the bar covers `[t, T]` and a sample rolls into a new bar when its timestamp crosses `T`.
- `s` — coin / market symbol; `i` — interval bucket token.
- `o` / `c` / `h` / `l` — open / close / high / low, **decimal USDC** strings (human dollars, e.g. `"67002.50"`).
- `f` — **filled bar**. `true` marks a bar the gateway invented: a carry-forward bar for an empty bucket, or a seed bar. `false` marks a bar built from real samples. Test `f`, not `n == 0`.
- `v` / `q` / `n` — base volume, quote volume, trade count. **All three are OPTIONAL.** They are present only when the gateway has proven trade coverage for that bucket. **An absent field states "no volume data".** A `"0"` would state "no trades" and put a false step in your series, so the field is omitted instead. Do not default an absent `v` to zero.

The series is **gapless**: an interval with no sample emits a flat bar carrying the prior close forward (`o = h = l = c = previous close`, and `f: true`). A bar needs **no trade**. A price exists at all times, so the series covers every window from the first price sample on — a market that has never traded still streams bars.

:::warning
**These bars come from a SAMPLED price series, not from the continuous price path.** `o` and `c` are the **first and last sample** of the window. `h` and `l` are the **highest and lowest sample** — the extremes of the samples, not the true extremes of the price. A spike that starts and ends between two samples leaves no trace in the bar.

Do not build wick analysis, liquidation-trigger reconstruction, or any "did the price touch X?" test on these bars. For the live price of one market, subscribe to [`markets`](#markets) and read that market's row instead. The same warning and the sample grid are on the REST [`candle_snapshot`](../rest/info/perpetuals.md#candle_snapshot) read.
:::

The gateway ring holds **1000 bars** per `(coin, interval, candle_type)` series by default, and a deeper ring for sub-minute intervals. A subscribe snapshot serves at most the newest **5000** bars of that ring.

### Per-account order lifecycle events {#order_updates}

Per-account order lifecycle. Requires `user` (the 0x address). Each push is an array of order-update records for that account from the just-committed block; the initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": "42", "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` ∈ `open` (resting; `order.sz` is the post-commit book remainder, `order.orig_sz` the size the order was placed with) / `filled` / `canceled` / `rejected` (+`reason`, null `oid`) / `cancel_rejected` (+`reason`) / `noop` (+`reason`, null `oid`).
- **`noop` is a SUCCESS, not a rejection** — a `reduce_only` order with nothing left to reduce. It placed nothing and it must not be retried; `rejected` is the one to act on. Branch on `status`, never on `reason`. **Not live yet**: it ships with the next node release, and until then the same outcome arrives as `rejected`. See [`noop`](../rest/exchange.md#statuses-noop).
- `order.oid` is a **decimal-digit string**, or `null` on a rejected placement.
- On a **`filled`** record, `order.sz` = the **FILLED** size and `order.orig_sz` = the **original** order size (so `sz / orig_sz` is the fill fraction); a taker also carries cumulative `filled_sz` + `avg_px`, while a maker leg reports the per-match `filled_sz` with `status` still `open` while any size rests.
- `limit_px` / `sz` / `orig_sz` / `avg_px` are **human decimal strings** — price tick-snapped in whole USDC, size on the market's `sz_decimals` plane, never raw 1e8; `time` is consensus-ms; unknown fields are `null`.
- **Not** emitted today: `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / TWAP transitions and engine-initiated (BOLE T0) cancels — the dispatch observation for those is an opaque ok/err with no per-order payload.

### Per-account resting order snapshot {#open_orders}

Per-account resting-order **set**. Requires `user` (the 0x address; `address` is also accepted) — NOT a `coin`. Unlike [`order_updates`](#order_updates) (per-event deltas), **every** `open_orders` frame is a FULL snapshot of the account's current resting orders — `is_snapshot` is `true` on the on-subscribe frame **and on every re-emission**. The node re-emits the complete set whenever any order-lifecycle change touches it (place / fill / cancel / modify / engine-initiated cancel), so a client simply **replaces its whole open-order set on each frame**; there are no partial deltas to reconcile. **One exception: a resting order consumed by an [unrecorded fill](../rest/info.md#unrecorded-fills) produces no frame**, so that account's snapshot stays stale — showing the order at its old size — until some other event on the account forces a re-emission. This sidesteps the [`order_updates`](#order_updates) gap where `modify` / `batchModify` / engine-initiated cancels carry no per-order delta.

```json
{ "method": "subscribe", "subscription": { "type": "open_orders", "user": "0x<address>" } }
```

The snapshot is an **array** of records, each in the same fixed shape as an [`order_updates`](#order_updates) `status: "open"` element — `[]` when the account has no resting orders:

```json
{ "channel": "open_orders", "is_snapshot": true, "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": null,
             "oid": "42", "cloid": null, "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- Each element is one resting order: the nested `order` object (`coin`, `side`, `limit_px`, `sz` = remaining size, `orig_sz`, `oid`, `cloid`, `tif`, `reduce_only`), with `filled_sz` / `avg_px` / `reason` all `null` (a standing order, not an event) and `time` the order's insertion timestamp (consensus ms). On this snapshot `orig_sz` is `null` (the placed size is not re-derived for a standing order) and `reduce_only` is `false`; `cloid` is the client id or `null`. `limit_px` is whole-USDC, `sz` is size-plane.
- Because every frame is a full snapshot, `is_snapshot` is always `true` here — treat each frame as the account's complete current resting set, not an incremental change.
- A parked TP/SL leg renders the SAME `trigger` block the REST read serves, so a ladder leg carries `group` and a trailing leg carries `trail_px` here too. Both keys are absent on every other leg — see [`open_orders`](../rest/info.md#open_orders) for the rule.

### Per-account margin and liquidation notices {#notifications}

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

### Per-account money movement history {#ledger_updates}

Per-account money movement, attributed to its **cause**. A record appears only when the action applied. It does NOT matter how the action reached the chain: a transfer, an asset send, a vault transfer and a bridge withdrawal all emit their record whether they arrived as a signed action or from a contract call on MetaFluxEVM. Until this release the EVM route emitted nothing, so a balance rebuilt from this channel was short by any move made that way. Requires `user`. The on-subscribe snapshot is an **array** of the account's most-recent ledger records, **newest-first**, bounded to the last **100** (`[]` when the account has no recent records); each subsequent push is an array holding the new record(s) for the just-committed block.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- **These `kind` values are RECORD NAMES, not action names.** `usd_send` and `spot_send` describe what a committed transfer did; neither is an `/exchange` action, and sending one gets `unknown variant`. The actions are [`send_asset`](../rest/exchange.md#send_asset) and [`usd_class_transfer`](../rest/exchange.md#usd_class_transfer).
- `kind` ∈ `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (+`token`), `asset_send` / `asset_receive` (+`asset`, `to_perp`), `withdraw` (`via`: `cctp` | `metabridge`), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer`, `vault_transfer`. A transfer emits one record per party (sender + receiver). Two more kinds arrive next release — see [Two record sources arrive next release](#ledger_updates-incoming).
- **Every `amount` is a whole-token decimal string**, `withdraw` included — there is no raw base-unit field on any record. `amount` is UNSIGNED on every kind listed above; read the direction from the `kind` (the incoming `liquidation` kind below is the one signed exception). Inbound bridge credit amounts and delayed contract calls (which dispatch in a later block) are not yet attributed. The ORDER of records inside one block's array is not part of the contract and it changed this release; correlate on `time` and `kind`, never on position.

#### Two more record sources {#ledger_updates-incoming}

> The two records below are LIVE. A client that rejects an unknown `kind` must
> accept them.

Both close a gap the bullet above names. Neither renames or removes an existing
`kind`, and neither changes the shape of a record you already receive.

| `kind` | Emitted for | Fields |
|--------|-------------|--------|
| `deposit` | A **bridge inbound credit**, at the block the cosigner quorum credits it. This channel emits no `deposit` record today | `kind`, `coin`, `amount`, `chain`, `via`, `time` |
| `liquidation` | A **liquidation settlement** — the signed balance change a forced close leaves on the account. New `kind` | `kind`, `coin`, `amount`, `market`, `cause`, `time`, optional `mark_px` |

Field rules for the two new kinds:

- `deposit.amount` is a positive whole-token decimal string — the quorum-credited amount. `chain` ∈ `base` / `arbitrum` names the source chain; `via` is always `"metabridge"`.
- `liquidation.amount` is **SIGNED** — negative on a loss. This is the one signed `amount` on the channel; every existing kind stays unsigned with direction read from `kind`.
- `liquidation.coin` is the settlement token (USDC); `market` names the perp the forced close ran on.
- `liquidation.cause` uses the same vocabulary as `user_fills` causes: `forced_close_partial` / `forced_close_full` / `forced_close_isolated` / `forced_close_governance`.
- **`forced_close_governance` is a forced close that is NOT a liquidation.** A validator-quorum `force_close_position` settles against the book like the ladder does, and it writes the same record — but it charges no liquidation fee and bumps no liquidation counter. Read the `cause` before you fold the record into a liquidation total.
- `liquidation.mark_px` is the whole-USDC mark the slice was priced from; the key is ABSENT when the market had no usable mark at the slice.
- ADL and backstop takeovers settle outside the measured slice and emit no `liquidation` record.
- **Treat an unknown `kind` as data, not an error.** Show the `amount` and the `time`, and label the cause from the `kind` string. That rule keeps a client working across every later addition too.

### Trading context for one account and market {#active_asset_data}

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
  "mark_px": "61742.69625702", "max_trade_size": null, "max_trade_szs": ["0", "0"],
  "available_to_trade": ["0", "0"], "has_position": false } }
```

- Keyed by `coin` (symbol). `margin_mode` ∈ `cross` / `isolated` / `strict_iso`;
  `max_trade_szs` / `available_to_trade` are `[buy, sell]` pairs; fields are
  identical to the REST
  [`active_asset_data`](../rest/info/perpetuals.md#active_asset_data) read.
- `max_trade_size` is the WHOLE MARKET's remaining open-interest headroom in size
  units, **not** the caller's limit, and it is `null` when the market is
  uncapped. Size an order against `max_trade_szs`. See
  [`max_trade_size` is market-wide](../rest/info/perpetuals.md#max-trade-size).

### Per-account collateral and margin health {#account_state}

Per-account **collateral and margin health** — the cross-account money figures
and the four lane summaries — pushed when they change. Requires `user` (the 0x
address) — NOT a `coin`. **`address` is not an alias here**: a subscribe carrying
`address` is refused with
``{"channel":"error","data":{"error":"`account_state` requires `user`"}}``, the
same answer as sending nothing. Note the two surfaces differ — the WS
subscription takes `user`, while the REST
[`account_state`](../rest/info.md#account_state) read takes `address`. The body
is built from the same builder as the REST [`account_state`](../rest/info.md#account_state) read,
so a push never drifts from that read. The initial snapshot is the live state
(zeroed for an account with no funds), not an empty array.

**This four-lane frame is the live shape.** The earlier FLAT body — the position
table and the balance array inside this frame — is gone from the wire. Parse the
lanes. See [where every field went](../rest/info.md#account-state-lane-split).

```json
{ "method": "subscribe", "subscription": { "type": "account_state", "user": "0x<address>" } }
```

```json
{
  "channel": "account_state",
  "data": {
    "address": "0x<addr>",
    "account_value": "10000", "total_raw_usd": "9559", "withdrawable": "8500",
    "health": "9700", "tier": "Safe",
    "abstraction": "unified",
    "pm_net_value": "0",
    "perp": {
      "init_margin": "1500", "total_ntl_pos": "372.60",
      "pm_maint_margin": "0", "pm_concentration_penalty": "0"
    },
    "spot": { "balances": [
      { "name": "USDC", "signing_id": 100, "total": "10000", "hold": "0", "avg_entry_px": null },
      { "name": "MTF",  "signing_id": 3,   "total": "12.5",  "hold": "0", "avg_entry_px": "1.98" }
    ] },
    "margin": { "collateral": "0", "debt": "0", "pairs": 0 },
    "option": { "escrow": "0", "legs": 0 },
    "position_mode": "one_way",
    "height": 562,
    "time": 1700000000555
  }
}
```

- **The position table and the option legs are NOT on this frame.** They moved to
  [`clearinghouse_state`](#clearinghouse_state) and [`option_state`](#option_state),
  each its own channel. Subscribe to the lane you render.
- Every field, its plane and its rule are in the REST
  [field reference](../rest/info.md#account-state-fields) — the two are one body.
  In short: the money figures are **whole-USDC** decimal strings; `tier` is a
  **string** (`"Safe"` / `"T0"` / `"T1"` / `"T2"` / `"T3"`), never a number;
  `health` is a **signed dollar figure, not a ratio**; `height` / `time` are bare
  integers.
- **The four lane keys are always present**, zeroed when the lane is empty, and
  `spot.balances` always carries at least the USDC row. `option.next_expiry` is
  the one key that can be absent — it is omitted when `option.legs` is `0`.
- There is no account-level `cross_maintenance_margin_used` on this frame. Poll
  [`account_state` with `detail: "margin"`](../rest/info.md#account-state-detail-margin)
  for it. Its scope is the cross bucket: an isolated leg is margined and
  liquidated on its own and contributes nothing to it. That depth also names the
  held initial margin `total_margin_used`, where this frame calls it
  `perp.init_margin`.
- `height` / `time` — the **as-of stamp**: `height` is the committed block height
  the frame was rendered against and `time` the consensus block time in ms. Both
  are **bare integers** (not Decimal strings) and advance on **every** commit,
  even when nothing else in the record moved. Identical values to the REST read.
  They are **excluded from the change-gate** below (the stamp advancing never by
  itself triggers a push), so a client can use them to tell a fresh-but-quiet
  account from a stalled feed.

:::warning
**A zero stamp means "no view yet", not "an account worth nothing".** If the
serving layer has no body for your account at the moment you subscribe, the first
frame is a **placeholder**: every figure zero, `spot.balances` empty, and
`height` / `time` both `0`. A real account never reads that way — the USDC row is
unconditional and the stamp is a live block height. **Test `height != 0` before
you render or store the first frame**, and wait for the next push. The same rule
holds on [`clearinghouse_state`](#clearinghouse_state) and
[`option_state`](#option_state).
:::

Frequency: change-driven, **plus a liveness heartbeat**. A frame is sent when the
account's state changes since the last commit. The current full snapshot
(unchanged body, only a fresh `height`/`time` stamp) is also re-sent every 4
committed blocks, even when nothing changed. This interval is **commit-count
based, not wall-clock** — block cadence is a governed, per-deployment target, so
4 commits maps to a different real-time span on different deployments. Read the
`height` field's own advance rate if you need a wall-clock estimate. The
heartbeat lets a client confirm the feed is live and distinguish a quiet account
from a stalled connection.

:::warning
`account_state` is per-account data but currently has **no authentication** — any
connection can subscribe to any address. Do not treat it as private until the
auth-at-subscribe gate lands. The same holds for
[`clearinghouse_state`](#clearinghouse_state) and [`option_state`](#option_state).
:::

### Per-account perp positions {#clearinghouse_state}

Per-account **perp position detail** — the dex-keyed position table that left the
`account_state` body. Requires `user`; a subscribe without one is refused with
``{"channel":"error","data":{"error":"`clearinghouse_state` requires `user`"}}``.
Same builder as the REST
[`clearinghouse_state`](../rest/info.md#clearinghouse_state) read, so the push and
the read never drift.

:::warning Not live yet
The dex key changes from the deployer's address to the dex NAME with the next
network upgrade, on this channel and on the REST read together — one builder
serves both. Until that upgrade fires, a live node keys every non-core bucket by
the deployer's lowercase `0x` address. The name rule, and the name each existing
dex receives, are in [the dex key](../rest/info.md#dex-key).
:::

```json
{ "method": "subscribe", "subscription": { "type": "clearinghouse_state", "user": "0x<address>" } }
```

```json
{
  "channel": "clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "clearinghouse_state": {
      "": { "positions": [
        { "coin": "BTC", "size": "-0.13362", "entry": "80141.2", "upnl": "352.85",
          "isolated": false, "lev": 39, "liq": "89836.48723157", "roe": "1.27844323",
          "funding": "-1.59606669", "margin": "276", "maint_margin": "53.54233572",
          "notional": "-10355.61681", "side": "short" }
      ] },
      "GRAD": { "positions": [
        { "coin": "GRAD:000001SH", "size": "-0.85", "entry": "576.18964705",
          "upnl": "-10.02605", "isolated": true, "lev": 5, "liq": "699.45368895",
          "roe": "-0.08392298", "funding": "0", "margin": "119.46727161",
          "maint_margin": "14.692836", "notional": "-499.78725", "side": "short" }
      ] }
    },
    "height": 562,
    "time": 1700000000555
  }
}
```

- `clearinghouse_state` is keyed by dex NAME — `""` is the core dex and is
  **always present**, else the name of one deployed dex. Every market on dex
  `NAME` has the symbol `NAME:SUFFIX`, so the key and the row's `coin` prefix are
  the same string; see [the dex key](../rest/info.md#dex-key). Every row field is
  in the REST [row table](../rest/info.md#clearinghouse_state). **`liq` is
  nullable** — `null` means no non-negative price liquidates the leg, and it is
  never rendered as `"0"`. See [reading `liq`](../rest/info.md#reading-liq).
- **`side` is present only in hedge mode, and ABSENT — not `null` — in one-way
  mode.** Read `position_mode` on [`account_state`](#account_state) to know which
  shape to expect. The reason is what each mode can hold: hedge mode can hold a
  long leg AND a short leg on one coin, so every row carries its own `side`
  (`"long"` / `"short"`) and the pair is unambiguous. One-way mode collapses the
  coin to a single NET position, so there is no leg to label and the key is
  omitted. Do not infer the mode from the sign of `size` — a one-way net position
  is also negative when it is short.
- **This frame never carries `adl_lamps`.** `detail` is a REST parameter only, so
  the push always renders the default shape. The lamp ranks your seat against
  OTHER accounts, so an always-on lamp would re-emit your frame whenever a
  stranger's PnL crossed a quartile edge. Poll
  [`clearinghouse_state` with `detail: "adl"`](../rest/info.md#account_state-adl)
  for it.
- **The frame carries no account figures.** No `account_value`, no
  `withdrawable`, no `health`, no `balances`. Read those from
  [`account_state`](#account_state).

:::danger
**Do not join this frame with an `account_state` frame to compute one number.**
The two channels are published from the same commit and carry the same
`height` / `time` stamp, but they arrive as separate messages and your client can
hold two different vintages. **Compare `height` before you combine them**, and
take any single consistent number set from `account_state` alone.
:::

Frequency: change-driven, plus the same 4-commit liveness heartbeat as
`account_state`, from the same commit — so a summary and its detail are rendered
against one block even though they arrive as two frames.

### Per-account option legs {#option_state}

Per-account **option leg detail** — one row per series the account is party to.
Requires `user`; a subscribe without one is refused with
``{"channel":"error","data":{"error":"`option_state` requires `user`"}}``. Same
builder as the REST [`option_state`](../rest/info.md#option_state) read.

:::warning Renamed
This channel was going to be called `option_positions`. That name is **not an
alias** and is not accepted — it answers
`{"channel":"error","data":{"error":"unknown channel: option_positions"}}`.
Subscribe to `option_state`.
:::

```json
{ "method": "subscribe", "subscription": { "type": "option_state", "user": "0x<address>" } }
```

```json
{
  "channel": "option_state",
  "data": {
    "address": "0x<addr>",
    "positions": [
      { "signing_id": 2147483649, "underlying": "BTC", "kind": "put",
        "strike": "100000", "expiry": 1735689600000,
        "long": "2.5", "short": "0",
        "settle_asset": "USDC", "escrow": "0" }
    ],
    "height": 562,
    "time": 1700000000555
  }
}
```

- `positions` is `[]` for an account party to nothing — that is the snapshot, not
  an error. Every row field is in the REST
  [`option_state`](../rest/info.md#option_state) table. `signing_id` is served
  whole; never compute it.
- **`escrow` is denominated in that row's `settle_asset`** — USDC on a put, the
  underlying COIN on a call, because a
  [call escrows one coin](../../products/options.md#why-a-call-escrows-one-coin)
  per unit. `settle_asset` lands with the standard European option release; it is
  absent, and every `escrow` is USDC, until that release fires.
- For the account totals — escrow, leg count, nearest expiry — read the `option`
  lane of [`account_state`](#account_state). That summary's `escrow` counts PUT
  legs only, because coins cannot be added to dollars, so this channel is the only
  place a call leg's escrow carries a currency.

Frequency: change-driven, plus the same 4-commit liveness heartbeat as
`account_state`, from the same commit.

### Per-account spot-margin positions {#spot_margin_state}

Per-account **spot-margin** positions — the leveraged spot-margin book for one
account (see [spot margin](../../products/spot-margin.md)) — pushed when it
changes. Requires `user`. The initial snapshot is the live position set (`[]`
for an account with no spot-margin positions). This is **not** a plain
spot-token-balance feed. Plain per-token spot balances ride the
[`account_state`](#account_state) channel instead, in its `spot.balances` array.

```json
{ "method": "subscribe", "subscription": { "type": "spot_margin_state", "user": "0x<address>" } }
```

```json
{
  "channel": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": "MTF/USDC",
        "collateral": "0",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ],
    "height": 26424249,
    "time": 1788149246789
  }
}
```

- `height` / `time` — the **as-of stamp**, always present, exactly as on
  [`account_state`](#account_state): `height` is the committed block height the
  frame was rendered against and `time` the consensus block time in ms. Both are
  **bare integers**. They advance on every commit, so they tell a quiet account
  from a stalled feed.
- `accounts[]` — one entry per open spot-margin position, in pair-id order; the
  same body the REST [`spot_margin_state`](../rest/info/spot.md#spot_margin_state)
  read renders (single-source). `pair` is the pair's symbol (e.g. `"MTF/USDC"`),
  not a numeric id. `collateral` reads `"0"` — spot margin is cross-collateralized
  against the unified USDC account; the field is kept only for wire-shape
  compatibility. `current_debt` is `borrowed` accrued to now against the pool's
  live borrow index. `params` is `null` when margin is not enabled/calibrated
  for the pair.

Frequency: change-driven, **plus a liveness heartbeat**, because `current_debt`
accrues every commit even with no trading activity. A frame is sent when the
position set changes since the last commit. The current full snapshot
(unchanged body) is also re-sent every 4 committed blocks, even when nothing
changed. This interval is **commit-count based, not wall-clock** — block
cadence is a governed, per-deployment target, so 4 commits maps to a different
real-time span on different deployments. Measure your own deployment's commit
rate if you need a wall-clock estimate. This lets a client confirm the feed is
live.

### Per-account realized funding payments {#user_fundings}

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

### Per-account TWAP slice fills {#user_twap_slice_fills}

Per-account TWAP slice fills — one record each time a running `twap_order`'s
slice crosses the book. Requires `user` (the 0x address; `address` is also
accepted) — NOT a `coin`. Each frame's `data` is an array of slice-fill
records from the just-committed block; the initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_twap_slice_fills", "user": "0x<address>" } }
```

```json
{ "channel": "user_twap_slice_fills", "data": [
  { "fill": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "1000000", "time": 1735689600123, "oid": "42", "cloid": null, "tid": "1234567890", "fee_token": "USDC", "crossed": true }, "twapId": 17 }
] }
```

- `fill` — the same taker-leg record shape [`fills`](#fills) carries.
- `twapId` — the parent TWAP's id, the same value [`twap_cancel`](../rest/exchange.md#twap_cancel) takes.

### Per-account TWAP lifecycle {#user_twap_history}

Per-account TWAP parent lifecycle — one record on each state transition
(`activated` / `finished` / `terminated`). Requires `user`. Each frame's
`data` is an array of transition records; the initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_twap_history", "user": "0x<address>" } }
```

```json
{ "channel": "user_twap_history", "data": [
  { "time": 1735689600123,
    "state": { "twapId": 17, "coin": "BTC", "side": "B", "sz": "10000000", "executedSz": "1000000", "minutes": 60, "reduceOnly": false, "timestamp": 1735689600123 },
    "status": { "status": "activated" } }
] }
```

- `state.twapId` — the parent id to pass to [`twap_cancel`](../rest/exchange.md#twap_cancel) — the id appears nowhere else pre-fill.
- `state.sz` / `state.executedSz` — total / executed size, size-plane decimal strings.
- `status.status` ∈ `activated` / `finished` / `terminated`.

---

## `post` — request/response over WS {#post--requestresponse-over-ws}

Not a subscription channel, but the way to do one-shot reads and signed writes over the same socket. The `request` is the same `{type, payload}` envelope as the REST routes; it is dispatched through the identical handlers (`POST /info`, `POST /exchange`). See [`post` in the WS README](./index.md#post-requestresponse-over-ws) for the full request/response shapes and signing rules.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

`post` is **live on the public endpoint**. One socket carries both subscriptions
and request/response — you do not need a second connection, and you do not need
to fall back to REST for a read. The request goes to the same `/info` and
`/exchange` handlers, so a malformed request returns that handler's own
field-validation error, not a transport error. See the
[WS README](./index.md#post-requestresponse-over-ws) for the response envelope
and the signing rules.

---

## Roadmap — not yet available {#roadmap--not-yet-available}

The following channels appeared in earlier drafts but are **not implemented** on the node WS surface. They are not recognized channel names; subscribing returns an `unknown channel` error. Listed here so integrators are not misled by older SDK stubs.

- **Public market data:** `meta` (universe metadata), `mark` (mark/oracle price), `fundingTicks` (funding-rate updates).
- **Per-user (would require auth):** `vaultEvents`, `rfqEvents`.

Also not implemented today:

- **Diff-based `l2_book`** (partial `updates` frames) — current `l2_book` always sends full top-20 bodies. The frame does carry an `is_snapshot` flag (`true` on the initial snapshot, `false` on change-driven pushes), but every body is a full snapshot — there are no partial-diff `updates` frames.
- **`seq` / `resume` / resume tokens** — every (re)subscribe starts from a fresh snapshot.
- **Auth-at-subscribe envelope** for private channels — use `post` with a signed action for authenticated operations.

---

## Ordering & delivery {#ordering--delivery}

- **Per subscription**, frames arrive in commit order (a frame is emitted only on the commits where the watched channel's state changed). There is no `seq`; ordering is implicit in arrival order on the single socket.
- **Across subscriptions**, there is no ordering guarantee — interleave is arbitrary. Demux on `channel` + the `coin` inside `data`.
- Delivery is **at-most-once per change** and **not buffered for resume**: a subscription that lags more than 256 frames behind is dropped with a `lagged` error frame (see [Backpressure & lag](./index.md#backpressure--lag)). Re-subscribe to recover; you get a fresh snapshot.

## See also {#see-also}

- [WS README](./index.md) — connection lifecycle, frames, coin parameter, `post`, backpressure
- [`POST /info`](../rest/info.md) — REST equivalents for one-shot reads (also reachable via `post`)
- [`POST /exchange`](../rest/exchange.md) — signed-action envelope shared by the `post` action path
