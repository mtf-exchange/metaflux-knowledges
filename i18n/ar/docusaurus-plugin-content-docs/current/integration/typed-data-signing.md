# توقيع البيانات المُهيكلة (Typed-data signing)

:::info
**الحالة: هذا هو نظام التوقيع المعتمد.** كل إجراء على `/exchange` يُوقَّع بوصفه
**بيانات مُهيكلة من نوع EIP-712** (`eth_signTypedData_v4`). لا يوجد نظام بديل
أو قديم للاختيار بينهما — فالمحفظة (MetaMask أو Rabby أو Ledger أو
WalletConnect) تعرض كل حقل من حقول الإجراء باسمه في نافذة التوقيع.
:::

لكل إجراء نوع EIP-712 خاص به، بحيث تعرض المحفظة للمستخدم الحقول الفعلية التي
يوقّع عليها — `destination` و`amount` و`agentName` — بدلاً من بيانات غامضة
غير مقروءة. يُعيد الخادم بناء البنية المُهيكلة من `action.type` + `action.params`،
ويُعيد احتساب ملخص التجزئة (digest)، ثم يسترجع هوية الموقِّع.

## آلية العمل

| | البيانات المُهيكلة |
|--|------------|
| نافذة المحفظة | كل حقل يُعرض باسمه |
| النوع الأساسي | `MetaFluxTransaction:<Action>` (نوع واحد لكل إجراء) |
| ما يُجزَّأ | الحقول المُهيكلة (ترميز EIP-712 الذري) |

يرى المستخدمون **ما يوقّعون عليه** في محفظة قياسية — فالتحويلات والسحوبات
وموافقات الوكيل وإعدادات الحساب والتخزين التعهدي والخزائن وهامش السبوت والكسب
والجسر — كلها تحمل حقولاً مسمّاة.

## شكل الإرسال عبر الشبكة

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* the action fields */ }
  }
}
```

| الحقل | المعنى |
|-------|---------|
| `nonce` | `nonce` الغلاف الواحد هو **أيضاً** حقل `nonce` داخل البنية المُهيكلة الموقَّعة — يجب أن يتطابقا. |
| `action.type` | وسم الإجراء بصيغة `snake_case`. |
| `action.params` | حقول الإجراء. يجب أن تحمل **نفس القيم** (ونفس السلاسل العشرية القانونية) التي جزّأتها. |

يُعيد الخادم بناء البنية المُهيكلة من `action.type` + `action.params`،
ويُعيد احتساب ملخص EIP-712، ويسترجع هوية الموقِّع، ويرخّص له (إذا كان الموقِّع
هو الحساب نفسه أو [وكيلاً](../concepts/agent-wallets.md) معتمداً له).

:::info
**`sig_scheme` حقل متبقٍّ من إصدار سابق.** كانت الإصدارات السابقة تحمل محدِّداً `sig_scheme`
على الغلاف. لم يعد مطلوباً والخادم يتجاهله — يعمل استرجاع البيانات المُهيكلة دائماً
بصرف النظر. **أغفله.** إن أرسلته، فالقيمة الوحيدة المقبولة هي `"typed"`.
:::

## نطاق EIP-712

نطاق واحد لكل شبكة، احتفظ به في ذاكرة التخزين المؤقت:

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

تحمل كل رسالة مُهيكلة أيضاً سلسلة **`metafluxChain`** بوصفها حقلها الأول.
وهي وسم يمكن قراءته للإنسان يدل على معرّف السلسلة نفسه، وهي جزء من البنية
الموقَّعة:

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| أي قيمة أخرى | `"Devnet"` |

استعلم عن معرّف سلسلة العقدة من [`/info` `node_info`](../api/rest/info.md#node_info)
(`data.chain_id`) واستخدم الوسم المقابل. أي `metafluxChain` أو `chainId` لا يطابق
العقدة يُنتج موقِّعاً مختلفاً ويُرفض الطلب.

## قواعد الترميز (EIP-712 الذري)

`hashStruct` القياسي لـ EIP-712:

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` هو كل حقل، بالترتيب المُعلَن، مُرمَّز في كلمة واحدة مكوّنة من 32 بايت:

| نوع الحقل | الترميز |
|------------|----------|
| `address` | 20 بايتاً، محاذاة يمنى (12 بايتاً صفرية على اليسار). |
| `uintN` | big-endian، مُبطَّنة يساراً بالأصفار لتصل إلى 32 بايتاً. |
| `bool` | `uint8` `0` / `1`، مُبطَّنة بالأصفار لتصل إلى 32 بايتاً. |
| `string` | `keccak256(utf8_bytes)`. |
| `bytes` | `keccak256(raw_bytes)`. |
| `T[]` (مثل `address[]`) | `keccak256(` تسلسل الكلمة المكوّنة من 32 بايتاً لكل عنصر `)`. |

وقِّع الـ `digest` المكوّن من 32 بايتاً بـ secp256k1 وسلسل التوقيع بالشكل
`r ‖ s ‖ v` (65 بايتاً). كلا الشكلين `v ∈ {27, 28}` و`v ∈ {0, 1}` مقبولان.

### الأعداد العشرية سلاسل قانونية — جزِّئ ثم حلِّل

أي حقل مقدار أو كميّة هو EIP-712 **`string`** يحمل النص العشري القانوني
(`"1500.5"` أو `"750.25"`). يجزِّئ الخادم **السلسلة النصية الحرفية**
*ثم* يحوّلها إلى رقم — لذا فإن الأحرف الدقيقة لها أهمية:

:::warning
**`"1.0"` و`"1.00"` ينتجان تجزئتين مختلفتين** رغم أنهما نفس الرقم.
اختر **شكلاً قانونياً واحداً** لكل مقدار وأرسل **السلسلة ذاتها** في
`action.params` التي وضعتها في الرسالة المُهيكلة التي وقّعتها. أي تعارض
(صفر لاحق، أو نقطة عشرية مفقودة، أو صيغة أسيّة) يُنتج موقِّعاً مختلفاً
ويُرفض الطلب.
:::

هذا هو السبب في أن التوقيع المُهيكل يحمل الأعداد العشرية كسلاسل نصية بدلاً من
أعداد صحيحة مُقيَّسة: تعرض نافذة المحفظة مقداراً مقروءاً للإنسان، وتبقى قاعدة
"جزِّئ ثم حلِّل" البايتات الموقَّعة واضحة لا لبس فيها.

## سلاسل أنواع الإجراءات

لكل إجراء **النوع الأساسي** هو `MetaFluxTransaction:<Action>` وسلسلة
`encodeType` مذكورة أدناه (ترتيب الحقول هو ترتيب حقول الرسالة).
`action.type` هو وسم `snake_case` الذي تضعه على طلب POST.

### التحويلات

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

### الحساب والتخزين التعهدي والخزائن و Metaliquidity

| `action.type` | `encodeType` |
|---------------|--------------|
| `approve_agent` | `MetaFluxTransaction:ApproveAgent(string metafluxChain,address agentAddress,string agentName,uint64 nonce)` |
| `set_referrer` | `MetaFluxTransaction:SetReferrer(string metafluxChain,address referrer,uint64 nonce)` |
| `approve_builder_fee` | `MetaFluxTransaction:ApproveBuilderFee(string metafluxChain,address builder,uint16 maxFeeBps,uint64 nonce)` |
| `set_display_name` | `MetaFluxTransaction:SetDisplayName(string metafluxChain,string displayName,uint64 nonce)` |
| `set_position_mode` | `MetaFluxTransaction:SetPositionMode(string metafluxChain,bool hedge,uint64 nonce)` |
| `user_portfolio_margin` | `MetaFluxTransaction:UserPortfolioMargin(string metafluxChain,bool enroll,uint64 nonce)` |
| `convert_to_multi_sig_user` | `MetaFluxTransaction:ConvertToMultiSigUser(string metafluxChain,address[] signers,uint32 threshold,uint64 nonce)` |
| `update_leverage` | `MetaFluxTransaction:UpdateLeverage(string metafluxChain,uint32 asset,uint32 leverage,bool isIsolated,uint64 nonce)` |
| `claim_rewards` | `MetaFluxTransaction:ClaimRewards(string metafluxChain,address validator,uint64 nonce)` |
| `link_staking_user` | `MetaFluxTransaction:LinkStakingUser(string metafluxChain,address target,uint64 nonce)` |
| `create_vault` | `MetaFluxTransaction:CreateVault(string metafluxChain,string name,uint64 lockPeriodSecs,uint8 kind,uint64 nonce)` |
| `vault_modify` | `MetaFluxTransaction:VaultModify(string metafluxChain,uint64 vaultId,string newName,uint64 nonce)` |
| `spot_margin_close` | `MetaFluxTransaction:SpotMarginClose(string metafluxChain,uint32 pair,uint64 limitPx,uint64 nonce)` |
| `set_metaliquidity_set` | `MetaFluxTransaction:SetMetaliquiditySet(string metafluxChain,address account,bool allowed,uint64 nonce)` |
| `register_metaliquidity_operator` | `MetaFluxTransaction:RegisterMetaliquidityOperator(string metafluxChain,uint64 vaultId,address operator,bool allowed,uint64 expiresAtMs,uint64 nonce)` |

ملاحظات على حقول بعينها:

- `claim_rewards`: `validator` = عنوان الصفر يعني **المطالبة عبر جميع
  التفويضات**.
- `create_vault`: `kind` قيمته `0` = مستخدم، `1` = Metaliquidity.

### الهامش

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` و`amount` سلاسل عشرية قانونية (جزِّئ ثم حلِّل).

### التخزين التعهدي

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` سلسلة عشرية قانونية. `isUndelegate` = `true` يُلغي التفويض،
و`false` يُنشئه.

### الخزائن

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` إيداع، و`false` سحب؛ `amount` سلسلة عشرية
قانونية. `vault_withdraw.shares` سلسلة عشرية قانونية.

### هامش السبوت

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` و`borrow` سلاسل عشرية قانونية؛ `size` و`limitPx` أعداد صحيحة.

### الكسب

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` و`shares` سلاسل عشرية قانونية.

### تجريد الوكيل والجسر

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

ملاحظات على حقول بعينها:

- `agent_set_abstraction`: `value` هو EIP-712 **`string`** — وقِّع السلسلة النصية
  الحرفية (ليست رقماً؛ تُجزَّأ بـ `keccak256(utf8)`).
- `mb_withdraw`: حقل `chain` المُهيكل هو **`uint8`** — `0` = Solana، و`1` =
  Base، و`2` = Arbitrum. لكن `action.params.chain` في طلب POST هو **اسم السلسلة
  نصياً** (`"Solana"` / `"Base"` / `"Arbitrum"`). لذا وقِّع `uint8` في الرسالة المُهيكلة
  وأرسل الاسم النصي في `params`.
- `mb_withdraw`: `amount` هو **عدد صحيح** `uint64` (لا سلسلة عشرية)؛
  `dstAddr` هو سلسلة عنوان السلسلة الوجهة.

### الحقول التي *لا* تدخل في ملخص التجزئة المُهيكل

إجراءان يملكان مفاتيح في `params` غير مشمولة بسلسلة النوع المُهيكل، لذا يفرض
الخادم عليها قيمتها الافتراضية:

- `approve_agent` — نوع `ApproveAgent` **لا يحتوي على `expires_at_ms`**، لذا
  `approve_agent` **بلا انتهاء صلاحية**. **أغفل** `expires_at_ms`.
- `create_vault` — نوع `CreateVault` **لا يحتوي على `parent`**، لذا `create_vault`
  **على المستوى الأعلى** (بلا أب). **أغفل** `parent`.

## مثال تطبيقي — `send_asset` (تحويل)

تحويل `"750.25"` من الأصل `2` من DEX السبوت `0` إلى DEX العقود الدائمة `1`،
إلى محفظة العقود الدائمة، على **شبكة الاختبار** (`chainId = 114514`).

الكائن الذي تمرره إلى `eth_signTypedData_v4`:

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "chainId",           "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "MetaFluxTransaction:SendAsset": [
      { "name": "metafluxChain",  "type": "string"  },
      { "name": "sourceDex",      "type": "uint32"  },
      { "name": "destinationDex", "type": "uint32"  },
      { "name": "asset",          "type": "uint32"  },
      { "name": "destination",    "type": "address" },
      { "name": "amount",         "type": "string"  },
      { "name": "toPerp",         "type": "bool"    },
      { "name": "nonce",          "type": "uint64"  }
    ]
  },
  "primaryType": "MetaFluxTransaction:SendAsset",
  "domain": {
    "name": "MetaFlux",
    "version": "1",
    "chainId": 114514,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "message": {
    "metafluxChain":  "Testnet",
    "sourceDex":      0,
    "destinationDex": 1,
    "asset":          2,
    "destination":    "0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c",
    "amount":         "750.25",
    "toPerp":         true,
    "nonce":          28
  }
}
```

```javascript
// MetaMask / EIP-1193 provider
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 28,                       // MUST equal message.nonce
    action: {
      type: 'send_asset',
      params: {
        source_dex:      0,
        destination_dex: 1,
        asset:           2,
        destination:     '0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c',
        amount:          '750.25',   // SAME canonical string you signed
        to_perp:         true,
      },
    },
  }),
});
```

## مثال تطبيقي — `approve_agent` (إجراء حساب)

الموافقة على وكيل باسم `"trading-bot"` على **شبكة الاختبار** (`chainId = 114514`).
تذكّر: `approve_agent` المُهيكل بلا انتهاء صلاحية — لا يوجد `expires_at_ms`.

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "chainId",           "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "MetaFluxTransaction:ApproveAgent": [
      { "name": "metafluxChain", "type": "string"  },
      { "name": "agentAddress",  "type": "address" },
      { "name": "agentName",     "type": "string"  },
      { "name": "nonce",         "type": "uint64"  }
    ]
  },
  "primaryType": "MetaFluxTransaction:ApproveAgent",
  "domain": {
    "name": "MetaFlux",
    "version": "1",
    "chainId": 114514,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "message": {
    "metafluxChain": "Testnet",
    "agentAddress":  "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    "agentName":     "trading-bot",
    "nonce":         1
  }
}
```

```javascript
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 1,
    action: {
      type: 'approve_agent',
      params: {
        agent: '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
        name:  'trading-bot',
        // no expires_at_ms — approve_agent is no-expiry
      },
    },
  }),
});
```

راجع [محافظ الوكيل](../concepts/agent-wallets.md) لدورة حياة الموافقة (تصبح
الموافقة سارية المفعول بعد كتلة واحدة من الالتزام).

## التحقق من صحة ترميزك

قبل الإرسال، استرجع الموقِّع محلياً من ملخص التجزئة الذي أعددته بنفسك
وتأكد من تطابقه مع العنوان المتوقع — إن لم يتطابقا، فالخطأ في تجميع
بياناتك المُهيكلة لا في السلسلة. الترميز الذري أعلاه هو المواصفة الكاملة؛
واختبار الإجابة المعروفة عبر التطبيقات المختلفة يثبّت ملخص كل إجراء بايتاً بعد
بايت، وبالتالي أي تطبيق متوافق لـ `eth_signTypedData_v4` ينتج النتيجة ذاتها.

## الأوامر والإلغاءات

الأوامر والإلغاءات (`submit_order` و`batch_order` و`cancel_order`
و`batch_cancel`) تُرسل عبر غلاف `/exchange` ذاته وتُوقَّع بالطريقة
المُهيكلة EIP-712 نفسها. أشكال هيئة الإجراءات موجودة في
[فهرس إجراءات `POST /exchange`](../api/rest/exchange.md#action-catalog).

## انظر أيضاً

- [`POST /exchange`](../api/rest/exchange.md) — نقطة النهاية وفهرس الإجراءات الكامل
- [محافظ الوكيل](../concepts/agent-wallets.md) — دورة حياة الموافقة
- [الشبكات](../networks.md) — `chainId` لكل شبكة
