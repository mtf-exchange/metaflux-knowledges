# TypeScript SDK

:::info
**Vista previa.** El paquete `@metaflux/sdk` se publica antes del lanzamiento en mainnet; la forma de la API que se describe a continuación es definitiva.
:::

## Resumen rápido

```bash
npm install @metaflux/sdk
```

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const c = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://devnet-gateway.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
});
```

## Constructor

```typescript
new MetaFluxClient(opts: ClientOpts)
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `privateKey` | hex string OR `Uint8Array` | sí (salvo que se defina `signer`) | Clave privada secp256k1 de 32 bytes |
| `signer` | `Signer` | sí (salvo que se defina `privateKey`) | Firmante personalizado (HSM / WalletConnect / Ledger) |
| `senderAddress` | hex address | opcional | Si se establece, se usa como `sender`; la dirección del firmante se emplea como firmante recuperado. Para el [patrón de agente-wallet](./agent-wallets-howto.md). |
| `baseUrl` | string | sí | Punto de entrada del gateway (`https://<net>-gateway.mtf.exchange`). El SDK utiliza el protocolo MTF-native, que es la ruta predeterminada del gateway (`/info` · `/exchange` · `/ws`); la compatibilidad HL reside bajo `/hl/*`. ¿Ejecutas el nodo tú mismo? Apunta a `http://localhost:8080`. Consulta [redes](../networks.md). |
| `chainId` | number | sí | Según la red — véase [redes](../networks.md) |
| `timeoutMs` | number | opcional (por defecto 5000) | Tiempo de espera HTTP |
| `nonceFn` | `() => number` | opcional (por defecto `Date.now`) | Generador de nonce personalizado |

## Módulos

El cliente expone tres módulos: `info`, `exchange`, `ws`.

### `info`

Todos los tipos de consulta de `POST /info`. Los métodos devuelven respuestas tipadas.

```typescript
c.info.meta();
c.info.allMids();
c.info.l2Book({ coin: 'BTC', depth: 20 });
c.info.clearinghouseState();                   // implicit user=address
c.info.openOrders();
c.info.userFills({ sinceTs: 0, limit: 1000 });
c.info.fundingHistory({ asset: 0 });
c.info.feeSchedule();
c.info.vaultState({ vault: '0x...' });
c.info.subAccounts();
c.info.agents();
c.info.userFees();
```

### `exchange`

Todos los tipos de acción de `POST /exchange`.

```typescript
c.exchange.order(p: OrderParams): Promise<OrderResult>;
c.exchange.cancel(p: CancelParams): Promise<CancelResult>;
c.exchange.cancelByCloid(p: CancelByCloidParams): Promise<CancelResult>;
c.exchange.modifyOrder(p: ModifyOrderParams): Promise<OrderResult>;
c.exchange.batchModify(p: BatchModifyParams): Promise<OrderResult[]>;
c.exchange.scaleOrder(p: ScaleOrderParams): Promise<OrderResult[]>;
c.exchange.twapOrder(p: TwapOrderParams): Promise<TwapResult>;
c.exchange.twapCancel(p: { twapId: string }): Promise<void>;
c.exchange.trigger(p: TriggerParams): Promise<OrderResult>;

c.exchange.updateLeverage(p: { asset: number; leverage: number }): Promise<void>;
c.exchange.updateIsolatedMargin(p: UpdateIsolatedMarginParams): Promise<void>;
c.exchange.updateMarginMode(p: { asset: number; mode: MarginMode }): Promise<void>;
c.exchange.userPortfolioMargin(p: { enabled: boolean }): Promise<void>;
// Margin controls (updateLeverage / updateIsolatedMargin / updateMarginMode)
// are perp-only. Spot positions do not support leverage or isolated margin in
// V1 — spot uses the reserved-balance escrow model via the spot order path.

c.exchange.approveAgent(p: ApproveAgentParams): Promise<{ actionHash: string }>;
c.exchange.createSubAccount(p: { name: string; explicitIndex?: number }): Promise<SubAccountResult>;
c.exchange.subAccountTransfer(p: SubAccountTransferParams): Promise<void>;

c.exchange.usdcTransfer(p: { to: string; amountE6: string }): Promise<void>;
c.exchange.withdrawUsdc(p: WithdrawUsdcParams): Promise<{ burnTxHash: string }>;

c.exchange.rfqRequest(p: RfqRequestParams): Promise<{ rfqId: string }>;
c.exchange.rfqQuote(p: RfqQuoteParams): Promise<{ quoteId: string }>;
c.exchange.rfqAccept(p: { rfqId: string; quoteId: string }): Promise<void>;

c.exchange.fbaOrder(p: FbaOrderParams): Promise<OrderResult>;
```

:::warning
**Los controles de margen son exclusivos de contratos perpetuos.** `updateLeverage`, `updateIsolatedMargin` y
`updateMarginMode` se aplican únicamente a posiciones en contratos perpetuos. Las posiciones spot no
admiten apalancamiento ni margen aislado en V1 — el trading spot utiliza en su lugar
el modelo de custodia por saldo reservado a través de la ruta de órdenes spot.
:::

### `ws`

Devuelve una instancia de `MetaFluxWs` que multiplexa suscripciones.

```typescript
const ws = c.ws();

ws.on('open',  () => console.log('connected'));
ws.on('close', (code) => console.log('disconnected', code));

const sub1 = ws.subscribe('l2Book', { coin: 'BTC' }, (event) => {
  // event.data has the typed payload
});

const sub2 = ws.subscribe('userEvents', { user: c.address }, (event) => {
  switch (event.data.kind) {
    case 'fill': /* ... */ break;
    case 'orderCancelled': /* ... */ break;
  }
});

await sub1.unsubscribe();
ws.close();
```

El cliente WS gestiona:
- Reconexión automática con retroceso exponencial
- Seguimiento de `seq` por suscripción y `resume` al reconectar
- Renovación de autenticación para suscripciones privadas (ventana deslizante)
- Keepalive mediante ping/pong

## Manejo de errores

El SDK lanza errores tipados:

```typescript
try {
  await c.exchange.order({ ... });
} catch (e) {
  if (e instanceof RateLimitError)    { await sleep(e.retryAfterMs); /* retry */ }
  else if (e instanceof AuthError)    { /* signing bug — escalate */ }
  else if (e instanceof CommitError)  { /* committed but state-machine rejected */ }
  else if (e instanceof NetworkError) { /* unknown outcome — reconcile */ }
  else                                 { throw e; }
}
```

Consulta el [manejo de errores](./error-handling.md) para ver el árbol de decisiones.

## Firmante personalizado (HSM / hardware wallet)

```typescript
import { Signer } from '@metaflux/sdk';

class HsmSigner implements Signer {
  async sign(digest: Uint8Array): Promise<Uint8Array> {
    // Forward digest to HSM; return 65-byte r||s||v
  }
  getAddress(): string { return '0x...'; }
}

const c = new MetaFluxClient({
  signer:      new HsmSigner(),
  baseUrl:     'https://devnet-gateway.mtf.exchange',
  chainId:     31337,
});
```

El SDK pasa el `signed_hash` ya calculado a `Signer.sign` — tu HSM no necesita conocer la codificación EIP-712.

## Configurar un cliente de firma con agente

Para el [patrón de agente-wallet](./agent-wallets-howto.md):

```typescript
const agent = new MetaFluxClient({
  privateKey:    agentPrivKey,
  senderAddress: masterAddress,  // ← master is the sender
  baseUrl:       'https://devnet-gateway.mtf.exchange',
  chainId:       31337,
});

// every action this client sends:
//   sender = masterAddress
//   signature = signed by agentPrivKey
```

## Patrones comunes

### Colocar y confirmar

```typescript
const cloid = '0x' + randomBytes(16).toString('hex');

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
  cloid,
});

// wait for commit confirmation
const filled = new Promise((resolve) => {
  const sub = c.ws().subscribe('orderEvents', { user: c.address }, (event) => {
    if (event.data.cloid === cloid && event.data.kind === 'resting') {
      sub.unsubscribe();
      resolve(event.data);
    }
  });
});

await filled;
```

### Cancelar todo

```typescript
const orders = await c.info.openOrders();
await Promise.all(orders.map(o => c.exchange.cancel({ asset: o.asset, oid: o.oid })));
```

### Suscribirse y persistir

```typescript
const fills = [];
c.ws().subscribe('userFills', { user: c.address }, (e) => {
  for (const fill of e.data.fills) fills.push(fill);
});
```

## Manejo de valores numéricos

Todos los campos de enteros de punto fijo y unidades base de USDC son `string` tanto en entradas como en salidas. El SDK no convierte a `number` porque IEEE-754 pierde precisión de forma silenciosa por encima de 2^53.

Para operaciones aritméticas, utiliza una librería de enteros grandes (`bigint`, `bignumber.js`, etc.):

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## Registro de eventos

Pasa `logger: console` (o cualquier objeto con la forma `{ debug, info, warn, error }`) para capturar la traza interna del SDK:

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

Niveles de registro: `debug` (todo), `info` (admisión y conexiones WS), `warn` (reintentos), `error` (fallos terminales).

## Véase también

- [Inicio rápido](./quickstart.md) — flujo completo en 5 minutos
- [Firma](./signing.md) — qué hace el SDK internamente
- [Guía de agente-wallets](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — superficie completa de acciones
- [Suscripciones WS](../api/ws/subscriptions.md) — catálogo de canales
- [SDK de Rust](./rust-sdk.md)

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿El SDK es compatible con navegadores?**
R: Sí — compilación ES2020 con polyfills compatibles con navegador para `secp256k1` y `keccak256`. Importa desde `@metaflux/sdk/browser` si tu bundler no elimina mediante tree-shaking las importaciones del lado de Node.

**P: ¿Cuánto ocupa la instalación?**
R: ~150 KB minificado (sin incluir las primitivas criptográficas, que son eliminables por tree-shaking). La capa criptográfica añade ~50 KB.

**P: ¿Cuál es el árbol de dependencias?**
R: `ethereum-cryptography` (o equivalentes de `@noble/*`), `@msgpack/msgpack`, `ws` (solo Node). Todas con licencia MIT. Sin dependencias transitivas con licencias no permisivas.

**P: ¿Puedo usar mi propio transporte HTTP (axios, undici)?**
R: Sí — pasa `transport: { request: async (req) => ... }` en el constructor.

</details>
