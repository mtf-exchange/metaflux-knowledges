# الجسر (Bridge)

:::info
**الحالة.** جسر الحضانة MetaBridge USDC **يعمل على Base Sepolia** (شبكة الاختبار،
`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af))،
إلى جانب برنامج حضانة Solana يعمل على **devnet** وفق النموذج ذاته. تم التحقق من
كلا الاتجاهين من طرف إلى طرف على Base Sepolia: إيداع حقيقي
(المراقب → التوقيع المشترك → التوقيع التلقائي المسجَّل → ائتمان بنصاب ⅔)، وجولة
سحب كاملة ذهاباً وإياباً (توقيع L1 المشترك → حلقة الترحيل → `batchWithdraw` على السلسلة →
نافذة النزاع → `claim`). التحسينات المُدمجة: `batchWithdraw`/`batchClaim` مُوزَّعة
تكاليفها على الغاز، دُفعات النجاح الجزئي، نافذة نزاع مزدوجة (وقت + كتلة)، فصل مفاتيح
المدقق بين الساخن والبارد، تدوير المدققين على مرحلتين مع صلاحية **إلغاء** (cancel)
لمدقق ساخن واحد خلال نافذة التدوير، وتوقيعات مرتبطة بالنطاق والحقبة محددة بدقة
بايت تلو بايت عبر عقد EVM وبرنامج Solana وطبقة L1 (متجهات إجابات معروفة
عابرة للغات). لا تزال عملية الطرح على Arbitrum ومراجعة ما قبل الإنتاج قائمتَين.
:::

تعتمد MetaFlux في جسر **جميع الأصول — بما فيها USDC — على MetaBridge**، وهو جسر
حضانة يستند إلى توقيعات مدققي MetaFlux (مكافئ HL-Bridge2). لا يوجد **أي جسر
من طرف ثالث، ولا اعتماد على Circle CCTP** في المسار الحرج.

## لماذا الحضانة وليس CCTP

لا تنقل CCTP سوى USDC بين السلاسل التي سجّلتها Circle ضمن *نطاقات* CCTP. MetaFlux
سلسلة L1 مستقلة؛ وإضافتها كنطاق CCTP قرار تجاري يعود لـ Circle ولا نملك التحكم فيه.
مسار إيداع يستلزم موافقة طرف ثالث ليوجد ليس أساساً صالحاً للبناء عليه، لذا تشغّل
MetaFlux جسر حضانتها الخاص وفق **افتراض الثقة ذاته لمجموعة المدققين في السلسلة** —
بلا لجنة خارجية، ولا شبكة حراسة، ولا بوّاب.

## النموذج

**عقد جسر على السلسلة المصدر** (Base أولاً) يحتجز الرموز المودعة. يراقب مدققو
MetaFlux الإيداعات ويُضيفون الرصيد على L1؛ وتُفرج عقود السلسلة عن عمليات السحب
بعد توقيع مشترك لمجموعة مدققين بنصاب ⅔ مرجَّح بالحصة، خلف نافذة نزاع.

### الإيداع (السلسلة المصدر → MetaFlux)

```
Base:
  1. user.approve(USDC, bridge)
  2. bridge.deposit(mtfDest, amount)        // USDC pulled into custody
  3. bridge emits Deposit{user, mtfDest, amount, nonce, …}

MetaFlux:
  4. each validator observes the Deposit event and submits an mbAttest
     (an Inbound MetaBridgeMsg partial co-signature) — validator authority,
     NEVER the public /exchange path
  5. on ⅔ stake-weighted quorum the L1 credits the user's USDC cross-collateral
     (the same system-credit primitive the faucet uses); each deposit credits
     EXACTLY ONCE (idempotent by message id)
```

حدث `Deposit` متوافق بايتياً مع `message_id` الحتمي لـ L1:
`keccak256(chain ‖ direction ‖ user ‖ asset ‖ amount ‖ dst ‖ nonce)`.

### السحب (MetaFlux → السلسلة المصدر)

```
MetaFlux:
  1. user submits a withdraw action (Outbound MetaBridgeMsg)
  2. validators co-sign it to ⅔ quorum; the L1 retains the signature set in
     meta_bridge.mb_outbox + finalized_cosignatures

Base (two-phase: request → claim):
  3. each validator's RELAY LOOP polls the committed L1 state and submits a
     batchWithdraw(...) tx — signed with the validator's OWN key, gas paid by the
     validator's EVM address (no separate relayer key). The contract recovers
     each entry's signers, sums HOT-set stake, requires ≥⅔, and QUEUES it into
     the dispute window. A bad/raced entry in the batch is skipped (FailedWithdrawal
     event), not reverted.
  4. after BOTH the dispute window (seconds) AND a minimum block count elapse,
     claim(id) / batchClaim(ids) releases USDC to the user. Any single validator
     can dispute(id) a queued withdrawal, or the COLD ⅔-quorum can
     invalidateWithdrawal(id), as an emergency revoke during the window.
```

## نموذج الأمان

- **الصلاحية** — توقيع متعدد لمدققي MetaFlux مرجَّح بنصاب ⅔ من الحصة (secp256k1،
  المفاتيح ذاتها التي تُؤمِّن الإجماع؛ نصاب `6700` bps). يُعدّ التوقيع المتعدد للمدققين
  ونافذة نزاع السحب ركيزتَين أساسيتَين: اختراق مفاتيح الجسر يعني خسارة الأموال، لذا
  تنال العقود مستوى مراجعة الإجماع/التوقيع ومراجعة قبل الإنتاج.
- **الحماية من إعادة التشغيل** — كل `message_id` يُكرَّم مرة واحدة فقط، مفتاحه على
  الهوية الاقتصادية chain/source-nonce، كي ينزل الائتمان مرة واحدة بالضبط حتى عبر
  دورة تدوير مجموعة المدققين؛ مُطبَّق على L1 والعقد (`withdrawalSeen` / علامة
  إنفاق دائمة في Solana). التوقيعات مرتبطة بالنطاق والحقبة، فلا يمكن إعادة استخدام
  توقيع مشترك عبر نشر مختلف أو سلسلة أخرى أو حقبة مجموعة مدققين مغايرة.
- **الحوكمة والتدوير** — لا حساب مدير؛ كل عملية ذات امتياز تستلزم توقيعاً مشتركاً
  من المدققين. تدوير مجموعة المدققين على مرحلتين (طلب → إنهاء خلف نافذة نزاع)؛
  خلال تلك النافذة، يستطيع أي مدقق ساخن **واحد** `pause` (مقيَّد بفترة تهدئة
  لكل مدقق) أو **إلغاء** التدوير المعلَّق كلياً، فلا يستطيع نصاب الحوكمة المخترق
  استبدال المجموعة بصمت. في Solana، تحمل المجموعة ذاتها سطح طوارئ `pause`/`dispute`
  لمدقق واحد، و`unpause`/`invalidateWithdrawal` بنصاب مجموعة.
- **خارج `/exchange`** — ائتمانات الإيداع تُحقَن عبر مسار نظام المدقق وهي
  هيكلياً غير قابلة للوصول من سطح المستخدم العام `/exchange`، وتُحسَب على مجموعة
  المدققين النشطين فقط.
- **تحفظ الحضانة** — USDC على MetaFlux مطالبة مجسَّرة مدعومة برصيد عقد
  المصدر، وليست canonical من Circle على MetaFlux (كما في نموذج HL).

## عمليات النشر

| الشبكة | العقد | العنوان |
|--------|-------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` (v3) | [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af) |
| Solana **devnet** | `metabridge-solana` | [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet) |
| Base / Solana mainnet | — | (قبل المراجعة) |

تحتضن USDC Base Sepolia الصادرة عن Circle (`0x036CbD…f3dCF7e`)؛ **مجموعة مدققين
مرجَّحة بنصاب ⅔، بلا مدير** (جميع العمليات ذات الامتياز تستلزم توقيع المدققين)،
نافذة نزاع مزدوجة 300 ثانية + 150 كتلة. توقيعات مفصولة نطاقياً ومرتبطة بالحقبة.
العقود ودليل النشر موجودان في مستودع
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts)؛
منطق التوقيع المشترك/الائتمان على جانب L1 تبقى في العقدة. شبكة اختبار ما قبل المراجعة —
غير مخصصة للاستخدام بأصول حقيقية.

## دوال العقد

### Base — `MetaBridgeUSDC` (EVM)

| الدالة | التفويض | الغرض |
|--------|---------|-------|
| `deposit(mtfDest, amount)` | أي مستخدم (المودِع) | سحب USDC إلى الحضانة، وإصدار `Deposit` ليصادق عليه المدققون |
| `withdraw(...)` / `batchWithdraw(reqs)` | أي من يرحّل مجموعة توقيع مشترك **HOT ⅔** | التحقق من النصاب وإدراج عمليات السحب في قائمة انتظار نافذة النزاع |
| `claim(mid)` / `batchClaim(mids)` | أي مستخدم | الإفراج عن USDC الناضجة بعد نافذة الوقت + الكتلة المزدوجة (غير قابلة للإيقاف) |
| `dispute(mid)` | أي مدقق **HOT** واحد | إلغاء سحب معلَّق داخل نافذة نزاعه |
| `cancelValidatorSetUpdate()` | أي مدقق **HOT** واحد | نقض تدوير مجموعة مدققين معلَّق خلال نافذته |
| `pause()` | أي مدقق **HOT** واحد | تجميد الإيداعات الجديدة وإدراج السحوبات في قائمة الانتظار (بفترة تهدئة لكل مدقق) |
| `unpause(...)` | **COLD ⅔** | رفع الإيقاف |
| `invalidateWithdrawal(mid, ...)` | **COLD ⅔** | إلغاء سحب احتيالي معلَّق ولم يُطالَب به بعد |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **COLD ⅔** | تقديم طلب تدوير مجموعة مدققين hot+cold على مرحلتين |
| `finalizeValidatorSetUpdate()` | أي مستخدم (بلا قيد) | تطبيق التدوير المقدَّم بعد انتهاء نافذة نزاعه |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **COLD ⅔** | ضبط نافذة النزاع (مقيَّدة بحد أدنى وأقصى) |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | إعادة إنتاج البايتات التي يوقّع عليها المدقق بدقة |
| `hot*/cold*` getters | view | حصة المدقق، الأعضاء، العدد، المجموع، النصاب bps / المطلوب |

جميع الاستدعاءات الموقَّعة مشتركاً تأخذ `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)` مرتَّبة تصاعدياً حسب الموقِّع، S منخفضة، `v ∈ {27,28}`.

### Solana — `metabridge-solana`

| التعليمة | التفويض | الغرض |
|----------|---------|-------|
| `initialize(params)` | المنشئ (مرة واحدة) | تثبيت USDC mint، ومجموعة المدققين، والنصاب، ونافذة النزاع المزدوجة |
| `deposit(mtf_dest, amount)` | المودِع (الموقِّع) | سحب SPL USDC إلى الحضانة، وإصدار `DepositEvent` |
| `withdraw(mid, user, amount, dst, nonce, cosigs)` | أي من يرحّل مجموعة توقيع مشترك **⅔** | التحقق من النصاب وإنشاء PDA للسحب المعلَّق `PendingWithdrawal` (+ علامة إنفاق دائمة) |
| `claim(message_id)` | أي مستخدم | الإفراج عن USDC المحتجزة بعد نافذة الوقت + الفتحة المزدوجة |
| `dispute(mid, cosig)` | أي مدقق واحد (توقيع مشترك واحد) | إلغاء سحب معلَّق داخل نافذته |
| `pause(cosig)` | أي مدقق واحد (توقيع مشترك واحد) | تجميد الإيداع / السحب / إنهاء التدوير |
| `unpause(gov_nonce, cosigs)` | توقيع مشترك **⅔** | رفع الإيقاف |
| `invalidate_withdrawal(mid, gov_nonce, cosigs)` | توقيع مشترك **⅔** | إلغاء سحب معلَّق |
| `request_validator_set_update(...)` | توقيع مشترك **⅔** | تقديم طلب تدوير مجموعة مدققين |
| `finalize_validator_set_update()` | أي مستخدم (بلا قيد) | تطبيق التدوير المقدَّم بعد انتهاء نافذته |

تستخدم Solana مجموعة مدققين واحدة (بلا تقسيم hot/cold) وليس لها نقاط دخول `setDisputeWindow` / batch؛ معرّف الاسترداد هو secp256k1 الخام `{0,1}` (مقابل `{27,28}` في EVM). كلتا السلسلتين ترفضان التوقيعات ذات S المرتفعة، وتربطان معرّف البرنامج/العقد + الحقبة في كل ملخص موقَّع مشتركاً.

## خارطة الطريق

- مراقب إيداع Base الحقيقي + موصِّل سحب (نواة L1 الحتمية + عقد Base جاهزان؛
  المراقبون خارج السلسلة مربوطون ويستخدمون وسم الكتلة `finalized` للحماية من
  إعادة التنظيم).
- الطرح متعدد السلاسل: برنامج حضانة Solana يعمل على devnet وفق النموذج ذاته؛
  Arbitrum هو التالي.
- مراجعة أمنية قبل أي نشر بأصول حقيقية (الشبكة الرئيسية).
- قابلية التركيب عبر السلاسل (استدعاء عقود سلاسل أخرى من MTF) — الإصدار V2.

## انظر أيضاً

- [الشبكات](../networks.md) — نقاط النهاية ومعرّفات السلاسل لكل شبكة
