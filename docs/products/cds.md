---
description: CDS on MetaFlux — a planned credit-default-swap-style protection market. Intent only; there is no committed wire surface.
---

# CDS

:::info
**Planned. There is no wire surface, and nothing to build against.** The contract
specification — reference events, premium schedule, collateralization, settlement
and the resolution design — is not finalized. This page states intent only, and
will be replaced with mechanics when the design ships behind a MIP.
:::

A **credit default swap** is a contract in which a protection buyer pays a
periodic premium to a protection seller, and the seller compensates the buyer if
a defined **credit event** occurs on a reference entity. It is insurance against
a credit event.

The intent on MetaFlux is an on-chain protection market that reuses the
platform's primitives: the order book for price discovery on premiums, agent
wallets for signing, and the margin and liquidation stack for collateralizing the
seller's obligation.

**The open problem is resolution** — how a credit event is defined and settled
on-chain, including the oracle, the time windows and dispute handling. That is
the same problem the deferred [MIP-6](../mip/mip-6.md) prediction-market proposal
must solve, and it is why on-chain credit products are rare.

## See also {#see-also}

- [Perpetuals](./perpetuals.md) — the live leveraged-derivatives market today
- [MIP-6](../mip/mip-6.md) — the shared on-chain resolution problem
- [Improvement proposals](../mip/index.md) — where a new market type is specified
