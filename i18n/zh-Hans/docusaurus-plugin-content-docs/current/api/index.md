---
description: REST 和 WebSocket 接口——三个协议族，全部由同一条链支撑。
---

# API 参考

三个协议族，全部由同一网关入口提供
（`https://<net>-gateway.mtf.exchange`）——客户端的通信形式选择只是路径选择。

| 协议族 | 位置 | 使用场景 |
|--------|-------|----------|
| **MTF-native** | 网关**默认**路径: `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | 新客户端。紧凑的 snake_case 形式。公开所有功能，包括 MTF 差异化特性（RFQ、FBA、PM 注册、跨链）。 |
| **HL-compat** | 网关 `/hl/*` 下: `POST /hl/exchange`, `POST /hl/info`, `GET /hl/ws` | 迁移现有 HL 客户端。JSON 形式与 HL 完全匹配。`order`、`cancel` 无需改动代码（更多变体持续推出）。 |
| **CCXT-compat** | 网关 `/ccxt/*` 下 | 已在使用 CCXT 的量化框架。实时提供最小 REST 子集；CCXT Pro WS 即将推出。 |

> 网关是统一的入口——MTF-native 是默认路径
> （`/info`、`/exchange`），HL-compat 在 `/hl/*` 下独立命名，CCXT 在
> `/ccxt/*` 下。自己运行节点？它在 `http://localhost:8080` 直接提供相同的原生接口。

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native；完整操作目录
- [`POST /info`](./rest/info.md) — MTF-native；按类型架构
- [HL-compat](./rest/hl-compat.md) — HL 通信接口的镜像
- [CCXT-compat](./rest/ccxt-compat.md) — CCXT REST 方法

## WebSocket

- [WS 协议](./ws/index.md) — 连接生命周期、帧、认证、恢复
- [订阅](./ws/subscriptions.md) — 完整频道目录

## 跨域问题

- [错误](./errors.md) — 完整错误目录及补救措施
- [速率限制](./rate-limits.md) — 按 IP 权重 + 按账户 QPS 预算

## 另见

- [集成快速入门](../integration/quickstart.md) — 5 分钟端到端
- [签名演练](../integration/signing.md) — EIP-712 信封
- [网络](../networks.md) — 各网络的端点
