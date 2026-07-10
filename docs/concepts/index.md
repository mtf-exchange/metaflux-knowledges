---
description: Core mechanisms — agent wallets, margin, liquidation, order types, vaults, fees, and the glossary.
---

# Concepts

Plain-language explanations of MetaFlux's core mechanisms — what they do, how to use them, and what to expect under stress.

:::tip
**New here?** Start with the [Architecture map](./architecture.md) — a one-page
overview of every component inside MetaFlux Core and how they fit together, each
linking to its deep-dive page below.
:::

## Read order for integrators {#read-order-for-integrators}

1. [Agent wallets](./agent-wallets.md) — hot-key delegation, the standard market-maker setup
2. [Order types](./order-types.md) — TIF, STP, triggers, TWAP, scale
3. [Margin modes](./margin-modes.md) — Cross / Isolated / Strict-Iso
4. [Mark prices](./mark-prices.md) — what drives margin, liquidation, triggers
5. [Tiered liquidation](./tiered-liquidation.md) — T0 yellow card → T4 ADL
6. [Funding rates](./funding-rates.md) — per-asset discrete user-to-user payment
7. [Fees](./fees.md) — maker/taker tiers + burn
8. [Fee schedule](./fee-schedule.md) — volume, maker-rebate, and staking discount tiers
9. [Sub-accounts](./sub-accounts.md) — strategy / risk isolation
10. [Portfolio margin](./portfolio-margin.md) — cross-asset SPAN-like margin

## Earn & related products {#earn--related-products}

The tradeable markets now live under [Products](../products/index.md) — see
[Perpetuals](../products/perpetuals.md), [Spot](../products/spot.md), and
[Spot margin](../products/spot-margin.md). The lending pool that funds spot-margin
borrows is a concept:

- [Earn](./earn.md) — **devnet preview**: USDC lending pool that funds spot-margin borrows
- [Spot](../products/spot.md) — **live**: token-for-token CLOB, reserved-balance escrow, no leverage
- [Spot margin](../products/spot-margin.md) — **devnet preview**: leveraged spot funded by the Earn pool

:::info
**Non-leveraged spot only is Sharia-compliant.** Only **non-leveraged** spot
trading — buying and selling outright at full value, with no leverage, no margin,
no borrowing, and no funding — is the MetaFlux product generally regarded as
compatible with Islamic (Sharia) finance principles. The non-compliant products
explicitly include **spot margin (leveraged spot trading)** alongside perpetual
futures and every other leveraged or derivative product — the leverage and
borrowing introduce interest (riba), speculation, and uncertainty (maysir,
gharar). See [Spot trading](../products/spot.md). Informational, not religious or
financial advice.
:::

## Advanced {#advanced}

- [ADL](./adl.md) — T4 auto-deleverage math
- [Multi-sig](./multi-sig.md) — institutional M-of-N
- [Vaults](./vaults.md) — MFlux Vault + user vaults
- [Staking](./staking.md) — delegate MTF, earn rewards
- [RFQ](./rfq.md) — request-for-quote for size
- [FBA](./fba.md) — frequent batch auction matching

## Reference {#reference}

- [System addresses](./system-addresses.md) — the protocol's reserved keyless addresses
- [Glossary](./glossary.md) — every protocol-specific term defined
