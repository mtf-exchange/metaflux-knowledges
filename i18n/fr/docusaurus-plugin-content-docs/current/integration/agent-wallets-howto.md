# Les portefeuilles agents en pratique

:::tip
**Stable.**
:::

Code concret, de bout en bout, couvrant l'approbation, le trading et la rotation des clés. Pour le contexte conceptuel, voir [les portefeuilles agents](../concepts/agent-wallets.md).

## En résumé

1. Générer une paire de clés d'agent en local.
2. Depuis le compte maître, soumettre `ApproveAgent { agent, expires_at_ms }`.
3. Attendre un bloc.
4. Signer chaque action avec la clé d'agent ; soumettre avec `sender = master_addr`.
5. Avant l'expiration, recommencer avec un nouvel agent et laisser l'ancien expirer.

## Étape 1 — générer une clé d'agent

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

Stockez la clé privée de l'agent dans l'hôte de votre bot (variable d'environnement, gestionnaire de secrets, HSM — à votre discrétion). Ne la journalisez jamais.

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

## Étape 2 — approuver depuis le compte maître

Le compte maître doit signer cette action — c'est la **seule fois** où il signe (par session).

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

En curl brut, le corps de l'action est :

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

## Étape 3 — attendre un bloc

Les approbations d'agents prennent effet **un bloc après leur validation**. Soumettez votre première requête signée par l'agent après la validation du bloc d'approbation.

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

Alternative : s'abonner à `userEvents` et rechercher `{ kind: "agentApproved" }`.

## Étape 4 — trader depuis l'agent

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

La distinction `signerAddress / senderAddress` dans le SDK indique comment renseigner `sender = master` tout en signant avec la clé de l'agent. Variante manuelle :

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

## Étape 5 — rotation

Avant l'expiration de l'ancien agent, préparez-en un nouveau :

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

Planifiez la rotation quotidiennement ou hebdomadairement via un cron ou un timer systemd. Pour les flottes multi-hôtes : faites tourner un hôte à la fois, conditionné par des vérifications de santé.

## Flotte multi-hôtes

Chaque hôte dispose de son propre agent. Ils peuvent soumettre des requêtes en parallèle car ils partagent l'espace de nonces du compte maître et utilisent `Date.now()` :

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

Les collisions de nonces sont rares (résolution inférieure à la milliseconde) et la requête en collision reçoit `nonce_too_small` ; le bot incrémente et réessaie. Pour des débits très élevés par hôte, utilisez un compteur monotone partagé (Redis `INCR`) indexé sur le compte maître.

## Détecter une compromission

| Signal | Cause probable | Action |
|--------|---------------|--------|
| Ordres inattendus depuis votre compte maître | Une clé d'agent (ou clé maître) compromise | Réduire l'expiration de l'ancien agent au passé ; mener une enquête |
| Erreurs 401 provenant d'un agent qui devrait être valide | Approbation expirée ou révoquée ; ou mauvaise clé d'agent | Vérifier via `/info agents` ; ré-approuver si nécessaire |
| Rafale soudaine d'ordres non autorisés | Agent compromis | Soumettre immédiatement `ApproveAgent { agent: X, expires_at_ms: 0 }` pour révoquer X ; procéder à la signature depuis le compte maître en stockage froid |

La chaîne enregistre chaque approbation, chaque expiration, et le signataire récupéré pour chaque action. L'analyse forensique post-incident est mécanique.

## Agents de sous-comptes

Un sous-compte peut disposer de son propre ensemble d'agents (distinct de ceux du compte maître) :

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

Le compte maître signe ; `sender = sub_addr` ; la chaîne accepte car le maître détient l'autorité de délégation sur ses sous-comptes. À partir de ce moment, `subAgentKey` signe toutes les actions pour le sous-compte.

Il s'agit du modèle institutionnel : compte maître en stockage froid ; un agent par combinaison (sous-compte × hôte) ; surface de révocation propre.

## Séquence — configuration complète

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

## Voir aussi

- [Portefeuilles agents](../concepts/agent-wallets.md) — concepts
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [Procédure de signature](./signing.md) — ce que le SDK fait en interne
- [Idempotence](./idempotency.md) — sémantique des nonces pour les agents concurrents
- [Sous-comptes](../concepts/sub-accounts.md) — configuration d'agent au niveau du sous-compte
- [Observateur de risques](./risk-watcher.md) — utilisation typique d'un agent observateur dédié

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Un agent peut-il approuver un autre agent ?**
R : Non. `ApproveAgent` est réservé au compte maître. Cela prévient les cascades de prolifération de clés.

**Q : Comment faire pivoter le compte maître lui-même ?**
R : La V1 ne dispose pas de primitive de rotation du compte maître. Le modèle supporté : convertir en multi-signature avec la nouvelle clé incluse, puis mettre à jour l'ensemble multi-signature pour supprimer l'ancienne clé. Voir [multi-signature](../concepts/multi-sig.md).

**Q : Que se passe-t-il si l'hôte d'un agent plante en cours d'exécution ?**
R : La requête en attente a soit été validée (visible sur `userEvents` / openOrders), soit non (aucun événement). Utilisez le [modèle de réconciliation](./error-handling.md#reconciliation-pattern) au redémarrage de l'hôte.

**Q : Différents agents peuvent-ils trader sur différents marchés ?**
R : Pas via le protocole. Le protocole autorise un agent sur la totalité de la surface des actions de trading du compte maître. Si vous avez besoin d'une séparation par marché, utilisez des sous-comptes (chaque sous-compte possède son propre ensemble d'agents).

</details>
