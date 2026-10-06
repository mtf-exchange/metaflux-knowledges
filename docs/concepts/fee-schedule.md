---
description: The MetaFlux perpetual fee schedule, with volume fee tiers, maker rebate tiers and staking discount tiers, and how the three combine.
---

# Fee schedule

This page gives the perpetual trading rates and how the three tier systems combine.

:::info
This page is the user-facing schedule of perpetual trading rates. [Fees](./fees.md)
describes the mechanics: how a fee is split, the buyback-and-lock flow, and the
referrer and broker credits. Tier values are network parameters. Governance can
change them.
:::

## Summary {#tldr}

Your effective perpetual trading rate comes from three independent tier systems
that stack:

1. **Fee tiers.** Your base taker and maker rate. Your trailing 30-day total
   traded volume sets it.
2. **Maker rebate tiers.** An additional rebate that is subtracted from your
   maker rate. Your share of total exchange maker volume sets it. It can make
   your net maker rate negative: the exchange then pays you to make.
3. **Staking discount tiers.** A percentage discount on your taker rate only. The
   amount of MTF that you stake sets it.

The exchange evaluates all three continuously, and they apply together.
Referral and broker-code credits apply separately, on top.

## 1. Fee tiers (volume) {#1-fee-tiers-volume}

Your trailing 30-day total traded volume sets your base taker and maker rates.
The volume is taker plus maker, summed across all markets and all of your
sub-accounts.

| 30-day volume | Taker | Maker |
|---------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

Volume is measured in USDC notional. The window rolls forward continuously.
There is no monthly snapshot, so a trade that crosses a threshold applies to
your next fill.

## 2. Maker rebate tiers (maker-volume share) {#2-maker-rebate-tiers-maker-volume-share}

In addition to your fee-tier maker rate, you can earn an additional maker
rebate. Your share of total exchange maker volume over the trailing 30 days sets
it. The rebate is subtracted from your maker rate. It can take your net maker
rate below zero: the exchange then pays you to provide liquidity.

| Maker-volume share | Additional maker rebate |
|--------------------|------------------------:|
| `≥ 0.5%`           | −0.0010% |
| `≥ 1.5%`           | −0.0020% |
| `≥ 3.0%`           | −0.0030% |

This rebate applies to the maker rate only. It does not change your taker rate.

## 3. Staking discount tiers (MTF staked) {#3-staking-discount-tiers-mtf-staked}

Staked MTF gives a percentage discount on your taker rate. The discount applies
to the taker rate only. It never reduces your maker rate. The ladder has ten
tiers. The exchange evaluates it on your time-weighted *effective weight*, not
on the raw token count. See [Staking](./staking.md) for the multiplier.

| Tier | Effective weight | Taker discount | Slot cap |
|-------|-----------------:|---------------:|----------|
| Tier 1 | `> 100`        | 5%  | uncapped |
| Tier 2 | `> 500`        | 8%  | uncapped |
| Tier 3 | `> 2,000`      | 12% | uncapped |
| Tier 4 | `> 8,000`      | 15% | uncapped |
| Tier 5 | `> 30,000`     | 20% | uncapped |
| Tier 6 | `> 100,000`    | 25% | uncapped |
| Tier 7 | `> 500,000`    | 32% | uncapped |
| Tier 8 | `> 1,500,000`  | 35% | uncapped |
| Tier 9 | `> 5,000,000`  | 40% | uncapped |
| Tier 10 | `> 10,000,000` **and ranked #1 by weight** | 50% | **1 seat** |

Discounts increase monotonically from 5% to 50%. Thresholds increase from 100
to 10,000,000.

### Uncapped tiers and the capped seat {#two-tracks-uncapped-grades-vs-the-single-capped-seat}

The ladder has two tracks:

- **Threshold tiers (uncapped).** Tier 1 to Tier 9 are only thresholds. When
  your effective weight clears the threshold, you hold the tier. There is no
  limit on the number of accounts in a tier.
- **Competitive seat (capped).** Only Tier 10 is capped and competitive. You
  must clear the threshold and also rank high enough:
  - Tier 10 is the single #1 account by effective weight among the accounts
    over `10,000,000`. There is 1 seat.

  The exchange awards the seat in real time. If the holder unstakes, or its
  effective weight falls below that of a contender, the seat passes at once to
  the next qualifying account in rank. An account that clears the
  `> 10,000,000` threshold but does not win the seat stays at the highest
  uncapped tier it qualifies for (Tier 9).

See [Staking](./staking.md) for how to stake MTF, and
[Tokenomics](./tokenomics.md#time-weighted-staking-ve-style) for how effective
weight is derived. Flexible (no-lock) staking has 0× weight. It thus only
reaches the lowest tier (Tier 1) and earns no dividend. This is deliberate: it
is the path for market makers.

## How the three combine {#how-the-three-combine}

The fee tier sets your base taker and maker rates from your volume. The other
two tiers then adjust those base rates.

**Effective taker rate.** The staking discount scales the fee-tier taker rate:

```text
effective_taker = fee_tier_taker × (1 − staking_discount)
```

**Effective maker rate.** The maker rebate is subtracted from the fee-tier maker
rate. The staking discount does not apply to the maker rate:

```text
effective_maker = fee_tier_maker − maker_rebate
```

A negative `effective_maker` is a rebate that the exchange pays to you.

| Component | Affects taker? | Affects maker? |
|-----------|:--------------:|:--------------:|
| Fee tier (volume)            | base rate | base rate |
| Maker rebate (maker share)   | — | subtracted |
| Staking discount (MTF staked)| multiplied | — |

## Worked examples {#worked-examples}

**A Tier 9 staker at the base volume tier.**
Your effective weight clears `> 5,000,000` (Tier 9, 40% taker discount). Your
30-day volume is under $5M (base fee tier: taker 0.0350%, maker 0.0100%).

```text
effective_taker = 0.0350% × (1 − 0.40) = 0.0210%
effective_maker = 0.0100% − 0.0000%    = 0.0100%
```

You pay 0.0210% taker and 0.0100% maker.

**A top maker at the highest volume tier.**
Your 30-day volume is `≥ $2B` (fee tier: taker 0.0200%, maker 0.0000%). Your
maker-volume share is `≥ 3.0%` (rebate −0.0030%).

```text
effective_maker = 0.0000% − 0.0030% = −0.0030%
```

Your net maker rate is −0.0030%. The exchange pays you 0.0030% of notional on
every maker fill. Your taker rate stays 0.0200%, less any staking discount.

**All three tiers together.**
Volume `≥ $100M` (taker 0.0250%, maker 0.0040%), maker share `≥ 1.5%` (rebate
−0.0020%), and Tier 5 staking (20% taker discount):

```text
effective_taker = 0.0250% × (1 − 0.20) = 0.0200%
effective_maker = 0.0040% − 0.0020%    = 0.0020%
```

You pay 0.0200% taker and 0.0020% maker.

## Credits outside the schedule {#on-top-of-the-schedule}

Referral and broker-code credits apply separately, in addition to the effective
rates above:

- **Referral.** When you have a referrer, a share of your taker fee goes to the
  referrer from the protocol's share. It is not an extra charge to you. A
  governed referee discount can also lower your taker rate. It does not add to
  the staking discount: the larger of the two applies. See
  [the referral program](./fees.md#referral-share-and-discount).
- **Broker codes.** The source of the order flow (a front end or an aggregator)
  can claim a share when its address is set on the order.

[Fees](./fees.md) gives the full mechanics: how credits are split, and how
collected fees fund the MTF buyback and the revenue share for stakers.

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **Volume across sub-accounts.** A master and all its sub-accounts share one
  30-day volume figure, and thus one fee tier. A desk that runs many strategies
  under one master gets the tier for the total.
- **Continuous evaluation.** The exchange evaluates all three tiers again on a
  rolling 30-day window. There is no monthly cutover. A crossed threshold
  applies to your next fill.
- **Taker fees fund the maker rebate.** The exchange pays a negative net maker
  rate from the taker fees collected on the same flow. It never pays out more in
  maker rebates than it takes in.
- **Staking discount and the maker rate.** The staking discount applies to the
  taker rate only. A Tier 10 staker still pays (or earns) the full maker rate.
  Only the taker side gets the discount.
- **The top tier is competitive.** Only Tier 10 (1 seat) is awarded by rank, not
  by threshold alone. The threshold is necessary but not sufficient. If another
  account holds the seat, you hold the highest uncapped tier you qualify for
  until the seat is free. The seat moves in real time as effective weights
  change.

</details>

## See also {#see-also}

- [Fees](./fees.md): fee mechanics, the buyback-and-lock flow, and referral and broker credits.
- [Staking](./staking.md): stake MTF to qualify for the taker discount tiers.
- [Spot trading](../products/spot.md): spot fills have their own per-pair rates.
