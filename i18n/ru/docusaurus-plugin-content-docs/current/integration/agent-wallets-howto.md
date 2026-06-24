# Агентские кошельки на практике

:::tip
**Стабильно.**
:::

Готовый код с покрытием всех этапов: подтверждение, торговля и ротация ключей. Концептуальную часть см. в разделе [агентские кошельки](../concepts/agent-wallets.md).

## Кратко

1. Сгенерируйте пару ключей агента локально.
2. С мастер-аккаунта отправьте `ApproveAgent { agent, expires_at_ms }`.
3. Подождите один блок.
4. Подписывайте каждое действие ключом агента; отправляйте с `sender = master_addr`.
5. До истечения срока повторите процедуру с новым агентом и дайте старому истечь.

## Шаг 1 — генерация ключа агента

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

Храните приватный ключ агента в защищённом хранилище бота (переменная окружения, менеджер секретов, HSM — на ваш выбор). Никогда не выводите его в логи.

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

## Шаг 2 — подтверждение с мастер-аккаунта

Подписывать это действие должен мастер — это **единственный момент**, когда мастер подписывает (в рамках сессии).

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

В случае прямого вызова через curl тело действия выглядит так:

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

## Шаг 3 — ожидание одного блока

Подтверждения агентов вступают в силу **через один блок после фиксации**. Первый запрос, подписанный агентом, отправляйте только после того, как блок с подтверждением будет зафиксирован.

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

Альтернатива: подпишитесь на `userEvents` и ожидайте события `{ kind: "agentApproved" }`.

## Шаг 4 — торговля через агента

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

Разграничение `signerAddress / senderAddress` в SDK позволяет подставлять `sender = master`, подписывая при этом ключом агента. Вариант без SDK:

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

## Шаг 5 — ротация

До истечения срока старого агента переведите систему на новый ключ:

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

Планируйте ротацию ежедневно или еженедельно через cron / systemd timer. Для флота из нескольких хостов ротируйте по одному хосту за раз, предварительно проходя проверки работоспособности.

## Флот из нескольких хостов

У каждого хоста свой агент. Они могут отправлять запросы параллельно, поскольку совместно используют пространство нонсов мастера на основе `Date.now()`:

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

Коллизии нонсов редки (разрешение — доли миллисекунды); в случае коллизии запрос возвращает `nonce_too_small`, и бот увеличивает нонс и повторяет попытку. Для очень высокой пропускной способности на хост используйте общий монотонный счётчик (Redis `INCR`) с ключом, привязанным к мастеру.

## Обнаружение компрометации

| Сигнал | Вероятная причина | Действие |
|--------|--------------|--------|
| Неожиданные ордера от вашего мастер-аккаунта | Утечка ключа агента (или мастер-ключа) | Сократите срок действия старого агента до прошедшего времени; проведите расследование |
| Ошибки 401 от агента, срок которого не истёк | Истёк или отозван срок подтверждения; либо неверный ключ агента | Проверьте через `/info agents`; при необходимости повторно подтвердите |
| Внезапный всплеск неавторизованных ордеров | Скомпрометированный агент | Немедленно отправьте `ApproveAgent { agent: X, expires_at_ms: 0 }`, чтобы отозвать X; выполните это, подписав мастером из холодного хранилища |

Блокчейн хранит каждое подтверждение, каждый срок истечения и восстановленную подпись каждого действия. Постфактум-расследования инцидентов — дело механическое.

## Агенты субаккаунтов

Субаккаунт может иметь собственный набор агентов (отдельный от мастер-аккаунта):

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

Подписывает мастер; `sender = sub_addr`; блокчейн принимает запрос, поскольку мастер обладает правом делегирования над своими субаккаунтами. После этого `subAgentKey` подписывает все действия для данного субаккаунта.

Это институциональная схема: мастер — в холодном хранилище; один агент на каждую комбинацию (субаккаунт × хост); чистая поверхность для отзыва прав.

## Последовательность — полная настройка

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

## См. также

- [Агентские кошельки](../concepts/agent-wallets.md) — концепции
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [Процесс подписания](./signing.md) — что SDK делает внутри
- [Идемпотентность](./idempotency.md) — семантика нонсов для параллельных агентов
- [Субаккаунты](../concepts/sub-accounts.md) — настройка агентов на уровне субаккаунта
- [Risk-watcher](./risk-watcher.md) — типичное применение выделенного агента-наблюдателя

## FAQ

<details>
<summary>Показать FAQ</summary>

**В: Может ли агент подтвердить другого агента?**
О: Нет. `ApproveAgent` — исключительная прерогатива мастера. Это предотвращает каскадное размножение ключей.

**В: Как ротировать сам мастер-ключ?**
О: В V1 нет примитива для ротации мастера. Поддерживаемая схема: преобразуйте аккаунт в мульти-подпись с включением нового ключа, затем обновите набор мульти-подписи, исключив старый ключ. См. [мульти-подпись](../concepts/multi-sig.md).

**В: Что произойдёт, если хост агента упадёт в процессе выполнения запроса?**
О: Ожидающий запрос либо был зафиксирован (виден в `userEvents` / openOrders), либо нет (события нет). При перезапуске хоста используйте [шаблон согласования](./error-handling.md#reconciliation-pattern).

**В: Могут ли разные агенты торговать на разных рынках?**
О: На уровне протокола — нет. Протокол авторизует агента для полного спектра торговых действий мастера. Если нужно разделение по рынкам, используйте субаккаунты (у каждого субаккаунта собственный набор агентов).

</details>
