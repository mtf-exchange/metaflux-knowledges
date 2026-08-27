# MIP-4 — Options

:::info
**A first release is live, and it is deliberately narrow.** European,
cash-settled, **fully collateralized** puts and capped calls, cleared through
[RFQ](../concepts/rfq.md) only. Read
[Options](../products/options.md) for the product, and
[`option_series`](../api/rest/info.md#option_series) for the wire.

The **margined** options book this page originally scoped is NOT built. The
constraints below are the reason, and the shipped design answers them by
side-stepping them: the chain never prices an option, so no option value ever
enters committed state.
:::

MIP-4 is the MetaFlux options product.

MIP-4 previously named a perps liquidity aggregator. That design is withdrawn and
the number is reassigned to options.

## Why options are the right next primitive {#why-options}

MetaFlux competes on capability, not on price. Perpetuals give a trader one axis:
direction, with leverage. Options add the two axes a perpetual cannot express —
**convexity** and **time** — and they are what a hedger needs. A miner selling
forward, a treasury protecting a floor, and a market maker running a delta-neutral
book all need a payoff that a perpetual cannot build cheaply.

The margin engine is the reason this is a MetaFlux product rather than a generic
one. MetaFlux already runs cross-asset portfolio margin over a governed grid of
price and volatility scenarios. An options book margined inside that same
portfolio, rather than position by position, is the differentiator: a covered call
should not cost the same margin as a naked one, and a spread should not cost the
sum of its legs.

## Scope {#scope}

**What the first release shipped:**

- Cash-settled puts and **capped** calls on assets that already carry a live
  MetaFlux price feed.
- Full collateralization. The holder pays the premium; the writer escrows the
  worst case. Neither leg can be liquidated.
- RFQ clearing. There is no option order book, and the chain computes no premium.
- Settlement from a window mean of committed oracle prices, with a defer-and-widen
  rule and an abandonment backstop.

**Deliberately out of the first release**, so the first version can be proved
rather than merely shipped:

- Margined options. An option position holds its own collateral and does not
  offset a perpetual.
- Portfolio margin across options and perpetuals together.
- Uncapped calls. An uncapped call has no finite worst case, so cash cannot fully
  collateralize it.
- Physical settlement, and exotic payoffs.
- Permissionless options deployment. A series is listed by validator ⅔-stake vote.
  The MIP-3 pattern can follow, but a permissionless options market is a risk
  surface that must be earned.

## The constraints that shape the design {#constraints}

These are not implementation details. They decide what the product can be, so they
are stated here rather than buried.

### Every price must be reproducible by every validator

MetaFlux is a chain. Each validator recomputes each block and the results must
agree exactly. Any quantity that enters committed state must therefore be computed
in exact arithmetic. Floating point is not usable, because two machines can round
it differently and a disagreement halts the chain rather than degrading quietly.

An option value is a transcendental function of its inputs. Producing one in exact
arithmetic, identically on every machine in the fleet, is the central engineering
problem of MIP-4. It is being solved before anything is built on top of it.

### Margin needs a value in every scenario, not just at the current price

The portfolio margin engine asks what a position is worth after a price shock and
a volatility shock. A perpetual answers cheaply: its value moves with the price,
one for one. An option does not. Each scenario needs the option revalued, which
multiplies the cost of a margin pass by the number of scenarios in the grid.

The grid is governed, so it can be tuned. The cost is still the budget that decides
how many option series a single account can hold.

### Volatility must come from somewhere trustworthy

An option's value depends on expected volatility. Reading that from the option
book itself is circular during exactly the moment it matters: in a liquidation the
book is thin and moving, and a volatility read from it would feed the margin call
that is causing the move. MetaFlux already guards a mark price against a
wash-traded book. Volatility needs a guard of the same kind, and it is an open
design question which source carries it.

## What exists today {#what-exists}

The collateralized lane is live: the series registry, the RFQ trade path, the
escrow lifecycle and the expiry settlement. See
[Options](../products/options.md).

What is not built is everything that needs an option VALUE — a margined option
position, portfolio margin over options and perpetuals together, and any read that
serves a premium or an implied volatility. The three constraints above are open,
and the shipped lane needs none of them answered.

## Related {#related}

- [MIP-3 — Permissionless perp market deploy](./mip-3.md) — the deploy pattern a
  permissionless options market would follow later
- [Options](../products/options.md) — the live product
- [RFQ](../concepts/rfq.md) — the only trade path into it
- [Perpetuals](../products/perpetuals.md) — the other derivative, on its own margin account
- [MIP-6 — Outcomes / prediction markets](./mip-6.md) — the other deferred payoff
  primitive
