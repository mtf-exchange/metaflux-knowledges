---
description: The MTF token economic model — utility, supply, allocation, emission, the value-accrual flywheel, staking economics, and governance scope.
---

# Tokenomics

:::info
**The final model.** The **utility** layer (gas, staking discounts, consensus,
governance, and fee-driven buyback-and-burn) is **already built and live** — the
value core of the token. The **economic parameters** (total supply, allocation,
vesting, the population-pegged emission model, the buyback split, and the staking
multiplier curve) are **finalized** and documented below. Tier values and the
buyback split are network parameters that governance can later tune; total supply
is pegged to the population of China and re-pegged annually by validator vote.
:::

## TL;DR

**MTF** is the native token of MetaFlux — an independent proof-of-stake L1 that
runs a perpetuals DEX core and an EVM sidechain. MTF does five things:

1. **Gas** — it pays for execution on the MetaFlux EVM sidechain.
2. **Fee discount** — staking MTF discounts your taker trading fee by tier.
3. **Security** — staked MTF is the validator stake that secures consensus.
4. **Governance** — staked MTF is the voting weight over protocol parameters.
5. **Value accrual** — net protocol fees buy MTF on the open market; **70% of
   every buyback is burned**, tying the token's scarcity to exchange volume.

The economic frame is **fee-driven deflation**. Net trading fees (after maker
rebates) buy MTF on the open market; the bought-back MTF is split **70% burned,
20% to validators who pass it to their stakers as a revenue-share, 10% treasury**.
Staking — especially **time-locked, vote-escrow-style** staking — earns a fee
discount **and a share of that buyback**, pulling supply off the float into the
hands of long-term participants who secure the chain. Upper-tier benefits are
**time-weighted**: the longer you lock, the larger your effective weight, discount
tier, and revenue-share slice. A **flexible (no-lock)** lane gives market makers
the basic fee discount with no lock and no revenue-share. Total supply is
**1,404,890,000 MTF**, **pegged to the population of China** and re-pegged by an
annual validator vote — minting if the population grew, burning treasury MTF if it
shrank — so supply tracks the population rather than sitting at a fixed cap. The
fee buyback-and-burn is a **separate** deflationary force on top.

## Token utility

Everything in this section is **live**, not proposed. These are the existing
sinks and sources that give the token its value.

### 1. Gas on the EVM sidechain

MTF is the gas token of the MetaFlux EVM sidechain. It is an **18-decimal**
asset at the EVM execution layer — every contract deployment and transaction on
the sidechain is metered and paid in MTF, exactly as ETH meters the EVM on its
home chain. The DEX core and the EVM sidechain share the same native asset, so
demand for on-chain compute is demand for MTF.

### 2. Staking → taker-fee discount

Staking MTF grants a **discount on your taker trading fee**, scaled by a ten-rung
administrative-grade ladder up to **50%** off taker:

| Grade | Taker discount |
|-------|---------------:|
| Section Chief (Township Head)            | 5%  |
| Deputy Section Chief                      | 8%  |
| Division Chief (County Chief)             | 12% |
| Deputy Division Chief                     | 15% |
| Director-General (Mayor)                  | 20% |
| Deputy Director-General                   | 25% |
| Minister (Governor)                       | 32% |
| Vice Minister (Vice Governor)             | 35% |
| State Councilor / Vice Premier            | 40% |
| Premier / President / General Secretary *(#1)* | 50% |

Only the top grade — **Premier / President / General Secretary** (the single #1
account by effective weight) — is **capped and competitive**; every other grade,
including all the **Deputy** grades and **Minister (Governor)**, is a pure uncapped
threshold. The seat reassigns in real time as weights move. Full thresholds and
seat rules are on the
[Fee schedule](./fee-schedule.md#3-staking-discount-tiers-mtf-staked).

The discount applies to the **taker rate only** and stacks with the volume-based
fee tiers and maker-rebate tiers. The **basic** discount tier is available to
every staker, including **flexible (no-lock)** stakers — the deliberate channel
for high-frequency market makers who need unlocked capital. The **higher** tiers
are keyed on your **time-weighted effective weight**, so the longer you lock the
higher your weight and the higher the tier the same tokens reach (see
[Time-weighted staking](#time-weighted-staking-ve-style) below for the multiplier
curve and weight thresholds). The full rate card and stacking rules are on the
[Fee schedule](./fee-schedule.md#3-staking-discount-tiers-mtf-staked) page. This
is the direct, mechanical reason an active trader holds and stakes MTF: it pays
for itself out of reduced trading costs.

### 2b. Staking → MTF revenue-share

On top of the fee discount, **locked** stakers receive a **revenue-share** paid in
**MTF**. It is delivered through the validator channel: **20% of every buyback**
(MTF bought back with net fee revenue) goes to validators, who distribute it to
their **stakers / delegators**. Your slice is pro-rata by your **time-weighted
effective weight**, so longer locks earn a disproportionately larger share.

The revenue-share **requires a lock of at least 1 month** — flexible (no-lock)
stakers earn **0** revenue-share (they still get the basic fee discount). This is
not a separate fee pool: it is the validators' 20% share of the bought-back MTF,
passed through to those who staked with them. See
[Value accrual & flywheel](#value-accrual--flywheel) for the full buyback split.

### 3. Staking → consensus security (proof-of-stake)

MetaFlux is a proof-of-stake chain. Staked MTF **is** the validator stake.
Validators self-bond MTF and accept delegations; the active validator set, block
proposal weight, and vote weight in consensus are all derived from committed
stake. Misbehaviour is slashed (double-sign, downtime, voting an invalid fork),
so the security budget of the chain is denominated in, and backed by, MTF. See
[Staking](./staking.md) for the validator/delegator model, slashing, and the
unbonding lifecycle.

### 4. Staking → governance weight

Staked MTF is the **voting weight** in protocol governance. Network parameters —
fee tiers, emission rate, risk parameters, vault whitelists, market listings — are
moved by on-chain votes weighted by stake. See [Governance scope](#governance)
below.

### 5. Fee value accrual → buyback, then burn

Protocol trading fees are converted into MTF and then split. After maker rebates
and any referrer/builder credits are paid **off the top**, **all** remaining net
fee revenue is used to **buy MTF on the open market**. The bought-back MTF is then
split **70% burned / 20% to validators (who pass it to their stakers) / 10%
treasury**. So trading volume creates real, recurring buy pressure on MTF, and
**70% of every buyback is destroyed forever** while 20% becomes the staker
revenue-share and 10% funds the treasury.

This is the keystone of the model: it is **not** an abstract supply burn, it is
real exchange revenue market-buying MTF and then destroying the bought tokens. The
deflation rate is a direct function of trading volume. The full step-by-step flow
and the split are in [Value accrual & flywheel](#value-accrual--flywheel); the
fee mechanics are on the [Fees](./fees.md#burn-buyback-and-burn) page.

## Supply & allocation

:::info
**Final.** The total supply and the genesis allocation below are finalized. The
genesis total is **1,404,890,000 MTF** — **pegged to the population of China** —
distributed across the three buckets in the table. The total is **re-pegged
annually by validator vote** (see [Emission & inflation](#emission--inflation)).
:::

### Total supply

**Genesis total supply: 1,404,890,000 MTF — pegged to the population of China**
(this equals China's 2026 population).

The token is **not a fixed cap.** Its supply **target is the population of China**,
and it is **re-pegged once a year by a validator governance vote**: if the
population grew, validators vote to **mint** new MTF; if it shrank, they vote to
**burn** treasury MTF — so total supply tracks the current population over time.
The population figure each year is the **median across several authoritative
Chinese central-government data sources** (median, so an outlier source cannot move
the peg). The full mechanism is in [Emission & inflation](#emission--inflation).

The fee-driven **buyback-and-burn is a separate, independent deflationary force**:
the population is the supply **target** (set by the annual re-peg), while the
buyback continuously removes MTF from the float on top of it. The two are distinct
— one is the annual population re-peg of treasury MTF, the other is the
volume-driven burn.

Notes:

- **18-decimal gas headroom.** As an 18-decimal EVM gas token, ~1.4B nominal units
  leave ample granularity for ordinary sidechain transactions to cost a clean,
  small fraction of a token.
- **Staking-ladder scale.** The fee-discount grades and the time-weighted
  effective-weight thresholds (Section Chief…Premier / President / General
  Secretary) are denominated in tokens/weight; against a ~1.4B supply the top-grade
  threshold (10,000,000) is a small fraction of supply, reachable by a serious
  committed desk, which is the intended signal.

### Genesis allocation

| Allocation | Share | Tokens | Lockup / vesting | Purpose |
|------------|------:|-------:|------------------|---------|
| **TGE Airdrop** | 30% | 421,467,000 | Distributed **at TGE on MetaFlux mainnet** (after the 6-month testnet concludes) | Airdropped to active traders, market makers, and points-program holders. The community-distribution event. |
| **Core Contributors** | 20% | 280,978,000 | **1-year full lockup (cliff)**, then **6-year linear vesting** | Founders and core contributors. No contributor tokens unlock in year one; a 6-year linear tail thereafter. |
| **Treasury / Community / Ecosystem / Validators** | 50% | 702,445,000 | Combined pool; governance-released | A single long-horizon pool covering the protocol treasury, community & ecosystem incentives, the protocol-owned liquidity vault seed, and validator / staking-reward bootstrap. **Also the source/sink for the annual population re-peg** (mint into / burn from this pool). |
| **Total** | **100%** | **1,404,890,000** | | |

Notes:

- **Community-majority distribution.** The largest single bucket (50%) is the
  combined treasury / community / ecosystem / validators pool, and with the 30%
  TGE airdrop, **80% of supply is community- and protocol-aligned**. The
  contributor allocation is 20%, the smallest bucket.
- **TGE airdrop on mainnet.** The 30% airdrop is distributed at the token
  generation event on **MetaFlux mainnet**, which follows the conclusion of the
  6-month testnet phase. It targets demonstrated participants — active traders,
  market makers, and points-program holders — rather than an open claim.
- **Contributors locked longest.** Core contributors carry a **1-year cliff**
  (zero unlock in year one) followed by **6-year linear vesting** — an
  unusually long tail that keeps the team aligned well past launch.
- **One combined long-horizon pool.** Treasury, community/ecosystem incentives,
  the liquidity-vault seed, and validator/staking bootstrap are funded from a
  single 50% pool released under governance, rather than pre-split into fixed
  sub-allocations. This keeps the allocation legible and lets governance direct
  the pool to where it is needed (incentives, liquidity, security) as the venue
  matures (see [Value accrual & flywheel](#value-accrual--flywheel) and
  [MIP-2 Metaliquidity](../mip/mip-2.md)).

### Circulating-supply trajectory

```text
genesis total        : 1,404,890,000 MTF (pegged to China's population)
TGE (mainnet)        : 30% airdrop distributed; portions of the 50% pool seed
                       liquidity / early incentives per governance
year 1               : contributor cliff holds — ZERO contributor unlock; pool
                       releases drive early circulating growth
year 1 cliff lapses  : contributor 6-year linear vesting begins
years 2–7            : contributor linear unlock completes over six years; pool
                       releases continue only on governance vote
annual re-peg        : validators vote to mint (population grew) or burn treasury
                       MTF (population shrank), re-pegging total supply to the
                       median population figure for the year
steady state         : net float SHRINKS as buyback-and-burn outpaces residual
                       unlocks, pool releases, and any re-peg mint
```

The design intent is that, well before the 6-year contributor vesting completes,
the **buyback-and-burn sink is removing supply faster than the remaining unlocks,
governed pool releases, and any annual re-peg mint add to it**, so circulating
supply trends down at steady-state volume. The population re-peg moves the supply
**target** slowly (China's population changes by a fraction of a percent a year),
while the buyback burn is the fast, volume-driven sink — the two are independent.
That crossover is the whole point of the model.

## Emission & inflation

:::info
**Population-pegged supply, re-pegged annually by validator vote.** Total supply is
not a fixed cap — it **tracks the population of China**, starting at
**1,404,890,000 MTF** at genesis. Once a year, validators vote to **mint** (if the
population grew) or **burn treasury MTF** (if it shrank) to re-peg supply to the
year's population figure. Staking rewards are not paid by dilution; the re-peg is a
slow, governed adjustment of the supply target, separate from the volume-driven
buyback-and-burn.
:::

### The population peg

Total supply targets the **population of China** and is **re-pegged once a year by
a validator governance vote**:

1. **Take the year's population figure** as the **median across several
   authoritative Chinese central-government data sources**. The median (not a
   single source, not a mean) makes the peg **robust to outliers** — one
   anomalous source cannot move it.
2. **Validators vote to re-peg.** If the median population **grew** over the year,
   validators vote to **mint** the difference in new MTF; if it **shrank**, they
   vote to **burn** that much **treasury MTF**. Either way, total supply is moved to
   match the new population figure.
3. **The mint/burn flows through the treasury pool** (the 50% combined pool), so
   the re-peg never touches user, contributor, or staker balances — only the
   protocol-controlled treasury.

Because China's population moves by only a fraction of a percent per year, the
re-peg is a **small, slow** annual adjustment to the supply **target** — not a
recurring inflation lever pulled for yield.

### Staking rewards are non-dilutive

Staking rewards are paid from two sources, **neither of which is the population
re-peg**:

1. The **validator / staking-reward bootstrap** funded out of the combined
   treasury/community/ecosystem/validators pool pays a stake-curve-shaped APR in
   the early period.
2. A **share of protocol fee revenue** is routed to stakers on an ongoing basis
   (the fee-funded staking yield and the [dividend](#2b-staking--revenue-share-dividend)),
   funded by real exchange volume.

The early-period APR follows a **stake curve** rather than a flat rate: it is
high when little is staked (to bootstrap security) and decays as total stake
grows, so the reward budget is not drained prematurely. The shape is a flat
ceiling at/below a floor stake, decaying proportional to `1/√stake` above it —
i.e. more total stake means a lower per-staker share. The current effective APR
and its committed inputs are observable on the live
[`staking_apr`](./staking.md#apr-estimation) read path.

**The trade-off this choice accepts.** The bootstrap reward budget is finite. If
fee revenue does not grow to carry the yield before the budget is meaningfully
drawn down, the headline staking APR falls. This forces yield to be **earned from
volume**, not printed — but it means the early reward budget (carved from the 50%
pool) must be sized to cover the runway until fee revenue takes over. The annual
population re-peg is **not** a yield source: it adjusts the supply target, it does
not fund staking.

### Why population-pegged rather than a fixed cap

The population peg gives MTF a **legible, exogenous supply anchor** — a number
nobody at the protocol sets by hand — while keeping the deflationary thesis
intact, because the **buyback-and-burn is a separate force** that removes MTF from
the float faster than the slow annual re-peg can add it. The token is deflationary
by construction from the buyback; the population peg simply moves the target the
buyback shrinks toward.

The re-peg is **not perpetual inflation for yield.** Minting a fixed percentage of
supply per year to pay validators would **directly fight the buyback-and-burn
flywheel** — burning with one hand and printing with the other — and was
**rejected**. The population re-peg is different: it is a small, governed, two-way
adjustment (it can **burn** as well as mint) tied to an external figure, not a
recurring dilution to fund rewards. Staking yield is funded by the bootstrap budget
and fee revenue, never by the re-peg.

## Value accrual & flywheel

The token's value is wired to exchange activity through a reinforcing loop. The
core feedback is **volume → fees → buy back MTF → 70% burn / 20% to validators
(→ stakers) / 10% treasury → scarcity + staker yield**, with PoS security as the
stabilizing ring around it.

### How fee revenue becomes token value — the flow

The value-accrual path is a clean four-step pipeline:

1. **Collect trading fees.** Every fill pays a fee, denominated in the quote asset.
2. **Pay maker rebates first.** The maker-rebate subsidy comes **off the top** —
   it is paid out of collected fees before anything else (referral / builder
   credits also settle here). What remains is the **net fee revenue**.
3. **Buy back MTF.** **All** remaining net fee revenue is used to **buy MTF on the
   open market**. This is real, recurring buy pressure proportional to exchange
   volume — there is no idle fee pool, the entire net take is converted into MTF.
4. **Split the bought-back MTF** three ways:

| Destination | Share of the bought-back MTF | What happens |
|-------------|-----------------------------:|--------------|
| **Burn** | **70%** | Permanently destroyed — removed from supply forever. Pure deflation. |
| **Validators → stakers** | **20%** | Distributed to validators, who pass it through to **their own stakers / delegators**. This **is** the staker revenue-share — delivered through the validator channel, not a separate pool. |
| **Treasury** | **10%** | Protocol reserve, governance-controlled. |

So **70% of every buyback is burned**, 20% becomes the staker revenue-share (paid
in MTF, routed via validators to their delegators), and 10% funds the treasury.
Because the inputs are bought MTF, **all three legs create buy pressure first**,
then either destroy the token (burn) or hand it to long-term participants
(stakers via validators) and the treasury.

```text
            ┌──────────────┐    trading fees   ┌──────────────┐
            │   TRADERS    │ ────────────────▶ │   COLLECTED  │
            │  & volume    │                   │     FEES     │
            └──────────────┘                   └──────┬───────┘
                    ▲                                 │ pay maker rebates FIRST
                    │                                 ▼  (off the top)
                    │                          ┌──────────────┐
       lower taker  │                          │   NET FEE    │
       fees + MTF   │                          │   REVENUE    │
       revenue-share│                          └──────┬───────┘
                    │                                 │ buy MTF on the open market
                    │                                 ▼  (ALL of it)
                    │                          ┌──────────────┐
            ┌───────┴──────┐                   │ BOUGHT-BACK  │
            │   STAKERS    │                   │     MTF      │
            │  (locked,    │                   └──────┬───────┘
            │   via vals)  │           split:         │
            └───────┬──────┘     ┌──────────┬─────────┴────────┐
                    │            ▼          ▼                  ▼
       20% MTF      │      ┌──────────┐ ┌──────────┐    ┌──────────┐
       via          │      │ 70% BURN │ │   20%    │    │   10%    │
       validators ──┴──────│ (destroy)│ │VALIDATORS│    │ TREASURY │
                           └────┬─────┘ │→ STAKERS │    └──────────┘
                                │       └────┬─────┘
                                │ supply     │ MTF yield to
                                ▼ shrinks    │ long-term lockers
                          ┌────────────┐     │
                          │ SCARCITY / │◀────┘
                          │ TOKEN VALUE│
                          └────────────┘
```

Read the loop as three reinforcing rings:

1. **The burn ring (deflation).** Volume produces fees; net fees buy MTF; **70% of
   the bought MTF is burned**. More volume → more buyback → more burn → less supply
   → scarcer token. This is the primary value-accrual path and it is **already
   live**.

2. **The revenue-share ring (cash flow to lockers).** **20% of the bought-back
   MTF** goes to validators, who distribute it to **their stakers / delegators**.
   This is the staker revenue-share — paid **in MTF**, routed through the validator
   channel. A staker's share scales with their stake in a validator's pool, and
   that stake's standing is **time-weighted** (see [effective weight](#time-weighted-staking-ve-style)),
   so longer hard-locks earn a larger slice. More volume → bigger MTF revenue-share
   → higher real yield on locked MTF → stronger incentive to acquire and hard-lock.

3. **The security ring (PoS).** Staked MTF secures consensus, and validators are
   the conduit for the 20% revenue-share — so securing the chain and earning the
   revenue-share are the **same act**. As the token appreciates and more is locked
   for the discount and the MTF revenue-share, the cost to attack the chain rises
   with the token value — a more valuable token is a more secure chain, which makes
   the venue safer to trade on, which supports volume.

The protocol-owned **liquidity vault** ([MIP-2 Metaliquidity](../mip/mip-2.md))
sits inside the loop as an accelerant: it provides resting order-book depth from
day one so the exchange can generate volume — and therefore fees and burn —
without waiting for external market makers to arrive. Tighter books → more volume
→ more burn.

The flywheel only spins on **real volume**. None of the rings depend on token
emission or speculative reflexivity to function; they are mechanical consequences
of people trading on the exchange.

## Staking

Staking is **live**. This section summarizes the economics from a tokenomics lens;
the full operational detail — actions, validator selection, slashing, edge cases —
is on the dedicated [Staking](./staking.md) page.

### What staking gives you

| Benefit | Source | Notes |
|---------|--------|-------|
| **Taker-fee discount** | Ten-rung grade ladder by **time-weighted effective weight** | 5%→50% off taker, [Section Chief→Premier / President / General Secretary](./fee-schedule.md#3-staking-discount-tiers-mtf-staked) |
| **MTF revenue-share** | **20% of every buyback**, paid in MTF via your validator | Routed through validators to their delegators; weighted by your time-weighted stake |
| **Staking yield** | Reward bootstrap (early) + fee-revenue share (ongoing) | Stake-curve APR, observable live |
| **Consensus weight** | Validator stake / delegation | Secures the chain, slashable |
| **Governance weight** | Staked MTF = vote weight | See [Governance](#governance) |

The **fee discount** and the **MTF revenue-share** both scale with your
**time-weighted effective weight**, not your raw token amount — the mechanic is
described next.

### Time-weighted staking (ve-style)

Staking standing is **time-weighted by the lock duration you commit to upfront**.
Your standing is not your raw staked amount but an **effective weight**:

```text
effective_weight = staked_amount × time_multiplier(committed_lock_duration)
```

Two benefits read off this, but they have **different entry points**:

- **The taker-fee discount** is available to **everyone who stakes**, including
  flexible (no-lock) stakers — the basic discount tier is the entry-level reward.
- **The MTF revenue-share (dividend)** requires a **lock of at least 1 month** —
  flexible stakers earn **0** revenue-share. Within the locked range, longer locks
  earn a larger slice.

#### The multiplier curve

| Stake mode | `time_multiplier` (dividend weight) | Fee-discount eligibility | Revenue-share (dividend) |
|------------|------------------------------------:|--------------------------|--------------------------|
| **Flexible / no lock** | **0×** | **Basic tier only** (entry-level discount) | **None** — 0 dividend weight |
| **Lock 1 month** | **1.0×** | Full tier ladder | Dividend starts here |
| **Lock 6 months** | **2.5×** | Full tier ladder | Larger slice |
| **Lock 24 months (cap)** | **4.0×** | Full tier ladder | Largest slice |

Between the marked points the multiplier rises with committed duration; **1 month
is the base of the locked multiplier (1.0×)** and **24 months is the cap (4.0×)**.

**The flexible / no-lock mode is the market-maker channel.** High-frequency market
makers need their capital unlocked and redeployable — they cannot commit a
multi-month lock. So flexible staking deliberately grants them the **basic fee
discount** on their taker flow while asking for **no lock**, at the cost of
**zero revenue-share**. The dividend is reserved for capital that commits time;
flexible capital gets a fee break but not a cut of the buyback.

**Dividend eligibility starts at the 1-month lock.** Below a 1-month commitment
there is no dividend weight at all. From 1 month (1.0×) the weight climbs to 2.5×
at 6 months and caps at 4.0× at 24 months — so both the **higher fee-discount
tiers** and the **dividend share** scale with how long you lock.

#### How the lock works

The mechanic is the standard **vote-escrow (ve)** model — **commit upfront, get
the weight immediately, cannot unlock early**:

1. **You choose a lock duration at stake time** (1 month … 24 months, or flexible).
   That committed duration sets your `time_multiplier` — and therefore your
   tier and dividend weight — **immediately**, not by elapsed time. A staker who
   commits a 6-month lock has 6-month (2.5×) weight from the start; they do **not**
   wait 6 months to reach it.

2. **The benefit goes live after the universal 24-hour activation delay** — the
   same activation delay that applies to all stakers. So a 6-month locker enjoys
   their (e.g. State Councilor / Vice Premier) discount and full dividend weight
   after just **24 hours**.

3. **The lock is an early-exit constraint.** In exchange for the higher weight you
   **cannot unstake before the committed duration elapses**. The activation delay
   (24h, when the benefit turns on) and the lock duration (the term you cannot exit
   before) are **two separate things**: 24h to *activate*, the chosen term to
   *exit*.

This is the design pioneered by veCRV (Curve) — lock longer, get more weight and a
larger share of fees, immediately on lock and irrevocable until expiry — and
echoed by escrowed-token / multiplier-point schemes on other DEX tokens (e.g.
esGMX-style time-vesting on GMX-class venues). The MetaFlux model applies the ve
multiplier to the **fee discount and the MTF revenue-share**, and reserves a
flexible, dividend-free entry lane for market makers.

#### Effective-weight grade thresholds

The fee-discount grades (and the dividend allocation, for locked stakers) are read
off `effective_weight`, on the **same ten-rung ladder** the fee schedule uses — but
evaluated on weight:

| Grade | Effective-weight threshold | Taker discount | Slot cap |
|-------|---------------------------:|---------------:|----------|
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

Two tracks run here, same as the [fee schedule](./fee-schedule.md#3-staking-discount-tiers-mtf-staked):
the **Deputy** grades, **Minister (Governor)**, and every grade below the top are
**pure uncapped thresholds**; only **Premier / President / General Secretary** (the
single #1) is a **capped, competitive seat** reassigned in real time. Flexible (0×)
stakers reach only the **lowest grade** regardless of threshold; the **higher**
grades require a lock so that `staked_amount × time_multiplier` clears the bar (and,
for the single capped grade, a winning rank). So **raw tokens alone are not enough
for the top grades** — they must be committed to a long enough lock, and the very
top must also out-rank the field.

#### Worked example — short / flexible does NOT climb; a long lock does

The hard constraint the model is designed to satisfy:

> A whale stakes **2,000,000 MTF** but does **not** commit a long lock.

A flexible or sub-1-month position contributes **0× dividend weight** and is held
at the **lowest grade** — 2,000,000 raw tokens do **not** clear the upper-grade
weight thresholds without a lock multiplier:

```text
flexible:  2,000,000 × 0×   → 0 dividend weight, lowest grade (Section Chief) only
1-month :  2,000,000 × 1.0× = 2,000,000  → clears Vice Minister (> 1,500,000)
                                            but below State Councilor (> 5,000,000)
                                          → Vice Minister (35%)
```

To climb to **State Councilor / Vice Premier** (40% taker discount **and** a top
dividend slice) with the **same** 2,000,000 tokens, the whale must **commit a lock
of ≥ ~6 months**, where the multiplier reaches **2.5×**:

```text
effective_weight = 2,000,000 × time_multiplier(6-month lock) = 2,000,000 × 2.5 = 5,000,000
```

5,000,000 is **not** strictly greater than the `> 5,000,000` bar, so a hair more
weight (a slightly larger stake or a 24-month lock at 4.0×) crosses it cleanly into
**State Councilor / Vice Premier**. Crucially, this is **not** "stake and wait 6
months to climb." It is **commit to the lock and you reach the grade after the
24-hour activation delay** — the higher grade is granted immediately on the
*commitment*, not earned by elapsed time. The price is that the tokens are then
**hard-locked for the full term and cannot be unstaked early**.

**The top grade adds a second hurdle.** The single top grade — **Premier /
President / General Secretary** (the single #1 by effective weight) — requires not
just clearing the threshold but **winning the seat**. A whale who clears
`> 10,000,000` without being #1 is held at the highest **uncapped** grade they
qualify for (State Councilor / Vice Premier). The seat reassigns in real time as
effective weights move.

So the upper grades are **bought with a time-commitment, not with size alone** —
and the very top also demands a **competitive rank**. A flexible or short-locked
whale is capped low and earns no dividend; a smaller staker who commits a longer
lock can out-rank them and take a dividend slice. Capital that refuses to lock gets
a fee break but not a cut of the buyback — the core anti-mercenary property of the
ve design, with a deliberate flexible lane for market makers.

### Validators vs delegators

- **Validators** run a consensus node, self-bond above a minimum, propose and vote
  on blocks, and take a commission from the rewards of those who delegate to them.
  They carry the full slashing exposure for misbehaviour.
- **Delegators** hold MTF, pick a validator, and earn that validator's rewards
  minus commission. They share pro-rata slashing exposure if their validator
  misbehaves, but run no infrastructure.

### Staking timing model

Three distinct timing concepts govern the staking lifecycle. Keep them separate —
they are **different things**:

| Concept | What it is | Set by | Floor |
|---------|------------|--------|:-----:|
| **Committed lock duration** | The ve term **you choose at stake time** — flexible, or 1 / 6 / up to 24 months. You **cannot unstake before it elapses**; it sets your `time_multiplier` and therefore your tier and revenue-share weight. **Revenue-share weight begins at the 1-month lock**; flexible is 0×. | The staker, per stake | flexible, else ≥ 1 month |
| **Activation delay** | The **universal 24-hour delay** before your benefit (fee discount + revenue-share weight) turns on. Applies to **every** staker regardless of lock length. | Network (governance) | ≥ 24h |
| **Exit cooldown** (unbonding) | After your committed lock elapses and you request to unstake, a final cooldown before the MTF is withdrawable. | Network (governance) | ≥ 24h |

The network-set durations (activation delay, exit cooldown) are
**governance-voted** but carry a hard, code-level floor of **24 hours** that can
never be undercut — governance can raise them above 24h, never below.

**The two often-confused things — activation vs lock.** The **activation delay**
(24h, when your benefit *turns on*) and the **committed lock duration** (the term
before you can *exit*) are **independent**:

- A staker who commits a **6-month** lock gets their full (e.g. State Councilor /
  Vice Premier) discount and full revenue-share weight **24 hours after staking** —
  they do **not** wait 6 months for the benefit. The 6 months is only how long they
  are **barred from unstaking**.
- A **flexible** (no-lock) staker also activates after 24h, but at **0× weight**:
  the **basic** discount tier only, and **no** revenue-share. This is the
  market-maker lane.

**Why this is non-gameable.** Because the higher multiplier and any revenue-share
require committing an **irrevocable** lock you cannot exit early, a trader cannot
grab a top tier and immediately pull their tokens — the upper tiers and the
dividend are only available to capital that accepts the lock. The 24h activation
additionally blocks single-block flash-staking around a fill. Together these keep
a meaningful share of supply hard-locked and out of float and ensure only
genuinely time-committed stake reaches the upper tiers and the revenue-share.

### Lockup & unbonding states

| State | Earns benefits? | Slashable? |
|-------|:---------------:|:----------:|
| Activating (first 24h after stake) | not yet | yes |
| Active & locked (within committed term) | yes | yes |
| Unbonding (after lock elapses, exit cooldown) | no | yes (until matured) |
| Unbonded (claimable) | no | no |

### Where the yield comes from

Two sources, in order of dominance over the chain's life:

1. **Early:** the staking-reward bootstrap funded from the combined
   treasury/community/ecosystem/validators pool, paying a stake-curve APR that is
   high when little is staked and decays as stake grows.
2. **Ongoing — the MTF revenue-share.** **20% of every buyback** (MTF bought back
   with net fee revenue) goes to validators, who distribute it to their **locked
   stakers / delegators**, weighted by time-weighted effective weight. This is the
   dividend; it is funded by real exchange volume, not dilution, and grows with
   the venue. **Locked stakers (≥ 1 month) only** — flexible stakers earn the fee
   discount but no revenue-share.

So as volume scales, the system transitions from bootstrap-funded to
revenue-share-funded yield with **no dilutive emission** — the yield is paid in MTF
that the protocol bought on the open market, never from the population re-peg.
Validators are the conduit, so securing the chain and earning the revenue-share are
the same act.

## Governance

Staked MTF is the **governance voting weight**. Governance is the protocol's
on-chain steering wheel; votes are weighted by stake and enacted by the chain when
they pass the required threshold.

### Scope of governance

Governance moves **protocol parameters**, not user funds. In scope:

- **Fee parameters** — the volume fee tiers, the maker-rebate tiers, the
  staking-discount ladder, and the protocol fee split (the burn / validator /
  treasury shares).
- **Emission & rewards** — the staking reward rate and the parameters of the
  reward curve.
- **Risk parameters** — margin and liquidation parameters, oracle weighting, and
  per-market risk settings.
- **Market listings** — listing and configuring markets.
- **Vault & liquidity** — the recognised-provider whitelist for the
  protocol-owned liquidity vault.
- **Treasury** — releases from the protocol treasury allocation.

### How votes pass

Governance actions require a **stake-weighted quorum** to enact; a single large
holder cannot unilaterally flip a parameter, and validators that are jailed for
misbehaviour are excluded from the tally. Parameter changes that pass are applied
deterministically by the chain.

### What governance does NOT control

- It cannot mint or burn MTF arbitrarily. The only supply lever is the **annual
  population re-peg** — a constrained, two-way adjustment of **treasury** MTF to
  the year's median population figure (see [Emission & inflation](#emission--inflation))
  — not a free inflation knob to fund rewards.
- It cannot seize user balances or positions (the re-peg mint/burn only ever
  touches the protocol treasury, never user, contributor, or staker balances).
- It cannot alter past committed state.

Governance is a forward-only parameter-steering mechanism, scoped to the economic
and risk knobs of the protocol.

## See also

- [Fees](./fees.md) — the fee split and the buyback-and-burn mechanics
- [Fee schedule](./fee-schedule.md) — the volume, maker-rebate, and staking-discount rate card
- [Staking](./staking.md) — validators, delegators, slashing, unbonding, APR
- [MIP-2 Metaliquidity](../mip/mip-2.md) — the protocol-owned liquidity vault
- [Vaults](./vaults.md) — the protocol-operated and user vault families
- [Glossary](./glossary.md) — protocol-specific terms

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Is the total supply final?**
A: Yes. The genesis total (**1,404,890,000 MTF**, pegged to China's population), the
three-bucket genesis allocation, the population-pegged emission model, the
buyback/burn split, and the ve multiplier curve are all **final**. The **utility**
of the token (gas, staking discount, consensus, governance, buyback-and-burn) is
live.

**Q: How big is the supply, and is it fixed?**
A: It starts at **1,404,890,000 MTF** at genesis — **pegged to the population of
China** — and is **not a fixed cap**. Once a year, validators vote to **mint** (if
the population grew) or **burn treasury MTF** (if it shrank) to re-peg total supply
to the year's population figure, taken as the **median across several authoritative
Chinese central-government data sources**. The re-peg only ever moves **treasury**
MTF.

**Q: Is MTF inflationary?**
A: Not in the dilutive sense. Staking rewards are **never** funded by minting — they
come from a finite bootstrap budget early on and the buyback revenue-share ongoing.
The only supply additions are the **annual population re-peg** (a small, two-way
adjustment that can also **burn**), and it tracks an external figure rather than a
yield target. Combined with the buyback burn — a **separate, faster** deflationary
force — the design intent is a **net-deflationary** token at steady-state volume.

**Q: How does fee revenue become token value?**
A: Net trading fees (after maker rebates are paid off the top) are used to **buy
MTF on the open market**. The bought-back MTF is split **70% burned / 20% to
validators (passed to their stakers as the revenue-share) / 10% treasury**. So
volume → buyback → 70% destroyed, 20% to lockers, 10% treasury.

**Q: What is the staker revenue-share / dividend?**
A: It is the validators' **20% of every buyback**, distributed in MTF to their
stakers / delegators, pro-rata by **time-weighted effective weight**. It is not a
separate pool — it rides the validator channel. It **requires a lock of at least
1 month**; flexible stakers earn none.

**Q: I'm a market maker — can I stake without locking?**
A: Yes. **Flexible (no-lock)** staking keeps your capital unlocked and grants the
**basic** taker-fee discount tier — the deliberate lane for high-frequency market
makers. The trade-off is **0× weight**: no higher tiers and **no revenue-share**.

**Q: Does my multiplier grow the longer I stay staked?**
A: No. The multiplier is set by the **lock duration you commit to upfront** (1 mo =
1.0×, 6 mo = 2.5×, 24 mo = 4.0× cap) and applies in full after the 24h activation.
Committing a 6-month lock gives you 2.5× immediately — it does not ramp over time.

**Q: If I commit a 6-month lock, do I wait 6 months for the top discount?**
A: No. Your benefit activates after the universal **24-hour** activation delay, not
after the lock. The 6 months is only how long you are **barred from unstaking**.
Activation (24h) and the exit lock (your chosen term) are two separate things.

**Q: Can a whale buy the top grade just by staking a lot?**
A: No. The higher grades are keyed on **effective weight = amount × time-multiplier**,
so a large amount with no/short lock is capped at a low grade and earns no
revenue-share. Climbing requires **committing a long lock**. The single top grade
adds a second hurdle: **Premier / President / General Secretary** is the **single
#1** by weight (1 seat) — so it demands a winning **rank**, not just size, and
reassigns in real time as weights move.

**Q: Do I have to stake to use the chain?**
A: No. You need MTF to pay gas on the EVM sidechain, but trading on the perp core
does not require holding MTF. Staking is **optional** and earns you a taker-fee
discount, the MTF revenue-share (if locked), a yield, and governance weight.

**Q: How is staking yield paid if rewards aren't minted?**
A: From non-dilutive sources — the bootstrap reward budget early on, and the
**20% buyback revenue-share** (MTF the protocol bought on the open market, routed
via validators to locked stakers) ongoing. As volume scales, the revenue-share
increasingly carries the yield. The annual population re-peg does **not** fund
yield.

**Q: How does the fee discount interact with the burn?**
A: They reinforce each other. The discount and the revenue-share pull traders into
holding and locking MTF (demand + lockup) and lower their cost to trade (more
volume), and more volume means more net fees buying back MTF — feeding both the
70% burn and the 20% staker revenue-share.

</details>
