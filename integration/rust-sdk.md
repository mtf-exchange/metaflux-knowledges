# Rust SDK

{% hint style="info" %}
**Preview.** The `metaflux-client` crate ships before mainnet; the API shape below is committed.
{% endhint %}

## TL;DR

```toml
[dependencies]
metaflux-client = "0.1"
```

The client is `async` and works with any modern Rust async runtime.

```rust
use metaflux_client::{Client, ClientOpts, OrderParams, Side, Tif};

async fn run() -> anyhow::Result<()> {
    let c = Client::new(ClientOpts {
        private_key: std::env::var("PRIVATE_KEY")?.parse()?,
        base_url:    "https://gateway.devnet.mtf.exchange".into(),  // MTF-native is the gateway default path
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

The client is `Send + Sync` and works in any async context.

## ClientOpts

```rust
pub struct ClientOpts {
    /// 32-byte secp256k1 private key. Mutually exclusive with `signer`.
    pub private_key:    Option<PrivateKey>,

    /// Custom signer (HSM / hardware wallet). Mutually exclusive with `private_key`.
    pub signer:         Option<Box<dyn Signer + Send + Sync>>,

    /// Override `sender` address. Used for agent-wallet pattern.
    pub sender_address: Option<Address>,

    /// Gateway front door (`https://gateway.<net>.mtf.exchange`). The SDK speaks
    /// MTF-native, which is the gateway's default path (`/info` · `/exchange` ·
    /// `/ws`); HL-compat lives under `/hl/*`. Running the node yourself? Point at
    /// `http://localhost:8080`.
    pub base_url:       String,
    pub chain_id:       u64,
    pub timeout:        Duration,           // default 5s
    pub nonce_fn:       Option<NonceFn>,    // default: wall-clock-millis
}
```

## Modules

The client exposes three modules: `info`, `exchange`, `ws`.

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

All return strongly-typed responses; no raw JSON handling required.

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

{% hint style="warning" %}
**Margin controls are perp-only.** `update_leverage`, `update_isolated_margin`,
and `update_margin_mode` apply to perpetual positions only. Spot positions do not
support leverage or isolated margin in V1 — spot trading uses the
reserved-balance escrow model via the spot order path instead.
{% endhint %}

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

The WS client returns `Stream<Item = Result<Event<T>>>`-shaped subscription handles. Drop the handle to unsubscribe.

## Numeric types

Public-spec scaled integers (fixed-point price/size, USDC base units) are wrapped in dedicated types that prevent accidental float arithmetic:

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

Convert from/to a string at the wire layer; do arithmetic on the raw `u128`:

```rust
let price = PriceE8::from_str("10050000000")?;
let notional = price.0 * size.0 / 10u128.pow(8);
```

## Error handling

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

See [error handling](./error-handling.md).

## Custom signer

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

## Agent-signing client

```rust
let agent_client = Client::new(ClientOpts {
    private_key:    Some(agent_priv),
    sender_address: Some(master_addr),    // ← master is sender
    base_url:       "https://gateway.devnet.mtf.exchange".into(),
    chain_id:       31337,
    ..Default::default()
})?;

// every action: sender = master_addr, signed by agent_priv
agent_client.exchange.order(p).await?;
```

## Concurrency

The client is `Send + Sync` and intended to be wrapped in `Arc<Client>` for sharing across tasks. Internal connection pool handles HTTP concurrency; WS subscriptions are per-call.

Nonce generation is monotonic — if you want truly-deterministic nonces across many tasks, supply a `nonce_fn` that pulls from an external counter (Redis, atomic).

## Logging

The crate emits structured logs via the standard structured-logging ecosystem. Set the subscriber in your binary; the client doesn't pin a backend.

## Features

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| Feature | Default | Description |
|---------|:-------:|-------------|
| `ws` | yes | WebSocket support |
| `secp256k1-pure` | yes | Pure-Rust secp256k1 (no native bindings) |
| `secp256k1-c` | no | Native bindings (faster, requires C toolchain) |
| `tls-pure` | yes | Pure-Rust TLS backend (default) |
| `tls-native` | no | System TLS backend |

## Examples

Repository at `mtf-exchange/metaflux-client-rust` ships:

- `examples/quickstart.rs` — place + cancel
- `examples/market_maker.rs` — quote both sides on BTC
- `examples/risk_watcher.rs` — pattern from [risk-watcher](./risk-watcher.md)
- `examples/agent_rotation.rs` — full rotation workflow

## See also

- [Quickstart](./quickstart.md)
- [Signing](./signing.md)
- [Agent wallets howto](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## FAQ

**Q: Is the SDK no-std compatible?**
A: Not in V1. It needs an async runtime and HTTP/WS clients. The signing layer can be lifted out into a `no_std`-friendly crate if there's demand.

**Q: How big is the binary impact?**
A: `~1.5 MB` added to a release binary with default features. `secp256k1-c` shaves ~200 KB.

**Q: Does it support WASM?**
A: Partial — info / exchange work in WASM via the WASM-compatible HTTP backend. WS support depends on the target's WebSocket primitives. Browser WASM: planned.

**Q: Can I use this from an EVM contract?**
A: No. This is an off-chain client. On-chain bridge interactions go through [bridge](../bridge/) primitives.
