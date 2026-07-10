---
description: "تغييرات جذرية في واجهة API الخاصة بالعقدة (node) والبوابة (gateway) الإصدار 0.7.14 — عنونة عبر coin/address، وأنواع استعلامات مُزالة، وشرائح هامش (margin tiers) مضمّنة، وتحديثات على قنوات WS. قائمة تحقق للترحيل موجهة للمُدمِجين وصانعي السوق."
---

# ترحيل الـ API — 0.7.14

:::warning
**تغييرات جذرية.** يُغيّر هذا الإصدار طريقة عنونة الأسواق والحسابات
في واجهة القراءة، ويُزيل ثلاثة أنواع استعلامات، ويُحدّث عدة قنوات WS.
إجراءات `/exchange` الموقَّعة **لم تتغيّر**. اعمل على قائمة التحقق أدناه
قبل ترقية أي عميل.
:::

## نظرة سريعة {#at-a-glance}

| المجال | القديم | الجديد |
|------|-----|-----|
| عنونة سوق (قراءات) | `asset_id` / `market_id` (رقمي) | **`coin`** (رمز، مثل `"BTC"`) |
| عنونة حساب (قراءات) | `account_id` **أو** `address` | **`address`** (سداسي عشري 0x) فقط |
| سجل الشموع | `candle` | **`candle_snapshot`** (استعلام الشمعة المفردة) |
| لقطة الواجهة الأمامية المُركّبة | `web_data2` (REST + WS) | **مُزالة** — رَكِّب قراءات مُركَّزة بدلًا منها |
| سلّم الهامش | استعلام `margin_table` | **`margin_tiers`** مضمّن على `market_info` / `markets` |
| الصفقات الأخيرة ضمن نافذة زمنية | — | **`trades_by_time`** (جديد) |
| حد اشتراكات WS | 256 / اتصال | **64 / اتصال** |

## 1. عنونة الأسواق عبر `coin` {#1-markets-are-addressed-by-coin}

كل قراءة مرتبطة بسوق أصبحت الآن تحدد السوق عبر **رمز `coin`**. مُعطيات
الطلب الرقمية `asset_id` / `market_id` **مُزالة** — أي طلب
يُرسلها (ويُغفل `coin`) يُرفض برسالة
`400 {"error":"missing field coin"}`.

القراءات المتأثرة: `market_info`، `markets`، `l2_book`، `recent_trades`،
`trades_by_time`، `funding_history`، `oracle_sources`، `active_asset_data`،
`fba_batch_state`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"market_info","asset_id":0}
+ {"type":"market_info","coin":"BTC"}
```

تُعيد الاستجابات رمز `coin` ضمن محتواها (مثلًا صفوف `recent_trades` تحمل
`"coin":"BTC"`). لا تزال `market_info` / `markets` تحتفظان بحقل **`asset_id`** حاليًا بصفته
طبقة توافق مهجورة (deprecated) خاصة بالمفهرس — **لا تعتمد عليه في التطوير**؛ فقد
يُحذف دون ترقية إصدار الاتصال (wire-version bump).

## 2. عنونة الحسابات عبر `address` {#2-accounts-are-addressed-by-address}

لم تعد القراءات المرتبطة بحساب تقبل `account_id`؛ مرِّر `address` (سداسي عشري 0x) بدلًا منه.

القراءات المتأثرة: `open_orders`، `user_fills`، `user_fills_by_time`، `agents`،
`sub_accounts`، `rfq_user`، `pm_summary`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

اختفى حقل `account_id` الذي كان يُعاد ضمن هذه الاستجابات.

## 3. أنواع الاستعلامات المُزالة {#3-removed-query-types}

| المُزال | يُعيد الآن | استخدم بدلًا منه |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` مضمّن على [`market_info`](./rest/info/perpetuals.md#market_info) / [`markets`](./rest/info/perpetuals.md#markets) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) + [`spot_clearinghouse_state`](./rest/info/spot.md#spot_clearinghouse_state) + [`frontend_open_orders`](./rest/info.md#frontend_open_orders) + [`user_vault_equities`](./rest/info.md#user_vault_equities) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2` (قناة WS) | `unknown channel: web_data2` | قناتا WS باسم `account_state` + `spot_state` |

## 4. `margin_tiers` — سلّم مضمّن مقسّم حسب النطاقات الاسمية {#4-margin_tiers--inline-notional-banded-ladder}

أصبح سلّم هامش الصيانة الآن مضمّنًا **inline** ضمن كل سجل سوق تحت اسم
`margin_tiers`، وهو قائمة تصاعدية من نطاقات الحدود العليا:

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` — **الحد الأعلى** للنطاق (سلسلة عشرية، بوحدات الحجم)؛
  `null` = **الشريحة العليا غير المحدودة**.
- `max_leverage` — أقصى رافعة مالية في هذا النطاق (`u8`).
- `maint_margin_ratio` — نسبة هامش الصيانة، **سلسلة نقاط أساس عشرية (decimal bps)**
  (`"100"` = 1.00%).

الشريحة = أول نطاق لا يتجاوز حده `max_open_interest`. تنخفض الرافعة
ويرتفع هامش الصيانة كلما زادت الفائدة المفتوحة (open interest).

## 5. جديد: `trades_by_time` {#5-new-trades_by_time}

الصفقات العامة الأخيرة لسوق واحد ضمن نافذة `[start_time, end_time]`
(الحلقة المحدودة؛ أما السجل التاريخي العميق فعبر أرشيف البوابة):

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

تشترك الصفوف في نفس بنية [`recent_trades`](./rest/info/perpetuals.md#recent_trades).

## 6. بنية `markets` {#6-markets-shape}

أصبح `markets.data` الآن **كائنًا (object)**، لا مصفوفة:

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

يحمل كل عنصر في `perp[]` حقول السوق **الديناميكية** فقط — نفس المجموعة الفرعية الديناميكية التي تتضمنها `market_info` لعملة (`coin`) واحدة. أما الحقول **الثابتة** (شبكات الدقة، سلالم الرافعة/الهامش، أعلام التحكم بالتداول) فتقيم بشكل منفصل ضمن [`markets_meta`](./rest/info/perpetuals.md#markets_meta)؛ وتُعيد `market_info` اتحاد الاثنين معًا.

## 7. تغييرات WebSocket {#7-websocket-changes}

- **قناة `web_data2` مُزالة** — انظر البديل أعلاه.
- **`trades`**: أصبح `data` **مصفوفة (array)**؛ إطار الاشتراك الأول
  (`is_snapshot: true`) هو مصفوفة **غير فارغة** من الصفقات الأخيرة (فارغة فقط إذا
  لم يتداول السوق قط)، وصفوف اللقطة تحمل **`users: null`**. أما الدفعات
  الحية فتحمل `users: [taker, maker]`.
- **`user_fundings`**: أصبحت السجلات الآن تحمل `{coin, payment, szi, fundingRate, time}`
  (`payment` رقم موقَّع بوحدة USDC كاملة: سالب = مدفوع، موجب = مستلَم).
- تحمل صفوف **`explorer_txs`** حقل **`hash`** (تجزئة الإجراء بصيغة `0x`؛ فارغة
  `""` لمُدخَل نظامي). أما **`explorer_block`** فتبثّ ترويسة الكتلة المُلتزَم بها.
- **`order_updates`**: في سجل `filled`، يمثّل `order.sz` الحجم **المُنفَّذ**
  بينما `order.orig_sz` هو حجم الطلب **الأصلي**.
- **القنوات الفعّالة**: `account_state`، `spot_state`، `order_updates`، `fills`،
  `user_events`، `user_fundings`، `ledger_updates`، `l2_book`، `bbo`، `trades`،
  `candles`، `all_mids`، `active_asset_ctx`، `active_asset_data`،
  `explorer_block`، `explorer_txs`.

## 8. دلالات `predicted_fundings` {#8-predicted_fundings-semantics}

مُفهرَسة حسب `coin`؛ كل مُدخل هو
`{coin, predicted_rate, next_funding_time}`:

- `predicted_rate` هو المعدل **المُقيَّد (clamped)** الذي يُحصَّل فعليًا عند حد التسوية
  (العلاوة (premium) مُمرَّرة عبر `±cap` الخاص بالأصل)، وليس العلاوة الخام.
- `next_funding_time` هو **حد التسوية المُحاذى التالي لكل أصل** (بالمللي ثانية).

يُسوَّى التمويل (funding) بشكل **منفصل (discrete)** عند حدود كل أصل (ساعة واحدة افتراضيًا)؛
وتبقى عينات `funding_history` هي حلقة العلاوة الخام. يحمل `market_info.funding`
كلًا من `interval_ms` (وتيرة كل أصل) و`next_payment_ts` (الحد الزمني).

## 9. حدود معدل الطلبات {#9-rate-limits}

- لكل IP: **1200 وزن / دقيقة** — عناوين IP المُدرجة في القائمة البيضاء مُعفاة.
- دلو رموز `/exchange` لكل حساب — **الموقّعون المُحدَّدون من metaliquidity مُعفَون**.
- WS: **64 اشتراكًا لكل اتصال** (تراجعًا من 256) — الاتصالات المُدرجة في
  القائمة البيضاء مُعفاة.

انظر [حدود معدل الطلبات](./rate-limits.md).

## 10. ما لم يتغيّر {#10-unchanged}

- **معرّفات الطلب / الصفقة**: `oid`، `tid`، `cloid` لم تتغيّر (`tid` من نوع `u64` —
  حلِّلها كعدد صحيح كبير، إذ يمكن أن تتجاوز 2⁵³).
- **إجراءات `/exchange` الموقَّعة**: ملخصات (digests) الإجراءات المُصنَّفة
  **مُجمَّدة على مستوى الإجماع (consensus-frozen)** — يبقى `asset` عددًا صحيحًا `u32` في الإجراءات
  الموقَّعة. تغيير `coin`/`address` هو تغيير في **واجهة القراءة (read-API)** فقط؛
  و**لا** يؤثر على كيفية توقيع أمر أو إلغائه. انظر [`POST /exchange`](./rest/exchange.md).

## انظر أيضًا {#see-also}

- [`POST /info`](./rest/info.md) · [استعلامات العقود الدائمة](./rest/info/perpetuals.md) · [استعلامات السبوت والهامش](./rest/info/spot.md)
- [اشتراكات WS](./ws/subscriptions.md)
- [حدود معدل الطلبات](./rate-limits.md) · [الأخطاء](./errors.md)
