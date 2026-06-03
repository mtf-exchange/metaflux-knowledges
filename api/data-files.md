---
description: Node-side per-block data streams (HL-parity) — fills, trades, order statuses, raw L4 book diffs. The feedstock for downstream indexers.
icon: file-lines
---

# Node data files

{% hint style="warning" %}
**Status.** `l4_book_diffs.jsonl` (raw L4 book diffs) is **live** today. The hourly-rotated `node_fills` / `node_trades` / `node_order_statuses` streams are 🚧 **in progress** — the schema is pinned here so the downstream indexer and SDK consumers can build against a stable contract while the writers land.
{% endhint %}

## TL;DR

A MetaFlux node can be started with data-stream recording on. For every committed block it appends **newline-delimited JSON** (NDJSON) records describing what happened — the fills it produced, the trades that printed, the lifecycle transitions of resting orders, and the per-order changes to the de-anonymized book. These files are the raw feedstock a **downstream indexer** consumes to serve historical REST (`userFillsByTime`, `candleSnapshot`, `fetchTrades`, `fetchOHLCV`, …) — none of which the node serves directly, because committed state keeps no itemized history (see [`/info`](rest/info.md) — `recent_trades` / `user_fills` are honest-empty on the bare node).

This mirrors Hyperliquid's node flags (`--write-fills` / `--write-trades` / `--write-order-statuses` / `--write-raw-book-diffs`) and its hourly-rotated NDJSON layout, with MTF-native field shapes (decimal-string magnitudes, `u32` market ids, `0x` hex addresses).

## Who runs this

Recording is meant for a **dedicated non-validating node** (an "observer" / recorder), NOT a validator:

- The de-anonymized book walk and per-block string serialization stay off the validator commit path.
- L4 recording is **refused on a validator** — a node configured with `record_l4 = true` whose `node.id` is in the validator set logs a warning and does not record. Run it on a node whose `node.id` is not in `[[consensus.validators]]` (observer mode).

The streams are append-only and flushed (not `fsync`'d) per block, so a tailing consumer sees records promptly. Durability is the consumer's concern; the recorder optimizes for freshness.

## Config

In the node's TOML, under `[persistence]`:

```toml
[node]
data_dir = "/var/lib/mtf"        # all streams land under here

[persistence]
record_l4 = true                 # LIVE — enables l4_book_diffs.jsonl
# write_fills          = true    # 🚧 hourly node_fills
# write_trades         = true    # 🚧 hourly node_trades
# write_order_statuses = true    # 🚧 hourly node_order_statuses
```

| Flag | Default | Stream | Status |
|------|---------|--------|--------|
| `record_l4` | `false` | `l4_book_diffs.jsonl` | **live** |
| `write_fills` | `false` | `node_fills/hourly/{date}/{hour}` | 🚧 in progress |
| `write_trades` | `false` | `node_trades/hourly/{date}/{hour}` | 🚧 in progress |
| `write_order_statuses` | `false` | `node_order_statuses/hourly/{date}/{hour}` | 🚧 in progress |

All are independent — enable any subset.

## Paths & rotation

```
<data_dir>/
├── l4_book_diffs.jsonl                       # single append-only file (live)
├── node_fills/hourly/{date}/{hour}           # 🚧 e.g. node_fills/hourly/2026-05-31/14
├── node_trades/hourly/{date}/{hour}          # 🚧
└── node_order_statuses/hourly/{date}/{hour}  # 🚧
```

- The hourly streams rotate by **block time** (consensus-derived, not wall clock — see [determinism note](#determinism)). `{date}` is `YYYY-MM-DD`, `{hour}` is `00`..`23` of the block timestamp's UTC hour.
- A new file opens on the first block whose timestamp falls in a new hour. Within a file, records are ordered by ascending block number, then by event order within the block.
- `l4_book_diffs.jsonl` is a single file (it already carries periodic full snapshots, so an indexer can bootstrap from any point — no hourly partitioning needed).

---

## `node_fills` — per-fill records 🚧

One record per committed block; `events` is a list of `[address, fill]` pairs (HL's `node_fills_by_block` envelope). A fill is emitted once per filled party (taker and each maker each get a record).

```json
{
  "block_number": 941006631,
  "block_time": 1735689599852,
  "events": [
    ["0x<user>", {
      "market": 0,
      "px": "100.55",
      "sz": "0.5",
      "side": "B",
      "oid": 366158135200,
      "cloid": "0x19d40a3b...",
      "tid": 1086003134703173,
      "fee": "0.0251",
      "fee_token": "USDC",
      "closed_pnl": "0.3135",
      "start_position": "-80.25",
      "dir": "Close Short",
      "crossed": true,
      "ts": 1735689599852
    }]
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `block_number` | u64 | Committed block height |
| `block_time` | u64 ms | Block timestamp (consensus-derived) |
| `market` | u32 | Canonical asset id (MTF-native; not an HL coin string) |
| `px` | decimal string | Fill price |
| `sz` | decimal string | Fill size (always positive) |
| `side` | `"B"` \| `"A"` | Aggressor-relative side of THIS party — `B`=buy, `A`=sell (HL convention) |
| `oid` | u64 | Order id of this party's order |
| `cloid` | `0x` hex \| omitted | Client order id, if the order carried one |
| `tid` | u64 | Trade id — unique per (taker, maker) match; shared across the two fill records of one print |
| `fee` | decimal string | Fee paid (negative = rebate, maker) |
| `fee_token` | string | Fee asset, `"USDC"` for perps |
| `closed_pnl` | decimal string | Realized PnL on the closed portion (0 for purely opening fills) |
| `start_position` | decimal string | Signed position size BEFORE this fill |
| `dir` | string | One of HL's six: `"Open Long"`, `"Open Short"`, `"Close Long"`, `"Close Short"`, `"Long > Short"`, `"Short > Long"` |
| `crossed` | bool | `true` if this party was the taker (crossed the spread) |
| `ts` | u64 ms | Fill timestamp (== `block_time`) |

{% hint style="info" %}
**vs HL's 18-field fill hash.** HL's consensus *fill-hash* payload has 18 fields (incl. `builderFee`, `liquidation`, `twapId`, `markPx`, `liquidatedUser`, …) — see the [protocol study](#references). The data-stream record is the operator-facing subset above. Liquidation / builder / TWAP fields are added to the record as the corresponding action surfaces land on the node ([`/exchange`](rest/exchange.md) action catalog). MTF designs its own field order — there is **no** mainnet-RespHash parity attempt.
{% endhint %}

## `node_order_statuses` — order lifecycle 🚧

One record per order status transition. Mirrors HL's `--write-order-statuses`; `status` follows HL's `OrderStatus` 5-variant vocabulary.

```json
{
  "block_number": 941006640,
  "block_time": 1735689600102,
  "events": [
    ["0x<user>", {
      "market": 0,
      "oid": 366158135210,
      "cloid": "0x...",
      "status": "filled",
      "side": "B",
      "limit_px": "100.50",
      "sz": "1.0",
      "orig_sz": "1.0",
      "tif": "Gtc",
      "reduce_only": false,
      "avg_px": "100.48",
      "total_sz": "1.0",
      "ts": 1735689600102
    }]
  ]
}
```

| `status` | Meaning | Extra fields |
|----------|---------|--------------|
| `resting` | Posted to book | — |
| `filled` | Fully filled | `avg_px`, `total_sz` |
| `waitingForFill` | Trigger order armed, awaiting fill | — |
| `waitingForTrigger` | Trigger order armed, awaiting trigger px | — |
| `canceled` | Removed (user cancel / IOC remainder / expiry / liquidation) | `cancel_reason` |
| `error` | Rejected at admission | `error` (string) |

Base fields (`market`, `oid`, `cloid`, `side`, `limit_px`, `sz`, `orig_sz`, `tif`, `reduce_only`, `ts`) appear on every record. The terminal-state stream is what the indexer joins to serve `historicalOrders` ([HL-compat](rest/hl-compat.md)) / `fetchClosedOrders` ([CCXT](rest/ccxt-compat.md)).

## `node_trades` — public trade tape 🚧

One record per print (NOT per party — a single trade, not two fills). This is the de-anonymized public tape; it feeds the WS [`trades`](ws/subscriptions.md) channel's history and CCXT [`fetchTrades`](rest/ccxt-compat.md).

```json
{
  "block_number": 941006631,
  "block_time": 1735689599852,
  "trades": [
    {
      "market": 0,
      "px": "100.55",
      "sz": "0.5",
      "side": "B",
      "tid": 1086003134703173,
      "taker_oid": 366158135200,
      "maker_oid": 366158130011,
      "ts": 1735689599852
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `market` | u32 | Canonical asset id |
| `px` / `sz` | decimal string | Print price / size |
| `side` | `"B"` \| `"A"` | Aggressor side (taker's direction) |
| `tid` | u64 | Trade id (matches the `tid` on both `node_fills` records of this print) |
| `taker_oid` / `maker_oid` | u64 | The two order ids that crossed |
| `ts` | u64 ms | Print timestamp |

---

## `l4_book_diffs.jsonl` — raw L4 book diffs (live)

The one stream **implemented today**. Mirrors HL's `--write-raw-book-diffs`: per committed block, emit the per-order CHANGES to the de-anonymized resting book (added / resized / removed), plus a full **snapshot** every `snapshot_interval` blocks (and on the first non-empty book) so a downstream L4 order-book server can bootstrap, then apply diffs. It is consumed by the [L4 book server](#references) (a separate GPL-3.0 repo with zero node-code dependency).

Two record kinds share the file, discriminated by `kind`:

**Snapshot** — full resting set:

```json
{ "kind": "snapshot", "block_number": 941006631, "block_time": 1735689599852,
  "orders": [
    { "coin": 0, "oid": 366158135200, "side": "bid", "px": "100500", "sz": "150", "owner": "0xaaaa…" }
  ] }
```

**Diff** — only the orders that changed since the last emission:

```json
{ "kind": "diff", "block_number": 941006632, "block_time": 1735689600102,
  "events": [
    { "coin": 0, "oid": 366158135201, "side": "ask", "px": "100600", "sz": "80", "owner": "0xbbbb…" },
    { "coin": 0, "oid": 366158135200, "remove": true }
  ] }
```

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `"snapshot"` \| `"diff"` | Record discriminator |
| `block_number` | u64 | Committed height |
| `block_time` | u64 ms | Block timestamp |
| `coin` | u32 | Canonical asset id |
| `oid` | u64 | Resting order id |
| `side` | `"bid"` \| `"ask"` | Book side |
| `px` / `sz` | string | Resting price / remaining size, raw fixed-point integers as strings |
| `owner` | `0x` hex | De-anonymized resting-order owner |
| `remove` | bool | On a diff event, `true` deletes the order; absent/`false` is an upsert |

Notes:
- `px` / `sz` are **raw fixed-point integers** rendered as strings (e.g. `"100500"`), not human decimals — this stream is for a low-level book server that owns the scaling, unlike the human-decimal `node_fills`/`node_trades` streams.
- The diff base holds the previous block's resting set in raw form: an unchanged order is a cheap value compare and is never re-stringified. Per-block alloc cost is O(activity), not O(book).
- The schema is additive: the consumer ignores unknown fields, so new fields can be added without breaking it.
- `snapshot_interval` reuses the `[persistence].snapshot_interval` value (default per RFC-009); first non-empty book always emits a bootstrap snapshot.

---

## Determinism

All timestamps (`block_time`, `ts`) are **consensus-derived** block time, not `SystemTime` — so two recorder nodes replaying the same chain produce byte-identical streams. Hourly rotation keys off this same block time. Records within a block are emitted in committed iteration order (`BTreeMap` over markets, FIFO within a book level), so ordering is deterministic across replays. See the [determinism rules](../README.md) (no floats, no `HashMap`, no wall clock).

## Indexer pipeline

```
recorder node ──► node_fills / node_trades / node_order_statuses / l4_book_diffs
                            │
                            ▼
                     downstream indexer ──► historical REST + analytics
                            │                 (userFillsByTime, candleSnapshot,
                            │                  fetchTrades, fetchOHLCV, fetchMyTrades)
                            └──► l4_book_diffs ──► L4 order-book server (de-anon depth)
```

The node and gateway serve only **live, committed-state** reads; everything time-windowed or itemized-historical is the indexer's job, fed from these files. The 🚧 markers on the historical query types in [HL-compat](rest/hl-compat.md) and [CCXT-compat](rest/ccxt-compat.md) all resolve through this pipeline.

## References

- HL node data formats — `replica_cmds` NDJSON, `node_fills_by_block/hourly`, ABCI `.rmp` snapshots: the [protocol study](rest/info.md) §D.6 (18-field fill hash) / §D.7 (Fill 9-field, `OrderStatus` 5-variant).
- The L4 order-book server is a separate open-source (GPL-3.0) repo consuming `l4_book_diffs.jsonl`; it has zero node-code dependency and is never co-located with the gateway.

## See also

- [`POST /info`](rest/info.md) — live MTF-native reads (`recent_trades` / `user_fills` are honest-empty on the bare node — that's why these files exist)
- [HL-compat](rest/hl-compat.md) — the historical query types fed by the indexer
- [CCXT-compat](rest/ccxt-compat.md) — `fetchTrades` / `fetchOHLCV` / `fetchMyTrades` fed by the indexer
- [WS subscriptions](ws/subscriptions.md) — the live equivalent (`trades`, `userFills`)
