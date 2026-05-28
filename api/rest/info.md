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
      { "volume_30d": "0",         "maker_bps_e2": "200", "taker_bps_e2": "500" },
      { "volume_30d": "100000000", "maker_bps_e2": "150", "taker_bps_e2": "450" },
      { "volume_30d": "1000000000","maker_bps_e2": "100", "taker_bps_e2": "400" }
    ],
    "builder_rebate_bps_e2": "20",
    "burn_ratio":         "300000",
    "referrer_share_bps_e2": "100"
  }
}
```

`maker_bps_e2` is basis points × 100 (i.e. `200` = 2 bps = 0.02%). See [fees](../../concepts/fees.md).

### `open_orders`

```json
{ "type": "open_orders", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "open_orders",
  "data": {
    "orders": [
      {
        "oid":       12345,
        "cloid":     "0x...",
        "asset":     0,
        "side":      "Buy",
        "px":     "10050000000",
        "sz":     "100000000",
        "remaining_sz":"100000000",
        "tif":       "Gtc",
        "reduce_only":false,
        "placed_at_ts": 1735689600000
      }
    ]
  }
}
```

### `user_fills`

```json
{
  "type": "user_fills",
  "address": "0x<addr>",
  "since_ts": 1735000000000,
  "limit":    1000
}
```

Paginated; `limit` capped at 1000. Returns `cursor` if there are more.

### `recent_trades`

```json
{ "type": "recent_trades", "asset_id": 0, "limit": 100 }
```

### `l2_book`

```json
{ "type": "l2_book", "asset_id": 0, "depth": 20 }
```

Response:

```json
{
  "type": "l2_book",
  "data": {
    "bids": [{ "px": "...", "sz": "...", "n_orders": 5 }, ...],
    "asks": [...]
  }
}
```

### `funding_history`

```json
{
  "type": "funding_history",
  "asset_id": 0,
  "since_ts": 1735000000000,
  "limit":    1000
}
```

### `block_info`

```json
{ "type": "block_info", "height": null }
```

`height: null` returns the latest committed block. Response includes `height`, `commit_ts_ms`, `proposer`, and a digest of the block contents (action count, fill count, withdrawal count).

### `agents`

List active agents for an account.

```json
{ "type": "agents", "address": "0x<master>" }
```

Response:

```json
{
  "type": "agents",
  "data": {
    "agents": [
      { "agent": "0x...", "name": "bot-1", "approved_at_ts": ..., "expires_at_ms": null }
    ]
  }
}
```

### `sub_accounts`

```json
{ "type": "sub_accounts", "address": "0x<master>" }
```

### `mip3_active_bids`

Live MIP-3 gas-auction bids per stream.

```json
{ "type": "mip3_active_bids" }
```

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

**Q: How do I paginate `user_fills`?**
A: Loop with `since_ts` from the last fill's timestamp + 1ms. The response includes `cursor` for `limit`-bounded paging; pass it back as `cursor` on the next request.

**Q: Is the response deterministic across nodes?**
A: Yes. Any honest node returns identical responses for the same query at the same committed height. Nodes with different commit heights may differ; the response includes the height it answered at.
