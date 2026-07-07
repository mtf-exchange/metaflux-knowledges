# 代理钱包实战

:::tip
**稳定版。**
:::

完整的端到端代码，涵盖授权、交易和密钥轮换。概念背景请参阅[代理钱包](../concepts/agent-wallets.md)。

## 快速概览

1. 在本地生成代理密钥对。
2. 从主账户提交 `ApproveAgent { agent, expires_at_ms }`。
3. 等待一个区块。
4. 用代理密钥对每个操作签名；提交时设置 `sender = master_addr`。
5. 到期前，用新代理重复上述流程，让旧代理自然过期。

## 第一步 — 生成代理密钥

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

将代理私钥存储在机器人所在的主机上（环境变量、密钥管理器、HSM——按需选择）。切勿将其写入日志。

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

## 第二步 — 从主账户授权

主账户必须对此签名——这是主账户在每个会话中**唯一一次**需要签名的操作。

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const master = new MetaFluxClient({
  privateKey: process.env.MASTER_KEY!,
  baseUrl:    'https://api.devnet.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

const result = await master.exchange.approveAgent({
  agent:        agentAddress,
  expiresAtMs:  Date.now() + 30 * 24 * 60 * 60 * 1000,  // 30 days
  name:         'mm-host-3',
});

console.log('approved at action hash:', result.actionHash);
```

使用原始 curl 时，操作体如下：

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

## 第三步 — 等待一个区块

代理授权在**提交后的下一个区块**才生效。请在授权所在区块确认后，再发送第一个由代理签名的请求。

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

也可以订阅 `userEvents`，监听 `{ kind: "agentApproved" }` 事件。

## 第四步 — 用代理账户进行交易

```typescript
// initialise an SDK client with the agent's key, but the master's address
const agent = new MetaFluxClient({
  privateKey:     agentPrivateKey.toString('hex'),  // agent signs
  signerAddress:  agentAddress,
  senderAddress:  master.address,                   // sender = master
  baseUrl:        'https://api.devnet.mtf.exchange',
  chainId:        31337,
});

// every subsequent call uses agent.sign + master.address as sender
await agent.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
});
```

SDK 通过 `signerAddress / senderAddress` 的区分，在用代理密钥签名的同时将 `sender` 填写为主账户地址。手动实现方式如下：

```typescript
const sig = signEip712(action, agentPrivateKey, chainId);
await fetch('https://api.devnet.mtf.exchange/exchange', {
  method:  'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sender:    master.address,   // ← master's address
    signature: sig,              // ← agent's signature
    action,
  }),
});
```

## 第五步 — 密钥轮换

在旧代理到期之前，预先部署新代理：

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

建议通过 cron 任务或 systemd 定时器按天或按周自动触发轮换。对于多主机集群，每次轮换一台主机，并以健康检查作为放行条件。

## 多主机集群

每台主机拥有独立的代理。由于所有代理共享主账户的 nonce 空间并使用 `Date.now()`，它们可以并发提交：

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

Nonce 冲突极少发生（毫秒以下精度），冲突的请求会收到 `nonce_too_small` 错误，机器人重新递增后重试即可。对于单台主机吞吐量极高的场景，可使用以主账户为键的共享单调计数器（如 Redis `INCR`）。

## 检测密钥泄露

| 信号 | 可能原因 | 处置措施 |
|--------|--------------|--------|
| 主账户出现非预期订单 | 代理密钥或主密钥泄露 | 将旧代理有效期设为过去时间，立即展开调查 |
| 本应有效的代理收到 401 | 授权已过期或被撤销；或使用了错误的代理密钥 | 通过 `/info agents` 核实状态；必要时重新授权 |
| 出现未经授权的大量订单 | 代理被攻陷 | 立即从冷存储的主账户提交 `ApproveAgent { agent: X, expires_at_ms: 0 }` 以吊销 X |

链上存储了每次授权记录、每次过期时间以及每个操作的签名者。事后取证可完全通过机械化流程完成。

## 子账户代理

子账户可以拥有独立的代理集合（与主账户的代理集合分开管理）：

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

由主账户签名；`sender = sub_addr`；链上校验通过，因为主账户对其子账户拥有委托权限。此后，`subAgentKey` 对该子账户的所有操作进行签名。

这是机构场景下的标准模式：主账户冷存储；每个（子账户 × 主机）组合分配一个代理；撤销边界清晰。

## 时序 — 完整流程

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

## 参见

- [代理钱包](../concepts/agent-wallets.md) — 概念介绍
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [签名流程详解](./signing.md) — SDK 内部实现原理
- [幂等性](./idempotency.md) — 并发代理的 nonce 语义
- [子账户](../concepts/sub-accounts.md) — 子账户级别的代理配置
- [风险监控器](./risk-watcher.md) — 专用监控代理的典型用法

## 常见问题

<details>
<summary>展开常见问题</summary>

**问：代理可以授权另一个代理吗？**
答：不可以。`ApproveAgent` 仅限主账户执行，以防止密钥无限级联扩散。

**问：如何轮换主账户本身？**
答：V1 没有主账户轮换的原语。推荐方案是：将账户转为多签，并在多签集合中纳入新密钥，再从多签集合中移除旧密钥。详见[多签](../concepts/multi-sig.md)。

**问：代理所在主机在请求进行中崩溃了怎么办？**
答：待处理的请求要么已提交（可在 `userEvents` 或 openOrders 中查到），要么未提交（无事件记录）。主机重启后，请使用[对账模式](./error-handling.md#reconciliation-pattern)进行恢复。

**问：不同的代理可以分别交易不同的市场吗？**
答：协议层面不支持。协议对代理的授权覆盖主账户全部的交易操作权限。如需按市场隔离，请使用子账户（每个子账户拥有独立的代理集合）。

</details>
