---
description: "Per-vault TVL, share price and strategy; per-account staking and delegation state."
---

# Vault & staking reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

### Per-vault TVL, share price, and strategy {#vault_state}

Returns a snapshot of one vault: TVL, share price, and strategy.

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
| `tvl` | Decimal string | Mark-to-market net asset value — see Rules |
| `share_price` | Decimal string | Mark-to-market value of one share — see Rules |
| `depositor_count` | uint | Number of depositors |
| `high_water_mark` | Decimal string | Performance-fee ratchet, not NAV — see Rules |
| `performance_fee_bps` | Decimal string | Performance fee, in basis points |
| `lock_period_ms` | uint64 | Minimum deposit lock period, in milliseconds |
| `strategy` | string | Vault kind: `"User"` or `"Metaliquidity"` |

**Rules**

- `strategy` is the vault's kind, `"User"` or `"Metaliquidity"`. It is not a free-text strategy label.
- `tvl` and `share_price` are mark-to-market NAV: settled cash, plus unrealised PnL on every open position at the latest oracle mark, plus unrealised funding. The Metaliquidity backstop vault also subtracts its pending-loss reserve. This is the same NAV that [`vault_withdraw`](../exchange/vaults.md#vault_withdraw) burns shares against, so the read and the payout agree.
- `high_water_mark` is not NAV. It is a ratchet for performance-fee accounting: profit raises it, a deposit raises it, a withdrawal lowers it, and a trading loss never changes it. In drawdown, `high_water_mark` sits above `share_price` — the gap is the profit the vault must re-earn before it charges a performance fee again. Never price a redemption off `high_water_mark`.

### Per-account staking and delegation state {#staking_state}

Returns one account's staking, delegation, and unbonding state.

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

**The response is FLAT.** `total_stake`, `pending_validator_pool_usdc`,
`n_active_validators` and `reward_source` sit at the top level. There is no
`reward_pool` object.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `total_staked` | Decimal string | This account's delegated stake only, whole-MTF — the sum of `delegations[*].amount`. It is `"0"` for an account that delegates nothing |
| `delegations[*].validator` | hex address | Validator the stake is delegated to |
| `delegations[*].amount` | Decimal string | Stake delegated to this validator, whole-MTF |
| `delegations[*].since_ts` | uint64 | **Last reward-claim time, consensus ms — not the time the delegation began.** Committed state keeps the last-claim stamp only. Do not compute a delegation age from it |
| `delegations[*].pending_rewards` | Decimal string | Accrued, unclaimed rewards, whole-MTF |
| `pending_unstakes[*].amount` | Decimal string | Stake in the unbonding window, whole-MTF |
| `pending_unstakes[*].matures_at_ts` | uint64 | When that amount becomes withdrawable, consensus ms |
| `total_stake` | Decimal string | Total staked MTF across the **whole chain**, whole-MTF — the denominator this account's delegated stake competes in. Chain-wide, not per-account |
| `pending_validator_pool_usdc` | Decimal string | Fees accrued to the validator pool, not yet distributed, whole USDC. This is the reward the next distribution draws from. **A constant value is normal** — see the rule below |
| `n_active_validators` | uint64 | Count of validators marked active in committed staking state |
| `reward_source` | string | Always `"fee_funded_on_book_buy"`. Lets a client tell a fee-funded chain from an emission-funded one without inferring it |

**Rules**

- **This read serves no APR, on purpose.** The emission era is over: rewards are funded from fees, not minted on a curve, so there is no annual rate to publish. Do not derive one. `pending_validator_pool_usdc` is a snapshot of accrued fees, not a rate — it depends on trading volume that has not happened yet.
- **A pool that does not move is not a stalled read.** `reward_source` is `"fee_funded_on_book_buy"`, and the second half of that name is a real step: the distribution spends the pooled USDC on the MTF/USDC book, then pays the MTF it ACQUIRED out by stake weight. It never credits USDC into an MTF-denominated reward, so a buy that fills nothing pays nothing. **With no resting asks on MTF/USDC the buy acquires nothing, the distribution is skipped, and the pool carries forward unchanged.** The pool is not spent and not stranded; it waits. A pool above the floor therefore does NOT mean a payout is due — check `height` on another read to tell a waiting pool from a frozen connection.
- **This read does NOT serve the undelegated free pool.** [`c_deposit`](../exchange/staking.md#c_deposit) credits a free pool and [`c_withdraw`](../exchange/staking.md#c_withdraw) debits it, and stake can sit in that pool undelegated for as long as the holder likes. No field on this read reports it. `total_staked` therefore **under-reports** what an account holds: it counts delegated stake only, so an account with a funded free pool and no delegation reads `"0"`. Do not present `total_staked` as the account's whole staked balance.
- The free pool is not the same as `pending_unstakes`. Undelegated stake is already free. `pending_unstakes` is stake still inside its unbonding window, not withdrawable until `matures_at_ts`.
- `total_staked` and `pending_unstakes` are disjoint. `token_delegate` moves stake out of the free pool into `total_staked`; undelegating moves it out of `total_staked` into `pending_unstakes` for the unbonding window. Only the free pool is the figure [`c_withdraw`](../exchange/staking.md#c_withdraw) returns to spot with no unbonding window.
- `total_stake` and `total_staked` are different figures with near-identical names. `total_stake` is chain-wide; `total_staked` is this account. Do not swap them.
