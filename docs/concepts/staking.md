# Staking

:::info
**Live on devnet.** Delegation, undelegation, rewards claiming, and validator
registration are active and verified end-to-end across consensus on the
4-node devnet.
:::

## TL;DR

Hold MTF, delegate to a validator, earn protocol emissions + a share of fee revenue. Stake is liquid up to the `lock_period`; unstake takes `7 days` to fully release. Slashing applies to validators who misbehave; delegators face partial slash exposure.

## Actors

| Role | Description |
|------|-------------|
| **Validator** | Runs a consensus node, proposes blocks, votes. Must self-bond above `min_self_bond` (default 100k MTF). |
| **Delegator** | Holds MTF, picks a validator, earns rewards minus the validator's commission. |
| **Protocol** | Emits rewards per block; distributes per-stake. |

## Staking flow

```mermaid
sequenceDiagram
    participant D as delegator
    participant P as protocol
    D->>P: Delegate { validator, amount }
    Note over P: stake registered next block
    Note over D,P: reward accrual per block proportional to<br/>delegator's share of validator's total stake
    D->>P: Claim { validator }
    Note over P: pending_rewards → balance
    D->>P: Undelegate { validator, amount }
    Note over P: enter unbonding queue
    Note over P: matures after lock_period (7 days)
    Note over D,P: ... 7 days pass ...
    D->>P: ClaimUnstaked { validator }
    Note over P: unbonded MTF → balance
```

## Actions

### `Delegate`

```json
{
  "type": "Delegate",
  "params": { "validator": "0x<val_addr>", "amount": "10000000000" }
}
```

Moves MTF from balance to the validator's delegation pool. Effective at next block. Earns rewards from then on.

### `Undelegate`

```json
{
  "type": "Undelegate",
  "params": { "validator": "0x<val_addr>", "amount": "10000000000" }
}
```

Removes from active stake; enters unbonding queue. Doesn't earn rewards during unbonding. Matures at `now + lock_period_ms`.

### `Redelegate`

```json
{
  "type": "Redelegate",
  "params": { "from": "0x<val1>", "to": "0x<val2>", "amount": "10000000000" }
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

Sweep accrued rewards from `pending_rewards` to the delegator's MTF balance. No-op if pending is zero.

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

Slashed delegators see their `delegation.amount` reduced at the slash block. No notice — slashing is consensus-derived.

Mitigations:
- Pick well-operated validators (uptime track record, commission stability).
- Diversify across validators (a single validator slash hits only that portion).
- Avoid validators near `min_self_bond` (more likely to exit ungracefully).

## Validator selection

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info -d '{"type":"validator_summaries"}'
```

Returns the active validator set (`{epoch, total_stake, n_active, validators[]}`);
each entry carries:

```json
{
  "validator":          "0x<val>",
  "signer":             "0x<signer>",
  "validator_index":    3,
  "stake":              "10000000000000",
  "self_stake":         "100000000000",
  "commission_bps":     500,
  "is_active":          true,
  "is_jailed":          false,
  "first_active_epoch": 12
}
```

Pick by:
- **Commission** (`commission_bps`): lower → higher net APR. But beware bait-and-switch (cap raises).
- **Self-stake** (`self_stake`): higher → operator has skin in the game.
- **Jail status** (`is_jailed`): a currently-jailed validator earns nothing until unjailed.
- **Active** (`is_active`): only `is_active: true` validators are in the live signing set.

## APR estimation

The [`staking_apr`](../api/rest/info.md#staking_apr) `/info` query type is **live** —
it returns the effective emission APR the begin-block reward effect actually
applies, plus its committed inputs:

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info -d '{"type":"staking_apr"}'
```

```json
{
  "type": "staking_apr",
  "data": {
    "total_stake":             "1000000",
    "effective_apr":           "0.08",
    "effective_apr_bps":       "800",
    "governance_rate_bps":     800,
    "emission_floor_stake":    "50000000",
    "n_active_validators":     1,
    "current_epoch":           2,
    "is_gross_pre_commission": true
  }
}
```

`effective_apr` is derived from the **stake curve**, not from the governance rate:

```text
effective_apr = 0.08 × √( 50M / max(total_stake, 50M) )
```

i.e. a flat **8%** at/below 50M MTF staked, decaying ∝ 1/√stake above it (more
stake = lower per-staker share). `governance_rate_bps` is committed but **NOT
consumed** by the reward effect — both are surfaced so the divergence is
observable. APR is **gross**, pre per-validator commission (`is_gross_pre_commission: true`).

Net APR for a delegator:

```
net_apr  =  effective_apr  ×  (1 - validator_commission_bps/10_000)
```

## Edge cases

<details>
<summary>Show edge cases</summary>

- **Validator exits while you're unbonding.** Your unbonding stake transfers to the next-in-queue validator at the slash block. You can redelegate post-exit if you prefer a different validator; the lock continues against the new validator.
- **Active set turnover.** If the validator drops out of the active set (their delegations drop below the cutoff), your stake earns no rewards while they're out. You can redelegate to an active validator.
- **Self-bond minimum.** A validator whose self-bond falls below `min_self_bond` (via slashes or withdrawals) gets jailed; delegators don't earn during jail.

</details>

## Sequence — full cycle

```mermaid
sequenceDiagram
    participant U as user
    participant V as validator V
    Note over U,V: T=0 — user delegates 1000 MTF to validator V<br/>active stake on V: prev + 1000
    Note over U,V: T+1 — block-by-block reward accrual:<br/>each block, V earns (emission * V_stake / total_active_stake)<br/>user earns (V_earnings * 1000 / V_stake) * (1 - V_commission)
    U->>V: T+30 days — Claim { V }
    Note over U,V: 18 MTF + 5 USDC paid out (assuming ~18% APR + fee share)
    U->>V: T+30 days + 1s — Undelegate { V, 1000 }
    Note over U,V: stake enters unbonding queue<br/>no further earnings on the 1000
    Note over U,V: T+37 days — unbonding matures
    U->>V: ClaimUnstaked { V }
    Note over U,V: 1000 MTF returned to balance
```

## See also

- [`POST /exchange Delegate / Undelegate / Claim`](../api/rest/exchange.md)  (supported action variants on devnet)
- [`POST /info staking_state`](../api/rest/info.md#staking_state)
- [`POST /info staking_apr`](../api/rest/info.md#staking_apr) — effective emission APR + committed inputs
- [`POST /info protocol_metrics`](../api/rest/info.md#protocol_metrics) — protocol-wide staking aggregates (`staking.*`)
- [Fees](./fees.md) — fee revenue is one of the staking reward sources

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Can I stake and trade simultaneously?**
A: Yes — staked MTF and USDC trading balances are separate sub-balances of the same account.

**Q: Do I need an agent wallet to stake?**
A: No — but you can use one. Agent wallets can call `Delegate` / `Undelegate` / `Claim` (no withdrawal authority required for staking changes).

**Q: Can I cancel an unbonding?**
A: No — once submitted, you wait the full `lock_period`. Redelegate instead if you anticipated needing the stake elsewhere.

**Q: Where do MTF tokens come from at launch?**
A: Genesis allocations + emission per block. See [tokenomics docs] (coming) for distribution. The protocol does not airdrop arbitrarily — emissions are the only ongoing source.

</details>
