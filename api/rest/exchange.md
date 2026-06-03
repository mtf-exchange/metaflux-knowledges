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
  "signature": "0xabcd...1b",
  "nonce":     1735689600001,
  "action": {
    "type": "submit_order",
    "order": { /* one of the variants below */ }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | hex string, 65 bytes (130 hex chars; `0x` optional) | yes | secp256k1 ECDSA over the EIP-712 digest of the **exact `action` bytes** + `nonce`. `r ‖ s ‖ v`. Both legacy `v ∈ {27, 28}` and EIP-2098 `v ∈ {0, 1}` accepted. |
| `nonce` | uint64 | yes | Strictly-monotonic per actor. Conventionally `Date.now()`. Bound into the signed digest. See [idempotency](../../integration/idempotency.md). |
| `action` | object | yes | A tagged variant: `{ "type": "<snake_case_tag>", ... }`. See [Action catalog](#action-catalog) below. |

{% hint style="info" %}
**No top-level `sender`.** The envelope carries no `sender` field. The account
whose state mutates is determined per action:
- **Owner-claiming actions** (`submit_order`, `cancel_order`) carry the owner
  *inside* the action body — `action.order.owner` / `action.cancel.owner`. The
  server recovers the signer from the signature and requires it to equal that
  `owner` **or** an approved [agent](../../concepts/agent-wallets.md) of it.
- **Sender-authorized actions** (governance, margin, vault-leader, staking, …)
  carry **no** owner field at all: the recovered signer *is* the actor, and
  action-level authorization (validator membership, vault-leader, etc.) runs at
  dispatch.
{% endhint %}

The `action` is verified over the **exact bytes sent** — the server never
re-serializes it. Send the `action` field byte-for-byte as it was signed (do not
reorder keys or change whitespace after signing), or recovery yields a different
signer and the request is rejected `401`.

## Signing

The signature is a secp256k1 ECDSA recovery over a standard EIP-712 digest whose
**struct hash** binds the raw JSON `action` bytes and the `nonce`:

```
type_hash   = keccak256("MetaFluxAction(string action,uint64 nonce)")
struct_hash = keccak256( type_hash ‖ keccak256(action_json) ‖ uint256_be(nonce) )
signed_hash = keccak256( 0x1901 ‖ domain_separator ‖ struct_hash )
```

where `action_json` is the **exact UTF-8 bytes of the `action` object** the
client signs and sends (the server hashes the raw received bytes, not a
re-serialization), and:

```
domain_separator = keccak256(
  keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") ‖
  keccak256("MetaFlux") ‖
  keccak256("1") ‖
  chainId_as_uint256_be ‖
  address_zero_padded_to_32
)
```

The `action` body is treated as a single EIP-712 `string` field — there is **no
per-action `typeHash`**. One canonical encoder (`MetaFluxAction(string
action,uint64 nonce)`) covers the whole action surface, so adding a new action
variant never adds a signing primitive. See [signing
walkthrough](../../integration/signing.md) for a working example; the
cross-implementation KAT in the node + Rust SDK pins this digest.

### Chain IDs

| Network | `chainId` |
|---------|-----------|
| Devnet (default) | `31337` |
| Testnet | TBD |
| Mainnet | TBD pre-launch |

See [networks](../../networks.md) for endpoints. Signing against the wrong `chainId` returns `401` because the recovered address differs from the action's `owner` (or, for sender-authorized actions, recovers a phantom address that passes no authorization check).

## Numeric conventions

| Type | Wire form | Why |
|------|----------|-----|
| `uint64` ≤ 2^53 | JSON number | Safe in IEEE-754 |
| `uint64` > 2^53, `u128`, scaled integers | JSON string | Native JSON numbers silently lose precision past 2^53 |
| Address | hex string `"0x..."` | 20 bytes, 40 hex chars (with or without `0x`) |
| Booleans | `true` / `false` | Literal JSON |
| Optional fields | `null` or omit | Both accepted; `null` is canonical |

**Fixed-point fields.** Price and size fields are 8-decimal fixed-point integers; USDC amounts are 6-decimal base units. The value carries the scale, not the field name — e.g. `px = "10050000000"` means `100.50`. Always send as a string; the server parses to `u128`.

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

Each variant is a tagged object `{ "type": "<snake_case_tag>", <flat body> }`. The
body keys are **flat under the action object** (there is no PascalCase `type` and
no universal `params` wrapper) — e.g. `submit_order` carries an `order` object,
`cancel_order` carries a `cancel` object, and the sender-authorized actions carry
a `params` object. Click through for the field-level table.

{% hint style="warning" %}
**`px` / `size` are unsigned fixed-point `u64` on the native wire**, sent as JSON
numbers (the node decodes them as `u64`, then widens internally). This differs
from the HL-compat path (decimal strings). Addresses are `0x`-hex (40 chars);
`cloid` is `0x` + 32 hex chars (16 bytes).
{% endhint %}

### Order placement & lifecycle

| `type` | Purpose | Signed-by | Idempotent |
|--------|---------|-----------|-----------|
| [`submit_order`](#submit_order) | Place one order | owner / agent | by `cloid` |
| [`batch_order`](#batch_order) | N orders / one signature | owner / agent | per-leg `cloid` |
| [`cancel_order`](#cancel_order) | Cancel by `oid` | owner / agent | yes |
| [`batch_cancel`](#batch_cancel) | N cancels / one signature | owner / agent | yes |
| [`cancel_by_cloid`](#cancel_by_cloid) | Cancel by client order id | sender / agent | yes |
| [`cancel_all_orders`](#cancel_all_orders) | Cancel all (optional asset filter) | sender / agent | yes |
| [`modify`](#modify) | Amend a resting order's px / size | sender / agent | yes |
| [`batch_modify`](#batch_modify) | N modifies / one signature | sender / agent | per-entry |
| [`schedule_cancel`](#schedule_cancel) | Future-block cancel-all trigger | sender / agent | yes |
| [`twap_order`](#twap_order) | Schedule a sliced (TWAP) order | sender / agent | by `twap_id` |
| [`twap_cancel`](#twap_cancel) | Cancel a running TWAP parent | sender / agent | yes |

### Margin & risk

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`update_leverage`](#update_leverage) | Change leverage / iso toggle on an asset | sender / agent |
| [`update_isolated_margin`](#update_isolated_margin) | Signed isolated-margin delta | sender / agent |
| [`top_up_isolated_only_margin`](#top_up_isolated_only_margin) | Strict-iso margin top-up | sender / agent |
| [`user_portfolio_margin`](#user_portfolio_margin) | Enroll / unenroll PM | sender / agent |

### Account management

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`approve_agent`](#approve_agent) | Approve an agent wallet | sender / agent |
| [`set_display_name`](#set_display_name) | Set the account handle | sender / agent |
| [`set_referrer`](#set_referrer) | Bind to a referrer address | sender / agent |
| [`approve_builder_fee`](#approve_builder_fee) | Approve a builder fee ceiling | sender / agent |
| [`convert_to_multi_sig_user`](#convert_to_multi_sig_user) | Lift account to multi-sig | sender / agent |

### Staking & abstraction

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`token_delegate`](#token_delegate) | Delegate / undelegate stake | sender / agent |
| [`claim_rewards`](#claim_rewards) | Claim staking rewards | sender / agent |
| [`link_staking_user`](#link_staking_user) | Alias a staking target | sender / agent |
| [`user_dex_abstraction`](#user_dex_abstraction) | Toggle the user DEX-abstraction flag | sender / agent |
| [`user_set_abstraction`](#user_set_abstraction) | Self-scope abstraction config | sender / agent |
| [`agent_set_abstraction`](#agent_set_abstraction) | Agent-scope abstraction config | sender / agent |
| [`priority_bid`](#priority_bid) | Pay a priority fee for block-front placement | sender / agent |

### Encrypted orders

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`submit_encrypted_order`](#submit_encrypted_order) | Threshold-encrypted order ciphertext | sender / agent |

### Vaults & Metaliquidity

| `type` | Purpose | Signed-by |
|--------|---------|-----------|
| [`create_vault`](#create_vault) | Leader creates a vault | sender / agent |
| [`vault_transfer`](#vault_transfer) | Leader seed transfer | sender / agent |
| [`vault_modify`](#vault_modify) | Leader-only vault config update | sender / agent |
| [`vault_withdraw`](#vault_withdraw) | Follower share redemption | sender / agent |
| [`REDACTED`](#REDACTED) | MLP whitelist vote | validator key |
| [`REDACTED`](#REDACTED) | Register / revoke a strategy operator | vault leader |

### Not on the public `/exchange` path

These action names appear in earlier drafts (and some in the HL-compat surface),
but they are **not bridged on the MTF-native `/exchange` handler**. They are
either privileged / system writes that must never transit the public user path,
or recognized-but-unmapped schema stubs. Posting them returns
`400 unsupported action`. See [the table below](#non-bridged-actions) for the
disposition of each.

| Draft name | Native tag (if recognized) | Why not bridged |
|-----------|----------------------------|-----------------|
| `ScaleOrder` | — | No native action; ladder client-side into `batch_order` |
| `Trigger` | (via `submit_order.kind`) | `stop_loss` / `take_profit` kinds reject — trigger wiring not present |
| `UpdateMarginMode` | — | No native action; isolation is the `is_isolated` flag on `update_leverage` |
| `CreateSubAccount` / `SubAccountTransfer` / `SubAccountSpotTransfer` | — | Sub-account flows not bridged |
| `MultiSig` | — | Multi-sig wrapper not bridged (the account is converted via `convert_to_multi_sig_user`) |
| `RegisterReferrer` | — | Not bridged (referrer is bound by address via `set_referrer`) |
| `UsdcTransfer` / `SpotTransfer` / `WithdrawUsdc` | — | Transfers / withdrawals are not on the public user `/exchange` path |
| `BorrowLend` | — | Not bridged |
| `REDACTED` | — | Validator/system action; goes via the consensus path, never `/exchange` |
| `RfqQuote` / `RfqAccept` | `rfq_request` / `rfq_accept` | Recognized-but-unmapped stub → `unsupported action` |
| `FbaOrder` | `fba_submit` | Recognized-but-unmapped stub → `unsupported action` |
| (vault distribute) | `vault_distribute` | Partial/stub handler; not bridged on `/exchange` |
| (PM lifecycle) | `pm_enroll` / `pm_unenroll` / `pm_rebalance` | Recognized-but-unmapped stub → `unsupported action` |
| (cross-chain) | `cross_chain_send` | Recognized-but-unmapped stub → `unsupported action` |
| (encrypted submit alt) | `encrypted_order_submit` | Stub; use [`submit_encrypted_order`](#submit_encrypted_order) instead |

---

### `submit_order`

Place a single order. The order body is carried under `action.order`; `owner` is
the claimed account (the server requires the recovered signer to equal it or be an
approved agent). To place many orders under one signature, use
[`batch_order`](#batch_order).

```json
{
  "type": "submit_order",
  "order": {
    "owner":       "0x00000000000000000000000000000000000000aa",
    "market":       7,
    "side":         "bid",
    "kind":         "limit",
    "size":         100000000,
    "limit_px":     10050000000,
    "tif":          "gtc",
    "stp_mode":     "cancel_oldest",
    "reduce_only":  false,
    "cloid":        "0xabababababababababababababababab",
    "builder":      { "fee": 5, "user": "0x00000000000000000000000000000000000000ff" }
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address | 40 hex chars | Claimed account; must equal the recovered signer or an approved agent of it. Wire-only — dropped on lowering |
| `market` | uint32 | `[0, market_count)` | Asset/market id (identity-mapped to `AssetId`) |
| `side` | enum | `"bid"` / `"ask"` | — |
| `kind` | enum | `"limit"` / `"market"` | Only `limit` / `market` are accepted; `"stop_loss"` / `"take_profit"` are rejected (`unsupported order kind` — triggers not wired) |
| `size` | uint64 | `> 0` | Fixed-point tick units (widened to `u128`) |
| `limit_px` | uint64 | `> 0` | Fixed-point tick units (widened to `i128`) |
| `tif` | enum | `"gtc"`, `"ioc"`, `"alo"` | `"aon"` is rejected (`unsupported time-in-force` — no core equivalent) |
| `stp_mode` | enum | `"cancel_oldest"`, `"cancel_newest"`, `"cancel_both"` | `"reject"` is rejected (`unsupported stp_mode` — no core equivalent) |
| `reduce_only` | bool | — | If true, rejected at commit if it would grow position |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | Optional client order id; enables `cancel_by_cloid` and dedup |
| `builder` | object \| null | — | Optional builder-fee carve: `{ "fee": <bps u16>, "user": <0x-hex address> }` |

**Idempotency**: a duplicate `cloid` on the same account is rejected at admission with `error: "duplicate cloid"`. Use `cloid` as your client-side dedup key.

**Common errors**: `px` not tick-aligned, `size` below market minimum, `reduce_only` would grow position, `stp` rejected via STP, account in T1+ liquidation tier.

**Response status entries** (per order, in order):

```json
{"resting": {"oid": 12345, "cloid": "0x..."}}      // posted to book
{"filled":  {"total_sz": "100000000", "avg_px": "10050000000", "oid": 12345}}
{"error":   "<reason>"}                             // admission rejected this entry only
```

---

### `batch_order`

N orders carried by ONE signed envelope / one nonce. Each entry is a full
[`submit_order`](#submit_order) order body (same fields, including per-order
`owner` / `cloid` / `builder`).

```json
{
  "type": "batch_order",
  "params": {
    "orders": [
      { "owner": "0x...aa", "market": 1, "side": "bid", "kind": "limit",
        "size": 1000, "limit_px": 5000, "tif": "gtc",
        "stp_mode": "cancel_oldest", "reduce_only": false },
      { "owner": "0x...aa", "market": 2, "side": "ask", "kind": "limit",
        "size": 2000, "limit_px": 6000, "tif": "gtc",
        "stp_mode": "cancel_oldest", "reduce_only": false }
    ],
    "grouping": "na"
  }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `orders[*]` | order | — | Each entry has the full `submit_order` order shape |
| `grouping` | enum | `"na"`, `"normalTpsl"`, `"positionTpsl"` | Order-family grouping; defaults to `"na"` if omitted |

Returns an array of per-leg statuses (same union as `submit_order`).

---

### `cancel_order`

Cancel a single order by `oid`. The cancel body is under `action.cancel`; `owner`
is the claimed account (recovered signer must equal it or be an approved agent).
For many cancels under one signature, use [`batch_cancel`](#batch_cancel).

```json
{
  "type": "cancel_order",
  "cancel": {
    "owner":  "0x00000000000000000000000000000000000000aa",
    "market": 3,
    "oid":    12345
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address | Claimed account; wire-only |
| `market` | uint32 | Asset/market id |
| `oid` | uint64 | Server order id (returned in the `submit_order` response). **Required** — a cancel with only `cloid` is rejected (`cancel requires an oid`); use [`cancel_by_cloid`](#cancel_by_cloid) instead |
| `cloid` | hex string \| null | Accepted on the wire but **not** used to cancel here |

**Idempotent**: cancel of an already-cancelled / already-filled order returns `{"error":"order not found"}` and is harmless.

---

### `batch_cancel`

N cancels carried by one signed envelope. Each entry is a
[`cancel_order`](#cancel_order) cancel body (an `oid` is required per entry;
cloid-only entries are rejected).

```json
{
  "type": "batch_cancel",
  "params": {
    "cancels": [
      { "owner": "0x...aa", "market": 1, "oid": 10 },
      { "owner": "0x...aa", "market": 2, "oid": 11 }
    ]
  }
}
```

Same per-entry response shape as `cancel_order`.

---

### `cancel_by_cloid`

Cancel by client order id. Useful when the caller hasn't seen the server-side
`oid` yet (race between the `submit_order` response and a cancellation decision).
This is a **sender-authorized** action (no `owner` field — the recovered signer is
the actor).

```json
{
  "type": "cancel_by_cloid",
  "params": {
    "asset": 7,
    "cloid": "0xabababababababababababababababab"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Asset/market id |
| `cloid` | hex string | `0x` + 32 hex chars (16 bytes) |

Same response shape as `cancel_order`.

---

### `cancel_all_orders`

Cancel all of the sender's resting orders, optionally filtered to one asset.

```json
{
  "type": "cancel_all_orders",
  "params": { "asset": 3 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 \| null | `null` / omitted = all assets; `Some(a)` = only asset `a` |

Returns a count of cancelled orders.

---

### `modify`

Amend a resting order's price and/or size in place. At least one of `new_px` /
`new_size` must be present.

```json
{
  "type": "modify",
  "params": {
    "market":   3,
    "oid":      12345,
    "new_px":   10049000000,
    "new_size": 100000000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `market` | uint32 | Asset/market id |
| `oid` | uint64 | Target order id |
| `new_px` | uint64 \| null | New price in fixed-point tick units (`null` / omitted = unchanged) |
| `new_size` | uint64 \| null | New size in fixed-point tick units (`null` / omitted = unchanged) |

Returns a single modify status.

---

### `batch_modify`

Apply N `modify`s under one signature. Each entry has the same shape as
`modify.params`.

```json
{
  "type": "batch_modify",
  "params": {
    "modifications": [
      { "market": 1, "oid": 5, "new_px": 100, "new_size": null },
      { "market": 2, "oid": 6, "new_px": null, "new_size": 7 }
    ]
  }
}
```

Per-entry statuses are returned in input order (each modify independently applies or errors).

---

### `schedule_cancel`

Arm a future-block cancel-all: at `cancel_at_block`, all the sender's open orders
are cancelled (a dead-man's switch).

```json
{
  "type": "schedule_cancel",
  "params": { "cancel_at_block": 999 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cancel_at_block` | uint64 | Block height at which the sender's open orders are cancelled |

---

### `twap_order`

Schedule a sliced (time-weighted) order. The parent is sliced into `slice_count`
child orders spaced `delay_ms` apart.

```json
{
  "type": "twap_order",
  "params": {
    "market":      4,
    "side":        "ask",
    "total_size":  1000000000,
    "slice_count": 10,
    "delay_ms":    500,
    "reduce_only": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `market` | uint32 | Asset/market id |
| `side` | enum | `"bid"` / `"ask"` |
| `total_size` | uint64 | Total size in fixed-point tick units (widened to `u128`) |
| `slice_count` | uint32 | Number of child slices (`> 0`) |
| `delay_ms` | uint64 | Inter-slice delay in ms |
| `reduce_only` | bool | — |

Admission returns the assigned `twap_id` (a uint64). Slice events stream on the [`twapEvents` WS channel](../ws/subscriptions.md#twapevents).

---

### `twap_cancel`

Cancel a running TWAP parent. Already-filled slices stay filled; future slices stop.

```json
{
  "type": "twap_cancel",
  "params": { "twap_id": 17 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `twap_id` | uint64 | The TWAP parent id returned by `twap_order` |

---

### `update_leverage`

Set per-asset leverage and, optionally, flip the asset to isolated mode.

```json
{
  "type": "update_leverage",
  "params": { "asset": 2, "leverage": 25, "is_isolated": true }
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `asset` | uint32 | — | Target asset |
| `leverage` | uint32 | `[1, 100]` and ≤ per-asset dynamic cap | New leverage |
| `is_isolated` | bool | — | `true` also flips the asset to isolated mode |

There is no separate margin-mode action: isolation is the `is_isolated` flag here.

---

### `update_isolated_margin`

Apply a signed margin delta to an isolated position (`+` adds, `−` withdraws).

```json
{
  "type": "update_isolated_margin",
  "params": { "asset": 1, "delta": "-12.5" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Target asset |
| `delta` | decimal (string or number) | Signed margin delta; non-zero |

---

### `top_up_isolated_only_margin`

Add margin to a strict-isolated position. Top-up direction only (positive amount).

```json
{
  "type": "top_up_isolated_only_margin",
  "params": { "asset": 5, "amount": "3.0" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Target asset |
| `amount` | decimal (string or number) | Positive amount to add |

---

### `user_portfolio_margin`

Enroll or unenroll the account in portfolio margin.

```json
{
  "type": "user_portfolio_margin",
  "params": { "enroll": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enroll` | bool | `true` = enroll, `false` = unenroll |

Requires account equity ≥ `pm_min_equity` (governance parameter). See [portfolio margin](../../concepts/portfolio-margin.md).

---

### `approve_agent`

Approve an agent wallet to sign on the account's behalf. See [agent wallets](../../concepts/agent-wallets.md) for the lifecycle.

```json
{
  "type": "approve_agent",
  "params": {
    "agent":         "0x00000000000000000000000000000000000000aa",
    "name":          "trading-bot-1",
    "expires_at_ms": 1735689600000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agent` | hex address | 20-byte address of the agent's signing key |
| `name` | string \| null | Optional bookkeeping label |
| `expires_at_ms` | uint64 \| null | Unix-ms expiry; `null` = never expires |

Becomes effective **one block after commit**. Submitting an agent-signed action before then returns `401`.

---

### `set_display_name`

Set the account's human-readable handle.

```json
{
  "type": "set_display_name",
  "params": { "display_name": "alice.mtf" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `display_name` | string | The handle (e.g. `alice.mtf`) |

---

### `set_referrer`

Bind the account to a referrer **address** (not a code).

```json
{
  "type": "set_referrer",
  "params": { "referrer": "0x00000000000000000000000000000000000000bb" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `referrer` | hex address | 20-byte referrer address |

Settable **once** per account; subsequent attempts return `{"error":"referrer already set"}`.

---

### `approve_builder_fee`

Approve a builder address up to a fee ceiling (bps). `0` revokes; the core handler caps at 8 bps.

```json
{
  "type": "approve_builder_fee",
  "params": {
    "builder": "0x00000000000000000000000000000000000000aa",
    "max_bps": 7
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `builder` | hex address | 20-byte builder address |
| `max_bps` | uint16 | Max approved fee in bps (`0` revokes; capped at 8) |

---

### `convert_to_multi_sig_user`

Convert the account to a multi-sig roster. **Irreversible**.

```json
{
  "type": "convert_to_multi_sig_user",
  "params": {
    "signers": [
      "0x00000000000000000000000000000000000000aa",
      "0x00000000000000000000000000000000000000bb"
    ],
    "threshold": 2
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `signers` | array of hex addresses | The multi-sig signer set |
| `threshold` | uint32 | M-of-N threshold (validated by the core handler) |

See [multi-sig](../../concepts/multi-sig.md).

---

### `token_delegate`

Delegate or undelegate stake to a validator.

```json
{
  "type": "token_delegate",
  "params": {
    "validator":     "0x00000000000000000000000000000000000000aa",
    "amount":        "100.5",
    "is_undelegate": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `validator` | hex address | 20-byte validator address |
| `amount` | decimal (string or number) | Stake amount |
| `is_undelegate` | bool | `true` = unstake / queue undelegation; `false` = delegate |

---

### `claim_rewards`

Claim staking rewards, optionally scoped to one validator.

```json
{
  "type": "claim_rewards",
  "params": { "validator": "0x00000000000000000000000000000000000000bb" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `validator` | hex address \| null | `null` / omitted = claim across all delegations |

---

### `link_staking_user`

Alias a staking target address to the sender.

```json
{
  "type": "link_staking_user",
  "params": { "target": "0x00000000000000000000000000000000000000aa" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `target` | hex address | 20-byte staking target address |

---

### `user_dex_abstraction`

Toggle the global DEX-abstraction flag for the sender.

```json
{
  "type": "user_dex_abstraction",
  "params": { "enabled": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | bool | `true` = opt-in, `false` = opt-out |

---

### `user_set_abstraction`

Self-scope abstraction config. `kind` is an opaque dispatch tag; `value` is the setting.

```json
{
  "type": "user_set_abstraction",
  "params": { "kind": 3, "value": "42" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `kind` | uint8 | Sub-type tag (0–255) |
| `value` | decimal (string or number) | Setting value (interpretation per `kind`) |

---

### `agent_set_abstraction`

Agent-scope abstraction config: an agent signs to update another user's config.
The core handler enforces the agent-approval check against `user` at dispatch.

```json
{
  "type": "agent_set_abstraction",
  "params": {
    "user":  "0x00000000000000000000000000000000000000bb",
    "kind":  1,
    "value": "9.9"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user` | hex address | The user whose config the agent is updating |
| `kind` | uint8 | Sub-type tag |
| `value` | decimal (string or number) | Setting value |

---

### `priority_bid`

Pay a priority fee (bps) to push the sender's flow toward the front of the next block.

```json
{
  "type": "priority_bid",
  "params": { "asset": 8, "bid_bps": 6 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Asset this bid is bound to |
| `bid_bps` | uint16 | Bid in bps (capped at 8 by the core handler) |

---

### `submit_encrypted_order`

Post a threshold-encrypted order ciphertext into the pending pool. The plaintext
is hidden until `target_block` and a threshold of decryption shares.

```json
{
  "type": "submit_encrypted_order",
  "params": {
    "ciphertext":         [1, 2, 3],
    "commitment":         [0, 0, /* … 32 bytes … */ 0],
    "threshold":          2,
    "target_block":       100,
    "reveal_deadline_ms": 5000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ciphertext` | byte array | Wire bytes of the encrypted order (bounded) |
| `commitment` | 32-byte array | `keccak(plaintext‖salt)` commitment |
| `threshold` | uint8 | Shares required to reveal (`≥ 1`) |
| `target_block` | uint64 | Block at/after which decryption may proceed |
| `reveal_deadline_ms` | uint64 | Consensus-time (ms) after which reveal is barred |

Returns the pending-pool depth after the push.

---

### `create_vault`

Leader creates a vault.

```json
{
  "type": "create_vault",
  "params": {
    "name":             "mlp",
    "lock_period_secs": 604800,
    "parent":           null,
    "kind":             "Metaliquidity"
  }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `name` | string | — | Display name |
| `lock_period_secs` | uint64 | — | Lock period (currently protocol-fixed; kept for API stability) |
| `parent` | uint64 \| null | — | Must be `null` (user vaults have no parent) |
| `kind` | enum | `"User"` (default), `"Metaliquidity"` | `Metaliquidity` requires the leader to be in the MLP whitelist |

Returns the new `vault_id` and derived `vault_address`.

---

### `vault_transfer`

Leader seed transfer between the leader's main account and the vault sub-account.

```json
{
  "type": "vault_transfer",
  "params": { "vault_id": 4, "deposit": true, "amount": "500" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | uint64 | Target vault id |
| `deposit` | bool | `true` = leader → vault; `false` = vault → leader |
| `amount` | decimal (string or number) | Amount in USD |

---

### `vault_modify`

Leader-only vault config update. Each `new_*` field is optional (`null` =
unchanged).

```json
{
  "type": "vault_modify",
  "params": {
    "vault_id":               4,
    "new_name":               "v2",
    "new_lock_period_secs":   null,
    "new_management_fee_bps":  100,
    "new_paused":              true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | uint64 | Target vault id |
| `new_name` | string \| null | New display name |
| `new_lock_period_secs` | uint64 \| null | **Always rejected if `Some` and different** (anti-rug: lock cannot be shortened) |
| `new_management_fee_bps` | uint16 \| null | New management fee bps (capped at 2000 = 20%) |
| `new_paused` | bool \| null | New paused flag |

---

### `vault_withdraw`

Follower share redemption.

```json
{
  "type": "vault_withdraw",
  "params": { "vault_id": 4, "shares": "250" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | uint64 | Vault id |
| `shares` | decimal (string or number) | Share amount to redeem (integer share count = `shares.trunc()`) |

Returns USD-cents paid out and shares burnt.

---

### `REDACTED`

MIP-2 validator governance vote: set an address's membership in the MLP
whitelist. **Validator-authorized** — the recovered signer must be a validator;
the change applies once a validator-stake quorum is reached.

```json
{
  "type": "REDACTED",
  "params": {
    "address": "0x00000000000000000000000000000000000000aa",
    "allowed": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | hex address | MLP address whose membership is being set |
| `allowed` | bool | `true` = add to whitelist; `false` = remove |

---

### `REDACTED`

MIP-2 vault-leader action: register or revoke an off-chain strategy operator as an
approved agent of a Metaliquidity vault. **Vault-leader-authorized** at dispatch;
the operator must be in the MLP whitelist.

```json
{
  "type": "REDACTED",
  "params": {
    "vault_id":      4,
    "operator":      "0x00000000000000000000000000000000000000bb",
    "allowed":       true,
    "expires_at_ms": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | uint64 | Target Metaliquidity vault id |
| `operator` | hex address | Off-chain strategy key (must be MLP-whitelisted) |
| `allowed` | bool | `true` = register as approved agent; `false` = revoke |
| `expires_at_ms` | uint64 \| null | Optional approval expiry; `null` = never expires |

---

<a id="non-bridged-actions"></a>

### Non-bridged actions

The following draft action names are **not** wired on the MTF-native `/exchange`
handler. Posting them returns `400 unsupported action` (recognized-but-unmapped
stubs) or `400 action: unknown type` (no native tag at all). They are documented
here only to redirect integrators to the supported path.

| Draft name | Native tag | Disposition | Use instead |
|-----------|-----------|-------------|-------------|
| `Order` (multi) / `Cancel` (multi) | — | Single vs. batch are distinct tags | [`submit_order`](#submit_order) + [`batch_order`](#batch_order); [`cancel_order`](#cancel_order) + [`batch_cancel`](#batch_cancel) |
| `ScaleOrder` | — | No native action | Ladder client-side into [`batch_order`](#batch_order) |
| `Trigger` | (via `kind`) | `stop_loss` / `take_profit` kinds reject | — (trigger wiring not present) |
| `UpdateMarginMode` | — | No native action | `is_isolated` flag on [`update_leverage`](#update_leverage) |
| `CreateSubAccount` / `SubAccountTransfer` / `SubAccountSpotTransfer` | — | Sub-account flows not bridged | — |
| `MultiSig` | — | Wrapper not bridged | [`convert_to_multi_sig_user`](#convert_to_multi_sig_user) converts the account |
| `RegisterReferrer` | — | Not bridged | [`set_referrer`](#set_referrer) binds by address |
| `UsdcTransfer` / `SpotTransfer` / `WithdrawUsdc` | — | Transfers / withdrawals are **never** on the public user `/exchange` path | — |
| `BorrowLend` | — | Not bridged | — |
| `REDACTED` | — | Validator/system action; consensus path only | — |
| `RfqQuote` / `RfqAccept` | `rfq_request` / `rfq_accept` | Recognized-but-unmapped stub → `unsupported action` | — |
| `FbaOrder` | `fba_submit` | Recognized-but-unmapped stub → `unsupported action` | — |
| (vault distribute) | `vault_distribute` | Partial/stub handler; not bridged on `/exchange` | — |
| (PM lifecycle) | `pm_enroll` / `pm_unenroll` / `pm_rebalance` | Recognized-but-unmapped stub → `unsupported action` | [`user_portfolio_margin`](#user_portfolio_margin) for enroll/unenroll |
| (cross-chain) | `cross_chain_send` | Recognized-but-unmapped stub → `unsupported action` | — |
| (encrypted submit alt) | `encrypted_order_submit` | Stub | [`submit_encrypted_order`](#submit_encrypted_order) |

---

## Response

### `202 Accepted` — admitted

```json
{
  "accepted":      true,
  "mempool_depth": 3,
  "nonce":         1735689600001,
  "action_hash":   "0x<keccak256_of_action_json>"
}
```

`mempool_depth` is informational at admission time. `action_hash` is the deterministic identifier (`0x` + keccak256 of the exact signed `action` JSON bytes) you can match against commit events.

### `400 Bad Request` — malformed

| `error` value | Cause | Remediation |
|---------------|-------|-------------|
| `owner: expected 40 hex chars, got N` | In-action `owner` length wrong | Drop `0x`, count hex chars |
| `signature: expected 130 hex chars, got N` | Forgot the recovery byte (`v`) | Append `v` (27/28 or 0/1) |
| `action: <parse error>` | `action` not valid JSON / unknown `type` | Check the catalog above; send valid JSON |
| `missing field: <X>` | Required field omitted | Check the variant's table |
| `unsupported action: <reason>` | Action variant recognised but not yet bridged | See the catalog for supported variants |
| `nonce must increase` | Reused or out-of-order nonce | Use `Date.now()` or a monotonic counter |
| `duplicate cloid` | `submit_order` / `batch_order` reused a client order id | Use a fresh `cloid` |

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
  │ {sig, submit_order} │                       │                       │
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
- **Numeric overflow on fixed-point fields.** Anything fitting in `u128` is accepted. The server rejects with `400 invalid numeric` if your encoded string exceeds `2^128 - 1`.
- **Empty `batch_order.orders` / `batch_cancel.cancels`.** Rejected at admission with `400 empty batch`.
- **Cross-block atomicity.** A `batch_order` with multiple legs is **block-atomic** — all legs see the same begin-block state. They are NOT cross-block atomic (a second order action in a later block sees the result of the first).

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

**Q: Why hash the raw JSON `action` instead of EIP-712 typed-data per variant?**
A: Per-variant EIP-712 typed-data needs one `typeHash` per action type. With ~30 action types and a growing surface, that's a maintenance burden on every SDK. Instead the action body is signed as a single EIP-712 `string` field under one frozen encoder — `MetaFluxAction(string action,uint64 nonce)` — so the whole surface shares one signing primitive. The server hashes the **exact received `action` bytes** (never a re-serialization), which also closes the signature-substitution trap: a body that recovers a valid signer cannot decode to a different action. The EIP-712 envelope (domain + `0x1901` + struct hash) is preserved so wallet integrations (MetaMask, Rabby, Ledger) still see a clean signed-data prompt.

**Q: Can I batch unrelated actions in one request?**
A: No. Each request is one `action`. For multi-order batching use `batch_order` (an `orders: []` array under one signature), for multi-cancel use `batch_cancel` (a `cancels: []` array), and so on.

**Q: What's the smallest possible request?**
A: A cancel of a single oid: ~250 bytes including the 65-byte signature and 40-char sender. Most orders are 350–500 bytes.

**Q: How do I deal with `429`?**
A: Linear backoff with `retry_after_ms`. Order-flow bots should pre-emptively rate-limit on the client side to stay below `per_account_qps` — see [rate limits](../rate-limits.md).

**Q: Does `nonce` need to be a timestamp?**
A: No. It needs to be strictly increasing per `sender`. Convention is `Date.now()` because that's monotonic and human-readable in logs, but any monotonic uint64 works.
