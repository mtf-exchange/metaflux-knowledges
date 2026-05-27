# Integration

How to actually connect a client to MetaFlux. Pick the path that matches your starting point.

## Paths

| If you're starting from… | Go to |
|--------------------------|-------|
| An existing Hyperliquid bot or tool | [Migrating from Hyperliquid](./migrating-from-hl.md) |
| A CCXT-based quant framework | [CCXT integration](./ccxt.md) (coming) |
| Greenfield TypeScript / browser app | [TypeScript SDK](./typescript-sdk.md) (coming) |
| Greenfield Rust service | [Rust SDK](./rust-sdk.md) (coming) |
| Anything that already speaks EIP-712 | [Signing walkthrough](./signing.md) |

## Topics

- [Signing walkthrough](./signing.md) — the EIP-712 envelope end-to-end with a working example
- [Agent wallets in practice](./agent-wallets-howto.md) — concrete code for the hot-key pattern (coming)
- [Error handling](./errors.md) — admission rejections vs commit failures vs network errors (coming)

## Network endpoints

| Endpoint | Default port (devnet) | Purpose |
|----------|----------------------|---------|
| Node REST (`POST /exchange`, `POST /info`) | `8080` | MTF-native, talks directly to a validator |
| Gateway REST | `8443` | Multi-protocol adapter (HL-compat + CCXT-compat + MTF-native) |
| Gateway WS | `8443/ws` | Subscriptions (coming) |
| Prometheus metrics | `9100` | Operator-only |

Production deployments terminate TLS at the gateway and front it with a CDN; node REST is intentionally not internet-facing in production.
