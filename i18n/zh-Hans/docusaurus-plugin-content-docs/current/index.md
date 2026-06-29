---
description: MetaFlux 衍生品交易所的集成参考、API 接口说明与核心概念。
slug: /
---

<img src="/img/og.svg" alt="MetaFlux — derivatives, on first principles" class="hero-banner" />

# MetaFlux 知识库

欢迎。如果您正在**接入**或**基于** MetaFlux 进行开发，请从这里开始。

:::info
**初次接触？** 从[快速入门](./integration/quickstart.md)开始（5 分钟完成充值 → 交易 → 提现）。
**从其他永续合约 DEX 迁移？** 直接查看[从 HL 迁移](./integration/migrating-from-hl.md)——将你的机器人切换到 MTF 原生 SDK / API。
**开发链上应用？** 参阅 [MIP-3 无许可市场部署](./mip/mip-3.md)。
:::

## 文档导览

<div class="mtf-cardgrid">

- [**API 参考**](./api/) — REST `/exchange` · `/info`，WebSocket，错误码，频率限制
- [**核心概念**](./concepts/) — 保证金、分级清算、订单类型、资金费率、金库、手续费
- [**集成指南**](./integration/) — 快速入门、签名、幂等性、错误处理、SDK
- [**EVM**](./evm/) — 执行模型、Core ↔ EVM 资产转移、预编译合约
- [**改进提案**](./mip/) — 现货/永续合约部署、元流动性、收益
- [**跨链桥**](./bridge/) — 基于验证者签名的资产跨链

</div>

## 快速导航

- [快速入门](./integration/quickstart.md) — 5 分钟完成充值 → 交易 → 提现
- [从 HL 迁移](./integration/migrating-from-hl.md) — 将 Hyperliquid 机器人切换到 MTF 原生 API
- [`POST /exchange`](./api/rest/exchange.md) — 写操作路径与完整 action 目录
- [`POST /info`](./api/rest/info.md) — 读操作路径
- [分级清算](./concepts/tiered-liquidation.md) — T0 → T4 阶梯机制
- [术语表](./concepts/glossary.md)

左侧边栏是完整文档索引，上方卡片是快速入口。

## 约定说明

- 本文档中列出的接口均为**稳定的公开**链上接口。
- 请求/响应示例使用真实数据结构，可直接复制使用。
- 价格和数量字段为定点整数（8 位小数精度）；USDC 金额以 6 位小数为基本单位。两者均以 JSON 字符串形式传输，以避免 IEEE-754 精度损失。
- 所有 `_ts` / `_ms` 字段中的时间均为 Unix 毫秒时间戳（来源于共识层）。

## 状态标签说明

每篇文档顶部均带有"状态"标签：

- **stable** — 接口结构已在 V1 中固定，可放心基于此进行开发。
- **preview** — 当前可用；在上线主网前，接口可能有小幅调整（届时会明确说明）。
- **planned** — 已完成设计说明，尚未正式发布。

版本管理与变更控制策略详见[版本说明](./versioning.md)。
