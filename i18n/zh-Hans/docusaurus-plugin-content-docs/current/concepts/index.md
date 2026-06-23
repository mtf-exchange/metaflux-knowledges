---
description: 核心机制 — agent 钱包、保证金、清算、订单类型、vault、费用和词汇表。
---

# 概念

MetaFlux 核心机制的白话解释 — 它们的工作原理、如何使用，以及在压力下的表现。

## 集成商阅读顺序

1. [Agent 钱包](./agent-wallets.md) — 热键委托、标准做市商设置
2. [订单类型](./order-types.md) — TIF、STP、触发器、TWAP、scale
3. [保证金模式](./margin-modes.md) — Cross / Isolated / Strict-Iso
4. [标记价格](./mark-prices.md) — 推动保证金、清算、触发器的因素
5. [分级清算](./tiered-liquidation.md) — T0 黄牌 → T4 ADL
6. [资金费率](./funding-rates.md) — 小时用户对用户支付
7. [费用](./fees.md) — maker/taker 等级 + 销毁
8. [子账户](./sub-accounts.md) — 策略 / 风险隔离
9. [投资组合保证金](./portfolio-margin.md) — 跨资产类似 SPAN 的保证金

## 现货和收益

- [现货交易](./spot-trading.md) — **已上线**：token 对 token CLOB、预留余额托管、无杠杆
- [现货保证金](./spot-margin.md) — **计划中**：由 Earn 池资助的杠杆现货
- [Earn](./earn.md) — **计划中**：USDC 借贷池为现货保证金借入融资

:::info
**仅现货符合伊斯兰教义。** 现货交易 — 无杠杆、无保证金、无资金费用支付 — 是 MetaFlux 唯一通常被认为符合伊斯兰（Sharia）金融原则的产品；杠杆和衍生品类产品通常不符合。详见 [现货交易](./spot-trading.md)。本说明仅供参考，不构成宗教或财务建议。
:::

## 高级

- [ADL](./adl.md) — T4 自动减仓数学
- [多签](./multi-sig.md) — 机构 M-of-N
- [Vaults](./vaults.md) — MFlux Vault + 用户 vault
- [Staking](./staking.md) — 委托 MTF，赚取奖励
- [RFQ](./rfq.md) — 规模询价
- [FBA](./fba.md) — 频繁批量拍卖匹配

## 参考

- [词汇表](./glossary.md) — 每个协议特定术语的定义
