---
description: CDS on MetaFlux is a planned protection market in the style of a credit default swap. This page states intent only. There is no committed wire surface.
---

# CDS

This page describes the planned CDS market on MetaFlux.

:::info
Planned. There is no wire surface, and nothing to build against. The contract
specification is not final. This includes the reference events, the premium schedule,
the collateralization, the settlement and the resolution design. This page states intent
only. A page of mechanics replaces it when the design ships behind a MIP.
:::

A credit default swap is a contract between a protection buyer and a protection
seller. The buyer pays a periodic premium to the seller. The seller compensates the buyer
if a defined credit event occurs on a reference entity. The contract is insurance
against a credit event.

The plan for MetaFlux is an on-chain protection market that uses the existing primitives
of the platform:

- The order book gives price discovery on premiums.
- Agent wallets sign.
- The margin and liquidation stack collateralizes the obligation of the seller.

## Resolution {#resolution}

Resolution is the open problem. The design must define a credit event and settle it
on-chain. This includes the oracle, the time windows and the dispute process. The deferred
[MIP-6](../mip/mip-6.md) prediction-market proposal must solve the same problem. This
problem is the reason that on-chain credit products are rare.

## See also {#see-also}

- [Perpetuals](./perpetuals.md): the leveraged-derivatives market that is live today.
- [MIP-6](../mip/mip-6.md): the shared problem of on-chain resolution.
- [Improvement proposals](../mip/index.md): where a new market type gets its specification.
