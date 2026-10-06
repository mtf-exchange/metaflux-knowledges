# Rust SDK

The `metaflux-client` crate is the Rust client for the MetaFlux API.

:::info
**Preview.** The `metaflux-client` crate ships before mainnet. The API shape below is committed.
:::

## Summary {#tldr}

```toml
[dependencies]
metaflux-client = "0.20"
```

The client is `async`. It works with any modern Rust async runtime. The crate itself uses `tokio`.

```rust
use metaflux_client::{
    Client,
    types::{MarketId, order::{Order, OrderKind, OrderStatus, Side, StpMode, TimeInForce}},
    wallet::Wallet,
};

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let wallet = Wallet::from_hex(&std::env::var("PRIVATE_KEY")?)?;
    let client = Client::new("https://api.testnet.mtf.exchange")?;

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

There is no `ClientOpts` type and no `.exchange` / `.info` field on `Client`.
`Client::new(base_url)` takes only the base URL. A `Wallet` is a separate value that you pass to
every signing call. Reads are under `client.rest().info()`. Writes are under `client.exchange()`,
which takes `(&wallet, &params)` on each call. There is no client-level signer.

## `Client` and `Wallet` {#client-and-wallet}

```rust
impl Client {
    pub fn new(base_url: impl Into<String>) -> Result<Self, ClientError> { /* ... */ }
}
impl Wallet {
    pub fn from_hex(s: &str) -> Result<Self, ClientError> { /* ... */ }
}
```

`Client::new` takes a plain base URL string (`"https://api.<net>.mtf.exchange"`, no trailing
slash). The SDK uses the MTF-native surface, served at `/info` · `/exchange` · `/ws`. If you run
the node yourself, point the client at `http://127.0.0.1:8080`.

`Wallet` holds a raw secp256k1 key. It is not part of `Client` construction. Build one from a
32-byte hex private key with `Wallet::from_hex`. Pass `&wallet` to every `client.exchange()`
method that signs. A `Client` needs no key for reads.

`Client` is cheap to `.clone()`. It wraps a connection-pooled `reqwest::Client` internally. To
share it across tasks, clone it. You do not need an `Arc`.

## Reads with `client.rest().info()` {#reads}

```rust
let info = client.rest().info();

info.markets().await?;                          // Vec<MarketDynamic> — current px/funding/OI
info.markets_meta().await?;                      // Vec<MarketInfo> — precision grids, leverage ladders
info.l2_book("BTC", None).await?;
info.account_state(wallet.address()).await?;     // collateral + margin health, four lane summaries
info.clearinghouse_state(wallet.address()).await?; // perp position rows, keyed by dex
info.option_state(wallet.address()).await?;      // open option legs
info.open_orders(wallet.address()).await?;
info.user_fills(wallet.address(), None).await?;
info.funding_history("BTC").await?;
info.fee_schedule().await?;
info.vault_state(vault_addr).await?;
info.sub_accounts(wallet.address()).await?;
info.agents(wallet.address()).await?;            // approved agents for this address
```

All reads return strongly typed responses. Market reads key by `coin` (a `&str` symbol). Account
reads key by [`wallet::Address`]. For a query with no dedicated wrapper, use
`info.raw(json!({...})).await?`.

## Writes with `client.exchange()` {#writes}

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

Most write methods return `Result<Value, ClientError>`, a raw JSON admission ack.
`submit_order` / `batch_order` / `batch_modify` return the typed `OrderResponse` shown in the
summary. `Exchange` has one method per action for the full surface: cancel-by-cloid, batch
order/cancel/modify, scale and chase orders, vaults, staking, spot-margin/Earn and RFQ/FBA. See
[`POST /exchange`](../api/rest/exchange.md) for the main action catalog, and the crate's
`rest::exchange` module docs for the Rust signatures.

:::warning Margin controls are perp-only
`update_leverage` and `update_isolated_margin` apply to perpetual positions only. Spot trading
uses the reserved-balance escrow model, and it does not support leverage in V1.
:::

## WebSocket with `metaflux_client::ws::WsClient` {#websocket}

The WS client is a standalone type. It is not a method on `Client`. Connect it with its own URL:

```rust
use metaflux_client::{
    types::MarketId,
    wallet::Address,
    ws::{Subscription, WsClient, WsMessage},
};

let ws = WsClient::connect("wss://api.testnet.mtf.exchange/ws").await?;
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

- `WsClient::connect(url)` returns a handle when the socket is open.
- `.messages()` returns a `tokio::sync::broadcast::Receiver<WsFrame>`. For a second independent
  receiver, clone the client and call `.messages()` again.
- Each channel has a `subscribe_*` convenience method (`subscribe_l2_book`, `subscribe_trades`,
  `subscribe_account_state`, `subscribe_markets`, …). A channel without one, such as
  `notifications` or `ledger_updates`, takes the generic
  `subscribe(Subscription::Variant { .. })`.
- `WsMessage::as_account_state()` / `as_open_orders()` / `as_order_updates()` decode a raw
  payload into the same typed DTOs that the REST reads return.
- To disconnect, drop the client or call `.shutdown().await`.

## Numeric types {#numeric-types}

There are no wrapper types such as `PriceE8` / `SizeE8` / `UsdcE6`. `Order::limit_px` and
`Order::size` are plain `u64` values on the wire's fixed-point planes: price × 1e8, and size ×
`10^size_decimals`. Do the scaling yourself. To snap a human price or size onto a market's tick
or lot grid before you build an order, read [`crate::grid::round_order_to_grid`]. `/info` reads
answer in canonical decimal `String`s, which are exact and lose no float precision. Convert them
with your own decimal type (for example `rust_decimal`) at the boundary.

## Error handling {#error-handling}

Every fallible call returns `Result<T, ClientError>`. This is one enum. It is not a hierarchy
split by admission, commit and network:

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

`ClientError` comes from `metaflux_client::ClientError` and is `#[non_exhaustive]`. Its variants:

| Variant | Meaning |
|---------|---------|
| `Builder` | Bad base URL or TLS init |
| `Http` | Transport failure. reqwest never got a response |
| `Decode` | JSON parse |
| `ProtocolError { code, msg }` | A non-2xx HTTP response with the server's `{"error": "..."}` envelope |
| `Signature` / `SignatureMismatch` | EIP-712 signing |
| `InvalidKey` | Bad hex or wrong length |
| `WebSocket` | WebSocket error |
| `Validation` | A local input check failed before any network call |

See [error handling](./error-handling.md) for the decision tree for admission, commit and network
errors that these variants map onto.

## Signing externally {#signing-externally}

There is no pluggable `Signer` trait. `Wallet` holds a raw key in the process, and the public
`Exchange` methods accept only `&Wallet`, not a pre-built signature. Today, an HSM or
hardware-wallet integration must build the EIP-712 digest itself against the wire format in
[typed-data signing](./typed-data-signing.md). It then POSTs the signed envelope directly, and not
through this crate's `exchange()` methods.

## Agent-signing pattern {#agent-signing-pattern}

There is no `sender_address` field. One `Client` serves both roles. Pass the `Wallet` that must
sign to each call, and set the action's `owner` field to the account it acts for:

```rust
use metaflux_client::types::{
    MarketId,
    account::ApproveAgent,
    order::{Order, OrderKind, Side, StpMode, TimeInForce},
};

let master_wallet = Wallet::from_hex(&std::env::var("MASTER_KEY")?)?;
let agent_wallet = Wallet::from_hex(&std::env::var("AGENT_KEY")?)?;
let client = Client::new("https://api.testnet.mtf.exchange")?;

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

`Client` and `RestClient` are `Clone`, and cheap to clone. Internally they share a pooled
`reqwest::Client`, so a clone does not open a new connection pool. `Wallet` is also `Clone`.
Share one across tasks in the same way.

The SDK generates nonces internally and automatically. It uses a strictly increasing unix-ms
clock, moved past the last value so that a burst in one millisecond still works. There is no
public `nonce_fn` override today. `Exchange::with_expires_after(ms)` is the one setting per handle
that the SDK exposes. It adds an optional action expiry to every typed action that the handle
signs.

## Logging {#logging}

The crate emits structured events through `tracing`. Install a subscriber in your binary
(`tracing_subscriber::fmt().init()` or similar). The crate does not pin one.

## Cargo features {#cargo-features}

```toml
[dependencies]
metaflux-client = { version = "0.20", default-features = false }
```

| Feature | Default | Description |
|---------|:-------:|-------------|
| `cli` | yes | Compiles the `mip3-deploy` CLI binary (pulls in `clap`). A library-only consumer can turn it off with `default-features = false`. The `Client` / `RestClient` / `WsClient` API is the same in both cases. |

WebSocket support (`tokio-tungstenite`) and the pure-Rust TLS backend (`reqwest`'s `rustls-tls`)
are plain dependencies, not optional features. There is no `ws` / `secp256k1-pure` /
`tls-native` feature matrix.

## Examples {#examples}

The `mtf-exchange/metaflux-client-rust` repository ships these examples
(`cargo run --example <name>`):

- `examples/submit_limit_order.rs`: place a resting bid and print its status
- `examples/stream_trades.rs`: connect over WS and print the first 10 trades
- `examples/devnet_market_maker.rs`: quote both sides on a devnet market
- `examples/create_vault.rs`: create a vault
- `examples/e2e_fill.rs`, `examples/cross_fill.rs`, `examples/cross_probe.rs`: end-to-end fill
  flows
- `examples/fund_evm_gas.rs`: fund an EVM-side account for gas
- `examples/mip3_full_deploy.rs`: a full MIP-3 deployer flow
- `examples/addr.rs`: print the address for a hex private key

## See also {#see-also}

- [Quickstart](./quickstart.md)
- [Agent wallets howto](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is the SDK no-std compatible?**
A: No. It needs an async runtime (`tokio`) and the `reqwest` / `tokio-tungstenite` HTTP and WS clients.

**Q: Does it support WASM?**
A: This page does not evaluate WASM. The crate depends on `reqwest` and `tokio-tungstenite`, and both need platform-specific support to target `wasm32`. Treat the crate as native-only until stated otherwise.

**Q: Can I use this from an EVM contract?**
A: No. This is an off-chain client. On-chain bridge interactions go through [bridge](../bridge/) primitives.

</details>
