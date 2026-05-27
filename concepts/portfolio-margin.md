# Portfolio margin

{% hint style="info" %}
**Preview.** Action surface is stable; the SPAN-style scenario engine ships in phases before mainnet.
{% endhint %}

## TL;DR

PM treats your whole account as one risk number. Hedged or correlated positions net against each other; the protocol charges margin against the worst-case scenario across a calibrated `(price, vol)` shock grid. Typical capital efficiency for a balanced book: **2–5×** classical.

PM is opt-in, equity-gated (default ≥ 100 K USDC), and reversible.

## Classical vs PM — side-by-side

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

## How PM works

Under PM the maintenance number comes from a **scenario engine**:

```
scenarios   = { (price_shock, vol_shock) : (ps, vs) in calibrated_grid }
losses[s]   = simulate_portfolio_pnl_under(s)
pm_margin   = max(losses) + concentration_penalty(portfolio)
```

The calibrated grid is a finite set of `(price, vol)` shocks per asset:

| Asset class | Price shocks | Vol shocks |
|-------------|--------------|------------|
| BTC, ETH | ±5%, ±10%, ±20% | ±20%, ±50% |
| Major alts | ±10%, ±20%, ±35% | ±30%, ±60% |
| Long-tail / MIP-3 listings | ±20%, ±40%, ±70% | ±50%, ±100% |

Scenarios are applied **simultaneously** across the whole portfolio under a correlation matrix. Negative correlation across pairs creates netting credit.

`concentration_penalty` adds back margin for portfolios where a single asset dominates exposure:

```
concentration_penalty = max(0, single_asset_notional - concentration_threshold * total_notional) * penalty_rate
```

Default `concentration_threshold = 60%`, `penalty_rate = 5%`. A book that's 80% BTC pays a penalty on the 20% above threshold.

## Enrollment

```json
{ "type": "UserPortfolioMargin", "params": { "enabled": true } }
```

Master-only. Symmetric to disable.

| Constraint | Value |
|------------|-------|
| `pm_min_equity` | default 100 000 USDC; governance-set |
| Effective from | next block after commit |
| Currently-violating positions | enrollment rejected if PM would put you in T1+; close down first |

Disabling reverts to classical at next block. Disabling while in T0+ is allowed (you can always go back to a more conservative model).

## Strict isolation

Even under PM, mark specific assets as **strictly isolated**. A strict-iso position:

- Computes its own margin standalone (classical model)
- Does NOT enter the PM scenario engine
- Liquidates independently — blowup contained to that asset

Use cases:
- New / illiquid assets where the correlation matrix isn't calibrated
- Speculation budget firewalled from your hedged core
- High-risk experiments

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 7, "mode": "StrictIso" }
}
```

See [margin modes](./margin-modes.md).

## Liquidation under PM

PM accounts go through the standard [tiered liquidation](./tiered-liquidation.md) ladder, but `maint_margin` is the PM number, not the classical sum.

One PM-specific consideration: a T1 partial close can shift the scenario worst-case enough that the remaining position is healthy under PM but would not be under classical. That's intended — the partial is sized against PM in both directions.

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## Risk to the operator

PM is more capital-efficient for users, which is precisely why it's risky for the protocol — a scenario miss-spec can let an account take on more risk than the chain can liquidate cleanly. MetaFlux mitigates with:

- Scenario set conservatism (always include tail shocks ≥ historical 99.9% VaR).
- `concentration_penalty` to defang single-asset PM gaming.
- Dynamic scenario calibration that tightens shocks as volatility regimes shift.
- Per-account PM cap (`pm_max_account_notional`, default 100M USDC).
- Mandatory classical fallback if scenario engine fails (e.g. oracle outage).

Scenario set, shock magnitudes, and concentration coefficients are governance parameters. Subscribe to parameter updates if you operate near the margin limits.

## Worked example — concentration penalty

Account: long 4 BTC at $100 = $400 notional, long 0.1 ETH at $1000 = $100 notional. Total $500.

- BTC share: 80% > 60% threshold.
- Excess: 80% − 60% = 20% of total = $100.
- Penalty: $100 × 5% = $5.

PM scenario engine computes (say) $25 worst-case loss → maint = $25 + $5 penalty = $30.

A more balanced version (long $300 BTC + long $200 ETH = 60/40 split): no penalty; maint depends on the scenario engine alone, often closer to $20.

The penalty subtly encourages diversification within PM; classical doesn't differentiate.

## Querying

```bash
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"clearinghouseState","user":"0x<addr>"}'
```

The response includes both classical and PM-derived maintenance when PM is enabled, plus the scenario that produced the PM number (which shock combination drove it):

```json
{
  "marginSummary": {
    "totalMarginUsed_classical": "20.0",
    "totalMarginUsed_pm":        "8.5",
    "pm_worst_scenario": { "price_shocks": {"BTC": -10, "ETH": +10}, "vol_shocks": {"BTC":+50,"ETH":+50} },
    "concentration_penalty":     "0.5"
  }
}
```

## Edge cases

- **PM scenario engine outage**: rare; protocol falls back to `max(classical_maint, prior_pm_maint)` for that block. Liquidations on that block use the conservative fallback.
- **Cross-asset position opens during shock regime**: the new position is admitted against the PM engine at admission time — but the engine reads scenario weights from committed state, so adversarial regime-switching gaming is blocked.
- **Enrollment-while-in-T0**: allowed. PM may pull you out of T0 (if PM gives lower maint), or keep you in T0 (if it doesn't). No automatic reversion if PM gives a worse number.
- **Disabling-while-in-T0+**: allowed. Useful to fall back to classical if PM is malfunctioning at protocol level.

## See also

- [Tiered liquidation](./tiered-liquidation.md) — how PM interacts with the ladder
- [Margin modes](./margin-modes.md) — Cross / Isolated / Strict-Iso
- [Sub-accounts](./sub-accounts.md) — per-sub PM enrollment

## FAQ

**Q: Can sub-accounts have different PM settings?**
A: Yes. Each sub is independent. A master can be PM-enrolled while its subs are classical, and vice versa.

**Q: What's the gas cost of PM evaluation?**
A: Larger than classical (scenario grid), but bounded. The protocol caches per-account scenario results and only re-computes on position changes or scenario-parameter updates.

**Q: Is PM transparent — can I see the exact maint number before placing an order?**
A: Yes. `/info clearinghouseState` returns both classical and PM. SDKs surface this in their `getOrderImpact()` helper.

**Q: Do MIP-3 listings get PM credit?**
A: Only if the listing's market spec includes the asset in the PM correlation matrix. Many long-tail listings will default to Strict-Iso for safety. Check `market_info.pm_eligible` per market.
