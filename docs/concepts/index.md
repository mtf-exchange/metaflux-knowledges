---
description: Core mechanisms of MetaFlux, including agent wallets, margin, liquidation, order types, vaults, fees and the glossary.
---

# Concepts

This section explains the core mechanisms of MetaFlux: what each one does, how to use it, and how it behaves under stress.

The [architecture map](./architecture.md) gives a one-page overview of every component inside MetaFlux Core. Each component links to its own page.

## Read order for integrators {#read-order-for-integrators}

1. [Agent wallets](./agent-wallets.md): hot-key delegation, the standard market-maker setup.
2. [Order types](./order-types.md): TIF, STP, triggers, TWAP and scale orders.
3. [Margin modes](./margin-modes.md): Cross, Isolated and Strict-Iso.
4. [Mark prices](./mark-prices.md): the price that drives margin, liquidation and triggers.
5. [Tiered liquidation](./tiered-liquidation.md): the tiers from T0 (yellow card) to T4 (ADL).
6. [Funding rates](./funding-rates.md): a discrete payment between users, per asset.
7. [Fees](./fees.md): maker and taker tiers, and the burn.
8. [Fee schedule](./fee-schedule.md): volume, maker-rebate and staking discount tiers.
9. [Broker codes](./broker-codes.md): charge your own fee on the orders you route.
10. [Priority fees](./priority-fees.md): pay for a position inside a block. The page also compares a priority fee with a broker fee.
11. [Sub-accounts](./sub-accounts.md): isolate a strategy or its risk.
12. [Portfolio margin](./portfolio-margin.md): cross-asset margin in the style of SPAN.

## Earn and related products {#earn--related-products}

The tradeable markets are under [Products](../products/index.md): [Perpetuals](../products/perpetuals.md), [Spot](../products/spot.md) and [Spot margin](../products/spot-margin.md). The lending pool that funds spot-margin borrows is a concept.

- [Earn](./earn.md): **testnet preview**. A USDC lending pool that funds spot-margin borrows.
- [Spot](../products/spot.md): **active**. A token-for-token CLOB with reserved-balance escrow and no leverage.
- [Spot margin](../products/spot-margin.md): **testnet preview**. Leveraged spot that the Earn pool funds.

:::info
Non-leveraged spot is the one Sharia-compliant product. See [Sharia compliance](../products/index.md#sharia).
:::

## Advanced {#advanced}

- [ADL](./adl.md): the T4 auto-deleverage math.
- [Multi-sig](./multi-sig.md): M-of-N control for institutions.
- [Vaults](./vaults.md): the MFlux Vault and user vaults.
- [Staking](./staking.md): delegate MTF and earn rewards.
- [RFQ](./rfq.md): request for quote, the trade path for options.
- [FBA](./fba.md): frequent batch auction matching.

## Reference {#reference}

- [System addresses](./system-addresses.md): the reserved keyless addresses of the protocol.
- [Glossary](./glossary.md): a definition of every protocol-specific term.
