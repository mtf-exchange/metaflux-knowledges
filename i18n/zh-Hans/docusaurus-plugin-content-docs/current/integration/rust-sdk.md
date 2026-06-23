# Rust SDK

:::info
**预览。** `metaflux-client` crate 在主网前发布；下面的 API 形状已提交。
:::

## 快速开始

```toml
[dependencies]
metaflux-client = "0.1"
```

客户端是 `async` 的，可与任何现代 Rust 异步运行时配合使用。

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

客户端是 `Send + Sync`，可在任何异步上下文中使用。

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
    /// MTF-native, which is the gateway's default path (`/info` · `/exchange` ·
    /// `/ws`); HL-compat lives under `/hl/*`. Running the node yourself? Point at
    /// `http://localhost:8080`.
    pub base_url:       String,
    pub chain_id:       u64,
    pub timeout:        Duration,           // default 5s
    pub nonce_fn:       Option<NonceFn>,    // default: wall-clock-millis
}
```

## 模块

客户端公开三个模块：`info`、`exchange`、`ws`。

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

所有函数都返回强类型响应；无需原始 JSON 处理。

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
**保证金控制仅限永续。** `update_leverage`、`update_isolated_margin` 和 `update_margin_mode` 仅适用于永续头寸。现货头寸在 V1 中不支持杠杆或隔离保证金 — 现货交易通过现货订单路径改用保留余额托管模型。
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

WS 客户端返回 `Stream<Item = Result<Event<T>>>`-shaped 订阅句柄。删除句柄以取消订阅。

## 数值类型

公共规范缩放整数（固定点价格/大小、USDC 基础单位）包装在专用类型中，可防止意外的浮点运算：

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

在线路层从/到字符串进行转换；对原始 `u128` 进行算术运算：

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

参见 [错误处理](./error-handling.md)。

## 自定义签名者

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
    base_url:       "https://devnet-gateway.mtf.exchange".into(),
    chain_id:       31337,
    ..Default::default()
})?;

// every action: sender = master_addr, signed by agent_priv
agent_client.exchange.order(p).await?;
```

## 并发

客户端是 `Send + Sync`，打算包装在 `Arc<Client>` 中以便在任务间共享。内部连接池处理 HTTP 并发；WS 订阅按调用。

Nonce 生成是单调的 — 如果您想要跨许多任务真正确定的 nonce，请提供从外部计数器（Redis、原子）拉取的 `nonce_fn`。

## 日志

该 crate 通过标准结构化日志记录生态系统发出结构化日志。在您的二进制文件中设置订阅者；客户端不锁定后端。

## 特性

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| 特性 | 默认 | 描述 |
|---------|:-------:|-------------|
| `ws` | yes | WebSocket 支持 |
| `secp256k1-pure` | yes | 纯 Rust secp256k1（无原生绑定）|
| `secp256k1-c` | no | 原生绑定（更快，需要 C 工具链）|
| `tls-pure` | yes | 纯 Rust TLS 后端（默认）|
| `tls-native` | no | 系统 TLS 后端 |

## 示例

存储库位于 `mtf-exchange/metaflux-client-rust`：

- `examples/quickstart.rs` — 下单和取消
- `examples/market_maker.rs` — 在 BTC 上双向报价
- `examples/risk_watcher.rs` — [风险观察器](./risk-watcher.md)的模式
- `examples/agent_rotation.rs` — 完整轮转工作流

## 另请参阅

- [快速开始](./quickstart.md)
- [签名](./signing.md)
- [代理钱包操作指南](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## 常见问题

<details>
<summary>显示常见问题</summary>

**Q: SDK 是否与 no-std 兼容？**
A: V1 中不是。它需要异步运行时和 HTTP/WS 客户端。如果有需求，签名层可以提升到 `no_std`-friendly crate。

**Q: 二进制影响有多大？**
A: 使用默认特性，发布二进制文件增加 `~1.5 MB`。`secp256k1-c` 节省约 200 KB。

**Q: 它支持 WASM 吗？**
A: 部分支持 — 信息/交换通过 WASM 兼容 HTTP 后端在 WASM 中工作。WS 支持取决于目标的 WebSocket 原语。浏览器 WASM：计划中。

**Q: 我可以从 EVM 合约中使用它吗？**
A: 不能。这是一个链下客户端。链上桥接交互通过 [bridge](../bridge/) 原语进行。

</details>
