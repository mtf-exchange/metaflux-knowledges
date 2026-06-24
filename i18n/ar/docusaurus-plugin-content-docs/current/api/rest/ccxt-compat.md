# واجهة REST المتوافقة مع CCXT

:::info
**معاينة.** تُتاح اليوم **9 طرق REST** مُركَّبة على الواجهة، يُعيد كلٌّ منها الشكل الموحَّد لـ [CCXT](https://docs.ccxt.com/) بدقة تامة. **تحليل الرمز، وبحث السوق، والمصادقة عبر JWT حقيقيةٌ وفعّالة**؛ أما الحقول النقدية فمُثبَّتة مؤقتاً (`"0.0"` / مصفوفات فارغة / معرِّفات `0`) إلى حين اكتمال مسار القراءة من البوابة إلى العقدة. دعم CCXT Pro (WebSocket) قادمٌ قريباً.
:::

## ملخص سريع

بالنسبة لأطر العمل الكمي التي تتعامل بالفعل مع بروتوكول CCXT — وجِّه عنوان URL الأساسي للبورصة نحو بوابة MetaFlux. يطابق شكل البروتوكول توقعات CCXT للطرق المدعومة. استخدم هذه الواجهة إذا كان لديك تكامل CCXT قائم؛ أما العملاء الجدد فيُستحسن أن يبدؤوا بـ [HL-compat](./hl-compat.md) أو [MTF-native](./exchange.md).

على غرار [HL-compat](./hl-compat.md)، تعيش هذه الواجهة **على البوابة حصراً** — إذ تترجم قراءات العقدة الأصلية بتنسيق MTF إلى الأشكال الموحَّدة لـ CCXT. العقدة نفسها تعمل بتنسيق MTF الأصلي (انظر [`/info`](./info.md))؛ ولا تصل أشكال CCXT إلى العقدة أبداً.

## عنوان URL

```
https://<gateway>/ccxt/<path>
```

جميع مسارات CCXT مُركَّبة تحت البادئة `/ccxt/` (للتمييز عن الواجهة الأصلية MTF الافتراضية `/info` + `/exchange` وواجهة HL-compat ضمن `/hl/*`). يُعيد الطلب إلى مسار غير مسبوق بالبادئة (`/markets`) خطأ 404 — البادئة شرط أساسي.

## طرق CCXT ← المسارات ← قراءات عقدة MTF الأصلية

الطرق الـ 9 المتاحة اليوم، مع آلية المصادقة. **التحويل** من شكل MTF الأصلي إلى شكل CCXT الموحَّد: snake_case ← camelCase لـ CCXT، معرِّف السوق `u32` ← رمز CCXT بصيغة `BASE/QUOTE:SETTLE`، قيم صحيحة ← سلاسل عشرية.

| طريقة CCXT | المسار | المصادقة | الحالة | مصدر قراءة عقدة MTF |
|-------------|--------|-----------|--------|----------------------|
| `fetchMarkets` | `GET /ccxt/markets` | لا | الشكل حي؛ بيانات genesis ثابتة | [`markets`](./info/perpetuals.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | لا | الشكل حي؛ الأسعار مُثبَّتة | [`market_info`](./info/perpetuals.md#market_info) + سعر mid |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | لا | الشكل حي؛ دفتر أوامر فارغ | [`l2_book`](./info/perpetuals.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | لا | غير مُخدَّم | سجل OHLCV — مُفهرس البوابة (خارطة الطريق) |
| `createOrder` | `POST /ccxt/orders` | Bearer | الشكل حي | ← [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | الشكل حي | ← [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | الشكل حي؛ الأرصدة مُثبَّتة | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | الشكل حي؛ المراكز مُثبَّتة | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | مدعوم من العقدة؛ الشكل حي | [`user_fills`](./info.md#user_fills) |
| — آلية المصادقة — | `POST /ccxt/auth` | لا | حقيقية | تسجيل دخول EIP-712 ← JWT |

**دليل المصطلحات:** **الشكل حي** = المسار مُركَّب، يُعاد الشكل الصحيح لـ CCXT، والحقول النقدية مُثبَّتة مؤقتاً ريثما يكتمل مسار القراءة · **مدعوم من العقدة** = قراءة العقدة المقابلة حيّة · **غير مُخدَّم** = لا دعم من العقدة بعد، سيُخدَّم من مُفهرس البوابة (خارطة الطريق).

:::warning
**الواجهة مقصودٌ بها أن تكون في حدها الأدنى.** الطرق التي يُعرِّفها CCXT لكن البوابة **لم تُركِّبها** بعد — `fetchTickers`، و`fetchTrades` (الشريط العام)، و`fetchOrder`، و`fetchOpenOrders`، و`fetchClosedOrders`، و`fetchOHLCV` بما يتجاوز النموذج المُثبَّت، و`setLeverage`، و`setMarginMode`، و`fetchFundingRate`، و`cancelAllOrders` — تُعيد 404. ستُضاف تحت `/ccxt/` مع توسّع مسار القراءة. ستترجم `fetchOpenOrders` / `fetchOrder` من قراءات [`open_orders`](./info.md#open_orders) / [`order_status`](./info.md#order_status) بالعقدة؛ وستترجم `fetchTrades` من شريط [`recent_trades`](./info/perpetuals.md#recent_trades)؛ أما `fetchOHLCV` / `fetchClosedOrders` فغير مُخدَّمتان بعد (خارطة طريق مُفهرس البوابة).
:::

## صيغة الرمز

يستخدم CCXT الصيغة `"BASE/QUOTE:SETTLE"` للمشتقات. تُعرض أسواق العقود الدائمة في MetaFlux على النحو التالي:

```
BTC/USDC:USDC      # عقد دائم، يُسوَّى بـ USDC
ETH/USDC:USDC
```

تستخدم أسواق الفوري (عند إطلاق كون الفوري) الصيغة `"BASE/QUOTE"` دون لاحقة `:SETTLE`. سجل الأسواق اليوم هو **بيانات genesis ثابتة** (`with_genesis_markets` — عقود genesis الدائمة)؛ سيحلّ محلّه سجلٌ مدعوم بـ gRPC يتجدَّد من قراءة [`markets`](./info/perpetuals.md#markets) بالعقدة فور اكتمال مسار القراءة. تحليل الرمز **حقيقي**: الرموز المشوَّهة → 400، والرموز المجهولة → 400.

## الأطر الزمنية

تقبل `fetchOHLCV` رموز CCXT القياسية: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. الأطر الزمنية غير الصحيحة تُعيد 400. سجل OHLCV غير مُخدَّم بعد — يُعاد الشكل الصحيح فارغاً في الوقت الراهن (خارطة طريق مُفهرس البوابة)؛ استخدم قناة WS [`candle`](../ws/subscriptions.md) للبيانات الحية.

## المصادقة

تتطلب الطرق الموثَّقة (`createOrder`، و`cancelOrder`، و`fetchBalance`، و`fetchPositions`، و`fetchMyTrades`) **رمز JWT Bearer**. يوجد **مخطط مصادقة واحد** — JWT مُصدَر من غلاف تسجيل دخول EIP-712. (لا يوجد مخطط HMAC `X-API-KEY`.)

### 1. تسجيل الدخول — `POST /ccxt/auth`

أرسل غلاف تسجيل دخول موقَّعاً بـ EIP-712؛ ستحصل على رمز JWT للجلسة. يُطابق الغلافُ `SignedEnvelope` الخاص بالعقدة — تُعيد البوابة اشتقاق ملخّص EIP-712 عبر `(address, nonce, expiry)` وتتحقق من التوقيع، ثم تُصدر رمز JWT بخوارزمية HS256 يكون فيه `sub` هو العنوان.

```bash
curl -X POST https://gateway/ccxt/auth \
  -H 'content-type: application/json' \
  -d '{
    "address":   "0x<addr>",
    "nonce":     1735689600000,
    "expiry":    1735689660000,
    "signature": "<base64 65-byte r||s||v>"
  }'
```

```json
{ "token": "<jwt>", "expiresAt": 1735693200 }
```

| حقل الغلاف | النوع | ملاحظات |
|------------|-------|---------|
| `address` | `0x` hex | عنوان EVM المُدَّعى به لتسجيل الدخول |
| `nonce` | u64 | رقم عشوائي للحماية من إعادة التشغيل (يُتحقق منه عند طبقة العقدة؛ JWT هو رمز الجلسة) |
| `expiry` | u64 ms | يُرفض الغلاف بعد هذا الوقت |
| `signature` | base64 | 65 بايت `r‖s‖v` (اصطلاح EVM)، مُرمَّز بـ base64 |

راجع [دليل التوقيع](../../integration/signing.md) لبناء ملخَّص EIP-712.

### 2. الاستدعاء — `Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

تُرفض الرموز المفقودة / المنتهية الصلاحية / ذات التوقيع الخاطئ بخطأ `401`. عنوان `sub` في JWT يحصر كل قراءة/كتابة موثَّقة في ذلك الحساب.

## أمثلة

### جلب الأسواق

```bash
curl https://gateway/ccxt/markets
```

```json
[
  {
    "id":           "BTC-PERP",
    "symbol":       "BTC/USDC:USDC",
    "base":         "BTC",
    "quote":        "USDC",
    "settle":       "USDC",
    "type":         "swap",
    "swap":         true,
    "spot":         false,
    "linear":       true,
    "contract":     true,
    "contractSize": 1,
    "precision":    { "price": 8, "amount": 8 },
    "limits":       { "amount": { "min": 0.0001 }, "price": { "min": 0.01 } },
    "maker":        0.0002,
    "taker":        0.0005,
    "active":       true
  }
]
```

### جلب بيانات السعر (Ticker)

```bash
curl 'https://gateway/ccxt/ticker?symbol=BTC/USDC:USDC'
```

```json
{
  "symbol":      "BTC/USDC:USDC",
  "bid":         "0.0",
  "ask":         "0.0",
  "last":        "0.0",
  "high":        "0.0",
  "low":         "0.0",
  "open":        "0.0",
  "close":       "0.0",
  "baseVolume":  "0.0",
  "quoteVolume": "0.0"
}
```

الحقول النقدية مُثبَّتة حالياً على `"0.0"`؛ سيملؤها مسار القراءة من سعر mid بالعقدة / [`market_info`](./info/perpetuals.md#market_info). شكل CCXT صحيح بايت بايت كي يتمكن العملاء من إلغاء تسلسله الآن وتلقِّي الأرقام الحقيقية تلقائياً لاحقاً.

### جلب دفتر الأوامر

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` مصفوفات بصيغة `[[price, amount], …]` (شكل CCXT). سيُطبَّق تقليص `limit` عند وصول المستويات الحقيقية من [`l2_book`](./info/perpetuals.md#l2_book).

### تقديم أمر

```bash
curl -X POST https://gateway/ccxt/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "symbol": "BTC/USDC:USDC",
    "type":   "limit",
    "side":   "buy",
    "amount": "1.0",
    "price":  "100.5",
    "params": { "timeInForce": "GTC", "reduceOnly": false }
  }'
```

الاستجابة (كائن أمر CCXT):

```json
{
  "id":            "12345",
  "clientOrderId": null,
  "symbol":        "BTC/USDC:USDC",
  "type":          "limit",
  "side":          "buy",
  "price":         100.5,
  "amount":        1.0,
  "filled":        0.0,
  "remaining":     1.0,
  "status":        "open",
  "timestamp":     1735689600000,
  "fee":           { "currency": "USDC", "cost": 0.0 },
  "info":          { /* raw chain response */ }
}
```

تترجم `createOrder` أمر CCXT إلى كتابة عبر [`/exchange`](./exchange.md) تحت حساب `sub` في JWT.

### إلغاء أمر

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## الأخطاء

تُعيد الواجهة المتوافقة مع CCXT رموز حالة HTTP صحيحة (لا تتبع اصطلاح HL بإعادة 200 مع حقل `status`)، مع أجسام أخطاء تحمل أسماء CCXT كي تُوجِّهها حِزَم SDK إلى صنف الاستثناء المناسب:

| HTTP | الجسم | السبب |
|------|-------|-------|
| 400 | `{"error":"<message>"}` | رمز مشوَّه/مجهول، معاملات خاطئة، إطار زمني غير صحيح |
| 401 | `{"error":"<message>"}` | رمز Bearer مفقود / منتهي الصلاحية / توقيعه خاطئ |
| 404 | — | مسار مجهول / مسار بلا بادئة / طريقة غير مُركَّبة |

## CCXT Pro (WebSocket) — مُخطَّط

ترقية WS بـ 5 قنوات (`GET /ccxt/ws`) مُهيَّكلة؛ التغطية الكاملة تُطابق REST:

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

راجع [اشتراكات WS](../ws/subscriptions.md) للاطلاع على القنوات الأساسية — يترجمها CCXT Pro واحدةً بواحدة.

## القيود مقارنةً بمواصفات CCXT الكاملة

- **الحقول النقدية مُثبَّتة** (`"0.0"` / مصفوفات فارغة / معرِّفات `0`) على كل طريقة ذات شكل حي إلى حين اكتمال مسار القراءة من البوابة إلى العقدة. الشكل نهائي؛ القيم فحسب معلَّقة.
- **`fetchMyTrades`** مدعومة الآن من العقدة (شريط الصفقات المُنفَّذة لكل حساب). **سجل OHLCV** (`fetchOHLCV`) و`fetchClosedOrders` المستقبلية غير مُخدَّمتين بعد — مُدرجتان ضمن مُفهرس البوابة (خارطة الطريق). استخدم قناتَي WS [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md) للبيانات الحية في المرحلة الراهنة.
- **لا مصادقة HMAC بمفتاح API.** يُستخدم مخطط EIP-712 ← JWT المذكور أعلاه حصراً. يحتفظ العملاء بحضانة المفاتيح — البوابة لا تحتجز أي سر.

## انظر أيضاً

- [HL-compat](./hl-compat.md) — الواجهة الأخرى المتوافقة
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md) — MTF الأصلي (المصدر الذي تترجم منه هذه الواجهة)
- [اشتراكات WS](../ws/subscriptions.md) — البنية التحتية لـ CCXT Pro
- [دليل التوقيع](../../integration/signing.md) — غلاف تسجيل الدخول بـ EIP-712
- [حدود المعدل](../rate-limits.md)
