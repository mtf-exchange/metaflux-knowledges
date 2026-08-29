---
description: Options on MetaFlux — standard European puts and calls, fully collateralized, traded through RFQ only. A put settles in USDC and a call settles in the underlying coin. Live series, escrow rules, settlement, and the reads.
---

# Options

:::warning Not live yet
This page describes the **standard European** option lane. The release that
carries it has not fired. Until it does, a live node still serves the previous
lane: a call answers a THIRD `kind` token instead of `"call"`, its series row
carries an extra `cap` field and no `settle_asset`, and every escrow and payout is
USDC. Treat any `kind` outside `"put"` and `"call"` as the pre-release lane. Read
[what changed](#what-changed) for the field-by-field move, and ship your client
change **with** the release, not before it.
:::

## TL;DR {#tldr}

A MetaFlux option is a **standard European, fully collateralized** contract on a
listed underlying. It trades through [RFQ](../concepts/rfq.md) only. There is no
option order book.

- The **holder** pays the premium at the fill. That is the whole requirement. An
  option position carries no margin, no mark price, and **no liquidation**.
- The **writer** locks the worst case at the fill. The lock is called the
  **escrow**. It stays in the series pot until the position closes or the series
  settles.
- **A put settles in USDC. A call settles in the underlying coin.** The
  denomination is on every row as
  [`settle_asset`](../api/rest/info.md#option_series). Read it. A client that
  assumes dollars is wrong about every call.
- The chain never computes an option price and never needs an implied volatility.
  The premium is the price two accounts agree on in an RFQ.

Read the live series from [`option_series`](../api/rest/info.md#option_series).
Trade them with [`rfq_request`](../api/rest/exchange.md#rfq_request),
[`rfq_quote`](../api/rest/exchange.md#rfq_quote) and
[`rfq_accept`](../api/rest/exchange.md#rfq_accept).

## The two kinds {#the-two-kinds}

A series is one `(underlying, expiry, strike, kind)` tuple. Exactly two kinds
exist. `S*` is the settlement price and `K` is the strike.

| Kind | Wire value | Payoff per whole unit | Escrow per whole unit | `settle_asset` |
|---|---|---|---|---|
| Put | `"put"` | `max(K − S*, 0)` USDC | `K` USDC | `"USDC"` |
| Call | `"call"` | `max(1 − K / S*, 0)` COIN | **ONE coin** | the underlying's token, e.g. `"BTC"` |

Both are European. Neither can be exercised before expiry. A position closes
early by trading it back, not by exercise.

## Why a call escrows one coin {#why-a-call-escrows-one-coin}

The call's denomination is **forced, not chosen**.

A cash call pays `max(S* − K, 0)` in USDC. The price has no ceiling, so that
payoff has no finite worst case. **No cash escrow can cover it.** A cash call
therefore needs a margin engine and a liquidation ladder for its writers.

Read the same payoff in the **underlying** and it is bounded at every price:

```text
max(1 − K / S*, 0) COIN  valued at S*  =  max(S* − K, 0) USDC
```

`K / S*` is above zero, so `1 − K / S*` is **below one at every price**. One coin
per contract therefore covers the worst case, whatever happens to the price. That
is the covered call every desk already writes, and it is why this lane keeps its
central promise: both sides are fully funded at the fill, so **an option position
can never be liquidated**.

:::danger[A call is denominated in the coin, not in dollars]
On a call series, `escrow_per_unit` is `"1"`, the settlement payout is coin, and
the writer's refund is coin. The number `"1"` is **one coin**, not one dollar.

Read [`settle_asset`](../api/rest/info.md#option_series) on the row and use it as
the currency of `escrow_per_unit`, of
[`option_state.escrow`](../api/rest/info.md#option_state), and of every amount
settlement moves. A caller that formats those figures as dollars is wrong by the
whole asset class on every call.

The **premium** is the exception, and it is the one that is always USDC. See
[the premium is always USDC](#the-premium-is-always-usdc).
:::

### The payoff at a price {#payoff-worked}

One BTC call, `K` = 100,000, settling at `S*` = 125,000:

```text
payoff = max(1 − 100000 / 125000, 0) = 0.2 BTC per unit
refund = 1 − 0.2                     = 0.8 BTC per unit
```

The holder's 0.2 BTC is worth `0.2 × 125,000` = $25,000 at the settlement price,
which is exactly `S* − K`. The coin payoff and the cash payoff are the same
economics; only the currency the chain can safely escrow differs.

At `S*` = 100,000 or below the payoff is `0` and the writer takes the whole coin
back.

The put is the plain one. One BTC put, `K` = 100,000, settling at `S*` = 90,000,
pays the holder $10,000 and refunds the writer $90,000 of its $100,000 escrow.

## What a fill moves {#what-a-fill-moves}

An option fill moves four things and nothing else.

1. The **premium** goes from the holder to the writer, in **USDC**, on both
   kinds.
2. The **escrow** goes from the writer's balance into the series pot, in
   `settle_asset`.
3. A closing writer's escrow comes back out of the pot, in `settle_asset`.
4. The taker pays a trading fee, in **USDC**. See [the option fee](#option-fee).

An option fill opens no perpetual position and touches no margin figure. See
[what an option position is not](#what-an-option-position-is-not).

**A call writer must hold the coin.** The escrow leaves the writer's **spot
balance** of the underlying token. A spot balance cannot go negative, so holding
the coin IS the whole collateral test: no margin figure is consulted and no USDC
is encumbered. A writer short of the coin is refused with `insufficient
underlying balance for the escrow`.

**A call escrow cannot net the premium it earns.** On a put series the incoming
USDC premium reduces the USDC the writer must find for the escrow, so the chain
checks one net number. On a call series the escrow is coin and the premium is
dollars, so the chain checks the two assets **separately**: the coin for the
escrow, then USDC for the fee. That is why a call writer can be refused with
`insufficient free collateral for the fee` while holding every coin it needs.

**Closing releases the escrow exactly.** The strike sits on an escrow grid that
the listing rule enforces, so the escrow per unit is a whole number of the
settlement asset's smallest committed step. A partial close releases exactly that
rate times the closed units. No rounding residue can build up on the trading
path.

**A holder who sells back closes first.** The chain nets the two legs of each
account before it locks anything: an account that holds long units and then
writes gives up long units instead of opening a short. So a round trip returns
exactly what it locked.

### The premium is always USDC {#the-premium-is-always-usdc}

`settle_asset` governs the escrow and the settlement payout. It does **not**
govern the premium.

| Amount | Currency on a put | Currency on a call |
|---|---|---|
| Premium (RFQ `price` × units) | USDC | **USDC** |
| Taker fee | USDC | **USDC** |
| Escrow | USDC | the coin |
| Settlement payout and refund | USDC | the coin |

An RFQ `price` is a **premium per whole underlying unit in USDC**, on the 1e8
plane, for both kinds. Quote a call in dollars; read its escrow and its payout in
coin. A client that divides the premium on the coin plane overstates it.

## The option fee {#option-fee}

Only the TAKER pays. The taker is whoever sent the RFQ request, so it can be the
holder or the writer depending on which side they asked for. The quoting maker
has no fee leg at all.

The fee is the SMALLER of two terms, and it is charged in USDC on both kinds:

```text
fee = min( strike_face x taker_rate ,  premium x premium_cap )
```

**`strike_face` is `strike × size`, for BOTH kinds.** The strike face is the only
notional the chain can read without pricing anything. A put's worst payout IS the
strike face. A call escrows one coin, whose dollar worth the chain would have to
fetch a price to know, so the strike face is the bound it uses there too.

**The premium term is the tail guard.** A far out-of-the-money option can have a
premium far below its strike face, and the notional term alone would then charge
a fee larger than the option itself. The cap holds the fee to a fraction of the
premium the taker actually paid. It binds rarely — only when the premium is a
sliver of the strike face — but that is exactly the case it exists for.

Both terms truncate toward zero, and the smaller one wins, so the fee never
rounds up.

Both rates are governance parameters and both start UNSET, which charges nothing.
The taker rate is capped at 1% of the notional by the same ceiling every other fee
rate uses. Read the live values on
[`/info fee_schedule`](../api/rest/info.md#fee_schedule), in the `option` row of
`products`.

## The size plane {#the-size-plane}

RFQ `size` is an integer on the `10^sz_decimals` plane of the series, exactly like
a perpetual order size. `sz_decimals` is on every
[`option_series`](../api/rest/info.md#option_series) row.

- Wire `size` = whole units × `10^sz_decimals`.
- Premium in USDC = quoted `price` × whole units.
- Escrow in `settle_asset` = `escrow_per_unit` × whole units.

The premium is truncated toward zero to micro-USDC. A fill whose premium truncates
to zero is **refused**, so a size that is too small for the quoted price does not
trade for free.

## Settlement {#settlement}

At expiry the chain settles the whole series in one block. It pays from the series
pot, and the pot closes to exactly zero.

- Each holder is paid `intrinsic × units`, truncated toward zero.
- Each writer is refunded `(escrow rate − intrinsic) × units`, truncated toward zero.
- The rounding residue is **dust**. It goes to the insurance fund. It is never a
  charge on a writer beyond the escrow, and never a shortfall for a holder.

**Every amount is paid in `settle_asset`.** A put credits the ordinary USDC
account balance. A call credits the **spot balance of the underlying token** — the
same balance a spot trade moves. Dust routes to the insurance fund in that same
asset.

A call's `intrinsic` divides by `S*`, so it truncates once more than a put's. The
truncation always shrinks the holder's claim, which is the safe direction: the
writer's refund is the complement, so a charge can never exceed the escrow.

### The settlement price {#the-settlement-price}

The settlement price is the **arithmetic mean of the committed oracle prices whose
source timestamp falls inside a window that ends at expiry**. It is not the last
price, and it is not a mark price.

Samples are deduplicated by source timestamp. One oracle submission is one sample,
however many blocks carry it forward. That is what keeps the mean independent of
the block cadence.

The window needs a minimum number of distinct source timestamps before it can
price. The defaults are below. Governance can vote each of them.

| Knob | Default | Meaning |
|---|---|---|
| Window | 180,000 ms | Length of the price window before expiry |
| Minimum entries | 20 | Distinct source timestamps the window needs |
| Widening step | one window per 60,000 ms after expiry | How fast a thin window grows |
| Maximum window | 900,000 ms | Ceiling on the widened window |
| Abandon after | 86,400,000 ms | Time after expiry at which the series gives up |

### Deferral and abandonment {#deferral-and-abandonment}

:::danger[Settlement can defer, and it can abandon]
**A thin window defers.** If the window holds fewer than the minimum number of
distinct source timestamps, the series does not settle. It waits, retries a minute
later, and widens the window by one step each time. A series that can price always
prices, however late the attempt.

**A window that never fills abandons.** Past the abandon bound the chain stops
waiting. **Nobody is paid.** Every writer takes their **whole escrow** back — the
whole coin on a call, the whole strike on a put — and a holder of an in-the-money
option gets **nothing**. No price is honest at that point, so the chain moves no
money on one.

Abandonment is a dead-feed backstop, not a normal outcome. It is the reason a
series on a thinly fed underlying is a different risk from a series on a busy one.
:::

## What an option position is not {#what-an-option-position-is-not}

| It has no | Because |
|---|---|
| Liquidation | Both sides are fully funded at the fill. There is nothing to liquidate |
| Margin requirement | The holder paid the premium. The writer locked the worst case |
| Mark price | The chain never prices an option |
| Order book | The lane is RFQ only. See [RFQ](../concepts/rfq.md) |
| Maker fee | Only the taker pays. The quoting maker has no fee leg. See [the option fee](#option-fee) |
| Portfolio-margin offset | Options are outside [portfolio margin](../concepts/portfolio-margin.md) |
| Early exercise | The style is European. A position closes early by trading, not by exercise |
| Spread or capped payoff | The chain lists single legs only. Build a spread from two series |

## Listing a series {#listing-a-series}

A series is listed by a **validator ⅔-stake vote**, not by a user action and not by
a permissionless deploy. The vote checks that the underlying is a live market with
a fresh price feed, that expiry is at least one hour ahead, and that the strike
sits on the escrow grid.

**A call needs an underlying with a spot token.** The escrow and the payout are
one unit of the underlying, so an account must be able to hold that token. An
index market has a price feed but no token of its own, so a call on it is refused
with `a call needs an underlying with a spot token`. A put on the same underlying
is fine: it escrows and pays USDC.

The chain caps how much of the lane one series or the whole registry can hold.

| Cap | Value |
|---|---|
| Live series | 1,024 |
| Position rows per series | 2,048 |
| Position rows chain-wide | 32,768 |

A fill that would open a new position row past either row cap is refused. Closing
an existing row is always allowed.

## Reads {#reads}

Two public reads cover the lane.

| Read | Answers |
|---|---|
| [`option_series`](../api/rest/info.md#option_series) | Which series are live, the `signing_id` to sign against, the `settle_asset`, and the `escrow_per_unit` a writer locks |
| [`option_state`](../api/rest/info.md#option_state) | What one account holds: units long, units written, and the escrow it has locked |

A fill writes no ledger row of its own. Between the fill and expiry,
[`option_state`](../api/rest/info.md#option_state) is the only read where
a writer sees the escrow it locked and a holder sees its units.

:::danger[A position row carries TWO planes and TWO currencies]
`long` and `short` are **unit counts**, already on the series size scale.
`escrow` is **money, in that row's `settle_asset`** — dollars on a put, coin on a
call. All three are decimal strings, so a caller that reads `escrow` as units, or
a call's `escrow` as dollars, gets a wrong number that still parses.
:::

The account-wide `option.escrow` on
[`account_state`](../api/rest/info.md#account_state) counts **put legs only**. It
is one USDC number, and coins cannot be added to dollars. `option.legs` still
counts every leg. For the per-series denominations read
[`option_state`](../api/rest/info.md#option_state).

There is still no public read for a series pot. The pot moves the same balances
that [`account_state`](../api/rest/info.md#account_state) and the spot balances
show leaving and returning.

## What changed {#what-changed}

The lane previously listed **ceiling-bounded calls** and settled everything in
cash. That framing is gone. The bounded call is not a kind, it cannot be listed,
and **nothing on the chain can express a call spread any more**.

| Then | Now |
|---|---|
| `kind` was `"put"` or a third token | `kind` is `"put"` or `"call"`, and nothing else |
| A call's payoff was bounded by a listed ceiling `C`, in USDC | A call's payoff is `max(1 − K / S*, 0)` COIN |
| A call escrowed `C − K` USDC — the width, not the strike | A call escrows **ONE coin** |
| The row carried a `cap` field on those calls | `cap` is **gone**, on the row and on the listing action |
| Every escrow and payout was USDC | The row carries `settle_asset`, and both follow it |
| The fee notional on a call was the width `C − K` | The fee notional is `strike × size` on both kinds |
| A call writer needed USDC | A call writer needs **the coin** |

No series is converted. The last bounded-call series settled and retired before
the change, so no live position crosses the boundary.

## See also {#see-also}

- [RFQ](../concepts/rfq.md) — the only way to trade an option
- [`option_series`](../api/rest/info.md#option_series) — the live series registry
- [`option_state`](../api/rest/info.md#option_state) — what one account holds in a series
- [`/exchange` RFQ actions](../api/rest/exchange.md#rfq-fba--utility-actions) — the field tables and the typed-data primary types
- [Oracle prices](../concepts/oracle-prices.md) — the price source settlement reads
- [MIP-4](../mip/mip-4.md) — the proposal this product came from
