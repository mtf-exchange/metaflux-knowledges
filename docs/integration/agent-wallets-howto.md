# Agent wallets in practice

This page shows the code for an agent wallet, end to end: approval, trading and rotation.

:::tip
**Stable.**
:::

For the concepts, see [agent wallets](../concepts/agent-wallets.md).

## Summary {#tldr}

1. Generate an agent keypair locally.
2. From the master account, submit `approve_agent { agent, expires_at_ms }`.
3. Wait one block.
4. Sign every action with the agent key. Submit with `sender = master_addr`.
5. Before expiry, repeat with a new agent and let the old agent expire.

## 1. Generate an agent key {#step-1--generate-an-agent-key}

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

Store the agent's private key on your bot's host: an env var, a secret manager or an HSM. Never
log it.

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

## 2. Approve from the master {#step-2--approve-from-master}

The master signs this action. It is the only time per session that the master signs.

```typescript
import { Client } from '@metaflux-dex/client';

const master = new Client({
  baseUrl:    'https://api.testnet.mtf.exchange', // MTF-native is the gateway default path
  privateKey: Buffer.from(process.env.MASTER_KEY!.replace(/^0x/, ''), 'hex'),
});
// `Client` has no `.address` getter — the master's own address comes from
// wherever you derived MASTER_KEY (the same `publicKeyToEvmAddress` step as
// Step 1), not from the client instance.
const masterAddress = '0x<MASTER_ADDRESS>';

const result = await master.approveAgent({
  agent:         agentAddress,
  expires_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,  // 30 days
  name:          'mm-host-3',
});

console.log('approved, action hash:', result.action_hash);
```

In raw curl, the action body is:

```json
{
  "type": "approve_agent",
  "params": {
    "agent":        "0x<agent_addr>",
    "expires_at_ms": 1735689600000,
    "name":         "mm-host-3"
  }
}
```

## 3. Wait one block {#step-3--wait-one-block}

An agent approval takes effect one block after commit. Submit your first agent-signed request
after the approval block commits.

```typescript
// confirm the approval is on-chain
async function waitForApproval(c: Client, masterAddr: string, agentAddr: string) {
  for (let i = 0; i < 20; i++) {
    const { agents } = await c.info.agents(masterAddr);
    if (agents.find(a => a.agent.toLowerCase() === agentAddr.toLowerCase())) return;
    await sleep(200);
  }
  throw new Error('approval not visible after 4s');
}

await waitForApproval(master, masterAddress, agentAddress);
```

No real-time push event reports a landed agent approval. A poll of `/info agents`, as above, is the
only way to see it today.

## 4. Trade from the agent {#step-4--trade-from-the-agent}

There is no `signerAddress` / `senderAddress` constructor option. A separate `Client` signs with
the agent's own key. The action's `owner` field routes the action to the master's account. It is
an action field, not a client option:

```typescript
// A separate Client, signing with the agent's key.
const agent = new Client({
  baseUrl:    'https://api.testnet.mtf.exchange',
  privateKey: agentPrivateKey,
});

// `owner` names the master account this order rests under. The client
// recovers its own signer (the agent) and, before the request leaves the
// process, confirms it against the owner's approved-agent set from `/info`.
await agent.submitOrderNative({
  owner: masterAddress,
  market: 0, side: 'bid', kind: 'limit',
  size: 1_000, limit_px: 5_000_000_000_000,
  tif: 'gtc', stp_mode: 'cancel_newest', reduce_only: false,
});
```

To sign without the SDK, build the EIP-712 digest yourself and POST the raw envelope. See
[typed-data signing](./typed-data-signing.md).

## 5. Rotation {#step-5--rotation}

Before the old agent expires, stage a new one:

```typescript
async function rotateAgent(
  master: Client,
  masterAddress: string,
  oldAgentAddr: string,
  newAgentAddr: string,
) {
  // 1. Approve the new agent with full TTL
  await master.approveAgent({
    agent:         newAgentAddr,
    expires_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
    name:          `mm-host-3-${Date.now()}`,
  });
  await waitForApproval(master, masterAddress, newAgentAddr);

  // 2. Flip traffic in your bot from the old agent's Client to a new one
  // built with newAgentPrivKey (deployment-specific — flag swap, config reload, etc.)

  // 3. Tighten the old agent's expiry to ~1h from now so it dies
  await master.approveAgent({
    agent:         oldAgentAddr,
    expires_at_ms: Date.now() + 60 * 60 * 1000,
    name:          `mm-host-3-retiring`,
  });

  // 4. Within an hour, every old-agent-signed request will return 401
  //    Your bot is already on the new agent; no functional impact.
}
```

Schedule the rotation daily or weekly with a cron job or a systemd timer. In a fleet with many
hosts, rotate one host at a time, and gate each step on health checks.

## Multi-host fleet {#multi-host-fleet}

Each host has its own agent. The hosts can submit at the same time, because they share the
master's nonce space and use `Date.now()`:

```
master account (0xMASTER)
   approved agents:
     0xAGENT_HOST_1   (mm-host-1, expires +29d)
     0xAGENT_HOST_2   (mm-host-2, expires +27d)
     0xAGENT_HOST_3   (mm-host-3, expires +30d)

each host runs:
   const agentN = new Client({ baseUrl, privateKey: HOST_AGENT_KEY });
   // every order sets `owner: '0xMASTER'` — routing is per-action, not per-client
   ... places orders concurrently ...
```

Nonces collide rarely, because the resolution is below one millisecond. The colliding request
gets `nonce_too_small`, and the bot increments and retries. For very high throughput per host,
use a shared monotonic counter (Redis `INCR`) keyed on the master.

## Detect compromise {#detect-compromise}

| Signal | Likely cause | Action |
|--------|--------------|--------|
| Unexpected orders from your master | A leaked agent key (or master key) | Set the old agent's expiry in the past, then investigate |
| 401s from an agent that should be valid | The approval expired or was revoked, or the agent key is wrong | Verify through `/info agents`, and re-approve if needed |
| A sudden burst of orders you did not authorise | Compromised agent | Submit `approve_agent { agent: X, expires_at_ms: 0 }` at once to retire X. Sign it with the master from cold storage |

The chain stores every approval, every expiry, and the recovered signer of every action. Forensics
after an incident is therefore mechanical.

## Sub-account agents {#sub-account-agents}

:::warning Not available today
A sub-account has no private key. Its address is a hash of the master address and its index. Its
approved-agent set is always empty. `approve_agent` authorizes an agent of the signer's account,
so only the sub-account could approve an agent of itself, and the sub-account cannot sign. No SDK
method exists for this pattern (no `asSubAccount()` helper), because the protocol has no signing
path for it yet. See the [sub-accounts warning](../concepts/sub-accounts.md#tldr) for the current
state.
:::

Until sub-account signing ships, run one master account per trading strategy, and not agents per
sub-account.

## Full setup sequence {#sequence--full-setup}

```
T=0    generate agent keypair on host
T=1    operator triggers approval from cold master
       master signs approve_agent { agent, ttl=30d, name }
       POST /exchange
T+1block  approval committed
   next poll  host's bot polls /info agents; sees approval; starts trading
...    bot runs for 29 days, signing every action with agent key
T+29d  scheduled rotation kicks in
       cold master signs approve_agent for new key (ttl=30d)
       host's bot config updated to new key
       cold master signs approve_agent for old key with ttl=1h
T+29d+1h  old agent expires; bot has fully migrated
```

## See also {#see-also}

- [Agent wallets](../concepts/agent-wallets.md): concepts
- [`POST /exchange approve_agent`](../api/rest/exchange/account.md#approve_agent)
- [Signing walkthrough](./signing.md): what the SDK does internally
- [Idempotency](./idempotency.md): nonce semantics for concurrent agents
- [Sub-accounts](../concepts/sub-accounts.md): agent setup for a sub-account
- [Risk-watcher](./risk-watcher.md): a typical use of a dedicated watcher agent

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Can an agent approve another agent?**
A: No. Only the master can send `approve_agent`. This stops a chain of keys that approve more keys.

**Q: How do I rotate the master itself?**
A: V1 has no master-rotation primitive. The supported pattern: convert to multi-sig with the new key included, then update the multi-sig set to remove the old key. See [multi-sig](../concepts/multi-sig.md).

**Q: What if an agent's host crashes during a request?**
A: The pending request committed (visible on `order_updates` / `open_orders`), or it did not (no event). Use the [reconcile pattern](./error-handling.md#reconciliation-pattern) when the host restarts.

**Q: Can different agents trade different markets?**
A: Not through the protocol. The protocol authorises an agent for the master's full set of trading actions. For separation per market, use sub-accounts. Each sub-account has its own agent set.

</details>
