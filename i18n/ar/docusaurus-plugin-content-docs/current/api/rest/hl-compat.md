# واجهة REST المتوافقة مع HL

:::info
**معاينة.** تُجيب البوابة على كل طلبات HL من نوع `/info` بنفس تنسيق البيانات الصادر عن HL. بعض الأنواع **مربوطة** بحالة العقدة الحية اليوم؛ أما الباقي فيُعيد **الشكل الفارغ الأمين** من HL (لا يُعاد `null` أبدًا، ولا تُخترع قيمة مزيفة) حتى تصل قراءة العقدة المقابلة. حالة كل نوع موضحة في [جدول الترجمة](#hl-info-type--mtf-native-node-type) أدناه.
:::

## ملخص سريع

تُعرض البوابة عناوين URL وأشكال طلب/استجابة مطابقة لتلك الخاصة بـ HL. يمكن لبوتات HL الإشارة إلى MetaFlux [دون أي تغيير في الكود](../../integration/migrating-from-hl.md) للسطح المدعوم. يُحافظ على تنسيق البيانات بدقة — غلاف HL للأخطاء `{"error":...}` برمز 400، والحقول بصيغة camelCase، وتوبلات `[bids, asks]`، والمقادير النقدية كسلاسل عشرية.

**البوابة هي المكان الوحيد الذي تعيش فيه أشكال HL/camelCase.** العقدة تعتمد صيغة MTF الأصلية من البداية إلى النهاية (snake_case، معرفات صحيحة/`u32` — انظر [`/info`](./info.md)). كل استجابة HL هنا هي *ترجمة* لقراءة MTF أصلية من العقدة؛ العقدة لا تتحدث بلغة HL أبدًا.

## عنوان URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

تقع ميزة التوافق مع HL ضمن المسار `/hl/*` على الباب الأمامي للبوابة. يشير المسارا `/info` و`/exchange` على المستوى الجذري للبوابة إلى الصيغة MTF الأصلية (المسار الافتراضي) — وجّه عملاء HL إلى `/hl/*`، وليس المسارات المجردة، وإلا ستصطدم بالسطح الأصلي (الذي يرفض الحقول الخاصة بـ HL). الترجمة بين HL والصيغة الأصلية موجودة فقط في البوابة.

## اصطلاح الغلاف

- قراءات `/info`: استجابة HTTP 200 مع جسم JSON خاص بكل نوع. عند طلب سيئ (نوع `type` مجهول، أو `user` مفقود/غير صالح)، يُعاد HTTP 400 مع `{"error":"<message>"}`. تظهر أعطال الاتصال الخلفي بالعقدة بشكل صادق: 502 `{"error":...}` لأخطاء النقل/5xx، و400 للمعاملات التي رفضتها العقدة — **لا تُصنع** نجاحات فارغة مزيفة أبدًا.
- كتابات `/exchange`: تتبع اصطلاح HL `{"status":"ok"|"err", "response":<...>}` (الأخطاء تُعيد 200). انظر [`/exchange` أدناه](#exchange--write-path).

---

## `/info` — مسار القراءة

للقراءة فقط. يُوزَّع على نوع الطلب بناءً على حقل `type` في جسم الطلب. يحاكي مسار `/info` الخاص بـ HL.

### نوع HL info → نوع عقدة MTF الأصلي {#hl-info-type--mtf-native-node-type}

هذا هو الخريطة الرئيسية. **الترجمة** تعمل دومًا على النحو التالي: snake_case → camelCase، وأعداد صحيحة/سنتات/معرّف `u32` → سلسلة عشرية/عنوان `0x`، وفك تغليف مظروف العقدة `{type,data}`. طبقة الترجمة موجودة فقط في البوابة.

| نوع HL `/info` | الحالة | مصدر عقدة MTF الأصلي | ملاحظات |
|-----------------|--------|------------------------|-------|
| `clearinghouseState` / `userState` | **مربوط** | [`account_state`](./info.md#account_state) | `marginSummary` من `balance_quote` في العقدة؛ `assetPositions:[]` حتى تُظهر العقدة حالة كل مركز على حدة |
| `delegations` | **مربوط** | [`staking_state`](./info.md#staking_state) | العقدة مُفهرسة بـ `account_id` المضغوط؛ عنوان keccak حقيقي بلا معرف مضغوط يُعيد خطأ صادقًا (وليس قائمة فارغة مزيفة) |
| `userFees` | **مربوط** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` حي؛ `activeReferrer`/`userVolumes`/`dailyUserVlm` تنتظر قراءتَي `user_referrer`/`user_volume` من العقدة |
| `l2Book` | نموذج أولي | [`l2_book`](./info/perpetuals.md#l2_book) | قراءة العقدة موجودة؛ ترجمة البوابة إلى `{coin,levels,time}` غير مربوطة بعد — يُعيد دفتر فارغًا بصيغة HL |
| `meta` | نموذج أولي | — | يحتاج إلى قراءة قائمة بجميع الأسواق/الكون من العقدة (قراءة `market_info` في العقدة تخص معرفًا واحدًا)؛ يُعيد `{universe:[],marginTables:[]}` |
| `allMids` | نموذج أولي | — | يحتاج إلى قراءة الكون (نفس عائق `meta`)؛ يُعيد `{}` |
| `metaAndAssetCtxs` | **مربوط** | [`markets`](./info/perpetuals.md#markets) | `[meta, [assetCtx...]]`؛ كل `assetCtx` للعقد الدائمة يحمل `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `funding` / `openInterest` / `oraclePx`، جميعها سلاسل USDC عشرية |
| `openOrders` | نموذج أولي | [`open_orders`](./info.md#open_orders) | قراءة العقدة موجودة؛ ترجمة البوابة غير مربوطة بعد — يُعيد `[]` |
| `frontendOpenOrders` | نموذج أولي | [`open_orders`](./info.md#open_orders) | `openOrders` + تلميحات واجهة المستخدم؛ يُعيد `[]` |
| `vaultDetails` | نموذج أولي | [`vault_state`](./info.md#vault_state) | يحتاج إلى سجل عنوان القائد ← `vault_id` (العقدة مُفهرسة بـ `vault_id`)؛ يُرجع `user` من الطلب مع أرقام مالية معدومة |
| `subAccounts` | **مربوط** | [`sub_accounts`](./info.md#sub_accounts) | يُعيّن `{index,address}` من العقدة إلى `{subAccountUser,name,master}`؛ `clearinghouseState` محذوف (لا ربط لحالة كل حساب فرعي في قراءة العقدة) |
| `referral` | نموذج أولي | — | المحيل يُضبط بـ `Action::setReferrer` وهو دائم؛ يُعيد `referredBy:null` |
| `spotClearinghouseState` | **مربوط** | [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state) | `{asset,name,balance}` من العقدة → `{coin,token,total}`؛ `hold:"0"` / `entryNtl:null` (لا توجد قراءة للاحتجاز/أساس التكلفة في العقدة) |
| `spotMeta` / `spotMetaAndAssetCtxs` | **مربوط** | [`spot_meta`](./info/spot.md#spot_meta) | `pairs` من العقدة → `universe`؛ سجل `tokens` من الاسم الفعلي لكل رمز `name` / `szDecimals` / `weiDecimals` (USDC تحمل `isCanonical`)؛ كل `assetCtx` فوري يحمل `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `circulatingSupply` كسلاسل USDC عشرية |
| `predictedFundings` | نموذج أولي | — | يُعيد `[]` |
| `orderStatus` | نموذج أولي | — | يُحلَّل إلى `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **مربوط** | [`max_builder_fee`](./info.md#max_builder_fee) | يُسقط `max_fee_bps` من العقدة كرقم HL مجرد؛ الزوج غير المعتمد → `0` |
| `userRateLimit` | **مربوط** | [`user_rate_limit`](./info.md#user_rate_limit) | `lifetime_count` من العقدة → `nRequestsUsed`، قاعدة `nRequestsCap`؛ `cumVlm:"0.0"` (لا حجم في قراءة الحد الخاصة بالعقدة) |
| `userNonFundingLedgerUpdates` | نموذج أولي | — | يُعيد `[]` |
| `userFunding` / `userFundings` | غير مُقدَّم | — | سجل مدفوعات التمويل لكل مستخدم — يُقدَّم بواسطة مُفهرس البوابة (خارطة طريق) |
| `fundingHistory` | **مربوط** | [`funding_history`](./info/perpetuals.md#funding_history) | عينات العلاوة/المعدل المُحقَّق لكل عملة عبر نافذة زمنية، من متتبع التمويل الحي في العقدة |
| `userFills` | **مربوط** | [`user_fills`](./info.md#user_fills) | سجل الصفقات المفصّل، من شريط الصفقات الملتزمة لكل حساب |
| `userFillsByTime` | **مربوط** | [`user_fills_by_time`](./info.md#user_fills_by_time) | `userFills` مُرشَّح بنافذة زمنية، من نفس شريط الصفقات الملتزمة |
| `historicalOrders` | غير مُقدَّم | — | قائمة الأوامر في الحالة النهائية — يُقدَّم بواسطة مُفهرس البوابة (خارطة طريق) |
| `candleSnapshot` | غير مُقدَّم | — | بيانات OHLCV التاريخية — يُقدَّم بواسطة مُفهرس البوابة (خارطة طريق) |

مفتاح الأسطورة: **مربوط** = حالة العقدة الحية اليوم · نموذج أولي = شكل فارغ صحيح من HL، بدون دعم من العقدة بعد · غير مُقدَّم = لا دعم من العقدة بعد، يُقدَّم بواسطة مُفهرس البوابة (خارطة طريق).

:::info
عقد **الشكل الفارغ الأمين** جوهري للنظام: يتكرر عملاء HL على هذه الاستجابات بشكل غير مشروط. يجب أن يُصدر النموذج الأولي `[]` / `{}` / الصفر المطبوع — **لا يُعاد** `null` أبدًا حيث يتوقع العميل كائنًا — لكي تُفسِّر SDKs الخاصة بـ HL البيانات بالطريقة نفسها سواء كانت الحية أو معلقة.
:::

### الأنواع المربوطة

#### `clearinghouseState` / `userState`

اسمان مستعاران — كلاهما يُعيد حالة مقاصة المستخدم. **مربوط** بعقدة [`account_state`](./info.md#account_state). تنعكس `balance_quote` في العقدة (ضمان USDC بالدولار الكامل) على ملخص هامش HL. تفاصيل المراكز الفردية ليست على سطح العقدة بعد، لذا تكون `assetPositions` بقيمة `[]`.

```json
{"type":"clearinghouseState", "user":"0x..."}
```

الاستجابة (بصيغة HL):

```json
{
  "assetPositions": [],
  "marginSummary": {
    "accountValue":    "1000.0",
    "totalNtlPos":     "0.0",
    "totalRawUsd":     "1000.0",
    "totalMarginUsed": "0.0"
  },
  "crossMarginSummary":         { "accountValue": "1000.0", "totalNtlPos": "0.0", "totalRawUsd": "1000.0", "totalMarginUsed": "0.0" },
  "crossMaintenanceMarginUsed": "0.0",
  "withdrawable":               "1000.0",
  "time":                       0
}
```

حين تُظهر العقدة حالة المراكز الفردية، تمتلئ `assetPositions[]` بصيغة HL:

```json
{
  "type":     "oneWay",
  "position": {
    "coin":           "BTC",
    "szi":            "1.0",
    "entryPx":        "100.0",
    "leverage":       { "type": "cross", "value": 10 },
    "marginUsed":     "10.5",
    "unrealizedPnl":  "0.5",
    "returnOnEquity": "0.05",
    "liquidationPx":  "92.5",
    "positionValue":  "100.5",
    "maxLeverage":    50,
    "cumFunding":     { "allTime": "0.123", "sinceOpen": "0.05" }
  }
}
```

#### `userFees`

**مربوط**: تُسحب `feeSchedule` مباشرة من عقدة [`fee_schedule`](./info.md#fee_schedule) (مع إعادة التسمية من snake إلى camelCase؛ قيم bps تبقى أرقامًا JSON مقيّدة بأقل من 65536). العناصر الخاصة بالمستخدم (`activeReferrer` و`userVolumes` و`dailyUserVlm`) تنتظر قراءتَي `user_referrer` / `user_volume` من العقدة.

```json
{"type":"userFees","user":"0x..."}
```

```json
{
  "activeReferrer": null,
  "userVolumes":    [],
  "feeSchedule": {
    "takerBps":         5,
    "makerBps":         2,
    "referrerShareBps": 0,
    "builderCapBps":    8,
    "deployerCapBps":   0,
    "burnBps":          0,
    "vaultBps":         0,
    "validatorBps":     0,
    "treasuryBps":      0
  },
  "dailyUserVlm":   "0.0"
}
```

#### `delegations`

**مربوط** بعقدة [`staking_state`](./info.md#staking_state). تُفهرَس حصص التخزين في العقدة بـ `account_id` المضغوط (u64)، لذا تعكس البوابة تضمين العناوين؛ عنوان keccak حقيقي بلا معرف مضغوط يُعيد خطأ صادقًا بدلًا من قائمة فارغة مزيفة.

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**مربوط** بعقدة [`sub_accounts`](./info.md#sub_accounts). كل `{index, address}` من العقدة يُعيَّن إلى `{"subAccountUser","name","master"}` — `subAccountUser` هو عنوان الحساب الفرعي في العقدة، و`master` هو المالك المُستعلَم عنه، و`name` هو تسمية `sub-<index>` (لا توجد تسمية للحساب الفرعي على السلسلة). يُحذف `clearinghouseState`: قراءة العقدة لا تحمل ربطًا لحالة حساب كل حساب فرعي على حدة.

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**مربوط** بعقدة [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state) (عبر `address` بصيغة 0x). `{asset, name, balance}` من العقدة → `{coin, token, total, hold, entryNtl}` بصيغة HL: `coin` من `name` في العقدة، `token` من معرف `asset` في العقدة، `total` من `balance` في العقدة. `hold` قيمتها `"0"` و`entryNtl` قيمتها `null` — قراءة العقدة لا تتضمن احتجازًا لكل رصيد أو أساس تكلفة.

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**مربوط** بعقدة [`spot_meta`](./info/spot.md#spot_meta). يُعيَّن كل زوج من العقدة إلى إدخال `universe` (`tokens:[base,quote]`، `index` = معرف الزوج، `isCanonical` = `active` في العقدة). يُبنى سجل `tokens` من سجل الرموز الحقيقي لكل رمز في العقدة: `name` / `sz_decimals` / `wei_decimals` لكل إدخال تُعيَّن مباشرة إلى `name` / `szDecimals` / `weiDecimals` بصيغة HL؛ `index` هو معرف الأصل للرمز، `tokenId` هو تمثيل hex بطول 32 بايت للمعرف، ويُعلَّم USDC بـ `isCanonical`.

```json
{"type":"spotMeta"}
```

```json
{
  "tokens":   [ { "name": "USDC", "szDecimals": 2, "weiDecimals": 6, "index": 100, "tokenId": "0x...", "isCanonical": true },
                { "name": "MTF",  "szDecimals": 2, "weiDecimals": 8, "index": 104, "tokenId": "0x...", "isCanonical": false } ],
  "universe": [ { "name": "MTF/USDC", "tokens": [104, 100], "index": 113, "isCanonical": true } ]
}
```

تبدأ معرفات الرموز في العقدة من `100` (USDC) — انظر [`spot_meta`](./info/spot.md#spot_meta) للاطلاع على السجل الكامل — لذا يعكس `index` تلك المعرفات لا مخطط HL القائم على الأساس `0`.

تُعيد `spotMetaAndAssetCtxs` القيمة `[spotMeta, [spotAssetCtx...]]`؛ العنصر الثاني هو
`spotAssetCtx` واحد لكل زوج، مُحاذًى بالفهرس مع `spotMeta.universe`.
يحمل كل `spotAssetCtx` رمز الزوج `coin` إضافةً إلى السياق الحي:

```json
{
  "coin":              "MTF/USDC",
  "dayNtlVlm":         "42000.00",
  "prevDayPx":         "4.95",
  "markPx":            "5.00",
  "midPx":             "5.00",
  "circulatingSupply": "21000000.0"
}
```

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `dayNtlVlm` | سلسلة عشرية | حجم التداول الاسمي خلال 24 ساعة، بـ **USD** |
| `prevDayPx` | سلسلة عشرية | السعر قبل 24 ساعة، **USDC عشري** |
| `markPx` | سلسلة عشرية | سعر العلامة الحالي، **USDC عشري** |
| `midPx` | سلسلة عشرية | منتصف دفتر الأوامر الحالي، **USDC عشري** |
| `circulatingSupply` | سلسلة عشرية | العرض المتداول من الرمز الأساسي |

جميع الأسعار سلاسل USDC عشرية (قابلة للقراءة البشرية)، وليست أعدادًا صحيحة خامًا.

#### `maxBuilderFee`

**مربوط** بعقدة [`max_builder_fee`](./info.md#max_builder_fee) (`address` بصيغة 0x + `builder`). يُعيد `max_fee_bps` من العقدة كرقم HL مجرد (يُصدر HL العدد الصحيح لا كائنًا)؛ زوج `(user, builder)` غير معتمد → `0`.

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**مربوط** بعقدة [`user_rate_limit`](./info.md#user_rate_limit) (عبر `address` بصيغة 0x). يُعيَّن `lifetime_count` من العقدة إلى `nRequestsUsed`؛ `nRequestsCap` هو القاعدة في HL (1200). تبقى `cumVlm` بقيمة `"0.0"` — قراءة حد المعدل في العقدة مستندة إلى إحصاءات الإجراءات لا الحجم (في انتظار قراءة حجم من العقدة).

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### الأنواع الأولية (الشكل الفارغ الصحيح من HL)

تُعيد هذه الأنواع الشكل الدقيق لـ HL بمحتوى معدوم/فارغ. قراءة العقدة موجودة للبعض منها (`l2Book` و`openOrders` و`vaultDetails`) — فقط *ترجمة* البوابة معلقة؛ أما الباقي فدعم العقدة نفسها هو ما ينتظر.

#### `l2Book`

```json
{"type":"l2Book","coin":"BTC"}
```

```json
{
  "coin": "BTC",
  "levels": [ [ /* bids */ ], [ /* asks */ ] ],
  "time": 0
}
```

`levels` هي توبل `[bids, asks]` (بصيغة HL)؛ كل مستوى هو `{"px":"...","sz":"...","n":N}`. يعتمد على عقدة [`l2_book`](./info/perpetuals.md#l2_book) حين تُربط الترجمة.

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

كل إدخال في `universe` (حين تصل قراءة كون العقدة): `{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`.

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]` (صيغة توبل HL). العنصر الثاني هو `assetCtx` واحد
لكل سوق عقود دائمة، مُحاذًى بالفهرس مع `meta.universe`. يُعبَّأ كل `assetCtx`
من حالة السوق الحية:

```json
{
  "dayNtlVlm":    "1850000.00",
  "prevDayPx":    "66800.00",
  "markPx":       "67042.50",
  "midPx":        "67042.33",
  "funding":      "0.0000125",
  "openInterest": "1250.5",
  "oraclePx":     "67040.00"
}
```

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `dayNtlVlm` | سلسلة عشرية | حجم التداول الاسمي خلال 24 ساعة، بـ **USD** |
| `prevDayPx` | سلسلة عشرية | السعر قبل 24 ساعة، **USDC عشري** |
| `markPx` | سلسلة عشرية | سعر العلامة الحالي، **USDC عشري** |
| `midPx` | سلسلة عشرية | منتصف دفتر الأوامر الحالي، **USDC عشري** |
| `funding` | سلسلة عشرية | معدل التمويل الحالي (لكل فترة) |
| `openInterest` | سلسلة عشرية | الفائدة المفتوحة، بالوحدات الأساسية |
| `oraclePx` | سلسلة عشرية | آخر سعر أوراكل/مؤشر، **USDC عشري** |

جميع الأسعار سلاسل USDC عشرية (قابلة للقراءة البشرية)، وليست أعدادًا صحيحة خامًا.

#### `allMids`

```json
{"type":"allMids"}
```

خريطة اسم أصل → سعر منتصف: `{"BTC":"100.55","ETH":"3200.0"}`. النموذج الأولي: `{}`.

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

مصفوفة من `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`. `side`: `"B"` (شراء) / `"A"` (بيع). تضيف `frontendOpenOrders` حقول واجهة المستخدم (`triggerPx` و`isTrigger` و`isPositionTpsl` و`orderType`). تعتمد على عقدة [`open_orders`](./info.md#open_orders). النموذج الأولي: `[]`.

#### `vaultDetails`

```json
{"type":"vaultDetails","user":"0x..."}
```

```json
{
  "vaultAddress":     "0x...",
  "leader":           "0x...",
  "shares":           "0.0",
  "navUsd":           "0.0",
  "isPaused":         false,
  "managementFeeBps": 1000,
  "withdrawalLockMs": 345600000,
  "createdAtMs":      0,
  "followerCount":    0
}
```

خزائن MetaFlux ليست خزائن HL — نفس شكل الاستعلام، كيانات مختلفة (انظر [الخزائن](../../concepts/vaults.md)، [MIP-2](../../mip/mip-2.md)). تعتمد على عقدة [`vault_state`](./info.md#vault_state) حين يُربط سجل القائد ← `vault_id`. تكون `managementFeeBps` و`withdrawalLockMs` أرقامًا JSON محدودة (يحتفظ HL بالأرقام للمعاملات، والسلاسل للكميات النقدية).

#### `referral`

```json
{
  "referredBy": null,
  "referrerState": {
    "cumVlm": "0.0",
    "cumRewardedFeesSinceReferred": "0.0",
    "cumFeesRewardedToReferrer": "0.0",
    "claimedRewards": "0.0"
  },
  "rewardHistory": []
}
```

`referredBy` قيمتها `null` (لا `{}`) — يُميّز عملاء HL بين "لم يُضبط محيل قط" و"مضبوط لكن غير نشط". المحيل ثابت بعد `setReferrer`.

#### نماذج أولية أخرى

| النوع | استجابة النموذج الأولي |
|------|---------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### الأنواع غير المُقدَّمة بعد

هذه الأنواع ليس لها دعم من العقدة بعد وتُعيد الشكل الفارغ لـ HL حاليًا؛ مُقرر تقديمها بواسطة مُفهرس البوابة (خارطة طريق):

| النوع | النموذج الأولي الفارغ | ملاحظات |
|------|------------|-------|
| `historicalOrders` | `[]` | قائمة الأوامر في الحالة النهائية |
| `candleSnapshot` | `[]` | بيانات OHLCV التاريخية (استخدم قناة WS [`candle`](../ws/subscriptions.md) للأشرطة الحية) |
| `userFunding` / `userFundings` | `[]` | سجل مدفوعات التمويل لكل مستخدم |

`userFills` / `userFillsByTime` و`fundingHistory` **مربوطة** الآن بحالة العقدة الحية — انظر [جدول الترجمة](#hl-info-type--mtf-native-node-type) أعلاه. شكل سجل صفقات HL: `{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`.

### الأخطاء على `/info`

| HTTP | الجسم | السبب |
|------|------|-------|
| 400 | `{"error":"missing field \`type\`"}` | لا يوجد مُمييِّز `type` |
| 400 | `{"error":"unknown request type: <X>"}` | `type` مكتوب بشكل خاطئ أو غير مدعوم |
| 400 | `{"error":"missing field user"}` | `user` المطلوب مفقود |
| 400 | `{"error":"invalid user address: <X>"}` | `user` ليس بصيغة `0x` + 40 حرف hex |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` بدون `coin` |
| 502 | `{"error":"<node error>"}` | نوع مربوط تعطّل الاتصال الخلفي بعقدته (نقل/5xx) |

يستخدم مسار `/info` في HL رموز حالة HTTP القياسية مع `{"error":...}` (على خلاف `/exchange` الذي يستخدم غلاف 200 مع `status`).

---

## `/exchange` — مسار الكتابة

### غلاف الطلب

```json
{
  "action":       { /* HL action object */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| الحقل | الوصف |
|-------|-------------|
| `action` | إجراء بصيغة HL (انظر أدناه) |
| `nonce` | وقت Unix بالمللي ثانية، يتزايد بشكل صارم لكل موقِّع |
| `signature` | كائن RSV — ثلاث سلاسل hex + عدد صحيح `v` (27/28 أو 0/1) |
| `vaultAddress` | `null` للحساب الشخصي؛ `"0x<vault>"` للتصرف كمدير خزينة |

التوقيع يتم على غلاف EIP-712 (انظر [شرح التوقيع](../../integration/signing.md)) باستخدام نطاق **MetaFlux** (`chainId = 31337` devnet / `114514` testnet / `8964` mainnet — انظر [الشبكات](../../networks.md)). يجب أن يساوي `chainId` القيمة `chain_id` للإجماع في العقدة (استعلم عبر [`/info` `node_info`](./info.md#node_info)).

### غلاف الاستجابة

تستخدم الكتابات اصطلاح HL `{"status":"ok"|"err","response":<...>}` (الأخطاء تُعيد 200):

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

### أنواع الإجراءات المدعومة

| `action.type` | الحالة | ملاحظات |
|---------------|--------|-------|
| `order` | مدعوم | limit / IOC / ALO؛ مجموعة TIF الكاملة |
| `cancel` | مدعوم | عبر `oid` |
| `cancelByCloid` | قيد الإطلاق | عبر `cloid` |
| `modify` / `batchModify` | قيد الإطلاق | إلغاء واستبدال |
| `scheduleCancel` | قيد الإطلاق | مفتاح الأمان التلقائي |
| `updateLeverage` / `updateIsolatedMargin` | قيد الإطلاق | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | قيد الإطلاق | تحويلات |
| `withdraw3` | قيد الإطلاق | سحب خارجي (MetaBridge) |
| `approveAgent` | قيد الإطلاق | موافقة محفظة الوكيل |
| `vaultTransfer` / `subAccountTransfer` | قيد الإطلاق | حركة الأموال |
| `setReferrer` / `convertToMultiSigUser` | قيد الإطلاق | — |
| `twapOrder` / `twapCancel` | قيد الإطلاق | — |
| (كل ما يُشحن مع HL غير ذلك) | يُعيد `{"status":"err","response":"unimplemented action: <type>"}` | استخدم [MTF الأصلي](./exchange.md) لتلك الإجراءات |

### مثال على `order`

```json
{
  "action": {
    "type": "order",
    "orders": [
      { "a": 0, "b": true, "p": "100.5", "s": "1.0", "r": false, "t": { "limit": { "tif": "Gtc" } } }
    ],
    "grouping": "na"
  },
  "nonce": 1735689600000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

اختصارات الحقول (اصطلاح HL): `a`=معرف الأصل · `b`=is_buy · `p`=سعر الحد · `s`=الحجم · `r`=reduce_only · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=اختياري `cloid` بطول 16 بايت.

أوامر الشرط: `"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`.

### استجابة `order`

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

حالة كل أمر (واحدة لكل إدخال في `orders[]` بالترتيب):

| الحالة | المعنى |
|---------|---------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | نُشر في دفتر الأوامر |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | نُفِّذ فورًا |
| `{"error":"<reason>"}` | رُفض هذا الإدخال (قد تنجح الإدخالات الأخرى) |

### مثال على `cancel`

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

الاستجابة: `{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`. كل إدخال إلغاء: `"success"` أو `{"error":"<reason>"}`.

### الأخطاء على `/exchange`

| الجسم | السبب |
|------|-------|
| `{"status":"err","response":"signature_invalid"}` | العنوان المُسترجع ≠ الموقِّع / chainId خاطئ |
| `{"status":"err","response":"unimplemented action: <type>"}` | سطح التوافق لا يغطي هذا الإجراء بعد |
| `{"status":"err","response":"nonce too small"}` | إعادة استخدام nonce |
| `{"status":"err","response":"agent_not_approved"}` | وقّع الوكيل لكن لا توجد موافقة |

---

## الفوارق عن HL الجديرة بالمعرفة

انظر [الهجرة من HL](../../integration/migrating-from-hl.md) للمرجع الكامل. أبرز النقاط:

- **`chainId`** في نطاق التوقيع هو خاص بـ MetaFlux (`31337` devnet / `114514` testnet / `8964` mainnet)، وليس HL (`998`/`999`).
- **معرفات الأصول ليست عدديًا مطابقة** لتلك في HL. ابحث عنها عبر `info { "type": "meta" }` حين تُربط تلك القراءة؛ لا تُضمِّن أبدًا معرفات ثابتة في الكود.
- **طبقة تصفية T0 بالبطاقة الصفراء** للتصفية موجودة في MTF (بين الوضع السليم و"التصفية الجزئية" في HL). تُشاهد البوتات المراقبة لأحداث التصفية نوعًا إضافيًا واحدًا من الأحداث.
- **أنواع إجراءات HL بعيدًا عن `order` / `cancel`** تُعيد `err` خلال مرحلة الإطلاق. استخدم [`POST /exchange`](./exchange.md) بصيغة MTF الأصلية، أو انتظر.
- **القراءات المفصّلة** `userFills` / `userFillsByTime` / `fundingHistory` تُقدَّم الآن مباشرةً من حالة العقدة الملتزمة. قراءات السجل المتبقية (`historicalOrders` و`candleSnapshot` و`userFunding`) غير مُقدَّمة بعد — مُقررة لمُفهرس البوابة (خارطة طريق). استخدم قناتَي WS [`userFills`](../ws/subscriptions.md) / [`candle`](../ws/subscriptions.md) للبيانات الحية في غضون ذلك.

## انظر أيضًا

- [`POST /info`](./info.md) — قراءات عقدة MTF الأصلية التي تُترجم منها أنواع HL هذه
- [`POST /exchange`](./exchange.md) — مسار الكتابة بصيغة MTF الأصلية
- [CCXT-compat](./ccxt-compat.md) — سطح التوافق الآخر
- [الهجرة من HL](../../integration/migrating-from-hl.md) · [شرح التوقيع](../../integration/signing.md) · [الأخطاء](../errors.md)
