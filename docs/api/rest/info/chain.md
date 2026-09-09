---
description: "Chain-wide activity: recent blocks, and the action outcome of a submitted hash."
---

# Chain activity reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

## Chain activity query types {#chain-activity-query-types}

Recent blocks and recent order-lifecycle events, served by the gateway from the
standalone history archive. **They are the replacement for the removed
`explorer_block` / `explorer_txs` WS channels** — see
[Ids and wire shapes](../../../changelog/ids-and-wire-shapes.md#explorer-channels-removed)
for why a validator no longer pushes that firehose.

Both answer in the standard `/info` envelope, with `type` inside `data`. The
[history-archive lane](../info.md#archive-lane) differs in its rejection shape
only. A gateway with no archive configured answers an empty array with a `flag`,
never an error.

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

**There is no `proposer`.** The removed WS header carried the proposing
validator index; the archive record does not. Nothing else serves it today.

**Size a poll so it cannot gap.** The block cadence is about 100 ms, so 100 rows
span roughly 10 seconds of chain and a 2-second poll always overlaps. Measure the
cadence rather than trusting that figure — it moves between releases.

### Recent order-lifecycle events {#recent_transactions}

One row per order TRANSITION, not per order. A single order emits several rows
(placed, then filled, then cancelled), so `oid` repeats and cannot key a list.

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
| `txns[*].oid` | decimal-digit string | Order id. **Not unique across rows** — one order emits one row per transition |
| `txns[*].user` | hex address | Acting account |
| `txns[*].coin` | string | Market symbol or spot pair name |
| `txns[*].action` | string | Readable lifecycle label (`"resting"` / `"filled"` / `"canceled"` …). Treat it as an open set |
| `txns[*].status` | uint8 | The raw status code behind `action` |
| `txns[*].side` | uint8 | `0` = bid, `1` = ask |
| `txns[*].time` | uint64 | Event timestamp (consensus ms) |

**There is no `hash`.** The removed WS row carried the originating action hash,
and [`/exchange`](../exchange.md) pointed at it as the hash-keyed way to check a
submitted action. Correlate by `cloid` instead, or read
[`action_outcome`](./account-history.md#action_outcome).
