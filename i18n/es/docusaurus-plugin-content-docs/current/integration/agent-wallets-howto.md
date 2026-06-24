# Wallets de agente en la práctica

:::tip
**Estable.**
:::

Código concreto, de extremo a extremo, que recorre la aprobación, el trading y la rotación. Para el contexto conceptual, consulta [wallets de agente](../concepts/agent-wallets.md).

## TL;DR

1. Genera un par de claves de agente localmente.
2. Desde la cuenta maestra, envía `ApproveAgent { agent, expires_at_ms }`.
3. Espera un bloque.
4. Firma cada acción con la clave del agente; envía con `sender = master_addr`.
5. Antes de que expire, repite el proceso con un nuevo agente y deja que el antiguo caduque.

## Paso 1 — generar una clave de agente

```typescript
import { randomBytes } from 'crypto';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

const agentPrivateKey = randomBytes(32);
const agentPublicKey  = secp256k1.getPublicKey(agentPrivateKey);
const agentAddress    = publicKeyToEvmAddress(agentPublicKey);
console.log('agent address:', agentAddress);
```

Almacena la clave privada del agente en el host de tu bot (variable de entorno, gestor de secretos, HSM — a tu elección). Nunca la registres en logs.

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

## Paso 2 — aprobar desde la cuenta maestra

La cuenta maestra debe firmar esto — es la **única vez** que la maestra firma (por sesión).

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

En curl sin procesar, el cuerpo de la acción es:

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

## Paso 3 — esperar un bloque

Las aprobaciones de agente son efectivas **un bloque después del commit**. Envía tu primera solicitud firmada por el agente una vez que el bloque de aprobación haya sido confirmado.

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

Alternativa: suscríbete a `userEvents` y busca `{ kind: "agentApproved" }`.

## Paso 4 — operar desde el agente

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

La distinción `signerAddress / senderAddress` del SDK es lo que le indica que debe completar `sender = master` mientras firma con la clave del agente. Variante manual:

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

## Paso 5 — rotación

Antes de que el agente antiguo expire, prepara uno nuevo:

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

Programa la rotación diaria o semanal mediante un cron o un temporizador de systemd. En flotas multihost: rota un host a la vez, con validación mediante comprobaciones de estado.

## Flota multihost

Cada host tiene su propio agente. Pueden enviar solicitudes de forma concurrente porque comparten el espacio de nonces de la cuenta maestra y utilizan `Date.now()`:

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

Las colisiones de nonce son poco frecuentes (resolución sub-milisegundo) y la solicitud que colisiona recibe `nonce_too_small`; el bot incrementa el nonce y reintenta. Para un rendimiento muy elevado por host, utiliza un contador monotónico compartido (Redis `INCR`) asociado a la cuenta maestra.

## Detectar una vulneración

| Señal | Causa probable | Acción |
|--------|--------------|--------|
| Órdenes inesperadas desde tu cuenta maestra | Una clave de agente (o clave maestra) filtrada | Ajusta la expiración del agente antiguo al pasado; investiga |
| Errores 401 de un agente que debería ser válido | Aprobación expirada o revocada; o clave de agente incorrecta | Verifica mediante `/info agents`; vuelve a aprobar si es necesario |
| Ráfaga repentina de órdenes no autorizadas | Agente comprometido | Envía inmediatamente `ApproveAgent { agent: X, expires_at_ms: 0 }` para retirar a X; hazlo firmado por la cuenta maestra desde almacenamiento en frío |

La cadena almacena cada aprobación, cada expiración y el firmante recuperado de cada acción. El análisis forense posterior a un incidente es un proceso mecánico.

## Agentes de subcuentas

Una subcuenta puede tener su propio conjunto de agentes (independiente del de la cuenta maestra):

```typescript
// master signs ApproveAgent AS the sub
const subClient = master.asSubAccount(0);  // helper that flips signing context

await subClient.exchange.approveAgent({
  agent:       subAgentAddr,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  name:        'sub-0-mm-host',
});
```

La cuenta maestra firma; `sender = sub_addr`; la cadena lo acepta porque la maestra tiene autoridad de delegación sobre sus subcuentas. A partir de entonces, `subAgentKey` firma todas las acciones de la subcuenta.

Este es el patrón institucional: cuenta maestra en almacenamiento en frío; un agente por combinación (subcuenta × host); superficie de revocación clara.

## Secuencia — configuración completa

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

## Véase también

- [Wallets de agente](../concepts/agent-wallets.md) — conceptos
- [`POST /exchange approve_agent`](../api/rest/exchange.md#approve_agent)
- [Tutorial de firma](./signing.md) — lo que hace el SDK internamente
- [Idempotencia](./idempotency.md) — semántica de nonces para agentes concurrentes
- [Subcuentas](../concepts/sub-accounts.md) — configuración de agentes a nivel de subcuenta
- [Vigilante de riesgo](./risk-watcher.md) — uso típico de un agente vigilante dedicado

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Puede un agente aprobar a otro agente?**
R: No. `ApproveAgent` es exclusivo de la cuenta maestra. Esto evita cascadas de proliferación de claves.

**P: ¿Cómo roto la cuenta maestra en sí?**
R: La V1 no dispone de una primitiva de rotación de cuenta maestra. El patrón admitido es: convertir a multi-firma con la nueva clave incluida y, a continuación, actualizar el conjunto multi-firma para eliminar la clave antigua. Consulta [multi-firma](../concepts/multi-sig.md).

**P: ¿Qué ocurre si el host de un agente se cae a mitad de una operación?**
R: La solicitud pendiente se confirmó (visible en `userEvents` / openOrders) o no (sin evento). Utiliza el [patrón de reconciliación](./error-handling.md#reconciliation-pattern) al reiniciar el host.

**P: ¿Pueden distintos agentes operar en mercados distintos?**
R: No a través del protocolo. El protocolo autoriza a un agente sobre toda la superficie de acciones de trading de la cuenta maestra. Si necesitas separación por mercado, utiliza subcuentas (cada subcuenta tiene su propio conjunto de agentes).

</details>
