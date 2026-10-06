---
description: "The MTF token economic model: utility, fixed supply, allocation and release caps, the fee split, the value-accrual flywheel, staking economics, and governance scope."
---

# Tokenomics

This page describes the MTF token: its uses, its supply, how fees flow back to it and how staking works.

:::info
**Status.** The utility layer is built and active. It covers gas, staking discounts, consensus,
governance and the fee-driven buyback. The economic parameters below are final: total supply,
allocation, vesting, fee split and the staking multiplier curve. Tier thresholds and the fee
split are network parameters. Governance can tune them within the bounds in
[Governance](#governance). On mainnet, total supply is fixed and governance cannot change
it. Testnet differs. See [Total supply](#total-supply).
:::

## Overview {#tldr}

*MTF* is the native token of MetaFlux. MetaFlux is an independent proof-of-stake L1 that runs a
perpetuals DEX core and an EVM sidechain. MTF has five uses:

1. Gas: it pays for execution on the MetaFlux EVM sidechain.
2. Fee discount: staked MTF discounts your taker fee by tier.
3. Security: staked MTF is the validator stake that secures consensus.
4. Governance: staked MTF is the voting weight over protocol parameters.
5. Value accrual: 70% of net protocol fees buy MTF on the open market and lock it away
   permanently.

The economic frame is fee-driven deflation on a fixed supply. The protocol splits net trading
fees, after maker rebates and broker and referral credits, 70% buyback, 20% stakers and 10%
treasury. The buyback leg buys MTF and removes it from circulation forever. The staker leg is
converted to MTF on the open book and paid to time-locked stakers. There is no emission schedule
and no minting function. Total supply is 1,000,000,000 MTF, fixed at genesis, and it only goes
down.

## Token utility {#token-utility}

Everything in this section is active.

### Gas on the EVM sidechain {#1-gas-on-the-evm-sidechain}

MTF is the gas token of the MetaFlux EVM sidechain. It is an 18-decimal asset at the EVM layer.
Every deployment and transaction on the sidechain is metered and paid in MTF. The DEX core and
the sidechain share one native asset, so demand for on-chain compute is demand for MTF.

### Taker-fee discount {#2-staking--taker-fee-discount}

Staking MTF gives a discount on your taker fee. The discount scales across ten tiers, up to 50%:

| Tier | Effective-weight threshold | Taker discount | Seats |
|------|---------------------------:|---------------:|-------|
| Tier 1  | `> 100`        | 5%  | uncapped |
| Tier 2  | `> 500`        | 8%  | uncapped |
| Tier 3  | `> 2,000`      | 12% | uncapped |
| Tier 4  | `> 8,000`      | 15% | uncapped |
| Tier 5  | `> 30,000`     | 20% | uncapped |
| Tier 6  | `> 100,000`    | 25% | uncapped |
| Tier 7  | `> 500,000`    | 32% | uncapped |
| Tier 8  | `> 1,500,000`  | 35% | uncapped |
| Tier 9  | `> 5,000,000`  | 40% | uncapped |
| Tier 10 | `> 10,000,000` and ranked #1 | 50% | 1 seat |

Tiers 1 to 9 are plain thresholds. Tier 10 is one competitive seat. The chain reassigns it in
real time to the account with the highest effective weight. The discount applies to the taker
rate only. It stacks with volume-based fee tiers and maker-rebate tiers. The full rate card is on
the [fee schedule](./fee-schedule.md#3-staking-discount-tiers-mtf-staked).

Thresholds use *effective weight*, not raw tokens. See
[Time-weighted staking](#time-weighted-staking-ve-style). Flexible (no-lock) stakers reach Tier 1
only, whatever their size.

### Revenue share {#3-staking--revenue-share}

Locked stakers (a lock of 1 month or more) receive 20% of net fee revenue. The share accrues in
the quote asset to the validator pool. The pool buys MTF on the open book from time to time. The
chain distributes that MTF through your validator, pro rata by effective weight. This purchase is
separate from the 70% buyback leg. The bought MTF is paid out, not locked. Flexible stakers earn
no revenue share. This is the only staking yield at steady state. Nothing is minted to pay it.

The share pays in MTF, not in the quote asset, for three reasons:

- 90% of net fees become market buys of MTF: 70% locked forever and 20% delivered to lockers. A
  cash yield in USDC would never touch the token.
- A locker can compound by restaking.
- One reward bucket and one claim path serve this share and the bootstrap rewards.

The cost is that reward MTF is liquid while the principal is locked. A locker who wants cash
sells the reward, not the stake.

### Consensus security {#4-staking--consensus-security}

MetaFlux is proof-of-stake. Validators self-bond MTF and accept delegations. The chain derives
the active set, proposal weight and vote weight from committed stake. The chain slashes
double-signing, downtime and a vote for an invalid fork. See [Staking](./staking.md).

### Governance weight {#5-staking--governance-weight}

Staked MTF is the voting weight over protocol parameters. See [Governance](#governance).

### Buyback and permanent lock {#6-fee-value-accrual--buyback--permanent-lock}

The protocol pays maker rebates and broker and referral credits off the top. It then splits net
fee revenue three ways in the quote asset. The 70% buyback leg buys MTF on the open market, in
slices and up to a governance-anchored price ceiling that resists manipulation. It sends every
token it buys to a keyless address. The deflation rate is a direct function of trading volume.
For details, see [Value accrual](#value-accrual--flywheel) and
[Fees](./fees.md#where-fees-go).

## Supply and allocation {#supply--allocation}

### Total supply {#total-supply}

Total supply is 1,000,000,000 MTF, fixed. On mainnet there is no mint function, and governance
has no supply lever. The only operation that changes supply is the buyback lock. It reduces
circulating supply permanently.

:::note Testnet is different
On testnet, operators can mint MTF, burn MTF and adjust test balances by a validator vote. They
use these votes to run the network, for example to fund validator stakes and the faucet reserve.
So the testnet MTF supply is not the mainnet design. It reads 1,404,890,000 on 2026-09-26. Read
the current value in `tokens[*].total_supply` on
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta). These votes do not exist on
mainnet.
:::

### Genesis allocation {#genesis-allocation}

| Bucket | Share | Tokens | Unlock | Purpose |
|--------|------:|-------:|--------|---------|
| Community airdrop | 30% | 300,000,000 | The points-program allocation is 100% claimable at TGE on mainnet, with an optional lock bonus (see below). The unallocated rest stays reserved. | Testnet points program (genesis to TGE, at most 100,000,000 MTF; see [Points](points.md)). The other 200,000,000 MTF is reserved and unallocated. |
| Core contributors | 20% | 200,000,000 | 12-month cliff, then 72-month linear | Founders and core team. Zero unlock in year one. |
| Liquidity and market making | 12% | 120,000,000 | Governance-released; ≤ 6% of bucket per quarter | Protocol-owned liquidity vault seed ([MIP-2](../mip/mip-2.md)), market-maker token loans |
| Validator bootstrap | 8% | 80,000,000 | Emitted via the stake-curve reward schedule, sized to a 36-month runway | Early staking APR before fee revenue carries the yield |
| Ecosystem and incentives | 20% | 200,000,000 | ≤ 5% of total supply per year (50,000,000 MTF/yr cap) | Airdrop lock bonus, builder and integrator grants, trading incentives, future distribution rounds |
| Treasury | 10% | 100,000,000 | ≤ 3% of total supply per year (30,000,000 MTF/yr cap) | Protocol reserve, governance-controlled |
| Total | 100% | 1,000,000,000 | | |

- There is no private sale and no VC allocation. No investor holds tokens at a lower cost basis
  than the community.
- Contributors are locked longest. Nothing unlocks in year one. The 72-month linear tail keeps
  the team aligned well past launch.
- The release caps are hard-coded. The per-year and per-quarter caps on the liquidity, ecosystem
  and treasury buckets are protocol parameters. Governance can lower them but not raise them.

### Airdrop lock bonus {#airdrop-lock-bonus}

The points-program allocation is fully claimable at TGE. A claimant can instead commit the
allocation to a ve-lock at claim time. The claimant then receives a bonus, funded from the
ecosystem and incentives bucket:

| Choice at claim | Bonus | Lock |
|-----------------|------:|------|
| Claim now | — | none |
| Lock 6 months | +25% | 6-month ve-lock, 2.5× weight |
| Lock 24 months | +50% | 24-month ve-lock, 4.0× weight |

The bonus pool is capped at 60,000,000 MTF (6% of supply). If total bonus demand exceeds the
cap, bonuses scale down pro rata. The base allocation is never reduced. Locked airdrop tokens
earn the fee discount and the revenue share from day one, like any other locked stake.

### Circulating-supply trajectory {#circulating-supply-trajectory}

```text
genesis            : 1,000,000,000 MTF, fixed

TGE (mainnet)      : up to 100M points MTF claimable (locked portion earns bonus, out of float)
                     the other 200M of the airdrop bucket stays reserved
                     liquidity bucket begins quarterly releases
                     validator bootstrap begins emitting on the stake curve

year 1             : contributor cliff — zero contributor unlock
                     float growth = airdrop claims + liquidity releases + bootstrap
                     + ecosystem/treasury releases (capped)

month 12           : contributor 72-month linear vesting begins

years 2–7          : contributor unlock ~2.8M MTF/month
                     bucket releases continue only under caps and governance vote

steady state       : buyback lock outpaces residual unlocks; float shrinks
```

The design intent is that buyback removal exceeds the total unlock rate well before contributor
vesting completes. The maximum unlock rate from the table above is roughly 170M MTF/yr:
contributors ~33M, ecosystem 50M, treasury 30M, bootstrap ~27M and liquidity ~29M. At the 2.5 bps
assumption in [Implied buyback yield](#implied-buyback-yield), the buyback overtakes that rate
once average daily volume exceeds roughly 2.7 billion times the MTF price in USD. That is about
$270M/day at $0.10, or $800M/day at $0.30.

## Emission and inflation {#emission--inflation}

There is none. Staking yield comes from two non-dilutive sources:

1. Validator bootstrap (early). The 80M bucket emits along a stake curve. The curve is flat at or
   below a floor stake and decays as `1/√stake` above it, so the budget lasts longer when more
   MTF is staked. Read the current APR and its inputs from the current
   [`staking_state`](./staking.md#apr-estimation) path.
2. Revenue share (ongoing). 20% of net fee revenue, converted to MTF on the book and paid to
   locked stakers through validators.

The trade-off is explicit. If fee revenue does not grow to carry the yield before the bootstrap
budget runs down, headline APR falls. Volume earns the yield. Nothing prints it.

## Value accrual and flywheel {#value-accrual--flywheel}

### Fee flow {#the-flow}

1. The chain collects trading fees in the quote asset on every fill.
2. The protocol pays maker rebates and broker and referral credits off the top. The remainder is
   net fee revenue.
3. The protocol splits net fee revenue in the quote asset:

| Destination | Share | What happens |
|-------------|------:|--------------|
| Buyback | 70% | The executor buys MTF on the open market in slices, up to the governance-anchored price ceiling. It sends every token it buys to a keyless address. |
| Stakers | 20% | Accrues in the quote asset to the validator pool. The pool buys MTF on the book from time to time. Validators take commission and pass the rest to their locked delegators, pro rata by effective weight. |
| Treasury | 10% | Protocol reserve in the quote asset, governance-controlled. |

The executor must know which asset id is MTF before it can buy. It spends its balance in slices,
not in one order. See [Fees](./fees.md#buyback-asset-binding) for both votes.

```text
TRADERS ──fees──▶ COLLECTED FEES
                       │ maker rebates + broker/referral credits off the top
                       ▼
                  NET FEE REVENUE (quote asset)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   70% BUYBACK    20% STAKERS    10% TREASURY
   buys MTF,      buys MTF,      quote-asset
   locks forever  pays lockers   reserve
        │         (via validators)
        ▼
   FLOAT SHRINKS ──▶ scarcity + real yield ──▶ demand to hold & lock
```

Three rings reinforce each other:

- Lock ring. Volume produces fees, fees fund the buyback, and the buyback removes MTF
  permanently. This is the primary value-accrual path. It is active.
- Yield ring. Volume funds the validator pool, the pool buys MTF, locked stakers earn that MTF,
  and the yield gives a reason to acquire and lock. Less MTF stays in the float.
- Security ring. Locked MTF secures consensus. A more valuable token makes the chain more
  expensive to attack, which makes the venue safer to trade on.

The protocol-owned liquidity vault ([MIP-2](../mip/mip-2.md)) provides resting depth from day
one. The flywheel can start before external market makers arrive.

### Implied buyback yield {#implied-buyback-yield}

The model is only as good as the volume it attracts. The table below shows what the 70% buyback
leg does at different volume levels. It assumes a blended net fee rate of 2.5 bps of notional
after rebates and credits. It is a calculator, not a forecast.

| Avg daily volume | Annual net fee revenue | Annual buyback (70%) | Buyback yield at $200M circulating cap | at $1B |
|-----------------:|-----------------------:|---------------------:|---------------------------------------:|-------:|
| $100M | $9.1M   | $6.4M   | 3.2%   | 0.6%  |
| $500M | $45.6M  | $31.9M  | 16.0%  | 3.2%  |
| $2B   | $182.5M | $127.8M | 63.9%  | 12.8% |
| $5B   | $456.3M | $319.4M | 159.7% | 31.9% |

Buyback yield is the annual buyback divided by the circulating market cap. It measures how fast
the buyback retires the float at a given valuation. The 20% staker leg is a second buy flow on
top of this. It buys MTF on the book and pays it to locked holders.

## Staking {#staking}

The [Staking](./staking.md) page has the full operational detail. This table summarizes the
economics:

| Benefit | Source | Notes |
|---------|--------|-------|
| Taker-fee discount | Ten-tier ladder by effective weight | 5% to 50% |
| Revenue share | 20% of net fees, converted to MTF, via validator | Locked stakers only |
| Bootstrap yield | 80M validator bucket, stake curve | Early period |
| Consensus weight | Validator stake and delegation | Slashable |
| Governance weight | Staked MTF | See [Governance](#governance) |

### Time-weighted staking {#time-weighted-staking-ve-style}

```text
effective_weight = staked_amount × time_multiplier(committed_lock_duration)
```

| Stake mode | Multiplier | Fee discount | Revenue share |
|------------|-----------:|--------------|---------------|
| Flexible (no lock) | 0× | Tier 1 only | none |
| Lock 1 month | 1.0× | Full ladder | yes |
| Lock 6 months | 2.5× | Full ladder | larger slice |
| Lock 24 months (cap) | 4.0× | Full ladder | largest slice |

The multiplier rises continuously between the marked points. The lock duration you commit to
upfront sets it. It applies in full after the universal 24-hour activation delay, so you do not
wait out the lock to reach the tier. You cannot unstake before the committed term ends.

Flexible staking is the market-maker lane. It gives the Tier 1 discount on taker flow with no
lock, and it pays no revenue share. Capital that does not commit time gets a fee break but no
cut of the revenue.

### Worked example {#worked-example}

A holder stakes 2,000,000 MTF:

```text
flexible : 2,000,000 × 0×   → Tier 1 only, no revenue-share
1-month  : 2,000,000 × 1.0× = 2,000,000 → Tier 8 (35%)
6-month  : 2,000,000 × 2.5× = 5,000,000 → not strictly > 5,000,000; still Tier 8
24-month : 2,000,000 × 4.0× = 8,000,000 → Tier 9 (40%)
```

Tier 10 needs more than 10,000,000 effective weight and the #1 rank. A holder above 10M who is
not #1 sits at Tier 9. The seat reassigns in real time.

### Timing model {#timing-model}

| Concept | What it is | Floor |
|---------|------------|-------|
| Committed lock | Term chosen at stake time. It sets the multiplier. No early exit | flexible, else ≥ 1 month |
| Activation delay | Universal delay before benefits turn on | 24h (code-level floor) |
| Exit cooldown | Unbonding period after the lock ends | 24h (code-level floor) |

Governance can raise the network-set durations. It cannot lower them below 24h.

| State | Earns benefits? | Slashable? |
|-------|:---------------:|:----------:|
| Activating (first 24h) | no | yes |
| Active and locked | yes | yes |
| Unbonding | no | yes |
| Unbonded (claimable) | no | no |

## Governance {#governance}

Staked MTF is the voting weight. Governance moves protocol parameters. It does not move user
funds.

In scope:

- fee tiers and rebate tiers
- staking-discount thresholds
- the fee split, within the bounds below
- risk and margin parameters
- oracle weighting
- market listings
- the liquidity-vault provider whitelist
- releases from the liquidity, ecosystem and treasury buckets, within their caps

Bounded parameters:

- The buyback share of net fees cannot go below 50%.
- Bucket release caps can be lowered but not raised.
- Activation and unbonding floors cannot go below 24h.

Out of scope on mainnet: governance cannot mint MTF, because there is no mint function. It
cannot alter total supply. It cannot raise the contributor unlock speed. It cannot seize or lower
user balances or positions. It cannot alter past committed state. Testnet has operator votes that
change supply and test balances. See [Total supply](#total-supply).

An action needs a stake-weighted quorum. The tally excludes jailed validators.

## See also {#see-also}

- [Fees](./fees.md): the fee split and the buyback mechanics
- [Fee schedule](./fee-schedule.md): the volume, maker-rebate and staking-discount rate card
- [Staking](./staking.md): validators, delegators, slashing, unbonding and APR
- [MIP-2 Metaliquidity](../mip/mip-2.md): the protocol-owned liquidity vault
- [Vaults](./vaults.md): the protocol-operated and user vault families
- [Glossary](./glossary.md): protocol-specific terms

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is total supply final?**
A: On mainnet, yes. It is 1,000,000,000 MTF, fixed at genesis, with no mint function. The
testnet supply is different. See [Total supply](#total-supply).

**Q: Is MTF inflationary?**
A: Not on mainnet. Nothing is minted after genesis there. Staking yield comes from a finite
bootstrap bucket and from fee revenue.

**Q: What does the 20% revenue share pay in?**
A: MTF. The validator share accrues in the quote asset. The chain converts it to MTF on the book
and pays it out through your validator's `claim_rewards`. See
[Staking](./staking.md#reward-sources).

**Q: Can I take the airdrop without locking?**
A: Yes. 100% of your base allocation is claimable at TGE. Locking is optional and earns a bonus.

**Q: I am a market maker. Can I stake without locking?**
A: Yes. Flexible staking gives the Tier 1 discount with no lock and no revenue share.

**Q: Does my multiplier grow over time?**
A: No. The lock you commit to upfront sets it, and it applies in full after 24h.

**Q: Can a large holder buy Tier 10 with size alone?**
A: No. Tiers key on effective weight. Tier 10 is one seat that also needs the #1 rank.

**Q: Do I need MTF to trade?**
A: No. MTF is required for sidechain gas. The perp core does not require you to hold it.

</details>
