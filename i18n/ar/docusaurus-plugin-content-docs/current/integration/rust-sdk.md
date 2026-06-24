# Rust SDK

:::info
**معاينة.** تُشحن حزمة `metaflux-client` قبل إطلاق الشبكة الرئيسية؛ شكل الواجهة البرمجية الموضّح أدناه ثابت ومُلتزَم به.
:::

## ملخّص سريع

```toml
[dependencies]
metaflux-client = "0.1"
```

العميل `async` ويعمل مع أي وقت تشغيل Rust غير متزامن حديث.

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

العميل يُنفَّذ بصفة `Send + Sync` ويعمل في أي سياق غير متزامن.

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

## الوحدات

يعرض العميل ثلاث وحدات: `info` و`exchange` و`ws`.

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

جميع الاستجابات ذات أنواع محددة بدقة؛ لا حاجة للتعامل مع JSON الخام.

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
**ضوابط الهامش مخصّصة للعقود الدائمة فقط.** تُطبَّق `update_leverage` و`update_isolated_margin` و`update_margin_mode` على المراكز الدائمة فحسب. لا تدعم مراكز التداول الفوري الرافعة المالية أو الهامش المعزول في الإصدار V1 — إذ يعتمد التداول الفوري على نموذج الضمان بالرصيد المحجوز عبر مسار أوامر السوق الفوري.
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

يُعيد عميل WS مقابض اشتراك بصيغة `Stream<Item = Result<Event<T>>>`. أسقط المقبض لإلغاء الاشتراك.

## الأنواع الرقمية

الأعداد الصحيحة المُقيَّسة وفق المواصفة العامة (سعر ثابت الفاصلة/الحجم، وحدات USDC الأساسية) مُغلَّفة في أنواع مخصصة تمنع العمليات الحسابية العائمة غير المقصودة:

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

حوِّل من/إلى نص في طبقة الإرسال؛ ونفِّذ العمليات الحسابية على `u128` الخام:

```rust
let price = PriceE8::from_str("10050000000")?;
let notional = price.0 * size.0 / 10u128.pow(8);
```

## معالجة الأخطاء

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

اطّلع على [معالجة الأخطاء](./error-handling.md).

## موقِّع مخصص

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

## عميل التوقيع بالوكيل

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

## التزامن

العميل مُنفَّذ بصفة `Send + Sync` ومُصمَّم للتغليف في `Arc<Client>` للمشاركة عبر المهام. تتولى مجموعة الاتصالات الداخلية إدارة التزامن عبر HTTP؛ أما اشتراكات WS فهي لكل استدعاء على حدة.

توليد الـ nonce أحادي الاتجاه — إن أردت nonces محددة تمامًا عبر مهام متعددة، زوِّد `nonce_fn` بدالة تسحب من عداد خارجي (Redis أو atomic).

## التسجيل

تُصدر الحزمة سجلات منظَّمة عبر منظومة التسجيل المنظَّم القياسية. اضبط المُشترِك في ملف التشغيل الخاص بك؛ العميل لا يُثبِّت backend بعينه.

## الميزات

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| الميزة | مفعَّلة افتراضيًا | الوصف |
|---------|:-------:|-------------|
| `ws` | نعم | دعم WebSocket |
| `secp256k1-pure` | نعم | تنفيذ secp256k1 بـ Rust الخالص (بلا ربط مكتبات أصلية) |
| `secp256k1-c` | لا | ربط مكتبات أصلية (أسرع، يتطلب سلسلة أدوات C) |
| `tls-pure` | نعم | backend TLS بـ Rust الخالص (الافتراضي) |
| `tls-native` | لا | backend TLS النظام |

## أمثلة

مستودع `mtf-exchange/metaflux-client-rust` يتضمن:

- `examples/quickstart.rs` — تقديم أمر وإلغاؤه
- `examples/market_maker.rs` — تسعير الجانبين لـ BTC
- `examples/risk_watcher.rs` — النمط المستخدم في [مراقب المخاطر](./risk-watcher.md)
- `examples/agent_rotation.rs` — سير عمل التدوير الكامل

## انظر أيضًا

- [البداية السريعة](./quickstart.md)
- [التوقيع](./signing.md)
- [دليل المحافظ الوكيلة](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)

## الأسئلة الشائعة

<details>
<summary>عرض الأسئلة الشائعة</summary>

**س: هل يدعم SDK بيئات no-std؟**
ج: لا في الإصدار V1. يحتاج إلى وقت تشغيل غير متزامن وعملاء HTTP/WS. يمكن استخلاص طبقة التوقيع في حزمة مستقلة متوافقة مع `no_std` إن كان ثمة طلب على ذلك.

**س: ما حجم التأثير على الملف التنفيذي؟**
ج: تُضاف `~1.5 MB` إلى الملف التنفيذي عند البناء بالميزات الافتراضية. تستقطع `secp256k1-c` نحو 200 KB.

**س: هل يدعم WASM؟**
ج: جزئيًا — تعمل وحدتا info وexchange في WASM عبر backend HTTP المتوافق معه. يعتمد دعم WS على إمكانيات WebSocket في البيئة المستهدفة. دعم WASM في المتصفح: مُخطَّط له.

**س: هل يمكن استخدامه من عقد EVM؟**
ج: لا. هذا عميل خارج السلسلة. تفاعلات الجسر على السلسلة تمر عبر بدائيات [الجسر](../bridge/).

</details>
