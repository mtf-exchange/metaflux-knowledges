---
description: The REST and WebSocket API of MetaFlux. It uses the MTF-native protocol and the chain serves it.
---

# API reference

The MetaFlux API is one MTF-native protocol. The gateway serves it at
`https://api.<net>.mtf.exchange`.

| Surface | Where | Notes |
|---------|-------|-------|
| **MTF-native** | `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Compact snake_case shape. It exposes all features, including the advanced MTF features (RFQ, FBA, PM enrollment, cross-chain). |

The gateway serves the MTF-native surface (`/info`, `/exchange`, `/ws`). A
node that you run yourself serves the same native surface directly at
`http://localhost:8080`.

## Common tasks {#start-here}

| Task | Page |
|---|---|
| Make a first call | [Quickstart](../integration/quickstart.md) |
| Place an order | [`submit_order`](./rest/exchange/orders.md#submit_order), then [placing orders](../integration/placing-orders.md) |
| Sign a request | [Signing](../integration/signing.md) and [typed data](../integration/typed-data-signing.md) |
| Read an account | [`account_state`](./rest/info/account.md#account_state) |
| Stream the book or your fills | [WS subscriptions](./ws/subscriptions.md) |
| Find the fields of one action | [The action catalog](./rest/exchange.md#action-catalog) |
| Find why a request was refused | [Errors](./errors.md) |
| Use a client library | [TypeScript](../integration/typescript-sdk.md) and [Rust](../integration/rust-sdk.md) |

## REST {#rest}

- [`POST /exchange`](./rest/exchange.md): the envelope, signing and the action
  catalog. The fields of each action are on the page of its lane. The catalog
  links to each page.
- [`POST /info`](./rest/info.md): the schema of each read type

## WebSocket {#websocket}

- [WS protocol](./ws/index.md): connection lifecycle, frames, auth and resume
- [Subscriptions](./ws/subscriptions.md): the full channel catalog

## Shared topics {#cross-cutting}

- [Errors](./errors.md): the response envelope, every error code and the action for each code
- [Rate limits](./rate-limits.md): the weight budget for each IP and the request budget for each account

## See also {#see-also}

- [Integration quickstart](../integration/quickstart.md): a 5-minute flow from start to end
- [Signing walkthrough](../integration/signing.md): the EIP-712 envelope
- [Networks](../networks.md): the endpoints of each network
- [Changelog](../changelog/index.md): what changed and at which block. Only an existing client needs it
