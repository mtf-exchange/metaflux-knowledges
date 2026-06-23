# TypeScript SDK

:::info
**预览版。** `@metaflux/sdk` 包在主网上线前发布；以下 API 形状已锁定。
:::

## 快速开始

```bash
npm install @metaflux/sdk
```

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const c = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://devnet-gateway.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
});
```

## 构造函数

```typescript
new MetaFluxClient(opts: ClientOpts)
```

| 字段 | 类型 | 必需 | 描述 |
|-------|------|----------|-------------|
| `privateKey` | hex 字符串或 `Uint8Array` | 是（除非设置了 `signer`） | 32 字节 secp256k1 私钥 |
| `signer` | `Signer` | 是（除非设置了 `privateKey`） | 自定义签名器（HSM / WalletConnect / Ledger） |
| `senderAddress` | hex 地址 | 可选 | 如果设置，用作 `sender`；签名器的地址用作恢复的签名器。用于 [agent-wallet 模式](./agent-wallets-howto.md)。 |
| `baseUrl` | 字符串 | 是 | 网关前端 (`https://<net>-gateway.mtf.exchange`)。SDK 使用 MTF-native，这是网关的默认路径 (`/info` · `/exchange` · `/ws`)；HL-compat 位于 `/hl/*` 下。自己运行节点？指向 `http://localhost:8080`。参见 [networks](../networks.md)。 |
| `chainId` | 数字 | 是 | 每个网络 — 参见 [networks](../networks.md) |
| `timeoutMs` | 数字 | 可选（默认 5000） | HTTP 超时 |
| `nonceFn` | `() => number` | 可选（默认 `Date.now`） | 自定义 nonce 生成器 |

## 模块

客户端公开三个模块：`info`、`exchange`、`ws`。

### `info`

所有 `POST /info` 查询类型。方法返回类型化响应。

```typescript
c.info.meta();
c.info.allMids();
c.info.l2Book({ coin: 'BTC', depth: 20 });
c.info.clearinghouseState();                   // implicit user=address
c.info.openOrders();
c.info.userFills({ sinceTs: 0, limit: 1000 });
c.info.fundingHistory({ asset: 0 });
c.info.feeSchedule();
c.info.vaultState({ vault: '0x...' });
c.info.subAccounts();
c.info.agents();
c.info.userFees();
```

### `exchange`

所有 `POST /exchange` 操作类型。

```typescript
c.exchange.order(p: OrderParams): Promise<OrderResult>;
c.exchange.cancel(p: CancelParams): Promise<CancelResult>;
c.exchange.cancelByCloid(p: CancelByCloidParams): Promise<CancelResult>;
c.exchange.modifyOrder(p: ModifyOrderParams): Promise<OrderResult>;
c.exchange.batchModify(p: BatchModifyParams): Promise<OrderResult[]>;
c.exchange.scaleOrder(p: ScaleOrderParams): Promise<OrderResult[]>;
c.exchange.twapOrder(p: TwapOrderParams): Promise<TwapResult>;
c.exchange.twapCancel(p: { twapId: string }): Promise<void>;
c.exchange.trigger(p: TriggerParams): Promise<OrderResult>;

c.exchange.updateLeverage(p: { asset: number; leverage: number }): Promise<void>;
c.exchange.updateIsolatedMargin(p: UpdateIsolatedMarginParams): Promise<void>;
c.exchange.updateMarginMode(p: { asset: number; mode: MarginMode }): Promise<void>;
c.exchange.userPortfolioMargin(p: { enabled: boolean }): Promise<void>;
// Margin controls (updateLeverage / updateIsolatedMargin / updateMarginMode)
// are perp-only. Spot positions do not support leverage or isolated margin in
// V1 — spot uses the reserved-balance escrow model via the spot order path.

c.exchange.approveAgent(p: ApproveAgentParams): Promise<{ actionHash: string }>;
c.exchange.createSubAccount(p: { name: string; explicitIndex?: number }): Promise<SubAccountResult>;
c.exchange.subAccountTransfer(p: SubAccountTransferParams): Promise<void>;

c.exchange.usdcTransfer(p: { to: string; amountE6: string }): Promise<void>;
c.exchange.withdrawUsdc(p: WithdrawUsdcParams): Promise<{ burnTxHash: string }>;

c.exchange.rfqRequest(p: RfqRequestParams): Promise<{ rfqId: string }>;
c.exchange.rfqQuote(p: RfqQuoteParams): Promise<{ quoteId: string }>;
c.exchange.rfqAccept(p: { rfqId: string; quoteId: string }): Promise<void>;

c.exchange.fbaOrder(p: FbaOrderParams): Promise<OrderResult>;
```

:::warning
**保证金控制仅适用于永续合约。** `updateLeverage`、`updateIsolatedMargin` 和 `updateMarginMode` 仅适用于永续头寸。现货头寸在 V1 中不支持杠杆或隔离保证金 — 现货交易改为通过现货订单路径使用预留余额托管模型。
:::

### `ws`

返回多路复用订阅的 `MetaFluxWs` 实例。

```typescript
const ws = c.ws();

ws.on('open',  () => console.log('connected'));
ws.on('close', (code) => console.log('disconnected', code));

const sub1 = ws.subscribe('l2Book', { coin: 'BTC' }, (event) => {
  // event.data has the typed payload
});

const sub2 = ws.subscribe('userEvents', { user: c.address }, (event) => {
  switch (event.data.kind) {
    case 'fill': /* ... */ break;
    case 'orderCancelled': /* ... */ break;
  }
});

await sub1.unsubscribe();
ws.close();
```

WebSocket 客户端处理：
- 自动重连，指数退避
- 每个订阅的 `seq` 跟踪和重连时恢复
- 私有订阅的身份验证刷新（滑动窗口）
- Ping/pong 保活

## 错误处理

SDK 抛出类型化错误：

```typescript
try {
  await c.exchange.order({ ... });
} catch (e) {
  if (e instanceof RateLimitError)    { await sleep(e.retryAfterMs); /* retry */ }
  else if (e instanceof AuthError)    { /* signing bug — escalate */ }
  else if (e instanceof CommitError)  { /* committed but state-machine rejected */ }
  else if (e instanceof NetworkError) { /* unknown outcome — reconcile */ }
  else                                 { throw e; }
}
```

参见 [错误处理](./error-handling.md) 了解决策树。

## 自定义签名器（HSM / 硬件钱包）

```typescript
import { Signer } from '@metaflux/sdk';

class HsmSigner implements Signer {
  async sign(digest: Uint8Array): Promise<Uint8Array> {
    // Forward digest to HSM; return 65-byte r||s||v
  }
  getAddress(): string { return '0x...'; }
}

const c = new MetaFluxClient({
  signer:      new HsmSigner(),
  baseUrl:     'https://devnet-gateway.mtf.exchange',
  chainId:     31337,
});
```

SDK 将已哈希的 `signed_hash` 传递给 `Signer.sign` — 你的 HSM 无需了解 EIP-712 编码。

## 配置 agent-signing 客户端

对于 [agent-wallets 模式](./agent-wallets-howto.md)：

```typescript
const agent = new MetaFluxClient({
  privateKey:    agentPrivKey,
  senderAddress: masterAddress,  // ← master is the sender
  baseUrl:       'https://devnet-gateway.mtf.exchange',
  chainId:       31337,
});

// every action this client sends:
//   sender = masterAddress
//   signature = signed by agentPrivKey
```

## 常见模式

### 下单 + 确认

```typescript
const cloid = '0x' + randomBytes(16).toString('hex');

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
  cloid,
});

// wait for commit confirmation
const filled = new Promise((resolve) => {
  const sub = c.ws().subscribe('orderEvents', { user: c.address }, (event) => {
    if (event.data.cloid === cloid && event.data.kind === 'resting') {
      sub.unsubscribe();
      resolve(event.data);
    }
  });
});

await filled;
```

### 全部取消

```typescript
const orders = await c.info.openOrders();
await Promise.all(orders.map(o => c.exchange.cancel({ asset: o.asset, oid: o.oid })));
```

### 订阅并持久化

```typescript
const fills = [];
c.ws().subscribe('userFills', { user: c.address }, (e) => {
  for (const fill of e.data.fills) fills.push(fill);
});
```

## 数字处理

所有定点整数和 USDC 基础单位字段在输入和输出中都是 `string`。SDK 不强制转换为 `number`，因为 IEEE-754 在超过 2^53 后会默认丢失精度。

对于算术运算，使用大整数库（`bigint`、`bignumber.js` 等）：

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## 日志

在构造函数中传递 `logger: console`（或任何 `{ debug, info, warn, error }` 形式）以捕获 SDK 的内部跟踪：

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

日志级别：`debug`（所有内容）、`info`（admit + WS 连接）、`warn`（重试）、`error`（终端故障）。

## 另请参见

- [快速开始](./quickstart.md) — 5 分钟端到端
- [签名](./signing.md) — SDK 内部操作
- [Agent wallets howto](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — 完整操作表面
- [WS 订阅](../api/ws/subscriptions.md) — 频道目录
- [Rust SDK](./rust-sdk.md)

## 常见问题

<details>
<summary>显示常见问题</summary>

**问：SDK 是否支持浏览器？**
答：是的 — ES2020 构建，包含 `secp256k1` 和 `keccak256` 的浏览器友好 polyfills。如果你的打包器不能 tree-shake Node 端导入，从 `@metaflux/sdk/browser` 拉取。

**问：安装有多重？**
答：约 150 KB 缩小（不包括加密原语，可 tree-shake）。加密层增加约 50 KB。

**问：依赖树是什么？**
答：`ethereum-cryptography`（或 `@noble/*` 等效）、`@msgpack/msgpack`、`ws`（仅 Node）。全部 MIT 许可。无具有非许可证许可的传递依赖。

**问：我可以插入自己的 HTTP 传输（axios、undici）吗？**
答：是的 — 在构造函数中传递 `transport: { request: async (req) => ... }`。

</details>
