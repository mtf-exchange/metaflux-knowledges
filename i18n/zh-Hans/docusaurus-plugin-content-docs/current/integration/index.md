---
description: 将客户端接入 MetaFlux — SDK、签名、迁移、幂等性、错误处理。
---

# Integration

如何将客户端连接到 MetaFlux。选择与你的起点相匹配的路径。

## Starting points

| If you're starting from… | Go to |
|--------------------------|-------|
| Nothing — just want to try it | [快速开始](./quickstart.md) |
| An existing HL bot / tool | [从 HL 迁移](./migrating-from-hl.md) |
| A CCXT-based quant framework | [CCXT integration](../api/rest/ccxt-compat.md) |
| Greenfield TypeScript / browser | [TypeScript SDK](./typescript-sdk.md) |
| Greenfield Rust service | [Rust SDK](./rust-sdk.md) |
| Anything else (Python, Go, …) | [类型化数据签名](./typed-data-signing.md) — 自行实现 EIP-712 类型化数据签名 |

## Topics

- [快速开始](./quickstart.md) — 5 分钟端对端（充值 → 交易 → 提现）
- [类型化数据签名](./typed-data-signing.md) — EIP-712 签名方案，端对端工作示例
- [签名演练](./signing.md) — 指向类型化数据签名的指针（保留用于旧链接）
- [Agent 钱包操作指南](./agent-wallets-howto.md) — 热密钥模式的具体代码
- [幂等性](./idempotency.md) — 随机数策略 + 安全重试
- [错误处理](./error-handling.md) — admission vs commit vs 网络决策树
- [风险监控模式](./risk-watcher.md) — 自动保证金充值
- [从 HL 迁移](./migrating-from-hl.md) — HL 机器人的直接替代品

## SDKs

| Language | Status | Package |
|----------|--------|---------|
| TypeScript / JavaScript | preview | [`@metaflux/sdk`](./typescript-sdk.md) |
| Rust | preview | [`metaflux-client`](./rust-sdk.md) |

对于其他语言（Python、Go、Java、C++ 等），请按照 [类型化数据签名](./typed-data-signing.md) 实现 EIP-712 类型化数据签名 — 每一步都有工作示例的文档记录。通信协议足够简洁，对于特定的技术栈来说，手工编写的客户端是正确的选择。

## Network endpoints

参考 [networks](../networks.md) 获取完整的网络参考。

网关（`https://<net>-gateway.mtf.exchange`）是唯一的公开入口。

| Path | Serves | Purpose |
|------|--------|---------|
| `POST /info` · `POST /exchange` · `GET /ws` | MTF-native (default) | 原生 snake_case 接口 |
| `POST /hl/info` · `POST /hl/exchange` · `GET /hl/ws` | HL-compat | HL 通信格式 |
| `/ccxt/*` | CCXT-compat | CCXT REST 方法 |
| `POST /evm` | EVM JSON-RPC | EVM 侧链 RPC |
| `POST /faucet` | Faucet | devnet/testnet 测试水龙头 |

生产部署在网关处终止 TLS 并用 CDN 进行前置代理；节点故意不暴露于互联网 — 它位于网关后面。自己运行节点时，相同的原生接口可以直接在 `http://localhost:8080` 处获得（原始 EVM RPC 在 `http://localhost:8545`）。

## Common patterns

- **Maker bot** — agent 签名的持久报价、风险监控侧进程、用于保证做市商等级的 ALO 订单
- **清算监控** — `marginEvents` 和 `userEvents`（`yellowCard`）上的 WS 订阅者；在 T1 前触发充值
- **TWAP 包装器** — 提交 `TwapOrder`，监控 `twapEvents` 获取切片遥测，可选的运行中手动取消
- **Vault 管理** — 一次 `VaultDeploy`，然后对 vault 地址使用 agent 签名的 Orders 进行重新平衡
- **机构托管** — 多签主钱包 + 每主机代理 + 高价值流程的多签包装
