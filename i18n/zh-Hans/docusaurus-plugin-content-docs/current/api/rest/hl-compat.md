# HL-compat REST 接口

:::info
**预览。** 网关为每个 HL `/info` 请求类型返回 HL 的精确 wire 形状。某些类型已**接入**到实时节点状态；其余类型返回 HL 的**诚实空**形状（永不为 `null`，永不为虚构值），直到对应的节点读取落地。每种类型的状态见下方的[翻译表](#hl-info-type--mtf-native-node-type)。
:::

## TL;DR

网关暴露与 HL 相同的 URL 和请求/响应形状。HL 机器人可以[零代码改动](../../integration/migrating-from-hl.md)地指向 MetaFlux 来使用已覆盖的接口。wire 格式保持完全一致 — HL 的 `{"error":...}` 400 信封、camelCase 字段、`[bids, asks]` 元组、十进制字符串货币量。

**网关是 HL/camelCase 形状唯一存在的地方。** 节点端到端采用 MTF-native 方式（snake_case、整数/`u32` id — 见 [`/info`](./info.md)）。这里的每个 HL 响应都是对节点 MTF-native 读取的*翻译*；节点从不使用 HL 方言。

## URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

HL-compat 在网关前门的 `/hl/*` 命名空间下。网关顶层的 `/info` · `/exchange` 是 MTF-native 的（默认路径） — 让 HL 客户端指向 `/hl/*`，不要用裸路径，否则会命中 native 接口（会拒绝 HL-only 字段）。HL↔native 翻译仅存在于网关。

## 信封约定

- `/info` 读取：HTTP 200 返回纯 JSON 类型体。请求错误（未知 `type`、缺失/无效 `user`）时返回 HTTP 400 `{"error":"<message>"}`。节点回源故障诚实地浮现：502 `{"error":...}` 用于传输/5xx，400 用于节点拒绝的参数 — **永不**返回虚构的空成功。
- `/exchange` 写入：HL 的 `{"status":"ok"|"err", "response":<...>}` 约定（错误即 200）。见下方 [`/exchange` 小节](#exchange--write-path)。

---

## `/info` — 读取路径

只读。根据请求体的 `type` 分派。镜像 HL 的 `/info`。

### HL info type → MTF-native node type

这是主映射表。**翻译**总是：snake_case → camelCase，整数/美分/`u32`-id → 十进制字符串/`0x`-地址，节点 `{type,data}` 信封解包。翻译层仅存在于网关。

| HL `/info` 类型 | 状态 | 节点 MTF-native 源 | 备注 |
|-----------------|--------|------------------------|-------|
| `clearinghouseState` / `userState` | **接入** | [`account_state`](./info.md#account_state) | `marginSummary` 来自节点 `balance_quote`；`assetPositions:[]` 直到节点浮现逐头寸状态 |
| `delegations` | **接入** | [`staking_state`](./info.md#staking_state) | 节点以紧凑 `account_id` 键入；真实 keccak 地址若无紧凑 id 则返回诚实错误（非虚构空列表） |
| `userFees` | **接入** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` 实时；`activeReferrer`/`userVolumes`/`dailyUserVlm` 等待节点 `user_referrer`/`user_volume` 读取 |
| `l2Book` | 存根 | [`l2_book`](./info.md#l2_book) | 节点读取存在；网关翻译至 `{coin,levels,time}` 尚未接入 — 返回 HL-empty 订单簿 |
| `meta` | 存根 | — | 需要节点列表所有市场/universe 读取（节点 `market_info` 是逐 id 的）；返回 `{universe:[],marginTables:[]}` |
| `allMids` | 存根 | — | 需要 universe 读取（同 `meta` 的阻塞因素）；返回 `{}` |
| `metaAndAssetCtxs` | **接入** | [`markets`](./info.md#markets) | `[meta, [assetCtx...]]`；逐 perp `assetCtx` 携带 `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `funding` / `openInterest` / `oraclePx`，全部十进制 USDC 字符串 |
| `openOrders` | 存根 | [`open_orders`](./info.md#open_orders) | 节点读取存在；网关翻译尚未接入 — 返回 `[]` |
| `frontendOpenOrders` | 存根 | [`open_orders`](./info.md#open_orders) | `openOrders` + UI 提示；返回 `[]` |
| `vaultDetails` | 存根 | [`vault_state`](./info.md#vault_state) | 需要 leader 地址 → `vault_id` 注册表（节点以 `vault_id` 键入）；回显请求 `user`，财务清零 |
| `subAccounts` | **接入** | [`sub_accounts`](./info.md#sub_accounts) | 映射节点 `{index,address}` → `{subAccountUser,name,master}`；`clearinghouseState` 省略（节点读取无逐子账户联接） |
| `referral` | 存根 | — | referrer 由 `Action::setReferrer` 设置，不可变；返回 `referredBy:null` |
| `spotClearinghouseState` | **接入** | [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) | 节点 `{asset,name,balance}` → `{coin,token,total}`；`hold:"0"` / `entryNtl:null`（节点读取无 hold/成本基础） |
| `spotMeta` / `spotMetaAndAssetCtxs` | **接入** | [`spot_meta`](./info.md#spot_meta) | 节点 `pairs` → `universe`；`tokens` 注册表从节点真实逐 token `name` / `szDecimals` / `weiDecimals`；各 spot `assetCtx` 携带 `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `circulatingSupply`，十进制 USDC 字符串 |
| `predictedFundings` | 存根 | — | 返回 `[]` |
| `orderStatus` | 存根 | — | 解析为 `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **接入** | [`max_builder_fee`](./info.md#max_builder_fee) | 投影节点 `max_fee_bps` 为纯 HL 数字；未批准的对 → `0` |
| `userRateLimit` | **接入** | [`user_rate_limit`](./info.md#user_rate_limit) | 节点 `lifetime_count` → `nRequestsUsed`，基线 `nRequestsCap`；`cumVlm:"0.0"`（此读取无节点量） |
| `userNonFundingLedgerUpdates` | 存根 | — | 返回 `[]` |
| `userFunding` / `userFundings` | 不服务 | — | 逐用户资金支付历史 — 由网关索引器服务（待办） |
| `fundingHistory` | **接入** | [`funding_history`](./info.md#funding_history) | 逐币种 premium/realized-rate 采样覆盖一个窗口，来自实时节点资金追踪器 |
| `userFills` | **接入** | [`user_fills`](./info.md#user_fills) | 逐项成交日志，来自已提交的逐账户成交带 |
| `userFillsByTime` | **接入** | [`user_fills_by_time`](./info.md#user_fills_by_time) | 时间窗口化的 `userFills`，同一已提交成交带 |
| `historicalOrders` | 不服务 | — | 终端态订单列表 — 由网关索引器服务（待办） |
| `candleSnapshot` | 不服务 | — | OHLCV 历史 — 由网关索引器服务（待办） |

图例：**接入** = 今天实时节点状态 · 存根 = HL-correct 空形状，尚无节点支撑 · 不服务 = 尚无节点支撑，由网关索引器服务（待办）。

:::info
**诚实空**约定是关键：HL 客户端无条件迭代这些响应。存根必须发出 `[]` / `{}` / 类型零 — **永不** `null` 而客户端期望对象 — 所以未修改的 HL SDK 无论数据是实时还是待决都相同地反序列化。
:::

### 接入的类型

#### `clearinghouseState` / `userState`

两个别名 — 均返回逐用户清算所状态。**接入**到节点 [`account_state`](./info.md#account_state)。节点的 `balance_quote`（整刀 USDC 抵押品）映射到 HL margin 摘要。逐头寸细节尚未在节点表面，故 `assetPositions` 是 `[]`。

```json
{"type":"clearinghouseState", "user":"0x..."}
```

响应（HL 形状）：

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

节点浮现逐头寸状态后，`assetPositions[]` 填充 HL 的形状：

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

**接入**：`feeSchedule` 从节点 [`fee_schedule`](./info.md#fee_schedule) 实时回源（snake→camel 重新编码；bps 保持 JSON 数字，有界 < 65536）。逐用户部分（`activeReferrer`、`userVolumes`、`dailyUserVlm`）等待节点 `user_referrer` / `user_volume` 读取。

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

**接入**到节点 [`staking_state`](./info.md#staking_state)。节点以紧凑 `account_id`（u64）键入质押，故网关反演其地址嵌入；真实 keccak 地址若无紧凑 id 则返回诚实错误而非虚构空列表。

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**接入**到节点 [`sub_accounts`](./info.md#sub_accounts)。各节点 `{index, address}` 映射为 `{"subAccountUser","name","master"}` — `subAccountUser` 是节点子账户地址，`master` 是查询的所有者，`name` 是 `sub-<index>` 标签（无链上子账户标签）。`clearinghouseState` 省略：节点读取无逐子账户账户态联接。

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**接入**到节点 [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state)（按 0x `address`）。节点 `{asset, name, balance}` → HL `{coin, token, total, hold, entryNtl}`：`coin` 来自节点 `name`，`token` 来自节点 `asset` id，`total` 来自节点 `balance`。`hold` 是 `"0"`，`entryNtl` 是 `null` — 节点读取无逐余额 hold 或成本基础。

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**接入**到节点 [`spot_meta`](./info.md#spot_meta)。各节点对映射为 `universe` 条目（`tokens:[base,quote]`、`index` = 对 id、`isCanonical` = 节点 `active`）。`tokens` 注册表建自节点真实逐 token 注册表：各条目的 `name` / `sz_decimals` / `wei_decimals` 直接映射到 HL `name` / `szDecimals` / `weiDecimals`；`index` 是 token asset id，`tokenId` 是 id 的 32 字节十六进制，USDC 标记为 `isCanonical`。

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

节点的 token id 始于 `100`（USDC） — 见 [`spot_meta`](./info.md#spot_meta) 的完整注册表 — 故 `index` 反映这些 id，不是 HL 的 `0` 基数方案。

`spotMetaAndAssetCtxs` 返回 `[spotMeta, [spotAssetCtx...]]`；第二个
元素是逐对一个 `spotAssetCtx`，索引对齐到 `spotMeta.universe`。
各 `spotAssetCtx` 携带对 `coin` 加上实时上下文：

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

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `dayNtlVlm` | 十进制字符串 | 24 小时名义量，以**美元**计 |
| `prevDayPx` | 十进制字符串 | 24 小时前价格，**十进制 USDC** |
| `markPx` | 十进制字符串 | 当前标记价格，**十进制 USDC** |
| `midPx` | 十进制字符串 | 当前订单簿中位，**十进制 USDC** |
| `circulatingSupply` | 十进制字符串 | 基础币种流通供应量 |

所有价格都是十进制 USDC（人类可读）字符串，不是原始整数。

#### `maxBuilderFee`

**接入**到节点 [`max_builder_fee`](./info.md#max_builder_fee)（0x `address` + `builder`）。返回节点 `max_fee_bps` 为纯 HL 数字（HL 为参数发出整数，为货币量发出字符串）；未批准的 `(user, builder)` 对 → `0`。

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**接入**到节点 [`user_rate_limit`](./info.md#user_rate_limit)（按 0x `address`）。节点 `lifetime_count` 映射到 `nRequestsUsed`；`nRequestsCap` 是 HL 基线（1200）。`cumVlm` 保持 `"0.0"` — 节点速率限制读取是基于动作统计，不基于量（等待节点量读取）。

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### 存根类型（HL-correct 空形状）

这些返回 HL 的精确形状且内容清零/为空。节点读取存在于几个（`l2Book`、`openOrders`、`vaultDetails`）— 仅网关*翻译*待决；其余的是节点支撑本身待决。

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

`levels` 是 `[bids, asks]` 元组（HL 形状）；各层级是 `{"px":"...","sz":"...","n":N}`。翻译接入后支撑节点 [`l2_book`](./info.md#l2_book)。

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

各 `universe` 条目（节点 universe 读取落地后）：`{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`。

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]`（HL 的元组形状）。第二个元素是逐 perp 市场一个 `assetCtx`，索引对齐到 `meta.universe`。各 `assetCtx` 从实时市场状态填充：

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

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `dayNtlVlm` | 十进制字符串 | 24 小时名义量，以**美元**计 |
| `prevDayPx` | 十进制字符串 | 24 小时前价格，**十进制 USDC** |
| `markPx` | 十进制字符串 | 当前标记价格，**十进制 USDC** |
| `midPx` | 十进制字符串 | 当前订单簿中位，**十进制 USDC** |
| `funding` | 十进制字符串 | 当前资金费率（逐间隔） |
| `openInterest` | 十进制字符串 | 未平仓量，以基础单位计 |
| `oraclePx` | 十进制字符串 | 最新预言机/指数价格，**十进制 USDC** |

所有价格都是十进制 USDC（人类可读）字符串，不是原始整数。

#### `allMids`

```json
{"type":"allMids"}
```

资产名 → 中位价的映射：`{"BTC":"100.55","ETH":"3200.0"}`。存根：`{}`。

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

数组 `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`。`side`：`"B"`（买）/ `"A"`（卖）。`frontendOpenOrders` 添加 UI 字段（`triggerPx`、`isTrigger`、`isPositionTpsl`、`orderType`）。支撑节点 [`open_orders`](./info.md#open_orders)。存根：`[]`。

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

MetaFlux vault 非 HL vault — 查询形状相同，实体不同（见[金库](../../concepts/vaults.md)、[MIP-2](../../mip/mip-2.md)）。leader → `vault_id` 注册表接入后支撑节点 [`vault_state`](./info.md#vault_state)。`managementFeeBps` / `withdrawalLockMs` 是有界 JSON 数字（HL 为参数保留数字，为货币量保留字符串）。

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

`referredBy` 是 `null`（非 `{}`） — HL 客户端区分"从未设置 referrer"与"设置但不活跃"。Referrer 由 `setReferrer` 不可变。

#### 其他存根

| 类型 | 存根响应 |
|------|---------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### 尚未服务的类型

这些尚无节点支撑且今天返回 HL 的空形状；列入网关索引器待办：

| 类型 | 空存根 | 备注 |
|------|------------|-------|
| `historicalOrders` | `[]` | 终端态订单列表 |
| `candleSnapshot` | `[]` | OHLCV 历史（实时行情栏用 WS [`candle`](../ws/subscriptions.md) 通道） |
| `userFunding` / `userFundings` | `[]` | 逐用户资金支付历史 |

`userFills` / `userFillsByTime` 和 `fundingHistory` 现已**接入**实时节点状态 — 见上方[翻译表](#hl-info-type--mtf-native-node-type)。HL 成交记录形状：`{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`。

### `/info` 上的错误

| HTTP | 体 | 原因 |
|------|------|-------|
| 400 | `{"error":"missing field \`type\`"}` | 无 `type` 判别器 |
| 400 | `{"error":"unknown request type: <X>"}` | 拼写错误/不支持的 `type` |
| 400 | `{"error":"missing field user"}` | 缺必需 `user` |
| 400 | `{"error":"invalid user address: <X>"}` | `user` 非 `0x` + 40 十六进制 |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` 缺 `coin` |
| 502 | `{"error":"<node error>"}` | 接入类型的节点回源故障（传输/5xx） |

HL 的 `/info` 用标准 HTTP 状态码加 `{"error":...}`（不像 `/exchange`，用 200-with-`status` 信封）。

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

| 字段 | 描述 |
|-------|-------------|
| `action` | HL 形状 action（见下方） |
| `nonce` | Unix ms，逐签名者严格递增 |
| `signature` | RSV 对象 — 三个十六进制字符串 + uint `v`（27/28 或 0/1） |
| `vaultAddress` | `null` 用于自身账户；`"0x<vault>"` 以 vault 管理员身份行动 |

签名覆盖 EIP-712 信封（见[签名演练](../../integration/signing.md)）用**MetaFlux** 域（`chainId = 31337` devnet / `114514` testnet / `8964` mainnet — 见[网络](../../networks.md)）。`chainId` 必须等于节点共识 `chain_id`（查询 [`/info` `node_info`](./info.md#node_info)）。

### 响应信封

写入用 HL 的 `{"status":"ok"|"err","response":<...>}` 约定（错误即 200）：

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

### 支持的 action 类型

| `action.type` | 状态 | 备注 |
|---------------|--------|-------|
| `order` | 支持 | limit / IOC / ALO；完整 TIF 集 |
| `cancel` | 支持 | 按 `oid` |
| `cancelByCloid` | 推出中 | 按 `cloid` |
| `modify` / `batchModify` | 推出中 | 撤销-替换 |
| `scheduleCancel` | 推出中 | 死人开关 |
| `updateLeverage` / `updateIsolatedMargin` | 推出中 | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | 推出中 | 转账 |
| `withdraw3` | 推出中 | 外部提现（MetaBridge） |
| `approveAgent` | 推出中 | 代理钱包批准 |
| `vaultTransfer` / `subAccountTransfer` | 推出中 | 资金移动 |
| `setReferrer` / `convertToMultiSigUser` | 推出中 | — |
| `twapOrder` / `twapCancel` | 推出中 | — |
| (HL 船上的其他所有) | 返回 `{"status":"err","response":"unimplemented action: <type>"}` | 用 [MTF-native](./exchange.md) 处理那些 |

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

字段简写（HL 约定）：`a`=asset id · `b`=is_buy · `p`=limit price · `s`=size · `r`=reduce_only · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=可选 16 字节 `cloid`。

触发订单：`"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`。

### `order` 响应

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

逐订单状态（逐 `orders[]` 条目一个，按序）：

| 变体 | 含义 |
|---------|---------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | 已发布到簿 |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | 立即成交 |
| `{"error":"<reason>"}` | 此条目被拒（其他可能成功） |

### `cancel` 示例

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

响应：`{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`。逐撤销条目：`"success"` 或 `{"error":"<reason>"}`。

### `/exchange` 上的错误

| 体 | 原因 |
|------|-------|
| `{"status":"err","response":"signature_invalid"}` | 恢复的地址 ≠ 签名者/错误的 chainId |
| `{"status":"err","response":"unimplemented action: <type>"}` | Compat 表面尚未覆盖此 action |
| `{"status":"err","response":"nonce too small"}` | 重用的 nonce |
| `{"status":"err","response":"agent_not_approved"}` | 代理签名但无批准存在 |

---

## 值得了解的与 HL 的差异

完整参考见[从 HL 迁移](../../integration/migrating-from-hl.md)。快速亮点：

- **`chainId`** 在签名域中是 MetaFlux 的（`31337` devnet / `114514` testnet / `8964` mainnet），非 HL 的（`998`/`999`）。
- **Asset ID 数值不同于 HL 的。** 通过 `info { "type": "meta" }` 查询一旦该读取接入；勿硬编码。
- **T0 黄牌**清算阶层存在于 MTF（健康与 HL 的"部分清算"之间）。监视清算事件的机器人看到多一个事件类型。
- **超越 `order` / `cancel` 的 HL action 类型**在推出期返回 `err`。用 MTF-native [`POST /exchange`](./exchange.md)，或等待。
- **逐项读取** `userFills` / `userFillsByTime` / `fundingHistory` 现从已提交节点状态实时服务。剩余历史读取（`historicalOrders`、`candleSnapshot`、`userFunding`）尚未服务 — 列入网关索引器待办。用 WS [`userFills`](../ws/subscriptions.md) / [`candle`](../ws/subscriptions.md) 通道以获实时数据。

## 另见

- [`POST /info`](./info.md) — MTF-native 节点读取，这些 HL 类型翻译自此
- [`POST /exchange`](./exchange.md) — MTF-native 写入路径
- [CCXT-compat](./ccxt-compat.md) — 另一个 compat 表面
- [从 HL 迁移](../../integration/migrating-from-hl.md) · [签名演练](../../integration/signing.md) · [错误](../errors.md)
