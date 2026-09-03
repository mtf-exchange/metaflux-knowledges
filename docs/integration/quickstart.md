# Quickstart — 5-minute end-to-end

:::info
**Status.** **stable** wire surface. Devnet endpoints, no mainnet warranty.
:::

Deposit, place an order, cancel, withdraw. By the end of this page your TypeScript / Python / curl session has done a complete round-trip against devnet.

## Prerequisites {#prerequisites}

- An EVM private key (any 32-byte hex; for devnet, generate fresh — don't reuse a mainnet key)
- USDC on a MetaBridge source chain (Base or Arbitrum) — devnet allows the faucet route instead
- `curl` or any HTTP client

## Endpoints {#endpoints}

The gateway is the single public front door, serving the MTF-native surface.

| Service | URL (devnet) |
|---------|--------------|
| Gateway front door | `https://api.devnet.mtf.exchange` |
| MTF-native | `POST /info` · `POST /exchange` · `GET /ws` |
| EVM JSON-RPC | `POST /evm` |
| Faucet (devnet) | `POST /faucet` |
| Explorer | `https://app.mtf.exchange/explorer` |

> The faucet is **not** a separate service — it's the `POST /faucet` route on the
> gateway front door. Running the node yourself? The same native surface
> (`/info` · `/exchange` · `/ws` · `/faucet`) is served directly at
> `http://localhost:8080`. See [`POST /faucet`](../api/rest/faucet.md).

See [networks](../networks.md) for the full list including testnet and (post-launch) mainnet.

## Step 1 — Get devnet USDC {#step-1--get-devnet-usdc}

```bash
curl -X POST https://api.devnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

One claim grants **3000 USDC** cross-collateral **and 10 MTF** spot tokens —
**once ever per address** (a second claim returns `429 address already funded`),
rate-limited at 1 / minute / IP. The optional `amount` only caps the USDC grant
*downward* (≤ 3000); MTF is fixed. The grant is `"queued"` — it lands ~1 block
later, so wait a moment before confirming the balance:

:::warning
**Check the balance; do not trust `"queued"`.** The faucet transfers out of a
reserve account, and the claim is re-checked when the block applies it. **The
reserve is empty on the live chain today**, so the claim above returns
`200 queued` and credits nothing until governance funds it. If no balance
appears, that is why — see [the reserve](../api/rest/faucet.md#reserve).
:::

> The faucet is a **devnet/testnet convenience only**. To fund a real account
> with bridged USDC, deposit through the MetaBridge custody bridge — call the
> source chain's `deposit(mtfDest, amount)` (never a plain transfer to the
> custody address). See [bridge → deposit](../bridge/index.md#deposit-source-chain--metaflux).

The raw curls below speak **MTF-native** on the gateway (snake_case types like
`account_state` / `open_orders`). The `@metaflux-dex/client` examples speak the
same native surface — the SDK just builds the signed envelope for you.

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<YOUR_ADDRESS>"}'
```

You should see `data.account_value: "3000"`.

## Step 2 — Place a limit order {#step-2--place-a-limit-order}

:::tip
**Going further than this quickstart?** [Placing orders](./placing-orders.md) is
the canonical order guide — the raw wire request and response, the two number
planes, and a tiered map of every order action.
:::

The full signing flow is in [signing](./signing.md). For this quickstart use the official TypeScript SDK (`@metaflux-dex/client` — ships before mainnet; see [TypeScript SDK](./typescript-sdk.md)).

```typescript
import { Client } from '@metaflux-dex/client';

const client = new Client({
  baseUrl:    'https://api.devnet.mtf.exchange', // MTF-native is the gateway default path
  privateKey: Buffer.from(process.env.PRIVATE_KEY!.replace(/^0x/, ''), 'hex'), // 32 bytes
});

const owner = '0x<YOUR_ADDRESS>';

// `markets()` keys by `coin` (the symbol); the numeric id a signed action
// needs is `signing_id` on `markets_meta`, the STATIC read. There is no
// `asset_id` field — reading one gives you `undefined`.
const meta = await client.info.marketsMeta();
const btc = meta.perp.find((m) => m.coin === 'BTC')!;

const result = await client.placeOrder({
  venue: 'perp',
  owner,
  market: btc.signing_id,
  side: 'bid',      // 'bid' = buy, 'ask' = sell
  kind: 'limit',
  size: 1_000,       // raw lots, scaled by the market's sz_decimals
  limit_px: 5_000_000_000_000, // 1e8 fixed-point plane
  tif: 'gtc',
  stp_mode: 'cancel_newest',
  reduce_only: false,
});

if (result.route === 'batch_order') {
  console.log('order status:', result.legs[0]?.status);
}
```

Raw curl (MTF-native shape — you build the signature yourself; see [signing](./signing.md)):

```bash
curl -X POST https://api.devnet.mtf.exchange/exchange \
  -H 'content-type: application/json' \
  -d @order.json
```

where `order.json` is the signed MTF-native envelope you assembled.

### Spot trading example {#spot-trading-example}

[Spot](../products/spot.md) is a token-for-token CLOB, separate from
perps — no leverage, no positions. Place a spot order with the native
[`spot_order`](../api/rest/exchange.md#spot_order) action: it takes a **spot pair
id** (not a perp `market`), a `side`, a `limit_px`, a `size`, and a `tif`. A
resting `gtc`/`alo` order locks reserved-balance escrow; `ioc` never rests.

```jsonc
// the `action` you sign and POST to /exchange (sender-authorized; owner is optional)
{
  "type": "spot_order",
  "order": {
    "pair":     200,           // spot pair id from /info, not a perp market id
    "side":     "bid",         // bid = buy base (pays quote); ask = sell base
    "size":     100000000,
    "limit_px": 200000000,     // 1e8 plane; 0 places a market order (must use tif "ioc")
    "tif":      "gtc",
    "stp_mode": "cancel_oldest"
  }
}
```

The synchronous response carries the assigned `oid` with a `resting` or `filled`
entry (the same status union as a perp order). Read your spot balances and open
spot orders back via [`POST /info`](../api/rest/info.md); cancel with
[`spot_cancel`](../api/rest/exchange.md#spot_cancel), which refunds the escrow.

## Step 3 — Check the order is on the book {#step-3--check-the-order-is-on-the-book}

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"open_orders","address":"0x<YOUR_ADDRESS>"}'
```

You should see your order with the `oid` from step 2.

Or, subscribe to live updates (preferred for any non-trivial usage):

```typescript
const ws = await client.connectWs();
ws.onMessage((f) => {
  if (f.channel === 'order_updates') console.log('event:', f.data);
});
await ws.subscribe({ type: 'order_updates', user: owner });
```

## Step 4 — Cancel {#step-4--cancel}

```typescript
if (result.route === 'batch_order') {
  const status = result.legs[0]?.status;
  const oid = status && 'resting' in status ? status.resting.oid : undefined;
  if (oid !== undefined) await client.cancelOrderNative({ owner, market: btc.signing_id, oid });
}
```

```bash
# raw curl
curl -X POST https://api.devnet.mtf.exchange/exchange \
  -d @cancel.json
```

## Step 5 — Withdraw {#step-5--withdraw}

```typescript
await client.mbWithdraw({
  chain: 'Arbitrum',
  asset: 0, // 0 = USDC cross-collateral
  amount: 100_000_000, // 100 USDC, base units
  dst_addr: '0x<DESTINATION>',
});
```

This queues a MetaBridge withdrawal. After the MetaFlux validator set co-signs it to a ⅔ stake-weighted quorum and the dispute window elapses (a few minutes), you can `claim` on the destination chain (see [bridge](../bridge/)).

## What just happened {#what-just-happened}

```mermaid
sequenceDiagram
    participant client
    participant gateway
    participant node
    participant consensus
    participant MetaBridge

    Note over client: deposit USDC (faucet)

    client->>gateway: POST /exchange Order
    gateway->>node: admit
    node->>consensus: commit
    node-->>gateway: 202 Accepted
    gateway-->>client: order_updates push

    client->>gateway: POST /exchange Cancel
    gateway->>node: admit + commit
    gateway-->>client: 202

    client->>gateway: POST /exchange Withdraw
    gateway->>node: withdraw action
    node->>MetaBridge: "⅔ co-sign"
    Note over MetaBridge: batchWithdraw + dispute window
    MetaBridge->>MetaBridge: claim on dest chain
    gateway-->>client: 202
```

## Next steps {#next-steps}

- [Placing orders](./placing-orders.md) — the canonical order guide: batches, spot, cancels, number planes
- [Signing](./signing.md) — what's inside the SDK's signing
- [Agent wallets in practice](./agent-wallets-howto.md) — production hot-key pattern
- [Order types](../concepts/order-types.md) — beyond plain limit orders
- [Error handling](./error-handling.md) — admission vs commit vs network
- [WS subscriptions](../api/ws/subscriptions.md) — push for live data
- [Migrating from HL](./migrating-from-hl.md) — already have a Hyperliquid bot? this page first

## Troubleshooting {#troubleshooting}

<details>
<summary>Show troubleshooting</summary>

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 signer is not the sender` | Wrong EIP-712 domain chain id | The SDK signs against `MTF_CHAIN_ID` (testnet/devnet `114514`, mainnet `8964`) by default — don't override `chainId` on a call unless you mean to target a different network |
| `400 action: <parse error>` | Wrong field name, wrong type, or a missing required field | Check the action's entry in the catalog |
| `404 unknown user` on info | Address has no on-chain state yet | Deposit first (faucet) |
| `429 rate limit` | Too many requests | See [rate limits](../api/rate-limits.md); back off |
| Withdrawal stuck on destination | MetaBridge withdrawal pending (dispute window) | Wait for the ⅔ co-signature + dispute window; then `claim` on the destination chain (see [bridge](../bridge/)) |

</details>

## See also {#see-also}

- [Networks](../networks.md) — devnet / testnet / mainnet endpoints + chainIds
- [Signing](./signing.md) — the full envelope spec
- [`POST /exchange`](../api/rest/exchange.md)
- [`POST /info`](../api/rest/info.md)
- [WS](../api/ws/index.md)
