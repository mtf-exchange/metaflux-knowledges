# Surface REST compatible HL

:::info
**Préversion.** La passerelle répond à chaque type de requête HL `/info` avec la forme de message HL exacte. Certains types sont **câblés** sur l'état du nœud en direct aujourd'hui ; les autres retournent la forme **honnêtement vide** de HL (jamais `null`, jamais une valeur fabriquée) dans l'attente que la lecture correspondante du nœud soit disponible. Le statut de chaque type figure dans la [table de traduction](#hl-info-type--type-natif-mtf-du-nœud) ci-dessous.
:::

## En bref

La passerelle expose des URL et des formes requête/réponse identiques à celles de HL. Les bots HL pointent vers MetaFlux [sans modifier une seule ligne de code](../../integration/migrating-from-hl.md) pour la surface couverte. Le format du protocole — l'enveloppe 400 `{"error":...}` de HL, les champs camelCase, les tuples `[bids, asks]`, les montants en chaîne décimale — est préservé à l'identique.

**La passerelle est le SEUL endroit où les formes HL/camelCase existent.** Le nœud est nativement MTF de bout en bout (snake_case, ids entiers/`u32` — voir [`/info`](./info.md)). Chaque réponse HL ici est une *traduction* d'une lecture native MTF du nœud ; le nœud ne parle jamais HL.

## URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

La compatibilité HL est placée sous l'espace de noms `/hl/*` sur la porte d'entrée de la passerelle. Les chemins de premier niveau `/info` · `/exchange` de la passerelle sont natifs MTF (le chemin par défaut) — faites pointer les clients HL vers `/hl/*`, et non vers les chemins nus, sous peine de tomber sur la surface native (qui rejette les champs propres à HL). La traduction HL↔natif ne vit que dans la passerelle.

## Convention d'enveloppe

- Lectures `/info` : HTTP 200 avec le corps JSON brut propre au type. En cas de mauvaise requête (`type` inconnu, `user` manquant ou invalide), HTTP 400 avec `{"error":"<message>"}`. Une erreur de backhaul vers le nœud est remontée honnêtement : 502 `{"error":...}` pour un problème de transport ou une réponse 5xx, 400 pour des paramètres refusés par le nœud — **jamais** un succès vide fabriqué.
- Écritures `/exchange` : convention HL `{"status":"ok"|"err", "response":<...>}` (les erreurs sont des 200). Voir [`/exchange` ci-dessous](#exchange--chemin-décriture).

---

## `/info` — chemin de lecture

Lecture seule. Dispatche sur le champ `type` du corps de la requête. Reflète le `/info` de HL.

### HL info type → type natif MTF du nœud

Voici la table de correspondance maître. La **traduction** consiste toujours à : snake_case → camelCase, entier/centimes/id-`u32` → chaîne décimale / adresse `0x`, enveloppe `{type,data}` du nœud désencapsulée. La couche de traduction ne vit que dans la passerelle.

| Type HL `/info` | Statut | Source native MTF du nœud | Notes |
|-----------------|--------|---------------------------|-------|
| `clearinghouseState` / `userState` | **câblé** | [`account_state`](./info.md#account_state) | `marginSummary` issu du `balance_quote` du nœud ; `assetPositions:[]` jusqu'à ce que le nœud expose l'état par position |
| `delegations` | **câblé** | [`staking_state`](./info.md#staking_state) | le nœud est indexé par `account_id` compact (u64) ; une vraie adresse keccak sans id compact renvoie une erreur honnête (pas une liste vide fabriquée) |
| `userFees` | **câblé** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` est en direct ; `activeReferrer`/`userVolumes`/`dailyUserVlm` attendent les lectures `user_referrer`/`user_volume` du nœud |
| `l2Book` | bouchon | [`l2_book`](./info.md#l2_book) | la lecture du nœud existe ; la traduction passerelle vers `{coin,levels,time}` n'est pas encore câblée — renvoie un carnet HL vide |
| `meta` | bouchon | — | nécessite une lecture lister-tous-les-marchés / univers du nœud (le `market_info` du nœud est par id) ; renvoie `{universe:[],marginTables:[]}` |
| `allMids` | bouchon | — | nécessite la lecture de l'univers (même blocage que `meta`) ; renvoie `{}` |
| `metaAndAssetCtxs` | **câblé** | [`markets`](./info.md#markets) | `[meta, [assetCtx...]]` ; chaque `assetCtx` perpétuel porte `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `funding` / `openInterest` / `oraclePx`, tous en chaînes décimales USDC |
| `openOrders` | bouchon | [`open_orders`](./info.md#open_orders) | la lecture du nœud existe ; la traduction passerelle n'est pas encore câblée — renvoie `[]` |
| `frontendOpenOrders` | bouchon | [`open_orders`](./info.md#open_orders) | `openOrders` + indices UI ; renvoie `[]` |
| `vaultDetails` | bouchon | [`vault_state`](./info.md#vault_state) | nécessite un registre adresse-leader → `vault_id` (le nœud est indexé par `vault_id`) ; répercute le `user` de la requête, données financières à zéro |
| `subAccounts` | **câblé** | [`sub_accounts`](./info.md#sub_accounts) | mappe `{index,address}` du nœud vers `{subAccountUser,name,master}` ; `clearinghouseState` omis (pas de jointure par sous-compte sur la lecture du nœud) |
| `referral` | bouchon | — | le référent est défini par `Action::setReferrer`, immuable ; renvoie `referredBy:null` |
| `spotClearinghouseState` | **câblé** | [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) | `{asset,name,balance}` du nœud → `{coin,token,total}` ; `hold:"0"` / `entryNtl:null` (pas de réserve/base de coût sur la lecture du nœud) |
| `spotMeta` / `spotMetaAndAssetCtxs` | **câblé** | [`spot_meta`](./info.md#spot_meta) | `pairs` du nœud → `universe` ; registre `tokens` issu du vrai registre par jeton du nœud : `name` / `szDecimals` / `weiDecimals` (USDC `isCanonical`) ; chaque `assetCtx` spot porte `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `circulatingSupply`, en chaînes décimales USDC |
| `predictedFundings` | bouchon | — | renvoie `[]` |
| `orderStatus` | bouchon | — | résout en `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **câblé** | [`max_builder_fee`](./info.md#max_builder_fee) | projette le `max_fee_bps` du nœud en tant que nombre HL brut ; paire non approuvée → `0` |
| `userRateLimit` | **câblé** | [`user_rate_limit`](./info.md#user_rate_limit) | `lifetime_count` du nœud → `nRequestsUsed`, `nRequestsCap` de référence ; `cumVlm:"0.0"` (pas de volume du nœud sur cette lecture) |
| `userNonFundingLedgerUpdates` | bouchon | — | renvoie `[]` |
| `userFunding` / `userFundings` | non servi | — | historique des paiements de financement par utilisateur — servi par l'indexeur de la passerelle (feuille de route) |
| `fundingHistory` | **câblé** | [`funding_history`](./info.md#funding_history) | échantillons de prime/taux réalisé par coin sur une fenêtre, issus du tracker de financement du nœud en direct |
| `userFills` | **câblé** | [`user_fills`](./info.md#user_fills) | journal de remplissages détaillé, issu de la bande de remplissages par compte validée |
| `userFillsByTime` | **câblé** | [`user_fills_by_time`](./info.md#user_fills_by_time) | `userFills` fenêtré dans le temps, même bande de remplissages validée |
| `historicalOrders` | non servi | — | liste des ordres en état terminal — servi par l'indexeur de la passerelle (feuille de route) |
| `candleSnapshot` | non servi | — | historique OHLCV — servi par l'indexeur de la passerelle (feuille de route) |

Légende : **câblé** = état du nœud en direct · bouchon = forme vide conforme à HL, sans appui sur le nœud · non servi = pas encore d'appui sur le nœud, sera servi par l'indexeur de la passerelle (feuille de route).

:::info
Le contrat **honnêtement vide** est fondamental : les clients HL itèrent ces réponses sans condition. Un bouchon doit émettre `[]` / `{}` / la valeur zéro typée — **jamais** `null` là où un client attend un objet — afin que les SDK HL non modifiés désérialisent de manière identique, que la donnée soit en direct ou en attente.
:::

### Types câblés

#### `clearinghouseState` / `userState`

Deux alias — ils renvoient tous deux l'état de la chambre de compensation par utilisateur. **Câblé** au nœud [`account_state`](./info.md#account_state). Le `balance_quote` du nœud (collateral USDC en dollars entiers) est mappé sur le résumé de marge HL. Le détail par position n'est pas encore sur la surface du nœud, donc `assetPositions` vaut `[]`.

```json
{"type":"clearinghouseState", "user":"0x..."}
```

Réponse (forme HL) :

```json
{
  "assetPositions": [],
  "marginSummary": {
    "accountValue":    "1000.0",
    "totalNtlPos":     "0.0",
    "totalRawUsd":     "1000.0",
    "totalMarginUsed": "0.0"
  },
  "crossMarginSummary":         { "accountValue": "1000.0", "totalNtlPos": "0.0", "totalRawUsd": "1000.0", "totalMarginUsed": "0.0" },
  "crossMaintenanceMarginUsed": "0.0",
  "withdrawable":               "1000.0",
  "time":                       0
}
```

Une fois que le nœud expose l'état par position, `assetPositions[]` se remplit avec la forme HL :

```json
{
  "type":     "oneWay",
  "position": {
    "coin":           "BTC",
    "szi":            "1.0",
    "entryPx":        "100.0",
    "leverage":       { "type": "cross", "value": 10 },
    "marginUsed":     "10.5",
    "unrealizedPnl":  "0.5",
    "returnOnEquity": "0.05",
    "liquidationPx":  "92.5",
    "positionValue":  "100.5",
    "maxLeverage":    50,
    "cumFunding":     { "allTime": "0.123", "sinceOpen": "0.05" }
  }
}
```

#### `userFees`

**Câblé** : `feeSchedule` est alimenté en direct depuis le nœud [`fee_schedule`](./info.md#fee_schedule) (renommage snake→camel ; les bps restent des nombres JSON, bornés < 65536). Les données par utilisateur (`activeReferrer`, `userVolumes`, `dailyUserVlm`) attendent les lectures `user_referrer` / `user_volume` du nœud.

```json
{"type":"userFees","user":"0x..."}
```

```json
{
  "activeReferrer": null,
  "userVolumes":    [],
  "feeSchedule": {
    "takerBps":         5,
    "makerBps":         2,
    "referrerShareBps": 0,
    "builderCapBps":    8,
    "deployerCapBps":   0,
    "burnBps":          0,
    "vaultBps":         0,
    "validatorBps":     0,
    "treasuryBps":      0
  },
  "dailyUserVlm":   "0.0"
}
```

#### `delegations`

**Câblé** au nœud [`staking_state`](./info.md#staking_state). Le nœud indexe le staking par `account_id` compact (u64), de sorte que la passerelle inverse l'intégration de l'adresse ; une vraie adresse keccak sans id compact renvoie une erreur honnête plutôt qu'une liste vide fabriquée.

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**Câblé** au nœud [`sub_accounts`](./info.md#sub_accounts). Chaque `{index, address}` du nœud est mappé vers `{"subAccountUser","name","master"}` — `subAccountUser` est l'adresse du sous-compte du nœud, `master` est le propriétaire interrogé, `name` est un label `sub-<index>` (pas de label de sous-compte on-chain). `clearinghouseState` est omis : la lecture du nœud ne comporte pas de jointure d'état de compte par sous-compte.

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**Câblé** au nœud [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state) (par `address` en 0x). `{asset, name, balance}` du nœud → HL `{coin, token, total, hold, entryNtl}` : `coin` issu du `name` du nœud, `token` issu de l'id `asset` du nœud, `total` issu du `balance` du nœud. `hold` vaut `"0"` et `entryNtl` vaut `null` — la lecture du nœud ne comporte ni réserve par solde, ni base de coût.

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**Câblé** au nœud [`spot_meta`](./info.md#spot_meta). Chaque paire du nœud est mappée sur une entrée `universe` (`tokens:[base,quote]`, `index` = id de paire, `isCanonical` = `active` du nœud). Le registre `tokens` est construit à partir du vrai registre par jeton du nœud : le `name` / `sz_decimals` / `wei_decimals` de chaque entrée sont directement mappés sur le HL `name` / `szDecimals` / `weiDecimals` ; `index` est l'id d'actif du jeton, `tokenId` est l'hexadécimal sur 32 octets de l'id, et USDC est marqué `isCanonical`.

```json
{"type":"spotMeta"}
```

```json
{
  "tokens":   [ { "name": "USDC", "szDecimals": 2, "weiDecimals": 6, "index": 100, "tokenId": "0x...", "isCanonical": true },
                { "name": "MTF",  "szDecimals": 2, "weiDecimals": 8, "index": 104, "tokenId": "0x...", "isCanonical": false } ],
  "universe": [ { "name": "MTF/USDC", "tokens": [104, 100], "index": 113, "isCanonical": true } ]
}
```

Les ids de jetons du nœud commencent à `100` (USDC) — voir [`spot_meta`](./info.md#spot_meta) pour le registre complet — donc `index` reflète ces ids, et non le schéma `0`-indexé de HL.

`spotMetaAndAssetCtxs` renvoie `[spotMeta, [spotAssetCtx...]]` ; le second
élément est un `spotAssetCtx` par paire, aligné sur les indices de `spotMeta.universe`.
Chaque `spotAssetCtx` porte le `coin` de la paire ainsi que le contexte en direct :

```json
{
  "coin":              "MTF/USDC",
  "dayNtlVlm":         "42000.00",
  "prevDayPx":         "4.95",
  "markPx":            "5.00",
  "midPx":             "5.00",
  "circulatingSupply": "21000000.0"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `dayNtlVlm` | chaîne décimale | Volume notionnel sur 24 heures, en **USD** |
| `prevDayPx` | chaîne décimale | Prix il y a 24h, en **USDC décimal** |
| `markPx` | chaîne décimale | Prix mark actuel, en **USDC décimal** |
| `midPx` | chaîne décimale | Milieu du carnet d'ordres actuel, en **USDC décimal** |
| `circulatingSupply` | chaîne décimale | Offre en circulation du jeton de base |

Tous les prix sont des chaînes USDC décimales (lisibles par l'humain), pas des entiers bruts.

#### `maxBuilderFee`

**Câblé** au nœud [`max_builder_fee`](./info.md#max_builder_fee) (`address` en 0x + `builder`). Renvoie le `max_fee_bps` du nœud en tant que nombre HL brut (HL émet l'entier, pas un objet) ; une paire `(user, builder)` non approuvée → `0`.

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**Câblé** au nœud [`user_rate_limit`](./info.md#user_rate_limit) (par `address` en 0x). Le `lifetime_count` du nœud est mappé sur `nRequestsUsed` ; `nRequestsCap` correspond à la valeur de référence HL (1200). `cumVlm` reste `"0.0"` — la lecture de limite de débit du nœud est basée sur les statistiques d'actions, pas sur le volume (en attente d'une lecture de volume du nœud).

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### Types bouchons (forme vide conforme à HL)

Ces types renvoient la forme exacte de HL avec des contenus à zéro ou vides. La lecture du nœud existe pour plusieurs d'entre eux (`l2Book`, `openOrders`, `vaultDetails`) — seule la *traduction* dans la passerelle est en attente ; pour les autres, l'appui sur le nœud lui-même est en attente.

#### `l2Book`

```json
{"type":"l2Book","coin":"BTC"}
```

```json
{
  "coin": "BTC",
  "levels": [ [ /* bids */ ], [ /* asks */ ] ],
  "time": 0
}
```

`levels` est un tuple `[bids, asks]` (forme HL) ; chaque niveau est `{"px":"...","sz":"...","n":N}`. S'appuie sur le nœud [`l2_book`](./info.md#l2_book) une fois la traduction câblée.

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

Chaque entrée `universe` (une fois la lecture de l'univers du nœud disponible) : `{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`.

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]` (forme tuple de HL). Le second élément est un `assetCtx`
par marché de contrats perpétuels, aligné sur les indices de `meta.universe`. Chaque `assetCtx` est alimenté
depuis l'état du marché en direct :

```json
{
  "dayNtlVlm":    "1850000.00",
  "prevDayPx":    "66800.00",
  "markPx":       "67042.50",
  "midPx":        "67042.33",
  "funding":      "0.0000125",
  "openInterest": "1250.5",
  "oraclePx":     "67040.00"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `dayNtlVlm` | chaîne décimale | Volume notionnel sur 24 heures, en **USD** |
| `prevDayPx` | chaîne décimale | Prix il y a 24h, en **USDC décimal** |
| `markPx` | chaîne décimale | Prix mark actuel, en **USDC décimal** |
| `midPx` | chaîne décimale | Milieu du carnet d'ordres actuel, en **USDC décimal** |
| `funding` | chaîne décimale | Taux de financement actuel (par intervalle) |
| `openInterest` | chaîne décimale | Intérêt ouvert, en unités de base |
| `oraclePx` | chaîne décimale | Dernier prix oracle / indice, en **USDC décimal** |

Tous les prix sont des chaînes USDC décimales (lisibles par l'humain), pas des entiers bruts.

#### `allMids`

```json
{"type":"allMids"}
```

Dictionnaire nom d'actif → prix médian : `{"BTC":"100.55","ETH":"3200.0"}`. Bouchon : `{}`.

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

Tableau de `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`. `side` : `"B"` (achat) / `"A"` (vente). `frontendOpenOrders` ajoute des champs UI (`triggerPx`, `isTrigger`, `isPositionTpsl`, `orderType`). S'appuie sur le nœud [`open_orders`](./info.md#open_orders). Bouchon : `[]`.

#### `vaultDetails`

```json
{"type":"vaultDetails","user":"0x..."}
```

```json
{
  "vaultAddress":     "0x...",
  "leader":           "0x...",
  "shares":           "0.0",
  "navUsd":           "0.0",
  "isPaused":         false,
  "managementFeeBps": 1000,
  "withdrawalLockMs": 345600000,
  "createdAtMs":      0,
  "followerCount":    0
}
```

Les vaults MetaFlux ne sont pas des vaults HL — même forme de requête, entités différentes (voir [vaults](../../concepts/vaults.md), [MIP-2](../../mip/mip-2.md)). S'appuie sur le nœud [`vault_state`](./info.md#vault_state) une fois le registre leader→`vault_id` câblé. `managementFeeBps` / `withdrawalLockMs` sont des nombres JSON bornés (HL conserve des nombres pour les paramètres, des chaînes pour les montants monétaires).

#### `referral`

```json
{
  "referredBy": null,
  "referrerState": {
    "cumVlm": "0.0",
    "cumRewardedFeesSinceReferred": "0.0",
    "cumFeesRewardedToReferrer": "0.0",
    "claimedRewards": "0.0"
  },
  "rewardHistory": []
}
```

`referredBy` vaut `null` (pas `{}`) — les clients HL distinguent « aucun référent jamais défini » de « défini mais inactif ». Le référent est immuable via `setReferrer`.

#### Autres bouchons

| Type | Réponse bouchon |
|------|-----------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### Types non encore servis

Ces types n'ont pas encore d'appui sur le nœud et renvoient la forme vide de HL aujourd'hui ; ils sont prévus pour l'indexeur de la passerelle (feuille de route) :

| Type | Bouchon vide | Notes |
|------|--------------|-------|
| `historicalOrders` | `[]` | liste des ordres en état terminal |
| `candleSnapshot` | `[]` | historique OHLCV (utiliser le canal WS [`candle`](../ws/subscriptions.md) pour les barres en direct) |
| `userFunding` / `userFundings` | `[]` | historique des paiements de financement par utilisateur |

`userFills` / `userFillsByTime` et `fundingHistory` sont désormais **câblés** à l'état du nœud en direct — voir le [tableau de traduction](#hl-info-type--type-natif-mtf-du-nœud) ci-dessus. La forme d'un enregistrement de remplissage HL : `{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`.

### Erreurs sur `/info`

| HTTP | Corps | Cause |
|------|-------|-------|
| 400 | `{"error":"missing field \`type\`"}` | Pas de discriminant `type` |
| 400 | `{"error":"unknown request type: <X>"}` | `type` mal orthographié ou non pris en charge |
| 400 | `{"error":"missing field user"}` | `user` requis omis |
| 400 | `{"error":"invalid user address: <X>"}` | `user` différent de `0x` + 40 hex |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` sans `coin` |
| 502 | `{"error":"<node error>"}` | Type câblé dont le backhaul vers le nœud a échoué (transport/5xx) |

Le `/info` de HL utilise des codes de statut HTTP standard avec `{"error":...}` (contrairement à `/exchange` qui utilise l'enveloppe 200-avec-`status`).

---

## `/exchange` — chemin d'écriture

### Enveloppe de requête

```json
{
  "action":       { /* HL action object */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| Champ | Description |
|-------|-------------|
| `action` | Action au format HL (voir ci-dessous) |
| `nonce` | Unix ms, strictement croissant par signataire |
| `signature` | Objet RSV — trois chaînes hex + entier `v` (27/28 ou 0/1) |
| `vaultAddress` | `null` pour son propre compte ; `"0x<vault>"` pour agir en tant que gestionnaire de vault |

La signature porte sur l'enveloppe EIP-712 (voir le [guide de signature](../../integration/signing.md)) en utilisant le domaine **MetaFlux** (`chainId = 31337` devnet / `114514` testnet / `8964` mainnet — voir [réseaux](../../networks.md)). Le `chainId` doit être égal au `chain_id` de consensus du nœud (interroger [`/info` `node_info`](./info.md#node_info)).

### Enveloppe de réponse

Les écritures utilisent la convention HL `{"status":"ok"|"err","response":<...>}` (les erreurs sont des 200) :

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

### Types d'actions pris en charge

| `action.type` | Statut | Notes |
|---------------|--------|-------|
| `order` | pris en charge | limite / IOC / ALO ; ensemble TIF complet |
| `cancel` | pris en charge | par `oid` |
| `cancelByCloid` | en déploiement | par `cloid` |
| `modify` / `batchModify` | en déploiement | annuler-remplacer |
| `scheduleCancel` | en déploiement | interrupteur de sécurité automatique |
| `updateLeverage` / `updateIsolatedMargin` | en déploiement | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | en déploiement | transferts |
| `withdraw3` | en déploiement | retrait externe (MetaBridge) |
| `approveAgent` | en déploiement | approbation de portefeuille agent |
| `vaultTransfer` / `subAccountTransfer` | en déploiement | mouvement de fonds |
| `setReferrer` / `convertToMultiSigUser` | en déploiement | — |
| `twapOrder` / `twapCancel` | en déploiement | — |
| (tout le reste livré par HL) | renvoie `{"status":"err","response":"unimplemented action: <type>"}` | Utiliser [MTF-natif](./exchange.md) pour ceux-là |

### Exemple `order`

```json
{
  "action": {
    "type": "order",
    "orders": [
      { "a": 0, "b": true, "p": "100.5", "s": "1.0", "r": false, "t": { "limit": { "tif": "Gtc" } } }
    ],
    "grouping": "na"
  },
  "nonce": 1735689600000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Abréviations de champs (convention HL) : `a`=id d'actif · `b`=is_buy · `p`=prix limite · `s`=taille · `r`=reduce_only · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=`cloid` optionnel sur 16 octets.

Ordres déclencheurs : `"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`.

### Réponse `order`

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

Statut par ordre (un par entrée dans `orders[]`, dans l'ordre) :

| Variante | Signification |
|----------|---------------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | Posté dans le carnet |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | Rempli immédiatement |
| `{"error":"<reason>"}` | Cette entrée rejetée (les autres peuvent réussir) |

### Exemple `cancel`

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Réponse : `{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`. Par entrée d'annulation : `"success"` ou `{"error":"<reason>"}`.

### Erreurs sur `/exchange`

| Corps | Cause |
|-------|-------|
| `{"status":"err","response":"signature_invalid"}` | Adresse récupérée ≠ signataire / mauvais chainId |
| `{"status":"err","response":"unimplemented action: <type>"}` | La surface de compatibilité ne couvre pas encore cette action |
| `{"status":"err","response":"nonce too small"}` | Nonce réutilisé |
| `{"status":"err","response":"agent_not_approved"}` | Agent signataire mais pas d'approbation existante |

---

## Différences avec HL à connaître

Voir [migrer depuis HL](../../integration/migrating-from-hl.md) pour la référence complète. Points essentiels :

- **`chainId`** dans le domaine de signature est celui de MetaFlux (`31337` devnet / `114514` testnet / `8964` mainnet), PAS celui de HL (`998`/`999`).
- **Les IDs d'actifs ne sont pas numériquement identiques** à ceux de HL. À consulter via `info { "type": "meta" }` une fois cette lecture câblée ; ne jamais les coder en dur.
- **Le palier de liquidation T0 yellow card** existe sur MTF (entre sain et la « Liquidation Partielle » de HL). Les bots qui surveillent les événements de liquidation voient un type d'événement supplémentaire.
- **Les types d'actions HL au-delà de `order` / `cancel`** renvoient `err` pendant le déploiement. Utiliser [`POST /exchange`](./exchange.md) natif MTF, ou attendre.
- **Les lectures détaillées** `userFills` / `userFillsByTime` / `fundingHistory` sont désormais servies en direct depuis l'état validé du nœud. Les lectures d'historique restantes (`historicalOrders`, `candleSnapshot`, `userFunding`) ne sont pas encore servies — prévues pour l'indexeur de la passerelle (feuille de route). Utiliser en attendant les canaux WS [`userFills`](../ws/subscriptions.md) / [`candle`](../ws/subscriptions.md) pour les données en direct.

## Voir aussi

- [`POST /info`](./info.md) — lectures natives MTF du nœud dont sont issues ces traductions HL
- [`POST /exchange`](./exchange.md) — chemin d'écriture natif MTF
- [CCXT-compat](./ccxt-compat.md) — l'autre surface de compatibilité
- [Migrer depuis HL](../../integration/migrating-from-hl.md) · [Guide de signature](../../integration/signing.md) · [Erreurs](../errors.md)
