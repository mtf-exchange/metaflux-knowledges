---
description: "REST 与 WebSocket 接口——MTF 原生协议，由链提供支撑。"
---

# API 参考

单一 MTF 原生协议，通过同一网关入口（`https://<net>-gateway.mtf.exchange`）提供服务。

| 接口 | 地址 | 说明 |
|--------|-------|----------|
| **MTF 原生** | `POST /exchange`、`POST /info`、`GET /ws`、`POST /faucet` | 紧凑的 snake_case 报文格式。完整暴露所有功能，包括 MTF 高级特性（RFQ、FBA、PM 注册、跨链操作）。 |

> 网关是 MTF 原生接口（`/info`、`/exchange`、`/ws`）的统一接入入口。如需自行运行节点，它将在 `http://localhost:8080` 直接提供相同的原生接口。

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF 原生；完整操作目录
- [`POST /info`](./rest/info.md) — MTF 原生；各类型 Schema

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
