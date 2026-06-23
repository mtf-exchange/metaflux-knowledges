---
description: MetaFlux 衍生品交易所的集成参考、API 表面和核心概念。
slug: /
---

<img src="/img/og.svg" alt="MetaFlux — derivatives, on first principles" class="hero-banner" />

# MetaFlux 知识库

欢迎。如果您正在**集成** 或 **基于** MetaFlux 进行构建，请从这里开始。

:::info
**新手?** 从 [快速入门](./integration/quickstart.md) 开始（5 分钟，充值 → 交易 → 提现）。
**从其他永续 DEX 迁移?** 跳转到 [从 HL 迁移](./integration/migrating-from-hl.md) — 这些模式可转换为其他 HL 兼容机器人。
**在链上构建?** 查看 [MIP-3 无权限市场部署](./mip/mip-3.md)。
:::

## 浏览

<div class="mtf-cardgrid">

- [**API 参考**](./api/) — REST `/exchange` · `/info`，HL- & CCXT 兼容，WebSocket，错误，速率限制
- [**概念**](./concepts/) — 保证金，分层清算，订单类型，资金费率，金库，费用
- [**集成**](./integration/) — 快速入门，签名，幂等性，错误处理，SDK
- [**EVM**](./evm/) — 执行模型，Core ↔ EVM 转账，预编译
- [**改进提案**](./mip/) — 现货/永续部署，金属流动性，收益
- [**跨链桥**](./bridge/) — 验证者签名的资产跨链

</div>

## 快速链接

- [快速入门](./integration/quickstart.md) — 5 分钟充值 → 交易 → 提现
- [从 HL 迁移](./integration/migrating-from-hl.md) — 对 HL 兼容机器人的直接替代
- [`POST /exchange`](./api/rest/exchange.md) — 写入路径 + 完整操作目录
- [`POST /info`](./api/rest/info.md) — 读取路径
- [分层清算](./concepts/tiered-liquidation.md) — T0 → T4 梯度
- [术语表](./concepts/glossary.md)

左侧边栏是详尽的索引；上方的卡片是快速导航。

## 约定

- 这里记录的端点是 **稳定的、公开的** 有线表面。
- 请求/响应示例使用真实形式 — 可安全复制粘贴。
- 价格和大小字段是定点整数（8 位小数）；USDC 金额以 6 位小数基本单位表示。两者都作为 JSON 字符串传输以避免 IEEE-754 精度损失。
- 所有 `_ts` / `_ms` 字段中的时间都是 unix 毫秒（共识派生）。

## 状态图例

每个文档顶部都有一个"状态"标签：

- **stable** — 有线形式已提交用于 V1；可安全构建。
- **preview** — 今天可用；主网前可能进行小的有线更改（会注明）。
- **planned** — 已描述，尚未发布。

查看 [版本控制](./versioning.md) 了解变更控制策略。
