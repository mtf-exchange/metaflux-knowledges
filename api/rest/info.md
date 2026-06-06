# `POST /info` — read path (MTF-native)

{% hint style="info" %}
**Status.** **stable** shape. Query types are added over time; the envelope is committed.
{% endhint %}

## TL;DR

Single endpoint, multi-type. Dispatches on the request body's `type` field. Read-only — never mutates state, never requires a signature.

## URL

```
POST  https://gateway.<net>.mtf.exchange/info
```

| Path | Wire shape |
|------|-----------|
| `POST /info` (gateway default) | MTF-native (this document) |
| `POST /hl/info` (gateway, under `/hl`) | **HL-compat** — see [hl-compat.md](./hl-compat.md) |

MTF-native is the gateway's default path; HL-compat is namespaced under `/hl/*`.
Running the node yourself, the same native `/info` is served directly at
`http://localhost:8080`.

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
    "network":           "testnet",
    "chain_id":          114514,
    "protocol_version":  "1.0.0",
    "validator_index":   null,
    "build_commit":      "unknown",
    "uptime_seconds":    0
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `network` | `"devnet" \| "testnet" \| "mainnet"` | Network variant, derived from `chain_id` (`31337`=devnet, `114514`=testnet, `8964`=mainnet) |
| `chain_id` | uint64 | EIP-712 chain id — the SAME value the `/exchange` signing domain must use |
| `protocol_version` | semver string | Wire-protocol version |
| `validator_index` | uint32 \| null | This node's index in the active validator set; **FLAGGED:** `null` until the runtime calls `set_validator_index` |
| `build_commit` | hex string | Operator-published build identifier; **FLAGGED:** `"unknown"` until published |
| `uptime_seconds` | uint64 | Process uptime; **FLAGGED:** `0` until the runtime calls `set_uptime_seconds` |

These are **per-node** fields (node identity / runtime), NOT consensus state, so they legitimately differ across nodes.

### `account_state`

Per-account snapshot.

```json
{ "type": "account_state", "address": "0x<addr>" }
```

| Arg | Type | Required |
|-----|------|----------|
| `address` | hex address | yes |

An **unknown address** (never seen on-chain) returns **200** with a fully zeroed
record (`account_value:"0"`, empty `positions` / `balances.spot`), NOT a `404`.

Response (a faucet-funded account, no positions):

```json
{
  "type": "account_state",
  "data": {
    "address":         "0x00000000000000000000000000000000000ca11e",
    "account_value":   "3000",
    "free_collateral": "3000",
    "maint_margin":    "0",
    "init_margin":     "0",
    "health":          "3000",
    "tier":            "Safe",
    "margin_mode":     "Cross",
    "pm_enabled":      false,
    "positions": [],
    "balances": {
      "usdc": "3000",
      "spot": { "MTF": "10" }
    }
  }
}
```

A positioned account adds entries under `positions`:

```json
{
  "asset":          0,
  "size":           "100000000",
  "entry_px":       "67000.00",
  "unrealised_pnl": "5.00",
  "isolated":       false,
  "leverage":       10
}
```

| Field | Type | Description |
|-------|------|-------------|
| `account_value` | Decimal string | Equity incl. settled PnL, **whole-USDC plane** (`"3000"` = 3000 USDC, NOT base units) |
| `free_collateral` | Decimal string | Equity minus initial margin held by open positions |
| `maint_margin` | Decimal string | Σ per-asset margin used (maintenance) |
| `init_margin` | Decimal string | Held initial-margin requirement |
| `health` | Decimal string | `account_value − maint_margin` (signed; can be negative) |
| `tier` | enum | `"Safe"`, `"T0"`, `"T1"`, `"T2"`, `"T3"` (BOLE band of `account_value / maint_margin`; `"Safe"` when no maint margin) — see [tiered liquidation](../../concepts/tiered-liquidation.md) |
| `margin_mode` | enum | `"Cross"`, `"Isolated"`, `"StrictIso"` (derived from the account's open positions) |
| `pm_enabled` | bool | Portfolio margin opt-in state |
| `positions[*].asset` | uint32 | Asset id |
| `positions[*].size` | i128 string | Signed position size in **raw lots** — `size / 10^sz_decimals` = whole units (`sz_decimals` is the market's size precision, e.g. 5 for BTC). This is the SIZE plane, orthogonal to the 1e8 price plane. |
| `positions[*].entry_px` | Decimal string | Per-whole-unit entry price = `\|entry_notional\| / \|real size\|`, **whole-USDC plane** |
| `positions[*].unrealised_pnl` | Decimal string | Mark-to-market PnL = `real size × mark − signed entry_notional`, **whole-USDC plane** (signed) |
| `positions[*].isolated` | bool | `true` unless the position is cross-margined |
| `positions[*].leverage` | uint8 | Position max leverage |
| `balances.usdc` | Decimal string | **Mirrors `account_value`** (the cross USDC collateral), NOT a separate spot USDC balance |
| `balances.spot` | object | Non-USDC spot token balances, keyed by **token name** (e.g. `"MTF"`); empty if none |

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
    "kind":            "perp",
    "sz_decimals":     5,
    "mark_px":         "67079.265",
    "oracle_px":       "67073.35",
    "tick_size":       "1000000",
    "step_size":       "1",
    "min_order":       "1",
    "max_leverage":    50,
    "maint_margin_ratio": "300",
    "init_margin_ratio":  "200",
    "funding": {
      "rate_per_hr":  "0",
      "cap_per_hr":   "400",
      "interval_ms":     3600000,
      "next_payment_ts": 0
    },
    "mark_source": "MedianOfOraclesAndMid",
    "fba_enabled": false,
    "open_interest": "0"
  }
}
```

{% hint style="info" %}
**Price reporting plane.** On this read both `mark_px` and `oracle_px` are in the
**whole-USDC Decimal plane** (human dollars — `"67079.265"` / `"67073.35"`), the
same unit as account positions' mark. `mark_px` is the on-book mark scaled down
from the engine's internal 1e8 fixed-point representation, falling back to the
oracle px when the book has no mark yet; `oracle_px` is the latest committed index
price. Either is `"0"` when unset. Note the **order/book submission plane stays
1e8 fixed-point** — `l2_book` level px and order `limit_px` are NOT whole-USDC; MTF
keeps those two scale planes distinct, and only the human-facing reads (`market_info`,
`markets`, positions) report prices in whole-USDC. Field semantics for the rest of
the record are in the [`markets`](#markets) table below.
{% endhint %}

{% hint style="info" %}
**Price precision vs `sz_decimals`.** `mark_px` and `oracle_px` are **snapped to
the market's price tick** (`tick_size`, truncated toward zero) so a read never
shows sub-tick noise — at a `$0.01` tick (`tick_size: "1000000"` in the 1e8 plane)
`66735.255` is reported as `"66735.25"`. Note `sz_decimals` is **SIZE** precision
(order quantity granularity — `5` ⇒ `0.00001` units), it does **not** govern price
decimals; the price tick does. The two are independent axes (same split HL uses).
{% endhint %}

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
      "kind":            "perp",
      "sz_decimals":     5,
      "mark_px":         "67042.335",
      "oracle_px":       "67042.335",
      "tick_size":       "1000000",
      "step_size":       "1",
      "min_order":       "1",
      "max_leverage":    50,
      "maint_margin_ratio": "300",
      "init_margin_ratio":  "200",
      "funding": {
        "rate_per_hr":  "0",
        "cap_per_hr":   "400",
        "interval_ms":     3600000,
        "next_payment_ts": 0
      },
      "mark_source": "MedianOfOraclesAndMid",
      "fba_enabled": false,
      "open_interest": "0"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | uint32 | Canonical asset id (sort key) |
| `name` | string | Market symbol, e.g. `"BTC"` |
| `kind` | `"perp"` | Market kind (lowercase) |
| `sz_decimals` | uint8 | Size display decimals (from the underlying spot token registry; `0` if no token spec) |
| `mark_px` | Decimal string | On-book mark, **whole-USDC plane** (book mark scaled out of 1e8, oracle fallback; `"0"` if unset) |
| `oracle_px` | Decimal string | Index price, **whole-USDC plane** (`"0"` if unset) |
| `tick_size` | i128 string | Minimum price increment, **1e8 fixed-point** (order/book submission plane) |
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
    "height":       562,
    "round":        562,
    "epoch":        0,
    "timestamp_ms": 1780475491562,
    "block_hash":   "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `height` | uint64 | Latest committed block height |
| `round` | uint64 | Consensus round of that block |
| `epoch` | uint64 | Current epoch |
| `timestamp_ms` | uint64 | Block timestamp (consensus ms) |
| `block_hash` | hex string (32 bytes) | Real committed block hash (now plumbed into the read state — no longer the all-zero placeholder) |

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

### `protocol_metrics`

Protocol-wide committed accumulators / counters. No parameters. Every field is
read straight off committed `Exchange` state (counters, fee pools, BOLE reserves,
staking) — nothing is computed off the match engine or oracle, so a replay
reproduces it exactly.

```json
{ "type": "protocol_metrics" }
```

Response:

```json
{
  "type": "protocol_metrics",
  "data": {
    "counters": {
      "total_orders":               1000,
      "total_fills":                750,
      "total_liquidations":         3,
      "total_deposits":             40,
      "total_withdrawals":          12,
      "total_vault_transfers":      0,
      "total_sub_account_transfers":0
    },
    "fee_pools": {
      "burned":         "8000",
      "mflux_vault":    "0",
      "validator_pool": "1000",
      "treasury":       "1000",
      "burned_mtf":     "55"
    },
    "insurance_fund_total":    "750",
    "treasury_backstop_total": "9000",
    "bole_pool": {
      "total_deposits":  "20000",
      "shortfall_total": "7"
    },
    "open_interest_total_1e8": "1500000",
    "staking": {
      "total_stake":   "100",
      "n_validators":  1,
      "n_active":      1,
      "n_jailed":      0,
      "current_epoch": 4
    },
    "counts": {
      "n_markets":             1,
      "n_spot_pairs":          5,
      "n_user_vaults":         0,
      "n_accounts_with_state": 12
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `counters.total_orders` | uint64 | Lifetime orders admitted |
| `counters.total_fills` | uint64 | Lifetime fills (the only itemized trade signal — a **count**, not a notional) |
| `counters.total_liquidations` | uint64 | Lifetime liquidations |
| `counters.total_deposits` / `total_withdrawals` | uint64 | Lifetime deposit / withdrawal counts |
| `counters.total_vault_transfers` | uint64 | Lifetime vault deposit/withdraw transfers |
| `counters.total_sub_account_transfers` | uint64 | Lifetime sub-account transfers |
| `fee_pools.burned` | Decimal string | Cumulative USDC routed to buyback-and-burn (whole-USDC) |
| `fee_pools.mflux_vault` | Decimal string | Cumulative MFlux-vault fee accrual (`"0"` — vault share zeroed) |
| `fee_pools.validator_pool` | Decimal string | Cumulative validator-pool fee accrual (whole-USDC) |
| `fee_pools.treasury` | Decimal string | Cumulative treasury fee accrual (whole-USDC) |
| `fee_pools.burned_mtf` | Decimal string | Cumulative MTF retired by the buyback executor |
| `insurance_fund_total` | Decimal string | Σ per-asset `bole_pool.insurance_fund` reserves (whole-USDC) |
| `treasury_backstop_total` | Decimal string | Σ per-asset `bole_pool.treasury_backstop` reserves (whole-USDC) |
| `bole_pool.total_deposits` | Decimal string | BOLE lending-pool total deposits (whole-USDC) |
| `bole_pool.shortfall_total` | Decimal string | Σ residual bad debt parked after the ADL → insurance → treasury waterfall |
| `open_interest_total_1e8` | u128 string | Σ per-market open interest, **1e8 book plane** (labelled `_1e8`, NOT whole-USDC) |
| `staking.total_stake` | Decimal string | Total staked MTF (whole-MTF) |
| `staking.n_validators` | uint64 | Validators in the committed set |
| `staking.n_active` | uint64 | Validators active this epoch |
| `staking.n_jailed` | uint64 | Currently-jailed validators |
| `staking.current_epoch` | uint64 | Current staking epoch |
| `counts.n_markets` | uint64 | Registered MIP-3 perp markets (`mip3_market_specs`) |
| `counts.n_spot_pairs` | uint64 | Registered spot pairs (`mip3_spot_pair_specs`) |
| `counts.n_user_vaults` | uint64 | Registered user vaults |
| `counts.n_accounts_with_state` | uint64 | Accounts with committed user-state |

{% hint style="info" %}
**No cumulative traded-notional figure.** The engine tracks per-user **30-day fee
volume** (see [`user_fees`](#user_fees)) and a lifetime fill **count**
(`counters.total_fills`) — there is **no committed running protocol-wide traded-USD
accumulator**, so this read intentionally omits one rather than implying a volume
total exists. Counters are monotonic activity tallies, not money.
{% endhint %}

State source: `locus.{counters, fee_tracker.fee_distribution, bole_pool}` + `c_staking` + registry sizes.

### `user_fees`

Per-account fee / volume tier. Required: `account_id` (u64) **OR** `address` (0x hex).

```json
{ "type": "user_fees", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Neither present → `400`. An account with no fee state returns a **200** with
zeroed figures (and `from_global: true`) — the established zeroed idiom.

Response:

```json
{
  "type": "user_fees",
  "data": {
    "address":          "0x<addr>",
    "account_id":       42,
    "taker_volume_30d": "1250000",
    "maker_volume_30d": "800000",
    "vip_tier":         2,
    "mm_tier":          1,
    "referrer":         "0x<referrer>",
    "referrer_credit":  "420",
    "maker_bps":        1,
    "taker_bps":        5,
    "from_global":      true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved account address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `taker_volume_30d` | Decimal string | Rolling 30-day taker volume (whole-USDC) |
| `maker_volume_30d` | Decimal string | Rolling 30-day maker volume (whole-USDC) |
| `vip_tier` | uint | Committed per-user VIP tier index; `0` when untracked |
| `mm_tier` | uint | Committed per-user market-maker tier index; `0` when untracked |
| `referrer` | hex address \| null | This account's referrer if set, else `null` |
| `referrer_credit` | Decimal string | Σ rebate accrued *to* this address acting as a referrer (whole-USDC) |
| `maker_bps` | uint | Effective maker fee bps (the global default — see flag) |
| `taker_bps` | uint | Effective taker fee bps (the global default — see flag) |
| `from_global` | bool | Always `true` today — the bps come from the global schedule (see flag) |

{% hint style="warning" %}
**`maker_bps` / `taker_bps` are the GLOBAL schedule defaults, flagged
`from_global: true`.** `vip_tier` / `mm_tier` are **real** committed per-user tier
*indices*, but the engine carries **no committed index→bps discount table yet**, so
those indices do not map to committed bps. The bps reported here are
`global_schedule.default_{maker,taker}_bps` (`5` / `1` at the flat tier). Treat
`vip_tier` / `mm_tier` + the volume trackers as the live tiering signal; the
[`fee_schedule`](#fee_schedule) ladder is the *target* schedule, not yet charged.
{% endhint %}

State source: `locus.fee_tracker.{user_to_taker_volume_30d, user_to_maker_volume_30d, user_to_vip_tier, user_to_mm_tier, referee_to_referrer, referrer_credit}` + `global_schedule`.

### `staking_apr`

Effective annual staking emission rate + its committed inputs. No parameters.

```json
{ "type": "staking_apr" }
```

Response:

```json
{
  "type": "staking_apr",
  "data": {
    "total_stake":             "1000000",
    "effective_apr":           "0.08",
    "effective_apr_bps":       "800",
    "governance_rate_bps":     800,
    "emission_floor_stake":    "50000000",
    "n_active_validators":     1,
    "current_epoch":           2,
    "is_gross_pre_commission": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_stake` | Decimal string | Total staked MTF (whole-MTF) |
| `effective_apr` | Decimal string | Annual emission rate the begin-block reward effect actually applies (fraction) |
| `effective_apr_bps` | Decimal string | `effective_apr × 10_000`, truncated |
| `governance_rate_bps` | uint | Governance-set `reward_rate_bps` (committed) — see flag |
| `emission_floor_stake` | uint string | Floor stake (`50M` MTF) below which the rate is flat |
| `n_active_validators` | uint64 | Validators active this epoch |
| `current_epoch` | uint64 | Current staking epoch |
| `is_gross_pre_commission` | bool | Always `true` — APR is gross, pre per-validator commission |

`effective_apr` is the curve the begin-block reward effect derives:

```text
effective_apr = 0.08 × √( 50M / max(total_stake, 50M) )
```

i.e. a **flat 8%** at/below 50M MTF staked, decaying ∝ 1/√stake above it (e.g.
total stake = 200M ⇒ 4× floor ⇒ ratio 1/4 ⇒ √ = 1/2 ⇒ 4% / 400 bps).

{% hint style="warning" %}
**`governance_rate_bps` is committed but NOT consumed by the reward effect.** The
reward effect derives the payout rate from the **stake curve** above, not from
`reward_rate_bps`. Both are surfaced so the divergence is observable rather than
hidden — the effective payout APR is `effective_apr`, not `governance_rate_bps`.
And `effective_apr` is a **gross emission** rate (`is_gross_pre_commission: true`):
an individual delegator's net APR is `effective_apr × (1 − commission)`.
{% endhint %}

State source: `c_staking.{total_stake, reward_rate_bps, current_epoch, validators}` + the emission curve.

### `oracle_sources`

The committed per-market oracle-source subset. Resolves the market by `asset_id`
(u32) **OR** `coin` (symbol).

```json
{ "type": "oracle_sources", "asset_id": 0 }
```

Or by name:

```json
{ "type": "oracle_sources", "coin": "BTC" }
```

| Arg | Type | Required |
|-----|------|----------|
| `asset_id` | uint32 | one of `asset_id` / `coin` |
| `coin` | symbol | one of `asset_id` / `coin` |

Missing both → `400`; unknown market → `404 {"error":"market not found"}`.

Response:

```json
{
  "type": "oracle_sources",
  "data": {
    "asset_id":          0,
    "name":              "BTC",
    "oracle_set":        true,
    "source_count":      3,
    "num_sources":       10,
    "enabled_sources":   [0, 2, 5],
    "subset_mask":       37,
    "weights_committed": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | uint32 | Echoed / resolved asset id |
| `name` | string | Market symbol |
| `oracle_set` | bool | Whether the deployer explicitly confirmed the subset via `SetOracle` |
| `source_count` | uint64 | Number of enabled sources (popcount of the mask) |
| `num_sources` | uint8 | Total source slots (`NUM_ORACLE_SOURCES = 10`) |
| `enabled_sources` | uint8[] | Set bit indices of the subset mask (the enabled source slots) |
| `subset_mask` | uint16 | Committed 10-bit `oracle_source_subset_mask` (bit `i` set ⇒ source `i` feeds the median) |
| `weights_committed` | bool | Always `false` — per-source weights are NOT committed (see flag) |

{% hint style="warning" %}
**Only the numeric bitmask is on-chain — venue NAMES and WEIGHTS are NOT
committed** (`weights_committed: false`). The 10 source identities are
protocol-fixed off-chain and their weights are
protocol-fixed, so committed state carries only the subset bitmask. This read
surfaces `enabled_sources` as **bit indices**, not named venues, and emits no
per-venue weight list rather than fabricating one.
{% endhint %}

State source: `mip3_market_specs[asset].{oracle_source_subset_mask, oracle_set}`.

## Differentiator query types (RFQ / FBA / portfolio margin)

These read the live state behind the MTF differentiator engines — they complement
the `market_info.fba_enabled` / `account_state.pm_enabled` flags with the engine
state itself. Same `{type, data}` envelope and MTF-native conventions. **Price
plane:** RFQ + FBA prices / sizes are raw **1e8 fixed-point** integer strings (the
book / order plane, identical to [`open_orders`](#open_orders) / [`l2_book`](#l2_book)),
**not** whole-USDC; portfolio-margin magnitudes are **USD cents** integer strings.

### `rfq_open`

Every open RFQ request plus its maker quotes. No parameters. See the [RFQ concept](../../concepts/rfq.md).

```json
{ "type": "rfq_open" }
```

Response:

```json
{
  "type": "rfq_open",
  "data": {
    "rfqs": [
      {
        "rfq_id":              1,
        "market_id":           7,
        "side":                "bid",
        "size":                "1000",
        "requester":           "0x<addr>",
        "requester_stp_group": 42,
        "expiry_ms":           5000,
        "limit_px":            "105",
        "created_at_ms":       10,
        "quotes": [
          {
            "maker":           "0x<addr>",
            "maker_stp_group": null,
            "price":           "104",
            "max_size":        "800",
            "valid_until_ms":  4000,
            "submitted_at_ms": 20
          }
        ]
      }
    ]
  }
}
```

`rfqs` iterates deterministically by `rfq_id`. An empty engine returns `"rfqs": []`.

| Field | Type | Description |
|-------|------|-------------|
| `rfqs[*].rfq_id` | uint64 | RFQ request id |
| `rfqs[*].market_id` | uint32 | Asset / market id the RFQ is for |
| `rfqs[*].side` | `"bid"` / `"ask"` | Side the requester wants to take |
| `rfqs[*].size` | u128 string | Requested size, 1e8 fixed-point |
| `rfqs[*].requester` | hex address | Requesting account |
| `rfqs[*].requester_stp_group` | uint \| null | Requester self-trade-prevention group; `null` when unset |
| `rfqs[*].expiry_ms` | uint64 | RFQ expiry timestamp (consensus ms) |
| `rfqs[*].limit_px` | i128 string \| null | Requester limit price, 1e8 fixed-point; `null` when unset |
| `rfqs[*].created_at_ms` | uint64 | Creation timestamp (consensus ms) |
| `rfqs[*].quotes[*].maker` | hex address | Quoting maker |
| `rfqs[*].quotes[*].maker_stp_group` | uint \| null | Maker STP group; `null` when unset |
| `rfqs[*].quotes[*].price` | i128 string | Quote price, 1e8 fixed-point |
| `rfqs[*].quotes[*].max_size` | u128 string | Max size the maker will fill, 1e8 fixed-point |
| `rfqs[*].quotes[*].valid_until_ms` | uint64 | Quote validity deadline (consensus ms) |
| `rfqs[*].quotes[*].submitted_at_ms` | uint64 | Quote submission timestamp (consensus ms) |

### `rfq_user`

RFQs an account is party to — split into those it opened and those it quoted on. See the [RFQ concept](../../concepts/rfq.md).

```json
{ "type": "rfq_user", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Either `account_id` (u64) or `address` (0x hex) identifies the account; when the
request supplies `account_id` it is echoed back in `data.account_id`. Neither
present → `400`; malformed `address` → `400 {"error":"invalid hex"}`.

Response:

```json
{
  "type": "rfq_user",
  "data": {
    "address":    "0x<addr>",
    "account_id": 42,
    "requested": [ /* <rfq>, same per-RFQ shape as rfq_open */ ],
    "quoted":    [ /* <rfq> */ ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved account address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `requested` | array&lt;rfq&gt; | RFQs this account opened (requester); same per-RFQ shape as [`rfq_open`](#rfq_open) |
| `quoted` | array&lt;rfq&gt; | RFQs this account quoted on (appears as a `maker`); same per-RFQ shape |

Each list iterates deterministically by `rfq_id`. An account party to nothing
returns a **200** with both lists empty (the established zeroed idiom).

### `fba_batch_state`

Live FBA pool plus the indicative clearing for one market. See the [FBA concept](../../concepts/fba.md).

```json
{ "type": "fba_batch_state", "market_id": 3 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Missing `market_id` → `400`. There is **no 404** for an unregistered market: FBA
is per-market opt-in, so a market with no pool returns a **200** with zeroed
fields (`enabled:false`, `period_ms:0`, empty `orders`, `indicative:null`).

Response:

```json
{
  "type": "fba_batch_state",
  "data": {
    "market_id":      3,
    "enabled":        true,
    "period_ms":      200,
    "min_lot":        "1",
    "last_settle_ms": 500,
    "next_settle_ms": 700,
    "order_count":    2,
    "bid_count":      1,
    "ask_count":      1,
    "bid_size":       "10",
    "ask_size":       "6",
    "orders": [
      {
        "oid":             1,
        "owner":           "0x<addr>",
        "side":            "bid",
        "price":           "105",
        "size":            "10",
        "stp_group":       null,
        "submitted_at_ms": 1
      }
    ],
    "indicative": { "clearing_px": "100", "matched_size": "6" }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Echoed market id |
| `enabled` | bool | Whether FBA is on for this market |
| `period_ms` | uint32 | Batch period |
| `min_lot` | u128 string | Minimum lot size, 1e8 fixed-point |
| `last_settle_ms` | uint64 | Last batch-settle timestamp (consensus ms) |
| `next_settle_ms` | uint64 | **Derived** `last_settle_ms + period_ms` — the next due boundary the begin-block `is_due` check uses (not stored explicitly); `0` when `period_ms == 0` |
| `order_count` | uint64 | Orders in the current window |
| `bid_count` / `ask_count` | uint64 | Per-side order counts in the window |
| `bid_size` / `ask_size` | u128 string | Per-side summed size, 1e8 fixed-point |
| `orders[*].oid` | uint64 | Server order id |
| `orders[*].owner` | hex address | Order owner |
| `orders[*].side` | `"bid"` / `"ask"` | Order side |
| `orders[*].price` | i128 string | Order price, 1e8 fixed-point |
| `orders[*].size` | u128 string | Order size, 1e8 fixed-point |
| `orders[*].stp_group` | uint \| null | Self-trade-prevention group; `null` when unset |
| `orders[*].submitted_at_ms` | uint64 | Order submission timestamp (consensus ms) |
| `indicative` | object \| null | The volume-maximising uniform price + matched size the **next** batch *would* clear given the current window — computed read-only, **not yet settled / committed**. `null` when there is no cross (one-sided or empty window) |
| `indicative.clearing_px` | i128 string | Indicative uniform clearing price, 1e8 fixed-point |
| `indicative.matched_size` | u128 string | Size that would clear at `clearing_px`, 1e8 fixed-point |

### `pm_summary`

Portfolio-margin enrollment + last-computed scenario figures for an account. See [Portfolio margin](../../concepts/portfolio-margin.md).

```json
{ "type": "pm_summary", "account_id": 42 }
```

| Arg | Type | Required |
|-----|------|----------|
| `account_id` | uint64 | one of `account_id` / `address` |
| `address` | hex address | one of `account_id` / `address` |

Either `account_id` (u64) or `address` (0x hex); neither present → `400`. A
non-enrolled account returns a **200** with `enrolled:false` and zeroed figures.

Response:

```json
{
  "type": "pm_summary",
  "data": {
    "address":                     "0x<addr>",
    "account_id":                  42,
    "enrolled":                    true,
    "enrolled_at_ms":              1000,
    "last_computed_block":         77,
    "pm_maint_margin_cents":       "250000",
    "net_value_cents":             "9000000",
    "concentration_penalty_cents": "1500"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | Resolved account address |
| `account_id` | uint64 | Echoed only when the request used `account_id` |
| `enrolled` | bool | Whether the account is enrolled in portfolio margin |
| `enrolled_at_ms` | uint64 | Enrollment timestamp (consensus ms); `0` when not enrolled |
| `last_computed_block` | uint64 | Block height of the last PM scenario computation |
| `pm_maint_margin_cents` | u128 string | Last-computed PM maintenance requirement, **USD cents** |
| `net_value_cents` | i128 string | Last-computed account net value, **USD cents** |
| `concentration_penalty_cents` | u128 string | Last-computed concentration penalty, **USD cents** |

The worst-case scenario loss is intentionally **omitted**: it is not persisted in
committed state, and recomputing it would require re-running the scenario sweep,
which is not a read-only operation.

## HL-node parity query types

The following query types bring the node `/info` surface to parity with the Hyperliquid NODE info-server (`--serve-info`) snapshot set. Each reads committed `core_state::Exchange` and uses the same `{type, data}` envelope and MTF-native conventions (decimal-string money, `0x`-hex addresses, `u32` asset ids, `BTreeMap` order). Keyed lookups (by address / asset), not O(N) scans, except where the set is inherently small (markets / vaults / validators) or already indexed (`liquidatable` via the BOLE index).

### `spot_meta`

Spot pair universe + per-token registry. No parameters.

```json
{ "type": "spot_meta" }
```

Response:

```json
{
  "type": "spot_meta",
  "data": {
    "pairs": [
      { "id": 100, "name": "USDC", "base": 100, "quote": 100, "taker_fee_bps": 0, "min_notional": "0", "active": true },
      { "id": 101, "name": "BTC",  "base": 101, "quote": 101, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 104, "name": "MTF",  "base": 104, "quote": 104, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true },
      { "id": 113, "name": "MTF/USDC", "base": 104, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true }
    ],
    "tokens": [
      { "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6 },
      { "id": 101, "name": "BTC",  "sz_decimals": 5, "wei_decimals": 8 },
      { "id": 102, "name": "ETH",  "sz_decimals": 4, "wei_decimals": 18 },
      { "id": 103, "name": "SOL",  "sz_decimals": 2, "wei_decimals": 9 },
      { "id": 104, "name": "MTF",  "sz_decimals": 2, "wei_decimals": 8 }
    ]
  }
}
```

{% hint style="info" %}
**`pairs` carries two kinds of entry.** The per-token "self pairs" (`id` =
token id, `base == quote`, e.g. `100`/USDC, `101`/BTC, …, `104`/MTF) are the
token registry projected as pairs; the **real tradable pairs** have ids `110+`
(`BTC/USDC`=110, `ETH/USDC`=111, `SOL/USDC`=112, `MTF/USDC`=113) with distinct
`base`/`quote` and `active:true`. A self-pair's `active` reflects whether that
token's standalone book is live (only USDC is, on devnet).
{% endhint %}

| Field | Type | Description |
|-------|------|-------------|
| `pairs[*].id` | uint32 | Pair id (`SpotPairSpec.pair_id`); `110+` = real `BASE/USDC` pairs |
| `pairs[*].name` | string | Pair name (e.g. `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Base / quote asset id (equal for self-pairs) |
| `pairs[*].taker_fee_bps` | uint16 | Taker fee (bps); `0` if unset |
| `pairs[*].min_notional` | decimal string | Min notional (USDC cents); `"0"` if unset |
| `pairs[*].active` | bool | Whether the pair is active for trading |
| `tokens[*].id` | uint32 | Spot token asset id (`100`=USDC, `101`=BTC, `102`=ETH, `103`=SOL, `104`=MTF) |
| `tokens[*].name` | string | Token name (e.g. `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Display / size precision |
| `tokens[*].wei_decimals` | uint8 | Native (ERC-20-style) token decimals (USDC=6, BTC=8, ETH=18, SOL=9, MTF=8) |

`tokens` and `pairs` are in committed `BTreeMap` order (by asset / pair id).

State source: `Exchange.mip3_spot_pair_specs` (pairs) + `Exchange.mip3_spot_token_specs` (tokens).

### `spot_clearinghouse_state`

Per-account spot token balances. Required: `address` (0x hex).

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "balance": "10" } ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balances[*].asset` | uint32 | Spot asset id (`104` = MTF) |
| `balances[*].name` | string | Token / pair name, else `asset:<id>` |
| `balances[*].balance` | decimal string | Balance, truncated toward zero |

State source: `locus.spot_clearinghouse.balances` (keyed by `(owner, asset)`).

### `exchange_status`

Global trading status. No parameters.

```json
{ "type": "exchange_status" }
```

Response:

```json
{
  "type": "exchange_status",
  "data": {
    "spot_disabled": false,
    "post_only_until_time_ms": 0,
    "post_only_until_height": 0,
    "scheduled_freeze_height": null,
    "mip3_enabled": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `spot_disabled` | bool | Spot trading globally disabled |
| `post_only_until_time_ms` | uint64 | Post-only window end (consensus ms); `0` = none |
| `post_only_until_height` | uint64 | Post-only window end (height); `0` = none |
| `scheduled_freeze_height` | uint64 \| null | Scheduled upgrade-halt height, `null` if none |
| `mip3_enabled` | bool | `true` once any MIP-3 market/pair spec is registered |

State source: `spot_disabled`, `post_only_until_*`, `scheduled_freeze_height`, `mip3_market_specs` / `mip3_spot_pair_specs`.

### `frontend_open_orders`

Like `open_orders`, plus each order's `tif` / `cloid` / `trigger` detail. Required: `address` (0x hex).

```json
{ "type": "frontend_open_orders", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "frontend_open_orders",
  "data": {
    "address": "0x<addr>",
    "orders": [
      {
        "oid": 7, "market_id": 0, "side": "bid", "px": "50000", "size": "20000",
        "tif": "gtc", "cloid": "0x000…cafe",
        "trigger": { "trigger_px": "49000", "trigger_above": false },
        "inserted_at_ms": 1700000000000
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `orders[*].oid` | uint64 | On-chain order id |
| `orders[*].market_id` | uint32 | Asset id |
| `orders[*].side` | `"bid" \| "ask"` | Order side |
| `orders[*].px` / `size` | decimal string | Resting price / remaining size |
| `orders[*].tif` | `"alo" \| "ioc" \| "gtc"` | Time-in-force |
| `orders[*].cloid` | hex string \| null | Client order id, `null` if none |
| `orders[*].trigger` | object \| null | `{trigger_px, trigger_above}` if a trigger is registered for the oid, else `null` |
| `orders[*].inserted_at_ms` | uint64 | Insertion timestamp (consensus ms) |

State source: per-book resting orders + `Exchange.trigger_registry`.

### `liquidatable`

Accounts currently flagged for liquidation. No parameters.

```json
{ "type": "liquidatable" }
```

Response:

```json
{
  "type": "liquidatable",
  "data": { "accounts": [ { "address": "0x<addr>", "tier": "PartialMarket50" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accounts[*].address` | hex address | Needs-action account |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | BOLE tier |

State source: `Exchange.bole_index.tier` (the BOLE needs-action index — **not** a full account rescan).

> **FLAGGED.** `bole_index` is `#[serde(skip)]` derived, non-canonical state, rebuilt by a full scan on first use / after snapshot load. On a freshly published snapshot it is empty until the runtime has run the BOLE pass at least once.

### `active_asset_data`

A user's per-asset leverage / margin-mode / max trade size. Required: `address` (0x hex) + `asset_id` (u32).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "asset_id": 0 }
```

Response:

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "asset_id": 0, "leverage": 7,
    "margin_mode": "isolated", "max_trade_size": "5000000000", "has_position": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `leverage` | uint32 | Position leverage if open, else account default, else market max |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Effective margin mode |
| `max_trade_size` | decimal string | Per-asset max-order ceiling (see `max_market_order_ntls`) |
| `has_position` | bool | Whether the user has a non-zero position on this asset |

State source: `locus.clearinghouses[asset].positions[addr]`, `locus.user_account_configs[addr]`, market spec / dynamic risk.

### `max_market_order_ntls`

Per-asset max market-order notional. No parameters.

```json
{ "type": "max_market_order_ntls" }
```

Response:

```json
{
  "type": "max_market_order_ntls",
  "data": { "ntls": [ { "asset_id": 0, "max_market_order_ntl": "5000000000" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | Asset id |
| `ntls[*].max_market_order_ntl` | decimal string | OI-cap-derived size ceiling |

State source: per-market `PerpAnnotation.oi_cap`, else `default_mip3_limits.max_oi_per_market`.

> **FLAGGED.** No dedicated per-asset "max market-order notional" field exists in committed state; the OI cap is the closest committed risk ceiling, reported in **size** units (the matching layer converts to notional at the live mark).

### `vault_summaries`

All vaults summary. No parameters.

```json
{ "type": "vault_summaries" }
```

Response:

```json
{
  "type": "vault_summaries",
  "data": {
    "vaults": [
      { "id": 7, "address": "0x<vault>", "leader": "0x<leader>", "tvl": "10000000000", "follower_count": 2, "kind": "user" }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vaults[*].id` | uint64 | Vault id |
| `vaults[*].address` / `leader` | hex address | Vault on-chain address / leader |
| `vaults[*].tvl` | decimal string | NAV proxy (high-water mark, USD cents) |
| `vaults[*].follower_count` | uint64 | Number of share holders |
| `vaults[*].kind` | `"user" \| "metaliquidity"` | Vault kind |

State source: `Exchange.user_vaults`.

> **FLAGGED.** `tvl` uses the high-water mark as the NAV proxy; full NAV needs the match-engine + oracle.

### `user_vault_equities`

Vaults a user has deposited into + share / equity. Required: `address` (0x hex).

```json
{ "type": "user_vault_equities", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "user_vault_equities",
  "data": {
    "address": "0x<addr>",
    "equities": [ { "vault_id": 7, "vault_address": "0x<vault>", "shares": "1000000000000000000", "equity": "5000000000" } ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `equities[*].vault_id` | uint64 | Vault id |
| `equities[*].vault_address` | hex address | Vault address |
| `equities[*].shares` | decimal string | Caller's share count (18-dec) |
| `equities[*].equity` | decimal string | `shares × share_price(high_water_mark)`, truncated |

State source: `user_vaults[*].follower_shares[addr]` (keyed per vault).

### `leading_vaults`

Vaults led by the user. Required: `address` (0x hex). Returns the same row shape as `vault_summaries`.

```json
{ "type": "leading_vaults", "address": "0x<addr>" }
```

Response:

```json
{ "type": "leading_vaults", "data": { "address": "0x<addr>", "vaults": [ /* <vault_summaries row> */ ] } }
```

State source: `Exchange.user_vaults` filtered by `leader == addr`.

### `user_rate_limit`

A user's action stats / rate-limit budget. Required: `address` (0x hex).

```json
{ "type": "user_rate_limit", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "user_rate_limit",
  "data": { "address": "0x<addr>", "last_nonce": 9, "pending_count": 2, "lifetime_count": 123 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `last_nonce` | uint64 | Last accepted action nonce |
| `pending_count` | uint32 | Pending (in-flight) action count |
| `lifetime_count` | uint64 | Lifetime actions submitted |

State source: `locus.user_action_registry[addr]` (`UserActionStats`); absent account → zeroed.

### `spot_deploy_state`

MIP-1 spot-pair-deploy gas-auction state. No parameters.

```json
{ "type": "spot_deploy_state" }
```

Response:

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Current round |
| `current_bid` | decimal string | Leading bid |
| `current_winner` | hex address \| null | Current high bidder |
| `auction_end_ms` / `started_at_ms` | uint64 | Auction window (consensus ms) |
| `total_burned` | decimal string | Cumulative burned winning-bid notional |
| `deposit` | decimal string | Total escrowed deposit (base units) |

State source: `Exchange.spot_pair_deploy_gas_auction`.

### `delegator_summary`

Staking summary for an address. Required: `address` (0x hex).

```json
{ "type": "delegator_summary", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "delegator_summary",
  "data": {
    "address": "0x<addr>", "total_delegated": "500", "pending_withdrawal": "50",
    "claimable_rewards": "7", "n_delegations": 2
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_delegated` | decimal string | Sum of active delegations |
| `pending_withdrawal` | decimal string | Sum of pending undelegations |
| `claimable_rewards` | decimal string | Accumulated delegator rewards |
| `n_delegations` | uint64 | Number of active delegations |

State source: `c_staking.{delegations, pending_undelegations, delegator_rewards}`.

### `max_builder_fee`

Approved builder-fee ceiling for `(address, builder)`. Required: `address` (0x hex) + `builder` (0x hex).

```json
{ "type": "max_builder_fee", "address": "0x<addr>", "builder": "0x<builder>" }
```

Response:

```json
{
  "type": "max_builder_fee",
  "data": { "address": "0x<addr>", "builder": "0x<builder>", "max_fee_bps": 8, "approved": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `max_fee_bps` | uint32 | Approved bps ceiling; `0` if not approved |
| `approved` | bool | Whether `(address, builder)` is an approved pair |

State source: `locus.fee_tracker.approved_builders[addr][builder]` (keyed).

### `user_to_multi_sig_signers`

Multisig config for an address. Required: `address` (0x hex).

```json
{ "type": "user_to_multi_sig_signers", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "user_to_multi_sig_signers",
  "data": { "address": "0x<addr>", "is_multi_sig": true, "threshold": 2, "signers": ["0x…", "0x…"] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `is_multi_sig` | bool | Whether the account is multisig |
| `threshold` | uint32 | M-of-N threshold; `0` if not multisig |
| `signers` | hex address[] | Signer set; empty if not multisig |

State source: `multi_sig_tracker.configs[addr]` (`MultiSigConfig`).

### `user_role`

Derived account role. Required: `address` (0x hex).

```json
{ "type": "user_role", "address": "0x<addr>" }
```

Response:

```json
{ "type": "user_role", "data": { "address": "0x<addr>", "role": "user" } }
```

| Field | Type | Description |
|-------|------|-------------|
| `role` | `"missing" \| "user" \| "agent" \| "vault" \| "sub_account"` | Derived role |

Precedence: `vault` (a `user_vaults[*].vault_address`) → `sub_account` (`sub_account_tracker.sub_to_parent`) → `agent` (an approved agent of some master) → `user` (has a user-state / config / spot entry) → `missing`.

### `perps_at_open_interest_cap`

Assets whose open interest is at/over the cap. No parameters.

```json
{ "type": "perps_at_open_interest_cap" }
```

Response:

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `assets` | uint32[] | Asset ids at/over their `oi_cap`, ascending |

State source: per-book `open_interest` vs `PerpAnnotation.oi_cap` (books with no positive cap are skipped).

### `validator_l1_votes`

Current validator L1 votes. No parameters.

```json
{ "type": "validator_l1_votes" }
```

Response:

```json
{
  "type": "validator_l1_votes",
  "data": {
    "latest_round": 5,
    "votes": [ { "round": 5, "validator": "0x<validator>", "submitted_at_ms": 1700000000000 } ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `latest_round` | uint64 | Latest accepted vote round |
| `votes[*].round` | uint64 | Vote round |
| `votes[*].validator` | hex address | Casting validator |
| `votes[*].submitted_at_ms` | uint64 | Submission timestamp (consensus ms) |

State source: `validator_l1_vote_tracker.round_to_votes`. The vote payload is opaque oracle bytes (decoded by Module H) — the read surface reports metadata, not the raw payload.

### `margin_table`

The margin-tier table (leverage → maint / init ratios). No parameters.

```json
{ "type": "margin_table" }
```

Response:

```json
{
  "type": "margin_table",
  "data": { "tiers": [ { "asset_id": 0, "max_leverage": 50, "maint_margin_ratio": "300", "init_margin_ratio": "200" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tiers[*].asset_id` | uint32 | Asset id |
| `tiers[*].max_leverage` | uint8 | Effective max leverage (override else static) |
| `tiers[*].maint_margin_ratio` | bps string | Maintenance margin ratio (override else 3% static floor) |
| `tiers[*].init_margin_ratio` | bps string | `1 / max_leverage` |

State source: `dynamic_risk_overrides[asset]` else the static baseline.

> **FLAGGED.** Committed state stores a single effective risk tier per market (override or static), not the multi-row leverage ladder HL serves. The proxy is one tier per market — the row the engine enforces today.

### `perp_dexs`

List the perp DEX(es). No parameters.

```json
{ "type": "perp_dexs" }
```

Response:

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | DEX index in `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Number of asset books in the DEX |
| `dexs[*].assets` | uint32[] | Asset ids in the DEX |

State source: `Exchange.perp_dexs`.

### `validator_summaries`

Per-validator snapshot (HL `validatorSummaries`). No parameters. Lists every validator in committed `c_staking.validators` (a small, bounded set) in committed `BTreeMap` order.

```json
{ "type": "validator_summaries" }
```

Response:

```json
{
  "type": "validator_summaries",
  "data": {
    "epoch": 3,
    "total_stake": "1400",
    "n_active": 1,
    "validators": [
      {
        "validator": "0x1111…", "signer": "0xa1a1…", "validator_index": 0,
        "stake": "1000", "self_stake": "100", "commission_bps": 500,
        "is_active": true, "is_jailed": false, "jailed_at_ms": null,
        "unjail_at_ms": null, "first_active_epoch": 2
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `epoch` | uint64 | Current staking epoch (`c_staking.current_epoch`) |
| `total_stake` | decimal string | Σ stake across all validators |
| `n_active` | uint64 | Size of the active set |
| `validators[*].validator` | 0x address | Validator primary address |
| `validators[*].signer` | 0x address | Operational signer (hot key) |
| `validators[*].validator_index` | uint32 | Consensus index |
| `validators[*].stake` | decimal string | Total delegated stake |
| `validators[*].self_stake` | decimal string | Validator's own contribution |
| `validators[*].commission_bps` | uint32 | Commission (basis points) |
| `validators[*].is_active` | bool | In the active set this epoch |
| `validators[*].is_jailed` | bool | Currently jailed |
| `validators[*].jailed_at_ms` | uint64 \| null | Jail start ts (null if not jailed) |
| `validators[*].unjail_at_ms` | uint64 \| null | Earliest unjail ts (null if not jailed) |
| `validators[*].first_active_epoch` | uint64 | First epoch the validator was active |

State source: `c_staking.{validators, jailed, validator_index, active_set, current_epoch, total_stake}`. `name` / `n_recent_blocks` are not tracked on-chain — omitted rather than fabricated.

### `gossip_root_ips`

Configured gossip root/seed peer endpoints (HL `gossipRootIps`). No parameters. Network topology, **not** committed state: the runtime publishes this node's `network.peers[].gossip` endpoints to the read layer at startup. A solo node has no peers → honest-empty.

```json
{ "type": "gossip_root_ips" }
```

Response:

```json
{ "type": "gossip_root_ips", "data": { "root_ips": ["mtf-node-2:4001", "mtf-node-3:4001"] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `root_ips` | string[] | Configured gossip peer endpoints (`host:port`); empty on a solo node |

State source: node config `network.peers[].gossip` (published to `NodeReadState` at startup; NOT committed state, NOT folded into AppHash).

### `web_data2`

Composite "everything for the frontend" snapshot for an address. Required: `address` (0x hex). Composed from the other readers so shapes never drift.

```json
{ "type": "web_data2", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "web_data2",
  "data": {
    "address": "0x<addr>",
    "clearinghouse": {
      "account_value": "1000000", "margin_used": "100000",
      "positions": [ { "asset": 0, "size": "50", "entry_notional": "2500", "margin_mode": "cross", "leverage": 10 } ]
    },
    "spot_balances": [ /* <spot_clearinghouse_state.balances> */ ],
    "open_orders": [ /* <frontend_open_orders.orders> */ ],
    "vault_equities": [ /* <user_vault_equities.equities> */ ],
    "exchange_status": { /* <exchange_status.data> */ }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clearinghouse.account_value` | decimal string | Cross account value |
| `clearinghouse.margin_used` | decimal string | Σ per-asset margin used |
| `clearinghouse.positions` | object[] | Per-asset open positions |
| `spot_balances` | object[] | Reuses `spot_clearinghouse_state.balances` |
| `open_orders` | object[] | Reuses `frontend_open_orders.orders` |
| `vault_equities` | object[] | Reuses `user_vault_equities.equities` |
| `exchange_status` | object | Reuses `exchange_status.data` |

State source: composite over the readers above.

## HL node info type → MTF-native type (parity table)

The Hyperliquid NODE info-server (`github.com/hyperliquid-dex/node`, `--serve-info`) serves the snapshot query set below. The middle column is the served MTF-native equivalent; ✅ = served, ⚠️ = served with a flagged proxy (no exact backing in committed state).

| HL node info type | MTF-native type | Status | Notes |
|----------------------------|------------------------------|--------|-------|
| `meta` | `markets` | ✅ | already served (S6) |
| `spotMeta` | `spot_meta` | ✅ | `mip3_spot_pair_specs` + `mip3_spot_token_specs` |
| `clearinghouseState` | `account_state` | ✅ | already served (S6) |
| `spotClearinghouseState` | `spot_clearinghouse_state` | ✅ | keyed by `(owner, asset)` |
| `exchangeStatus` | `exchange_status` | ✅ | scalar flags |
| `openOrders` | `open_orders` | ✅ | already served (S6) |
| `frontendOpenOrders` | `frontend_open_orders` | ✅ | + trigger / tif / cloid |
| `liquidatable` | `liquidatable` | ✅ | BOLE index (⚠️ empty until first BOLE pass) |
| `activeAssetData` | `active_asset_data` | ✅ | position / config / market |
| `maxMarketOrderNtls` | `max_market_order_ntls` | ⚠️ | OI cap as size ceiling proxy |
| `vaultSummaries` | `vault_summaries` | ✅ | ⚠️ `tvl` = high-water-mark NAV proxy |
| `userVaultEquities` | `user_vault_equities` | ✅ | keyed per vault |
| `leadingVaults` | `leading_vaults` | ✅ | filtered by leader |
| `userRateLimit` | `user_rate_limit` | ✅ | `UserActionStats` |
| `spotDeployState` | `spot_deploy_state` | ✅ | spot gas auction |
| `delegatorSummary` | `delegator_summary` | ✅ | staking aggregate |
| `maxBuilderFee` | `max_builder_fee` | ✅ | `approved_builders` |
| `userToMultiSigSigners` | `user_to_multi_sig_signers` | ✅ | `MultiSigConfig` |
| `userRole` | `user_role` | ✅ | derived from registries |
| `perpsAtOpenInterestCap` | `perps_at_open_interest_cap` | ✅ | OI vs `oi_cap` |
| `validatorL1Votes` | `validator_l1_votes` | ✅ | metadata (opaque payload) |
| `validatorSummaries` | `validator_summaries` | ✅ | stake / commission / active+jailed flags |
| `gossipRootIps` | `gossip_root_ips` | ✅ | configured peer endpoints (empty on solo) |
| `marginTable` | `margin_table` | ⚠️ | one effective tier per market (no multi-row ladder) |
| `perpDexs` | `perp_dexs` | ✅ | index + asset count |
| `webData2` | `web_data2` | ✅ | composite |
| `userFees` | `fee_schedule` | ✅ | already served (S6) |
| `delegations` | `staking_state` | ✅ | already served (S6) |
| `perpDeployAuctionStatus` | `mip3_active_bids` | ✅ | already served (S6) |
| `subAccounts` | `sub_accounts` | ✅ | already served (S6) |

## Errors

| HTTP | Body | Cause |
|------|------|-------|
| 200 | normal response | success (an **unknown address** on `account_state` etc. is a **200** with a zeroed record, NOT a 404) |
| 400 | `{"error":"missing field \`type\`"}` | No `type` discriminator |
| 400 | `{"error":"unknown info type: <X>"}` | Misspelled or unsupported `type` |
| 400 | `{"error":"missing field: address"}` / `{"error":"missing field market_id"}` | Required type-specific arg omitted (casing varies by reader) |
| 400 | `{"error":"invalid hex"}` | Address arg malformed |
| 404 | `{"error":"market not found"}` | Asset id / coin name unknown (`market_info` only) |
| 404 | `{"error":"vault not found"}` | Vault address unknown (`vault_state` only) |
| 405 | (no body) | Not POST |
| 429 | `{"error":"rate limit exceeded","retry_after_ms":N}` | See [rate limits](../rate-limits.md) |

{% hint style="warning" %}
There is **no `account not found`** error: account-keyed readers (`account_state`,
`open_orders`, `user_rate_limit`, `staking_state`, …) return a **200** zeroed
record for an address that has never appeared on-chain — they never 404.
{% endhint %}

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
- [`POST /faucet`](./faucet.md) — devnet/testnet test-fund grant (USDC + MTF)
- [HL-compat `/info`](./hl-compat.md) — camelCase shape, additional query types
- [WS subscriptions](../ws/subscriptions.md) — push equivalents

## FAQ

**Q: Why both `asset_id` and `coin` accepted on `market_info`?**
A: `asset_id` is canonical; `coin` is a convenience for human callers. Both resolve to the same record.

**Q: Why are `user_fills` / `recent_trades` always empty?**
A: Both are honest-empty today — committed state keeps aggregate counters and the per-book `last_trade_ms` scalar, but not an itemized fill / trade log. The arrays populate once the indexer lands; subscribe to the [WS feed](../ws/subscriptions.md) for live fills in the meantime.

**Q: Is the response deterministic across nodes?**
A: Yes. Any honest node returns identical responses for the same query at the same committed height. Nodes with different commit heights may differ. Per-node identity fields (`node_info.validator_index` / `uptime_seconds`, `gossip_root_ips`) are NOT consensus state and legitimately differ. Use [`block_info`](#block_info) to see the height a node has committed to.
