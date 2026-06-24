---
description: "POST /info — запросы на чтение для спотовых рынков, маржинальной торговли со спотовым кредитным плечом и пула кредитования Earn."
---

# `POST /info` — спотовые и маржинальные запросы

Запросы на чтение для [спотовых](../../../products/spot.md) рынков, [маржинальной торговли](../../../products/spot-margin.md) и пула [Earn](../../../concepts/earn.md). Используется тот же эндпоинт `POST /info` и конверт, что и на [базовой странице](../info.md).

## Типы запросов: спот, маржа и Earn

### `spot_meta`

Список спотовых пар и реестр токенов. Параметры не требуются.

```json
{ "type": "spot_meta" }
```

Ответ:

```json
{
  "type": "spot_meta",
  "data": {
    "pairs": [
      { "id": 100, "name": "USDC", "base": 100, "quote": 100, "taker_fee_bps": 0, "min_notional": "0", "active": true },
      { "id": 101, "name": "BTC",  "base": 101, "quote": 101, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 104, "name": "MTF",  "base": 104, "quote": 104, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true },
      { "id": 113, "name": "MTF/USDC", "base": 104, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true }
    ],
    "tokens": [
      { "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6 },
      { "id": 101, "name": "BTC",  "sz_decimals": 5, "wei_decimals": 8 },
      { "id": 102, "name": "ETH",  "sz_decimals": 4, "wei_decimals": 18 },
      { "id": 103, "name": "SOL",  "sz_decimals": 2, "wei_decimals": 9 },
      { "id": 104, "name": "MTF",  "sz_decimals": 2, "wei_decimals": 8 }
    ]
  }
}
```

:::info
**В `pairs` присутствуют два типа записей.** «Самопарные» записи для каждого токена (`id` = id токена, `base == quote`, например `100`/USDC, `101`/BTC, …, `104`/MTF) — это реестр токенов, представленный в формате пар; **реальные торгуемые пары** имеют id `110+` (`BTC/USDC`=110, `ETH/USDC`=111, `SOL/USDC`=112, `MTF/USDC`=113), у них различаются `base`/`quote` и установлен `active:true`. Флаг `active` самопары отражает, активна ли самостоятельная книга заявок для данного токена (на Devnet активна только USDC).
:::

| Поле | Тип | Описание |
|------|-----|----------|
| `pairs[*].id` | uint32 | Id пары (`SpotPairSpec.pair_id`); `110+` = реальные пары `BASE/USDC` |
| `pairs[*].name` | string | Название пары (например, `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Id базового / котируемого актива (совпадают для самопар) |
| `pairs[*].taker_fee_bps` | uint16 | Комиссия тейкера (в б.п.); `0` — не задана |
| `pairs[*].min_notional` | decimal string | Минимальный номинал (в центах USDC); `"0"` — не задан |
| `pairs[*].active` | bool | Активна ли пара для торговли |
| `tokens[*].id` | uint32 | Id спотового токена (`100`=USDC, `101`=BTC, `102`=ETH, `103`=SOL, `104`=MTF) |
| `tokens[*].name` | string | Название токена (например, `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Точность отображения / размера |
| `tokens[*].wei_decimals` | uint8 | Нативные десятичные знаки токена в стиле ERC-20 (USDC=6, BTC=8, ETH=18, SOL=9, MTF=8) |

`tokens` и `pairs` упорядочены в соответствии с зафиксированным порядком `BTreeMap` (по id актива / пары).

Источник состояния: `Exchange.mip3_spot_pair_specs` (пары) + `Exchange.mip3_spot_token_specs` (токены).

### `spot_clearinghouse_state`

Спотовые балансы токенов по аккаунту. Обязательный параметр: `address` (hex, 0x).

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

Ответ:

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "total": "10", "hold": "0" } ]
  }
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `balances[*].asset` | uint32 | Id спотового актива (`104` = MTF) |
| `balances[*].name` | string | Название токена / пары, иначе `asset:<id>` |
| `balances[*].total` | decimal string | Полный баланс, усечённый к нулю |
| `balances[*].hold` | decimal string | Сумма, заблокированная в активных спотовых ордерах (эскроу); доступный остаток = `total − hold` |

Набор токенов — это объединение ключей баланса и эскроу (`reserved`) аккаунта: токен с нулевым доступным остатком, но ненулевым заблокированным, всё равно отображается. Сканирование выполняется по аккаунту (без полного перебора таблицы). Источник состояния: `locus.spot_clearinghouse.{balances, reserved}` (оба ключа: `(owner, asset)`).

### `spot_margin_state`

:::info
**Доступно на Devnet (предпросмотр).** Интерфейс чтения для [маржинальной торговли](../../../products/spot-margin.md) со спотовым кредитным плечом; см. страницу концепции с оговорками по предпросмотру.
:::

Все маржинальные позиции одного аккаунта. Обязательный параметр: `user` (hex, 0x).

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

Ответ:

```json
{
  "type": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": 200,
        "collateral": "5",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ]
  }
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `accounts[*].pair` | uint32 | Id спотовой пары, по которой открыта позиция |
| `accounts[*].collateral` | decimal string | Внесённое котируемое обеспечение (буфер против убытков) |
| `accounts[*].borrowed` | decimal string | Непогашенный **основной долг** по займу (на момент снятия индексного снимка) |
| `accounts[*].borrow_index_snapshot` | decimal string | Индекс займа пула на момент открытия позиции (база начисления долга) |
| `accounts[*].base_held` | decimal string | Обособленный базовый актив, купленный с кредитным плечом (не входит в доступный баланс) |
| `accounts[*].current_debt` | decimal string | Долг, начисленный на текущий момент: `borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | Параметры `{ init_bps, maint_bps }` для данной пары; `null` — маржа не включена или не откалибрована для пары |

Позиции перечислены в порядке возрастания id пары. Если позиций нет, возвращается пустой массив `accounts`.

### `earn_state`

:::info
**Доступно на Devnet (предпросмотр).** Интерфейс чтения для пулов кредитования [Earn](../../../concepts/earn.md); см. страницу концепции с оговорками по предпросмотру.
:::

Все пулы кредитования Earn, а также доля одного аккаунта при указании параметра `user`. Необязательный параметр: `user` (hex, 0x).

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

Ответ:

```json
{
  "type": "earn_state",
  "data": {
    "pools": [
      {
        "asset": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": 1000,
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `pools[*].asset` | uint32 | Id котируемого актива в пуле (ключ пула) |
| `pools[*].total_supplied` | decimal string | СЧА пула — вложенный основной долг плюс зачисленные процентные поступления |
| `pools[*].total_borrowed` | decimal string | Котируемые средства, выданные в долг маржинальным заёмщикам |
| `pools[*].idle` | decimal string | `total_supplied − total_borrowed` — верхняя граница средств, доступных к мгновенному выводу |
| `pools[*].shares_total` | decimal string | Общее количество долей в обращении |
| `pools[*].share_value` | decimal string | `total_supplied / shares_total` (`0` при отсутствии долей) |
| `pools[*].borrow_index` | decimal string | Накопленный индекс займа (база начисления долга) |
| `pools[*].reserve_factor_bps` | uint16 | Доля протокола от процентов по займам (в б.п.) |
| `pools[*].borrow_rate_bps_annual` | uint32 | Годовая ставка заимствования (в б.п.) |
| `pools[*].reserve_accrued` | decimal string | Резерв протокола, накопленный из процентных доходов |
| `pools[*].user_shares` | decimal string | **Только при указании `user`** — доли аккаунта в пуле |
| `pools[*].user_value` | decimal string | **Только при указании `user`** — `user_shares × share_value` |

Пулы перечислены в порядке возрастания id актива. При отсутствии параметра `user` поля `user_shares` / `user_value` не возвращаются.

### `spot_deploy_state`

Состояние газовых аукционов MIP-1 для деплоя спотовых пар. Параметры не требуются.

```json
{ "type": "spot_deploy_state" }
```

Ответ:

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `auction_round` | uint64 | Текущий раунд аукциона |
| `current_bid` | decimal string | Лидирующая ставка |
| `current_winner` | hex address \| null | Текущий лидер аукциона |
| `auction_end_ms` / `started_at_ms` | uint64 | Окно аукциона (время консенсуса в мс) |
| `total_burned` | decimal string | Накопленный сожжённый номинал выигрышных ставок |
| `deposit` | decimal string | Общая сумма задепозированного обеспечения (в базовых единицах) |

Источник состояния: `Exchange.spot_pair_deploy_gas_auction`.


## См. также

- [`POST /info`](../info.md) — базовый эндпоинт чтения (конверт, соглашения, запросы по аккаунту и инфраструктуре)
- [Запросы по бессрочным контрактам](./perpetuals.md) — чтение данных рынков бессрочных контрактов
- [Спот](../../../products/spot.md) / [Маржинальная торговля](../../../products/spot-margin.md) — описание продуктов
