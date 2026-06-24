---
description: CDS on MetaFlux — a planned credit-default-swap-style protection market. High-level intent only; the contract spec and wire surface are not yet finalized.
---

# CDS

:::info
**Planned — not yet specified.** A credit-default-swap-style protection market is
on the MetaFlux roadmap, but the contract specification (reference events, premium
schedule, collateralization, settlement and oracle/resolution design, and the
`/exchange` wire actions) is **not finalized and not public**. This page describes
intent only. It will be filled in with concrete mechanics when the design ships
behind a MIP. Do not build against it yet — there is no committed wire surface.
:::

## What a CDS is

A **credit default swap (CDS)** is a contract in which a protection **buyer** pays a
periodic premium to a protection **seller**, and in return the seller compensates the
buyer if a defined **credit event** occurs on a reference entity or obligation
(e.g. a default). It is, in effect, insurance against a credit event: the buyer
transfers default risk to the seller in exchange for an ongoing premium.

## Intended direction on MetaFlux

The goal is an **on-chain protection market** that, like the rest of MetaFlux,
reuses the platform's primitives where they fit — the [order book](../concepts/order-types.md)
for price discovery on premiums, [agent wallets](../concepts/agent-wallets.md) for
signing, and the [margin and liquidation](../concepts/tiered-liquidation.md) stack
for collateralizing the protection seller's obligation. The hardest design questions
are the same ones that make on-chain credit products rare: **how a credit event is
defined and resolved on-chain** (oracle, time windows, dispute handling) — closely
related to the resolution machinery the deferred [Outcomes / prediction-markets](../mip/mip-6.md)
proposal must also solve. None of this is settled yet.

:::caution
Until the spec lands, treat anything beyond this page about MetaFlux CDS as
unconfirmed. The general definition above is standard finance; the MetaFlux-specific
mechanics are not yet decided.
:::

## Fees

**Not yet defined.** When a CDS market ships, fees will follow the platform
[fee framework](../concepts/fees.md) — the premium structure and any
protection-event settlement charges are part of the unfinished spec and will be
published with it.

## See also

- [Perpetuals](./perpetuals.md) — the live leveraged-derivatives market today
- [Concepts](../concepts/index.md) — the shared mechanics a CDS market would build on
- [MIP-6 — Outcomes / prediction markets](../mip/mip-6.md) — the related on-chain resolution problem
- [Improvement proposals](../mip/index.md) — where new market types are specified
