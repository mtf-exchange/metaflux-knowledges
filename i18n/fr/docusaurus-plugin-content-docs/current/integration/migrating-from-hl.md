# Migration depuis HL

:::info
**Aperçu.** La surface de compatibilité HL couvre `POST /info` (15 types de requêtes) et `POST /exchange` (ordre + annulation aujourd'hui, d'autres types d'actions à venir).
:::

Si votre bot parle déjà le protocole HL, vous pouvez le pointer vers MetaFlux **sans modifier votre code** pour la surface couverte — mêmes formes d'URL, même JSON de requête/réponse, même enveloppe EIP-712.

## Ce qui fonctionne immédiatement

- `POST /info` pour : `meta`, `allMids`, `userState`, `clearinghouseState`, `openOrders`, `frontendOpenOrders`, `userFills`, `historicalOrders`, `metaAndAssetCtxs`, `l2Book`, `vaultDetails`, `delegations`, `userFees`, `subAccounts`, `referral`
- `POST /exchange` pour : `order` (placement d'ordre limite / IOC / ALO), `cancel` (annulation par OID)
- Les abonnements WS (à venir) utiliseront les mêmes noms de canaux que HL

## Ce qui diffère

### 1. Chain ID

MetaFlux est son propre L1, pas un déploiement HL. Signez avec le chain ID de MetaFlux, **et non** celui de HL :

| Réseau | HL `chainId` | MTF `chainId` |
|---------|--------------|---------------|
| Mainnet | 1337 | **8964** (`0x2304`) |
| Testnet | 998 | **114514** (`0x1bf52`) |
| Devnet / local | 1337 | **31337** (`0x7a69`) |

Modifiez une seule constante dans votre code de signature et le reste de l'enveloppe EIP-712 est identique. Le domaine MTF utilise `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`.

### 2. URL de base

```
HL:  https://<your-current-hl-api-base>/{info,exchange}
MTF: https://gateway.<your-deployment>/hl/{info,exchange}
```

La passerelle est le point d'entrée unique. La compatibilité HL se trouve sous `/hl/*`
(`/hl/info`, `/hl/exchange`, `/hl/ws`) — un client HL gagne simplement le préfixe `/hl`.
Le chemin principal par défaut de la passerelle (`/info`, `/exchange`) est
natif MTF ; si vous faites tourner le nœud vous-même, la même surface est exposée à
`http://localhost:8080`.

### 3. Types d'actions non encore disponibles sur la couche de compatibilité

Si votre bot utilise des actions HL au-delà de `order` / `cancel`, la passerelle renvoie actuellement :

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

avec un code HTTP 200. La convention HL veut que les erreurs soient des 200 avec `status: "err"`, ce que MTF préserve.

La couverture complète des actions HL sera déployée dans les versions successives. Pour les nouvelles actions dont vous avez besoin dès aujourd'hui, utilisez directement la [surface d'actions native MTF](../api/rest/exchange.md) — elle offre une couverture complète des fonctionnalités, y compris des fonctionnalités que HL ne possède pas (RFQ, FBA, inscription à la marge de portefeuille, primitives cross-chain).

### 4. Identifiants d'actifs

HL et MTF utilisent tous deux des identifiants d'actifs entiers, mais **ces entiers ne sont pas identiques**. `0` sur HL correspond au contrat perpétuel BTC ; `0` sur MTF peut correspondre à ETH ou à n'importe quel autre actif selon le déploiement. Recherchez toujours vos identifiants d'actifs via `POST /info { "type": "meta" }` au démarrage ; ne les codez jamais en dur.

### 5. Précision numérique

Les deux chaînes utilisent des entiers mis à l'échelle (ex. `px`) et les représentent sous forme de chaînes de caractères en JSON car IEEE-754 perd en précision au-delà de 2^53. Si votre bot effectue l'analyse JSON avec le `JSON.parse` natif de JS, passez à un analyseur compatible avec les grands entiers pour ces champs — la forme des données est identique à HL, mais le mode d'échec (perte de précision silencieuse) l'est aussi.

### 6. Comportement de la liquidation

MetaFlux ajoute un [palier de grâce carton jaune T0](../concepts/tiered-liquidation.md) que HL ne possède pas. Effet concret : lorsque la santé du compte se situe dans l'intervalle `[1,0 ; 1,1)`, les ordres ALO au repos de votre compte sont annulés de force et un événement d'avertissement est émis, mais les positions ne sont pas touchées. Ensuite, T1 / T2 / T3 se comportent comme les niveaux Partiel / Marché / Backstop de HL.

Si votre bot écoute les événements de liquidation pour déclencher des rechargements de marge, **ajoutez un gestionnaire pour le nouvel événement T0** — c'est le signal d'alerte précoce que HL ne vous fournit pas. Le capturer vous donne un bloc de grâce pour agir.

### 7. Sémantique des portefeuilles agents

HL : un agent est une clé sans autorité de retrait. Même chose sur MTF — voir [portefeuilles agents](../concepts/agent-wallets.md). Le nom de l'action est `ApproveAgent` ; la forme des données reflète celle de HL. La seule différence mécanique : l'approbation d'agent sur MTF prend effet **un bloc après la validation**, contre une latence typiquement de deux blocs sur HL. Légèrement plus rapide ; même procédure de mise en route.

### 8. Coffres-forts (Vaults)

Les coffres-forts HL et MetaFlux ne sont pas le même produit. `vaultDetails` retourne des informations sur les types de coffres-forts propres à MTF (MFlux Vault, coffres utilisateurs). Les adresses de coffres-forts HL ne seront pas résolues. La forme de la requête est la même ; attendez-vous simplement à des entités MTF, pas des entités HL.

## Migration pas à pas

### Jour 0 — Pointer vers MetaFlux

1. Modifiez l'URL de base dans la configuration de votre client.
2. Modifiez la constante `chainId` dans votre module de signature.
3. Exécutez votre suite de tests existante contre le devnet MTF. Les requêtes `order` / `cancel` / et toutes les requêtes `info` devraient passer sans modification de code.

### Jour 1 — Gérer l'écart de couverture des actions

Pour les actions HL pas encore disponibles sur la couche de compatibilité MTF :

- **Modifier les ordres** — pour l'instant, annulez et soumettez à nouveau. L'action `modify` sera intégrée dans une prochaine mise à jour de la compatibilité.
- **Définir le levier / mode de marge** — utilisez l'action native MTF via `POST /exchange` sur le chemin principal de la passerelle (`UpdateLeverage`, `UpdateIsolatedMargin`). Même enveloppe EIP-712 ; nom de variante d'action différent.
- **Transfert / retrait** — natif MTF.

### Jour 2 — Brancher les nouveaux signaux

- Abonnez-vous aux informations `subAccounts` si vous gérez des sous-comptes (les sémantiques diffèrent légèrement — MTF autorise jusqu'à 32 sous-comptes par compte maître).
- Ajoutez un gestionnaire pour les événements carton jaune T0. L'endroit le plus simple est le même flux de remplissages / liquidations que vous consommez déjà ; la forme de l'événement est `{ "type": "yellowCard", "user": "0x...", "block": N }`.
- Si vous dépendez de la marge de portefeuille : réinscrivez-vous sur MTF (`UserPortfolioMargin { enabled: true }`). Le seuil et l'ensemble de scénarios sont des paramètres réseau — voir [marge de portefeuille](../concepts/portfolio-margin.md).

### Jour 3 et au-delà — Adopter les fonctionnalités exclusives à MTF

Facultatif. Si vous souhaitez utiliser des fonctionnalités que HL ne possède pas :

- **RFQ** — primitives de demande de cotation, utiles pour des volumes qui ne souhaitent pas s'afficher dans le carnet d'ordres
- **FBA** — enchères par lots fréquentes pour les marchés désignés, réduit le MEV
- **Primitives cross-chain** — primitives de pont nativement appelables depuis des contrats EVM

Ce sont des actions natives MTF, envoyées sur le chemin principal de la passerelle (`POST /exchange` — le natif MTF est le chemin par défaut ; la compatibilité HL est sous `/hl/*` ; voir [aperçu de l'API](../api/index.md)).

## Les 5 patterns de bot HL les plus courants — migration concrète

### 1. Teneur de marché à ordres limites simples (le pattern canonique)

```diff
- const HL_URL = 'https://<your-current-hl-api-base>';
+ const MTF_URL = 'https://gateway.mtf.exchange/hl';   // HL-compat is under /hl/*

- const HL_CHAIN_ID = 1337;
+ const MTF_CHAIN_ID = 114514;    // testnet (mainnet 8964, devnet 31337)

- const HL_DOMAIN_NAME = 'HLSignTransaction';   // varies by mode
+ const MTF_DOMAIN_NAME = 'MetaFlux';
+ const MTF_DOMAIN_VERSION = '1';

  // asset lookup runs against /info { type: "meta" } — same call, different result
  const meta = await fetch(MTF_URL + '/info', {
    method: 'POST',
    body: JSON.stringify({ type: 'meta' }),
  }).then(r => r.json());

  const BTC = meta.universe.findIndex(m => m.name === 'BTC');  // may not be 0

  // order, cancel — unchanged HL wire shape
  await place_order(BTC, 'B', '100', '0.1', 'Gtc');
```

Changer `chainId` + l'URL de base représente environ 5 minutes de travail pour un client typique.

### 2. Bot de surveillance des liquidations (rechargement de marge)

HL émet des événements `liquidation` lorsque les comptes atteignent le palier partiel / marché. MTF ajoute **`yellowCard`** comme signal le plus précoce.

```diff
  ws.subscribe('userEvents', { user: address }, (event) => {
    switch (event.data.kind) {
+     case 'yellowCard':
+       // T0 — one block to act. ALO orders already cancelled.
+       deposit(YELLOW_CARD_DEPOSIT);
+       break;
      case 'liquidation':
-       // HL partial / market
+       // T1 partial OR T2 full — too late for prevention
        emergency_unwind();
        break;
    }
  });
```

Voir [risk-watcher](./risk-watcher.md) pour le pattern complet.

### 3. Bot d'arbitrage sur le taux de financement

La cadence de financement est similaire (HL est horaire ; MTF est horaire par défaut mais configurable par marché). La structure de la formule est identique.

```diff
  // URL is the /hl base from pattern 1 (gateway .../hl) — HL-compat shape
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

La composition des oracles de MTF est gouvernée par marché (via `SetOracleWeights` validé) — si votre arbitrage dépend de fournisseurs d'oracles spécifiques, vérifiez que la liste des sources pondérées correspond à vos attentes. Voir [prix mark](../concepts/mark-prices.md).

### 4. Configuration multi-comptes / institutionnelle

HL : un compte maître + des agents par hôte. MTF : pareil, plus des **comptes multi-signatures** de première classe.

```diff
  // existing: master + agents
  await master.approveAgent(host1_agent);
  await master.approveAgent(host2_agent);

+ // new on MTF: convert master to multi-sig for cold custody
+ await master.convertToMultiSigUser({
+   threshold: 2,
+   signers: [signer1, signer2, signer3],
+ });
+ // every subsequent master-level action requires 2 sigs
+ // agents still work as before for trading actions
```

Voir [multi-sig](../concepts/multi-sig.md).

### 5. Gestionnaire de portefeuille de sous-comptes

Sous-comptes HL : jusqu'à 8. MTF : jusqu'à 32. La forme des données est identique :

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

La gestion des agents par sous-compte, l'inscription à la marge de portefeuille par sous-compte et les modes de marge par sous-compte sont tous pris en charge de manière identique.

## Tableau de référence

| Action utilisée sur HL | Statut sur MTF |
|----------------------|---------------|
| `order` (place limit / IOC / ALO) | ✅ Format HL-compat pris en charge |
| `cancel` (by OID) | ✅ Format HL-compat pris en charge |
| `cancelByCloid` | déploiement en cours |
| `modify` | déploiement en cours |
| `batchModify` | déploiement en cours |
| `usdSend` / spot transfers | utiliser le natif MTF |
| `withdraw3` | utiliser le natif MTF |
| `approveAgent` | format natif MTF ; voir [portefeuilles agents](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | format natif MTF |
| `usdClassTransfer` | utiliser l'équivalent natif MTF |
| `convertToMultiSigUser` | natif MTF, aperçu |
| `setReferrer` / `createReferral` | natif MTF ; les sémantiques peuvent différer |

(Le tableau est mis à jour à mesure que la prise en charge de la couche de compatibilité s'étend.)

## Obtenir de l'aide

- Ce dépôt (`mtf-exchange/metaflux-knowledges`) — ouvrez une issue
- Voir [`POST /exchange`](../api/rest/exchange.md) et le [guide de signature](./signing.md) pour la référence au niveau protocolaire
