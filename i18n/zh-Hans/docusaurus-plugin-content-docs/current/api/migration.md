---
description: "节点与网关 0.7.14 版本中的破坏性 API 变更——coin/address 寻址方式、移除的查询类型、内联保证金分级，以及 WS 频道更新。面向对接方与做市商的迁移检查清单。"
---

# API 迁移 — 0.7.14

:::warning
**破坏性变更。** 本次发布改变了读取 API 中市场与账户的寻址方式，移除了三种查询类型，并更新了多个 WS 频道。
已签名的 `/exchange` action **不受影响**。升级客户端前，请先完整过一遍下面的检查清单。
:::

## 概览 {#at-a-glance}

| 领域 | 旧 | 新 |
|------|-----|-----|
| 市场寻址（读取） | `asset_id` / `market_id`（数字） | **`coin`**（符号，例如 `"BTC"`） |
| 账户寻址（读取） | `account_id` **或** `address` | 仅 **`address`**（0x 十六进制） |
| K 线历史 | `candle` | **`candle_snapshot`**（单根 K 线查询） |
| 前端聚合快照 | `web_data2`（REST + WS） | **已移除**——请组合使用聚焦型读取接口 |
| 保证金阶梯 | `margin_table` 查询 | **`margin_tiers`** 内联于 `market_info` / `markets` |
| 按时间窗口查询最近成交 | — | **`trades_by_time`**（新增） |
| WS 订阅上限 | 256 / 连接 | **64 / 连接** |

## 1. 市场改用 `coin` 寻址 {#1-markets-are-addressed-by-coin}

所有针对单一市场的读取请求现在都通过 **`coin` 符号** 来解析市场。数字型的
`asset_id` / `market_id` 请求参数已被 **移除**——若请求仍提供这些参数（且未提供
`coin`），将被拒绝并返回 `400 {"error":"missing field coin"}`。

受影响的读取接口：`market_info`、`markets`、`l2_book`、`recent_trades`、
`trades_by_time`、`funding_history`、`oracle_sources`、`active_asset_data`、
`fba_batch_state`。

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"market_info","asset_id":0}
+ {"type":"market_info","coin":"BTC"}
```

响应会回显 `coin` 符号（例如 `recent_trades` 的行数据带有
`"coin":"BTC"`）。`market_info` / `markets` 目前仍保留 **`asset_id`** 字段，作为
面向索引器的过渡兼容垫片——**请勿依赖它构建逻辑**；该字段可能在不提升
wire 版本号的情况下被移除。

## 2. 账户改用 `address` 寻址 {#2-accounts-are-addressed-by-address}

针对单一账户的读取请求不再接受 `account_id`；请传入 `address`（0x 十六进制）。

受影响的读取接口：`open_orders`、`user_fills`、`user_fills_by_time`、`agents`、
`sub_accounts`、`rfq_user`、`pm_summary`。

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

这些响应中的 `account_id` 回显字段已不再返回。

## 3. 已移除的查询类型 {#3-removed-query-types}

| 已移除 | 现在返回 | 替代方案 |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` 内联于 [`market_info`](./rest/info/perpetuals.md#market_info) / [`markets`](./rest/info/perpetuals.md#markets) |
| `web_data2`（REST） | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) + [`spot_clearinghouse_state`](./rest/info/spot.md#spot_clearinghouse_state) + [`frontend_open_orders`](./rest/info.md#frontend_open_orders) + [`user_vault_equities`](./rest/info.md#user_vault_equities) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2`（WS 频道） | `unknown channel: web_data2` | `account_state` + `spot_state` WS 频道 |

## 4. `margin_tiers`——内联的名义本金分级阶梯 {#4-margin_tiers--inline-notional-banded-ladder}

维持保证金阶梯现在以 `margin_tiers` 的形式 **内联** 携带在每条市场记录上，是一个
按上限升序排列的区间列表：

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` ——该区间的**上限**（十进制字符串，单位为数量）；
  `null` 表示**无上限的最高档**。
- `max_leverage` ——该区间内的最大杠杆（`u8`）。
- `maint_margin_ratio` ——维持保证金比率，**十进制 bps 字符串**
  （`"100"` = 1.00%）。

所处档位 = 持仓量未超过其 `max_open_interest` 上限的第一个区间。随着持仓量增长，
杠杆随之下降，维持保证金要求随之上升。

## 5. 新增：`trades_by_time` {#5-new-trades_by_time}

用于查询某个市场在 `[start_time, end_time]` 时间窗口内的最近公开成交记录（受限于
环形缓冲区容量；更早的历史数据需通过网关归档获取）：

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

行数据结构与 [`recent_trades`](./rest/info/perpetuals.md#recent_trades) 相同。

## 6. `markets` 的结构 {#6-markets-shape}

`markets.data` 现在是一个**对象**，而不是数组：

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

`perp[]` 中的每个元素只携带该市场的**动态**字段——与 `market_info` 针对单个
`coin` 返回的动态字段子集相同。**静态**字段（精度网格、杠杆/保证金阶梯、交易
管控标志）单独存放在 [`markets_meta`](./rest/info/perpetuals.md#markets_meta)
中；`market_info` 返回的是两者的并集。

## 7. WebSocket 变更 {#7-websocket-changes}

- **`web_data2` 频道已移除**——替代方案见上文。
- **`trades`**：`data` 是一个**数组**；订阅时下发的首帧
  （`is_snapshot: true`）是一个**非空**的最近成交数组（仅当该市场从未有过
  成交时才为空），且快照行携带 **`users: null`**。实时推送则携带
  `users: [taker, maker]`。
- **`user_fundings`**：记录现在携带 `{coin, payment, szi, fundingRate, time}`
  （`payment` 为带符号的整数 USDC：负数表示支付，正数表示收到）。
- **`explorer_txs`** 的行数据携带 **`hash`** 字段（`0x` action 哈希；系统性
  条目为空字符串 `""`）。**`explorer_block`** 推送已提交的区块头。
- **`order_updates`**：在 `filled` 记录中，`order.sz` 是**已成交**数量，
  `order.orig_sz` 是**原始**订单数量。
- **现有频道**：`account_state`、`spot_state`、`order_updates`、`fills`、
  `user_events`、`user_fundings`、`ledger_updates`、`l2_book`、`bbo`、`trades`、
  `candles`、`all_mids`、`active_asset_ctx`、`active_asset_data`、
  `explorer_block`、`explorer_txs`。

## 8. `predicted_fundings` 语义 {#8-predicted_fundings-semantics}

以 `coin` 为键；每条记录为
`{coin, predicted_rate, next_funding_time}`：

- `predicted_rate` 是在结算边界实际收取的**限幅后**费率（溢价经过按资产设置的
  `±cap` 限幅），而非原始溢价。
- `next_funding_time` 是**下一个对齐的按资产结算边界**（毫秒）。

资金费在按资产设置的边界上**离散**结算（默认 1 小时）；`funding_history`
采样记录的仍是原始溢价环形数据。`market_info.funding` 携带 `interval_ms`
（按资产的结算周期）与 `next_payment_ts`（结算边界时间）。

## 9. 速率限制 {#9-rate-limits}

- 按 IP：**1200 权重 / 分钟**——白名单 IP 不受限制。
- 按账户的 `/exchange` 令牌桶——**由 metaliquidity 设置的签名方不受限制**。
- WS：**每连接 64 个订阅**（较此前的 256 个下降）——白名单连接不受限制。

参见[速率限制](./rate-limits.md)。

## 10. 未变更项 {#10-unchanged}

- **订单 / 成交 ID**：`oid`、`tid`、`cloid` 均未变更（`tid` 是 `u64` 类型——
  请按大整数解析，其值可能超过 2⁵³）。
- **已签名的 `/exchange` action**：类型化 action 的摘要**已被共识冻结**——
  在已签名 action 中 `asset` 仍是数字型 `u32`。`coin`/`address` 的变更仅是
  **读取 API** 层面的变更；**不会**影响你对下单或撤单进行签名的方式。参见
  [`POST /exchange`](./rest/exchange.md)。

## 参见 {#see-also}

- [`POST /info`](./rest/info.md) · [永续合约查询](./rest/info/perpetuals.md) · [现货与保证金查询](./rest/info/spot.md)
- [WS 订阅](./ws/subscriptions.md)
- [速率限制](./rate-limits.md) · [错误处理](./errors.md)
