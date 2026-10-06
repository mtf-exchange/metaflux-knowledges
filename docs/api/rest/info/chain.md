---
description: "Chain-wide activity: recent blocks, and the action outcome of a submitted hash."
---

# Chain activity reads

These reads return recent blocks and recent order-lifecycle events.

They are read queries on [`POST /info`](../info.md). That page describes the
endpoint, the request envelope, the number planes and the error shape. These
apply to every query here.

## Chain activity query types {#chain-activity-query-types}

The gateway serves recent blocks and recent order-lifecycle events from the
standalone history archive. **These reads replace the removed `explorer_block`
and `explorer_txs` WS channels.** See
[Ids and wire shapes](../../../changelog/ids-and-wire-shapes.md#explorer-channels-removed)
for the reason that a validator no longer pushes that full stream.

Both reads answer in the standard `/info` envelope, with `type` inside `data`.
The [history-archive lane](../info.md#archive-lane) differs only in its
rejection shape. A gateway with no archive configured answers an empty array
with a `flag`. It never answers an error.

### Recent committed blocks {#recent_blocks}

**Request**

```json
{ "type": "recent_blocks", "limit": 100 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `limit` | uint32 | no | Cap on rows returned, newest first |

**Response**

```json
{
  "data": {
    "type": "recent_blocks",
    "blocks": [
      { "height":       26616908,
        "block_hash":   "0x3bbcfeea4bcebded111b4407fe46ea2fbda57457fad926e27de9012eceabd583",
        "ts_ms":        1788169351971,
        "action_count": 0,
        "fill_count":   0 }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `blocks[*].height` | uint64 | Committed block height. Each committed block advances exactly one consensus round |
| `blocks[*].block_hash` | hex string \| null | Block hash |
| `blocks[*].ts_ms` | uint64 | Block timestamp (consensus ms) |
| `blocks[*].action_count` | uint32 | Signed actions committed in the block |
| `blocks[*].fill_count` | uint32 | Fills settled in the block |

**There is no `proposer`.** The removed WS header had the index of the
proposing validator. The archive record does not. No other read serves it
today.

**Size a poll so that it has no gaps.** The block cadence is about 100 ms, so
100 rows cover about 10 seconds of chain. A 2-second poll always overlaps.
Measure the cadence. Do not trust that figure, because it changes between
releases.

### Recent order-lifecycle events {#recent_transactions}

This read returns one row for each order transition, not for each order. One
order emits several rows (placed, then filled, then cancelled). `oid` therefore
repeats and cannot key a list.

**Request**

```json
{ "type": "recent_transactions", "limit": 100 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `limit` | uint32 | no | Cap on rows returned, newest first |

**Response**

```json
{
  "data": {
    "type": "recent_transactions",
    "txns": [
      { "oid":    "34143530",
        "user":   "0x0c4ec1cba7310669b08145f17a29b1048d9196ab",
        "coin":   "PUMP",
        "action": "resting",
        "status": 1,
        "side":   0,
        "time":   1788169342234 }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `txns[*].oid` | decimal-digit string | Order id. It is not unique across rows, because one order emits one row for each transition |
| `txns[*].user` | hex address | Acting account |
| `txns[*].coin` | string | Market symbol or spot pair name |
| `txns[*].action` | string | Readable lifecycle label (`"resting"` / `"filled"` / `"canceled"` …). Treat it as an open set |
| `txns[*].status` | uint8 | The raw status code behind `action` |
| `txns[*].side` | uint8 | `0` = bid, `1` = ask |
| `txns[*].time` | uint64 | Event timestamp (consensus ms) |

**There is no `hash`.** The removed WS row had the hash of the originating
action. [`/exchange`](../exchange.md) referred to it as the way to check a
submitted action by hash. Correlate by `cloid` instead, or read
[`action_outcome`](./account-history.md#action_outcome).
