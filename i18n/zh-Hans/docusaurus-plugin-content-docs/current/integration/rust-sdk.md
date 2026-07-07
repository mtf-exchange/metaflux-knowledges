# Rust SDK

:::info
**预览版。** `metaflux-client` crate 在主网上线前已发布；以下 API 接口已定稿，不会变动。
:::

## TL;DR

```toml
[dependencies]
metaflux-client = "0.1"
```

客户端为 `async` 模式，兼容所有现代 Rust 异步运行时。

```rust
use metaflux_client::{Client, ClientOpts, OrderParams, Side, Tif};

async fn run() -> anyhow::Result<()> {
    let c = Client::new(ClientOpts {
        private_key: std::env::var("PRIVATE_KEY")?.parse()?,
        base_url:    "https://api.devnet.mtf.exchange".into(),  // MTF-native is the gateway default path
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

客户端实现了 `Send + Sync`，可在任意异步上下文中使用。

## ClientOpts

```rust
pub struct ClientOpts {
    /// 32-byte secp256k1 private key. Mutually exclusive with `signer`.
    pub private_key:    Option<PrivateKey>,

    /// Custom signer (HSM / hardware wallet). Mutually exclusive with `private_key`.
    pub signer:         Option<Box<dyn Signer + Send + Sync>>,

    /// Override `sender` address. Used for agent-wallet pattern.
    pub sender_address: Option<Address>,

    /// Gateway front door (`https://api.<net>.mtf.exchange`). The SDK speaks
    /// MTF-native, served by the gateway at `/info` · `/exchange` · `/ws`.
    /// Running the node yourself? Point at `http://localhost:8080`.
    pub base_url:       String,
    pub chain_id:       u64,
    pub timeout:        Duration,           // default 5s
    pub nonce_fn:       Option<NonceFn>,    // default: wall-clock-millis
}
```

## 模块

客户端提供三个模块：`info`、`exchange`、`ws`。

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

所有方法均返回强类型响应，无需手动处理原始 JSON。

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
**保证金控制仅限永续合约。** `update_leverage`、`update_isolated_margin` 和 `update_margin_mode` 仅适用于永续合约仓位。V1 中现货仓位不支持杠杆或逐仓保证金——现货交易通过现货下单路径使用预留余额托管模型。
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

WS 客户端返回 `Stream<Item = Result<Event<T>>>` 形式的订阅句柄。丢弃句柄即可取消订阅。

## 数值类型

公共规范中的定标整数（定点价格/数量、USDC 基础单位）封装在专用类型中，防止误用浮点运算：

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

在网络传输层与字符串之间互转；直接对原始 `u128` 进行算术运算：

```rust
let price = PriceE8::from_str("10050000000")?;
let notional = price.0 * size.0 / 10u128.pow(8);
```

## 错误处理

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

详见[错误处理](./error-handling.md)。

## 自定义签名器

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

## 代理签名客户端

```rust
let agent_client = Client::new(ClientOpts {
    private_key:    Some(agent_priv),
    sender_address: Some(master_addr),    // ← master is sender
    base_url:       "https://api.devnet.mtf.exchange".into(),
    chain_id:       31337,
    ..Default::default()
})?;

// every action: sender = master_addr, signed by agent_priv
agent_client.exchange.order(p).await?;
```

## 并发

客户端实现了 `Send + Sync`，可封装在 `Arc<Client>` 中跨任务共享。内部连接池自动处理 HTTP 并发；WS 订阅则按调用独立维护。

Nonce 生成保证单调递增——如果需要在大量任务中实现完全确定性的 nonce，可提供一个 `nonce_fn`，从外部计数器（Redis、原子变量等）中获取。

## 日志

该 crate 通过标准结构化日志生态系统输出结构化日志。请在你的二进制程序中设置订阅者；客户端本身不绑定任何具体后端。

## 功能特性

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| 特性 | 默认启用 | 说明 |
|---------|:-------:|-------------|
| `ws` | yes | WebSocket 支持 |
| `secp256k1-pure` | yes | 纯 Rust 实现的 secp256k1（无原生绑定） |
| `secp256k1-c` | no | 原生绑定（速度更快，需要 C 工具链） |
| `tls-pure` | yes | 纯 Rust TLS 后端（默认） |
| `tls-native` | no | 系统 TLS 后端 |

## 示例

仓库 `mtf-exchange/metaflux-client-rust` 包含以下示例：

- `examples/quickstart.rs` — 下单与撤单
- `examples/market_maker.rs` — 在 BTC 双边挂单
- `examples/risk_watcher.rs` — 参考[风险监控器](./risk-watcher.md)中的模式
- `examples/agent_rotation.rs` — 完整的代理轮换流程

## 参见

- [快速入门](./quickstart.md)
- [签名机制](./signing.md)
- [代理钱包使用指南](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## 常见问题

<details>
<summary>展开常见问题</summary>

**Q：SDK 是否支持 no-std 环境？**
A：V1 暂不支持。它依赖异步运行时以及 HTTP/WS 客户端。如果有需求，签名层可以单独拆出，封装为兼容 `no_std` 的 crate。

**Q：对二进制文件体积的影响有多大？**
A：使用默认特性时，release 构建体积约增加 `~1.5 MB`。启用 `secp256k1-c` 可减少约 200 KB。

**Q：是否支持 WASM？**
A：部分支持——`info` 和 `exchange` 模块可通过 WASM 兼容的 HTTP 后端在 WASM 中使用。WS 支持取决于目标环境的 WebSocket 原语。浏览器 WASM 支持：计划中。

**Q：能否在 EVM 合约中调用此 SDK？**
A：不能。这是一个链下客户端。链上桥接交互需通过[桥接](../bridge/)原语完成。

</details>
