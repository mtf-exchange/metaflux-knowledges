# TypeScript SDK

:::info
**预览版。** `@metaflux/sdk` 包在主网上线前已发布，以下 API 结构已锁定。
:::

## 快速上手

```bash
npm install @metaflux/sdk
```

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const c = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://api.devnet.mtf.exchange', // MTF-native is the gateway default path
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

| 字段 | 类型 | 是否必填 | 说明 |
|-------|------|----------|-------------|
| `privateKey` | 十六进制字符串或 `Uint8Array` | 是（未设置 `signer` 时） | 32 字节 secp256k1 私钥 |
| `signer` | `Signer` | 是（未设置 `privateKey` 时） | 自定义签名器（HSM / WalletConnect / Ledger） |
| `senderAddress` | 十六进制地址 | 可选 | 若设置，将作为 `sender` 使用；签名器地址用于恢复签名方。适用于[代理钱包模式](./agent-wallets-howto.md)。 |
| `baseUrl` | string | 是 | 网关入口（`https://api.<net>.mtf.exchange`）。SDK 使用 MTF-native 协议，由网关在 `/info` · `/exchange` · `/ws` 提供。自行运行节点时请指向 `http://localhost:8080`。详见[网络列表](../networks.md)。 |
| `chainId` | number | 是 | 各网络对应的 Chain ID，详见[网络列表](../networks.md) |
| `timeoutMs` | number | 可选（默认 5000） | HTTP 超时时间（毫秒） |
| `nonceFn` | `() => number` | 可选（默认 `Date.now`） | 自定义 nonce 生成函数 |

## 模块

客户端暴露三个模块：`info`、`exchange`、`ws`。

### `info`

所有 `POST /info` 查询类型，方法返回带类型的响应数据。

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
**保证金控制仅适用于永续合约。** `updateLeverage`、`updateIsolatedMargin` 和 `updateMarginMode` 仅作用于永续合约仓位。V1 中现货仓位不支持杠杆或逐仓保证金——现货交易通过现货下单路径使用预留余额托管模型。
:::

### `ws`

返回一个 `MetaFluxWs` 实例，用于复用多路订阅。

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

WebSocket 客户端内置以下能力：
- 指数退避自动重连
- 每路订阅的 `seq` 追踪与断线恢复时的 `resume` 机制
- 私有订阅的鉴权自动刷新（滑动窗口）
- Ping/Pong 保活

## 错误处理

SDK 抛出带类型的错误：

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

完整决策树详见[错误处理](./error-handling.md)。

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
  baseUrl:     'https://api.devnet.mtf.exchange',
  chainId:     31337,
});
```

SDK 将已哈希的 `signed_hash` 直接传递给 `Signer.sign`——你的 HSM 无需了解 EIP-712 编码细节。

## 配置代理签名客户端

适用于[代理钱包模式](./agent-wallets-howto.md)：

```typescript
const agent = new MetaFluxClient({
  privateKey:    agentPrivKey,
  senderAddress: masterAddress,  // ← master is the sender
  baseUrl:       'https://api.devnet.mtf.exchange',
  chainId:       31337,
});

// every action this client sends:
//   sender = masterAddress
//   signature = signed by agentPrivKey
```

## 常用模式

### 下单并确认

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

### 撤销所有订单

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

## 数值处理

所有定点整数字段和 USDC 基础单位字段，在输入和输出中均为 `string` 类型。SDK 不会强制转换为 `number`，因为 IEEE-754 在超过 2^53 时会静默丢失精度。

数学运算请使用大整数库（`bigint`、`bignumber.js` 等）：

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## 日志

向构造函数传入 `logger: console`（或任何符合 `{ debug, info, warn, error }` 接口的对象），即可捕获 SDK 内部追踪日志：

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

日志级别说明：`debug`（全量输出）、`info`（请求接入与 WebSocket 连接）、`warn`（重试）、`error`（不可恢复的错误）。

## 参考链接

- [快速入门](./quickstart.md) — 5 分钟端到端演示
- [签名机制](./signing.md) — SDK 内部签名原理
- [代理钱包操作指南](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — 完整操作接口列表
- [WebSocket 订阅](../api/ws/subscriptions.md) — 频道目录
- [Rust SDK](./rust-sdk.md)

## 常见问题

<details>
<summary>展开常见问题</summary>

**Q：SDK 支持浏览器环境吗？**
A：支持——提供 ES2020 构建版本，内置对 `secp256k1` 和 `keccak256` 的浏览器兼容 polyfill。如果你的打包工具无法 tree-shake 掉 Node 端导入，请从 `@metaflux/sdk/browser` 引入。

**Q：安装包体积有多大？**
A：压缩后约 150 KB（不含加密原语，加密部分支持 tree-shaking）。加密层额外增加约 50 KB。

**Q：依赖树是怎样的？**
A：依赖 `ethereum-cryptography`（或等效的 `@noble/*`）、`@msgpack/msgpack`、`ws`（仅 Node 环境）。全部采用 MIT 许可证，无传递性非宽松许可依赖。

**Q：可以接入自定义 HTTP 传输层（axios、undici）吗？**
A：可以——在构造函数中传入 `transport: { request: async (req) => ... }` 即可。

</details>
