# 网络

:::info
**状态。** **Devnet 稳定运行**。Testnet（`chainId 114514`）和 Mainnet（`chainId 8964`）的 chainId 已分配，正式上线前端点已公开发布。
:::

## 概览

| 网络 | 状态 | `chainId` | 协议接口稳定？ |
|------|------|-----------|:-------------:|
| Devnet | 开放集成 | `31337` | 是 |
| Testnet | 主网上线前预览 | `114514` | 是 |
| Mainnet | 尚未上线 | `8964` | 是 |

## Devnet

集成沙箱环境。通过水龙头领取免费 USDC；状态为临时性（会不定期重置）。

网关是唯一的公共入口。MTF 原生路径为默认接入方式（`/info` · `/exchange` · `/ws`）；兼容 HL 的路径位于 `/hl/*`；CCXT 兼容路径位于 `/ccxt/*`；EVM JSON-RPC 位于 `/evm`。

| 服务 | 端点 |
|------|------|
| 网关入口 | `https://devnet-gateway.mtf.exchange` |
| MTF 原生（默认） | `POST /info` · `POST /exchange` · `GET /ws` |
| HL 兼容 | `POST /hl/info` · `POST /hl/exchange` · `GET /hl/ws` |
| CCXT 兼容 | `/ccxt/*` |
| EVM JSON-RPC | `POST /evm` |
| 水龙头（Devnet/Testnet） | `POST /faucet` |
| 网关 WebSocket（原生） | `wss://devnet-gateway.mtf.exchange/ws` |
| 区块浏览器 | `https://devnet.mtf.exchange/explorer` |
| 状态页 | `https://status.mtf.exchange/devnet` |

如需自行运行节点，节点会在 `http://localhost:8080` 直接提供原生接口（`/info` · `/exchange` · `/ws` · `/faucet`），EVM 原始 RPC 位于 `http://localhost:8545`。这些是自托管端口，非公共 URL。

| 签名参数 | 值 |
|----------|-----|
| `chainId` | `31337` |
| EIP-712 域名 `name` | `"MetaFlux"` |
| EIP-712 域名 `version` | `"1"` |
| EIP-712 域名 `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC 跨链：通过 **MetaBridge 托管跨链桥**（[跨链桥](./bridge/)）完成，而非 Circle CCTP。Testnet 充值使用 Base Sepolia 上的 `MetaBridgeUSDC` 合约以及 Circle 的 Base Sepolia 测试 USDC。

### 水龙头

在网关入口调用 `POST /faucet` 可向指定地址发放测试资金。该路由仅在 Devnet/Testnet 上可用——**主网（`chainId 8964`）上永不挂载**。发放状态为 **`"queued"`**（已排入下一个区块），因此余额会在约 1 个区块后更新，而非实时到账。完整接口说明：[`POST /faucet`](api/rest/faucet.md)。

```bash
curl -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- 每个地址**终身仅限领取一次**，发放 **3000 USDC**（跨抵押品）**+ 10 MTF**（现货）——再次领取将返回 `429 address already funded`。
- `amount` 为可选参数（整数 USDC），用于**向下**限制 USDC 发放量（≤ 3000），MTF 数量固定不变。
- 每 IP 每分钟限 1 次请求（超出返回 `429`）。
- `400` 地址无效 · `429` 已领取 / IP 限流 · `503` 队列已满 — 响应体为 `{"error":"…"}`。

### 状态重置

Devnet 可能因协议升级而重置。重置节奏：主网上线前按需进行；条件允许时提前一周发出通知。请关注[状态页](https://status.mtf.exchange/devnet)获取重置公告。

## Testnet（计划中）

主网上线前的预演网络，提供稳定性保证。

| 服务 | 端点 |
|------|------|
| 网关 REST | 待定 |
| 网关 WebSocket | 待定 |
| 水龙头 | 待定（有频率限制） |
| 区块浏览器 | 待定 |

Testnet `chainId`：`114514`（`0x1bf52`）。MetaFlux 是拥有独立链 ID 的独立网络。

Testnet 与主网的差异：
- USDC 通过 MetaBridge 从测试源链（Base Sepolia 测试 USDC）跨链转入，而非真实 USDC。
- 验证节点集由运营方管控。
- 无真实经济价值。

Testnet 的协议接口形态与主网完全一致。在 Testnet 上完成测试的客户端切换至主网时，**只需修改 `chainId` 和基础 URL** 即可。

## Mainnet（计划中）

正式生产网络。使用真实 USDC，承载真实资产，运行真实验证节点。

| 服务 | 端点 |
|------|------|
| 网关 REST | 待定 |
| 网关 WebSocket | 待定 |
| 区块浏览器 | 待定 |

Mainnet `chainId`：`8964`（`0x2304`）。

Mainnet 与 Devnet/Testnet 的差异：
- USDC 为真实资产，通过 MetaBridge 托管桥从 Base（后续将支持 Arbitrum / Solana）跨链转入。
- 验证节点集采用无需许可的方式（由治理选举产生）。
- 承载真实经济价值。
- 频率限制与手续费规则详见[频率限制](./api/rate-limits.md)和[手续费](./concepts/fees.md)。

## 跨链通道

USDC（及其他资产）通过 **MetaBridge 托管跨链桥**进行跨链——采用验证节点 ⅔ 权益加权联合签名，不依赖 Circle CCTP。支持的源链：

| 链 | 状态 |
|----|------|
| Base | **Base Sepolia 已上线**（`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)）；主网待审计 |
| Solana | **Devnet 已上线**（`metabridge-solana` 程序 [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet)）；主网待审计 |
| Arbitrum | 计划中 |

充值/提现流程及合约部署表详见[跨链桥](./bridge/)。

## 状态

运行状态、历史事件及计划维护信息：

- Devnet：`https://status.mtf.exchange/devnet`
- Testnet：待定
- Mainnet：待定

状态页提供以下信息：
- 当前网络状态（`operational`、`degraded`、`partial outage`、`major outage`）
- 近期事件及时间线
- 计划维护窗口
- 最新已提交区块高度
- 活跃验证节点数量

## 兼容性承诺

| 网络 | 协议接口承诺 |
|------|------------|
| Devnet | 尽力而为；破坏性变更提前 24 小时通知 |
| Testnet | 稳定；破坏性变更须提前 30 天发出弃用通知 |
| Mainnet | 稳定；破坏性变更遵循[版本策略](./versioning.md) |

## 参见

- [跨链桥](./bridge/) — MetaBridge 托管跨链桥详情
- [版本策略](./versioning.md) — 协议接口变更政策
- [快速入门](./integration/quickstart.md) — 首次调用 Devnet
- [签名](./integration/signing.md) — chainId 使用说明
