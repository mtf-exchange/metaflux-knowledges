# Quickstart — 5-minute end-to-end

{% hint style="info" %}
**Status.** **stable** wire surface. Devnet endpoints, no mainnet warranty.
{% endhint %}

Deposit, place an order, cancel, withdraw. By the end of this page your TypeScript / Python / curl session has done a complete round-trip against devnet.

## Prerequisites

- An EVM private key (any 32-byte hex; for devnet, generate fresh — don't reuse a mainnet key)
- USDC on a CCTP-supported source chain (Arbitrum / Base / Ethereum / OP / Avalanche) — devnet allows the faucet route instead
- `curl` or any HTTP client

## Endpoints

The gateway is the single public front door. MTF-native is the default path;
HL-compat lives under `/hl/*`.

| Service | URL (devnet) |
|---------|--------------|
| Gateway front door | `https://gateway.devnet.mtf.exchange` |
| MTF-native (default) | `POST /info` · `POST /exchange` · `GET /ws` |
| HL-compat | `POST /hl/info` · `POST /hl/exchange` · `GET /hl/ws` |
| CCXT-compat | `/ccxt/*` |
| EVM JSON-RPC | `POST /evm` |
| Faucet (devnet) | `POST /faucet` |
| Explorer | `https://devnet.mtf.exchange/explorer` |

> The faucet is **not** a separate service — it's the `POST /faucet` route on the
> gateway front door. Running the node yourself? The same native surface
> (`/info` · `/exchange` · `/ws` · `/faucet`) is served directly at
> `http://localhost:8080`. See [`POST /faucet`](../api/rest/faucet.md).

See [networks](../networks.md) for the full list including testnet and (post-launch) mainnet.

## Step 1 — Get devnet USDC

```bash
curl -X POST https://gateway.devnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

One claim grants **3000 USDC** cross-collateral **and 10 MTF** spot tokens —
**once ever per address** (a second claim returns `429 address already funded`),
rate-limited at 1 / minute / IP. The optional `amount` only caps the USDC grant
*downward* (≤ 3000); MTF is fixed. The grant is `"queued"` — it lands ~1 block
later, so wait a moment before confirming the balance:

The raw curls below use the **HL-compat** shape under `/hl/*` on the gateway
(camelCase types like `clearinghouseState` / `openOrders`, msgpack-signed
envelopes) — handy if you already have an HL client. The `@metaflux/sdk` examples
instead speak MTF-native on the gateway's default path (`/info` · `/exchange`).
Pick one lane; both go through the same front door, just different paths.

```bash
curl -X POST https://gateway.devnet.mtf.exchange/hl/info \
  -H 'content-type: application/json' \
  -d '{"type":"clearinghouseState","user":"0x<YOUR_ADDRESS>"}'
```

You should see `marginSummary.accountValue: "3000.0"`.

## Step 2 — Place a limit order

The full signing flow is in [signing](./signing.md). For this quickstart use the official TypeScript SDK (`@metaflux/sdk` — coming).

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://gateway.devnet.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

const meta = await client.info.meta();
const btcId = meta.universe.findIndex(m => m.name === 'BTC');

const result = await client.exchange.order({
  asset:    btcId,
  isBuy:    true,
  price:    '50000',
  size:     '0.1',
  tif:      'Gtc',
  reduceOnly: false,
});

console.log('order id:', result.oid);
```

Raw curl (HL-compat shape — you build the signature yourself; see [signing](./signing.md)):

```bash
curl -X POST https://gateway.devnet.mtf.exchange/hl/exchange \
  -H 'content-type: application/json' \
  -d @order.json
```

where `order.json` is the HL-shape envelope you assembled.

## Step 3 — Check the order is on the book

```bash
curl -X POST https://gateway.devnet.mtf.exchange/hl/info \
  -H 'content-type: application/json' \
  -d '{"type":"openOrders","user":"0x<YOUR_ADDRESS>"}'
```

You should see your order with the `oid` from step 2.

Or, subscribe to live updates (preferred for any non-trivial usage):

```typescript
const ws = client.ws();
ws.subscribe('userEvents', { user: client.address }, (event) => {
  console.log('event:', event);
});
```

## Step 4 — Cancel

```typescript
await client.exchange.cancel({ asset: btcId, oid: result.oid });
```

```bash
# raw curl
curl -X POST https://gateway.devnet.mtf.exchange/hl/exchange \
  -d @cancel.json
```

## Step 5 — Withdraw

```typescript
await client.exchange.withdrawUsdc({
  amount:           '100',
  destinationChain: 'Arbitrum',
  destinationAddr:  '0x<DESTINATION>',
});
```

This emits a CCTP burn on MetaFlux. After CCTP attestation (~13 finality blocks on the destination) you can claim on the destination chain via Circle's standard flow (see [bridge](../bridge/)).

## What just happened

```
client                  gateway              node                  consensus           CCTP
  │                       │                    │                      │                  │
  │  deposit USDC         │                    │                      │                  │
  │  (faucet)             │                    │                      │                  │
  │                       │                    │                      │                  │
  │ POST /exchange Order  │                    │                      │                  │
  ├──────────────────────►│ ─────────────────► │   admit              │                  │
  │                       │                    ├─────────────────────►│  commit          │
  │ 202 Accepted          │                    │ ◄────────────────────┤                  │
  │◄──────────────────────┤◄─── orderEvents ───┤                      │                  │
  │                       │                    │                      │                  │
  │ POST /exchange Cancel │                    │                      │                  │
  ├──────────────────────►│ ─────────────────► │   admit + commit     │                  │
  │ 202                   │                    │                      │                  │
  │                       │                    │                      │                  │
  │ POST /exchange Withdraw                    │                      │                  │
  ├──────────────────────►│ ─────────────────► │   burn event         │                  │
  │ 202                   │                    ├─────────────────────►│  CCTP attest ──► │
  │                       │                    │                      │                  ├─► dest chain
```

## Next steps

- [Signing](./signing.md) — what's inside the SDK's signing
- [Agent wallets in practice](./agent-wallets-howto.md) — production hot-key pattern
- [Order types](../concepts/order-types.md) — beyond plain limit orders
- [Error handling](./error-handling.md) — admission vs commit vs network
- [WS subscriptions](../api/ws/subscriptions.md) — push for live data
- [Migrating from HL](./migrating-from-hl.md) — already have an HL bot? this page first

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 signer is not the sender` | Wrong `chainId` | Use `31337` for devnet |
| `400 invalid msgpack` | Encoder reorders map keys | Use a standards-compliant msgpack lib |
| `404 unknown user` on info | Address has no on-chain state yet | Deposit first (faucet) |
| `429 rate limit` | Too many requests | See [rate limits](../api/rate-limits.md); back off |
| Withdrawal stuck on destination | CCTP attestation pending | Wait ~5–10 min; query Circle's attestation API |

## See also

- [Networks](../networks.md) — devnet / testnet / mainnet endpoints + chainIds
- [Signing](./signing.md) — the full envelope spec
- [`POST /exchange`](../api/rest/exchange.md)
- [`POST /info`](../api/rest/info.md)
- [WS](../api/ws/README.md)
