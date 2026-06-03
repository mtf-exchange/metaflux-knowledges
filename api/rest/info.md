# `POST /info` — read path (MTF-native)

{% hint style="info" %}
**Status.** **stable** shape. Query types are added over time; the envelope is committed.
{% endhint %}

## TL;DR

Single endpoint, multi-type. Dispatches on the request body's `type` field. Read-only — never mutates state, never requires a signature.

## URL

```
POST  https://<node-or-gateway>/info
```

| Host | Wire shape |
|------|-----------|
| Node directly (`:8080`) | MTF-native (this document) |
| Gateway (`:8443`) | **HL-compat** by default — see [hl-compat.md](./hl-compat.md) |
| Gateway (`:8443`) `/native/info` | MTF-native (mirrors the node shape) |

## Envelope

Request:

```json
{ "type": "<query_type>", /* type-specific args */ }
```

Response:

```json
{ "type": "<query_type>", "data": { /* type-specific */ } }
```

On unknown `type`: `400 Bad Request` with `{"error":"unknown info type: <X>"}`.
On unknown resource (e.g. unknown vault id): `404 Not Found` with `{"error":"<resource> not found"}`.

## Query types

### `node_info`

Static node identity + protocol version. No parameters.

```json
{ "type": "node_info" }
```

Response:

```json
{
  "type": "node_info",
  "data": {
    "network":           "devnet",
    "chain_id":          31337,
    "protocol_version":  "1.0.0",
    "validator_index":   3,
    "build_commit":      "<short hex>",
    "uptime_seconds":    123456
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `network` | `"devnet" \| "testnet" \| "mainnet"` | Network variant |
| `chain_id` | uint64 | EIP-712 chain id |
| `protocol_version` | semver string | Wire-protocol version |
| `validator_index` | uint32 | This node's index in the active validator set |
| `build_commit` | hex string | Operator-published build identifier |
| `uptime_seconds` | uint64 | Process uptime |

### `account_state`

Per-account snapshot.

```json
{ "type": "account_state", "address": "0x<addr>" }
```

| Arg | Type | Required |
|-----|------|----------|
| `address` | hex address | yes |

Response:

```json
{
  "type": "account_state",
  "data": {
    "address":           "0x<addr>",
    "account_value":  "100000000",
    "free_collateral":"80000000",
    "maint_margin":   "10000000",
    "init_margin":    "20000000",
    "health":         "10000000",
    "tier":              "Safe",
    "margin_mode":       "Cross",
    "pm_enabled":        false,
    "positions": [
      {
        "asset":            0,
        "size":          "100000000",
        "entry_px":      "10000000000",
        "unrealised_pnl":"500000",
        "isolated":         false,
        "leverage":         10
      }
    ],
    "balances": {
      "usdc": "100000000",
      "spot":    { "ETH": "5000000000" }
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `account_value` | u128 string | Equity including unrealised PnL, USDC base units |
| `free_collateral` | u128 string | Equity minus initial margin held by open positions |
| `maint_margin` | u128 string | Maintenance margin requirement |
| `init_margin` | u128 string | Initial margin requirement |
| `health` | i128 string | `account_value - maint_margin` (can be negative) |
| `tier` | enum | `"Safe"`, `"T0"`, `"T1"`, `"T2"`, `"T3"` — see [tiered liquidation](../../concepts/tiered-liquidation.md) |
| `margin_mode` | enum | `"Cross"`, `"Isolated"`, `"StrictIso"` |
| `pm_enabled` | bool | Portfolio margin opt-in state |
| `positions[*]` | array | Per-asset open positions |

### `market_info`

Per-market metadata.

```json
{ "type": "market_info", "asset_id": 0 }
```

Or by name:

```json
{ "type": "market_info", "coin": "BTC" }
```

Response:

```json
{
  "type": "market_info",
  "data": {
    "asset_id":        0,
    "name":            "BTC",
    "kind":            "Perp",
    "tick_size":    "100",
    "step_size":    "10000",
    "min_order":    "10000",
    "max_leverage":    50,
    "maint_margin_ratio": "5000",
    "init_margin_ratio":  "10000",
    "funding": {
      "rate_per_hr":  "1000",
      "cap_per_hr":   "50000",
      "interval_ms":     3600000,
      "next_payment_ts": 1735693200000
    },
    "mark_source": "MedianOfOraclesAndMid",
    "fba_enabled": false,
    "open_interest": "5000000000"
  }
}
```

### `markets`

Every registered MIP-3 perp market, in one call. No parameters.

```json
{ "type": "markets" }
```

The `data` payload is an **array** of the same rich per-market record that
[`market_info`](#market_info) returns for a single asset. Records are ordered
deterministically by ascending `asset_id` (the node iterates the
`mip3_market_specs` `BTreeMap`). An empty universe returns `"data": []`.

Response:

```json
{
  "type": "markets",
  "data": [
    {
      "asset_id":        0,
      "name":            "BTC",
      "kind":            "Perp",
      "tick_size":    "100",
      "step_size":    "10000",
      "min_order":    "10000",
      "max_leverage":    50,
      "maint_margin_ratio": "5000",
      "init_margin_ratio":  "10000",
      "funding": {
        "rate_per_hr":  "1000",
        "cap_per_hr":   "50000",
        "interval_ms":     3600000,
        "next_payment_ts": 1735693200000
      },
      "mark_source": "MedianOfOraclesAndMid",
      "fba_enabled": false,
      "open_interest": "5000000000"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | uint32 | Canonical asset id (sort key) |
| `name` | string | Market symbol, e.g. `"BTC"` |
| `kind` | `"Perp"` | Market kind |
| `tick_size` | i128 string | Minimum price increment, fixed-point |
| `step_size` | u128 string | Minimum size increment (lot size), fixed-point |
| `min_order` | u128 string | Minimum order size |
| `max_leverage` | uint8 | Maximum leverage |
| `maint_margin_ratio` | bps string | Maintenance margin ratio, decimal bps |
| `init_margin_ratio` | bps string | Initial margin ratio (`1 / max_leverage`), decimal bps |
| `funding.rate_per_hr` | bps string | Latest funding premium sample, decimal bps |
| `funding.cap_per_hr` | bps string | Funding rate cap per hour, decimal bps |
| `funding.interval_ms` | uint64 | Funding cadence (1h = `3600000`) |
| `funding.next_payment_ts` | uint64 | Next funding payment ts (`0` until a sample exists) |
| `mark_source` | string | Mark-price descriptor (`"MedianOfOraclesAndMid"`) |
| `fba_enabled` | bool | Frequent-batch-auction enabled for this market |
| `open_interest` | u128 string | Current open interest, fixed-point |

Each element is byte-identical to the corresponding single-asset `market_info`
response's `data` — both are built from the same per-market record builder, so
the single and bulk shapes never drift. See [`market_info`](#market_info) for
the field-level semantics and FLAGGED-proxy notes (`mark_source`,
`next_payment_ts`).

### `vault_state`

Per-vault snapshot.

```json
{ "type": "vault_state", "vault": "0x<vault_addr>" }
```

Response:

```json
{
  "type": "vault_state",
  "data": {
    "vault":              "0x<addr>",
    "name":               "MFlux Conservative",
    "tvl":             "10000000000",
    "share_price":     "10500000",
    "depositor_count":    142,
    "high_water_mark": "10500000",
    "performance_fee_bps":1000,
    "lock_period_ms":     86400000,
    "strategy":           "MarketNeutral"
  }
}
```

### `staking_state`

```json
{ "type": "staking_state", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "staking_state",
  "data": {
    "address":         "0x<addr>",
    "total_staked": "1000000000",
    "delegations": [
      {
        "validator":         "0x<val_addr>",
        "amount":         "500000000",
        "since_ts":          1735000000000,
        "pending_rewards":"1000000"
      }
    ],
    "pending_unstakes": [
      { "amount": "200000000", "matures_at_ts": 1735780000000 }
    ]
  }
}
```

### `fee_schedule`

```json
{ "type": "fee_schedule" }
```

Response:

```json
{
  "type": "fee_schedule",
  "data": {
    "tiers": [
      { "volume_30d": "0",         "maker_bps": "2.0", "taker_bps": "5.0" },
      { "volume_30d": "100000000", "maker_bps": "1.5", "taker_bps": "4.5" },
      { "volume_30d": "1000000000","maker_bps": "1.0", "taker_bps": "4.0" }
    ],
    "builder_rebate_bps": "0.2",
    "burn_ratio":         "0.30",
    "referrer_share_bps": "1.0"
  }
}
```

Fee rates are decimal **basis points** as strings (`"2.0"` = 2 bps = 0.02%). `burn_ratio` is a decimal fraction (`"0.30"` = 30% of fees burned). See [fees](../../concepts/fees.md).

### `open_orders`

Account-scoped resting orders across every perp book.

```json
{ "type": "open_orders", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Either `account_id` (u64) or `address` (0x hex) identifies the account. When the
request supplies `account_id`, it is echoed back in `data.account_id`.

Response:

```json
{
  "type": "open_orders",
  "data": {
    "address":    "0x<addr>",
    "account_id": 42,
    "orders": [
      {
        "oid":          12345,
        "market_id":    0,
        "side":         "bid",
        "px":        "99000",
        "size":      "700",
        "inserted_at_ms": 1700000000000
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved account address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `orders[*].oid` | uint64 | Server order id |
| `orders[*].market_id` | uint32 | Asset / market id the order rests on |
| `orders[*].side` | `"bid"` / `"ask"` | Order side |
| `orders[*].px` | i128 string | Resting price, fixed-point decimal string |
| `orders[*].size` | u128 string | Remaining size, fixed-point decimal string |
| `orders[*].inserted_at_ms` | uint64 | Insertion timestamp (consensus ms) |

### `l2_book`

Market-scoped aggregated bid/ask levels.

```json
{ "type": "l2_book", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Response:

```json
{
  "type": "l2_book",
  "data": {
    "market_id": 0,
    "bids": [ { "px": "99000", "size": "700", "n_orders": 1 } ],
    "asks": [ { "px": "101000", "size": "750", "n_orders": 2 } ]
  }
}
```

Bids are best-first (descending price), asks ascending. Each level aggregates
the summed `size` and the resting-order `n_orders` count. An unknown / empty
market returns empty `bids` / `asks` arrays.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `bids[*].px` / `asks[*].px` | i128 string | Level price, fixed-point decimal string |
| `bids[*].size` / `asks[*].size` | u128 string | Summed size at the level |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Resting orders at the level |

### `recent_trades`

Market-scoped trade tape.

```json
{ "type": "recent_trades", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Response:

```json
{
  "type": "recent_trades",
  "data": {
    "market_id":      0,
    "last_trade_ms":  1700000000555,
    "trades":         []
  }
}
```

{% hint style="warning" %}
**Honest-empty.** `trades` is always `[]` today — committed state keeps only the
per-book `last_trade_ms` scalar, not an itemized CLOB trade tape. The array
populates once the trade indexer lands; `last_trade_ms` is real now.
{% endhint %}

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `last_trade_ms` | uint64 | Timestamp of the last trade (`0` if none) |
| `trades` | array | Empty until the indexer lands |

### `user_fills`

Account-scoped fill history.

```json
{ "type": "user_fills", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Response:

```json
{
  "type": "user_fills",
  "data": {
    "address":    "0x<addr>",
    "account_id": 42,
    "fills":      []
  }
}
```

{% hint style="warning" %}
**Honest-empty.** `fills` is always `[]` today — committed state keeps only
aggregate fill counters, not an itemized per-user fill log. The array populates
once the fill indexer lands.
{% endhint %}

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved account address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `fills` | array | Empty until the indexer lands |

### `funding_history`

Market-scoped funding premium samples.

```json
{ "type": "funding_history", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Response:

```json
{
  "type": "funding_history",
  "data": {
    "market_id": 0,
    "samples": [
      { "ts_ms": 1700000000000, "premium": "0.0015" },
      { "ts_ms": 1700000008000, "premium": "-0.0007" }
    ]
  }
}
```

Samples are the ordered ring of `(ts_ms, premium)` from the funding tracker;
`premium` is the exact `Decimal` rendered as a string (signed, full precision).
An unknown / empty market returns `"samples": []`.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `samples[*].ts_ms` | uint64 | Sample timestamp (consensus ms) |
| `samples[*].premium` | decimal string | Funding premium sample (signed) |

### `block_info`

Committed block metadata. No required args (`height` is accepted but ignored —
the read state keeps only the latest committed context).

```json
{ "type": "block_info" }
```

Response:

```json
{
  "type": "block_info",
  "data": {
    "height":       123,
    "round":        456,
    "epoch":        4,
    "timestamp_ms": 1700000111222,
    "block_hash":   "0x0000000000000000000000000000000000000000000000000000000000000000"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `height` | uint64 | Latest committed block height |
| `round` | uint64 | Consensus round of that block |
| `epoch` | uint64 | Current epoch |
| `timestamp_ms` | uint64 | Block timestamp (consensus ms) |
| `block_hash` | hex string (32 bytes) | **FLAGGED:** currently the all-zero hash — the block hash is not yet plumbed into the read state |

### `agents`

Approved agent / API wallets for an account.

```json
{ "type": "agents", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Response:

```json
{
  "type": "agents",
  "data": {
    "address":    "0x<master>",
    "account_id": 42,
    "agents": [
      { "agent": "0x<agent_addr>", "expires_at_ms": 1700000500000 }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved master address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `agents[*].agent` | hex address | Approved agent wallet address |
| `agents[*].expires_at_ms` | uint64 | Agent approval expiry (consensus ms) |

### `sub_accounts`

Sub-accounts of an account.

```json
{ "type": "sub_accounts", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Response:

```json
{
  "type": "sub_accounts",
  "data": {
    "address":    "0x<parent>",
    "account_id": 42,
    "sub_accounts": [
      { "index": 0, "address": "0x<sub_addr>" }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved parent address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `sub_accounts[*].index` | uint32 | Sub-account index under the parent |
| `sub_accounts[*].address` | hex address | Sub-account address |

### `mip3_active_bids`

MIP-3 permissionless perp-deploy gas-auction snapshot. No parameters.

```json
{ "type": "mip3_active_bids" }
```

Response:

```json
{
  "type": "mip3_active_bids",
  "data": {
    "auction_round":   2,
    "current_bid":     "12345",
    "current_winner":  "0x<bidder>",
    "auction_end_ms":  1700086400000,
    "started_at_ms":   1700000000000,
    "bids": [
      {
        "bidder":          "0x<bidder>",
        "amount":          "12345",
        "submitted_at_ms": 1700000000500,
        "tag":             "ETH-PERP"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Current auction round |
| `current_bid` | decimal string | Leading bid amount |
| `current_winner` | hex address \| null | Current winning bidder, `null` if none |
| `auction_end_ms` | uint64 | Auction close timestamp (consensus ms) |
| `started_at_ms` | uint64 | Auction start timestamp (consensus ms) |
| `bids[*].bidder` | hex address | Bidder address |
| `bids[*].amount` | decimal string | Bid amount |
| `bids[*].submitted_at_ms` | uint64 | Bid submission timestamp (consensus ms) |
| `bids[*].tag` | string | Bid tag (e.g. the proposed market name) |

## Errors

| HTTP | Body | Cause |
|------|------|-------|
| 200 | normal response | success |
| 400 | `{"error":"unknown info type: <X>"}` | Misspelled or unsupported `type` |
| 400 | `{"error":"missing field: <X>"}` | Required type-specific arg omitted |
| 400 | `{"error":"invalid hex"}` | Address arg malformed |
| 404 | `{"error":"account not found"}` | Address has never appeared on-chain |
| 404 | `{"error":"market not found"}` | Asset id / coin name unknown |
| 404 | `{"error":"vault not found"}` | Vault address unknown |
| 405 | (no body) | Not POST |
| 429 | `{"error":"rate limit exceeded","retry_after_ms":N}` | See [rate limits](../rate-limits.md) |

## Read-after-write consistency

`/info` reads from the most recent committed block. A `POST /exchange` admitted at time `T` is not visible in `/info` until the leader commits the block containing it (typically <200 ms at default tick).

For read-your-writes semantics, subscribe to the [`userEvents` WS channel](../ws/subscriptions.md#userevents); admitted-then-committed events arrive in order, removing the need to poll.

## Sequence — query an account, see your own order

```
client                     gateway              node
  │                          │                    │
  │ POST /exchange Order     │                    │
  ├─────────────────────────►│───────────────────►│  admit
  │ 202 Accepted             │                    │
  │◄─────────────────────────┤◄───────────────────┤
  │                          │                    │
  │  ... ~100 ms commit ...                       │
  │                          │                    │
  │ POST /info open_orders   │                    │
  ├─────────────────────────►│───────────────────►│
  │                          │                    │ read committed state
  │ 200 [order present]      │                    │
  │◄─────────────────────────┤◄───────────────────┤
```

## See also

- [`POST /exchange`](./exchange.md) — write path
- [HL-compat `/info`](./hl-compat.md) — camelCase shape, additional query types
- [WS subscriptions](../ws/subscriptions.md) — push equivalents

## FAQ

**Q: Why both `asset_id` and `coin` accepted on `market_info`?**
A: `asset_id` is canonical; `coin` is a convenience for human callers. Both resolve to the same record.

**Q: Why are `user_fills` / `recent_trades` always empty?**
A: Both are honest-empty today — committed state keeps aggregate counters and the per-book `last_trade_ms` scalar, but not an itemized fill / trade log. The arrays populate once the indexer lands; subscribe to the [WS feed](../ws/subscriptions.md) for live fills in the meantime.

**Q: Is the response deterministic across nodes?**
A: Yes. Any honest node returns identical responses for the same query at the same committed height. Nodes with different commit heights may differ; the response includes the height it answered at.
