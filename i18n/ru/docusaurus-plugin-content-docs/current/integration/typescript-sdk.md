# TypeScript SDK

:::info
**Предварительная версия.** Пакет `@metaflux/sdk` выпускается до запуска основной сети; форма API, описанная ниже, зафиксирована.
:::

## Кратко

```bash
npm install @metaflux/sdk
```

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const c = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://devnet-gateway.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
});
```

## Конструктор

```typescript
new MetaFluxClient(opts: ClientOpts)
```

| Поле | Тип | Обязательное | Описание |
|-------|------|----------|-------------|
| `privateKey` | hex-строка или `Uint8Array` | да (если не задан `signer`) | 32-байтовый закрытый ключ secp256k1 |
| `signer` | `Signer` | да (если не задан `privateKey`) | Пользовательский подписант (HSM / WalletConnect / Ledger) |
| `senderAddress` | hex-адрес | опционально | Если задан, используется как `sender`; адрес подписанта определяется из ключа подписи. Для [паттерна агентского кошелька](./agent-wallets-howto.md). |
| `baseUrl` | string | да | Точка входа шлюза (`https://<сеть>-gateway.mtf.exchange`). SDK использует протокол MTF-native, который обслуживается шлюзом по адресам `/info` · `/exchange` · `/ws`. Запускаете узел самостоятельно? Укажите `http://localhost:8080`. См. [сети](../networks.md). |
| `chainId` | number | да | Зависит от сети — см. [сети](../networks.md) |
| `timeoutMs` | number | опционально (по умолчанию 5000) | Таймаут HTTP-запросов |
| `nonceFn` | `() => number` | опционально (по умолчанию `Date.now`) | Пользовательский генератор нонса |

## Модули

Клиент предоставляет три модуля: `info`, `exchange`, `ws`.

### `info`

Все типы запросов `POST /info`. Методы возвращают типизированные ответы.

```typescript
c.info.meta();
c.info.allMids();
c.info.l2Book({ coin: 'BTC', depth: 20 });
c.info.clearinghouseState();                   // implicit user=address
c.info.openOrders();
c.info.userFills({ sinceTs: 0, limit: 1000 });
c.info.fundingHistory({ asset: 0 });
c.info.feeSchedule();
c.info.vaultState({ vault: '0x...' });
c.info.subAccounts();
c.info.agents();
c.info.userFees();
```

### `exchange`

Все типы действий `POST /exchange`.

```typescript
c.exchange.order(p: OrderParams): Promise<OrderResult>;
c.exchange.cancel(p: CancelParams): Promise<CancelResult>;
c.exchange.cancelByCloid(p: CancelByCloidParams): Promise<CancelResult>;
c.exchange.modifyOrder(p: ModifyOrderParams): Promise<OrderResult>;
c.exchange.batchModify(p: BatchModifyParams): Promise<OrderResult[]>;
c.exchange.scaleOrder(p: ScaleOrderParams): Promise<OrderResult[]>;
c.exchange.twapOrder(p: TwapOrderParams): Promise<TwapResult>;
c.exchange.twapCancel(p: { twapId: string }): Promise<void>;
c.exchange.trigger(p: TriggerParams): Promise<OrderResult>;

c.exchange.updateLeverage(p: { asset: number; leverage: number }): Promise<void>;
c.exchange.updateIsolatedMargin(p: UpdateIsolatedMarginParams): Promise<void>;
c.exchange.updateMarginMode(p: { asset: number; mode: MarginMode }): Promise<void>;
c.exchange.userPortfolioMargin(p: { enabled: boolean }): Promise<void>;
// Margin controls (updateLeverage / updateIsolatedMargin / updateMarginMode)
// are perp-only. Spot positions do not support leverage or isolated margin in
// V1 — spot uses the reserved-balance escrow model via the spot order path.

c.exchange.approveAgent(p: ApproveAgentParams): Promise<{ actionHash: string }>;
c.exchange.createSubAccount(p: { name: string; explicitIndex?: number }): Promise<SubAccountResult>;
c.exchange.subAccountTransfer(p: SubAccountTransferParams): Promise<void>;

c.exchange.usdcTransfer(p: { to: string; amountE6: string }): Promise<void>;
c.exchange.withdrawUsdc(p: WithdrawUsdcParams): Promise<{ burnTxHash: string }>;

c.exchange.rfqRequest(p: RfqRequestParams): Promise<{ rfqId: string }>;
c.exchange.rfqQuote(p: RfqQuoteParams): Promise<{ quoteId: string }>;
c.exchange.rfqAccept(p: { rfqId: string; quoteId: string }): Promise<void>;

c.exchange.fbaOrder(p: FbaOrderParams): Promise<OrderResult>;
```

:::warning
**Управление маржой доступно только для бессрочных контрактов.** `updateLeverage`, `updateIsolatedMargin` и
`updateMarginMode` применяются исключительно к позициям по бессрочным контрактам. Спотовые позиции не
поддерживают кредитное плечо или изолированную маржу в V1 — спотовая торговля использует
модель эскроу с резервированием баланса через путь спотовых ордеров.
:::

### `ws`

Возвращает экземпляр `MetaFluxWs`, который мультиплексирует подписки.

```typescript
const ws = c.ws();

ws.on('open',  () => console.log('connected'));
ws.on('close', (code) => console.log('disconnected', code));

const sub1 = ws.subscribe('l2Book', { coin: 'BTC' }, (event) => {
  // event.data has the typed payload
});

const sub2 = ws.subscribe('userEvents', { user: c.address }, (event) => {
  switch (event.data.kind) {
    case 'fill': /* ... */ break;
    case 'orderCancelled': /* ... */ break;
  }
});

await sub1.unsubscribe();
ws.close();
```

WS-клиент обеспечивает:
- Автоматическое переподключение с экспоненциальной задержкой
- Отслеживание `seq` для каждой подписки и `resume` при переподключении
- Обновление аутентификации для приватных подписок (скользящее окно)
- Keepalive через ping/pong

## Обработка ошибок

SDK генерирует типизированные ошибки:

```typescript
try {
  await c.exchange.order({ ... });
} catch (e) {
  if (e instanceof RateLimitError)    { await sleep(e.retryAfterMs); /* retry */ }
  else if (e instanceof AuthError)    { /* signing bug — escalate */ }
  else if (e instanceof CommitError)  { /* committed but state-machine rejected */ }
  else if (e instanceof NetworkError) { /* unknown outcome — reconcile */ }
  else                                 { throw e; }
}
```

См. [обработку ошибок](./error-handling.md) для дерева принятия решений.

## Пользовательский подписант (HSM / аппаратный кошелёк)

```typescript
import { Signer } from '@metaflux/sdk';

class HsmSigner implements Signer {
  async sign(digest: Uint8Array): Promise<Uint8Array> {
    // Forward digest to HSM; return 65-byte r||s||v
  }
  getAddress(): string { return '0x...'; }
}

const c = new MetaFluxClient({
  signer:      new HsmSigner(),
  baseUrl:     'https://devnet-gateway.mtf.exchange',
  chainId:     31337,
});
```

SDK передаёт уже захешированный `signed_hash` в `Signer.sign` — вашему HSM не нужно ничего знать о кодировании EIP-712.

## Настройка клиента с агентской подписью

Для [паттерна агентских кошельков](./agent-wallets-howto.md):

```typescript
const agent = new MetaFluxClient({
  privateKey:    agentPrivKey,
  senderAddress: masterAddress,  // ← master is the sender
  baseUrl:       'https://devnet-gateway.mtf.exchange',
  chainId:       31337,
});

// every action this client sends:
//   sender = masterAddress
//   signature = signed by agentPrivKey
```

## Типовые паттерны

### Размещение ордера и подтверждение

```typescript
const cloid = '0x' + randomBytes(16).toString('hex');

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
  cloid,
});

// wait for commit confirmation
const filled = new Promise((resolve) => {
  const sub = c.ws().subscribe('orderEvents', { user: c.address }, (event) => {
    if (event.data.cloid === cloid && event.data.kind === 'resting') {
      sub.unsubscribe();
      resolve(event.data);
    }
  });
});

await filled;
```

### Отмена всех ордеров

```typescript
const orders = await c.info.openOrders();
await Promise.all(orders.map(o => c.exchange.cancel({ asset: o.asset, oid: o.oid })));
```

### Подписка и сохранение данных

```typescript
const fills = [];
c.ws().subscribe('userFills', { user: c.address }, (e) => {
  for (const fill of e.data.fills) fills.push(fill);
});
```

## Работа с числами

Все поля с фиксированной точкой и базовые единицы USDC передаются как `string` как на входе, так и на выходе. SDK не приводит значения к `number`, поскольку IEEE-754 молча теряет точность при числах больше 2^53.

Для арифметических операций используйте библиотеку для работы с большими числами (`bigint`, `bignumber.js` и т.п.):

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## Логирование

Передайте `logger: console` (или любой объект вида `{ debug, info, warn, error }`) для захвата внутренних трассировок SDK:

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

Уровни логирования: `debug` (всё), `info` (допуск и WS-соединения), `warn` (повторные попытки), `error` (фатальные сбои).

## Смотрите также

- [Быстрый старт](./quickstart.md) — сквозной пример за 5 минут
- [Подписание](./signing.md) — что SDK делает внутри
- [Руководство по агентским кошелькам](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — полный перечень действий
- [WS-подписки](../api/ws/subscriptions.md) — каталог каналов
- [Rust SDK](./rust-sdk.md)

## Часто задаваемые вопросы

<details>
<summary>Показать FAQ</summary>

**В: Поддерживает ли SDK браузеры?**
О: Да — сборка ES2020 с браузерными полифилами для `secp256k1` и `keccak256`. Используйте импорт из `@metaflux/sdk/browser`, если ваш бандлер не исключает Node-зависимости через tree-shaking.

**В: Насколько тяжёлый пакет при установке?**
О: ~150 КБ в минифицированном виде (без криптографических примитивов, которые поддерживают tree-shaking). Криптографический слой добавляет ~50 КБ.

**В: Какое дерево зависимостей?**
О: `ethereum-cryptography` (или эквиваленты из `@noble/*`), `@msgpack/msgpack`, `ws` (только Node). Все лицензированы по MIT. Транзитивные зависимости с непермиссивными лицензиями отсутствуют.

**В: Можно ли подключить собственный HTTP-транспорт (axios, undici)?**
О: Да — передайте `transport: { request: async (req) => ... }` в конструктор.

</details>
