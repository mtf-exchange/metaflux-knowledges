---
description: REST and WebSocket surface — three protocol families, all backed by the same chain.
icon: terminal
---

# API Reference

Three protocol families, all served by the same gateway front door
(`https://<net>-gateway.mtf.exchange`) — the choice of client wire shape is just a
choice of path.

| Family | Where | Use when |
|--------|-------|----------|
| **MTF-native** | Gateway **default** path: `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | New clients. Compact snake_case shape. Exposes everything, including MTF differentiation features (RFQ, FBA, PM enrollment, cross-chain). |
| **HL-compat** | Gateway under `/hl/*`: `POST /hl/exchange`, `POST /hl/info`, `GET /hl/ws` | Bringing an existing HL client over. JSON shapes match HL exactly. Zero code change for `order`, `cancel` (more variants ship over time). |
| **CCXT-compat** | Gateway under `/ccxt/*` | Quant frameworks already speaking CCXT. Minimal REST subset live; CCXT Pro WS coming. |

> The gateway is the unified front door — MTF-native is the default path
> (`/info`, `/exchange`), HL-compat is namespaced under `/hl/*`, CCXT under
> `/ccxt/*`. Running the node yourself? It serves the same native surface
> directly at `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native; full action catalog
- [`POST /info`](./rest/info.md) — MTF-native; per-type schemas
- [HL-compat](./rest/hl-compat.md) — mirror of HL's wire
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
