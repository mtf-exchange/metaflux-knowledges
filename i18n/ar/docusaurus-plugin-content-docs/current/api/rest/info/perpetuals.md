---
description: "استعلامات القراءة عبر POST /info لأسواق العقود الدائمة — معلومات السوق، وسجلات الأوامر، والصفقات، والتمويل، والتصفية، وحالة نشر العقود الدائمة."
---

# `POST /info` — استعلامات العقود الدائمة

استعلامات القراءة لأسواق **العقود الدائمة**. نفس نقطة نهاية `POST /info` والغلاف والاصطلاحات المستخدمة في [الصفحة الرئيسية](../info.md) — هذه هي أنواع `type` الخاصة بأسواق العقود الدائمة.

:::info
**تُحدَّد الأسواق بالرمز `coin` (symbol).** كل قراءة مرتبطة بسوق معيّن
(`market_info`، و`l2_book`، و`recent_trades`، و`trades_by_time`، و`funding_history`،
و`oracle_sources`، و`active_asset_data`، و`fba_batch_state`، …) تحسم السوق
بواسطة **رمز `coin`** (`"BTC"`، `"ETH"`، …). أُزيلت معاملات الطلب الرقمية القديمة
`asset_id` / `market_id` — أي طلب يمرّرها (ويُغفل `coin`) يُرفَض بالرمز
`400 {"error":"missing field coin"}`. تُصدي هذه القراءات المرتبطة بالسوق رمز
`coin` في استجاباتها. (يبقى مسار الكتابة الموقَّع `/exchange` وحده يخاطب الأسواق
برقم `asset` عددي — هذا الحقل مجمَّد بموجب الإجماع؛ انظر
[`POST /exchange`](../exchange.md).)
:::

## أنواع استعلامات العقود الدائمة {#perpetual-query-types}

### الحصول على البيانات الوصفية لكل سوق {#market_info}

بيانات وصفية لكل سوق على حدة. يُحسَم السوق بواسطة رمزه `coin`.

```json
{ "type": "market_info", "coin": "BTC" }
```

| Arg | Type | Required |
|-----|------|----------|
| `coin` | symbol | نعم |

غياب `coin` ← `400 {"error":"missing field coin"}`؛ رمز غير معروف ← `404 {"error":"market not found"}`.

الاستجابة:

```json
{
  "type": "market_info",
  "data": {
    "coin":               "BTC",
    "kind":               "perp",
    "sz_decimals":        5,
    "mark_px":            "61550.2",
    "oracle_px":          "61501.7",
    "mid_px":             "61669.4",
    "premium":            "0.00209225",
    "tick_size":          "0.1",
    "step_size":          "0.00001",
    "min_order":          "0.00001",
    "max_leverage":       50,
    "maint_margin_ratio": "1320",
    "init_margin_ratio":  "200",
    "margin_tiers": [
      { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
      { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
      { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
      { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
    ],
    "funding": {
      "rate_per_hr":     "21",
      "cap_per_hr":      "1120",
      "interval_ms":     3600000,
      "next_payment_ts": 1783011600000
    },
    "mark_source":   "oracle_median",
    "fba_enabled":   false,
    "open_interest": "0.02346",
    "day_ntl_vlm":   "3772.890084",
    "change_24h":    "-0.00274143",
    "prev_day_px":   "61719.4",
    "disable_open":  false,
    "disable_close": false,
    "halted":        false,
    "strict_isolated": false,
    "asset_id":      0
  }
}
```

:::warning
**الحقل `asset_id` مُهمَل (DEPRECATED).** يُبقى عليه مؤقتًا كتسهيل توافقي مع أدوات
الفهرسة فقط — لا **تبنِ** عليه، ولا **تستخدمه** كمعامل طلب (لم يعد مقبولًا). خاطِب
الأسواق بالرمز `coin` في كل مكان. قد يُحذف دون رفع لإصدار البروتوكول (wire version).
:::

:::info
**مستوى الإبلاغ عن الأسعار.** يُبلَّغ عن `mark_px` و`oracle_px` و`mid_px`
و`tick_size` و`step_size` و`min_order` في **المستوى العشري البشري**
(`"61550.2"`، `"0.1"`، `"0.00001"`)، وهي نفس الوحدة المستخدمة في وسم مراكز
الحسابات. `mark_px` هو الوسم المُدرج في الكتاب، مع الرجوع إلى سعر الأوراكل عندما
لا يحمل الكتاب وسمًا بعد؛ و`oracle_px` هو آخر سعر مؤشر مُلتزَم به؛ وكلاهما يكون
`"0"` عند عدم التعيين. أما **مستوى تقديم الأوامر/الكتاب فمستوى منفصل بنقطة عائمة
ثابتة 1e8** — سعر المستوى `px` في `l2_book` وسعر الأمر الحدّي `limit_px` كلاهما
قيمتان خامتان بمقياس 1e8، وليستا عشريتين بشريتين؛ تحافظ MTF على هذين المستويين
منفصلَين.
:::

:::info
**`margin_tiers` — سلّم الرافعة المالية المُقسَّم حسب الفائدة المفتوحة، بصيغة
مضمَّنة.** يحمل `market_info` (وكل صف من [`markets`](#markets)) سلّم هامش
الصيانة الخاص بالسوق **مضمَّنًا** باسم `margin_tiers` — قائمة تصاعدية من نطاقات
محدَّدة بحد أعلى:

- `max_open_interest` — **الحد الأعلى** للنطاق (سلسلة عشرية، بوحدات حجم السوق)؛
  و`null` تعني **المستوى الأعلى غير المحدود**.
- `max_leverage` — الرافعة المالية القصوى المسموحة ما دامت الفائدة المفتوحة ضمن
  هذا النطاق (`u8`).
- `maint_margin_ratio` — نسبة هامش الصيانة لهذا النطاق، **سلسلة نقاط أساس
  عشرية** (`"100"` = 1.00%).

مستوى أي مركز هو أول نطاق لا تتجاوز فيه فائدته المفتوحة حدَّ `max_open_interest`
(النطاق الأعلى ذو القيمة `null` يلتقط كل ما فوق آخر حد محدود). تنخفض الرافعة
المالية وترتفع نسبة هامش الصيانة كلما زادت الفائدة المفتوحة. هذا يحل محل استعلام
`margin_table` المستقل الذي أُزيل — إذ بات السلّم يرتحل الآن على سجل السوق ذاته.
:::

:::info
**دقة السعر مقارنةً بـ`sz_decimals`.** يمثل `sz_decimals` دقة **الحجم** (مستوى
تفصيل كمية الأمر — `5` ⇐ وحدات `0.00001`)؛ ولا **يتحكم** في خانات السعر
العشرية، التي تحدِّدها نقطة السعر (`tick_size`). المحوران مستقلان تمامًا.
:::

يُرجع `market_info` السجل **الكامل** — اتحاد الحقول **الديناميكية** التي يقدمها
[`markets`](#markets) (`mark_px`، و`oracle_px`، و`mid_px`، و`premium`،
و`funding`، و`open_interest`، و`day_ntl_vlm`، و`prev_day_px`، و`change_24h`،
و`halted`) مع الحقول **الثابتة** التي يقدمها [`markets_meta`](#markets_meta)
(`sz_decimals`، و`tick_size`، و`step_size`، و`min_order`، و`max_leverage`،
ونسب الهامش، و`margin_tiers`، و`strict_isolated`، و`disable_open` /
`disable_close`، و`mark_source`، و`fba_enabled`، و`asset_id`). راجع هاتين
القراءتين لدلالات كل حقل.

### الحصول على الحالة الحية لجميع الأسواق {#markets}

الحالة **الحية (الديناميكية)** لكل سوق مسجَّل — الحقول التي تتحرك مع كل التزام
(commit) (سعر الوسم / الأوراكل / المنتصف، وعلاوة التمويل، والفائدة المفتوحة،
ومؤشر الـ24 ساعة المتجدد، و`halted`) إضافةً إلى مفتاحَي الربط `(coin, kind)` —
مع سجل أزواج/رموز السبوت. تُقدَّم البيانات الوصفية **الثابتة** طويلة الأمد
(شبكات الدقة، وسلالم الرافعة/الهامش، ومصدر الوسم، وأعلام التحكم في التداول)
بشكل منفصل عبر [`markets_meta`](#markets_meta)؛ ويُرجع [`market_info`](#market_info)
كلا النصفين لرمز واحد.

```json
{ "type": "markets" }
```

صفِّ إلى منتج واحد باستخدام `kind` (غيابه ⇐ كلا القسمين):

```json
{ "type": "markets", "kind": "perp" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | لا | مرشِّح القسم — غيابه = كلاهما؛ `"perp"` = مصفوفة العقود الدائمة فقط؛ `"spot"` = قسم السبوت فقط |

حمولة `data` هي **كائن (object)** يحتوي على مصفوفة `perp` (كل عنصر فيها صف
**ديناميكي**) وكائن `spot` بالشكل `{pairs, tokens}`. تُرتَّب صفوف `perp` بصورة
محددة تصاعديًا حسب معرّف السوق؛ وتُرتَّب `spot.pairs` / `spot.tokens` حسب معرّف
الزوج/الرمز.

الاستجابة (مقتصرة على عنصر واحد لكل قائمة):

```json
{
  "type": "markets",
  "data": {
    "perp": [
      {
        "coin":            "BTC",
        "kind":            "perp",
        "mark_px":         "61521.1",
        "oracle_px":       "61529.3",
        "mid_px":          "61669.4",
        "premium":         "0.0018587",
        "funding": {
          "rate_per_hr":     "20",
          "cap_per_hr":      "1120",
          "interval_ms":     3600000,
          "next_payment_ts": 1783011600000
        },
        "open_interest":   "0.02346",
        "day_ntl_vlm":     "3772.890084",
        "prev_day_px":     "61719.4",
        "change_24h":      "-0.00300293",
        "halted":          false
      }
    ],
    "spot": {
      "pairs": [
        {
          "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "active": true, "mark_px": "50000", "mid_px": "50000", "prev_day_px": null,
          "day_ntl_vlm": "0", "min_notional": "1", "taker_fee_bps": "5",
          "circulating_supply": "0"
        }
      ],
      "tokens": [
        {
          "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6,
          "is_canonical": true, "evm_contract": null,
          "system_address": "0x80abd3bd8c42d2a279e4fa00f20bb30637734371",
          "token_id": "0xf23ea17597e324c04f842e6d8bfffe75636f0af88e7c7ab93ea755d9056396bc"
        }
      ]
    }
  }
}
```

كل صف `perp` هو النصف **الديناميكي** من حزمة [`market_info`](#market_info) —
مبنيٌّ من نفس المُنشئ، لذا لا يتباعد الاثنان أبدًا؛ أما النظير **الثابت** فيقيم في
[`markets_meta`](#markets_meta)، ويُربَط عبر `(coin, kind)`. يُحذَف `mid_px` من
الصف عندما يكون الكتاب أحادي الجانب (لا يُرسَل أبدًا كـ`null`). تبث قناة WS الحية
[`markets`](../../ws/subscriptions.md#markets) هذه الصفوف الديناميكية ذاتها (لقطة
كاملة عند الاشتراك، ثم دلتا للصفوف المتغيرة لاحقًا).

| Field | Type | Description |
|-------|------|-------------|
| `perp[*].coin` | string | رمز السوق، مثل `"BTC"` (مفتاح الربط) |
| `perp[*].kind` | `"perp"` | نوع السوق (بأحرف صغيرة، مفتاح الربط) |
| `perp[*].mark_px` | Decimal string | الوسم المُدرج في الكتاب، **المستوى العشري البشري**، مُقرَّب على النقطة (يرجع للأوراكل عند غيابه؛ `"0"` إذا لم يُعيَّن) |
| `perp[*].oracle_px` | Decimal string | سعر المؤشر، المستوى العشري البشري، مُقرَّب على النقطة (`"0"` إذا لم يُعيَّن) |
| `perp[*].mid_px` | Decimal string | منتصف سجل الأوامر الفعلي `(best_bid + best_ask) / 2`، المستوى العشري البشري، مُقرَّب على النقطة؛ **يُحذَف** عند أحادية الجانب / الفراغ |
| `perp[*].premium` | Decimal string \| null | آخر عيّنة علاوة تمويل مُلتزَم بها (موقَّعة)، سلسلة بدقة **8 خانات عشرية** (مبتورة نحو الصفر)؛ `null` عند غيابها |
| `perp[*].funding.rate_per_hr` | bps string | آخر عيّنة معدل تمويل بالساعة (قبل السقف)، نقاط أساس عشرية |
| `perp[*].funding.cap_per_hr` | bps string | سقف معدل التمويل في الساعة، نقاط أساس عشرية |
| `perp[*].funding.interval_ms` | uint64 | دورية التمويل لكل أصل (ساعة واحدة = `3600000`) |
| `perp[*].funding.next_payment_ts` | uint64 | حدّ التسوية المحاذى التالي للتمويل (مللي ثانية منذ Epoch)؛ `0` حتى تصدر أول عيّنة |
| `perp[*].open_interest` | Decimal string | الفائدة المفتوحة الحالية (بوحدات الحجم) |
| `perp[*].day_ntl_vlm` | Decimal string | حجم التداول الاسمي خلال 24 ساعة |
| `perp[*].prev_day_px` | Decimal string \| null | السعر قبل 24 ساعة؛ `null` إذا كان غير معروف |
| `perp[*].change_24h` | Decimal string \| null | تغيّر السعر خلال 24 ساعة (كسر، موقَّع)؛ `null` عند غياب سعر سابق |
| `perp[*].halted` | bool | السوق موقوف |
| `spot.pairs` | array | سجل أزواج السبوت (نفس صفوف [`spot_meta`](./spot.md#spot_meta) `pairs`، إضافةً إلى `mark_px` / `mid_px` / `day_ntl_vlm` الحيّة) |
| `spot.tokens` | array | سجل رموز السبوت (نفس صفوف [`spot_meta`](./spot.md#spot_meta) `tokens`) |

الحقول **الثابتة** لكل سوق (`sz_decimals`، و`tick_size`، و`step_size`،
و`min_order`، و`max_leverage`، و`maint_margin_ratio`، و`init_margin_ratio`،
و`margin_tiers`، و`strict_isolated`، و`disable_open` / `disable_close`،
و`mark_source`، و`fba_enabled`، و`asset_id`) **غير** موجودة في هذه القراءة —
اجلبها من [`markets_meta`](#markets_meta). لدلالات حقول زوج/رمز السبوت انظر
[`spot_meta`](./spot.md#spot_meta).

### الحصول على البيانات الوصفية الثابتة لجميع الأسواق {#markets_meta}

البيانات الوصفية **الثابتة** لكل سوق مسجَّل — الحقول طويلة الأمد التي ينشرها
السوق مرة واحدة ونادرًا ما تتغير (شبكات الدقة، وسلالم الرافعة/الهامش، وأعلام
التحكم في التداول، ومصدر الوسم) إضافةً إلى مفتاحَي الربط `(coin, kind)` — مع سجل
أزواج/رموز السبوت. هذه القراءة هي النظير الثابت لـ[`markets`](#markets): يغطي
النصفان معًا كل حقل يُرجعه [`market_info`](#market_info)، بحيث يمكن للعميل تخزين
النصف الثابت مؤقتًا والاكتفاء باستطلاع النصف الديناميكي [`markets`](#markets)
فقط. نفس مرشِّح `kind` الاختياري.

```json
{ "type": "markets_meta" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | لا | مرشِّح القسم — غيابه = كلاهما؛ `"perp"` = مصفوفة العقود الدائمة فقط؛ `"spot"` = قسم السبوت فقط |

حمولة `data` هي **كائن** يحتوي على مصفوفة `perp` (كل عنصر فيها صف **ثابت**)
ونفس كائن `spot` بالشكل `{pairs, tokens}` الذي يُرجعه [`markets`](#markets).
تُرتَّب صفوف `perp` تصاعديًا حسب معرّف السوق.

الاستجابة (عقود دائمة مقتصرة على عنصر واحد؛ قسم `spot` مطابق لِما في
[`markets`](#markets)):

```json
{
  "type": "markets_meta",
  "data": {
    "perp": [
      {
        "coin":               "BTC",
        "kind":               "perp",
        "sz_decimals":        5,
        "tick_size":          "0.1",
        "step_size":          "0.00001",
        "min_order":          "0.00001",
        "max_leverage":       50,
        "maint_margin_ratio": "1320",
        "init_margin_ratio":  "200",
        "margin_tiers": [
          { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
          { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
          { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
          { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
        ],
        "strict_isolated": false,
        "disable_open":    false,
        "disable_close":   false,
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "asset_id":        0
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

كل صف `perp` هو النصف **الثابت** من حزمة [`market_info`](#market_info)، ويُربَط
بصفه الديناميكي المقابل في [`markets`](#markets) عبر `(coin, kind)`. لا يظهر هنا
أيٌّ من الحقول الديناميكية لكل التزام (`mark_px`، و`oracle_px`، و`mid_px`،
و`premium`، و`funding`، و`open_interest`، و`day_ntl_vlm`، و`prev_day_px`،
و`change_24h`، و`halted`).

| Field | Type | Description |
|-------|------|-------------|
| `perp[*].coin` | string | رمز السوق (مفتاح الربط) |
| `perp[*].kind` | `"perp"` | نوع السوق (بأحرف صغيرة، مفتاح الربط) |
| `perp[*].sz_decimals` | uint8 | خانات العرض العشرية للحجم |
| `perp[*].tick_size` | Decimal string | الحد الأدنى لزيادة السعر (المستوى العشري البشري، مثل `"0.1"`) |
| `perp[*].step_size` | Decimal string | الحد الأدنى لزيادة الحجم / حجم الدُفعة (المستوى العشري البشري) |
| `perp[*].min_order` | Decimal string | الحد الأدنى لحجم الأمر (المستوى العشري البشري) |
| `perp[*].max_leverage` | uint8 | الحد الأقصى للرافعة المالية (أعلى درجة في سلّم الهامش) |
| `perp[*].maint_margin_ratio` | bps string | نسبة هامش الصيانة الأساسية، نقاط أساس عشرية |
| `perp[*].init_margin_ratio` | bps string | نسبة الهامش الأولي الأساسية، نقاط أساس عشرية |
| `perp[*].margin_tiers` | array | سلّم الرافعة المالية المُقسَّم حسب الفائدة المفتوحة (انظر [`market_info`](#market_info))؛ كل عنصر `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`، نطاقات تصاعدية محدَّدة بحد أعلى، و`null` = المستوى الأعلى غير المحدود |
| `perp[*].strict_isolated` | bool | يفرض السوق الهامش المعزول الصارم |
| `perp[*].disable_open` / `disable_close` | bool | تعطيل الفتح / الإغلاق لهذا السوق |
| `perp[*].mark_source` | string | واصف سعر الوسم (مثل `"oracle_median"`) |
| `perp[*].fba_enabled` | bool | تفعيل المزاد الدُفعي المتكرر لهذا السوق |
| `perp[*].asset_id` | uint32 | حقل وصلة الفهرسة **المُهمَل** — لا تبنِ عليه |
| `spot.pairs` / `spot.tokens` | array | سجل أزواج/رموز السبوت، مطابق لِما في [`markets`](#markets) (انظر [`spot_meta`](./spot.md#spot_meta)) |

لدلالات حقول زوج/رمز السبوت انظر [`spot_meta`](./spot.md#spot_meta).

### الحصول على مستويات سجل الأوامر المجمَّعة {#l2_book}

مستويات العروض والطلبات المجمَّعة في نطاق سوق واحد.

```json
{ "type": "l2_book", "coin": "BTC" }
```

| Arg | Type | Required |
|-----|------|----------|
| `coin` | symbol | نعم |

غياب `coin` ← `400 {"error":"missing field coin"}`.

الاستجابة:

```json
{
  "type": "l2_book",
  "data": {
    "coin": "BTC",
    "bids": [ { "px": "61663.1", "size": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "size": "0.04862", "n_orders": 1 } ]
  }
}
```

تُرتَّب عروض الشراء من الأفضل أولاً (تنازليًا حسب السعر)، وعروض البيع
تصاعديًا. يجمع كل مستوى `size` الإجمالية وعدد `n_orders` للأوامر الراسية. يُرجع
السوق غير المعروف / الفارغ مصفوفتَي `bids` / `asks` فارغتَين.

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | رمز السوق المُعاد صداه |
| `bids[*].px` / `asks[*].px` | i128 string | سعر المستوى، سلسلة عشرية بنقطة عائمة ثابتة (مستوى تقديم الأوامر/الكتاب 1e8) |
| `bids[*].size` / `asks[*].size` | u128 string | الحجم الإجمالي عند المستوى |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | الأوامر الراسية عند المستوى |

### الحصول على الصفقات العامة الأخيرة {#recent_trades}

شريط الصفقات العامة في نطاق سوق واحد، يُقدَّم مباشرةً من الحالة المُلتزَم بها
على العقدة (حلقة صفقات محدودة لكل سوق مطويّة ضمن AppHash — دون فهرسة خارجية).

```json
{ "type": "recent_trades", "coin": "BTC" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | نعم | رمز السوق |
| `limit` | uint32 | لا | تحديد عدد **أحدث** السجلات المُرجَعة؛ غيابه / `0` ⇐ الحلقة الكاملة |

الاستجابة:

```json
{
  "type": "recent_trades",
  "data": {
    "coin":           "BTC",
    "last_trade_ms":  1783001424768,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783001424768,
        "tid":   17691615279761551171,
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

تُرتَّب السجلات من الأقدم أولاً (الأحدث أخيرًا). الحلقة محدودة، لذا هذه نافذة
حديثة وليست كل السجل التاريخي. يُرجع السوق غير المعروف / الذي لم يُتداول فيه قط
`"trades": []` و`last_trade_ms: 0`.

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | رمز السوق المُعاد صداه |
| `last_trade_ms` | uint64 | طابع زمني لآخر صفقة (`0` إذا لم توجد) |
| `trades[*].coin` | string | رمز السوق الذي نُفِّذت عليه الصفقة |
| `trades[*].side` | `"B"` / `"A"` | رمز جانب الطرف المُبادِر (الآخذ) — `"B"` = شراء، `"A"` = بيع |
| `trades[*].px` | Decimal string | سعر التنفيذ، **USDC عشري** (قابل للقراءة البشرية) |
| `trades[*].sz` | Decimal string | الحجم المُنفَّذ، **وحدات القاعدة** (وحدة كاملة) |
| `trades[*].time` | uint64 | الطابع الزمني للصفقة (مللي ثانية الإجماع) |
| `trades[*].tid` | uint64 | معرّف صفقة حتمي (مشترك بين طرفَي الطباعة)؛ قد يتجاوز 2⁵³ — يُحلَّل كعدد صحيح 64-بت / كبير، لا كرقم JS عادي |
| `trades[*].block` | uint64 | ارتفاع الكتلة المُلتزَمة التي تسوَّت فيها الصفقة (محدد موقع على السلسلة) |
| `trades[*].hash` | hex string | تجزئة معاملة الأمر الأصلي، سداسي عشري بادئته `0x` — يتيح تتبع الطباعة على السلسلة |

### الحصول على الصفقات ضمن نافذة زمنية {#trades_by_time}

مشابهة لـ[`recent_trades`](#recent_trades)، لكنها مصفّاة إلى نافذة
`[start_time, end_time]` ضمن حلقة الصفقات الخاصة بالسوق — النافذة الحديثة
المحدودة. للحصول على سجل تاريخي أعمق يتجاوز الحلقة، استخدم أنواع أرشيف البوابة.

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | نعم | رمز السوق |
| `start_time` | uint64 | لا | بداية النافذة (مللي ثانية، شاملة)؛ يُصفِّي حسب `time` الصفقة. غيابه ⇐ حد أدنى مفتوح |
| `end_time` | uint64 | لا | نهاية النافذة (مللي ثانية، شاملة). غيابه ⇐ حد أعلى مفتوح |

الاستجابة:

```json
{
  "type": "trades_by_time",
  "data": {
    "coin":       "BTC",
    "start_time": 1783000000000,
    "end_time":   1783011600000,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783000781368,
        "tid":   4898317237641214538,
        "block": 37692,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

تستخدم `trades` نفس شكل الصفقة الفردية المُستخدَم في
[`recent_trades`](#recent_trades)، من الأقدم أولاً. تُعاد `start_time` /
`end_time` صدى (أو `null` عند إغفال أيٍّ منهما). يُرجع السوق خارج النافذة / الذي
لم يُتداول فيه قط `"trades": []`.

### الحصول على شمعات OHLCV التاريخية {#candle_snapshot}

أشرطة OHLCV التاريخية لـ`(coin, interval)`. استعلام الشمعة الوحيد (بعد أن
**أُزيل** نوع `candle` المستقل): أرشيفي أولاً — يُخدَم من الأرشيف عند توصيله،
ويرجع إلى أشرطة مطويّة من دفق الصفقات العامة خلاف ذلك. المرافق REST لقناة WS
الحية [`candles`](../../ws/subscriptions.md#candles).

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | نعم | رمز السوق، مثل `"BTC"` |
| `interval` | string | نعم | رمز الدلو — أحد القيم: `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | لا | بداية النافذة (مللي ثانية)؛ يُصفِّي حسب وقت فتح الشريط. الافتراضي `0` |
| `end_time` | uint64 | لا | نهاية النافذة (مللي ثانية)؛ يُصفِّي حسب وقت فتح الشريط. الافتراضي غير محدود |

غياب `coin` ← `400 {"error":"missing field coin"}`؛ غياب `interval` ←
`400 {"error":"missing field interval"}`.

الاستجابة:

```json
{
  "type": "candle_snapshot",
  "data": {
    "candles": [
      {
        "t": 1783000020000,
        "T": 1783000080000,
        "i": "1m",
        "o": "6164610000000",
        "c": "6165270000000",
        "h": "6165270000000",
        "l": "6164610000000",
        "v": "576",
        "n": 24
      }
    ]
  }
}
```

تُرتَّب الأشرطة من الأقدم أولاً حسب `t` (وقت الفتح)؛ العنصر الأحدث هو
الشريط الجاري تشكُّله. المصفوفة الفارغة `candles` هي الإجابة الصادقة لسوق بلا
سجل (أو بلا مصدر أرشيف/طيّ متصل).

| Field | Type | Description |
|-------|------|-------------|
| `t` | uint64 | الطابع الزمني لـ**فتح** الشريط (مللي ثانية، محاذٍ للدلو) |
| `T` | uint64 | الطابع الزمني لـ**إغلاق** الشريط (مللي ثانية) |
| `i` | string | رمز دلو الفاصل الزمني |
| `o` / `c` / `h` / `l` | Decimal string | سعر الـ**فتح** / الـ**إغلاق** / الـ**أعلى** / الـ**أدنى**، سلسلة **بنقطة عائمة ثابتة 1e8** (مثل `"6165270000000"` = `61652.7`) |
| `v` | Decimal string | **حجم الأصل القاعدي** — مجموع الحجم المتداوَل في الشريط (بوحدات الحجم، وليس القيمة الاسمية) |
| `n` | uint64 | عدد الصفقات (التعبئات) في الشريط |

### الحصول على سجل علاوة التمويل {#funding_history}

عيّنات علاوة التمويل في نطاق سوق واحد (حلقة العلاوة).

```json
{ "type": "funding_history", "coin": "BTC" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `coin` | symbol | نعم | رمز السوق |
| `start_time` | uint64 | لا | بداية النافذة (مللي ثانية)؛ يُصفِّي حسب `ts_ms` العيّنة |
| `end_time` | uint64 | لا | نهاية النافذة (مللي ثانية) |

غياب `coin` ← `400 {"error":"missing field coin"}`.

الاستجابة:

```json
{
  "type": "funding_history",
  "data": {
    "coin": "BTC",
    "samples": [
      { "ts_ms": 1783008579269, "premium": "0.00027179", "funding_rate": "0.00027179" },
      { "ts_ms": 1783008587316, "premium": "0.0005469",  "funding_rate": "0.0005469" }
    ]
  }
}
```

العيّنات هي الحلقة المرتَّبة من لقطات العلاوة الصادرة عن متتبع التمويل.
`premium` هو قيمة `Decimal` الدقيقة قبل التقليص، مُعرَضة كسلسلة نصية (موقَّعة،
بدقة كاملة)؛ أما `funding_rate` فهو تلك العلاوة بعد تمريرها عبر سقف التمويل لكل
أصل — المعدل المُحقَّق الذي سيُحصَّل فعليًا. عندما تكون العلاوة ضمن السقف يكون
`funding_rate == premium`؛ وفوقه يُقلَّص `funding_rate` إلى السقف الموقَّع.
يُرجع السوق غير المعروف / الفارغ `"samples": []`.

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | رمز السوق المُعاد صداه |
| `samples[*].ts_ms` | uint64 | طابع زمني للعيّنة (مللي ثانية الإجماع) |
| `samples[*].premium` | decimal string | عيّنة علاوة التمويل الخام، قبل التقليص (موقَّعة) |
| `samples[*].funding_rate` | decimal string | المعدل المُحقَّق = `premium` مُقلَّصة إلى سقف الأصل (موقَّعة) |

### الحصول على معدلات التمويل المتوقعة {#predicted_fundings}

معدل التمويل المتوقَّع + وقت التسوية التالي لكل سوق، عبر جميع أسواق العقود
الدائمة المسجَّلة. لا توجد معاملات.

```json
{ "type": "predicted_fundings" }
```

حمولة `data` هي **مصفوفة**، بعنصر واحد لكل سوق عقود دائمة مسجَّل، بترتيب
تصاعدي للأسواق. يُرجع الكون الفارغ `"data": []`.

الاستجابة:

```json
{
  "type": "predicted_fundings",
  "data": [
    { "coin": "BTC", "predicted_rate": "0.0020702132945825193491902456", "next_funding_time": 1783011600000 },
    { "coin": "ETH", "predicted_rate": "0.0091563951859402408793685995", "next_funding_time": 1783011600000 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | رمز السوق |
| `predicted_rate` | decimal string | المعدل **المُقلَّص** الذي سيُحصَّل فعليًا عند الحد التالي — العلاوة بعد تمريرها عبر سقف `±cap` لكل أصل، موقَّعة (`"0"` قبل أول عيّنة) |
| `next_funding_time` | uint64 | **حد التسوية المحاذى التالي** لكل أصل (مللي ثانية منذ Epoch)؛ `0` قبل أول عيّنة |

:::info
**`predicted_rate` هو المعدل المُحصَّل، وليس العلاوة الخام.** يعكس سقف التمويل
المطبَّق لكل أصل — الرقم الذي سيُخصَم من/يُضاف إلى مركز ما لو تمت تسوية التمويل
الآن. تتم تسوية التمويل **بشكل منفصل** عند حد كل أصل (`next_funding_time`)،
بوتيرة `interval_ms` لكل أصل (ساعة واحدة افتراضيًا). لسلسلة العلاوة الخام قبل
التقليص انظر [`funding_history`](#funding_history)؛ للوتيرة/الحد انظر
[`market_info`](#market_info) `funding.interval_ms` / `funding.next_payment_ts`.
:::

### الحصول على حالة مزاد غاز نشر العقود الدائمة {#mip3_active_bids}

لقطة مزاد غاز نشر العقود الدائمة غير المُصرَّح به وفق MIP-3. لا توجد معاملات.

```json
{ "type": "mip3_active_bids" }
```

الاستجابة:

```json
{
  "type": "mip3_active_bids",
  "data": {
    "auction_round":   2,
    "current_bid":     "12345",
    "current_winner":  "0x<bidder>",
    "auction_end_ms":  1700086400000,
    "started_at_ms":   1700000000000,
    "bids": [
      {
        "bidder":          "0x<bidder>",
        "amount":          "12345",
        "submitted_at_ms": 1700000000500,
        "tag":             "ETH-PERP"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | جولة المزاد الحالية |
| `current_bid` | decimal string | مبلغ العرض الرائد |
| `current_winner` | hex address \| null | المتقدم الفائز حاليًا، `null` إذا لم يكن هناك أحد |
| `auction_end_ms` | uint64 | طابع زمني لإغلاق المزاد (مللي ثانية الإجماع) |
| `started_at_ms` | uint64 | طابع زمني لبدء المزاد (مللي ثانية الإجماع) |
| `bids[*].bidder` | hex address | عنوان المتقدم |
| `bids[*].amount` | decimal string | مبلغ العرض |
| `bids[*].submitted_at_ms` | uint64 | طابع زمني لتقديم العرض (مللي ثانية الإجماع) |
| `bids[*].tag` | string | وسم العرض (مثلًا اسم السوق المقترح) |

### سرد الحسابات المصنَّفة للتصفية {#liquidatable}

الحسابات المُصنَّفة حاليًا للتصفية. لا توجد معاملات.

```json
{ "type": "liquidatable" }
```

الاستجابة:

```json
{
  "type": "liquidatable",
  "data": { "accounts": [ { "address": "0x<addr>", "tier": "PartialMarket50" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accounts[*].address` | hex address | الحساب الذي يستدعي إجراءً |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | مستوى BOLE |

مصدر الحالة: `Exchange.bole_index.tier` (فهرس BOLE للإجراءات المطلوبة — **وليس** إعادة مسح كاملة للحساب).

> **ملاحظة.** `bole_index` يحمل `#[serde(skip)]` وهو حالة مشتقة غير قانونية، يُعاد بناؤها بمسح كامل عند الاستخدام الأول / بعد تحميل اللقطة. في لقطة منشورة حديثًا تكون فارغة حتى تُنفِّذ وحدة التشغيل تمريرة BOLE مرة واحدة على الأقل.

### الحصول على حدود تداول المستخدم في السوق {#active_asset_data}

الرافعة المالية / وضع الهامش / الحجم الأقصى للتداول لكل سوق للمستخدم.
المطلوب: `address` (سداسي عشري بصيغة 0x) + `coin` (رمز).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "coin": "BTC" }
```

| Arg | Type | Required |
|-----|------|----------|
| `address` | hex address | نعم |
| `coin` | symbol | نعم |

غياب `address` ← `400 {"error":"missing field: address"}`؛ غياب `coin` ←
`400 {"error":"missing field coin"}`.

الاستجابة:

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "coin": "BTC", "leverage": 50,
    "margin_mode": "cross", "mark_px": "61550.29664777",
    "max_trade_size": "0", "max_trade_szs": ["0", "0"],
    "available_to_trade": ["0", "0"], "has_position": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | رمز السوق المُعاد صداه |
| `leverage` | uint32 | رافعة المركز إن كان مفتوحًا، وإلا الافتراضي للحساب، وإلا الحد الأقصى للسوق |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | وضع الهامش الفعّال |
| `mark_px` | decimal string | الوسم الحالي، المستوى العشري البشري |
| `max_trade_size` | decimal string | سقف الأمر الأقصى لكل سوق (انظر [`max_market_order_ntls`](#max_market_order_ntls)) |
| `max_trade_szs` | [decimal string, decimal string] | الحجم الأقصى القابل للتداول `[شراء, بيع]` |
| `available_to_trade` | [decimal string, decimal string] | القيمة الاسمية المتاحة للفتح `[شراء, بيع]` |
| `has_position` | bool | ما إذا كان لدى المستخدم مركز غير صفري في هذا السوق |

### الحصول على الحدود القصوى للقيمة الاسمية لأوامر السوق {#max_market_order_ntls}

القيمة الاسمية القصوى لأوامر السوق لكل أصل. لا توجد معاملات.

```json
{ "type": "max_market_order_ntls" }
```

الاستجابة:

```json
{
  "type": "max_market_order_ntls",
  "data": { "ntls": [ { "asset_id": 0, "max_market_order_ntl": "5000000000" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | معرف الأصل |
| `ntls[*].max_market_order_ntl` | decimal string | سقف الحجم المشتق من حد الفائدة المفتوحة |

مصدر الحالة: `PerpAnnotation.oi_cap` لكل سوق، وإلا `default_mip3_limits.max_oi_per_market`.

> **ملاحظة.** لا يوجد حقل مخصص لـ"الحد الأقصى لقيمة أمر السوق" لكل أصل في الحالة المُثبَّتة؛ حد الفائدة المفتوحة هو أقرب سقف مخاطر مُثبَّت، ويُبلَّغ عنه بوحدات **الحجم** (تحوّله طبقة المطابقة إلى قيمة افتراضية بسعر العلامة الحي).

### سرد الأصول عند حد الفائدة المفتوحة {#perps_at_open_interest_cap}

الأصول التي وصلت فائدتها المفتوحة إلى الحد الأقصى أو تجاوزته. لا توجد معاملات.

```json
{ "type": "perps_at_open_interest_cap" }
```

الاستجابة:

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `assets` | uint32[] | معرفات الأصول عند حد `oi_cap` أو فوقه، تصاعديًا |

مصدر الحالة: `open_interest` لكل دفتر مقارنةً بـ`PerpAnnotation.oi_cap` (تُتجاهل الدفاتر التي لا تملك حدًا موجبًا).

### `margin_table` — أُزيل {#margin_table--removed}

:::warning
**تمت إزالة `margin_table`.** بات سلّم الهامش يرتحل الآن **مضمَّنًا** على كل سجل
سوق باسم `margin_tiers` — اقرأه من [`market_info`](#market_info) (سوق واحد) أو
[`markets`](#markets) (جميع الأسواق). كل مستوى هو
`{max_open_interest: string|null, max_leverage: u8, maint_margin_ratio: bps-string}`:
نطاقات تصاعدية محدَّدة بحد أعلى، و`null` = المستوى الأعلى غير المحدود. أي طلب
لـ`margin_table` يُرجع الآن `400 {"error":"unknown info type: margin_table"}`.
:::

### سرد بورصات العقود الدائمة (DEX) {#perp_dexs}

سرد بورصة/بورصات العقود الدائمة. لا توجد معاملات.

```json
{ "type": "perp_dexs" }
```

الاستجابة:

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | فهرس DEX في `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | عدد دفاتر الأصول في DEX |
| `dexs[*].assets` | uint32[] | معرفات الأصول في DEX |

مصدر الحالة: `Exchange.perp_dexs`.


## انظر أيضًا {#see-also}

- [`POST /info`](../info.md) — نقطة نهاية القراءة الأساسية (الغلاف، الاصطلاحات، استعلامات الحساب والبنية التحتية)
- [استعلامات الفوري والهامش](./spot.md) — قراءات الفوري / هامش الفوري / Earn
- [العقود الدائمة](../../../products/perpetuals.md) — المنتج
