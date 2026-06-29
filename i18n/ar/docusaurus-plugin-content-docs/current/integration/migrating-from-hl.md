# الترحيل من HL

:::info
**يتحدّث MetaFlux بروتوكولَه الأصلي MTF-native — ولا توجد طبقة توافق مع Hyperliquid.** يحتفظ بوتك باستراتيجيته ومنطق تداوله؛ ما يتغيّر هو طبقة العميل / السلك. أسرع مسار هو حزمة SDK الرسمية لـ [TypeScript](./typescript-sdk.md) أو [Rust](./rust-sdk.md)، التي تبني لك الغلاف الأصلي وتوقيع EIP-712. وللغات الأخرى، نفّذ [توقيع البيانات المُهيكَلة (typed-data)](./typed-data-signing.md) مباشرةً.
:::

إذا كان بوتك يتداول بالفعل على منصة عقود دائمة لامركزية بأسلوب Hyperliquid، فإن الانتقال إلى MetaFlux هو **إعادة كتابة لطبقة العميل، لا لطبقة الاستراتيجية**. فالمفاهيم التي تعتمد عليها — الأوامر المحدودة، عمليات الإتمام، التمويل، الهامش المتقاطع / المعزول، محافظ الوكلاء، الحسابات الفرعية، الخزائن — كلها موجودة في MTF. ما تستبدله هو شكل السلك، وأسماء الإجراءات / الاستعلامات، ومعرّف السلسلة، ومعرّفات الأصول.

## شكل الانتقال

- **شكل السلك.** MTF-native هو JSON بصيغة snake_case عبر `POST /exchange` (الكتابة)، و`POST /info` (القراءة)، و`GET /ws` (التدفّق)، كلٌّ منها موقَّع بـ EIP-712 حيثما لزم. اعتمد حزمة SDK أو نفّذ [نظام التوقيع الأصلي](./typed-data-signing.md).
- **منطق الاستراتيجية والمخاطر.** بلا تغيير — كود التسعير والتحجيم والتحوّط ينتقل كما هو.
- **الأسماء وبعض الدلالات.** تُعاد تسمية أنواع الإجراءات وأنواع الاستعلامات (الجدول أدناه)، وتختلف حفنة من السلوكيات (معرّفات الأصول، مرحلة تصفية T0، كمون موافقة الوكيل).

## ما يعمل بالطريقة نفسها

- أوامر Limit / IOC / ALO، وreduce-only، ومعرّفات أوامر العميل (`cloid`).
- توقيع EIP-712 — نفس بدائية التوقيع، بنطاق ومعرّف سلسلة مختلفين.
- الهامش المتقاطع / المعزول، ومدفوعات التمويل، وقراءات عمليات الإتمام وحالة الأوامر.
- محافظ الوكلاء (مفاتيح ساخنة بلا صلاحية سحب)، والحسابات الفرعية، والخزائن.

## ما يتغيّر

### 1. سطح البروتوكول {#1-protocol-surface}

هناك سطح واحد أصلي لـ MTF؛ تستدعيه عبر حزمة SDK أو تبني الغلاف بنفسك. تتطابق الأسماء بوضوح:

| استخدمته في HL | المعادل الأصلي في MTF |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) / [`frontend_open_orders`](../api/rest/info.md#frontend_open_orders) |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| WS `userEvents`, `l2Book`, `candle` | `user_events`، `l2_book`، `candles` (snake_case) — راجع [اشتراكات WS](../api/ws/subscriptions.md) |

الفهارس الكاملة في [`POST /exchange`](../api/rest/exchange.md) و[`POST /info`](../api/rest/info.md).

### 2. معرّف السلسلة (Chain ID)

MetaFlux هي طبقة L1 مستقلة، وليست إصدارًا من HL. وقّع ضد معرّف سلسلة MetaFlux، **لا** معرّف HL:

| الشبكة | `chainId` لـ MTF |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / محلي | **31337** (`0x7a69`) |

يستخدم نطاق EIP-712 لـ MTF القيم: `name = "MetaFlux"`، `version = "1"`، `verifyingContract = 0x0`. راجع [الشبكات](../networks.md) و[التوقيع](./signing.md).

### 3. عنوان URL الأساسي

```
MTF: https://<net>-gateway.mtf.exchange/{info,exchange,ws}
```

البوابة هي نقطة الدخول الموحدة للسطح الأصلي لـ MTF. وعند تشغيل العقدة بنفسك، يُخدَّم نفس السطح على `http://localhost:8080`.

### 4. معرّفات الأصول

يستخدم كلٌّ من HL وMTF معرّفات أصول عددية صحيحة، لكن **الأعداد ليست متطابقة**. `0` في HL هو BTC perp؛ `0` في MTF قد يكون ETH أو أي أصل آخر حسب الإصدار المُنشأ. ابحث دائمًا عن معرّفات أصولك عبر `POST /info { "type": "markets" }` عند بدء التشغيل؛ لا تُثبّتها في الكود أبدًا.

### 5. الدقة العددية

حقول السعر والحجم هي أعداد صحيحة مقيَّسة تُرسَل كسلاسل نصية في JSON لأن IEEE-754 يفقد الدقة عند تجاوز 2^53. إذا كان بوتك يُحلّل JSON بـ`JSON.parse` الافتراضي في JS، فانتقل إلى محلّل يدعم الأعداد الصحيحة الكبيرة (big-int) لهذه الحقول.

### 6. سلوك التصفية (Liquidation)

تضيف MetaFlux [مرحلة إنذار T0 بالبطاقة الصفراء](../concepts/tiered-liquidation.md) التي لا تتوفر في HL. الأثر العملي: عند صحة الحساب في النطاق `[1.0, 1.1)` تُلغى قسرًا أوامر ALO الساكنة في حسابك ويُصدر حدث تحذيري، لكن المراكز لا تُمسّ. ثم تسلك مراحل T1 / T2 / T3 سلوكَ Partial / Market / Backstop في HL.

إذا كان بوتك يستمع لأحداث التصفية لتفعيل إضافة هامش، **أضف معالجًا لحدث T0 الجديد** — فهو إشارة الإنذار المبكر التي لا توفّرها HL. اصطيادُه يمنحك بلوكًا واحدًا من المهلة للتصرف.

### 7. دلالات محفظة الوكيل (Agent Wallet)

الوكيل هو مفتاح لا يملك صلاحية السحب — نفس نموذج HL (راجع [محافظ الوكلاء](../concepts/agent-wallets.md)). الإجراء هو [`approve_agent`](../api/rest/exchange.md#approve_agent). الفارق الميكانيكي الوحيد: يصبح إذن الوكيل في MTF ساريًا **بعد بلوك واحد من الالتزام**، مقارنةً بالكمون المعتاد لبلوكين في HL. أسرع قليلًا؛ ونفس إجراء الإحماء.

### 8. الخزائن (Vaults)

خزائن HL وخزائن MetaFlux منتجان مختلفان. تُعيد قراءة [`vault_state`](../api/rest/info.md#vault_state) أنواع الخزائن الخاصة بـ MTF (MFlux Vault، خزائن المستخدمين). لن تُحلّ عناوين خزائن HL. توقّع كيانات MTF لا كيانات HL.

## خطوات الترحيل التفصيلية

### اليوم 0 — اعتماد العميل الأصلي

1. ثبّت حزمة SDK لـ [TypeScript](./typescript-sdk.md) أو [Rust](./rust-sdk.md) (أو نفّذ [توقيع البيانات المُهيكَلة](./typed-data-signing.md) للغتك).
2. وجّه `baseUrl` إلى بوابة MTF واضبط `chainId` للشبكة المستهدفة.
3. أعِد تنفيذ البحث عن الأصول مقابل `POST /info { "type": "markets" }`.

### اليوم 1 — ربط إجراءاتك

ترجِم كل إجراء يرسله بوتك إلى معادله الأصلي في MTF (راجع الجدول في [§1](#1-protocol-surface)). `order` ينتقل إلى `submit_order`، و`cancel` إلى `cancel_order`، وتغييرات الرفع المالي / الهامش إلى `update_leverage` / `update_isolated_margin`. تبني حزمة SDK غلاف EIP-712؛ ولا يختلف إلا اسم متغيّر الإجراء وحالة أحرف الحقول.

### اليوم 2 — ربط الإشارات الجديدة

- اشترك في قراءات `sub_accounts` إذا كنت تُشغّل حسابات فرعية (تسمح MTF بحتى 32 حسابًا فرعيًا لكل حساب رئيسي).
- أضف معالجًا لأحداث البطاقة الصفراء T0 على قناة WS `user_events`.
- إذا كنت تعتمد على هامش المحفظة، فسجّل على MTF عبر [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin). العتبة ومجموعة السيناريوهات معاملات شبكة — راجع [هامش المحفظة](../concepts/portfolio-margin.md).

### اليوم 3 وما بعده — اعتماد ميزات MTF الحصرية

اختياري. إذا أردت استخدام ميزات لا تتوفر في HL:

- **RFQ** — بدائيات الطلب-للسعر، مفيدة للحجوم التي لا تريد الإعلان في دفتر الطلبات.
- **FBA** — مزادات دُفعية متكررة لمطابقة الأسواق المحددة، يقلّل MEV.
- **بدائيات عبر السلاسل** — بدائيات جسر قابلة للاستدعاء أصلًا من عقود EVM.

هذه إجراءات أصلية لـ MTF على `POST /exchange`؛ راجع [نظرة عامة على API](../api/index.md).

## أبرز أنماط بوتات HL — ترحيل عملي

### 1. صانع سوق بأوامر محدودة بسيطة (النمط الأساسي)

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://testnet-gateway.mtf.exchange',
  chainId:    114514,   // testnet (mainnet 8964, devnet 31337)
});

// asset lookup: HL `meta.universe` → MTF `markets`
const markets = await client.info.markets();
const BTC = markets.findIndex(m => m.name === 'BTC');   // may not be 0

// order / cancel — your strategy logic, native action names
await client.exchange.order({
  asset: BTC, isBuy: true, price: '100', size: '0.1', tif: 'Gtc', reduceOnly: false,
});
```

تبقى الاستراتيجية كما هي؛ وتصبح طبقة العميل استدعاءً لحزمة SDK.

### 2. بوت مراقبة التصفية (إضافة الهامش)

تُصدر HL أحداث `liquidation` عند مرحلة التصفية الجزئية / السوقية. تضيف MTF **`yellowCard`** كأبكر إشارة على قناة `user_events`.

```typescript
const ws = client.ws();
ws.subscribe('user_events', { user: client.address }, (event) => {
  switch (event.data.kind) {
    case 'yellowCard':
      // T0 — one block to act; ALO orders already cancelled
      deposit(YELLOW_CARD_DEPOSIT);
      break;
    case 'liquidation':
      // T1 partial OR T2 full — too late for prevention
      emergency_unwind();
      break;
  }
});
```

راجع [مراقب المخاطر](./risk-watcher.md) للنمط الكامل.

### 3. بوت مراجحة معدل التمويل

وتيرة التمويل مماثلة (ساعي افتراضيًا، وقابل للتهيئة لكل سوق في MTF). بنية الصيغة الحسابية متطابقة؛ والقراءة هي استعلام `funding` الأصلي.

```typescript
const funding = await client.info.fundingHistory({ coin: 'BTC' });
// values may differ from HL because oracle composition differs
const rate = funding[0].rate_per_hr;
```

تخضع تركيبة أوراكل MTF لحوكمة لكل سوق (مُنفَّذة عبر `SetOracleWeights` المُلتزَم) — إذا كانت مراجحتك تعتمد على موفّري أوراكل بعينهم، فتحقّق من قائمة المصادر الموزونة. راجع [أسعار المارك](../concepts/mark-prices.md).

### 4. الإعداد متعدد الحسابات / المؤسسي

HL: حساب رئيسي + وكلاء لكل مضيف. MTF: الأمر ذاته، بالإضافة إلى **حسابات متعددة التوقيع** كدرجة أولى.

```typescript
// existing: master + agents
await master.approveAgent(host1_agent);
await master.approveAgent(host2_agent);

// new on MTF: convert master to multi-sig for cold custody
await master.convertToMultiSigUser({
  threshold: 2,
  signers: [signer1, signer2, signer3],
});
// every subsequent master-level action then requires 2 sigs;
// agents still work as before for trading actions
```

راجع [التوقيع المتعدد](../concepts/multi-sig.md).

### 5. مدير محفظة الحسابات الفرعية

الحسابات الفرعية في HL: حتى 8. في MTF: حتى 32.

```typescript
// MTF: create one of up to 32 subs
await master.createSubAccount({ name: 'desk-A' });
await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

إدارة الوكلاء لكل حساب فرعي، والتسجيل في هامش المحفظة لكل حساب فرعي، وأوضاع الهامش لكل حساب فرعي — كلها مدعومة.

## جدول مرجعي

| الإجراء الذي استخدمته في HL | الإجراء الأصلي في MTF |
|-----------------------|-------------------|
| `order` (وضع limit / IOC / ALO) | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel` (بالـ OID) | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / تحويلات الرمز الفوري | إجراءات تحويل الرمز الفوري الأصلية |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer) (قد تختلف الدلالات) |

## الحصول على المساعدة

- هذا المستودع (`mtf-exchange/metaflux-knowledges`) — أنشئ إشكالية (issue).
- راجع [`POST /exchange`](../api/rest/exchange.md) و[شرح التوقيع التفصيلي](./signing.md) للمرجع على مستوى الإرسال.
