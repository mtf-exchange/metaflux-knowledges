# Migrating from HL

This page explains how to move a Hyperliquid bot to the MetaFlux API.

:::info MetaFlux uses its own MTF-native protocol
There is no Hyperliquid-compatible shim. Your bot keeps its strategy and trading logic. The client
and wire layer changes. The fastest path is the official [TypeScript](./typescript-sdk.md) or
[Rust](./rust-sdk.md) SDK. The SDK builds the native envelope and the EIP-712 signature for you.
For other languages, implement [typed-data signing](./typed-data-signing.md) directly.
:::

If your bot trades on a Hyperliquid-style perps DEX, the move to MetaFlux rewrites the client
layer. It does not rewrite the strategy. The concepts you depend on all exist on MTF: limit
orders, fills, funding, cross and isolated margin, agent wallets, sub-accounts and vaults. You
replace the wire shape, the action and query names, the chain ID and the asset IDs.

## Scope of the change {#the-shape-of-the-move}

- **Wire shape.** MTF-native is snake_case JSON over `POST /exchange` (write), `POST /info`
  (read) and `GET /ws` (stream), each EIP-712-signed where required. Use the SDK, or implement
  the [native signing scheme](./typed-data-signing.md).
- **Strategy and risk logic.** Unchanged. Your quoting, sizing and hedging code carries over.
- **Names and some semantics.** Action types and query types have new names (table below). Some
  behaviours differ: asset IDs, the T0 liquidation tier and agent-approval latency.

## Unchanged features {#what-works-the-same}

- Limit, IOC and ALO orders, reduce-only, and client order ids (`cloid`).
- EIP-712 signing: the same signature primitive, with a different domain and chain ID.
- Cross and isolated margin, funding payments, fills and order-status reads.
- Agent wallets (hot keys with no withdrawal authority), sub-accounts and vaults.

## Changes {#what-changes}

### Protocol surface {#1-protocol-surface}

There is one MTF-native surface. You call it through the SDK, or you build the envelope yourself.
The names map one to one:

| You used on HL | MTF-native equivalent |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange/orders.md#submit_order) / [`batch_order`](../api/rest/exchange/orders.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange/orders.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange/orders.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange/orders.md#modify) / [`batch_modify`](../api/rest/exchange/orders.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | Two reads, not one. [`account_state`](../api/rest/info/account.md#account_state) for the collateral and margin health, [`clearinghouse_state`](../api/rest/info/account.md#clearinghouse_state) for the position rows. HL keeps positions inside the account read. MetaFlux does not. See below |
| `POST /info` `spotClearinghouseState` | [`account_state`](../api/rest/info/account.md#account_state): the `spot.balances` array. There is no separate spot read |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info/orders-fills.md#open_orders), one kind for both. There is no separate "frontend" variant. Every `open_orders` row includes the time-in-force, `cloid` and trigger detail. |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info/orders-fills.md#user_fills) |
| `POST /info` `candleSnapshot` | [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot). The standalone `candle` type is removed. `candle_type` selects one of THREE series: `mark` (the default), `oracle` or `trade`. A `mark` or `oracle` bar is a price series, not executions: its `v` and `q` read `"0"` and its `n` reads `0`. `v`, `q` and `n` can also be ABSENT on any series, because durable history holds no volume for the bucket. A `trade` bar served from history drops `q` in every case. Test that the key is present before you read it. Absent means "no data", and `"0"` means "no trades". See [the volume rule](../api/rest/info/perpetuals.md#candle_snapshot-volume) |
| WS `userEvents`, `l2Book`, `candle` | `fills` / `order_updates` / `ledger_updates` (there is no combined events channel), `l2_book`, `candles`. See [WS subscriptions](../api/ws/subscriptions.md) |

**The account read splits differently from HL's.** HL splits per product, into
`clearinghouseState` and `spotClearinghouseState`, and keeps position rows inside the perp read.
MetaFlux splits per lane in the same way, but it also moves position detail to its own read.
`account_state` therefore gives you one consistent set of money figures for the whole account.
`clearinghouse_state` gives you the rows. Do not rebuild HL's single object by a join of the two
frames. The two frames can be rendered a commit apart, and the joined result was true at no
single block. If you must combine them, compare the `height` that both frames carry.

The full catalogs are [`POST /exchange`](../api/rest/exchange.md) and
[`POST /info`](../api/rest/info.md).

### Chain ID {#2-chain-id}

MetaFlux is its own L1. It is not an HL deployment. Sign against the MetaFlux chain ID, not
HL's:

| Network | MTF `chainId` |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / local | **31337** (`0x7a69`) |

The MTF EIP-712 domain uses `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`. See
[networks](../networks.md) and [signing](./signing.md).

### Base URL {#3-base-url}

```
MTF: https://api.<net>.mtf.exchange/{info,exchange,ws}
```

The gateway is the one entry point for the MTF-native surface. If you run the node yourself, it
serves the same surface at `http://localhost:8080`.

### Asset IDs {#4-asset-ids}

HL and MTF both use integer asset IDs, but the integers are different. `0` on HL is the BTC perp.
`0` on MTF can be ETH or any other asset, depending on the deployment. Always look up your asset
IDs through `POST /info { "type": "markets" }` at startup. Never hard-code them.

### Numeric precision {#5-numeric-precision}

Price and size fields are scaled integers sent as JSON strings, because IEEE-754 loses precision
above 2^53. If your bot parses with the default JS `JSON.parse`, use a parser that supports big
integers for these fields.

### Liquidation behaviour {#6-liquidation-behaviour}

MetaFlux adds a [T0 yellow-card grace tier](../concepts/tiered-liquidation.md) that HL does not
have. At health `[1.0, 1.1)`, the chain force-cancels your account's resting ALO orders and emits
a warning event. It does not touch positions. T1, T2 and T3 then behave like HL's Partial, Market
and Backstop tiers.

If your bot listens for liquidation events to add margin, add a handler for the new T0 event.
That event is the early warning that HL does not give you. It gives you one block of grace to
act.

### Agent wallet semantics {#7-agent-wallet-semantics}

An agent is a key with no withdrawal authority. HL uses the same model (see
[agent wallets](../concepts/agent-wallets.md)). The action is
[`approve_agent`](../api/rest/exchange/account.md#approve_agent). The one mechanical difference:
an MTF agent approval takes effect one block after commit. HL typically takes two blocks. MTF is
a little faster, and the warm-up steps are the same.

### Vaults {#8-vaults}

HL vaults and MetaFlux vaults are different products. The
[`vault_state`](../api/rest/info/vaults-staking.md#vault_state) read returns MTF's own vault types
(MFlux Vault, user vaults). HL vault addresses do not resolve. Expect MTF entities, not HL ones.

## Migration steps {#step-by-step-migration}

### Day 0 {#day-0--adopt-the-native-client}

Adopt the native client.

1. Install the [TypeScript](./typescript-sdk.md) or [Rust](./rust-sdk.md) SDK, or implement
   [typed-data signing](./typed-data-signing.md) for your language.
2. Point `baseUrl` at the MTF gateway, and set `chainId` for your target network.
3. Implement the asset lookup again, against `POST /info { "type": "markets" }`.

### Day 1 {#day-1--map-your-actions}

Map your actions. Translate each action your bot sends to its MTF-native equivalent. See the
table in [protocol surface](#1-protocol-surface). `order` becomes `submit_order`, `cancel`
becomes `cancel_order`, and leverage and margin changes become `update_leverage` /
`update_isolated_margin`. The SDK builds the EIP-712 envelope. Only the action variant name and
the field casing differ.

### Day 2 {#day-2--wire-the-new-signals}

Connect the new signals.

- If you operate sub-accounts, read `account_state` with `detail: "overview"`. The sub-account
  list is one of its facets. MTF allows up to 32 sub-accounts per master.
- Add a handler for T0 yellow-card events on the
  [`notifications`](../api/ws/subscriptions.md#notifications) WS channel (kind `yellow_card`).
- If you depend on portfolio margin, enroll on MTF with
  [`user_portfolio_margin`](../api/rest/exchange/margin-risk.md#user_portfolio_margin). The
  threshold and the scenario set are network parameters. See
  [portfolio margin](../concepts/portfolio-margin.md).

### Day 3 and later {#day-3--adopt-mtf-only-features}

Adopt the features that only MTF has. This step is optional:

- **RFQ.** Request-for-quote primitives, for size that you do not want to show on the book.
- **FBA.** Frequent batch auction matching for designated markets. It reduces MEV.
- **Cross-chain primitives.** Bridge primitives that EVM contracts can call natively.

These are MTF-native actions on `POST /exchange`. See the [API overview](../api/index.md).

## Common HL bot patterns {#top-hl-bot-patterns--concrete-migration}

### Simple limit-order market maker {#1-simple-limit-order-mm-the-canonical-pattern}

This is the most common pattern.

```typescript
import { Client } from '@metaflux-dex/client';

const client = new Client({
  baseUrl:    'https://api.testnet.mtf.exchange',
  privateKey: Buffer.from(process.env.PRIVATE_KEY!.replace(/^0x/, ''), 'hex'),
});
const owner = '0x<YOUR_ADDRESS>';

// asset lookup: HL `meta.universe` → MTF `marketsMeta` (`signing_id` is the
// numeric id a signed action needs; may not be 0)
const meta = await client.info.marketsMeta();
const BTC = meta.perp.find((m) => m.coin === 'BTC')!.signing_id;

// order / cancel — your strategy logic, native action names
await client.submitOrderNative({
  owner, market: BTC, side: 'bid', kind: 'limit',
  size: 1_000, limit_px: 1_000_000_000_000,
  tif: 'gtc', stp_mode: 'cancel_newest', reduce_only: false,
});
```

The strategy stays. The client layer becomes the SDK call.

### Liquidation watcher {#2-liquidation-watching-bot-margin-top-up}

This bot adds margin when the account nears liquidation. HL emits `liquidation` events at the
partial and market tiers. MTF adds a `yellow_card` notification as the earliest signal, on the
dedicated [`notifications`](../api/ws/subscriptions.md#notifications) channel.

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

### Funding-rate arbitrage bot {#3-funding-rate-arb-bot}

The funding cadence is similar: hourly by default, and configurable per market on MTF. The
formula structure is identical. The read is the native `funding` query.

```typescript
const funding = await client.info.fundingHistory('BTC');
// values may differ from HL because oracle composition differs
const rate = funding.samples.at(-1)?.funding_rate;
```

Governance sets the MTF oracle composition per market, through committed `SetOracleWeights`. If
your arbitrage depends on specific oracle providers, verify the weighted source list. See
[mark prices](../concepts/mark-prices.md).

### Multi-account and institutional setup {#4-multi-account--institutional-setup}

HL uses a master and one agent per host. MTF uses the same setup, and adds multi-sig accounts.

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

### Sub-account portfolio manager {#5-sub-account-portfolio-manager}

HL allows up to 8 sub-accounts. MTF allows up to 32.

```typescript
// MTF: create one of up to 32 subs
await master.createSubAccount({ name: 'desk-A', shared_stp_group: false });
await master.subAccountTransfer({ sub_index: 0, deposit: true, amount: '10000' });
```

MTF supports agent management, PM enrollment and margin modes per sub-account.

## Reference table {#reference-table}

| Action you used on HL | MTF-native action |
|-----------------------|-------------------|
| `order` (place limit / IOC / ALO) | [`submit_order`](../api/rest/exchange/orders.md#submit_order) / [`batch_order`](../api/rest/exchange/orders.md#batch_order) |
| `cancel` (by OID) | [`cancel_order`](../api/rest/exchange/orders.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange/orders.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange/orders.md#modify) / [`batch_modify`](../api/rest/exchange/orders.md#batch_modify) |
| `usdSend` / spot transfers | native spot transfer actions |
| `withdraw3` | [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) |
| `sendToEvmWithData` | [`send_to_evm_with_data`](../api/rest/exchange/transfers.md#send_to_evm_with_data) (same field names), or [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer). Both are live. Read the note below. |
| `approveAgent` | [`approve_agent`](../api/rest/exchange/account.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange/margin-risk.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange/account.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer_by_code`](../api/rest/exchange/account.md#set_referrer_by_code) / [`register_referral_code`](../api/rest/exchange/account.md#register_referral_code). [`set_referrer`](../api/rest/exchange/account.md#set_referrer) binds by address, but only to an address that holds a code. A code needs trailing 30-day volume, not lifetime volume. The referee discount and the referrer share each stop at a cap on the referee's volume. See [the referral program](../concepts/fees.md#referrer-credit) |

### Copied `sendToEvmWithData` payloads {#send-to-evm-with-data-note}

The chain refuses a payload copied from HL without changes. `send_to_evm_with_data` keeps the HL
field names, so a direct copy is tempting. Do not do it. HL accepts and ignores three fields that
MTF refuses. You will hit the first one:

- **`source_dex` must be `0`.** An HL payload often carries `source_dex: 1`. MTF debits one
  ledger, the spot ledger. It refuses any other value, so that it never debits a ledger you did
  not name.
- **`to_perp` must be `false`.** The EVM side has no perp account to credit.
- **`destination_chain_id` must be `0` or the local EVM chain id.** The chain refuses any other
  value. This field is not a cross-chain lane. To leave the chain, use
  [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw).

Check two more things before you port it:

- **The action is live.** An earlier version of this page said that the network refused it, and
  told you to port to `core_evm_transfer`. That is no longer true.
- **It debits the spot ledger only.** It cannot move USDC held as perp collateral.
  [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer) can, and it is live
  now. It is therefore the better target for most ports.

Full rules: [`send_to_evm_with_data`](../api/rest/exchange/transfers.md#send_to_evm_with_data).

## Help {#getting-help}

- File an issue in this repository (`mtf-exchange/metaflux-knowledges`).
- For the wire-level reference, see [`POST /exchange`](../api/rest/exchange.md) and the
  [signing walkthrough](./signing.md).
