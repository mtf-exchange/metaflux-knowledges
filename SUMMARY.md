# Table of contents

* [MetaFlux Knowledge Base](README.md)

## Getting started

* [Networks & chain IDs](networks.md)
* [Security model](security.md)
* [Versioning & deprecation](versioning.md)

## Concepts

* [Overview](concepts/README.md)
* Trading
  * [Order types](concepts/order-types.md)
  * [FBA — frequent batch auctions](concepts/fba.md)
  * [RFQ](concepts/rfq.md)
  * [Fees](concepts/fees.md)
  * [Funding rates](concepts/funding-rates.md)
  * [Mark prices](concepts/mark-prices.md)
* Margin & risk
  * [Margin modes](concepts/margin-modes.md)
  * [Hedge mode (two-way positions)](concepts/hedge-mode.md)
  * [Portfolio margin](concepts/portfolio-margin.md)
  * [Tiered liquidation](concepts/tiered-liquidation.md)
  * [ADL — auto-deleveraging](concepts/adl.md)
* Spot & earn
  * [Spot margin](concepts/spot-margin.md)
  * [Earn](concepts/earn.md)
* Account & access
  * [Sub-accounts](concepts/sub-accounts.md)
  * [Agent wallets](concepts/agent-wallets.md)
  * [Multi-sig](concepts/multi-sig.md)
  * [Staking](concepts/staking.md)
  * [Vaults](concepts/vaults.md)
* [Glossary](concepts/glossary.md)

## Bridge

* [Overview](bridge/README.md)

## Improvement proposals

* [Overview](mip/README.md)
* [MIP-1 — Spot token standard + market deploy](mip/mip-1.md)
* [MIP-2 — Metaliquidity](mip/mip-2.md)
* [MIP-3 — Permissionless perp market deploy](mip/mip-3.md)
* [MIP-4 — Perps liquidity aggregator / internalizer](mip/mip-4.md)
* [MIP-5 — Reserved](mip/mip-5.md)
* [MIP-6 — Outcomes / prediction markets (deferred V3)](mip/mip-6.md)

## For developers

* [API](api/README.md)
  * REST
    * [POST /exchange](api/rest/exchange.md)
    * [POST /info](api/rest/info.md)
    * [POST /faucet](api/rest/faucet.md)
    * [HL-compat](api/rest/hl-compat.md)
    * [CCXT-compat](api/rest/ccxt-compat.md)
  * WebSocket
    * [Overview](api/ws/README.md)
    * [Subscriptions](api/ws/subscriptions.md)
  * Reference
    * [Node data files](api/data-files.md)
    * [Errors](api/errors.md)
    * [Rate limits](api/rate-limits.md)
* [EVM](evm/README.md)
  * [Execution model](evm/execution-model.md)
  * [Interacting with Core](evm/interacting-with-core.md)
  * [Core ↔ EVM transfers](evm/core-evm-transfers.md)
  * [Interaction timings](evm/interaction-timings.md)
* [Integration](integration/README.md)
  * [Quickstart](integration/quickstart.md)
  * [Signing walkthrough](integration/signing.md)
  * [Agent wallets how-to](integration/agent-wallets-howto.md)
  * [Idempotency](integration/idempotency.md)
  * [Error handling](integration/error-handling.md)
  * [Risk-watcher pattern](integration/risk-watcher.md)
  * [Migrating from Hyperliquid](integration/migrating-from-hl.md)
  * SDKs
    * [TypeScript SDK](integration/typescript-sdk.md)
    * [Rust SDK](integration/rust-sdk.md)
