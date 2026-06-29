# Миграция с HL

:::info
**MetaFlux использует собственный протокол MTF-native — совместимого с Hyperliquid слоя нет.** Ваш бот сохраняет свою стратегию и торговую логику; меняется лишь клиентский/проводной уровень. Самый быстрый путь — официальный SDK для [TypeScript](./typescript-sdk.md) или [Rust](./rust-sdk.md), который собирает нативный конверт и подпись EIP-712 за вас. Для других языков реализуйте [подпись типизированных данных](./typed-data-signing.md) напрямую.
:::

Если ваш бот уже торгует на перп-DEX в стиле Hyperliquid, переход на MetaFlux — это **переписывание клиентского уровня, а не стратегии**. Концепции, на которые вы опираетесь — лимитные ордера, исполнения, финансирование, кросс-/изолированная маржа, агентские кошельки, субсчета, хранилища — все они есть в MTF. Меняются проводной формат, имена действий / запросов, chain ID и идентификаторы активов.

## Суть перехода

- **Проводной формат.** MTF-native — это JSON в snake_case через `POST /exchange` (запись), `POST /info` (чтение) и `GET /ws` (стрим), каждый из которых подписывается по EIP-712 там, где это требуется. Возьмите SDK или реализуйте [нативную схему подписи](./typed-data-signing.md).
- **Логика стратегии и риска.** Без изменений — ваш код котирования, расчёта размера и хеджирования переносится как есть.
- **Имена и несколько семантических нюансов.** Типы действий и типы запросов переименованы (таблица ниже), и ряд поведений отличается (идентификаторы активов, уровень ликвидации T0, задержка одобрения агента).

## Что работает так же

- Ордера Limit / IOC / ALO, reduce-only, клиентские идентификаторы ордеров (`cloid`).
- Подпись EIP-712 — тот же примитив подписи, другой домен и chain ID.
- Кросс-/изолированная маржа, выплаты финансирования, чтение исполнений и статусов ордеров.
- Агентские кошельки (горячие ключи без права вывода), субсчета, хранилища.

## Что меняется

### 1. Поверхность протокола {#1-protocol-surface}

Существует одна поверхность MTF-native; вы обращаетесь к ней через SDK или собираете конверт самостоятельно. Имена отображаются однозначно:

| Что вы использовали в HL | Эквивалент в MTF-native |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) / [`frontend_open_orders`](../api/rest/info.md#frontend_open_orders) |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| WS `userEvents`, `l2Book`, `candle` | `user_events`, `l2_book`, `candles` (snake_case) — см. [WS-подписки](../api/ws/subscriptions.md) |

Полные каталоги — [`POST /exchange`](../api/rest/exchange.md) и [`POST /info`](../api/rest/info.md).

### 2. Chain ID

MetaFlux — собственная L1-сеть, а не развёртывание HL. Подписывайте транзакции с использованием chain ID MetaFlux, а **не** HL:

| Сеть | MTF `chainId` |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / локальная | **31337** (`0x7a69`) |

Домен EIP-712 в MTF использует `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`. См. [сети](../networks.md) и [подписание](./signing.md).

### 3. Базовый URL

```
MTF: https://<net>-gateway.mtf.exchange/{info,exchange,ws}
```

Шлюз — единая точка входа для поверхности MTF-native. При самостоятельном запуске узла та же поверхность доступна по адресу `http://localhost:8080`.

### 4. Идентификаторы активов

HL и MTF используют целочисленные идентификаторы активов, но **целые числа не совпадают**. `0` в HL — это BTC perp; `0` в MTF может быть ETH или чем угодно ещё в зависимости от развёртывания. Всегда определяйте идентификаторы активов через `POST /info { "type": "markets" }` при запуске; никогда не задавайте их жёстко.

### 5. Числовая точность

Поля цены и размера — это масштабированные целые числа, передаваемые в виде JSON-строк, поскольку IEEE-754 теряет точность за пределами 2^53. Если ваш бот разбирает их стандартным `JSON.parse` в JS, переключитесь на парсер с поддержкой big-int для этих полей.

### 6. Поведение при ликвидации

MetaFlux добавляет [уровень-отсрочку T0 (жёлтая карточка)](../concepts/tiered-liquidation.md), которого нет в HL. Практический эффект: при health `[1.0, 1.1)` стоящие ALO-ордера вашего счёта принудительно отменяются и публикуется предупреждающее событие, но позиции не затрагиваются. Затем T1 / T2 / T3 ведут себя как Partial / Market / Backstop в HL.

Если ваш бот слушает события ликвидации для запуска пополнения маржи, **добавьте обработчик нового события T0** — это сигнал раннего предупреждения, которого HL вам не даёт. Его перехват даёт один блок отсрочки для действий.

### 7. Семантика агентского кошелька

Агент — это ключ без права вывода; та же модель, что и в HL (см. [агентские кошельки](../concepts/agent-wallets.md)). Действие — [`approve_agent`](../api/rest/exchange.md#approve_agent). Единственное механическое отличие: одобрение агента в MTF вступает в силу **через один блок после коммита**, против обычной задержки в два блока у HL. Чуть быстрее; тот же разогрев.

### 8. Хранилища

Хранилища HL и хранилища MetaFlux — это не один и тот же продукт. Чтение [`vault_state`](../api/rest/info.md#vault_state) возвращает собственные типы хранилищ MTF (MFlux Vault, пользовательские хранилища). Адреса хранилищ HL не разрешатся. Ожидайте сущности MTF, а не HL.

## Пошаговая миграция

### День 0 — переход на нативный клиент

1. Установите SDK для [TypeScript](./typescript-sdk.md) или [Rust](./rust-sdk.md) (или реализуйте [подпись типизированных данных](./typed-data-signing.md) для вашего языка).
2. Укажите `baseUrl` на шлюз MTF и задайте `chainId` для вашей целевой сети.
3. Перепишите поиск активов через `POST /info { "type": "markets" }`.

### День 1 — сопоставьте свои действия

Переведите каждое действие, которое отправляет ваш бот, в его эквивалент MTF-native (см. таблицу в [§1](#1-protocol-surface)). `order` → `submit_order`, `cancel` → `cancel_order`, изменения плеча / маржи → `update_leverage` / `update_isolated_margin`. Конверт EIP-712 собирается SDK; отличаются лишь имя варианта действия и регистр полей.

### День 2 — подключите новые сигналы

- Подпишитесь на чтение `sub_accounts`, если вы используете субсчета (MTF допускает до 32 субсчетов на мастер-аккаунт).
- Добавьте обработчик событий «жёлтой карточки» T0 в WS-канале `user_events`.
- Если вы зависите от портфельной маржи, подключитесь к ней в MTF через [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin). Порог и набор сценариев — это параметры сети; см. [портфельную маржу](../concepts/portfolio-margin.md).

### День 3+ — освойте функции, уникальные для MTF

Опционально. Если вам нужны функции, которых нет в HL:

- **RFQ** — примитивы запроса котировки (request-for-quote), полезны для объёма, который не хочет светиться в стакане.
- **FBA** — частые пакетные аукционы (frequent batch auction) для назначенных рынков, снижают MEV.
- **Кросс-чейн примитивы** — примитивы моста, нативно вызываемые из EVM-контрактов.

Это нативные действия MTF на `POST /exchange`; см. [обзор API](../api/index.md).

## Топ-паттерны HL-ботов — конкретная миграция

### 1. Простой маркет-мейкер на лимитных ордерах (канонический паттерн)

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://testnet-gateway.mtf.exchange',
  chainId:    114514,   // testnet (mainnet 8964, devnet 31337)
});

// asset lookup: HL `meta.universe` → MTF `markets`
const markets = await client.info.markets();
const BTC = markets.findIndex(m => m.name === 'BTC');   // may not be 0

// order / cancel — your strategy logic, native action names
await client.exchange.order({
  asset: BTC, isBuy: true, price: '100', size: '0.1', tif: 'Gtc', reduceOnly: false,
});
```

Стратегия остаётся; клиентский уровень превращается в вызов SDK.

### 2. Бот-наблюдатель за ликвидациями (пополнение маржи)

HL публикует события `liquidation` на уровне partial / market. MTF добавляет **`yellowCard`** как самый ранний сигнал в канале `user_events`.

```typescript
const ws = client.ws();
ws.subscribe('user_events', { user: client.address }, (event) => {
  switch (event.data.kind) {
    case 'yellowCard':
      // T0 — one block to act; ALO orders already cancelled
      deposit(YELLOW_CARD_DEPOSIT);
      break;
    case 'liquidation':
      // T1 partial OR T2 full — too late for prevention
      emergency_unwind();
      break;
  }
});
```

См. [risk-watcher](./risk-watcher.md) для полного паттерна.

### 3. Бот для арбитража ставки финансирования

Периодичность финансирования схожа (по умолчанию ежечасно, настраивается для каждого рынка в MTF). Структура формулы идентична; чтение — это нативный запрос `funding`.

```typescript
const funding = await client.info.fundingHistory({ coin: 'BTC' });
// values may differ from HL because oracle composition differs
const rate = funding[0].rate_per_hr;
```

Состав оракула в MTF управляется отдельно для каждого рынка (зафиксированный `SetOracleWeights`) — если ваш арбитраж зависит от конкретных поставщиков оракула, проверьте список взвешенных источников. См. [цены марк](../concepts/mark-prices.md).

### 4. Мультиаккаунт / институциональная настройка

HL: мастер + агенты на каждый хост. MTF: то же, плюс первоклассные **мультиподписные счета**.

```typescript
// existing: master + agents
await master.approveAgent(host1_agent);
await master.approveAgent(host2_agent);

// new on MTF: convert master to multi-sig for cold custody
await master.convertToMultiSigUser({
  threshold: 2,
  signers: [signer1, signer2, signer3],
});
// every subsequent master-level action then requires 2 sigs;
// agents still work as before for trading actions
```

См. [мультиподпись](../concepts/multi-sig.md).

### 5. Менеджер портфеля на субсчетах

Субсчета HL: до 8. MTF: до 32.

```typescript
// MTF: create one of up to 32 subs
await master.createSubAccount({ name: 'desk-A' });
await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

Управление агентами для каждого субсчёта, подключение PM для каждого субсчёта и режимы маржи для каждого субсчёта — всё поддерживается.

## Справочная таблица

| Действие, которое вы использовали в HL | Действие MTF-native |
|-----------------------|-------------------|
| `order` (выставление limit / IOC / ALO) | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel` (по OID) | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / спот-переводы | нативные действия спот-перевода |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer) (семантика может отличаться) |

## Как получить помощь

- Этот репозиторий (`mtf-exchange/metaflux-knowledges`) — создайте issue.
- Справочник проводного уровня — см. [`POST /exchange`](../api/rest/exchange.md) и [руководство по подписанию](./signing.md).
