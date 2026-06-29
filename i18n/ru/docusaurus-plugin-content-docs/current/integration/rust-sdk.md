# Rust SDK

:::info
**Предварительная версия.** Крейт `metaflux-client` выпускается до запуска мейннета; форма API, описанная ниже, зафиксирована.
:::

## Кратко

```toml
[dependencies]
metaflux-client = "0.1"
```

Клиент является `async` и работает с любым современным асинхронным рантаймом Rust.

```rust
use metaflux_client::{Client, ClientOpts, OrderParams, Side, Tif};

async fn run() -> anyhow::Result<()> {
    let c = Client::new(ClientOpts {
        private_key: std::env::var("PRIVATE_KEY")?.parse()?,
        base_url:    "https://devnet-gateway.mtf.exchange".into(),  // MTF-native is the gateway default path
        chain_id:    31337,
        ..Default::default()
    })?;

    c.exchange.order(OrderParams {
        asset:   0,
        side:    Side::Buy,
        price:   "50000".into(),
        size:    "0.1".into(),
        tif:     Tif::Gtc,
        ..Default::default()
    }).await?;

    Ok(())
}
```

Клиент реализует `Send + Sync` и работает в любом асинхронном контексте.

## ClientOpts

```rust
pub struct ClientOpts {
    /// 32-byte secp256k1 private key. Mutually exclusive with `signer`.
    pub private_key:    Option<PrivateKey>,

    /// Custom signer (HSM / hardware wallet). Mutually exclusive with `private_key`.
    pub signer:         Option<Box<dyn Signer + Send + Sync>>,

    /// Override `sender` address. Used for agent-wallet pattern.
    pub sender_address: Option<Address>,

    /// Gateway front door (`https://<net>-gateway.mtf.exchange`). The SDK speaks
    /// MTF-native, served by the gateway at `/info` · `/exchange` · `/ws`.
    /// Running the node yourself? Point at `http://localhost:8080`.
    pub base_url:       String,
    pub chain_id:       u64,
    pub timeout:        Duration,           // default 5s
    pub nonce_fn:       Option<NonceFn>,    // default: wall-clock-millis
}
```

## Модули

Клиент предоставляет три модуля: `info`, `exchange`, `ws`.

### `info`

```rust
c.info.meta().await?;
c.info.all_mids().await?;
c.info.l2_book(L2BookArgs { coin: "BTC".into(), depth: 20 }).await?;
c.info.clearinghouse_state().await?;  // self
c.info.open_orders().await?;
c.info.user_fills(UserFillsArgs { since_ts: 0, limit: 1000 }).await?;
c.info.funding_history(FundingHistoryArgs { asset: 0, since_ts: 0, limit: 1000 }).await?;
c.info.fee_schedule().await?;
c.info.vault_state(VaultStateArgs { vault: "0x...".parse()? }).await?;
c.info.sub_accounts().await?;
c.info.agents().await?;
c.info.user_fees().await?;
```

Все методы возвращают строго типизированные ответы; ручная обработка сырого JSON не требуется.

### `exchange`

```rust
c.exchange.order(OrderParams { .. }).await?;
c.exchange.cancel(CancelParams { .. }).await?;
c.exchange.cancel_by_cloid(CancelByCloidParams { .. }).await?;
c.exchange.modify_order(ModifyOrderParams { .. }).await?;
c.exchange.batch_modify(BatchModifyParams { .. }).await?;
c.exchange.scale_order(ScaleOrderParams { .. }).await?;
c.exchange.twap_order(TwapOrderParams { .. }).await?;
c.exchange.twap_cancel(TwapCancelParams { .. }).await?;
c.exchange.trigger(TriggerParams { .. }).await?;

c.exchange.update_leverage(UpdateLeverageParams { .. }).await?;
c.exchange.update_isolated_margin(UpdateIsolatedMarginParams { .. }).await?;
c.exchange.update_margin_mode(UpdateMarginModeParams { .. }).await?;
c.exchange.user_portfolio_margin(UserPortfolioMarginParams { .. }).await?;
// Margin controls (update_leverage / update_isolated_margin / update_margin_mode)
// apply to perpetual positions only. Spot trading uses the reserved-balance
// escrow model and does not support leverage in V1.

c.exchange.approve_agent(ApproveAgentParams { .. }).await?;
c.exchange.create_sub_account(CreateSubAccountParams { .. }).await?;
c.exchange.sub_account_transfer(SubAccountTransferParams { .. }).await?;

c.exchange.usdc_transfer(UsdcTransferParams { .. }).await?;
c.exchange.withdraw_usdc(WithdrawUsdcParams { .. }).await?;

c.exchange.rfq_request(RfqRequestParams { .. }).await?;
c.exchange.rfq_quote(RfqQuoteParams { .. }).await?;
c.exchange.rfq_accept(RfqAcceptParams { .. }).await?;

c.exchange.fba_order(FbaOrderParams { .. }).await?;
```

:::warning
**Управление маржой — только для бессрочных контрактов.** `update_leverage`, `update_isolated_margin`
и `update_margin_mode` применяются исключительно к позициям по бессрочным контрактам. Спотовые позиции не
поддерживают кредитное плечо или изолированную маржу в V1 — спотовая торговля использует
модель эскроу с зарезервированным балансом через спотовый путь выставления ордеров.
:::

### `ws`

```rust
let ws = c.ws();

let mut stream = ws.subscribe_l2_book("BTC", 20).await?;
while let Some(event) = stream.next().await {
    println!("l2_book: {:?}", event?);
}

let mut user = ws.subscribe_user_events(c.address()).await?;
while let Some(event) = user.next().await {
    match event?.data {
        UserEvent::Fill(fill)       => { /* ... */ }
        UserEvent::OrderCancelled(o) => { /* ... */ }
        _ => {}
    }
}
```

WS-клиент возвращает дескрипторы подписки в форме `Stream<Item = Result<Event<T>>>`. Чтобы отписаться, достаточно уничтожить дескриптор.

## Числовые типы

Масштабированные целые числа из публичной спецификации (цена и размер в формате с фиксированной точкой, единицы базы USDC) обёрнуты в специальные типы, исключающие случайную арифметику с плавающей точкой:

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

Преобразование из строки и обратно выполняется на транспортном уровне; арифметические операции производятся над сырым `u128`:

```rust
let price = PriceE8::from_str("10050000000")?;
let notional = price.0 * size.0 / 10u128.pow(8);
```

## Обработка ошибок

```rust
pub enum ClientError {
    Network(NetworkError),     // unknown outcome — reconcile
    Auth(AuthError),           // signing / chainId / agent — do not retry
    Logical(LogicalError),     // 422 — fix and retry
    RateLimit(RateLimitError), // 429 — backoff via retry_after_ms
    Commit(CommitError),       // post-admit state-machine error
    Other(anyhow::Error),
}

let result = c.exchange.order(p).await;
match result {
    Ok(r) => { /* admitted */ }
    Err(ClientError::RateLimit(rl)) => {
        sleep_async(rl.retry_after).await;
        // retry
    }
    Err(ClientError::Network(_)) => {
        // reconcile via cloid
    }
    Err(e) => return Err(e.into()),
}
```

См. [обработку ошибок](./error-handling.md).

## Кастомный подписчик

```rust
use metaflux_client::Signer;

struct HsmSigner;

#[async_trait::async_trait]
impl Signer for HsmSigner {
    async fn sign(&self, digest: &[u8; 32]) -> Result<[u8; 65]> {
        // Forward digest to HSM; return r||s||v
        todo!()
    }
    fn address(&self) -> Address { todo!() }
}

let c = Client::new(ClientOpts {
    signer: Some(Box::new(HsmSigner)),
    ..
})?;
```

## Клиент с подписью агента

```rust
let agent_client = Client::new(ClientOpts {
    private_key:    Some(agent_priv),
    sender_address: Some(master_addr),    // ← master is sender
    base_url:       "https://devnet-gateway.mtf.exchange".into(),
    chain_id:       31337,
    ..Default::default()
})?;

// every action: sender = master_addr, signed by agent_priv
agent_client.exchange.order(p).await?;
```

## Параллелизм

Клиент реализует `Send + Sync` и предназначен для совместного использования в нескольких задачах через `Arc<Client>`. Внутренний пул соединений управляет параллелизмом HTTP; подписки WS создаются для каждого вызова отдельно.

Генерация нонса монотонна — если вам нужны строго детерминированные нонсы при работе множества задач, передайте `nonce_fn`, которая получает значение из внешнего счётчика (Redis, атомарная переменная).

## Логирование

Крейт генерирует структурированные логи через стандартную экосистему структурированного логирования. Задайте subscriber в своём исполняемом файле; клиент не привязывается к конкретному бэкенду.

## Фичи

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| Фича | По умолчанию | Описание |
|---------|:-------:|-------------|
| `ws` | yes | Поддержка WebSocket |
| `secp256k1-pure` | yes | Реализация secp256k1 на чистом Rust (без нативных биндингов) |
| `secp256k1-c` | no | Нативные биндинги (быстрее, требует C-тулчейн) |
| `tls-pure` | yes | TLS-бэкенд на чистом Rust (по умолчанию) |
| `tls-native` | no | Системный TLS-бэкенд |

## Примеры

Репозиторий `mtf-exchange/metaflux-client-rust` содержит:

- `examples/quickstart.rs` — выставление и отмена ордера
- `examples/market_maker.rs` — выставление котировок с обеих сторон по BTC
- `examples/risk_watcher.rs` — паттерн из раздела [risk-watcher](./risk-watcher.md)
- `examples/agent_rotation.rs` — полный цикл ротации агентов

## Смотрите также

- [Быстрый старт](./quickstart.md)
- [Подпись](./signing.md)
- [Руководство по кошелькам-агентам](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## Часто задаваемые вопросы

<details>
<summary>Показать FAQ</summary>

**В: Совместим ли SDK со средой no-std?**
О: Нет, в V1 — не совместим. Для работы требуются асинхронный рантайм и HTTP/WS-клиенты. Уровень подписи можно вынести в отдельный `no_std`-совместимый крейт при наличии спроса.

**В: Как сильно увеличится размер бинарного файла?**
О: Около `~1.5 MB` к release-бинарнику при настройках по умолчанию. Использование `secp256k1-c` позволяет сэкономить ~200 KB.

**В: Поддерживается ли WASM?**
О: Частично — модули info и exchange работают в WASM через совместимый HTTP-бэкенд. Поддержка WS зависит от примитивов WebSocket целевой платформы. Поддержка браузерного WASM: запланирована.

**В: Можно ли использовать SDK из EVM-контракта?**
О: Нет. Это офчейн-клиент. Взаимодействие с мостом на уровне блокчейна осуществляется через примитивы [bridge](../bridge/).

</details>
