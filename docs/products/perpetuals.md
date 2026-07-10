---
description: The live perpetual-futures market — leveraged long/short with no expiry, anchored to spot by funding, valued against the mark price, and protected by tiered liquidation.
---

# Perpetuals

:::tip
**Live.** Perpetual futures are MetaFlux's flagship market and the platform
default — funding rates, mark prices, margin modes, and the liquidation ladder all
describe perps unless a page says otherwise.
:::

## TL;DR {#tldr}

A **perpetual future** ("perp") is a leveraged contract that tracks an asset's
price with **no expiry** — you go long or short, post [margin](../concepts/margin-modes.md)
to back the position, and hold it as long as it stays healthy. Because there is no
settlement date, a periodic [funding](../concepts/funding-rates.md) payment between
longs and shorts keeps the contract price tethered to the underlying. Positions are
valued against a manipulation-resistant [mark price](../concepts/mark-prices.md),
and a position that can no longer cover its margin is wound down by
[tiered liquidation](../concepts/tiered-liquidation.md) rather than a single
sudden close.

Perps are entirely separate from [spot](./spot.md): a perp position is a leveraged
exposure backed by collateral, not ownership of the asset.

## How a perp works {#how-a-perp-works}

- **Direction & leverage.** Buy to go long, sell to go short. [Leverage](../concepts/margin-modes.md)
  lets a given amount of collateral control a larger position; it amplifies gains
  and losses equally. Set per-asset leverage and the cross/isolated toggle with
  [`update_leverage`](../api/rest/exchange.md#update_leverage).
- **No expiry.** A perp never settles to a delivery date — the position persists
  until you close it or it is liquidated.
- **Funding keeps it honest.** Every hour, longs and shorts exchange a
  [funding payment](../concepts/funding-rates.md) sized to pull the perp price
  toward the underlying. It is paid **between traders**, not to the exchange.
- **Mark price drives risk.** Your margin, unrealized PnL, liquidation level, and
  trigger orders are all computed against the [mark price](../concepts/mark-prices.md),
  not the last trade — so a single stray print cannot distort your position.

## Trading actions {#trading-actions}

A perp order targets a perp **`market`** id (distinct from a spot `pair`). The
order surface is the shared CLOB used across MetaFlux.

| Action | Effect |
|---|---|
| [`submit_order`](../api/rest/exchange.md#submit_order) | Place one perp order (limit / market / trigger), any [order type](../concepts/order-types.md) |
| [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`batch_cancel`](../api/rest/exchange.md#batch_cancel) | Cancel by `oid`, one or many per signature |
| [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) / [`cancel_all_orders`](../api/rest/exchange.md#cancel_all_orders) | Cancel by client id, or cancel all (optional asset filter) |
| [`update_leverage`](../api/rest/exchange.md#update_leverage) | Change leverage or toggle isolated margin on an asset |
| [`set_position_mode`](../api/rest/exchange.md#set_position_mode) | Toggle one-way vs. [hedge mode](../concepts/hedge-mode.md) (long + short at once) |

`submit_order` returns a **synchronous** per-order status once it commits — the
assigned `oid` with a `resting` / `filled` / `error` entry, or `pending` if no
commit lands in the order-wait window. Orders can be signed by the master account
or an active [agent wallet](../concepts/agent-wallets.md).

## Margin & risk {#margin--risk}

Perps share the platform's full margin and risk stack:

- [**Margin modes**](../concepts/margin-modes.md) — Cross / Isolated / Strict-Iso,
  and how collateral is shared or walled off between positions.
- [**Hedge mode**](../concepts/hedge-mode.md) — hold a long and a short in the same
  market simultaneously.
- [**Portfolio margin**](../concepts/portfolio-margin.md) — cross-asset, SPAN-like
  margin for offsetting exposures.
- [**Tiered liquidation**](../concepts/tiered-liquidation.md) — a graduated ladder
  (T0 early warning → partial steps → T4) instead of a single wipeout.
- [**ADL**](../concepts/adl.md) — auto-deleveraging as the final backstop when the
  insurance fund is exhausted.

## Fees {#fees}

Perp fills charge a **maker** and a **taker** fee. Your base rate comes from your
trailing-30-day volume tier; a maker-rebate tier and a staking discount then stack
on top (see [Fee schedule](../concepts/fee-schedule.md) for how the three combine).

| 30-day volume | Taker | Maker |
|---------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

A maker-rebate tier (maker-volume share) can push your **net maker rate negative**
(paid to make); a staking discount cuts your **taker rate by up to 50%**. Rates are
governance parameters — query the live card with [`/info fee_schedule`](../api/rest/info.md#fee_schedule).
**Funding is not a fee** — it is a periodic [long↔short payment](../concepts/funding-rates.md),
not revenue to the exchange. See [Fees](../concepts/fees.md) for the full mechanics.

## Listing new perp markets {#listing-new-perp-markets}

Perp markets are **permissionless** to deploy: any builder can list a new perpetual
by winning an on-chain gas auction and supplying seed risk parameters (initial
maintenance ratio, max leverage, funding cap), bounded by governance-set ranges. No
review committee, no allow-list. See [MIP-3](../mip/mip-3.md) for the deploy flow,
and [MIP-4](../mip/mip-4.md) for the planned liquidity aggregator that carries
retail flow on top.

## See also {#see-also}

- [Contract specifications](../concepts/contract-specifications.md) — per-contract spec (margin, mark, funding, increments, limits) + how to read each field live
- [Funding rates](../concepts/funding-rates.md) — the hourly long↔short payment
- [Mark prices](../concepts/mark-prices.md) / [oracle prices](../concepts/oracle-prices.md) — what values your position
- [Order types](../concepts/order-types.md) — TIF, STP, triggers, TWAP, scale
- [Margin modes](../concepts/margin-modes.md) — Cross / Isolated / Strict-Iso
- [Tiered liquidation](../concepts/tiered-liquidation.md) — the liquidation ladder
- [`submit_order`](../api/rest/exchange.md#submit_order) — the wire action and field tables
- [MIP-3](../mip/mip-3.md) — permissionless perp market deploy
- [Spot](./spot.md) — the non-leveraged, ownership-based market
