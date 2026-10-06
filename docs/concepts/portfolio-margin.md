# Portfolio margin

This page explains portfolio margin (PM): how the chain computes it, who can enroll and how it
changes liquidation.

:::info
**Live on testnet.** The scenario engine is fully operational. Users enroll with the
`user_portfolio_margin` action. Enrollment is equity-gated, with a default of 100 K USDC or more.
The SPAN-style scenario grid (±5/10/20 % price × ±20/50 % vol) computes maintenance in real time.
The action surface and the scenario engine are both shipped and tested on a 4-node consensus run.
:::

## Overview {#tldr}

PM treats your whole account as one risk number. Hedged or correlated positions net against each
other. The protocol charges margin against the worst-case scenario across a calibrated
`(price, vol)` shock grid. For a balanced book, capital efficiency is typically 2 to 5 times that
of classical margin.

PM is opt-in, equity-gated (default 100 K USDC or more) and reversible.

## Classical and PM compared {#classical-vs-pm--side-by-side}

Take a hedged book: long 1 BTC at $100 and short 25 ETH at $4. Both legs are $100 of notional, and
they point in opposite directions. The two legs offset if BTC and ETH move together.

Classical margin sums the maintenance of each asset:

```
maint(BTC) = 1 BTC × $100 × 5% = $5
maint(ETH) = 25 ETH × $4 × 5% = $5
total maint = $10
```

PM checks these example price scenarios:

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

The worst-case loss is $20, and it occurs only in a decorrelation scenario. That shock is rare:
the 30-day BTC/ETH correlation is about 0.85. The calibrated scenario set weights it
accordingly, so the actual PM maintenance is usually about $5 to $10, not the raw $20.

Classical margin takes no view on correlation. PM does.

## How PM works {#how-pm-works}

> The portfolio-margin engine works in USD cents internally (the whole-USDC `Decimal` plane × 100).
> The PM number replaces the classical per-asset maintenance sum. It does not add to it. A
> read-side EVM precompile, `portfolio_margin_eval`, serves off-chain quotes.

Under PM, the maintenance number comes from a SPAN-style scenario engine. The engine sweeps a
deterministic `(price-shock, vol-shock)` grid over the portfolio:

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · gamma_size_i · mark_i · iv_i · δσ · δp²  # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

`gamma_size_i` is signed. Every instrument you can hold today leaves it at `|size_i|`. A perp
carries no true gamma, so this term is a vol-risk overlay that charges both size signs alike. A
negative value is short gamma, which loses when vol rises. Nothing on the chain sets a negative
value yet, so the formula reduces to `|size_i|` for every position a caller can open.

The grid and concentration coefficients below are the protocol defaults:

| Parameter | Default (code) |
|-----------|----------------|
| Price shocks | ±5 %, ±10 %, ±20 % (`default_price_shocks`, 6 values) |
| Vol shocks | ±20 %, ±50 % (`default_vol_shocks`, 4 values) |
| Grid size | 6 × 4 = 24 scenarios |
| Implied vol fallback | `0.50` (50 % annualised) when the oracle gives no `iv` |
| Concentration threshold | 50 % of net value (`default_concentration_threshold`) |
| Concentration penalty | 1 000 bps = 10 % (`DEFAULT_CONCENTRATION_PENALTY_BPS`) |
| Min enroll equity | `10_000_000` cents = 100 000 USDC |

:::note
The engine includes a gamma (convexity) term, driven by the implied vol of each position. It uses
one engine-wide 24-scenario grid (±5/10/20 × ±20/50). There is no per-asset-class grid table.
Dynamic risk can tune the grid. The concentration threshold is 50 % and the concentration penalty
is 10 % (1000 bps).
:::

The engine applies scenarios simultaneously across the whole portfolio. Netting follows from
this. In a hedged book, the `delta_pnl_i` legs cancel in `scenario_total`, so `worst` is small. The
current engine applies each `δp` uniformly across all positions. An explicit per-pair correlation
matrix is a documented extension. It is not yet a field on the engine.

`concentration_penalty` adds margin when one asset dominates:

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

The engine skips the penalty when `net_value ≤ 0`. The BOLE negative-equity path catches that
account instead.

## Multi-collateral haircut {#multi-collateral-cross-collateral-haircut}

**No spot token counts today.** A token counts only after governance sets a positive
`pm_collateral_haircut` for it. No token has one yet. Until that vote, portfolio margin is
collateralised in USDC only.

By default, portfolio margin is collateralised in USDC only. Governance can also make a selected
spot token count as portfolio-margin collateral. The token then takes a *haircut* that discounts it
for price risk.

### Which tokens count {#pm-collateral-eligibility}

A spot token counts only when governance sets a *collateral weight* `h` for that token. The weight
is the `pm_collateral_haircut` value, in `(0, 1]`. A weight of `0.95` credits 95 % of the value,
which is a 5 % haircut. Governance sets the weight on the spot token id, never on a market id.

The mark of the token is the oracle price of its *price perpetual*. This is the perpetual market
that governance names for the token. When governance names none, it is the perpetual with the same
symbol. The BTC token takes its mark from the BTC perpetual. A token whose symbol differs from its
perpetual needs the named mapping. One example is a bridged `gBTC` priced by `BTC`. A token is
never eligible in these cases, whatever its weight:

- The token has no price perpetual. Governance names none, and no perpetual has the same symbol.
- The price perpetual is a deployer market, not a native perp market.
- The price perpetual is [self-priced](./oracle-prices.md#self-priced-markets). Its price comes
  from its own book.
- The price perpetual is delisted or inactive.

A named price perpetual that fails one of these checks makes the token ineligible. The chain does
not fall back to the perpetual with the same symbol.

Governance names a price perpetual only for a token that has no usable same-symbol perpetual. The
chain refuses a vote that names another perpetual for such a token. One unit of the token must
equal one unit of the underlying of the perpetual. The credit multiplies the token balance by the
price of the perpetual and applies no unit ratio.

USDC has weight 1 and takes no haircut.

### The credit {#pm-collateral-credit}

A spot balance of an eligible token adds this to the portfolio-margin value of the account:

```
collateral_credit = balance × mark × h        # whole-USDC plane
```

The full, un-weighted balance also enters the SPAN scenario grid. It enters as a long spot leg of
the same perpetual market, with the entry price equal to the current mark. So the engine does not
double-count it against its own mark. The weight discounts the credit only. The same price-shock
sweep that margins your derivatives also stresses the collateral. A token that crashes reduces both
your collateral value and your scenario worst case, as a real position would. A long collateral
balance and a short position on its price perpetual offset in the grid.

A stale oracle removes the credit. When the oracle price of the perpetual is stale, or the oracle
has not yet sourced one, the token credits nothing. The protocol also cannot seize it in a
liquidation. The credit returns with a fresh price.

This is margin collateral, not a loan. It is decoupled from the [Earn / borrow-lend](./earn.md)
pool. Posting a spot balance as PM collateral does not lend it out or earn yield. Only a spot
balance counts. A spot-margin position opened with borrowed USDC adds no credit.

| Property | Behaviour |
|----------|-----------|
| Eligible set | The spot tokens with a positive collateral weight and a price perpetual that is native and not self-priced |
| Collateral weight | Per-token governance parameter `pm_collateral_haircut`. A higher weight credits more of the balance |
| Clearing eligibility | Setting the weight to zero removes the token from the eligible set |
| Mark | The oracle price of the price perpetual: the one governance names for the token or, when none is named, the perpetual with the same symbol |
| Inclusion | The full balance, folded into the SPAN grid as a long spot leg at mark (no double-count) |
| Stale oracle | No credit and no seizure until the price is fresh |
| Relation to lending | None. It is independent of the Earn / borrow-lend pool |

The initial weights, once those spot tokens exist, are `0.95` for BTC and ETH, and `0.8` for SOL
and BNB. A spot token that governance registers appears in
[`markets_meta`](../api/rest/info/spot.md) under `spot.tokens`. Read that list before you assume a
token exists.

## Enrollment {#enrollment}

```json
{ "type": "user_portfolio_margin", "params": { "enroll": true } }
```

Only a master account can enroll. `enroll: false` disables PM, symmetrically.

| Constraint | Value |
|------------|-------|
| `pm_min_equity` | default 100 000 USDC; governance-set |
| `pm_max_enrolled_users` | default 512; governance-set (kind 117), bounds `[1, 100 000]` |
| Effective from | next block after commit |
| Currently-violating positions | enrollment rejected if PM would put you in T1+; close down first |

`pm_max_enrolled_users` caps the count of enrolled accounts. `pm_min_equity` caps the value of one.
The chain re-prices every enrolled account each block, so the count sets the cost of that pass. The
cap applies at enrollment only. It never evicts an enrolled account. An enrolled account can
always re-enroll, and the chain never refuses an unenrollment. Unenrollment frees a slot for the
next applicant. The equity check runs before the cap check, so an underfunded account at the cap
reads the equity refusal.

Disabling reverts to classical margin at the next block. Disabling while in T0 or worse is allowed,
because you can always go back to a more conservative model.

## Strict isolation {#strict-isolation}

Even under PM, a specific asset can be *strictly isolated*, so it never enters the scenario engine.
A strict-iso position:

- computes its own margin standalone, with the classical model
- does not enter the PM scenario engine
- liquidates independently, so a blowup stays inside that asset

You do not request this per position. No action marks one of your positions strict-iso. It is a
per-market flag that governance sets by a stake-weighted vote. The flag forces every position newly
opened on that market into strict-iso, whatever the PM enrollment of the trader. See
[margin modes: governance-imposed strict isolation](./margin-modes.md#governance-imposed-strict-isolation-market-level)
for the full mechanism. Check the live metadata of a market before you assume your position on it
nets inside PM.

## Liquidation under PM {#liquidation-under-pm}

PM accounts use the standard [tiered liquidation](./tiered-liquidation.md) ladder. The difference
is that `cross_maintenance_margin_used` is the PM number, not the classical sum.

One PM-specific effect: a T1 partial close can shift the scenario worst case enough that the
remaining position is healthy under PM but would not be under classical margin. This is intended.
The partial is sized against PM in both directions.

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## Risk to the operator {#risk-to-the-operator}

PM is more capital-efficient for users. That is also why it is risky for the protocol. A scenario
mis-specification can let an account take on more risk than the chain can liquidate cleanly.
MetaFlux mitigates this with:

- `concentration_penalty` (50 % threshold, 10 % rate), which blunts single-asset PM gaming. It is
  implemented in the engine.
- The `min_enroll_account_value_cents` floor (100K USDC). It is implemented as
  `meets_enrollment_floor`. A negative net value always fails.
- Scenario-set conservatism, dynamic calibration as vol regimes shift, a per-account PM cap
  (`pm_max_account_notional`, design value 100M USDC) and a mandatory classical fallback on
  scenario-engine failure. These are design intent. They are not yet fields on
  `PortfolioMarginEngine`. Today the engine carries the grid, the concentration parameters and the
  enroll floor only.

The scenario set, the shock magnitudes and the concentration coefficients are governance parameters
(dynamic risk). Subscribe to parameter updates if you operate near the margin limits.

## Concentration penalty example {#worked-example--concentration-penalty}

The penalty compares the largest single-asset absolute notional with the net value of the account
(`cash + Σ size × mark`). It uses the code defaults: threshold 50 %, rate 10 %.

The account has a net value of `$1000` and a largest position of `|notional_BTC| = $700`.

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

Say the PM scenario sweep computes a `$25` worst-case loss. Then
`pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`.

A more balanced book, where no single asset exceeds 50 % of net value, pays no penalty. Its
`pm_margin` is the scenario worst case alone. The penalty discourages single-asset concentration
within PM. Classical margin applies no such penalty.

## Querying {#querying}

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<addr>"}'
```

The native [`account_state`](../api/rest/info/account.md#account_state) read exposes
`abstraction: "portfolio"`, which says whether PM is active for the account. It also exposes
`perp.init_margin`, `health` and `tier`. The account-level `cross_maintenance_margin_used` figure
already reflects the PM-derived maintenance when the account is enrolled. It lives on the lighter
[`account_state` with `detail: "margin"`](../api/rest/info/account.md#account_state):

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

:::note Planned read
The classical-vs-PM comparison and the worst-case scenario breakdown are not yet separate fields
in the [`account_state`](../api/rest/info/account.md#account_state) response. The breakdown says
which price and vol shock combination drove the PM number. The PM scenario engine computes it
internally, but only the final `cross_maintenance_margin_used` is surfaced today. A future read,
a per-scenario PM-details field on `account_state`, will expose the breakdown.
:::

Four PM figures sit in different places. `perp.pm_maint_margin` and `perp.pm_concentration_penalty`
are perp-scoped, so they ride the `perp` lane. `pm_net_value` stays at the top level. Its cash term
is the whole unified USDC pool. Under multi-collateral it also folds in haircut-valued spot
balances. So it is the PM twin of `account_value`. A client that sums the lanes to rebuild the
account would count the same USDC twice. The fourth figure, `cross_maintenance_margin_used`, is on
`detail: "margin"` only. See the
[lane split](../changelog/migrations.md#account-state-lane-split).

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **PM scenario engine outage.** This is rare. The protocol falls back to
  `max(classical_maint, prior_pm_maint)` for that block. Liquidations on that block use the
  conservative fallback.
- **Cross-asset position opens during a shock regime.** The engine admits the new position against
  PM at admission time. The engine reads scenario weights from committed state, so adversarial
  regime-switching gaming is blocked.
- **Enrollment while in T0.** Allowed. PM can pull you out of T0 if it gives lower maintenance. It
  keeps you in T0 if it does not. There is no automatic reversion if PM gives a worse number.
- **Disabling while in T0 or worse.** Allowed. Use it to fall back to classical margin if PM
  malfunctions at protocol level.

</details>

## See also {#see-also}

- [Tiered liquidation](./tiered-liquidation.md): how PM interacts with the ladder
- [Margin modes](./margin-modes.md): Cross, Isolated and Strict-Iso
- [Sub-accounts](./sub-accounts.md): per-sub PM enrollment

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Can sub-accounts have different PM settings?**
A: Yes. Each sub-account is independent. A master can be PM-enrolled while its subs are classical,
and the reverse.

**Q: What is the gas cost of PM evaluation?**
A: It is larger than classical margin because of the scenario grid, but it is bounded. The protocol
caches per-account scenario results. It recomputes only on position changes or scenario-parameter
updates.

**Q: Is PM transparent? Can I see the exact maintenance number before I place an order?**
A: You can read the current PM-derived `cross_maintenance_margin_used` from
[`/info account_state`](../api/rest/info/account.md#account_state). See [Querying](#querying).
There is no separate pre-trade read of what an order would cost. The per-scenario breakdown is not
yet a surfaced field (see the note above).

**Q: Do MIP-3 listings get PM credit?**
A: The engine has no per-pair correlation matrix (see [How PM works](#how-pm-works)). Every
enrolled position nets through the same scenario grid, unless governance flags its market
strict-isolated, which excludes it. Check the live `strict_isolated` field of a market on
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta). New long-tail listings are likely
candidates for that flag.

</details>
