# `POST /exchange` — submit a signed action

{% hint style="info" %}
**Status.** **stable** for the listed action variants. Endpoint shape committed for V1.
{% endhint %}

## TL;DR

Every state-mutating user action — place order, cancel, transfer, vault deposit, agent approval, etc. — is a single EIP-712-signed JSON envelope sent to `POST /exchange`. The action variant is selected by the `type` field. `202 Accepted` means admitted to the mempool; commit confirmation comes through the [WS feed](../ws/subscriptions.md) or by polling.

## URL

```
POST  https://<node-or-gateway>/exchange
```

| Host | Path | Wire shape |
|------|------|-----------|
| Node directly (`:8080`) | `/exchange` | **MTF-native** (this document) |
| Gateway (`:8443`) | `/exchange` | **HL-compat** — see [hl-compat.md](./hl-compat.md) |
| Gateway (`:8443`) | `/native/exchange` | **MTF-native** (mirrors the node shape) |

## Request envelope

```json
{
  "sender":    "0x1234567890abcdef1234567890abcdef12345678",
  "signature": "0xabcd...1b",
  "action":    { /* one of the variants below */ },
  "nonce":     1735689600001
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sender` | hex string, 20 bytes (40 hex chars; `0x` prefix optional) | yes | The EVM-shape address whose state mutates. Not necessarily the signer — see [agent wallets](../../concepts/agent-wallets.md). |
| `signature` | hex string, 65 bytes (130 hex chars) | yes | secp256k1 ECDSA over the EIP-712 envelope. `r ‖ s ‖ v`. Both legacy `v ∈ {27, 28}` and EIP-2098 `v ∈ {0, 1}` accepted. |
| `action` | object | yes | A tagged variant. See [Action catalog](#action-catalog) below. |
| `nonce` | uint64 | yes | Strictly-monotonic per `sender`. Conventionally `Date.now()`. See [idempotency](../../integration/idempotency.md). |

## Signing

The 32-byte digest committed to is:

```
signed_hash = keccak256( 0x1901 ‖ domain_separator ‖ keccak256( msgpack(action_with_nonce) ) )
```

where `action_with_nonce` is the canonical action object with `nonce` folded in (the SDK handles this), and:

```
domain_separator = keccak256(
  keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") ‖
  keccak256("MetaFlux") ‖
  keccak256("1") ‖
  chainId_as_uint256_be ‖
  address_zero_padded_to_32
)
```

There is **no per-action `typeHash` step** — the digest goes from the msgpack payload straight through the EIP-712 envelope. See [signing walkthrough](../../integration/signing.md) for a working example.

### Chain IDs

| Network | `chainId` |
|---------|-----------|
| Devnet (default) | `31337` |
| Testnet | TBD |
| Mainnet | TBD pre-launch |

See [networks](../../networks.md) for endpoints. Signing against the wrong `chainId` returns `401` because the recovered address differs from the claimed sender.

## Numeric conventions

| Type | Wire form | Why |
|------|----------|-----|
| `uint64` ≤ 2^53 | JSON number | Safe in IEEE-754 |
| `uint64` > 2^53, `u128`, scaled `_e8` / `_e6` | JSON string | Native JSON numbers silently lose precision past 2^53 |
| Address | hex string `"0x..."` | 20 bytes, 40 hex chars (with or without `0x`) |
| Booleans | `true` / `false` | Literal JSON |
| Optional fields | `null` or omit | Both accepted; `null` is canonical |

**Scaled-integer fields** end in `_e8` (8-decimal fixed-point) or `_e6` (USDC base units). `price_e8 = "10050000000"` means `100.50`. Always send as a string; the server parses to `u128`.

## Signed-by semantics

Most actions can be signed by **either** the master account **or** an active [agent wallet](../../concepts/agent-wallets.md). A subset is **master-only** — agents are explicitly denied withdrawal authority and account-management privileges.

| Capability class | Master can sign? | Agent can sign? |
|------------------|:----------------:|:---------------:|
| Place / cancel / modify orders | yes | yes |
| Update leverage / margin mode | yes | yes |
| Vault deposit / withdraw | yes | yes |
| Sub-account create | yes | no |
| Sub-account transfer | yes | no |
| Agent approval / revocation | yes | no |
| External withdrawal (USDC, spot) | yes | no |
| Convert to multi-sig | yes | no |
| Multi-sig wrapper | (special — see [multi-sig](../../concepts/multi-sig.md)) | no |

Each action's entry in the [catalog](#action-catalog) lists its signed-by rule explicitly.

---

## Action catalog

Every variant uses the envelope `{ type, params }`. Click through for the field-level table.

### Order placement & lifecycle

| `type` | Purpose | Signed-by | Idempotent |
|--------|---------|-----------|-----------|
| [`Order`](#order) | Place one or many orders | master / agent | by `cloid` |
| [`Cancel`](#cancel) | Cancel by `oid` | master / agent | yes |
| [`CancelByCloid`](#cancelbycloid) | Cancel by client order id | master / agent | yes |
| [`ModifyOrder`](#modifyorder) | Cancel-replace at a new price/size | master / agent | by new `cloid` |
| [`BatchModify`](#batchmodify) | Many `ModifyOrder` atomically | master / agent | per-entry |
| [`ScaleOrder`](#scaleorder) | Place a price-laddered family | master / agent | per-leg `cloid` |
| [`TwapOrder`](#twaporder) | Schedule a time-weighted order | master / agent | by `twap_id` |
| [`TwapCancel`](#twapcancel) | Cancel a running TWAP | master / agent | yes |
| [`Trigger`](#trigger) | Stop-loss / take-profit | master / agent | by `cloid` |

### Margin & risk

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`UpdateLeverage`](#updateleverage) | Change leverage on an asset | master / agent |
| [`UpdateIsolatedMargin`](#updateisolatedmargin) | Set per-position margin and isolation | master / agent |
| [`UpdateMarginMode`](#updatemarginmode) | Cross / Isolated / Strict-Iso switch | master / agent |
| [`UserPortfolioMargin`](#userportfoliomargin) | Enable / disable PM | master only |

### Account management

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`ApproveAgent`](#approveagent) | Approve an agent wallet | master only |
| [`CreateSubAccount`](#createsubaccount) | Spawn a sub-account | master only |
| [`SubAccountTransfer`](#subaccounttransfer) | USDC master ↔ sub | master only |
| [`SubAccountSpotTransfer`](#subaccountspottransfer) | Spot master ↔ sub | master only |
| [`ConvertToMultiSigUser`](#converttomultisiguser) | Lift account to multi-sig | master only |
| [`MultiSig`](#multisig) | Wrap an inner action with N signatures | (see entry) |
| [`SetReferrer`](#setreferrer) | Bind to a referrer | master only |
| [`RegisterReferrer`](#registerreferrer) | Reserve a referrer code | master only |

### Transfers & withdrawals

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`UsdcTransfer`](#usdctransfer) | USDC to another MetaFlux account | master only |
| [`SpotTransfer`](#spottransfer) | Spot asset to another account | master only |
| [`WithdrawUsdc`](#withdrawusdc) | Off-chain withdraw via CCTP | master only |

### Auctions & exotic order types

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`RfqQuote`](#rfqquote) | Submit a quote to an open RFQ | master / agent |
| [`RfqAccept`](#rfqaccept) | Accept a received quote | master / agent |
| [`FbaOrder`](#fbaorder) | Order targeting a frequent-batch-auction market | master / agent |
| [`PriorityBid`](#prioritybid) | Pay for one-block priority placement | master / agent |

### Lending & governance

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`BorrowLend`](#borrowlend) | Borrow / repay against collateral | master only |
| [`AppHashVote`](#apphashvote) | Validator-only app-hash signal | validator key |

---

### `Order`

Place one or many orders atomically.

```json
{
  "type": "Order",
  "params": {
    "orders": [
      {
        "asset":        0,
        "side":         "Buy",
        "price_e8":     "10050000000",
        "size_e8":      "100000000",
        "tif":          "Gtc",
        "reduce_only":  false,
        "stp_mode":     "CancelNewest",
        "cloid":        "0x1234...0000",
        "trigger":      null
      }
    ],
    "grouping": "Na"
  }
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `orders[*].asset` | uint32 | `[0, market_count)` | Asset id; look up via `meta` info query |
| `orders[*].side` | enum | `"Buy"` / `"Sell"` | — |
| `orders[*].price_e8` | string `u128` | `> 0` | Limit price × 10^8 |
| `orders[*].size_e8` | string `u128` | `> 0` | Size × 10^8; market-step rounded down |
| `orders[*].tif` | enum | `"Gtc"`, `"Ioc"`, `"Alo"`, `"Fok"` | See [order types](../../concepts/order-types.md) |
| `orders[*].reduce_only` | bool | — | If true, rejected at admission if it would grow position |
| `orders[*].stp_mode` | enum | `"CancelNewest"`, `"CancelOldest"`, `"CancelBoth"`, `"DecrementAndCancel"`, `"None"` | Self-trade prevention; see [STP modes](../../concepts/order-types.md#self-trade-prevention) |
| `orders[*].cloid` | hex string 16 bytes \| null | — | Client order id, unique per account; enables `CancelByCloid` and dedup |
| `orders[*].trigger` | object \| null | — | If present: stop-loss / take-profit; see [`Trigger`](#trigger) |
| `grouping` | enum | `"Na"`, `"NormalTpsl"`, `"PositionTpsl"` | Order family grouping; see [order types](../../concepts/order-types.md#grouping) |

**Idempotency**: a duplicate `cloid` on the same account is rejected at admission with `error: "duplicate cloid"`. Use `cloid` as your client-side dedup key.

**Common errors**: `price_e8` not tick-aligned, `size_e8` below market minimum, `reduce_only` would grow position, `stp_mode` rejected via STP, account in T1+ liquidation tier.

**Response status entries** (per order, in order):

```json
{"resting": {"oid": 12345, "cloid": "0x..."}}      // posted to book
{"filled":  {"total_sz_e8": "100000000", "avg_px_e8": "10050000000", "oid": 12345}}
{"error":   "<reason>"}                             // admission rejected this entry only
```

---

### `Cancel`

Cancel one or many orders by oid.

```json
{
  "type": "Cancel",
  "params": {
    "cancels": [
      { "asset": 0, "oid": 12345 }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cancels[*].asset` | uint32 | Asset id |
| `cancels[*].oid` | uint64 | The order id returned in the `Order` response |

**Idempotent**: cancel of an already-cancelled / already-filled order returns `{"error":"order not found"}` and is harmless.

---

### `CancelByCloid`

Cancel by client order id. Useful when the caller hasn't seen the server-side `oid` yet (race between `Order` response and a cancellation decision).

```json
{
  "type": "CancelByCloid",
  "params": {
    "cancels": [
      { "asset": 0, "cloid": "0x1234...0000" }
    ]
  }
}
```

Same response shape as `Cancel`.

---

### `ModifyOrder`

Atomic cancel-replace. Server-side it's a single state transition; if the cancel of the old order fails the new one is not placed.

```json
{
  "type": "ModifyOrder",
  "params": {
    "oid":           12345,
    "asset":         0,
    "side":          "Buy",
    "price_e8":      "10049000000",
    "size_e8":       "100000000",
    "tif":           "Gtc",
    "reduce_only":   false,
    "stp_mode":      "CancelNewest",
    "cloid":         "0x...new"
  }
}
```

The `cloid` of the new order MUST differ from the old one (use a fresh value). Returns the same per-order status union as `Order`.

---

### `BatchModify`

Apply many `ModifyOrder`s atomically.

```json
{
  "type": "BatchModify",
  "params": {
    "modifies": [ /* each entry has the same shape as ModifyOrder.params */ ]
  }
}
```

Atomicity: all-or-nothing within the same block. If any entry would fail at admission (e.g. unknown `oid`), the entire batch is rejected.

---

### `ScaleOrder`

Place a ladder of limit orders between `start_price_e8` and `end_price_e8` in `n_levels` steps.

```json
{
  "type": "ScaleOrder",
  "params": {
    "asset":           0,
    "side":            "Buy",
    "total_size_e8":   "1000000000",
    "start_price_e8":  "9900000000",
    "end_price_e8":    "9800000000",
    "n_levels":        10,
    "shape":           "Flat",
    "tif":             "Gtc",
    "reduce_only":     false,
    "cloid_prefix":    "0x1234"
  }
}
```

| Field | Description |
|-------|-------------|
| `total_size_e8` | Total size distributed across legs |
| `n_levels` | Number of price levels (`[2, 50]`) |
| `shape` | `"Flat"` (equal size per leg), `"Linear"` (linear distribution), `"Geometric"` (geometric) |
| `cloid_prefix` | 8 bytes; legs auto-extend to full 16-byte `cloid` with leg index |

Returns an array of per-leg statuses.

---

### `TwapOrder`

Schedule a time-weighted average price order. Slices into the book over `duration_ms`.

```json
{
  "type": "TwapOrder",
  "params": {
    "asset":          0,
    "side":           "Buy",
    "size_e8":        "1000000000",
    "duration_ms":    3600000,
    "randomize_pct":  20,
    "reduce_only":    false,
    "twap_id":        "0x..."
  }
}
```

| Field | Range | Description |
|-------|-------|-------------|
| `duration_ms` | `[60_000, 86_400_000]` | 1 min to 24 h |
| `randomize_pct` | `[0, 50]` | Slice-time jitter as % of slice interval |
| `twap_id` | hex 16 bytes | Client TWAP id; idempotency + `TwapCancel` handle |

Admission returns `{"twap_id":"0x..."}`. Slice events stream on the [`twapEvents` WS channel](../ws/subscriptions.md#twapevents).

---

### `TwapCancel`

```json
{
  "type": "TwapCancel",
  "params": { "twap_id": "0x..." }
}
```

Cancels a running TWAP. Already-filled slices stay filled; future slices stop.

---

### `Trigger`

Place a stop-loss or take-profit. Resting orders that arm on a mark-price trigger.

```json
{
  "type": "Trigger",
  "params": {
    "asset":        0,
    "side":         "Sell",
    "size_e8":      "100000000",
    "trigger_px_e8":"9500000000",
    "limit_px_e8":  "9450000000",
    "trigger_kind": "StopLoss",
    "reduce_only":  true,
    "cloid":        "0x..."
  }
}
```

| Field | Description |
|-------|-------------|
| `trigger_kind` | `"StopLoss"`, `"TakeProfit"`, `"StopLimit"`, `"TakeProfitLimit"` |
| `limit_px_e8` | If `null`: market order on trigger. Otherwise: limit order at this price |

See [order types — triggers](../../concepts/order-types.md#triggers) for the firing semantics.

---

### `UpdateLeverage`

```json
{
  "type": "UpdateLeverage",
  "params": { "asset": 0, "leverage": 20 }
}
```

| Field | Range | Description |
|-------|-------|-------------|
| `leverage` | `[1, max_leverage_for_asset]` | Per-asset cap is in the `meta` info query |

Rejected if applying the new leverage would drop the account to T1 or worse on the spot.

---

### `UpdateIsolatedMargin`

```json
{
  "type": "UpdateIsolatedMargin",
  "params": {
    "asset":            0,
    "is_isolated":      true,
    "isolated_amount_e6": "1000000000"
  }
}
```

Toggles isolated margin per asset and, when isolating, deposits `isolated_amount_e6` of USDC into the isolated bucket.

---

### `UpdateMarginMode`

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 0, "mode": "Cross" }
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `mode` | `"Cross"`, `"Isolated"`, `"StrictIso"` | See [margin modes](../../concepts/margin-modes.md) |

Switching from `Isolated` → `Cross` releases the isolated bucket; switching the other way withdraws from cross and earmarks. Transition is rejected if it would change the account's tier.

---

### `UserPortfolioMargin`

```json
{
  "type": "UserPortfolioMargin",
  "params": { "enabled": true }
}
```

Master-only. Requires account equity ≥ `pm_min_equity` (governance parameter, default 100 000 USDC). See [portfolio margin](../../concepts/portfolio-margin.md).

---

### `ApproveAgent`

Master-only. See [agent wallets](../../concepts/agent-wallets.md) for the full lifecycle.

```json
{
  "type": "ApproveAgent",
  "params": {
    "agent":          "0xaaaa...",
    "expires_at_ms":  1735689600000,
    "name":           "trading-bot-1"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agent` | address | 20-byte EVM address of the agent's signing key |
| `expires_at_ms` | uint64 \| null | Unix-ms expiry; `null` = no expiry |
| `name` | string ≤ 64 chars | Bookkeeping label |

Becomes effective **one block after commit**. Submitting an agent-signed action before then returns `401`.

---

### `CreateSubAccount`

```json
{
  "type": "CreateSubAccount",
  "params": { "name": "scalping-desk", "explicit_index": null }
}
```

Master-only. Spawns a sub. Cap of 32 subs per master. See [sub-accounts](../../concepts/sub-accounts.md).

---

### `SubAccountTransfer`

```json
{
  "type": "SubAccountTransfer",
  "params": {
    "sub_index": 0,
    "deposit":   true,
    "amount_e6": "1000000000"
  }
}
```

`deposit: true` is master → sub; `false` is sub → master. Amount in USDC base units (6 decimals).

---

### `SubAccountSpotTransfer`

Same shape as `SubAccountTransfer` but moves spot-asset balances; add `asset: <spot_asset_id>`.

---

### `ConvertToMultiSigUser`

```json
{
  "type": "ConvertToMultiSigUser",
  "params": {
    "threshold": 2,
    "signers": [
      "0x...1", "0x...2", "0x...3"
    ]
  }
}
```

Master-only and **irreversible** (the master key is replaced by the multi-sig set). See [multi-sig](../../concepts/multi-sig.md).

---

### `MultiSig`

Wraps an inner action with N signatures from the multi-sig set.

```json
{
  "type": "MultiSig",
  "params": {
    "inner_action": { /* any other action object */ },
    "signatures":   [
      { "signer": "0x...1", "signature": "0x..." },
      { "signer": "0x...2", "signature": "0x..." }
    ],
    "nonce":        1735689600099
  }
}
```

The outer envelope's `sender` is the multi-sig account address. Outer `signature` is by any single member; inner `signatures` must meet `threshold` distinct members. See [multi-sig](../../concepts/multi-sig.md) for full semantics.

---

### `UsdcTransfer`

```json
{
  "type": "UsdcTransfer",
  "params": {
    "to":        "0x<recipient_addr>",
    "amount_e6": "5000000"
  }
}
```

Internal MetaFlux transfer (no bridge). Master-only.

---

### `SpotTransfer`

```json
{
  "type": "SpotTransfer",
  "params": {
    "to":       "0x<recipient>",
    "asset":    7,
    "amount_e8":"100000000"
  }
}
```

---

### `WithdrawUsdc`

```json
{
  "type": "WithdrawUsdc",
  "params": {
    "amount_e6":         "100000000",
    "destination_chain": "Arbitrum",
    "destination_addr":  "0x..."
  }
}
```

Initiates a CCTP burn on MetaFlux; finalised on the destination chain by submitting the Circle attestation. See [bridge](../../bridge/) for the flow.

| `destination_chain` | Notes |
|---------------------|-------|
| `"Ethereum"`, `"Arbitrum"`, `"Base"`, `"OpMainnet"`, `"Avalanche"` | All CCTP-supported chains |

---

### `RfqQuote`

```json
{
  "type": "RfqQuote",
  "params": {
    "rfq_id":     "0x...",
    "price_e8":   "10050000000",
    "size_e8":    "1000000000",
    "expires_at_ms": 1735690000000
  }
}
```

See [RFQ](../../concepts/rfq.md).

---

### `RfqAccept`

```json
{
  "type": "RfqAccept",
  "params": { "rfq_id": "0x...", "quote_id": "0x..." }
}
```

---

### `FbaOrder`

```json
{
  "type": "FbaOrder",
  "params": {
    "asset":    42,
    "side":     "Buy",
    "price_e8": "10050000000",
    "size_e8":  "100000000",
    "batch_id": 9876,
    "cloid":    "0x..."
  }
}
```

See [FBA](../../concepts/fba.md). `batch_id` selects which auction the order joins; orders submitted past the batch-close block are rejected.

---

### `PriorityBid`

```json
{
  "type": "PriorityBid",
  "params": {
    "bid_e6":        "500",
    "inner_action":  { /* an Order action object */ }
  }
}
```

Pays `bid_e6` USDC for one-block priority of the inner action. Highest bid per asset wins the front of the block; ties broken by `nonce`.

---

### `BorrowLend`

```json
{
  "type": "BorrowLend",
  "params": {
    "asset":     "USDC",
    "side":      "Borrow",
    "amount_e6": "1000000"
  }
}
```

Master-only. `side`: `"Borrow"` / `"Repay"` / `"Supply"` / `"Withdraw"`.

---

### `SetReferrer`

```json
{
  "type": "SetReferrer",
  "params": { "code": "FRIEND2026" }
}
```

Settable **once** per account; subsequent attempts return `{"error":"referrer already set"}`.

---

### `RegisterReferrer`

```json
{
  "type": "RegisterReferrer",
  "params": { "code": "MYCODE" }
}
```

Codes are first-come-first-served; `[A-Z0-9]{4,16}`.

---

### `AppHashVote`

Validator-only. Used in the consensus voting layer. Ordinary clients never emit this.

---

## Response

### `202 Accepted` — admitted

```json
{
  "accepted":      true,
  "mempool_depth": 3,
  "nonce":         1735689600001,
  "action_hash":   "0x<keccak256_of_msgpack_action>"
}
```

`mempool_depth` is informational at admission time. `action_hash` is the deterministic identifier you can match against commit events.

### `400 Bad Request` — malformed

| `error` value | Cause | Remediation |
|---------------|-------|-------------|
| `sender: expected 40 hex chars, got N` | Address length wrong | Drop `0x`, count hex chars |
| `signature: expected 130 hex chars, got N` | Forgot the recovery byte (`v`) | Append `v` (27/28 or 0/1) |
| `unknown action variant: <X>` | Misspelled `type` | Check the catalog above |
| `missing field: params.<X>` | Required field omitted | Check the variant's table |
| `invalid msgpack` | Action serialisation error | Use a standards-compliant msgpack lib with default options |
| `nonce must increase` | Reused or out-of-order nonce | Use `Date.now()` or a monotonic counter |
| `duplicate cloid` | `Order`/`ModifyOrder` reused a client order id | Use a fresh `cloid` |

### `401 Unauthorized` — signature failed

| `error` value | Cause |
|---------------|-------|
| `signer is not the sender and not an approved agent` | Recovered address ≠ sender AND not in sender's agent set |
| `agent expired` | Recovered address is an agent of sender, but `expires_at_ms` has passed |
| `unknown chainId` | Domain separator built with the wrong chainId — recovers a phantom address |
| `agent not yet effective` | `ApproveAgent` is still in propagation (wait one block) |

### `429 Too Many Requests` — rate-limited

```json
{ "error": "rate limit exceeded", "retry_after_ms": 1200 }
```

See [rate limits](../rate-limits.md).

### `503 Service Unavailable` — mempool full

```json
{ "error": "mempool at capacity", "retry_after_ms": 200 }
```

Back off and retry. Sustained 503 indicates network congestion; bidirectional WS keep-alive will reflect this.

---

## Admission ≠ commit

`202` means accepted to the mempool. It does **not** mean:

- Included in a block (admitted actions can be evicted on cap pressure before the next leader proposes).
- Succeeded at the state machine (e.g. an order with reduce-only-violation passes admission but errors at commit).

```
       ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ /exchange│──►│ mempool  │──►│ proposed │──►│ committed│
       │  (202)   │   │  (FIFO)  │   │ in block │   │   state  │
       └──────────┘   └──────────┘   └──────────┘   └──────────┘
                            │              │              │
                            ▼              ▼              ▼
                       may be evicted  may fail at    appears in /info
                       under cap       state machine  and WS feeds
```

Track commit status via the [WS feed](../ws/subscriptions.md) (`orderEvents` / `userEvents`) or poll `/info` for `openOrders` / `userFills`. The `action_hash` returned at admission appears unchanged in commit events.

## Sequence diagram — place an order and see it on the book

```
client                gateway                 node                  consensus
  │                     │                       │                       │
  │ POST /exchange      │                       │                       │
  │ {sig, action=Order} │                       │                       │
  ├────────────────────►│                       │                       │
  │                     │ forward (mTLS, gRPC)  │                       │
  │                     ├──────────────────────►│                       │
  │                     │                       │ verify sig            │
  │                     │                       │ check agent set       │
  │                     │                       │ admit to mempool      │
  │                     │ 202 Accepted          │                       │
  │ ◄───────────────────┤◄──────────────────────┤                       │
  │                     │                       │ leader proposes block │
  │                     │                       ├──────────────────────►│
  │                     │                       │                       │ 2-chain commit
  │                     │                       │◄──────────────────────┤
  │                     │                       │ apply order to book   │
  │ WS orderEvents      │                       │                       │
  │ ◄───────────────────┤◄──────────────────────┤                       │
  │ {resting, oid:...}  │                       │                       │
```

## Edge cases

- **Race between `ApproveAgent` and first agent-signed order.** Submit `ApproveAgent`, await `orderEvents`/commit, then start agent traffic. Or, accept that the first 1–2 requests will `401` and retry with linear backoff for ≤2 blocks (~200 ms).
- **Cancel arrives after fill commits.** Returns `"order not found"`. Harmless. Watch fills first if accuracy matters.
- **Order admits but fails at commit** (e.g. reduce-only violation discovered post-admit because of intervening fills). The commit event carries `{"error":"<reason>"}`; the order is not on the book.
- **Numeric overflow on `_e8`.** Anything fitting in `u128` is accepted. The server rejects with `400 invalid numeric` if your encoded string exceeds `2^128 - 1`.
- **Empty `orders[]` / `cancels[]`.** Rejected at admission with `400 empty batch`.
- **Cross-block atomicity.** `Order` with multiple legs is **block-atomic** — all legs see the same begin-block state. They are NOT cross-block atomic (a second `Order` action in a later block sees the result of the first).

## See also

- [`POST /info`](./info.md) — read path (MTF-native)
- [HL-compat `/exchange`](./hl-compat.md#exchange) — alternative wire shape for HL clients
- [Agent wallets](../../concepts/agent-wallets.md)
- [Signing walkthrough](../../integration/signing.md)
- [Order types](../../concepts/order-types.md)
- [Idempotency](../../integration/idempotency.md)
- [Errors](../errors.md)
- [Rate limits](../rate-limits.md)

## FAQ

**Q: Why msgpack instead of EIP-712 typed-data for the inner action?**
A: EIP-712 typed-data needs one `typeHash` per action variant. With ~30 action types and a growing surface, that's a maintenance burden on every SDK. msgpack gives one canonical encoder for the whole surface; the EIP-712 envelope (domain + 0x1901 + payload-hash) is preserved so wallet integrations (MetaMask, Rabby, Ledger) still see a clean signed-data prompt.

**Q: Can I batch unrelated actions in one request?**
A: No. Each request is one `action`. For multi-order batching use `Order` with `orders: []`, for multi-cancel use `Cancel` with `cancels: []`, and so on. Use `MultiSig` only for the threshold-signing case.

**Q: What's the smallest possible request?**
A: A cancel of a single oid: ~250 bytes including the 65-byte signature and 40-char sender. Most orders are 350–500 bytes.

**Q: How do I deal with `429`?**
A: Linear backoff with `retry_after_ms`. Order-flow bots should pre-emptively rate-limit on the client side to stay below `per_account_qps` — see [rate limits](../rate-limits.md).

**Q: Does `nonce` need to be a timestamp?**
A: No. It needs to be strictly increasing per `sender`. Convention is `Date.now()` because that's monotonic and human-readable in logs, but any monotonic uint64 works.
