# 从 HL 迁移

:::info
**MetaFlux 使用自有的 MTF 原生协议——不存在 Hyperliquid 兼容垫片（shim）。** 你的机器人保留其策略和交易逻辑；改变的只是客户端 / 线路层。最快的路径是使用官方 [TypeScript](./typescript-sdk.md) 或 [Rust](./rust-sdk.md) SDK，它会替你构建原生信封和 EIP-712 签名。其他语言请直接实现[类型化数据签名](./typed-data-signing.md)。
:::

如果你的机器人已经在 Hyperliquid 风格的永续合约 DEX 上交易，迁移到 MetaFlux 是一次**客户端层的重写，而非策略层的重写**。你所依赖的概念——限价单、成交、资金费、全仓 / 逐仓保证金、代理钱包、子账户、金库——在 MTF 上全部存在。需要替换的只是线路格式、操作 / 查询名称、Chain ID 以及资产 ID。

## 迁移的整体轮廓

- **线路格式。** MTF 原生是 snake_case JSON，通过 `POST /exchange`（写入）、`POST /info`（读取）和 `GET /ws`（流式）传输，凡需签名处均使用 EIP-712 签名。采用 SDK，或实现[原生签名方案](./typed-data-signing.md)。
- **策略与风控逻辑。** 保持不变——你的报价、仓位计算和对冲代码可直接沿用。
- **名称与少量语义。** 操作类型和查询类型被重命名（见下表），且有少数行为存在差异（资产 ID、T0 清算档位、代理授权延迟）。

## 保持一致的部分

- 限价 / IOC / ALO 订单、只减仓（reduce-only）、客户端订单 ID（`cloid`）。
- EIP-712 签名——签名原语相同，仅 domain 和 Chain ID 不同。
- 全仓 / 逐仓保证金、资金费支付、成交与订单状态读取。
- 代理钱包（无提款权限的热密钥）、子账户、金库。

## 发生变化的部分

### 1. 协议接口

只有一个 MTF 原生接口；你可以通过 SDK 调用它，或自行构建信封。名称可清晰对应：

| 你在 HL 上使用的 | MTF 原生等价物 |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) / [`frontend_open_orders`](../api/rest/info.md#frontend_open_orders) |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| WS `userEvents`、`l2Book`、`candle` | `user_events`、`l2_book`、`candles`（snake_case）——参见 [WS 订阅](../api/ws/subscriptions.md) |

完整目录见 [`POST /exchange`](../api/rest/exchange.md) 和 [`POST /info`](../api/rest/info.md)。

### 2. Chain ID

MetaFlux 是独立的 L1，并非 HL 的一个部署。请针对 MetaFlux 的 Chain ID 签名，**而非** HL 的：

| 网络 | MTF `chainId` |
|---------|---------------|
| 主网 | **8964**（`0x2304`） |
| 测试网 | **114514**（`0x1bf52`） |
| Devnet / 本地 | **31337**（`0x7a69`） |

MTF 的 EIP-712 domain 使用 `name = "MetaFlux"`、`version = "1"`、`verifyingContract = 0x0`。参见[网络](../networks.md)和[签名](./signing.md)。

### 3. Base URL

```
MTF: https://api.<net>.mtf.exchange/{info,exchange,ws}
```

网关是 MTF 原生接口的唯一入口。若自行运行节点，相同的接口在 `http://localhost:8080` 提供。

### 4. 资产 ID

HL 和 MTF 都使用整数资产 ID，但**这些整数并不相同**。在 HL 上 `0` 是 BTC 永续；在 MTF 上 `0` 可能是 ETH 或其他任意资产，取决于具体部署。请始终在启动时通过 `POST /info { "type": "markets" }` 查询你的资产 ID；切勿硬编码。

### 5. 数值精度

价格和数量字段是按比例缩放的整数，以 JSON 字符串传输，因为 IEEE-754 在超过 2^53 后会丢失精度。如果你的机器人使用默认的 JS `JSON.parse` 解析，请对这些字段改用支持大整数的解析器。

### 6. 清算行为

MetaFlux 新增了 HL 所没有的 [T0 黄牌宽限档位](../concepts/tiered-liquidation.md)。实际效果：当健康度处于 `[1.0, 1.1)` 时，你账户中挂着的 ALO 订单会被强制撤销并触发一条警告事件，但持仓不会被触及。随后的 T1 / T2 / T3 的行为类似 HL 的 Partial / Market / Backstop。

如果你的机器人监听清算事件来触发保证金补充，**请为新的 T0 事件添加处理逻辑**——这是 HL 不会给你的提前预警信号。捕获它能让你获得一个区块的宽限时间来采取行动。

### 7. 代理钱包语义

代理是一个没有提款权限的密钥——与 HL 模型相同（参见[代理钱包](../concepts/agent-wallets.md)）。对应操作是 [`approve_agent`](../api/rest/exchange.md#approve_agent)。唯一的机制差异是：MTF 的代理授权在**提交后一个区块**生效，而 HL 通常为两个区块的延迟。略快一些；预热流程相同。

### 8. 金库

HL 金库和 MetaFlux 金库不是同一种产品。[`vault_state`](../api/rest/info.md#vault_state) 读取返回的是 MTF 自有的金库类型（MFlux 金库、用户金库）。HL 的金库地址无法解析。请预期返回 MTF 实体，而非 HL 实体。

## 分步迁移

### Day 0 — 采用原生客户端

1. 安装 [TypeScript](./typescript-sdk.md) 或 [Rust](./rust-sdk.md) SDK（或为你的语言实现[类型化数据签名](./typed-data-signing.md)）。
2. 将 `baseUrl` 指向 MTF 网关，并为目标网络设置 `chainId`。
3. 改为通过 `POST /info { "type": "markets" }` 实现资产查询。

### Day 1 — 映射你的操作

将你的机器人发送的每个操作翻译为其 MTF 原生等价物（见 [§1](#1-协议接口) 的表格）。`order` → `submit_order`，`cancel` → `cancel_order`，杠杆 / 保证金变更 → `update_leverage` / `update_isolated_margin`。EIP-712 信封由 SDK 构建；只有操作变体名称和字段大小写风格不同。

### Day 2 — 接入新信号

- 如果你运营子账户，请订阅 `sub_accounts` 读取（MTF 允许每个主账户最多 32 个子账户）。
- 在 `user_events` WS 频道上为 T0 黄牌事件添加处理逻辑。
- 如果你依赖组合保证金，请在 MTF 上通过 [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin) 注册。阈值和场景集是网络参数——参见[组合保证金](../concepts/portfolio-margin.md)。

### Day 3+ — 采用 MTF 独有特性

可选。如果你想使用 HL 没有的特性：

- **RFQ** — 询价（request-for-quote）原语，适用于不想在委托簿上暴露的大额订单。
- **FBA** — 针对指定市场的频繁批量拍卖撮合，可降低 MEV。
- **跨链原语** — 可从 EVM 合约原生调用的跨链桥原语。

这些都是 `POST /exchange` 上的 MTF 原生操作；参见 [API 概览](../api/index.md)。

## 主流 HL 机器人模式——具体迁移

### 1. 简单限价做市（典型模式）

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://api.devnet.mtf.exchange',
  chainId:    114514,   // testnet (mainnet 8964, devnet 31337)
});

// asset lookup: HL `meta.universe` → MTF `markets`
const markets = await client.info.markets();
const BTC = markets.findIndex(m => m.name === 'BTC');   // may not be 0

// order / cancel — your strategy logic, native action names
await client.exchange.order({
  asset: BTC, isBuy: true, price: '100', size: '0.1', tif: 'Gtc', reduceOnly: false,
});
```

策略保持不变；客户端层变为 SDK 调用。

### 2. 清算监控机器人（保证金补充）

HL 在 partial / market 档位发出 `liquidation` 事件。MTF 在 `user_events` 频道上新增 **`yellowCard`** 作为最早的信号。

```typescript
const ws = client.ws();
ws.subscribe('user_events', { user: client.address }, (event) => {
  switch (event.data.kind) {
    case 'yellowCard':
      // T0 — one block to act; ALO orders already cancelled
      deposit(YELLOW_CARD_DEPOSIT);
      break;
    case 'liquidation':
      // T1 partial OR T2 full — too late for prevention
      emergency_unwind();
      break;
  }
});
```

完整模式参见 [risk-watcher](./risk-watcher.md)。

### 3. 资金费套利机器人

资金费节奏类似（默认每小时，在 MTF 上可按市场配置）。公式结构完全相同；读取改为原生的 `funding` 查询。

```typescript
const funding = await client.info.fundingHistory({ coin: 'BTC' });
// values may differ from HL because oracle composition differs
const rate = funding[0].rate_per_hr;
```

MTF 的预言机构成按市场治理（链上提交 `SetOracleWeights`）——如果你的套利依赖特定的预言机提供方，请核实加权来源列表。参见[标记价格](../concepts/mark-prices.md)。

### 4. 多账户 / 机构化部署

HL：每台主机一个主账户 + 多个代理。MTF：相同，外加一等公民级别的**多签账户**。

```typescript
// existing: master + agents
await master.approveAgent(host1_agent);
await master.approveAgent(host2_agent);

// new on MTF: convert master to multi-sig for cold custody
await master.convertToMultiSigUser({
  threshold: 2,
  signers: [signer1, signer2, signer3],
});
// every subsequent master-level action then requires 2 sigs;
// agents still work as before for trading actions
```

参见[多签](../concepts/multi-sig.md)。

### 5. 子账户组合管理

HL 子账户：最多 8 个。MTF：最多 32 个。

```typescript
// MTF: create one of up to 32 subs
await master.createSubAccount({ name: 'desk-A' });
await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

支持按子账户管理代理、按子账户注册 PM，以及按子账户设置保证金模式。

## 参考对照表

| 你在 HL 上使用的操作 | MTF 原生操作 |
|-----------------------|-------------------|
| `order`（下限价 / IOC / ALO 单） | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel`（按 OID） | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / 现货转账 | 原生现货转账操作 |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer)（语义可能不同） |

## 获取帮助

- 本仓库（`mtf-exchange/metaflux-knowledges`）——提交 issue。
- 线路级参考请参见 [`POST /exchange`](../api/rest/exchange.md) 和[签名指南](./signing.md)。
