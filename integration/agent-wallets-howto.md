# Agent wallets in practice

{% hint style="success" %}
**Stable.**
{% endhint %}

Concrete code, end-to-end, walking through approval, trading, and rotation. For the conceptual background see [agent wallets](../concepts/agent-wallets.md).

## TL;DR

1. Generate an agent keypair locally.
2. From the master account, submit `ApproveAgent { agent, expires_at_ms }`.
3. Wait one block.
4. Sign every action with the agent key; submit with `sender = master_addr`.
5. Before expiry, repeat with a new agent and let the old expire.

## Step 1 — generate an agent key

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

Store the agent's private key in your bot's host (env var, secret manager, HSM — your call). Never log it.

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

## Step 2 — approve from master

The master must sign this — it's the **only time** the master signs (per session).

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

In raw curl, the action body is:

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

## Step 3 — wait one block

Agent approvals are effective **one block after commit**. Submit your first agent-signed request after the approval block commits.

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

Alternative: subscribe to `userEvents` and look for `{ kind: "agentApproved" }`.

## Step 4 — trade from the agent

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

The SDK's `signerAddress / senderAddress` distinction is how it knows to fill `sender = master` while signing with the agent's key. Manual variant:

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

## Step 5 — rotation

Before the old agent expires, stage a new one:

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

Schedule rotation daily / weekly via a cron / systemd timer. Multi-host fleets: rotate one host at a time, gated on health checks.

## Multi-host fleet

Each host has its own agent. They can submit concurrently because they share the master's nonce space and use `Date.now()`:

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

Nonces collide rarely (sub-millisecond resolution) and the colliding request gets `nonce_too_small`; the bot bumps and retries. For very high throughput per host, use a shared monotonic counter (Redis `INCR`) keyed on the master.

## Detect compromise

| Signal | Likely cause | Action |
|--------|--------------|--------|
| Unexpected orders from your master | A leaked agent key (or master key) | Tighten old agent's expiry to past; investigate |
| 401s from an agent that should be valid | Approval expired or revoked; or wrong agent key | Verify via `/info agents`; re-approve if needed |
| Sudden burst of orders you didn't authorise | Compromised agent | Immediately submit `ApproveAgent { agent: X, expires_at_ms: 0 }` to retire X; do this signed by master from cold storage |

The chain stores every approval, every expiry, every action's recovered signer. Forensics post-incident is mechanical.

## Sub-account agents

A sub-account can have its own agent set (separate from master's):

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

The master signs; `sender = sub_addr`; the chain admits because master holds delegation authority over its subs. From then on, `subAgentKey` signs all actions for the sub.

This is the institutional pattern: master in cold storage; one agent per (sub × host) combination; clean revocation surface.

## Sequence — full setup

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

## See also

- [Agent wallets](../concepts/agent-wallets.md) — concepts
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [Signing walkthrough](./signing.md) — what the SDK does internally
- [Idempotency](./idempotency.md) — nonce semantics for concurrent agents
- [Sub-accounts](../concepts/sub-accounts.md) — sub-level agent setup
- [Risk-watcher](./risk-watcher.md) — typical use of a dedicated watcher agent

## FAQ

**Q: Can an agent approve another agent?**
A: No. `ApproveAgent` is master-only. This prevents key proliferation cascades.

**Q: How do I rotate the master itself?**
A: V1 doesn't have a master-rotation primitive. The supported pattern: convert to multi-sig with the new key included, then update the multi-sig set to drop the old key. See [multi-sig](../concepts/multi-sig.md).

**Q: What if an agent's host crashes mid-flight?**
A: The pending request either committed (visible on `userEvents` / openOrders) or didn't (no event). Use the [reconcile pattern](./error-handling.md#reconciliation-pattern) on host restart.

**Q: Can different agents trade different markets?**
A: Not via the protocol. The protocol authorises an agent for the master's full trading-action surface. If you need per-market separation, use sub-accounts (each sub has its own agent set).
