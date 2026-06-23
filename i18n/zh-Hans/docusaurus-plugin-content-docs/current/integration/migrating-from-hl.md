# 从 HL 迁移

:::info
**预览版。** HL-compat 表面覆盖 `POST /info`（15 种查询类型）和 `POST /exchange`（下单 + 取消订单，后续将支持更多操作类型）。
:::

如果您的机器人已经支持 HL 的协议，您可以指向 MetaFlux，**无需更改代码**即可使用覆盖的表面 — 相同的 URL 形状、相同的请求/响应 JSON、相同的 EIP-712 信封。

## 开箱即用的功能

- `POST /info` 用于：`meta`, `allMids`, `userState`, `clearinghouseState`, `openOrders`, `frontendOpenOrders`, `userFills`, `historicalOrders`, `metaAndAssetCtxs`, `l2Book`, `vaultDetails`, `delegations`, `userFees`, `subAccounts`, `referral`
- `POST /exchange` 用于：`order`（下达限价单 / IOC / ALO）、`cancel`（按 OID 取消）
- WS 订阅（即将推出）将使用与 HL 相同的频道名称

## 有什么不同

### 1. 链 ID

MetaFlux 是独立的 L1，而不是 HL 部署。请针对 MetaFlux 链 ID 签名，**而非** HL 的：

| 网络 | HL `chainId` | MTF `chainId` |
|---------|--------------|---------------|
| Mainnet | 1337 | **8964** (`0x2304`) |
| Testnet | 998 | **114514** (`0x1bf52`) |
| Devnet / local | 1337 | **31337** (`0x7a69`) |

在您的签名代码中更新一个常量，EIP-712 信封的其余部分保持相同。MTF 域使用 `name = "MetaFlux"`、`version = "1"`、`verifyingContract = 0x0`。

### 2. 基础 URL

```
HL:  https://<your-current-hl-api-base>/{info,exchange}
MTF: https://gateway.<your-deployment>/hl/{info,exchange}
```

网关是单一入口。HL-compat 位于 `/hl/*` 下
（`/hl/info`、`/hl/exchange`、`/hl/ws`）— 因此 HL 客户端只需添加 `/hl`
前缀。网关的默认顶层路径（`/info`、`/exchange`）是
MTF 原生的；自行运行节点时，同一表面在
`http://localhost:8080` 提供服务。

### 3. 尚未在兼容层上的操作类型

如果您的机器人使用超出 `order` / `cancel` 范围的 HL 操作，网关目前返回：

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

以 HTTP 200 的状态码。HL 约定是错误为 200，包含 `status: "err"`，MTF 保持这一约定。

完整的 HL 操作覆盖范围将在后续版本中推出。如果您想要今天就使用超出范围的操作，请直接使用 [MTF 原生操作表面](../api/rest/exchange.md) — 它具有完整的功能覆盖范围，包括 HL 没有的功能（RFQ、FBA、投资组合保证金注册、跨链原始操作）。

### 4. 资产 ID

HL 和 MTF 都使用整数资产 ID，但**整数不相同**。HL 上的 `0` 是 BTC 永续合约；MTF 上的 `0` 可能是 ETH 或其他任何资产，取决于部署。始终在启动时通过 `POST /info { "type": "meta" }` 查找您的资产 ID；切勿硬编码。

### 5. 数值精度

两条链都使用缩放整数（例如 `px`），并在 JSON 中将其表示为字符串，因为 IEEE-754 在 2^53 之后会丧失精度。如果您的机器人使用默认 JS `JSON.parse` 进行 JSON 解析，请改用支持大整数的解析器来处理这些字段 — 线路格式与 HL 相同，但故障模式（无声精度丧失）也相同。

### 6. 清算行为

MetaFlux 添加了 HL 没有的 [T0 黄卡宽限等级](../concepts/tiered-liquidation.md)。实际效果：在健康度 `[1.0, 1.1)` 时，您账户的待处理 ALO 订单会被强制取消，并发出警告事件，但头寸不受影响。然后 T1 / T2 / T3 的行为类似于 HL 的部分平仓 / 市场 / 后台。

如果您的机器人侦听清算事件以触发保证金充值，**请为新的 T0 事件添加处理程序** — 这是 HL 不会给您的早期预警信号。捕获它可以让您有一个区块的时间来采取行动。

### 7. 代理钱包语义

HL：代理是没有提现权限的密钥。MTF 上相同 — 参见 [代理钱包](../concepts/agent-wallets.md)。操作名称是 `ApproveAgent`；线路形状镜像 HL 的。一个机制上的区别：MTF 的代理批准在提交后**一个区块内生效**，而 HL 通常是两个区块延迟。略微更快；相同的预热舞步。

### 8. 金库

HL 金库和 MetaFlux 金库不是相同的产品。`vaultDetails` 返回有关 MTF 自有金库类型的信息（MFlux Vault、用户金库）。HL 金库地址无法解析。查询形状相同；只需预期 MTF 实体而非 HL 实体。

## 分步迁移

### 第 0 天 — 指向 MetaFlux

1. 更改客户端配置中的基础 URL。
2. 更改签名者中的 `chainId` 常量。
3. 针对 MTF devnet 运行您现有的测试套件。`order` / `cancel` / 所有 `info` 查询应在无代码更改的情况下通过。

### 第 1 天 — 处理操作表面差距

对于 MTF 兼容层上尚未支持的 HL 操作：

- **修改订单** — 目前，取消 + 重新提交。`modify` 操作将在后续兼容更新中推出。
- **设置杠杆 / 保证金模式** — 使用 MTF 原生操作通过 `POST /exchange` 在网关默认路径上（`UpdateLeverage`、`UpdateIsolatedMargin`）。相同的 EIP-712 信封；不同的操作变体名称。
- **转账 / 提现** — MTF 原生。

### 第 2 天 — 接入新信号

- 如果您操作子账户，请订阅 `subAccounts` 信息（语义略有不同 — MTF 允许每个主账户最多 32 个子账户）。
- 为 T0 黄卡事件添加处理程序。最简单的方法是在您已经使用的相同成交 / 清算数据流中；事件形状是 `{ "type": "yellowCard", "user": "0x...", "block": N }`。
- 如果您依赖投资组合保证金：在 MTF 上重新注册（`UserPortfolioMargin { enabled: true }`）。阈值和场景集是网络参数 — 参见 [投资组合保证金](../concepts/portfolio-margin.md)。

### 第 3+ 天 — 采用 MTF 专有功能

可选。如果您想使用 HL 没有的功能：

- **RFQ** — 询价原始操作，对于不想在订单簿上公开的大额交易很有用
- **FBA** — 指定市场的频繁批量拍卖匹配，减少 MEV
- **跨链原始操作** — 从 EVM 合约本地可调用的桥接原始操作

这些是 MTF 原生操作，在网关的默认路径上发送（`POST /exchange` — MTF 原生是默认；HL-compat 在 `/hl/*` 下；参见 [API 概述](../api/index.md)）。

## 5 大 HL 机器人模式 — 具体迁移

### 1. 简单限价单做市（规范模式）

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

切换 `chainId` + 基础 URL 对于典型客户端来说只需约 5 分钟。

### 2. 清算监视机器人（保证金充值）

HL 在账户达到部分平仓 / 市场等级时发出 `liquidation` 事件。MTF 添加 **`yellowCard`** 作为最早的信号。

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

参见 [风险监视器](./risk-watcher.md) 了解完整模式。

### 3. 资金费率套利机器人

资金费率节奏相似（HL 是按小时；MTF 默认按小时，但可按市场配置）。公式结构相同。

```diff
  // URL is the /hl base from pattern 1 (gateway .../hl) — HL-compat shape
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

MTF 的预言机组成按市场管理（承诺 `SetOracleWeights`）— 如果您的套利依赖特定的预言机提供商，请验证加权源列表是否与您的预期相符。参见 [标记价格](../concepts/mark-prices.md)。

### 4. 多账户 / 机构设置

HL：主账户 + 代理每主机。MTF：相同，加上一级支持 **多签账户**。

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

参见 [多签](../concepts/multi-sig.md)。

### 5. 子账户投资组合经理

HL 子账户：最多 8 个。MTF：最多 32 个。线路形状匹配：

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

每个子账户代理管理、每个子账户 PM 注册、每个子账户保证金模式都以相同的方式支持。

## 参考表

| 您在 HL 上使用的操作 | MTF 上的状态 |
|----------------------|---------------|
| `order`（下达限价单 / IOC / ALO） | ✅ 支持 HL-compat 形状 |
| `cancel`（按 OID） | ✅ 支持 HL-compat 形状 |
| `cancelByCloid` | 推出中 |
| `modify` | 推出中 |
| `batchModify` | 推出中 |
| `usdSend` / 现货转账 | 使用 MTF 原生 |
| `withdraw3` | 使用 MTF 原生 |
| `approveAgent` | MTF 原生形状；参见 [代理钱包](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | MTF 原生形状 |
| `usdClassTransfer` | 使用 MTF 原生等价物 |
| `convertToMultiSigUser` | MTF 原生，预览版 |
| `setReferrer` / `createReferral` | MTF 原生；语义可能不同 |

（随着兼容层支持的增加，表格会更新。）

## 获取帮助

- 本仓库（`mtf-exchange/metaflux-knowledges`）— 提交议题
- 参见 [`POST /exchange`](../api/rest/exchange.md) 和 [签名演示](./signing.md) 了解线路级别参考
