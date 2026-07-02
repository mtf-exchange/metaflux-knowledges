# Migrating from HL

:::info
**MetaFlux speaks its own MTF-native protocol — there is no Hyperliquid-compatible shim.** Your bot keeps its strategy and trading logic; what changes is the client/wire layer. The fastest path is the official [TypeScript](./typescript-sdk.md) or [Rust](./rust-sdk.md) SDK, which builds the native envelope and EIP-712 signature for you. For other languages, implement [typed-data signing](./typed-data-signing.md) directly.
:::

If your bot already trades on a Hyperliquid-style perps DEX, the move to MetaFlux is a **client-layer rewrite, not a strategy rewrite**. The concepts you depend on — limit orders, fills, funding, cross / isolated margin, agent wallets, sub-accounts, vaults — all exist on MTF. What you swap out is the wire shape, the action / query names, the chain ID, and the asset IDs.

## The shape of the move

- **Wire shape.** MTF-native is snake_case JSON over `POST /exchange` (write), `POST /info` (read), and `GET /ws` (stream), each EIP-712-signed where required. Adopt the SDK or implement the [native signing scheme](./typed-data-signing.md).
- **Strategy & risk logic.** Unchanged — your quoting, sizing, and hedging code carries over.
- **Names & a few semantics.** Action types and query types are renamed (table below) and a handful of behaviours differ (asset IDs, the T0 liquidation tier, agent-approval latency).

## What works the same

- Limit / IOC / ALO orders, reduce-only, client order ids (`cloid`).
- EIP-712 signing — same signature primitive, different domain and chain ID.
- Cross / isolated margin, funding payments, fills and order-status reads.
- Agent wallets (hot keys with no withdrawal authority), sub-accounts, vaults.

## What changes

### 1. Protocol surface

There is one MTF-native surface; you call it through the SDK or build the envelope yourself. Names map cleanly:

| You used on HL | MTF-native equivalent |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) / [`frontend_open_orders`](../api/rest/info.md#frontend_open_orders) |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| `POST /info` `candleSnapshot` | [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot) (the standalone `candle` type is removed) |
| WS `userEvents`, `l2Book`, `candle` | `user_events`, `l2_book`, `candles` (snake_case) — see [WS subscriptions](../api/ws/subscriptions.md) |

The full catalogs are [`POST /exchange`](../api/rest/exchange.md) and [`POST /info`](../api/rest/info.md).

### 2. Chain ID

MetaFlux is its own L1, not an HL deployment. Sign against the MetaFlux chain ID, **not** HL's:

| Network | MTF `chainId` |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / local | **31337** (`0x7a69`) |

The MTF EIP-712 domain uses `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`. See [networks](../networks.md) and [signing](./signing.md).

### 3. Base URL

```
MTF: https://<net>-gateway.mtf.exchange/{info,exchange,ws}
```

The gateway is the single front door for the MTF-native surface. Running the node yourself, the same surface is served at `http://localhost:8080`.

### 4. Asset IDs

HL and MTF both use integer asset IDs but **the integers are not the same**. `0` on HL is BTC perp; `0` on MTF might be ETH or anything else depending on the deployment. Always look up your asset IDs via `POST /info { "type": "markets" }` at startup; never hard-code.

### 5. Numeric precision

Price and size fields are scaled integers transmitted as JSON strings because IEEE-754 loses precision past 2^53. If your bot parses with default JS `JSON.parse`, switch to a big-int-aware parser for these fields.

### 6. Liquidation behaviour

MetaFlux adds a [T0 yellow-card grace tier](../concepts/tiered-liquidation.md) that HL does not have. Practical effect: at health `[1.0, 1.1)` your account's resting ALO orders get force-cancelled and a warning event is emitted, but positions are not touched. Then T1 / T2 / T3 behave like HL's Partial / Market / Backstop.

If your bot listens for liquidation events to trigger margin top-ups, **add a handler for the new T0 event** — that's the early-warning signal HL doesn't give you. Catching it gives you one block of grace to act.

### 7. Agent wallet semantics

An agent is a key with no withdrawal authority — same model as HL (see [agent wallets](../concepts/agent-wallets.md)). The action is [`approve_agent`](../api/rest/exchange.md#approve_agent). The one mechanical difference: MTF's agent approval becomes effective **one block after commit**, vs HL's typically two-block latency. Slightly faster; same warm-up dance.

### 8. Vaults

HL vaults and MetaFlux vaults are not the same product. The [`vault_state`](../api/rest/info.md#vault_state) read returns MTF's own vault types (MFlux Vault, user vaults). HL vault addresses won't resolve. Expect MTF entities, not HL ones.

## Step-by-step migration

### Day 0 — adopt the native client

1. Install the [TypeScript](./typescript-sdk.md) or [Rust](./rust-sdk.md) SDK (or implement [typed-data signing](./typed-data-signing.md) for your language).
2. Point `baseUrl` at the MTF gateway and set `chainId` for your target network.
3. Re-implement asset lookup against `POST /info { "type": "markets" }`.

### Day 1 — map your actions

Translate each action your bot sends to its MTF-native equivalent (see the table in [§1](#1-protocol-surface)). `order` → `submit_order`, `cancel` → `cancel_order`, leverage / margin changes → `update_leverage` / `update_isolated_margin`. The EIP-712 envelope is built by the SDK; only the action variant name and field casing differ.

### Day 2 — wire the new signals

- Subscribe to `sub_accounts` reads if you operate sub-accounts (MTF allows up to 32 subs per master).
- Add a handler for T0 yellow-card events on the `user_events` WS channel.
- If you depend on portfolio margin, enroll on MTF with [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin). The threshold and scenario set are network parameters — see [portfolio margin](../concepts/portfolio-margin.md).

### Day 3+ — adopt MTF-only features

Optional. If you want features HL doesn't have:

- **RFQ** — request-for-quote primitives, useful for size that doesn't want to advertise on the book.
- **FBA** — frequent batch auction matching for designated markets, reduces MEV.
- **Cross-chain primitives** — bridge primitives natively callable from EVM contracts.

These are MTF-native actions on `POST /exchange`; see the [API overview](../api/index.md).

## Top HL bot patterns — concrete migration

### 1. Simple limit-order MM (the canonical pattern)

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://testnet-gateway.mtf.exchange',
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

The strategy stays; the client layer becomes the SDK call.

### 2. Liquidation-watching bot (margin top-up)

HL emits `liquidation` events at the partial / market tier. MTF adds **`yellowCard`** as the earliest signal on the `user_events` channel.

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

See [risk-watcher](./risk-watcher.md) for the full pattern.

### 3. Funding-rate arb bot

Funding cadence is similar (hourly by default, configurable per market on MTF). Formula structure is identical; the read is the native `funding` query.

```typescript
const funding = await client.info.fundingHistory({ coin: 'BTC' });
// values may differ from HL because oracle composition differs
const rate = funding[0].rate_per_hr;
```

MTF's oracle composition is governed per-market (committed `SetOracleWeights`) — if your arb depends on specific oracle providers, verify the weighted source list. See [mark prices](../concepts/mark-prices.md).

### 4. Multi-account / institutional setup

HL: master + agents per host. MTF: same, plus first-class **multi-sig accounts**.

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

See [multi-sig](../concepts/multi-sig.md).

### 5. Sub-account portfolio manager

HL sub-accounts: up to 8. MTF: up to 32.

```typescript
// MTF: create one of up to 32 subs
await master.createSubAccount({ name: 'desk-A' });
await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

Per-sub agent management, per-sub PM enrollment, and per-sub margin modes are all supported.

## Reference table

| Action you used on HL | MTF-native action |
|-----------------------|-------------------|
| `order` (place limit / IOC / ALO) | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel` (by OID) | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / spot transfers | native spot transfer actions |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer) (semantics may differ) |

## Getting help

- This repo (`mtf-exchange/metaflux-knowledges`) — file an issue.
- See [`POST /exchange`](../api/rest/exchange.md) and the [signing walkthrough](./signing.md) for the wire-level reference.
