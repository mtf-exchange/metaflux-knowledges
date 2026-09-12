---
description: "Move MTF in and out of the staking balance, delegate and undelegate, claim rewards, and alias a staking target."
---

# Staking actions

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

### Move MTF into free staking balance {#c_deposit}

Move whole-MTF from the sender's **spot MTF balance** into their **free staking
balance** (the undelegated pool that [`token_delegate`](#token_delegate) draws
from). Pure value-move between two ledgers — no mint, no burn — and it does
**not** touch delegations, vote power, or the validator set. **Sender-authorized**
— no `owner` field.

```json
{
  "type": "c_deposit",
  "params": { "amount": "1000" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `amount` | decimal string | MTF to move spot → free staking balance (`> 0`), as a JSON string |

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission). Confirm
the resulting balances via [`/info`](../info.md).

**Common errors** (at commit): `amount must be positive`, `insufficient spot MTF
balance`, MTF spot asset not configured on this chain.

**`amount` must sit on the token's wei grid.** An amount finer than the token's
declared `wei_decimals` is refused with `INVALID_REQUEST` and the message
`amount is finer than the token's wei_decimals`. MTF declares 8 `wei_decimals`,
so `"0.00000001"` is accepted and `"0.000000001"` is refused. Trailing zeros do
not count: `"1.000000000"` is on an 8-decimal grid. **Not live yet:** the check
ships with the next node release. A live node commits a sub-wei amount and
leaves dust no ledger row can render. The same rule applies to
[`c_withdraw`](#c_withdraw).

---

### Move MTF out of staking balance {#c_withdraw}

The exact reverse of [`c_deposit`](#c_deposit): move whole-MTF from the sender's
**free staking balance** back to their **spot MTF balance**. No unbonding window
applies — this is the *free* (undelegated) balance; **delegated** stake has its
own undelegation window via [`token_delegate`](#token_delegate), which this does
not touch. **Sender-authorized** — no `owner` field.

```json
{
  "type": "c_withdraw",
  "params": { "amount": "250.25" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `amount` | decimal string | MTF to move free staking balance → spot (`> 0`), as a JSON string |

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

**Common errors** (at commit): `amount must be positive`, `insufficient staking
balance`, MTF spot asset not configured on this chain.

---

### Delegate or undelegate stake {#token_delegate}

Delegate or undelegate stake to a validator. The delegate side draws from the
**free staking balance** (funded by [`c_deposit`](#c_deposit)); undelegation
enters a slashable unbonding window before the stake returns to that balance.

```json
{
  "type": "token_delegate",
  "params": {
    "validator":     "0x00000000000000000000000000000000000000aa",
    "amount":        "100.5",
    "is_undelegate": false,
    "lock_months":   0
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `validator` | hex address | 20-byte validator address |
| `amount` | decimal (string or number) | Stake amount |
| `is_undelegate` | bool | `true` = unstake / queue undelegation; `false` = delegate |
| `lock_months` | uint8 | Optional, default `0`. One of `0` (flexible) / `1` / `6` / `24`. Ignored on undelegate; a non-zero value is admitted only for a governance-allowlisted validator |

---

### Claim staking rewards {#claim_rewards}

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

**A claim pays into the STAKING free pool, not into spot.** That is the same
balance [`token_delegate`](#token_delegate) spends, so a claimed reward can be
re-delegated with no second step. To spend it, move it to spot with
[`c_withdraw`](#c_withdraw), which the free pool returns with no unbonding
window.

Claiming nothing is not an error. A claim with no accrued reward commits, moves
no money, and writes no ledger row.

---

### Alias a staking target address {#link_staking_user}

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
