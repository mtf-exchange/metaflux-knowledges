---
description: The MTF token economic model — utility, fixed supply, allocation and release caps, the fee split, the value-accrual flywheel, staking economics, and governance scope.
---

# Tokenomics

:::info
**Status.** The utility layer (gas, staking discounts, consensus, governance,
fee-driven buyback) is built and live. The economic parameters below — total
supply, allocation, vesting, fee split, and the staking multiplier curve — are
final. Tier thresholds and the fee split are network parameters that governance
can tune within the bounds stated in [Governance](#governance). **Total supply is
fixed and cannot be changed by governance.**
:::

## TL;DR {#tldr}

**MTF** is the native token of MetaFlux — an independent proof-of-stake L1 that
runs a perpetuals DEX core and an EVM sidechain. MTF does five things:

1. **Gas** — pays for execution on the MetaFlux EVM sidechain.
2. **Fee discount** — staking MTF discounts your taker fee by tier.
3. **Security** — staked MTF is the validator stake that secures consensus.
4. **Governance** — staked MTF is the voting weight over protocol parameters.
5. **Value accrual** — 70% of net protocol fees buy MTF on the open market and
   lock it away permanently.

The economic frame is **fee-driven deflation on a fixed supply**. Net trading
fees (after maker rebates and broker/referral credits) are split **70% buyback /
20% stakers / 10% treasury**. The buyback leg buys MTF and removes it from
circulation forever; the staker leg is converted to MTF on the open book and
paid to time-locked stakers. There is no emission schedule and no minting function: total supply is
**1,000,000,000 MTF**, fixed at genesis, and only ever goes down.

## Token utility {#token-utility}

Everything in this section is live.

### 1. Gas on the EVM sidechain {#1-gas-on-the-evm-sidechain}

MTF is the gas token of the MetaFlux EVM sidechain. It is an 18-decimal asset at
the EVM layer; every deployment and transaction on the sidechain is metered and
paid in MTF. The DEX core and the sidechain share one native asset, so demand for
on-chain compute is demand for MTF.

### 2. Staking → taker-fee discount {#2-staking--taker-fee-discount}

Staking MTF grants a discount on your **taker** fee, scaled across ten tiers up
to 50%:

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
| Tier 10 | `> 10,000,000` **and ranked #1** | 50% | **1 seat** |

Tiers 1–9 are pure thresholds. Tier 10 is a single competitive seat, reassigned
in real time to whichever account holds the highest effective weight. The
discount applies to the taker rate only and stacks with volume-based fee tiers
and maker-rebate tiers. Full rate card on the
[Fee schedule](./fee-schedule.md#3-staking-discount-tiers-mtf-staked).

Thresholds are denominated in **effective weight**, not raw tokens — see
[Time-weighted staking](#time-weighted-staking-ve-style). Flexible (no-lock)
stakers reach Tier 1 only, regardless of size.

### 3. Staking → revenue-share {#3-staking--revenue-share}

Locked stakers (≥ 1-month lock) receive **20% of net fee revenue**. The share
accrues in the quote asset to the validator pool, which periodically buys MTF on
the open book; that MTF is distributed through your validator pro-rata by
effective weight. It is a separate purchase from the 70% buyback leg — bought
MTF that is paid out, not locked. Flexible stakers earn no revenue-share. This is
the only staking yield at steady state; nothing is minted to pay it.

**Why MTF rather than the quote asset.** Paying lockers in USDC would be a cash
yield that never touches the token. Paying in MTF means **90% of net fees are
market buys of MTF** — 70% locked forever, 20% delivered to lockers — a locker
can compound by restaking, and there is one reward bucket and one claim path
shared with the bootstrap rewards. The cost is that reward MTF is liquid while
the principal is locked: a locker who wants cash sells the reward, not the stake.

### 4. Staking → consensus security {#4-staking--consensus-security}

MetaFlux is proof-of-stake. Validators self-bond MTF and accept delegations; the
active set, proposal weight, and vote weight are derived from committed stake.
Double-signing, downtime, and voting an invalid fork are slashed. See
[Staking](./staking.md).

### 5. Staking → governance weight {#5-staking--governance-weight}

Staked MTF is the voting weight over protocol parameters. See
[Governance](#governance).

### 6. Fee value accrual → buyback & permanent lock {#6-fee-value-accrual--buyback--permanent-lock}

After maker rebates and broker/referral credits are paid off the top, net fee
revenue is split three ways in the quote asset. The 70% buyback leg buys MTF on
the open market — up to a manipulation-resistant, governance-anchored price
ceiling, in slices rather than single orders — and sends every token acquired to
a keyless address. The deflation rate is a direct function of trading volume.
Details under [Value accrual](#value-accrual--flywheel) and on
[Fees](./fees.md#where-fees-go).

## Supply & allocation {#supply--allocation}

### Total supply {#total-supply}

**1,000,000,000 MTF, fixed.** There is no mint function in the protocol and
governance has no supply lever. The only supply-changing operation is the buyback
lock, which reduces circulating supply permanently.

### Genesis allocation {#genesis-allocation}

| Bucket | Share | Tokens | Unlock | Purpose |
|--------|------:|-------:|--------|---------|
| **Community airdrop** | 30% | 300,000,000 | 100% claimable at TGE on mainnet; optional lock bonus (see below) | Active traders, market makers, and points-program participants from the 6-month testnet |
| **Core contributors** | 20% | 200,000,000 | 12-month cliff, then 72-month linear | Founders and core team. Zero unlock in year one. |
| **Liquidity & market making** | 12% | 120,000,000 | Governance-released; ≤ 6% of bucket per quarter | Protocol-owned liquidity vault seed ([MIP-2](../mip/mip-2.md)), market-maker token loans |
| **Validator bootstrap** | 8% | 80,000,000 | Emitted via the stake-curve reward schedule, sized to a 36-month runway | Early staking APR before fee revenue carries the yield |
| **Ecosystem & incentives** | 20% | 200,000,000 | ≤ 5% of total supply per year (50,000,000 MTF/yr cap) | Airdrop lock bonus, builder/integrator grants, trading incentives, future distribution rounds |
| **Treasury** | 10% | 100,000,000 | ≤ 3% of total supply per year (30,000,000 MTF/yr cap) | Protocol reserve, governance-controlled |
| **Total** | **100%** | **1,000,000,000** | | |

Notes:

- **No private sale, no VC allocation.** There are no investor tokens with a
  lower cost basis than the community.
- **Contributors are locked longest.** Nothing unlocks in year one; the 72-month
  linear tail keeps the team aligned well past launch.
- **Release caps are hard-coded.** The per-year and per-quarter caps on the
  liquidity, ecosystem, and treasury buckets are protocol parameters that
  governance can lower but not raise.

### Airdrop lock bonus {#airdrop-lock-bonus}

The 30% airdrop is fully claimable at TGE. Claimants may instead commit their
allocation to a ve-lock at claim time and receive a bonus, funded from the
Ecosystem & incentives bucket:

| Choice at claim | Bonus | Lock |
|-----------------|------:|------|
| Claim now | — | none |
| Lock 6 months | +25% | 6-month ve-lock, 2.5× weight |
| Lock 24 months | +50% | 24-month ve-lock, 4.0× weight |

The bonus pool is capped at **60,000,000 MTF** (6% of supply). If total bonus
demand exceeds the cap, bonuses scale down pro-rata; the base allocation is never
reduced. Locked airdrop tokens earn the fee discount and revenue-share from day
one like any other locked stake.

### Circulating-supply trajectory {#circulating-supply-trajectory}

```text
genesis            : 1,000,000,000 MTF, fixed

TGE (mainnet)      : 300M airdrop claimable (locked portion earns bonus, out of float)
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

The design intent is that buyback removal exceeds the total unlock rate well
before contributor vesting completes. The maximum unlock rate from the table
above is roughly 170M MTF/yr (contributors ~33M, ecosystem 50M, treasury 30M,
bootstrap ~27M, liquidity ~29M). At the 2.5 bps assumption in
[Implied buyback yield](#implied-buyback-yield), the buyback overtakes that once
average daily volume exceeds roughly **2.7 billion × the MTF price in USD** —
about $270M/day at $0.10, or $800M/day at $0.30.

## Emission & inflation {#emission--inflation}

**There is none.** Staking yield comes from two non-dilutive sources:

1. **Validator bootstrap (early):** the 80M bucket emits along a stake curve —
   flat at or below a floor stake, decaying as `1/√stake` above it — so the
   budget lasts longer when more is staked. Current APR and its inputs are
   readable from the live [`staking_state`](./staking.md#apr-estimation) path.
2. **Revenue-share (ongoing):** 20% of net fee revenue, converted to MTF on the
   book and paid to locked stakers via validators.

The trade-off is explicit: if fee revenue does not grow to carry the yield
before the bootstrap budget is drawn down, headline APR falls. Yield is earned
from volume, not printed.

## Value accrual & flywheel {#value-accrual--flywheel}

### The flow {#the-flow}

1. **Collect trading fees** in the quote asset on every fill.
2. **Pay maker rebates and broker/referral credits** off the top. The remainder
   is **net fee revenue**.
3. **Split net fee revenue** in the quote asset:

| Destination | Share | What happens |
|-------------|------:|--------------|
| **Buyback** | 70% | Executor buys MTF on the open market in slices, up to the governance-anchored price ceiling; every token bought is sent to a keyless address. |
| **Stakers** | 20% | Accrues in the quote asset to the validator pool, which periodically buys MTF on the book; validators take commission and pass the rest to their locked delegators pro-rata by effective weight. |
| **Treasury** | 10% | Protocol reserve in the quote asset, governance-controlled. |

The executor must be told which asset id is MTF before it can buy at all, and it
spends its balance in slices rather than one order — see
[Fees](./fees.md#buyback-asset-binding) for both votes.

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

Three reinforcing rings:

- **Lock ring.** Volume → fees → buyback → MTF permanently removed. Primary
  value-accrual path; live.
- **Yield ring.** Volume → validator pool buys MTF → MTF yield to locked stakers →
  incentive to acquire and lock → less float.
- **Security ring.** Locked MTF secures consensus; a more valuable token is a
  more expensive chain to attack, which makes the venue safer to trade on.

The protocol-owned liquidity vault ([MIP-2](../mip/mip-2.md)) provides resting
depth from day one so the flywheel can start before external market makers
arrive.

### Implied buyback yield {#implied-buyback-yield}

The model is only as good as the volume it attracts. The table below shows what
the 70% buyback leg does at different volume levels, assuming a blended net fee
rate of **2.5 bps** of notional after rebates and credits. It is a calculator,
not a forecast.

| Avg daily volume | Annual net fee revenue | Annual buyback (70%) | Buyback yield at $200M circulating cap | at $1B |
|-----------------:|-----------------------:|---------------------:|---------------------------------------:|-------:|
| $100M | $9.1M   | $6.4M   | 3.2%   | 0.6%  |
| $500M | $45.6M  | $31.9M  | 16.0%  | 3.2%  |
| $2B   | $182.5M | $127.8M | 63.9%  | 12.8% |
| $5B   | $456.3M | $319.4M | 159.7% | 31.9% |

Buyback yield = annual buyback ÷ circulating market cap. It measures how fast
the float is being retired at a given valuation. The 20% staker leg is a second
buy flow on top of this — MTF bought on the book and paid out to locked holders.

## Staking {#staking}

Full operational detail on the [Staking](./staking.md) page. Economics summary:

| Benefit | Source | Notes |
|---------|--------|-------|
| Taker-fee discount | Ten-tier ladder by effective weight | 5% → 50% |
| Revenue-share | 20% of net fees, converted to MTF, via validator | Locked stakers only |
| Bootstrap yield | 80M validator bucket, stake curve | Early period |
| Consensus weight | Validator stake / delegation | Slashable |
| Governance weight | Staked MTF | See below |

### Time-weighted staking (ve-style) {#time-weighted-staking-ve-style}

```text
effective_weight = staked_amount × time_multiplier(committed_lock_duration)
```

| Stake mode | Multiplier | Fee discount | Revenue-share |
|------------|-----------:|--------------|---------------|
| Flexible (no lock) | 0× | Tier 1 only | none |
| Lock 1 month | 1.0× | Full ladder | yes |
| Lock 6 months | 2.5× | Full ladder | larger slice |
| Lock 24 months (cap) | 4.0× | Full ladder | largest slice |

The multiplier rises continuously between the marked points. It is set by the
lock duration you **commit to upfront** and applies in full after the universal
24-hour activation delay — you do not wait out the lock to reach the tier. You
cannot unstake before the committed term elapses.

**Flexible staking is the market-maker lane.** It grants the Tier 1 discount on
taker flow with no lock, at the cost of zero revenue-share. Capital that will not
commit time gets a fee break but not a cut of the revenue.

### Worked example {#worked-example}

A whale stakes 2,000,000 MTF:

```text
flexible : 2,000,000 × 0×   → Tier 1 only, no revenue-share
1-month  : 2,000,000 × 1.0× = 2,000,000 → Tier 8 (35%)
6-month  : 2,000,000 × 2.5× = 5,000,000 → not strictly > 5,000,000; still Tier 8
24-month : 2,000,000 × 4.0× = 8,000,000 → Tier 9 (40%)
```

Tier 10 requires clearing 10,000,000 effective weight **and** being ranked #1. A
holder above 10M who is not #1 sits at Tier 9. The seat reassigns in real time.

### Timing model {#timing-model}

| Concept | What it is | Floor |
|---------|------------|-------|
| Committed lock | Term chosen at stake time; sets multiplier; no early exit | flexible, else ≥ 1 month |
| Activation delay | Universal delay before benefits turn on | 24h (code-level floor) |
| Exit cooldown | Unbonding period after lock elapses | 24h (code-level floor) |

Governance can raise the network-set durations, never lower them below 24h.

| State | Earns benefits? | Slashable? |
|-------|:---------------:|:----------:|
| Activating (first 24h) | no | yes |
| Active & locked | yes | yes |
| Unbonding | no | yes |
| Unbonded (claimable) | no | no |

## Governance {#governance}

Staked MTF is the voting weight. Governance moves protocol parameters, not user
funds.

**In scope:** fee tiers and rebate tiers; staking-discount thresholds; the fee
split (within the bounds below); risk and margin parameters; oracle weighting;
market listings; liquidity-vault provider whitelist; releases from the liquidity,
ecosystem, and treasury buckets within their caps.

**Bounded parameters:** the buyback share of net fees cannot be set below 50%;
bucket release caps can be lowered but not raised; activation and unbonding
floors cannot go below 24h.

**Out of scope:** governance cannot mint MTF (there is no mint function), cannot
alter total supply, cannot raise contributor unlock speed, cannot seize user
balances or positions, and cannot alter past committed state.

Actions require a stake-weighted quorum; jailed validators are excluded from the
tally.

## See also {#see-also}

- [Fees](./fees.md) — the fee split and the buyback mechanics
- [Fee schedule](./fee-schedule.md) — the volume, maker-rebate, and staking-discount rate card
- [Staking](./staking.md) — validators, delegators, slashing, unbonding, APR
- [MIP-2 Metaliquidity](../mip/mip-2.md) — the protocol-owned liquidity vault
- [Vaults](./vaults.md) — the protocol-operated and user vault families
- [Glossary](./glossary.md) — protocol-specific terms

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is total supply final?**
A: Yes. 1,000,000,000 MTF, fixed at genesis, no mint function.

**Q: Is MTF inflationary?**
A: No. Nothing is minted after genesis. Staking yield comes from a finite
bootstrap bucket and from fee revenue.

**Q: What does the 20% revenue-share pay in?**
A: MTF. The validator share accrues in the quote asset, is converted to MTF on
the book, and is paid out through your validator's `claim_rewards`. See
[Staking](./staking.md#reward-sources).

**Q: Can I take the airdrop without locking?**
A: Yes, 100% of your base allocation is claimable at TGE. Locking is optional and
earns a bonus.

**Q: I'm a market maker — can I stake without locking?**
A: Yes. Flexible staking gives the Tier 1 discount with no lock and no
revenue-share.

**Q: Does my multiplier grow over time?**
A: No. It is set by the lock you commit to upfront and applies in full after 24h.

**Q: Can a whale buy Tier 10 with size alone?**
A: No. Tiers are keyed on effective weight, and Tier 10 is a single seat that
also requires ranking #1.

**Q: Do I need MTF to trade?**
A: No. MTF is required for sidechain gas; the perp core does not require holding
it.

</details>
