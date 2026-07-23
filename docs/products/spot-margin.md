# Spot margin

:::info
**Cross-collateralized against your unified USDC account.** Leveraged spot trading
funded by the [Earn](../concepts/earn.md) lending pool. [Plain spot](./spot.md) is
balance-only (no leverage); spot margin is the overlay that adds borrow + leverage
on top. The cross-collateralized model is **available from the scheduled network
upgrade on testnet `114514`** — the borrow → leveraged-buy → close loop and
automatic [forced liquidation](#liquidation) run against your one unified USDC
account. A pair enables only once governance calibrates its per-pair risk
parameters, so treat it as a **preview**: per-pair **maintenance ratios are still
being calibrated**. Do not assume production safety at scale.
:::

## TL;DR {#tldr}

Spot margin lets you **borrow quote (USDC) to buy spot with leverage**, instead of
paying 100% upfront. The borrowed USDC comes from the [Earn](../concepts/earn.md)
pool, you pay **interest** on it, and the position carries a **maintenance margin**
and a **liquidation price** like a perp.

Spot margin is **cross-margined against your one unified USDC account** — the same
collateral that backs your perpetual positions. There is **no separate deposit**:
an open holds its margin requirement against your account-wide free collateral, and
liquidation is decided at the account level. A spot-margin loss and a perpetual
loss draw on the same collateral.

## How it works {#how-it-works}

```
1. Open: borrow quote from the Earn pool; the borrow funds the buy 100%.
   The margin requirement is HELD against your unified USDC account
   (no separate deposit).
2. IOC-buy the base asset on the spot book with the borrowed quote.
   The bought base is held SEGREGATED on the margin account.
3. Pay borrow interest continuously while the loan is open.
4. Close: sell the base, repay borrow + accrued interest, keep the remainder.
```

The buy is funded 100% by the borrow. Your **account-wide free collateral** backs
the position — the open subtracts its initial-margin requirement from
`free_collateral` exactly like a perpetual open, so there is no separate collateral
to post, and leverage ≈ `notional / free_collateral`. The bought base is held in a
**segregated** holding on the margin account, never commingled with your spendable
spot balances, so a close (or a later liquidation) touches exactly that base. The
first release allows **one open position per `(account, pair)`** (no add-on); the
open IOC **instantly repays any unspent borrow**, so the outstanding loan equals
only what the buy actually spent.

### Action surface {#action-surface}

Two [`/exchange`](../api/rest/exchange.md#spot-margin--earn-actions) actions (both
sender-authorized) drive the loop. Confirm committed state via
[`/info` `spot_margin_state`](../api/rest/info/spot.md#spot_margin_state).

| Action | Effect |
|---|---|
| [`spot_margin_open`](../api/rest/exchange.md#spot_margin_open) | Borrow + IOC-buy base on leverage; gated by the account-wide initial-margin requirement |
| [`spot_margin_close`](../api/rest/exchange.md#spot_margin_close) | IOC-sell the held base, repay principal + interest, return the remainder to your account |

The old per-pair `spot_margin_deposit` / `spot_margin_withdraw` actions are
**retired** — collateral is your one unified USDC account, so there is nothing
separate to post or withdraw. They stay on the wire for signature compatibility but
are rejected.

### Margin {#margin}

The position's requirement joins your **account-wide** margin, the same figures a
perpetual position uses:

```
position_value   = base_held × mark_px
debt             = borrowed + accrued_interest
position_pnl     = position_value − debt
init_required    = position_value × spot_margin_initial_bps / 10000
maint_required   = position_value × spot_margin_maintenance_bps / 10000
```

`init_required` is subtracted from your account `free_collateral` while the
position is open; `position_pnl` and `maint_required` enter the **account-level**
health decision alongside your perpetual legs. An open is rejected if your
`free_collateral` cannot cover `init_required`. The position is liquidated when the
**account** falls through its maintenance floor — see [Liquidation](#liquidation)
and [margin modes](../concepts/margin-modes.md#spot-margin-cross).

The spot **maintenance ratio is a per-pair parameter, set conservatively** — and
generally higher than a comparably-liquid perp. The reason is mechanical: a
spot-margin liquidation **sells the base into the spot book**, so the maintenance
buffer has to cover the realized **slippage** of unwinding the position at the
threshold, or the lending pool absorbs the shortfall. Thinner (long-tail) books
eat more slippage and so carry a higher ratio. The exact value per pair is
**calibrated from that pair's book depth and volatility against a target
liquidation-slippage bound** — it is a governance-set risk parameter, not a fixed
constant, and a pair does not enable spot margin until its ratio is calibrated.
**On testnet these per-pair ratios are still being calibrated** — a pair without
calibrated risk parameters rejects every spot-margin action for it
(`spot margin not enabled for pair`).

### Interest {#interest}

Borrowed USDC accrues interest at a per-pair rate (`spot_borrow_rate_bps`,
annualised, accrued every block). Interest flows to the [Earn](../concepts/earn.md)
pool, lifting its per-share value — that is the lenders' yield. In the first
release the rate is **fixed**; a utilisation-based curve is a later upgrade.

### Liquidation {#liquidation}

Every block the chain prices your **whole account** — perpetual legs and any
spot-margin position — against the one unified USDC account, and forced-closes when
the account falls through its maintenance floor. A spot-margin position is
liquidated only when its **account** is underwater, not on a per-pair test.

The forced close runs through the **same settled path as a voluntary close** — the
held base is IOC-sold on the spot book, the Earn pool is repaid principal +
interest, the remainder (minus a small **liquidation fee**, which capitalizes the
protocol's insurance fund) is returned to your account. Two anti-cascade properties
mirror the [perp forced close](../concepts/tiered-liquidation.md#how-a-forced-close-executes-the-price-floor):

- **Price floor.** The forced sell is a LIMIT bounded at `mark × (1 − floor)`
  (default: half the maintenance ratio, per-pair configurable). A thin book is
  never swept — whatever cannot sell above the floor stays held and re-evaluates
  next block.
- **Partial fills keep the position open.** Realized proceeds repay debt
  immediately; the unsold base is retried as liquidity returns.

Because collateral is shared, a spot-margin blow-up **can reach your perpetual
account** — the account collateral covers the shortfall first. This is the
risk-isolation trade-off of cross margin.

**Shortfall handling.** When a full unwind cannot cover the debt, your **account
collateral covers the shortfall first**; only a residual the account cannot cover
leaves the pool's borrowed book and is **socialized to the Earn suppliers** — the
pool's supplied total is reduced (floored at zero), which lowers share value. The
conservative per-pair maintenance ratio and the automatic liquidator exist to make
that shortfall rare.

## Fees {#fees}

A spot-margin position carries three distinct charges:

| Charge | When | Rate |
|---|---|---|
| **Trading fee** | on the open and close IOC fills | the pair's [spot maker/taker rate](./spot.md#matching-fills-and-fees) (spot margin trades the spot book) |
| **Borrow interest** | continuously, on the outstanding USDC borrow | `spot_borrow_rate_bps` — per-pair, annualised, accrued every block; flows to the [Earn](../concepts/earn.md) pool as lender yield |
| **Liquidation fee** | only on a forced close | a small per-pair fee that capitalizes the protocol's insurance fund |

The open and close are ordinary spot IOC fills, so they pay the **spot** fee
schedule, not the perp tiers. The borrow interest is the spot-margin-specific cost
— it is exactly the yield [Earn](../concepts/earn.md) suppliers receive. All rates
are per-pair governance parameters; query them via
[`/info spot_margin_state`](../api/rest/info/spot.md#spot_margin_state) and the spot
[`fee_schedule`](../api/rest/info.md#fee_schedule).

## Collateral scope {#collateral-scope}

Spot margin is **cross-collateralized against your one unified USDC account** — the
same pool that backs your perpetual positions. There is no per-pair collateral
bucket.

| | Collateral | Liquidation blast radius |
|---|---|---|
| Spot margin | Your unified USDC account (shared with perps) | Account-wide |

Cross collateral maximises capital efficiency — one balance backs everything — at
the cost of **risk isolation**: a leveraged spot blow-up draws on the same
collateral as your perpetual positions, and a perpetual loss reduces the collateral
that backs a spot-margin position. Size positions with the whole account in mind.
See [margin modes](../concepts/margin-modes.md#spot-margin-cross).

## Relationship to Earn {#relationship-to-earn}

Spot-margin borrowers are the **demand side**; [Earn](../concepts/earn.md)
depositors are the **supply side**. Borrow interest paid by spot-margin traders is
exactly the yield Earn depositors receive. See [Earn](../concepts/earn.md) for the
yield calculation.

## See also {#see-also}

- [Earn](../concepts/earn.md) — the lending pool that funds spot-margin borrows, and how yield is computed
- [Margin modes](../concepts/margin-modes.md) — the cross-collateral model shared with perps
- [Tiered liquidation](../concepts/tiered-liquidation.md) — the liquidation ladder + insurance waterfall

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is plain (unleveraged) spot affected?**
A: No. Buying spot with 100% of your own balance works exactly as before — spot margin is an opt-in overlay.

**Q: Can my spot-margin loss touch my perp account?**
A: Yes. Spot margin is cross-collateralized against your one unified USDC account — the same collateral your perpetual positions use. A spot-margin loss draws on that shared collateral, and a perpetual loss reduces the collateral backing a spot-margin position. There is no per-pair risk isolation.

**Q: Do I post collateral first?**
A: No. There is no separate deposit. An open holds its initial-margin requirement against your account-wide free collateral, exactly like a perpetual open.

**Q: Where does the borrowed USDC come from?**
A: The [Earn](../concepts/earn.md) lending pool. Borrows are capped at the pool's available (un-lent) liquidity.

**Q: What rate do I pay?**
A: A fixed per-pair annualised rate in the first release, accrued every block. Utilisation-based pricing comes later.

</details>
