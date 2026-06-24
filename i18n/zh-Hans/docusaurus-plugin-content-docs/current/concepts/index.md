---
description: 核心机制详解 — 代理钱包、保证金、清算、订单类型、金库、手续费及术语表。
---

# 概念

以平实的语言解释 MetaFlux 的核心机制 — 它们的作用、使用方法，以及在极端行情下的预期表现。

## 集成商阅读顺序

1. [代理钱包](./agent-wallets.md) — 热密钥委托授权，做市商的标准配置
2. [订单类型](./order-types.md) — TIF、STP、触发单、TWAP、梯度挂单
3. [保证金模式](./margin-modes.md) — Cross / Isolated / Strict-Iso
4. [标记价格](./mark-prices.md) — 影响保证金、清算与触发条件的价格来源
5. [分级清算](./tiered-liquidation.md) — T0 黄牌预警 → T4 ADL 强制减仓
6. [资金费率](./funding-rates.md) — 每小时用户间结算的资金费
7. [手续费](./fees.md) — 挂单 / 吃单分级费率 + 销毁机制
8. [费率表](./fee-schedule.md) — 交易量、挂单返佣及质押折扣档位
9. [子账户](./sub-accounts.md) — 策略隔离与风险隔离
10. [组合保证金](./portfolio-margin.md) — 跨资产的类 SPAN 保证金体系

## 收益产品及相关功能

可交易市场现已归入[产品](../products/index.md)板块 — 详见
[永续合约](../products/perpetuals.md)、[现货](../products/spot.md)和
[现货保证金](../products/spot-margin.md)。为现货保证金借贷提供资金的借贷池属于概念层级：

- [收益](./earn.md) — **规划中**：为现货保证金借贷提供资金的 USDC 借贷池
- [现货](../products/spot.md) — **已上线**：逐笔撮合的 CLOB 现货交易，采用预留余额托管机制，不支持杠杆
- [现货保证金](../products/spot-margin.md) — **Devnet 预览**：由 Earn 借贷池提供资金的杠杆现货交易

:::info
**仅限无杠杆现货交易符合伊斯兰教法。** 只有**无杠杆**现货交易 — 即以全额价值直接买卖、不使用杠杆、不涉及保证金、不进行借贷、也不收取资金费 — 才是 MetaFlux 中普遍被认为符合伊斯兰（Sharia）金融原则的产品。不合规产品明确包括**现货保证金（杠杆现货交易）**，以及永续合约和所有其他带杠杆或衍生品性质的产品 — 杠杆与借贷引入了利息（riba）、投机和不确定性（maysir、gharar）。详见[现货交易](../products/spot.md)。本内容仅供参考，不构成宗教或财务建议。
:::

## 进阶内容

- [ADL](./adl.md) — T4 自动减仓的计算逻辑
- [多签](./multi-sig.md) — 机构级 M-of-N 多签方案
- [金库](./vaults.md) — MFlux 金库与用户自建金库
- [质押](./staking.md) — 委托 MTF，赚取奖励
- [RFQ](./rfq.md) — 大额询价机制
- [FBA](./fba.md) — 频繁批量拍卖撮合

## 参考资料

- [术语表](./glossary.md) — 所有协议专用术语的定义
