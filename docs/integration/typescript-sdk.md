# TypeScript SDK

:::info
**Preview.** The `@metaflux-dex/client` package ships before mainnet; the API shape below is committed.
:::

## TL;DR {#tldr}

```bash
npm install @metaflux-dex/client
```

```typescript
import { Client } from '@metaflux-dex/client';

const client = new Client({
  baseUrl: 'https://api.devnet.mtf.exchange', // MTF-native is the gateway default path
  privateKey: Buffer.from(process.env.PRIVATE_KEY!.replace(/^0x/, ''), 'hex'), // 32 bytes; omit for a read-only client
});

const meta = await client.info.marketsMeta();
const btc = meta.perp.find((m) => m.coin === 'BTC')!;

await client.placeOrder({
  venue: 'perp',
  owner: '0x17c5185167401ed00cf5f5b2fc97d9bbfdb7d025',
  market: btc.asset_id,
  side: 'bid', // 'bid' = buy, 'ask' = sell
  kind: 'limit',
  size: 1_000, // raw lots, scaled by the market's sz_decimals
  limit_px: 5_000_000_000_000, // 1e8 fixed-point plane
  tif: 'gtc',
  stp_mode: 'cancel_newest',
  reduce_only: false,
});
```

The class is exported as `Client` (not `MetaFluxClient`). It has no `.exchange` or `.info` sub-object for writes — trading and account actions are flat methods directly on `Client` (`client.placeOrder`, `client.submitOrderNative`, `client.approveAgent`, …). Reads live under `client.info` (`client.info.markets()`, `client.info.accountState()`, …), and the WebSocket feed opens via `client.connectWs()`.

## Constructor {#constructor}

```typescript
new Client(opts: ClientOpts)
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `baseUrl` | string | yes | Gateway front door (`https://api.<net>.mtf.exchange`). The SDK speaks MTF-native, served by the gateway at `/info` · `/exchange` · `/ws`. Running the node yourself? Point at `http://localhost:8080`. See [networks](../networks.md). |
| `privateKey` | `Uint8Array` (32 bytes) | optional | secp256k1 private key. Required for any signing method (every `/exchange` write). Without it, `client.info.*` reads still work — `client.canSign` reads `false`. |
| `chainId` | number | optional | Legacy constructor field, kept for backward compatibility. It does **not** drive signing — every typed action signs against `MTF_CHAIN_ID` (testnet `114514`; mainnet `8964`), overridable per call via `opts.chainId` on the method itself. |
| `expiresAfterMs` | `bigint` | optional | Default action-expiry (unix-ms) folded into every typed action this client signs. `0n` / absent = never expires. Only accepted once the network activates the field — leave unset until then. |

There is no `signer` / `senderAddress` field. External signing and the agent-wallet pattern work differently — see [Signing externally](#signing-externally) and [Agent-signing pattern](#agent-signing-pattern) below.

## Reads: `client.info` {#reads-client-info}

Every `POST /info` query is a method on `client.info`. It needs no private key.

```typescript
await client.info.nodeInfo();
await client.info.markets();                 // { perp: MarketDynamic[], spot: SpotMeta }
await client.info.marketsMeta();              // { perp: MarketStatic[], spot: SpotMeta } — precision grids, leverage ladders
await client.info.l2Book('BTC', { nLevels: 20 });
await client.info.accountState(address);      // full account snapshot: positions, balances, margin
await client.info.openOrders(address);
await client.info.userFills(address, 1000);
await client.info.fundingHistory('BTC');
await client.info.feeSchedule();
await client.info.vaultState(vaultAddress);
await client.info.subAccounts(address);
await client.info.agents(address);            // approved agents for `address`
await client.info.spotClearinghouseState(address);
```

Market reads key by `coin` (the symbol, e.g. `"BTC"`); account reads key by `0x address`. `client.info.raw({ type, ...params })` is a typed escape hatch for any `/info` query without a dedicated wrapper.

## Writes: flat methods on `Client` {#writes-flat-methods}

Every `POST /exchange` action is a method directly on `Client`, not under a sub-object. A representative set:

```typescript
// Orders
await client.submitOrderNative(order);          // one order, POST /exchange
await client.placeOrder(legs, opts);            // convenience: routes to batch_order (perp) or spot_order (spot)
await client.batchOrder(batch);
await client.cancelOrderNative(cancel);
await client.cancelByCloid({ asset, cloid });
await client.batchCancel(batch);
await client.modify(params);
await client.batchModify(batch);
await client.cancelAllOrders();
await client.twapOrder(params);
await client.twapCancel(params);

// Leverage & margin (perp only — spot has no leverage; it uses reserved-balance escrow)
await client.updateLeverage({ asset, leverage, is_isolated });
await client.updateIsolatedMargin({ asset, delta });   // delta is a signed decimal STRING
await client.userPortfolioMargin({ enroll: true });

// Account & agents
await client.setDisplayName({ display_name });
await client.approveAgent({ agent, name, expires_at_ms });
await client.approveBrokerFee({ builder, max_bps });    // old name: approveBuilderFee
await client.convertToMultiSigUser({ signers, threshold });

// Staking
await client.tokenDelegate({ validator, amount, is_undelegate });
await client.claimRewards();

// Vaults
await client.createVault({ name, lock_period_secs });
await client.vaultWithdraw({ vault_id, shares });

// MetaBridge
await client.mbWithdraw({ chain: 'Base', asset: 0, amount, dst_addr });
```

Each method takes an optional `{ nonce?, chainId? }` (or `{ nonce?, chainId?, owner? }` where the action supports agent authorization) and returns a `NativeExchangeAck` (`{ statuses?, action_hash?, error? }`). The full surface — every `buildNative*Action` builder, spot orders, TWAP, RFQ/FBA, spot-margin/Earn — is listed in [`POST /exchange`](../api/rest/exchange.md) and exported from the package for out-of-band signing.

### `placeOrder`: one entry point for orders {#placeorder}

`placeOrder` tags each order with a `venue` and picks the wire action for you: any number of `venue: 'perp'` legs collapse into one `batch_order`; `venue: 'spot'` legs each become their own `spot_order` (the wire cannot batch spot). Mixing venues in one call is rejected.

```typescript
const result = await client.placeOrder([
  { venue: 'perp', owner, market: 0, side: 'bid', kind: 'limit',
    size: 1_000, limit_px: 5_000_000_000_000, tif: 'gtc',
    stp_mode: 'cancel_newest', reduce_only: false },
]);
if (result.route === 'batch_order') {
  for (const leg of result.legs) console.log(leg.index, leg.status);
}
```

## WebSocket: `client.connectWs()` {#websocket}

```typescript
import { isChannelFrame } from '@metaflux-dex/client';

const ws = await client.connectWs();

ws.onMessage((frame) => {
  if (isChannelFrame(frame, 'l2_book')) {
    console.log(frame.data.levels[0].length, frame.data.levels[1].length); // bids, asks
  }
  if (isChannelFrame(frame, 'order_updates')) {
    for (const rec of frame.data) {
      switch (rec.status) {
        case 'filled':  /* ... */ break;
        case 'canceled': /* ... */ break;
      }
    }
  }
});

await ws.subscribeTrades('BTC');
await ws.subscribe({ type: 'order_updates', user: '0x17c5185167401ed00cf5f5b2fc97d9bbfdb7d025' });
```

`connectWs()` derives the `ws(s)://` URL from `baseUrl`, connects, and — if this `Client` holds a private key — seeds the returned `WsClient` with a signer so it can also POST signed actions over the socket (`ws.submitOrder` / `ws.cancelOrder` / `ws.postAction`). A read-only client's `WsClient` can still subscribe and call `ws.postInfo`.

`isChannelFrame(frame, channel)` narrows an inbound frame and types its `data` — use it instead of trusting `frame.channel` by hand. The WS client reconnects automatically and replays active subscriptions; there is no separate `.on('open'|'close', …)` event API — inspect `ws.isOpen` or handle a `subscriptionResponse` frame instead.

## Error handling {#error-handling}

The SDK throws **one** error class, `MetaFluxApiError`, for any non-2xx `/exchange` or `/info` response. It is not split into `RateLimitError` / `AuthError` / `CommitError` / `NetworkError` — branch on `.status` yourself:

```typescript
import { MetaFluxApiError } from '@metaflux-dex/client';

try {
  await client.submitOrderNative(order);
} catch (e) {
  if (e instanceof MetaFluxApiError) {
    if (e.status === 429) { /* back off and retry */ }
    else if (e.status === 401) { /* signing / agent-approval problem — do not retry blindly */ }
    else if (e.status >= 500) { /* retry with backoff */ }
    else { /* 4xx logical error — e.bodyText carries the server's message */ }
  } else {
    // fetch threw before any response landed (DNS, TCP reset, timeout) —
    // unknown outcome; reconcile via cloid / open_orders instead of retrying blind
  }
}
```

`MetaFluxApiError` carries `status` (HTTP status), `bodyText` (raw response body) and `message`. A network drop (no response at all) is a plain `fetch` failure, not a wrapped SDK type — catch it as the `else` branch above.

See [error handling](./error-handling.md) for the full admission/commit/network decision tree.

## Signing externally {#signing-externally}

There is no pluggable `Signer` interface. For an HSM or a wallet popup, build the typed payload without signing, hand it off, then POST the result:

```typescript
const built = client.typedData('approve_agent', {
  agent: '0x0000000000000000000000000000000000dead',
  name: 'mm-host-3',
  expires_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
});

// Hand `built.payload` (the eth_signTypedData_v4 payload) to the external
// signer; it returns a 65-byte 0x-hex signature.
const signature = await signWithHsm(JSON.stringify(built.payload));

await client.postTyped({
  actionJson: built.actionJson,
  nonce: built.nonce,
  signature,
  expiresAfter: built.expiresAfter,
});
```

`client.typedData(actionType, payload, opts?)` builds the EIP-712 struct and the canonical action JSON without touching a key. `client.postTyped(signed)` posts an already-signed envelope. This is the same pair a wallet integration (`eth_signTypedData_v4`) uses.

## Agent-signing pattern {#agent-signing-pattern}

For the [agent-wallets pattern](./agent-wallets-howto.md): there is no `senderAddress` / `signerAddress` constructor option. Instead, construct a **separate `Client`** with the agent's own key, and set the action's `owner` field to the master's address:

```typescript
const master = new Client({ baseUrl, privateKey: masterKey });
const agent = new Client({ baseUrl, privateKey: agentKey });

await master.approveAgent({
  agent: agentAddress,
  expires_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
});

// Signed by the agent's key; `owner` routes it to the master's account.
await agent.submitOrderNative({
  owner: masterAddress,
  market: 0, side: 'bid', kind: 'limit',
  size: 1_000, limit_px: 5_000_000_000_000,
  tif: 'gtc', stp_mode: 'cancel_newest', reduce_only: false,
});
```

Before the request leaves the process, the agent `Client` recovers its own signer and — since it differs from `owner` — reads the owner's approved agents from `/info` and rejects an unrelated address locally, before it ever reaches the chain.

## Common patterns {#common-patterns}

### Place + confirm {#place--confirm}

```typescript
const cloid = '0x' + randomBytes(16).toString('hex');

await client.submitOrderNative({
  owner, market: 0, side: 'bid', kind: 'limit',
  size: 1_000, limit_px: 5_000_000_000_000,
  tif: 'gtc', stp_mode: 'cancel_newest', reduce_only: false,
  cloid,
});

const ws = await client.connectWs();
const filled = new Promise((resolve) => {
  const unsubscribe = ws.onMessage((f) => {
    if (f.channel !== 'order_updates') return;
    for (const rec of f.data as { order: { cloid?: string }; status: string }[]) {
      if (rec.order.cloid === cloid && rec.status === 'open') {
        unsubscribe();
        resolve(rec);
      }
    }
  });
});
await ws.subscribe({ type: 'order_updates', user: owner });
await filled;
```

### Cancel-all {#cancel-all}

```typescript
await client.cancelAllOrders();
```

### Subscribe and persist {#subscribe-and-persist}

```typescript
import { isChannelFrame } from '@metaflux-dex/client';

const fills: unknown[] = [];
const ws = await client.connectWs();
ws.onMessage((f) => {
  if (isChannelFrame(f, 'fills')) fills.push(...f.data);
});
await ws.subscribe({ type: 'fills', user: owner });
```

## Numeric handling {#numeric-handling}

`/info` reads answer in canonical **decimal strings** (e.g. `account_value: "10000"`) — exact, no `f64` precision loss. `/exchange` writes take plain integers on fixed-point planes: `limit_px` on the 1e8 book plane, `size` scaled by the market's `sz_decimals`. The package exports conversion helpers so you never hand-roll the scaling:

```typescript
import { pxToWire, szToWire, wireToPx, wireToSz } from '@metaflux-dex/client';

const limitPx = pxToWire('100.50');   // -> 10050000000n, the 1e8 wire plane
const size = szToWire('0.5', 6);      // -> 500000n at sz_decimals = 6

console.log(wireToPx(limitPx), wireToSz(size, 6)); // round-trip for display
```

`snapPxToWire` / `snapSizeToWire` / `roundOrderToGrid` additionally snap a human price/size onto a market's tick/lot grid before you build an order — the node rejects an off-grid value.

## See also {#see-also}

- [Quickstart](./quickstart.md) — 5-minute end-to-end
- [Agent wallets howto](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — full action surface
- [WS subscriptions](../api/ws/subscriptions.md) — channel catalog
- [Rust SDK](./rust-sdk.md)

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Does the SDK support browsers?**
A: The crypto layer is a `wasm-pack --target web` build, so it is meant to run directly in a browser as well as Node (≥ 20). There is no separate `@metaflux-dex/client/browser` entry point today — a bundler that handles WASM + ESM targets both.

**Q: What's the dependency tree?**
A: No runtime dependencies. Signing (secp256k1, keccak256, EIP-712 hashing, msgpack encoding) runs in the bundled WASM module; HTTP and WebSocket use the platform `fetch` / `WebSocket`.

**Q: Can I plug in my own HTTP transport (axios, undici)?**
A: No — the SDK calls the platform `fetch` directly and has no transport override hook. Use [signing externally](#signing-externally) if you need to route the signed envelope through your own HTTP stack.

</details>
