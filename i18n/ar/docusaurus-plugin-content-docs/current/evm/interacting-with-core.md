# التفاعل مع Core

:::tip
**مباشر على devnet.** إجراءات CoreWriter تعمل بالكامل، وكذلك precompiles مشتقات MTF عديمة الحالة (`0x0900`–`0x0904`). أما precompiles القراءة المدعومة بحالة Core — التي تستعلم مباشرة عن مراكز السلسلة أو دفتر الأوامر — وprecompiles السلاسل المتقاطعة فهي قادمة قريبًا. الجسر ([Bridge](../bridge/)) يعمل بالفعل.
:::

يتواصل العقد المنشور على MetaFlux EVM مع **Core** (غرفة مقاصة عقود ستبق الدائمة على طبقة L1 + دفتر الأوامر على السلسلة CLOB) في اتجاهين:

- **القراءة** — استدعاء `staticcall` على **precompile** نظامي للحصول على قيمة مشتقة من Core.
- **الكتابة** — استدعاء عقد نظام **CoreWriter** لإرسال إجراء على مستوى L1.

يتيح هذا الفصل بين precompile القراءة وعقد الكتابة لعقود EVM التكوينَ المباشر مع حالة L1 الحية — الاقتباس وفق صيغ السلسلة ذاتها، ثم التصرف على غرفة المقاصة — دون مغادرة الآلة الافتراضية.

## الكتابة إلى Core — CoreWriter

أرسل إجراء L1 باستدعاء **CoreWriter** على العنوان
`0x3333333333333333333333333333333333333333`:

```solidity
interface ICoreWriter {
    /// Emitted on every successful call; the L1 scanner consumes this log.
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` هو حمولة مسبوقة بالإصدار والمعرّف:

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=20)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

الحساب المُنفِّذ هو `msg.sender` (العقد المُستدعي). بعد تأخير قصير للإجراء، يُرسل L1 الإجراء المُفكَّك.

:::info
**الذرية.** استدعاء `sendRawAction` لا يفعل إلا استهلاك الغاز وإرسال حدث `RawAction`. أي فشل على جانب L1 **بعد** ذلك يكون صامتًا — لا يحدث **أي revert على EVM**. يجب أن يتعافى العقد ذاتيًا ويعامل حدث `RawAction` باعتباره الرابط السببي الوحيد بين استدعاء EVM ونتيجة L1.
:::

### الإجراءات

يكشف CoreWriter عن 20 إجراء على مستوى L1 (المعرّف بالترتيب big-endian في خانة `uint24` أعلاه):

| id | الإجراء | الغرض |
|---:|--------|---------|
| 1 | `LimitOrder` | وضع أمر محدد السعر في سوق عقود دائمة أو سوق فوري |
| 2 | `VaultTransfer` | إيداع أموال في خزينة أو سحبها منها |
| 3 | `TokenDelegate` | تفويض حصة تخزين إلى مُحقِّق |
| 4 | `StakingDeposit` | نقل رموز إلى رصيد التخزين |
| 5 | `StakingWithdraw` | سحب رموز من رصيد التخزين |
| 6 | `SpotSend` | تحويل رمز فوري إلى حساب آخر |
| 7 | `UsdClassTransfer` | نقل USDC بين حسابَي فئة العقود الدائمة والفوري |
| 8 | `FinalizeEvmContract` | ربط عقد EVM برمزه أو معرّف عقده في Core |
| 9 | `AddApiWallet` | تخويل مفتاح فرعي (محفظة وكيلة) للتداول |
| 10 | `CancelByOid` | إلغاء أمر بمعرّف الأمر على الخادم |
| 11 | `CancelByCloid` | إلغاء أمر بمعرّف الأمر لدى العميل |
| 12 | `ApproveBuilderFee` | تخويل منشئ لتحصيل رسوم محددة السقف |
| 13 | `SendAsset` | تحويل أصل عام (عقود دائمة / فوري / خزينة) |
| 14 | `ReflectEvmSupplyChange` | مزامنة تغيير في مجمل عرض ERC-20 على جانب EVM مع Core |
| 15 | `BorrowLend` | فتح مركز اقتراض-إقراض أو إغلاقه |
| 16 | `PortfolioMarginEnroll` | تسجيل المُرسِل ضمن هامش المحفظة متعدد الأصول أو إلغاء تسجيله |
| 17 | `RfqSubmit` | تقديم عرض سعر RFQ (المعرّف، السوق، الاتجاه، الحجم، السعر المحدود) |
| 18 | `FbaConfigure` | إعداد مزاد الدُفعات المتكررة per-market |
| 19 | `CrossChainSend` | تحويل عبر السلاسل مع تجريد عن البروتوكول (يُدرَج في [MetaBridge](../bridge/)) |
| 20 | `EncryptedOrderSubmit` | أمر مشفر بعتبة (التزام + نص مشفر) |

تتوفر هياكل المعاملات المُنمَّطة ومستدعي Solidity الجاهز للاستخدام في مستودع
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) العام؛
وCorWriter على السلسلة عند `0x3333…` هو الهدف الإنتاجي (في الاختبارات، بديل Solidity حتمي يُرسل نفس حمولة `RawAction`).

## قراءة Core — precompiles

كل precompile هو استدعاء `staticcall` على عنوان ثابت بمدخل **مُضغَّط** يدويًا بالترتيب big-endian (لا Solidity ABI). الأحجام والأسعار على مستوى الفاصلة الثابتة **1e8** (`px_e8`، `size_e8`)؛ أما هوامش USDC فهي **1e6**.

| العنوان | Precompile | القيمة المُعادة |
|---------|------------|---------|
| `0x0900` | `portfolio_margin_eval` | الهامش الصيانة المطلوب بأسلوب SPAN، مؤشر أسوأ سيناريو، عقوبة التركيز |
| `0x0901` | `vault_nav` | إجمالي NAV للخزينة، إجمالي الحصص، NAV لكل حصة، الربح/الخسارة غير المُحقَّق |
| `0x0902` | `adl_pro_rata_price` | سعر VWAP الذي يُصفَّى عنده ADL بحجم معين، مع المرور عبر الطابور بأولوية الجانب |
| `0x0903` | `mark_settle` | دلتا الربح/الخسارة لكل مركز، التمويل المتراكم الجديد، الربح/الخسارة غير المُحقَّق عند سعر المرجع |
| `0x0904` | `rfq_book_depth` | عمق دفتر RFQ (مُصفَّى حسب الجانب، عمق محدود) |
| `0x0906` | `clob_bbo` | أفضل سعر عرض / أفضل سعر طلب + الحجم (قمة الدفتر) |
| `0x0907` | `clob_l2_depth` | أعلى N مستويات `(price, size)` مجمَّعة لكل جانب |
| `0x0908` | `inventory_risk` | الإشعار الصافي / الإجمالي، التركيز، بوابة سقف المخاطرة |

هذه اليوم precompiles **اقتباس عديمة الحالة**: يُمرِّر المُستدعي المدخلات (المراكز، مستويات الطابور، العروض…) ويُعيد precompile النتيجة المحسوبة، مما يتيح للعقود إعادة إنتاج حسابات Core وفق صيغ السلسلة ذاتها. أما **قراءات Core الحية المدعومة بالحالة** (الاستعلام المباشر عن مراكز السلسلة أو دفتر الأوامر) فهي قادمة.

## تحويلات القيمة بين Core و EVM

- **إلى Core** من عقد EVM: `SpotSend` / `SendAsset` / `UsdClassTransfer`
  / `VaultTransfer` عبر CoreWriter (أعلاه).
- **عبر السلاسل**: يُدرج `CrossChainSend` في
  [جسر حضانة MetaBridge](../bridge/)، الذي يُحرِّر الأموال على السلسلة الوجهة
  بتوقيع مشترك من ⅔ المُحقِّقين.

## انظر أيضًا

- [Bridge](../bridge/) — حضانة عبر السلاسل (وجهة `CrossChainSend`)
- [Mark prices](../concepts/mark-prices.md) — مستوى الأسعار بالفاصلة الثابتة 1e8 الذي تستخدمه precompiles
- [Portfolio margin](../concepts/portfolio-margin.md) / [ADL](../concepts/adl.md) — رياضيات Core التي تقتبس منها precompiles `0x0900` / `0x0902`
