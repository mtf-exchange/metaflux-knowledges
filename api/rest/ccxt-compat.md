# CCXT-compat REST surface

{% hint style="info" %}
**Preview.** A **9-method REST subset** is mounted today, each returning the exact [CCXT](https://docs.ccxt.com/) unified shape. **Symbol parsing, market lookup, and JWT auth are real**; monetary fields are stubbed (`"0.0"` / empty arrays / `0` ids) until the gateway → node read backhaul and the [indexer](../data-files.md) land. CCXT Pro (WS) is coming.
{% endhint %}

## TL;DR

For quant frameworks that already speak the CCXT wire — point the exchange's base URL at MetaFlux's gateway. The wire shape matches CCXT's expectations for the supported methods. Use this if you already have a CCXT integration; for new clients start with [HL-compat](./hl-compat.md) or [MTF-native](./exchange.md).

Like [HL-compat](./hl-compat.md), this surface lives **only on the gateway** — it translates the MTF-native node reads into CCXT's unified shapes. The node itself is MTF-native (see [`/info`](./info.md)); CCXT shapes never touch the node.

## URL

```
https://<gateway>/ccxt/<path>
```

All CCXT routes are mounted under the `/ccxt/` prefix (disambiguates from the MTF-native default `/info` + `/exchange` surface and the HL-compat `/hl/*` surface). A request to an un-prefixed path (`/markets`) returns 404 — the prefix is load-bearing.

## CCXT method → route → MTF-native node read

The 9 REST methods that ship today, plus the auth bootstrap. **Translation** is CCXT-unified-shape ← node MTF-native: snake_case → CCXT camelCase, `u32` market id → CCXT `BASE/QUOTE:SETTLE` symbol, integer magnitudes → decimal strings.

| CCXT method | Route | Auth | Status | Node MTF-native source |
|-------------|-------|------|--------|------------------------|
| `fetchMarkets` | `GET /ccxt/markets` | no | shape live; static genesis fixture | [`markets`](./info.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | no | shape live; prices stubbed | [`market_info`](./info.md#market_info) + mid |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | no | shape live; empty book | [`l2_book`](./info.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | no | 🚧 indexer | [indexer](../data-files.md) ← `node_trades` |
| `createOrder` | `POST /ccxt/orders` | Bearer | shape live | → [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | shape live | → [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | shape live; balances stubbed | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | shape live; positions stubbed | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | 🚧 indexer | [indexer](../data-files.md) ← `node_fills` |
| — auth bootstrap — | `POST /ccxt/auth` | no | real | EIP-712 login → JWT |

Legend: **shape live** = route mounted, CCXT-correct shape returned, monetary fields are stubs awaiting the read backhaul · 🚧 indexer = served once the [data-file indexer](../data-files.md) lands.

{% hint style="warning" %}
**Surface is deliberately minimal.** Methods CCXT defines but the gateway does **not** mount yet — `fetchTickers`, `fetchTrades` (public tape), `fetchOrder`, `fetchOpenOrders`, `fetchClosedOrders`, `fetchOHLCV` beyond the stub, `setLeverage`, `setMarginMode`, `fetchFundingRate`, `cancelAllOrders` — return 404. They attach under `/ccxt/` as the read backhaul + indexer expand. `fetchOpenOrders` / `fetchOrder` will translate from the node [`open_orders`](./info.md#open_orders) read; `fetchTrades` / `fetchOHLCV` / `fetchMyTrades` / `fetchClosedOrders` are indexer-backed.
{% endhint %}

## Symbol format

CCXT uses `"BASE/QUOTE:SETTLE"` for derivatives. MetaFlux perp markets render:

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

Spot markets (once a spot universe lands) use `"BASE/QUOTE"` without the `:SETTLE` suffix. The market registry today is a **static genesis fixture** (`with_genesis_markets` — the genesis perps); a gRPC-backed registry that refreshes from the node's [`markets`](./info.md#markets) read swaps in with the read backhaul. Symbol parsing is **real**: malformed symbols → 400, unknown symbols → 400.

## Timeframes

`fetchOHLCV` accepts CCXT's standard tokens: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. Invalid timeframes return 400. Bars are 🚧 indexer-backed — shape-correct empty until the indexer lands; use the WS [`candle`](../ws/subscriptions.md) channel for live data.

## Authentication

Authenticated methods (`createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`) require a **JWT Bearer token**. There is **one** auth scheme — JWT minted from an EIP-712 login envelope. (No HMAC `X-API-KEY` scheme.)

### 1. Login — `POST /ccxt/auth`

Post an EIP-712-signed login envelope; receive a session JWT. The envelope mirrors the node's `SignedEnvelope` — the gateway re-derives the EIP-712 digest over `(address, nonce, expiry)` and verifies the signature, then mints an HS256 JWT whose `sub` is the address.

```bash
curl -X POST https://gateway/ccxt/auth \
  -H 'content-type: application/json' \
  -d '{
    "address":   "0x<addr>",
    "nonce":     1735689600000,
    "expiry":    1735689660000,
    "signature": "<base64 65-byte r||s||v>"
  }'
```

```json
{ "token": "<jwt>", "expiresAt": 1735693200 }
```

| Envelope field | Type | Notes |
|----------------|------|-------|
| `address` | `0x` hex | EVM address claiming login |
| `nonce` | u64 | Replay-protection nonce (verified at the node layer; the JWT is the session token) |
| `expiry` | u64 ms | Envelope rejected past this |
| `signature` | base64 | 65-byte `r‖s‖v` (EVM convention), base64-encoded |

See the [signing walkthrough](../../integration/signing.md) for the EIP-712 digest construction.

### 2. Call — `Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

Missing / expired / wrong-signature tokens are rejected `401`. The JWT's `sub` address scopes every authenticated read/write to that account.

## Examples

### Fetch markets

```bash
curl https://gateway/ccxt/markets
```

```json
[
  {
    "id":           "BTC-PERP",
    "symbol":       "BTC/USDC:USDC",
    "base":         "BTC",
    "quote":        "USDC",
    "settle":       "USDC",
    "type":         "swap",
    "swap":         true,
    "spot":         false,
    "linear":       true,
    "contract":     true,
    "contractSize": 1,
    "precision":    { "price": 8, "amount": 8 },
    "limits":       { "amount": { "min": 0.0001 }, "price": { "min": 0.01 } },
    "maker":        0.0002,
    "taker":        0.0005,
    "active":       true
  }
]
```

### Fetch ticker

```bash
curl 'https://gateway/ccxt/ticker?symbol=BTC/USDC:USDC'
```

```json
{
  "symbol":      "BTC/USDC:USDC",
  "bid":         "0.0",
  "ask":         "0.0",
  "last":        "0.0",
  "high":        "0.0",
  "low":         "0.0",
  "open":        "0.0",
  "close":       "0.0",
  "baseVolume":  "0.0",
  "quoteVolume": "0.0"
}
```

Monetary fields are `"0.0"` stubs today; the read backhaul fills them from the node mid / [`market_info`](./info.md#market_info). The CCXT shape is byte-correct so clients deserialize cleanly now and get real numbers transparently later.

### Fetch order book

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` are `[[price, amount], …]` arrays (CCXT shape). `limit` truncation applies once real levels land from [`l2_book`](./info.md#l2_book).

### Place an order

```bash
curl -X POST https://gateway/ccxt/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "symbol": "BTC/USDC:USDC",
    "type":   "limit",
    "side":   "buy",
    "amount": "1.0",
    "price":  "100.5",
    "params": { "timeInForce": "GTC", "reduceOnly": false }
  }'
```

Response (CCXT order object):

```json
{
  "id":            "12345",
  "clientOrderId": null,
  "symbol":        "BTC/USDC:USDC",
  "type":          "limit",
  "side":          "buy",
  "price":         100.5,
  "amount":        1.0,
  "filled":        0.0,
  "remaining":     1.0,
  "status":        "open",
  "timestamp":     1735689600000,
  "fee":           { "currency": "USDC", "cost": 0.0 },
  "info":          { /* raw chain response */ }
}
```

`createOrder` translates the CCXT order into an [`/exchange`](./exchange.md) write under the JWT's `sub` account.

### Cancel an order

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## Errors

CCXT-compat returns proper HTTP status codes (not HL's 200-with-`status` convention), with CCXT-named error bodies so client SDKs route them into the right exception class:

| HTTP | Body | Cause |
|------|------|-------|
| 400 | `{"error":"<message>"}` | Malformed/unknown symbol, bad params, bad timeframe |
| 401 | `{"error":"<message>"}` | Missing / expired / wrong-signature Bearer token |
| 404 | — | Unknown route / un-prefixed path / unmounted method |

## CCXT Pro (WebSocket) — planned

A 5-channel WS upgrade (`GET /ccxt/ws`) is scaffolded; full coverage mirrors REST:

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

See [WS subscriptions](../ws/subscriptions.md) for the underlying channels — CCXT Pro translates these one-to-one.

## Limitations vs full CCXT spec

- **Monetary fields are stubs** (`"0.0"` / empty arrays / `0` ids) on every shape-live method until the gateway → node read backhaul lands. The shape is final; only the values are pending.
- **Historical methods** (`fetchOHLCV`, `fetchMyTrades`, and the future `fetchTrades` / `fetchClosedOrders`) are 🚧 **indexer-backed** — served from the [node data-file](../data-files.md) indexer (`node_trades` / `node_fills` / `node_order_statuses`), not the live node. Use the WS [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md) channels for live data meanwhile.
- **No HMAC API-key auth.** Only the EIP-712 → JWT scheme above. Clients retain key custody — the gateway escrows no secret.

## See also

- [HL-compat](./hl-compat.md) — the other compat surface
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md) — MTF-native (what these translate from)
- [Node data files](../data-files.md) — the indexer feedstock behind the 🚧 methods
- [WS subscriptions](../ws/subscriptions.md) — CCXT Pro underlying
- [Signing walkthrough](../../integration/signing.md) — EIP-712 login envelope
- [Rate limits](../rate-limits.md)
