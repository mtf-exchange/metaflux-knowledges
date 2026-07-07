# Migration depuis HL

:::info
**MetaFlux parle son propre protocole MTF-native — il n'existe aucune couche de compatibilité Hyperliquid.** Votre bot conserve sa stratégie et sa logique de trading ; ce qui change, c'est la couche client/protocole. Le chemin le plus rapide est le SDK officiel [TypeScript](./typescript-sdk.md) ou [Rust](./rust-sdk.md), qui construit pour vous l'enveloppe native et la signature EIP-712. Pour les autres langages, implémentez directement la [signature de données typées](./typed-data-signing.md).
:::

Si votre bot trade déjà sur un DEX de perpétuels de style Hyperliquid, le passage à MetaFlux est une **réécriture de la couche client, pas une réécriture de la stratégie**. Les concepts dont vous dépendez — ordres à cours limité, exécutions, financement, marge croisée / isolée, portefeuilles agents, sous-comptes, coffres — existent tous sur MTF. Ce que vous remplacez, c'est la forme filaire, les noms d'actions / de requêtes, le chain ID et les identifiants d'actifs.

## La nature du changement

- **Forme filaire.** MTF-native est du JSON en snake_case sur `POST /exchange` (écriture), `POST /info` (lecture) et `GET /ws` (flux), chacun signé en EIP-712 lorsque c'est requis. Adoptez le SDK ou implémentez le [schéma de signature natif](./typed-data-signing.md).
- **Stratégie & logique de risque.** Inchangées — votre code de cotation, de dimensionnement et de couverture est repris tel quel.
- **Noms & quelques sémantiques.** Les types d'actions et de requêtes sont renommés (table ci-dessous) et une poignée de comportements diffèrent (identifiants d'actifs, le palier de liquidation T0, la latence d'approbation des agents).

## Ce qui fonctionne à l'identique

- Ordres à cours limité / IOC / ALO, reduce-only, identifiants d'ordre client (`cloid`).
- Signature EIP-712 — même primitive de signature, domaine et chain ID différents.
- Marge croisée / isolée, paiements de financement, lectures des exécutions et du statut des ordres.
- Portefeuilles agents (clés chaudes sans autorité de retrait), sous-comptes, coffres.

## Ce qui change

### 1. Surface protocolaire

Il existe une seule surface MTF-native ; vous l'appelez via le SDK ou en construisant vous-même l'enveloppe. Les noms correspondent proprement :

| Ce que vous utilisiez sur HL | Équivalent MTF-native |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) / [`frontend_open_orders`](../api/rest/info.md#frontend_open_orders) |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| WS `userEvents`, `l2Book`, `candle` | `user_events`, `l2_book`, `candles` (snake_case) — voir [abonnements WS](../api/ws/subscriptions.md) |

Les catalogues complets sont [`POST /exchange`](../api/rest/exchange.md) et [`POST /info`](../api/rest/info.md).

### 2. Chain ID

MetaFlux est sa propre L1, pas un déploiement HL. Signez avec le chain ID MetaFlux, **et non** celui de HL :

| Réseau | MTF `chainId` |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / local | **31337** (`0x7a69`) |

Le domaine EIP-712 de MTF utilise `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`. Voir [réseaux](../networks.md) et [signature](./signing.md).

### 3. URL de base

```
MTF: https://api.<net>.mtf.exchange/{info,exchange,ws}
```

La passerelle est l'unique point d'entrée de la surface MTF-native. Si vous faites tourner le nœud vous-même, la même surface est servie sur `http://localhost:8080`.

### 4. Identifiants d'actifs

HL et MTF utilisent tous deux des identifiants d'actifs entiers mais **les entiers ne sont pas les mêmes**. `0` sur HL correspond au perp BTC ; `0` sur MTF pourrait être ETH ou n'importe quoi d'autre selon le déploiement. Recherchez toujours vos identifiants d'actifs via `POST /info { "type": "markets" }` au démarrage ; ne les codez jamais en dur.

### 5. Précision numérique

Les champs de prix et de taille sont des entiers mis à l'échelle transmis sous forme de chaînes JSON car IEEE-754 perd en précision au-delà de 2^53. Si votre bot effectue le parsing avec le `JSON.parse` JS par défaut, passez à un parseur compatible big-int pour ces champs.

### 6. Comportement de liquidation

MetaFlux ajoute un [palier de grâce T0 « carton jaune »](../concepts/tiered-liquidation.md) que HL n'a pas. Effet pratique : à une santé de `[1.0, 1.1)`, les ordres ALO au repos de votre compte sont annulés de force et un événement d'avertissement est émis, mais les positions ne sont pas touchées. Ensuite, T1 / T2 / T3 se comportent comme les paliers Partiel / Marché / Backstop de HL.

Si votre bot écoute les événements de liquidation pour déclencher des recharges de marge, **ajoutez un gestionnaire pour le nouvel événement T0** — c'est le signal d'alerte précoce que HL ne vous donne pas. Le capter vous laisse un bloc de grâce pour agir.

### 7. Sémantique des portefeuilles agents

Un agent est une clé sans autorité de retrait — même modèle que HL (voir [portefeuilles agents](../concepts/agent-wallets.md)). L'action est [`approve_agent`](../api/rest/exchange.md#approve_agent). La seule différence mécanique : l'approbation d'agent de MTF devient effective **un bloc après le commit**, contre une latence typiquement de deux blocs sur HL. Légèrement plus rapide ; même phase de préchauffage.

### 8. Coffres

Les coffres HL et les coffres MetaFlux ne sont pas le même produit. La lecture [`vault_state`](../api/rest/info.md#vault_state) renvoie les types de coffres propres à MTF (MFlux Vault, coffres utilisateurs). Les adresses de coffres HL ne se résoudront pas. Attendez-vous à des entités MTF, pas HL.

## Migration étape par étape

### Jour 0 — adopter le client natif

1. Installez le SDK [TypeScript](./typescript-sdk.md) ou [Rust](./rust-sdk.md) (ou implémentez la [signature de données typées](./typed-data-signing.md) pour votre langage).
2. Pointez `baseUrl` vers la passerelle MTF et définissez `chainId` pour votre réseau cible.
3. Réimplémentez la recherche d'actifs avec `POST /info { "type": "markets" }`.

### Jour 1 — mapper vos actions

Traduisez chaque action que votre bot envoie vers son équivalent MTF-native (voir la table au [§1](#1-surface-protocolaire)). `order` → `submit_order`, `cancel` → `cancel_order`, changements de levier / marge → `update_leverage` / `update_isolated_margin`. L'enveloppe EIP-712 est construite par le SDK ; seuls le nom de la variante d'action et la casse des champs diffèrent.

### Jour 2 — câbler les nouveaux signaux

- Abonnez-vous aux lectures `sub_accounts` si vous opérez des sous-comptes (MTF autorise jusqu'à 32 sous-comptes par compte maître).
- Ajoutez un gestionnaire pour les événements « carton jaune » T0 sur le canal WS `user_events`.
- Si vous dépendez de la marge de portefeuille, inscrivez-vous sur MTF avec [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin). Le seuil et l'ensemble de scénarios sont des paramètres réseau — voir [marge de portefeuille](../concepts/portfolio-margin.md).

### Jour 3+ — adopter les fonctionnalités propres à MTF

Optionnel. Si vous voulez des fonctionnalités que HL n'a pas :

- **RFQ** — primitives de demande de cotation, utiles pour de la taille qui ne veut pas s'afficher au carnet.
- **FBA** — appariement par enchères groupées fréquentes pour des marchés désignés, réduit le MEV.
- **Primitives cross-chain** — primitives de bridge appelables nativement depuis des contrats EVM.

Ce sont des actions MTF-native sur `POST /exchange` ; voir l'[aperçu de l'API](../api/index.md).

## Principaux patterns de bots HL — migration concrète

### 1. Market-making simple à ordres limités (le pattern canonique)

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://api.devnet.mtf.exchange',
  chainId:    114514,   // testnet (mainnet 8964, devnet 31337)
});

// recherche d'actif : HL meta.universe → MTF markets
const markets = await client.info.markets();
const BTC = markets.findIndex(m => m.name === 'BTC');   // peut ne pas être 0

// ordre / annulation — votre logique de stratégie, noms d'actions natifs
await client.exchange.order({
  asset: BTC, isBuy: true, price: '100', size: '0.1', tif: 'Gtc', reduceOnly: false,
});
```

La stratégie reste ; la couche client devient l'appel au SDK.

### 2. Bot de surveillance des liquidations (recharge de marge)

HL émet des événements `liquidation` au palier partiel / marché. MTF ajoute **`yellowCard`** comme signal le plus précoce sur le canal `user_events`.

```typescript
const ws = client.ws();
ws.subscribe('user_events', { user: client.address }, (event) => {
  switch (event.data.kind) {
    case 'yellowCard':
      // T0 — un bloc pour agir ; ordres ALO déjà annulés
      deposit(YELLOW_CARD_DEPOSIT);
      break;
    case 'liquidation':
      // T1 partiel OU T2 complet — trop tard pour la prévention
      emergency_unwind();
      break;
  }
});
```

Voir [risk-watcher](./risk-watcher.md) pour le pattern complet.

### 3. Bot d'arbitrage de taux de financement

La cadence de financement est similaire (horaire par défaut, configurable par marché sur MTF). La structure de la formule est identique ; la lecture est la requête native `funding`.

```typescript
const funding = await client.info.fundingHistory({ coin: 'BTC' });
// les valeurs peuvent différer de HL car la composition de l'oracle diffère
const rate = funding[0].rate_per_hr;
```

La composition de l'oracle de MTF est gouvernée par marché (`SetOracleWeights` validé) — si votre arbitrage dépend de fournisseurs d'oracle spécifiques, vérifiez la liste pondérée des sources. Voir [prix de marque](../concepts/mark-prices.md).

### 4. Configuration multi-comptes / institutionnelle

HL : compte maître + agents par hôte. MTF : pareil, plus des **comptes multi-sig** de première classe.

```typescript
// existant : compte maître + agents
await master.approveAgent(host1_agent);
await master.approveAgent(host2_agent);

// nouveau sur MTF : convertir le compte maître en multi-sig pour la conservation à froid
await master.convertToMultiSigUser({
  threshold: 2,
  signers: [signer1, signer2, signer3],
});
// chaque action ultérieure au niveau du maître requiert alors 2 signatures ;
// les agents fonctionnent toujours comme avant pour les actions de trading
```

Voir [multi-sig](../concepts/multi-sig.md).

### 5. Gestionnaire de portefeuille à sous-comptes

Sous-comptes HL : jusqu'à 8. MTF : jusqu'à 32.

```typescript
// MTF : créer l'un des 32 sous-comptes possibles
await master.createSubAccount({ name: 'desk-A' });
await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

La gestion des agents par sous-compte, l'inscription PM par sous-compte et les modes de marge par sous-compte sont tous pris en charge.

## Table de référence

| Action que vous utilisiez sur HL | Action MTF-native |
|-----------------------|-------------------|
| `order` (placement limit / IOC / ALO) | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel` (par OID) | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / transferts spot | actions de transfert spot natives |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer) (la sémantique peut différer) |

## Obtenir de l'aide

- Ce dépôt (`mtf-exchange/metaflux-knowledges`) — ouvrez une issue.
- Voir [`POST /exchange`](../api/rest/exchange.md) et le [guide de signature](./signing.md) pour la référence au niveau filaire.
