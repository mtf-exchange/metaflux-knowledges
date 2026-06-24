# HL 兼容 REST 接口

:::info
**预览版。** 网关能够响应全部 HL `/info` 请求类型，并严格遵循 HL 的原始数据结构。部分类型已**接通**实时节点状态；其余类型在对应节点读取能力上线之前，返回 HL **诚实空值**形态（不返回 `null`，也不伪造数据）。每种类型的当前状态请参见下方[映射表](#hl-info-类型--mtf-原生节点类型)。
:::

## 摘要

网关对外暴露的 URL 及请求/响应格式与 HL 完全一致。HL 机器人只需将请求目标改为 MetaFlux，[无需修改任何代码](../../integration/migrating-from-hl.md)即可接入已覆盖的接口范围。HL 的响应格式——`{"error":...}` 400 信封、camelCase 字段、`[bids, asks]` 元组、十进制字符串货币数值——均被完整保留。

**网关是 HL/camelCase 格式的唯一存在位置。** 节点从头到尾使用 MTF 原生格式（snake_case、整型/`u32` id——详见 [`/info`](./info.md)）。此处所有 HL 响应均为节点 MTF 原生读取的*翻译结果*；节点本身不输出 HL 格式。

## URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

HL 兼容接口在网关前门统一挂载于 `/hl/*` 命名空间下。网关顶层的 `/info` · `/exchange` 是 MTF 原生接口（默认路径）——请将 HL 客户端指向 `/hl/*`，而非裸路径，否则将命中原生接口（原生接口会拒绝 HL 专属字段）。HL↔原生的格式转换仅存在于网关层。

## 信封约定

- `/info` 读取：成功返回 HTTP 200 及类型对应的裸 JSON 体。请求有误时（未知 `type`、缺少或无效的 `user`），返回 HTTP 400 及 `{"error":"<message>"}`。节点回程故障将如实上报：传输/5xx 错误返回 502 `{"error":...}`，节点拒绝的参数返回 400——**绝不**伪造空成功响应。
- `/exchange` 写入：遵循 HL 的 `{"status":"ok"|"err", "response":<...>}` 约定（错误也返回 200）。详见[`/exchange` 写入路径](#exchange--写入路径)。

---

## `/info` — 读取路径

只读。根据请求体中的 `type` 分发处理，镜像 HL 的 `/info`。

### HL info 类型 → MTF 原生节点类型

以下是完整的转换对照表。**翻译**规则始终如一：snake_case → camelCase、整型/分/`u32` id → 十进制字符串/`0x` 地址、节点 `{type,data}` 信封展开。转换层仅存在于网关。

| HL `/info` 类型 | 状态 | 节点 MTF 原生来源 | 备注 |
|-----------------|--------|------------------------|-------|
| `clearinghouseState` / `userState` | **已直连** | [`account_state`](./info.md#account_state) | `marginSummary` 来自节点 `balance_quote`；节点尚未暴露逐仓位状态，`assetPositions:[]` |
| `delegations` | **已直连** | [`staking_state`](./info.md#staking_state) | 节点以紧凑型 `account_id` 为键；没有紧凑 id 的真实 keccak 地址将返回诚实错误（而非伪造空列表） |
| `userFees` | **已直连** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` 实时返回；`activeReferrer`/`userVolumes`/`dailyUserVlm` 等待节点 `user_referrer`/`user_volume` 读取上线 |
| `l2Book` | 占位 | [`l2_book`](./info/perpetuals.md#l2_book) | 节点读取已存在；网关至 `{coin,levels,time}` 的格式转换尚未完成——返回 HL 空盘口 |
| `meta` | 占位 | — | 需要节点的全市场/universe 读取（节点 `market_info` 以 id 为单位）；返回 `{universe:[],marginTables:[]}` |
| `allMids` | 占位 | — | 需要 universe 读取（同 `meta` 的阻塞原因）；返回 `{}` |
| `metaAndAssetCtxs` | **已直连** | [`markets`](./info/perpetuals.md#markets) | `[meta, [assetCtx...]]`；每个永续合约 `assetCtx` 携带 `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `funding` / `openInterest` / `oraclePx`，均为十进制 USDC 字符串 |
| `openOrders` | 占位 | [`open_orders`](./info.md#open_orders) | 节点读取已存在；网关格式转换尚未完成——返回 `[]` |
| `frontendOpenOrders` | 占位 | [`open_orders`](./info.md#open_orders) | `openOrders` 附加 UI 提示字段；返回 `[]` |
| `vaultDetails` | 占位 | [`vault_state`](./info.md#vault_state) | 需要领队地址 → `vault_id` 的注册表（节点以 `vault_id` 为键）；回显请求中的 `user`，财务数据归零 |
| `subAccounts` | **已直连** | [`sub_accounts`](./info.md#sub_accounts) | 将节点 `{index,address}` 映射为 `{subAccountUser,name,master}`；`clearinghouseState` 省略（节点读取不含逐子账户的资产状态联查） |
| `referral` | 占位 | — | 推荐人通过 `Action::setReferrer` 设置且不可变；返回 `referredBy:null` |
| `spotClearinghouseState` | **已直连** | [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state) | 节点 `{asset,name,balance}` → `{coin,token,total}`；`hold:"0"` / `entryNtl:null`（节点读取无持仓锁定量/成本基础） |
| `spotMeta` / `spotMetaAndAssetCtxs` | **已直连** | [`spot_meta`](./info/spot.md#spot_meta) | 节点 `pairs` → `universe`；`tokens` 注册表来自节点真实的逐代币 `name` / `szDecimals` / `weiDecimals`（USDC 标记 `isCanonical`）；每个现货 `assetCtx` 携带 `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `circulatingSupply`，均为十进制 USDC 字符串 |
| `predictedFundings` | 占位 | — | 返回 `[]` |
| `orderStatus` | 占位 | — | 解析为 `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **已直连** | [`max_builder_fee`](./info.md#max_builder_fee) | 将节点 `max_fee_bps` 直接作为裸 HL 数字返回；未授权的交易对返回 `0` |
| `userRateLimit` | **已直连** | [`user_rate_limit`](./info.md#user_rate_limit) | 节点 `lifetime_count` → `nRequestsUsed`，基准值 `nRequestsCap`；`cumVlm:"0.0"`（此读取无节点成交量数据） |
| `userNonFundingLedgerUpdates` | 占位 | — | 返回 `[]` |
| `userFunding` / `userFundings` | 暂不提供 | — | 逐用户资金费用支付历史——由网关索引器提供（规划中） |
| `fundingHistory` | **已直连** | [`funding_history`](./info/perpetuals.md#funding_history) | 来自实时节点资金费率追踪器的逐币种溢价/实现费率样本 |
| `userFills` | **已直连** | [`user_fills`](./info.md#user_fills) | 来自已提交逐账户成交记录的明细成交日志 |
| `userFillsByTime` | **已直连** | [`user_fills_by_time`](./info.md#user_fills_by_time) | 按时间窗口筛选的 `userFills`，来自相同的已提交成交记录 |
| `historicalOrders` | 暂不提供 | — | 终态订单列表——由网关索引器提供（规划中） |
| `candleSnapshot` | 暂不提供 | — | OHLCV 历史数据——由网关索引器提供（规划中） |

图例：**已直连** = 当前读取实时节点状态 · 占位 = 返回 HL 规范的空结构，暂无节点数据支撑 · 暂不提供 = 暂无节点数据，将由网关索引器提供（规划中）。

:::info
**诚实空值**约定至关重要：HL 客户端会无条件迭代这些响应。占位类型必须返回 `[]` / `{}` / 对应类型的零值——**绝不能**在客户端期望对象的位置返回 `null`——这样未经修改的 HL SDK 无论数据是否实时，都能正常反序列化。
:::

### 已直连类型

#### `clearinghouseState` / `userState`

两个别名——均返回用户级结算所状态。**已直连**至节点 [`account_state`](./info.md#account_state)。节点的 `balance_quote`（整美元 USDC 抵押品）映射到 HL 的保证金摘要。逐仓位明细尚未在节点层暴露，因此 `assetPositions` 为 `[]`。

```json
{"type":"clearinghouseState", "user":"0x..."}
```

响应（HL 格式）：

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

一旦节点暴露逐仓位状态，`assetPositions[]` 将按 HL 格式填充：

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

**已直连**：`feeSchedule` 实时回传自节点 [`fee_schedule`](./info.md#fee_schedule)（snake_case → camelCase 转换；bps 保持 JSON 数字类型，上限 < 65536）。逐用户字段（`activeReferrer`、`userVolumes`、`dailyUserVlm`）等待节点 `user_referrer` / `user_volume` 读取上线。

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

**已直连**至节点 [`staking_state`](./info.md#staking_state)。节点以紧凑型 `account_id`（u64）为键管理质押数据，网关通过逆向地址嵌入完成映射；没有紧凑 id 的真实 keccak 地址将返回诚实错误，而非伪造空列表。

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**已直连**至节点 [`sub_accounts`](./info.md#sub_accounts)。每个节点 `{index, address}` 映射为 `{"subAccountUser","name","master"}`——`subAccountUser` 为节点子账户地址，`master` 为被查询的所有者，`name` 为 `sub-<index>` 标签（链上无子账户名称）。`clearinghouseState` 省略：节点读取不含逐子账户资产状态的联查。

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**已直连**至节点 [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state)（通过 0x `address`）。节点 `{asset, name, balance}` → HL `{coin, token, total, hold, entryNtl}`：`coin` 来自节点 `name`，`token` 来自节点 `asset` id，`total` 来自节点 `balance`。`hold` 为 `"0"`，`entryNtl` 为 `null`——节点读取不含逐余额的持仓锁定量或成本基础。

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**已直连**至节点 [`spot_meta`](./info/spot.md#spot_meta)。每个节点交易对映射为 `universe` 条目（`tokens:[base,quote]`、`index` = 交易对 id、`isCanonical` = 节点 `active`）。`tokens` 注册表基于节点真实的逐代币注册数据构建：每条记录的 `name` / `sz_decimals` / `wei_decimals` 直接映射为 HL 的 `name` / `szDecimals` / `weiDecimals`；`index` 为代币资产 id，`tokenId` 为 id 的 32 字节十六进制表示，USDC 标记 `isCanonical`。

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

节点代币 id 从 `100`（USDC）开始——完整注册表见 [`spot_meta`](./info/spot.md#spot_meta)——因此 `index` 反映的是这些 id，而非 HL 的从 `0` 开始的方案。

`spotMetaAndAssetCtxs` 返回 `[spotMeta, [spotAssetCtx...]]`；第二个元素按
`spotMeta.universe` 的索引顺序，每个交易对对应一个 `spotAssetCtx`。
每个 `spotAssetCtx` 携带交易对 `coin` 及实时行情：

```json
{
  "coin":              "MTF/USDC",
  "dayNtlVlm":         "42000.00",
  "prevDayPx":         "4.95",
  "markPx":            "5.00",
  "midPx":             "5.00",
  "circulatingSupply": "21000000.0"
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `dayNtlVlm` | 十进制字符串 | 24 小时名义成交量，单位 **USD** |
| `prevDayPx` | 十进制字符串 | 24 小时前价格，**十进制 USDC** |
| `markPx` | 十进制字符串 | 当前标记价格，**十进制 USDC** |
| `midPx` | 十进制字符串 | 当前订单簿中间价，**十进制 USDC** |
| `circulatingSupply` | 十进制字符串 | 基础代币流通供应量 |

所有价格均为十进制 USDC（人类可读）字符串，而非原始整数。

#### `maxBuilderFee`

**已直连**至节点 [`max_builder_fee`](./info.md#max_builder_fee)（0x `address` + `builder`）。将节点 `max_fee_bps` 直接作为裸 HL 数字返回（HL 输出整数，非对象）；未授权的 `(user, builder)` 交易对返回 `0`。

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**已直连**至节点 [`user_rate_limit`](./info.md#user_rate_limit)（通过 0x `address`）。节点 `lifetime_count` 映射为 `nRequestsUsed`；`nRequestsCap` 为 HL 基准值（1200）。`cumVlm` 保持 `"0.0"`——节点限速读取基于操作统计，而非成交量（等待节点成交量读取上线）。

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### 占位类型（HL 规范空结构）

以下类型返回 HL 的精确格式，内容为零值/空值。其中部分类型（`l2Book`、`openOrders`、`vaultDetails`）节点读取已存在，仅缺少网关的*格式转换*；其余类型的节点数据支撑本身尚待实现。

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

`levels` 为 `[bids, asks]` 元组（HL 格式）；每个档位为 `{"px":"...","sz":"...","n":N}`。待转换完成后将对接节点 [`l2_book`](./info/perpetuals.md#l2_book)。

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

节点 universe 读取上线后，每个 `universe` 条目格式为：`{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`。

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]`（HL 元组格式）。第二个元素按 `meta.universe` 的索引顺序，
每个永续合约市场对应一个 `assetCtx`，从实时市场状态填充：

```json
{
  "dayNtlVlm":    "1850000.00",
  "prevDayPx":    "66800.00",
  "markPx":       "67042.50",
  "midPx":        "67042.33",
  "funding":      "0.0000125",
  "openInterest": "1250.5",
  "oraclePx":     "67040.00"
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `dayNtlVlm` | 十进制字符串 | 24 小时名义成交量，单位 **USD** |
| `prevDayPx` | 十进制字符串 | 24 小时前价格，**十进制 USDC** |
| `markPx` | 十进制字符串 | 当前标记价格，**十进制 USDC** |
| `midPx` | 十进制字符串 | 当前订单簿中间价，**十进制 USDC** |
| `funding` | 十进制字符串 | 当前资金费率（按间隔计） |
| `openInterest` | 十进制字符串 | 未平仓合约量，以基础单位计 |
| `oraclePx` | 十进制字符串 | 最新预言机/指数价格，**十进制 USDC** |

所有价格均为十进制 USDC（人类可读）字符串，而非原始整数。

#### `allMids`

```json
{"type":"allMids"}
```

资产名称 → 中间价的映射：`{"BTC":"100.55","ETH":"3200.0"}`。占位返回 `{}`。

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

数组，每项为 `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`。`side`：`"B"`（买）/ `"A"`（卖）。`frontendOpenOrders` 附加 UI 字段（`triggerPx`、`isTrigger`、`isPositionTpsl`、`orderType`）。对接节点 [`open_orders`](./info.md#open_orders)。占位返回 `[]`。

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

MetaFlux 资金库与 HL 资金库并非同一实体——查询格式相同，但对象不同（参见[资金库](../../concepts/vaults.md)、[MIP-2](../../mip/mip-2.md)）。待领队→`vault_id` 注册表接入后将对接节点 [`vault_state`](./info.md#vault_state)。`managementFeeBps` / `withdrawalLockMs` 为有界 JSON 数字（HL 对参数类字段使用数字，对货币数量类字段使用字符串）。

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

`referredBy` 为 `null`（而非 `{}`）——HL 客户端以此区分"从未设置推荐人"与"已设置但未激活"。推荐人通过 `setReferrer` 设置后不可变。

#### 其他占位类型

| 类型 | 占位响应 |
|------|---------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### 暂不提供的类型

以下类型暂无节点数据支撑，当前返回 HL 的空结构；计划由网关索引器提供（规划中）：

| 类型 | 空占位 | 备注 |
|------|------------|-------|
| `historicalOrders` | `[]` | 终态订单列表 |
| `candleSnapshot` | `[]` | OHLCV 历史数据（实时 K 线请使用 WS [`candle`](../ws/subscriptions.md) 频道） |
| `userFunding` / `userFundings` | `[]` | 逐用户资金费用支付历史 |

`userFills` / `userFillsByTime` 和 `fundingHistory` 现已**直连**至实时节点状态——详见上方[转换对照表](#hl-info-类型--mtf-原生节点类型)。HL 成交记录格式：`{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`。

### `/info` 错误码

| HTTP | 响应体 | 原因 |
|------|------|-------|
| 400 | `{"error":"missing field \`type\`"}` | 缺少 `type` 判别字段 |
| 400 | `{"error":"unknown request type: <X>"}` | `type` 拼写错误或不支持 |
| 400 | `{"error":"missing field user"}` | 缺少必填的 `user` 字段 |
| 400 | `{"error":"invalid user address: <X>"}` | `user` 不符合 `0x` + 40 位十六进制格式 |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` 未提供 `coin` |
| 502 | `{"error":"<node error>"}` | 已直连类型的节点回程故障（传输/5xx） |

HL 的 `/info` 使用标准 HTTP 状态码配合 `{"error":...}`（与使用 200 + `status` 信封的 `/exchange` 不同）。

---

## `/exchange` — 写入路径

### 请求信封

```json
{
  "action":       { /* HL action object */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| 字段 | 说明 |
|-------|-------------|
| `action` | HL 格式的操作对象（见下文） |
| `nonce` | Unix 毫秒时间戳，同一签名者严格递增 |
| `signature` | RSV 对象——三个十六进制字符串 + uint `v`（27/28 或 0/1） |
| `vaultAddress` | 自有账户操作填 `null`；作为资金库管理员操作填 `"0x<vault>"` |

签名覆盖 EIP-712 信封（参见[签名操作指南](../../integration/signing.md)），使用 **MetaFlux** 域（`chainId = 31337` devnet / `114514` testnet / `8964` mainnet——见[网络](../../networks.md)）。`chainId` 必须与节点共识的 `chain_id` 一致（通过 [`/info` `node_info`](./info.md#node_info) 查询）。

### 响应信封

写入操作采用 HL 的 `{"status":"ok"|"err","response":<...>}` 约定（错误也返回 200）：

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

### 支持的操作类型

| `action.type` | 状态 | 备注 |
|---------------|--------|-------|
| `order` | 已支持 | limit / IOC / ALO；完整 TIF 集合 |
| `cancel` | 已支持 | 按 `oid` 撤单 |
| `cancelByCloid` | 灰度上线中 | 按 `cloid` 撤单 |
| `modify` / `batchModify` | 灰度上线中 | 撤单并重新挂单 |
| `scheduleCancel` | 灰度上线中 | 死亡开关 |
| `updateLeverage` / `updateIsolatedMargin` | 灰度上线中 | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | 灰度上线中 | 转账 |
| `withdraw3` | 灰度上线中 | 外部提现（MetaBridge） |
| `approveAgent` | 灰度上线中 | 代理钱包授权 |
| `vaultTransfer` / `subAccountTransfer` | 灰度上线中 | 资金划转 |
| `setReferrer` / `convertToMultiSigUser` | 灰度上线中 | — |
| `twapOrder` / `twapCancel` | 灰度上线中 | — |
| （HL 的其他操作类型） | 返回 `{"status":"err","response":"unimplemented action: <type>"}` | 请使用 [MTF 原生接口](./exchange.md) |

### `order` 示例

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

字段简写（HL 约定）：`a`=资产 id · `b`=是否买入 · `p`=限价 · `s`=数量 · `r`=仅减仓 · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=可选 16 字节 `cloid`。

触发订单：`"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`。

### `order` 响应

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

逐订单状态（按 `orders[]` 顺序一一对应）：

| 变体 | 含义 |
|---------|---------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | 已挂入订单簿 |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | 立即成交 |
| `{"error":"<reason>"}` | 该条目被拒绝（其他条目可能成功） |

### `cancel` 示例

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

响应：`{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`。每个撤单条目：`"success"` 或 `{"error":"<reason>"}`。

### `/exchange` 错误码

| 响应体 | 原因 |
|------|-------|
| `{"status":"err","response":"signature_invalid"}` | 恢复出的地址与签名者不符 / chainId 错误 |
| `{"status":"err","response":"unimplemented action: <type>"}` | 兼容接口尚未覆盖该操作 |
| `{"status":"err","response":"nonce too small"}` | nonce 重复使用 |
| `{"status":"err","response":"agent_not_approved"}` | 代理签名但无授权记录 |

---

## 与 HL 的已知差异

完整参考请见[从 HL 迁移](../../integration/migrating-from-hl.md)。以下为重点提示：

- **签名域中的 `chainId`** 为 MetaFlux 的值（`31337` devnet / `114514` testnet / `8964` mainnet），而非 HL 的（`998`/`999`）。
- **资产 ID 与 HL 的数值不同。** 请通过 `info { "type": "meta" }` 查询（待该读取上线后）；切勿硬编码。
- **T0 黄牌**清算档位在 MTF 上存在（介于健康状态与 HL 的"部分清算"之间）。监听清算事件的机器人会看到一种额外的事件类型。
- **`order` / `cancel` 以外的 HL 操作类型**在灰度期间返回 `err`。请使用 MTF 原生接口 [`POST /exchange`](./exchange.md)，或等待灰度完成。
- **明细读取** `userFills` / `userFillsByTime` / `fundingHistory` 现已从已提交节点状态实时提供。其余历史读取（`historicalOrders`、`candleSnapshot`、`userFunding`）暂不提供，计划由网关索引器实现（规划中）。过渡期间请使用 WS [`userFills`](../ws/subscriptions.md) / [`candle`](../ws/subscriptions.md) 频道获取实时数据。

## 另请参阅

- [`POST /info`](./info.md) — MTF 原生节点读取（HL 类型的原始数据来源）
- [`POST /exchange`](./exchange.md) — MTF 原生写入路径
- [CCXT 兼容](./ccxt-compat.md) — 另一个兼容接口
- [从 HL 迁移](../../integration/migrating-from-hl.md) · [签名操作指南](../../integration/signing.md) · [错误码](../errors.md)
