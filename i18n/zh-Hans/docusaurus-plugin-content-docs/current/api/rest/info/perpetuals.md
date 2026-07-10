---
description: "POST /info 面向永续市场的只读查询——市场信息、订单簿、成交记录、资金费率、清算及永续合约部署状态。"
---

# `POST /info` — 永续合约查询

**永续**市场的只读查询。与[基础页面](../info.md)使用相同的 `POST /info` 端点、请求封装及约定——此处列出的是永续市场专属的 `type`。

:::info
**市场以 `coin`（代码）为键。** 所有市场范围内的读取查询
（`market_info`、`l2_book`、`recent_trades`、`trades_by_time`、`funding_history`、
`oracle_sources`、`active_asset_data`、`fba_batch_state` 等）均通过市场的
**`coin` 代码**（`"BTC"`、`"ETH"` 等）来定位市场。旧版数字型 `asset_id` /
`market_id` 请求参数已被**移除**——若请求携带这些参数（且未提供 `coin`），
将被拒绝并返回 `400 {"error":"missing field coin"}`。这些市场读取接口会在
响应中回显 `coin` 代码。（只有已签名的 `/exchange` 写入路径仍以数字型
`asset` 寻址市场——该字段已被共识冻结；参见 [`POST /exchange`](../exchange.md)。）
:::

## 永续合约查询类型 {#perpetual-query-types}

### 获取单市场元数据 {#market_info}

单个市场的元数据。通过市场的 `coin` 代码来定位市场。

```json
{ "type": "market_info", "coin": "BTC" }
```

| 参数 | 类型 | 必填 |
|-----|------|----------|
| `coin` | symbol | 是 |

缺少 `coin` → `400 {"error":"missing field coin"}`；未知代码 → `404 {"error":"market not found"}`。

响应：

```json
{
  "type": "market_info",
  "data": {
    "coin":               "BTC",
    "kind":               "perp",
    "sz_decimals":        5,
    "mark_px":            "61550.2",
    "oracle_px":          "61501.7",
    "mid_px":             "61669.4",
    "premium":            "0.00209225",
    "tick_size":          "0.1",
    "step_size":          "0.00001",
    "min_order":          "0.00001",
    "max_leverage":       50,
    "maint_margin_ratio": "1320",
    "init_margin_ratio":  "200",
    "margin_tiers": [
      { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
      { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
      { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
      { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
    ],
    "funding": {
      "rate_per_hr":     "21",
      "cap_per_hr":      "1120",
      "interval_ms":     3600000,
      "next_payment_ts": 1783011600000
    },
    "mark_source":   "oracle_median",
    "fba_enabled":   false,
    "open_interest": "0.02346",
    "day_ntl_vlm":   "3772.890084",
    "change_24h":    "-0.00274143",
    "prev_day_px":   "61719.4",
    "disable_open":  false,
    "disable_close": false,
    "halted":        false,
    "strict_isolated": false,
    "asset_id":      0
  }
}
```

:::warning
**`asset_id` 已废弃。** 保留该字段仅是临时性的索引器兼容层便利措施——
**不要**依赖它构建功能，也**不要**将其用作请求参数（已不再被接受）。请始终
通过 `coin` 寻址市场。该字段可能在不提升 wire-version 的情况下被移除。
:::

:::info
**价格报告平面。** `mark_px`、`oracle_px`、`mid_px`、`tick_size`、`step_size`
及 `min_order` 均以**人类可读十进制平面**报告（`"61550.2"`、`"0.1"`、
`"0.00001"`），与账户持仓标记价格的单位一致。`mark_px` 是订单簿标记价格，
当订单簿尚无标记价格时回退为预言机价格；`oracle_px` 是最新提交的指数价格；
两者未设定时均为 `"0"`。**订单/订单簿提交平面则是另一套独立的 1e8 定点
平面**——`l2_book` 的档位 `px` 及订单的 `limit_px` 是原始的 1e8 数值，
**并非**人类可读十进制；MTF 严格区分这两套定价平面。
:::

:::info
**`margin_tiers` ——内嵌的按名义价值分档杠杆阶梯。** `market_info`
（以及 [`markets`](#markets) 中的每一行）都会以 `margin_tiers` 形式**内嵌**
携带该市场的维持保证金阶梯——一份按上界升序排列的分档列表：

- `max_open_interest` ——该档位的**上界**（十进制字符串，单位为该市场的
  数量单位）；`null` 表示**无上限的最高档**。
- `max_leverage` ——未平仓量落在该档位时允许的最大杠杆（`u8`）。
- `maint_margin_ratio` ——该档位的维持保证金率，**十进制 bps 字符串**
  （`"100"` = 1.00%）。

某持仓所属的档位，是其未平仓量不超过 `max_open_interest` 上界的第一个档位
（`null` 的最高档兜底覆盖最后一个有限上界之上的所有情形）。未平仓量增长时，
杠杆随之下降、维持保证金率随之上升。此机制取代了已移除的独立
`margin_table` 查询——阶梯数据现在直接内嵌于市场记录本身。
:::

:::info
**价格精度与 `sz_decimals`。** `sz_decimals` 是**数量**精度（委托数量粒度——
`5` 对应 `0.00001` 个单位）；它**不**控制价格小数位，价格精度由价格档位
（`tick_size`）决定。两者是相互独立的维度。
:::

`market_info` 返回的是**完整**记录——它是 [`markets`](#markets) 所提供的
**动态**字段（`mark_px`、`oracle_px`、`mid_px`、`premium`、`funding`、
`open_interest`、`day_ntl_vlm`、`prev_day_px`、`change_24h`、`halted`）与
[`markets_meta`](#markets_meta) 所提供的**静态**字段（`sz_decimals`、
`tick_size`、`step_size`、`min_order`、`max_leverage`、各项保证金率、
`margin_tiers`、`strict_isolated`、`disable_open` / `disable_close`、
`mark_source`、`fba_enabled`、`asset_id`）的并集。各字段的具体语义参见这
两个读取接口。

### 获取所有市场的实时状态 {#markets}

所有已注册市场的**实时（动态）**状态——即随每个区块变化的字段
（标记价格 / 预言机价格 / 中间价、资金费率溢价、未平仓量、滚动 24 小时
行情、`halted`），以及 `(coin, kind)` 联接键——连同现货交易对/代币注册表
一并返回。长期不变的**静态**元数据（精度网格、杠杆/保证金阶梯、标记价格
来源、交易控制标志）则由 [`markets_meta`](#markets_meta) 单独提供；
[`market_info`](#market_info) 会为单个 coin 同时返回这两部分。

```json
{ "type": "markets" }
```

使用 `kind` 过滤到单一产品类型（缺省 ⇒ 两部分都返回）：

```json
{ "type": "markets", "kind": "perp" }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | 否 | 分区过滤器——缺省 = 两部分都返回；`"perp"` = 仅返回永续数组；`"spot"` = 仅返回现货部分 |

`data` 载荷是一个**对象**，包含一个 `perp` 数组（每一项都是一条**动态**行）
以及一个 `spot` `{pairs, tokens}` 对象。`perp` 各行按市场 id 升序确定性
排列；`spot.pairs` / `spot.tokens` 按交易对/代币 id 顺序排列。

响应（每个列表截断为一条示例）：

```json
{
  "type": "markets",
  "data": {
    "perp": [
      {
        "coin":            "BTC",
        "kind":            "perp",
        "mark_px":         "61521.1",
        "oracle_px":       "61529.3",
        "mid_px":          "61669.4",
        "premium":         "0.0018587",
        "funding": {
          "rate_per_hr":     "20",
          "cap_per_hr":      "1120",
          "interval_ms":     3600000,
          "next_payment_ts": 1783011600000
        },
        "open_interest":   "0.02346",
        "day_ntl_vlm":     "3772.890084",
        "prev_day_px":     "61719.4",
        "change_24h":      "-0.00300293",
        "halted":          false
      }
    ],
    "spot": {
      "pairs": [
        {
          "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "active": true, "mark_px": "50000", "mid_px": "50000", "prev_day_px": null,
          "day_ntl_vlm": "0", "min_notional": "1", "taker_fee_bps": "5",
          "circulating_supply": "0"
        }
      ],
      "tokens": [
        {
          "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6,
          "is_canonical": true, "evm_contract": null,
          "system_address": "0x80abd3bd8c42d2a279e4fa00f20bb30637734371",
          "token_id": "0xf23ea17597e324c04f842e6d8bfffe75636f0af88e7c7ab93ea755d9056396bc"
        }
      ]
    }
  }
}
```

每个 `perp` 行都是 [`market_info`](#market_info) 记录的**动态**部分——两者
由同一个构建器生成，因此永远不会出现不一致；**静态**部分则位于
[`markets_meta`](#markets_meta)，通过 `(coin, kind)` 联接。当订单簿单边挂单
时，该行会**省略** `mid_px`（绝不会以 `null` 发送）。实时 WS
[`markets`](../../ws/subscriptions.md#markets) 频道推送的正是这些动态行
（订阅时推送一次完整快照，随后仅推送发生变化的行增量）。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `perp[*].coin` | string | 市场代码，例如 `"BTC"`（联接键） |
| `perp[*].kind` | `"perp"` | 市场类型（小写，联接键） |
| `perp[*].mark_px` | Decimal string | 订单簿标记价格，**人类可读十进制平面**，已对齐至价格档位（预言机回退；未设定时为 `"0"`） |
| `perp[*].oracle_px` | Decimal string | 指数价格，人类可读十进制平面，已对齐至价格档位（未设定时为 `"0"`） |
| `perp[*].mid_px` | Decimal string | 订单簿中间价 `(best_bid + best_ask) / 2`，人类可读十进制，已对齐至价格档位；单边挂单/空盘时**省略** |
| `perp[*].premium` | Decimal string \| null | 最新已提交的资金费率溢价样本（带符号），**8 位小数**字符串（向零截断）；无样本时为 `null` |
| `perp[*].funding.rate_per_hr` | bps string | 最新每小时资金费率样本（截限前），十进制 bps |
| `perp[*].funding.cap_per_hr` | bps string | 每小时资金费率上限，十进制 bps |
| `perp[*].funding.interval_ms` | uint64 | 各资产的资金费率结算周期（1 小时 = `3600000`） |
| `perp[*].funding.next_payment_ts` | uint64 | 下一个对齐的资金费率结算时间点（epoch 毫秒）；首次采样前为 `0` |
| `perp[*].open_interest` | Decimal string | 当前未平仓量（数量单位） |
| `perp[*].day_ntl_vlm` | Decimal string | 24 小时名义成交额 |
| `perp[*].prev_day_px` | Decimal string \| null | 24 小时前的价格；未知时为 `null` |
| `perp[*].change_24h` | Decimal string \| null | 24 小时价格变化（比例，带符号）；无前值时为 `null` |
| `perp[*].halted` | bool | 市场是否暂停 |
| `spot.pairs` | array | 现货交易对注册表（与 [`spot_meta`](./spot.md#spot_meta) 的 `pairs` 行相同，另加实时 `mark_px` / `mid_px` / `day_ntl_vlm`） |
| `spot.tokens` | array | 现货代币注册表（与 [`spot_meta`](./spot.md#spot_meta) 的 `tokens` 行相同） |

各市场的**静态**字段（`sz_decimals`、`tick_size`、`step_size`、`min_order`、
`max_leverage`、`maint_margin_ratio`、`init_margin_ratio`、`margin_tiers`、
`strict_isolated`、`disable_open` / `disable_close`、`mark_source`、
`fba_enabled`、`asset_id`）**不在**此接口中——请从
[`markets_meta`](#markets_meta) 获取。现货交易对/代币字段的具体语义参见
[`spot_meta`](./spot.md#spot_meta)。

### 获取所有市场的静态元数据 {#markets_meta}

所有已注册市场的**静态**元数据——即市场发布一次后极少变化的长期字段
（精度网格、杠杆/保证金阶梯、交易控制标志、标记价格来源），以及
`(coin, kind)` 联接键——连同现货交易对/代币注册表一并返回。这是
[`markets`](#markets) 的静态对应接口：两部分合起来覆盖了
[`market_info`](#market_info) 返回的每一个字段，因此客户端可以缓存静态
部分，只轮询动态的 [`markets`](#markets) 部分。同样支持可选的 `kind`
过滤器。

```json
{ "type": "markets_meta" }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | 否 | 分区过滤器——缺省 = 两部分都返回；`"perp"` = 仅返回永续数组；`"spot"` = 仅返回现货部分 |

`data` 载荷是一个**对象**，包含一个 `perp` 数组（每一项都是一条**静态**行）
以及与 [`markets`](#markets) 相同的 `spot` `{pairs, tokens}` 对象。`perp`
各行按市场 id 升序排列。

响应（`perp` 截断为一条示例；`spot` 部分与 [`markets`](#markets) 相同）：

```json
{
  "type": "markets_meta",
  "data": {
    "perp": [
      {
        "coin":               "BTC",
        "kind":               "perp",
        "sz_decimals":        5,
        "tick_size":          "0.1",
        "step_size":          "0.00001",
        "min_order":          "0.00001",
        "max_leverage":       50,
        "maint_margin_ratio": "1320",
        "init_margin_ratio":  "200",
        "margin_tiers": [
          { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
          { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
          { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
          { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
        ],
        "strict_isolated": false,
        "disable_open":    false,
        "disable_close":   false,
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "asset_id":        0
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

每个 `perp` 行都是 [`market_info`](#market_info) 记录的**静态**部分，通过
`(coin, kind)` 与其动态的 [`markets`](#markets) 行相联接。此处不包含任何
逐区块变化的动态字段（`mark_px`、`oracle_px`、`mid_px`、`premium`、
`funding`、`open_interest`、`day_ntl_vlm`、`prev_day_px`、`change_24h`、
`halted`）。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `perp[*].coin` | string | 市场代码（联接键） |
| `perp[*].kind` | `"perp"` | 市场类型（小写，联接键） |
| `perp[*].sz_decimals` | uint8 | 数量显示小数位 |
| `perp[*].tick_size` | Decimal string | 最小价格变动单位（人类可读十进制，例如 `"0.1"`） |
| `perp[*].step_size` | Decimal string | 最小数量变动单位/手数（人类可读十进制） |
| `perp[*].min_order` | Decimal string | 最小委托数量（人类可读十进制） |
| `perp[*].max_leverage` | uint8 | 最大杠杆倍数（保证金阶梯的最高档） |
| `perp[*].maint_margin_ratio` | bps string | 基础维持保证金率，十进制 bps |
| `perp[*].init_margin_ratio` | bps string | 基础初始保证金率，十进制 bps |
| `perp[*].margin_tiers` | array | 按名义价值分档的杠杆阶梯（参见 [`market_info`](#market_info)）；每项为 `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`，按上界升序排列，`null` = 无上限的最高档 |
| `perp[*].strict_isolated` | bool | 市场是否强制严格逐仓保证金 |
| `perp[*].disable_open` / `disable_close` | bool | 该市场是否禁止开仓/平仓 |
| `perp[*].mark_source` | string | 标记价格来源描述符（例如 `"oracle_median"`） |
| `perp[*].fba_enabled` | bool | 该市场是否启用频繁批量竞价（FBA） |
| `perp[*].asset_id` | uint32 | **已废弃**的索引器兼容层字段——不要依赖它构建功能 |
| `spot.pairs` / `spot.tokens` | array | 现货交易对/代币注册表，与 [`markets`](#markets) 相同（参见 [`spot_meta`](./spot.md#spot_meta)） |

现货交易对/代币字段的具体语义参见 [`spot_meta`](./spot.md#spot_meta)。

### 获取聚合订单簿档位 {#l2_book}

市场范围内的买卖盘聚合档位。

```json
{ "type": "l2_book", "coin": "BTC" }
```

| 参数 | 类型 | 必填 |
|-----|------|----------|
| `coin` | symbol | 是 |

缺少 `coin` → `400 {"error":"missing field coin"}`。

响应：

```json
{
  "type": "l2_book",
  "data": {
    "coin": "BTC",
    "bids": [ { "px": "61663.1", "size": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "size": "0.04862", "n_orders": 1 } ]
  }
}
```

买盘按最优档位优先排列（价格降序），卖盘价格升序。每个档位汇总合计的
`size` 及挂单数 `n_orders`。未知或空盘的市场返回空的 `bids` / `asks` 数组。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `coin` | string | 回显的市场代码 |
| `bids[*].px` / `asks[*].px` | i128 string | 档位价格，定点十进制字符串（订单/订单簿 1e8 平面） |
| `bids[*].size` / `asks[*].size` | u128 string | 该档位的合计数量 |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | 该档位的挂单数 |

### 获取近期公开成交记录 {#recent_trades}

市场范围内的公开成交记录，直接从节点已提交的链上状态中提供（每个市场有一个
有界成交环形缓冲区，已折叠进 AppHash——无需外部索引器）。

```json
{ "type": "recent_trades", "coin": "BTC" }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `coin` | symbol | 是 | 市场代码 |
| `limit` | uint32 | 否 | 限制返回的**最新**记录条数；缺省或为 `0` 时返回完整环形缓冲区 |

响应：

```json
{
  "type": "recent_trades",
  "data": {
    "coin":           "BTC",
    "last_trade_ms":  1783001424768,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783001424768,
        "tid":   17691615279761551171,
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

记录按时间从旧到新排列（最新记录在最后）。环形缓冲区有容量上限，因此返回的
是近期窗口数据，而非完整历史。未知或从未成交的市场返回 `"trades": []` 及
`last_trade_ms: 0`。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `coin` | string | 回显的市场代码 |
| `last_trade_ms` | uint64 | 最后一笔成交的时间戳（无成交时为 `0`） |
| `trades[*].coin` | string | 本笔成交所在的市场代码 |
| `trades[*].side` | `"B"` / `"A"` | 主动方（吃单方）方向——`"B"` = 买入，`"A"` = 卖出 |
| `trades[*].px` | Decimal string | 成交价格，**十进制 USDC**（人类可读） |
| `trades[*].sz` | Decimal string | 成交数量，**基础单位**（整单位） |
| `trades[*].time` | uint64 | 成交时间戳（共识毫秒） |
| `trades[*].tid` | uint64 | 确定性成交 id（成交双腿共享同一 id）；可能超过 2⁵³——请按 64 位/大整数解析，不要当作 JS number |
| `trades[*].block` | uint64 | 成交结算所在的已提交区块高度（链上定位符） |
| `trades[*].hash` | hex string | 原始委托单的交易哈希，`0x` 前缀十六进制——可用于链上追溯成交记录 |

### 获取时间窗口内的成交记录 {#trades_by_time}

与 [`recent_trades`](#recent_trades) 类似，但会在每个市场的成交环形缓冲区
（有界的近期窗口）内按 `[start_time, end_time]` 时间窗口过滤。若需要超出
环形缓冲区范围的深度历史记录，请使用网关归档类型。

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `coin` | symbol | 是 | 市场代码 |
| `start_time` | uint64 | 否 | 窗口起始（毫秒，含边界）；按成交 `time` 过滤。缺省 ⇒ 下界不限 |
| `end_time` | uint64 | 否 | 窗口终止（毫秒，含边界）。缺省 ⇒ 上界不限 |

响应：

```json
{
  "type": "trades_by_time",
  "data": {
    "coin":       "BTC",
    "start_time": 1783000000000,
    "end_time":   1783011600000,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783000781368,
        "tid":   4898317237641214538,
        "block": 37692,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

`trades` 使用与 [`recent_trades`](#recent_trades) 相同的单笔成交结构，按
时间从旧到新排列。`start_time` / `end_time` 会被回显（缺省时为 `null`）。
窗口外或从未成交的市场返回 `"trades": []`。

### 获取历史 OHLCV K 线 {#candle_snapshot}

`(coin, interval)` 的历史 OHLCV K 线。这是唯一的 K 线查询接口（独立的
`candle` 类型已被**移除**）：优先从归档服务提供数据，若未接入归档，则回退
为从公开成交流折叠生成的 K 线。它是实时
[`candles`](../../ws/subscriptions.md#candles) WS 频道的 REST 对应接口。

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `coin` | symbol | 是 | 市场代码，例如 `"BTC"` |
| `interval` | string | 是 | 时间粒度标识——`1m`、`5m`、`15m`、`1h`、`4h`、`1d` 之一 |
| `start_time` | uint64 | 否 | 窗口起始（毫秒）；按 K 线开盘时间过滤。默认 `0` |
| `end_time` | uint64 | 否 | 窗口终止（毫秒）；按 K 线开盘时间过滤。默认不限 |

缺少 `coin` → `400 {"error":"missing field coin"}`；缺少 `interval` →
`400 {"error":"missing field interval"}`。

响应：

```json
{
  "type": "candle_snapshot",
  "data": {
    "candles": [
      {
        "t": 1783000020000,
        "T": 1783000080000,
        "i": "1m",
        "o": "6164610000000",
        "c": "6165270000000",
        "h": "6165270000000",
        "l": "6164610000000",
        "v": "576",
        "n": 24
      }
    ]
  }
}
```

K 线按 `t`（开盘时间）从旧到新排列；最后一个元素是正在形成的 K 线。若该
市场无历史记录（或未接入归档/折叠数据源），则返回诚实的空 `candles` 数组。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `t` | uint64 | K 线**开盘**时间戳（毫秒，对齐至时间粒度） |
| `T` | uint64 | K 线**收盘**时间戳（毫秒） |
| `i` | string | 时间粒度标识 |
| `o` / `c` / `h` / `l` | Decimal string | **开**盘 / **收**盘 / **最高** / **最低**价格，**1e8 定点**字符串（例如 `"6165270000000"` = `61652.7`） |
| `v` | Decimal string | **基础资产成交量**——该 K 线内的成交数量之和（数量单位，非名义价值） |
| `n` | uint64 | 该 K 线内的成交笔数 |

### 获取资金费率溢价历史 {#funding_history}

市场范围内的资金费率溢价采样记录（溢价环形缓冲区）。

```json
{ "type": "funding_history", "coin": "BTC" }
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|----------|-------------|
| `coin` | symbol | 是 | 市场代码 |
| `start_time` | uint64 | 否 | 窗口起始（毫秒）；按采样 `ts_ms` 过滤 |
| `end_time` | uint64 | 否 | 窗口终止（毫秒） |

缺少 `coin` → `400 {"error":"missing field coin"}`。

响应：

```json
{
  "type": "funding_history",
  "data": {
    "coin": "BTC",
    "samples": [
      { "ts_ms": 1783008579269, "premium": "0.00027179", "funding_rate": "0.00027179" },
      { "ts_ms": 1783008587316, "premium": "0.0005469",  "funding_rate": "0.0005469" }
    ]
  }
}
```

`samples` 是资金费率追踪器中有序的溢价快照环形缓冲区。`premium` 是截限前的
精确 `Decimal` 值，以字符串形式呈现（带符号，全精度）；`funding_rate` 是该
溢价经过各资产资金费率上限处理后的结果——即实际将被收取的费率。当溢价在
上限范围内时，`funding_rate == premium`；超出上限时，`funding_rate` 被截限
至带符号的上限值。未知或空的市场返回 `"samples": []`。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `coin` | string | 回显的市场代码 |
| `samples[*].ts_ms` | uint64 | 采样时间戳（共识毫秒） |
| `samples[*].premium` | decimal string | 原始资金费率溢价样本，截限前（带符号） |
| `samples[*].funding_rate` | decimal string | 实际费率 = `premium` 截限至各资产上限后的值（带符号） |

### 获取预测资金费率 {#predicted_fundings}

各市场的预测资金费率及下次结算时间，覆盖所有已注册的永续合约市场。无需
参数。

```json
{ "type": "predicted_fundings" }
```

`data` 载荷是一个**数组**，每个已注册的永续合约市场各占一项，按市场顺序
升序排列。若市场宇宙为空，则返回 `"data": []`。

响应：

```json
{
  "type": "predicted_fundings",
  "data": [
    { "coin": "BTC", "predicted_rate": "0.0020702132945825193491902456", "next_funding_time": 1783011600000 },
    { "coin": "ETH", "predicted_rate": "0.0091563951859402408793685995", "next_funding_time": 1783011600000 }
  ]
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `coin` | string | 市场代码 |
| `predicted_rate` | decimal string | **截限后**实际将在下一个结算点收取的费率——即溢价经过各资产 `±cap` 处理后的结果，带符号（首次采样前为 `"0"`） |
| `next_funding_time` | uint64 | **下一个对齐的各资产结算时间点**（epoch 毫秒）；首次采样前为 `0` |

:::info
**`predicted_rate` 是实际收取的费率，而非原始溢价。** 它反映了应用各资产
资金费率上限后的结果——即若现在结算资金费率，某持仓将被扣除/入账的金额。
资金费率在各资产的结算时间点（`next_funding_time`）**离散**结算，结算周期
为各资产的 `interval_ms`（默认 1 小时）。截限前的原始溢价序列参见
[`funding_history`](#funding_history)；结算周期/时间点参见
[`market_info`](#market_info) 的 `funding.interval_ms` /
`funding.next_payment_ts`。
:::

### 获取永续合约部署 Gas 竞拍状态 {#mip3_active_bids}

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

| 字段 | 类型 | 说明 |
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

### 列出被标记为可清算的账户 {#liquidatable}

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

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `accounts[*].address` | hex address | 需要处理的账户地址 |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | BOLE 层级 |

状态来源：`Exchange.bole_index.tier`（BOLE 待处理索引——**并非**全量账户
重新扫描）。

> **已标记。** `bole_index` 为 `#[serde(skip)]` 派生的非规范状态，在首次
> 使用或快照加载后通过全量扫描重建。在新发布的快照上，该索引在运行时至少
> 执行一次 BOLE 处理之前为空。

### 获取用户的市场交易限额 {#active_asset_data}

用户在某个市场上的杠杆倍数 / 保证金模式 / 最大交易规模。必填参数：
`address`（0x 十六进制）及 `coin`（代码）。

```json
{ "type": "active_asset_data", "address": "0x<addr>", "coin": "BTC" }
```

| 参数 | 类型 | 必填 |
|-----|------|----------|
| `address` | hex address | 是 |
| `coin` | symbol | 是 |

缺少 `address` → `400 {"error":"missing field: address"}`；缺少 `coin` →
`400 {"error":"missing field coin"}`。

响应：

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "coin": "BTC", "leverage": 50,
    "margin_mode": "cross", "mark_px": "61550.29664777",
    "max_trade_size": "0", "max_trade_szs": ["0", "0"],
    "available_to_trade": ["0", "0"], "has_position": false
  }
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `coin` | string | 回显的市场代码 |
| `leverage` | uint32 | 若有持仓则为持仓杠杆，否则为账户默认杠杆，再否则为市场最大杠杆 |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | 实际生效的保证金模式 |
| `mark_px` | decimal string | 当前标记价格，人类可读十进制平面 |
| `max_trade_size` | decimal string | 该市场的最大委托上限（参见 [`max_market_order_ntls`](#max_market_order_ntls)） |
| `max_trade_szs` | [decimal string, decimal string] | 最大可交易数量 `[买入, 卖出]` |
| `available_to_trade` | [decimal string, decimal string] | 可用于开仓的名义价值 `[买入, 卖出]` |
| `has_position` | bool | 用户在该市场上是否持有非零仓位 |

### 获取市价单最大名义价值上限 {#max_market_order_ntls}

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

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | 资产 ID |
| `ntls[*].max_market_order_ntl` | decimal string | 基于未平仓量上限推导出的规模上限 |

状态来源：各市场的 `PerpAnnotation.oi_cap`，否则取
`default_mip3_limits.max_oi_per_market`。

> **已标记。** 已提交状态中不存在专用的各资产"市价单最大名义价值"字段；
> 未平仓量上限是最接近的已提交风险上限，以**数量**单位报告（撮合层在执行
> 时按实时标记价格换算为名义价值）。

### 列出达到未平仓量上限的资产 {#perps_at_open_interest_cap}

未平仓量达到或超过上限的资产列表。无需参数。

```json
{ "type": "perps_at_open_interest_cap" }
```

响应：

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `assets` | uint32[] | 达到或超过 `oi_cap` 的资产 id，升序排列 |

状态来源：各订单簿的 `open_interest` 与 `PerpAnnotation.oi_cap` 的对比
（无正值上限的订单簿将被跳过）。

### `margin_table` ——已移除 {#margin_table--removed}

:::warning
**`margin_table` 已被移除。** 保证金阶梯现在以 `margin_tiers` 形式**内嵌**
在每条市场记录中——可从 [`market_info`](#market_info)（单个市场）或
[`markets`](#markets)（所有市场）读取。每个档位为
`{max_open_interest: string|null, max_leverage: u8, maint_margin_ratio:
bps-string}`：按上界升序排列，`null` = 无上限的最高档。`margin_table` 请求
现在会返回 `400 {"error":"unknown info type: margin_table"}`。
:::

### 列出永续合约 DEX {#perp_dexs}

列出永续合约 DEX（去中心化交易所）。无需参数。

```json
{ "type": "perp_dexs" }
```

响应：

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `dexs[*].index` | uint64 | `Exchange.perp_dexs` 中的 DEX 索引 |
| `dexs[*].n_assets` | uint64 | DEX 中资产订单簿的数量 |
| `dexs[*].assets` | uint32[] | DEX 中包含的资产 ID |

状态来源：`Exchange.perp_dexs`。


## 另请参阅 {#see-also}

- [`POST /info`](../info.md) — 基础只读端点（封装格式、约定、账户与基础设施查询）
- [现货与保证金查询](./spot.md) — 现货 / 现货保证金 / Earn 读取接口
- [永续合约](../../../products/perpetuals.md) — 产品说明
