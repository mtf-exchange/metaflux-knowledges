---
description: "Requêtes en lecture POST /info pour les marchés perpétuels — informations sur les marchés, carnets d'ordres, transactions, financement, liquidation et état de déploiement des contrats perpétuels."
---

# `POST /info` — requêtes perpétuelles

Requêtes en lecture pour les marchés **perpétuels**. Même point de terminaison `POST /info`, enveloppe et conventions que la [page de base](../info.md) — ce sont les `type`s spécifiques aux marchés perpétuels. (Les lectures du carnet d'ordres, des transactions et des bougies servent également les paires au comptant par identifiant `pair`.)

## Types de requêtes perpétuelles

### `market_info`

Métadonnées par marché.

```json
{ "type": "market_info", "asset_id": 0 }
```

Ou par nom :

```json
{ "type": "market_info", "coin": "BTC" }
```

Réponse :

```json
{
  "type": "market_info",
  "data": {
    "asset_id":        0,
    "name":            "BTC",
    "kind":            "perp",
    "sz_decimals":     5,
    "mark_px":         "67079.265",
    "oracle_px":       "67073.35",
    "mid_px":          "67079.27",
    "premium":         "0.0015",
    "tick_size":       "1000000",
    "step_size":       "1",
    "min_order":       "1",
    "max_leverage":    50,
    "maint_margin_ratio": "300",
    "init_margin_ratio":  "200",
    "funding": {
      "rate_per_hr":  "0",
      "cap_per_hr":   "400",
      "interval_ms":     3600000,
      "next_payment_ts": 0
    },
    "mark_source": "MedianOfOraclesAndMid",
    "fba_enabled": false,
    "open_interest": "0"
  }
}
```

:::info
**Plan de communication des prix.** Dans cette lecture, `mark_px` et `oracle_px` sont exprimés dans le **plan décimal USDC entier** (en dollars lisibles par l'humain — `"67079.265"` / `"67073.35"`), la même unité que le mark des positions du compte. `mark_px` est le mark du carnet mis à l'échelle à partir de la représentation en virgule fixe 1e8 interne du moteur, avec repli sur `oracle_px` lorsque le carnet n'a pas encore de mark ; `oracle_px` est le dernier prix d'index validé. L'un ou l'autre vaut `"0"` s'il n'est pas défini. Notez que le **plan de soumission des ordres/carnets reste en virgule fixe 1e8** — les prix de niveau `l2_book` et `limit_px` des ordres ne sont PAS en USDC entier ; MTF maintient ces deux plans d'échelle distincts, et seules les lectures destinées à l'humain (`market_info`, `markets`, positions) rapportent les prix en USDC entier. La sémantique des champs pour le reste de l'enregistrement se trouve dans le tableau [`markets`](#markets) ci-dessous.
:::

:::info
**Précision des prix vs `sz_decimals`.** `mark_px` et `oracle_px` sont **arrondis au tick de prix du marché** (`tick_size`, tronqué vers zéro), de sorte qu'une lecture n'affiche jamais de bruit sous le tick — avec un tick de `$0,01` (`tick_size: "1000000"` dans le plan 1e8), `66735.255` est rapporté comme `"66735.25"`. Notez que `sz_decimals` représente la précision de la **TAILLE** (granularité de la quantité d'ordre — `5` ⇒ `0,00001` unités), il ne régit **pas** les décimales de prix ; c'est le tick de prix qui le fait. Les deux sont des axes indépendants (même séparation qu'HL utilise).
:::

### `markets`

Tous les marchés perpétuels MIP-3 enregistrés, en un seul appel. Aucun paramètre.

```json
{ "type": "markets" }
```

La charge utile `data` est un **tableau** du même enregistrement riche par marché que
[`market_info`](#market_info) retourne pour un seul actif. Les enregistrements sont ordonnés
de manière déterministe par `asset_id` croissant (le nœud itère la
`BTreeMap` `mip3_market_specs`). Un univers vide retourne `"data": []`.

Réponse :

```json
{
  "type": "markets",
  "data": [
    {
      "asset_id":        0,
      "name":            "BTC",
      "kind":            "perp",
      "sz_decimals":     5,
      "mark_px":         "67042.335",
      "oracle_px":       "67042.335",
      "mid_px":          "67042.33",
      "premium":         "0.0015",
      "tick_size":       "1000000",
      "step_size":       "1",
      "min_order":       "1",
      "max_leverage":    50,
      "maint_margin_ratio": "300",
      "init_margin_ratio":  "200",
      "funding": {
        "rate_per_hr":  "0",
        "cap_per_hr":   "400",
        "interval_ms":     3600000,
        "next_payment_ts": 0
      },
      "mark_source": "MedianOfOraclesAndMid",
      "fba_enabled": false,
      "open_interest": "0"
    }
  ]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `asset_id` | uint32 | Identifiant canonique de l'actif (clé de tri) |
| `name` | string | Symbole du marché, ex. `"BTC"` |
| `kind` | `"perp"` | Type de marché (en minuscules) |
| `sz_decimals` | uint8 | Décimales d'affichage de la taille (issues du registre de tokens au comptant sous-jacent ; `0` si aucune spécification de token) |
| `mark_px` | Decimal string | Mark du carnet, **plan USDC entier** (mark du carnet mis à l'échelle hors de 1e8, repli oracle ; `"0"` si non défini) |
| `oracle_px` | Decimal string | Prix d'index, **plan USDC entier** (`"0"` si non défini) |
| `mid_px` | Decimal string \| null | Milieu réel du carnet d'ordres `(meilleure enchère + meilleure offre) / 2`, **plan USDC entier** (arrondi au tick) ; `null` lorsque le carnet est unilatéral / vide |
| `premium` | Decimal string \| null | Dernier échantillon de prime de financement validé (signé) ; `null` lorsqu'aucun échantillon n'existe |
| `tick_size` | i128 string | Incrément de prix minimum, **virgule fixe 1e8** (plan de soumission des ordres/carnets) |
| `step_size` | u128 string | Incrément de taille minimum (taille de lot), virgule fixe |
| `min_order` | u128 string | Taille minimale d'un ordre |
| `max_leverage` | uint8 | Effet de levier maximum |
| `maint_margin_ratio` | bps string | Ratio de marge de maintenance, bps décimal |
| `init_margin_ratio` | bps string | Ratio de marge initiale (`1 / max_leverage`), bps décimal |
| `funding.rate_per_hr` | bps string | Dernier échantillon de prime de financement, bps décimal |
| `funding.cap_per_hr` | bps string | Plafond du taux de financement par heure, bps décimal |
| `funding.interval_ms` | uint64 | Cadence de financement (1h = `3600000`) |
| `funding.next_payment_ts` | uint64 | Horodatage du prochain paiement de financement (`0` jusqu'à l'existence d'un échantillon) |
| `mark_source` | string | Descripteur du prix mark (`"MedianOfOraclesAndMid"`) |
| `fba_enabled` | bool | Vente aux enchères par lots fréquente activée pour ce marché |
| `open_interest` | u128 string | Intérêt ouvert actuel, virgule fixe |

Chaque élément est identique octet par octet à l'enregistrement `data` de la réponse `market_info` pour un seul actif correspondant — les deux sont construits à partir du même générateur d'enregistrements par marché, de sorte que les formes individuelles et globales ne divergent jamais. Voir [`market_info`](#market_info) pour la sémantique au niveau des champs et les notes de proxy FLAGGED (`mark_source`, `next_payment_ts`).

### `l2_book`

Niveaux d'enchères/offres agrégés par marché.

```json
{ "type": "l2_book", "market_id": 0 }
```

| Argument | Type | Requis |
|-----|------|----------|
| `market_id` | uint32 | oui |

Réponse :

```json
{
  "type": "l2_book",
  "data": {
    "market_id": 0,
    "bids": [ { "px": "99000", "size": "700", "n_orders": 1 } ],
    "asks": [ { "px": "101000", "size": "750", "n_orders": 2 } ]
  }
}
```

Les enchères sont classées par meilleur prix en premier (prix décroissant), les offres par ordre croissant. Chaque niveau agrège la `size` cumulée et le nombre `n_orders` d'ordres en attente. Un marché inconnu / vide retourne des tableaux `bids` / `asks` vides.

| Champ | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Identifiant de marché répercuté |
| `bids[*].px` / `asks[*].px` | i128 string | Prix du niveau, chaîne décimale en virgule fixe |
| `bids[*].size` / `asks[*].size` | u128 string | Taille cumulée au niveau |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Ordres en attente au niveau |

### `recent_trades`

Bande de transactions publiques par marché, servie directement depuis l'état validé sur le nœud
(un anneau de transactions borné par marché intégré dans l'AppHash — pas d'indexeur externe).

```json
{ "type": "recent_trades", "market_id": 0 }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `market_id` | uint32 | oui | Identifiant d'actif / de marché |
| `limit` | uint32 | non | Limite le nombre d'enregistrements **les plus récents** retournés ; absent / `0` ⇒ l'anneau complet |

Réponse :

```json
{
  "type": "recent_trades",
  "data": {
    "market_id":      0,
    "last_trade_ms":  1700000000555,
    "trades": [
      {
        "coin":  0,
        "side":  "B",
        "px":    "67042.50",
        "sz":    "0.125",
        "time":  1700000000555,
        "tid":   90123,
        "block": 562,
        "hash":  "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
      }
    ]
  }
}
```

Les enregistrements sont ordonnés du plus ancien au plus récent (le plus récent en dernier). L'anneau est borné, il s'agit donc d'une fenêtre récente, pas de l'historique complet. Un marché inconnu / sans transaction retourne `"trades": []` et `last_trade_ms: 0`.

| Champ | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Identifiant de marché répercuté |
| `last_trade_ms` | uint64 | Horodatage de la dernière transaction (`0` si aucune) |
| `trades[*].coin` | uint32 | Identifiant d'actif / de marché sur lequel la transaction a été exécutée |
| `trades[*].side` | `"B"` / `"A"` | Côté du token preneur (agresseur) — `"B"` = achat, `"A"` = vente |
| `trades[*].px` | Decimal string | Prix d'exécution, **USDC décimal** (lisible par l'humain) |
| `trades[*].sz` | Decimal string | Taille exécutée, **unités de base** (unité entière) |
| `trades[*].time` | uint64 | Horodatage de la transaction (ms de consensus) |
| `trades[*].tid` | uint64 | Identifiant de transaction déterministe (partagé par les deux jambes de l'impression) |
| `trades[*].block` | uint64 | Hauteur de bloc validée dans laquelle la transaction a été réglée (localisateur on-chain) |
| `trades[*].hash` | hex string | Hash de transaction de l'ordre d'origine, hexadécimal préfixé `0x` — permet de tracer une impression on-chain |

### `candle`

Barres OHLCV historiques pour `(coin, interval)` sur une fenêtre temporelle. Le complément REST au canal WS [`candles`](../../ws/subscriptions.md#candles) en direct — le WS pousse la barre en formation au fur et à mesure des transactions, cette lecture retourne l'historique des barres fermées.

```json
{ "type": "candle", "coin": "BTC", "interval": "1m" }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `coin` | string | oui | Symbole du marché, ex. `"BTC"` |
| `interval` | string | oui | Jeton de bucket — l'un de `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | non | Début de fenêtre (ms) ; filtre sur l'ouverture de la barre. Par défaut `0` |
| `end_time` | uint64 | non | Fin de fenêtre (ms) ; filtre sur l'ouverture de la barre. Par défaut non borné |

Les arguments peuvent être passés à plat (ci-dessus) ou imbriqués sous un objet `req` ; `start_time` /
`end_time` acceptent également l'orthographe camelCase `startTime` / `endTime`. `coin` ou `interval` manquant → `400 {"error":"missing field <name>"}`.

Réponse :

```json
{
  "type": "candle",
  "data": [
    {
      "t": 1700000040000,
      "T": 1700000099999,
      "s": "BTC",
      "i": "1m",
      "o": "67000.00",
      "c": "67042.50",
      "h": "67080.00",
      "l": "66990.00",
      "v": "12.5",
      "q": "837843.75",
      "n": 37
    }
  ]
}
```

Les barres sont ordonnées du plus ancien au plus récent par `t` (heure d'ouverture) ; l'élément le plus récent est la barre en formation. Un tableau vide est la réponse honnêtement vide pour un jeton `interval` non pris en charge, un marché sans transactions indexées, ou un déploiement sans indexeur connecté.

| Champ | Type | Description |
|-------|------|-------------|
| `t` | uint64 | Horodatage d'**ouverture** de la barre (ms, aligné sur le bucket) |
| `T` | uint64 | Horodatage de **clôture** de la barre (ms) — `t + interval − 1` |
| `s` | string | Symbole de coin / marché |
| `i` | string | Jeton de bucket d'intervalle |
| `o` / `c` / `h` / `l` | Decimal string | Prix d'**o**uverture / de **c**lôture / le plus **h**aut / le plus **b**as, **USDC décimal** (en dollars lisibles par l'humain, ex. `"67042.50"`) |
| `v` | Decimal string | **Volume en actif de base** — Σ taille échangée dans la barre (taille en coin, PAS en notionnel) |
| `q` | Decimal string | **Volume en quote (USD)** — `Σ prix × taille` sur les exécutions de la barre |
| `n` | uint64 | Nombre de transactions (exécutions) dans la barre |

:::info
**La série est sans lacune.** Un intervalle **sans transaction** émet quand même une barre plate qui reporte la clôture de la barre précédente : `o = h = l = c = clôture précédente`, et `v = q = 0`, `n = 0`. Les consommateurs obtiennent une série continue de barres par intervalle sans trous à interpoler. **Aucune barre n'est émise avant la première transaction du marché** — la série commence au bucket de la première impression, donc un tableau vide signifie que le marché n'a jamais été tradé (ou qu'aucun historique n'est connecté), pas que les premiers buckets ont été supprimés.
:::

:::info
**Ce type est servi par la passerelle, pas par le nœud.** Les bougies sont des données d'affichage dérivées pliées depuis le flux de transactions publiques — elles ne constituent **pas** un état de chaîne validé, ne touchent jamais l'app-hash et ne comportent aucune garantie de consensus. La passerelle répond à `candle` depuis son propre store glissant ; un nœud nu interrogé directement retourne `unknown info type: candle`. Honnêtement vide (`"data": []`) lorsque la passerelle n'a pas encore d'historique de transactions pour le marché.
:::

### `funding_history`

Échantillons de prime de financement par marché.

```json
{ "type": "funding_history", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Réponse :

```json
{
  "type": "funding_history",
  "data": {
    "market_id": 0,
    "samples": [
      { "ts_ms": 1700000000000, "premium": "0.0015", "funding_rate": "0.0015" },
      { "ts_ms": 1700000008000, "premium": "-0.0007", "funding_rate": "-0.0007" }
    ]
  }
}
```

Les échantillons constituent l'anneau ordonné d'instantanés de prime provenant du suivi de financement.
`premium` est la valeur `Decimal` exacte avant écrêtage, rendue sous forme de chaîne (signée, précision
complète) ; `funding_rate` est cette prime passée à travers le plafond de financement par actif
(`±funding_rate_cap`, la valeur de surpassement du risque dynamique ou le plancher de base `0.04`/h)
— c'est-à-dire le taux effectif qui serait réellement appliqué. Lorsque la prime est
dans les limites du plafond, `funding_rate == premium` ; au-delà, `funding_rate` est écrêté au
plafond signé. Un marché inconnu ou vide renvoie `"samples": []`.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Identifiant de marché renvoyé en écho |
| `samples[*].ts_ms` | uint64 | Horodatage de l'échantillon (ms de consensus) |
| `samples[*].premium` | decimal string | Échantillon de prime de financement brut, avant écrêtage (signé) |
| `samples[*].funding_rate` | decimal string | Taux effectif = `premium` écrêté au plafond par actif (signé) |

### `predicted_fundings`

Taux de financement prédit par marché et heure du prochain paiement, pour l'ensemble des marchés
de contrats perpétuels enregistrés. Aucun paramètre.

```json
{ "type": "predicted_fundings" }
```

La charge utile `data` est un **tableau**, trié de manière déterministe par ordre croissant
d'`asset` (le nœud parcourt la `BTreeMap` des spécifications de marché). Un univers vide renvoie
`"data": []`.

Réponse :

```json
{
  "type": "predicted_fundings",
  "data": [
    { "asset": 0, "predicted_rate": "0.0015", "next_funding_time": 1700003600000 }
  ]
}
```

`predicted_rate` est le dernier échantillon de prime (le proxy du taux par heure, chaîne décimale)
— `"0"` avant le premier échantillon. `next_funding_time` est l'horodatage du prochain paiement
dérivé (`last_sample_ts + 1h`), `0` avant le premier échantillon.

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Identifiant d'actif / de marché |
| `predicted_rate` | decimal string | Dernier échantillon de prime (proxy du taux par heure) ; `"0"` avant le premier échantillon |
| `next_funding_time` | uint64 | Horodatage du prochain paiement de financement (ms de consensus) ; `0` avant le premier échantillon |

### `mip3_active_bids`

Instantané de l'enchère au gaz pour le déploiement permissionless de contrats perpétuels MIP-3. Aucun paramètre.

```json
{ "type": "mip3_active_bids" }
```

Réponse :

```json
{
  "type": "mip3_active_bids",
  "data": {
    "auction_round":   2,
    "current_bid":     "12345",
    "current_winner":  "0x<bidder>",
    "auction_end_ms":  1700086400000,
    "started_at_ms":   1700000000000,
    "bids": [
      {
        "bidder":          "0x<bidder>",
        "amount":          "12345",
        "submitted_at_ms": 1700000000500,
        "tag":             "ETH-PERP"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Tour d'enchère en cours |
| `current_bid` | decimal string | Montant de l'offre en tête |
| `current_winner` | hex address \| null | Enchérisseur actuellement en tête, `null` si aucun |
| `auction_end_ms` | uint64 | Horodatage de clôture de l'enchère (ms de consensus) |
| `started_at_ms` | uint64 | Horodatage d'ouverture de l'enchère (ms de consensus) |
| `bids[*].bidder` | hex address | Adresse de l'enchérisseur |
| `bids[*].amount` | decimal string | Montant de l'offre |
| `bids[*].submitted_at_ms` | uint64 | Horodatage de soumission de l'offre (ms de consensus) |
| `bids[*].tag` | string | Libellé de l'offre (p. ex. le nom de marché proposé) |

### `liquidatable`

Comptes actuellement signalés pour liquidation. Aucun paramètre.

```json
{ "type": "liquidatable" }
```

Réponse :

```json
{
  "type": "liquidatable",
  "data": { "accounts": [ { "address": "0x<addr>", "tier": "PartialMarket50" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accounts[*].address` | hex address | Compte nécessitant une action |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | Niveau BOLE |

Source d'état : `Exchange.bole_index.tier` (l'index des actions requises BOLE — **non** un rescan complet des comptes).

> **SIGNALÉ.** `bole_index` est `#[serde(skip)]` un état dérivé non canonique, reconstruit par un scan complet lors de la première utilisation ou après le chargement d'un instantané. Sur un instantané fraîchement publié, il est vide jusqu'à ce que le moteur d'exécution ait effectué au moins une passe BOLE.

### `active_asset_data`

Effet de levier, mode de marge et taille de transaction maximale d'un utilisateur par actif. Requis : `address` (hex 0x) + `asset_id` (u32).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "asset_id": 0 }
```

Réponse :

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "asset_id": 0, "leverage": 7,
    "margin_mode": "isolated", "max_trade_size": "5000000000", "has_position": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `leverage` | uint32 | Effet de levier de la position si ouverte, sinon valeur par défaut du compte, sinon maximum du marché |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Mode de marge effectif |
| `max_trade_size` | decimal string | Plafond de taille de transaction maximale par actif (voir `max_market_order_ntls`) |
| `has_position` | bool | Indique si l'utilisateur détient une position non nulle sur cet actif |

Source d'état : `locus.clearinghouses[asset].positions[addr]`, `locus.user_account_configs[addr]`, spécification de marché / risque dynamique.

### `max_market_order_ntls`

Valeur notionnelle maximale des ordres au marché par actif. Aucun paramètre.

```json
{ "type": "max_market_order_ntls" }
```

Réponse :

```json
{
  "type": "max_market_order_ntls",
  "data": { "ntls": [ { "asset_id": 0, "max_market_order_ntl": "5000000000" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | Identifiant d'actif |
| `ntls[*].max_market_order_ntl` | decimal string | Plafond de taille dérivé du plafond d'intérêt ouvert |

Source d'état : `PerpAnnotation.oi_cap` par marché, sinon `default_mip3_limits.max_oi_per_market`.

> **SIGNALÉ.** Il n'existe pas de champ dédié « valeur notionnelle maximale d'un ordre au marché » par actif dans l'état validé ; le plafond d'intérêt ouvert (OI cap) est le plafond de risque validé le plus proche, exprimé en unités de **taille** (la couche de correspondance le convertit en notionnel au mark price en vigueur).

### `perps_at_open_interest_cap`

Actifs dont l'intérêt ouvert atteint ou dépasse le plafond. Aucun paramètre.

```json
{ "type": "perps_at_open_interest_cap" }
```

Réponse :

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `assets` | uint32[] | Identifiants d'actifs atteignant ou dépassant leur `oi_cap`, par ordre croissant |

Source d'état : `open_interest` par carnet d'ordres vs `PerpAnnotation.oi_cap` (les carnets sans plafond positif sont ignorés).

### `margin_table`

Le tableau des niveaux de marge (effet de levier → ratios de maintenance / initiale). Aucun paramètre.

```json
{ "type": "margin_table" }
```

Réponse :

```json
{
  "type": "margin_table",
  "data": { "tiers": [ { "asset_id": 0, "max_leverage": 50, "maint_margin_ratio": "300", "init_margin_ratio": "200" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tiers[*].asset_id` | uint32 | Identifiant d'actif |
| `tiers[*].max_leverage` | uint8 | Effet de levier maximal effectif (surpassement ou statique) |
| `tiers[*].maint_margin_ratio` | bps string | Ratio de marge de maintenance (surpassement ou plancher statique de 3 %) |
| `tiers[*].init_margin_ratio` | bps string | `1 / max_leverage` |

Source d'état : `dynamic_risk_overrides[asset]` sinon le référentiel statique.

> **SIGNALÉ.** L'état validé stocke un seul niveau de risque effectif par marché (surpassement ou statique), et non l'échelle de levier multi-paliers servie par HL. Le proxy est un niveau par marché — la ligne que le moteur applique à ce jour.

### `perp_dexs`

Liste le ou les DEX perpétuels. Aucun paramètre.

```json
{ "type": "perp_dexs" }
```

Réponse :

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | Index du DEX dans `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Nombre de carnets d'actifs dans le DEX |
| `dexs[*].assets` | uint32[] | Identifiants d'actifs présents dans le DEX |

Source d'état : `Exchange.perp_dexs`.


## Voir aussi

- [`POST /info`](../info.md) — le point d'entrée de lecture de base (enveloppe, conventions, requêtes de compte et d'infrastructure)
- [Requêtes Spot et marge](./spot.md) — lectures spot / marge spot / Earn
- [Contrats perpétuels](../../../products/perpetuals.md) — le produit
