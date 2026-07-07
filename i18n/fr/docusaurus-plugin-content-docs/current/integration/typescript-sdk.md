# SDK TypeScript

:::info
**Aperçu.** Le package `@metaflux/sdk` est publié avant le lancement sur le réseau principal ; la forme de l'API ci-dessous est définitive.
:::

## En bref

```bash
npm install @metaflux/sdk
```

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const c = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://api.devnet.mtf.exchange', // MTF-native is the gateway default path
  chainId:    31337,
});

await c.exchange.order({
  asset: 0, isBuy: true, price: '50000', size: '0.1', tif: 'Gtc',
});
```

## Constructeur

```typescript
new MetaFluxClient(opts: ClientOpts)
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `privateKey` | hex string OR `Uint8Array` | oui (sauf si `signer` est défini) | Clé privée secp256k1 de 32 octets |
| `signer` | `Signer` | oui (sauf si `privateKey` est défini) | Signataire personnalisé (HSM / WalletConnect / Ledger) |
| `senderAddress` | hex address | optionnel | Si défini, utilisé comme `sender` ; l'adresse du signataire sert de signataire récupéré. Pour le [pattern agent-wallet](./agent-wallets-howto.md). |
| `baseUrl` | string | oui | Point d'entrée de la passerelle (`https://api.<net>.mtf.exchange`). Le SDK utilise le protocole MTF-native, desservi par la passerelle sur `/info` · `/exchange` · `/ws`. Vous faites tourner le nœud vous-même ? Pointez sur `http://localhost:8080`. Voir [réseaux](../networks.md). |
| `chainId` | number | oui | Selon le réseau — voir [réseaux](../networks.md) |
| `timeoutMs` | number | optionnel (défaut 5000) | Délai d'expiration HTTP |
| `nonceFn` | `() => number` | optionnel (défaut `Date.now`) | Générateur de nonce personnalisé |

## Modules

Le client expose trois modules : `info`, `exchange`, `ws`.

### `info`

Tous les types de requêtes `POST /info`. Les méthodes retournent des réponses typées.

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

Tous les types d'actions `POST /exchange`.

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
**Les contrôles de marge sont réservés aux contrats perpétuels.** `updateLeverage`, `updateIsolatedMargin` et
`updateMarginMode` s'appliquent uniquement aux positions sur contrats perpétuels. Les positions au comptant ne
prennent pas en charge l'effet de levier ni la marge isolée en V1 — le trading au comptant utilise
le modèle d'entiercement par solde réservé via le chemin d'ordre au comptant.
:::

### `ws`

Retourne une instance `MetaFluxWs` qui multiplexe les abonnements.

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

Le client WebSocket gère :
- Reconnexion automatique avec backoff exponentiel
- Suivi du `seq` par abonnement et `resume` à la reconnexion
- Rafraîchissement de l'authentification pour les abonnements privés (fenêtre glissante)
- Keepalive ping/pong

## Gestion des erreurs

Le SDK lève des erreurs typées :

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

Voir [gestion des erreurs](./error-handling.md) pour l'arbre de décision.

## Signataire personnalisé (HSM / portefeuille matériel)

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
  baseUrl:     'https://api.devnet.mtf.exchange',
  chainId:     31337,
});
```

Le SDK transmet le `signed_hash` déjà haché à `Signer.sign` — votre HSM n'a pas besoin de connaître l'encodage EIP-712.

## Configuration d'un client de signature par agent

Pour le [pattern agent-wallets](./agent-wallets-howto.md) :

```typescript
const agent = new MetaFluxClient({
  privateKey:    agentPrivKey,
  senderAddress: masterAddress,  // ← master is the sender
  baseUrl:       'https://api.devnet.mtf.exchange',
  chainId:       31337,
});

// every action this client sends:
//   sender = masterAddress
//   signature = signed by agentPrivKey
```

## Patterns courants

### Placer + confirmer

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

### Tout annuler

```typescript
const orders = await c.info.openOrders();
await Promise.all(orders.map(o => c.exchange.cancel({ asset: o.asset, oid: o.oid })));
```

### S'abonner et persister

```typescript
const fills = [];
c.ws().subscribe('userFills', { user: c.address }, (e) => {
  for (const fill of e.data.fills) fills.push(fill);
});
```

## Gestion des valeurs numériques

Tous les champs en entier à virgule fixe et en unités de base USDC sont de type `string` en entrée comme en sortie. Le SDK n'effectue aucune conversion vers `number`, car IEEE-754 perd silencieusement de la précision au-delà de 2^53.

Pour les calculs arithmétiques, utilisez une bibliothèque big-int (`bigint`, `bignumber.js`, etc.) :

```typescript
const priceE8 = BigInt('10050000000');     // 100.50 × 10^8
const sizeE8  = BigInt('100000000');       // 1.0 × 10^8
const notional = priceE8 * sizeE8 / 10n**8n;  // 100.5
```

## Journalisation

Passez `logger: console` (ou tout objet de forme `{ debug, info, warn, error }`) pour capturer la trace interne du SDK :

```typescript
const c = new MetaFluxClient({ ..., logger: console });
```

Niveaux de journalisation : `debug` (tout), `info` (admission + connexions WS), `warn` (nouvelles tentatives), `error` (échecs terminaux).

## Voir aussi

- [Démarrage rapide](./quickstart.md) — bout en bout en 5 minutes
- [Signature](./signing.md) — ce que le SDK fait en interne
- [Guide des agent wallets](./agent-wallets-howto.md)
- [`POST /exchange`](../api/rest/exchange.md) — surface complète des actions
- [Abonnements WS](../api/ws/subscriptions.md) — catalogue des canaux
- [SDK Rust](./rust-sdk.md)

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Le SDK prend-il en charge les navigateurs ?**
R : Oui — build ES2020 avec des polyfills compatibles navigateur pour `secp256k1` et `keccak256`. Importez depuis `@metaflux/sdk/browser` si votre bundler ne procède pas au tree-shaking des imports côté Node.

**Q : Quelle est la taille de l'installation ?**
R : ~150 Ko minifié (sans les primitives cryptographiques, qui sont tree-shakeables). La couche crypto ajoute ~50 Ko.

**Q : Quelle est l'arborescence des dépendances ?**
R : `ethereum-cryptography` (ou les équivalents `@noble/*`), `@msgpack/msgpack`, `ws` (Node uniquement). Toutes sous licence MIT. Aucune dépendance transitive avec des licences non permissives.

**Q : Puis-je brancher mon propre transport HTTP (axios, undici) ?**
R : Oui — passez `transport: { request: async (req) => ... }` dans le constructeur.

</details>
