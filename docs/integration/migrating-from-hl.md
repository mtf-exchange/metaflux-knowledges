# Migrating from HL

:::info
**MetaFlux speaks its own MTF-native protocol — there is no Hyperliquid-compatible shim.** Your bot keeps its strategy and trading logic; what changes is the client/wire layer. The fastest path is the official [TypeScript](./typescript-sdk.md) or [Rust](./rust-sdk.md) SDK, which builds the native envelope and EIP-712 signature for you. For other languages, implement [typed-data signing](./typed-data-signing.md) directly.
:::

If your bot already trades on a Hyperliquid-style perps DEX, the move to MetaFlux is a **client-layer rewrite, not a strategy rewrite**. The concepts you depend on — limit orders, fills, funding, cross / isolated margin, agent wallets, sub-accounts, vaults — all exist on MTF. What you swap out is the wire shape, the action / query names, the chain ID, and the asset IDs.

## The shape of the move {#the-shape-of-the-move}

- **Wire shape.** MTF-native is snake_case JSON over `POST /exchange` (write), `POST /info` (read), and `GET /ws` (stream), each EIP-712-signed where required. Adopt the SDK or implement the [native signing scheme](./typed-data-signing.md).
- **Strategy & risk logic.** Unchanged — your quoting, sizing, and hedging code carries over.
- **Names & a few semantics.** Action types and query types are renamed (table below) and a handful of behaviours differ (asset IDs, the T0 liquidation tier, agent-approval latency).

## What works the same {#what-works-the-same}

- Limit / IOC / ALO orders, reduce-only, client order ids (`cloid`).
- EIP-712 signing — same signature primitive, different domain and chain ID.
- Cross / isolated margin, funding payments, fills and order-status reads.
- Agent wallets (hot keys with no withdrawal authority), sub-accounts, vaults.

## What changes {#what-changes}

### 1. Protocol surface {#1-protocol-surface}

There is one MTF-native surface; you call it through the SDK or build the envelope yourself. Names map cleanly:

| You used on HL | MTF-native equivalent |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) — **one kind for both**. There is no separate "frontend" variant; the time-in-force, `cloid` and trigger detail is folded into every `open_orders` row. |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| `POST /info` `candleSnapshot` | [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot) (the standalone `candle` type is removed). **Bars carry a price series, not executions** — `candle_type` is `mark` (default) or `oracle`, and `v` / `q` are always `"0"` |
| WS `userEvents`, `l2Book`, `candle` | `fills` / `order_updates` / `ledger_updates` (there is no grab-bag events channel), `l2_book`, `candles` — see [WS subscriptions](../api/ws/subscriptions.md) |

The full catalogs are [`POST /exchange`](../api/rest/exchange.md) and [`POST /info`](../api/rest/info.md).

### 2. Chain ID {#2-chain-id}

MetaFlux is its own L1, not an HL deployment. Sign against the MetaFlux chain ID, **not** HL's:

| Network | MTF `chainId` |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / local | **31337** (`0x7a69`) |

The MTF EIP-712 domain uses `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`. See [networks](../networks.md) and [signing](./signing.md).

### 3. Base URL {#3-base-url}

```
MTF: https://api.<net>.mtf.exchange/{info,exchange,ws}
```

The gateway is the single front door for the MTF-native surface. Running the node yourself, the same surface is served at `http://localhost:8080`.

### 4. Asset IDs {#4-asset-ids}

HL and MTF both use integer asset IDs but **the integers are not the same**. `0` on HL is BTC perp; `0` on MTF might be ETH or anything else depending on the deployment. Always look up your asset IDs via `POST /info { "type": "markets" }` at startup; never hard-code.

### 5. Numeric precision {#5-numeric-precision}

Price and size fields are scaled integers transmitted as JSON strings because IEEE-754 loses precision past 2^53. If your bot parses with default JS `JSON.parse`, switch to a big-int-aware parser for these fields.

### 6. Liquidation behaviour {#6-liquidation-behaviour}

MetaFlux adds a [T0 yellow-card grace tier](../concepts/tiered-liquidation.md) that HL does not have. Practical effect: at health `[1.0, 1.1)` your account's resting ALO orders get force-cancelled and a warning event is emitted, but positions are not touched. Then T1 / T2 / T3 behave like HL's Partial / Market / Backstop.

If your bot listens for liquidation events to trigger margin top-ups, **add a handler for the new T0 event** — that's the early-warning signal HL doesn't give you. Catching it gives you one block of grace to act.

### 7. Agent wallet semantics {#7-agent-wallet-semantics}

An agent is a key with no withdrawal authority — same model as HL (see [agent wallets](../concepts/agent-wallets.md)). The action is [`approve_agent`](../api/rest/exchange.md#approve_agent). The one mechanical difference: MTF's agent approval becomes effective **one block after commit**, vs HL's typically two-block latency. Slightly faster; same warm-up dance.

### 8. Vaults {#8-vaults}

HL vaults and MetaFlux vaults are not the same product. The [`vault_state`](../api/rest/info.md#vault_state) read returns MTF's own vault types (MFlux Vault, user vaults). HL vault addresses won't resolve. Expect MTF entities, not HL ones.

## Step-by-step migration {#step-by-step-migration}

### Day 0 — adopt the native client {#day-0--adopt-the-native-client}

1. Install the [TypeScript](./typescript-sdk.md) or [Rust](./rust-sdk.md) SDK (or implement [typed-data signing](./typed-data-signing.md) for your language).
2. Point `baseUrl` at the MTF gateway and set `chainId` for your target network.
3. Re-implement asset lookup against `POST /info { "type": "markets" }`.

### Day 1 — map your actions {#day-1--map-your-actions}

Translate each action your bot sends to its MTF-native equivalent (see the table in [§1](#1-protocol-surface)). `order` → `submit_order`, `cancel` → `cancel_order`, leverage / margin changes → `update_leverage` / `update_isolated_margin`. The EIP-712 envelope is built by the SDK; only the action variant name and field casing differ.

### Day 2 — wire the new signals {#day-2--wire-the-new-signals}

- Read `account_state` with `detail: "overview"` if you operate sub-accounts (MTF allows up to 32 subs per master); the sub-account list is one of its facets.
- Add a handler for T0 yellow-card events on the [`notifications`](../api/ws/subscriptions.md#notifications) WS channel (kind `yellow_card`).
- If you depend on portfolio margin, enroll on MTF with [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin). The threshold and scenario set are network parameters — see [portfolio margin](../concepts/portfolio-margin.md).

### Day 3+ — adopt MTF-only features {#day-3--adopt-mtf-only-features}

Optional. If you want features HL doesn't have:

- **RFQ** — request-for-quote primitives, useful for size that doesn't want to advertise on the book.
- **FBA** — frequent batch auction matching for designated markets, reduces MEV.
- **Cross-chain primitives** — bridge primitives natively callable from EVM contracts.

These are MTF-native actions on `POST /exchange`; see the [API overview](../api/index.md).

## Top HL bot patterns — concrete migration {#top-hl-bot-patterns--concrete-migration}

### 1. Simple limit-order MM (the canonical pattern) {#1-simple-limit-order-mm-the-canonical-pattern}

```typescript
import { Client } from '@metaflux-dex/client';

const client = new Client({
  baseUrl:    'https://api.devnet.mtf.exchange',
  privateKey: Buffer.from(process.env.PRIVATE_KEY!.replace(/^0x/, ''), 'hex'),
});
const owner = '0x<YOUR_ADDRESS>';

// asset lookup: HL `meta.universe` → MTF `marketsMeta` (`asset_id` is the
// numeric id a signed action needs; may not be 0)
const meta = await client.info.marketsMeta();
const BTC = meta.perp.find((m) => m.coin === 'BTC')!.asset_id;

// order / cancel — your strategy logic, native action names
await client.submitOrderNative({
  owner, market: BTC, side: 'bid', kind: 'limit',
  size: 1_000, limit_px: 1_000_000_000_000,
  tif: 'gtc', stp_mode: 'cancel_newest', reduce_only: false,
});
```

The strategy stays; the client layer becomes the SDK call.

### 2. Liquidation-watching bot (margin top-up) {#2-liquidation-watching-bot-margin-top-up}

HL emits `liquidation` events at the partial / market tier. MTF adds a **`yellow_card`** notification as the earliest signal, on the dedicated [`notifications`](../api/ws/subscriptions.md#notifications) channel.

```typescript
import { isChannelFrame } from '@metaflux-dex/client';

const ws = await client.connectWs();
ws.onMessage((f) => {
  if (!isChannelFrame(f, 'notifications')) return;
  for (const record of f.data) {
    switch (record.kind) {
      case 'yellow_card':
        // T0 — one block to act; ALO orders already cancelled
        deposit(YELLOW_CARD_DEPOSIT);
        break;
      case 'forced_close_tier':
        // T1 partial OR T2 full — too late for prevention
        emergencyUnwind();
        break;
    }
  }
});
await ws.subscribe({ type: 'notifications', user: owner });
```

See [risk-watcher](./risk-watcher.md) for the full pattern.

### 3. Funding-rate arb bot {#3-funding-rate-arb-bot}

Funding cadence is similar (hourly by default, configurable per market on MTF). Formula structure is identical; the read is the native `funding` query.

```typescript
const funding = await client.info.fundingHistory('BTC');
// values may differ from HL because oracle composition differs
const rate = funding.samples.at(-1)?.funding_rate;
```

MTF's oracle composition is governed per-market (committed `SetOracleWeights`) — if your arb depends on specific oracle providers, verify the weighted source list. See [mark prices](../concepts/mark-prices.md).

### 4. Multi-account / institutional setup {#4-multi-account--institutional-setup}

HL: master + agents per host. MTF: same, plus first-class **multi-sig accounts**.

```typescript
// existing: master + agents (each host is its own Client with its own key;
// `owner` on each action routes it to the master, not a client option)
await master.approveAgent({ agent: host1AgentAddr });
await master.approveAgent({ agent: host2AgentAddr });

// new on MTF: convert master to multi-sig for cold custody
await master.convertToMultiSigUser({
  threshold: 2,
  signers: [signer1, signer2, signer3],
});
// every subsequent master-level action then requires 2 sigs;
// agents still work as before for trading actions
```

See [multi-sig](../concepts/multi-sig.md).

### 5. Sub-account portfolio manager {#5-sub-account-portfolio-manager}

HL sub-accounts: up to 8. MTF: up to 32.

```typescript
// MTF: create one of up to 32 subs
await master.createSubAccount({ name: 'desk-A', shared_stp_group: false });
await master.subAccountTransfer({ sub_index: 0, deposit: true, amount: '10000' });
```

Per-sub agent management, per-sub PM enrollment, and per-sub margin modes are all supported.

## Reference table {#reference-table}

| Action you used on HL | MTF-native action |
|-----------------------|-------------------|
| `order` (place limit / IOC / ALO) | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel` (by OID) | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / spot transfers | native spot transfer actions |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `sendToEvmWithData` | [`send_to_evm_with_data`](../api/rest/exchange.md#send_to_evm_with_data) (same field names) — or [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer). Both are live. **Read the note below.** |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer) (semantics may differ) |

### `sendToEvmWithData` — a copied payload will be refused {#send-to-evm-with-data-note}

`send_to_evm_with_data` keeps the HL field names, so it is tempting to copy the
payload across unchanged. **Do not.** Three fields that HL accepts and ignores are
**refused** here, and the one you will hit is the first:

- **`source_dex` must be `0`.** An HL payload commonly carries `source_dex: 1`.
  MTF debits one ledger, the spot ledger, so it refuses any other value rather
  than debiting a ledger you did not name.
- **`to_perp` must be `false`.** The EVM side has no perp account to credit.
- **`destination_chain_id` must be `0` or the local EVM chain id.** Any other
  value is refused. It is **not** a cross-chain lane — use
  [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) to leave the chain.

Two more things before you port it:

- **The action is live.** An earlier version of this page said the network refused
  it and told you to port to `core_evm_transfer` instead. That is no longer true.
- **It debits the spot ledger only.** It cannot move USDC held as perp collateral.
  [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer) can, and it is
  live now, so it is the better target for most ports.

Full rules: [`send_to_evm_with_data`](../api/rest/exchange.md#send_to_evm_with_data).

## Getting help {#getting-help}

- This repo (`mtf-exchange/metaflux-knowledges`) — file an issue.
- See [`POST /exchange`](../api/rest/exchange.md) and the [signing walkthrough](./signing.md) for the wire-level reference.
