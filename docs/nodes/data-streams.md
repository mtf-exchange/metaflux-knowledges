---
description: The per-block NDJSON streams a MetaFlux node writes to disk — enable flags, on-disk layout, per-record schemas, and the number plane every field uses.
---

# Node data streams

:::info
**Status.** **stable** shapes. Every stream is **off by default** and is enabled
one flag at a time. A node in the validator set **refuses** to record unless you
set an explicit override. Run the streams on a **non-validating node**.
:::

## TL;DR {#tldr}

A MetaFlux node can write its committed blocks to disk as newline-delimited JSON
(NDJSON). One line is one **envelope**. One envelope holds one committed block.
Each envelope holds zero or more **records**.

The node does not serve these files. It only writes them. You read them with your
own indexer, archiver, or analytics job.

Ten streams exist. Six carry block events. Two sample on a timer. Two carry order-book state.

| Stream | On-disk root | Content |
|--------|--------------|---------|
| [`node_fills`](#node_fills) | `<data_dir>/node_fills/` | One record per filled party (taker and maker) |
| [`node_trades`](#node_trades) | `<data_dir>/node_trades/` | One record per print, no counterparty |
| [`node_order_statuses`](#node_order_statuses) | `<data_dir>/node_order_statuses/` | Order lifecycle transitions |
| [`node_funding`](#node_funding) | `<data_dir>/node_funding/` | Realized funding payments |
| [`node_ledger`](#node_ledger) | `<data_dir>/node_ledger/` | Signed non-funding balance deltas |
| [`node_equity_snapshots`](#node_equity_snapshots) | `<data_dir>/node_equity_snapshots/` | Hourly account-value samples |
| [`node_asset_ctxs`](#node_asset_ctxs) | `<data_dir>/node_asset_ctxs/` | Per-market mark and oracle price samples, every 5 s |
| [`replica_cmds`](#replica_cmds) | `<data_dir>/replica_cmds/` | One block envelope per block, header plus events |
| [`l4_book_diffs`](#l4_book_diffs) | `<data_dir>/l4_book_diffs.jsonl` | Per-order book diffs, with owner |
| [`l2_book_diffs`](#l2_book_diffs) | `<data_dir>/l2_book_diffs.jsonl` | Per-price-level book diffs, anonymous |

:::warning
**Read [Number planes](#number-planes) before you read any number.** The
`node_*` streams write prices and sizes as **raw integer strings**.
`replica_cmds` writes the same quantities as **whole-unit decimal strings**. The
two look alike and are off by a large power of ten.
:::

## Operations {#operations}

### Enable a stream {#enable-a-stream}

Each stream has its own flag in the `[persistence]` table of the node config.
Every flag defaults to `false`.

| Stream | Flag | Default |
|--------|------|:-------:|
| `node_fills` | `write_fills` | `false` |
| `node_trades` | `write_trades` | `false` |
| `node_order_statuses` | `write_order_statuses` | `false` |
| `node_funding` | `write_funding` | `false` |
| `node_ledger` | `write_ledger` | `false` |
| `node_equity_snapshots` | `write_equity_snapshots` | `false` |
| `replica_cmds` | `write_replica_cmds` | `false` |
| `l4_book_diffs` | `record_l4` | `false` |
| `l2_book_diffs` | `record_l2` | `false` |

```toml
[node]
data_dir = "/var/lib/mtf-node"

[persistence]
write_fills = true
write_trades = true
write_order_statuses = true
```

A disabled stream creates no directory and no file.

### Recording is refused on a validator {#validator-refusal}

These streams de-anonymize order flow and account value. A node in the validator
set therefore refuses to record.

- The seven `write_*` streams are refused **as a group**. If any one of them is
  set on a validator, the node records **none** of them and logs a warning. Set
  `persistence.allow_stream_on_validator = true` to record anyway. Use that
  override only when the order flow is your own.
- `record_l4` and `record_l2` are refused on a validator with **no override**.
  They also walk the whole book once per block, which is work a validator must
  not do on the commit path.

The intended place to run any of these streams is a **non-validating node** that
follows the chain and serves nobody. Point your indexer at that node.

### Snapshot-style streams sample a window {#sampling-windows}

Most streams are event tapes. They record what a block did. Two streams are
sample tapes. They record state at a point in time, so they sample instead of
writing every block.

| Stream | Window | Sampled block |
|--------|--------|---------------|
| `node_equity_snapshots` | One UTC hour of consensus block time (3,600,000 ms) | The first committed block of each window |
| `l4_book_diffs` / `l2_book_diffs` | `persistence.snapshot_interval` blocks (default `1024`) | The block that closes the interval, plus one bootstrap snapshot on the first non-empty book |

`node_equity_snapshots` writes exactly one sample per hourly file. It does not
sample during start-up replay, because a replayed block would stamp current state
onto an old block time.

The book-diff streams write a diff line on every block whose book changed, and a
full snapshot line on the interval.

## On-disk layout {#on-disk-layout}

### Hourly files {#hourly-files}

Six streams rotate hourly:

```
<data_dir>/node_fills/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_trades/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_order_statuses/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_funding/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_ledger/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_equity_snapshots/hourly/{YYYYMMDD}/{HH}
```

`replica_cmds` rotates hourly too, but **without** the `hourly/` segment:

```
<data_dir>/replica_cmds/{YYYYMMDD}/{HH}
```

`{YYYYMMDD}` is the UTC date. `{HH}` is the UTC hour, `00` to `23`, zero-padded.
Both come from the **consensus block time**, never from the recording node's
clock. The file a record lands in is therefore a function of the block alone. Two
nodes that record the same blocks produce the same file names and the same bytes.

Files have no extension. They are append-only NDJSON. Within one file, envelopes
are in ascending block order. Across files, lexical order of `{YYYYMMDD}/{HH}` is
chronological order.

The two book-diff streams do **not** rotate. Each is a single append-only file:

```
<data_dir>/l4_book_diffs.jsonl
<data_dir>/l2_book_diffs.jsonl
```

### Empty blocks and archive holes {#gaps}

A block with no events for a stream writes **no line**. Absence of a line means
"that block was empty for this stream".

An archive **hole** is different. A hole is a block range the node did not
record, because the recorder was down and the range could not be replayed. The
node marks a hole with one line:

```json
{"gap":{"from":941006632,"to":941006699}}
```

`from` and `to` are inclusive block numbers. Every hourly stream and
`replica_cmds` can carry gap lines. The book-diff streams cannot.

A consumer must detect a gap line before it parses an envelope, must skip it, and
should record the hole so archive completeness stays auditable. A gap line always
starts with `{"gap"`. An envelope never does.

`replica_cmds` writes one envelope for **every** committed block, including an
empty one, so its heights form a contiguous sequence between gaps.

### Control files {#control-files}

Each stream root holds small node-internal files beside its date directories:

| File | Content |
|------|---------|
| `<stream root>/cursor` | Last recorded block number, as decimal text |
| `<data_dir>/node_equity_snapshots/snapshot_bucket` | Last sampled window index |

These are not archive data. Do not parse them as envelopes. A walker that
enumerates only directories under the stream root never sees them.

### Torn lines {#torn-lines}

A node that stops uncleanly can leave a partial last line. The node truncates
that line when it next opens the file, so a stored archive never wedges a reader.

A consumer that **tails a live file** must still handle the writer mid-write:
accept only newline-terminated lines, never advance its read offset past a
fragment, and retry that fragment on the next pass.

## Number planes {#number-planes}

MetaFlux carries prices and sizes on two integer planes, plus one decimal plane
for money. Mixing them is the classic integration bug. See
[two price planes](../concepts/mark-prices.md#two-price-planes-read-this-before-reading-any-number)
for the same split on the API surface.

| Plane | On the wire | Convert to human units |
|-------|-------------|------------------------|
| **Raw price** (1e8 fixed-point) | Integer string, e.g. `"6250000000000"` | Divide by `100000000` → `62500.00` USDC |
| **Raw size** (lots) | Integer string, e.g. `"50000"` | Divide by `10^sz_decimals` of that market → `0.5` whole units |
| **Whole units** | Decimal string, e.g. `"-25.5"` | Already human. Parse as an arbitrary-precision decimal, never as a float |

`sz_decimals` is the market's size precision. Read it from the `/info` `markets`
read. It is at most `6`. See
[contract specifications](../concepts/contract-specifications.md).

Which plane a stream uses:

| Stream | Prices | Sizes | Money |
|--------|--------|-------|-------|
| `node_fills` | Raw price | Raw size | Whole USDC |
| `node_trades` | Raw price | Raw size | — |
| `node_order_statuses` | Raw price | Raw size | — |
| `node_funding` | — | Whole units (`szi`) | Whole USDC |
| `node_ledger` | — | — | Whole tokens |
| `node_equity_snapshots` | — | — | Whole USDC |
| `replica_cmds` | Whole USDC | **Mixed** — see [`replica_cmds`](#replica_cmds) | Whole USDC |
| `l4_book_diffs` / `l2_book_diffs` | Raw price | Raw size | — |

Every price, size, and money value is a JSON **string**. Block numbers,
timestamps, order ids, trade ids, and enum codes are bare JSON numbers.

## `node_fills` {#node_fills}

One record per **filled party**. A single match produces two records: the taker
leg first, then the maker leg. Both legs of one match share the same `tid`.

Envelope:

```json
{
  "block_number": 941006631,
  "block_time": 1735689599852,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", { /* taker leg, shape below */ }],
    ["0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567", { /* maker leg, shape below */ }]
  ]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `block_number` | uint64 | Committed block height |
| `block_time` | uint64 | Consensus block timestamp, ms |
| `events` | array | `[address, fill]` pairs. `address` is `0x`-hex, lowercase, 20 bytes |

One fill record, taker leg:

```json
{
  "market": 0,
  "px": "6250000000000",
  "sz": "50000",
  "side": "B",
  "oid": 366158135200,
  "cloid": "0x00000000000000000000000000001234",
  "tid": 1086003134703173,
  "crossed": true,
  "ts": 1735689599852,
  "hash": "9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11",
  "fee": "0.0251",
  "feeToken": "USDC",
  "closedPnl": "0.3135",
  "startPosition": "-8025000",
  "dir": "Close Short",
  "builderFee": "0",
  "liquidation": false,
  "feeTrialEscrow": "0",
  "builder": null,
  "twapId": null,
  "deployerFee": "0",
  "liquidatedUser": null,
  "markPx": "0"
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market` | uint32 | id | Canonical asset id of the market. The same numeric key the API accepts as `coin` |
| `px` | u128 string | raw price | Execution price |
| `sz` | u128 string | raw size | Executed size, always positive |
| `side` | string | — | Side of **this** party: `"B"` buy, `"A"` sell |
| `oid` | uint64 | id | This party's order id |
| `cloid` | string \| absent | — | Client order id, `0x` plus 32 hex digits. Present on the taker leg only, and only when the order carried one |
| `tid` | uint64 | id | Print id. Identical on both legs of one match |
| `crossed` | bool | — | `true` on the taker leg, `false` on the maker leg |
| `ts` | uint64 | ms | Fill timestamp. Equals `block_time` |
| `hash` | string | — | Trace hash of the originating taker action: lowercase hex, **no** `0x`. Empty string on the maker leg, and empty for system-injected actions |
| `fee` | decimal string \| absent | whole USDC | Fee this party paid. Negative means a rebate |
| `feeToken` | string \| absent | — | Fee asset. `"USDC"` today |
| `closedPnl` | decimal string \| absent | whole USDC | Realized PnL on the closed part. `"0"` on a pure open |
| `startPosition` | i128 string \| absent | **raw size** | Signed leg size **before** this fill |
| `dir` | string \| absent | — | One of `"Open Long"`, `"Close Long"`, `"Open Short"`, `"Close Short"`, `"Long > Short"`, `"Short > Long"` |
| `builderFee` | decimal string | — | Reserved. Always `"0"` |
| `liquidation` | bool | — | Reserved. Always `false` |
| `feeTrialEscrow` | decimal string | — | Reserved. Always `"0"` |
| `builder` | null | — | Reserved. Always `null` |
| `twapId` | null | — | Reserved. Always `null` |
| `deployerFee` | decimal string | — | Reserved. Always `"0"` |
| `liquidatedUser` | null | — | Reserved. Always `null` |
| `markPx` | decimal string | — | Reserved. Always `"0"` |

:::warning
**Three traps on one record.**

1. `fee` and `closedPnl` are **whole USDC**. `startPosition` on the same record is
   **raw size**. Divide `startPosition` by `10^sz_decimals`; do not divide `fee`.
2. The six settlement fields (`fee`, `feeToken`, `closedPnl`, `startPosition`,
   `dir`) are **absent** on a fill with no perp settlement leg, such as a spot
   fill. Treat absent as "no settlement data", not as zero.
3. The eight reserved fields carry constants today. Do not read them as data.
:::

## `node_trades` {#node_trades}

The public trade tape. One record per match, not per party. This stream carries
**no** counterparty address by design.

```json
{
  "block_number": 941006631,
  "block_time": 1735689599852,
  "trades": [
    {
      "market": 0,
      "px": "6250000000000",
      "sz": "50000",
      "side": "B",
      "tid": 1086003134703173,
      "taker_oid": 366158135200,
      "maker_oid": 366158130011,
      "ts": 1735689599852,
      "hash": "9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11"
    }
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market` | uint32 | id | Canonical asset id |
| `px` | u128 string | raw price | Print price |
| `sz` | u128 string | raw size | Print size |
| `side` | string | — | **Aggressor** side: `"B"` the taker bought, `"A"` the taker sold |
| `tid` | uint64 | id | Print id. Matches the `tid` on both `node_fills` records of this print |
| `taker_oid` | uint64 | id | Aggressing order id |
| `maker_oid` | uint64 | id | Resting order id |
| `ts` | uint64 | ms | Print timestamp. Equals `block_time` |
| `hash` | string | — | Trace hash of the taker action: lowercase hex, no `0x`. Empty for a system-injected action |

Join `node_trades` to `node_fills` on `tid` when you need the parties.

## `node_order_statuses` {#node_order_statuses}

One record per order-status transition, keyed by the order owner.

```json
{
  "block_number": 941006640,
  "block_time": 1735689600102,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", {
      "market": 0,
      "oid": 366158135210,
      "cloid": "0x00000000000000000000000000001234",
      "status": "filled",
      "side": "B",
      "limit_px": "6250000000000",
      "sz": "40000",
      "orig_sz": "60000",
      "tif": "Gtc",
      "reduce_only": false,
      "avg_px": "6249800000000",
      "total_sz": "40000",
      "ts": 1735689600102
    }]
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market` | uint32 | id | Canonical asset id |
| `oid` | uint64 | id | Order id. **`0` on an `error` record** — the order never got an id |
| `cloid` | string \| absent | — | Client order id, `0x` plus 32 hex digits |
| `status` | string | — | Exactly one of `"resting"`, `"filled"`, `"error"` |
| `side` | string | — | `"B"` buy, `"A"` sell |
| `limit_px` | i128 string | raw price | Limit price of the order. Always present |
| `sz` | u128 string | raw size | On `filled`, the **filled** size. On `resting` and `error`, the request size |
| `orig_sz` | u128 string | raw size | Request size at placement. Always the original |
| `tif` | string | — | Time in force: `"Gtc"`, `"Ioc"`, `"Alo"` |
| `reduce_only` | bool | — | Reduce-only flag of the order |
| `avg_px` | i128 string \| absent | raw price | Average fill price. Present on `filled` only |
| `total_sz` | u128 string \| absent | raw size | Total filled size. Present on `filled` only |
| `error` | string \| absent | — | Rejection reason. Present on `error` only |
| `ts` | uint64 | ms | Transition timestamp. Equals `block_time` |

:::warning
**`sz` changes meaning with `status`.** On a partially filled order, `sz` is the
filled part and `orig_sz` is the request. Use `orig_sz` when you want the size
the trader asked for.
:::

## `node_funding` {#node_funding}

One record per realized funding payment, per account, per market.

```json
{
  "block_number": 941006650,
  "block_time": 1735689601000,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", {
      "coin": 0,
      "usdc": "-1.5",
      "time": 1735689601000,
      "szi": "-12.5",
      "fundingRate": "0.0000125"
    }]
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `coin` | uint32 | id | **Market asset id** the funding settled on |
| `usdc` | decimal string | whole USDC | Signed payment. `+` received, `−` paid |
| `time` | uint64 | ms | Settlement timestamp. Equals `block_time` |
| `szi` | decimal string | whole units | Signed position size at settlement. Already human, do **not** divide |
| `fundingRate` | decimal string | fraction per hour | The rate applied at **this** settlement. `"0.0000125"` is 0.00125 % per hour |

`szi` and `fundingRate` are the values stamped at the settlement site. Do not
re-derive them from later state.

## `node_ledger` {#node_ledger}

One record per account whose balance a committed action moved, excluding funding.
A peer transfer emits two records. Their `delta` values net to zero.

```json
{
  "block_number": 941006660,
  "block_time": 1735689602000,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", {
      "kind": "transfer",
      "delta": "-25.5",
      "coin": 0,
      "time": 1735689602000,
      "counterparty": "0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567"
    }],
    ["0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567", {
      "kind": "transfer",
      "delta": "25.5",
      "coin": 0,
      "time": 1735689602000,
      "counterparty": "0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345"
    }]
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `kind` | string | — | Coarse class: `"transfer"`, `"withdraw"`, `"deposit"` |
| `delta` | decimal string | whole tokens | Signed balance change. `−` outflow, `+` inflow. At most 8 decimal places |
| `coin` | uint32 | id | **Token asset id.** `0` is USDC |
| `time` | uint64 | ms | Timestamp. Equals `block_time` |
| `counterparty` | string \| absent | — | The other party's `0x` address on a peer transfer. Absent on a single-sided move |

The event order inside `events` is deterministic on replay, so the index of an
event within its block is a stable per-block discriminator.

:::warning
**`coin` is a token id here, not a market id.** `node_funding` also has a field
named `coin`, and there it is a **market** asset id. The two id spaces are
different. Resolve `node_ledger.coin` against the token registry and
`node_funding.coin` against the market universe.
:::

:::warning
**This stream is not a complete balance history.** Two money movements have no
owning action and are therefore not recorded here: inbound bridge deposits
credited by validator quorum, and liquidation settlements. Do not reconstruct an
account balance from `node_ledger` alone.
:::

## `node_equity_snapshots` {#node_equity_snapshots}

A sample tape, not an event tape. One line per sample. One sample per UTC hour of
consensus block time, taken on the first committed block of that hour. Each
hourly file therefore holds exactly one line.

One line carries **every** account that has committed state, in ascending
account-address order.

```json
{
  "block_number": 941006700,
  "block_time": 1735689600000,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", { "equity": "300", "ts": 1735689600000 }],
    ["0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567", { "equity": "50.5", "ts": 1735689600000 }]
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `equity` | decimal string | whole USDC | Mark-aware account value: collateral plus unrealized PnL. The same number the `/info` account read serves |
| `ts` | uint64 | ms | Sample timestamp. Equals `block_time` |

Use this stream to draw a portfolio-value curve. A curve rebuilt from flows alone
misses bridge credits and can go negative.

The sample costs one walk over every account and every market, so it stays off
the validator path. The node does not sample during start-up replay.

## `node_asset_ctxs` {#node_asset_ctxs}

A sample tape, not an event tape. One line per sample, one sample every **5
seconds** of consensus block time. Each line carries **every** market in the
committed universe — perps first, then tradable spot pairs, each group in
ascending market id.

```json
{
  "block_number": 941006700,
  "block_time": 1735689600000,
  "ctxs": [
    { "market": 0, "mark_px": "5000000000000", "oracle_px": "4999500000000" },
    { "market": 3, "mark_px": "125000000", "oracle_px": "0" }
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market` | uint32 | — | Market id. Perps come first, then spot pairs |
| `mark_px` | decimal string | **raw 1e8** | The market's committed mark price |
| `oracle_px` | decimal string | **raw 1e8** | The committed oracle price |

:::warning
**`"0"` means NO COMMITTED PRICE, not a price of zero.** Every spot pair reads
`"0"` for `oracle_px`, because a spot pair has no oracle. A perp also reads `"0"`
before its first oracle push. Treat `"0"` as absent — a consumer that averages it
in will drag every derived number toward zero.
:::

Both prices are on the **raw 1e8** plane, like the rest of the `node_*` family.
Divide by `100000000` before you display them.

Use this stream to build mark and oracle candles. The 5-second cadence gives the
smallest (1-minute) candle twelve samples. It is a price series, not a trade
series: a bar exists in every window the samples cover, whether or not anything
traded.

## `replica_cmds` {#replica_cmds}

A single envelope per committed block, carrying the block header plus that
block's fills, order events, position read-throughs, and funding rates. It is the
densest stream and the one to use when you want one file to drive a full indexer.

Two things make it different from every `node_*` stream:

- **Addresses and hashes are arrays of byte numbers, not hex strings.**
- **Prices and money are whole units, not the raw planes.** Sizes are mixed. See
  the warning below.

The JSON key order is fixed, and the path has no `hourly/` segment.

```json
{
  "height": 1234567,
  "ts_ms": 1735689599852,
  "action_count": 3,
  "block_hash": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
  "app_hash": [160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191],
  "fills": [
    {
      "fill_seq": 0,
      "market_id": 5,
      "taker_addr": [17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17],
      "maker_addr": [34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34],
      "side": 0,
      "size": "0.5",
      "price": "100.55",
      "fee_bps": 2
    }
  ],
  "order_events": [
    {
      "oid": 366158135200,
      "owner": [17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17],
      "market_id": 5,
      "side": 0,
      "kind": 0,
      "original_size": "100000",
      "remaining_size": "50000",
      "limit_px": "100.50",
      "status": 1,
      "created_ts_ms": 1735689599852,
      "updated_ts_ms": 1735689599852
    }
  ],
  "position_deltas": [
    {
      "owner": [17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17],
      "market_id": 5,
      "size": "0.5",
      "entry_px": "100.55",
      "unrealized_pnl": "0",
      "updated_block_height": 1234567
    }
  ],
  "funding_events": [
    { "market_id": 5, "rate_num": 20, "rate_denom": "10000" }
  ]
}
```

### Header {#replica_cmds-header}

| Field | Type | Meaning |
|-------|------|---------|
| `height` | uint64 | Committed block height |
| `ts_ms` | uint64 | Consensus block timestamp, ms |
| `action_count` | uint32 | Number of actions in the block payload |
| `block_hash` | array of 32 uint8 | Block hash, byte array. **Not** hex |
| `app_hash` | array of 32 uint8 | Application state hash, byte array. **Not** hex |

### `fills[]` {#replica_cmds-fills}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `fill_seq` | uint64 | index | Position within **this block**, from `0`. Not a global sequence |
| `market_id` | uint32 | id | Canonical asset id |
| `taker_addr` | array of 20 uint8 | — | Aggressor address |
| `maker_addr` | array of 20 uint8 | — | Resting counterparty address |
| `side` | uint8 | code | Taker side: `0` bid, `1` ask |
| `size` | decimal string | **whole units** | Executed size |
| `price` | decimal string | **whole USDC** | Execution price |
| `fee_bps` | uint32 | bps | Taker fee in whole basis points, truncated. Falls back to the market's configured taker rate when the fill has no perp settlement leg |

### `order_events[]` {#replica_cmds-order-events}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `oid` | uint64 | id | Order id. `0` when `status` is `2` |
| `owner` | array of 20 uint8 | — | Order owner |
| `market_id` | uint32 | id | Canonical asset id |
| `side` | uint8 | code | `0` bid, `1` ask |
| `kind` | uint8 | code | Order kind. Always `0` (limit) today |
| `original_size` | decimal string | **raw size** | Request size in lots |
| `remaining_size` | decimal string | **raw size** | Unfilled size in lots |
| `limit_px` | decimal string \| null | **whole USDC** | Limit price |
| `status` | uint8 | code | `0` resting, `1` filled, `2` error |
| `created_ts_ms` | uint64 | ms | Equals the block timestamp |
| `updated_ts_ms` | uint64 | ms | Equals the block timestamp |

`created_ts_ms` and `updated_ts_ms` are always equal. The node records one
transition per block and carries no separate placement time.

### `position_deltas[]` {#replica_cmds-position-deltas}

One entry per distinct `(market, owner)` that filled in this block, read from
post-fill state.

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `owner` | array of 20 uint8 | — | Position owner |
| `market_id` | uint32 | id | Canonical asset id |
| `size` | decimal string | **whole units** | Signed size, **netted** across the long and short legs |
| `entry_px` | decimal string | **whole USDC** | Absolute entry notional divided by absolute size. `"0"` when flat |
| `unrealized_pnl` | decimal string | — | Reserved. Always `"0"` |
| `updated_block_height` | uint64 | — | The height of this envelope |

Under hedge mode an account can hold a long leg and a short leg on one market.
`size` is the net of the two, not a per-leg figure.

### `funding_events[]` {#replica_cmds-funding-events}

One entry per **market** per block, not one per payment. The per-user payments
live in [`node_funding`](#node_funding).

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market_id` | uint32 | id | Canonical asset id |
| `rate_num` | int64 | — | Rate numerator |
| `rate_denom` | string | — | Rate denominator, a power of ten as a decimal string |

The funding rate is `rate_num / rate_denom` per hour. The example above is
`20 / 10000` = `0.002`. The pair is exact, so compute it as a rational; do not
convert through a float.

:::warning
**Sizes are mixed inside one envelope.** `fills[].size` and
`position_deltas[].size` are **whole units**. `order_events[].original_size` and
`order_events[].remaining_size` are **raw lots**. Divide the order-event sizes by
`10^sz_decimals`; do not divide the fill and position sizes.
:::

## `l4_book_diffs` {#l4_book_diffs}

Per-order book changes, with the resting order's owner. Perp books only. Written
to one append-only file, `<data_dir>/l4_book_diffs.jsonl`.

Each line is tagged by `kind`. A snapshot line lets a downstream book server
bootstrap. Diff lines then apply on top.

```json
{"kind":"snapshot","block_number":1234567,"block_time":1735689599852,"orders":[{"coin":0,"oid":366158130011,"side":"ask","px":"6250100000000","sz":"25000","owner":"0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567"}]}
{"kind":"diff","block_number":1234568,"block_time":1735689600852,"events":[{"coin":0,"oid":366158135200,"side":"bid","px":"6249900000000","sz":"50000","owner":"0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345"},{"coin":0,"oid":366158130011,"remove":true}]}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `kind` | string | — | `"snapshot"` or `"diff"` |
| `block_number` | uint64 | — | Committed block height |
| `block_time` | uint64 | ms | Consensus block timestamp |
| `orders` | array | — | Full resting set. Present on `"snapshot"` |
| `events` | array | — | Changed orders only. Present on `"diff"` |

One order or event:

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `coin` | uint32 | id | Canonical asset id |
| `oid` | uint64 | id | Resting order id |
| `remove` | bool | — | Present and `true` only on a removal. A removal carries no other field |
| `side` | string | — | `"bid"` or `"ask"` |
| `px` | i128 string | raw price | Resting limit price |
| `sz` | u128 string | raw size | Size still resting |
| `owner` | string | — | `0x`-hex owner address |

An upsert carries `side`, `px`, `sz`, and `owner`, and omits `remove`. A removal
carries `coin`, `oid`, and `remove: true` only.

A block whose book did not change writes no line.

## `l2_book_diffs` {#l2_book_diffs}

The anonymous sibling of `l4_book_diffs`. Resting orders are aggregated into
`(coin, side, price)` levels. There is **no** order id and **no** owner. Perp
books only. Written to `<data_dir>/l2_book_diffs.jsonl`.

```json
{"kind":"snapshot","block_number":1234567,"block_time":1735689599852,"levels":[{"coin":0,"side":"ask","px":"6250100000000","sz":"25000"}]}
{"kind":"diff","block_number":1234568,"block_time":1735689600852,"events":[{"coin":0,"side":"bid","px":"6249900000000","sz":"75000"},{"coin":0,"side":"ask","px":"6250100000000","remove":true}]}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `kind` | string | — | `"snapshot"` or `"diff"` |
| `block_number` | uint64 | — | Committed block height |
| `block_time` | uint64 | ms | Consensus block timestamp |
| `levels` | array | — | Full level set. Present on `"snapshot"` |
| `events` | array | — | Changed levels only. Present on `"diff"` |

One level or event:

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `coin` | uint32 | id | Canonical asset id |
| `side` | string | — | `"bid"` or `"ask"` |
| `px` | i128 string | raw price | Level price |
| `sz` | u128 string | raw size | **Total** resting size at that level |
| `remove` | bool | — | Present and `true` when the level vanished. The level carries no `sz` |

A level event is an absolute set, not an increment. Replace the level's size with
`sz`; do not add to it.

## Consumer checklist {#consumer-checklist}

1. Walk `{YYYYMMDD}/{HH}` in lexical order. That is block order.
2. Test each line for `{"gap"` before you parse it as an envelope.
3. Accept only newline-terminated lines. Retry a fragment on the next pass.
4. Key your rows so a re-read inserts nothing new. Re-running over the same files
   must be a no-op.
5. Parse every price, size, and money value as an arbitrary-precision decimal.
   Never as a float.
6. Divide by the right plane. `node_*` prices need `/ 1e8`. `node_*` sizes need
   `/ 10^sz_decimals`. `replica_cmds` prices and fill sizes need neither.
7. Resolve `market` / `market_id` / `coin` against the market universe, except
   `node_ledger.coin`, which is a token id.
8. Convert `replica_cmds` byte arrays to hex yourself if you join them against
   `node_*` addresses.
