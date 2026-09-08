---
description: REST and WebSocket surface — the MTF-native protocol, backed by the chain.
---

# API Reference

One MTF-native protocol, served by the gateway front door
(`https://api.<net>.mtf.exchange`).

| Surface | Where | Notes |
|---------|-------|-------|
| **MTF-native** | `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Compact snake_case shape. Exposes everything, including advanced MTF features (RFQ, FBA, PM enrollment, cross-chain). |

> The gateway is the front door for the MTF-native surface
> (`/info`, `/exchange`, `/ws`). Running the node yourself? It serves the same
> native surface directly at `http://localhost:8080`.

## Start here {#start-here}

| I want to… | Go to |
|---|---|
| make my first call in five minutes | [Quickstart](../integration/quickstart.md) |
| place an order | [`submit_order`](./rest/exchange/orders.md#submit_order), then [placing orders](../integration/placing-orders.md) |
| sign a request | [Signing](../integration/signing.md) · [typed data](../integration/typed-data-signing.md) |
| read an account | [`account_state`](./rest/info/account.md#account_state) |
| stream the book or my fills | [WS subscriptions](./ws/subscriptions.md) |
| find one action's fields | [the action catalog](./rest/exchange.md#action-catalog) |
| know why a request was refused | [Errors](./errors.md) |
| use a client library | [TypeScript](../integration/typescript-sdk.md) · [Rust](../integration/rust-sdk.md) |

## REST {#rest}

- [`POST /exchange`](./rest/exchange.md) — the envelope, signing, and the action
  catalog. Each action's fields live on its lane's page, linked from the catalog.
- [`POST /info`](./rest/info.md) — per-type read schemas

## WebSocket {#websocket}

- [WS protocol](./ws/index.md) — connection lifecycle, frames, auth, resume
- [Subscriptions](./ws/subscriptions.md) — full channel catalog

## Cross-cutting {#cross-cutting}

- [Errors](./errors.md) — the one response envelope, every error code, and what to do about each
- [Rate limits](./rate-limits.md) — per-IP weight + per-account request budgets

## See also {#see-also}

- [Integration quickstart](../integration/quickstart.md) — 5-minute end-to-end
- [Signing walkthrough](../integration/signing.md) — EIP-712 envelope
- [Networks](../networks.md) — endpoints per network
- [Changelog](../changelog/index.md) — what changed and at which block. Only needed for an existing client
