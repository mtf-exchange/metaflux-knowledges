---
description: The NDJSON streams that a MetaFlux node writes to disk for each block. This page gives the enable flags, the on-disk layout, the schema of each record and the number plane of each field.
---

# Node data streams

This page describes the NDJSON streams that a MetaFlux node writes to disk, and the schema of each record.

:::info
**Status.** stable shapes. Every stream is off by default. You enable each stream
with its own flag. Most streams de-anonymize order flow or account value. A node in the
validator set logs a start-up warning for those streams and records anyway. The node
refuses only the two book-diff streams. Run the streams on a non-validating node.
:::

## Overview {#tldr}

A MetaFlux node can write its committed blocks to disk as newline-delimited JSON (NDJSON).
One line is one envelope. One envelope holds one committed block. Each envelope holds
zero or more records.

The node does not serve these files. It only writes them. You read them with your own
indexer, archiver or analytics job.

Fourteen streams exist. Ten carry block events. Two sample on a timer. Two carry order-book
state.

| Stream | On-disk root | Content |
|--------|--------------|---------|
| [`node_fills`](#node_fills) | `<data_dir>/node_fills/` | One record per filled party (taker and maker) |
| [`node_trades`](#node_trades) | `<data_dir>/node_trades/` | One record per print, no counterparty |
| [`node_order_statuses`](#node_order_statuses) | `<data_dir>/node_order_statuses/` | Order lifecycle transitions |
| [`node_funding`](#node_funding) | `<data_dir>/node_funding/` | Realized funding payments |
| [`node_ledger`](#node_ledger) | `<data_dir>/node_ledger/` | Signed non-funding balance deltas |
| [`node_gov`](#node_gov) | `<data_dir>/node_gov/` | Governance vote casts and enactments |
| [`node_bridge_outbox`](#node_bridge_outbox) | `<data_dir>/node_bridge_outbox/` | Bridge withdrawal outbox: admissions, status moves, deployment rows |
| [`node_equity_snapshots`](#node_equity_snapshots) | `<data_dir>/node_equity_snapshots/` | Hourly account-value samples |
| [`node_asset_ctxs`](#node_asset_ctxs) | `<data_dir>/node_asset_ctxs/` | Per-market mark and oracle price samples, every 5 s |
| [`node_actions`](#node_actions) | `<data_dir>/node_actions/` | One record per action in a block payload, applied and rejected |
| [`node_blocks`](#node_blocks) | `<data_dir>/node_blocks/` | One block head per committed block, including an empty one |
| [`replica_cmds`](#replica_cmds) | `<data_dir>/replica_cmds/` | One block envelope per block, header plus events |
| [`l4_book_diffs`](#l4_book_diffs) | `<data_dir>/l4_book_diffs.jsonl` | Per-order book diffs, with owner |
| [`l2_book_diffs`](#l2_book_diffs) | `<data_dir>/l2_book_diffs.jsonl` | Per-price-level book diffs, anonymous |

:::warning
Read [Number planes](#number-planes) before you read any number. The `node_*` streams
write prices and sizes as raw integer strings. `replica_cmds` writes the same quantities
as whole-unit decimal strings. The two look alike, and they differ by a large power of
ten.
:::

## Joining the validator set {#joining-the-validator-set}

Anyone can run a MetaFlux node and read its streams. Membership of the validator set is
separate, and it is controlled. A stake of MTF does not by itself make a node a validator.

To apply, write to validators@mtf.exchange.

## Operations {#operations}

### Stream flags {#enable-a-stream}

Each stream has its own flag in the `[persistence]` table of the node config. Every flag
defaults to `false`.

| Stream | Flag | Default |
|--------|------|:-------:|
| `node_fills` | `write_fills` | `false` |
| `node_trades` | `write_trades` | `false` |
| `node_order_statuses` | `write_order_statuses` | `false` |
| `node_funding` | `write_funding` | `false` |
| `node_ledger` | `write_ledger` | `false` |
| `node_gov` | `write_gov` | `false` |
| `node_bridge_outbox` | `write_bridge_outbox` | `false` |
| `node_equity_snapshots` | `write_equity_snapshots` | `false` |
| `node_asset_ctxs` | `write_asset_ctxs` | `false` |
| `node_actions` | `write_actions` | `false` |
| `node_blocks` | `write_blocks` | `false` |
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

### Recording on a validator {#validator-refusal}

Most streams de-anonymize order flow, account value or a user withdrawal. A node in the
validator set that enables one of them publishes the flow of every account that trades on
it.

- An enabled `write_*` stream always records. A validator that sets one gets a
  start-up warning. It never gets a silent refusal. There is no config override, because
  there is no gate to lift. Enable these streams on a validator only when the flow is
  your own. The warned set is `write_fills`, `write_trades`, `write_order_statuses`,
  `write_funding`, `write_ledger`, `write_equity_snapshots`, `write_bridge_outbox`,
  `write_actions` and `write_replica_cmds`.
- Three streams carry nothing to de-anonymize and raise no warning. `write_gov` names
  a validator, not a trader. `write_asset_ctxs` and `write_blocks` carry no address and no
  account value. `node_gov` is meant to run on a validator, because the votes happen
  there.
- A validator refuses `record_l4` and `record_l2`, with no override. These streams
  also walk the whole book once per block. A validator must not do that work on the
  commit path.

Run a de-anonymizing stream on a non-validating node that follows the chain and serves
nobody. Point your indexer at that node.

### Sampling windows {#sampling-windows}

Most streams are event tapes. They record what a block did. Two streams are sample tapes.
They record state at a point in time, so they sample and do not write every block.

| Stream | Window | Sampled block |
|--------|--------|---------------|
| `node_equity_snapshots` | One UTC hour of consensus block time (3,600,000 ms) | The first committed block of each window |
| `node_asset_ctxs` | 5,000 ms of consensus block time | The first committed block of each window |
| `l4_book_diffs` / `l2_book_diffs` | `persistence.snapshot_interval` blocks (default `1024`) | The block that closes the interval, plus one bootstrap snapshot on the first non-empty book |

`node_equity_snapshots` writes exactly one sample per hourly file. It does not sample
during start-up replay, because a replayed block would stamp current state onto an old
block time.

The book-diff streams write a diff line on every block whose book changed. They write a
full snapshot line on the interval.

## On-disk layout {#on-disk-layout}

### Hourly files {#hourly-files}

Eleven streams rotate hourly:

```
<data_dir>/node_fills/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_trades/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_order_statuses/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_funding/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_ledger/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_gov/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_bridge_outbox/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_equity_snapshots/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_asset_ctxs/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_actions/hourly/{YYYYMMDD}/{HH}
<data_dir>/node_blocks/hourly/{YYYYMMDD}/{HH}
```

`replica_cmds` rotates hourly too, but without the `hourly/` segment:

```
<data_dir>/replica_cmds/{YYYYMMDD}/{HH}
```

`{YYYYMMDD}` is the UTC date. `{HH}` is the UTC hour, `00` to `23`, zero-padded. Both
come from the consensus block time, never from the clock of the recording node. The file
that a record goes into is therefore a function of the block alone. Two nodes that record
the same blocks produce the same file names and the same bytes.

Files have no extension. They are append-only NDJSON. Inside one file, envelopes are in
ascending block order. Across files, the lexical order of `{YYYYMMDD}/{HH}` is the
chronological order.

The two book-diff streams do not rotate. Each is a single append-only file:

```
<data_dir>/l4_book_diffs.jsonl
<data_dir>/l2_book_diffs.jsonl
```

### Empty blocks and archive holes {#gaps}

A block with no events for a stream writes no line. The absence of a line means "that
block was empty for this stream".

An archive hole is different. A hole is a block range that the node did not record,
because the recorder was down and the range could not be replayed. The node marks a hole
with one line:

```json
{"gap":{"from":941006632,"to":941006699}}
```

`from` and `to` are inclusive block numbers. Every hourly stream and
`replica_cmds` can carry gap lines. The book-diff streams cannot.

A consumer must detect a gap line before it parses an envelope, and must skip it. It
should record the hole, so that the completeness of the archive stays auditable. A gap
line always starts with `{"gap"`. An envelope never does.

`node_blocks` and `replica_cmds` each write one envelope for every committed block,
including an empty one. Their heights therefore form a contiguous sequence between gaps.
Every other stream skips an empty block.

### Control files {#control-files}

Each stream root holds small internal files of the node next to its date directories:

| File | Content |
|------|---------|
| `<stream root>/cursor` | Last recorded block number, as decimal text |
| `<data_dir>/node_equity_snapshots/snapshot_bucket` | Last sampled window index |
| `<data_dir>/node_asset_ctxs/snapshot_bucket` | Last sampled window index |

These files are not archive data. Do not parse them as envelopes. A walker that lists
only the directories under the stream root never sees them.

### Torn lines {#torn-lines}

A node that stops uncleanly can leave a partial last line. The node truncates that line
when it next opens the file, so a stored archive never blocks a reader.

A consumer that tails an active file must still handle a writer in the middle of a write. It
must accept only newline-terminated lines. It must never move its read offset past a
fragment. It must read that fragment again on the next pass.

## Number planes {#number-planes}

MetaFlux carries prices and sizes on two integer planes, and money on one decimal plane.
A mix of the planes is the most common integration defect. See
[two price planes](../concepts/mark-prices.md#two-price-planes-read-this-before-reading-any-number)
for the same split on the API surface.

| Plane | On the wire | Convert to human units |
|-------|-------------|------------------------|
| Raw price (1e8 fixed-point) | Integer string, e.g. `"6250000000000"` | Divide by `100000000` to get `62500.00` USDC |
| Raw size (lots) | Integer string, e.g. `"50000"` | Divide by the row's own `sz_decimals` to get `0.5` whole units |
| Whole units | Decimal string, e.g. `"-25.5"` | Already in human units. Parse as an arbitrary-precision decimal, never as a float |

`sz_decimals` is the size precision of the market. It is at most `6`. See
[contract specifications](../concepts/contract-specifications.md).

:::warning
Divide by the plane that the ROW states, never by the current precision of the market.

`node_fills`, `node_trades` and `node_order_statuses` each carry a `sz_decimals` field.
It is the plane on which that row was written.

A governance vote can raise the precision of a market. The vote multiplies every stored
lot count, so the real quantities do not move. But a row written before the vote keeps
the smaller lot count AND the older plane. A reader that divides every row by the current
precision of the market reports each of those older rows `10^Δ` too small.

Rows written before [block 11,550,001](../changelog/block-11550001.md#size-plane) carry
no `sz_decimals`. For those rows only, use the current precision of the market.
:::

The plane that each stream uses:

| Stream | Prices | Sizes | Money |
|--------|--------|-------|-------|
| `node_fills` | Raw price | Raw size | Whole USDC |
| `node_trades` | Raw price | Raw size | — |
| `node_order_statuses` | Raw price | Raw size | — |
| `node_funding` | — | Whole units (`szi`) | Whole USDC |
| `node_ledger` | — | — | Whole tokens |
| `node_gov` | — | — | Whole stake units |
| `node_bridge_outbox` | — | — | Raw token base units |
| `node_equity_snapshots` | — | — | Whole USDC |
| `node_asset_ctxs` | Raw price | — | — |
| `node_actions` | Raw price | Raw size | — |
| `node_blocks` | — | — | — |
| `replica_cmds` | Whole USDC | Mixed. See [`replica_cmds`](#replica_cmds) | Whole USDC |
| `l4_book_diffs` / `l2_book_diffs` | Raw price | Raw size | — |

Some numbers are outside the price, size and money split above:

- `node_gov` carries stake as a whole-integer string. It is a count of stake units.
  It is never divided.
- `node_bridge_outbox` carries a bridge amount as raw base units of the bridged token.
  Divide it by the own on-chain decimals of that token, never by the `sz_decimals` of a
  market. The two raw planes look alike, and they take different divisors.
- `node_actions` embeds the submitted action body under `payload`. That body follows the
  request planes of [`POST /exchange`](../api/rest/exchange.md). Its prices and sizes are
  therefore bare JSON numbers on the raw planes, not strings. The `result` block on the
  same record keeps the string convention.

Every price, size and money value is a JSON string. Block numbers, timestamps, order
ids, trade ids and enum codes are bare JSON numbers.

## `node_fills` {#node_fills}

One record per filled party. A single match produces two records: the taker leg
first, then the maker leg. Both legs of one match share the same `tid`.

Some fills come from no signed action: a forced close, a TWAP slice, a trigger fire or a
spot-margin forced close. The node records such a fill on the block in which it executed,
with an empty `hash`. No user signed it, so there is no hash to record.

Some order lanes produce a fill that this stream does NOT carry. These lanes settle
with no record:

- an order placed by [`modify`](../api/rest/exchange/orders.md#modify) or
  [`batch_modify`](../api/rest/exchange/orders.md#batch_modify)
- an order placed by [CoreWriter `LimitOrder`](../evm/interacting-with-core.md)
- any order inside a [`multi_sig`](../concepts/multi-sig.md) envelope
- every clearing of a [frequent batch auction](../concepts/fba.md)

See [unrecorded fills](../api/rest/info/orders-fills.md#unrecorded-fills). Both legs are
missing, so the maker loses its record as well. An archive folded from this stream
inherits the gap, and a volume total from it reads low.

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
| `sz_decimals` | uint8 | — | The size plane `sz` and `startPosition` ride. Divide by `10^sz_decimals`. This is the plane the print was MATCHED on, which is not always the market's current one |
| `side` | string | — | Side of this party: `"B"` buy, `"A"` sell |
| `oid` | uint64 | id | This party's order id |
| `cloid` | string \| absent | — | Client order id, `0x` plus 32 hex digits. Present on the taker leg only, and only when the order carried one |
| `tid` | uint64 | id | Print id. Identical on both legs of one match. It is a NUMBER here, on purpose. This tape is byte-pinned input for the archive and the indexer. It is not a public API, so it keeps the numeric form that the REST and WS surfaces gave up. It exceeds 2⁵³: parse it with a 64-bit reader |
| `crossed` | bool | — | `true` on the taker leg, `false` on the maker leg |
| `ts` | uint64 | ms | Fill timestamp. Equals `block_time` |
| `hash` | string | — | Trace hash of the originating taker action: lowercase hex, no `0x`. Empty string on the maker leg, and empty for system-injected actions |
| `fee` | decimal string \| absent | whole USDC | Fee this party paid. Negative means a rebate |
| `feeToken` | string \| absent | — | Fee asset. `"USDC"` today |
| `closedPnl` | decimal string \| absent | whole USDC | Realized PnL on the closed part. `"0"` on a pure open |
| `startPosition` | i128 string \| absent | raw size | Signed leg size before this fill |
| `dir` | string \| absent | — | One of `"Open Long"`, `"Close Long"`, `"Open Short"`, `"Close Short"`, `"Long > Short"`, `"Short > Long"` |
| `builderFee` | decimal string | whole USDC | Broker carve charged on this fill. Taker leg only. The maker did not route the order, so its leg reads `"0"`. Any fill that no broker routed also reads `"0"` |
| `liquidation` | bool | — | `true` on both legs of a forced-close print, else `false`. The flag on both legs tells the absorbing maker that it took a liquidation |
| `feeTrialEscrow` | decimal string | — | Reserved. Always `"0"` |
| `builder` | string \| null | — | Broker address that routed the order, `0x`-hex. Taker leg only, `null` otherwise |
| `twapId` | uint64 \| null | id | Parent TWAP order of a slice. Taker leg only, `null` otherwise |
| `deployerFee` | decimal string | — | Reserved. Always `"0"` |
| `liquidatedUser` | string \| null | — | The account whose position was closed, `0x`-hex. Present on both legs of a forced-close print, `null` otherwise |
| `markPx` | decimal string | whole USDC | The mark from which the liquidation ladder priced when it classified the leg. It is not the fill price, and not a later mark. Present with `liquidatedUser`, else `"0"` |

:::warning
**Three traps on one record.**

1. `fee`, `closedPnl`, `builderFee` and `markPx` are whole USDC. `px` and
   `startPosition` on the same record are raw. Divide `px` by `10^8` and
   `startPosition` by `10^sz_decimals`. Divide none of the other four. `markPx` is the
   worst case: it is next to `px` and takes no divisor.
2. The six settlement fields (`fee`, `feeToken`, `closedPnl`, `startPosition`, `dir`) are
   absent on a fill with no perp settlement leg, such as a spot fill. Treat absent as
   "no settlement data", not as zero.
3. Two fields are reserved and carry constants: `feeTrialEscrow` and `deployerFee`. Do
   not read them as data. The other six in that group are real. Read the rows above.
:::

## `node_trades` {#node_trades}

The public trade tape. One record per match, not per party. By design, this stream
carries no counterparty address.

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
| `sz_decimals` | uint8 | — | The size plane of `sz`. See [`node_fills`](#node_fills) |
| `side` | string | — | Aggressor side: `"B"` the taker bought, `"A"` the taker sold |
| `tid` | uint64 | id | Print id. Matches the `tid` on both `node_fills` records of this print |
| `taker_oid` | uint64 | id | Aggressing order id |
| `maker_oid` | uint64 | id | Resting order id |
| `ts` | uint64 | ms | Print timestamp. Equals `block_time` |
| `hash` | string | — | Trace hash of the taker action: lowercase hex, no `0x`. Empty for a system-injected action |

To get the parties, join `node_trades` to `node_fills` on `tid`.

This tape carries no [unrecorded fill](../api/rest/info/orders-fills.md#unrecorded-fills).
It has no print from a `modify`, from a CoreWriter `LimitOrder`, from inside a `multi_sig`
envelope, or from a [frequent batch auction](../concepts/fba.md) clearing. A volume total
built from this tape reads low by those fills.

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
      "ts": 1735689600102,
      "hash": "9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11"
    }]
  ]
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market` | uint32 | id | Canonical asset id |
| `oid` | uint64 | id | Order id. `0` on an `error` or `noop` record, because the order never got an id |
| `cloid` | string \| absent | — | Client order id, `0x` plus 32 hex digits. Absent on a maker execution record even when the order carried one |
| `status` | string | — | Exactly one of `"resting"`, `"filled"`, `"error"`, `"noop"`, `"parked"`. A `"parked"` record is an accepted trigger leg held off the book. It carries a real `oid`, and `sz` is the whole leg because it has never matched. One `filled` record per (block, maker `oid`). See [maker execution records](#maker-execution-records) |
| `side` | string | — | `"B"` buy, `"A"` sell |
| `limit_px` | i128 string | raw price | Limit price of the order. Always present |
| `sz` | u128 string | raw size | On `filled`, the filled size. On `resting`, `error` and `noop`, the request size |
| `orig_sz` | u128 string | raw size | Request size at placement. `"0"` on a maker execution record |
| `sz_decimals` | uint8 | — | The size plane of `sz`, `orig_sz` and `total_sz`. See [`node_fills`](#node_fills) |
| `tif` | string \| absent | — | Time in force: `"Gtc"`, `"Ioc"`, `"Alo"`. Absent on a maker execution record |
| `reduce_only` | bool | — | Reduce-only flag of the order. `false` on a maker execution record, whatever the order carried |
| `avg_px` | i128 string \| absent | raw price | Average fill price. Present on `filled` only |
| `total_sz` | u128 string \| absent | raw size | Total filled size. Present on `filled` only |
| `error` | string \| absent | — | Free text. On `error` it is the rejection reason. On `noop` it is the reason that the order had no effect. A `noop` is a success, so do not read a present `error` as a rejection. Absent on `resting` and `filled`. There is no `reason` key |
| `ts` | uint64 | ms | Transition timestamp. Equals `block_time` |
| `hash` | string | — | Trace hash of the action that caused the transition: lowercase hex, no `0x`. Always present. Empty when no signed action owns it, such as a forced close. On a maker execution record it is the TAKER's action hash |

:::warning
`sz` changes meaning with `status`. On a partially filled order, `sz` is the filled
part and `orig_sz` is the request. Use `orig_sz` to get the size that the trader asked
for.
:::

### Maker execution records {#maker-execution-records}

Every record above comes from an order that the account submitted. A resting order
that is HIT submits nothing in that block. The node therefore derives its record from the
fills of the block. That record is a *maker execution record*.

Every order lane records the fill of the maker. Node 0.9.5 records the `modify` and
`multi_sig` lanes. Node 0.9.6 records all four lanes: a CoreWriter `LimitOrder` that
crosses on placement and a batch-auction clearing also derive the maker record. See
[every order lane records its fill](../api/rest/info/orders-fills.md#unrecorded-fills).

A fill describes the fill, not the order. `tif` and `cloid` are absent, `reduce_only`
is `false` and `orig_sz` is `"0"`, whatever the order carried. For the real values, join
to the own `resting` record of that order on the same `oid`.

A `resting` record exists only for an order that a signed `order`, `batch_order`,
`scale_order`, `spot_order` or `chase_order` placed. For two groups of order, the join
therefore has no target.

The first group is the two orders that the node rests by itself:

- a chase leg after a reprice. A reprice cancels the leg and rests a new `oid`.
- a TP/SL trigger leg that fired as a limit order.

The FIRST leg of a chase is not in this group. `chase_order` is a signed action, and its
opening leg does get a `resting` record. Only the legs that a reprice rests have no
record. You cannot recover `orig_sz` and `reduce_only` for these two orders. The
open-book read ([`open_orders`](../api/rest/info/orders-fills.md#open_orders)) serves
`null` for `orig_sz`, and no action ever submitted a request size for the leg.
`reduce_only` on that read is a constant `false` on every book row, so it repeats the
same wrong value. `tif` and `cloid` ARE real there. Take them while the order still
rests. After that, use the order kind. A chase leg is always `"Alo"` and never
reduce-only. A fired trigger leg is always `"Gtc"` and always reduce-only, so
`reduce_only: false` is wrong on exactly that record.

The second group is any order that an
[unrecorded-fill lane](../api/rest/info/orders-fills.md#unrecorded-fills) rested: a
CoreWriter `LimitOrder` that rested before node 0.9.6. That lane rested an order with no
`resting` record. After that, it is an ordinary resting order. An ordinary taker DOES give
it a maker execution record later, but that record has nothing to join to. All four
fields stay missing for the full life of the order.

Some order lanes produce no maker execution record, because they produce no record at
all. These lanes write nothing to these streams:

- an order inside a `multi_sig` envelope
- an order placed by `modify` or `batch_modify`
- an order placed by CoreWriter `LimitOrder`
- a [frequent batch auction](../concepts/fba.md) clearing

They write no `node_fills` print, no `node_trades` print, no status record of their own,
and no maker execution record for the resting order that they hit. The chain still
matches the order and moves the money. See
[unrecorded fills](../api/rest/info/orders-fills.md#unrecorded-fills). A resting order
with no `filled` record was therefore not necessarily left alone.

The node sums every match against one `oid` inside one block into ONE record. `sz` and
`total_sz` are therefore the size executed in that block, not the lifetime total.
`avg_px` equals `limit_px`, because a resting order executes at its own price. A maker hit
in three blocks gets three records, and the order can still rest after all three.

A forced close, a TWAP slice and a trigger order produce these records too. None of them
sends an action, and the maker that each one hits still needs its record.

The REST read built from this stream serves an absent key as `null`. See
[`historical_orders`](../api/rest/info/account-history.md#historical_orders). Absent here
and `null` there are the same record.

```json
{
  "block_number": 941006641,
  "block_time": 1735689600202,
  "events": [
    ["0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567", {
      "market": 0,
      "oid": 366158130011,
      "status": "filled",
      "side": "A",
      "limit_px": "6250000000000",
      "sz": "40000",
      "orig_sz": "0",
      "reduce_only": false,
      "avg_px": "6250000000000",
      "total_sz": "40000",
      "ts": 1735689600202,
      "hash": "9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11"
    }]
  ]
}
```

The record has no `tif` key, no `cloid` key and no `error` key. The `hash` is the hash of
the taker.

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
| `coin` | uint32 | id | Market asset id the funding settled on |
| `usdc` | decimal string | whole USDC | Signed payment. `+` received, `−` paid |
| `time` | uint64 | ms | Settlement timestamp. Equals `block_time` |
| `szi` | decimal string | whole units | Signed position size at settlement. Already human, do not divide |
| `fundingRate` | decimal string | fraction per hour | The rate applied at this settlement. `"0.0000125"` is 0.00125 % per hour |

`szi` and `fundingRate` are the values stamped at the settlement site. Do not derive them
again from later state.

## `node_ledger` {#node_ledger}

One record per account whose balance a committed action moved. Funding is excluded. A
peer transfer emits two records. Their `delta` values net to zero.

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
| `kind` | string | — | Coarse class, such as `"transfer"`, `"withdraw"`, `"deposit"` or `"liquidation"`. Treat an unknown value as data |
| `delta` | decimal string | whole tokens | Signed balance change. `−` outflow, `+` inflow. At most 8 decimal places |
| `coin` | uint32 | id | Token asset id. `0` is USDC |
| `time` | uint64 | ms | Timestamp. Equals `block_time` |
| `counterparty` | string \| absent | — | The other party's `0x` address on a peer transfer. Absent on a single-sided move |
| `market` | uint32 \| absent | id | Market asset id the position closed on. `"liquidation"` only |
| `mark_px` | decimal string \| absent | whole USDC | Price the leg closed at. `"liquidation"` only. Absent when the market had no usable mark |

A `liquidation` record is a forced close or a
[delist settlement](../products/perpetuals.md#delisting). It has no `cause` field, so the
two look the same here. The WS [`ledger_updates`](../api/ws/subscriptions.md#ledger_updates)
feed carries the cause.

The event order inside `events` is deterministic on replay. The index of an event inside
its block is therefore a stable discriminator for each block.

:::warning
`coin` is a token id here, not a market id. `node_funding` also has a field named
`coin`, and there it is a market asset id. The two id spaces are different. Resolve
`node_ledger.coin` against the token registry and `node_funding.coin` against the market
universe.
:::

:::warning
This stream is not a complete balance history. It does not record fills, fees or
funding. Do not rebuild an account balance from `node_ledger` alone.
:::

## `node_gov` {#node_gov}

One record per governance vote cast, and one record per enactment. This is the only
durable record of who voted and what an enactment changed. The current tally is transient: a
quorum drains it and a timeout prunes it.

```json
{
  "block_number": 941006670,
  "block_time": 1735689603000,
  "events": [
    {
      "type": "vote_cast",
      "round": 2000007,
      "category": "dynamic_risk",
      "sub_id": 7,
      "action": "SetDynamicRiskParam",
      "asset": 0,
      "coin": "BTC",
      "validator": "0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345",
      "stake": "4000000",
      "total_stake": "10000000",
      "quorum_met": true,
      "payload": "0x01ab",
      "time": 1735689603000
    },
    {
      "type": "vote_enacted",
      "round": 2000007,
      "action": "SetDynamicRiskParam",
      "asset": 0,
      "coin": "BTC",
      "changes": [
        { "field": "max_leverage", "prior": "20", "new": "25" }
      ],
      "agreeing_stake": "7000000",
      "total_stake": "10000000",
      "time": 1735689603000
    }
  ]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `block_number` | uint64 | Committed block height |
| `block_time` | uint64 | Consensus block timestamp, ms |
| `events` | array | Casts and enactments in emission order |

Casts and enactments share one list, so their relative order inside a block stays. That
order is the discriminator for each block. Do not sort `events`.

Each event has one of two shapes. Read `type` to tell them apart.

### `vote_cast` {#node_gov-vote-cast}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `round` | uint64 | id | Synthetic vote round this cast belongs to |
| `category` | string | — | The label of the round that holds the vote. See [the category table](#node_gov-categories) |
| `sub_id` | uint64 | — | Offset of `round` from the base of its category. `0` on a fixed round. Under `"proposal"` it equals `round` |
| `action` | string | — | Wire action name the vote targets, such as `"SetDynamicRiskParam"`. This is the exact filter for a vote kind |
| `asset` | uint32 \| absent | id | Market asset id the vote targets. Absent on a chain-global vote. On a `SetDynamicRiskParam` vote that sets `pm_collateral_haircut` or `pm_collateral_price_asset`, it is a spot token id, not a market id, and `coin` is absent. Resolve the id against the token registry |
| `coin` | string \| absent | — | Market symbol for `asset`. Absent when the vote is global, or the market carries no listing spec |
| `validator` | string | — | Casting validator's `0x` address, lowercase, 20 bytes |
| `stake` | decimal string | whole stake units | This validator's own weight at the cast |
| `total_stake` | decimal string | whole stake units | Quorum denominator: total active, non-excluded stake at the cast |
| `quorum_met` | bool | — | `true` when this cast carried the payload to two thirds of `total_stake` |
| `payload` | string | — | Raw vote bytes, `0x`-hex, undecoded. Two validators agree when these bytes are identical. Decode it per `action` |
| `time` | uint64 | ms | Cast timestamp. Equals `block_time` |

#### Categories and rounds {#node_gov-categories}

Each vote kind collects its votes in a synthetic round. A fixed round is one round for
the whole vote kind. A band starts at a base and adds an id to it, so one vote kind has
one round per market, per chain or per pair.

Two rules apply to this table:

- `sub_id` is `0` on a fixed round. In a band it is the id added to the
  base.
- `action` is the exact filter for a vote kind. `category` names the round,
  not the action.

| `category` | `action` | Round base | `sub_id` |
|---|---|---|---|
| `proposal` | `GovPropose`, `GovVote` | below 1,000,000 | equals `round`: the proposal id |
| `vote_global` | `VoteGlobal` | 1,000,000 | the global parameter kind |
| `dynamic_risk` | `SetDynamicRiskParam` | 2,000,000 | market asset id |
| `prime_account` | `SetPrimeAccount` | 3,000,000 | `0` |
| `mb_configure_chain` | `BridgeConfigureChain` | 4,000,000 | bridge chain id |
| `treasury_config` | `ConfigTreasuryBackstop` | 5,000,000 | `0` |
| `metaliquidity_set` | `SetMetaliquiditySet` | 6,000,000 | `0` |
| `oracle_weights` | `SetOracleWeights` | 7,000,000 | market asset id. `999999` for the default table |
| `funding_formula` | `SetFundingFormula` | 8,000,000 | market asset id |
| `disabled_venues` | `SetDisabledVenues` | 9,000,000 | `0` |
| `fee_schedule` | `SetFeeSchedule` | 11,000,000 | `0` |
| `gov_adjust_spot_value` | `GovAdjustSpotValue` ¹ | 12,000,000 | `0` |
| `locked_stake_allowlist` | `SetLockedStakeAllowlist` | 13,000,000 | `0` |
| `delist_market` | `Delisting` | 14,000,000 | `0` |
| `set_perp_max_oi` | `SetPerpMaxOpenInterest` | 15,000,000 | `0` |
| `set_spot_min_notional` | `SetSpotMinNotional` | 16,000,000 | `0` |
| `mip3_set_global` | `SetGlobal` | 17,000,000 | `0` |
| `register_spot` | `RegisterSpot` | 18,000,000 | `0` |
| `disable_dex` | `DisableDex` | 19,000,000 | `0` |
| `quarantine_user` | `QuarantineUser` | 20,000,000 | `0` |
| `force_close` | `ForceClosePosition` | 21,000,000 | `0` |
| `reactivate_user` | `ReactivateUser` | 22,000,000 | `0` |
| `create_earn_pool` | `CreateEarnPool` | 23,000,000 | `0` |
| `set_market_tick` | `SetMarketTick` | 24,000,000 | `0` |
| `set_mark_mode` | `SetMarkMode` | 25,000,000 | `0` |
| `circle_promotion_schedule` | none ² | 26,000,000 | `0` |
| `circle_promotion_attest` | none ² | 27,000,000 | bridge chain id |
| `circle_promotion_advance` | none ² | 28,000,000 | `0` |
| `circle_promotion_prune` | none ² | 29,000,000 | `0` |
| `gov_adjust_spot_balance` | `GovAdjustSpotBalance` ¹ | 30,000,000 | `0` |
| `finalize_evm_contract` | `FinalizeEvmContract` | 31,000,000 | `0` |
| `fba_configure` | `FbaConfigure` | 32,000,000 | `0` |
| `bridge_reissue` | `BridgeReissueWithdrawal` | 33,000,000 | bridge chain id |
| `pm_shock_grid` | `SetPmShockGrid` | 40,000,000 | `0` |
| `arm_features` | `ArmFeatures` | 41,000,000 | `0` |
| `option_listing` | `OptionListing` | 42,000,000 | `0` |
| `option_auto_list` | `OptionAutoList` | 43,000,000 | `0` |
| `exchange_serving_allowlist` | `SetExchangeServingAllowlist` | 44,000,000 | `0` |
| `network_peer` | `SetNetworkPeer` | 45,000,000 | `0` |
| `validator_allowlist` | `SetValidatorAllowlist` | 46,000,000 | `0` |
| `gov_rotate_consensus_key` | `GovRotateConsensusKey` | 47,000,000 | `0` |
| `seed_market` | `Listing` | 48,000,000 | `0` |
| `mint_treasury` | `MintTreasury` ¹ | 49,000,000 | `0` |
| `burn_treasury` | `BurnTreasury` ¹ | 50,000,000 | `0` |
| `set_population_target` | `SetPopulationTarget` ¹ | 51,000,000 | `0` |
| `pm_collateral` | `SetDynamicRiskParam` with a `pm_collateral_*` field | 52,000,000 | spot token id |
| `bridge_void` | `BridgeVoidWithdrawal` | 53,000,000 | bridge chain id |
| `spot_margin_params` | `SetSpotMarginParams` | 10,000,000,000 | spot pair id |

¹ Testnet only. These five actions change token supply or an account balance.
Mainnet refuses them. See [total supply](../concepts/tokenomics.md#total-supply).

² The circle promotion votes write no `vote_cast` record. The label stops the round from
reading as the band below it.

Before [block 25,599,540](../changelog/block-25599540.md#node_gov-labels), a node
labeled only eight bases: `vote_global`, `dynamic_risk`, `mb_configure_chain`,
`oracle_weights`, `circle_promotion_attest`, `option_listing`, `option_auto_list` and
`spot_margin_params`. A round that was not one of them took the label of the nearest
labeled base below it. For example, a `DisableDex` vote on round 19,000,000 read
`oracle_weights` with `sub_id: 12000000`. On a record written before that block, read
`action` to find the vote kind. Never read `category`.

### `vote_enacted` {#node_gov-vote-enacted}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `round` | uint64 | id | The round that reached quorum |
| `action` | string | — | Wire action name. `"DirectAction"` when the block that enacts holds no `vote_cast` on this `round`. Then read `action` from the earlier `vote_cast` on the same `round` |
| `asset` | uint32 \| absent | id | Market asset id. Absent on a chain-global change. A spot token id on a `pm_collateral_haircut` or `pm_collateral_price_asset` change, as on `vote_cast` |
| `coin` | string \| absent | — | Market symbol for `asset` |
| `changes` | array | — | The fields the enactment moved, in a fixed order |
| `agreeing_stake` | decimal string | whole stake units | Weight that agreed on the enacted payload |
| `total_stake` | decimal string | whole stake units | Quorum denominator at enactment |
| `time` | uint64 | ms | Enactment timestamp. Equals `block_time` |

One entry of `changes`:

| Field | Type | Meaning |
|-------|------|---------|
| `field` | string | Name of the parameter the enactment moved |
| `prior` | string \| null | The effective value just before the write, resolved through the same ladder a read uses |
| `new` | string | Value after the write |

Values in `changes` stay strings. One enactment can move several fields of one struct,
and those fields do not share one numeric type.

On a `SetDynamicRiskParam` enactment, `field: "pm_collateral_price_asset"` is the native
perpetual id that gives the spot token its collateral mark. A vote that clears the
haircut (weight `0`) also clears this field, so `new` reads `null`.

:::warning
**Five traps on this stream.**

1. Every cast is recorded, with or without quorum. A vote short of quorum ages out of
   the current tally, but its `vote_cast` records stay in the archive. There is no
   "rejected" record. This governance model has a stake threshold and a timeout, and no
   reject vote. The only sign that a vote never passed is the absence of a
   `vote_enacted` on the same `round`.
2. `stake` is the own weight of the caster, not a running total. Use `total_stake` as
   the denominator, and `agreeing_stake` on `vote_enacted` as the numerator.
3. `agreeing_stake` and `total_stake` on `vote_enacted` can read `"0"`. The node
   joins them from the `vote_cast` that carried quorum in the same block. An
   enactment that fires from another trigger has no such cast in its block, so both read
   `"0"`. Look up the earlier `vote_cast` with `quorum_met: true` on the same `round`.
4. `sub_id` changes meaning with `category`. In a band, it is the id added to the
   base. On a fixed round, it is `0`. Under `"proposal"`, the round is the proposal id
   itself, and `sub_id` repeats it.
5. `prior: null` does not mean "first value ever". It means that the read path could
   not resolve an effective prior at all. Never read `null` as zero, and never as
   "previously unset".
:::

A `quorum_met: true` cast does not guarantee that a `vote_enacted` follows. The node emits
the enactment only after the state write that it describes succeeds. Join on `round`. Do
not assume that a match exists.

## `node_bridge_outbox` {#node_bridge_outbox}

The bridge withdrawal outbox, as one envelope per block that moved it. The node compares
the committed outbox with the last envelope that it wrote. It writes nothing when nothing
moved.

The `status` of an entry is the same value, from the same derivation, as the bridge
`/info` reads serve. This stream copies it. It never computes it again.

Four record kinds exist. `type` tells them apart:

| `type` | When it appears |
|--------|-----------------|
| `admission` | The first time the recorder sees this `economic_id`. The only kind that carries `msg` |
| `transition` | The derived half moved: co-signature count, status, or release time |
| `rebind` | A deployment change re-derived this entry. Emitted for every open entry on that block |
| `removed` | The entry left the outbox, through release, the retention prune or a governed re-issue of a stranded withdrawal. Terminal |

A withdrawal is admitted:

```json
{
  "block_number": 941006680,
  "block_time": 1735689604000,
  "events": [
    {
      "type": "admission",
      "economic_id": "0x7e1fbb3c5a2d9104e6f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e",
      "message_id": "0x2c9d40a1b7e35f8206c4d1e9f0a3b5c7d8e9f0a1b2c3d4e5f60718293a4b5c6d",
      "status": "awaiting_cosignatures",
      "pending_cosigner_count": 0,
      "released_at_ms": null,
      "msg": {
        "chain": 1,
        "user": "0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345",
        "asset": 0,
        "token": "USDC",
        "amount_units": "25000000",
        "dst_addr": "0x0000000000000000000000008a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
        "nonce": 41,
        "ts_ms": 1735689604000
      }
    }
  ]
}
```

Co-signatures reach quorum in a later block:

```json
{"block_number":941006740,"block_time":1735689610000,"events":[{"type":"transition","economic_id":"0x7e1fbb3c…","message_id":"0x2c9d40a1…","status":"ready_to_release","pending_cosigner_count":0,"released_at_ms":null}]}
```

The entry is released and leaves the outbox:

```json
{"block_number":941009000,"block_time":1735689840000,"events":[{"type":"removed","economic_id":"0x7e1fbb3c…","message_id":"0x2c9d40a1…","status":"released","pending_cosigner_count":0,"released_at_ms":1735689840000}]}
```

### Envelope {#node_bridge_outbox-envelope}

| Field | Type | Meaning |
|-------|------|---------|
| `block_number` | uint64 | Committed block height |
| `block_time` | uint64 | Consensus block timestamp, ms |
| `events` | array | Outbox records for this block. Can be empty |
| `configs` | array \| absent | The full current per-chain deployment set. Present only on a block where it differs from the last envelope |
| `withdrawals_halted` | bool \| absent | Chain-wide refusal of new withdrawals. Validators also stop signing queued withdrawals while it is `true`. Present on exactly the blocks `configs` is |

:::warning
`configs` and `withdrawals_halted` mean "replace the stored set". They do not mean "a
rotation happened". They appear on any block whose committed rows differ from the last
emitted view. This includes the first envelope after a restart, because the memory of
the node for the rows starts empty. If you read their presence as a rotation marker, you
get a false rotation on every restart. Compare the rows to decide.
:::

### Event fields {#node_bridge_outbox-event}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `type` | string | — | `"admission"`, `"transition"`, `"rebind"`, or `"removed"` |
| `economic_id` | string | — | `0x`-hex, 32 bytes. The upsert key. Rotation-invariant: it names the same withdrawal before and after a rotation |
| `message_id` | string | — | `0x`-hex, 32 bytes. The current signing digest. It moves on a rotation |
| `status` | string | — | `"awaiting_cosignatures"`, `"ready_to_release"`, `"stranded_on_retired_domain"`, or `"released"`. Derived by the node. A `"removed"` record can also carry `"voided"` |
| `pending_cosigner_count` | uint | — | Co-signatures held against `message_id` that are short of quorum. `0` once quorum is reached |
| `released_at_ms` | uint64 \| null | ms | Consensus timestamp of the release. `null` until the entry is released |
| `msg` | object \| absent | — | The immutable half of the withdrawal. Present on `"admission"` only |

`msg`:

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `chain` | uint8 | id | Destination chain: `1` Base, `2` Arbitrum |
| `user` | string | — | The account that opened the withdrawal, `0x`-hex, 20 bytes |
| `asset` | uint32 | id | Token asset id, the same id space as `node_ledger.coin`. Not a market id |
| `token` | string | — | Symbol for `asset`, resolved once at admission. A later rename does not rewrite it |
| `amount_units` | u128 string | raw token base units | Divide by the token's own on-chain decimals. Do not divide by `sz_decimals` |
| `dst_addr` | string | — | Destination address on `chain`, `0x`-hex, 32 bytes, left-padded |
| `nonce` | uint64 | — | Per-chain anti-replay nonce |
| `ts_ms` | uint64 | ms | When the withdrawal entered the outbox |

:::warning
**Four rules that consumers get wrong.**

1. `economic_id` is the upsert key. `message_id` is not. The message id is the
   signing digest under the current deployment row, so a rotation moves it. If you fold on
   the message id, one withdrawal counts two times across a rotation.
2. `admission` does not mean "first time ever". The memory of the outbox in the
   recorder is local to the node and is never persisted. A restart therefore emits
   every open entry again as an admission, at the status that it holds at that time.
   Always UPSERT on `economic_id`. Never read an admission as an arrival.
3. `removed` is terminal, and its `status` is not always `"released"`. It reads
   `"released"` when the release is confirmed. In other cases, it carries the last known
   status of the entry: the entry left through the retention prune, or through a
   re-issue of a stranded withdrawal. It reads `"voided"` when governance voided the
   withdrawal and refunded the user on the exchange. Nothing pays a voided withdrawal on
   the destination chain. In every case, the `economic_id` never returns. A re-issue
   replacement arrives as a new `admission` with its own `economic_id`.
4. `status` is derived. Do not compute it again. It folds the current deployment row
   through the own derivation of the node. Only that side can reach
   `"stranded_on_retired_domain"`. A consumer that computes status from `configs` and
   co-signature counts never sees a stranded entry.
:::

### `configs[]` {#node_bridge_outbox-configs}

One entry per configured chain, in ascending chain id. Each entry is the
committed deployment row.

| Field | Type | Meaning |
|-------|------|---------|
| `chain` | uint8 | `1` Base, `2` Arbitrum |
| `contract_address` | string | Bridge contract identity, `0x`-hex, 32 bytes, left-padded |
| `validator_quorum_threshold_bps` | decimal string | Co-signature threshold in basis points |
| `replay_nonce` | uint64 | Current outbound replay nonce for this chain |
| `paused` | bool | `true` when this chain's lane is paused |
| `evm_chain_id` | uint64 | The destination chain's own EVM chain id |
| `evm_contract_address` | string | Bridge contract address on that chain, `0x`-hex, 20 bytes |
| `validator_set_epoch` | uint64 | Validator-set epoch the row binds to. A rotation moves it |
| `release_retention_ms` | uint64 | Configured retention window. `0` is the unset sentinel, not "no retention" |
| `effective_release_retention_ms` | uint64 | The window actually in force. Read this one |
| `scan_policy` | object | Deposit-scan settings, below |

`scan_policy`:

| Field | Type | Meaning |
|-------|------|---------|
| `confirmations_only` | bool | Credit on confirmations alone |
| `confirmations` | uint64 | Configured confirmation depth. `0` is the unset sentinel |
| `effective_confirmations` | uint64 | The depth actually in force. Read this one |
| `confirmations_only_depth` | uint64 | Depth used when `confirmations_only` is set |
| `usdc_token` | string | USDC token address on that chain, `0x`-hex, 20 bytes |
| `raw_transfer_credit` | bool | `true` when a plain token transfer to the contract is credited |

Both the raw field and the `effective_*` field ship, because `release_retention_ms` and
`confirmations` use `0` as an unset sentinel. A raw `0` alone tells you nothing about the
window in force.

### Rotation verdict {#node_bridge_outbox-rotation}

A deployment rotation strands every entry that is `"ready_to_release"` when it fires.
Those entries already hold a release-ready co-signature quorum under the domain that the
rotation retires. The outbound replay guard keys on the economic id. Finalization again
under the new domain is therefore suppressed, and no releasable multisig can ever appear
again. The funds are debited and cannot be released.

The verdict is therefore a fold of this stream:

1. Upsert every event on `economic_id`.
2. Drop the entries whose last event is `removed`.
3. Count the remaining entries whose `status` is `ready_to_release`.

A rotation is safe only when that count is zero.

### Positive control {#node_bridge_outbox-positive-control}

A fold over the wrong path returns zero, and zero reads exactly like the all-clear. Check
the reading before you trust it.

| What you observe | What it means |
|------------------|---------------|
| The stream root or its hourly files do not exist | The stream was never enabled here, or the data directory is wrong. Not "no withdrawals" |
| The stream root exists but holds no `cursor` file | No block has been recorded since the stream was turned on. Not "no withdrawals" |
| `cursor` is far behind the chain's committed height | The view is stale and incomplete. A zero count here proves nothing |
| The fold finds no entries at all, ever | Suspect the path. A running chain that has served any withdrawal has admissions in the archive |
| `cursor` is at the committed height, entries exist, and none reads `ready_to_release` | The real all-clear |

The control is the fourth row. First confirm that your fold sees entries in some state.
Only then trust it when it sees none in one state.

### Scope {#node_bridge_outbox-scope}

This stream tells you:

- whether any withdrawal sits at `ready_to_release` now.
- whether any withdrawal is stranded.
- the age of the oldest pending entry.
- the committed deployment row for each chain.

It does not carry inbound deposits, which are a separate flow. It reports a count of
co-signatures, never which validators signed. A `released` entry means that the chain
released it. To confirm that the payout landed, read the destination chain. This stream
does not tell you.

:::warning
The diff runs on the tip block only. The resume cursor advances through every block,
so a catch-up replay reports no hole. But the node compares state only on the block that
owns it. A withdrawal can move through several statuses fully inside a replayed range. It
then appears as one `admission`, at the status that it holds when the node catches up.
The node does not record the intermediate moves. This happens across a restart, never in
normal operation.
:::

## `node_equity_snapshots` {#node_equity_snapshots}

A sample tape, not an event tape. One line per sample. One sample per UTC hour of
consensus block time, taken on the first committed block of that hour. Each hourly file
therefore holds exactly one line.

One line carries every account that has committed state, in ascending order of
account address.

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
| `equity` | decimal string | whole USDC | Mark-aware account value: collateral plus unrealized PnL. The same number that the `/info` account read serves |
| `ts` | uint64 | ms | Sample timestamp. Equals `block_time` |

Use this stream to draw a portfolio-value curve. A curve rebuilt from flows alone misses
bridge credits and can go negative.

The sample costs one walk over every account and every market, so it stays off the
validator path. The node does not sample during start-up replay.

## `node_asset_ctxs` {#node_asset_ctxs}

A sample tape, not an event tape. One line per sample, and one sample every 5 seconds
of consensus block time. Each line carries every market in the committed universe:
perps first, then tradable spot pairs. Each group is in ascending market id.

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
| `mark_px` | decimal string | raw 1e8 | The committed mark price of the market |
| `oracle_px` | decimal string | raw 1e8 | The committed oracle price |

:::warning
`"0"` means NO COMMITTED PRICE. It is not a price of zero. Every spot pair reads `"0"`
for `oracle_px`, because a spot pair has no oracle. A perp also reads `"0"` before its
first oracle push. Treat `"0"` as absent. A consumer that includes it in an average pulls
every derived number toward zero.
:::

Both prices are on the raw 1e8 plane, like the rest of the `node_*` family. Divide by
`100000000` before you display them.

The node also snaps both prices to the tick of the market before it records them, on
the same grid that `/info` serves. Sub-tick precision never reaches the archive. A later
change of tick size does not re-grid the samples already written. An old sample keeps the
grid on which it was recorded.

Use this stream to build mark and oracle candles. The 5-second cadence gives the smallest
(1-minute) candle twelve samples. It is a price series, not a trade series. A bar exists
in every window that the samples cover, whether or not anything traded.

## `node_actions` {#node_actions}

One record per action in a committed block payload. This includes every action: the
ones that the chain applied and the ones that it dropped. This is the per-action tape. It
tells you what an account sent and what the chain did with it.

Enable it with `write_actions`. Like every stream, it is off by default. Each record names
a sender and carries the submitted action body, so this stream fully de-anonymizes order
flow. Run it on a non-validating node.

A block whose payload carried no action writes no line.

Envelope:

```json
{
  "block_number": 941006631,
  "block_time": 1735689599852,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", { /* record, shape below */ }],
    ["0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567", { /* record, shape below */ }]
  ]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `block_number` | uint64 | Committed block height. The same height that `node_blocks` writes |
| `block_time` | uint64 | Consensus block timestamp, ms |
| `events` | array | `[sender, record]` pairs, in `action_index` order. `sender` is `0x`-hex, lowercase, 20 bytes |

Do not sort `events`. The list is already in payload order, and that order is the
cursor. See [`action_index`](#node_actions-index).

Three records, one applied and two rejected:

```json
{
  "block_number": 941006631,
  "block_time": 1735689599852,
  "events": [
    ["0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345", {
      "action_index": 0,
      "action_type": "Order",
      "action_hash": "9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11",
      "signer": "0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345",
      "nonce": 1735689599801,
      "expires_after": 0,
      "status": "success",
      "error_code": null,
      "payload": {
        "type": "submit_order",
        "order": {
          "owner": "0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345",
          "market": 0,
          "side": "bid",
          "kind": "limit",
          "size": 50000,
          "limit_px": 6250000000000,
          "tif": "gtc",
          "reduce_only": false
        }
      },
      "result": {
        "statuses": [
          {
            "market": 0,
            "oid": 366158135200,
            "status": "filled",
            "side": "B",
            "limit_px": "6250000000000",
            "sz": "50000",
            "orig_sz": "50000",
            "tif": "Gtc",
            "reduce_only": false,
            "avg_px": "6249800000000",
            "total_sz": "50000",
            "ts": 1735689599852,
            "hash": "9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11"
          }
        ]
      }
    }],
    ["0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567", {
      "action_index": 1,
      "action_type": "Cancel",
      "action_hash": "4d1f0b7a2e93c56480a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcde",
      "signer": null,
      "nonce": 1735689599802,
      "expires_after": 0,
      "status": "failure",
      "error_code": "DROPPED_INVALID_SIGNATURE",
      "payload": { "type": "cancel_order", "cancel": { "market": 0, "oid": 366158130011 } },
      "result": null
    }],
    ["0x5c4d3e2f1a0b9988776655443322110099aabbcc", {
      "action_index": 2,
      "action_type": "Order",
      "action_hash": "e30bb4c7715f2a9d0c8e1f3b5d7a9c0e2f4b6d8a0c2e4f6b8d0a2c4e6f8b0d21",
      "signer": "0xaabbccddeeff00112233445566778899aabbccdd",
      "nonce": 1735689599803,
      "expires_after": 1735689659000,
      "status": "failure",
      "error_code": "MARGIN_INSUFFICIENT",
      "payload": {
        "type": "submit_order",
        "order": {
          "owner": "0x5c4d3e2f1a0b9988776655443322110099aabbcc",
          "market": 0,
          "side": "ask",
          "kind": "limit",
          "size": 900000000,
          "limit_px": 6260000000000,
          "tif": "gtc",
          "reduce_only": false
        }
      },
      "result": {
        "statuses": [
          {
            "market": 0,
            "oid": 0,
            "status": "error",
            "side": "A",
            "limit_px": "6260000000000",
            "sz": "900000000",
            "orig_sz": "900000000",
            "tif": "Gtc",
            "reduce_only": false,
            "error": "precondition failed: insufficient margin: required 56340.00, available 812.55",
            "ts": 1735689599852,
            "hash": "e30bb4c7715f2a9d0c8e1f3b5d7a9c0e2f4b6d8a0c2e4f6b8d0a2c4e6f8b0d21"
          }
        ]
      }
    }]
  ]
}
```

| Field | Type | Nullable | Meaning |
|-------|------|:--------:|---------|
| `action_index` | uint32 | no | Position of this action in the block payload, from `0`. Dense over every action in the block, rejected ones included. See [the cursor rule](#node_actions-index) |
| `action_type` | string | no | The action kind, from a closed set. Not the `type` string in `payload`. See [the vocabulary](#node_actions-types) |
| `action_hash` | string | no | Correlation hash: lowercase hex, no `0x`. Empty string on an injected or system action, and on a pre-fork block. See [the hash rule](#node_actions-hash) |
| `signer` | string \| null | yes | The address whose EIP-712 signature authorized this action, `0x`-hex. It differs from the sender on an agent-signed action. See [the signer rule](#node_actions-signer) |
| `nonce` | uint64 | no | The action's nonce, as submitted |
| `expires_after` | uint64 | no | Signed expiry, ms. `0` means the action never expires. That is the common value |
| `status` | string | no | `"success"` or `"failure"`. Nothing else |
| `error_code` | string \| null | yes | Why it failed. `null` on success. See [rejections](#node_actions-rejections) |
| `payload` | object \| null | yes | The action body as submitted. `null` when the action carries no signed body. See [the payload rule](#node_actions-payload) |
| `result` | object \| null | yes | What the action produced. `null` for every action that is not order-shaped or a fee claim. See [`result`](#node_actions-result) |

### `action_index` cursor {#node_actions-index}

`action_index` is half of the seek cursor. It is the position of the action in the
committed block payload. Every node derives it from the same committed bytes, so
`(block_number, action_index)` is a total and stable order over the whole chain. Page
a detail view on `(block_number DESC, action_index DESC)`, and rows never repeat and never
skip.

The index counts EVERY action in the payload, applied and rejected alike. This keeps
it stable. An index that counted only applied actions would shift when a rejection rule
changed. Every stored cursor would then point at a different row.

Two consequences:

- The indices in one envelope are contiguous from `0`. A missing index means that
  your reader dropped a record. The chain did not skip one.
- A second read of a file derives the same pair. Key your rows on
  `(block_number, action_index)`, and a second read inserts nothing new.

`action_hash` is the key of the detail route, not the cursor. It is also stable across
replay. But it is empty on injected and system actions, so it does not order a block on
its own.

### `action_hash` value {#node_actions-hash}

`action_hash` is the same value that [`POST /exchange`](../api/rest/exchange.md) returned
to the submitter in its admission response. A submitter that logged its `action_hash` can
find its action on this tape with a string match, and no other join.

There is one difference in form: the tape writes the hash without the `0x` prefix. The
`/exchange` response writes it with the prefix. Strip or add the prefix at the join. The
`hash` field on [`node_fills`](#node_fills) and [`node_trades`](#node_trades) follows the
same rule. For an action that produced a fill, those hashes are again the same value.

An empty `action_hash` is not an error. An injected or system action carries no signed
body, so there is no hash to compute. Join those rows by `(block_number, action_index)`
alone.

### Rejected actions {#node_actions-rejections}

The tape records a rejected action, with its reason.

Branch on `status`. `"success"` means that the chain applied the action. `"failure"`
means that it did not. There is no third value. `error_code` is `null` if and only if
`status` is `"success"`.

A failure is one of two kinds. `error_code` tells them apart.

A `DROPPED_*` code means that the action never dispatched. The commit loop refused it
before it ran. It used no nonce and changed no state.

| `error_code` | Cause |
|---|---|
| `DROPPED_MALFORMED_SENDER` | The payload's sender field is not 20 bytes. Only a faulty proposer produces this row, and `sender` reads as the zero address |
| `DROPPED_NOT_PROPOSER_BOUND` | An injected validator or system action arrived under a sender that is not the block proposer |
| `DROPPED_EXPIRED` | `expires_after` is at or before `block_time`, or timed expiry is not armed on this chain |
| `DROPPED_RETIRED` | The action kind is retired and no longer dispatches |
| `DROPPED_PAYLOAD_KEYS_INACTIVE` | A `CoreEvmTransfer` carried payload keys that are not active yet |
| `DROPPED_INVALID_SIGNATURE` | No authorized signature recovered from the action |
| `DROPPED_NONCE_REPLAY` | This `(sender, nonce)` pair is already used |
| `DROPPED_ACTION_TOO_LARGE` | The action's signed bytes exceed 1 MiB. Only a faulty proposer produces this row: admission refuses the same body with `INVALID_REQUEST` |

Any other code means that the action dispatched and a state rule refused it. Those
codes are the same catalog that `/exchange` answers with. Read them in
[error codes](../api/errors.md#catalog). `PRECONDITION_FAILED` is the documented catch-all.

The two sets do not overlap. `error_code.startsWith("DROPPED_")` is therefore a safe test
for "the chain never ran it".

:::warning
A batch is a success when ANY leg landed. A `BatchOrder` reads `status: "success"`
and `error_code: null` when the chain accepted at least one leg, even if it rejected the
other legs. The verdict for each leg is in `result.statuses[].status`. To learn whether
every leg landed, read `result`, never `status`. A batch of one therefore reads exactly
like a single `Order`. That is the intent.
:::

### `signer` field {#node_actions-signer}

`signer` tells you who authorized the row. It is the address whose EIP-712 signature the
chain recovered and accepted. `sender` is the account for which the action acts. The two
differ on an [agent-signed](../integration/agent-wallets-howto.md) action: the sender is
the master account, and the signer is the agent wallet. Keep them in two columns.

`signer: null` does not mean "unauthorized". It means that no wallet signature for
this action authorized the row. There are four cases:

- an injected or system action. The proposer binding authorizes it.
- a [`multi_sig`](../concepts/multi-sig.md) envelope. Its authority is a roster, not one
  address.
- a block below the signature-verification fork height.
- a rejection, where no signature ever verified.

:::danger
On a `DROPPED_*` row, trust `sender` only when `signer` is non-null. A drop before
signature recovery carries whatever address the payload claimed. If you attribute a
`DROPPED_INVALID_SIGNATURE` or `DROPPED_NOT_PROPOSER_BOUND` row to that account, anyone
can put a rejected action on the page of anyone else. Rows that the chain applied are
always authorized, so `status: "success"` needs no such test.
:::

### `payload` field {#node_actions-payload}

`payload` is the bytes that the submitter signed. It is the action body as posted. It is
not a new rendering of the body. It is the preimage of `action_hash`:

```
action_hash = keccak256( payload_bytes ‖ sender_20 ‖ nonce_be8 [ ‖ expires_after_be8 ] )
```

The node appends the trailing 8 bytes only when `expires_after` is non-zero. Compute
the hash again to prove that the tape did not change the body.

Three rules apply:

- `payload: null` USUALLY means that there was no signed body. An injected or system
  action and a pre-fork block carry none. `action_hash` is `""` on those rows, and there
  is nothing to verify.

  Do not read a null payload as proof of that. It is also null when the body was not
  parseable JSON. On such a row, `action_hash` IS set: a 64-hex string over the bytes that
  the block carried. The pair to test is therefore `payload` AND `action_hash`, never
  `payload` alone. Only a faulty proposer produces such a row. `/exchange` strict-parses
  before it signs, so no ordinary client can produce one.
- `payload` uses the own number planes of the request. It is an
  [`/exchange`](../api/rest/exchange.md) body. Its prices and sizes are therefore bare JSON
  numbers on the raw planes, not the strings that the rest of these streams use. The
  `result` block on the same record does use strings. Read
  [Number planes](#number-planes) before you divide anything.
- The node writes a body posted with line breaks again in compact form. A raw newline
  inside a record would break NDJSON framing, so the node writes the same JSON value in
  compact form. The value is identical, but the bytes are not, so the hash does not
  compute again from that row. Every SDK client posts a compact body, so this is rare. The
  tape does not flag which rows it changed. Treat a failed hash check as this case, and
  take `action_hash` as the authority.

### `result` field {#node_actions-result}

`result` carries the order legs. It is `null` on every action that is not order-shaped,
success included. The one exception is a [fee claim](#node_actions-result-claim). An
`Order`, a `BatchOrder` and a `ChaseOrder` fill it in:

```json
{ "statuses": [ /* one record per placed leg */ ] }
```

- `Order`: one element.
- `BatchOrder`: one element per placed leg, in leg order. Parked TP/SL protective
  legs never rest, so they are not in the list. A batch that placed nothing has an empty
  list.
- `ChaseOrder`: one element, and `"chase_oid": <uint64>` next to `statuses`. That
  handle is the `cancel_chase` key, not the `oid` of the leg.

Each element is the same record that [`node_order_statuses`](#node_order_statuses)
writes, with the same fields and the same planes. Its `hash` repeats the own `action_hash`
of the row, and its `ts` repeats `block_time`.

`result` is the only surface for each leg. The record has no column of its own for
each leg.

#### Fee claim result {#node_actions-result-claim}

A fee claim reports what it moved. A successful `ClaimReferralRewards` or
`ClaimBuilderRewards` fills in `result` with what the claim moved into the
cross-collateral of the sender:

```json
{ "claimed": "12.5", "referral": "4.5", "broker": "8" }
```

| Field | Type | Meaning |
|-------|------|---------|
| `claimed` | Decimal string | Total USDC moved. Always `referral` plus `broker` |
| `referral` | Decimal string | The part drained from the referral credit |
| `broker` | Decimal string | The part drained from the broker-code credit |

Both action types drain both credits. The three fields therefore have the same
meaning, whichever claim name the sender used. A claim with nothing accrued reads `"0"` in
all three. This row is the only place where the claimed amount appears. The
[`/exchange` reply](../api/rest/exchange/account.md#claim_referral_rewards) reports none,
and the balance reads are `0` after the claim.

### `action_type` vocabulary {#node_actions-types}

`action_type` is the own name of the protocol for the action kind. It is a closed set. It
is append-only, and a name is never used again for another kind.

:::warning
`action_type` is not the `type` string inside `payload`. The wire body uses
snake_case (`"submit_order"`). The tape uses the protocol name (`"Order"`). The two do not
always share a word: the body of a market seed is `"seed_market"`, and its `action_type`
is `"Listing"`. Map the pair explicitly. Never derive one from the other.
:::

Treat an unknown value as data, not as an error. A new action appends a new name. A
reader that rejects unknown names breaks on the next release. Store the string.

The list below names the kinds on which a caller can act. Kinds for node operations also
appear on the tape. They are not in this list.

- Trading: `Order`, `Cancel`, `CancelByCloid`, `Modify`, `BatchModify`, `ScheduleCancel`, `TwapOrder`, `TwapCancel`, `Liquidate`, `BatchOrder`, `BatchCancel`, `CancelAllOrders`, `ChaseOrder`, `CancelChase`, `ScaleOrder`, `CancelScale`, `SubmitEncryptedOrder`, `SubmitDecryptionShare`, `RfqRequest`, `RfqQuote`, `RfqAccept`, `FbaSubmit`
- Spot and Earn: `SpotOrder`, `SpotCancel`, `SpotSend`, `SpotMarginDeposit`, `SpotMarginWithdraw`, `SpotMarginOpen`, `SpotMarginClose`, `EarnDeposit`, `EarnWithdraw`, `SpotGenesis`
- Margin: `UpdateLeverage`, `UpdateIsolatedMargin`, `TopUpIsolatedOnlyMargin`, `UserPortfolioMargin`, `SetPositionMode`
- Transfers: `UsdSend`, `SendAsset`, `Withdraw3`, `SendToEvmWithData`, `UsdClassTransfer`, `CoreEvmTransfer`
- Sub-accounts: `CreateSubAccount`, `SubAccountTransfer`, `SubAccountSpotTransfer`
- Vaults: `CreateVault`, `VaultTransfer`, `VaultDistribute`, `VaultModify`, `NetChildVaultPositions`, `VaultWithdraw`, `SetMetaliquiditySet`, `RegisterMetaliquidityOperator`
- Account: `ApproveAgent`, `SetDisplayName`, `SetReferrer`, `SetReferrerByCode`, `RegisterReferralCode`, `ApproveBuilderFee`, `ConvertToMultiSigUser`, `MultiSig`, `Noop`, `UserSetAbstraction`, `AgentSetAbstraction`, `PriorityBid`, `ClaimBuilderRewards`, `ClaimReferralRewards`
- Staking: `TokenDelegate`, `ClaimRewards`, `LinkStakingUser`, `RegisterValidator`, `ExtendLongTermStaking`, `StakingDeposit`, `StakingWithdraw`, `BorrowLend`
- Governance and validator: `GovPropose`, `GovVote`, `VoteGlobal`, `CValidator`, `CSigner`, `ValidatorL1Vote`, `ValidatorL1Stream`, `VoteAppHash`, `ForceIncreaseEpoch`, `ApproveUpgrade`, `ArmFeatures`, `SubmitSlashingEvidence`, `SetDynamicRiskParam`, `SetOracleWeights`, `SetDisabledVenues`, `SetFundingFormula`, `SetFeeSchedule`, `SetPrimeAccount`, `SetPmShockGrid`, `SetPopulationTarget`, `SetSpotMarginParams`, `SetMarketTick`, `SetMarkMode`, `SetSpotMinNotional`, `SetPerpMaxOpenInterest`, `SetThresholdEpochKey`, `GovAdjustSpotValue`, `GovAdjustSpotBalance`, `MintTreasury`, `BurnTreasury`, `CreateEarnPool`, `ConfigTreasuryBackstop`, `TreasuryBackstopDraw`, `DisableDex`, `QuarantineUser`, `ReactivateUser`, `ForceClosePosition`, `RegisterSpot`, `Listing`, `Delisting`, `OptionListing`, `OptionAutoList`, `FbaConfigure`
- Market deployment: `PerpDeploy`, `SpotDeploy`, `SetGlobal`, `SubmitGasAuctionBid`, `Mip3SetOraclePx`
- Bridge: `BridgeAttest`, `BridgeWithdraw`, `BridgeEmergencyPause`, `BridgeConfigureChain`, `BridgeReissueWithdrawal`, `RegisterBridgeCosigner`, `BridgeWithdrawReleased`, `ValidatorSignWithdrawal`, `VoteEthFinalizedWithdrawal`, `VoteEthFinalizedValidatorSetUpdate`, `SignValidatorSetUpdate`, `ValidatorBridgePause`, `CirclePromotionSchedule`, `CirclePromotionCustodyAttest`, `CirclePromotionAdvance`, `CirclePromotionPruneCosig`
- EVM: `EvmRawTx`, `EvmUserModify`, `FinalizeEvmContract`
- System: `SystemBole`, `SystemSpotSend`, `CWithdraw`, `CUserModify`, `SystemUserModify`, `OracleSubmit`

### Limits {#node_actions-limits}

This tape does not carry:

- **Effects.** The record says what the action was and whether it landed. It does not
  say what the action moved. A [fee claim](#node_actions-result-claim) is the one
  exception. Money is in [`node_ledger`](#node_ledger), executions are in
  [`node_fills`](#node_fills) and funding is in [`node_funding`](#node_funding). Join on
  `block_number`, and on `action_hash` where a hash exists.
- **Signature bytes.** `signer` reports that a signature authorized the row. The node does
  not write the signature itself.
- **A multi-sig roster.** A `multi_sig` envelope is ONE row with `signer: null`. The tape
  does not unpack the inner actions, and it does not list the co-signers.
- **EVM transactions.** The tape covers the Core actions in the block payload. An EVM
  transaction in the same block gets no row, but [`node_blocks`](#node_blocks) counts it
  in `tx_count`.
- **Actions that never committed.** An action that no proposer put in a payload has no
  row. A rate-limited submission, an eviction from the mempool and an admission that timed
  out all leave nothing. An `accepted` response is not evidence of a row.
- **A receive time.** `block_time` is the only clock on the record. The tape does not say
  when the node first saw the action.
- A line for a block with no actions. That absence is not an archive hole. Use
  [`node_blocks`](#node_blocks) when you need a row for every height. To find a real
  hole, test for a [gap line](#gaps).

## `node_blocks` {#node_blocks}

One line per committed block, with the block head only. This is the one stream that
writes on an empty block, so its heights form a contiguous sequence between gaps. Use
it to rebuild a block tape that has a row for a block that carried no action.

The record is flat. It has no `events` array and no owner address.

```json
{
  "block_number": 941006700,
  "block_time": 1735689600000,
  "round": 941006700,
  "epoch": 9410,
  "proposer": 2,
  "hash": "0x9c22cbcd0ee34b90987b76f92544e0e64d8f4a0e2b2f7bc1d3f0c8ffb61d0a11",
  "tx_count": 3,
  "evm_block_number": 235251
}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `block_number` | uint64 | — | Committed block height |
| `block_time` | uint64 | ms | Consensus block timestamp |
| `round` | uint64 | — | Consensus round of this block. It equals `block_number` under the current two-chain rule. It ships as a separate field because both are on the wire |
| `epoch` | uint64 | — | Consensus epoch of `round` |
| `proposer` | uint64 | index | Validator-set index of the leader that proposed this block. Not an address |
| `hash` | string | — | Block hash, lowercase hex with the `0x` prefix. The same value the `block_info` read serves |
| `tx_count` | uint64 | — | Core actions plus EVM transactions in the block payload |
| `evm_block_number` | uint64 or `null` | — | The EVM block this Core round minted, or `null` if it minted none |

`evm_block_number` is the join between a Core round and an EVM block. The EVM mints a
block only when its own period ends. The ratio to Core rounds is therefore not fixed. It
moves with the cadence of the chain. Read it as follows:

- `null` means that this round minted no EVM block. It is not `0`, and it is not a
  missing key. Do not default a missing key to `0`, because that number names a real
  block.
- A number means that this round minted that EVM block, empty blocks included. An EVM
  block with no transactions still gets a number and still appears here.
- The value is the own EVM block of this round, not the running EVM tip. Most rounds
  carry `null`. Only the round that closes an EVM period carries a number. It is always
  that block, never a later one.

:::warning
**Three traps on this record.**

1. `hash` carries `0x`. The `hash` on `node_fills` and `node_trades` does not. They
   are different fields with the same name. Do not use one parsing rule for both.
2. `tx_count: 0` is ambiguous. A truly empty block reads `0`. A payload that the node
   could not decode also reads `0`. This stream cannot tell the two apart. When the
   difference matters, cross-check against `replica_cmds`.
3. `evm_block_number: 0` never appears. The EVM numbers its blocks from 1, so a round
   with no EVM block reads `null`, never `0`. If you see `0`, your decoder defaulted a
   missing field. Fix the decoder, not the data.
:::

### Comparison with `replica_cmds` {#node_blocks-vs-replica-cmds}

Both streams write one line per committed block, including an empty one. That is not the
difference.

| Question | `node_blocks` | `replica_cmds` |
|----------|---------------|----------------|
| Who proposed it, at what round and epoch? | Yes | No. It carries none of the three |
| Transaction total, core actions and EVM transactions? | Yes, `tx_count` | No. `action_count` counts core actions only |
| State hash after the block? | No | Yes, `app_hash` |
| What the block did: fills, orders, positions, funding? | No. Head only | Yes, the full body |
| Hash form | `0x`-hex string | array of byte numbers |
| Path shape | `.../node_blocks/hourly/{date}/{hour}` | `.../replica_cmds/{date}/{hour}` |

Use `node_blocks` for a light block tape, present for every block, with the consensus
routing fields. Use `replica_cmds` to drive a full indexer from one file. But its
`action_count` undercounts a block that carried EVM transactions, so do not read it as a
transaction total.

## `replica_cmds` {#replica_cmds}

A single envelope per committed block. It carries the block header and the fills, order
events, position read-throughs and funding rates of that block. It is the densest stream.
Use it when you want one file to drive a full indexer.

Two things make it different from every `node_*` stream:

- Addresses and hashes are arrays of byte numbers, not hex strings.
- Prices and money are whole units, not the raw planes. Sizes are mixed. See the
  warning below.

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
| `block_hash` | array of 32 uint8 | Block hash, byte array. Not hex |
| `app_hash` | array of 32 uint8 | Application state hash, byte array. Not hex |

### `fills[]` {#replica_cmds-fills}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `fill_seq` | uint64 | index | Position within this block, from `0`. Not a global sequence |
| `market_id` | uint32 | id | Canonical asset id |
| `taker_addr` | array of 20 uint8 | — | Aggressor address |
| `maker_addr` | array of 20 uint8 | — | Resting counterparty address |
| `side` | uint8 | code | Taker side: `0` bid, `1` ask |
| `size` | decimal string | whole units | Executed size |
| `price` | decimal string | whole USDC | Execution price |
| `fee_bps` | uint32 | bps | Taker fee in whole basis points, truncated. When the fill has no perp settlement leg, it is the configured taker rate of the market |

### `order_events[]` {#replica_cmds-order-events}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `oid` | uint64 | id | Order id. `0` when `status` is `2` |
| `owner` | array of 20 uint8 | — | Order owner |
| `market_id` | uint32 | id | Canonical asset id |
| `side` | uint8 | code | `0` bid, `1` ask |
| `kind` | uint8 | code | Order kind. Always `0` (limit) today |
| `original_size` | decimal string | raw size | Request size in lots |
| `remaining_size` | decimal string | raw size | Unfilled size in lots |
| `limit_px` | decimal string \| null | whole USDC | Limit price |
| `status` | uint8 | code | `0` resting, `1` filled, `2` error |
| `created_ts_ms` | uint64 | ms | Equals the block timestamp |
| `updated_ts_ms` | uint64 | ms | Equals the block timestamp |

`created_ts_ms` and `updated_ts_ms` are always equal. The node records one transition per
block and carries no separate placement time.

### `position_deltas[]` {#replica_cmds-position-deltas}

One entry per distinct `(market, owner)` that filled in this block, read from the state
after the fill.

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `owner` | array of 20 uint8 | — | Position owner |
| `market_id` | uint32 | id | Canonical asset id |
| `size` | decimal string | whole units | Signed size, netted across the long and short legs |
| `entry_px` | decimal string | whole USDC | Absolute entry notional divided by absolute size. `"0"` when flat |
| `unrealized_pnl` | decimal string | — | Reserved. Always `"0"` |
| `updated_block_height` | uint64 | — | The height of this envelope |

In hedge mode, an account can hold a long leg and a short leg on one market. `size` is the
net of the two. It is not a figure for each leg.

### `funding_events[]` {#replica_cmds-funding-events}

One entry per market per block, not one per payment. The payments of each user are in
[`node_funding`](#node_funding).

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `market_id` | uint32 | id | Canonical asset id |
| `rate_num` | int64 | — | Rate numerator |
| `rate_denom` | string | — | Rate denominator, a power of ten as a decimal string |

The funding rate is `rate_num / rate_denom` per hour. The example above is `20 / 10000` =
`0.002`. The pair is exact, so compute it as a rational. Do not convert through a float.

:::warning
Sizes are mixed inside one envelope. `fills[].size` and `position_deltas[].size` are
whole units. `order_events[].original_size` and `order_events[].remaining_size` are
raw lots. Divide the order-event sizes by `10^sz_decimals`. Do not divide the fill and
position sizes.
:::

## `l4_book_diffs` {#l4_book_diffs}

Book changes for each order, with the owner of the resting order. Perp books only. The
node writes them to one append-only file, `<data_dir>/l4_book_diffs.jsonl`.

`kind` tags each line. A snapshot line lets a downstream book server bootstrap. Diff lines
then apply on top.

```json
{"kind":"snapshot","block_number":1234567,"block_time":1735689599852,"orders":[{"coin":0,"oid":366158130011,"side":"ask","px":"6250100000000","sz":"25000","owner":"0x8a1b2c3d4e5f60718293a4b5c6d7e8f901234567"}]}
{"kind":"diff","block_number":1234568,"block_time":1735689600852,"events":[{"coin":0,"oid":366158135200,"side":"bid","px":"6249900000000","sz":"50000","owner":"0x3f2a9c4b8d1e5f60718293a4b5c6d7e8f9012345"},{"coin":0,"oid":366158130011,"remove":true}]}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `kind` | string | — | `"snapshot"` or `"diff"` |
| `block_number` | uint64 | — | Committed block height. The LAST round this line covers |
| `from_block` | uint64 | — | The FIRST round this line covers. Equals `block_number` on an ordinary one-round commit |
| `block_time` | uint64 | ms | Consensus block timestamp of `block_number` |
| `orders` | array | — | Full resting set. Present on `"snapshot"` |
| `events` | array | — | Changed orders only. Present on `"diff"` |

One line can cover several rounds. `from_block` tells you how many. The node writes
these lines from committed state. A state-sync batch has already advanced that state to
the batch TIP. The intermediate states no longer exist, so the line is one aggregate and
not one line per round. An order that rested and was removed inside the batch never
appears at all.

A consumer that counts lines to count blocks is wrong on exactly the path that produces
large batches: a node that catches up. Advance your own height to `block_number`. Read
`block_number - from_block + 1` as the number of rounds folded into that line.

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
`(coin, side, price)` levels. There is no order id and no owner. Perp
books only. Written to `<data_dir>/l2_book_diffs.jsonl`.

```json
{"kind":"snapshot","block_number":1234567,"block_time":1735689599852,"levels":[{"coin":0,"side":"ask","px":"6250100000000","sz":"25000"}]}
{"kind":"diff","block_number":1234568,"block_time":1735689600852,"events":[{"coin":0,"side":"bid","px":"6249900000000","sz":"75000"},{"coin":0,"side":"ask","px":"6250100000000","remove":true}]}
```

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `kind` | string | — | `"snapshot"` or `"diff"` |
| `block_number` | uint64 | — | Committed block height. The LAST round this line covers |
| `from_block` | uint64 | — | The FIRST round this line covers. Equals `block_number` on an ordinary one-round commit |
| `block_time` | uint64 | ms | Consensus block timestamp of `block_number` |
| `levels` | array | — | Full level set. Present on `"snapshot"` |
| `events` | array | — | Changed levels only. Present on `"diff"` |

One level or event:

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `coin` | uint32 | id | Canonical asset id |
| `side` | string | — | `"bid"` or `"ask"` |
| `px` | i128 string | raw price | Level price |
| `sz` | u128 string | raw size | Total resting size at that level |
| `remove` | bool | — | Present and `true` when the level vanished. The level carries no `sz` |

A level event is an absolute set, not an increment. Replace the level's size with
`sz`; do not add to it.

## Consumer checklist {#consumer-checklist}

1. Walk `{YYYYMMDD}/{HH}` in lexical order. That is block order.
2. Test each line for `{"gap"` before you parse it as an envelope.
3. Accept only newline-terminated lines. Retry a fragment on the next pass.
4. Key your rows so a re-read inserts nothing new. Re-running over the same files
   must be a no-op. On `node_bridge_outbox` the key is `economic_id`, never
   `message_id`. On `node_actions` it is `(block_number, action_index)`.
5. Parse every price, size, and money value as an arbitrary-precision decimal.
   Never as a float.
6. Divide by the right plane. `node_*` prices need `/ 1e8`. `node_*` sizes need
   `/ 10^sz_decimals`. `replica_cmds` prices and fill sizes need neither.
7. Resolve `market` / `market_id` / `coin` against the market universe, except
   `node_ledger.coin`, which is a token id.
8. Convert `replica_cmds` byte arrays to hex yourself if you join them against
   `node_*` addresses.
