# Миграция с HL

:::info
**Предварительная версия.** Уровень совместимости с HL охватывает `POST /info` (15 типов запросов) и `POST /exchange` (сегодня — размещение ордеров и отмена, со временем появятся новые типы действий).
:::

Если ваш бот уже работает по протоколу HL, вы можете переключить его на MetaFlux **без изменения кода** для поддерживаемой части API — те же формы URL, тот же JSON запросов/ответов, та же оболочка EIP-712.

## Что работает из коробки

- `POST /info` для: `meta`, `allMids`, `userState`, `clearinghouseState`, `openOrders`, `frontendOpenOrders`, `userFills`, `historicalOrders`, `metaAndAssetCtxs`, `l2Book`, `vaultDetails`, `delegations`, `userFees`, `subAccounts`, `referral`
- `POST /exchange` для: `order` (выставление лимитного ордера / IOC / ALO), `cancel` (отмена по OID)
- WS-подписки (скоро) будут использовать те же названия каналов, что и HL

## Что изменилось

### 1. Chain ID

MetaFlux — собственная L1-сеть, а не развёртывание HL. Подписывайте транзакции с использованием chain ID MetaFlux, а **не** HL:

| Сеть | HL `chainId` | MTF `chainId` |
|---------|--------------|---------------|
| Mainnet | 1337 | **8964** (`0x2304`) |
| Testnet | 998 | **114514** (`0x1bf52`) |
| Devnet / local | 1337 | **31337** (`0x7a69`) |

Измените одну константу в коде подписи — остальная оболочка EIP-712 идентична. В домене MTF используются `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`.

### 2. Базовый URL

```
HL:  https://<your-current-hl-api-base>/{info,exchange}
MTF: https://gateway.<your-deployment>/hl/{info,exchange}
```

Шлюз (gateway) — единая точка входа. Уровень совместимости с HL находится по пути `/hl/*`
(`/hl/info`, `/hl/exchange`, `/hl/ws`) — клиент HL просто добавляет префикс `/hl`.
Корневой путь шлюза по умолчанию (`/info`, `/exchange`) — это нативный MTF API;
при самостоятельном запуске ноды тот же API доступен по адресу
`http://localhost:8080`.

### 3. Типы действий, ещё не перенесённые в слой совместимости

Если ваш бот использует HL-действия помимо `order` / `cancel`, шлюз на сегодня возвращает:

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

при HTTP 200. HL-конвенция предписывает передавать ошибки как 200 с `status: "err"` — MTF её сохраняет.

Полное покрытие HL-действий будет добавлено в последующих релизах. Если вам нужны новые действия уже сейчас, используйте [нативную поверхность действий MTF](../api/rest/exchange.md) напрямую — там реализовано полное покрытие функций, в том числе возможности, которых нет в HL (RFQ, FBA, подключение портфельной маржи, межсетевые примитивы).

### 4. Идентификаторы активов

HL и MTF оба используют целочисленные ID активов, но **эти числа не совпадают**. `0` в HL — бессрочный контракт на BTC; `0` в MTF может быть ETH или чем-то другим — в зависимости от развёртывания. Всегда запрашивайте ID активов через `POST /info { "type": "meta" }` при старте; никогда не задавайте их в коде как константы.

### 5. Числовая точность

Обе сети используют масштабированные целые числа (например, `px`) и передают их как строки в JSON, поскольку IEEE-754 теряет точность после 2^53. Если ваш бот разбирает JSON стандартным `JSON.parse` в JS — переключитесь на парсер с поддержкой больших целых для этих полей. Формат данных совпадает с HL, но риск потери точности (без каких-либо предупреждений) — тот же.

### 6. Поведение при ликвидации

MetaFlux добавляет [предупредительный уровень T0 («жёлтая карточка»)](../concepts/tiered-liquidation.md), которого нет в HL. Практический эффект: при здоровье счёта в диапазоне `[1.0, 1.1)` все ожидающие ALO-ордера принудительно отменяются и генерируется предупредительное событие, однако позиции остаются нетронутыми. Уровни T1 / T2 / T3 ведут себя как Partial / Market / Backstop в HL.

Если ваш бот отслеживает события ликвидации для пополнения маржи, **добавьте обработчик нового события T0** — это ранний предупредительный сигнал, которого HL не предоставляет. Его перехват даёт один блок времени для принятия мер.

### 7. Семантика агентского кошелька

В HL агент — это ключ без права на вывод средств. В MTF так же — см. [агентские кошельки](../concepts/agent-wallets.md). Название действия — `ApproveAgent`; формат данных совпадает с HL. Одно механическое отличие: подтверждение агента в MTF вступает в силу **через один блок после коммита**, тогда как в HL обычно требуется два блока. Немного быстрее; та же процедура активации.

### 8. Хранилища (Vaults)

Хранилища HL и MetaFlux — разные продукты. `vaultDetails` возвращает информацию о собственных типах хранилищ MTF (MFlux Vault, пользовательские хранилища). Адреса хранилищ HL не будут найдены. Формат запроса совпадает — просто ожидайте сущностей MTF, а не HL.

## Пошаговая миграция

### День 0 — переключение на MetaFlux

1. Измените базовый URL в конфигурации вашего клиента.
2. Измените константу `chainId` в вашем модуле подписи.
3. Запустите существующий набор тестов против devnet MTF. Запросы `order` / `cancel` и все `info`-запросы должны проходить без изменений в коде.

### День 1 — закрытие пробелов в покрытии действий

Для HL-действий, ещё не перенесённых в слой совместимости MTF:

- **Изменение ордеров** — пока: отмена + повторное выставление. Действие `modify` появится в следующем обновлении совместимости.
- **Установка кредитного плеча / режима маржи** — используйте нативное действие MTF через `POST /exchange` по корневому пути шлюза (`UpdateLeverage`, `UpdateIsolatedMargin`). Та же оболочка EIP-712; другое название варианта действия.
- **Перевод / вывод** — нативный MTF.

### День 2 — подключение новых сигналов

- Подпишитесь на `subAccounts` в info, если управляете субсчётами (семантика немного отличается — MTF допускает до 32 субсчётов на один мастер-аккаунт).
- Добавьте обработчик событий T0 («жёлтая карточка»). Удобнее всего — в том же потоке заполнений/ликвидаций, который вы уже обрабатываете; форма события: `{ "type": "yellowCard", "user": "0x...", "block": N }`.
- Если вы зависите от портфельной маржи: выполните повторную регистрацию в MTF (`UserPortfolioMargin { enabled: true }`). Пороговые значения и набор сценариев — сетевые параметры, см. [портфельная маржа](../concepts/portfolio-margin.md).

### День 3+ — использование возможностей только MTF

Опционально. Если вы хотите использовать функции, которых нет в HL:

- **RFQ** — примитивы запроса котировки (request-for-quote), полезны для объёмов, которые не нужно показывать в стакане
- **FBA** — сопоставление ордеров в частом пакетном аукционе (frequent batch auction) для выбранных рынков, снижает MEV
- **Межсетевые примитивы** — примитивы моста, вызываемые нативно из EVM-контрактов

Это нативные MTF-действия, отправляемые по корневому пути шлюза (`POST /exchange` — нативный MTF используется по умолчанию; совместимость с HL — под `/hl/*`; см. [обзор API](../api/index.md)).

## 5 типичных паттернов HL-ботов — конкретная миграция

### 1. Простой маркет-мейкер на лимитных ордерах (канонический паттерн)

```diff
- const HL_URL = 'https://<your-current-hl-api-base>';
+ const MTF_URL = 'https://gateway.mtf.exchange/hl';   // HL-compat is under /hl/*

- const HL_CHAIN_ID = 1337;
+ const MTF_CHAIN_ID = 114514;    // testnet (mainnet 8964, devnet 31337)

- const HL_DOMAIN_NAME = 'HLSignTransaction';   // varies by mode
+ const MTF_DOMAIN_NAME = 'MetaFlux';
+ const MTF_DOMAIN_VERSION = '1';

  // asset lookup runs against /info { type: "meta" } — same call, different result
  const meta = await fetch(MTF_URL + '/info', {
    method: 'POST',
    body: JSON.stringify({ type: 'meta' }),
  }).then(r => r.json());

  const BTC = meta.universe.findIndex(m => m.name === 'BTC');  // may not be 0

  // order, cancel — unchanged HL wire shape
  await place_order(BTC, 'B', '100', '0.1', 'Gtc');
```

Изменение `chainId` и базового URL занимает около 5 минут для типичного клиента.

### 2. Бот-наблюдатель за ликвидациями (пополнение маржи)

HL генерирует события `liquidation`, когда счета достигают уровня частичной / рыночной ликвидации. MTF добавляет **`yellowCard`** как самый ранний сигнал.

```diff
  ws.subscribe('userEvents', { user: address }, (event) => {
    switch (event.data.kind) {
+     case 'yellowCard':
+       // T0 — one block to act. ALO orders already cancelled.
+       deposit(YELLOW_CARD_DEPOSIT);
+       break;
      case 'liquidation':
-       // HL partial / market
+       // T1 partial OR T2 full — too late for prevention
        emergency_unwind();
        break;
    }
  });
```

Полный паттерн описан в [risk-watcher](./risk-watcher.md).

### 3. Бот-арбитражник по ставке финансирования

Периодичность финансирования схожа (в HL — раз в час; в MTF — раз в час по умолчанию, но настраивается для каждого рынка). Структура формулы идентична.

```diff
  // URL is the /hl base from pattern 1 (gateway .../hl) — HL-compat shape
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

Состав оракула MTF управляется на уровне каждого рынка (зафиксировано в `SetOracleWeights`) — если ваш арбитраж зависит от конкретных провайдеров оракула, проверьте, совпадает ли взвешенный список источников с вашими ожиданиями. См. [цены маркировки](../concepts/mark-prices.md).

### 4. Мультисчётная / институциональная конфигурация

HL: мастер + агенты на каждом хосте. MTF: то же самое, плюс полноценные **мультиподписные счета**.

```diff
  // existing: master + agents
  await master.approveAgent(host1_agent);
  await master.approveAgent(host2_agent);

+ // new on MTF: convert master to multi-sig for cold custody
+ await master.convertToMultiSigUser({
+   threshold: 2,
+   signers: [signer1, signer2, signer3],
+ });
+ // every subsequent master-level action requires 2 sigs
+ // agents still work as before for trading actions
```

См. [мультиподпись](../concepts/multi-sig.md).

### 5. Менеджер портфеля на субсчётах

Субсчета HL: до 8. MTF: до 32. Формат данных совпадает:

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

Управление агентами на уровне субсчёта, подключение PM на уровне субсчёта, режимы маржи на уровне субсчёта — всё поддерживается идентично.

## Справочная таблица

| Действие в HL | Статус в MTF |
|----------------------|---------------|
| `order` (place limit / IOC / ALO) | ✅ Поддерживается в формате HL-compat |
| `cancel` (by OID) | ✅ Поддерживается в формате HL-compat |
| `cancelByCloid` | выкатывается |
| `modify` | выкатывается |
| `batchModify` | выкатывается |
| `usdSend` / spot transfers | используйте нативный MTF |
| `withdraw3` | используйте нативный MTF |
| `approveAgent` | нативный формат MTF; см. [агентские кошельки](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | нативный формат MTF |
| `usdClassTransfer` | используйте нативный эквивалент MTF |
| `convertToMultiSigUser` | нативный MTF, предварительная версия |
| `setReferrer` / `createReferral` | нативный MTF; семантика может отличаться |

(Таблица обновляется по мере расширения поддержки слоя совместимости.)

## Получение помощи

- Этот репозиторий (`mtf-exchange/metaflux-knowledges`) — откройте задачу (issue)
- См. [`POST /exchange`](../api/rest/exchange.md) и [руководство по подписи](./signing.md) для справки по формату данных
