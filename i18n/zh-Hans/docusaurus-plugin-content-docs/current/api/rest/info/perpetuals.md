---
description: "POST /info 永续市场只读查询——市场信息、订单簿、成交记录、资金费率、清算及永续合约部署状态。"
---

# `POST /info` — 永续合约查询

**永续**市场的只读查询。与[基础页面](../info.md)使用相同的 `POST /info` 端点、请求封装及约定——此处列出的是永续市场专属的 `type`。（订单簿、成交记录、K 线等读取也可通过 `pair` id 服务于现货交易对。）

## 永续合约查询类型

### `market_info`

单个市场的元数据。

```json
{ "type": "market_info", "asset_id": 0 }
```

或按名称查询：

```json
{ "type": "market_info", "coin": "BTC" }
```

响应：

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
    "mid_px":          "67079.27",
    "premium":         "0.0015",
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

:::info
**价格报告平面。** 此查询中，`mark_px` 和 `oracle_px` 均以**整 USDC 十进制平面**表示（即人类可读的美元价格——`"67079.265"` / `"67073.35"`），与账户持仓标记价格的单位一致。`mark_px` 是将引擎内部 1e8 定点表示缩放还原后的链上标记价格，当订单簿尚无标记价格时回退为预言机价格；`oracle_px` 是最新提交的指数价格。若未设定则均为 `"0"`。注意**订单/订单簿提交平面仍使用 1e8 定点格式**——`l2_book` 的档位价格和订单的 `limit_px` **不是**整 USDC；MTF 严格区分这两个定价平面，只有面向用户的读取接口（`market_info`、`markets`、持仓）才以整 USDC 报告价格。记录中其余字段的语义见下方 [`markets`](#markets) 表格。
:::

:::info
**价格精度与 `sz_decimals`。** `mark_px` 和 `oracle_px` 均**对齐到市场价格档位**（`tick_size`，向零截断），因此读取结果不会出现亚档位噪声——以 `$0.01` 档位（1e8 平面下 `tick_size: "1000000"`）为例，`66735.255` 会报告为 `"66735.25"`。注意 `sz_decimals` 是**数量**精度（委托数量粒度——`5` 对应 `0.00001` 个单位），**不**控制价格小数位；价格精度由价格档位决定。两者是独立的维度（与 HL 的设计一致）。
:::

### `markets`

一次性获取所有已注册的 MIP-3 永续市场。无需参数。

```json
{ "type": "markets" }
```

`data` 载荷是一个**数组**，每个元素与 [`market_info`](#market_info) 为单个资产返回的富信息记录结构相同。记录按 `asset_id` 升序确定性排列（节点遍历 `mip3_market_specs` `BTreeMap`）。若市场列表为空，则返回 `"data": []`。

响应：

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
      "mid_px":          "67042.33",
      "premium":         "0.0015",
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

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `asset_id` | uint32 | 规范资产 id（排序键） |
| `name` | string | 市场代码，如 `"BTC"` |
| `kind` | `"perp"` | 市场类型（小写） |
| `sz_decimals` | uint8 | 数量显示小数位（来自底层现货代币注册表；若无代币规格则为 `0`） |
| `mark_px` | Decimal string | 链上标记价格，**整 USDC 平面**（从 1e8 缩放还原的订单簿标记价格，回退为预言机价格；未设定时为 `"0"`） |
| `oracle_px` | Decimal string | 指数价格，**整 USDC 平面**（未设定时为 `"0"`） |
| `mid_px` | Decimal string \| null | 真实订单簿中间价 `(best_bid + best_ask) / 2`，**整 USDC 平面**（对齐至档位）；订单簿单边/空盘时为 `null` |
| `premium` | Decimal string \| null | 最新已提交的资金费率溢价样本（带符号）；无样本时为 `null` |
| `tick_size` | i128 string | 最小价格变动单位，**1e8 定点格式**（订单/订单簿提交平面） |
| `step_size` | u128 string | 最小数量变动单位（手数），定点格式 |
| `min_order` | u128 string | 最小委托数量 |
| `max_leverage` | uint8 | 最大杠杆倍数 |
| `maint_margin_ratio` | bps string | 维持保证金率，十进制 bps |
| `init_margin_ratio` | bps string | 初始保证金率（`1 / max_leverage`），十进制 bps |
| `funding.rate_per_hr` | bps string | 最新资金费率溢价样本，十进制 bps |
| `funding.cap_per_hr` | bps string | 每小时资金费率上限，十进制 bps |
| `funding.interval_ms` | uint64 | 资金费率结算间隔（1 小时 = `3600000`） |
| `funding.next_payment_ts` | uint64 | 下次资金费率结算时间戳（有样本前为 `0`） |
| `mark_source` | string | 标记价格描述符（`"MedianOfOraclesAndMid"`） |
| `fba_enabled` | bool | 该市场是否启用频繁批量竞价（FBA） |
| `open_interest` | u128 string | 当前未平仓合约量，定点格式 |

每个元素与对应的单资产 `market_info` 响应中的 `data` 在字节层面完全一致——两者均由同一个逐市场记录构建器生成，因此单资产与批量响应的数据结构永远保持同步。字段级语义及 FLAGGED-proxy 注意事项（`mark_source`、`next_payment_ts`）请参阅 [`market_info`](#market_info)。

### `l2_book`

市场范围内的买卖盘聚合档位。

```json
{ "type": "l2_book", "market_id": 0 }
```

| 参数 | 类型 | 必填 |
|-----|------|----------|
| `market_id` | uint32 | 是 |

响应：

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

买盘按最优档位优先排列（价格降序），卖盘价格升序。每个档位汇总合计的 `size` 及挂单数 `n_orders`。未知或空盘的市场返回空的 `bids` / `asks` 数组。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `market_id` | uint32 | 回显的市场 id |
| `bids[*].px` / `asks[*].px` | i128 string | 档位价格，定点十进制字符串 |
| `bids[*].size` / `asks[*].size` | u128 string | 该档位的合计数量 |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | 该档位的挂单数 |

### `recent_trades`

市场范围内的公开成交记录，直接从节点已提交的链上状态中提供（每个市场有一个有界成交环形缓冲区，已折叠进 AppHash——无需外部索引器）。

```json
{ "type": "recent_trades", "market_id": 0 }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `market_id` | uint32 | 是 | 资产/市场 id |
| `limit` | uint32 | 否 | 限制返回的**最新**记录条数；缺省或为 `0` 时返回完整环形缓冲区 |

响应：

```json
{
  "type": "recent_trades",
  "data": {
    "market_id":      0,
    "last_trade_ms":  1700000000555,
    "trades": [
      {
        "coin":  0,
        "side":  "B",
        "px":    "67042.50",
        "sz":    "0.125",
        "time":  1700000000555,
        "tid":   90123,
        "block": 562,
        "hash":  "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
      }
    ]
  }
}
```

记录按时间从旧到新排列（最新记录在最后）。环形缓冲区有容量上限，因此返回的是近期窗口数据，而非完整历史。未知或从未成交的市场返回 `"trades": []` 及 `last_trade_ms: 0`。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `market_id` | uint32 | 回显的市场 id |
| `last_trade_ms` | uint64 | 最后一笔成交的时间戳（无成交时为 `0`） |
| `trades[*].coin` | uint32 | 本笔成交所在的资产/市场 id |
| `trades[*].side` | `"B"` / `"A"` | 主动方（吃单方）方向——`"B"` = 买入，`"A"` = 卖出 |
| `trades[*].px` | Decimal string | 成交价格，**USDC 十进制**（人类可读） |
| `trades[*].sz` | Decimal string | 成交数量，**基础单位**（整单位） |
| `trades[*].time` | uint64 | 成交时间戳（共识时间，毫秒） |
| `trades[*].tid` | uint64 | 确定性成交 id（成交双腿共享同一 id） |
| `trades[*].block` | uint64 | 成交结算所在的已提交区块高度（链上定位符） |
| `trades[*].hash` | hex string | 原始委托单的交易哈希，`0x` 前缀十六进制——可用于链上追溯成交记录 |

### `candle`

`(coin, interval)` 在指定时间窗口内的历史 OHLCV K 线数据。这是实时 [`candles`](../../ws/subscriptions.md#candles) WebSocket 频道的 REST 对应接口——WebSocket 在成交发生时推送正在形成的 K 线，此接口返回已收盘的历史 K 线。

```json
{ "type": "candle", "coin": "BTC", "interval": "1m" }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `coin` | string | 是 | 市场代码，如 `"BTC"` |
| `interval` | string | 是 | 时间粒度——`1m`、`5m`、`15m`、`1h`、`4h`、`1d` 之一 |
| `start_time` | uint64 | 否 | 时间窗口起始（毫秒），按 K 线开盘时间过滤。默认 `0` |
| `end_time` | uint64 | 否 | 时间窗口终止（毫秒），按 K 线开盘时间过滤。默认不限 |

参数可以平铺传入（如上），也可嵌套在 `req` 对象中；`start_time` / `end_time` 同时支持驼峰写法 `startTime` / `endTime`。缺少 `coin` 或 `interval` 时返回 `400 {"error":"missing field <name>"}`。

响应：

```json
{
  "type": "candle",
  "data": [
    {
      "t": 1700000040000,
      "T": 1700000099999,
      "s": "BTC",
      "i": "1m",
      "o": "67000.00",
      "c": "67042.50",
      "h": "67080.00",
      "l": "66990.00",
      "v": "12.5",
      "q": "837843.75",
      "n": 37
    }
  ]
}
```

K 线按 `t`（开盘时间）从旧到新排列；最后一个元素是正在形成的 K 线。若返回空数组，则可能的原因是：`interval` 参数不受支持、该市场无成交记录，或部署环境未接入索引器。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `t` | uint64 | K 线**开盘**时间戳（毫秒，对齐至时间粒度） |
| `T` | uint64 | K 线**收盘**时间戳（毫秒）——`t + interval − 1` |
| `s` | string | 币种/市场代码 |
| `i` | string | 时间粒度标识 |
| `o` / `c` / `h` / `l` | Decimal string | **开**盘 / **收**盘 / **最高** / **最低**价格，**USDC 十进制**（人类可读，如 `"67042.50"`） |
| `v` | Decimal string | **基础资产成交量**——该 K 线内的成交数量之和（以币为单位，非名义价值） |
| `q` | Decimal string | **计价货币（USD）成交额**——该 K 线内各笔成交 `价格 × 数量` 之和 |
| `n` | uint64 | 该 K 线内的成交笔数 |

:::info
**序列无间隔。** 某时间段内**无成交**时，仍会生成一根平盘 K 线，将前一根 K 线的收盘价延续：`o = h = l = c = 前收盘价`，`v = q = 0`，`n = 0`。消费方可获得连续的逐周期 K 线序列，无需自行插值补全。**在市场首笔成交之前不生成任何 K 线**——序列从首笔成交所在的时间粒度开始，因此空数组意味着该市场从未成交（或无历史数据接入），而不是早期 K 线被丢弃。
:::

:::info
**此类型由网关提供，而非节点。** K 线是从公开成交流派生的展示数据——它**不是**已提交的链上状态，不触及 app-hash，也不带有共识保证。网关从自身滚动存储中响应 `candle` 查询；直接访问裸节点会返回 `unknown info type: candle`。当网关尚无该市场的成交历史时，返回诚实的空值（`"data": []`）。
:::

### `funding_history`

按市场范围划分的资金溢价采样历史。

```json
{ "type": "funding_history", "market_id": 0 }
```

| 参数 | 类型 | 必填 |
|-----|------|----------|
| `market_id` | uint32 | 是 |

响应：

```json
{
  "type": "funding_history",
  "data": {
    "market_id": 0,
    "samples": [
      { "ts_ms": 1700000000000, "premium": "0.0015", "funding_rate": "0.0015" },
      { "ts_ms": 1700000008000, "premium": "-0.0007", "funding_rate": "-0.0007" }
    ]
  }
}
```

`samples` 为资金追踪器中有序循环缓冲区内的溢价快照序列。
`premium` 是截限前的精确 `Decimal` 值，以字符串形式呈现（带符号，全精度）；`funding_rate` 是该溢价经过各资产资金费率上限（`±funding_rate_cap`，动态风险覆盖值，否则取 `0.04`/小时基准线）处理后的结果——即实际将被收取的资金费率。当溢价在上限范围内时，`funding_rate == premium`；超出上限时，`funding_rate` 被截限至带符号的上限值。对于未知或空的市场，将返回 `"samples": []`。

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `market_id` | uint32 | 回显的市场 ID |
| `samples[*].ts_ms` | uint64 | 采样时间戳（共识毫秒） |
| `samples[*].premium` | decimal string | 原始资金溢价采样值，截限前（带符号） |
| `samples[*].funding_rate` | decimal string | 实际费率 = `premium` 截限至各资产上限后的值（带符号） |

### `predicted_fundings`

各市场的预测资金费率及下次结算时间，覆盖所有已注册的永续合约市场。无需参数。

```json
{ "type": "predicted_fundings" }
```

`data` 载荷为一个**数组**，按 `asset` 升序确定性排列（节点遍历市场规格 `BTreeMap`）。空市场宇宙返回 `"data": []`。

响应：

```json
{
  "type": "predicted_fundings",
  "data": [
    { "asset": 0, "predicted_rate": "0.0015", "next_funding_time": 1700003600000 }
  ]
}
```

`predicted_rate` 为最新溢价采样值（每小时费率代理，decimal 字符串）——在第一次采样前为 `"0"`。`next_funding_time` 为推导出的下次结算时间戳（`last_sample_ts + 1h`），在第一次采样前为 `0`。

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `asset` | uint32 | 资产 / 市场 ID |
| `predicted_rate` | decimal string | 最新溢价采样值（每小时费率代理）；采样前为 `"0"` |
| `next_funding_time` | uint64 | 下次资金结算时间戳（共识毫秒）；采样前为 `0` |

### `mip3_active_bids`

MIP-3 无需许可的永续合约部署 Gas 竞拍快照。无需参数。

```json
{ "type": "mip3_active_bids" }
```

响应：

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

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `auction_round` | uint64 | 当前竞拍轮次 |
| `current_bid` | decimal string | 当前领先出价金额 |
| `current_winner` | hex address \| null | 当前中标者，无中标者时为 `null` |
| `auction_end_ms` | uint64 | 竞拍结束时间戳（共识毫秒） |
| `started_at_ms` | uint64 | 竞拍开始时间戳（共识毫秒） |
| `bids[*].bidder` | hex address | 出价者地址 |
| `bids[*].amount` | decimal string | 出价金额 |
| `bids[*].submitted_at_ms` | uint64 | 出价提交时间戳（共识毫秒） |
| `bids[*].tag` | string | 出价标签（例如拟定的市场名称） |

### `liquidatable`

当前被标记为可清算的账户。无需参数。

```json
{ "type": "liquidatable" }
```

响应：

```json
{
  "type": "liquidatable",
  "data": { "accounts": [ { "address": "0x<addr>", "tier": "PartialMarket50" } ] }
}
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `accounts[*].address` | hex address | 需要处理的账户地址 |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | BOLE 层级 |

状态来源：`Exchange.bole_index.tier`（BOLE 待处理索引——**并非**全量账户重新扫描）。

> **注意。** `bole_index` 为 `#[serde(skip)]` 派生的非规范状态，在首次使用或快照加载后通过全量扫描重建。在新发布的快照上，该索引在运行时至少执行一次 BOLE 处理前为空。

### `active_asset_data`

用户在某一资产上的杠杆倍数 / 保证金模式 / 最大交易规模。必填参数：`address`（0x 十六进制）及 `asset_id`（u32）。

```json
{ "type": "active_asset_data", "address": "0x<addr>", "asset_id": 0 }
```

响应：

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "asset_id": 0, "leverage": 7,
    "margin_mode": "isolated", "max_trade_size": "5000000000", "has_position": true
  }
}
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `leverage` | uint32 | 若有持仓则为持仓杠杆，否则为账户默认杠杆，再否则为市场最大杠杆 |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | 实际生效的保证金模式 |
| `max_trade_size` | decimal string | 各资产最大订单上限（参见 `max_market_order_ntls`） |
| `has_position` | bool | 用户在该资产上是否持有非零仓位 |

状态来源：`locus.clearinghouses[asset].positions[addr]`、`locus.user_account_configs[addr]`、市场规格 / 动态风险参数。

### `max_market_order_ntls`

各资产的市价单最大名义价值。无需参数。

```json
{ "type": "max_market_order_ntls" }
```

响应：

```json
{
  "type": "max_market_order_ntls",
  "data": { "ntls": [ { "asset_id": 0, "max_market_order_ntl": "5000000000" } ] }
}
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | 资产 ID |
| `ntls[*].max_market_order_ntl` | decimal string | 基于未平仓量上限推导出的规模上限 |

状态来源：各市场的 `PerpAnnotation.oi_cap`，否则取 `default_mip3_limits.max_oi_per_market`。

> **注意。** 已提交状态中不存在专用的各资产"市价单最大名义价值"字段；未平仓量上限是最接近的已提交风险上限，以**数量**单位报告（撮合层在执行时按实时标记价格换算为名义价值）。

### `perps_at_open_interest_cap`

未平仓量达到或超过上限的资产列表。无需参数。

```json
{ "type": "perps_at_open_interest_cap" }
```

响应：

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `assets` | uint32[] | 未平仓量达到或超过 `oi_cap` 的资产 ID，升序排列 |

状态来源：各订单簿的 `open_interest` 与 `PerpAnnotation.oi_cap` 的对比（无正值上限的订单簿将被跳过）。

### `margin_table`

保证金层级表（杠杆倍数 → 维持保证金 / 初始保证金比率）。无需参数。

```json
{ "type": "margin_table" }
```

响应：

```json
{
  "type": "margin_table",
  "data": { "tiers": [ { "asset_id": 0, "max_leverage": 50, "maint_margin_ratio": "300", "init_margin_ratio": "200" } ] }
}
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `tiers[*].asset_id` | uint32 | 资产 ID |
| `tiers[*].max_leverage` | uint8 | 实际生效的最大杠杆倍数（覆盖值或静态值） |
| `tiers[*].maint_margin_ratio` | bps string | 维持保证金比率（覆盖值，或静态 3% 基准下限） |
| `tiers[*].init_margin_ratio` | bps string | `1 / max_leverage` |

状态来源：`dynamic_risk_overrides[asset]`，否则取静态基准值。

> **注意。** 已提交状态对每个市场仅存储单一有效风险层级（覆盖值或静态值），而非 HL 所提供的多行杠杆阶梯。此处每个市场返回一个层级——即引擎当前执行的那一行。

### `perp_dexs`

列出永续合约 DEX（去中心化交易所）。无需参数。

```json
{ "type": "perp_dexs" }
```

响应：

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `dexs[*].index` | uint64 | `Exchange.perp_dexs` 中的 DEX 索引 |
| `dexs[*].n_assets` | uint64 | DEX 中资产订单簿的数量 |
| `dexs[*].assets` | uint32[] | DEX 中包含的资产 ID |

状态来源：`Exchange.perp_dexs`。


## 另请参阅

- [`POST /info`](../info.md) — 基础只读端点（封装格式、规范约定、账户与基础设施查询）
- [现货与保证金查询](./spot.md) — 现货 / 现货保证金 / Earn 读取接口
- [永续合约](../../../products/perpetuals.md) — 产品说明
