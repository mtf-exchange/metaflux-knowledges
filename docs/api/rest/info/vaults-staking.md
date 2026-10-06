---
description: "The TVL, share price and strategy of a vault, and the staking and delegation state of an account."
---

# Vault and staking reads {#vault--staking-reads}

These reads return the state of one vault and the staking state of one account.

They are read queries on [`POST /info`](../info.md). That page describes the
endpoint, the request envelope, the number planes and the error shape. These
apply to every query here.

### Vault TVL, share price and strategy {#vault_state}

This read returns a snapshot of one vault: TVL, share price and strategy.

**Request**

```json
{ "type": "vault_state", "vault": "0x<vault_addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `vault` | hex address | yes | Vault to read |

**Response**

```json
{
  "data": {
    "type": "vault_state",
    "vault":              "0x<addr>",
    "name":               "MFlux Conservative",
    "tvl":             "10000000000",
    "share_price":     "10500000",
    "depositor_count":    142,
    "high_water_mark": "10500000",
    "performance_fee_bps":"1000",
    "lock_period_ms":     86400000,
    "strategy":           "User"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `vault` | hex address | Vault address |
| `name` | string | Vault display name |
| `tvl` | Decimal string | Mark-to-market net asset value. See Rules |
| `share_price` | Decimal string | Mark-to-market value of one share. See Rules |
| `depositor_count` | uint | Number of depositors |
| `high_water_mark` | Decimal string | Performance-fee ratchet, not NAV. See Rules |
| `performance_fee_bps` | Decimal string | Performance fee, in basis points |
| `lock_period_ms` | uint64 | Minimum deposit lock period, in milliseconds |
| `strategy` | string | Vault kind: `"User"` or `"Metaliquidity"` |

**Rules**

- `strategy` is the kind of the vault, `"User"` or `"Metaliquidity"`. It is not a free-text strategy label.
- `tvl` and `share_price` are mark-to-market NAV. NAV is the settled cash, plus the unrealised PnL of every open position at the latest oracle mark, plus unrealised funding. The Metaliquidity backstop vault also subtracts its pending-loss reserve. [`vault_withdraw`](../exchange/vaults.md#vault_withdraw) burns shares against the same NAV, so the read and the payout agree.
- `high_water_mark` is not NAV. It is a ratchet for performance-fee accounting. Profit raises it, a deposit raises it, a withdrawal lowers it, and a trading loss never changes it. In a drawdown, `high_water_mark` is above `share_price`. The gap is the profit that the vault must earn again before it charges a performance fee again. Never price a redemption from `high_water_mark`.

### Account staking and delegation state {#staking_state}

This read returns the staking, delegation and unbonding state of one account.

**Request**

```json
{ "type": "staking_state", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "staking_state",
    "address":                  "0x<addr>",
    "total_staked":                "1000000000",
    "delegations": [
      {
        "validator":        "0x<val_addr>",
        "amount":           "500000000",
        "lock_months":      6,
        "reward_weight":    "1250000000",
        "since_ts":         1735000000000,
        "pending_rewards":  "1000000"
      }
    ],
    "pending_unstakes": [
      { "amount": "200000000", "matures_at_ts": 1735780000000 }
    ],
    "total_stake":                 "87600000",
    "pending_validator_pool_usdc": "8800.447354",
    "n_active_validators":         5,
    "reward_source":               "fee_funded_on_book_buy"
  }
}
```

**The response is flat.** `total_stake`, `pending_validator_pool_usdc`,
`n_active_validators` and `reward_source` are at the top level. There is no
`reward_pool` object.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `total_staked` | Decimal string | The delegated stake of this account only, in whole MTF. It is the sum of `delegations[*].amount`. It is `"0"` for an account that delegates nothing |
| `delegations[*].validator` | hex address | The validator that the stake is delegated to |
| `delegations[*].amount` | Decimal string | Stake delegated to this validator, in whole MTF |
| `delegations[*].lock_months` | uint8 | The lock tier of the row in committed state: `0` flexible, or `1`, `6`, `24`. It tells a delegator what to change. Do not calculate `reward_weight` from it |
| `delegations[*].reward_weight` | Decimal string | The weight of this row in the reward split of its validator, on the same whole-MTF plane as `amount`. The share of the row in a distribution is this weight divided by the sum of weights at that validator, before the commission of the validator. It is a weight, not a payable amount. **You cannot derive it from `lock_months`.** See the rules below |
| `delegations[*].since_ts` | uint64 | **The time of the last reward claim, in consensus ms. It is not the time when the delegation began.** Committed state keeps only the last-claim time. Do not calculate the age of a delegation from it |
| `delegations[*].pending_rewards` | Decimal string | Accrued, unclaimed rewards, in whole MTF. A row whose `reward_weight` is `"0"` gains nothing new here. See the rules below. It can still show a balance from earlier accrual. That balance does not grow |
| `pending_unstakes[*].amount` | Decimal string | Stake in the unbonding window, in whole MTF |
| `pending_unstakes[*].matures_at_ts` | uint64 | When that amount becomes withdrawable, in consensus ms |
| `total_stake` | Decimal string | Total staked MTF across the **whole chain**, in whole MTF. It is the denominator that the delegated stake of this account competes in. It is chain-wide, not for one account |
| `pending_validator_pool_usdc` | Decimal string | Fees accrued to the validator pool and not yet distributed, in whole USDC. The next distribution draws its reward from this amount. **A constant value is normal.** See the rule below |
| `n_active_validators` | uint64 | Count of validators marked active in committed staking state |
| `reward_source` | string | Always `"fee_funded_on_book_buy"`. A client can tell a fee-funded chain from an emission-funded one without inferring it |

**Rules**

- **The read serves `reward_weight`. Do not derive it again from `lock_months`.**
  Three inputs set the weight, and the read gives only the result.
  1. **The lock tier.** A flexible row (`lock_months: 0`) weighs `"0"`. A locked row weighs `amount × 1.0` at 1 month, `× 2.5` at 6 months, and `× 4.0` at 24 months.
  2. **The multiplier that the row stored at delegate time.** A governance change to the ladder never rewrites an existing row. A row can therefore hold a multiplier that the current ladder no longer gives.
  3. **The locked-stake allowlist.** A locked row whose validator is not in that allowlist is capped to `amount × 1.0`, at any tier. A 24-month row with a validator that is not on the allowlist weighs the same as a 1-month row, not four times as much. Governance can drop a validator from the allowlist after you delegate. A correctly admitted row can therefore reach this state with no action from you.

  A caller that rebuilds the ladder from `lock_months` alone misses the allowlist fallback and overstates the share of the row. Read the served value.
- **A `reward_weight` of `"0"` next to a non-zero `amount` is not a late payment.** The row earns nothing from a distribution, and it also earns nothing from the next one. `pending_rewards` never grows on that row, so waiting does not change the number. A delegator changes it by locking, not by waiting:
  1. Undelegate the row.
  2. Wait for the unbonding window to end.
  3. Delegate again with `lock_months` of `1`, `6` or `24`.

  The undelegated stake stays in `pending_unstakes` until that window matures. Only then does it reach the free pool that a new delegation draws on. This is therefore not a swap in one block. Choose a validator on the locked-stake allowlist. A validator that is not on it refuses a locked tier at delegate time.
- **This read serves no APR, by design.** The emission era is over. Rewards come from fees and are not minted on a curve, so there is no annual rate to publish. Do not derive one. `pending_validator_pool_usdc` is a snapshot of accrued fees, not a rate. It depends on trading volume that has not happened yet.
- **A pool that does not move is not a stalled read.** `reward_source` is `"fee_funded_on_book_buy"`, and the second half of that name is a real step. The distribution spends the pooled USDC on the MTF/USDC book. It then pays out the MTF that it bought, by stake weight. It never credits USDC into an MTF-denominated reward, so a buy that fills nothing pays nothing. **With no resting asks on MTF/USDC, the buy gets nothing, the distribution is skipped, and the pool carries forward unchanged.** The pool is not spent and not stranded. It waits. A pool above the floor therefore does not mean that a payout is due. Check `height` on a different read to tell a waiting pool from a frozen connection.
- **This read does not serve the undelegated free pool.** [`c_deposit`](../exchange/staking.md#c_deposit) credits a free pool and [`c_withdraw`](../exchange/staking.md#c_withdraw) debits it. Stake can stay in that pool undelegated for as long as the holder wants. No field on this read reports it. `total_staked` therefore **under-reports** what an account holds. It counts delegated stake only, so an account with a funded free pool and no delegation reads `"0"`. Do not show `total_staked` as the whole staked balance of the account.
- The free pool is not the same as `pending_unstakes`. Undelegated stake is already free. `pending_unstakes` is stake that is still inside its unbonding window. It is not withdrawable until `matures_at_ts`.
- `total_staked` and `pending_unstakes` do not overlap. `token_delegate` moves stake out of the free pool into `total_staked`. An undelegation moves it out of `total_staked` into `pending_unstakes` for the unbonding window. [`c_withdraw`](../exchange/staking.md#c_withdraw) returns only the free pool to spot with no unbonding window.
- `total_stake` and `total_staked` are different figures with almost identical names. `total_stake` is chain-wide. `total_staked` is for this account. Do not swap them.
