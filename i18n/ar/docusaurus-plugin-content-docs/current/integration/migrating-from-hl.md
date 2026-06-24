# الترحيل من HL

:::info
**معاينة.** تغطي طبقة توافق HL الطلبَين `POST /info` (15 نوعًا من الاستعلامات) و`POST /exchange` (أمر ووضع الطلب والإلغاء اليوم، مع المزيد من أنواع الإجراءات تدريجيًا).
:::

إذا كان بوتك يتحدث بالفعل بروتوكول HL، يمكنك توجيهه إلى MetaFlux **دون أي تغيير في الكود** للسطح المدعوم — نفس أشكال URL، ونفس JSON للطلب والاستجابة، ونفس غلاف EIP-712.

## ما يعمل مباشرةً دون تهيئة

- `POST /info` لـ: `meta`، `allMids`، `userState`، `clearinghouseState`، `openOrders`، `frontendOpenOrders`، `userFills`، `historicalOrders`، `metaAndAssetCtxs`، `l2Book`، `vaultDetails`، `delegations`، `userFees`، `subAccounts`، `referral`
- `POST /exchange` لـ: `order` (وضع أوامر limit / IOC / ALO)، `cancel` (إلغاء بالـ OID)
- اشتراكات WS (قادمة) ستستخدم نفس أسماء القنوات المستخدمة في HL

## ما يختلف

### 1. معرّف السلسلة (Chain ID)

MetaFlux هي طبقة L1 مستقلة، وليست إصدارًا من HL. وقّع ضد معرّف سلسلة MetaFlux، **لا** معرّف HL:

| الشبكة | `chainId` لـ HL | `chainId` لـ MTF |
|---------|--------------|---------------|
| Mainnet | 1337 | **8964** (`0x2304`) |
| Testnet | 998 | **114514** (`0x1bf52`) |
| Devnet / محلي | 1337 | **31337** (`0x7a69`) |

غيّر ثابتًا واحدًا في كود التوقيع وستبقى بقية غلاف EIP-712 مطابقة تمامًا. يستخدم نطاق MTF القيم: `name = "MetaFlux"`، `version = "1"`، `verifyingContract = 0x0`.

### 2. عنوان URL الأساسي

```
HL:  https://<your-current-hl-api-base>/{info,exchange}
MTF: https://gateway.<your-deployment>/hl/{info,exchange}
```

البوابة هي نقطة الدخول الموحدة. توافق HL يقع تحت المسار `/hl/*`
(`/hl/info`، `/hl/exchange`، `/hl/ws`) — لذا يكتسب عميل HL فقط البادئة `/hl`.
المسار الافتراضي للبوابة في المستوى الأعلى (`/info`، `/exchange`) هو
المسار الأصلي لـ MTF؛ وعند تشغيل العقدة محليًا، يُخدَّم نفس السطح على
`http://localhost:8080`.

### 3. أنواع الإجراءات غير المتوفرة بعد في طبقة التوافق

إذا كان بوتك يستخدم إجراءات HL تتجاوز `order` / `cancel`، تُعيد البوابة اليوم:

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

باستجابة HTTP 200. يتبع HL اتفاقية بأن الأخطاء تُعاد برمز 200 مع `status: "err"`، وهو ما تحافظ عليه MTF.

تغطية إجراءات HL الكاملة ستُطرح في إصدارات لاحقة. للإجراءات الجديدة التي تريدها اليوم، استخدم [سطح الإجراءات الأصلي لـ MTF](../api/rest/exchange.md) مباشرةً — فهو يوفر تغطية كاملة للميزات بما فيها ما لا يملكه HL (RFQ، FBA، التسجيل في هامش المحفظة، والبدائيات عبر السلاسل).

### 4. معرّفات الأصول

يستخدم كلٌّ من HL وMTF معرّفات أصول عددية صحيحة، لكن **الأعداد ليست متطابقة**. `0` في HL هو BTC perp؛ `0` في MTF قد يكون ETH أو أي أصل آخر حسب الإصدار المُنشأ. ابحث دائمًا عن معرّفات أصولك عبر `POST /info { "type": "meta" }` عند بدء التشغيل؛ لا تُثبّتها في الكود أبدًا.

### 5. الدقة العددية

كلتا السلسلتين تستخدمان أعدادًا صحيحة مقيَّسة (مثل `px`) وتمثّلانها كسلاسل نصية في JSON لأن IEEE-754 يفقد الدقة عند تجاوز 2^53. إذا كان بوتك يُحلّل JSON بـ`JSON.parse` الافتراضي في JS، انتقل إلى محلّل يدعم الأعداد الصحيحة الكبيرة (big-int) لهذه الحقول — شكل الإرسال عبر الشبكة مطابق لـ HL، لكن مشكلة فقدان الدقة الصامتة واردة كذلك.

### 6. سلوك التصفية (Liquidation)

تضيف MetaFlux [مرحلة إنذار T0 بالبطاقة الصفراء](../concepts/tiered-liquidation.md) التي لا تتوفر في HL. الأثر العملي: عند صحة الحساب في النطاق `[1.0, 1.1)` تُلغى تلقائيًا أوامر ALO الساكنة ويُصدر حدث تحذيري، لكن المراكز لا تُمسّ. ثم تسلك مراحل T1 / T2 / T3 سلوكَ Partial / Market / Backstop في HL.

إذا كان بوتك يستمع لأحداث التصفية لتفعيل إضافة هامش، **أضف معالجًا لحدث T0 الجديد** — فهو إشارة الإنذار المبكر التي لا توفّرها HL. اصطيادُه يمنحك بلوكًا واحدًا من المهلة للتصرف.

### 7. دلالات محفظة الوكيل (Agent Wallet)

في HL: الوكيل هو مفتاح لا يملك صلاحية السحب. الأمر ذاته في MTF — راجع [محافظ الوكلاء](../concepts/agent-wallets.md). اسم الإجراء هو `ApproveAgent`؛ وشكل الإرسال يطابق HL. الفارق الوحيد: يصبح إذن الوكيل في MTF ساريًا **بعد بلوك واحد من الالتزام**، مقارنةً بالكمون المعتاد لبلوكين في HL. أسرع قليلًا؛ ونفس إجراء الإحماء.

### 8. الخزائن (Vaults)

خزائن HL وخزائن MetaFlux منتجان مختلفان. يُعيد `vaultDetails` معلومات عن أنواع الخزائن الخاصة بـ MTF (MFlux Vault، خزائن المستخدمين). لن تُحلّ عناوين خزائن HL. شكل الاستعلام متطابق؛ توقّع فقط كيانات MTF لا كيانات HL.

## خطوات الترحيل التفصيلية

### اليوم 0 — التوجيه إلى MetaFlux

1. غيّر عنوان URL الأساسي في إعدادات عميلك.
2. غيّر ثابت `chainId` في موقّعك.
3. شغّل مجموعة الاختبارات الحالية على Devnet لـ MTF. يجب أن تجتاز الأوامر `order` / `cancel` وجميع استعلامات `info` دون أي تغيير في الكود.

### اليوم 1 — معالجة فجوة سطح الإجراءات

لإجراءات HL غير المتوفرة بعد في طبقة توافق MTF:

- **تعديل الأوامر** — في الوقت الحالي، ألغِ وأعِد الإرسال. سيُضاف إجراء `modify` في تحديث توافق لاحق.
- **ضبط الرفع المالي / وضع الهامش** — استخدم الإجراء الأصلي لـ MTF عبر `POST /exchange` على المسار الافتراضي للبوابة (`UpdateLeverage`، `UpdateIsolatedMargin`). نفس غلاف EIP-712؛ اسم متغيّر الإجراء مختلف.
- **التحويل / السحب** — استخدم الإجراءات الأصلية لـ MTF.

### اليوم 2 — ربط الإشارات الجديدة

- اشترك في معلومات `subAccounts` إذا كنت تُشغّل حسابات فرعية (الدلالات تختلف قليلًا — تسمح MTF بحتى 32 حسابًا فرعيًا لكل حساب رئيسي).
- أضف معالجًا لأحداث البطاقة الصفراء T0. أسهل مكان هو نفس تغذية الإتمام / التصفية التي تستهلكها بالفعل؛ شكل الحدث هو `{ "type": "yellowCard", "user": "0x...", "block": N }`.
- إذا كنت تعتمد على هامش المحفظة: سجّل من جديد على MTF (`UserPortfolioMargin { enabled: true }`). العتبة ومجموعة السيناريوهات معاملات شبكة — راجع [هامش المحفظة](../concepts/portfolio-margin.md).

### اليوم 3 وما بعده — اعتماد ميزات MTF الحصرية

اختياري. إذا أردت استخدام ميزات لا تتوفر في HL:

- **RFQ** — بدائيات الطلب-للسعر، مفيدة للحجوم التي لا تريد الإعلان في دفتر الطلبات
- **FBA** — مزادات دُفعية متكررة لمطابقة الأسواق المحددة، يقلّل MEV
- **بدائيات عبر السلاسل** — بدائيات جسر قابلة للاستدعاء أصلًا من عقود EVM

هذه إجراءات أصلية لـ MTF، تُرسَل على المسار الافتراضي للبوابة (`POST /exchange` — المسار الأصلي لـ MTF هو الافتراضي؛ توافق HL يقع تحت `/hl/*`؛ راجع [نظرة عامة على API](../api/index.md)).

## أنماط بوتات HL الخمسة الأبرز — ترحيل عملي

### 1. صانع سوق بأوامر محدودة بسيطة (النمط الأساسي)

```diff
- const HL_URL = 'https://<your-current-hl-api-base>';
+ const MTF_URL = 'https://gateway.mtf.exchange/hl';   // HL-compat is under /hl/*

- const HL_CHAIN_ID = 1337;
+ const MTF_CHAIN_ID = 114514;    // testnet (mainnet 8964, devnet 31337)

- const HL_DOMAIN_NAME = 'HLSignTransaction';   // varies by mode
+ const MTF_DOMAIN_NAME = 'MetaFlux';
+ const MTF_DOMAIN_VERSION = '1';

  // asset lookup runs against /info { type: "meta" } — same call, different result
  const meta = await fetch(MTF_URL + '/info', {
    method: 'POST',
    body: JSON.stringify({ type: 'meta' }),
  }).then(r => r.json());

  const BTC = meta.universe.findIndex(m => m.name === 'BTC');  // may not be 0

  // order, cancel — unchanged HL wire shape
  await place_order(BTC, 'B', '100', '0.1', 'Gtc');
```

تغيير `chainId` وعنوان URL الأساسي يستغرق نحو 5 دقائق لعميل نموذجي.

### 2. بوت مراقبة التصفية (إضافة الهامش)

تُصدر HL أحداث `liquidation` عندما تصل الحسابات إلى مرحلة التصفية الجزئية / السوقية. تضيف MTF **`yellowCard`** كإشارة إنذار مبكر.

```diff
  ws.subscribe('userEvents', { user: address }, (event) => {
    switch (event.data.kind) {
+     case 'yellowCard':
+       // T0 — one block to act. ALO orders already cancelled.
+       deposit(YELLOW_CARD_DEPOSIT);
+       break;
      case 'liquidation':
-       // HL partial / market
+       // T1 partial OR T2 full — too late for prevention
        emergency_unwind();
        break;
    }
  });
```

راجع [مراقب المخاطر](./risk-watcher.md) للنمط الكامل.

### 3. بوت مراجحة معدل التمويل

وتيرة التمويل مماثلة (HL بشكل ساعي؛ MTF ساعي افتراضيًا لكن قابل للتهيئة لكل سوق). بنية الصيغة الحسابية متطابقة.

```diff
  // URL is the /hl base from pattern 1 (gateway .../hl) — HL-compat shape
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

تخضع تركيبة أوراكل MTF لحوكمة لكل سوق (مُنفَّذة عبر `SetOracleWeights`) — إذا كانت مراجحتك تعتمد على موفّري أوراكل بعينهم، تحقق من أن قائمة المصادر الموزونة تطابق توقعاتك. راجع [أسعار المارك](../concepts/mark-prices.md).

### 4. الإعداد متعدد الحسابات / المؤسسي

HL: حساب رئيسي + وكلاء لكل مضيف. MTF: الأمر ذاته، بالإضافة إلى **حسابات متعددة التوقيع** كدرجة أولى.

```diff
  // existing: master + agents
  await master.approveAgent(host1_agent);
  await master.approveAgent(host2_agent);

+ // new on MTF: convert master to multi-sig for cold custody
+ await master.convertToMultiSigUser({
+   threshold: 2,
+   signers: [signer1, signer2, signer3],
+ });
+ // every subsequent master-level action requires 2 sigs
+ // agents still work as before for trading actions
```

راجع [التوقيع المتعدد](../concepts/multi-sig.md).

### 5. مدير محفظة الحسابات الفرعية

الحسابات الفرعية في HL: حتى 8. في MTF: حتى 32. شكل الإرسال متطابق:

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

إدارة الوكلاء لكل حساب فرعي، والتسجيل في هامش المحفظة لكل حساب فرعي، وأوضاع الهامش لكل حساب فرعي — كلها مدعومة بشكل متطابق.

## جدول مرجعي

| الإجراء الذي استخدمته في HL | الحالة في MTF |
|----------------------|---------------|
| `order` (place limit / IOC / ALO) | ✅ مدعوم بشكل توافق HL |
| `cancel` (by OID) | ✅ مدعوم بشكل توافق HL |
| `cancelByCloid` | قيد الطرح |
| `modify` | قيد الطرح |
| `batchModify` | قيد الطرح |
| `usdSend` / spot transfers | استخدم الإجراء الأصلي لـ MTF |
| `withdraw3` | استخدم الإجراء الأصلي لـ MTF |
| `approveAgent` | شكل أصلي لـ MTF؛ راجع [محافظ الوكلاء](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | شكل أصلي لـ MTF |
| `usdClassTransfer` | استخدم المعادل الأصلي لـ MTF |
| `convertToMultiSigUser` | أصلي لـ MTF، معاينة |
| `setReferrer` / `createReferral` | أصلي لـ MTF؛ قد تختلف الدلالات |

(يُحدَّث الجدول مع نمو دعم طبقة التوافق.)

## الحصول على المساعدة

- هذا المستودع (`mtf-exchange/metaflux-knowledges`) — أنشئ إشكالية (issue)
- راجع [`POST /exchange`](../api/rest/exchange.md) و[شرح التوقيع التفصيلي](./signing.md) للمرجع على مستوى الإرسال
