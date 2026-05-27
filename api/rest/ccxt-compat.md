# CCXT-compat REST surface

> Status: **preview**. REST subset live; CCXT Pro (WS) coming.

## TL;DR

For quant frameworks that already speak the [CCXT](https://github.com/ccxt/ccxt) wire — set the exchange URL to MetaFlux's gateway. The wire shape matches CCXT's expectations for the supported methods. Use this if you already have CCXT integration; for new clients start with the [HL-compat](./hl-compat.md) or [MTF-native](./exchange.md) surfaces.

## URL

```
https://<gateway>/ccxt/<method>
```

Default port `8443` on devnet.

## Supported methods (REST)

| Method | URL | Auth | Status |
|--------|-----|------|--------|
| `fetchMarkets` | `GET  /ccxt/markets` | no | live |
| `fetchCurrencies` | `GET  /ccxt/currencies` | no | live |
| `fetchTicker` | `GET  /ccxt/ticker?symbol={S}` | no | live |
| `fetchTickers` | `GET  /ccxt/tickers` | no | live |
| `fetchOrderBook` | `GET  /ccxt/orderbook?symbol={S}&limit={N}` | no | live |
| `fetchOHLCV` | `GET  /ccxt/ohlcv?symbol={S}&timeframe={T}&since={N}&limit={N}` | no | shape live; indexer in progress |
| `fetchTrades` | `GET  /ccxt/trades?symbol={S}&since={N}&limit={N}` | no | live |
| `fetchBalance` | `GET  /ccxt/balance` | yes | live |
| `fetchPositions` | `GET  /ccxt/positions` | yes | live |
| `fetchMyTrades` | `GET  /ccxt/myTrades?symbol={S}&since={N}&limit={N}` | yes | live |
| `fetchOpenOrders` | `GET  /ccxt/openOrders?symbol={S}` | yes | live |
| `fetchOrder` | `GET  /ccxt/orders/{id}` | yes | live |
| `createOrder` | `POST /ccxt/orders` | yes | live |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | yes | live |
| `cancelAllOrders` | `DELETE /ccxt/orders?symbol={S}` | yes | live |
| `fetchFundingRate` | `GET  /ccxt/fundingRate?symbol={S}` | no | live |
| `fetchFundingHistory` | `GET  /ccxt/fundingHistory?symbol={S}` | yes | live |
| `setLeverage` | `POST /ccxt/leverage` body `{symbol, leverage}` | yes | live |
| `setMarginMode` | `POST /ccxt/marginMode` body `{symbol, marginMode}` | yes | live |

CCXT Pro WS coming — see [WS subscriptions](../ws/subscriptions.md) for the underlying channels.

## Symbol format

CCXT uses `"BASE/QUOTE:SETTLE"` for derivatives. MetaFlux markets render:

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

Spot markets use `"BASE/QUOTE"` without the `:SETTLE` suffix:

```
ETH/USDC
WBTC/USDC
```

`fetchMarkets` returns every per-market field CCXT expects (precision, limits, fees, contract size, settlement currency, etc.).

## Timeframes

`fetchOHLCV` accepts CCXT's standard set: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. Invalid timeframes return HTTP 400.

## Authentication

Authenticated methods accept either:

### API key + secret (HMAC, CCXT-standard)

```
GET /ccxt/balance HTTP/1.1
X-API-KEY: <pub>
X-API-SIGN: HMAC-SHA256(secret, "GET\n/ccxt/balance\n" + timestamp)
X-API-TIMESTAMP: 1735689600
```

The gateway maps `X-API-KEY` to an internal account; per-key budgets are operator-set.

### Wallet signing (EIP-712 envelope)

Set CCXT's `walletAddress` parameter and provide a signing function. The gateway accepts an EIP-712-signed envelope identical to [`/exchange`](./exchange.md):

```
POST /ccxt/orders HTTP/1.1
X-MTF-SENDER: 0x<addr>
X-MTF-SIGNATURE: 0x<65-byte hex>
content-type: application/json

{ "symbol": "BTC/USDC:USDC", "type": "limit", "side": "buy", "price": "100.5", "amount": "1.0" }
```

The signed payload is `keccak256("ccxt:" || canonical_body_msgpack)` wrapped in the EIP-712 envelope. See [signing walkthrough](../../integration/signing.md).

## Examples

### Fetch markets

```bash
curl https://gateway/ccxt/markets
```

```json
[
  {
    "id":            "BTC-PERP",
    "symbol":        "BTC/USDC:USDC",
    "base":          "BTC",
    "quote":         "USDC",
    "settle":        "USDC",
    "type":          "swap",
    "linear":        true,
    "contract":      true,
    "contractSize":  1,
    "precision":     { "price": 8, "amount": 8 },
    "limits":        { "amount": { "min": 0.0001 }, "price": { "min": 0.01 } },
    "maker":         0.0002,
    "taker":         0.0005,
    "active":        true
  }
]
```

### Place an order

```bash
curl -X POST https://gateway/ccxt/orders \
  -H "X-API-KEY: $KEY" -H "X-API-SIGN: $SIG" -H "X-API-TIMESTAMP: $TS" \
  -H 'content-type: application/json' \
  -d '{
    "symbol": "BTC/USDC:USDC",
    "type":   "limit",
    "side":   "buy",
    "price":  "100.5",
    "amount": "1.0",
    "params": { "timeInForce": "GTC", "reduceOnly": false }
  }'
```

Response (CCXT order object):

```json
{
  "id":          "12345",
  "clientOrderId": null,
  "symbol":      "BTC/USDC:USDC",
  "type":        "limit",
  "side":        "buy",
  "price":       100.5,
  "amount":      1.0,
  "filled":      0.0,
  "remaining":   1.0,
  "status":      "open",
  "timestamp":   1735689600000,
  "fee":         { "currency": "USDC", "cost": 0.0 },
  "info":        { /* raw chain response */ }
}
```

### Cancel an order

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 \
  -H "X-API-KEY: $KEY" -H "X-API-SIGN: $SIG" -H "X-API-TIMESTAMP: $TS"
```

## Errors

CCXT-compat returns proper HTTP status codes (not HL's 200-with-status convention):

| HTTP | Body | Cause |
|------|------|-------|
| 400 | `{"error":"InvalidOrder","message":"..."}` | Bad symbol, bad price, bad size |
| 401 | `{"error":"AuthenticationError"}` | HMAC mismatch / bad signature |
| 404 | `{"error":"OrderNotFound"}` | `fetchOrder` / `cancelOrder` with unknown id |
| 422 | `{"error":"InsufficientFunds"}` | Margin / balance issue |
| 429 | `{"error":"RateLimitExceeded","retry_after":N}` | See [rate limits](../rate-limits.md) |

Error names match CCXT's exception hierarchy so CCXT clients route them naturally.

## CCXT Pro (WebSocket) — planned

Coming. Channel coverage mirrors REST:

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`
- `watchOrders` ← `/ws orderEvents`
- `watchPositions` ← `/ws userEvents` (filtered)
- `watchBalance` ← `/ws userEvents` (filtered)

See [WS subscriptions](../ws/subscriptions.md) for the underlying channels — CCXT Pro will translate these one-to-one.

## Limitations vs full CCXT spec

- `fetchOHLCV` returns shape-correct empty bars during the indexer rollout. Use [WS `candle`](../ws/subscriptions.md#candle) for live data.
- `fetchClosedOrders` and `fetchOrders` use the [HL-compat `historicalOrders`](./hl-compat.md) shape internally — wire is CCXT-shaped but pagination semantics match HL's.
- `fetchDeposits` / `fetchWithdrawals` track CCTP transfers only; native MTF transfers between accounts use the [HL-compat `userFills`](./hl-compat.md) variants.

## Worked example — TypeScript

```typescript
import ccxt from 'ccxt';

const ex = new ccxt.metaflux({
  apiKey: process.env.METAFLUX_API_KEY,
  secret: process.env.METAFLUX_SECRET,
  urls: { api: 'https://gateway.metaflux.dev' },
});

await ex.loadMarkets();
const ticker = await ex.fetchTicker('BTC/USDC:USDC');
console.log('mid:', ticker.last);

const order = await ex.createOrder(
  'BTC/USDC:USDC', 'limit', 'buy', 1.0, 100.5,
  { timeInForce: 'GTC', reduceOnly: false }
);
console.log('placed:', order.id);
```

`ccxt.metaflux` is the published exchange adapter once the SDK lands. Until then, use `ccxt.exchange()` with `urls.api` pointed at the gateway and the default settings work — the wire shape is fully CCXT-compliant.

## See also

- [HL-compat](./hl-compat.md) — alternative for HL-style clients
- [`POST /exchange`](./exchange.md) — MTF-native
- [WS subscriptions](../ws/subscriptions.md) — CCXT Pro underlying
- [Rate limits](../rate-limits.md)
- [Signing walkthrough](../../integration/signing.md) — wallet-signing variant

## FAQ

**Q: Which auth mode should I use?**
A: API-key for off-chain bots that don't need end-to-end key ownership; wallet-signing for clients that want to retain custody of the private key (no key escrow at the gateway).

**Q: Are CCXT and HL-compat budgets shared?**
A: Yes — both routes hit the same gateway rate-limit pool. Don't double up.

**Q: Can I mix CCXT and MTF-native on the same account?**
A: Yes. They're different wire shapes, same underlying account. Nonces are per-account, so all your tools need to agree on monotonicity — easiest is one client per account at a time, or a shared nonce service.
