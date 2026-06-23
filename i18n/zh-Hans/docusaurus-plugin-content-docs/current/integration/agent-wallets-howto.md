# 代理钱包实战

:::tip
**稳定版**。
:::

具体代码、端到端、演示审批、交易和轮换。有关概念背景，请参阅[代理钱包](../concepts/agent-wallets.md)。

## 摘要

1. 在本地生成代理密钥对。
2. 从主账户，提交 `ApproveAgent { agent, expires_at_ms }`。
3. 等待一个区块。
4. 使用代理密钥签署每个操作；以 `sender = master_addr` 提交。
5. 在到期前，用新代理重复，让旧代理过期。

## 第 1 步 — 生成代理密钥

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

将代理的私钥存储在您的机器人主机中（环境变量、密钥管理器、HSM — 由您选择）。不要记录它。

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

## 第 2 步 — 从主账户批准

主账户必须签署此操作 — 这是**唯一**一次主账户签署（每个会话）。

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

在原始 curl 中，操作体是：

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

## 第 3 步 — 等待一个区块

代理批准在**提交后一个区块后**生效。在批准区块提交后提交您的第一个代理签署请求。

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

备选方案：订阅 `userEvents` 并查找 `{ kind: "agentApproved" }`。

## 第 4 步 — 从代理交易

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

SDK 的 `signerAddress / senderAddress` 区分是它如何知道填充 `sender = master` 同时用代理密钥签署的。手动方式：

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

## 第 5 步 — 轮换

在旧代理过期之前，准备一个新代理：

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

通过 cron / systemd 计时器每天 / 每周安排轮换。多主机舰队：一次轮换一个主机，由健康检查把关。

## 多主机舰队

每个主机有自己的代理。它们可以并发提交，因为它们共享主账户的随机数空间并使用 `Date.now()`：

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

随机数冲突很少见（亚毫秒分辨率），冲突的请求得到 `nonce_too_small`；机器人会提高并重试。对于每个主机的非常高吞吐量，使用共享单调计数器（Redis `INCR`）以主账户为键。

## 检测妥协

| 信号 | 可能原因 | 操作 |
|--------|--------------|--------|
| 来自您的主账户的意外订单 | 泄露的代理密钥（或主密钥） | 收紧旧代理的到期时间至过去；调查 |
| 来自应该有效的代理的 401 错误 | 批准过期或被撤销；或代理密钥错误 | 通过 `/info agents` 验证；如需要重新批准 |
| 突然大量您未授权的订单 | 代理被入侵 | 立即提交 `ApproveAgent { agent: X, expires_at_ms: 0 }` 以退役 X；由主账户从冷存储签署此操作 |

链存储每个批准、每个到期、每个操作的恢复签名者。事件后的取证是机械性的。

## 子账户代理

子账户可以有自己的代理集（独立于主账户）：

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

主账户签署；`sender = sub_addr`；链会接受，因为主账户对其子账户拥有委托权限。从那时起，`subAgentKey` 签署该子账户的所有操作。

这是机构模式：主账户在冷存储中；每个（子账户 × 主机）组合一个代理；清洁撤销表面。

## 序列 — 完整设置

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

## 另见

- [代理钱包](../concepts/agent-wallets.md) — 概念
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [签署演练](./signing.md) — SDK 内部执行的操作
- [幂等性](./idempotency.md) — 并发代理的随机数语义
- [子账户](../concepts/sub-accounts.md) — 子级代理设置
- [风险监视器](./risk-watcher.md) — 专用监视器代理的典型用途

## 常见问题

<details>
<summary>显示常见问题</summary>

**问：代理可以批准另一个代理吗？**
答：否。`ApproveAgent` 仅由主账户操作。这可防止密钥增殖级联。

**问：我如何轮换主账户本身？**
答：V1 没有主账户轮换原语。支持的模式：转换为多签，包括新密钥，然后更新多签集以删除旧密钥。请参阅[多签](../concepts/multi-sig.md)。

**问：如果代理的主机在途中崩溃会怎样？**
答：待处理请求要么已提交（在 `userEvents` / openOrders 上可见），要么未提交（无事件）。在主机重启时使用[协调模式](./error-handling.md#reconciliation-pattern)。

**问：不同的代理可以交易不同的市场吗？**
答：不能通过协议。协议为主账户授权代理以执行完整的交易操作表面。如果您需要按市场分离，使用子账户（每个子账户有自己的代理集）。

</details>
