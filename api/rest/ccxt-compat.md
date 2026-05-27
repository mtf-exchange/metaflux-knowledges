# CCXT-compat REST surface

> Status: **preview**. Minimal subset of CCXT REST is live; CCXT Pro WS coming.

For quant frameworks already speaking the [CCXT](https://github.com/ccxt/ccxt) wire — bring them over by pointing the exchange URL at MetaFlux's gateway. The wire shape matches CCXT's expectations for the supported methods.

## URL

```
https://<gateway>/ccxt/<method>
```

Default port `8443` on devnet.

## Supported methods (REST)

| Method | URL | Status |
|--------|-----|--------|
| `fetchMarkets` | `GET  /ccxt/markets` | ✅ live |
| `fetchTicker` | `GET  /ccxt/ticker?symbol=...` | ✅ live |
| `fetchOrderBook` | `GET  /ccxt/orderbook?symbol=...&limit=...` | ✅ live |
| `fetchOHLCV` | `GET  /ccxt/ohlcv?symbol=...&timeframe=1m&since=...&limit=...` | ⏳ shape live, returns empty bars |
| `fetchBalance` | `GET  /ccxt/balance` (auth required) | ✅ live |
| `fetchPositions` | `GET  /ccxt/positions` (auth required) | ✅ live |
| `fetchMyTrades` | `GET  /ccxt/myTrades` (auth required) | ✅ live |
| `createOrder` | `POST /ccxt/orders` (auth required) | ✅ live |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` (auth required) | ✅ live |

## Symbol format

CCXT uses `"BASE/QUOTE:SETTLE"` for derivatives. MetaFlux markets render as:

```
BTC/USDC:USDC
ETH/USDC:USDC
```

(Spot markets use `"BASE/QUOTE"` without the `:SETTLE` suffix.)

`fetchMarkets` returns the full list with all per-market fields CCXT expects (precision, limits, fees, contract size, etc.).

## Timeframes

`fetchOHLCV` accepts CCXT's standard set: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. Invalid timeframes return HTTP 400.

## Authentication

Authenticated methods require either:

- **API key + secret** — header-based, CCXT-standard. The gateway holds the wallet mapping; no per-request EIP-712.
- **Wallet signing** — EIP-712 envelope per [signing walkthrough](../../integration/signing.md); set the CCXT `walletAddress` parameter.

CCXT clients with built-in HMAC signing should use the API key path. Wallet-signing is for clients that want to retain end-to-end ownership of the private key.

## CCXT Pro (WebSocket)

Coming. Channel coverage will mirror the REST methods:

- `watchTicker`
- `watchOrderBook`
- `watchTrades`
- `watchMyTrades`
- `watchOrders`
- `watchPositions`

## Limitations vs full CCXT spec

- `fetchOHLCV` currently returns an empty bar array. The OHLCV indexer is a separate service in progress.
- CCXT's optional methods (`fetchClosedOrders`, `fetchOpenOrders`, `fetchOrder`, `fetchOrders`, etc.) are not yet wired. Use the [HL-compat](./hl-compat.md) `/info` shape (`openOrders`, `userFills`, `historicalOrders`) for richer order history.
- `fetchFundingHistory` and `fetchFundingRate` follow OHLCV's schedule.

## See also

- [HL-compat](./hl-compat.md) — alternative for HL-style clients
- [`POST /exchange`](./exchange.md) — MTF-native
- [Migrating from Hyperliquid](../../integration/migrating-from-hl.md)
