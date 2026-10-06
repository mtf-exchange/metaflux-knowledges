---
title: Overview
description: Integration reference, API surface, and core concepts for the MetaFlux derivatives exchange.
slug: /
---

# MetaFlux Knowledge Base

This site documents the MetaFlux API, its markets and the protocol behind them.

To place a first order on testnet, follow the [quickstart](./integration/quickstart.md). It takes about 5 minutes and covers a deposit, an order and a withdrawal.

To move a bot from another perps DEX, read [Migrating from HL](./integration/migrating-from-hl.md). It switches the bot to the MTF-native SDK and API.

To deploy a market on-chain, read [MIP-3 permissionless market deploy](./mip/mip-3.md).

## Explore {#explore}

- [Architecture](./concepts/architecture.md): the MetaFlux Core components and what each does.
- [API reference](./api/): REST `/exchange` and `/info`, WebSocket, errors and rate limits.
- [Concepts](./concepts/): margin, tiered liquidation, order types, funding, vaults and fees.
- [Integration](./integration/): quickstart, signing, idempotency, error handling and SDKs.
- [EVM](./evm/): execution model, Core and EVM transfers, precompiles.
- [Improvement proposals](./mip/): spot and perp deploy, metaliquidity and earn.
- [Bridge](./bridge/): validator-signed asset bridging.
- [Glossary](./concepts/glossary.md): every term in one list.

## Conventions {#conventions}

- The endpoints documented here are the stable, public wire surface.
- Request and response examples use real shapes.
- Price and size fields are fixed-point integers with an 8-decimal scale. USDC amounts are 6-decimal base units. Both travel as JSON strings, which avoids IEEE-754 precision loss.
- All `_ts` and `_ms` fields are unix milliseconds. They are derived from consensus.

## Status legend {#status-legend}

Each page carries a "Status" tag at the top:

- stable: the V1 wire shape is committed. You can build against it.
- preview: the page works today. Minor wire changes are possible before mainnet, and the page calls them out.
- planned: the page describes a feature that has not shipped.

See [versioning](./versioning.md) for the change-control policy.
