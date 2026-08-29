# Margin modes

:::tip
**Stable.**
:::

## TL;DR {#tldr}

Three modes per-asset: **Cross**, **Isolated**, **Strict-Iso**. Cross pools collateral across all your positions; Isolated walls off margin per asset; Strict-Iso additionally excludes that asset from any [portfolio-margin](./portfolio-margin.md) netting.

## Comparison {#comparison}

| Mode | Collateral source | Loss can drain | PM eligible | Liquidation isolation |
|------|-------------------|----------------|-------------|----------------------|
| **Cross** | Free balance, account-wide | Other positions | Yes | Whole-account ladder |
| **Isolated** | Pre-allocated bucket per asset | Only that bucket | No | Per-asset ladder; max loss = bucket |
| **Strict-Iso** | Pre-allocated bucket per asset | Only that bucket | No (excluded even when master is PM-enrolled) | Per-asset ladder |

In Cross, profitable positions can carry less-healthy ones — your free balance is fungible across the account. In Isolated, blowing up one asset is contained to that asset's bucket.

## How margin is computed {#how-margin-is-computed}

> All amounts are on the **whole-USDC `Decimal` plane** (notional, collateral, margin), not the 1e8 book plane — see [mark prices: two price planes](./mark-prices.md#two-price-planes-read-this-before-reading-any-number).

### Initial margin (pre-trade gate) {#initial-margin-pre-trade-gate}

An order opening new exposure must post initial margin:

```
notional         = |px × size|                         # whole USDC, fractions kept
effective_lev    = your leverage for the asset, capped # see the ladder below
required_init    = ceil( notional / effective_lev ) + cushion   # ceil = conservative
free collateral  = cross_account_value
                   − Σ held_initial_margin             # cross perp positions
                   − Σ spot-margin initial margin      # see below
                   − funding accrued against you       # debits only, never credits
reject  iff  required_init > free collateral
```

`notional` is a whole-USDC amount and it keeps its fraction. It is not an
integer: a price of 61750.25 and a size of 0.001 give a notional of 61.75025.

`cushion` is a flat **1 USDC**, added once for each open **cross** position. An
isolated position adds none. The cushion is a fixed unit, not a rate, so it does
not scale with the notional. It covers the whole-USDC rounding the liquidation
engine applies to the same position, so a new position cannot open already
inside the engine's reach. A position you later grow pays the cushion once, at
the open. A hedged account holds two positions on one asset, so it pays two.

So each cross position contributes `ceil(notional / effective_lev) + 1` to the
account's held initial margin (`perp.init_margin`, or `total_margin_used` on
`detail: "margin"`).

Free collateral here is the **raw signed gate value**, which goes negative when
open profit funds the held margin. The account read publishes it clamped, as
`withdrawable = max(0, free collateral)` — so a rejected order can sit on an
account that reads `withdrawable: "0"`. See
[account value](./account-value.md#withdrawable).

`effective_lev` resolves in this order, and is never below 1:

1. your own leverage preference for the asset, set with [`update_leverage`](../api/rest/exchange.md#update_leverage);
2. tightened by the market's dynamic-risk override when governance has set one — with a margin-tier ladder, the rung your notional falls into decides the cap, so a larger position gets less leverage;
3. bounded by the market's own maximum.

`update_leverage` rejects any request above **100×**. A market listed through [MIP-3](../mip/mip-3.md) is separately capped at **50×** when it is deployed, so most markets sit well under the 100× ceiling. Read the live value from a market's fields on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) rather than assuming either number.

Rounding is **up** so a remainder always tightens the gate. `reduce_only` orders bypass the gate — they only shrink exposure.

`held_initial_margin` sums `ceil(|entry_notional| / effective_lev(asset)) + 1` over every **cross** open position — the same per-position term, cushion included (isolated positions are excluded — their collateral is the separately-posted bucket).

This gate applies to every live order path that can open new exposure:
`submit_order` / `batch_order` (limit, IOC, ALO), `scale_order`, `chase_order`,
`twap_order`, and an accepted RFQ quote (`rfq_accept`). Frequent batch auctions
(FBA) are not a live exposure path today — no market has FBA armed.

### Maintenance margin & health {#maintenance-margin--health}

```
health = account_value − cross_maintenance_margin_used      # USDC, signed
tier   = the band of  account_value / cross_maintenance_margin_used
```

**`health` is a subtraction, not a ratio.** The served `health` field is the
cushion in USDC above the maintenance line. It is positive while the account is
clear and negative once the account is under the line. The **ratio** of the same
two numbers is the separate quantity that picks the liquidation band. Do not
read one as the other: an account reading `health: "9752"` is not at a health of
9752x.

- `account_value` = `cross_account_value` (free balance ± unrealised PnL), signed.
- `cross_maintenance_margin_used` = the sum over every held CROSS position leg of `|entry_notional| × maint_margin_ratio` (derived live from positions) **or** the PM number when [portfolio margin](./portfolio-margin.md) is enrolled (`last_computed_pm_cents / 100`). An isolated leg is judged against its own bucket and is not in this sum.
- Each leg's term is **rounded DOWN to whole USDC before the sum**, so this account scalar is always a whole number. The per-position `maint_margin` field keeps its fraction; the account scalar does not. Do not expect the two to agree to the cent.

The per-asset maintenance ratio is the market's dynamic-risk override when one has been set by governance, else the protocol's baseline maintenance ratio — a governed parameter (`set_risk_base_maint_ratio`). Read the live value from a market's `maint_margin_ratio` field on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta), and its `risk_override` when governance has set one; never assume a fixed percentage. The derived forced-close slippage floor is half the effective ratio unless explicitly overridden.

Maintenance sits below the initial requirement, so a position can be opened and then ride down to the maintenance floor before liquidation. The **ratio** `account_value / cross_maintenance_margin_used` picks the band: at or above 1.1 the account is clear, and below that the [liquidation ladder](./tiered-liquidation.md) applies at 1.1 / 1.0 / 0.8 / 0.667. Read those four numbers against the ratio, never against the `health` field. The 1.1, 0.8 and 0.667 edges are governed values, so read them live rather than pinning them.

> The arithmetic is exact fixed-point throughout — no floating point anywhere on this path. At extreme account values the tier decision scales both operands down by the same factor before it divides, which leaves the health ratio unchanged, so the tier you land in is the same.

### Margin required — a worked example {#margin-required-worked-example}

This walks one order through [`required_init`](#initial-margin-pre-trade-gate)
and [maintenance](#maintenance-margin--health) together, naming the exact
`account_state` field that carries each figure.

A market that carries a margin-tier ladder bands **both** numbers off the same
notional. Take the illustrative ladder from
[`markets_meta.margin_tiers`](../api/rest/info/perpetuals.md#markets_meta):

| `max_open_interest` (upper bound, whole USDC) | `max_leverage` | `maint_margin_ratio` (bps string) |
|---|---|---|
| `"100000"` | 50× | `"100"` (1.0%) |
| `"500000"` | 20× | `"250"` (2.5%) |
| `"2000000"` | 10× | `"500"` (5.0%) |
| `null` (unbounded) | 5× | `"1000"` (10.0%) |

A position's own notional picks the **first** row, in ascending order, whose
`max_open_interest` is `null` or **strictly greater than** that notional.
Landing exactly ON a bound does not satisfy "strictly greater than", so it
selects the NEXT row — a position of exactly 100,000 notional gets the 20× /
2.5% row, not the 50× / 1.0% row beside it.

**Opening the position.** BTC trades at 61,750.00. You have set your own
leverage preference for BTC to 20× with
[`update_leverage`](../api/rest/exchange.md#update_leverage), and you buy 3.4 BTC:

```
notional      = px × size = 61750.00 × 3.4 = 209950.00
tier          = the 500,000 row (209,950 < 500,000, and NOT < 100,000)
effective_lev = min(your 20x preference, the row's 20x cap) = 20
required_init = ceil(notional / effective_lev) + cushion
              = ceil(209950.00 / 20) + 1
              = ceil(10497.50) + 1
              = 10499.00
```

Before the order your account reads `account_value: "15000"` and no open
position, so free collateral is the full 15,000. `10499.00 <= 15000`, so the
order is admitted.

**After the fill**, the leg's own row under
[`clearinghouse_state`](../api/rest/info.md#clearinghouse_state) reads:

| Field | Value | What it is |
|---|---|---|
| `margin` | `"10499"` | This leg's initial margin — the figure above, cushion included |
| `maint_margin` | `"5248.75"` | `209950.00 × 0.025` — the SAME row's ratio, on the SAME notional. The LEG field keeps the fraction |
| `lev` | `20` | The effective leverage the fill used |

and the account-wide scalars:

| Field | Value | Depth |
|---|---|---|
| `perp.init_margin` (`total_margin_used` on `detail: "margin"`) | `"10499"` | both, under two names — this is the account's only position |
| `cross_maintenance_margin_used` | `"5248"` | `detail: "margin"` only — `5248.75` rounded DOWN to whole USDC |
| `withdrawable` | `"4501"` | both — `15000 − 10499`; entry equals mark, so `account_value` has not moved |
| `health` | `"9752"` | `account_value − cross_maintenance_margin_used` = `15000 − 5248` |
| `tier` | `"Safe"` | the ratio `15000 / 5248` is about 2.86, comfortably clear of the 1.1 yellow-card threshold |

The leg reads `5248.75` and the account reads `5248`. That is the rounding
above, not an error: the account scalar rounds each leg down to whole USDC
before it adds them. Size a withdrawal on the account scalar, never on the sum
of the leg fields.

**Zero notional.** An order whose price or size resolves to zero notional
needs no initial margin at all — `required_init` is `0`, and free collateral
is never tested.

**The isolated case.** Fund the bucket first:
[`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin)
with a positive `delta` moves USDC out of cross balance into this asset's
bucket. That transfer debits
`cross_account_value` directly, so it has already left `withdrawable` before
the order arrives — it never shows up as a held-initial-margin subtrahend,
because [`held_initial_margin`](#initial-margin-pre-trade-gate) sums CROSS legs
only. Open the same 209,950 notional position isolated instead of cross, and
the account read differs on exactly this leg:

- `margin` still reads the leg's own bucket balance, not a live-recomputed
  ceiling — top the bucket up or let it drain and `margin` follows the
  balance.
- `maint_margin` is the SAME `"5248.75"` — the ratio and the notional it
  applies to do not depend on margin mode.
- The held initial margin and `cross_maintenance_margin_used` carry **nothing**
  for this leg. An account holding only this isolated position reports
  `perp.init_margin: "0"` and `cross_maintenance_margin_used: "0"` and can
  still be liquidated — its own `margin` and `maint_margin` are the only
  fields that size it. See [held initial margin and
  cross_maintenance_margin_used](./account-value.md#margins).

## Cross — the default {#cross--the-default}

```mermaid
flowchart LR
    A["free_balance + locked_margin"] --> AV["account_value"]
    PNL["Σ unrealised PnL (cross positions)"] --> AV
    AV --> H["health = account_value − cross_maintenance_margin_used"]
```

`cross_maintenance_margin_used` is the sum of per-position maintenance requirements across the CROSS bucket (or the PM number if [portfolio margin](./portfolio-margin.md) is enrolled).

Implication: a 10% adverse move on BTC reduces account-wide health, even if your ETH position is fine. You can prop up the BTC position by closing the ETH winner.

### Spot margin joins the cross account {#spot-margin-cross}

A [spot-margin](../products/spot-margin.md) position is **cross-margined against
the same unified USDC account**. Its initial-margin requirement is subtracted from
free collateral (like a perpetual open), and its unrealised PnL and maintenance
requirement enter the account-level health decision. Two consequences follow:

- An open spot-margin position **reduces your perpetual margin headroom**.
- A perpetual loss **reduces the collateral that backs a spot-margin position**,
  and a spot-margin loss can draw on the same account collateral your perpetual
  positions use.

There is no per-pair spot-margin collateral bucket and no separate deposit — the
one unified USDC account is the collateral. See
[spot margin](../products/spot-margin.md).

## Isolated {#isolated}

:::warning
**Implementation gap.** The conceptual model below is the **target behaviour**.
The pre-trade margin gate currently implements the **Cross / pooled-collateral
path only** — the trading path opens every position cross. The position
`margin_mode` field (0 = cross, 1 = isolated) is already read to *exclude*
isolated positions from the cross held-margin sum, but a dedicated
isolated-margin pre-trade gate (checking the order's own posted `isolated_margin`
against its notional) is not yet wired.
:::

When you toggle `is_isolated: true` for an asset, the protocol moves `isolated_amount` USDC from cross balance into a per-position bucket. That position's gain/loss settles into the bucket only:

```mermaid
flowchart LR
    DM["deposited_margin"] --> AB["asset_bucket"]
    PNL["± unrealised PnL (this asset)"] --> AB
    AB --> PH["position_health = asset_bucket / leg maintenance"]
```

If `position_health` falls into a liquidation tier, the **per-position** ladder fires. The rest of the account is untouched.

The `liq` field on an isolated position is solved on this bucket alone. A large cross balance does NOT push it away, because cross never rescues an isolated bucket. See [reading `liq`](../api/rest/info.md#reading-liq).

You can deposit/withdraw to the bucket while the position is open:

```json
// add 500 USDC to the isolated bucket on asset 0
{ "type":"update_isolated_margin", "params": { "asset": 0, "delta": "500" } }
```

`delta` can be **positive** (move cross → bucket) or **negative** (withdraw bucket → cross). Withdrawal that would push the position into a worse tier is rejected. Flipping the position itself into isolated mode is a separate step — the `is_isolated` flag on [`update_leverage`](../api/rest/exchange.md#update_leverage); see [Transitions](#transitions).

## Strict-Iso {#strict-iso}

Same wall as Isolated, plus an explicit opt-out from PM scenario inclusion. Even if your master is portfolio-margin-enrolled, a Strict-Iso position:

- Does NOT contribute to the cross scenario engine
- Does NOT receive netting credit
- Is margined under the **classical** model (per-asset baseline)

:::warning
**Not a user choice.** Unlike Cross and Isolated, Strict-Iso is never
something you request for your own position. It is stamped onto a position
**only** by the governance market-level flag described below — there is no
action that moves a position from Isolated into Strict-Iso, or back, at the
trader's request.
:::

## Governance-imposed strict isolation (market-level) {#governance-imposed-strict-isolation-market-level}

MetaFlux lets **governance** impose strict isolation at the **market level** — a
per-market risk flag that forces *every* participant in that market into
Strict-Iso margin, regardless of their own preference. It is **not a user
toggle**; the only way a position becomes Strict-Iso is by opening it on a
market that already carries this flag.

When a market carries the governance strict-isolated flag:

- **New positions open isolated.** At settlement, a fill on that market lands in
  isolated margin mode, not cross — so its loss is contained to its own bucket and
  it earns no [portfolio-margin](./portfolio-margin.md) netting credit.
- **Cross opens are rejected.** An order that would open or grow a *cross* position
  on that market is refused.
- **You cannot switch it to cross.** A leverage / margin-mode change that targets
  cross on that market is rejected.

The flag is set by a **stake-weighted validator vote** (a per-market dynamic-risk
parameter), not on the trading path. It lets the protocol ring-fence a market whose
risk profile warrants it — new, thin, or volatile listings — so a blow-up there
cannot drain cross-collateralised positions on other markets. The constraint is
surfaced in the per-market metadata returned by
[`/info`](../api/rest/info/perpetuals.md), so a client can show it before a user
tries to open cross.

Unlike the `onlyIsolated` deploy-time flag (fixed once when a
[MIP-3](../mip/mip-3.md) market is created), the governance strict-isolated flag can
be turned **on or off on a live market** by a later vote as its risk profile
changes.

## When to use each {#when-to-use-each}

| Goal | Mode |
|------|------|
| Maximise capital efficiency on a coherent book | Cross (+ PM) |
| Run multiple uncorrelated strategies under one account | Isolated per strategy, OR sub-accounts |
| Contain one risky position from threatening the rest | Isolated (your own choice) |
| Hedge across assets, want netting credit | Cross + PM |
| Trade a long-tail listing governance has flagged strict-isolated | Strict-Iso — automatic, not requested |

For multi-strategy isolation, [sub-accounts](./sub-accounts.md) are usually a better fit than Isolated — sub-accounts isolate the entire account, including agent keys and order space, not just margin.

## Transitions {#transitions}

Switching between Cross and Isolated uses the
[`update_leverage`](../api/rest/exchange.md#update_leverage) action's
`is_isolated` flag — there is no separate margin-mode action, and no way to
request Strict-Iso (see [above](#strict-iso)).

**You can only change mode on an asset while flat in it.** If you hold any
open position (long or short) on that asset, an `update_leverage` call whose
`is_isolated` differs from the position's current mode is rejected — the
position keeps its mode until it is closed. A leverage-only change (same
mode, different `leverage`) is unaffected and always allowed. Once flat,
switching Cross → Isolated takes effect on the next position you open on
that asset; funding its isolated bucket is a separate
[`update_isolated_margin`](#maintenance-margin--health) call.

## Liquidation behaviour {#liquidation-behaviour}

The [tiered liquidation](./tiered-liquidation.md) ladder applies independently per scope:

- **Cross**: one ladder for the whole account
- **Isolated**: one ladder per isolated asset
- **Strict-Iso**: one ladder per strict-iso asset

A Cross-tier T1 closes positions on the cross book proportional to their contribution to maintenance. An Isolated T1 closes only the isolated position. T3 backstop and T4 ADL are per-scope — an isolated blowup doesn't claw back from cross winners.

```mermaid
flowchart TD
    ACC["account (master, PM-enrolled)"]
    ACC --> CB["Cross book"]
    ACC --> IB["Isolated BTC"]
    ACC --> IE["Isolated ETH"]
    ACC --> SS["Strict-Iso SOL"]
    CB --> L1["ladder #1 (PM-derived maint)"]
    IB --> L2["ladder #2 (BTC-only)"]
    IE --> L3["ladder #3 (ETH-only)"]
    SS --> L4["ladder #4 (SOL-only, classical)"]
```

## Sequence — flip cross → isolated {#sequence--flip-cross--isolated}

```mermaid
sequenceDiagram
    participant client
    participant node
    Note over client: initial: FLAT in BTC<br/>free_balance = 5000 USDC
    client->>node: update_leverage<br/>asset=0, leverage=10, is_isolated=true
    Note over node: mode preference for BTC becomes Isolated.<br/>Rejected if a BTC position were open.
    client->>node: submit_order — open long 1 BTC
    client->>node: update_isolated_margin<br/>asset=0, delta="1000"
    Note over node: move 1000 USDC: cross → BTC bucket
    client->>node: /info account_state
    node-->>client: cross free_balance = 4000<br/>BTC bucket = 1000<br/>margin mode for BTC = Isolated
```

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **Auto-deposit on margin add.** Isolated positions take maintenance shortfall from the bucket only — once the bucket is depleted, the position liquidates. Cross does NOT auto-cover an Isolated bucket; you must top it up yourself with [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) and a positive `delta`.
- **Closing an Isolated position.** Closing the full position releases the bucket back into cross balance.
- **Mode of a fresh asset.** New positions default to Cross, unless governance has flagged the market strict-isolated — then every position on it opens in [Strict-Iso](#strict-iso), whatever you prefer. There is no per-asset "isolated only" field on the market metadata; the flag lives on the market's governance risk parameters.
- **Isolated under PM master.** PM netting credit applies to Cross positions only. Isolated positions are summed classically. A PM-enrolled master with one giant Isolated position and tiny Cross book sees almost no PM benefit.

</details>

## See also {#see-also}

- [Portfolio margin](./portfolio-margin.md) — PM-vs-classical math
- [Tiered liquidation](./tiered-liquidation.md) — per-scope ladders
- [Sub-accounts](./sub-accounts.md) — full account-level isolation
- [`update_leverage`](../api/rest/exchange.md#update_leverage) — margin mode is the `is_isolated` flag here; there is no separate margin-mode action

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Can one asset have both Isolated and Strict-Iso buckets?**
A: No. The mode is per-asset and single-valued. The read surface reports it as `"cross"`, `"isolated"` or `"strict_iso"`.

**Q: Does switching modes cost a trade?**
A: No fees, no fills. It's a pure state transition.

**Q: What happens if I deplete an Isolated bucket below maintenance?**
A: That asset's liquidation ladder fires. The rest of your account is unaffected.

**Q: Is auto-deleverage (ADL) cross-scope or per-scope?**
A: Per-scope. ADL on an Isolated position only claws back from counter-parties of *that* asset, not from your Cross book or other Isolated positions.

</details>
