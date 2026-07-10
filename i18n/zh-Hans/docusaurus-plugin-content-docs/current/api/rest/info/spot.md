---
description: "POST /info 现货市场、杠杆现货保证金及 Earn 借贷池的读取查询。"
---

# `POST /info` — 现货与保证金查询

针对[现货](../../../products/spot.md)市场、杠杆[现货保证金](../../../products/spot-margin.md)及 [Earn](../../../concepts/earn.md) 借贷池的读取查询。使用与[基础页面](../info.md)相同的 `POST /info` 端点和请求信封。

## 现货、现货保证金与 Earn 查询类型 {#spot-spot-margin--earn-query-types}

### 现货交易对全集与代币注册表 {#spot_meta}

现货交易对全集及逐代币注册表。无需参数。

```json
{ "type": "spot_meta" }
```

响应：

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

:::info
**`pairs` 包含两类条目。** 每个代币的"自配对"（`id` 等于代币 id，`base == quote`，例如 `100`/USDC、`101`/BTC、……、`104`/MTF）是代币注册表以交易对形式的投影；**真正可交易的交易对** id 从 `110` 起（`BTC/USDC`=110、`ETH/USDC`=111、`SOL/USDC`=112、`MTF/USDC`=113），具有不同的 `base`/`quote` 且 `active:true`。自配对的 `active` 字段反映该代币独立订单簿是否上线（在 Devnet 上仅 USDC 为活跃状态）。
:::

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `pairs[*].id` | uint32 | 交易对 id（`SpotPairSpec.pair_id`）；`110+` 为真实 `BASE/USDC` 交易对 |
| `pairs[*].name` | string | 交易对名称（如 `"BTC/USDC"`） |
| `pairs[*].base` / `quote` | uint32 | 基础资产 / 计价资产 id（自配对中两者相等） |
| `pairs[*].taker_fee_bps` | uint16 | Taker 手续费（基点）；未设置时为 `0` |
| `pairs[*].min_notional` | decimal string | 最低名义金额（USDC 分位）；未设置时为 `"0"` |
| `pairs[*].active` | bool | 该交易对是否处于活跃可交易状态 |
| `tokens[*].id` | uint32 | 现货代币资产 id（`100`=USDC、`101`=BTC、`102`=ETH、`103`=SOL、`104`=MTF） |
| `tokens[*].name` | string | 代币名称（如 `"USDC"`、`"MTF"`） |
| `tokens[*].sz_decimals` | uint8 | 显示 / 数量精度 |
| `tokens[*].wei_decimals` | uint8 | 原生（ERC-20 风格）代币精度（USDC=6、BTC=8、ETH=18、SOL=9、MTF=8） |

`tokens` 和 `pairs` 均按已提交的 `BTreeMap` 顺序排列（按资产 / 交易对 id 升序）。

状态来源：`Exchange.mip3_spot_pair_specs`（交易对）+ `Exchange.mip3_spot_token_specs`（代币）。

### 账户级现货代币余额 {#spot_clearinghouse_state}

账户现货代币余额明细。必填参数：`address`（0x 十六进制）。

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

响应：

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "total": "10", "hold": "0" } ]
  }
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `balances[*].asset` | uint32 | 现货资产 id（`104` = MTF） |
| `balances[*].name` | string | 代币 / 交易对名称，若未知则为 `asset:<id>` |
| `balances[*].total` | decimal string | 总余额，向零截断 |
| `balances[*].hold` | decimal string | 被挂单锁定的金额（托管中）；可用余额 = `total − hold` |

代币集合为该账户余额与托管（`reserved`）键的并集——即使某代币全部被锁定、可用余额为零，也仍会出现在列表中。按账户范围扫描（而非全表遍历）。状态来源：`locus.spot_clearinghouse.{balances, reserved}`（均以 `(owner, asset)` 为键）。

### 账户的全部现货保证金仓位 {#spot_margin_state}

:::info
**仅在 Devnet 上可用（预览版）。** 杠杆[现货保证金](../../../products/spot-margin.md)的读取接口；预览注意事项请参阅对应概念页面。
:::

查询某账户持有的全部现货保证金仓位。必填参数：`user`（0x 十六进制）。

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

响应：

```json
{
  "type": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": 200,
        "collateral": "5",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `accounts[*].pair` | uint32 | 该仓位所属现货交易对 id |
| `accounts[*].collateral` | decimal string | 已存入的计价资产抵押品（亏损缓冲） |
| `accounts[*].borrowed` | decimal string | 未还贷款**本金**（按快照指数计算） |
| `accounts[*].borrow_index_snapshot` | decimal string | 开仓时记录的借贷池指数（计息基准） |
| `accounts[*].base_held` | decimal string | 通过杠杆买入并隔离持有的基础资产（不计入可用余额） |
| `accounts[*].current_debt` | decimal string | 截至当前已计提的债务：`borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | 逐交易对参数 `{ init_bps, maint_bps }`；`null` 表示保证金功能未开启或该交易对尚未校准 |

仓位按交易对 id 顺序列出。若账户无仓位，则返回空 `accounts` 数组。

### Earn 借贷池与账户质押 {#earn_state}

:::info
**仅在 Devnet 上可用（预览版）。** [Earn](../../../concepts/earn.md) 借贷池的读取接口；预览注意事项请参阅对应概念页面。
:::

返回所有 Earn 借贷池信息，以及在提供 `user` 参数时返回该账户的质押数据。可选参数：`user`（0x 十六进制）。

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

响应：

```json
{
  "type": "earn_state",
  "data": {
    "pools": [
      {
        "asset": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": 1000,
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `pools[*].asset` | uint32 | 可借出的计价资产 id（池标识键） |
| `pools[*].total_supplied` | decimal string | 池净资产价值（NAV）——已存入本金加上已复利的利息 |
| `pools[*].total_borrowed` | decimal string | 当前借给现货保证金借款方的计价资产数量 |
| `pools[*].idle` | decimal string | `total_supplied − total_borrowed`——可即时提取的上限 |
| `pools[*].shares_total` | decimal string | 流通份额总量 |
| `pools[*].share_value` | decimal string | `total_supplied / shares_total`（无份额时为 `0`） |
| `pools[*].borrow_index` | decimal string | 累计借贷指数（计息基准） |
| `pools[*].reserve_factor_bps` | uint16 | 协议从借贷利息中抽取的比例（基点） |
| `pools[*].borrow_rate_bps_annual` | uint32 | 年化借贷利率（基点） |
| `pools[*].reserve_accrued` | decimal string | 从利息中累积的协议储备金 |
| `pools[*].user_shares` | decimal string | **仅在提供 `user` 时返回** — 该账户在池中持有的份额数 |
| `pools[*].user_value` | decimal string | **仅在提供 `user` 时返回** — `user_shares × share_value` |

借贷池按资产 id 顺序列出。不传 `user` 时，`user_shares` / `user_value` 字段不会出现在响应中。

### 现货交易对部署 Gas 拍卖状态 {#spot_deploy_state}

MIP-1 现货交易对部署 Gas 拍卖状态。无需参数。

```json
{ "type": "spot_deploy_state" }
```

响应：

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `auction_round` | uint64 | 当前拍卖轮次 |
| `current_bid` | decimal string | 当前最高出价 |
| `current_winner` | hex address \| null | 当前最高出价方 |
| `auction_end_ms` / `started_at_ms` | uint64 | 拍卖窗口时间（共识毫秒时间戳） |
| `total_burned` | decimal string | 历史累计销毁的中标出价名义金额 |
| `deposit` | decimal string | 总托管保证金（基础单位） |

状态来源：`Exchange.spot_pair_deploy_gas_auction`。


## 参见 {#see-also}

- [`POST /info`](../info.md) — 基础读取端点（请求信封、约定、账户与基础设施查询）
- [永续合约查询](./perpetuals.md) — 永续市场读取接口
- [现货](../../../products/spot.md) / [现货保证金](../../../products/spot-margin.md) — 相关产品介绍
