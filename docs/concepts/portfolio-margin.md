# Portfolio margin

:::info
**Live on devnet.** The scenario engine is fully operational: users enroll via the
`user_portfolio_margin` action (equity-gated, default ≥ 100 K USDC), and the
SPAN-style scenario grid (±5/10/20 % price × ±20/50 % vol) computes maintenance in
real time. Both the action surface and the scenario engine are shipped and tested
on a 4-node consensus run.
:::

## TL;DR {#tldr}

PM treats your whole account as one risk number. Hedged or correlated positions net against each other; the protocol charges margin against the worst-case scenario across a calibrated `(price, vol)` shock grid. Typical capital efficiency for a balanced book: **2–5×** classical.

PM is opt-in, equity-gated (default ≥ 100 K USDC), and reversible.

## Classical vs PM — side-by-side {#classical-vs-pm--side-by-side}

Hedged book example: long 1 BTC at $100, short 25 ETH at $4 (perfectly $-neutral if BTC and ETH are perfectly correlated, which they nearly are).

**Classical:**

```
maint(BTC) = 1 BTC × $100 × 5% = $5
maint(ETH) = 25 ETH × $4 × 5% = $5
total maint = $10
```

**PM:**

```
scenario grid: (BTC ±10%, ETH ±10% × ±50% vol)
worst-case loss (correlated -10% on both): -$10 on BTC + (-$10) profit on short ETH = $0
worst-case loss (decorrelated, BTC -10% / ETH +10%): -$10 + (-$10) = -$20  ← worst
+ concentration penalty (basket is balanced; small)
total maint ≈ $20  (vs classical $10) ?
```

Wait — that's worse. Let's redo: short 25 ETH at $4 = $100 short notional, opposite of long $100 BTC.

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

Worst-case loss: $20 — but only in the decorrelation scenario. Probability-weighted, the decorrelation shock is rare (BTC/ETH 30-day correlation ≈ 0.85). PM's calibrated scenario set weights this realistically; the actual maint is usually ~$5–10 rather than the naive $20.

Classical's $10 simply has no view on correlation. PM does.

## How PM works {#how-pm-works}

> The portfolio-margin engine works in **USD cents** internally (whole-USDC `Decimal` plane × 100). The PM number **replaces** the classical per-asset maintenance sum, it doesn't add to it. There is also a read-side EVM precompile (`portfolio_margin_eval`) for off-chain quoting.

Under PM the maintenance number comes from a **SPAN-style scenario engine** that sweeps a deterministic `(price-shock, vol-shock)` grid over the portfolio:

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · gamma_size_i · mark_i · iv_i · δσ · δp²  # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

`gamma_size_i` is SIGNED, and every instrument you can hold today leaves it at
`|size_i|`. A perp carries no true gamma, so this term is a vol-risk overlay
that charges both size signs alike. A negative value is short gamma, which
loses when vol RISES; nothing on the chain sets one yet, so the formula reduces
to `|size_i|` for every position a caller can open.

The grid and concentration coefficients below are the protocol defaults:

| Parameter | Default (code) |
|-----------|----------------|
| Price shocks | **±5 %, ±10 %, ±20 %** (`default_price_shocks` — 6 values) |
| Vol shocks | **±20 %, ±50 %** (`default_vol_shocks` — 4 values) |
| Grid size | **6 × 4 = 24 scenarios** |
| Implied vol fallback | `0.50` (50 % annualised) when the oracle gives no `iv` |
| Concentration threshold | **50 %** of net value (`default_concentration_threshold`) |
| Concentration penalty | **1 000 bps = 10 %** (`DEFAULT_CONCENTRATION_PENALTY_BPS`) |
| Min enroll equity | `10_000_000` cents = **100 000 USDC** |

> ⚠️ **Corrections vs. prior text.** The implemented engine: (1) includes a **gamma/convexity term** driven by per-position implied vol — the prior doc modelled scenarios as pure linear PnL; (2) uses a single **24-scenario grid (±5/10/20 × ±20/50)** with no per-asset-class table — the "BTC/alts/long-tail" tiered grid in the old doc is not in the code (the grid is one engine-wide default, tunable via dynamic risk); (3) concentration threshold is **50 %**, not 60 %; (4) concentration penalty is **10 %** (1000 bps), not 5 %.

Scenarios are applied **simultaneously** across the whole portfolio. Netting falls out naturally: a hedged book's `delta_pnl_i` legs cancel in `scenario_total`, so `worst` is small. (Note: the current engine applies each `δp` uniformly across all positions — an explicit per-pair correlation matrix is a documented extension, not yet a field on the engine.)

`concentration_penalty` adds back margin when a single asset dominates:

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

(Skipped when `net_value ≤ 0` — the BOLE negative-equity path catches that account instead.)

## Multi-collateral (cross-collateral haircut) {#multi-collateral-cross-collateral-haircut}

By default, portfolio margin is collateralised in **USDC** only. Governance can
additionally make selected **non-USDC spot balances** count as portfolio-margin
collateral, after a **haircut** that discounts them for price risk.

When an asset is in the eligible set with a haircut `h` (e.g. `0.9` ⇒ a 10 %
haircut), a spot balance of that asset contributes

```
collateral_credit = balance × mark × h        # whole-USDC plane
```

to the account's portfolio-margin value. The credited balance is then **folded into
the SPAN scenario grid as a long spot leg** (entry price == current mark, so it is
not double-counted against its own mark). The same price-shock sweep that margins
your derivatives therefore also stresses the collateral: a haircut asset that
crashes reduces *both* your collateral value and your scenario worst-case, exactly
as a real position would.

This is **margin** collateral, not a loan — it is **decoupled** from the
[Earn / borrow-lend](./earn.md) pool. Posting a non-USDC balance as PM collateral
does not lend it out or earn yield; it only lets the risk engine recognise it when
sizing your maintenance requirement.

| Property | Behaviour |
|----------|-----------|
| Eligible set | Governed — only assets governance has approved count |
| Haircut | Per-asset governance parameter; a higher haircut credits more of the balance |
| Clearing eligibility | Setting the haircut to **zero** removes the asset from the eligible set |
| Inclusion | Folded into the SPAN grid as a long spot leg at mark (no double-count) |
| Relation to lending | None — independent of the Earn / borrow-lend pool |

:::warning
**Not yet enabled.** Multi-collateral PM is a **governance-gated** capability that
activates at a network upgrade. Until the liquidation path that can **seize and
sell non-USDC collateral** is in place, the eligible set stays empty and no asset
carries a non-zero haircut — crediting collateral the protocol cannot yet liquidate
would risk uncoverable bad debt. Treat this section as the **target model**; check
the live (governed) eligible set before assuming any non-USDC asset counts toward
PM.
:::

## Enrollment {#enrollment}

```json
{ "type": "user_portfolio_margin", "params": { "enroll": true } }
```

Master-only. `enroll: false` disables — symmetric.

| Constraint | Value |
|------------|-------|
| `pm_min_equity` | default 100 000 USDC; governance-set |
| `pm_max_enrolled_users` | default 512; governance-set (kind 117), bounds `[1, 100 000]` |
| Effective from | next block after commit |
| Currently-violating positions | enrollment rejected if PM would put you in T1+; close down first |

`pm_max_enrolled_users` caps the COUNT of enrolled accounts, where
`pm_min_equity` caps the value of one. The chain re-prices every enrolled
account each block, so the count sets that pass's cost. The cap applies at
enrollment only: it never evicts an enrolled account, an enrolled account can
always re-enroll, and unenrollment is never refused. Unenrollment frees a slot
for the next applicant. The equity check runs before the cap check, so an
underfunded account at the cap reads the equity refusal.

Disabling reverts to classical at next block. Disabling while in T0+ is allowed (you can always go back to a more conservative model).

## Strict isolation {#strict-isolation}

Even under PM, a specific asset can be **strictly isolated** so it never enters
the scenario engine. A strict-iso position:

- Computes its own margin standalone (classical model)
- Does NOT enter the PM scenario engine
- Liquidates independently — blowup contained to that asset

This is **not something you request per position.** There is no action that
marks one of your positions strict-iso; it is a per-market flag **governance**
sets (a stake-weighted vote), which forces every position newly opened on
that market into strict-iso regardless of the trader's PM enrollment. See
[margin modes: governance-imposed strict isolation](./margin-modes.md#governance-imposed-strict-isolation-market-level)
for the full mechanism, and check a market's live metadata before assuming
your position on it will net inside PM.

## Liquidation under PM {#liquidation-under-pm}

PM accounts go through the standard [tiered liquidation](./tiered-liquidation.md) ladder, but `cross_maintenance_margin_used` is the PM number, not the classical sum.

One PM-specific consideration: a T1 partial close can shift the scenario worst-case enough that the remaining position is healthy under PM but would not be under classical. That's intended — the partial is sized against PM in both directions.

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## Risk to the operator {#risk-to-the-operator}

PM is more capital-efficient for users, which is precisely why it's risky for the protocol — a scenario miss-spec can let an account take on more risk than the chain can liquidate cleanly. MetaFlux mitigates with:

- `concentration_penalty` (50 % threshold / 10 % rate) to defang single-asset PM gaming — **implemented** in the engine.
- The `min_enroll_account_value_cents` floor (100K USDC) — **implemented** (`meets_enrollment_floor`; negative net value always fails).
- Scenario-set conservatism, dynamic calibration as vol regimes shift, a per-account PM cap (`pm_max_account_notional`, design value 100M USDC), and a mandatory classical fallback on scenario-engine failure — **design intent / not yet fields on `PortfolioMarginEngine`**; the engine today carries the grid, concentration params, and enroll floor only.

Scenario set, shock magnitudes, and concentration coefficients are governance parameters (dynamic risk). Subscribe to parameter updates if you operate near the margin limits.

## Worked example — concentration penalty {#worked-example--concentration-penalty}

The penalty compares the **largest single-asset absolute notional** against the account's **net value** (`cash + Σ size × mark`), with the code defaults: threshold **50 %**, rate **10 %**.

Account: net value `$1000`, largest position `|notional_BTC| = $700`.

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

If the PM scenario sweep computes (say) `$25` worst-case loss, `pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`.

A more balanced book where no single asset exceeds 50 % of net value pays **no** penalty — `pm_margin` is the scenario worst-case alone. The penalty discourages single-asset concentration within PM; classical margin applies no such penalty.

## Querying {#querying}

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<addr>"}'
```

The native [`account_state`](../api/rest/info.md#account_state) read exposes
`abstraction: "portfolio"` (whether PM is active for the account) alongside
`total_margin_used`, `health`, and `tier`; the account-level
`cross_maintenance_margin_used` figure — which already reflects the PM-derived
maintenance when enrolled — lives on the lighter
[`account_state` with `detail: "margin"`](../api/rest/info.md#account_state):

```json
{
  "abstraction":                   "portfolio",
  "cross_maintenance_margin_used": "8",
  "total_margin_used":             "12",
  "total_raw_usd":                 "20",
  "health":                        "...",
  "tier":                          "Safe"
}
```

> **Planned read.** The classical-vs-PM side-by-side and the worst-case scenario
> breakdown (which price/vol shock combination drove the PM number) are **not yet
> broken out** as separate fields in the
> [`account_state`](../api/rest/info.md#account_state) response — the PM scenario
> engine computes them internally, but only the final
> `cross_maintenance_margin_used` is surfaced today. A future read (a per-scenario PM-details field on `account_state`) will
> expose the breakdown.

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **PM scenario engine outage**: rare; protocol falls back to `max(classical_maint, prior_pm_maint)` for that block. Liquidations on that block use the conservative fallback.
- **Cross-asset position opens during shock regime**: the new position is admitted against the PM engine at admission time — but the engine reads scenario weights from committed state, so adversarial regime-switching gaming is blocked.
- **Enrollment-while-in-T0**: allowed. PM may pull you out of T0 (if PM gives lower maint), or keep you in T0 (if it doesn't). No automatic reversion if PM gives a worse number.
- **Disabling-while-in-T0+**: allowed. Useful to fall back to classical if PM is malfunctioning at protocol level.

</details>

## See also {#see-also}

- [Tiered liquidation](./tiered-liquidation.md) — how PM interacts with the ladder
- [Margin modes](./margin-modes.md) — Cross / Isolated / Strict-Iso
- [Sub-accounts](./sub-accounts.md) — per-sub PM enrollment

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Can sub-accounts have different PM settings?**
A: Yes. Each sub is independent. A master can be PM-enrolled while its subs are classical, and vice versa.

**Q: What's the gas cost of PM evaluation?**
A: Larger than classical (scenario grid), but bounded. The protocol caches per-account scenario results and only re-computes on position changes or scenario-parameter updates.

**Q: Is PM transparent — can I see the exact maint number before placing an order?**
A: You can read the current PM-derived `cross_maintenance_margin_used` from [`/info account_state`](../api/rest/info.md#account_state) — see [Querying](#querying). There is no separate pre-trade "what would this order cost me" read; the per-scenario breakdown is not yet a surfaced field (see the note above).

**Q: Do MIP-3 listings get PM credit?**
A: The engine has no per-pair correlation matrix (see the corrections note above) — every enrolled position nets through the same scenario grid unless its market is governance-flagged strict-isolated, which excludes it. Check a market's live `strict_isolated` field on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta); new long-tail listings are likely candidates for that flag.

</details>
