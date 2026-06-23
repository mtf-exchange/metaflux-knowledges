---
description: Integration reference, API surface, and core concepts for the MetaFlux derivatives exchange.
slug: /
---

<img src="/img/og.svg" alt="MetaFlux — derivatives, on first principles" class="hero-banner" />

# MetaFlux Knowledge Base

Welcome. Start here if you are **integrating with** or **building on** MetaFlux.

:::info
**New?** Start with the [Quickstart](./integration/quickstart.md) (5 minutes, deposit → trade → withdraw).
**Migrating from another perps DEX?** Jump to [Migrating from HL](./integration/migrating-from-hl.md) — the patterns translate to other HL-compatible bots.
**Building on-chain?** See [MIP-3 permissionless market deploy](./mip/mip-3.md).
:::

## Explore

<div class="mtf-cardgrid">

- [**API reference**](./api/) — REST `/exchange` · `/info`, HL- & CCXT-compat, WebSocket, errors, rate limits
- [**Concepts**](./concepts/) — margin, tiered liquidation, order types, funding, vaults, fees
- [**Integration**](./integration/) — quickstart, signing, idempotency, error handling, SDKs
- [**EVM**](./evm/) — execution model, Core ↔ EVM transfers, precompiles
- [**Improvement proposals**](./mip/) — spot/perp deploy, metaliquidity, earn
- [**Bridge**](./bridge/) — validator-signed asset bridging

</div>

## Quick links

- [Quickstart](./integration/quickstart.md) — 5-minute deposit → trade → withdraw
- [Migrating from HL](./integration/migrating-from-hl.md) — drop-in for HL-compatible bots
- [`POST /exchange`](./api/rest/exchange.md) — write path + full action catalog
- [`POST /info`](./api/rest/info.md) — read path
- [Tiered liquidation](./concepts/tiered-liquidation.md) — T0 → T4 ladder
- [Glossary](./concepts/glossary.md)

The left sidebar is the exhaustive index; the cards above are the fast way in.

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
