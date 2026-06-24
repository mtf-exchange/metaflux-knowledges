---
description: Options on MetaFlux — a planned on-chain calls/puts market. High-level intent only; the contract spec and wire surface are not yet finalized.
---

# Options

:::info
**Planned — not yet specified.** On-chain options are on the MetaFlux roadmap, but
the contract specification (settlement style, expiries, strike grid, margining, and
the `/exchange` wire actions) is **not finalized and not public**. This page
describes intent only. It will be filled in with concrete mechanics when the design
ships behind a MIP. Do not build against it yet — there is no committed wire
surface.
:::

## What an option is

An **option** is a contract that gives the holder the right — but not the
obligation — to buy (a **call**) or sell (a **put**) an underlying asset at a fixed
**strike price** on or before an **expiry**. The buyer pays a **premium** upfront;
the seller (writer) collects the premium and takes on the obligation. Options let
traders express directional, volatility, and hedging views with a defined,
premium-bounded downside for buyers.

## Intended direction on MetaFlux

The goal is a **fully on-chain options market** that reuses the platform's existing
infrastructure where it makes sense — the [order book](../concepts/order-types.md)
and matching engine, [agent wallets](../concepts/agent-wallets.md) for signing,
[mark/oracle pricing](../concepts/mark-prices.md) for valuation and settlement, and
the [margin and liquidation](../concepts/tiered-liquidation.md) stack for collateralizing
written positions. Whether settlement is cash or physical, the expiry schedule, and
the exact margin model are open design questions still being worked out.

:::caution
Until the spec lands, treat anything beyond this page about MetaFlux options as
unconfirmed. The general definition above is standard finance; the MetaFlux-specific
mechanics are not yet decided.
:::

## Fees

**Not yet defined.** When options ship, trading fees will follow the platform
[fee framework](../concepts/fees.md) — the exact maker/taker rates and any
premium- or settlement-based charges are part of the unfinished spec and will be
published with it.

## See also

- [Perpetuals](./perpetuals.md) — the live leveraged-derivatives market today
- [Concepts](../concepts/index.md) — the shared mechanics options will build on
- [Improvement proposals](../mip/index.md) — where new market types are specified
