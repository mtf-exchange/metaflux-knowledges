---
description: The spot CLOB of MetaFlux. Spot swaps one token for another, holds resting orders in a reserved-balance escrow and has no leverage.
---

# Spot trading

This page describes the spot market: pairs, escrow, matching, fees, order rules and limits.

:::tip
**Live.** Spot trading is shipped. It is a token-for-token order book, separate from perps,
with no leverage and no positions. Leveraged spot is the separate, planned
[spot-margin](./spot-margin.md) track.
:::

:::info
Non-leveraged spot is the one Sharia-compliant product on MetaFlux. See
[Sharia compliance](./index.md#sharia). Leveraged [spot margin](./spot-margin.md) is not.
:::

## Overview {#tldr}

Spot is a token-for-token central limit order book. You swap one token for another at a
price you choose. Spot is fully separate from perps. It has its own books and balances, and
it has no leverage and no positions. You trade only what you own. A resting spot order
locks the funds that it owes on a fill into a reserved balance (escrow). A fill pays
those funds to the counterparty. A cancel returns them to you.

A spot order is an [`/exchange`](../api/rest/exchange.md) action.
[`spot_order`](../api/rest/exchange/spot.md#spot_order) places an order, and
[`spot_cancel`](../api/rest/exchange/spot.md#spot_cancel) cancels one. Both are
sender-authorized by default: when you omit `owner`, the recovered signer is the trader.
Both also take an optional `owner`. With it, an approved
[agent wallet](../concepts/agent-wallets.md) trades for the account that approved it.

The node runs three orders for you:
[TWAP](../concepts/order-types.md#twap), the
[scale ladder](../concepts/order-types.md#scale-orders) and
[chase](../concepts/order-types.md#chase-orders). All three also accept a spot pair id. See
[The three on a spot pair](../concepts/order-types.md#synth-on-spot).

## Spot pairs {#what-a-spot-pair-is}

A spot pair trades a base token against a quote token (for example `B/Q`). The order
side sets the direction:

| `side` | You give | You receive | Escrow locked while resting |
|--------|----------|-------------|------------------------------|
| `bid` (buy) | quote | base | quote: the notional at your limit price |
| `ask` (sell) | base | quote | base: the base you offer |

The order field is the spot pair id (`pair`). It is different from a perp `market` id
and from a token id. Pairs deploy under [MIP-1](../mip/mip-1.md), the spot token standard
and market deploy. Each pair has its own base and quote tokens, size decimals, optional
minimum notional and fee overrides.

## Reserved-balance escrow {#reserved-balance-escrow}

Escrow keeps spot solvent without leverage. A `gtc` or `alo` order can rest on the book,
or the un-crossed residual of one can. The protocol then moves the funds that the order
owes on a full fill. They leave your spendable balance and go into a reserved balance:

- A resting bid reserves quote equal to its notional at the limit price
  (`size × limit_px`).
- A resting ask reserves the base that it offers.

You cannot spend reserved funds. The protocol:

- pays them to the counterparty when the order fills.
- returns them to your spendable balance on a [cancel](#lifecycle--cancel-refunds-escrow),
  on self-trade prevention, or when the market is deactivated.

Each token balance is conserved exactly across every rest, fill, cancel and STP event. For
each token and account, spendable plus reserved does not change. Fuzz tests verify this
across random streams of rests, crosses and cancels.

## Affordability clamping {#affordability-clamping}

You can never rest or fill more than you can fund. At admission, the order size is
clamped to what your balance covers:

- A priced bid (`limit_px > 0`) is clamped by `quote_balance ÷ limit_px`.
- A market bid (`limit_px = 0`) is clamped by a walk of the resting asks, level by
  level, against your quote balance. There is no single price to divide by.
- An ask, priced or market, is clamped by the base that you own.

The market-bid walk counts only asks that the engine fills. It skips your own asks. It
also skips every ask in your
[self-trade-prevention group](../concepts/order-types.md#stp-groups). Such a group is a
shared sub-account, or the other side of a Metaliquidity vault and operator pair. The engine
refuses to fill those asks. If the walk counted them, it would price your budget against
liquidity you cannot buy. The order would then walk deeper than the budget allows.

The engine refuses an order that you cannot afford at all, with
`insufficient spot balance`. Nothing fills, nothing rests and no order id is used. The
refusal is about money, not liquidity. A funded order that finds no counterparty still
answers `filled` with `total_sz: "0"`.

One case stays an accepted no-op. A market buy holds quote, but the pair has no ask that the
engine fills for you, because every ask is your own or belongs to a group peer. You have the
money, so this is not a balance error. That no-op uses no order id and emits no STP cancels.
The orders of the peers stay on the book and their escrow stays reserved. An ask that the
engine WOULD fill, but of which your quote cannot buy one lot, gets a refusal. It is not a
no-op.

An order that you can afford in part trades or rests the part that you can afford. The
clamp runs before matching, so every fill and every escrow reservation that results is
funded. No fill drops after the match.

## Matching, fills and fees {#matching-fills-and-fees}

Spot matching uses the same price-time CLOB as the rest of MetaFlux. A fill swaps base for
quote at the resting price of the maker.

Today both sides pay their fee in the QUOTE token of the pair. The fee leaves the
spendable quote balance of the payer, never the base balance. Fees go to a dedicated spot
fee account, separate from the perp fee pool.

| Side | Fee taken from | Rate |
|------|----------------|------|
| Taker | your spendable quote balance | pair `taker_fee_bps`, else the global spot default |
| Maker | your spendable quote balance | pair `maker_fee_bps`, else the global spot default |

:::caution A buy pays its fee in the base token
A buy gets the base token minus its fee. This applies to taker and maker. A sell
pays from the USDC that it receives. The fill `sz` stays gross, and the balance credit is
net. Read the balance. Do not add up fill sizes. Buy admission reserves no headroom for
a quote fee. The full rule, the in-kind referrer share and the sub-lot dust are in
[fees](../concepts/fees.md#spot-buy-fee-in-base).
:::

Spot fees are per pair. A pair can set its own `taker_fee_bps` and `maker_fee_bps`.
When a pair sets no rate, the global spot default applies. Spot uses a flat rate for each
pair. The perp volume, maker-rebate and staking tiers do not apply to spot. Read the
current values in the [`/info fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule)
response. See [fees](../concepts/fees.md#spot-fees) for the settlement model.

## Time-in-force {#time-in-force}

Spot orders use the same TIF set as perps, with one rule that applies to spot only:

| `tif` | Behavior on spot |
|-------|------------------|
| `gtc` | Crosses what it can. Any residual rests, backed by escrow, until it fills or you cancel it. |
| `alo` | Add-liquidity-only. A crossing `alo` is rejected and never takes. A non-crossing `alo` rests. |
| `ioc` | Crosses what it can at once. The residual is discarded. It never rests and never uses escrow. |

The engine rejects `aon`, because core has no equivalent. Self-trade prevention uses the
same [`stp_mode`](../concepts/order-types.md) set as perps (`cancel_oldest`,
`cancel_newest`, `cancel_both`). Spot does not support `reject`.

:::info
A market order must be `ioc`. To place a market order, send `limit_px = 0`. The order
crosses the book at the available price, bounded by your balance. A buy walks the asks up to
what your quote funds. A sell is bounded by the base that you own. A market order has no
resting price, so it must use `tif: "ioc"`. The engine rejects `gtc` or `alo` with
`limit_px = 0`. A priced order (`limit_px > 0`) can use any `tif`.
:::

## Cancel and escrow refund {#lifecycle--cancel-refunds-escrow}

[`spot_cancel`](../api/rest/exchange/spot.md#spot_cancel) removes one of your resting
orders by `oid` on a pair. It returns the escrow that the order locked to your spendable
balance.

- **Owner only.** Only the owner of the order can cancel it. The engine rejects a third
  party (`not the order owner`).
- **Typed miss.** An unknown `oid`, or one that is already gone, returns `order not found`.
  This is harmless.
- **Always available.** The spot halt does not gate cancels. When new orders are
  disabled, you can still remove a resting order and get its escrow back.

## Limits and governance {#limits-and-governance}

- **Resting-order cap.** Each account can rest up to 1000 orders per spot pair. The
  engine rejects a new resting order past the cap (`spot resting-order cap
  reached — cancel some orders first`). Recognized market-maker accounts are exempt. `ioc`
  orders never rest, so the cap never applies to them.
- **Minimum notional.** A pair can set a minimum notional. The engine rejects an order below
  it.
- **Spot halt (governance).** Governance can enable or disable spot trading for all pairs.
  When it is disabled, the engine rejects new orders (`spot trading
  disabled`). Cancels still work, so resting escrow is never trapped.

## Reading spot state {#reading-spot-state}

[`POST /info`](../api/rest/info.md) returns spot balances and open spot orders. A
`spot_order` returns a synchronous status for each order when it commits. The status
gives the real assigned `oid` with a `resting`, `filled` or `error` entry. If no commit lands
in the order-wait window, the status is `pending`. This is the same status union as the perp
[`submit_order`](../api/rest/exchange/orders.md#submit_order).

## Spot margin and Earn {#relationship-to-spot-margin-and-earn}

Plain spot is the baseline. You trade only what you own, with no leverage and no
liquidation. Two planned overlays build on it:

- [Spot margin](./spot-margin.md) (planned): you borrow quote against collateral to buy
  spot with leverage. It has a maintenance margin and a liquidation price.
- [Earn](../concepts/earn.md) (planned): a USDC lending pool. It funds spot-margin
  borrows and earns the borrow interest as yield.

Both overlays are opt-in. They do not change plain spot.

## See also {#see-also}

- [`spot_order`](../api/rest/exchange/spot.md#spot_order) and [`spot_cancel`](../api/rest/exchange/spot.md#spot_cancel): the wire actions and their field tables.
- [Order types](../concepts/order-types.md): the TIF and STP rules that spot shares with perps.
- [Fees](../concepts/fees.md#spot-fees): the spot fee schedule and the fee charge on the quote side.
- [Spot margin](./spot-margin.md): the planned leveraged spot track.
- [MIP-1](../mip/mip-1.md): the spot token standard and market deploy.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

Q: Do I need collateral or margin to trade spot?
A: No. Spot uses balances only. You trade what you own. There is no margin, no leverage and
no liquidation. Leverage is the separate, planned [spot-margin](./spot-margin.md) track.

Q: What happens to my funds when my order rests?
A: A reserved balance (escrow) holds them. You cannot spend them, but they stay yours. A
fill pays them to the counterparty. A cancel returns them to your spendable balance.

Q: Why did my large buy fill or rest only in part?
A: Affordability clamping. The engine reduces the order size to what your quote balance
funds at the limit price. The engine refuses an order that you cannot afford at all
(`insufficient spot balance`).

Q: Can I place a spot market order?
A: Yes. Send `limit_px = 0` with `tif: "ioc"`. `gtc` and `alo` need a positive `limit_px`.

Q: Are spot fills and perp fills on the same book?
A: No. Spot has its own books, balances and fee account. They are fully separate from perps.

</details>
