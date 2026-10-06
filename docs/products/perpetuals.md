---
description: The perpetual-futures market of MetaFlux. A perp is a leveraged long or short position with no expiry. Funding keeps it near spot, the mark price values it, and tiered liquidation protects it.
---

# Perpetuals

This page describes the perpetual-futures market: positions, trading actions, margin, fees, listing and delisting.

:::tip
**Active.** Perpetual futures are the main market of MetaFlux and the platform default.
The pages on funding rates, mark prices, margin modes and the liquidation ladder describe
perps unless a page says otherwise.
:::

## Perp contracts {#what-a-perp-is}

A perpetual future (*perp*) is a leveraged contract that tracks the price of an asset.
It has no expiry. You buy to go long and sell to go short. You post
[margin](../concepts/margin-modes.md) to back the position. You can hold the position
while it stays healthy. A perp position is exposure backed by collateral. It does not give
ownership of the asset, and it is fully separate from [spot](./spot.md).

Three mechanisms support the contract:

- **Funding.** Every hour, longs and shorts exchange a
  [funding payment](../concepts/funding-rates.md). The payment pulls the perp price
  toward the underlying. Traders pay it to each other. The exchange does not receive it.
- **Mark price.** Margin, unrealized PnL, the liquidation level and trigger orders all use
  the [mark price](../concepts/mark-prices.md). They do not use the last trade, so one
  stray print cannot distort a position.
- **Tiered liquidation.** When a position can no longer cover its margin,
  [tiered liquidation](../concepts/tiered-liquidation.md) winds it down in steps. It does
  not close the position in one sudden action.

To set the leverage of an asset and choose cross or isolated margin, use
[`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage).

## Trading actions {#trading-actions}

A perp order targets a perp `market` id. This id is different from a spot `pair`.
Perp orders use the same CLOB as the rest of MetaFlux.

| Action | Effect |
|---|---|
| [`submit_order`](../api/rest/exchange/orders.md#submit_order) | Places one perp order (limit, market or trigger), of any [order type](../concepts/order-types.md). |
| [`cancel_order`](../api/rest/exchange/orders.md#cancel_order) / [`batch_cancel`](../api/rest/exchange/orders.md#batch_cancel) | Cancels by `oid`, one or many orders per signature. |
| [`cancel_by_cloid`](../api/rest/exchange/orders.md#cancel_by_cloid) / [`cancel_all_orders`](../api/rest/exchange/orders.md#cancel_all_orders) | Cancels by client id, or cancels all orders. An asset filter is optional. |
| [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage) | Changes leverage, or turns isolated margin on or off for an asset. |
| [`set_position_mode`](../api/rest/exchange/account.md#set_position_mode) | Selects one-way mode or [hedge mode](../concepts/hedge-mode.md). Hedge mode holds a long and a short at the same time. |

`submit_order` returns a synchronous status for each order when it commits. The status
gives the assigned `oid` and a `resting`, `filled` or `error` entry. If no commit lands in
the order-wait window, the status is `pending`. The master account or an active
[agent wallet](../concepts/agent-wallets.md) can sign orders.

## Margin and risk {#margin--risk}

Perps use the full margin and risk stack of the platform:

- [Margin modes](../concepts/margin-modes.md): Cross, Isolated and Strict-Iso. These
  modes set how positions share collateral or keep it separate.
- [Hedge mode](../concepts/hedge-mode.md): a long and a short in the same market at the
  same time.
- [Portfolio margin](../concepts/portfolio-margin.md): cross-asset margin in the style
  of SPAN, for exposures that offset.
- [Tiered liquidation](../concepts/tiered-liquidation.md): a ladder of steps from a T0
  early warning, through partial steps, to T4. It replaces one full wipeout.
- [ADL](../concepts/adl.md): auto-deleveraging. It is the last backstop when the
  insurance fund is empty.

## Fees {#fees}

A perp fill charges a maker fee and a taker fee. Your trailing 30-day volume tier
sets your base rate. A maker-rebate tier and a staking discount then apply on top. A
maker-rebate tier can make the net maker rate negative, so you receive a payment to
make. A staking discount cuts the taker rate by up to 50%.

Rates are governance parameters. Read the current card from
[`/info fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule). Do not rely on a
fixed table. The [fee schedule](../concepts/fee-schedule.md) page gives the current tiers
and shows how the three components combine.

Funding is not a fee. It is a periodic
[payment between longs and shorts](../concepts/funding-rates.md). The exchange gets no
revenue from it.

## Listing new perp markets {#listing-new-perp-markets}

Anyone can deploy a perp market. No permission is necessary. A builder registers a new
perpetual, pays the current Dutch-clock deploy fee and posts a slashable staking bond. The
builder then sets the leverage, the fee tier and the oracle, and activates the market.
There is no review committee and no allowlist. A market that a builder deploys is isolated
in the dex of that deployer. It is not in the shared market set that every trader sees
by default. See [MIP-3](../mip/mip-3.md) for the deploy flow and the isolation rule.

Perpetuals and [options](./options.md) do not share a margin account. An option is
fully collateralized on its own lane. It holds no margin, uses no mark price and cannot be
liquidated.

## Delisting a perp market {#delisting}

The settlement below is in effect since node 0.9.10. See
[block 11,550,001](../changelog/block-11550001.md#no-height-pin).

Governance delists a perp market by a validator vote of two-thirds of stake. The vote ends
the market in ONE block, in this order:

1. It cancels every resting order, parked trigger, TWAP parent and pending batch-auction
   order on the market.
2. It closes every open position on the market.
3. It marks the market permanently closed.

No block lies between these steps. No order can fill, and no liquidation can run, between
the cancel and the close.

### Settlement price {#settlement-price}

The vote can name one price. Every position then closes at that price, cut to 8 decimals.
The oracle band does not apply to that price. When the vote names no price, every position
closes at the risk mark of the market. The risk mark is the mark price, clamped to the
oracle band. The liquidation engine judges health at this mark. It is not the raw
`mark_px`, so the two can differ when the mark is outside the band. When the risk mark is
stale or absent, the vote must name a price.

The chain records the oracle price of every market once an hour, at the first oracle update
after the hour. The six-hour average is the mean of the six newest hourly records that
carry the market, rounded toward zero to 8 decimals. It is a mean of six samples. It is not
a time-weighted price. The maintenance band is the risk mark plus or minus the smallest
maintenance margin ratio of the market (3% unless governance set another value). A position
at or above its maintenance margin at the risk mark keeps a non-negative balance at any
price inside that band.

These rules apply while the oracle price of the market is fresh, that is, while the risk
mark exists:

- When the vote names no price, every position closes at the six-hour average. If the
  average is outside the maintenance band, it moves to the nearest edge of the band. A
  market listed less than one hour ago has no hourly record, so it closes at the risk mark.
- A named price must be within 20% of the six-hour average or inside the maintenance band,
  edges included. The chain refuses a vote outside both before it counts the vote:
  `delist <coin>: settle_px <px> is outside 2000 bps of the <n>-slot TWAP <avg> and outside the maintenance band of the risk mark <mark>`.
  Here `<n>` is the number of hourly records that the average read. A market with no open
  position accepts any named price.

When the oracle price is stale, these rules do not apply. The vote must name a price, and
that price has no band.

The reason for these rules: the validators who vote the price can also hold positions on
the market. The 20% band keeps their price near recent history. The average stops one short
price move from setting the settlement price. The maintenance band stops a vote with no
price from closing a solvent position at a loss larger than its margin. Solvent here means
solvent to the liquidation engine. That loss would become bad debt that other traders pay.
After a real crash deeper than 20% inside six hours, a vote can still name a price inside
the maintenance band.

The limit slows a quorum down. It does not bound it. The validators also supply the oracle
price of an externally priced market, so a quorum that controls six hourly records controls
the average. The six records and the 20% band are fixed values. A change to either one
needs a node release.

### Settlement records {#settlement-records}

A settlement is a ledger entry. It is not a trade. It does not touch the order book, so
it has no slippage. It charges no fee. It writes no fill, so no `user_fills` row appears.
Each closed leg writes one
[`ledger_updates`](../api/ws/subscriptions.md#ledger_updates) record with
`kind: "liquidation"` and `cause: "delist_settlement"`. Its `mark_px` is the settlement
price. A hedge account gets one record per leg.

### PnL after settlement {#pnl-after-settlement}

A cross leg moves its PnL into the account balance. An isolated leg returns its full margin
bucket plus the PnL. The insurance fund pays a loss larger than the bucket, and then the
treasury queue pays. Two rules apply to a cross loss that the account cannot pay:

- An account that still holds a cross position on another market keeps the negative
  balance. The liquidation engine collects it when it closes those other positions.
- For an account with no other cross position,
  [the deficit waterfall](../concepts/tiered-liquidation.md#t4--the-deficit-waterfall)
  covers the deficit. It is the same process that covers a liquidation deficit.

### Closed markets {#closed-markets}

After the settlement, the market never opens again.

- The market refuses every order, reduce-only orders included:
  `market settled — trading closed`.
- The market refuses a vote to list it again.
- Its [`markets`](../api/rest/info/perpetuals.md#markets) row stays, with `halted: true`,
  `settled: true` and the `settled_px` at which it closed.
- A later listing of the same underlying is a new market. It gets a new asset id and a new
  `coin`. It inherits no position, order or funding state.

### Pause and scope {#pause-and-scope}

A pause is not a delist. To stop trading without a close of positions, governance sets
the `open` and `close` flags of the market. A paused market keeps its positions. It trades
again when the flags clear. See
[funding on a paused market](../concepts/funding-rates.md#paused-market).

This settlement applies to perp markets only. A spot pair delist closes no spot-margin
position on that pair.

## See also {#see-also}

- [Contract specifications](../concepts/contract-specifications.md): the specification of each contract (margin, mark, funding, increments and limits), and how to read each field from the API.
- [Funding rates](../concepts/funding-rates.md): the hourly payment between longs and shorts.
- [Mark prices](../concepts/mark-prices.md) and [oracle prices](../concepts/oracle-prices.md): the prices that value your position.
- [Order types](../concepts/order-types.md): TIF, STP, triggers, TWAP and scale orders.
- [Margin modes](../concepts/margin-modes.md): Cross, Isolated and Strict-Iso.
- [Tiered liquidation](../concepts/tiered-liquidation.md): the liquidation ladder.
- [`submit_order`](../api/rest/exchange/orders.md#submit_order): the wire action and its field tables.
- [MIP-3](../mip/mip-3.md): permissionless deploy of a perp market.
- [Spot](./spot.md): the market for ownership without leverage.
