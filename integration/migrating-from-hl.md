# Migrating from Hyperliquid

{% hint style="info" %}
**Preview.** The HL-compat surface covers `POST /info` (15 query types) and `POST /exchange` (order + cancel today, more action types over time).
{% endhint %}

If your bot already speaks Hyperliquid's protocol, you can point it at MetaFlux with **no code change** for the covered surface — same URL shapes, same request/response JSON, same EIP-712 envelope.

## What works out of the box

- `POST /info` for: `meta`, `allMids`, `userState`, `clearinghouseState`, `openOrders`, `frontendOpenOrders`, `userFills`, `historicalOrders`, `metaAndAssetCtxs`, `l2Book`, `vaultDetails`, `delegations`, `userFees`, `subAccounts`, `referral`
- `POST /exchange` for: `order` (place limit / IOC / ALO), `cancel` (cancel by OID)
- WS subscriptions (coming) will use the same channel names as HL

## What's different

### 1. Chain ID

MetaFlux is its own L1, not an HL deployment. Sign against the MetaFlux chain ID, **not** HL's:

| Network | HL `chainId` | MTF `chainId` |
|---------|--------------|---------------|
| Mainnet | 1337 | TBD |
| Testnet | 998 | TBD |
| Devnet / local | 1337 | **31337** |

Update one constant in your signing code and the rest of the EIP-712 envelope is identical. The MTF domain uses `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`.

### 2. Base URL

```
HL:  https://api.hyperliquid.xyz/{info,exchange}
MTF: https://gateway.<your-deployment>/{info,exchange}
```

Devnet runs the gateway on port `8443` and the bare node on `8080`. The gateway is the HL-compat entry point; node port is MTF-native only.

### 3. Action types not yet on the compat layer

If your bot uses HL actions beyond `order` / `cancel`, the gateway today returns:

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

at HTTP 200. The HL convention is errors are 200s with `status: "err"`, which MTF preserves.

The full HL action coverage rolls out in subsequent releases. For new actions you'd rather have today, use the [MTF-native action surface](../api/rest/exchange.md) directly — it has full feature coverage including features HL doesn't have (RFQ, FBA, portfolio margin enrollment, cross-chain primitives).

### 4. Asset IDs

HL and MTF both use integer asset IDs but **the integers are not the same**. `0` on HL is BTC perp; `0` on MTF might be ETH or anything else depending on the deployment. Always look up your asset IDs via `POST /info { "type": "meta" }` at startup; never hard-code.

### 5. Numeric precision

Both chains use scaled integers (e.g. `px`) and represent them as strings in JSON because IEEE-754 loses precision past 2^53. If your bot is doing JSON parsing with default JS `JSON.parse`, switch to a big-int aware parser for these fields — the wire shape is the same as HL but the failure mode (silent precision loss) is the same too.

### 6. Liquidation behaviour

MetaFlux adds a [T0 yellow card grace tier](../concepts/tiered-liquidation.md) that HL does not have. Practical effect: at health `[1.0, 1.1)` your account's resting ALO orders get force-cancelled and a warning event is emitted, but positions are not touched. Then T1 / T2 / T3 behave like HL's Partial / Market / Backstop.

If your bot listens for liquidation events to trigger margin top-ups, **add a handler for the new T0 event** — that's the early-warning signal HL doesn't give you. Catching it gives you one block of grace to act.

### 7. Agent wallet semantics

HL: an agent is a key with no withdrawal authority. Same on MTF — see [agent wallets](../concepts/agent-wallets.md). The action name is `ApproveAgent`; the wire shape mirrors HL's. The one mechanical difference: MTF's agent approval becomes effective **one block after commit**, vs HL's typically two-block latency. Slightly faster; same warm-up dance.

### 8. Vaults

HL vaults and MetaFlux vaults are not the same product. `vaultDetails` returns information about MTF's own vault types (MFlux Vault, user vaults). HL vault addresses won't resolve. The query shape is the same; just expect MTF entities, not HL ones.

## Step-by-step migration

### Day 0 — point at MetaFlux

1. Change base URL in your client config.
2. Change `chainId` constant in your signer.
3. Run your existing test suite against MTF devnet. `order` / `cancel` / all `info` queries should pass with no code change.

### Day 1 — handle the action surface gap

For HL actions not yet on the MTF compat layer:

- **Modify orders** — for now, cancel + re-submit. The `modify` action lands in a subsequent compat update.
- **Set leverage / margin mode** — use the MTF-native action via `POST /exchange` against the node (`UpdateLeverage`, `UpdateIsolatedMargin`). Same EIP-712 envelope; different action variant name.
- **Transfer / withdraw** — MTF-native.

### Day 2 — wire the new signals

- Subscribe to `subAccounts` info if you operate sub-accounts (semantics differ slightly — MTF allows up to 32 subs per master).
- Add a handler for T0 yellow-card events. Easiest place is the same fill / liquidation feed you already consume; the event shape is `{ "type": "yellowCard", "user": "0x...", "block": N }`.
- If you depend on portfolio margin: re-enroll on MTF (`UserPortfolioMargin { enabled: true }`). The threshold and scenario set are network parameters — see [portfolio margin](../concepts/portfolio-margin.md).

### Day 3+ — adopt MTF-only features

Optional. If you want to use features HL doesn't have:

- **RFQ** — request-for-quote primitives, useful for size that doesn't want to advertise on the book
- **FBA** — frequent batch auction matching for designated markets, reduces MEV
- **Cross-chain primitives** — bridge primitives natively callable from EVM contracts

These are MTF-native actions only and require talking to the gateway's MTF-native surface or the node directly.

## Top 5 HL bot patterns — concrete migration

### 1. Simple limit-order MM (the canonical pattern)

```diff
- const HL_URL = 'https://api.hyperliquid.xyz';
+ const MTF_URL = 'https://gateway.mtf.exchange';

- const HL_CHAIN_ID = 1337;
+ const MTF_CHAIN_ID = 31337;     // devnet; production TBD

- const HL_DOMAIN_NAME = 'HyperliquidSignTransaction';   // varies by mode
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

Switching `chainId` + base URL is ~5 minutes of work for a typical client.

### 2. Liquidation-watching bot (margin-top-up)

HL emits `liquidation` events when accounts hit the partial / market tier. MTF adds **`yellowCard`** as the earliest signal.

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

See [risk-watcher](./risk-watcher.md) for the full pattern.

### 3. Funding-rate arb bot

Funding cadence is similar (HL is hourly; MTF is hourly by default but configurable per market). Formula structure is identical.

```diff
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

MTF's oracle composition is published per-market (`market_info.oracle_sources`) — if your arb depends on specific oracle providers, verify the source list matches your expectation. See [mark prices](../concepts/mark-prices.md).

### 4. Multi-account / institutional setup

HL: master + agents per host. MTF: same, plus first-class **multi-sig accounts**.

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

See [multi-sig](../concepts/multi-sig.md).

### 5. Sub-account portfolio manager

HL sub-accounts: up to 8. MTF: up to 32. The wire shape matches:

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

Per-sub agent management, per-sub PM enrollment, per-sub margin modes are all supported identically.

## Reference table

| Action you used on HL | Status on MTF |
|----------------------|---------------|
| `order` (place limit / IOC / ALO) | ✅ HL-compat shape supported |
| `cancel` (by OID) | ✅ HL-compat shape supported |
| `cancelByCloid` | rolling out |
| `modify` | rolling out |
| `batchModify` | rolling out |
| `usdSend` / spot transfers | use MTF-native |
| `withdraw3` | use MTF-native |
| `approveAgent` | MTF-native shape; see [agent wallets](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | MTF-native shape |
| `usdClassTransfer` | use MTF-native equivalent |
| `convertToMultiSigUser` | MTF-native, preview |
| `setReferrer` / `createReferral` | MTF-native; semantics may differ |

(The table updates as compat-layer support grows.)

## Getting help

- This repo (`mtf-exchange/metaflux-knowledges`) — file an issue
- See [`POST /exchange`](../api/rest/exchange.md) and [signing walkthrough](./signing.md) for the wire-level reference
