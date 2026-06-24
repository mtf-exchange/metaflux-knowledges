---
description: Superficie REST compatible con CCXT — 9 métodos con forma CCXT unificada, autenticación JWT real y mercados de génesis estáticos.
---

# Superficie REST compatible con CCXT

:::info
**Vista previa.** Hoy se expone un **subconjunto REST de 9 métodos**, cada uno devolviendo exactamente la forma unificada de [CCXT](https://docs.ccxt.com/). **El análisis de símbolos, la búsqueda de mercados y la autenticación JWT son reales**; los campos monetarios están rellenos con valores de marcador de posición (`"0.0"` / arrays vacíos / ids `0`) hasta que el canal de lectura gateway → nodo esté operativo. CCXT Pro (WS) está en camino.
:::

## Resumen rápido

Para los frameworks cuantitativos que ya hablan el protocolo CCXT, basta con apuntar la URL base del exchange al gateway de MetaFlux. La forma del protocolo coincide con lo que espera CCXT para los métodos soportados. Utiliza esta superficie si ya tienes una integración con CCXT; para nuevos clientes, comienza con [HL-compat](./hl-compat.md) o [MTF-native](./exchange.md).

Al igual que [HL-compat](./hl-compat.md), esta superficie reside **solo en el gateway** — traduce las lecturas MTF-nativas del nodo a las formas unificadas de CCXT. El nodo en sí es MTF-nativo (véase [`/info`](./info.md)); las formas CCXT nunca llegan al nodo.

## URL

```
https://<gateway>/ccxt/<path>
```

Todas las rutas CCXT están montadas bajo el prefijo `/ccxt/` (para distinguirlas de la superficie MTF-nativa predeterminada `/info` + `/exchange` y la superficie HL-compat `/hl/*`). Una solicitud a una ruta sin prefijo (`/markets`) devuelve 404 — el prefijo es obligatorio.

## Método CCXT → ruta → lectura MTF-nativa del nodo

Los 9 métodos REST disponibles hoy, más el arranque de autenticación. La **traducción** es forma-unificada-CCXT ← MTF-nativo del nodo: snake_case → camelCase de CCXT, id de mercado `u32` → símbolo CCXT `BASE/QUOTE:SETTLE`, magnitudes enteras → cadenas decimales.

| Método CCXT | Ruta | Autenticación | Estado | Fuente MTF-nativa del nodo |
|-------------|------|---------------|--------|---------------------------|
| `fetchMarkets` | `GET /ccxt/markets` | no | forma activa; fixture estático de génesis | [`markets`](./info.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | no | forma activa; precios son marcadores | [`market_info`](./info.md#market_info) + mid |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | no | forma activa; libro vacío | [`l2_book`](./info.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | no | no servido | Historial OHLCV — indexador del gateway (hoja de ruta) |
| `createOrder` | `POST /ccxt/orders` | Bearer | forma activa | → [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | forma activa | → [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | forma activa; saldos son marcadores | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | forma activa; posiciones son marcadores | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | respaldado por nodo; forma activa | [`user_fills`](./info.md#user_fills) |
| — arranque de autenticación — | `POST /ccxt/auth` | no | real | Login EIP-712 → JWT |

Leyenda: **forma activa** = ruta montada, se devuelve la forma correcta según CCXT, los campos monetarios son marcadores en espera del canal de lectura · **respaldado por nodo** = la lectura subyacente del nodo está activa · no servido = aún sin respaldo del nodo, será servido por el indexador del gateway (hoja de ruta).

:::warning
**La superficie es deliberadamente mínima.** Los métodos que CCXT define pero que el gateway **aún no** monta — `fetchTickers`, `fetchTrades` (cinta pública), `fetchOrder`, `fetchOpenOrders`, `fetchClosedOrders`, `fetchOHLCV` más allá del marcador, `setLeverage`, `setMarginMode`, `fetchFundingRate`, `cancelAllOrders` — devuelven 404. Se irán añadiendo bajo `/ccxt/` a medida que se expanda el canal de lectura. `fetchOpenOrders` / `fetchOrder` traducirán desde las lecturas del nodo [`open_orders`](./info.md#open_orders) / [`order_status`](./info.md#order_status); `fetchTrades` traducirá desde la cinta [`recent_trades`](./info.md#recent_trades) del nodo; `fetchOHLCV` / `fetchClosedOrders` aún no están servidos (hoja de ruta del indexador del gateway).
:::

## Formato de símbolo

CCXT utiliza `"BASE/QUOTE:SETTLE"` para derivados. Los mercados de contratos perpetuos de MetaFlux se representan así:

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

Los mercados al contado (una vez que el universo spot esté disponible) usan `"BASE/QUOTE"` sin el sufijo `:SETTLE`. El registro de mercados actual es un **fixture estático de génesis** (`with_genesis_markets` — los contratos perpetuos de génesis); un registro respaldado por gRPC que se actualiza desde la lectura [`markets`](./info.md#markets) del nodo entrará en funcionamiento junto con el canal de lectura. El análisis de símbolos es **real**: símbolos malformados → 400, símbolos desconocidos → 400.

## Marcos temporales

`fetchOHLCV` acepta los tokens estándar de CCXT: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. Los marcos temporales no válidos devuelven 400. El historial OHLCV aún no está servido — por ahora se devuelve vacío con la forma correcta (hoja de ruta del indexador del gateway); usa el canal WS [`candle`](../ws/subscriptions.md) para datos en tiempo real.

## Autenticación

Los métodos autenticados (`createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`) requieren un **token JWT Bearer**. Existe **un único** esquema de autenticación — JWT generado a partir de un envelope de login EIP-712. (No hay esquema HMAC `X-API-KEY`.)

### 1. Login — `POST /ccxt/auth`

Envía un envelope de login firmado con EIP-712 y recibe un JWT de sesión. El envelope replica el `SignedEnvelope` del nodo — el gateway recalcula el digest EIP-712 sobre `(address, nonce, expiry)`, verifica la firma y genera un JWT HS256 cuyo campo `sub` es la dirección.

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

| Campo del envelope | Tipo | Notas |
|--------------------|------|-------|
| `address` | hex `0x` | Dirección EVM que solicita el login |
| `nonce` | u64 | Nonce de protección contra repetición (verificado en la capa del nodo; el JWT es el token de sesión) |
| `expiry` | u64 ms | El envelope es rechazado si se supera este valor |
| `signature` | base64 | 65 bytes `r‖s‖v` (convención EVM), codificados en base64 |

Consulta el [tutorial de firma](../../integration/signing.md) para la construcción del digest EIP-712.

### 2. Llamada — `Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

Los tokens ausentes, expirados o con firma incorrecta son rechazados con `401`. La dirección del campo `sub` del JWT delimita cada lectura/escritura autenticada a esa cuenta.

## Ejemplos

### Obtener mercados

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

### Obtener ticker

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

Los campos monetarios son marcadores `"0.0"` por ahora; el canal de lectura los llenará con el mid del nodo / [`market_info`](./info.md#market_info). La forma CCXT es correcta a nivel de bytes para que los clientes deserialicen sin problemas ahora y reciban valores reales de forma transparente más adelante.

### Obtener libro de órdenes

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` son arrays con la forma `[[price, amount], …]` (forma CCXT). El truncado por `limit` se aplica una vez que los niveles reales lleguen desde [`l2_book`](./info.md#l2_book).

### Colocar una orden

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

Respuesta (objeto de orden CCXT):

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

`createOrder` traduce la orden CCXT en una escritura [`/exchange`](./exchange.md) bajo la cuenta indicada en el campo `sub` del JWT.

### Cancelar una orden

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## Errores

La superficie compatible con CCXT devuelve códigos de estado HTTP apropiados (no la convención de HL de 200 con campo `status`), con cuerpos de error nombrados según CCXT para que los SDK de cliente los enruten a la clase de excepción correcta:

| HTTP | Cuerpo | Causa |
|------|--------|-------|
| 400 | `{"error":"<message>"}` | Símbolo malformado o desconocido, parámetros incorrectos, marco temporal no válido |
| 401 | `{"error":"<message>"}` | Token Bearer ausente, expirado o con firma incorrecta |
| 404 | — | Ruta desconocida / ruta sin prefijo / método no montado |

## CCXT Pro (WebSocket) — planificado

Se ha preparado la infraestructura para una actualización WS de 5 canales (`GET /ccxt/ws`); la cobertura completa refleja la superficie REST:

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

Consulta [Suscripciones WS](../ws/subscriptions.md) para los canales subyacentes — CCXT Pro los traduce uno a uno.

## Limitaciones frente a la especificación completa de CCXT

- **Los campos monetarios son marcadores** (`"0.0"` / arrays vacíos / ids `0`) en todos los métodos con forma activa, hasta que el canal de lectura gateway → nodo esté operativo. La forma es definitiva; solo los valores están pendientes.
- **`fetchMyTrades`** ya está respaldado por el nodo (la cinta de ejecuciones por cuenta confirmadas). El **historial OHLCV** (`fetchOHLCV`) y el futuro `fetchClosedOrders` aún no están servidos — previstos para el indexador del gateway (hoja de ruta). Mientras tanto, usa los canales WS [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md) para datos en tiempo real.
- **Sin autenticación HMAC por clave API.** Solo el esquema EIP-712 → JWT descrito arriba. Los clientes conservan la custodia de sus claves — el gateway no custodia ningún secreto.

## Véase también

- [HL-compat](./hl-compat.md) — la otra superficie de compatibilidad
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md) — MTF-nativo (de donde traducen estas superficies)
- [Suscripciones WS](../ws/subscriptions.md) — base de CCXT Pro
- [Tutorial de firma](../../integration/signing.md) — envelope de login EIP-712
- [Límites de tasa](../rate-limits.md)
