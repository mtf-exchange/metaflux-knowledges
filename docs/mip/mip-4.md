# MIP-4 — Options

:::warning
**Planned. No code, no wire, nothing to integrate against yet.** This page states
the scope and the constraints that shape it. It does not describe a live product.
Every mechanism below is under design and can still change.
:::

MIP-4 is the MetaFlux options product: on-chain options cleared and margined by
the same clearinghouse that carries perpetuals.

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

**In scope for the first release:**

- Cash-settled options on assets that already have a MetaFlux mark price.
- The existing cross-margin account. An option position sits in the same account
  as a perpetual position and offsets it.
- Portfolio margin across options and perpetuals together.

**Deliberately out of scope for the first release**, so the first version can be
proved rather than merely shipped:

- Physical settlement. Cash settlement stays inside the existing collateral plane.
- Exotic payoffs. Vanilla calls and puts only.
- Permissionless options deployment. That is the MIP-3 pattern and it can follow,
  but a permissionless options market is a risk surface that must be earned.

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

Nothing an integrator can call. The portfolio margin engine, the governed scenario
grid, the oracle lane and the liquidation waterfall are all live for perpetuals and
are the foundation MIP-4 builds on. No option instrument, no option order type and
no expiry mechanism exists.

## Related {#related}

- [MIP-3 — Permissionless perp market deploy](./mip-3.md) — the deploy pattern a
  permissionless options market would follow later
- [Perpetuals](../products/perpetuals.md) — the margin account options share
- [MIP-6 — Outcomes / prediction markets](./mip-6.md) — the other deferred payoff
  primitive
