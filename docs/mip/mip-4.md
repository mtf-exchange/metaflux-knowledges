# MIP-4: Options

MIP-4 defines the MetaFlux options product.

:::info A narrow first release is live
The first release has standard European puts and calls. They are fully collateralized and clear
through [RFQ](../concepts/rfq.md) only. A put settles in USDC. A call settles in the underlying
coin and escrows one coin per contract. [Options](../products/options.md) describes the product,
and [`option_series`](../api/rest/info/options.md#option_series) describes the wire.

The margined options book that this page first scoped is not built. The constraints below are
the reason. The shipped design avoids them: the chain never prices an option, so no option value
ever enters committed state.
:::

MIP-4 is the MetaFlux options product.

MIP-4 named a perps liquidity aggregator before. That design is withdrawn, and the number now
belongs to options.

## Rationale {#why-options}

MetaFlux competes on capability. It does not compete on price. Perpetuals give a trader one
axis: direction, with leverage. Options add two axes that a perpetual cannot express: *convexity*
and *time*. A hedger needs them. A miner who sells forward, a treasury that protects a floor, and
a market maker with a delta-neutral book all need a payoff that a perpetual cannot build cheaply.

The margin engine makes this a MetaFlux product and not a generic one. MetaFlux already runs
cross-asset portfolio margin over a governed grid of price and volatility scenarios. The
differentiator is an options book margined inside that same portfolio, and not position by
position. A covered call must not cost the same margin as a naked call. A spread must not cost
the sum of its legs.

## Scope {#scope}

The first release shipped these parts:

- Standard European puts and calls on assets that already have a live MetaFlux price feed. A put
  is cash-settled. A call is coin-settled: it escrows and pays one unit of the underlying, so its
  underlying needs a spot token.
- Full collateralization. The holder pays the premium. The writer escrows the worst case.
  Neither leg can be liquidated.
- RFQ clearing. There is no option order book, and the chain computes no premium.
- Settlement from a window mean of committed oracle prices, with a defer-and-widen rule and an
  abandonment backstop.

These parts are out of the first release on purpose, so that the first version can be proved
and not only shipped:

- Margined options. An option position holds its own collateral and does not offset a
  perpetual.
- Portfolio margin across options and perpetuals together.
- Cash-settled calls. `max(S* - K, 0)` in USDC has no finite worst case, so no cash escrow can
  fully collateralize it. The lane avoids that problem and does not bound the payoff. The same
  call, read in the underlying, is worth at most one coin. A call therefore escrows one coin and
  settles in coin. See
  [why a call escrows one coin](../products/options.md#why-a-call-escrows-one-coin).
- Physical settlement, and exotic payoffs.
- Permissionless options deployment. A validator ⅔-stake vote lists each series. The MIP-3
  pattern can follow later. A permissionless options market is a risk surface, and it must earn
  its place first.

## Design constraints {#constraints}

These constraints decide what the product can be, so this page states them in full.

### Reproducible prices {#every-price-must-be-reproducible-by-every-validator}

MetaFlux is a chain. Each validator recomputes each block, and the results must agree exactly.
Every quantity that enters committed state must therefore use exact arithmetic. Floating point
is not usable. Two machines can round it differently, and a disagreement halts the chain. It
does not degrade quietly.

An option value is a transcendental function of its inputs. The central engineering problem of
MIP-4 is to compute one in exact arithmetic, the same on every machine in the fleet. This
problem is being solved before anything is built on top of it.

### A value in every scenario {#margin-needs-a-value-in-every-scenario-not-just-at-the-current-price}

The portfolio margin engine asks what a position is worth after a price shock and a volatility
shock. A perpetual answers cheaply: its value moves with the price, one for one. An option does
not. Each scenario needs a new option value. This multiplies the cost of a margin pass by the
number of scenarios in the grid.

The grid is governed, so it can be tuned. The cost still sets the budget for the number of
option series that one account can hold.

### A trusted volatility source {#volatility-must-come-from-somewhere-trustworthy}

An option's value depends on expected volatility. A volatility read from the option book itself
is circular at the moment it matters most. In a liquidation, the book is thin and moving. A
volatility read from it feeds the margin call that causes the move. MetaFlux already guards a
mark price against a wash-traded book. Volatility needs a guard of the same kind. The source
that carries it is an open design question.

## Current state {#what-exists}

The collateralized lane is live: the series registry, the RFQ trade path, the escrow lifecycle
and the expiry settlement. See [Options](../products/options.md).

Everything that needs an option value is not built: a margined option position, portfolio
margin over options and perpetuals together, and any read that serves a premium or an implied
volatility. The three constraints above are open. The shipped lane needs none of them answered.

## Related {#related}

- [MIP-3 — Permissionless perp market deploy](./mip-3.md): the deploy pattern that a
  permissionless options market can follow later
- [Options](../products/options.md): the live product
- [RFQ](../concepts/rfq.md): the only trade path into it
- [Perpetuals](../products/perpetuals.md): the other derivative, on its own margin account
- [MIP-6 — Outcomes / prediction markets](./mip-6.md): the other deferred payoff primitive
