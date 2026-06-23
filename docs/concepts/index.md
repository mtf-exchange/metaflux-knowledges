---
description: Core mechanisms — agent wallets, margin, liquidation, order types, vaults, fees, and the glossary.
---

# Concepts

Plain-language explanations of MetaFlux's core mechanisms — what they do, how to use them, and what to expect under stress.

## Read order for integrators

1. [Agent wallets](./agent-wallets.md) — hot-key delegation, the standard market-maker setup
2. [Order types](./order-types.md) — TIF, STP, triggers, TWAP, scale
3. [Margin modes](./margin-modes.md) — Cross / Isolated / Strict-Iso
4. [Mark prices](./mark-prices.md) — what drives margin, liquidation, triggers
5. [Tiered liquidation](./tiered-liquidation.md) — T0 yellow card → T4 ADL
6. [Funding rates](./funding-rates.md) — hourly user-to-user payment
7. [Fees](./fees.md) — maker/taker tiers + burn
8. [Sub-accounts](./sub-accounts.md) — strategy / risk isolation
9. [Portfolio margin](./portfolio-margin.md) — cross-asset SPAN-like margin

## Spot & earn

- [Spot trading](./spot-trading.md) — **live**: token-for-token CLOB, reserved-balance escrow, no leverage
- [Spot margin](./spot-margin.md) — **planned**: leveraged spot funded by the Earn pool
- [Earn](./earn.md) — **planned**: USDC lending pool that funds spot-margin borrows

## Advanced

- [ADL](./adl.md) — T4 auto-deleverage math
- [Multi-sig](./multi-sig.md) — institutional M-of-N
- [Vaults](./vaults.md) — MFlux Vault + user vaults
- [Staking](./staking.md) — delegate MTF, earn rewards
- [RFQ](./rfq.md) — request-for-quote for size
- [FBA](./fba.md) — frequent batch auction matching

## Reference

- [Glossary](./glossary.md) — every protocol-specific term defined
