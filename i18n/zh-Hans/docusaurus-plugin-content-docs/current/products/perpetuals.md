---
description: 永续合约市场——无到期日的杠杆多空交易，通过资金费率锚定现货价格，以标记价格估值，并由分级清算机制提供保护。
---

# 永续合约

:::tip
**已上线。** 永续合约是 MetaFlux 的旗舰市场，也是平台的默认产品——除非页面另有说明，资金费率、标记价格、保证金模式以及清算阶梯均适用于永续合约。
:::

## 概述

**永续合约**（"perp"）是一种追踪资产价格的杠杆合约，**无到期日**——你可以做多或做空，提交[保证金](../concepts/margin-modes.md)支撑持仓，只要持仓健康即可无限持有。由于没有交割日期，多空双方之间定期进行[资金费率](../concepts/funding-rates.md)结算，以维持合约价格与标的资产价格的锚定。持仓以抗操纵的[标记价格](../concepts/mark-prices.md)估值，若持仓的保证金不再足以覆盖亏损，则由[分级清算](../concepts/tiered-liquidation.md)机制逐步减仓，而非一次性强制平仓。

永续合约与[现货](./spot.md)完全独立：永续合约持仓是以抵押品为后盾的杠杆敞口，并非资产的实际所有权。

## 永续合约的运作原理

- **方向与杠杆。** 买入做多，卖出做空。[杠杆](../concepts/margin-modes.md)允许一定数量的抵押品控制更大的持仓规模，盈亏均等比例放大。通过 [`update_leverage`](../api/rest/exchange.md#update_leverage) 设置各资产的杠杆倍数及全仓/逐仓切换。
- **无到期日。** 永续合约永不交割——持仓持续存在，直到你主动平仓或被清算。
- **资金费率维持锚定。** 每小时，多空双方之间进行一次[资金费率](../concepts/funding-rates.md)结算，将永续合约价格拉向标的资产价格。资金费率在**交易者之间**互相支付，不流入交易所。
- **标记价格驱动风险计算。** 你的保证金、未实现盈亏、清算线和条件单触发价格，均基于[标记价格](../concepts/mark-prices.md)计算，而非最新成交价——因此单笔异常成交不会扭曲你的持仓状态。

## 交易操作

永续合约订单指向永续合约的 **`market`** id（与现货 `pair` 不同）。订单界面使用 MetaFlux 全平台共享的 CLOB。

| 操作 | 说明 |
|---|---|
| [`submit_order`](../api/rest/exchange.md#submit_order) | 提交一笔永续合约订单（限价单/市价单/条件单），支持所有[订单类型](../concepts/order-types.md) |
| [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`batch_cancel`](../api/rest/exchange.md#batch_cancel) | 按 `oid` 撤单，单签名可撤一笔或多笔 |
| [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) / [`cancel_all_orders`](../api/rest/exchange.md#cancel_all_orders) | 按客户端 id 撤单，或撤销所有订单（可按资产筛选） |
| [`update_leverage`](../api/rest/exchange.md#update_leverage) | 修改杠杆倍数或切换某资产的逐仓保证金模式 |
| [`set_position_mode`](../api/rest/exchange.md#set_position_mode) | 切换单向模式与[对冲模式](../concepts/hedge-mode.md)（同时持有多空仓位） |

`submit_order` 在订单提交确认后**同步**返回每笔订单的状态——包含分配的 `oid` 以及 `resting`（挂单中）/ `filled`（已成交）/ `error`（错误）状态，若在等待窗口内未收到确认则返回 `pending`。订单可由主账户或已激活的[代理钱包](../concepts/agent-wallets.md)签名。

## 保证金与风险

永续合约共享平台完整的保证金与风险管理体系：

- [**保证金模式**](../concepts/margin-modes.md) — 全仓 / 逐仓 / 严格逐仓，以及抵押品在持仓间的共享或隔离方式。
- [**对冲模式**](../concepts/hedge-mode.md) — 在同一市场同时持有多仓和空仓。
- [**组合保证金**](../concepts/portfolio-margin.md) — 跨资产、类 SPAN 的保证金，用于对冲不同敞口。
- [**分级清算**](../concepts/tiered-liquidation.md) — 渐进式清算阶梯（T0 预警 → 分步减仓 → T4），而非一次性强制平仓。
- [**ADL**](../concepts/adl.md) — 当保险基金耗尽时，自动减仓作为最终兜底手段。

## 手续费

永续合约成交收取**挂单方**（maker）和**吃单方**（taker）手续费。你的基础费率来自过去 30 天的成交量档位；挂单返佣档位和质押折扣在此基础上叠加（三者的组合方式详见[费率表](../concepts/fee-schedule.md)）。

| 30 天成交量 | Taker | Maker |
|---------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

挂单返佣档位（挂单量占比）可使你的**净挂单费率为负**（即做市可获返佣）；质押折扣可将你的 **taker 费率最高降低 50%**。费率为治理参数——通过 [`/info fee_schedule`](../api/rest/info.md#fee_schedule) 查询实时费率。**资金费率不是手续费**——它是多空双方之间定期进行的[资金结算](../concepts/funding-rates.md)，不构成交易所收入。完整费率机制详见[手续费](../concepts/fees.md)。

## 上线新永续合约市场

永续合约市场**无需许可**即可部署：任何开发者均可通过赢得链上 gas 竞拍并提交初始风险参数（初始维持保证金比率、最大杠杆、资金费率上限）来上线新的永续合约，参数须在治理设定的范围内。无需审核委员会，无需白名单。部署流程详见 [MIP-3](../mip/mip-3.md)，承接散户流量的计划流动性聚合器详见 [MIP-4](../mip/mip-4.md)。

## 延伸阅读

- [资金费率](../concepts/funding-rates.md) — 每小时多空双方之间的资金结算
- [标记价格](../concepts/mark-prices.md) / [预言机价格](../concepts/oracle-prices.md) — 持仓估值的依据
- [订单类型](../concepts/order-types.md) — TIF、STP、条件单、TWAP、梯度挂单
- [保证金模式](../concepts/margin-modes.md) — 全仓 / 逐仓 / 严格逐仓
- [分级清算](../concepts/tiered-liquidation.md) — 清算阶梯详解
- [`submit_order`](../api/rest/exchange.md#submit_order) — 接口操作说明与字段表
- [MIP-3](../mip/mip-3.md) — 无需许可的永续合约市场部署
- [现货](./spot.md) — 无杠杆、基于资产所有权的现货市场
