# WS subscription channels

This page lists the WebSocket channels, the key of each channel and the shape of each frame.

::::info
A channel emits a frame only when its state changed since the last commit. Four account-state channels also re-send an unchanged snapshot every 4 committed blocks: `account_state`, `clearinghouse_state`, `option_state` and `spot_margin_state`. This heartbeat counts commits. It does not use a wall-clock interval. Channels under [Roadmap](#roadmap--not-yet-available) are not wired. The [WS overview](./index.md) describes the connection lifecycle and the frame format.

:::warning
`web_data2` (REST and WS) is removed. Compose the equivalent from
[`account_state`](#account_state), [`clearinghouse_state`](#clearinghouse_state),
[`spot_margin_state`](#spot_margin_state) and `order_updates`. You can also use the REST focused
reads. A subscribe to `web_data2` returns
`{"channel":"error","data":{"error":"unknown channel: web_data2"}}`.
:::

:::warning
The WS `web_data` channel is retired. A subscribe returns
`{"channel":"error","data":{"error":"unknown channel: web_data"}}`.

The REST read still works as a depth on the account read. Poll
[`account_state`](../rest/info/account.md#account_state-overview) with
`detail: "overview"`. It returns the same body that the channel pushed. Only the push is gone.

This reference never listed the channel, so a client that follows this
page is not affected. A client that subscribed to it after it found it in a
client SDK is affected.
:::
::::

:::info
Channel names are snake_case (`l2_book`, `order_updates`). The gateway serves the node `/ws` surface at `api.<net>.mtf.exchange/ws`. Only the gateway serves one channel, [`candles`](#candles).
:::

The frame protocol uses the same shape as Hyperliquid. The channel names are snake_case. Subscribe with:

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

The server replies with an ack (`subscriptionResponse`) and an initial snapshot (`is_snapshot: true`). Then it pushes `{"channel":...,"data":...}` frames (`is_snapshot: false`). A push arrives only when the state of that channel changed since the last commit. An unchanged channel emits nothing. The per-market channels (`l2_book`, `bbo`) require `coin`. [Coin parameter](./index.md#coin-parameter) describes how the node converts it: a numeric asset id or a symbol becomes an asset-id key.

A subscribe answers one snapshot frame. Some subscribes used to answer two `is_snapshot: true` frames, the gateway body and the node body, and the two could disagree. The gateway now forwards the node snapshot. It sends a body of its own only when the node sends nothing inside the wait window. [`open_orders`](#open_orders) is the one exception. Every frame on that channel is a full snapshot and carries `is_snapshot: true`.

## Channels at a glance {#channels-at-a-glance}

| Channel | key | Source |
|---------|:-------:|--------|
| `l2_book` | `coin` (required) | committed book, on change |
| `bbo` | `coin` (required) | committed book, on change |
| `trades` | `coin` (required) | committed-block fills, on new fills. This includes forced-close, TWAP-slice and trigger fills |
| `markets` | none | per-market dynamic state (mark / oracle / mid / premium / funding / OI / 24h ticker / halted). A full snapshot, then changed-row deltas |
| `fills` | `user`/`address` (required) | committed-block fills for that account. This includes forced-close, TWAP-slice and trigger fills |
| `candles` | `coin` + `interval` (both required), `candle_type` (optional) | gateway only. Price samples or trades folded into OHLCV bars, on change |
| `order_updates` | `user`/`address` (required) | per-account order lifecycle (place / fill / cancel / reject), on change. A resting order hit by a forced close, a TWAP slice or a trigger also reports its fill |
| `open_orders` | `user`/`address` (required) | per-account resting-order set. A full snapshot, re-emitted on every change |
| `notifications` | `user`/`address` (required) | per-account margin and liquidation notices, on change |
| `ledger_updates` | `user`/`address` (required) | per-account money movement (deposit / withdraw / transfer), on change |
| `active_asset_data` | `user` and `coin` (both required) | per-(user, coin) leverage / margin-mode / max-trade context, on change |
| `user_fundings` | `user`/`address` (required) | per-account realized funding payments, on change |
| `user_twap_slice_fills` | `user`/`address` (required) | per-account TWAP slice fills (`{fill, twapId}`), on change |
| `user_twap_history` | `user`/`address` (required) | per-account TWAP lifecycle (`{time, state, status}`; `state.twapId` is the parent id to pass to `twap_cancel`, alongside coin/side/sz/executedSz/minutes/reduceOnly: activated / finished / terminated), on change |
| `account_state` | `user`/`address` (required) | per-account collateral and margin health (cross-account scalars plus the `perp` / `spot` / `margin` / `option` lane summaries), on change + heartbeat every 4 committed blocks |
| `clearinghouse_state` | `user`/`address` (required) | per-account PERP position detail, keyed by dex, on change + heartbeat every 4 committed blocks |
| `option_state` | `user`/`address` (required) | per-account OPTION leg detail, on change + heartbeat every 4 committed blocks |
| `spot_margin_state` | `user`/`address` (required) | per-account spot-margin positions, on change + heartbeat every 4 committed blocks |

A subscribe to any other `type` returns `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

:::warning
Four order lanes used to send a fill to none of these channels. These lanes were:

- An order placed by `modify` or `batch_modify`.
- An order placed by CoreWriter `LimitOrder`.
- Any order inside a `multi_sig` envelope.
- Every clearing of a [frequent batch auction](../../concepts/fba.md).

They settled with no message on `trades`, on `fills` or on `order_updates`, for either party. Node 0.9.5 fixed `modify` and `multi_sig`. Node 0.9.6 records all four lanes. See
[every order lane records its fill](../rest/info/orders-fills.md#unrecorded-fills).
A market maker still reconciles its position from
[`account_state`](../rest/info/account.md#account_state). A fill stream is a
report, and a report can be behind.

An account that sends a `modify` still gets an `open_orders` re-snapshot for
it. That channel re-emits on every `/exchange` action that a subscribed
account sends. The sender sees its resting set change with no fill message to
explain the change. Read the new snapshot, not the difference between two of
them. The difference cannot tell an amend from a fill. To size the fill, read
the `sz` of the replacement order id. The fill is the size you sent minus that `sz`.

A `multi_sig` re-snapshot goes to the submitter, not to `user`. The envelope
executes as `user`, and the re-emission uses the account that sent the
envelope as its key. Any signer may submit. When the submitter is not `user`, the
submitter gets a frame with an unchanged set, and `user` gets no frame. The set of `user` is the one that changed.

The maker gets no frame either, on any of these lanes. The channel re-emits
when a fill touches an account, and these fills touch nothing. A maker
`open_orders` view keeps the consumed order at its old size until some other
event on that account forces a new frame. Poll
[`open_orders`](../rest/info/orders-fills.md#open_orders) over REST to see what is
resting.
:::

:::warning
`all_mids`, `active_asset_ctx` and `user_events` are retired. Each one
duplicated a channel above. A client had to pick one, and a wrong pick was
silent.

| Retired channel | Subscribe to instead |
|---|---|
| `all_mids` | [`markets`](#markets). Every row carries `mid_px`, and the same frame carries mark, oracle, funding and OI |
| `active_asset_ctx` | [`markets`](#markets). It has the same per-market row, for every market in one subscription |
| `user_events` | [`fills`](#fills) for executions, [`order_updates`](#order_updates) for order lifecycle, [`ledger_updates`](#ledger_updates) for money movement, [`notifications`](#notifications) for margin notices. Every event that `user_events` carried has exactly one typed home among those four |

A subscribe to a retired name returns
`{"channel":"error","data":{"error":"unknown channel: <name>"}}`.
:::

:::danger
`explorer_block` and `explorer_txs` are removed.

`explorer_txs` was a firehose for each status. It did work for each event on a
validator, once for every watcher. A validator does consensus and does not serve data.
The channels are gone and not moved, because the archive already serves the
same data.

| Removed channel | Read this instead |
|---|---|
| `explorer_block` | [`recent_blocks`](../rest/info/chain.md#recent_blocks), an `/info` read backed by the archive, with an optional `limit` |
| `explorer_txs` | [`recent_transactions`](../rest/info/chain.md#recent_transactions), the same kind of read |

Two fields do not survive the move, and both are real losses.
`recent_blocks` carries no `proposer`, and `recent_transactions` carries no
`hash`. Correlate a submitted action by `cloid`, or read
[`action_outcome`](../rest/info/account-history.md#action_outcome).

Size a poll so that it cannot leave a gap. The block cadence is about 100 ms, so 100 rows
span roughly 10 seconds of chain and a poll every 2 seconds always overlaps. The cadence is not a constant. It moves between releases.

See [Ids and wire shapes](../../changelog/ids-and-wire-shapes.md#explorer-channels-removed).
:::

---

## Real-time channels {#live-channels}

### Aggregated L2 order book for one market {#l2_book}

This channel streams the aggregated L2 order book for one market, perp or spot. It requires `coin`. Use a
perp symbol such as `"BTC"`, or a spot pair name such as `"BTC/USDC"`. A spot pair
streams its spot book depth in the tick and size planes of the pair.

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC" } }
```

The initial snapshot and every push use this shape:

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

- `levels` is `[bids, asks]`. Bids start with the best (highest) price. Asks start with the best (lowest) price.
- Each level is `{ px, sz, n }`. `px` and `sz` are raw fixed-point magnitudes as decimal strings. The gateway applies the tick scaling of each asset downstream. `n` is the number of resting orders at that price.
- Each side holds at most 20 aggregated levels.
- On a push, `time` is the `last_trade_ms` of the book (derived from consensus). It is `0` until the book has traded.
- On a spot pair, `time` is the newest print that the serving node has seen since it started. The node keeps no trade ring since [block 25,599,540](../../changelog/block-25599540.md#tape-retirement-reads). `time` is `0` until the first print after a start. A `0` on a spot book after a node restart does not mean that the pair never traded.
- On the snapshot frame that follows a subscribe, `time` is the moment when the gateway served the frame. It is never below the book time of the node. The body is the current book, and the stamp says "as of now", so a staleness guard does not refuse a warm book. Read `time` on a snapshot frame as the serve time, not as the last trade. The same holds on [`bbo`](#bbo).

Each push is a full snapshot of the top 20 levels, not a partial diff. The frame envelope carries an `is_snapshot` boolean. It is `true` on the initial snapshot and `false` on later pushes. The body is the full top-20 book in both cases, so the field is informational. Replace your local book on each frame and you stay correct.

Frequency: the channel sends a frame only when the book changed since the last commit. A commit that leaves this book unchanged emits nothing. If the coin maps to no known market, you still get the ack. The snapshot body is the empty book (`"levels": [[], []]`, `"time": 0`) and no pushes follow.

#### Depth and precision aggregation

The `l2_book` subscription accepts the same aggregation parameters as the [REST `l2_book`](../rest/info/perpetuals.md#l2_book) read. They apply to every frame, snapshot and pushes:

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC", "n_sig_figs": 5, "mantissa": 5, "n_levels": 5 } }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `n_sig_figs` | uint | no | Group price levels to this many significant figures, an integer `2` to `5`. If absent, the book has full depth and tick precision |
| `mantissa` | uint | no | Sub-step for `n_sig_figs: 5` only. One of `1`, `2`, `5`. Invalid with any other `n_sig_figs` |
| `n_levels` | uint | no | Depth cap for each side. The book keeps only the best `n_levels` levels on each side, after grouping. If absent, the cap is the default of 20 levels |

Grouping is deterministic and moves away from the spread. Bids round down and asks round up, so a grouped book is never tighter than the raw one. The sizes of merged levels are summed, so the total size of each side stays the same. A connection holds one `l2_book` view for each coin. A new subscribe to a coin with different aggregation parameters replaces the earlier view. Open a second connection to see two groupings of one coin side by side. The subscription ack echoes the parameters that you set. Invalid parameters return an `error` frame, and the connection stays open.

### Top-of-book best bid and offer {#bbo}

This channel streams the best bid and offer for one market. It is a thinner `l2_book`. It requires `coin`.

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
- `time` is `last_trade_ms`, as on [`l2_book`](#l2_book). This includes the serve stamp on the snapshot frame.

Frequency: the channel sends a frame only when the top of book changed since the last commit. An unchanged book emits nothing.

---

### Public trade tape for one market {#trades}

This channel streams the public trade tape for one market. It requires `coin`. The `data` of each frame is an array of trade records.

- `px` and `sz` are human decimal strings. The price is tick-snapped in whole USDC. The size uses the `sz_decimals` plane of the market. Neither is raw 1e8.
- `side` is the side of the taker (`"B"` buy, `"A"` sell).
- `time` is the consensus block timestamp in ms.
- `tid` is a deterministic trade id, served as a decimal-digit string.

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

The on-subscribe snapshot (`is_snapshot: true`) is an array of the recent prints of the market. It holds up to the 64 most recent prints, newest first. Snapshot rows carry `users: null`. The node does not rebuild the counterparty addresses of historical prints.

The node keeps no trade ring since
[block 25,599,540](../../changelog/block-25599540.md#tape-retirement-reads),
so its own snapshot is empty. The gateway then serves the snapshot from its own
24-hour trade window, in the same row shape. The snapshot is empty when that
window holds no print for the market.

```json
{ "channel": "trades", "is_snapshot": true, "data": [
  { "coin": "BTC", "side": "A", "px": "6164370000000", "sz": "24000", "time": 1735689500000, "tid": "4898317237641214538", "users": null }
] }
```

Real-time pushes (`is_snapshot: false`) carry the new prints of the block that just committed. The `users` field of each row holds the aggressor only:

```json
{ "channel": "trades", "is_snapshot": false, "data": [
  { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": "1234567890", "users": ["0x..taker"] }
] }
```

- `tid` is a decimal-digit string, not a number. It is a 64-bit value derived from a hash and often exceeds 2⁵³. A JSON number would lose its low digits in JavaScript, and a join on `tid` would match nothing. Compare it as a string, or convert it with `BigInt`.

### Global dynamic state for all markets {#markets}

This channel streams the dynamic state of every market, one row for each market. A row holds the current mark, oracle and mid price, the funding premium, open interest, the 24h ticker and the halted flag. The channel is global. It takes no `coin` and no `user`. The rows use the same builder as the REST [`markets`](../rest/info/perpetuals.md#markets) dynamic state, so the WS feed and the REST read never drift.

```json
{ "method": "subscribe", "subscription": { "type": "markets" } }
```

The on-subscribe frame (`is_snapshot: true`) is an array of the rows of every market, perp and spot:

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

Each later push (`is_snapshot: false`) carries the changed rows only. It holds the full row of each market whose row moved in this commit. It omits unchanged markets, and a quiet commit pushes nothing:

```json
{ "channel": "markets", "is_snapshot": false, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "70000", "oracle_px": "70000",
    "mid_px": "70001", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.06", "halted": false }
] }
```

The snapshot holds all rows. A delta holds the changed rows only. Demultiplex each row on `(coin, kind)` and replace it in your local table. Every row labels itself with `kind` (`"perp"` or `"spot"`). Perp rows carry these fields:

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Market symbol (join key) |
| `kind` | `"perp"` | Market kind (join key) |
| `mark_px` | Decimal string | Mark price, whole-USDC, tick-snapped (`"0"` when unset) |
| `oracle_px` | Decimal string | Index price, whole-USDC, tick-snapped (`"0"` when unset) |
| `mid_px` | Decimal string | Mid of the real order book, whole-USDC, tick-snapped. Omitted when the book has one side only. Never sent as `null` |
| `premium` | Decimal string \| null | Latest funding premium sample, an 8-decimal string (truncated toward zero). `null` when no sample exists |
| `funding` | object | `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, identical to the `funding` block of the REST `markets` row |
| `open_interest` | Decimal string | Current open interest, whole-unit size |
| `day_ntl_vlm` | Decimal string | Rolling 24h notional volume (whole-USDC). A lower bound when the row carries `day_ntl_vlm_lower_bound_from` |
| `day_ntl_vlm_lower_bound_from` | uint64 \| absent | Consensus ms. Present only when `day_ntl_vlm` does not cover the whole 24h window. Absent when the figure is complete. Same rule as the REST [`markets`](../rest/info/perpetuals.md#day-ntl-vlm-bound) row |
| `prev_day_px` | Decimal string \| null | Mark about 24h ago (whole-USDC). `null` when there is no sample from 24h ago |
| `change_24h` | Decimal string \| null | Signed 24h change as a fraction (`"0.05"` = +5%). `null` when there is no prior price |
| `halted` | bool | Whether the market is halted |
| `settled` | bool \| absent | `true` on a permanently closed market. Absent on every other market. Same rule as the REST [`markets`](../rest/info/perpetuals.md#markets) row |
| `settled_px` | Decimal string \| absent | Whole-USDC price at which every position closed. Absent when no position was open at the delist |
| `time` | uint64 | Consensus ms of the commit that pushed this row. The 24-hour window of the gateway ends here |

The gateway fills `day_ntl_vlm` on this channel with the same rule as the REST [`markets`](../rest/info/perpetuals.md#day-ntl-vlm-bound) row. It does so on the snapshot and on every delta. It anchors the 24-hour window on the `time` of the row. It removes `day_ntl_vlm_lower_bound_from` only when its window covers the whole 24 hours. On a spot row, it then also serves the price of the first print in the window as `prev_day_px`. A row that still carries the marker is a lower bound. A marker equal to `time` means that there is no window. Read `"0"` as no data.

Spot rows carry only the fields that have a spot analogue: `coin`, `kind` (`"spot"`), `mark_px`, `mid_px` (omitted when the book has one side only), `day_ntl_vlm`, `day_ntl_vlm_lower_bound_from` (when set), `prev_day_px` and `time`. The perp-only fields are absent: `oracle_px`, `premium`, `funding`, `open_interest`, `change_24h`, `halted`, `settled` and `settled_px`.

Frequency: a delta frame arrives only on commits where at least one market row moved. A commit that changes nothing emits nothing.

### Per-account fill stream {#fills}

This channel streams the fills of one account. It requires `user` (the 0x address; `address` is also accepted). It does not take a `coin`. Each executed match delivers a record to both parties, each from its own side. The records use the same field set `{coin, side, px, sz, time, oid, cloid, tid, crossed}`:

- The taker record holds the `oid` of the taker, its `cloid` (or `null`), the side of the taker and `crossed: true`.
- The maker record holds the `oid` of the maker, `cloid: null` (the node captures no cloid for the resting side), the opposite side and `crossed: false`.

Both legs of one match share the same `tid`. This is the value that the public `trades` print carries. `oid` and `tid` are decimal-digit strings. See the [`trades`](#trades) note for the reason. `px` and `sz` are human decimal strings, on the same plane as the public `trades` tape. They are not raw 1e8. Account fill records carry no `users` array. The public [`trades`](#trades) tape names the aggressor only, and no surface discloses the resting maker of a print.

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

The initial snapshot is the empty array `[]`. Each push is an array that holds one fill record:

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": "42", "cloid": "0xab..", "tid": "1234567890", "fee_token": "USDC", "crossed": true } ] }
```

### Rolling price bars for one market {#candles}

:::info
Only the gateway serves `candles`. The node does not aggregate OHLCV. The gateway builds every bar itself, from the `trades` feed of the node and its price-sample tape. Subscribe on `wss://api.<net>.mtf.exchange/ws`. A subscribe sent directly to the node (`ws://localhost:8080/ws`) fails with `{"channel":"error","data":{"error":"unknown channel: candles"}}` and gets no ack.
:::

This channel streams rolling OHLCV bars for one market, one price series and one bar size. It requires both `coin` and `interval`. It takes an optional `candle_type`. The three fields together form the routing key. So `1m` and `5m` on the same market, or `mark` and `oracle` at the same interval, are independent subscriptions. Each has its own snapshot and pushes.

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m", "candle_type": "mark" } }
```

- `interval` is one of `1m`, `5m`, `15m`, `1h`, `4h`, `1d`. `interval` is required. A subscribe without it fails with `` {"channel":"error","data":{"error":"`candles` requires `interval`"}} ``. The gateway never uses a default.
- `candle_type` is one of `mark` (default), `oracle` and `trade`. `mark` is the [mark price](../../concepts/mark-prices.md) series and serves perp and spot markets. `oracle` is the [oracle index price](../../concepts/oracle-prices.md) series and serves perp markets only. `trade` is executed-trade OHLCV and serves perp and spot markets. An unknown value fails with ``{"channel":"error","data":{"error":"invalid candle_type: <token> (expected `mark`, `oracle` or `trade`)"}}``. The gateway never serves it as another series.
- `trade` is accepted. An earlier version of this page said that it was retired and quoted a rejection message with two values. Both statements were wrong. A `trade` series is sparse. A window with no fill has no bar, and the gateway never carries a bar forward. A `mark` or `oracle` bar also carries real `v`, `q` and `n`, joined from the trade tape for the same bucket, whenever the coverage rule above is met. See the REST [`candle_snapshot`](../rest/info/perpetuals.md#candle_snapshot) read.
- The ack echoes `interval` and `candle_type`, including the applied `mark` default. A client can then correlate `(coin, interval, candle_type)` and see which series it reads.

Both legs use the same envelope. `data` is an object `{ snapshot, candles }`. It is never a bare array and never a bare bar. Read `data.snapshot` to tell the two legs apart. The `is_snapshot` of the frame is always `false` on this channel.

The subscribe snapshot (`"snapshot": true`) carries the recent bars, oldest first. `candles` is `[]` until the market has its first sample in that series:

```json
{ "channel": "candles",
  "data": { "snapshot": true, "candles": [
    { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "f": false, "v": "3.5", "q": "234500.00", "n": 4 }
  ] },
  "is_snapshot": false }
```

Each push (`"snapshot": false`) carries exactly one bar in the same array, the bar that just changed:

```json
{ "channel": "candles",
  "data": { "snapshot": false, "candles": [
    { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "f": false }
  ] },
  "is_snapshot": false }
```

Replace your history on a snapshot. Update or append the last bar on a push.

- `t` and `T` are the open and close of the bar in epoch ms. The bar covers `[t, T]`. A sample starts a new bar when its timestamp crosses `T`.
- `s` is the coin or market symbol. `i` is the interval bucket token.
- `o`, `c`, `h` and `l` are open, close, high and low. They are decimal USDC strings in human dollars, for example `"67002.50"`.
- `f` marks a filled bar. `true` marks a bar that the gateway created: a carry-forward bar for an empty bucket, or a seed bar. `false` marks a bar built from real samples. Test `f`, not `n == 0`.
- `v`, `q` and `n` are base volume, quote volume and trade count. All three are optional. They are present only when the gateway has proven trade coverage for that bucket. An absent field means that there is no volume data. A `"0"` would mean that there were no trades and would put a false step in your series, so the gateway omits the field. Do not default an absent `v` to zero.

The series has no gaps. An interval with no sample emits a flat bar that carries the prior close forward (`o = h = l = c = previous close`, and `f: true`). A bar needs no trade. A price exists at all times, so the series covers every window from the first price sample on. A market that has never traded still streams bars.

:::warning
These bars come from a sampled price series, not from the continuous price path. `o` and `c` are the first and last sample of the window. `h` and `l` are the highest and lowest sample. They are the extremes of the samples and not the true extremes of the price. A spike that starts and ends between two samples leaves no trace in the bar.

Do not build wick analysis, liquidation-trigger reconstruction or any "did the price touch X?" test on these bars. For the current price of one market, subscribe to [`markets`](#markets) and read the row of that market. The REST [`candle_snapshot`](../rest/info/perpetuals.md#candle_snapshot) read has the same warning and the sample grid.
:::

By default, the gateway ring holds 1000 bars for each `(coin, interval, candle_type)` series. It holds a deeper ring for sub-minute intervals. A subscribe snapshot serves at most the newest 5000 bars of that ring.

### Per-account order lifecycle events {#order_updates}

This channel streams the order lifecycle of one account. It requires `user` (the 0x address). Each push is an array of order-update records for that account from the block that just committed. The initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": "42", "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` is one of `open` (resting; `order.sz` is the book remainder after the commit, and `order.orig_sz` is the size at placement), `filled`, `canceled`, `rejected` (with `reason`, null `oid`), `cancel_rejected` (with `reason`), `noop` (with `reason`, null `oid`) and `parked`.
- `parked` is an accepted trigger leg that is held off the book. It carries a real `oid`, `order.sz` is the whole leg, and `filled_sz`, `avg_px` and `reason` are all `null`. The leg never rests, so [`l2_book`](#l2_book) does not show it. The chain fires it when the mark crosses. See [`parked`](../rest/exchange.md#statuses-parked).
- `noop` is a success and not a rejection. It marks a `reduce_only` order with nothing left to reduce. It placed nothing and you must not retry it. `rejected` is the status to act on. Branch on `status`, never on `reason`. See [`noop`](../rest/exchange.md#statuses-noop).
- `order.oid` is a decimal-digit string, or `null` on a rejected placement.
- On a `filled` record, `order.sz` is the filled size and `order.orig_sz` is the original order size, so `sz / orig_sz` is the fill fraction. A taker also carries the cumulative `filled_sz` and `avg_px`. A maker leg reports the `filled_sz` of each match, and `status` stays `open` while any size rests.
- `limit_px`, `sz`, `orig_sz` and `avg_px` are human decimal strings. The price is tick-snapped in whole USDC. The size uses the `sz_decimals` plane of the market. Neither is raw 1e8. `time` is consensus ms. Unknown fields are `null`.
- `batch_cancel` pushes one `canceled` record for each leg that removed its order. A refused leg pushes nothing, because it changed nothing. Its reason is in the [`batch_cancel` reply](../rest/exchange/orders.md#batch_cancel-reply). This is in effect since [block 17,113,494](../../changelog/block-17113494.md#batch-cancel-legs).
- The channel does not emit these events today: `modify`, `batchModify`, `scheduleCancel`, `cancelAllOrders`, TWAP transitions and cancels that the engine starts (BOLE T0). The dispatch observation for these is an opaque ok or err with no payload for each order.

### Per-account resting order snapshot {#open_orders}

This channel streams the set of resting orders of one account. It requires `user` (the 0x address; `address` is also accepted). It does not take a `coin`. [`order_updates`](#order_updates) sends deltas for each event. Here, every `open_orders` frame is a full snapshot of the current resting orders of the account. `is_snapshot` is `true` on the on-subscribe frame and on every re-emission. The node re-emits the complete set whenever an order-lifecycle change touches it: place, fill, cancel, modify or a cancel that the engine starts. A client replaces its whole open-order set on each frame. There are no partial deltas to reconcile. This closes the [`order_updates`](#order_updates) gap, where `modify`, `batchModify` and cancels that the engine starts carry no delta for each order.

```json
{ "method": "subscribe", "subscription": { "type": "open_orders", "user": "0x<address>" } }
```

The snapshot is an array of records. Each record has the fixed shape of a `status: "open"` element of [`order_updates`](#order_updates). The array is `[]` when the account has no resting orders:

```json
{ "channel": "open_orders", "is_snapshot": true, "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": null,
             "oid": "42", "cloid": null, "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- Each element is one resting order: the nested `order` object (`coin`, `side`, `limit_px`, `sz` = remaining size, `orig_sz`, `oid`, `cloid`, `tif`, `reduce_only`). `filled_sz`, `avg_px` and `reason` are all `null`, because this is a standing order and not an event. `time` is the insertion timestamp of the order (consensus ms). On this snapshot, `orig_sz` is `null` because the node does not derive the placed size again for a standing order, and `reduce_only` is `false`. `cloid` is the client id or `null`. `limit_px` is whole-USDC and `sz` is on the size plane.
- Every frame is a full snapshot, so `is_snapshot` is always `true` here. Treat each frame as the complete current resting set of the account, not as an incremental change.
- A parked TP/SL leg renders the same `trigger` block that the REST read serves. A ladder leg carries `group` and a trailing leg carries `trail_px` here too. Both keys are absent on every other leg. See [`open_orders`](../rest/info/orders-fills.md#open_orders) for the rule.

### Per-account notices {#notifications}

This channel streams notices for one account. The node derives the margin and liquidation kinds by comparing consecutive committed states. The commit loop writes `action_dropped`. The channel requires `user`. It sends one array frame for each affected commit. The initial snapshot is `[]`.

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
  { "kind": "backstop_residual_cleared", "coin": "BTC", "side": "long", "message": "...", "time": 1735689600123 },
  { "kind": "action_dropped", "action_hash": "ab..", "nonce": 42, "code": "DROPPED_EXPIRED", "message": "...", "time": 1735689600123 } ] }
```

- `kind` is the machine tag. `message` is the text for a person. `tier` is one of `yellow_card`, `partial_market_50`, `full_market` and `backstop_takeover`, or `null` on a clear.
- `yellow_card` is the one-block margin-warning grace (the T0 contract of [tiered liquidation](../../concepts/tiered-liquidation.md)). `forced_close` fires when a liquidation executes against the account.

#### `action_dropped` {#notifications-action_dropped}

The commit loop dropped a committed action before it dispatched. The action consumed no nonce and changed no state. It produces no `order_updates` status, no fill and no `ledger_updates` record. This notice is the only push that carries it. `action_hash` is the value that [`/exchange`](../rest/exchange.md) returned, so a caller joins on that.

`code` has a closed set of values:

| `code` | Meaning |
|--------|---------|
| `DROPPED_EXPIRED` | The signed `expires_after` is past the block time, or the expiry feature is not armed. |
| `DROPPED_RETIRED` | The action id is retired. |
| `DROPPED_PAYLOAD_KEYS_INACTIVE` | A `core_evm_transfer` carries keys that the unified lane has not armed. |
| `DROPPED_NONCE_REPLAY` | The nonce is used, or below the per-sender replay window. |

A badly signed action produces no notice, by design. The node emits this record only when the signature verified, so it knows who signed. Every other drop carries a sender that the payload only claimed. These drops are an invalid signature, a malformed sender, an injected action from the wrong proposer and an action over 1 MiB (`DROPPED_ACTION_TOO_LARGE`). A push for them would let anyone post a failure into the feed of that account. So the absence of a notice does not prove that an action landed. A caller that must know holds the [`/exchange`](../rest/exchange.md) request open for the synchronous verdict, or reads the state of the account.

### Per-account money movement history {#ledger_updates}

This channel streams the money movement of one account, labeled with its cause. A record appears only when the action applied. The route of the action does not matter. A transfer, an asset send, a vault transfer and a bridge withdrawal all emit their record, whether they arrived as a signed action or as a contract call on MetaFluxEVM. Until this release, the EVM route emitted nothing. A balance that you rebuilt from this channel was short by any move made that way. The channel requires `user`. The on-subscribe snapshot is an array of the most recent ledger records of the account, newest first, limited to the last 100. It is `[]` when the account has no recent records. Each later push is an array that holds the new records of the block that just committed.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- The `kind` values are record names, not action names. `usd_send` and `spot_send` describe what a committed transfer did. Neither is an `/exchange` action, and sending one returns `unknown variant`. The actions are [`send_asset`](../rest/exchange/transfers.md#send_asset) and [`usd_class_transfer`](../rest/exchange/transfers.md#usd_class_transfer).
- `kind` is one of `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (with `token`), `asset_send` / `asset_receive` (with `asset`, `to_perp`), `withdraw` (`via`: `cctp` or `metabridge`), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer` and `vault_transfer`. A transfer emits one record for each party, sender and receiver. Two more kinds, `deposit` and `liquidation`, are in [Two more record sources](#ledger_updates-incoming).
- Every `amount` is a whole-token decimal string, `withdraw` included. No record has a raw base-unit field. `amount` is unsigned on every kind listed above. Read the direction from the `kind`. The incoming `liquidation` kind below is the one signed exception. The channel does not yet attribute inbound bridge credit amounts and delayed contract calls (which dispatch in a later block). The order of the records inside the array of one block is not part of the contract, and it changed in this release. Correlate on `time` and `kind`, never on position.

#### Two more record sources {#ledger_updates-incoming}

> The two records below are active. A client that rejects an unknown `kind` must
> accept them.

Both close a gap that the bullet above names. Neither renames or removes an existing
`kind`, and neither changes the shape of a record that you already receive.

| `kind` | Emitted for | Fields |
|--------|-------------|--------|
| `deposit` | A bridge inbound credit, at the block where the cosigner quorum credits it | `kind`, `coin`, `amount`, `chain`, `via`, `time` |
| `liquidation` | A liquidation settlement: the signed balance change that a forced close or a delist settlement leaves on the account. New `kind` | `kind`, `coin`, `amount`, `market`, `cause`, `time`, optional `mark_px` |

Field rules for the two new kinds:

- `deposit.amount` is a positive whole-token decimal string. It is the amount that the quorum credited. `chain` is `base` or `arbitrum` and names the source chain. `via` is always `"metabridge"`.
- `liquidation.amount` is signed, and negative on a loss. This is the one signed `amount` on the channel. Every existing kind stays unsigned, and you read the direction from `kind`.
- `liquidation.coin` is the settlement token (USDC). `market` names the perp on which the forced close ran.
- `liquidation.cause` is `forced_close_partial`, `forced_close_full`, `forced_close_isolated` or `forced_close_governance`. These are the same values that `user_fills` carries. It can also be `delist_settlement`.
- `delist_settlement` is a delist and not a liquidation. A delist closed the leg at the settlement price by ledger entry. It charges no fee and writes no fill, so `user_fills` never carries this value. `mark_px` is the settlement price. See [Delisting a perp market](../../products/perpetuals.md#delisting).
- `forced_close_governance` is a forced close that is not a liquidation. A `force_close_position` from the validator quorum settles against the book like the ladder does, and it writes the same record. It charges no liquidation fee and does not raise a liquidation counter. Read the `cause` before you add the record to a liquidation total.
- One vote closes both legs. This is active from node 0.9.7. One vote closes each leg that the account holds, and a hedge account gets two `liquidation` records for each vote, one for each leg. An older node closed only the long leg, so a hedge account kept its short. The `max_size` of the vote caps each leg on its own. The outcome summary of the action reads `forceClosePosition partial (quorum met): residual stays open` when any leg keeps size. It read `accepted` before. The vote payload does not change.
- `liquidation.mark_px` is the whole-USDC mark from which the slice was priced. The key is absent when the market had no usable mark at the slice.
- ADL and backstop takeovers settle outside the measured slice and emit no `liquidation` record. They are not silent, though. An ADL haircut writes its own `adl_haircut` ledger row, so read that value and do not conclude that the deleverage left no record. A Core credit that arrives from the EVM side writes `evm_to_core_credit` the same way. Both reach this channel.
- Treat an unknown `kind` as data, not as an error. Show the `amount` and the `time`, and label the cause from the `kind` string. This rule keeps a client working across every later addition.

### Trading context for one account and market {#active_asset_data}

This channel streams the trading context of one account on one market: leverage, margin mode and the current ceiling for the maximum trade size. It requires both `user` (0x) and `coin`. The initial snapshot is the current context, with default zeroed config when the account has no position. It is not an empty array. A push re-emits the context only when it changes.

The channel serves a registered perp market. A spot pair, an unknown coin or a coin that names no perp fails with `{"channel":"error","data":{"error":"market not found"}}`, and the node creates no subscription. The [REST read](../rest/info/perpetuals.md#active_asset_data) answers the same case with `404`. An unparseable `user` fails with ``invalid `user` address``. There is no zeroed fallback snapshot.

`coin` takes the market symbol here. The channel also accepts the numeric asset id, because it routes on the asset id. The REST read takes the symbol only. Either spelling must name a real perp.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "is_snapshot": true, "data": {
  "address": "0x<addr>", "coin": "BTC", "leverage": 50, "margin_mode": "cross",
  "mark_px": "61742.69625702", "max_trade_size": null, "max_trade_szs": ["0", "0"],
  "available_to_trade": ["0", "0"], "has_position": false } }
```

- The key is `coin` (symbol). `margin_mode` is one of `cross`, `isolated` and `strict_iso`. `max_trade_szs` and `available_to_trade` are `[buy, sell]` pairs. The fields are identical to the REST [`active_asset_data`](../rest/info/perpetuals.md#active_asset_data) read.
- `max_trade_size` is the remaining open-interest headroom of the whole market in size units. It is not the limit of the caller. It is `null` when the market has no cap. Size an order against `max_trade_szs`. See [`max_trade_size` is market-wide](../rest/info/perpetuals.md#max-trade-size).

### Per-account collateral and margin health {#account_state}

This channel streams the collateral and margin health of one account: the cross-account money figures and the four lane summaries. The node pushes a frame when they change. The channel requires `user` (the 0x address). It does not take a `coin`. `address` is not an alias here. A subscribe that carries `address` fails with ``{"channel":"error","data":{"error":"`account_state` requires `user`"}}``, the same answer as a subscribe with no key. The two surfaces differ: the WS subscription takes `user`, and the REST [`account_state`](../rest/info/account.md#account_state) read takes `address`. The body comes from the same builder as the REST [`account_state`](../rest/info/account.md#account_state) read, so a push never drifts from that read. The initial snapshot is the current state, zeroed for an account with no funds. It is not an empty array.

This four-lane frame is the current shape. The earlier flat body, with the position table and the balance array inside the frame, is gone from the wire. Parse the lanes. See [where every field went](../rest/info/account.md#account-state-lane-split).

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

- The position table and the option legs are not on this frame. They moved to [`clearinghouse_state`](#clearinghouse_state) and [`option_state`](#option_state), each its own channel. Subscribe to the lane that you render.
- The REST [field reference](../rest/info/account.md#account-state-fields) lists every field, its plane and its rule. The two are one body. In short: the money figures are whole-USDC decimal strings. `tier` is a string (`"Safe"`, `"T0"`, `"T1"`, `"T2"` or `"T3"`), never a number. `health` is a signed dollar figure and not a ratio. `height` and `time` are bare integers.
- The four lane keys are always present, and zeroed when the lane is empty. `spot.balances` always carries at least the USDC row. `option.next_expiry` is the one key that can be absent. The frame omits it when `option.legs` is `0`.
- The frame has no account-level `cross_maintenance_margin_used`. Poll [`account_state` with `detail: "margin"`](../rest/info/account.md#account-state-detail-margin) for it. Its scope is the cross bucket. An isolated leg is margined and liquidated on its own and adds nothing to it. That depth also names the held initial margin `total_margin_used`. This frame calls it `perp.init_margin`.
- `height` and `time` are the as-of stamp. `height` is the committed block height against which the node rendered the frame. `time` is the consensus block time in ms. Both are bare integers, not Decimal strings. They advance on every commit, even when nothing else in the record moved. The values are identical to the REST read. The change gate below excludes them. The advance of the stamp never triggers a push by itself. A client can use them to tell a quiet account from a stalled feed.

:::warning
A zero stamp means "no view yet". It does not mean "an account worth nothing". If the serving layer has no body for your account when you subscribe, the first frame is a placeholder. Every figure is zero, `spot.balances` is empty, and `height` and `time` are both `0`. A real account never reads that way, because the USDC row is unconditional and the stamp is a current block height. Test `height != 0` before you render or store the first frame, and wait for the next push. The same rule holds on [`clearinghouse_state`](#clearinghouse_state) and [`option_state`](#option_state).
:::

Frequency: the channel sends a frame when the state of the account changes since the last commit. It also sends a liveness heartbeat. The current full snapshot (unchanged body, only a fresh `height` and `time` stamp) is re-sent every 4 committed blocks, even when nothing changed. The interval counts commits and does not use a wall clock. The block cadence is a governed target for each deployment, so 4 commits cover a different real-time span on different deployments. Read the advance rate of the `height` field if you need a wall-clock estimate. The heartbeat lets a client confirm that the feed is running and tell a quiet account from a stalled connection.

:::warning
`account_state` is per-account data, but it has no authentication today. Any connection can subscribe to any address. Do not treat it as private until the authentication gate at subscribe time lands. The same holds for [`clearinghouse_state`](#clearinghouse_state) and [`option_state`](#option_state).
:::

### Per-account perp positions {#clearinghouse_state}

This channel streams the perp position detail of one account: the position table, keyed by dex, that left the `account_state` body. It requires `user`. A subscribe without one fails with ``{"channel":"error","data":{"error":"`clearinghouse_state` requires `user`"}}``. It uses the same builder as the REST [`clearinghouse_state`](../rest/info/account.md#clearinghouse_state) read, so the push and the read never drift.

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

- `clearinghouse_state` uses the dex name as key. `""` is the core dex and is always present. Any other key is the name of one deployed dex. Every market on dex `NAME` has the symbol `NAME:SUFFIX`, so the key and the `coin` prefix of the row are the same string. See [the dex key](../rest/info/account.md#dex-key). The REST [row table](../rest/info/account.md#clearinghouse_state) lists every row field. `liq` is nullable. `null` means that no non-negative price liquidates the leg, and the node never renders it as `"0"`. See [reading `liq`](../rest/info/account.md#reading-liq).
- `side` is present only in hedge mode. It is absent, not `null`, in one-way mode. Read `position_mode` on [`account_state`](#account_state) to know which shape to expect. The reason is what each mode can hold. Hedge mode can hold a long leg and a short leg on one coin, so every row carries its own `side` (`"long"` or `"short"`) and the pair is unambiguous. One-way mode collapses the coin to a single net position. There is no leg to label, so the node omits the key. Do not infer the mode from the sign of `size`. A one-way net position is also negative when it is short.
- This frame never carries `adl_lamps`. `detail` is a REST parameter only, so the push always renders the default shape. The lamp ranks your seat against other accounts. An always-on lamp would re-emit your frame whenever the PnL of a stranger crossed a quartile edge. Poll [`clearinghouse_state` with `detail: "adl"`](../rest/info/account.md#account_state-adl) for it.
- The frame carries no account figures. It has no `account_value`, `withdrawable`, `health` or `balances`. Read those from [`account_state`](#account_state).

:::danger
Do not join this frame with an `account_state` frame to compute one number. The node publishes the two channels from the same commit, and they carry the same `height` and `time` stamp. They arrive as separate messages, though, and your client can hold two different vintages. Compare `height` before you combine them. Take any single consistent number set from `account_state` alone.
:::

Frequency: the channel sends a frame on change, plus the same 4-commit liveness heartbeat as `account_state`, from the same commit. A summary and its detail are rendered against one block even though they arrive as two frames.

### Per-account option legs {#option_state}

This channel streams the option leg detail of one account, one row for each series to which the account is party. It requires `user`. A subscribe without one fails with ``{"channel":"error","data":{"error":"`option_state` requires `user`"}}``. It uses the same builder as the REST [`option_state`](../rest/info/options.md#option_state) read.

:::warning Renamed
The channel was going to be called `option_positions`. That name is not an alias and the node does not accept it. It answers `{"channel":"error","data":{"error":"unknown channel: option_positions"}}`. Subscribe to `option_state`.
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

- `positions` is `[]` for an account that is party to nothing. That is the snapshot and not an error. The REST [`option_state`](../rest/info/options.md#option_state) table lists every row field. The node serves `signing_id` whole. Never compute it.
- `escrow` is in the `settle_asset` of its row. It is USDC on a put and the underlying COIN on a call, because a [call escrows one coin](../../products/options.md#why-a-call-escrows-one-coin) for each unit. Read `settle_asset` before you render or add an `escrow`.
- For the account totals (escrow, leg count, nearest expiry), read the `option` lane of [`account_state`](#account_state). The `escrow` of that summary counts put legs only, because you cannot add coins to dollars. So this channel is the only place where the escrow of a call leg carries a currency.

Frequency: the channel sends a frame on change, plus the same 4-commit liveness heartbeat as `account_state`, from the same commit.

### Per-account spot-margin positions {#spot_margin_state}

This channel streams the spot-margin positions of one account: its leveraged spot-margin book (see [spot margin](../../products/spot-margin.md)). The node pushes a frame when the book changes. The channel requires `user`. The initial snapshot is the current position set, `[]` for an account with no spot-margin positions. This is not a feed of plain spot token balances. Plain spot balances for each token ride the [`account_state`](#account_state) channel, in its `spot.balances` array.

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

- `height` and `time` are the as-of stamp, always present, as on [`account_state`](#account_state). `height` is the committed block height against which the node rendered the frame. `time` is the consensus block time in ms. Both are bare integers. They advance on every commit, so they tell a quiet account from a stalled feed.
- `accounts[]` holds one entry for each open spot-margin position, in pair-id order. It is the same body that the REST [`spot_margin_state`](../rest/info/spot.md#spot_margin_state) read renders, from a single source. `pair` is the symbol of the pair (for example `"MTF/USDC"`), not a numeric id. `collateral` reads `"0"`, because spot margin is cross-collateralized against the unified USDC account. The field stays only for wire-shape compatibility. `current_debt` is `borrowed` accrued to now against the current borrow index of the pool. `params` is `null` when margin is not enabled or calibrated for the pair.

Frequency: the channel sends a frame on change, plus a liveness heartbeat, because `current_debt` accrues on every commit even with no trading activity. A frame arrives when the position set changes since the last commit. The current full snapshot (unchanged body) is also re-sent every 4 committed blocks, even when nothing changed. The interval counts commits and does not use a wall clock. The block cadence is a governed target for each deployment, so 4 commits cover a different real-time span on different deployments. Measure the commit rate of your own deployment if you need a wall-clock estimate. The heartbeat lets a client confirm that the feed is running.

### Per-account realized funding payments {#user_fundings}

This channel streams the realized funding payments of one account, one record each time funding settles against the account on a market. It requires `user` (the 0x address; `address` is also accepted). It does not take a `coin`. The `data` of each frame is an array of funding records from the settlement that just committed. The initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_fundings", "user": "0x<address>" } }
```

```json
{ "channel": "user_fundings", "data": [
  { "coin": "BTC", "payment": "-0.42", "szi": "600", "fundingRate": "0.0001", "time": 1735689600123 }
] }
```

- `coin` is the market symbol on which the payment settled.
- `payment` is the funding amount applied, a whole-USDC decimal string with a sign. Negative means that the account paid. Positive means that the account received.
- `szi` is the signed position size against which the node computed the payment (base units).
- `fundingRate` is the rate for the asset that applied at this settlement (decimal string).
- `time` is the settlement timestamp (consensus ms).

### Per-account TWAP slice fills {#user_twap_slice_fills}

This channel streams the TWAP slice fills of one account, one record each time the slice of a running `twap_order` crosses the book. It requires `user` (the 0x address; `address` is also accepted). It does not take a `coin`. The `data` of each frame is an array of slice-fill records from the block that just committed. The initial snapshot is `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_twap_slice_fills", "user": "0x<address>" } }
```

```json
{ "channel": "user_twap_slice_fills", "data": [
  { "fill": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "1000000", "time": 1735689600123, "oid": "42", "cloid": null, "tid": "1234567890", "fee_token": "USDC", "crossed": true }, "twapId": 17 }
] }
```

- `fill` has the same taker-leg record shape as [`fills`](#fills).
- `twapId` is the id of the parent TWAP. [`twap_cancel`](../rest/exchange/orders.md#twap_cancel) takes the same value.

### Per-account TWAP lifecycle {#user_twap_history}

This channel streams the lifecycle of the parent TWAP orders of one account, one record on each state transition (`activated`, `finished` or `terminated`). It requires `user`. The `data` of each frame is an array of transition records. The initial snapshot is `[]`.

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

- `state.twapId` is the parent id to pass to [`twap_cancel`](../rest/exchange/orders.md#twap_cancel). The id appears nowhere else before the first fill.
- `state.sz` and `state.executedSz` are the total and executed size, as size-plane decimal strings.
- `status.status` is one of `activated`, `finished` and `terminated`.

---

## `post` for requests over WS {#post--requestresponse-over-ws}

`post` is not a subscription channel. It lets you make one-shot reads and signed writes on the same socket. The `request` uses the same `{type, payload}` envelope as the REST routes. The same handlers process it (`POST /info`, `POST /exchange`). See [`post` in the WS overview](./index.md#post-requestresponse-over-ws) for the request and response shapes and the signing rules.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

`post` is available on the public endpoint. One socket carries both subscriptions and request and response calls. You need no second connection, and you do not need to fall back to REST for a read. The request goes to the same `/info` and `/exchange` handlers, so a malformed request returns the field-validation error of that handler, not a transport error. See the [WS overview](./index.md#post-requestresponse-over-ws) for the response envelope and the signing rules.

---

## Roadmap, not yet available {#roadmap--not-yet-available}

Earlier drafts listed the channels below. The node WS surface does not implement them. They are not recognized channel names, and a subscribe returns an `unknown channel` error. They are listed here so that older SDK stubs do not mislead integrators.

- Public market data: `meta` (universe metadata), `mark` (mark and oracle price) and `fundingTicks` (funding-rate updates).
- Per-user channels that would require authentication: `vaultEvents` and `rfqEvents`.

Also not implemented today:

- Diff-based `l2_book` (partial `updates` frames). The current `l2_book` always sends full top-20 bodies. The frame carries an `is_snapshot` flag (`true` on the initial snapshot, `false` on pushes that follow a change), but every body is a full snapshot. There are no partial-diff `updates` frames.
- `seq`, `resume` and resume tokens. Every subscribe starts from a fresh snapshot.
- An authentication envelope at subscribe time for private channels. Use `post` with a signed action for authenticated operations.

---

## Ordering and delivery {#ordering--delivery}

- Within one subscription, frames arrive in commit order. The channel emits a frame only on the commits where the state of the watched channel changed. There is no `seq`. The order is implicit in the arrival order on the single socket.
- Across subscriptions, there is no ordering guarantee, and the interleave is arbitrary. Demultiplex on `channel` and the `coin` inside `data`.
- Delivery is at-most-once for each change and is not buffered for resume. A subscription that lags more than 256 frames behind is dropped with a `lagged` error frame (see [Backpressure and lag](./index.md#backpressure--lag)). Subscribe again to recover. You get a fresh snapshot.

## See also {#see-also}

- [WS overview](./index.md): the connection lifecycle, frames, coin parameter, `post` and backpressure.
- [`POST /info`](../rest/info.md): the REST equivalents for one-shot reads. `post` also reaches them.
- [`POST /exchange`](../rest/exchange.md): the signed-action envelope that the `post` action path shares.
