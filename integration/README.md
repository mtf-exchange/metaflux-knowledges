---
description: Bring a client up against MetaFlux — SDKs, signing, migration, idempotency, error handling.
icon: code
---

# Integration

How to connect a client to MetaFlux. Pick the path that matches your starting point.

## Starting points

| If you're starting from… | Go to |
|--------------------------|-------|
| Nothing — just want to try it | [Quickstart](./quickstart.md) |
| An existing Hyperliquid bot / tool | [Migrating from Hyperliquid](./migrating-from-hl.md) |
| A CCXT-based quant framework | [CCXT integration](../api/rest/ccxt-compat.md) |
| Greenfield TypeScript / browser | [TypeScript SDK](./typescript-sdk.md) |
| Greenfield Rust service | [Rust SDK](./rust-sdk.md) |
| Anything else (Python, Go, …) | [Signing walkthrough](./signing.md) — implement the EIP-712 envelope yourself |

## Topics

- [Quickstart](./quickstart.md) — 5-minute end-to-end (deposit → trade → withdraw)
- [Signing walkthrough](./signing.md) — EIP-712 envelope end-to-end with working examples
- [Agent wallets howto](./agent-wallets-howto.md) — concrete code for the hot-key pattern
- [Idempotency](./idempotency.md) — nonce strategy + safe retry
- [Error handling](./error-handling.md) — admission vs commit vs network decision tree
- [Risk-watcher pattern](./risk-watcher.md) — automated margin top-up
- [Migrating from Hyperliquid](./migrating-from-hl.md) — drop-in for HL bots

## SDKs

| Language | Status | Package |
|----------|--------|---------|
| TypeScript / JavaScript | preview | [`@metaflux/sdk`](./typescript-sdk.md) |
| Rust | preview | [`metaflux-client`](./rust-sdk.md) |

For other languages (Python, Go, Java, C++ …), implement the EIP-712 envelope per the [signing walkthrough](./signing.md) — every step is documented with worked examples. The wire is small enough that a hand-rolled client is the right call for niche stacks.

## Network endpoints

See [networks](../networks.md) for the full per-network reference.

| Endpoint | Default port (devnet) | Purpose |
|----------|----------------------|---------|
| Gateway REST | `8443` | Multi-protocol adapter (HL-compat + CCXT-compat + MTF-native) |
| Gateway WS | `8443/ws` | Subscriptions |
| Node API (MTF-native) | `8080` | `/info` · `/exchange` · `/ws` · `/faucet` (devnet/testnet `POST /faucet` test tap — same origin, not a separate port) |

Production deployments terminate TLS at the gateway and front it with a CDN; node REST is intentionally not internet-facing in production.

## Common patterns

- **Maker bot** — agent-signed, persistent quoting, risk-watcher sidecar, ALO orders for guaranteed-maker tier
- **Liquidation watcher** — WS subscriber on `marginEvents` + `userEvents` (`yellowCard`); fires top-ups before T1
- **TWAP wrapper** — submits `TwapOrder`, watches `twapEvents` for slice telemetry, optional manual cancel mid-run
- **Vault manager** — `VaultDeploy` once, then agent-signed Orders for the vault address as you re-balance
- **Institutional custody** — multi-sig master + per-host agents + multi-sig wrapping for high-value flows
