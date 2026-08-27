---
description: Options on MetaFlux — European, cash-settled, fully collateralized series traded through RFQ only. Live series, escrow rules, settlement, and the reads.
---

# Options

## TL;DR {#tldr}

A MetaFlux option is a **European, cash-settled, fully collateralized** contract on
a listed underlying. It trades through [RFQ](../concepts/rfq.md) only. There is no
option order book.

- The **holder** pays the premium at the fill. That is the whole requirement. An
  option position carries no margin, no mark price, and **no liquidation**.
- The **writer** locks the worst case at the fill. The lock is called the
  **escrow**. It stays in the series pot until the position closes or the series
  settles.
- The chain never computes an option price and never needs an implied volatility.
  The premium is the price two accounts agree on in an RFQ.

Read the live series from [`option_series`](../api/rest/info.md#option_series).
Trade them with [`rfq_request`](../api/rest/exchange.md#rfq_request),
[`rfq_quote`](../api/rest/exchange.md#rfq_quote) and
[`rfq_accept`](../api/rest/exchange.md#rfq_accept).

## The two kinds {#the-two-kinds}

A series is one `(underlying, expiry, strike, kind, cap)` tuple. Only two kinds
exist.

| Kind | Wire value | Payoff per unit at settlement price `S` | Escrow per unit |
|---|---|---|---|
| Put | `"put"` | `max(K − S, 0)` | `K` — the strike |
| Capped call | `"capped_call"` | `min(max(S − K, 0), C − K)` | `C − K` — the cap minus the strike |

**Calls are capped only.** An uncapped call has no finite worst case, because the
price has no ceiling. Full collateralization in cash therefore needs a cap.

:::warning[The call escrow is the width, not the strike]
A capped call writer locks **`cap − strike`** per unit, not `strike` per unit. A
$100 strike with a $130 cap escrows $30 per unit. Read
[`escrow_per_unit`](../api/rest/info.md#option_series) rather than deriving it —
the row serves the number.
:::

## What a fill moves {#what-a-fill-moves}

An option fill moves three things and nothing else.

1. The premium goes from the holder to the writer, in USDC.
2. The writer's escrow goes from the writer's balance into the series pot.
3. A closing writer's escrow comes back out of the pot.

An option fill opens no perpetual position, charges no trading fee, and touches no
margin figure. See [what an option position is not](#what-an-option-position-is-not).

**Closing releases the escrow exactly.** The strike and the cap sit on an escrow
grid that the listing rule enforces, so the escrow per unit is a whole number of
micro-USDC. A partial close releases exactly that rate times the closed units. No
rounding residue can build up on the trading path.

**A holder who sells back closes first.** The chain nets the two legs of each
account before it locks anything: an account that holds long units and then writes
gives up long units instead of opening a short. So a round trip returns exactly
what it locked.

## The size plane {#the-size-plane}

RFQ `size` is an integer on the `10^sz_decimals` plane of the series, exactly like
a perpetual order size. `sz_decimals` is on every
[`option_series`](../api/rest/info.md#option_series) row.

- Wire `size` = whole units × `10^sz_decimals`.
- Premium in USDC = quoted `price` × whole units.
- Escrow in USDC = `escrow_per_unit` × whole units.

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

Everything is paid into the ordinary USDC account balance.

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
waiting. **Nobody is paid.** Every writer takes their **whole escrow** back, and a
holder of an in-the-money option gets **nothing**. No price is honest at that
point, so the chain moves no money on one.

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
| Trading fee | An option fill charges none today |
| Portfolio-margin offset | Options are outside [portfolio margin](../concepts/portfolio-margin.md) |
| Early exercise | The style is European. A position closes early by trading, not by exercise |

## Listing a series {#listing-a-series}

A series is listed by a **validator ⅔-stake vote**, not by a user action and not by
a permissionless deploy. The vote checks that the underlying is a live market with
a fresh price feed, that expiry is at least one hour ahead, and that the strike and
the cap sit on the escrow grid.

The chain caps how much of the lane one series or the whole registry can hold.

| Cap | Value |
|---|---|
| Live series | 1,024 |
| Position rows per series | 2,048 |
| Position rows chain-wide | 32,768 |

A fill that would open a new position row past either row cap is refused. Closing
an existing row is always allowed.

## Reads {#reads}

[`option_series`](../api/rest/info.md#option_series) is the public read. It serves
every live series, with the `signing_id` to sign against and the
`escrow_per_unit` a writer locks.

:::caution[Your option position is not on a public read yet]
There is no public read for an option position, its escrow, or a series pot, and
the RFQ session reads are [operator lane](../api/rest/info.md#operator-reads)
today. The visible effect of a fill on the public API is the **USDC balance
change** on [`account_state`](../api/rest/info.md#account_state) — the premium on
both sides, and the escrow on the writer's side. Settlement lands the same way.
:::

## See also {#see-also}

- [RFQ](../concepts/rfq.md) — the only way to trade an option
- [`option_series`](../api/rest/info.md#option_series) — the live series registry
- [`/exchange` RFQ actions](../api/rest/exchange.md#rfq-fba--utility-actions) — the field tables and the typed-data primary types
- [Oracle prices](../concepts/oracle-prices.md) — the price source settlement reads
- [MIP-4](../mip/mip-4.md) — the proposal this product came from
