# 网络

:::info
**状态。** **开发网络稳定**。测试网络（`chainId 114514`）和主网（`chainId 8964`）的 chainId 已分配；其端点将在启动前发布。
:::

## 概览

| Network | Status | `chainId` | Stable wire? |
|---------|--------|-----------|:------------:|
| Devnet | 开放集成 | `31337` | 是 |
| Testnet | 主网前预览 | `114514` | 是 |
| Mainnet | 未启动 | `8964` | 是 |

## 开发网络

集成沙箱。通过水龙头提供免费 USDC；短暂状态（偶尔重置）。

网关是唯一的公共入口。MTF 本机是默认路径
（`/info` · `/exchange` · `/ws`）；HL-compat 位于 `/hl/*`；CCXT 位于
`/ccxt/*`；EVM JSON-RPC 位于 `/evm`。

| Service | Endpoint |
|---------|----------|
| Gateway 前门 | `https://devnet-gateway.mtf.exchange` |
| MTF 本机（默认） | `POST /info` · `POST /exchange` · `GET /ws` |
| HL-compat | `POST /hl/info` · `POST /hl/exchange` · `GET /hl/ws` |
| CCXT-compat | `/ccxt/*` |
| EVM JSON-RPC | `POST /evm` |
| 水龙头（开发网络/测试网络） | `POST /faucet` |
| Gateway WS（本机） | `wss://devnet-gateway.mtf.exchange/ws` |
| 浏览器 | `https://devnet.mtf.exchange/explorer` |
| 状态 | `https://status.mtf.exchange/devnet` |

自己运行节点？节点在 `http://localhost:8080` 直接提供相同的本机接口
（`/info` · `/exchange` · `/ws` · `/faucet`），以及其原始
EVM RPC 位于 `http://localhost:8545`。这些是自托管端口，不是公共 URL。

| 签名参数 | 值 |
|--------------------|-------|
| `chainId` | `31337` |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC 桥接：通过 **MetaBridge 托管桥**（[桥](./bridge/)），而非 Circle CCTP。测试网络存款使用 Base Sepolia `MetaBridgeUSDC` 部署 + Circle 的 Base Sepolia 测试 USDC。

### 水龙头

网关前门上的 `POST /faucet` 使用测试资金向地址充值。
仅限开发网络/测试网络 — 该路由**从不挂载在主网**上（`chainId 8964`）。
授予的状态是 **`"queued"`** — 暂存至下一个区块，因此余额在
约 1 个区块后更新，而不是同步。完整合约：[`POST /faucet`](api/rest/faucet.md)。

```bash
curl -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- 授予 **3000 USDC** 交叉抵押品 **+ 10 MTF** 现货 — **每个
  地址仅一次**（第二次申请 → `429 address already funded`）。
- `amount` 可选（整数 USDC）；向下限制 USDC 授予（≤ 3000）。MTF 固定。
- 频率限制为每分钟 1 个请求 / IP（超出时为 `429`）。
- `400` 无效地址 · `429` 已资金化 / IP 限流 · `503` 待处理项已满 — 正文 `{"error":"…"}`。

### 状态重置

开发网络可能会因协议升级而重置。频率：在主网前开发期间按需进行；尽可能提前一周通知。观看[状态](https://status.mtf.exchange/devnet)获取重置公告。

## 测试网络（计划中）

主网前排练网络，具有稳定性保证。

| Service | Endpoint |
|---------|----------|
| Gateway REST | 待定 |
| Gateway WS | 待定 |
| 水龙头 | 待定（频率限制） |
| 浏览器 | 待定 |

测试网络 `chainId`：`114514`（`0x1bf52`）。MetaFlux 是一个独立网络，具有自己的 chain ID。

测试网络与主网的区别：
- USDC 通过 MetaBridge 从测试网络源链（Base Sepolia 测试 USDC）桥接，而不是真实 USDC。
- 验证器集由运营商控制。
- 没有真实经济价值。

测试网络的线形与主网相同。针对测试网络测试的客户端应该只需要 **更改 `chainId` 和基础 URL** 即可切换到主网。

## 主网（计划中）

生产网络。真实 USDC、真实价值、真实验证器。

| Service | Endpoint |
|---------|----------|
| Gateway REST | 待定 |
| Gateway WS | 待定 |
| 浏览器 | 待定 |

主网 `chainId`：`8964`（`0x2304`）。

主网与开发网络/测试网络的区别：
- USDC 是真实的，通过 MetaBridge 托管从 Base 桥接（稍后为 Arbitrum / Solana）。
- 验证器集是无权限的（由治理选举）。
- 真实经济价值。
- 根据[速率限制](./api/rate-limits.md)和[费用](./concepts/fees.md)的速率限制和费用。

## 桥接走廊

USDC（和其他资产）通过 **MetaBridge 托管桥** 桥接 — 验证器
⅔ 质押权重共同签名，不依赖 Circle CCTP。源链：

| Chain | Status |
|-------|--------|
| Base | **Base Sepolia 上线**（`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)）；主网审计前 |
| Solana | **开发网络上线**（`metabridge-solana` 程序 [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet)）；主网审计前 |
| Arbitrum | 计划中 |

查看[桥](./bridge/)了解存款 / 取款流程 + 部署表。

## 状态

运营状态、事故历史和计划维护：

- 开发网络：`https://status.mtf.exchange/devnet`
- 测试网络：待定
- 主网：待定

状态页面公开：
- 当前网络状态（`operational`、`degraded`、`partial outage`、`major outage`）
- 具有时间表的最近事故
- 计划维护窗口
- 最新提交的区块高度
- 活动验证器集大小

## 兼容性窗口

| Network | Wire-shape commitment |
|---------|-----------------------|
| Devnet | 尽力而为；破坏性变更提前 24 小时宣布 |
| Testnet | 稳定；破坏性变更需要 30 天弃用通知 |
| Mainnet | 稳定；破坏性变更按照[版本控制策略](./versioning.md) |

## 另请参见

- [桥](./bridge/) — MetaBridge 托管桥详情
- [版本控制](./versioning.md) — 线形变更政策
- [快速入门](./integration/quickstart.md) — 针对开发网络的第一次调用
- [签名](./integration/signing.md) — chainId 使用
