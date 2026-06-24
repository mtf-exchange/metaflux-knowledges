# REST-поверхность совместимости с HL

:::info
**Предварительная версия.** Шлюз отвечает на все запросы HL `/info` в точном wire-формате HL. Часть типов уже **подключена** к актуальному состоянию ноды; остальные возвращают **честную пустую** форму HL (никогда не `null`, никогда не сфабрикованное значение) — до тех пор, пока соответствующий read-запрос ноды не будет реализован. Статус каждого типа указан в [таблице трансляции](#hl-info-тип--mtf-native-тип-ноды) ниже.
:::

## Кратко

Шлюз предоставляет URL-адреса и форматы запросов/ответов, идентичные HL. HL-боты переключаются на MetaFlux [без изменения кода](../../integration/migrating-from-hl.md) для покрытой поверхности. Wire-формат — конверт HL `{"error":...}` с кодом 400, поля в camelCase, кортежи `[bids, asks]`, денежные величины в виде десятичных строк — сохраняется в точности.

**Шлюз — ЕДИНСТВЕННОЕ место, где существуют форматы HL/camelCase.** Нода является MTF-native end-to-end (snake_case, идентификаторы integer/`u32` — см. [`/info`](./info.md)). Каждый HL-ответ здесь является *трансляцией* MTF-native read-запроса ноды; нода никогда не «говорит» на языке HL.

## URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

Совместимость с HL размещена в пространстве имён `/hl/*` на входной точке шлюза. Корневые пути `/info` · `/exchange` шлюза являются MTF-native (путь по умолчанию) — HL-клиентов необходимо направлять на `/hl/*`, а не на bare-пути, иначе вы попадёте на нативную поверхность (которая отклоняет поля, специфичные для HL). Трансляция HL↔native живёт исключительно в шлюзе.

## Конвенция конвертов

- Чтение `/info`: HTTP 200 с телом JSON, специфичным для типа. При некорректном запросе (неизвестный `type`, отсутствующий/невалидный `user`) — HTTP 400 с `{"error":"<сообщение>"}`. Сбой бэкхола ноды отображается честно: 502 `{"error":...}` при транспортной ошибке/5xx, 400 при параметрах, отклонённых нодой — **никогда** не возвращается сфабрикованный успешный пустой ответ.
- Запись `/exchange`: конвенция HL `{"status":"ok"|"err", "response":<...>}` (ошибки передаются с кодом 200). См. [`/exchange` ниже](#exchange--путь-записи).

---

## `/info` — путь чтения

Только чтение. Диспетчеризация по полю `type` в теле запроса. Дублирует HL `/info`.

### HL info тип → MTF-native тип ноды

Это главная таблица соответствий. **Трансляция** всегда включает: snake_case → camelCase, integer/центы/`u32`-id → десятичные строки / `0x`-адреса, конверт ноды `{type,data}` распаковывается. Слой трансляции существует только в шлюзе.

| Тип HL `/info` | Статус | MTF-native источник в ноде | Примечания |
|----------------|--------|---------------------------|------------|
| `clearinghouseState` / `userState` | **подключён** | [`account_state`](./info.md#account_state) | `marginSummary` из `balance_quote` ноды; `assetPositions:[]` до тех пор, пока нода не предоставит состояние позиций |
| `delegations` | **подключён** | [`staking_state`](./info.md#staking_state) | нода индексирована по компактному `account_id`; реальный keccak-адрес без компактного id вернёт честную ошибку (не сфабрикованный пустой ответ) |
| `userFees` | **подключён** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` актуален; `activeReferrer`/`userVolumes`/`dailyUserVlm` ожидают read-запросов `user_referrer`/`user_volume` ноды |
| `l2Book` | заглушка | [`l2_book`](./info.md#l2_book) | read-запрос ноды существует; трансляция шлюза в `{coin,levels,time}` ещё не подключена — возвращает пустую книгу HL |
| `meta` | заглушка | — | требует read-запроса ноды для получения списка всех рынков / вселенной (нодовый `market_info` привязан к конкретному id); возвращает `{universe:[],marginTables:[]}` |
| `allMids` | заглушка | — | требует того же read-запроса вселенной (тот же блокировщик, что и `meta`); возвращает `{}` |
| `metaAndAssetCtxs` | **подключён** | [`markets`](./info.md#markets) | `[meta, [assetCtx...]]`; каждый `assetCtx` бессрочного контракта содержит `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `funding` / `openInterest` / `oraclePx` — все в виде десятичных USDC-строк |
| `openOrders` | заглушка | [`open_orders`](./info.md#open_orders) | read-запрос ноды существует; трансляция шлюза ещё не подключена — возвращает `[]` |
| `frontendOpenOrders` | заглушка | [`open_orders`](./info.md#open_orders) | `openOrders` + UI-подсказки; возвращает `[]` |
| `vaultDetails` | заглушка | [`vault_state`](./info.md#vault_state) | требует реестра leader-адрес → `vault_id` (нода индексируется по `vault_id`); возвращает запрошенного `user`, финансовые показатели обнулены |
| `subAccounts` | **подключён** | [`sub_accounts`](./info.md#sub_accounts) | преобразует `{index,address}` ноды → `{subAccountUser,name,master}`; `clearinghouseState` опущен (join состояния аккаунта на уровне под-аккаунта в read-запросе ноды отсутствует) |
| `referral` | заглушка | — | реферер устанавливается через `Action::setReferrer` иммутабельно; возвращает `referredBy:null` |
| `spotClearinghouseState` | **подключён** | [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) | `{asset,name,balance}` ноды → `{coin,token,total}`; `hold:"0"` / `entryNtl:null` (удержание/себестоимость в read-запросе ноды отсутствуют) |
| `spotMeta` / `spotMetaAndAssetCtxs` | **подключён** | [`spot_meta`](./info.md#spot_meta) | `pairs` ноды → `universe`; реестр `tokens` из реальных данных ноды по каждому токену: `name` / `szDecimals` / `weiDecimals` (USDC `isCanonical`); каждый спотовый `assetCtx` содержит `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `circulatingSupply` — десятичные USDC-строки |
| `predictedFundings` | заглушка | — | возвращает `[]` |
| `orderStatus` | заглушка | — | разрешается в `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **подключён** | [`max_builder_fee`](./info.md#max_builder_fee) | возвращает `max_fee_bps` ноды как bare-число HL; для неодобренной пары → `0` |
| `userRateLimit` | **подключён** | [`user_rate_limit`](./info.md#user_rate_limit) | `lifetime_count` ноды → `nRequestsUsed`, базовый `nRequestsCap`; `cumVlm:"0.0"` (объём в данном read-запросе ноды отсутствует) |
| `userNonFundingLedgerUpdates` | заглушка | — | возвращает `[]` |
| `userFunding` / `userFundings` | не обслуживается | — | история платежей по ставке финансирования пользователя — будет обслуживаться индексатором шлюза (дорожная карта) |
| `fundingHistory` | **подключён** | [`funding_history`](./info.md#funding_history) | выборки премии/реализованной ставки по монете за период, из живого трекера ставки финансирования ноды |
| `userFills` | **подключён** | [`user_fills`](./info.md#user_fills) | детализированный журнал исполнений, из подтверждённой ленты исполнений аккаунта |
| `userFillsByTime` | **подключён** | [`user_fills_by_time`](./info.md#user_fills_by_time) | `userFills` с фильтрацией по времени, из той же подтверждённой ленты исполнений |
| `historicalOrders` | не обслуживается | — | список ордеров в конечном состоянии — будет обслуживаться индексатором шлюза (дорожная карта) |
| `candleSnapshot` | не обслуживается | — | история OHLCV — будет обслуживаться индексатором шлюза (дорожная карта) |

Условные обозначения: **подключён** = актуальное состояние ноды сегодня · заглушка = корректная пустая форма HL без нодового бэкинга · не обслуживается = нодовый бэкинг отсутствует, будет обслуживаться индексатором шлюза (дорожная карта).

:::info
Контракт **честного пустого ответа** является принципиально важным: HL-клиенты итерируют эти ответы без условий. Заглушка обязана возвращать `[]` / `{}` / типизированный ноль — **никогда** не `null` там, где клиент ожидает объект — чтобы немодифицированные HL SDK десериализовали ответ одинаково вне зависимости от того, являются ли данные актуальными или ожидаемыми.
:::

### Подключённые типы

#### `clearinghouseState` / `userState`

Два псевдонима — оба возвращают состояние клиринга для конкретного пользователя. **Подключён** к [`account_state`](./info.md#account_state) ноды. `balance_quote` ноды (обеспечение USDC в целых долларах) отображается на сводку маржи HL. Детали по позициям ещё не доступны на поверхности ноды, поэтому `assetPositions` равно `[]`.

```json
{"type":"clearinghouseState", "user":"0x..."}
```

Ответ (формат HL):

```json
{
  "assetPositions": [],
  "marginSummary": {
    "accountValue":    "1000.0",
    "totalNtlPos":     "0.0",
    "totalRawUsd":     "1000.0",
    "totalMarginUsed": "0.0"
  },
  "crossMarginSummary":         { "accountValue": "1000.0", "totalNtlPos": "0.0", "totalRawUsd": "1000.0", "totalMarginUsed": "0.0" },
  "crossMaintenanceMarginUsed": "0.0",
  "withdrawable":               "1000.0",
  "time":                       0
}
```

После того как нода предоставит данные по позициям, `assetPositions[]` будет заполнен в формате HL:

```json
{
  "type":     "oneWay",
  "position": {
    "coin":           "BTC",
    "szi":            "1.0",
    "entryPx":        "100.0",
    "leverage":       { "type": "cross", "value": 10 },
    "marginUsed":     "10.5",
    "unrealizedPnl":  "0.5",
    "returnOnEquity": "0.05",
    "liquidationPx":  "92.5",
    "positionValue":  "100.5",
    "maxLeverage":    50,
    "cumFunding":     { "allTime": "0.123", "sinceOpen": "0.05" }
  }
}
```

#### `userFees`

**Подключён**: `feeSchedule` загружается в реальном времени из [`fee_schedule`](./info.md#fee_schedule) ноды (snake_case → camelCase; bps остаются JSON-числами, ограничены < 65536). Поля уровня пользователя (`activeReferrer`, `userVolumes`, `dailyUserVlm`) ожидают read-запросов `user_referrer` / `user_volume` ноды.

```json
{"type":"userFees","user":"0x..."}
```

```json
{
  "activeReferrer": null,
  "userVolumes":    [],
  "feeSchedule": {
    "takerBps":         5,
    "makerBps":         2,
    "referrerShareBps": 0,
    "builderCapBps":    8,
    "deployerCapBps":   0,
    "burnBps":          0,
    "vaultBps":         0,
    "validatorBps":     0,
    "treasuryBps":      0
  },
  "dailyUserVlm":   "0.0"
}
```

#### `delegations`

**Подключён** к [`staking_state`](./info.md#staking_state) ноды. Нода индексирует стейкинг по компактному `account_id` (u64), поэтому шлюз выполняет обратное преобразование встроенного адреса; реальный keccak-адрес без компактного id вернёт честную ошибку, а не сфабрикованный пустой список.

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**Подключён** к [`sub_accounts`](./info.md#sub_accounts) ноды. Каждый `{index, address}` ноды преобразуется в `{"subAccountUser","name","master"}` — `subAccountUser` является адресом под-аккаунта ноды, `master` — запрошенным владельцем, `name` — меткой вида `sub-<index>` (метки под-аккаунтов в блокчейне отсутствуют). `clearinghouseState` опущен: read-запрос ноды не содержит join состояния аккаунта на уровне под-аккаунта.

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**Подключён** к [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) ноды (по `address` в формате 0x). `{asset, name, balance}` ноды → HL `{coin, token, total, hold, entryNtl}`: `coin` из `name` ноды, `token` из id `asset` ноды, `total` из `balance` ноды. `hold` равен `"0"`, `entryNtl` равен `null` — read-запрос ноды не содержит удержания или себестоимости по балансу.

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**Подключён** к [`spot_meta`](./info.md#spot_meta) ноды. Каждая пара ноды отображается на запись `universe` (`tokens:[base,quote]`, `index` = id пары, `isCanonical` = `active` ноды). Реестр `tokens` строится из реального реестра токенов ноды: `name` / `sz_decimals` / `wei_decimals` каждой записи напрямую соответствуют HL-полям `name` / `szDecimals` / `weiDecimals`; `index` является id ресурса токена, `tokenId` — 32-байтовым hex этого id, USDC помечается флагом `isCanonical`.

```json
{"type":"spotMeta"}
```

```json
{
  "tokens":   [ { "name": "USDC", "szDecimals": 2, "weiDecimals": 6, "index": 100, "tokenId": "0x...", "isCanonical": true },
                { "name": "MTF",  "szDecimals": 2, "weiDecimals": 8, "index": 104, "tokenId": "0x...", "isCanonical": false } ],
  "universe": [ { "name": "MTF/USDC", "tokens": [104, 100], "index": 113, "isCanonical": true } ]
}
```

Id токенов в ноде начинаются с `100` (USDC) — см. [`spot_meta`](./info.md#spot_meta) для полного реестра — поэтому `index` отражает эти id, а не `0`-based-схему HL.

`spotMetaAndAssetCtxs` возвращает `[spotMeta, [spotAssetCtx...]]`; второй
элемент — один `spotAssetCtx` для каждой пары, индекс которого совпадает с
`spotMeta.universe`. Каждый `spotAssetCtx` содержит поле `coin` пары и актуальный контекст:

```json
{
  "coin":              "MTF/USDC",
  "dayNtlVlm":         "42000.00",
  "prevDayPx":         "4.95",
  "markPx":            "5.00",
  "midPx":             "5.00",
  "circulatingSupply": "21000000.0"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `dayNtlVlm` | десятичная строка | Условный объём за 24 часа, в **USD** |
| `prevDayPx` | десятичная строка | Цена 24 часа назад, **десятичный USDC** |
| `markPx` | десятичная строка | Текущая маркировочная цена, **десятичный USDC** |
| `midPx` | десятичная строка | Текущий мид ордерной книги, **десятичный USDC** |
| `circulatingSupply` | десятичная строка | Объём в обращении базового токена |

Все цены представлены в виде десятичных USDC-строк (в человекочитаемом формате), а не в виде целых чисел.

#### `maxBuilderFee`

**Подключён** к [`max_builder_fee`](./info.md#max_builder_fee) ноды (`address` в формате 0x + `builder`). Возвращает `max_fee_bps` ноды как bare-число HL (HL возвращает целое число, а не объект); для неодобренной пары `(user, builder)` → `0`.

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**Подключён** к [`user_rate_limit`](./info.md#user_rate_limit) ноды (по `address` в формате 0x). `lifetime_count` ноды отображается на `nRequestsUsed`; `nRequestsCap` соответствует базовому значению HL (1200). `cumVlm` остаётся `"0.0"` — read-запрос лимита скорости ноды основан на статистике действий, а не на объёме (ожидается read-запрос объёма ноды).

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### Типы-заглушки (корректная пустая форма HL)

Возвращают точную форму HL с нулевым/пустым содержимым. Read-запрос ноды существует для нескольких из них (`l2Book`, `openOrders`, `vaultDetails`) — ожидается только *трансляция* на стороне шлюза; для остальных нодовый бэкинг ещё не реализован.

#### `l2Book`

```json
{"type":"l2Book","coin":"BTC"}
```

```json
{
  "coin": "BTC",
  "levels": [ [ /* bids */ ], [ /* asks */ ] ],
  "time": 0
}
```

`levels` — кортеж `[bids, asks]` (формат HL); каждый уровень: `{"px":"...","sz":"...","n":N}`. Будет подключён к [`l2_book`](./info.md#l2_book) ноды после реализации трансляции.

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

Каждая запись `universe` (после реализации read-запроса вселенной ноды): `{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`.

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]` (кортежный формат HL). Второй элемент — один `assetCtx`
для каждого рынка бессрочных контрактов, индекс которого совпадает с
`meta.universe`. Каждый `assetCtx` заполняется из актуального состояния рынка:

```json
{
  "dayNtlVlm":    "1850000.00",
  "prevDayPx":    "66800.00",
  "markPx":       "67042.50",
  "midPx":        "67042.33",
  "funding":      "0.0000125",
  "openInterest": "1250.5",
  "oraclePx":     "67040.00"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `dayNtlVlm` | десятичная строка | Условный объём за 24 часа, в **USD** |
| `prevDayPx` | десятичная строка | Цена 24 часа назад, **десятичный USDC** |
| `markPx` | десятичная строка | Текущая маркировочная цена, **десятичный USDC** |
| `midPx` | десятичная строка | Текущий мид ордерной книги, **десятичный USDC** |
| `funding` | десятичная строка | Текущая ставка финансирования (за период) |
| `openInterest` | десятичная строка | Открытый интерес в базовых единицах |
| `oraclePx` | десятичная строка | Последняя оракульная / индексная цена, **десятичный USDC** |

Все цены представлены в виде десятичных USDC-строк (в человекочитаемом формате), а не в виде целых чисел.

#### `allMids`

```json
{"type":"allMids"}
```

Словарь имя актива → mid-цена: `{"BTC":"100.55","ETH":"3200.0"}`. Заглушка: `{}`.

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

Массив объектов `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`. `side`: `"B"` (покупка) / `"A"` (продажа). `frontendOpenOrders` добавляет UI-поля (`triggerPx`, `isTrigger`, `isPositionTpsl`, `orderType`). Будет подключён к [`open_orders`](./info.md#open_orders) ноды. Заглушка: `[]`.

#### `vaultDetails`

```json
{"type":"vaultDetails","user":"0x..."}
```

```json
{
  "vaultAddress":     "0x...",
  "leader":           "0x...",
  "shares":           "0.0",
  "navUsd":           "0.0",
  "isPaused":         false,
  "managementFeeBps": 1000,
  "withdrawalLockMs": 345600000,
  "createdAtMs":      0,
  "followerCount":    0
}
```

Хранилища MetaFlux не являются хранилищами HL — форматы запросов идентичны, но сущности различны (см. [хранилища](../../concepts/vaults.md), [MIP-2](../../mip/mip-2.md)). Будет подключён к [`vault_state`](./info.md#vault_state) ноды после реализации реестра leader→`vault_id`. `managementFeeBps` / `withdrawalLockMs` — ограниченные JSON-числа (HL использует числа для параметров, строки — для денежных величин).

#### `referral`

```json
{
  "referredBy": null,
  "referrerState": {
    "cumVlm": "0.0",
    "cumRewardedFeesSinceReferred": "0.0",
    "cumFeesRewardedToReferrer": "0.0",
    "claimedRewards": "0.0"
  },
  "rewardHistory": []
}
```

`referredBy` равен `null` (не `{}`) — HL-клиенты различают «реферер никогда не был установлен» и «установлен, но неактивен». Реферер является иммутабельным после вызова `setReferrer`.

#### Прочие заглушки

| Тип | Ответ-заглушка |
|-----|----------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### Типы, ещё не обслуживаемые

Эти типы пока не имеют нодового бэкинга и возвращают пустую форму HL; они запланированы для индексатора шлюза (дорожная карта):

| Тип | Пустая заглушка | Примечания |
|-----|-----------------|------------|
| `historicalOrders` | `[]` | список ордеров в конечном состоянии |
| `candleSnapshot` | `[]` | история OHLCV (используйте WS-канал [`candle`](../ws/subscriptions.md) для живых баров) |
| `userFunding` / `userFundings` | `[]` | история платежей по ставке финансирования пользователя |

`userFills` / `userFillsByTime` и `fundingHistory` теперь **подключены** к актуальному состоянию ноды — см. [таблицу трансляции](#hl-info-тип--mtf-native-тип-ноды) выше. Формат записи исполнения HL: `{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`.

### Ошибки `/info`

| HTTP | Тело | Причина |
|------|------|---------|
| 400 | `{"error":"missing field \`type\`"}` | Отсутствует дискриминатор `type` |
| 400 | `{"error":"unknown request type: <X>"}` | Опечатка или неподдерживаемый `type` |
| 400 | `{"error":"missing field user"}` | Обязательное поле `user` не указано |
| 400 | `{"error":"invalid user address: <X>"}` | `user` не соответствует формату `0x` + 40 hex-символов |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` без поля `coin` |
| 502 | `{"error":"<node error>"}` | Сбой бэкхола ноды для подключённого типа (транспортная ошибка/5xx) |

HL `/info` использует стандартные HTTP-коды статуса с `{"error":...}` (в отличие от `/exchange`, который использует конверт 200 с полем `status`).

---

## `/exchange` — путь записи

### Конверт запроса

```json
{
  "action":       { /* HL action object */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| Поле | Описание |
|------|----------|
| `action` | Действие в формате HL (см. ниже) |
| `nonce` | Unix ms, строго возрастающий для каждого подписанта |
| `signature` | Объект RSV — три hex-строки + uint `v` (27/28 или 0/1) |
| `vaultAddress` | `null` для собственного аккаунта; `"0x<vault>"` для действия в качестве менеджера хранилища |

Подпись формируется над EIP-712-конвертом (см. [руководство по подписанию](../../integration/signing.md)) с использованием домена **MetaFlux** (`chainId = 31337` для Devnet / `114514` для тестнета / `8964` для мейннета — см. [сети](../../networks.md)). `chainId` должен совпадать с `chain_id` консенсуса ноды (запросите через [`/info` `node_info`](./info.md#node_info)).

### Конверт ответа

Для записи используется конвенция HL `{"status":"ok"|"err","response":<...>}` (ошибки передаются с кодом 200):

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

### Поддерживаемые типы действий

| `action.type` | Статус | Примечания |
|---------------|--------|------------|
| `order` | поддерживается | limit / IOC / ALO; полный набор TIF |
| `cancel` | поддерживается | по `oid` |
| `cancelByCloid` | выкатывается | по `cloid` |
| `modify` / `batchModify` | выкатывается | cancel-replace |
| `scheduleCancel` | выкатывается | dead-man's switch |
| `updateLeverage` / `updateIsolatedMargin` | выкатывается | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | выкатывается | переводы |
| `withdraw3` | выкатывается | внешний вывод средств (MetaBridge) |
| `approveAgent` | выкатывается | одобрение агентского кошелька |
| `vaultTransfer` / `subAccountTransfer` | выкатывается | перемещение средств |
| `setReferrer` / `convertToMultiSigUser` | выкатывается | — |
| `twapOrder` / `twapCancel` | выкатывается | — |
| (всё остальное из HL) | возвращает `{"status":"err","response":"unimplemented action: <type>"}` | Используйте [MTF-native](./exchange.md) для этих действий |

### Пример `order`

```json
{
  "action": {
    "type": "order",
    "orders": [
      { "a": 0, "b": true, "p": "100.5", "s": "1.0", "r": false, "t": { "limit": { "tif": "Gtc" } } }
    ],
    "grouping": "na"
  },
  "nonce": 1735689600000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Сокращения полей (конвенция HL): `a`=id актива · `b`=is_buy · `p`=цена лимитного ордера · `s`=размер · `r`=reduce_only · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=необязательный 16-байтовый `cloid`.

Триггерные ордера: `"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`.

### Ответ `order`

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

Статус каждого ордера (по одному для каждой записи `orders[]` в порядке следования):

| Вариант | Значение |
|---------|----------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | Размещён в книге |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | Исполнен немедленно |
| `{"error":"<причина>"}` | Данная заявка отклонена (остальные могут быть выполнены) |

### Пример `cancel`

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Ответ: `{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`. Для каждой отмены: `"success"` или `{"error":"<причина>"}`.

### Ошибки `/exchange`

| Тело | Причина |
|------|---------|
| `{"status":"err","response":"signature_invalid"}` | Восстановленный адрес не совпадает с подписантом / неверный chainId |
| `{"status":"err","response":"unimplemented action: <type>"}` | Поверхность совместимости ещё не поддерживает данное действие |
| `{"status":"err","response":"nonce too small"}` | Повторно использованный nonce |
| `{"status":"err","response":"agent_not_approved"}` | Подпись агента без существующего одобрения |

---

## Отличия от HL, заслуживающие внимания

См. [руководство по переходу с HL](../../integration/migrating-from-hl.md) для полного справочника. Ключевые моменты:

- **`chainId`** в домене подписания соответствует MetaFlux (`31337` для Devnet / `114514` для тестнета / `8964` для мейннета), а НЕ HL (`998`/`999`).
- **Идентификаторы активов не совпадают численно** с HL. Выполняйте поиск через `info { "type": "meta" }` после реализации этого read-запроса; никогда не жёстко кодируйте их.
- **Уровень ликвидации «жёлтая карточка» T0** существует в MTF (между здоровым и «частичной ликвидацией» HL). Боты, отслеживающие события ликвидации, увидят ещё один тип события.
- **Типы действий HL помимо `order` / `cancel`** возвращают `err` во время выкатывания. Используйте MTF-native [`POST /exchange`](./exchange.md) или дождитесь завершения выкатывания.
- **Детализированные read-запросы** `userFills` / `userFillsByTime` / `fundingHistory` теперь обслуживаются в реальном времени из подтверждённого состояния ноды. Остальные исторические read-запросы (`historicalOrders`, `candleSnapshot`, `userFunding`) пока не обслуживаются — запланированы для индексатора шлюза (дорожная карта). Используйте WS-каналы [`userFills`](../ws/subscriptions.md) / [`candle`](../ws/subscriptions.md) для получения данных в реальном времени.

## См. также

- [`POST /info`](./info.md) — MTF-native read-запросы ноды, из которых транслируются эти HL-типы
- [`POST /exchange`](./exchange.md) — MTF-native путь записи
- [CCXT-совместимость](./ccxt-compat.md) — другая поверхность совместимости
- [Переход с HL](../../integration/migrating-from-hl.md) · [Руководство по подписанию](../../integration/signing.md) · [Ошибки](../errors.md)
