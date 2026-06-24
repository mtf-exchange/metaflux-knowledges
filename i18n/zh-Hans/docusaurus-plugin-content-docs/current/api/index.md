---
description: "REST 与 WebSocket 接口——三大协议族，均由同一条链提供支撑。"
---

# API 参考

三大协议族，均通过同一网关入口（`https://<net>-gateway.mtf.exchange`）提供服务——客户端选择哪种报文格式，仅是路径选择的差异。

| 协议族 | 地址 | 适用场景 |
|--------|-------|----------|
| **MTF 原生** | 网关**默认**路径：`POST /exchange`、`POST /info`、`GET /ws`、`POST /faucet` | 新客户端接入。紧凑的 snake_case 报文格式，完整暴露所有功能，包括 MTF 高级特性（RFQ、FBA、PM 注册、跨链操作）。 |
| **HL 兼容** | 网关 `/hl/*` 路径：`POST /hl/exchange`、`POST /hl/info`、`GET /hl/ws` | 将现有 HL 客户端迁移至 MetaFlux。JSON 报文格式与 HL 完全一致，`order`、`cancel` 等操作无需修改任何代码（更多变体持续上线）。 |
| **CCXT 兼容** | 网关 `/ccxt/*` 路径 | 已使用 CCXT 框架的量化策略。当前提供最小 REST 子集；CCXT Pro WS 即将上线。 |

> 网关是统一的接入入口——MTF 原生为默认路径（`/info`、`/exchange`），HL 兼容命名空间在 `/hl/*` 下，CCXT 在 `/ccxt/*` 下。如需自行运行节点，它将在 `http://localhost:8080` 直接提供相同的原生接口。

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF 原生；完整操作目录
- [`POST /info`](./rest/info.md) — MTF 原生；各类型 Schema
- [HL 兼容](./rest/hl-compat.md) — 镜像 HL 报文格式
- [CCXT 兼容](./rest/ccxt-compat.md) — CCXT REST 方法

## WebSocket

- [WS 协议](./ws/index.md) — 连接生命周期、帧格式、鉴权、断线重连
- [订阅频道](./ws/subscriptions.md) — 完整频道目录

## 通用说明

- [错误码](./errors.md) — 完整错误目录及处理建议
- [频率限制](./rate-limits.md) — 单 IP 权重配额及单账户 QPS 预算

## 延伸阅读

- [集成快速入门](../integration/quickstart.md) — 5 分钟端到端接入
- [签名指南](../integration/signing.md) — EIP-712 信封格式
- [网络配置](../networks.md) — 各网络端点信息
