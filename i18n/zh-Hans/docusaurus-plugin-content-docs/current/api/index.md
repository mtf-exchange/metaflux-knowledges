---
description: REST 与 WebSocket 接口——三种协议族，均由同一条链驱动。
---

# API 参考

三种协议族，均通过同一个网关入口提供服务
（`https://<net>-gateway.mtf.exchange`）——客户端选择哪种协议，只需选择对应的路径即可。

| 协议族 | 路径 | 适用场景 |
|--------|-------|----------|
| **MTF 原生** | 网关**默认**路径：`POST /exchange`、`POST /info`、`GET /ws`、`POST /faucet` | 新建客户端。采用简洁的 snake_case 数据格式，完整暴露所有功能，包括 MTF 特有能力（RFQ、FBA、PM 开户、跨链等）。 |
| **HL 兼容** | 网关 `/hl/*` 路径：`POST /hl/exchange`、`POST /hl/info`、`GET /hl/ws` | 迁移现有 HL 客户端。JSON 数据格式与 HL 完全一致，`order`、`cancel` 等指令无需修改任何代码（更多指令将持续跟进）。 |
| **CCXT 兼容** | 网关 `/ccxt/*` 路径 | 已使用 CCXT 框架的量化客户端。当前已上线基础 REST 子集；CCXT Pro WebSocket 即将推出。 |

> 网关是统一的流量入口——MTF 原生协议走默认路径（`/info`、`/exchange`），HL 兼容路径以 `/hl/*` 为命名空间，CCXT 以 `/ccxt/*` 为命名空间。如果你自行运行节点，节点会在 `http://localhost:8080` 直接提供相同的原生接口。

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF 原生；完整 Action 目录
- [`POST /info`](./rest/info.md) — MTF 原生；各类型数据结构说明
- [HL 兼容](./rest/hl-compat.md) — 与 HL 协议完全镜像
- [CCXT 兼容](./rest/ccxt-compat.md) — CCXT REST 方法

## WebSocket

- [WS 协议](./ws/index.md) — 连接生命周期、帧格式、鉴权与断线重连
- [订阅频道](./ws/subscriptions.md) — 完整频道目录

## 通用说明

- [错误码](./errors.md) — 完整错误目录及处理建议
- [频率限制](./rate-limits.md) — 每 IP 权重配额与每账户 QPS 预算

## 延伸阅读

- [集成快速入门](../integration/quickstart.md) — 5 分钟端到端示例
- [签名流程详解](../integration/signing.md) — EIP-712 信封结构
- [网络配置](../networks.md) — 各网络端点信息
