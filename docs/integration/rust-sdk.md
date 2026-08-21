# Rust SDK

:::info
**Preview.** The `metaflux-client` crate ships before mainnet; the API shape below is committed.
:::

## TL;DR {#tldr}

```toml
[dependencies]
metaflux-client = "0.20"
```

The client is `async` and works with any modern Rust async runtime (the crate itself uses `tokio`).

```rust
use metaflux_client::{
    Client,
    types::{MarketId, order::{Order, OrderKind, OrderStatus, Side, StpMode, TimeInForce}},
    wallet::Wallet,
};

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let wallet = Wallet::from_hex(&std::env::var("PRIVATE_KEY")?)?;
    let client = Client::new("https://api.devnet.mtf.exchange")?;

    let markets = client.rest().info().markets().await?;
    println!("{} markets available", markets.len());

    let order = Order {
        owner: wallet.address(),
        market: MarketId(0),
        side: Side::Bid,
        kind: OrderKind::Limit,
        size: 1_000,                 // raw lots, scaled by the market's size_decimals
        limit_px: 5_000_000_000_000, // 1e8 fixed-point plane
        tif: TimeInForce::Gtc,
        stp_mode: StpMode::CancelOldest,
        reduce_only: false,
        cloid: None,
        builder: None,
        position_side: None,
        trigger: None,
    };

    let resp = client.exchange().submit_order(&wallet, &order).await?;
    for status in &resp.statuses {
        match status {
            OrderStatus::Resting(r) => println!("resting: oid={}", r.oid.0),
            OrderStatus::Filled(f) => println!("filled: oid={} avg_px={}", f.oid.0, f.avg_px),
            OrderStatus::Error(msg) => println!("rejected: {msg}"),
        }
    }
    Ok(())
}
```

There is no `ClientOpts` type and no `.exchange` / `.info` field on `Client`. `Client::new(base_url)` takes only the base URL — a `Wallet` is a separate value, passed explicitly to every signing call. Reads live under `client.rest().info()`; writes under `client.exchange()`, which takes `(&wallet, &params)` per call, not a client-level signer.

## `Client` and `Wallet` {#client-and-wallet}

```rust
impl Client {
    pub fn new(base_url: impl Into<String>) -> Result<Self, ClientError> { /* ... */ }
}
impl Wallet {
    pub fn from_hex(s: &str) -> Result<Self, ClientError> { /* ... */ }
}
```

`Client::new` takes a plain base URL string (`"https://api.<net>.mtf.exchange"`, no trailing slash) — the SDK speaks MTF-native, served at `/info` · `/exchange` · `/ws`. Running the node yourself? Point at `http://127.0.0.1:8080`.

`Wallet` holds a raw secp256k1 key. It is not part of `Client` construction — build one from a 32-byte hex private key with `Wallet::from_hex`, and pass `&wallet` to every `client.exchange()` method that needs to sign. A `Client` needs no key at all for reads.

`Client` is cheap to `.clone()` — it wraps a connection-pooled `reqwest::Client` internally — so share it across tasks by cloning rather than wrapping in `Arc`.

## Reads: `client.rest().info()` {#reads}

```rust
let info = client.rest().info();

info.node_info().await?;
info.markets().await?;                          // Vec<MarketDynamic> — live px/funding/OI
info.markets_meta().await?;                      // Vec<MarketInfo> — precision grids, leverage ladders
info.l2_book("BTC", None).await?;
info.account_state(wallet.address()).await?;     // full account snapshot
info.open_orders(wallet.address()).await?;
info.user_fills(wallet.address(), None).await?;
info.funding_history("BTC").await?;
info.fee_schedule().await?;
info.vault_state(vault_addr).await?;
info.sub_accounts(wallet.address()).await?;
info.agents(wallet.address()).await?;            // approved agents for this address
```

All return strongly-typed responses. Market reads key by `coin` (`&str` symbol); account reads key by [`wallet::Address`]. `info.raw(json!({...})).await?` is the escape hatch for a query without a dedicated wrapper.

## Writes: `client.exchange()` {#writes}

Every signed action takes `(&wallet, &params)`:

```rust
use metaflux_client::types::{
    MarketId,
    account::{ApproveAgent, UpdateIsolatedMargin, UpdateLeverage},
    order::CancelOrder,
    twap::TwapOrder,
};

let exchange = client.exchange();

exchange.cancel_order(&wallet, &CancelOrder {
    owner: wallet.address(), market: MarketId(0), oid: Some(order_id), cloid: None,
}).await?;

exchange.update_leverage(&wallet, &UpdateLeverage {
    asset: MarketId(0), leverage: 10, is_isolated: false,
}).await?;

exchange.update_isolated_margin(&wallet, &UpdateIsolatedMargin {
    asset: MarketId(0), delta: "-12.5".to_string(), // signed decimal STRING
}).await?;

exchange.approve_agent(&wallet, &ApproveAgent {
    agent: agent_address, name: Some("mm-host-3".to_string()), expires_at_ms: Some(expiry_ms),
}).await?;

exchange.twap_order(&wallet, &TwapOrder {
    market: MarketId(0), side: Side::Bid, total_size: 10_000, slice_count: 10,
    delay_ms: 500, reduce_only: false, position_side: None, randomize: false,
}).await?;
```

Most write methods return `Result<Value, ClientError>` (a raw JSON admission ack); `submit_order` / `batch_order` / `batch_modify` return the typed `OrderResponse` shown in the TL;DR. The full surface — cancel-by-cloid, batch order/cancel/modify, scale/chase orders, vaults, staking, spot-margin/Earn, RFQ/FBA — is one method per action on `Exchange`; see [`POST /exchange`](../api/rest/exchange.md) for the canonical action catalog and the crate's `rest::exchange` module docs for the Rust signatures.

:::warning
**Margin controls are perp-only.** `update_leverage` and `update_isolated_margin` apply to perpetual positions only — spot trading uses the reserved-balance escrow model and does not support leverage in V1.
:::

## WebSocket: `metaflux_client::ws::WsClient` {#websocket}

The WS client is a standalone type, not a method on `Client` — connect it with its own URL:

```rust
use metaflux_client::{
    types::MarketId,
    wallet::Address,
    ws::{Subscription, WsClient, WsMessage},
};

let ws = WsClient::connect("wss://api.devnet.mtf.exchange/ws").await?;
let mut rx = ws.messages();

ws.subscribe_trades(MarketId(1)).await?;

let user = Address::from_hex("0x17c5185167401ed00cf5f5b2fc97d9bbfdb7d025")?;
ws.subscribe(Subscription::Notifications { user }).await?;

loop {
    let frame = rx.recv().await?;
    match &frame.message {
        WsMessage::Trades(payload) => println!("trade: {payload}"),
        WsMessage::Notifications(payload) => println!("notification: {payload}"),
        _ => {}
    }
}
```

`WsClient::connect(url)` returns a handle as soon as the socket is open; `.messages()` returns a `tokio::sync::broadcast::Receiver<WsFrame>` — clone the client and call `.messages()` again for a second independent receiver. Each channel has a `subscribe_*` convenience method (`subscribe_l2_book`, `subscribe_trades`, `subscribe_account_state`, `subscribe_user_events`, `subscribe_web_data`, …); a channel without one — `notifications`, `ledger_updates` — takes the generic `subscribe(Subscription::Variant { .. })`. `WsMessage::as_account_state()` / `as_open_orders()` / `as_order_updates()` decode a raw payload into the same typed DTOs the REST reads return. Drop the client (or call `.shutdown().await`) to disconnect.

## Numeric types {#numeric-types}

There are no wrapper types like `PriceE8` / `SizeE8` / `UsdcE6`. `Order::limit_px` and `Order::size` are plain `u64` on the wire's fixed-point planes (price × 1e8; size × `10^size_decimals`) — do the scaling yourself, or read [`crate::grid::round_order_to_grid`] to snap a human price/size onto a market's tick/lot grid before you build an order. `/info` reads answer in canonical decimal `String`s (exact — no float precision loss); convert with your own decimal type (e.g. `rust_decimal`) at the boundary.

## Error handling {#error-handling}

Every fallible call returns `Result<T, ClientError>` — one enum, not a hierarchy split by admission/commit/network:

```rust
use metaflux_client::ClientError;

match client.exchange().submit_order(&wallet, &order).await {
    Ok(resp) => { /* admitted; statuses[i] per order */ }
    Err(ClientError::ProtocolError { code: 429, msg }) => {
        // rate limited — msg carries the server's error string
    }
    Err(ClientError::ProtocolError { code, msg }) => {
        // any other non-2xx response — 401/404/422/5xx, msg has the cause
    }
    Err(ClientError::Http(e)) => {
        // the request never got a response (timeout, connection reset) —
        // unknown outcome; reconcile via cloid / open_orders, don't retry blind
    }
    Err(e) => return Err(e.into()),
}
```

`ClientError` (from `metaflux_client::ClientError`, `#[non_exhaustive]`): `Builder` (bad base URL / TLS init), `Http` (transport failure — reqwest never got a response), `Decode` (JSON parse), `ProtocolError { code, msg }` (a non-2xx HTTP response with the server's `{"error": "..."}` envelope), `Signature` / `SignatureMismatch` (EIP-712 signing), `InvalidKey` (bad hex / wrong length), `WebSocket`, `Validation` (local input check failed before any network call). See [error handling](./error-handling.md) for the admission/commit/network decision tree this maps onto.

## Signing externally {#signing-externally}

There is no pluggable `Signer` trait — `Wallet` holds a raw key in-process, and the public `Exchange` methods only accept `&Wallet`, not a pre-built signature. Today, an HSM or hardware-wallet integration needs to construct the EIP-712 digest itself against the wire format in [typed-data signing](./typed-data-signing.md) and POST the signed envelope directly, rather than through this crate's `exchange()` methods.

## Agent-signing pattern {#agent-signing-pattern}

There is no `sender_address` field. One `Client` serves both roles — pass whichever `Wallet` should sign to each call, and set the action's `owner` field to the account it acts for:

```rust
use metaflux_client::types::{
    MarketId,
    account::ApproveAgent,
    order::{Order, OrderKind, Side, StpMode, TimeInForce},
};

let master_wallet = Wallet::from_hex(&std::env::var("MASTER_KEY")?)?;
let agent_wallet = Wallet::from_hex(&std::env::var("AGENT_KEY")?)?;
let client = Client::new("https://api.devnet.mtf.exchange")?;

client.exchange().approve_agent(&master_wallet, &ApproveAgent {
    agent: agent_wallet.address(),
    name: Some("mm-host-3".to_string()),
    expires_at_ms: Some(expiry_ms),
}).await?;

// The AGENT wallet signs; `owner` names the master account.
let order = Order {
    owner: master_wallet.address(),
    market: MarketId(0),
    side: Side::Bid,
    kind: OrderKind::Limit,
    size: 1_000,
    limit_px: 5_000_000_000_000,
    tif: TimeInForce::Gtc,
    stp_mode: StpMode::CancelOldest,
    reduce_only: false,
    cloid: None,
    builder: None,
    position_side: None,
    trigger: None,
};
client.exchange().submit_order(&agent_wallet, &order).await?;
```

## Concurrency {#concurrency}

`Client` and `RestClient` are `Clone` and cheap to clone — internally they share a pooled `reqwest::Client`, so cloning does not open a new connection pool. `Wallet` is also `Clone`; share one across tasks the same way.

Nonce generation is internal and automatic (a strictly-increasing unix-ms clock, bumped past the last value to survive a same-millisecond burst) — there is no public `nonce_fn` override today. `Exchange::with_expires_after(ms)` is the one per-handle knob the SDK exposes, folding an optional action-expiry into every typed action that handle signs.

## Logging {#logging}

The crate emits structured events via `tracing`. Install a subscriber (`tracing_subscriber::fmt().init()`, etc.) in your binary; the crate does not pin one.

## Cargo features {#cargo-features}

```toml
[dependencies]
metaflux-client = { version = "0.20", default-features = false }
```

| Feature | Default | Description |
|---------|:-------:|-------------|
| `cli` | yes | Compiles the `mip3-deploy` CLI binary (pulls in `clap`). Library-only consumers can turn it off with `default-features = false` — the `Client` / `RestClient` / `WsClient` API is unaffected either way. |

WebSocket support (`tokio-tungstenite`) and the pure-Rust TLS backend (`reqwest`'s `rustls-tls`) are plain dependencies, not optional features — there is no `ws` / `secp256k1-pure` / `tls-native` feature matrix to choose from.

## Examples {#examples}

The `mtf-exchange/metaflux-client-rust` repository ships (`cargo run --example <name>`):

- `examples/submit_limit_order.rs` — place a resting bid and print its status
- `examples/stream_trades.rs` — connect over WS and print the first 10 trades
- `examples/devnet_market_maker.rs` — quote both sides on a devnet market
- `examples/create_vault.rs` — create a vault
- `examples/e2e_fill.rs`, `examples/cross_fill.rs`, `examples/cross_probe.rs` — end-to-end fill flows
- `examples/fund_evm_gas.rs` — fund an EVM-side account for gas
- `examples/mip3_full_deploy.rs` — a full MIP-3 deployer flow
- `examples/addr.rs` — print the address for a hex private key

## See also {#see-also}

- [Quickstart](./quickstart.md)
- [Agent wallets howto](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is the SDK no-std compatible?**
A: No. It needs an async runtime (`tokio`) and the `reqwest` / `tokio-tungstenite` HTTP/WS clients.

**Q: Does it support WASM?**
A: Not evaluated as part of this page — the crate depends on `reqwest` and `tokio-tungstenite`, both of which need platform-specific support to target `wasm32`. Treat it as native-only until stated otherwise.

**Q: Can I use this from an EVM contract?**
A: No. This is an off-chain client. On-chain bridge interactions go through [bridge](../bridge/) primitives.

</details>
