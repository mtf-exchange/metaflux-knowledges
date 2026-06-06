# HL-compat REST surface

{% hint style="info" %}
**Preview.** The gateway answers every HL `/info` request type with HL's exact wire shape. Some types are **wired** to live node state today; the rest return HL's **honest-empty** shape (never `null`, never a fabricated value) until the corresponding node read or [indexer](../data-files.md) lands. The status of each type is in the [translation table](#hl-info-type--mtf-native-node-type) below.
{% endhint %}

## TL;DR

The gateway exposes URLs and request/response shapes identical to Hyperliquid's. HL bots point at MetaFlux with [zero code change](../../integration/migrating-from-hl.md) for the covered surface. The wire format — HL's `{"error":...}` 400 envelope, camelCase fields, `[bids, asks]` tuples, decimal-string monetary magnitudes — is preserved exactly.

**The gateway is the ONLY place HL/camelCase shapes live.** The node is MTF-native end to end (snake_case, integer/`u32` ids — see [`/info`](./info.md)). Every HL response here is a *translation* of a node MTF-native read; the node never speaks HL.

## URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

HL-compat is namespaced under `/hl/*` on the gateway front door. The gateway's
top-level `/info` · `/exchange` are MTF-native (the default path) — point HL
clients at `/hl/*`, not the bare paths, or you'll hit the native surface (which
rejects HL-only fields). The HL↔native translation lives only in the gateway.

## Envelope convention

- `/info` reads: HTTP 200 with the bare type-specific JSON body. On a bad request (unknown `type`, missing/invalid `user`), HTTP 400 with `{"error":"<message>"}`. A node-backhaul fault surfaces honestly: 502 `{"error":...}` for transport/5xx, 400 for params the node rejected — **never** a fabricated empty success.
- `/exchange` writes: HL's `{"status":"ok"|"err", "response":<...>}` convention (errors-are-200s). See [`/exchange` below](#exchange--write-path).

---

## `/info` — read path

Read-only. Dispatches on the request body's `type`. Mirrors HL's `/info`.

### HL info type → MTF-native node type

This is the master map. **Translation** is always: snake_case → camelCase, integer/cents/`u32`-id → decimal-string / `0x`-address, node `{type,data}` envelope unwrapped. The translation layer lives only in the gateway.

| HL `/info` type | Status | Node MTF-native source | Notes |
|-----------------|--------|------------------------|-------|
| `clearinghouseState` / `userState` | **wired** | [`account_state`](./info.md#account_state) | `marginSummary` from node `balance_quote`; `assetPositions:[]` until node surfaces per-position state |
| `delegations` | **wired** | [`staking_state`](./info.md#staking_state) | node is keyed by compact `account_id`; a real keccak address with no compact id returns an honest error (not a fake empty) |
| `userFees` | **wired** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` is live; `activeReferrer`/`userVolumes`/`dailyUserVlm` await node `user_referrer`/`user_volume` reads |
| `l2Book` | stub | [`l2_book`](./info.md#l2_book) | node read exists; gateway translation to `{coin,levels,time}` not yet wired — returns HL-empty book |
| `meta` | stub | — | needs a node list-all-markets / universe read (node `market_info` is per-id); returns `{universe:[],marginTables:[]}` |
| `allMids` | stub | — | needs the universe read (same blocker as `meta`); returns `{}` |
| `metaAndAssetCtxs` | stub | — | `[meta, []]` until the universe read + asset-ctx aggregation land |
| `openOrders` | stub | [`open_orders`](./info.md#open_orders) | node read exists; gateway translation not yet wired — returns `[]` |
| `frontendOpenOrders` | stub | [`open_orders`](./info.md#open_orders) | `openOrders` + UI hints; returns `[]` |
| `vaultDetails` | stub | [`vault_state`](./info.md#vault_state) | needs a leader-address → `vault_id` registry (node keys by `vault_id`); echoes request `user`, zeroed financials |
| `subAccounts` | **wired** | [`sub_accounts`](./info.md#sub_accounts) | maps node `{index,address}` → `{subAccountUser,name,master}`; `clearinghouseState` omitted (no per-sub join on the node read) |
| `referral` | stub | — | referrer is `Action::setReferrer`-set, immutable; returns `referredBy:null` |
| `spotClearinghouseState` | **wired** | [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) | node `{asset,name,balance}` → `{coin,token,total}`; `hold:"0"` / `entryNtl:null` (no hold/cost-basis on the node read) |
| `spotMeta` / `spotMetaAndAssetCtxs` | **wired** | [`spot_meta`](./info.md#spot_meta) | node `pairs` → `universe`; `tokens` registry from node's real per-token `name` / `szDecimals` / `weiDecimals` (USDC `isCanonical`); spot AssetCtx px/volume zeroed (no node spot-ctx read) |
| `predictedFundings` | stub | — | returns `[]` |
| `orderStatus` | stub | — | resolves to `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **wired** | [`max_builder_fee`](./info.md#max_builder_fee) | projects node `max_fee_bps` as the bare HL number; unapproved pair → `0` |
| `userRateLimit` | **wired** | [`user_rate_limit`](./info.md#user_rate_limit) | node `lifetime_count` → `nRequestsUsed`, baseline `nRequestsCap`; `cumVlm:"0.0"` (no node volume on this read) |
| `userNonFundingLedgerUpdates` | stub | — | returns `[]` |
| `userFunding` / `userFundings` | 🚧 indexer | — | per-user funding-payment history — fed by [indexer](../data-files.md) |
| `fundingHistory` | 🚧 indexer | [`funding_history`](./info.md#funding_history) (live samples) | per-coin historical rates over a window — archived by the indexer |
| `userFills` | 🚧 indexer | [`user_fills`](./info.md#user_fills) (honest-empty on node) | itemized fill log — fed by [`node_fills`](../data-files.md#node_fills--per-fill-records) |
| `userFillsByTime` | 🚧 indexer | — | time-windowed `userFills` |
| `historicalOrders` | 🚧 indexer | — | terminal-state orders — fed by [`node_order_statuses`](../data-files.md#node_order_statuses--order-lifecycle) |
| `candleSnapshot` | 🚧 indexer | — | OHLCV bars — fed by [`node_trades`](../data-files.md#node_trades--public-trade-tape) |

Legend: **wired** = live node state today · stub = HL-correct empty shape, no node backing yet · 🚧 indexer = served once the [data-file indexer](../data-files.md) lands.

{% hint style="info" %}
The **honest-empty** contract is load-bearing: HL clients iterate these responses unconditionally. A stub must emit `[]` / `{}` / the typed zero — **never** `null` where a client expects an object — so unmodified HL SDKs deserialize identically whether the data is live or pending.
{% endhint %}

### Wired types

#### `clearinghouseState` / `userState`

Two aliases — both return per-user clearinghouse state. **Wired** to node [`account_state`](./info.md#account_state). The node's `balance_quote` (whole-dollar USDC collateral) maps onto the HL margin summary. Per-position detail is not yet on the node surface, so `assetPositions` is `[]`.

```json
{"type":"clearinghouseState", "user":"0x..."}
```

Response (HL shape):

```json
{
  "assetPositions": [],
  "marginSummary": {
    "accountValue":    "1000.0",
    "totalNtlPos":     "0.0",
    "totalRawUsd":     "1000.0",
    "totalMarginUsed": "0.0"
  },
  "crossMarginSummary":         { "accountValue": "1000.0", "totalNtlPos": "0.0", "totalRawUsd": "1000.0", "totalMarginUsed": "0.0" },
  "crossMaintenanceMarginUsed": "0.0",
  "withdrawable":               "1000.0",
  "time":                       0
}
```

Once the node surfaces per-position state, `assetPositions[]` fills with HL's shape:

```json
{
  "type":     "oneWay",
  "position": {
    "coin":           "BTC",
    "szi":            "1.0",
    "entryPx":        "100.0",
    "leverage":       { "type": "cross", "value": 10 },
    "marginUsed":     "10.5",
    "unrealizedPnl":  "0.5",
    "returnOnEquity": "0.05",
    "liquidationPx":  "92.5",
    "positionValue":  "100.5",
    "maxLeverage":    50,
    "cumFunding":     { "allTime": "0.123", "sinceOpen": "0.05" }
  }
}
```

#### `userFees`

**Wired**: `feeSchedule` backhauls live from node [`fee_schedule`](./info.md#fee_schedule) (snake→camel re-cased; bps stay JSON numbers, bounded < 65536). The per-user pieces (`activeReferrer`, `userVolumes`, `dailyUserVlm`) await node `user_referrer` / `user_volume` reads.

```json
{"type":"userFees","user":"0x..."}
```

```json
{
  "activeReferrer": null,
  "userVolumes":    [],
  "feeSchedule": {
    "takerBps":         5,
    "makerBps":         2,
    "referrerShareBps": 0,
    "builderCapBps":    8,
    "deployerCapBps":   0,
    "burnBps":          0,
    "vaultBps":         0,
    "validatorBps":     0,
    "treasuryBps":      0
  },
  "dailyUserVlm":   "0.0"
}
```

#### `delegations`

**Wired** to node [`staking_state`](./info.md#staking_state). The node keys staking by compact `account_id` (u64), so the gateway inverts its address embedding; a real keccak address with no compact id returns an honest error rather than a fabricated empty list.

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**Wired** to node [`sub_accounts`](./info.md#sub_accounts). Each node `{index, address}` maps to `{"subAccountUser","name","master"}` — `subAccountUser` is the node sub-account address, `master` is the queried owner, `name` is a `sub-<index>` label (no on-chain sub-account label). `clearinghouseState` is omitted: the node read carries no per-sub account-state join.

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**Wired** to node [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) (by 0x `address`). Node `{asset, name, balance}` → HL `{coin, token, total, hold, entryNtl}`: `coin` from node `name`, `token` from node `asset` id, `total` from node `balance`. `hold` is `"0"` and `entryNtl` is `null` — the node read has no per-balance hold or cost basis.

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**Wired** to node [`spot_meta`](./info.md#spot_meta). Each node pair maps onto a `universe` entry (`tokens:[base,quote]`, `index` = pair id, `isCanonical` = node `active`). The `tokens` registry is built from the node's real per-token registry: each entry's `name` / `sz_decimals` / `wei_decimals` map straight onto HL `name` / `szDecimals` / `weiDecimals`; `index` is the token asset id, `tokenId` is the 32-byte hex of the id, and USDC is flagged `isCanonical`. `spotMetaAndAssetCtxs` returns `[spotMeta, [spotAssetCtx]]`; each `spotAssetCtx` carries the pair `coin` with zeroed `markPx`/`midPx`/volume (no node spot-ctx read yet).

```json
{"type":"spotMeta"}
```

```json
{
  "tokens":   [ { "name": "USDC", "szDecimals": 2, "weiDecimals": 6, "index": 100, "tokenId": "0x...", "isCanonical": true },
                { "name": "MTF",  "szDecimals": 2, "weiDecimals": 8, "index": 104, "tokenId": "0x...", "isCanonical": false } ],
  "universe": [ { "name": "MTF/USDC", "tokens": [104, 100], "index": 113, "isCanonical": true } ]
}
```

The node's token ids start at `100` (USDC) — see [`spot_meta`](./info.md#spot_meta) for the full registry — so `index` reflects those ids, not HL's `0`-based scheme.

#### `maxBuilderFee`

**Wired** to node [`max_builder_fee`](./info.md#max_builder_fee) (0x `address` + `builder`). Returns the node `max_fee_bps` as the bare HL number (HL emits the integer, not an object); an unapproved `(user, builder)` pair → `0`.

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**Wired** to node [`user_rate_limit`](./info.md#user_rate_limit) (by 0x `address`). The node `lifetime_count` maps onto `nRequestsUsed`; `nRequestsCap` is the HL baseline (1200). `cumVlm` stays `"0.0"` — the node's rate-limit read is action-stat-based, not volume-based (awaiting a node volume read).

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### Stub types (HL-correct empty shape)

These return HL's exact shape with zeroed/empty contents. The node read exists for several (`l2Book`, `openOrders`, `vaultDetails`) — only the gateway *translation* is pending; for the rest the node backing itself is pending.

#### `l2Book`

```json
{"type":"l2Book","coin":"BTC"}
```

```json
{
  "coin": "BTC",
  "levels": [ [ /* bids */ ], [ /* asks */ ] ],
  "time": 0
}
```

`levels` is a `[bids, asks]` tuple (HL shape); each level is `{"px":"...","sz":"...","n":N}`. Backs onto node [`l2_book`](./info.md#l2_book) once the translation is wired.

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

Each `universe` entry (once the node universe read lands): `{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`.

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]` (HL's tuple shape). Each `assetCtx`: `{"funding","openInterest","prevDayPx","markPx","oraclePx","midPx"}` — all decimal strings. Stub: `[{"universe":[],"marginTables":[]}, []]`.

#### `allMids`

```json
{"type":"allMids"}
```

Map of asset name → mid price: `{"BTC":"100.55","ETH":"3200.0"}`. Stub: `{}`.

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

Array of `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`. `side`: `"B"` (buy) / `"A"` (sell). `frontendOpenOrders` adds UI fields (`triggerPx`, `isTrigger`, `isPositionTpsl`, `orderType`). Backs onto node [`open_orders`](./info.md#open_orders). Stub: `[]`.

#### `vaultDetails`

```json
{"type":"vaultDetails","user":"0x..."}
```

```json
{
  "vaultAddress":     "0x...",
  "leader":           "0x...",
  "shares":           "0.0",
  "navUsd":           "0.0",
  "isPaused":         false,
  "managementFeeBps": 1000,
  "withdrawalLockMs": 345600000,
  "createdAtMs":      0,
  "followerCount":    0
}
```

MetaFlux vaults are not HL vaults — same query shape, different entities (see [vaults](../../concepts/vaults.md), [MIP-2](../../mip/mip-2.md)). Backs onto node [`vault_state`](./info.md#vault_state) once the leader→`vault_id` registry is wired. `managementFeeBps` / `withdrawalLockMs` are bounded JSON numbers (HL keeps numbers for parameters, strings for monetary quantities).

#### `referral`

```json
{
  "referredBy": null,
  "referrerState": {
    "cumVlm": "0.0",
    "cumRewardedFeesSinceReferred": "0.0",
    "cumFeesRewardedToReferrer": "0.0",
    "claimedRewards": "0.0"
  },
  "rewardHistory": []
}
```

`referredBy` is `null` (not `{}`) — HL clients distinguish "no referrer ever set" from "set but inactive". Referrer is `setReferrer`-immutable.

#### Other stubs

| Type | Stub response |
|------|---------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### 🚧 Indexer-backed types

Served once the [data-file indexer](../data-files.md) lands. Each returns HL's empty shape today:

| Type | Empty stub | Fed by |
|------|------------|--------|
| `userFills` | `[]` | [`node_fills`](../data-files.md#node_fills--per-fill-records) |
| `userFillsByTime` | `[]` | `node_fills` |
| `historicalOrders` | `[]` | [`node_order_statuses`](../data-files.md#node_order_statuses--order-lifecycle) |
| `candleSnapshot` | `[]` | [`node_trades`](../data-files.md#node_trades--public-trade-tape) |
| `fundingHistory` | `[]` | indexer (node keeps live samples in [`funding_history`](./info.md#funding_history)) |
| `userFunding` / `userFundings` | `[]` | indexer |

The HL fill record shape (once live): `{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`.

### Errors on `/info`

| HTTP | Body | Cause |
|------|------|-------|
| 400 | `{"error":"missing field \`type\`"}` | No `type` discriminator |
| 400 | `{"error":"unknown request type: <X>"}` | Misspelled / unsupported `type` |
| 400 | `{"error":"missing field user"}` | Required `user` omitted |
| 400 | `{"error":"invalid user address: <X>"}` | `user` not `0x` + 40 hex |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` without `coin` |
| 502 | `{"error":"<node error>"}` | Wired type whose node backhaul faulted (transport/5xx) |

HL's `/info` uses standard HTTP status codes with `{"error":...}` (unlike `/exchange`, which uses the 200-with-`status` envelope).

---

## `/exchange` — write path

### Request envelope

```json
{
  "action":       { /* HL action object */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| Field | Description |
|-------|-------------|
| `action` | HL-shape action (see below) |
| `nonce` | Unix ms, strictly increasing per signer |
| `signature` | RSV object — three hex strings + uint `v` (27/28 or 0/1) |
| `vaultAddress` | `null` for own account; `"0x<vault>"` to act as a vault manager |

Signature is over the EIP-712 envelope (see [signing walkthrough](../../integration/signing.md)) using the **MetaFlux** domain (`chainId = 31337` devnet / `114514` testnet / `8964` mainnet — see [networks](../../networks.md)). The `chainId` must equal the node's consensus `chain_id` (query [`/info` `node_info`](./info.md#node_info)).

### Response envelope

Writes use HL's `{"status":"ok"|"err","response":<...>}` convention (errors-are-200s):

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

### Supported action types

| `action.type` | Status | Notes |
|---------------|--------|-------|
| `order` | supported | limit / IOC / ALO; full TIF set |
| `cancel` | supported | by `oid` |
| `cancelByCloid` | rolling out | by `cloid` |
| `modify` / `batchModify` | rolling out | cancel-replace |
| `scheduleCancel` | rolling out | dead-man's switch |
| `updateLeverage` / `updateIsolatedMargin` | rolling out | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | rolling out | transfers |
| `withdraw3` | rolling out | external withdraw (CCTP) |
| `approveAgent` | rolling out | agent wallet approval |
| `vaultTransfer` / `subAccountTransfer` | rolling out | fund movement |
| `setReferrer` / `convertToMultiSigUser` | rolling out | — |
| `twapOrder` / `twapCancel` | rolling out | — |
| (everything else HL ships) | returns `{"status":"err","response":"unimplemented action: <type>"}` | Use [MTF-native](./exchange.md) for those |

### `order` example

```json
{
  "action": {
    "type": "order",
    "orders": [
      { "a": 0, "b": true, "p": "100.5", "s": "1.0", "r": false, "t": { "limit": { "tif": "Gtc" } } }
    ],
    "grouping": "na"
  },
  "nonce": 1735689600000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Field shorthand (HL convention): `a`=asset id · `b`=is_buy · `p`=limit price · `s`=size · `r`=reduce_only · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=optional 16-byte `cloid`.

Trigger orders: `"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`.

### `order` response

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

Per-order status (one per `orders[]` entry, in order):

| Variant | Meaning |
|---------|---------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | Posted to book |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | Filled immediately |
| `{"error":"<reason>"}` | This entry rejected (others may succeed) |

### `cancel` example

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Response: `{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`. Per-cancel entry: `"success"` or `{"error":"<reason>"}`.

### Errors on `/exchange`

| Body | Cause |
|------|-------|
| `{"status":"err","response":"signature_invalid"}` | Recovered address ≠ signer / wrong chainId |
| `{"status":"err","response":"unimplemented action: <type>"}` | Compat surface doesn't yet cover this action |
| `{"status":"err","response":"nonce too small"}` | Reused nonce |
| `{"status":"err","response":"agent_not_approved"}` | Agent signed but no approval exists |

---

## Differences from HL worth knowing

See [migrating from HL](../../integration/migrating-from-hl.md) for the full reference. Quick highlights:

- **`chainId`** in the signing domain is MetaFlux's (`31337` devnet / `114514` testnet / `8964` mainnet), NOT HL's (`998`/`999`).
- **Asset IDs are not numerically the same** as HL's. Look up via `info { "type": "meta" }` once that read is wired; never hard-code.
- **T0 yellow card** liquidation tier exists on MTF (between healthy and HL's "Partial Liquidation"). Bots that watch liquidation events see one more event type.
- **HL action types beyond `order` / `cancel`** return `err` during rollout. Use MTF-native [`POST /exchange`](./exchange.md), or wait.
- **Historical / itemized reads** (`userFills`, `historicalOrders`, `candleSnapshot`, `fundingHistory`) are 🚧 indexer-backed — empty until the [data-file indexer](../data-files.md) lands. Use the WS [`userFills`](../ws/subscriptions.md) channel for live fills meanwhile.

## See also

- [`POST /info`](./info.md) — MTF-native node reads these HL types translate from
- [`POST /exchange`](./exchange.md) — MTF-native write path
- [CCXT-compat](./ccxt-compat.md) — the other compat surface
- [Node data files](../data-files.md) — the indexer feedstock behind the 🚧 types
- [Migrating from HL](../../integration/migrating-from-hl.md) · [Signing walkthrough](../../integration/signing.md) · [Errors](../errors.md)
