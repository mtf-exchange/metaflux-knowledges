# Spot margin

{% hint style="info" %}
**Upcoming.** Leveraged spot trading funded by the [Earn](./earn.md) lending
pool. [Plain spot](./spot-trading.md) is **live today** and balance-only (no
leverage); spot margin is the planned overlay that adds borrow + leverage on top.
{% endhint %}

## TL;DR

Spot margin lets you **borrow quote (USDC) against collateral to buy spot with leverage**, instead of paying 100% upfront. The borrowed USDC comes from the [Earn](./earn.md) pool, you pay **interest** on it, and the position carries a **maintenance margin** and a **liquidation price** like a perp.

In the first release spot margin is **isolated per pair** — each leveraged spot position posts its own margin and is liquidated on its own, separate from your perp cross account.

## How it works

```
1. Post collateral (USDC) for the pair.
2. Borrow quote from the Earn pool, up to the initial-margin limit.
3. Buy the base asset on the spot book with (collateral + borrow).
4. Pay borrow interest continuously while the loan is open.
5. Close: sell the base, repay borrow + accrued interest, keep the remainder.
```

### Margin

```
position_value   = base_held × mark_px
debt             = borrowed + accrued_interest
equity           = position_value − debt
init_required    = position_value × spot_margin_initial_bps / 10000
maint_required   = position_value × spot_margin_maintenance_bps / 10000
health           = equity / maint_required
```

An open is rejected if it would leave `equity < init_required`. The position liquidates when `health < 1` (equity falls to the maintenance floor).

The spot **maintenance ratio is a per-pair parameter, set conservatively** — and
generally higher than a comparably-liquid perp. The reason is mechanical: a
spot-margin liquidation **sells the base into the spot book**, so the maintenance
buffer has to cover the realized **slippage** of unwinding the position at the
threshold, or the lending pool absorbs the shortfall. Thinner (long-tail) books
eat more slippage and so carry a higher ratio. The exact value per pair is
**calibrated from that pair's book depth and volatility against a target
liquidation-slippage bound** — it is a governance-set risk parameter, not a fixed
constant, and a pair does not enable spot margin until its ratio is calibrated.

### Interest

Borrowed USDC accrues interest at a per-pair rate (`spot_borrow_rate_bps`, annualised, accrued every block). Interest flows to the [Earn](./earn.md) pool, lifting its per-share value — that is the lenders' yield. In the first release the rate is **fixed**; a utilisation-based curve is a later upgrade.

### Liquidation

Spot-margin positions are liquidated by a **dedicated spot-liquidator role**, separate from the perp liquidation engine, so a spot liquidation can never drain the perp liquidator credit line. The liquidator closes the position on the spot book; any uncovered shortfall is absorbed by the insurance buffer first, the same waterfall perps use.

## Collateral scope

| Release | Collateral | Liquidation blast radius |
|---|---|---|
| V1 | **Isolated per pair** — each position posts its own USDC | Only that position |
| Later | Cross-eligible (shares the account collateral) | Account-wide |

Isolated-per-pair keeps the first release contained: a leveraged spot blow-up cannot reach your perp cross balance.

## Relationship to Earn

Spot-margin borrowers are the **demand side**; [Earn](./earn.md) depositors are the **supply side**. Borrow interest paid by spot-margin traders is exactly the yield Earn depositors receive. See [Earn](./earn.md) for the yield calculation.

## See also

- [Earn](./earn.md) — the lending pool that funds spot-margin borrows, and how yield is computed
- [Margin modes](./margin-modes.md) — margin model shared with perps
- [Tiered liquidation](./tiered-liquidation.md) — the liquidation ladder + insurance waterfall

## FAQ

**Q: Is plain (unleveraged) spot affected?**
A: No. Buying spot with 100% of your own balance works exactly as before — spot margin is an opt-in overlay.

**Q: Can my spot-margin loss touch my perp account?**
A: Not in the first release — spot margin is isolated per pair. Cross collateral is a later, opt-in upgrade.

**Q: Where does the borrowed USDC come from?**
A: The [Earn](./earn.md) lending pool. Borrows are capped at the pool's available (un-lent) liquidity.

**Q: What rate do I pay?**
A: A fixed per-pair annualised rate in the first release, accrued every block. Utilisation-based pricing comes later.
