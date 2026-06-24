# محافظ الوكلاء عمليًا

:::tip
**مستقر.**
:::

شيفرة برمجية متكاملة من البداية إلى النهاية، تستعرض خطوات الموافقة والتداول والتدوير. للاطلاع على الخلفية النظرية، راجع [محافظ الوكلاء](../concepts/agent-wallets.md).

## ملخص سريع

1. أنشئ زوج مفاتيح وكيل محليًا.
2. من الحساب الرئيسي، أرسل `ApproveAgent { agent, expires_at_ms }`.
3. انتظر كتلة واحدة.
4. وقّع كل إجراء بمفتاح الوكيل؛ وأرسله مع `sender = master_addr`.
5. قبل انتهاء الصلاحية، كرّر العملية بوكيل جديد واترك القديم ينتهي.

## الخطوة 1 — إنشاء مفتاح الوكيل

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

احفظ المفتاح الخاص للوكيل في بيئة تشغيل البوت الخاص بك (متغير بيئة، أو مدير أسرار، أو HSM — الاختيار لك). لا تسجّله في السجلات أبدًا.

```python
import secrets
from coincurve import PrivateKey
from eth_utils import to_checksum_address
import sha3

agent_priv = secrets.token_bytes(32)
agent_pk   = PrivateKey(agent_priv).public_key.format(compressed=False)[1:]
agent_addr = to_checksum_address('0x' + sha3.keccak_256(agent_pk).hexdigest()[-40:])
print('agent address:', agent_addr)
```

## الخطوة 2 — الموافقة من الحساب الرئيسي

يجب على الحساب الرئيسي التوقيع على هذا الإجراء — فهو **المرة الوحيدة** التي يوقّع فيها الحساب الرئيسي (في كل جلسة).

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const master = new MetaFluxClient({
  privateKey: process.env.MASTER_KEY!,
  baseUrl:    'https://devnet-gateway.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

const result = await master.exchange.approveAgent({
  agent:        agentAddress,
  expiresAtMs:  Date.now() + 30 * 24 * 60 * 60 * 1000,  // 30 days
  name:         'mm-host-3',
});

console.log('approved at action hash:', result.actionHash);
```

في طلب curl المباشر، يكون جسم الإجراء كالتالي:

```json
{
  "type": "ApproveAgent",
  "params": {
    "agent":        "0x<agent_addr>",
    "expires_at_ms": 1735689600000,
    "name":         "mm-host-3"
  }
}
```

## الخطوة 3 — انتظار كتلة واحدة

تصبح موافقات الوكيل سارية **بعد كتلة واحدة من الالتزام**. أرسل أول طلب موقّع بالوكيل بعد أن تُلتزم كتلة الموافقة.

```typescript
// confirm the approval is on-chain
async function waitForApproval(c: MetaFluxClient, masterAddr: string, agentAddr: string) {
  for (let i = 0; i < 20; i++) {
    const agents = await c.info.agents(masterAddr);
    if (agents.find(a => a.agent.toLowerCase() === agentAddr.toLowerCase())) return;
    await sleep(200);
  }
  throw new Error('approval not visible after 4s');
}

await waitForApproval(master, master.address, agentAddress);
```

بديل آخر: اشترك في `userEvents` وابحث عن `{ kind: "agentApproved" }`.

## الخطوة 4 — التداول عبر الوكيل

```typescript
// initialise an SDK client with the agent's key, but the master's address
const agent = new MetaFluxClient({
  privateKey:     agentPrivateKey.toString('hex'),  // agent signs
  signerAddress:  agentAddress,
  senderAddress:  master.address,                   // sender = master
  baseUrl:        'https://devnet-gateway.mtf.exchange',
  chainId:        31337,
});

// every subsequent call uses agent.sign + master.address as sender
await agent.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
});
```

يعتمد الـ SDK على التمييز بين `signerAddress / senderAddress` ليعرف أنه يجب وضع `sender = master` مع التوقيع بمفتاح الوكيل. النسخة اليدوية:

```typescript
const sig = signEip712(action, agentPrivateKey, chainId);
await fetch('https://devnet-gateway.mtf.exchange/exchange', {
  method:  'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sender:    master.address,   // ← master's address
    signature: sig,              // ← agent's signature
    action,
  }),
});
```

## الخطوة 5 — التدوير

قبل انتهاء صلاحية الوكيل القديم، جهّز وكيلًا جديدًا:

```typescript
async function rotateAgent(
  master: MetaFluxClient,
  oldAgentAddr: string,
  newAgentPrivKey: Uint8Array,
  newAgentAddr: string,
) {
  // 1. Approve the new agent with full TTL
  await master.exchange.approveAgent({
    agent:       newAgentAddr,
    expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
    name:        `mm-host-3-${Date.now()}`,
  });
  await waitForApproval(master, master.address, newAgentAddr);

  // 2. Flip traffic in your bot from oldKey to newKey
  // (deployment-specific — flag swap, config reload, etc.)

  // 3. Tighten the old agent's expiry to ~1h from now so it dies
  await master.exchange.approveAgent({
    agent:       oldAgentAddr,
    expiresAtMs: Date.now() + 60 * 60 * 1000,
    name:        `mm-host-3-retiring`,
  });

  // 4. Within an hour, every old-agent-signed request will return 401
  //    Your bot is already on the new agent; no functional impact.
}
```

جدوِل عملية التدوير يوميًا أو أسبوعيًا عبر cron أو systemd timer. في أسطول متعدد المضيفين: دوّر مضيفًا واحدًا في كل مرة، مع التحقق من الفحوصات الصحية.

## أسطول متعدد المضيفين

لكل مضيف وكيله الخاص. يمكنهم الإرسال بشكل متزامن لأنهم يتشاركون فضاء nonce الخاص بالحساب الرئيسي ويستخدمون `Date.now()`:

```
master account (0xMASTER)
   approved agents:
     0xAGENT_HOST_1   (mm-host-1, expires +29d)
     0xAGENT_HOST_2   (mm-host-2, expires +27d)
     0xAGENT_HOST_3   (mm-host-3, expires +30d)

each host runs:
   const agent_n = MetaFluxClient({ key: HOST_AGENT_KEY, sender: 0xMASTER });
   ... places orders concurrently ...
```

نادرًا ما تتصادم الـ nonces (بدقة دون المللي ثانية)، وسيحصل الطلب المتصادم على `nonce_too_small`؛ يرفع البوت القيمة ويعيد المحاولة. للإنتاجية العالية جدًا لكل مضيف، استخدم عدّادًا رتيبًا مشتركًا (Redis `INCR`) مفهرسًا على الحساب الرئيسي.

## الكشف عن الاختراق

| الإشارة | السبب المحتمل | الإجراء |
|--------|--------------|--------|
| أوامر غير متوقعة من حسابك الرئيسي | مفتاح وكيل مسرّب (أو مفتاح رئيسي) | قلّص صلاحية الوكيل القديم إلى الماضي؛ وابدأ التحقيق |
| أخطاء 401 من وكيل يفترض أنه صالح | انتهت صلاحية الموافقة أو جرى إلغاؤها؛ أو مفتاح الوكيل خاطئ | تحقق عبر `/info agents`؛ وأعد الموافقة إذا لزم |
| موجة مفاجئة من الأوامر لم تأذن بها | وكيل مخترق | أرسل فورًا `ApproveAgent { agent: X, expires_at_ms: 0 }` لإنهاء X؛ وقّع هذا من التخزين البارد بالحساب الرئيسي |

تخزّن السلسلة كل موافقة، وكل تاريخ انتهاء، والموقّع المستخرج من كل إجراء. التحليل الجنائي بعد الحادثة عملية ميكانيكية.

## وكلاء الحسابات الفرعية

يمكن للحساب الفرعي أن يمتلك مجموعة وكلاء خاصة به (مستقلة عن الحساب الرئيسي):

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

يوقّع الحساب الرئيسي؛ `sender = sub_addr`؛ وتقبل السلسلة ذلك لأن الحساب الرئيسي يمتلك صلاحية التفويض على حساباته الفرعية. من هذه اللحظة، يوقّع `subAgentKey` جميع الإجراءات الخاصة بالحساب الفرعي.

هذا هو النمط المؤسسي: الحساب الرئيسي في التخزين البارد؛ وكيل واحد لكل تركيبة (حساب فرعي × مضيف)؛ سطح إلغاء نظيف.

## التسلسل الزمني — الإعداد الكامل

```
T=0    generate agent keypair on host
T=1    operator triggers approval from cold master
       master signs ApproveAgent { agent, ttl=30d, name }
       POST /exchange
T+1block  approval committed
T+1block.1s  host's bot polls /info agents; sees approval; starts trading
...    bot runs for 29 days, signing every action with agent key
T+29d  scheduled rotation kicks in
       cold master signs ApproveAgent for new key (ttl=30d)
       host's bot config updated to new key
       cold master signs ApproveAgent for old key with ttl=1h
T+29d+1h  old agent expires; bot has fully migrated
```

## انظر أيضًا

- [محافظ الوكلاء](../concepts/agent-wallets.md) — المفاهيم
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [شرح عملية التوقيع](./signing.md) — ما يقوم به الـ SDK داخليًا
- [الأحادية](./idempotency.md) — دلالات nonce للوكلاء المتزامنين
- [الحسابات الفرعية](../concepts/sub-accounts.md) — إعداد الوكيل على مستوى الحساب الفرعي
- [مراقب المخاطر](./risk-watcher.md) — الاستخدام النموذجي لوكيل مراقبة مخصص

## الأسئلة الشائعة

<details>
<summary>عرض الأسئلة الشائعة</summary>

**س: هل يمكن للوكيل أن يوافق على وكيل آخر؟**
ج: لا. `ApproveAgent` خاص بالحساب الرئيسي فقط. هذا يمنع تسلسل تكاثر المفاتيح.

**س: كيف أدوّر الحساب الرئيسي نفسه؟**
ج: لا تتضمن الإصدارة V1 آلية أولية لتدوير الحساب الرئيسي. النمط المدعوم: التحويل إلى توقيع متعدد مع تضمين المفتاح الجديد، ثم تحديث مجموعة التوقيع المتعدد لاستبعاد المفتاح القديم. راجع [التوقيع المتعدد](../concepts/multi-sig.md).

**س: ماذا يحدث إذا تعطّل مضيف الوكيل في منتصف طلب؟**
ج: إما أن الطلب المعلّق قد التُزم (يظهر في `userEvents` / openOrders) أو لم يلتزم (لا يوجد حدث). استخدم [نمط التسوية](./error-handling.md#reconciliation-pattern) عند إعادة تشغيل المضيف.

**س: هل يمكن لوكلاء مختلفين التداول في أسواق مختلفة؟**
ج: لا على مستوى البروتوكول. يمنح البروتوكول الوكيل صلاحية الوصول الكامل إلى سطح إجراءات التداول للحساب الرئيسي. إذا كنت بحاجة إلى فصل بحسب السوق، استخدم الحسابات الفرعية (لكل حساب فرعي مجموعة وكلاء خاصة به).

</details>
