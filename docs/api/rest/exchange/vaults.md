---
description: "Create a vault, move the leader's own funds, reconfigure it, deposit and redeem as a follower, and register a Metaliquidity operator."
---

# Vault actions

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

### Create a vault {#create_vault}

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

### Transfer funds between leader and vault {#vault_transfer}

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

### Update vault configuration {#vault_modify}

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

### Deposit into a vault as a follower {#vault_distribute}

A follower deposits USD into a vault and receives shares. **Read the name and the
`pnl` field against what the action does**: this is not a leader payout and it is
not a profit figure. It debits the recovered signer's own account by `pnl` and
credits that account with shares. A leader seeds its own vault with
[`vault_transfer`](#vault_transfer) instead.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:VaultDistribute`.

```json
{
  "type": "vault_distribute",
  "params": { "vault_id": 4, "pnl": "250" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `vault_id` | uint64 | an existing vault | Target vault id |
| `pnl` | decimal string | `> 0` | The **deposit amount** in USD, as a JSON string. The field name is legacy |

**Funding is gated on free collateral**, not on raw equity: equity minus the
margin your open positions hold. Collateral backing a position cannot be moved
into a vault. An underfunded deposit is refused with
`follower has insufficient USD`.

**A deposit LOCKS what it buys.** Every deposit sets a withdrawal-lock expiry of
`now + the vault's lock period`. The default is **4 days** for a leader vault and
**7 days** for a Metaliquidity vault. This is the rule a depositor most needs, and
the action name does not hint at it.

The lock holds only the shares THIS deposit minted. Shares you already held stay
withdrawable, so a second deposit does not re-lock the first.

The leader cannot shorten the period. `vault_modify` refuses a different
`new_lock_period_secs`, which is why that field is documented as always rejected
when it changes.

**The rules, written as rejections.**

| The call | Result |
|----------|--------|
| `pnl` at or below zero | **Rejected**, `InvalidParams` — `deposit amount must be positive` |
| An amount that truncates to zero cents | **Rejected**, `InvalidParams` — `deposit amount rounds to zero cents`. The deposit is stored in cents, and it truncates toward zero |
| An unknown `vault_id` | **Rejected** — `vault not found: <id>` |
| A vault the leader has paused | **Rejected** — `vault paused by leader` |
| A vault that holds value but has **no shares outstanding** | **Rejected** — deposits stay suspended until the leader seeds shares. This closes a share-capture attack: without the guard, one cent into a seeded but shareless vault mints 100% of the shares and captures the leader's seed |

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission). Confirm
the minted shares through the vault reads. See
[vaults](../../../concepts/vaults.md#depositing).

---

### Redeem vault shares {#vault_withdraw}

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
| `shares` | decimal (string or number) | Share amount to redeem, as a **whole-share decimal**. A fractional share is honored, not truncated — send the share string through untouched, and do not pre-scale it. |

Returns USD-cents paid out and shares burnt.

---

### Register a Metaliquidity vault operator {#register_metaliquidity_operator}

Grant or revoke an **operator key** on a Metaliquidity vault. The operator is an
off-chain market-making key that then signs orders with `owner` set to the
**vault address**. Leader-only; the recovered signer must be the vault's leader.
See [MIP-2](../../../mip/mip-2.md) and
[agent wallets](../../../concepts/agent-wallets.md).

```json
{
  "type": "register_metaliquidity_operator",
  "params": {
    "vault_id": 7,
    "operator": "0x1111111111111111111111111111111111111111",
    "allowed": true,
    "expires_at_ms": 1767225600000
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `vault_id` | uint64 | an existing Metaliquidity vault | Vault to grant on |
| `operator` | address string | non-zero; **must be in the Metaliquidity set** on a grant | Operator key |
| `allowed` | bool | — | `true` grants, `false` revokes |
| `expires_at_ms` | uint64 \| null | optional | Expiry in consensus milliseconds. Omit for no expiry |

:::warning
**A grant only works for a key governance already recognizes.** On
`allowed: true` the `operator` must already be a member of the governance-voted
Metaliquidity set. A leader cannot delegate vault-trading authority to an
arbitrary key: a non-member is rejected here and never recorded, so a key signing
as the vault address that was not both set-member and leader-registered is
refused at `/exchange`. The set itself is changed only by a governance vote.
:::

**A grant writes an ordinary agent approval** on the vault address — the same
structure [`approve_agent`](./account.md#approve_agent) writes and the same one `/exchange`
reads. A revoke removes it. A revoke is accepted even for a key that is not in
the Metaliquidity set, so a leader can always withdraw authority from a key that
governance has since dropped.

**Gating.** Rejected if the vault does not exist, if it is not a Metaliquidity
vault, if the signer is not the vault leader, if `operator` is the zero address,
or — on a grant only — if `operator` is not in the Metaliquidity set.

**Signing.** `expires_at_ms` is **always** part of the digest. Omitting it signs
as `0`; encode `expiresAtMs = 0` in the typed struct when you leave it out. See
[typed-data signing](../../../integration/typed-data-signing.md#metaliquidity).

---
