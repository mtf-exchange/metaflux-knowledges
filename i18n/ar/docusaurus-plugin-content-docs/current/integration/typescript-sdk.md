# حزمة TypeScript SDK

:::info
**معاينة أولية.** تُشحن حزمة `@metaflux/sdk` قبل إطلاق الشبكة الرئيسية؛ واجهة البرمجة الموضّحة أدناه مُثبَّتة ونهائية.
:::

## ملخص سريع

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

## المُنشئ

```typescript
new MetaFluxClient(opts: ClientOpts)
```

| الحقل | النوع | مطلوب | الوصف |
|-------|------|----------|-------------|
| `privateKey` | hex string OR `Uint8Array` | نعم (ما لم يُحدَّد `signer`) | مفتاح secp256k1 الخاص، 32 بايت |
| `signer` | `Signer` | نعم (ما لم يُحدَّد `privateKey`) | موقِّع مخصَّص (HSM / WalletConnect / Ledger) |
| `senderAddress` | hex address | اختياري | إذا حُدِّد، استُخدم كـ `sender`؛ ويُستخدم عنوان الموقِّع بوصفه الموقِّع المُستردّ. راجع [نمط محفظة الوكيل](./agent-wallets-howto.md). |
| `baseUrl` | string | نعم | بوابة الدخول الأمامية (`https://<net>-gateway.mtf.exchange`). تتحدّث الحزمة بروتوكول MTF-native، وهو المسار الافتراضي للبوابة (`/info` · `/exchange` · `/ws`)؛ وتقع التوافقية مع HL تحت `/hl/*`. هل تشغِّل العقدة بنفسك؟ أشِر إلى `http://localhost:8080`. راجع [الشبكات](../networks.md). |
| `chainId` | number | نعم | يختلف باختلاف الشبكة — راجع [الشبكات](../networks.md) |
| `timeoutMs` | number | اختياري (الافتراضي 5000) | مهلة HTTP |
| `nonceFn` | `() => number` | اختياري (الافتراضي `Date.now`) | مولِّد nonce مخصَّص |

## الوحدات

يعرض العميل ثلاث وحدات: `info` و`exchange` و`ws`.

### `info`

جميع أنواع استعلامات `POST /info`. تُعيد الدوال استجابات ذات أنواع محدَّدة.

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

جميع أنواع إجراءات `POST /exchange`.

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
**ضوابط الهامش خاصة بالعقود الدائمة فحسب.** تسري كلٌّ من `updateLeverage` و`updateIsolatedMargin` و`updateMarginMode` على مراكز العقود الدائمة (Perpetuals) حصراً. لا تدعم مراكز السوق الفوري (Spot) الرافعة المالية ولا الهامش المعزول في الإصدار الأول — إذ يعتمد التداول الفوري نموذج الضمان القائم على الرصيد المحجوز عبر مسار الأوامر الفورية.
:::

### `ws`

تُعيد نسخة `MetaFluxWs` تُعدِّد الاشتراكات عبر قناة واحدة.

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

يتولّى عميل WebSocket التعامل مع:
- إعادة الاتصال التلقائية بالتراجع الأسّي
- تتبُّع `seq` لكل اشتراك على حدة واستئناف (`resume`) الاشتراك عند إعادة الاتصال
- تجديد المصادقة للاشتراكات الخاصة (نافذة انزلاقية)
- الإبقاء على الاتصال بآلية Ping/Pong

## معالجة الأخطاء

تُطلق الحزمة أخطاءً ذات أنواع محدَّدة:

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

راجع [معالجة الأخطاء](./error-handling.md) للاطلاع على شجرة القرار الكاملة.

## موقِّع مخصَّص (HSM / محفظة مادية)

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

تُمرِّر الحزمة `signed_hash` المُجزَّأ مسبقاً إلى `Signer.sign` — لا يحتاج جهاز HSM الخاص بك إلى معرفة أي شيء عن ترميز EIP-712.

## إعداد عميل توقيع الوكيل

لنمط [محافظ الوكيل](./agent-wallets-howto.md):

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

## أنماط شائعة

### تقديم أمر وتأكيده

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

### إلغاء جميع الأوامر

```typescript
const orders = await c.info.openOrders();
await Promise.all(orders.map(o => c.exchange.cancel({ asset: o.asset, oid: o.oid })));
```

### الاشتراك والحفظ المستمر

```typescript
const fills = [];
c.ws().subscribe('userFills', { user: c.address }, (e) => {
  for (const fill of e.data.fills) fills.push(fill);
});
```

## التعامل مع الأرقام

جميع حقول الأعداد الصحيحة ذات الفاصلة الثابتة ووحدات USDC الأساسية هي `string` في المدخلات والمخرجات على حدٍّ سواء. لا تُحوِّل الحزمة هذه القيم إلى `number` لأن IEEE-754 يفقد الدقة صمتاً عند تجاوز 2^53.

استخدم مكتبة أعداد صحيحة كبيرة للعمليات الحسابية (`bigint` أو `bignumber.js` وما شابهها):

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## التسجيل

مرِّر `logger: console` (أو أي كائن بالشكل `{ debug, info, warn, error }`) لالتقاط التتبُّع الداخلي للحزمة:

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

مستويات السجل: `debug` (كل شيء)، `info` (القبول واتصالات WebSocket)، `warn` (إعادة المحاولات)، `error` (الفشل النهائي).

## انظر أيضاً

- [البدء السريع](./quickstart.md) — شرح متكامل في 5 دقائق
- [التوقيع](./signing.md) — ما تفعله الحزمة داخلياً
- [دليل محافظ الوكيل](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — سطح الإجراءات الكامل
- [اشتراكات WebSocket](../api/ws/subscriptions.md) — فهرس القنوات
- [حزمة Rust SDK](./rust-sdk.md)

## الأسئلة الشائعة

<details>
<summary>عرض الأسئلة الشائعة</summary>

**س: هل تدعم الحزمة المتصفحات؟**
ج: نعم — إصدار ES2020 مع polyfills متوافقة مع المتصفح لـ `secp256k1` و`keccak256`. استورِد من `@metaflux/sdk/browser` إذا كان مُجمِّعك (bundler) لا يُزيل الاستيرادات الخاصة بـ Node تلقائياً.

**س: ما حجم الحزمة بعد التثبيت؟**
ج: نحو 150 كيلوبايت مُصغَّرة (باستثناء الأوليّات التشفيرية القابلة للإزالة). تُضيف طبقة التشفير نحو 50 كيلوبايت إضافية.

**س: ما شجرة التبعيات؟**
ج: `ethereum-cryptography` (أو المكافئات من `@noble/*`)، و`@msgpack/msgpack`، و`ws` (Node فحسب). جميعها مرخَّصة بـ MIT، بلا تبعيات انتقالية ذات رخص غير متساهلة.

**س: هل يمكنني استخدام وسيلة نقل HTTP خاصة بي (axios أو undici)؟**
ج: نعم — مرِّر `transport: { request: async (req) => ... }` في المُنشئ.

</details>
