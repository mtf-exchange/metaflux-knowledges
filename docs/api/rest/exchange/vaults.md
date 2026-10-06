---
description: "Create a vault, move the leader's own funds, reconfigure it, deposit and redeem as a follower, and register a Metaliquidity operator."
---

# Vault actions

These actions create and configure a vault, move funds into and out of it, and register a Metaliquidity operator.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

### Create a vault {#create_vault}

A leader sends this action to create a vault.

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
| `lock_period_secs` | uint64 | — | Lock period. The protocol fixes it today. The field stays for API stability |
| `parent` | uint64 \| null | — | Must be `null`. User vaults have no parent |
| `kind` | enum | `"User"` (default), `"Metaliquidity"` | `Metaliquidity` requires the leader to be in the MLP whitelist |

The action returns the new `vault_id` and the derived `vault_address`.

---

### Transfer funds between leader and vault {#vault_transfer}

This action moves the seed funds of the leader between the main account of the
leader and the vault sub-account.

```json
{
  "type": "vault_transfer",
  "params": { "vault_id": 4, "deposit": true, "amount": "500" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | uint64 | Target vault id |
| `deposit` | bool | `true` = leader to vault. `false` = vault to leader |
| `amount` | decimal (string or number) | Amount in USD |

---

### Update vault configuration {#vault_modify}

This action updates the vault configuration. Only the leader can send it. Each
`new_*` field is optional. `null` means no change.

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
| `new_lock_period_secs` | uint64 \| null | Always rejected if `Some` and different. This protects followers: a leader cannot shorten the lock |
| `new_management_fee_bps` | uint16 \| null | New management fee bps (capped at 2000 = 20%) |
| `new_paused` | bool \| null | New paused flag |

**The signature covers every field here.** The EIP-712 digest binds
`new_lock_period_secs`, `new_management_fee_bps` and `new_paused`, and also
`new_name`. Each optional field signs as a presence flag and a value, so one
signature covers exactly one field set. If you add or remove a key after you
sign, the chain refuses the action. See
[typed-data signing](../../../integration/typed-data-signing.md#account-staking--vault)
for the type string.

**Reason.** Before [block 11,550,001](../../../changelog/block-11550001.md#vault_modify)
the digest bound only `new_name`. A relay could add a fee change or a pause to
a signature that the leader gave for a rename. A signature over that older form
no longer verifies.

---

### Deposit into a vault as a follower {#vault_distribute}

A follower sends this action to deposit USD into a vault and receive shares.
The name of the action and the `pnl` field do not describe what it does. It is
not a leader payout, and `pnl` is not a profit figure. The action debits the
account of the recovered signer by `pnl` and credits that account with shares.
A leader seeds its own vault with [`vault_transfer`](#vault_transfer) instead.

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
| `pnl` | decimal string | `> 0` | The deposit amount in USD, as a JSON string. The field name is a legacy name |

**The chain checks free collateral, not raw equity.** Free collateral is equity
minus the margin that your open positions hold. You cannot move collateral that
backs a position into a vault. The chain refuses an underfunded deposit with
`follower has insufficient USD`.

**A deposit locks the shares that it buys.** Every deposit sets a
withdrawal-lock expiry of `now + the vault's lock period`. The default is
4 days for a leader vault and 7 days for a Metaliquidity vault. A depositor
needs this rule most, and the action name does not show it.

The lock holds only the shares that this deposit minted. Shares that you
already held stay withdrawable, so a second deposit does not lock the first one
again.

The leader cannot shorten the period. `vault_modify` refuses a different
`new_lock_period_secs`. For this reason, that field is always rejected when it
changes.

**Rejections**

| The call | Result |
|----------|--------|
| `pnl` at or below zero | Rejected with `InvalidParams`: `deposit amount must be positive` |
| An amount that truncates to zero cents | Rejected with `InvalidParams`: `deposit amount rounds to zero cents`. The chain stores the deposit in cents, and truncates toward zero |
| An unknown `vault_id` | Rejected with `vault not found: <id>` |
| A vault the leader has paused | Rejected with `vault paused by leader` |
| A vault that holds value but has no shares outstanding | Rejected. Deposits stay suspended until the leader seeds shares. This stops a share-capture attack. Without the guard, one cent into a seeded vault with no shares mints 100% of the shares and captures the seed of the leader |

**Response.** This is a non-order action. It returns the
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).
Confirm the minted shares through the vault reads. See
[vaults](../../../concepts/vaults.md#depositing).

---

### Redeem vault shares {#vault_withdraw}

A follower sends this action to redeem shares.

```json
{
  "type": "vault_withdraw",
  "params": { "vault_id": 4, "shares": "250" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | uint64 | Vault id |
| `shares` | decimal (string or number) | Share amount to redeem, as a whole-share decimal. The chain honors a fractional share and does not truncate it. Send the share string unchanged, and do not scale it first. |

The action returns the USD cents paid out and the shares burnt.

---

### Register a Metaliquidity vault operator {#register_metaliquidity_operator}

This action grants or revokes an operator key on a Metaliquidity vault. The
operator is an off-chain market-making key. It signs orders with `owner` set to
the vault address. Only the leader can send this action: the recovered signer
must be the leader of the vault. See [MIP-2](../../../mip/mip-2.md) and
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
| `vault_id` | uint64 | an existing Metaliquidity vault | The vault to grant on |
| `operator` | address string | non-zero; **must be in the Metaliquidity set** on a grant | Operator key |
| `allowed` | bool | — | `true` grants, `false` revokes |
| `expires_at_ms` | uint64 \| null | optional | Expiry in consensus milliseconds. Omit it for no expiry |

:::warning
**A grant works only for a key that governance already recognizes.** On
`allowed: true`, the `operator` must already be a member of the Metaliquidity
set that governance votes on. A leader cannot give vault-trading authority to
any key. The chain rejects a non-member here and does not record it. A key that
signs as the vault address must be a set member and registered by the leader.
Otherwise `/exchange` refuses it. Only a governance vote changes the set.
:::

**A grant writes an ordinary agent approval** on the vault address. This is the
same structure that [`approve_agent`](./account.md#approve_agent) writes and
that `/exchange` reads. A revoke removes it. The chain accepts a revoke even for
a key that is not in the Metaliquidity set. A leader can always remove
authority from a key that governance has dropped.

**One operator per vault, one vault per operator.** The chain rejects a grant
with `vault already has a metaliquidity operator` when the vault already holds
a different operator. It rejects a grant with
`operator already runs another metaliquidity vault` when the key is registered
on a different Metaliquidity vault. A new grant to the same operator is always
accepted, so a leader can extend an expiry without a revoke first. To move a
key, revoke it.

The binding is one-to-one because it decides one
[self-trade-prevention group](../../../concepts/order-types.md#stp-groups).
From the grant onward, the vault and the operator count as one party, and the
book refuses a match between them. The chain forces the `stp_mode` on those
orders to `"cancel_oldest"`.

**Governance removal withdraws the authority.** When a vote removes the
operator from the Metaliquidity set, the chain also removes the agent approval
that this action wrote. The key stops signing as the vault at that moment. The
leader does not have to revoke it.

**Gating.** The chain rejects the action in these cases:

- The vault does not exist.
- The vault is not a Metaliquidity vault.
- The signer is not the leader of the vault.
- `operator` is the zero address.
- On a grant only: `operator` is not in the Metaliquidity set, the vault
  already has a different operator, or the key runs a different vault.

**Signing.** `expires_at_ms` is always part of the digest. If you omit it, it
signs as `0`. Encode `expiresAtMs = 0` in the typed struct when you leave it
out. See
[typed-data signing](../../../integration/typed-data-signing.md#metaliquidity).

---
