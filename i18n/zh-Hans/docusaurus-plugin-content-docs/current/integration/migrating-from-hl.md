# 从 HL 迁移

:::info
**预览版。** HL 兼容接口目前覆盖 `POST /info`（15 种查询类型）和 `POST /exchange`（当前支持下单与撤单，后续版本将陆续支持更多 action 类型）。
:::

如果你的机器人已经对接了 HL 协议，只需将请求地址指向 MetaFlux，在已覆盖的接口范围内**无需修改任何代码**——URL 格式、请求/响应 JSON 结构、EIP-712 签名信封均保持一致。

## 开箱即用的功能

- `POST /info` 支持以下查询类型：`meta`、`allMids`、`userState`、`clearinghouseState`、`openOrders`、`frontendOpenOrders`、`userFills`、`historicalOrders`、`metaAndAssetCtxs`、`l2Book`、`vaultDetails`、`delegations`、`userFees`、`subAccounts`、`referral`
- `POST /exchange` 支持：`order`（限价单 / IOC / ALO 下单）、`cancel`（按 OID 撤单）
- WebSocket 订阅（即将推出）将与 HL 使用相同的频道名称

## 与 HL 的差异

### 1. 链 ID

MetaFlux 是独立的 L1 公链，并非 HL 的部署实例。签名时请使用 MetaFlux 的链 ID，**而非** HL 的：

| 网络 | HL `chainId` | MTF `chainId` |
|------|--------------|---------------|
| 主网 | 1337 | **8964** (`0x2304`) |
| 测试网 | 998 | **114514** (`0x1bf52`) |
| Devnet / 本地 | 1337 | **31337** (`0x7a69`) |

只需修改签名代码中的一个常量，EIP-712 信封的其余部分完全相同。MTF 域参数为 `name = "MetaFlux"`、`version = "1"`、`verifyingContract = 0x0`。

### 2. 基础 URL

```
HL:  https://<your-current-hl-api-base>/{info,exchange}
MTF: https://gateway.<your-deployment>/hl/{info,exchange}
```

网关是统一的入口。HL 兼容接口挂载在 `/hl/*` 路径下
（`/hl/info`、`/hl/exchange`、`/hl/ws`）——对 HL 客户端来说，只需在路径前加上 `/hl` 前缀即可。网关的默认顶层路径（`/info`、`/exchange`）为 MTF 原生接口；如果你自己运行节点，同一套接口同样在
`http://localhost:8080` 上提供服务。

### 3. 兼容层尚未覆盖的 action 类型

如果你的机器人使用了 `order` / `cancel` 以外的 HL action，网关目前会返回：

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

HTTP 状态码为 200。HL 的约定是错误以 200 状态码返回并附带 `status: "err"`，MTF 保持了这一行为。

完整的 HL action 覆盖将在后续版本中陆续推出。如果你现在就需要用到某些新 action，可以直接使用 [MTF 原生 action 接口](../api/rest/exchange.md)——它提供完整的功能覆盖，包括 HL 没有的特性（RFQ、FBA、组合保证金注册、跨链原语）。

### 4. 资产 ID

HL 和 MTF 都使用整数资产 ID，但**两者的编号并不相同**。HL 上 `0` 代表 BTC 永续合约；MTF 上 `0` 可能是 ETH 或其他资产，取决于具体部署。请务必在启动时通过 `POST /info { "type": "meta" }` 查询资产 ID，切勿硬编码。

### 5. 数值精度

两条链都使用缩放整数（例如 `px`），并在 JSON 中以字符串形式表示，原因是 IEEE-754 浮点数在超过 2^53 后会丢失精度。如果你的机器人使用默认的 JS `JSON.parse` 解析 JSON，请切换到支持大整数的解析器处理这些字段——数据格式与 HL 相同，但静默精度丢失的风险同样存在。

### 6. 清算行为

MetaFlux 新增了 [T0 黄牌宽限层](../concepts/tiered-liquidation.md)，HL 没有此机制。实际影响是：当账户健康度处于 `[1.0, 1.1)` 区间时，挂单中的 ALO 订单会被强制取消并触发一个警告事件，但仓位不受影响。之后的 T1 / T2 / T3 行为与 HL 的部分平仓 / 市价平仓 / 保底清算对应。

如果你的机器人通过监听清算事件来触发追加保证金，**请为新增的 T0 事件添加处理逻辑**——这是 HL 没有的提前预警信号。捕获该信号后，你有一个区块的宽限时间来采取行动。

### 7. Agent 钱包语义

HL：agent 是一个没有提现权限的密钥。MTF 也是如此——参见 [agent 钱包](../concepts/agent-wallets.md)。action 名称为 `ApproveAgent`，数据格式与 HL 相同。一个机制上的差异：MTF 的 agent 授权在**提交后一个区块**生效，而 HL 通常需要两个区块。速度略快，但预热流程相同。

### 8. 金库

HL 金库与 MetaFlux 金库是不同的产品。`vaultDetails` 返回的是 MTF 自身金库类型（MFlux Vault、用户金库）的信息，HL 金库地址无法解析。查询格式相同，但返回的是 MTF 实体，而非 HL 实体。

## 分步迁移指南

### Day 0 — 接入 MetaFlux

1. 修改客户端配置中的基础 URL。
2. 修改签名模块中的 `chainId` 常量。
3. 在 MTF Devnet 上运行现有测试套件。`order` / `cancel` 以及所有 `info` 查询应在不修改代码的情况下全部通过。

### Day 1 — 处理 action 接口的差距

针对尚未纳入 MTF 兼容层的 HL action：

- **修改订单** — 暂时使用撤单后重新提交的方式。`modify` action 将在后续兼容更新中推出。
- **设置杠杆 / 保证金模式** — 通过网关默认路径的 `POST /exchange` 使用 MTF 原生 action（`UpdateLeverage`、`UpdateIsolatedMargin`）。EIP-712 信封相同，action 变体名称不同。
- **转账 / 提现** — 使用 MTF 原生接口。

### Day 2 — 接入新信号

- 如果你管理子账户，订阅 `subAccounts` info（语义略有差异——MTF 每个主账户最多支持 32 个子账户）。
- 为 T0 黄牌事件添加处理逻辑。最方便的接入点是你已有的成交 / 清算事件流，事件格式为 `{ "type": "yellowCard", "user": "0x...", "block": N }`。
- 如果你依赖组合保证金：在 MTF 上重新注册（`UserPortfolioMargin { enabled: true }`）。阈值和压力测试场景集为网络参数——参见[组合保证金](../concepts/portfolio-margin.md)。

### Day 3+ — 启用 MTF 专属功能

可选步骤。如果你希望使用 HL 没有的功能：

- **RFQ** — 询价原语，适用于不希望在订单簿上公开报价的大额交易
- **FBA** — 指定市场的频繁批量拍卖撮合机制，降低 MEV
- **跨链原语** — 可从 EVM 合约直接调用的原生跨链桥原语

这些均为 MTF 原生 action，通过网关的默认路径发送（`POST /exchange`——MTF 原生接口走默认路径，HL 兼容接口在 `/hl/*` 下；参见 [API 概览](../api/index.md)）。

## Top 5 HL 机器人迁移模式——具体示例

### 1. 简单限价做市机器人（经典模式）

```diff
- const HL_URL = 'https://<your-current-hl-api-base>';
+ const MTF_URL = 'https://gateway.mtf.exchange/hl';   // HL-compat is under /hl/*

- const HL_CHAIN_ID = 1337;
+ const MTF_CHAIN_ID = 114514;    // testnet (mainnet 8964, devnet 31337)

- const HL_DOMAIN_NAME = 'HLSignTransaction';   // varies by mode
+ const MTF_DOMAIN_NAME = 'MetaFlux';
+ const MTF_DOMAIN_VERSION = '1';

  // asset lookup runs against /info { type: "meta" } — same call, different result
  const meta = await fetch(MTF_URL + '/info', {
    method: 'POST',
    body: JSON.stringify({ type: 'meta' }),
  }).then(r => r.json());

  const BTC = meta.universe.findIndex(m => m.name === 'BTC');  // may not be 0

  // order, cancel — unchanged HL wire shape
  await place_order(BTC, 'B', '100', '0.1', 'Gtc');
```

对于典型客户端来说，切换 `chainId` 和基础 URL 大约只需 5 分钟。

### 2. 清算监控机器人（追加保证金）

HL 在账户触及部分平仓 / 市价平仓档位时发出 `liquidation` 事件。MTF 新增 **`yellowCard`** 作为最早的预警信号。

```diff
  ws.subscribe('userEvents', { user: address }, (event) => {
    switch (event.data.kind) {
+     case 'yellowCard':
+       // T0 — one block to act. ALO orders already cancelled.
+       deposit(YELLOW_CARD_DEPOSIT);
+       break;
      case 'liquidation':
-       // HL partial / market
+       // T1 partial OR T2 full — too late for prevention
        emergency_unwind();
        break;
    }
  });
```

完整模式参见[风控监控器](./risk-watcher.md)。

### 3. 资金费率套利机器人

资金结算频率类似（HL 为每小时；MTF 默认每小时，但可按市场配置）。费率计算公式结构完全相同。

```diff
  // URL is the /hl base from pattern 1 (gateway .../hl) — HL-compat shape
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

MTF 的预言机权重由各市场治理（通过提交 `SetOracleWeights`）。如果你的套利策略依赖特定预言机数据源，请验证加权数据源列表是否符合预期。参见[标记价格](../concepts/mark-prices.md)。

### 4. 多账户 / 机构级配置

HL：主账户 + 各节点 agent。MTF：同上，并额外提供原生**多签账户**支持。

```diff
  // existing: master + agents
  await master.approveAgent(host1_agent);
  await master.approveAgent(host2_agent);

+ // new on MTF: convert master to multi-sig for cold custody
+ await master.convertToMultiSigUser({
+   threshold: 2,
+   signers: [signer1, signer2, signer3],
+ });
+ // every subsequent master-level action requires 2 sigs
+ // agents still work as before for trading actions
```

参见[多签](../concepts/multi-sig.md)。

### 5. 子账户组合管理

HL 子账户：最多 8 个。MTF：最多 32 个。数据格式保持一致：

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

子账户级别的 agent 管理、组合保证金注册、保证金模式均完全一致地支持。

## 参考对照表

| 你在 HL 上使用的 action | MTF 上的状态 |
|------------------------|-------------|
| `order`（限价单 / IOC / ALO） | ✅ 支持 HL 兼容格式 |
| `cancel`（按 OID） | ✅ 支持 HL 兼容格式 |
| `cancelByCloid` | 推出中 |
| `modify` | 推出中 |
| `batchModify` | 推出中 |
| `usdSend` / 现货转账 | 使用 MTF 原生接口 |
| `withdraw3` | 使用 MTF 原生接口 |
| `approveAgent` | MTF 原生格式；参见 [agent 钱包](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | MTF 原生格式 |
| `usdClassTransfer` | 使用 MTF 原生等效接口 |
| `convertToMultiSigUser` | MTF 原生，预览版 |
| `setReferrer` / `createReferral` | MTF 原生；语义可能有所差异 |

（该表格将随兼容层支持范围的扩展持续更新。）

## 获取帮助

- 本仓库（`mtf-exchange/metaflux-knowledges`）——提交 issue
- 数据格式层面的参考资料见 [`POST /exchange`](../api/rest/exchange.md) 和[签名详解](./signing.md)
