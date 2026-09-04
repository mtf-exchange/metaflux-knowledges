---
description: The per-block NDJSON streams a MetaFlux node writes to disk — enable flags, on-disk layout, per-record schemas, and the number plane every field uses.
---

# Node data streams

:::info
**Status.** **stable** shapes. Every stream is **off by default** and is enabled
one flag at a time. Most streams de-anonymize order flow or account value. A node
in the validator set logs a loud warning for those and records anyway. Only the
two book-diff streams are refused outright. Run the streams on a **non-validating
node**.
:::

## TL;DR {#tldr}

A MetaFlux node can write its committed blocks to disk as newline-delimited JSON
(NDJSON). One line is one **envelope**. One envelope holds one committed block.
Each envelope holds zero or more **records**.

The node does not serve these files. It only writes them. You read them with your
own indexer, archiver, or analytics job.

Thirteen streams exist. Nine carry block events. Two sample on a timer. Two carry
order-book state.

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
| [`node_blocks`](#node_blocks) | `<data_dir>/node_blocks/` | One block head per committed block, including an empty one |
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
| `node_gov` | `write_gov` | `false` |
| `node_bridge_outbox` | `write_bridge_outbox` | `false` |
| `node_equity_snapshots` | `write_equity_snapshots` | `false` |
| `node_asset_ctxs` | `write_asset_ctxs` | `false` |
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

Most streams de-anonymize order flow, account value, or a user withdrawal. A node
in the validator set that enables one publishes the flow of every account that
trades on it.

- **An enabled `write_*` stream always records.** A validator that sets one gets
  a loud start-up warning, never a silent refusal. There is no config override,
  because there is no gate to lift. Enable these on a validator only when the
  flow is your own.
  The warned set is `write_fills`, `write_trades`, `write_order_statuses`,
  `write_funding`, `write_ledger`, `write_equity_snapshots`,
  `write_bridge_outbox`, and `write_replica_cmds`.
- **Three streams carry nothing to de-anonymize** and raise no warning:
  `write_gov` names a validator, not a trader; `write_asset_ctxs` and
  `write_blocks` carry no address and no account value. `node_gov` is meant to
  run on a validator — that is where the votes happen.
- **`record_l4` and `record_l2` are refused on a validator**, with no override.
  They also walk the whole book once per block, which is work a validator must
  not do on the commit path.

The intended place to run a de-anonymizing stream is a **non-validating node**
that follows the chain and serves nobody. Point your indexer at that node.

### Snapshot-style streams sample a window {#sampling-windows}

Most streams are event tapes. They record what a block did. Two streams are
sample tapes. They record state at a point in time, so they sample instead of
writing every block.

| Stream | Window | Sampled block |
|--------|--------|---------------|
| `node_equity_snapshots` | One UTC hour of consensus block time (3,600,000 ms) | The first committed block of each window |
| `node_asset_ctxs` | 5,000 ms of consensus block time | The first committed block of each window |
| `l4_book_diffs` / `l2_book_diffs` | `persistence.snapshot_interval` blocks (default `1024`) | The block that closes the interval, plus one bootstrap snapshot on the first non-empty book |

`node_equity_snapshots` writes exactly one sample per hourly file. It does not
sample during start-up replay, because a replayed block would stamp current state
onto an old block time.

The book-diff streams write a diff line on every block whose book changed, and a
full snapshot line on the interval.

## On-disk layout {#on-disk-layout}

### Hourly files {#hourly-files}

Ten streams rotate hourly:

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
<data_dir>/node_blocks/hourly/{YYYYMMDD}/{HH}
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

`node_blocks` and `replica_cmds` each write one envelope for **every** committed
block, including an empty one, so their heights form a contiguous sequence
between gaps. Every other stream skips an empty block.

### Control files {#control-files}

Each stream root holds small node-internal files beside its date directories:

| File | Content |
|------|---------|
| `<stream root>/cursor` | Last recorded block number, as decimal text |
| `<data_dir>/node_equity_snapshots/snapshot_bucket` | Last sampled window index |
| `<data_dir>/node_asset_ctxs/snapshot_bucket` | Last sampled window index |

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
| `node_gov` | — | — | Whole stake units |
| `node_bridge_outbox` | — | — | Raw token base units |
| `node_equity_snapshots` | — | — | Whole USDC |
| `node_asset_ctxs` | Raw price | — | — |
| `node_blocks` | — | — | — |
| `replica_cmds` | Whole USDC | **Mixed** — see [`replica_cmds`](#replica_cmds) | Whole USDC |
| `l4_book_diffs` / `l2_book_diffs` | Raw price | Raw size | — |

Two number kinds sit outside the price / size / money split above.

- `node_gov` carries **stake** as a whole-integer string. It is a count of stake
  units. It is never divided.
- `node_bridge_outbox` carries a bridge **amount** as raw base units of the
  bridged token. Divide it by that token's own on-chain decimals, never by a
  market's `sz_decimals`. The two raw planes look alike and take different
  divisors.

Every price, size, and money value is a JSON **string**. Block numbers,
timestamps, order ids, trade ids, and enum codes are bare JSON numbers.

## `node_fills` {#node_fills}

One record per **filled party**. A single match produces two records: the taker
leg first, then the maker leg. Both legs of one match share the same `tid`.

A fill that no signed action produced — a forced close, a TWAP slice, a trigger
fire, a spot-margin forced close — is recorded on the block it executed in,
with an empty `hash`. No user signed it, so there is no hash to record.

**Some order lanes produce a fill this stream does NOT carry.** An order placed
by [`modify`](../api/rest/exchange.md#modify) or
[`batch_modify`](../api/rest/exchange.md#batch_modify), an order placed by
[CoreWriter `LimitOrder`](../evm/interacting-with-core.md), any order inside
a [`multi_sig`](../concepts/multi-sig.md) envelope, and every clearing of a
[frequent batch auction](../concepts/fba.md) each settle with no record —
see [unrecorded fills](../api/rest/info.md#unrecorded-fills). Both legs are
missing, so the maker loses its record as well. An archive folded from this
stream inherits the gap, and a volume total from it reads low.

> ⬆️ **Upgrade notice — not live yet.** Those four kinds of fill reach this
> stream from the next node release. Before it they stop at the node's
> committed fill ring, so the archive built from this stream has no row for
> them. The four attribution fields below (`liquidation`, `liquidatedUser`,
> `markPx`, `twapId`) therefore read as constants on the live chain, and carry
> real values from that release on.

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
| `tid` | uint64 | id | Print id. Identical on both legs of one match. **A NUMBER here, deliberately** — this tape is byte-pinned input for the archive and the indexer, not a public API, so it keeps the numeric form the REST and WS surfaces gave up. It exceeds 2⁵³: parse it with a 64-bit reader |
| `crossed` | bool | — | `true` on the taker leg, `false` on the maker leg |
| `ts` | uint64 | ms | Fill timestamp. Equals `block_time` |
| `hash` | string | — | Trace hash of the originating taker action: lowercase hex, **no** `0x`. Empty string on the maker leg, and empty for system-injected actions |
| `fee` | decimal string \| absent | whole USDC | Fee this party paid. Negative means a rebate |
| `feeToken` | string \| absent | — | Fee asset. `"USDC"` today |
| `closedPnl` | decimal string \| absent | whole USDC | Realized PnL on the closed part. `"0"` on a pure open |
| `startPosition` | i128 string \| absent | **raw size** | Signed leg size **before** this fill |
| `dir` | string \| absent | — | One of `"Open Long"`, `"Close Long"`, `"Open Short"`, `"Close Short"`, `"Long > Short"`, `"Short > Long"` |
| `builderFee` | decimal string | whole USDC | Broker carve charged on this fill. **Taker leg only** — the maker did not route the order, so its leg reads `"0"`, as does any fill no broker routed |
| `liquidation` | bool | — | `true` on **both** legs of a forced-close print, else `false`. The absorbing maker learns it took a liquidation; that is the point of flagging both legs |
| `feeTrialEscrow` | decimal string | — | Reserved. Always `"0"` |
| `builder` | string \| null | — | Broker address that routed the order, `0x`-hex. **Taker leg only**, `null` otherwise |
| `twapId` | uint64 \| null | id | Parent TWAP order of a slice. **Taker leg only**, `null` otherwise |
| `deployerFee` | decimal string | — | Reserved. Always `"0"` |
| `liquidatedUser` | string \| null | — | The account whose position was closed, `0x`-hex. Present on **both** legs of a forced-close print, `null` otherwise |
| `markPx` | decimal string | **whole USDC** | The mark the liquidation ladder priced from when it classified the leg — not the fill price, and not a later mark. Present with `liquidatedUser`, else `"0"` |

:::warning
**Three traps on one record.**

1. `fee`, `closedPnl`, `builderFee` and `markPx` are **whole USDC**. `px` and
   `startPosition` on the same record are **raw**. Divide `px` by `10^8` and
   `startPosition` by `10^sz_decimals`; divide neither of the other four.
   `markPx` is the trap inside the trap: it sits beside `px` and takes no
   divisor.
2. The six settlement fields (`fee`, `feeToken`, `closedPnl`, `startPosition`,
   `dir`) are **absent** on a fill with no perp settlement leg, such as a spot
   fill. Treat absent as "no settlement data", not as zero.
3. Two fields are reserved and carry constants: `feeTrialEscrow` and
   `deployerFee`. Do not read them as data. The other six in that group are
   real — read the rows above and the upgrade notice.
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

**This tape carries no [unrecorded fill](../api/rest/info.md#unrecorded-fills)**
— no print from a `modify`, from a CoreWriter `LimitOrder`, from inside a
`multi_sig` envelope, or from a
[frequent batch auction](../concepts/fba.md) clearing. A volume total built
from this tape reads low by them.

> ⬆️ **Upgrade notice — not live yet.** From the next node release this tape
> also carries the prints no signed action produced — a forced close, a TWAP
> slice, a trigger fire, a spot-margin forced close. Each one carries an empty
> `hash`. Before that release those prints are missing from the tape, so a
> volume total built from it reads low.

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
| `oid` | uint64 | id | Order id. **`0` on an `error` or `noop` record** — the order never got an id |
| `cloid` | string \| absent | — | Client order id, `0x` plus 32 hex digits. **Absent on a maker execution record even when the order carried one** |
| `status` | string | — | Exactly one of `"resting"`, `"filled"`, `"error"`, `"noop"`. One `filled` record per (block, maker `oid`) — see [maker execution records](#maker-execution-records) |
| `side` | string | — | `"B"` buy, `"A"` sell |
| `limit_px` | i128 string | raw price | Limit price of the order. Always present |
| `sz` | u128 string | raw size | On `filled`, the **filled** size. On `resting`, `error` and `noop`, the request size |
| `orig_sz` | u128 string | raw size | Request size at placement. **`"0"` on a maker execution record** |
| `tif` | string \| absent | — | Time in force: `"Gtc"`, `"Ioc"`, `"Alo"`. **Absent on a maker execution record** |
| `reduce_only` | bool | — | Reduce-only flag of the order. **`false` on a maker execution record, whatever the order carried** |
| `avg_px` | i128 string \| absent | raw price | Average fill price. Present on `filled` only |
| `total_sz` | u128 string \| absent | raw size | Total filled size. Present on `filled` only |
| `error` | string \| absent | — | Rejection reason. Present on `error` only |
| `reason` | string \| absent | — | Why the order had no effect. Present on `noop` only |
| `ts` | uint64 | ms | Transition timestamp. Equals `block_time` |

:::warning
**`sz` changes meaning with `status`.** On a partially filled order, `sz` is the
filled part and `orig_sz` is the request. Use `orig_sz` when you want the size
the trader asked for.
:::

> ⬆️ **Upgrade notice — `noop` is not live yet.** It ships with the next node
> release. A `noop` record says the order was ACCEPTED and changed nothing — a
> `reduce_only` order with nothing left to reduce. Do not count it as a
> rejection: on the live chain today the same order writes an `error` record,
> so a fill-rate or rejection-rate query over old files counts it on the wrong
> side.

### Maker execution records {#maker-execution-records}

> ⬆️ **Upgrade notice — not live yet.** Maker execution records ship with the
> next node release. On the live chain a maker order that filled emits no
> record at all, so it reads `resting` forever.

Every record above comes from an order the account **submitted**. A resting
order that is HIT submits nothing in that block, so the node derives its record
from the block's fills instead. That record is a maker execution record.
**Except when the fill is an
[unrecorded fill](../api/rest/info.md#unrecorded-fills)**: a `modify`, a
CoreWriter `LimitOrder`, a `multi_sig` envelope and a batch-auction clearing
each match against a resting order and derive nothing for it.

**A fill describes the fill, not the order.** `tif` and `cloid` are absent,
`reduce_only` is `false` and `orig_sz` is `"0"`, whatever the order carried.
Join to that order's own `resting` record on the same `oid` for the real
values.

**A `resting` record exists only for an order that a signed `order`,
`batch_order`, `scale_order`, `spot_order` or `chase_order` placed**, so for two
groups of order the join has no target.

The first group is the two the node rests by itself: a
chase leg after a reprice — a reprice cancels the leg and rests a new `oid` —
and a TP/SL trigger leg that fired as a limit order. A chase's FIRST leg is not
in this group: `chase_order` is a signed action and its opening leg does get a
`resting` record. Only the legs a reprice rests are missing one. **`orig_sz` and
`reduce_only` are not recoverable for these two orders.** The live-book read
([`open_orders`](../api/rest/info.md#open_orders)) serves `null` for `orig_sz`,
and no action ever submitted a request size for the leg. `reduce_only` on that
read is a constant `false` on every book row, so it repeats the same wrong
value. `tif` and `cloid` ARE real there: take them while the order still rests.
Afterwards use the order kind: a chase leg is always `"Alo"` and never
reduce-only; a fired trigger leg is always `"Gtc"` and always reduce-only, so
`reduce_only: false` is wrong on exactly that record.

The second group is any order that an
[unrecorded-fill lane](../api/rest/info.md#unrecorded-fills) rested. A `modify`,
a CoreWriter `LimitOrder` and a `multi_sig` envelope each rest an order with no
`resting` record. That order is an ordinary resting order after that, so an
ordinary taker DOES give it a maker execution record later — and that record has
nothing to join to. All four fields stay missing for its whole life.

**Some order lanes produce no maker execution record, because they produce no
record at all.** An order inside a `multi_sig` envelope, an order placed by
`modify` or `batch_modify`, an order placed by CoreWriter `LimitOrder`, and a
[frequent batch auction](../concepts/fba.md) clearing each write nothing to
these streams: no `node_fills` print, no `node_trades` print, no status record
of their own, and no maker execution record for the resting order they hit. The chain still matches the order and moves the money — see
[unrecorded fills](../api/rest/info.md#unrecorded-fills). So a resting order
with no `filled` record was not necessarily left alone.

The node sums every match against one `oid` inside one block into ONE record.
So `sz` and `total_sz` are the size executed **in that block**, not the lifetime
total, and `avg_px` equals `limit_px`: a resting order executes at its own
price. A maker hit in three blocks gets three records, and the order can still
rest after all three.

A forced close, a TWAP slice and a trigger order produce these records too.
None of them sends an action, and the maker each one hits still needs its
record.

The REST read built from this stream serves an absent key as `null` — see
[`historical_orders`](../api/rest/info.md#historical_orders). Absent here and
`null` there are the same record.

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
      "ts": 1735689600202
    }]
  ]
}
```

No `tif` key, no `cloid` key, no `error` key.

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

## `node_gov` {#node_gov}

One record per governance vote cast, plus one record per enactment. This is the
only durable record of who voted and what an enactment changed. The live tally is
transient: a quorum drains it and a timeout prunes it.

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
      "action": "setDynamicRiskParam",
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
      "action": "setDynamicRiskParam",
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
| `events` | array | Casts and enactments in **emission order** |

Casts and enactments share one list, so their relative order inside a block is
preserved. That order is the per-block discriminator. Do not sort `events`.

Each event is one of two shapes. Read `type` to tell them apart.

### `vote_cast` {#node_gov-vote-cast}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `round` | uint64 | id | Synthetic vote round this cast belongs to |
| `category` | string | — | The round's vote family: `"dynamic_risk"`, `"vote_global"`, `"mb_configure_chain"`, `"oracle_weights"`, `"circle_promotion_attest"`, `"option_listing"`, `"option_auto_list"`, `"spot_margin_params"`, or `"proposal"` |
| `sub_id` | uint64 | — | Offset of `round` inside its category band. Under `"proposal"` it **equals `round`** |
| `action` | string | — | Wire action name the vote targets, such as `"setDynamicRiskParam"` |
| `asset` | uint32 \| absent | id | Market asset id the vote targets. Absent on a chain-global vote |
| `coin` | string \| absent | — | Market symbol for `asset`. Absent when the vote is global, or the market carries no listing spec |
| `validator` | string | — | Casting validator's `0x` address, lowercase, 20 bytes |
| `stake` | decimal string | whole stake units | **This validator's own** weight at the cast |
| `total_stake` | decimal string | whole stake units | Quorum denominator: total active, non-excluded stake at the cast |
| `quorum_met` | bool | — | `true` when this cast carried the payload to two thirds of `total_stake` |
| `payload` | string | — | Raw vote bytes, `0x`-hex, undecoded. Two validators agree when these bytes are identical. Decode it per `action` |
| `time` | uint64 | ms | Cast timestamp. Equals `block_time` |

### `vote_enacted` {#node_gov-vote-enacted}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `round` | uint64 | id | The round that reached quorum |
| `action` | string | — | Wire action name |
| `asset` | uint32 \| absent | id | Market asset id. Absent on a chain-global change |
| `coin` | string \| absent | — | Market symbol for `asset` |
| `changes` | array | — | The fields the enactment moved, in a fixed order |
| `agreeing_stake` | decimal string | whole stake units | Weight that agreed on the enacted payload |
| `total_stake` | decimal string | whole stake units | Quorum denominator at enactment |
| `time` | uint64 | ms | Enactment timestamp. Equals `block_time` |

One entry of `changes`:

| Field | Type | Meaning |
|-------|------|---------|
| `field` | string | Name of the parameter the enactment moved |
| `prior` | string \| null | The **effective** value just before the write, resolved through the same ladder a read uses |
| `new` | string | Value after the write |

Values in `changes` stay strings. One enactment can move several fields of one
struct, and those fields are not one numeric type.

:::warning
**Five traps on this stream.**

1. **Every cast is recorded, quorum or not.** A vote short of quorum ages out of
   the live tally, but its `vote_cast` records stay in the archive. There is no
   "rejected" record: this governance model has a stake threshold and a timeout,
   no reject vote. The only sign a vote never passed is the absence of a
   `vote_enacted` on the same `round`.
2. **`stake` is the caster's own weight, not a running total.** Use
   `total_stake` as the denominator, and `agreeing_stake` on `vote_enacted` as
   the numerator.
3. **`agreeing_stake` and `total_stake` on `vote_enacted` can read `"0"`.** They
   are joined from the quorum-carrying `vote_cast` in the **same block**. An
   enactment that fires from another trigger has no such cast in its block, so
   both read `"0"`. Look up the earlier `vote_cast` with `quorum_met: true` on
   the same `round`.
4. **`sub_id` changes meaning with `category`.** In a named category it is an
   offset inside that category's round band. Under `"proposal"` the round is the
   proposal id itself, and `sub_id` repeats it.
5. **`prior: null` does not mean "first ever value".** It means the read path
   could not resolve an effective prior at all. Never read `null` as zero, and
   never as "previously unset".
:::

A `quorum_met: true` cast does not guarantee a `vote_enacted` follows. The node
emits the enactment only after the state write it describes succeeds. Join on
`round`; do not assume a match exists.

## `node_bridge_outbox` {#node_bridge_outbox}

The bridge withdrawal outbox, as one envelope per block that moved it. The node
diffs the committed outbox against the last envelope it wrote, and writes nothing
when nothing moved.

An entry's `status` is the same value, from the same derivation, that the bridge
`/info` reads serve. This stream copies it. It never recomputes it.

Four record kinds, told apart by `type`:

| `type` | When it appears |
|--------|-----------------|
| `admission` | The recorder's first sight of this `economic_id`. The only kind that carries `msg` |
| `transition` | The derived half moved: co-signature count, status, or release time |
| `rebind` | A deployment change re-derived this entry. Emitted for **every** open entry on that block |
| `removed` | The entry left the outbox, through release or the retention prune. Terminal |

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
| `configs` | array \| absent | The **full** current per-chain deployment set. Present only on a block where it differs from the last envelope |
| `withdrawals_halted` | bool \| absent | Chain-wide refusal of new withdrawals. Present on exactly the blocks `configs` is |

:::warning
**`configs` and `withdrawals_halted` mean "replace the stored set", not "a
rotation happened".** They ride any block whose committed rows differ from the
last emitted view. That includes the **first envelope after a restart**, because
the node's memory of the rows starts empty. Reading their presence as a rotation
marker gives a false rotation on every restart. Compare the rows to decide.
:::

### One event {#node_bridge_outbox-event}

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `type` | string | — | `"admission"`, `"transition"`, `"rebind"`, or `"removed"` |
| `economic_id` | string | — | `0x`-hex, 32 bytes. **The upsert key.** Rotation-invariant: it names the same withdrawal before and after a rotation |
| `message_id` | string | — | `0x`-hex, 32 bytes. The **current** signing digest. It moves on a rotation |
| `status` | string | — | `"awaiting_cosignatures"`, `"ready_to_release"`, `"stranded_on_retired_domain"`, or `"released"`. Derived by the node |
| `pending_cosigner_count` | uint | — | Co-signatures held against `message_id` that are **short of quorum**. `0` once quorum is reached |
| `released_at_ms` | uint64 \| null | ms | Consensus timestamp of the release. `null` until the entry is released |
| `msg` | object \| absent | — | The immutable half of the withdrawal. Present on `"admission"` only |

`msg`:

| Field | Type | Units | Meaning |
|-------|------|-------|---------|
| `chain` | uint8 | id | Destination chain: `1` Base, `2` Arbitrum |
| `user` | string | — | The account that opened the withdrawal, `0x`-hex, 20 bytes |
| `asset` | uint32 | id | **Token asset id**, the same id space as `node_ledger.coin`. Not a market id |
| `token` | string | — | Symbol for `asset`, resolved once at admission. A later rename does not rewrite it |
| `amount_units` | u128 string | **raw token base units** | Divide by the token's own on-chain decimals. Do **not** divide by `sz_decimals` |
| `dst_addr` | string | — | Destination address on `chain`, `0x`-hex, 32 bytes, left-padded |
| `nonce` | uint64 | — | Per-chain anti-replay nonce |
| `ts_ms` | uint64 | ms | When the withdrawal entered the outbox |

:::warning
**Four rules a consumer gets wrong.**

1. **`economic_id` is the upsert key. `message_id` is not.** The message id is
   the signing digest under the live deployment row, so a rotation moves it. Fold
   on the message id and one withdrawal counts twice across a rotation.
2. **`admission` is not "first ever".** The recorder's memory of the outbox is
   node-local and is never persisted, so a **restart re-emits every open entry as
   an admission**, at whatever status it holds right then. Always UPSERT on
   `economic_id`. Never read an admission as an arrival.
3. **`removed` is terminal, and its `status` is not always `"released"`.** It
   reads `"released"` when the release is confirmed. Otherwise it carries the
   entry's last known status, because the entry left through the retention prune.
   Either way the `economic_id` never returns.
4. **`status` is derived. Do not recompute it.** It folds the live deployment row
   through the node's own derivation.
   `"stranded_on_retired_domain"` is reachable only from that side: a consumer
   that recomputes status from `configs` and co-signature counts never sees a
   stranded entry.
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
| `release_retention_ms` | uint64 | Configured retention window. `0` is the **unset sentinel**, not "no retention" |
| `effective_release_retention_ms` | uint64 | The window actually in force. Read this one |
| `scan_policy` | object | Deposit-scan settings, below |

`scan_policy`:

| Field | Type | Meaning |
|-------|------|---------|
| `confirmations_only` | bool | Credit on confirmations alone |
| `confirmations` | uint64 | Configured confirmation depth. `0` is the **unset sentinel** |
| `effective_confirmations` | uint64 | The depth actually in force. Read this one |
| `confirmations_only_depth` | uint64 | Depth used when `confirmations_only` is set |
| `usdc_token` | string | USDC token address on that chain, `0x`-hex, 20 bytes |
| `raw_transfer_credit` | bool | `true` when a plain token transfer to the contract is credited |

The raw and `effective_*` pairs both ship because `release_retention_ms` and
`confirmations` are 0-as-unset sentinels. A raw `0` alone tells you nothing about
the window in force.

### Deriving the rotation verdict {#node_bridge_outbox-rotation}

A deployment rotation **strands** every entry that is `"ready_to_release"` when
it fires. Those entries already hold a release-ready co-signature quorum under
the domain the rotation retires. The outbound replay guard keys on the economic
id, so re-finalization under the new domain is suppressed and no releasable
multisig can ever appear again. The funds are debited and unreleasable.

The verdict is therefore a fold of this stream: **upsert every event on
`economic_id`, drop the entries whose last event is `removed`, then count the
survivors whose `status` is `ready_to_release`.** A rotation is safe only when
that count is zero.

### Positive control {#node_bridge_outbox-positive-control}

A fold over the wrong path returns zero, and zero reads exactly like the
all-clear. Check the reading before you trust it.

| What you observe | What it means |
|------------------|---------------|
| The stream root or its hourly files do not exist | The stream was never enabled here, or the data directory is wrong. **Not** "no withdrawals" |
| The stream root exists but holds no `cursor` file | No block has been recorded since the stream was turned on. **Not** "no withdrawals" |
| `cursor` is far behind the chain's committed height | The view is stale and incomplete. A zero count here proves nothing |
| The fold finds **no entries at all**, ever | Suspect the path. A live chain that has served any withdrawal has admissions in the archive |
| `cursor` is at the committed height, entries exist, and none reads `ready_to_release` | The real all-clear |

The control is the fourth row. Confirm your fold sees entries in some state
before you trust it seeing none in one state.

### What this stream answers {#node_bridge_outbox-scope}

It answers: does any withdrawal sit at `ready_to_release` right now, is any
withdrawal stranded, how old is the oldest pending entry, and what deployment row
is committed per chain.

It does not carry inbound deposits, which are a separate flow. It reports a
**count** of co-signatures, never which validators signed. A `released` entry
means the chain released it; confirming the payout landed needs a read of the
destination chain, not this stream.

:::warning
**The diff runs on the tip block only.** The resume cursor advances through every
block, so a catch-up replay reports no hole — but the node compares state only on
the block that owns it. A withdrawal that moved through several statuses entirely
inside a replayed range surfaces as one `admission` at the status it holds when
the node catches up. The intermediate moves are not recorded. This happens across
a restart, never in normal live operation.
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

Both prices are also **snapped to the market's tick** before the node records
them, on the same grid `/info` serves. Sub-tick precision never reaches the
archive. A later tick-size change does not re-grid the samples already written,
so an old sample keeps the grid it was recorded on.

Use this stream to build mark and oracle candles. The 5-second cadence gives the
smallest (1-minute) candle twelve samples. It is a price series, not a trade
series: a bar exists in every window the samples cover, whether or not anything
traded.

## `node_blocks` {#node_blocks}

One line per committed block, carrying the block head only. This is the one
stream that writes on an **empty** block, so its heights form a contiguous
sequence between gaps. Use it to rebuild a block tape that has a row for a block
which carried no action.

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
| `round` | uint64 | — | Consensus round of this block. It equals `block_number` under the current two-chain rule, and ships apart because both are on the wire |
| `epoch` | uint64 | — | Consensus epoch of `round` |
| `proposer` | uint64 | index | **Validator-set index** of the leader that proposed this block. Not an address |
| `hash` | string | — | Block hash, lowercase hex **with** the `0x` prefix. The same value the `block_info` read serves |
| `tx_count` | uint64 | — | Core actions plus EVM transactions in the block payload |
| `evm_block_number` | uint64 or `null` | — | The EVM block this Core round minted, or `null` if it minted none |

**`evm_block_number` is the join between a Core round and an EVM block.** The
EVM mints a block only when its own period elapses, so the ratio to Core rounds
is not fixed — it moves with the chain's cadence. Read it this way:

- **`null` means this round minted no EVM block.** It is not `0` and it is not
  a missing key. Do not default a missing key to `0`; that number names a real
  block.
- **A number means this round minted that EVM block, empty blocks included.**
  An EVM block with no transactions still gets a number and still appears
  here.
- **The value is this round's own EVM block, not the running EVM tip.** Most
  rounds carry `null`; only the round that closes an EVM period carries a
  number, and it is always that block, never a later one.

:::warning
**Three traps on this record.**

1. **`hash` carries `0x`. The `hash` on `node_fills` and `node_trades` does
   not.** They are different fields with the same name. Do not carry one parsing
   rule across.
2. **`tx_count: 0` is ambiguous.** A genuinely empty block reads `0`. A payload
   the node could not decode also reads `0`. This stream cannot tell the two
   apart. Cross-check against `replica_cmds` when the difference matters.
3. **`evm_block_number: 0` never appears.** The EVM numbers its blocks from 1,
   so a round with no EVM block reads `null`, never `0`. If you see `0`, your
   decoder defaulted a missing field — fix the decoder, not the data.
:::

### `node_blocks` against `replica_cmds` {#node_blocks-vs-replica-cmds}

Both write one line per committed block, including an empty one. That is not the
difference.

| Question | `node_blocks` | `replica_cmds` |
|----------|---------------|----------------|
| Who proposed it, at what round and epoch? | Yes | No — it carries none of the three |
| Transaction total, core actions **and** EVM transactions? | Yes, `tx_count` | No — `action_count` counts core actions only |
| State hash after the block? | No | Yes, `app_hash` |
| What the block did: fills, orders, positions, funding? | No — head only | Yes, the full body |
| Hash form | `0x`-hex string | array of byte numbers |
| Path shape | `.../node_blocks/hourly/{date}/{hour}` | `.../replica_cmds/{date}/{hour}` |

Take `node_blocks` for a light, always-present block tape with the consensus
routing fields. Take `replica_cmds` to drive a full indexer from one file — but
its `action_count` undercounts a block that carried EVM transactions, so do not
read it as a transaction total.

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
   must be a no-op. On `node_bridge_outbox` the key is `economic_id`, never
   `message_id`.
5. Parse every price, size, and money value as an arbitrary-precision decimal.
   Never as a float.
6. Divide by the right plane. `node_*` prices need `/ 1e8`. `node_*` sizes need
   `/ 10^sz_decimals`. `replica_cmds` prices and fill sizes need neither.
7. Resolve `market` / `market_id` / `coin` against the market universe, except
   `node_ledger.coin`, which is a token id.
8. Convert `replica_cmds` byte arrays to hex yourself if you join them against
   `node_*` addresses.
