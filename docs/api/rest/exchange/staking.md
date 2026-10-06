---
description: "Move MTF in and out of the staking balance, delegate and undelegate, claim rewards, and alias a staking target."
---

# Staking actions

These actions move MTF into and out of staking, delegate stake and claim rewards.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

### Move MTF into free staking balance {#c_deposit}

This action moves whole MTF from the spot MTF balance of the sender into the
free staking balance of the sender. The free staking balance is the undelegated
pool that [`token_delegate`](#token_delegate) draws from. The action moves value
between two ledgers. It does not mint or burn. It does not change delegations,
vote power or the validator set. The action is sender-authorized and has no
`owner` field.

```json
{
  "type": "c_deposit",
  "params": { "amount": "1000" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `amount` | decimal string | MTF to move from spot to the free staking balance (`> 0`), as a JSON string |

**Response.** This is a non-order action. It returns the
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).
Confirm the resulting balances with [`/info`](../info.md).

**Common errors** (at commit): `amount must be positive`, `insufficient spot MTF
balance`, and "MTF spot asset not configured on this chain".

**`amount` must be on the wei grid of the token.** The chain refuses an amount
that is finer than the declared `wei_decimals` of the token, with
`PRECONDITION_FAILED` and the message
`amount is finer than the token's wei_decimals`. MTF declares 8
`wei_decimals`. The chain accepts `"0.00000001"` and refuses `"0.000000001"`.
Trailing zeros do not count: `"1.000000000"` is on an 8-decimal grid. The check
exists because a sub-wei amount leaves dust that no ledger row can show. The
same rule applies to [`c_withdraw`](#c_withdraw).

---

### Move MTF out of staking balance {#c_withdraw}

This action is the exact reverse of [`c_deposit`](#c_deposit). It moves whole
MTF from the free staking balance of the sender back to the spot MTF balance of
the sender. No unbonding window applies, because this is the free
(undelegated) balance. Delegated stake has its own undelegation window through
[`token_delegate`](#token_delegate). This action does not change it. The action
is sender-authorized and has no `owner` field.

```json
{
  "type": "c_withdraw",
  "params": { "amount": "250.25" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `amount` | decimal string | MTF to move from the free staking balance to spot (`> 0`), as a JSON string |

**Response.** This is a non-order action. It returns the
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

**Common errors** (at commit): `amount must be positive`, `insufficient staking
balance`, and "MTF spot asset not configured on this chain".

---

### Delegate or undelegate stake {#token_delegate}

This action delegates stake to a validator, or undelegates it. A delegation
draws from the free staking balance, which [`c_deposit`](#c_deposit) funds. An
undelegation enters a slashable unbonding window. After the window, the stake
returns to the free staking balance.

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
| `is_undelegate` | bool | `true` = unstake and queue an undelegation. `false` = delegate |
| `lock_months` | uint8 | Optional, default `0`. One of `0` (flexible), `1`, `6` or `24`. The chain ignores it on an undelegation. It admits a non-zero value only for a validator on the governance allowlist |

---

### Claim staking rewards {#claim_rewards}

This action claims staking rewards. It can claim from one validator only.

```json
{
  "type": "claim_rewards",
  "params": { "validator": "0x00000000000000000000000000000000000000bb" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `validator` | hex address \| null | `null` or omitted = claim across all delegations |

**A claim pays into the free staking pool, not into spot.** That is the balance
that [`token_delegate`](#token_delegate) spends, so you can delegate a claimed
reward again with no second step. To spend it, move it to spot with
[`c_withdraw`](#c_withdraw). The free pool returns it with no unbonding window.

A claim of nothing is not an error. A claim with no accrued reward commits,
moves no money and writes no ledger row.

---

### Alias a staking target address {#link_staking_user}

This action makes a staking target address an alias of the sender.

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
