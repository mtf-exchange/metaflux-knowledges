---
description: "Обратно несовместимые изменения API в node + gateway 0.7.14 — адресация по coin/address, удалённые типы запросов, встроенные маржинальные уровни и обновления WS-каналов. Чек-лист миграции для интеграторов и маркет-мейкеров."
---

# Миграция API — 0.7.14

:::warning
**Обратно несовместимые изменения.** Этот релиз меняет способ адресации рынков и
аккаунтов в API чтения, удаляет три типа запросов и обновляет несколько
WS-каналов. Подписанные действия `/exchange` **не изменились**. Перед
обновлением клиента пройдите чек-лист ниже.
:::

## Кратко {#at-a-glance}

| Область | Было | Стало |
|------|-----|-----|
| Адресация рынка (чтение) | `asset_id` / `market_id` (числовой) | **`coin`** (символ, напр. `"BTC"`) |
| Адресация аккаунта (чтение) | `account_id` **или** `address` | только **`address`** (0x hex) |
| История свечей | `candle` | **`candle_snapshot`** (единичный запрос свечи) |
| Составной снимок фронтенда | `web_data2` (REST + WS) | **удалён** — собирайте из отдельных целевых запросов |
| Маржинальная лестница | запрос `margin_table` | **`margin_tiers`** встроен в `market_info` / `markets` |
| Недавние сделки за окно времени | — | **`trades_by_time`** (новое) |
| Лимит WS-подписок | 256 / соединение | **64 / соединение** |

## 1. Рынки адресуются по `coin` {#1-markets-are-addressed-by-coin}

Каждый запрос чтения, привязанный к рынку, теперь определяет рынок по
**символу `coin`**. Числовые аргументы запроса `asset_id` / `market_id`
**удалены** — запрос, который передаёт их (и не передаёт `coin`), отклоняется с
`400 {"error":"missing field coin"}`.

Затронутые запросы чтения: `market_info`, `markets`, `l2_book`,
`recent_trades`, `trades_by_time`, `funding_history`, `oracle_sources`,
`active_asset_data`, `fba_batch_state`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"market_info","asset_id":0}
+ {"type":"market_info","coin":"BTC"}
```

Ответы отражают символ `coin` (например, строки `recent_trades` содержат
`"coin":"BTC"`). `market_info` / `markets` пока сохраняют поле **`asset_id`**
как устаревшую заглушку для индексаторов — **не стройте на нём логику**; оно
может быть убрано без повышения версии протокола.

## 2. Аккаунты адресуются по `address` {#2-accounts-are-addressed-by-address}

Запросы чтения, привязанные к аккаунту, больше не принимают `account_id`;
передавайте `address` (0x hex).

Затронутые запросы чтения: `open_orders`, `user_fills`,
`user_fills_by_time`, `agents`, `sub_accounts`, `rfq_user`, `pm_summary`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

Поле-эхо `account_id` в этих ответах больше не встречается.

## 3. Удалённые типы запросов {#3-removed-query-types}

| Удалено | Возвращает теперь | Использовать вместо |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` встроен в [`market_info`](./rest/info/perpetuals.md#market_info) / [`markets`](./rest/info/perpetuals.md#markets) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) + [`spot_clearinghouse_state`](./rest/info/spot.md#spot_clearinghouse_state) + [`frontend_open_orders`](./rest/info.md#frontend_open_orders) + [`user_vault_equities`](./rest/info.md#user_vault_equities) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2` (WS-канал) | `unknown channel: web_data2` | WS-каналы `account_state` + `spot_state` |

## 4. `margin_tiers` — встроенная лестница по номинальным диапазонам {#4-margin_tiers--inline-notional-banded-ladder}

Лестница поддерживающей маржи теперь встроена **напрямую** в каждую запись
рынка как `margin_tiers` — список диапазонов с верхними границами по
возрастанию:

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` — **верхняя граница** диапазона (строка-десятичное
  число, в единицах размера); `null` = **безграничный верхний уровень**.
- `max_leverage` — максимальное кредитное плечо в этом диапазоне (`u8`).
- `maint_margin_ratio` — коэффициент поддерживающей маржи, **строка в
  десятичных базисных пунктах** (`"100"` = 1.00%).

Уровень = первый диапазон, чья граница `max_open_interest` не превышена.
С ростом открытого интереса плечо снижается, а требования к марже растут.

## 5. Новое: `trades_by_time` {#5-new-trades_by_time}

Недавние публичные сделки по одному рынку за окно `[start_time, end_time]`
(ограниченное кольцо; более глубокая история — через архив шлюза):

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

Строки имеют ту же форму, что и [`recent_trades`](./rest/info/perpetuals.md#recent_trades).

## 6. Форма `markets` {#6-markets-shape}

`markets.data` теперь **объект**, а не массив:

```json
{ "type": "markets", "data": { "perp": [ /* записи рынков */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

Каждый элемент `perp[]` содержит только **динамические** поля рынка — то же
динамическое подмножество, что `market_info` включает для одного `coin`.
**Статические** поля (сетки точности, лестницы плеча/маржи, флаги контроля
торговли) находятся отдельно в [`markets_meta`](./rest/info/perpetuals.md#markets_meta);
`market_info` возвращает объединение обоих.

## 7. Изменения WebSocket {#7-websocket-changes}

- **Канал `web_data2` удалён** — см. замену выше.
- **`trades`**: `data` теперь **массив**; кадр при подписке
  (`is_snapshot: true`) — **непустой** массив недавних сделок (пуст только
  если по рынку никогда не было сделок), а строки снимка содержат
  **`users: null`**. Живые обновления содержат `users: [taker, maker]`.
- **`user_fundings`**: записи теперь содержат
  `{coin, payment, szi, fundingRate, time}` (`payment` — знаковое целое число
  в полных USDC: отрицательное = уплачено, положительное = получено).
- **`explorer_txs`**: строки содержат поле **`hash`** (хеш действия `0x`;
  пусто `""` для системной записи). **`explorer_block`** передаёт поток
  заголовков подтверждённых блоков.
- **`order_updates`**: в записи со статусом `filled` `order.sz` — это
  **исполненный** размер, а `order.orig_sz` — **исходный** размер ордера.
- **Активные каналы**: `account_state`, `spot_state`, `order_updates`,
  `fills`, `user_events`, `user_fundings`, `ledger_updates`, `l2_book`,
  `bbo`, `trades`, `candles`, `all_mids`, `active_asset_ctx`,
  `active_asset_data`, `explorer_block`, `explorer_txs`.

## 8. Семантика `predicted_fundings` {#8-predicted_fundings-semantics}

Ключ — `coin`; каждая запись —
`{coin, predicted_rate, next_funding_time}`:

- `predicted_rate` — **ограниченная (clamped)** ставка, фактически
  взимаемая на границе периода (премия, пропущенная через
  собственный `±cap` актива), а не сырая премия.
- `next_funding_time` — **следующая выровненная граница расчёта** для
  данного актива (мс).

Финансирование рассчитывается **дискретно** на границах для каждого актива
(по умолчанию 1 ч); выборки `funding_history` по-прежнему представляют собой
кольцо сырой премии. `market_info.funding` содержит `interval_ms`
(периодичность для актива) и `next_payment_ts` (граница).

## 9. Ограничения частоты запросов {#9-rate-limits}

- По IP: **1200 единиц веса / минуту** — IP из белого списка освобождены.
- Токен-бакет `/exchange` по аккаунту — **подписанты с уровнем
  metaliquidity освобождены**.
- WS: **64 подписки на соединение** (было 256) — соединения из белого
  списка освобождены.

См. [ограничения частоты запросов](./rate-limits.md).

## 10. Без изменений {#10-unchanged}

- **Идентификаторы ордеров/сделок**: `oid`, `tid`, `cloid` не изменились
  (`tid` — это `u64`, разбирайте как большое целое число, оно может
  превышать 2⁵³).
- **Подписанные действия `/exchange`**: дайджесты типизированных действий
  **зафиксированы консенсусом** — `asset` в подписанных действиях остаётся
  числовым `u32`. Изменение `coin`/`address` затрагивает только
  **API чтения** — оно **не влияет** на то, как вы подписываете ордер или
  отмену. См. [`POST /exchange`](./rest/exchange.md).

## См. также {#see-also}

- [`POST /info`](./rest/info.md) · [запросы к бессрочным рынкам](./rest/info/perpetuals.md) · [запросы к спот- и маржинальным рынкам](./rest/info/spot.md)
- [WS-подписки](./ws/subscriptions.md)
- [Ограничения частоты запросов](./rate-limits.md) · [Ошибки](./errors.md)
