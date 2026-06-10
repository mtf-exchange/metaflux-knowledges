# Spot margin

{% hint style="info" %}
**Available on devnet (preview).** Leveraged spot trading funded by the
[Earn](./earn.md) lending pool. [Plain spot](./spot-trading.md) is balance-only
(no leverage); spot margin is the overlay that adds borrow + leverage on top.
The full deposit → borrow → leveraged-buy → close loop runs end-to-end on
**devnet today** (see the [action surface](#action-surface) below). Treat it as a
**preview**: forced-liquidation settlement is **not yet wired** (a forced close
does not realize PnL or decrement open interest), and per-pair **maintenance
ratios are governance parameters still being calibrated**. Leverage works on
devnet; do not assume production safety at scale.
{% endhint %}

## TL;DR

Spot margin lets you **borrow quote (USDC) against collateral to buy spot with leverage**, instead of paying 100% upfront. The borrowed USDC comes from the [Earn](./earn.md) pool, you pay **interest** on it, and the position carries a **maintenance margin** and a **liquidation price** like a perp.

In the first release spot margin is **isolated per pair** — each leveraged spot position posts its own margin and is liquidated on its own, separate from your perp cross account.

## How it works

```
1. Post collateral (USDC) for the pair — a pure loss buffer.
2. Borrow quote from the Earn pool; the borrow funds the buy 100%.
3. IOC-buy the base asset on the spot book with the borrowed quote.
   The bought base is held SEGREGATED on the margin account.
4. Pay borrow interest continuously while the loan is open.
5. Close: sell the base, repay borrow + accrued interest, keep the remainder.
```

Collateral does **not** fund the buy — the borrow does. Collateral is the loss
buffer that makes the position over-collateralizable, so leverage ≈
`notional / collateral`. The bought base is held in a **segregated** holding on
the margin account, never commingled with your spendable spot balances, so a
close (or a later liquidation) touches exactly that position. The first release
allows **one open position per `(account, pair)`** (no add-on); the open IOC
**instantly repays any unspent borrow**, so the outstanding loan equals only what
the buy actually spent.

### Action surface

The six [`/exchange`](../api/rest/exchange.md#spot-margin--earn) actions (all
sender-authorized) drive the loop. Confirm committed state via
[`/info` `spot_margin_state`](../api/rest/info.md#spot_margin_state).

| Action | Effect |
|---|---|
| [`spot_margin_deposit`](../api/rest/exchange.md#spot_margin_deposit) | Post quote collateral for the pair (margin must be enabled) |
| [`spot_margin_open`](../api/rest/exchange.md#spot_margin_open) | Borrow + IOC-buy base on leverage; gated by the initial-margin requirement |
| [`spot_margin_close`](../api/rest/exchange.md#spot_margin_close) | IOC-sell the held base, repay principal + interest, return the remainder |
| [`spot_margin_withdraw`](../api/rest/exchange.md#spot_margin_withdraw) | Withdraw free collateral (full when flat; initial-margin-gated while open) |

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
**On devnet these per-pair ratios are still being calibrated** — a pair without
calibrated risk parameters rejects every spot-margin action for it
(`spot margin not enabled for pair`).

### Interest

Borrowed USDC accrues interest at a per-pair rate (`spot_borrow_rate_bps`, annualised, accrued every block). Interest flows to the [Earn](./earn.md) pool, lifting its per-share value — that is the lenders' yield. In the first release the rate is **fixed**; a utilisation-based curve is a later upgrade.

### Liquidation

{% hint style="warning" %}
**Not yet wired (preview).** On devnet a position is unwound only by the owner's
voluntary [`spot_margin_close`](../api/rest/exchange.md#spot_margin_close);
**forced-liquidation settlement is not implemented** — a forced close does not yet
realize PnL or decrement open interest. The maintenance ratio below is defined but
not yet enforced by a liquidator. Do not rely on automatic liquidation in this
preview.
{% endhint %}

The intended model: a spot-margin position is liquidated through the **same tiered
liquidation engine the perps use**, applied to the position's **own isolated
margin**, so a spot blow-up settles against its own collateral and the Earn pool
and never reaches the perp cross account. The exact forced-close mechanism — how
the held base is unwound and the debt settled — is still being finalized.

**Shortfall handling (live on devnet today).** When a close cannot cover the debt
(proceeds + collateral fall short), the whole loan principal still leaves the
pool's borrowed book and the **shortfall is socialized to the Earn suppliers** —
the pool's supplied total is reduced (floored at zero), which lowers share value.
This is the conservative-ratio + (future) liquidator design's reason for existing:
to make a shortfall rare.

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
