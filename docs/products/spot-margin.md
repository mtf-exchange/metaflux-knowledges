# Spot margin

This page describes spot margin: a borrow of USDC to buy spot with leverage.

:::info
**Preview.** The loop of borrow, leveraged buy and close is live. Automatic
[forced liquidation](#liquidation) is live. A pair enables only when governance calibrates
its risk parameters, and no pair is calibrated yet. Do not assume production safety at
scale.
:::

## Overview {#tldr}

Spot margin lets you borrow quote (USDC) to buy spot with leverage. You do not pay 100%
up front. The borrowed USDC comes from the [Earn](../concepts/earn.md) pool, and you pay
interest on it. Like a perp, the position has a maintenance margin and a
liquidation price.

Spot margin is cross-margined against your one unified USDC account. This is the same
collateral that backs your perpetual positions. There is no separate deposit. An open
holds its margin requirement against the free collateral of your whole account. Liquidation
is decided at the account level. A spot-margin loss and a perpetual loss draw on the same
collateral.

## Position loop {#how-it-works}

```
1. Open: borrow quote from the Earn pool; the borrow funds the buy 100%.
   The margin requirement is HELD against your unified USDC account
   (no separate deposit).
2. IOC-buy the base asset on the spot book with the borrowed quote.
   The bought base is held SEGREGATED on the margin account.
3. Pay borrow interest continuously while the loan is open.
4. Close: sell the base, repay borrow + accrued interest, keep the remainder.
```

Leverage is `notional /` free collateral. The margin account holds the bought base in a
segregated holding. It never mixes with your spendable spot balances, so a close or a
later liquidation touches exactly that base. The first release allows one open position
per `(account, pair)`, with no add-on. The open IOC repays any unspent borrow at once,
so the outstanding loan equals only what the buy spent.

### Actions {#action-surface}

Two sender-authorized [`/exchange`](../api/rest/exchange/spot-margin.md) actions run the
loop. To confirm the committed state, read
[`/info` `spot_margin_state`](../api/rest/info/spot.md#spot_margin_state).

| Action | Effect |
|---|---|
| [`spot_margin_open`](../api/rest/exchange/spot-margin.md#spot_margin_open) | Borrows and IOC-buys base with leverage. The initial-margin requirement of the whole account gates it. |
| [`spot_margin_close`](../api/rest/exchange/spot-margin.md#spot_margin_close) | IOC-sells the held base, repays principal and interest, and returns the remainder to your account. |

### Margin {#margin}

The requirement of the position joins your account-wide margin. It uses the same figures
as a perpetual position:

```
position_value   = base_held × mark_px
debt             = borrowed + accrued_interest
position_pnl     = position_value − debt
init_required    = position_value × spot_margin_initial_bps / 10000
maint_required   = position_value × spot_margin_maintenance_bps / 10000
```

While the position is open, `init_required` is subtracted from the free collateral of your
account. `position_pnl` and `maint_required` enter the account-level health decision
with your perpetual legs. The engine rejects an open if your free collateral cannot cover
`init_required`. The account read gives free collateral as
[`withdrawable`](../api/rest/info/account.md#account_state). That figure is the same budget
clamped at zero. The gate itself keeps the raw signed value. The position is liquidated
when the account falls through its maintenance floor. See [Liquidation](#liquidation)
and [margin modes](../concepts/margin-modes.md#spot-margin-cross).

The spot maintenance ratio is a parameter for each pair, and it is set conservatively.
It is usually higher than the ratio of a perp with the same liquidity. The reason is
mechanical. A spot-margin liquidation sells the base into the spot book. The maintenance
buffer must cover the slippage of the unwind at the threshold. If it does not, the
lending pool takes the shortfall. Thinner books (long-tail pairs) have more slippage, so they
have a higher ratio.

The exact value for each pair is calibrated from the book depth and volatility of that
pair, against a target bound on liquidation slippage. It is a risk parameter that
governance sets. It is not a fixed constant. A pair does not enable spot margin until its
ratio is calibrated. On testnet, the calibration of these ratios is not complete. A pair
without calibrated risk parameters rejects every spot-margin action for it
(`spot margin not enabled for pair`).

### Interest {#interest}

Borrowed USDC accrues interest at a rate for each pair (`spot_borrow_rate_bps`, annualised,
accrued every block). Interest goes to the [Earn](../concepts/earn.md) pool and raises its
value per share. That is the yield of the lenders. In the first release the rate is
fixed. A curve based on utilisation is a later upgrade.

The rate is `0` today, so nothing accrues. The accrual step stamps the time and leaves
the index where it was. One governance vote sets a non-zero rate. Another vote calibrates a
pair, so that a borrow is possible at all. Until both votes land, there is no interest to pay
and no yield to earn. See [Earn](../concepts/earn.md).

### Liquidation {#liquidation}

Every block, the chain prices your whole account against the one unified USDC account.
This includes the perpetual legs and any spot-margin position. The chain force-closes when
the account falls through its maintenance floor. A spot-margin position is liquidated only
when its account is underwater. There is no test for each pair.

The forced close uses the same settled path as a voluntary close:

1. The engine IOC-sells the held base on the spot book.
2. The engine repays principal and interest to the Earn pool.
3. The engine returns the remainder to your account, minus a small liquidation fee. The
   fee goes to the insurance fund of the protocol.

Two properties stop a cascade. They are the same as for the
[perp forced close](../concepts/tiered-liquidation.md#how-a-forced-close-executes-the-price-floor):

- **Price floor.** The forced sell is a LIMIT order bounded at `mark × (1 − floor)`. The
  default floor is half the maintenance ratio, and each pair can set its own. A thin book is
  never swept. Base that cannot sell above the floor stays held, and the chain evaluates it
  again in the next block.
- Partial fills keep the position open. Realized proceeds repay debt at once. The engine
  tries the unsold base again when liquidity returns.

Collateral is shared, so a spot-margin loss can reach your perpetual account. The
account collateral covers the shortfall first. This is the trade-off of cross margin: less
risk isolation.

**Shortfall.** When a full unwind cannot cover the debt, your account collateral covers
the shortfall first. A residual that the account cannot cover leaves the borrowed book of
the pool. It is socialized to the Earn suppliers. The supplied total of the pool goes
down (floored at zero), and this lowers the share value. The conservative maintenance ratio
for each pair and the automatic liquidator exist to make that shortfall rare.

## Fees {#fees}

A spot-margin position has three separate charges:

| Charge | When | Rate |
|---|---|---|
| Trading fee | On the IOC fills of the open and the close | The [spot maker or taker rate](./spot.md#matching-fills-and-fees) of the pair. Spot margin trades on the spot book. |
| Borrow interest | Continuously, on the outstanding USDC borrow | `spot_borrow_rate_bps`. It is set for each pair, annualised and accrued every block. It goes to the [Earn](../concepts/earn.md) pool as lender yield. |
| Liquidation fee | On a forced close only | A small fee for each pair. It goes to the insurance fund of the protocol. |

The open and the close are ordinary spot IOC fills. They pay the spot fee schedule, not
the perp tiers. Borrow interest is the cost that applies to spot margin only. It is exactly
the yield that [Earn](../concepts/earn.md) suppliers receive. All rates are governance
parameters for each pair. Read them from
[`/info spot_margin_state`](../api/rest/info/spot.md#spot_margin_state) and the spot
[`fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule).

## Collateral scope {#collateral-scope}

Spot margin is cross-collateralized against your one unified USDC account. This is the
same pool that backs your perpetual positions. There is no collateral bucket for each pair.

| | Collateral | Liquidation blast radius |
|---|---|---|
| Spot margin | Your unified USDC account (shared with perps) | Account-wide |

Cross collateral gives the best capital efficiency, because one balance backs everything.
The cost is risk isolation. A leveraged spot loss draws on the same collateral as your
perpetual positions. A perpetual loss reduces the collateral that backs a spot-margin
position. Size positions for the whole account. See
[margin modes](../concepts/margin-modes.md#spot-margin-cross).

## Earn {#relationship-to-earn}

Spot-margin borrowers are the demand side. [Earn](../concepts/earn.md) depositors are
the supply side. The borrow interest that spot-margin traders pay is exactly the yield
that Earn depositors receive. See [Earn](../concepts/earn.md) for the yield calculation.

## See also {#see-also}

- [Earn](../concepts/earn.md): the lending pool that funds spot-margin borrows, and the yield calculation.
- [Margin modes](../concepts/margin-modes.md): the cross-collateral model that spot margin shares with perps.
- [Tiered liquidation](../concepts/tiered-liquidation.md): the liquidation ladder and the insurance waterfall.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

Q: Does spot margin change plain (unleveraged) spot?
A: No. A spot buy with 100% of your own balance works as before. Spot margin is an opt-in overlay.

Q: Can my spot-margin loss touch my perp account?
A: Yes. Spot margin is cross-collateralized against your one unified USDC account. Your perpetual positions use the same collateral. A spot-margin loss draws on that shared collateral. A perpetual loss reduces the collateral that backs a spot-margin position. There is no risk isolation for each pair.

Q: Do I post collateral first?
A: No. There is no separate deposit. An open holds its initial-margin requirement against the free collateral of your whole account. A perpetual open does the same.

Q: Where does the borrowed USDC come from?
A: The [Earn](../concepts/earn.md) lending pool. Borrows are capped at the available (un-lent) liquidity of the pool.

Q: What rate do I pay?
A: In the first release, a fixed annualised rate for each pair, accrued every block. Pricing based on utilisation comes later.

</details>
