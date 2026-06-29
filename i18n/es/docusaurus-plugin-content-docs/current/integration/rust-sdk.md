# SDK de Rust

:::info
**Vista previa.** El crate `metaflux-client` se publica antes del lanzamiento en mainnet; la forma de la API que se muestra a continuación está consolidada.
:::

## TL;DR

```toml
[dependencies]
metaflux-client = "0.1"
```

El cliente es `async` y funciona con cualquier runtime asíncrono moderno de Rust.

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

El cliente implementa `Send + Sync` y puede usarse en cualquier contexto asíncrono.

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

## Módulos

El cliente expone tres módulos: `info`, `exchange` y `ws`.

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

Todas las llamadas devuelven respuestas con tipos fuertes; no es necesario manipular JSON en bruto.

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
**Los controles de margen son exclusivos de contratos perpetuos.** `update_leverage`, `update_isolated_margin`
y `update_margin_mode` solo se aplican a posiciones en contratos perpetuos. Las posiciones al contado no
admiten apalancamiento ni margen aislado en V1 — el trading al contado utiliza el
modelo de escrow con saldo reservado a través de la ruta de órdenes spot.
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

El cliente WS devuelve manejadores de suscripción con la forma `Stream<Item = Result<Event<T>>>`. Al descartar el manejador se cancela la suscripción.

## Tipos numéricos

Los enteros escalados definidos en la especificación pública (precio/tamaño en punto fijo, unidades base de USDC) están envueltos en tipos dedicados que evitan operaciones aritméticas accidentales con coma flotante:

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

Convierte desde y hacia cadena de texto en la capa de transporte; realiza las operaciones aritméticas directamente sobre el `u128` interno:

```rust
let price = PriceE8::from_str("10050000000")?;
let notional = price.0 * size.0 / 10u128.pow(8);
```

## Manejo de errores

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

Consulta [manejo de errores](./error-handling.md).

## Firmante personalizado

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

## Cliente con firma de agente

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

## Concurrencia

El cliente implementa `Send + Sync` y está diseñado para compartirse entre tareas envolviéndolo en un `Arc<Client>`. El pool de conexiones interno gestiona la concurrencia HTTP; las suscripciones WS son por llamada.

La generación de nonces es monótona — si necesitas nonces verdaderamente deterministas entre múltiples tareas, proporciona una `nonce_fn` que obtenga valores de un contador externo (Redis, atómico).

## Registro de eventos

El crate emite registros estructurados a través del ecosistema estándar de logging estructurado. Configura el suscriptor en tu binario; el cliente no impone ningún backend concreto.

## Características

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| Característica | Por defecto | Descripción |
|---------|:-------:|-------------|
| `ws` | yes | Soporte WebSocket |
| `secp256k1-pure` | yes | secp256k1 en Rust puro (sin enlaces nativos) |
| `secp256k1-c` | no | Enlaces nativos (más rápido, requiere toolchain C) |
| `tls-pure` | yes | Backend TLS en Rust puro (por defecto) |
| `tls-native` | no | Backend TLS del sistema |

## Ejemplos

El repositorio `mtf-exchange/metaflux-client-rust` incluye:

- `examples/quickstart.rs` — colocar + cancelar una orden
- `examples/market_maker.rs` — cotizar ambos lados en BTC
- `examples/risk_watcher.rs` — patrón de [vigilancia de riesgo](./risk-watcher.md)
- `examples/agent_rotation.rs` — flujo completo de rotación de agentes

## Véase también

- [Inicio rápido](./quickstart.md)
- [Firma](./signing.md)
- [Guía de wallets de agente](./agent-wallets-howto.md)
- [SDK de TypeScript](./typescript-sdk.md)

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Es el SDK compatible con no-std?**
R: No en V1. Requiere un runtime asíncrono y clientes HTTP/WS. La capa de firma puede extraerse a un crate compatible con `no_std` si hay suficiente demanda.

**P: ¿Cuánto aumenta el tamaño del binario?**
R: Aproximadamente `~1,5 MB` adicionales en un binario de release con las características por defecto. `secp256k1-c` reduce ese peso en unos ~200 KB.

**P: ¿Admite WASM?**
R: Parcialmente — los módulos `info` y `exchange` funcionan en WASM mediante el backend HTTP compatible con WASM. El soporte WS depende de las primitivas WebSocket del entorno de destino. WASM en navegador: planificado.

**P: ¿Puedo usar esto desde un contrato EVM?**
R: No. Este es un cliente off-chain. Las interacciones con el bridge on-chain se realizan a través de las primitivas de [bridge](../bridge/).

</details>
