# API Reference

Three protocol families, deliberately separate so the choice of client wire shape doesn't constrain anything else.

| Family | Where | Use when |
|--------|-------|----------|
| **MTF-native** | Gateway `/exchange`, `/info`, `/native/*` | New clients. Compact snake_case shape. Exposes everything, including MTF differentiation features (RFQ, FBA, PM enrollment, cross-chain). |
| **HL-compat** | Gateway `/exchange`, `/info` (default routing) | Bringing an existing Hyperliquid client over. URL + JSON shapes match HL exactly. Zero code change for `order`, `cancel` (more variants ship over time). |
| **CCXT-compat** | Gateway `/ccxt/*` | Quant frameworks already speaking CCXT. Minimal REST subset live; CCXT Pro WS coming. |

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native; full action catalog
- [`POST /info`](./rest/info.md) — MTF-native; per-type schemas
- [HL-compat](./rest/hl-compat.md) — mirror of Hyperliquid's wire
- [CCXT-compat](./rest/ccxt-compat.md) — CCXT REST methods

## WebSocket

- [WS protocol](./ws/README.md) — connection lifecycle, frames, auth, resume
- [Subscriptions](./ws/subscriptions.md) — full channel catalog

## Cross-cutting

- [Errors](./errors.md) — complete error catalog with remediation
- [Rate limits](./rate-limits.md) — per-IP weight + per-account QPS budgets

## See also

- [Integration quickstart](../integration/quickstart.md) — 5-minute end-to-end
- [Signing walkthrough](../integration/signing.md) — EIP-712 envelope
- [Networks](../networks.md) — endpoints per network
