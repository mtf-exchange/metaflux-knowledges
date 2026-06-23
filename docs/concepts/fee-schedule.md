---
description: The MetaFlux perpetual fee schedule — volume fee tiers, maker rebate tiers, and staking discount tiers, and how the three combine.
---

# Fee schedule

:::info
**Rate card.** This page is the user-facing schedule of perpetual trading rates.
For the underlying mechanics — how a fee is split, the buyback-and-distribute
flow, and the referrer and builder credits — see [Fees](./fees.md). Tier values
are network parameters and can be updated by governance.
:::

## TL;DR

Your effective perpetual trading rate comes from **three independent tier systems
that stack**:

1. **Fee tiers** — your base taker and maker rate, set by your trailing-30-day
   total traded volume.
2. **Maker rebate tiers** — an additional rebate **subtracted from your maker
   rate**, set by your share of total exchange maker volume. It can push your net
   maker rate **negative** (you get paid to make).
3. **Staking discount tiers** — a percentage discount applied to your **taker rate
   only**, set by how much MTF you have staked.

All three are evaluated continuously and apply together. Referral and builder-code
credits apply separately, on top.

## 1. Fee tiers (volume)

Your base taker and maker rates are set by your **trailing-30-day total traded
volume** (taker + maker, summed across all markets and all of your sub-accounts).

| 30-day volume | Taker | Maker |
|---------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

Volume is measured in USDC notional. The window rolls forward continuously — there
is no monthly snapshot, so a trade that crosses a threshold applies to your next
fill.

## 2. Maker rebate tiers (maker-volume share)

On top of your fee-tier maker rate, you can earn an **additional maker rebate** set
by your **share of total exchange maker volume** over the trailing 30 days. The
rebate is **subtracted** from your maker rate, and can take your net maker rate
below zero — meaning the exchange pays you to provide liquidity.

| Maker-volume share | Additional maker rebate |
|--------------------|------------------------:|
| `≥ 0.5%`           | −0.0010% |
| `≥ 1.5%`           | −0.0020% |
| `≥ 3.0%`           | −0.0030% |

This rebate applies to the **maker rate only**. It does not affect your taker rate.

## 3. Staking discount tiers (MTF staked)

Staking MTF earns a **percentage discount on your taker rate**. The discount is
applied to the taker rate only — it never reduces your maker rate. The ladder is a
**ten-rung administrative grade** evaluated on your **time-weighted effective
weight** (not raw token count — see [Staking](./staking.md) for the multiplier).

| Grade | Effective weight | Taker discount | Slot cap |
|-------|-----------------:|---------------:|----------|
| Section Chief (Township Head)        | `> 100`        | 5%  | uncapped |
| Deputy Section Chief                  | `> 500`        | 8%  | uncapped |
| Division Chief (County Chief)         | `> 2,000`      | 12% | uncapped |
| Deputy Division Chief                 | `> 8,000`      | 15% | uncapped |
| Director-General (Mayor)              | `> 30,000`     | 20% | uncapped |
| Deputy Director-General               | `> 100,000`    | 25% | uncapped |
| Minister (Governor)                   | `> 500,000`    | 32% | uncapped |
| Vice Minister (Vice Governor)         | `> 1,500,000`  | 35% | uncapped |
| State Councilor / Vice Premier        | `> 5,000,000`  | 40% | uncapped |
| Premier / President / General Secretary | `> 10,000,000` **and ranked #1 by weight** | 50% | **1 seat** |

Discounts climb monotonically from **5% to 50%**, thresholds from **100 to
10,000,000**.

### Two tracks: uncapped grades vs the single capped seat

The ladder runs on **two tracks**:

- **Threshold grades (uncapped).** Every grade except the single top grade is a
  pure threshold: clear the effective-weight bar and you hold the grade, with no
  limit on how many accounts can. The **Deputy** grades and **Minister (Governor)**
  are all pure-threshold and uncapped.
- **Competitive seat (capped).** Only the top grade is **capped and competitive** —
  you must both clear the threshold **and** rank high enough:
  - **Premier / President / General Secretary** is the **single #1 account** by
    effective weight among those over `10,000,000`. There is **1 seat**.

  The seat is awarded in **real time**: if the seated holder unstakes or their
  effective weight drops below a contender's, the seat **passes to the
  next-ranked qualifying account immediately**. An account that clears the
  `> 10,000,000` threshold but does not win the seat is held at the **highest
  uncapped grade it qualifies for** (State Councilor / Vice Premier).

See [Staking](./staking.md) for how to stake MTF and how effective weight is
derived. **Flexible (no-lock) staking carries 0× weight** and therefore only ever
reaches the **lowest grade** (Section Chief) and earns **no dividend** — the
deliberate market-maker lane.

## How the three combine

The fee tier sets your **base** taker and maker rates from your volume. The other
two tiers then adjust those bases:

**Effective taker rate** — the staking discount scales the fee-tier taker rate:

```text
effective_taker = fee_tier_taker × (1 − staking_discount)
```

**Effective maker rate** — the maker rebate is subtracted from the fee-tier maker
rate (the staking discount does **not** apply to maker):

```text
effective_maker = fee_tier_maker − maker_rebate
```

A negative `effective_maker` is a rebate paid **to** you.

| Component | Affects taker? | Affects maker? |
|-----------|:--------------:|:--------------:|
| Fee tier (volume)            | base rate | base rate |
| Maker rebate (maker share)   | — | subtracted |
| Staking discount (MTF staked)| multiplied | — |

## Worked examples

**A State Councilor / Vice Premier staker at the base volume tier.**
Your effective weight clears `> 5,000,000` (State Councilor / Vice Premier, 40%
taker discount) but your 30-day volume is under $5M (base fee tier: taker 0.0350%,
maker 0.0100%).

```text
effective_taker = 0.0350% × (1 − 0.40) = 0.0210%
effective_maker = 0.0100% − 0.0000%    = 0.0100%
```

You pay **0.0210% taker** and **0.0100% maker**.

**A top maker at the highest volume tier.**
Your 30-day volume is `≥ $2B` (fee tier: taker 0.0200%, maker 0.0000%) and your
maker-volume share is `≥ 3.0%` (rebate −0.0030%).

```text
effective_maker = 0.0000% − 0.0030% = −0.0030%
```

Your net maker rate is **−0.0030%** — the exchange **pays you 0.0030%** of notional
on every maker fill. Your taker rate stays 0.0200% (less any staking discount).

**Stacking all three.**
Volume `≥ $100M` (taker 0.0250%, maker 0.0040%), maker share `≥ 1.5%` (rebate
−0.0020%), and Director-General (Mayor) staking (20% taker discount):

```text
effective_taker = 0.0250% × (1 − 0.20) = 0.0200%
effective_maker = 0.0040% − 0.0020%    = 0.0020%
```

You pay **0.0200% taker** and **0.0020% maker**.

## On top of the schedule

Referral and builder-code credits apply **separately**, in addition to your
effective rates above:

- **Referral** — when you have a referrer set, a share of your taker fee is routed
  to them out of the protocol's take; it is not an extra charge to you.
- **Builder codes** — an order-flow originator (front-end, aggregator) can claim a
  share when their address is set on the order.

See [Fees](./fees.md) for the full mechanics — how credits are split and how
collected fees fund the MTF buyback that is burned and distributed to stakers.

## Edge cases

<details>
<summary>Show edge cases</summary>

- **Volume across sub-accounts.** A master and all its sub-accounts share one
  30-day volume figure and therefore one fee tier. A desk running many strategies
  under one master gets the aggregate tier.
- **Continuous evaluation.** All three tiers are re-evaluated on a rolling 30-day
  window — there is no monthly cutover. Crossing a threshold applies to your next
  fill.
- **Maker rebate is funded by taker fees.** A negative net maker rate is paid out
  of taker fees collected on the same flow. The exchange never pays out more in
  maker rebates than it takes in.
- **Staking discount, maker rate.** The staking discount applies to taker only. A
  Premier / President / General Secretary staker still pays (or earns) the full
  maker rate; only the taker side is discounted.
- **The top grade is competitive.** Only the top grade (Premier / President /
  General Secretary, 1 seat) is awarded by **rank**, not threshold alone. Clearing
  the threshold is necessary but not sufficient — if the seat is taken you hold
  the highest uncapped grade you qualify for until it frees up. The seat reassigns
  in real time as effective weights move.

</details>

## See also

- [Fees](./fees.md) — fee mechanics, buyback-and-distribute flow, referral and builder credits
- [Staking](./staking.md) — stake MTF to unlock the taker discount tiers
- [Spot trading](./spot-trading.md) — spot fills carry their own per-pair rates
