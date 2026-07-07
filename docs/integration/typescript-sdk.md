# TypeScript SDK

:::info
**Preview.** The `@metaflux/sdk` package ships before mainnet; the API shape below is committed.
:::

## TL;DR

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

## Constructor

```typescript
new MetaFluxClient(opts: ClientOpts)
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `privateKey` | hex string OR `Uint8Array` | yes (unless `signer` set) | 32-byte secp256k1 private key |
| `signer` | `Signer` | yes (unless `privateKey` set) | Custom signer (HSM / WalletConnect / Ledger) |
| `senderAddress` | hex address | optional | If set, used as `sender`; signer's address used as the recovered signer. For [agent-wallet pattern](./agent-wallets-howto.md). |
| `baseUrl` | string | yes | Gateway front door (`https://api.<net>.mtf.exchange`). The SDK speaks MTF-native, served by the gateway at `/info` · `/exchange` · `/ws`. Running the node yourself? Point at `http://localhost:8080`. See [networks](../networks.md). |
| `chainId` | number | yes | Per network — see [networks](../networks.md) |
| `timeoutMs` | number | optional (default 5000) | HTTP timeout |
| `nonceFn` | `() => number` | optional (default `Date.now`) | Custom nonce generator |

## Modules

The client exposes three modules: `info`, `exchange`, `ws`.

### `info`

All `POST /info` query types. Methods return typed responses.

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

All `POST /exchange` action types.

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
**Margin controls are perp-only.** `updateLeverage`, `updateIsolatedMargin`, and
`updateMarginMode` apply to perpetual positions only. Spot positions do not
support leverage or isolated margin in V1 — spot trading uses the
reserved-balance escrow model via the spot order path instead.
:::

### `ws`

Returns a `MetaFluxWs` instance that multiplexes subscriptions.

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

The WS client handles:
- Automatic reconnect with exponential backoff
- Per-subscription `seq` tracking and `resume` on reconnect
- Auth refresh for private subscriptions (sliding window)
- Ping/pong keepalive

## Error handling

The SDK throws typed errors:

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

See [error handling](./error-handling.md) for the decision tree.

## Custom signer (HSM / hardware wallet)

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

The SDK passes already-hashed `signed_hash` to `Signer.sign` — your HSM does not need to know about EIP-712 encoding.

## Configuring an agent-signing client

For the [agent-wallets pattern](./agent-wallets-howto.md):

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

## Common patterns

### Place + confirm

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

### Cancel-all

```typescript
const orders = await c.info.openOrders();
await Promise.all(orders.map(o => c.exchange.cancel({ asset: o.asset, oid: o.oid })));
```

### Subscribe and persist

```typescript
const fills = [];
c.ws().subscribe('userFills', { user: c.address }, (e) => {
  for (const fill of e.data.fills) fills.push(fill);
});
```

## Numeric handling

All fixed-point integer and USDC base-unit fields are `string` in both inputs and outputs. The SDK does not coerce to `number` because IEEE-754 silently loses precision past 2^53.

For arithmetic, use a big-int library (`bigint`, `bignumber.js`, etc.):

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## Logging

Pass `logger: console` (or any `{ debug, info, warn, error }` shape) to capture the SDK's internal trace:

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

Log levels: `debug` (everything), `info` (admit + WS connects), `warn` (retries), `error` (terminal failures).

## See also

- [Quickstart](./quickstart.md) — 5-minute end-to-end
- [Signing](./signing.md) — what the SDK does internally
- [Agent wallets howto](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — full action surface
- [WS subscriptions](../api/ws/subscriptions.md) — channel catalog
- [Rust SDK](./rust-sdk.md)

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Does the SDK support browsers?**
A: Yes — ES2020 build with browser-friendly polyfills for `secp256k1` and `keccak256`. Pull from `@metaflux/sdk/browser` if your bundler doesn't tree-shake the Node-side imports.

**Q: How heavy is the install?**
A: ~150 KB minified (excluding crypto primitives, which are tree-shakeable). The crypto layer adds ~50 KB.

**Q: What's the dependency tree?**
A: `ethereum-cryptography` (or `@noble/*` equivalents), `@msgpack/msgpack`, `ws` (Node only). All MIT-licensed. No transitive dependencies with non-permissive licenses.

**Q: Can I plug in my own HTTP transport (axios, undici)?**
A: Yes — pass `transport: { request: async (req) => ... }` in the constructor.

</details>
