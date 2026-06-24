---
description: 将客户端接入 MetaFlux —— SDK、签名、迁移、幂等性与错误处理。
---

# 集成

如何将客户端连接到 MetaFlux。根据你的起点，选择对应的路径。

## 从哪里开始

| 如果你的起点是…… | 前往 |
|--------------------------|-------|
| 从零开始，只想试试看 | [快速入门](./quickstart.md) |
| 已有 HL 机器人 / 工具 | [从 HL 迁移](./migrating-from-hl.md) |
| 基于 CCXT 的量化框架 | [CCXT 集成](../api/rest/ccxt-compat.md) |
| 全新 TypeScript / 浏览器项目 | [TypeScript SDK](./typescript-sdk.md) |
| 全新 Rust 服务 | [Rust SDK](./rust-sdk.md) |
| 其他语言（Python、Go 等） | [类型化数据签名](./typed-data-signing.md) —— 自行实现 EIP-712 类型化数据签名 |

## 主题索引

- [快速入门](./quickstart.md) —— 5 分钟端到端流程（充值 → 交易 → 提款）
- [类型化数据签名](./typed-data-signing.md) —— EIP-712 签名方案，含完整可运行示例
- [签名详解](./signing.md) —— 指向类型化数据签名的跳转页（为旧链接保留）
- [代理钱包使用指南](./agent-wallets-howto.md) —— 热密钥模式的具体代码实现
- [幂等性](./idempotency.md) —— nonce 策略与安全重试
- [错误处理](./error-handling.md) —— 接受 / 提交 / 网络错误的决策树
- [风险监控模式](./risk-watcher.md) —— 自动补充保证金
- [从 HL 迁移](./migrating-from-hl.md) —— HL 机器人的直接替换方案

## SDK

| 语言 | 状态 | 包名 |
|----------|--------|---------|
| TypeScript / JavaScript | 预览版 | [`@metaflux/sdk`](./typescript-sdk.md) |
| Rust | 预览版 | [`metaflux-client`](./rust-sdk.md) |

对于其他语言（Python、Go、Java、C++ 等），请按照[类型化数据签名](./typed-data-signing.md)文档自行实现 EIP-712 类型化数据签名 —— 每个步骤均附有完整示例。协议传输层足够精简，对于小众技术栈来说，手写客户端是合理的选择。

## 网络端点

完整的各网络配置请参见[网络](../networks.md)。

网关（`https://<net>-gateway.mtf.exchange`）是唯一的公共入口。

| 路径 | 服务类型 | 用途 |
|------|--------|---------|
| `POST /info` · `POST /exchange` · `GET /ws` | MTF 原生（默认） | 原生 snake_case 接口 |
| `POST /hl/info` · `POST /hl/exchange` · `GET /hl/ws` | HL 兼容 | HL 报文格式 |
| `/ccxt/*` | CCXT 兼容 | CCXT REST 方法 |
| `POST /evm` | EVM JSON-RPC | EVM 侧链 RPC |
| `POST /faucet` | 水龙头 | devnet/testnet 测试代币领取 |

生产环境在网关处终止 TLS，并由 CDN 前置；节点本身不直接暴露在公网，始终位于网关之后。若自行运行节点，同样的原生接口将直接服务于 `http://localhost:8080`（原始 EVM RPC 位于 `http://localhost:8545`）。

## 常见模式

- **做市机器人** —— 代理签名、持续报价、风险监控 sidecar、ALO 订单确保享受保证做市商费率
- **清算监控** —— 订阅 `marginEvents` 和 `userEvents`（`yellowCard`）的 WebSocket 推送；在触发 T1 前自动补充保证金
- **TWAP 执行器** —— 提交 `TwapOrder`，监听 `twapEvents` 获取分片执行遥测数据，支持中途手动取消
- **金库管理器** —— 一次性执行 `VaultDeploy`，随后以代理签名方式对金库地址发送 Orders 进行再平衡
- **机构托管** —— 多签主账户 + 各主机独立代理 + 针对大额资金流的多签封装
