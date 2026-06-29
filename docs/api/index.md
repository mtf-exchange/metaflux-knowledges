---
description: REST and WebSocket surface — the MTF-native protocol, backed by the chain.
---

# API Reference

One MTF-native protocol, served by the gateway front door
(`https://<net>-gateway.mtf.exchange`).

| Surface | Where | Notes |
|---------|-------|-------|
| **MTF-native** | `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Compact snake_case shape. Exposes everything, including advanced MTF features (RFQ, FBA, PM enrollment, cross-chain). |

> The gateway is the front door for the MTF-native surface
> (`/info`, `/exchange`, `/ws`). Running the node yourself? It serves the same
> native surface directly at `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native; full action catalog
- [`POST /info`](./rest/info.md) — MTF-native; per-type schemas

## WebSocket

- [WS protocol](./ws/index.md) — connection lifecycle, frames, auth, resume
- [Subscriptions](./ws/subscriptions.md) — full channel catalog

## Cross-cutting

- [Errors](./errors.md) — complete error catalog with remediation
- [Rate limits](./rate-limits.md) — per-IP weight + per-account QPS budgets

## See also

- [Integration quickstart](../integration/quickstart.md) — 5-minute end-to-end
- [Signing walkthrough](../integration/signing.md) — EIP-712 envelope
- [Networks](../networks.md) — endpoints per network
