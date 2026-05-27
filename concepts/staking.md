# Staking

{% hint style="info" %}
**Preview.**
{% endhint %}

## TL;DR

Hold MTF, delegate to a validator, earn protocol emissions + a share of fee revenue. Stake is liquid up to the `lock_period`; unstake takes `7 days` to fully release. Slashing applies to validators who misbehave; delegators face partial slash exposure.

## Actors

| Role | Description |
|------|-------------|
| **Validator** | Runs a consensus node, proposes blocks, votes. Must self-bond above `min_self_bond` (default 100k MTF). |
| **Delegator** | Holds MTF, picks a validator, earns rewards minus the validator's commission. |
| **Protocol** | Emits rewards per block; distributes per-stake. |

## Staking flow

```
delegator
   │
   │  Delegate { validator, amount_e8 }
   ├──────────────────────────────────────────────►
   │                                                 ┌── stake registered next block
   │                                                 │
   │  reward accrual per block proportional to       │
   │  delegator's share of validator's total stake   │
   │                                                 │
   │  Claim { validator }                            │
   ├──────────────────────────────────────────────►  │
   │                                                 │  pending_rewards → balance
   │                                                 │
   │  Undelegate { validator, amount_e8 }            │
   ├──────────────────────────────────────────────►  │
   │                                                 │  enter unbonding queue
   │                                                 │  matures after lock_period (7 days)
   │                                                 │
   │  ... 7 days pass ...                            │
   │                                                 │
   │  ClaimUnstaked { validator }                    │
   ├──────────────────────────────────────────────►  │
   │                                                 │  unbonded MTF → balance
```

## Actions

### `Delegate`

```json
{
  "type": "Delegate",
  "params": { "validator": "0x<val_addr>", "amount_e8": "10000000000" }
}
```

Moves MTF from balance to the validator's delegation pool. Effective at next block. Earns rewards from then on.

### `Undelegate`

```json
{
  "type": "Undelegate",
  "params": { "validator": "0x<val_addr>", "amount_e8": "10000000000" }
}
```

Removes from active stake; enters unbonding queue. Doesn't earn rewards during unbonding. Matures at `now + lock_period_ms`.

### `Redelegate`

```json
{
  "type": "Redelegate",
  "params": { "from": "0x<val1>", "to": "0x<val2>", "amount_e8": "10000000000" }
}
```

Move stake between validators **without** entering the unbonding queue. Limited to one redelegation per `(from, to)` pair within a 24 h window (anti-whipsaw).

### `Claim`

```json
{
  "type": "Claim",
  "params": { "validator": "0x<val_addr>" }
}
```

Sweep accrued rewards from `pending_rewards_e8` to the delegator's MTF balance. No-op if pending is zero.

Auto-claim is **not** automatic — claim on a cadence (daily / weekly) or before changing delegation.

### `ClaimUnstaked`

```json
{
  "type": "ClaimUnstaked",
  "params": { "validator": "0x<val_addr>" }
}
```

Sweep matured undelegations (those whose lock period has passed) back to MTF balance. Idempotent.

## Reward sources

| Source | Cadence | Share |
|--------|---------|-------|
| Protocol emission | Per-block | `emission_per_block × stake_share × (1 - validator_commission)` |
| Fee revenue (treasury → stakers) | Per-epoch | `treasury_inflow × staker_share × stake_share × (1 - commission)` |

`emission_per_block`: governance-set; current value in `staking_state` query.
`staker_share` of treasury: governance-set, default `50%`.
`validator_commission`: per-validator, capped at `20%` by governance.

Rewards are computed in MTF (emissions) and USDC (fee revenue) — claim returns both. `staking_state` shows pending in each currency.

## Lock period

Default: **7 days** for unstaking. Tunable by governance per stake-pool.

| State | Duration | Earns rewards? | Slashable? |
|-------|----------|:--------------:|:----------:|
| Active (delegated) | indefinite | yes | yes |
| Unbonding | `lock_period_ms` | no | yes (until matured) |
| Unbonded (in claim queue) | until claimed | no | no |

Slash exposure during unbonding is the trap — a validator that gets slashed mid-unbond drags the unbonding delegators down with them, even though they've signalled exit.

## Slashing

Validators are slashed for:

| Offence | Slash | Punishment to delegator |
|---------|-------|--------------------------|
| Double-sign (signed two conflicting blocks at same height) | 5% of stake + jail | Pro-rata 5% of delegation lost |
| Downtime (missed `downtime_blocks` consecutive proposer slots) | 0.1% of stake + jail | Pro-rata 0.1% lost |
| Vote on invalid fork | 5% + permanent removal | Pro-rata 5% |

Slashed delegators see their `delegation.amount_e8` reduced at the slash block. No notice — slashing is consensus-derived.

Mitigations:
- Pick well-operated validators (uptime track record, commission stability).
- Diversify across validators (a single validator slash hits only that portion).
- Avoid validators near `min_self_bond` (more likely to exit ungracefully).

## Validator selection

```bash
curl -X POST https://gateway/info -d '{"type":"validators"}'
```

Returns the active validator set with:

```json
{
  "validator":          "0x<val>",
  "moniker":            "alpha-validator",
  "total_stake_e8":     "10000000000000",
  "self_bond_e8":       "100000000000",
  "commission_pct":     5,
  "uptime_30d_pct":     99.95,
  "slash_count":        0,
  "delegator_count":    1245
}
```

Pick by:
- **Uptime** > 99.9% over 30 days.
- **Commission**: lower → higher net APR. But beware bait-and-switch (cap raises).
- **Self-bond**: higher → operator has skin in the game.
- **Slash history**: 0 is the only acceptable answer for a serious delegator.

## APR estimation

`/info staking_apr` returns the current estimated annual return:

```json
{
  "type": "staking_apr",
  "data": {
    "total_active_stake_e8":  "100000000000000",
    "emission_per_block_e8":  "100000000",
    "fee_revenue_30d_e6":     "1000000000",
    "implied_apr_pct":        18.5
  }
}
```

APR depends on total active stake (more stake = lower per-staker share of fixed emissions) and on fee revenue (more trading = more for stakers).

Net APR for a delegator:

```
net_apr  =  implied_apr_pct  *  (1 - validator_commission_pct/100)
```

## Edge cases

- **Validator exits while you're unbonding.** Your unbonding stake transfers to the next-in-queue validator at the slash block. You can redelegate post-exit if you prefer a different validator; the lock continues against the new validator.
- **Active set turnover.** If the validator drops out of the active set (their delegations drop below the cutoff), your stake earns no rewards while they're out. You can redelegate to an active validator.
- **Self-bond minimum.** A validator whose self-bond falls below `min_self_bond` (via slashes or withdrawals) gets jailed; delegators don't earn during jail.

## Sequence — full cycle

```
T=0    user delegates 1000 MTF to validator V
       active stake on V: prev + 1000

T+1    block-by-block reward accrual:
       each block, V earns (emission * V_stake / total_active_stake)
       user earns (V_earnings * 1000 / V_stake) * (1 - V_commission)

T+30 days
       user runs Claim { V } → 18 MTF + 5 USDC paid out
       (assuming ~18% APR + fee share)

T+30 days + 1s
       user runs Undelegate { V, 1000 }
       stake enters unbonding queue
       no further earnings on the 1000

T+37 days
       unbonding matures
       user runs ClaimUnstaked { V } → 1000 MTF returned to balance
```

## See also

- [`POST /exchange Delegate / Undelegate / Claim`](../api/rest/exchange.md)  (in catalog as supported action variants once live)
- [`POST /info staking_state`](../api/rest/info.md#staking_state)
- [HL-compat `delegations`](../api/rest/hl-compat.md#delegations)
- [Fees](./fees.md) — fee revenue is one of the staking reward sources

## FAQ

**Q: Can I stake and trade simultaneously?**
A: Yes — staked MTF and USDC trading balances are separate sub-balances of the same account.

**Q: Do I need an agent wallet to stake?**
A: No — but you can use one. Agent wallets can call `Delegate` / `Undelegate` / `Claim` (no withdrawal authority required for staking changes).

**Q: Can I cancel an unbonding?**
A: No — once submitted, you wait the full `lock_period`. Redelegate instead if you anticipated needing the stake elsewhere.

**Q: Where do MTF tokens come from at launch?**
A: Genesis allocations + emission per block. See [tokenomics docs] (coming) for distribution. The protocol does not airdrop arbitrarily — emissions are the only ongoing source.
