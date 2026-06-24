# REST-поверхность совместимости с CCXT

:::info
**Предварительная версия.** Сегодня доступны **9 REST-методов**, каждый из которых возвращает унифицированную структуру [CCXT](https://docs.ccxt.com/). **Разбор символов, поиск рынка и JWT-аутентификация реальны**; денежные поля заглушены (`"0.0"` / пустые массивы / `0` в качестве идентификаторов) до тех пор, пока не будет реализован канал обратного чтения gateway → node. CCXT Pro (WS) в разработке.
:::

## Кратко

Для квантовых фреймворков, которые уже работают с протоколом CCXT, достаточно указать базовый URL шлюза MetaFlux. Структура ответов соответствует ожиданиям CCXT для поддерживаемых методов. Используйте эту поверхность, если у вас уже есть интеграция с CCXT; для новых клиентов рекомендуется начать с [HL-compat](./hl-compat.md) или [MTF-native](./exchange.md).

Как и [HL-compat](./hl-compat.md), данная поверхность существует **только на шлюзе** — она транслирует нативные MTF-чтения ноды в унифицированные структуры CCXT. Сама нода работает в нативном формате MTF (см. [`/info`](./info.md)); CCXT-структуры никогда не доходят до ноды.

## URL

```
https://<gateway>/ccxt/<path>
```

Все маршруты CCXT монтируются под префиксом `/ccxt/` (для разграничения с нативными MTF-поверхностями `/info` + `/exchange` и поверхностью HL-compat `/hl/*`). Запрос к пути без префикса (`/markets`) вернёт 404 — префикс обязателен.

## CCXT-метод → маршрут → нативное MTF-чтение ноды

9 REST-методов, доступных сегодня, плюс инициализация аутентификации. **Трансляция** выполняется по схеме: CCXT-унифицированная структура ← нативный MTF формат ноды: snake_case → camelCase CCXT, числовой идентификатор рынка `u32` → символ CCXT `BASE/QUOTE:SETTLE`, целочисленные значения → строки с десятичными числами.

| CCXT-метод | Маршрут | Аутентификация | Статус | Источник (нативный MTF) |
|------------|---------|----------------|--------|-------------------------|
| `fetchMarkets` | `GET /ccxt/markets` | нет | структура готова; статическая genesis-фикстура | [`markets`](./info.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | нет | структура готова; цены заглушены | [`market_info`](./info.md#market_info) + mid |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | нет | структура готова; стакан пустой | [`l2_book`](./info.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | нет | не обслуживается | История OHLCV — индексатор шлюза (дорожная карта) |
| `createOrder` | `POST /ccxt/orders` | Bearer | структура готова | → [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | структура готова | → [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | структура готова; балансы заглушены | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | структура готова; позиции заглушены | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | данные от ноды; структура готова | [`user_fills`](./info.md#user_fills) |
| — инициализация аутентификации — | `POST /ccxt/auth` | нет | работает | EIP-712 login → JWT |

Пояснения: **структура готова** = маршрут подключён, возвращается корректная CCXT-структура, денежные поля являются заглушками до реализации канала обратного чтения · **данные от ноды** = соответствующее чтение ноды активно · не обслуживается = источник данных в ноде отсутствует, будет обеспечен индексатором шлюза (дорожная карта).

:::warning
**Поверхность намеренно минималистична.** Методы, определённые в CCXT, но ещё не подключённые шлюзом — `fetchTickers`, `fetchTrades` (публичная лента), `fetchOrder`, `fetchOpenOrders`, `fetchClosedOrders`, `fetchOHLCV` (помимо заглушки), `setLeverage`, `setMarginMode`, `fetchFundingRate`, `cancelAllOrders` — возвращают 404. Они будут добавлены под `/ccxt/` по мере расширения канала обратного чтения. `fetchOpenOrders` / `fetchOrder` будут транслироваться из чтений ноды [`open_orders`](./info.md#open_orders) / [`order_status`](./info.md#order_status); `fetchTrades` — из ленты [`recent_trades`](./info.md#recent_trades); `fetchOHLCV` / `fetchClosedOrders` пока не обслуживаются (дорожная карта индексатора шлюза).
:::

## Формат символа

CCXT использует `"BASE/QUOTE:SETTLE"` для деривативов. Бессрочные контракты MetaFlux отображаются в виде:

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

Спотовые рынки (когда появится спотовая вселенная) используют `"BASE/QUOTE"` без суффикса `:SETTLE`. Реестр рынков в настоящее время представляет собой **статическую genesis-фикстуру** (`with_genesis_markets` — genesis-бессрочные контракты); gRPC-реестр, обновляемый из чтения [`markets`](./info.md#markets) ноды, будет подключён вместе с каналом обратного чтения. Разбор символов **реален**: некорректные символы → 400, неизвестные символы → 400.

## Таймфреймы

`fetchOHLCV` принимает стандартные токены CCXT: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. Некорректные таймфреймы возвращают 400. История OHLCV пока не обслуживается — возвращается корректная по структуре пустая заглушка (дорожная карта индексатора шлюза); для получения данных в реальном времени используйте WS-канал [`candle`](../ws/subscriptions.md).

## Аутентификация

Методы, требующие аутентификации (`createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`), требуют **JWT Bearer-токен**. Поддерживается **одна** схема аутентификации — JWT, выпускаемый на основе конверта EIP-712 login. (Схема HMAC `X-API-KEY` не поддерживается.)

### 1. Вход — `POST /ccxt/auth`

Отправьте подписанный EIP-712 конверт входа; в ответ получите сессионный JWT. Конверт повторяет `SignedEnvelope` ноды — шлюз независимо вычисляет EIP-712 дайджест по `(address, nonce, expiry)`, проверяет подпись и выпускает HS256 JWT, где `sub` — адрес.

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

| Поле конверта | Тип | Примечания |
|---------------|-----|------------|
| `address` | `0x` hex | EVM-адрес, выполняющий вход |
| `nonce` | u64 | Одноразовый номер защиты от повторов (проверяется на уровне ноды; JWT является токеном сессии) |
| `expiry` | u64 ms | Конверт отклоняется после истечения срока |
| `signature` | base64 | 65-байтовое значение `r‖s‖v` (соглашение EVM), закодированное в base64 |

Процедура формирования EIP-712 дайджеста описана в [руководстве по подписанию](../../integration/signing.md).

### 2. Вызов — `Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

Отсутствующие / просроченные / с некорректной подписью токены отклоняются с кодом `401`. Адрес из поля `sub` JWT ограничивает все аутентифицированные операции чтения/записи данной учётной записью.

## Примеры

### Получение рынков

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

### Получение тикера

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

Денежные поля сегодня представлены заглушками `"0.0"`; канал обратного чтения заполнит их из mid-цены ноды / [`market_info`](./info.md#market_info). CCXT-структура побайтово корректна, поэтому клиенты уже сейчас десериализуют её без ошибок и в будущем прозрачно получат реальные значения.

### Получение стакана заявок

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` — массивы вида `[[price, amount], …]` (структура CCXT). Усечение по `limit` будет применяться после получения реальных уровней из [`l2_book`](./info.md#l2_book).

### Выставление заявки

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

Ответ (объект заявки CCXT):

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

`createOrder` транслирует CCXT-заявку в запись [`/exchange`](./exchange.md) от имени учётной записи из поля `sub` JWT.

### Отмена заявки

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## Ошибки

CCXT-compat возвращает стандартные HTTP-коды статуса (в отличие от соглашения HL — 200 с полем `status`), с телами ошибок в именовании CCXT, чтобы клиентские SDK направляли их в нужный класс исключений:

| HTTP | Тело | Причина |
|------|------|---------|
| 400 | `{"error":"<message>"}` | Некорректный/неизвестный символ, неверные параметры, неверный таймфрейм |
| 401 | `{"error":"<message>"}` | Отсутствующий / просроченный / с некорректной подписью Bearer-токен |
| 404 | — | Неизвестный маршрут / путь без префикса / неподключённый метод |

## CCXT Pro (WebSocket) — в планах

Обновление WS на 5 каналов (`GET /ccxt/ws`) подготовлено; полное покрытие отражает REST:

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

Базовые каналы описаны в разделе [WS-подписки](../ws/subscriptions.md) — CCXT Pro транслирует их один к одному.

## Ограничения по сравнению с полной спецификацией CCXT

- **Денежные поля являются заглушками** (`"0.0"` / пустые массивы / `0` в идентификаторах) во всех методах с готовой структурой до реализации канала обратного чтения gateway → node. Структура окончательна; ожидают заполнения только значения.
- **`fetchMyTrades`** теперь работает на данных ноды (зафиксированная лента исполнений по учётной записи). **История OHLCV** (`fetchOHLCV`) и будущий `fetchClosedOrders` пока не обслуживаются — запланированы для индексатора шлюза (дорожная карта). Для получения данных в реальном времени используйте пока WS-каналы [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md).
- **Отсутствует аутентификация по HMAC API-ключу.** Поддерживается только схема EIP-712 → JWT, описанная выше. Клиенты сохраняют ключи у себя — шлюз не хранит никаких секретов.

## Смотрите также

- [HL-compat](./hl-compat.md) — другая поверхность совместимости
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md) — нативный MTF (источник трансляции)
- [WS-подписки](../ws/subscriptions.md) — основа CCXT Pro
- [Руководство по подписанию](../../integration/signing.md) — конверт EIP-712 login
- [Ограничения по частоте запросов](../rate-limits.md)
