---
description: Options on MetaFlux are standard European puts and calls. They are fully collateralized and trade through RFQ only. A put settles in USDC and a call settles in the underlying coin. This page covers the live series, the escrow rules, settlement and the reads.
---

# Options

This page describes options on MetaFlux: the two kinds, escrow, fees, settlement, listing and the reads.

## Overview {#tldr}

A MetaFlux option is a standard European, fully collateralized contract on a listed
underlying. It trades through [RFQ](../concepts/rfq.md) only. There is no option order book.

- The holder pays the premium at the fill. That is the full requirement. An option
  position has no margin, no mark price and no liquidation.
- The writer locks the worst case at the fill. This lock is the escrow. It stays in
  the series pot until the position closes or the series settles.
- A put settles in USDC. A call settles in the underlying coin. Every row gives the
  denomination as [`settle_asset`](../api/rest/info/options.md#option_series). Read it. A
  client that assumes dollars is wrong about every call.
- The chain never computes an option price and never needs an implied volatility. The
  premium is the price on which two accounts agree in an RFQ.

Read the live series from [`option_series`](../api/rest/info/options.md#option_series).
Trade them with [`rfq_request`](../api/rest/exchange/rfq-utility.md#rfq_request),
[`rfq_quote`](../api/rest/exchange/rfq-utility.md#rfq_quote) and
[`rfq_accept`](../api/rest/exchange/rfq-utility.md#rfq_accept).

## Option kinds {#the-two-kinds}

A series is one `(underlying, expiry, strike, kind)` tuple. Exactly two kinds exist. `S*` is
the settlement price and `K` is the strike.

| Kind | Wire value | Payoff per whole unit | Escrow per whole unit | `settle_asset` |
|---|---|---|---|---|
| Put | `"put"` | `max(K − S*, 0)` USDC | `K` USDC | `"USDC"` |
| Call | `"call"` | `max(1 − K / S*, 0)` COIN | ONE coin | the underlying's token, e.g. `"BTC"` |

Both kinds are European. You cannot exercise either one before expiry. To close a position
early, trade it back. Early exercise is not available.

## Call escrow {#why-a-call-escrows-one-coin}

The denomination of a call is forced. It is not a choice.

A cash call pays `max(S* − K, 0)` in USDC. The price has no ceiling, so that payoff has no
finite worst case. No cash escrow can cover it. A cash call therefore needs a margin
engine and a liquidation ladder for its writers.

When you read the same payoff in the underlying, it is bounded at every price:

```text
max(1 − K / S*, 0) COIN  valued at S*  =  max(S* − K, 0) USDC
```

`K / S*` is above zero, so `1 − K / S*` is below one at every price. One coin per
contract therefore covers the worst case at any price. This is the covered call that every
desk already writes. It lets this lane keep its central promise: both sides are fully funded
at the fill, so an option position can never be liquidated.

:::danger[A call is denominated in the coin, not in dollars]
On a call series, `escrow_per_unit` is `"1"`. The settlement payout is coin, and the refund
to the writer is coin. The number `"1"` is one coin. It is not one dollar.

Read [`settle_asset`](../api/rest/info/options.md#option_series) on the row. Use it as the
currency of `escrow_per_unit`, of
[`option_state.escrow`](../api/rest/info/options.md#option_state), and of every amount that
settlement moves. A caller that formats those figures as dollars is wrong by the whole asset
class on every call.

The premium is the exception. It is always USDC. See
[premium currency](#the-premium-is-always-usdc).
:::

### Payoff examples {#payoff-worked}

One BTC call, with `K` = 100,000, settles at `S*` = 125,000:

```text
payoff = max(1 − 100000 / 125000, 0) = 0.2 BTC per unit
refund = 1 − 0.2                     = 0.8 BTC per unit
```

At the settlement price, the 0.2 BTC of the holder is worth `0.2 × 125,000` = $25,000. This
is exactly `S* − K`. The coin payoff and the cash payoff have the same economics. Only the
currency that the chain can safely escrow is different.

At `S*` = 100,000 or below, the payoff is `0` and the writer takes the whole coin back.

The put is simpler. One BTC put, with `K` = 100,000, settles at `S*` = 90,000. It pays the
holder $10,000 and refunds $90,000 of the $100,000 escrow to the writer.

## Fill effects {#what-a-fill-moves}

An option fill moves four things and nothing else:

1. The premium goes from the holder to the writer, in USDC, on both kinds.
2. The escrow goes from the balance of the writer into the series pot, in
   `settle_asset`.
3. The escrow of a closing writer comes back out of the pot, in `settle_asset`.
4. The taker pays a trading fee, in USDC. See [option fee](#option-fee).

An option fill opens no perpetual position and touches no margin figure. See
[absent features](#what-an-option-position-is-not).

A call writer must hold the coin. The escrow leaves the spot balance of the
underlying token of the writer. A spot balance cannot go negative, so to hold the coin IS
the full collateral test. The chain reads no margin figure and encumbers no USDC. The chain
refuses a writer who does not have enough coin, with `insufficient
underlying balance for the escrow`.

A call escrow cannot net the premium that it earns. On a put series, the incoming USDC
premium reduces the USDC that the writer must find for the escrow. The chain checks one net
number. On a call series, the escrow is coin and the premium is dollars. The chain checks the
two assets separately: first the coin for the escrow, then USDC for the fee. For this
reason the chain can refuse a call writer with
`insufficient free collateral for the fee`, while that writer holds every coin it needs.

A close releases the exact escrow. The listing rule puts the strike on an escrow grid.
The escrow per unit is therefore a whole number of the smallest committed step of the
settlement asset. A partial close releases exactly that rate times the closed units. No
rounding residue can build up on the trading path.

A holder who sells back closes first. The chain nets the two legs of each account before
it locks anything. An account that holds long units and then writes gives up long units. It
does not open a short. A round trip therefore returns exactly what it locked.

### Premium currency {#the-premium-is-always-usdc}

`settle_asset` sets the currency of the escrow and the settlement payout. It does not
set the currency of the premium.

| Amount | Currency on a put | Currency on a call |
|---|---|---|
| Premium (RFQ `price` × units) | USDC | USDC |
| Taker fee | USDC | USDC |
| Escrow | USDC | the coin |
| Settlement payout and refund | USDC | the coin |

An RFQ `price` is a premium per whole underlying unit in USDC, on the 1e8 plane, for both
kinds. Quote a call in dollars. Read its escrow and its payout in coin. A client that divides
the premium on the coin plane overstates it.

## Option fee {#option-fee}

Only the TAKER pays. The taker is the account that sent the RFQ request. It can be the holder
or the writer, as a result of the side that it asked for. The quoting maker has no fee leg.

The fee is the SMALLER of two terms. The chain charges it in USDC on both kinds:

```text
fee = min( strike_face x taker_rate ,  premium x premium_cap )
```

`strike_face` is `strike × size`, for BOTH kinds. The strike face is the only notional
that the chain can read without a price. The worst payout of a put IS the strike face. A
call escrows one coin. To know the dollar value of that coin, the chain would have to fetch a
price. The chain therefore uses the strike face as the bound for a call too.

The premium term is the tail guard. A far out-of-the-money option can have a premium far
below its strike face. The notional term alone would then charge a fee larger than the option
itself. The cap holds the fee to a fraction of the premium that the taker paid. The cap
applies rarely, only when the premium is a sliver of the strike face. That is the case for
which it exists.

Both terms truncate toward zero, and the smaller one wins. The fee therefore never rounds up.

Both rates are governance parameters. Both start UNSET, which charges nothing. The same
ceiling that applies to every other fee rate caps the taker rate at 1% of the notional. Read
the current values on
[`/info fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule), in the `option` row of
`products`.

## Size plane {#the-size-plane}

RFQ `size` is an integer on the `10^sz_decimals` plane of the series, exactly like a
perpetual order size. Every
[`option_series`](../api/rest/info/options.md#option_series) row gives `sz_decimals`.

- Wire `size` = whole units × `10^sz_decimals`.
- Premium in USDC = quoted `price` × whole units.
- Escrow in `settle_asset` = `escrow_per_unit` × whole units.

The premium is truncated toward zero to micro-USDC. The chain refuses a fill whose
premium truncates to zero. A size that is too small for the quoted price therefore cannot
trade for free.

## Settlement {#settlement}

At expiry, the chain settles the whole series in one block. It pays from the series pot, and
the pot closes to exactly zero.

- Each holder gets `intrinsic × units`, truncated toward zero.
- Each writer gets a refund of `(escrow rate − intrinsic) × units`, truncated toward zero.
- The rounding residue is dust. It goes to the insurance fund. It is never a charge on a
  writer beyond the escrow, and never a shortfall for a holder.

Every amount is paid in `settle_asset`. A put credits the ordinary USDC account balance.
A call credits the spot balance of the underlying token. This is the same balance that a
spot trade moves. Dust goes to the insurance fund in that same asset.

The `intrinsic` of a call divides by `S*`, so it truncates one more time than that of a put.
The truncation always makes the claim of the holder smaller, which is the safe direction. The
refund of the writer is the complement, so a charge can never exceed the escrow.

### Settlement price {#the-settlement-price}

The settlement price is the arithmetic mean of the committed oracle prices whose source
timestamp is inside a window that ends at expiry. It is not the last price, and it is not a
mark price.

The chain removes duplicate samples by source timestamp. One oracle submission is one sample,
however many blocks carry it forward. This keeps the mean independent of the block cadence.

The window needs a minimum number of distinct source timestamps before it can price. The
defaults are below. Governance can change each of them by vote.

| Knob | Default | Meaning |
|---|---|---|
| Window | 180,000 ms | Length of the price window before expiry |
| Minimum entries | 20 | Distinct source timestamps the window needs |
| Widening step | one window per 60,000 ms after expiry | How fast a thin window grows |
| Maximum window | 900,000 ms | Ceiling on the widened window |
| Abandon after | 86,400,000 ms | Time after expiry at which the series gives up |

### Deferral and abandonment {#deferral-and-abandonment}

:::danger[Settlement can defer, and it can abandon]
A thin window defers. If the window holds fewer than the minimum number of distinct
source timestamps, the series does not settle. It waits and tries again a minute later. Each
time, it widens the window by one step. A series that can price always prices, however late
the attempt.

A window that never fills abandons. Past the abandon bound, the chain stops the wait.
Nobody is paid. Every writer takes their whole escrow back: the whole coin on a call,
the whole strike on a put. A holder of an in-the-money option gets nothing. At that
point no price is honest, so the chain moves no money on one.

Abandonment is a backstop for a dead feed. It is not a normal outcome. For this reason, a
series on a thinly fed underlying has a different risk from a series on a busy one.
:::

## Absent features {#what-an-option-position-is-not}

| It has no | Because |
|---|---|
| Liquidation | Both sides are fully funded at the fill. There is nothing to liquidate |
| Margin requirement | The holder paid the premium. The writer locked the worst case |
| Mark price | The chain never prices an option |
| Order book | The lane is RFQ only. See [RFQ](../concepts/rfq.md) |
| Maker fee | Only the taker pays. The quoting maker has no fee leg. See [option fee](#option-fee) |
| Portfolio-margin offset | Options are outside [portfolio margin](../concepts/portfolio-margin.md) |
| Early exercise | The style is European. A position closes early by a trade. Exercise is not available |
| Spread or capped payoff | The chain lists single legs only. Build a spread from two series |

## Listing a series {#listing-a-series}

A validator vote of ⅔ of stake lists a series. A user action cannot list one, and there
is no permissionless deploy. The vote checks three things:

- The underlying is a live market with a fresh price feed.
- The expiry is at least one hour ahead.
- The strike is on the escrow grid.

A call needs an underlying with a spot token. The escrow and the payout are one unit of
the underlying, so an account must be able to hold that token. An index market has a price
feed but no token of its own. The chain refuses a call on it with
`a call needs an underlying with a spot token`. A put on the same underlying is accepted,
because it escrows and pays USDC.

The chain caps how much of the lane one series or the whole registry can hold.

| Cap | Value |
|---|---|
| Live series | 1,024 |
| Position rows per series | 2,048 |
| Position rows chain-wide | 32,768 |

The chain refuses a fill that would open a new position row past either row cap. A close of
an existing row is always allowed.

## Reads {#reads}

Two public reads cover the lane.

| Read | Answers |
|---|---|
| [`option_series`](../api/rest/info/options.md#option_series) | The live series, the `signing_id` to sign against, the `settle_asset`, and the `escrow_per_unit` that a writer locks |
| [`option_state`](../api/rest/info/options.md#option_state) | The holdings of one account: units long, units written, and the escrow it has locked |

A fill writes no ledger row of its own. Between the fill and expiry,
[`option_state`](../api/rest/info/options.md#option_state) is the only read where a writer
sees the escrow it locked and a holder sees its units.

:::danger[A position row carries TWO planes and TWO currencies]
`long` and `short` are unit counts, already on the series size scale. `escrow` is
money, in the `settle_asset` of that row: dollars on a put, coin on a call. All three are
decimal strings. A caller that reads `escrow` as units, or the `escrow` of a call as dollars,
gets a wrong number that still parses.
:::

The account-wide `option.escrow` on
[`account_state`](../api/rest/info/account.md#account_state) counts put legs only. It is
one USDC number, and you cannot add coins to dollars. `option.legs` still counts every leg.
For the denominations of each series, read
[`option_state`](../api/rest/info/options.md#option_state).

There is no public read for a series pot yet. The pot moves the same balances that
[`account_state`](../api/rest/info/account.md#account_state) and the spot balances show as
they leave and return.

## Changes from the bounded call {#what-changed}

The lane previously listed ceiling-bounded calls and settled everything in cash. That
model is gone. The bounded call is not a kind, and it cannot be listed. Nothing on the
chain can express a call spread any more.

| Then | Now |
|---|---|
| `kind` was `"put"` or a third token | `kind` is `"put"` or `"call"`, and nothing else |
| A call's payoff was bounded by a listed ceiling `C`, in USDC | A call's payoff is `max(1 − K / S*, 0)` COIN |
| A call escrowed `C − K` USDC: the width, not the strike | A call escrows ONE coin |
| The row carried a `cap` field on those calls | `cap` is gone, on the row and on the listing action |
| Every escrow and payout was USDC | The row carries `settle_asset`, and both follow it |
| The fee notional on a call was the width `C − K` | The fee notional is `strike × size` on both kinds |
| A call writer needed USDC | A call writer needs the coin |

No series is converted. The last bounded-call series settled and retired before the change,
so no live position crosses the boundary.

## See also {#see-also}

- [RFQ](../concepts/rfq.md): the only way to trade an option.
- [`option_series`](../api/rest/info/options.md#option_series): the registry of live series.
- [`option_state`](../api/rest/info/options.md#option_state): the holdings of one account in a series.
- [`/exchange` RFQ actions](../api/rest/exchange/rfq-utility.md): the field tables and the typed-data primary types.
- [Oracle prices](../concepts/oracle-prices.md): the price source that settlement reads.
- [MIP-4](../mip/mip-4.md): the proposal that started this product.
