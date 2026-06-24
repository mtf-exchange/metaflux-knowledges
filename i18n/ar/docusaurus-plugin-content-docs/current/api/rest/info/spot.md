---
description: "استعلامات القراءة عبر POST /info لأسواق العملات الفورية، وهامش العملات الفورية الرافع، وتجمع إقراض Earn."
---

# `POST /info` — استعلامات السوق الفوري والهامش

استعلامات القراءة لأسواق [العملات الفورية](../../../products/spot.md)، و[هامش العملات الفورية](../../../products/spot-margin.md) الرافع، وتجمع [Earn](../../../concepts/earn.md). يستخدم نفس نقطة النهاية `POST /info` وغلاف الطلب المشروحَيْن في [الصفحة الرئيسية](../info.md).

## أنواع استعلامات السوق الفوري والهامش وEarn

### `spot_meta`

مجموعة أزواج العملات الفورية وسجل الرموز لكل عملة. لا يتطلب أي معاملات.

```json
{ "type": "spot_meta" }
```

الاستجابة:

```json
{
  "type": "spot_meta",
  "data": {
    "pairs": [
      { "id": 100, "name": "USDC", "base": 100, "quote": 100, "taker_fee_bps": 0, "min_notional": "0", "active": true },
      { "id": 101, "name": "BTC",  "base": 101, "quote": 101, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 104, "name": "MTF",  "base": 104, "quote": 104, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true },
      { "id": 113, "name": "MTF/USDC", "base": 104, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true }
    ],
    "tokens": [
      { "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6 },
      { "id": 101, "name": "BTC",  "sz_decimals": 5, "wei_decimals": 8 },
      { "id": 102, "name": "ETH",  "sz_decimals": 4, "wei_decimals": 18 },
      { "id": 103, "name": "SOL",  "sz_decimals": 2, "wei_decimals": 9 },
      { "id": 104, "name": "MTF",  "sz_decimals": 2, "wei_decimals": 8 }
    ]
  }
}
```

:::info
**يحتوي `pairs` على نوعين من الإدخالات.** "الأزواج الذاتية" لكل رمز (`id` = معرّف الرمز، `base == quote`، مثل `100`/USDC و`101`/BTC و... و`104`/MTF) هي سجل الرموز المعروض على هيئة أزواج؛ أما **الأزواج القابلة للتداول الفعلية** فتحمل معرفات `110+` (`BTC/USDC`=110، `ETH/USDC`=111، `SOL/USDC`=112، `MTF/USDC`=113) مع `base`/`quote` متمايزَيْن و`active:true`. وتعكس خاصية `active` في الزوج الذاتي ما إذا كان دفتر الأوامر المستقل لذلك الرمز نشطاً (USDC فقط على Devnet حالياً).
:::

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `pairs[*].id` | uint32 | معرّف الزوج (`SpotPairSpec.pair_id`)؛ `110+` = أزواج `BASE/USDC` الفعلية |
| `pairs[*].name` | string | اسم الزوج (مثل `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | معرّف الأصل الأساسي / أصل التسعير (متطابقان في الأزواج الذاتية) |
| `pairs[*].taker_fee_bps` | uint16 | رسوم آخذ السيولة (بالنقاط الأساسية)؛ `0` إذا لم يُحدَّد |
| `pairs[*].min_notional` | decimal string | الحد الأدنى للقيمة الاسمية (سنتات USDC)؛ `"0"` إذا لم يُحدَّد |
| `pairs[*].active` | bool | ما إذا كان الزوج نشطاً للتداول |
| `tokens[*].id` | uint32 | معرّف أصل الرمز الفوري (`100`=USDC، `101`=BTC، `102`=ETH، `103`=SOL، `104`=MTF) |
| `tokens[*].name` | string | اسم الرمز (مثل `"USDC"` أو `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | دقة العرض / الحجم |
| `tokens[*].wei_decimals` | uint8 | منازل الرمز الأصلية بأسلوب ERC-20 (USDC=6، BTC=8، ETH=18، SOL=9، MTF=8) |

يأتي `tokens` و`pairs` مرتَّبَيْن وفق ترتيب `BTreeMap` الثابت (حسب معرّف الأصل / الزوج).

مصدر الحالة: `Exchange.mip3_spot_pair_specs` (الأزواج) + `Exchange.mip3_spot_token_specs` (الرموز).

### `spot_clearinghouse_state`

أرصدة الرموز الفورية لكل حساب. مطلوب: `address` (عنوان hex بادئته 0x).

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

الاستجابة:

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "total": "10", "hold": "0" } ]
  }
}
```

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `balances[*].asset` | uint32 | معرّف الأصل الفوري (`104` = MTF) |
| `balances[*].name` | string | اسم الرمز / الزوج، أو `asset:<id>` في حالة عدم التعرف |
| `balances[*].total` | decimal string | الرصيد الكامل مقطوعاً باتجاه الصفر |
| `balances[*].hold` | decimal string | المبلغ المجمَّد خلف أوامر الشراء أو البيع المعلقة (ضمان الأمانة)؛ القابل للصرف = `total − hold` |

تُمثّل مجموعة الرموز اتحادَ مفاتيح رصيد الحساب وضمانه (`reserved`) — يظهر الرمز حتى لو كان محتجزاً بالكامل مع رصيد صفري قابل للصرف. يُجرى المسح نطاقياً لكل حساب (لا مسح كامل للجدول). مصدر الحالة: `locus.spot_clearinghouse.{balances, reserved}` (كلاهما مفهرَس بـ `(owner, asset)`).

### `spot_margin_state`

:::info
**متاح على Devnet (معاينة).** واجهة قراءة لـ[هامش العملات الفورية](../../../products/spot-margin.md) الرافع؛ راجع صفحة المفهوم للاطلاع على تحفظات المعاينة.
:::

كل مراكز هامش العملات الفورية التي يحتفظ بها حساب واحد. مطلوب: `user` (عنوان hex بادئته 0x).

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

الاستجابة:

```json
{
  "type": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": 200,
        "collateral": "5",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ]
  }
}
```

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `accounts[*].pair` | uint32 | معرّف الزوج الفوري الذي يتخذ المركز عليه |
| `accounts[*].collateral` | decimal string | الضمانات المُودَعة من أصل التسعير (احتياطي الخسارة) |
| `accounts[*].borrowed` | decimal string | **أصل** القرض القائم (محسوباً عند مؤشر اللقطة) |
| `accounts[*].borrow_index_snapshot` | decimal string | مؤشر الاقتراض من التجمع المُسجَّل عند فتح المركز (أساس استحقاق الدَّيْن) |
| `accounts[*].base_held` | decimal string | الأصل الأساسي المشترى برافعة مالية في حساب منفصل (لا يُدرَج في الأرصدة القابلة للصرف) |
| `accounts[*].current_debt` | decimal string | الدَّيْن المستحق حتى الآن: `borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | إعدادات `{ init_bps, maint_bps }` لكل زوج؛ `null` = الهامش غير مُفعَّل أو غير مُعايَر للزوج |

تُدرَج المراكز مرتَّبةً حسب معرّف الزوج. يُعيد الحساب الذي لا يملك مراكز مصفوفة `accounts` فارغة.

### `earn_state`

:::info
**متاح على Devnet (معاينة).** واجهة قراءة لتجمعات إقراض [Earn](../../../concepts/earn.md)؛ راجع صفحة المفهوم للاطلاع على تحفظات المعاينة.
:::

كل تجمعات إقراض Earn، إضافةً إلى حصة حساب واحد عند توفير `user`. اختياري: `user` (عنوان hex بادئته 0x).

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

الاستجابة:

```json
{
  "type": "earn_state",
  "data": {
    "pools": [
      {
        "asset": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": 1000,
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `pools[*].asset` | uint32 | معرّف أصل التسعير القابل للإقراض (مفتاح التجمع) |
| `pools[*].total_supplied` | decimal string | صافي قيمة أصول التجمع — الأصل المودَع مضافاً إليه الفوائد المسددة المُدمَجة |
| `pools[*].total_borrowed` | decimal string | أصل التسعير المُقرَض حالياً لمقترضي هامش العملات الفورية |
| `pools[*].idle` | decimal string | `total_supplied − total_borrowed` — الحد القابل للسحب الفوري |
| `pools[*].shares_total` | decimal string | إجمالي الحصص القائمة |
| `pools[*].share_value` | decimal string | `total_supplied / shares_total` (`0` عند انعدام الحصص) |
| `pools[*].borrow_index` | decimal string | مؤشر الاقتراض التراكمي (أساس استحقاق الدَّيْن) |
| `pools[*].reserve_factor_bps` | uint16 | حصة البروتوكول من فوائد الاقتراض (بالنقاط الأساسية) |
| `pools[*].borrow_rate_bps_annual` | uint32 | معدل الاقتراض السنوي (بالنقاط الأساسية) |
| `pools[*].reserve_accrued` | decimal string | الاحتياطي المتراكم للبروتوكول من الفوائد |
| `pools[*].user_shares` | decimal string | **مع `user` فقط** — الحصص التي يمتلكها الحساب في التجمع |
| `pools[*].user_value` | decimal string | **مع `user` فقط** — `user_shares × share_value` |

تُدرَج التجمعات مرتَّبةً حسب معرّف الأصل. يؤدي حذف `user` إلى إسقاط حقلَي `user_shares` / `user_value`.

### `spot_deploy_state`

حالة مزاد الغاز لنشر أزواج العملات الفورية وفق MIP-1. لا يتطلب أي معاملات.

```json
{ "type": "spot_deploy_state" }
```

الاستجابة:

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| الحقل | النوع | الوصف |
|-------|------|-------------|
| `auction_round` | uint64 | الجولة الحالية |
| `current_bid` | decimal string | العطاء الرائد |
| `current_winner` | hex address \| null | صاحب أعلى عطاء حالياً |
| `auction_end_ms` / `started_at_ms` | uint64 | نافذة المزاد (بالمللي ثانية وفق توقيت الإجماع) |
| `total_burned` | decimal string | إجمالي القيمة الاسمية للعطاءات الفائزة المحروقة تراكمياً |
| `deposit` | decimal string | إجمالي الوديعة المجمَّدة في الضمان (بالوحدات الأساسية) |

مصدر الحالة: `Exchange.spot_pair_deploy_gas_auction`.


## انظر أيضاً

- [`POST /info`](../info.md) — نقطة النهاية الرئيسية للقراءة (الغلاف والاتفاقيات واستعلامات الحسابات والبنية التحتية)
- [استعلامات العقود الدائمة](./perpetuals.md) — قراءات سوق العقود الدائمة
- [العملات الفورية](../../../products/spot.md) / [هامش العملات الفورية](../../../products/spot-margin.md) — المنتجات
