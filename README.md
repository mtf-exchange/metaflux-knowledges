---
description: Integration reference, API surface, and core concepts for the MetaFlux derivatives exchange.
cover: .gitbook/assets/cover.svg
coverY: 0
layout:
  cover:
    visible: true
    size: full
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---

# MetaFlux Knowledge Base

Welcome. Start here if you are **integrating with** or **building on** MetaFlux.

{% hint style="info" %}
**New?** Start with the [Quickstart](./integration/quickstart.md) (5 minutes, deposit → trade → withdraw).
**Migrating from another perps DEX?** Jump to [Migrating from HL](./integration/migrating-from-hl.md) — the patterns translate to other HL-compatible bots.
**Building on-chain?** See [MIP-3 permissionless market deploy](./mip/mip-3.md).
{% endhint %}

## Quick links

- [Quickstart](./integration/quickstart.md) — 5-minute end-to-end
- [Migrating from HL](./integration/migrating-from-hl.md) — drop-in for HL bots
- [`POST /exchange`](./api/rest/exchange.md) — write path with full action catalog
- [`POST /info`](./api/rest/info.md) — read path
- [Tiered liquidation](./concepts/tiered-liquidation.md) — T0 yellow card → T4 ADL ladder
- [Portfolio margin](./concepts/portfolio-margin.md) — cross-asset SPAN-like margin
- [Glossary](./concepts/glossary.md)

## Sections

### [API reference](./api/)

- [REST `/exchange`](./api/rest/exchange.md) — MTF-native write path
- [REST `/info`](./api/rest/info.md) — MTF-native read path
- [REST HL-compat](./api/rest/hl-compat.md) — `/info` + `/exchange` mirroring HL's wire
- [REST CCXT-compat](./api/rest/ccxt-compat.md) — CCXT REST methods
- [WS](./api/ws/README.md) — connection lifecycle + [subscriptions](./api/ws/subscriptions.md)
- [Errors](./api/errors.md) — complete error catalog
- [Rate limits](./api/rate-limits.md) — per-IP + per-account budgets

### [Concepts](./concepts/)

Foundations for users and bot operators:

- [Agent wallets](./concepts/agent-wallets.md) — hot-key delegation
- [Order types](./concepts/order-types.md) — TIF, STP, triggers, TWAP, scale
- [Margin modes](./concepts/margin-modes.md) — Cross / Isolated / Strict-Iso
- [Tiered liquidation](./concepts/tiered-liquidation.md) — T0 → T4
- [Portfolio margin](./concepts/portfolio-margin.md)
- [Mark prices](./concepts/mark-prices.md)
- [Funding rates](./concepts/funding-rates.md)
- [Fees](./concepts/fees.md)
- [Sub-accounts](./concepts/sub-accounts.md)
- [Multi-sig](./concepts/multi-sig.md)
- [ADL](./concepts/adl.md) — T4 auto-deleverage
- [RFQ](./concepts/rfq.md) — request-for-quote
- [FBA](./concepts/fba.md) — frequent batch auction
- [Vaults](./concepts/vaults.md) — MFlux + user vaults
- [Staking](./concepts/staking.md)
- [Glossary](./concepts/glossary.md)

### [Integration](./integration/)

For developers building on MetaFlux:

- [Quickstart](./integration/quickstart.md)
- [Signing walkthrough](./integration/signing.md)
- [Agent wallets howto](./integration/agent-wallets-howto.md)
- [Idempotency](./integration/idempotency.md)
- [Error handling](./integration/error-handling.md)
- [Risk-watcher pattern](./integration/risk-watcher.md)
- [Migrating from HL](./integration/migrating-from-hl.md)
- [TypeScript SDK](./integration/typescript-sdk.md)
- [Rust SDK](./integration/rust-sdk.md)

### [MIP](./mip/)

Protocol improvement proposals:

- [MIP-3](./mip/mip-3.md) — permissionless market deploy

### [Bridge](./bridge/)

Asset bridging:

- [USDC via MetaBridge custody bridge](./bridge/) — validator-signed, not Circle CCTP
- Other assets via [MetaBridge](./bridge/) — MetaFlux validator-signed bridge (Solana / Base / Arbitrum)

### Top-level

- [Networks](./networks.md) — devnet / testnet / mainnet endpoints + chainIds
- [Versioning](./versioning.md) — wire-shape change policy
- [Security](./security.md) — trust surface + disclosure policy

## Conventions

- Endpoints documented here are the **stable, public** wire surface.
- Request / response examples use real shapes — copy-paste safe.
- Price and size fields are fixed-point integers (8-decimal scale); USDC amounts are 6-decimal base units. Both are transmitted as JSON strings to avoid IEEE-754 precision loss.
- All times in `_ts` / `_ms` fields are unix milliseconds (consensus-derived).

## Status legend

Each doc carries a "Status" tag at the top:

- **stable** — wire shape committed for V1; safe to build against.
- **preview** — works today; minor wire changes possible before mainnet (called out).
- **planned** — described, not yet shipped.

See [versioning](./versioning.md) for the change-control policy.
