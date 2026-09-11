---
description: The live perpetual-futures market — leveraged long/short with no expiry, anchored to spot by funding, valued against the mark price, and protected by tiered liquidation.
---

# Perpetuals

:::tip
**Live.** Perpetual futures are MetaFlux's flagship market and the platform
default — funding rates, mark prices, margin modes, and the liquidation ladder all
describe perps unless a page says otherwise.
:::

## What a perp is {#what-a-perp-is}

A **perpetual future** ("perp") is a leveraged contract that tracks an asset's
price with **no expiry**. Buy to go long, sell to go short, post
[margin](../concepts/margin-modes.md) to back the position, and hold it as long
as it stays healthy. A perp position is exposure backed by collateral, not
ownership of the asset — it is entirely separate from [spot](./spot.md).

Three mechanisms make that work:

- **Funding keeps the price honest.** Every hour longs and shorts exchange a
  [funding payment](../concepts/funding-rates.md) sized to pull the perp price
  toward the underlying. It is paid **between traders**, not to the exchange.
- **Mark price drives risk.** Margin, unrealized PnL, the liquidation level and
  trigger orders are all computed against the
  [mark price](../concepts/mark-prices.md), not the last trade, so a single stray
  print cannot distort a position.
- **Liquidation is graduated.** A position that can no longer cover its margin is
  wound down by [tiered liquidation](../concepts/tiered-liquidation.md), not a
  single sudden close.

Set per-asset leverage and the cross/isolated toggle with
[`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage).

## Trading actions {#trading-actions}

A perp order targets a perp **`market`** id (distinct from a spot `pair`). The
order surface is the shared CLOB used across MetaFlux.

| Action | Effect |
|---|---|
| [`submit_order`](../api/rest/exchange/orders.md#submit_order) | Place one perp order (limit / market / trigger), any [order type](../concepts/order-types.md) |
| [`cancel_order`](../api/rest/exchange/orders.md#cancel_order) / [`batch_cancel`](../api/rest/exchange/orders.md#batch_cancel) | Cancel by `oid`, one or many per signature |
| [`cancel_by_cloid`](../api/rest/exchange/orders.md#cancel_by_cloid) / [`cancel_all_orders`](../api/rest/exchange/orders.md#cancel_all_orders) | Cancel by client id, or cancel all (optional asset filter) |
| [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage) | Change leverage or toggle isolated margin on an asset |
| [`set_position_mode`](../api/rest/exchange/account.md#set_position_mode) | Toggle one-way vs. [hedge mode](../concepts/hedge-mode.md) (long + short at once) |

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

A perp fill charges a **maker** and a **taker** fee. Your base rate comes from
your trailing-30-day volume tier; a maker-rebate tier and a staking discount then
stack on top. A maker-rebate tier can push the net maker rate **negative** (paid
to make); a staking discount cuts the taker rate by up to 50%.

Rates are governance parameters, so read the live card from
[`/info fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule) rather than a table.
[Fee schedule](../concepts/fee-schedule.md) has the current tiers and how the
three components combine.

**Funding is not a fee** — it is a periodic
[long↔short payment](../concepts/funding-rates.md), not revenue to the exchange.

## Listing new perp markets {#listing-new-perp-markets}

Perp markets are **permissionless** to deploy: any builder can register a new
perpetual by paying the current Dutch-clock deploy fee and posting a slashable
staking bond, then configuring leverage, fee tier, and oracle before activating
it. No review committee, no allow-list — but a builder-deployed market is
isolated in the deployer's own dex, not the shared market set every trader sees
by default. See [MIP-3](../mip/mip-3.md) for the deploy flow and the isolation
rule.

Perpetuals and [options](./options.md) do **not** share a margin account. An
option is fully collateralized on its own lane: it holds no margin, takes no mark
price, and cannot be liquidated.

## Delisting a perp market {#delisting}

> ⚠️ **NOT LIVE YET.** The settlement below ships with the next node release.
> Until then, a delist cancels resting orders and makes the market reduce-only.
> Open positions stay open, and `markets` never sends the `settled` key.

Governance delists a perp market by a two-thirds-stake validator vote. The
vote ends the market in ONE block, in this order:

1. It cancels every resting order, parked trigger, TWAP parent and pending
   batch-auction order on the market.
2. It closes every open position on the market.
3. It marks the market permanently closed.

No block lies between these steps. No order can fill, and no liquidation can
run, between the cancel and the close.

**The settlement price.** The vote can name one price, and every position then
closes at it, cut to 8 decimals. The oracle band does not apply to that price.
When the vote names no price, every position closes at the market's **risk
mark**: the mark price, clamped to the oracle band. The liquidation engine judges
health at this mark. It is not the raw `mark_px`, so the two can differ when the
mark sits outside the band. When the risk mark is stale or absent, the vote must
name a price.

**A settlement is a ledger entry, not a trade.** It does not touch the order
book, so it has no slippage. It charges no fee. It writes no fill, so no
`user_fills` row appears. Each closed leg writes one
[`ledger_updates`](../api/ws/subscriptions.md#ledger_updates) record with
`kind: "liquidation"` and `cause: "delist_settlement"`, and its `mark_px` is the
settlement price. A hedge account gets one record per leg.

**Where the PnL goes.** A cross leg moves its PnL into the account balance. An
isolated leg returns its whole margin bucket plus the PnL. A loss larger than the
bucket is paid from the insurance fund, then the treasury queue. A cross loss the
account cannot pay follows two rules:

- An account that still holds a cross position on another market keeps the
  negative balance. The liquidation engine collects it by closing those other
  positions.
- An account with no other cross position has its deficit covered by
  [the deficit waterfall](../concepts/tiered-liquidation.md#t4--the-deficit-waterfall),
  the same way a liquidation deficit is covered.

**After the settlement, the market never reopens.**

- Every order on it is refused, reduce-only orders included:
  `market settled — trading closed`.
- A vote to relist it is refused.
- Its [`markets`](../api/rest/info/perpetuals.md#markets) row stays, with
  `halted: true`, `settled: true`, and the `settled_px` it closed at.
- A later listing of the same underlying is a new market. It gets a new asset id
  and a new `coin`, and it inherits no position, order or funding state.

**A pause is not a delist.** To stop trading without closing positions,
governance sets the market's `open` and `close` flags instead. A paused market
keeps its positions and trades again when the flags clear. See
[funding on a paused market](../concepts/funding-rates.md#paused-market).

**This settlement covers perp markets only.** A spot pair delist closes no
spot-margin position on that pair.

## See also {#see-also}

- [Contract specifications](../concepts/contract-specifications.md) — per-contract spec (margin, mark, funding, increments, limits) + how to read each field live
- [Funding rates](../concepts/funding-rates.md) — the hourly long↔short payment
- [Mark prices](../concepts/mark-prices.md) / [oracle prices](../concepts/oracle-prices.md) — what values your position
- [Order types](../concepts/order-types.md) — TIF, STP, triggers, TWAP, scale
- [Margin modes](../concepts/margin-modes.md) — Cross / Isolated / Strict-Iso
- [Tiered liquidation](../concepts/tiered-liquidation.md) — the liquidation ladder
- [`submit_order`](../api/rest/exchange/orders.md#submit_order) — the wire action and field tables
- [MIP-3](../mip/mip-3.md) — permissionless perp market deploy
- [Spot](./spot.md) — the non-leveraged, ownership-based market
