# Portfolio margin

> Status: **preview**. Action surface is stable; the SPAN-style scenario engine ships in phases before mainnet.

**Portfolio margin (PM)** treats your whole account's risk as one number instead of summing per-asset maintenance margins independently. If you're long BTC perps and short ETH perps, classical per-position margin charges you twice; PM nets the correlated parts and charges once for the net exposure.

The result: substantially higher capital efficiency for hedged or correlated books, while keeping risk-of-ruin behaviour identical at the limit.

## The classical baseline

Without PM, an account holding positions across `N` assets has:

```
maintenance_margin_total = Σᵢ  notionalᵢ × maintenance_margin_ratioᵢ
```

Each position is treated as if it lived alone. A long BTC + short ETH spread book pays for both legs even though the dollar VaR is well below the sum.

## What PM does

Under PM the maintenance number comes from a **scenario engine**:

```
scenarios   = { (price_shock, vol_shock) : shock ∈ ±5%, ±10%, ±20% × vol ±20%, ±50% }
losses[s]   = simulate_portfolio_pnl_under(s)
pm_margin   = max(losses) + concentration_penalty
```

You apply each `(price, vol)` shock simultaneously across every asset in the portfolio, account for correlations, and take the worst-case loss. That loss becomes your maintenance requirement — typically a fraction of what the classical sum would be.

The `concentration_penalty` adds back margin for accounts that load up overwhelmingly on a single asset, preventing PM from over-rewarding non-diversified books.

## Enrollment

PM is opt-in. Enable it via:

```json
{
  "type": "UserPortfolioMargin",
  "params": { "enabled": true }
}
```

Disabling is symmetric (`enabled: false`).

PM enrollment is **volume-gated**: accounts below a configurable equity threshold (default 100 K USDC) cannot opt in. The intent is to keep PM aligned with users who have the operational sophistication to manage cross-asset risk — retail accounts use the classical model where each blow-up is contained.

After enrollment, every margin computation across your account (open new positions, modify, liquidation checks) uses the PM number instead of the classical sum.

## Strict isolation

Even under PM, you can mark specific assets as **strictly isolated**. A strictly-isolated position:

- has its margin computed standalone (classical model)
- does not contribute to the PM scenario engine
- liquidates independently — a blowup on a strict-iso position cannot threaten the rest of the account

Use cases:
- New / illiquid assets where PM's correlation assumptions don't apply
- Speculation budget you want firewalled from your hedged core book
- High-risk experiments

```json
{
  "type": "UpdateIsolatedMargin",
  "params": {
    "asset":    7,
    "isolated": true
  }
}
```

## Risk to operator

PM is more capital-efficient for users, which is precisely why it's risky for the protocol — a single scenario miss-spec can let an account take on more risk than the chain can liquidate cleanly. MetaFlux mitigates with:

- Scenario set conservatism (always include tail shocks ≥ historical 99.9 % VaR)
- `concentration_penalty` to defang single-asset PM gaming
- Dynamic scenario calibration that tightens shocks as volatility regimes shift
- A per-account PM cap so the absolute exposure under PM is bounded

The scenario set, shock magnitudes, and concentration coefficients are governance parameters and may change. Subscribe to parameter updates if you operate near the margin limits.

## Liquidation under PM

PM accounts go through the same [tiered liquidation](./tiered-liquidation.md) ladder — T0 yellow card → T1 partial → T2 full → T3 backstop → T4 ADL — but `maintenance_margin` is the PM number, not the classical sum.

One PM-specific consideration: a partial close in T1 may shift the scenario worst-case enough that the remaining position is healthy under PM but would not be under classical. That's intended — the partial close is sized against PM in both directions.

## Querying

```json
POST /info
{ "type": "clearinghouseState", "user": "0x<addr>" }
```

The response includes both the classical and the PM-derived maintenance numbers when PM is enabled, plus the scenario that produced the PM number (so you can see which shock drove your margin requirement).

## See also

- [Tiered liquidation](./tiered-liquidation.md) — how PM interacts with the ladder
- [Sub-accounts](./sub-accounts.md) — per-sub PM enrollment
