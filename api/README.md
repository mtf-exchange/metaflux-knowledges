# API Reference

Three protocol families, deliberately separate so the choice of client wire shape doesn't constrain anything else.

| Protocol | Where it lives | Use when |
|----------|---------------|----------|
| **MTF-native** | `node:8080` directly, or `gateway/native/*` | Building a new client. Wire shape is small, snake_case, gRPC + REST. Exposes everything the chain does, including MTF differentiation features (RFQ, FBA, portfolio margin enrollment, cross-chain primitives) that other surfaces don't surface. |
| **HL-compat** | `gateway/info`, `gateway/exchange` | Bringing an existing Hyperliquid client over. URL layout + request shapes match HL exactly — zero code change for `order`, `cancel` (more variants ship over time). |
| **CCXT-compat** | `gateway/ccxt/*` | Bringing any quant framework that already speaks CCXT. Minimal subset today: `fetchMarkets`, `fetchTicker`, `fetchOrderBook`, `fetchOHLCV`, `createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`. CCXT Pro WS coming. |

## REST

- [`POST /exchange`](./rest/exchange.md) — submit a signed action (MTF-native)
- `POST /info` — coming
- HL-compat — coming
- CCXT-compat — coming

## WS

Coming. Subscriptions will mirror HL's naming for the compat surface and use a smaller MTF-native subscription protocol for new clients.
