---
description: "Requêtes en lecture POST /info pour les marchés perpétuels — informations sur les marchés, carnets d'ordres, transactions, financement, liquidation et état de déploiement des contrats perpétuels."
---

# `POST /info` — requêtes perpétuelles

Requêtes en lecture pour les marchés **perpétuels**. Même point de terminaison `POST /info`, enveloppe et conventions que la [page de base](../info.md) — ce sont les `type`s spécifiques aux marchés perpétuels.

:::info
**Les marchés sont indexés par `coin` (symbole).** Chaque lecture liée à un
marché (`market_info`, `l2_book`, `recent_trades`, `trades_by_time`,
`funding_history`, `oracle_sources`, `active_asset_data`, `fba_batch_state`, …)
résout le marché par son **symbole `coin`** (`"BTC"`, `"ETH"`, …). Les anciens
arguments numériques `asset_id` / `market_id` ont été **supprimés** — une
requête qui les fournit (et omet `coin`) est rejetée avec
`400 {"error":"missing field coin"}`. Ces lectures de marché renvoient le
symbole `coin` en écho dans leurs réponses. (Seul le chemin d'écriture signé
`/exchange` adresse encore les marchés par `asset` numérique — ce champ est
figé par le consensus ; voir [`POST /exchange`](../exchange.md).)
:::

## Types de requêtes perpétuelles {#perpetual-query-types}

### Obtenir les métadonnées d'un marché {#market_info}

Métadonnées par marché. Résout le marché par son symbole `coin`.

```json
{ "type": "market_info", "coin": "BTC" }
```

| Argument | Type | Requis |
|-----|------|----------|
| `coin` | symbol | oui |

`coin` manquant → `400 {"error":"missing field coin"}` ; symbole inconnu →
`404 {"error":"market not found"}`.

Réponse :

```json
{
  "type": "market_info",
  "data": {
    "coin":               "BTC",
    "kind":               "perp",
    "sz_decimals":        5,
    "mark_px":            "61550.2",
    "oracle_px":          "61501.7",
    "mid_px":             "61669.4",
    "premium":            "0.00209225",
    "tick_size":          "0.1",
    "step_size":          "0.00001",
    "min_order":          "0.00001",
    "max_leverage":       50,
    "maint_margin_ratio": "1320",
    "init_margin_ratio":  "200",
    "margin_tiers": [
      { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
      { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
      { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
      { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
    ],
    "funding": {
      "rate_per_hr":     "21",
      "cap_per_hr":      "1120",
      "interval_ms":     3600000,
      "next_payment_ts": 1783011600000
    },
    "mark_source":   "oracle_median",
    "fba_enabled":   false,
    "open_interest": "0.02346",
    "day_ntl_vlm":   "3772.890084",
    "change_24h":    "-0.00274143",
    "prev_day_px":   "61719.4",
    "disable_open":  false,
    "disable_close": false,
    "halted":        false,
    "strict_isolated": false,
    "asset_id":      0
  }
}
```

:::warning
**`asset_id` est DÉPRÉCIÉ.** Il n'est conservé temporairement que comme
commodité de compatibilité pour l'indexeur — ne vous **appuyez pas** dessus,
et ne l'utilisez **pas** comme argument de requête (il n'est plus accepté).
Adressez les marchés par `coin` partout. Il peut être supprimé sans
incrément de version de protocole.
:::

:::info
**Plan de communication des prix.** `mark_px`, `oracle_px`, `mid_px`,
`tick_size`, `step_size` et `min_order` sont exprimés dans le **plan décimal
lisible par l'humain** (`"61550.2"`, `"0.1"`, `"0.00001"`), la même unité que
le mark des positions du compte. `mark_px` est le mark du carnet, avec repli
sur le prix oracle lorsque le carnet n'a pas encore de mark ; `oracle_px` est
le dernier prix d'index validé ; l'un ou l'autre vaut `"0"` s'il n'est pas
défini. Le **plan de soumission des ordres/carnets est un plan distinct en
virgule fixe 1e8** — le `px` de niveau `l2_book` et le `limit_px` d'un ordre
sont des grandeurs 1e8 brutes, PAS des décimales lisibles par l'humain ; MTF
maintient ces deux plans d'échelle distincts.
:::

:::info
**`margin_tiers` — l'échelle de levier par paliers notionnels, en ligne.**
`market_info` (et chaque ligne de [`markets`](#markets)) transporte l'échelle
de marge de maintenance du marché **en ligne** sous forme de `margin_tiers` —
une liste ascendante de paliers à borne supérieure :

- `max_open_interest` — **borne supérieure** du palier (chaîne décimale, dans
  les unités de taille du marché) ; `null` marque le **palier supérieur non
  borné**.
- `max_leverage` — effet de levier maximal autorisé tant que l'intérêt ouvert
  se situe dans ce palier (`u8`).
- `maint_margin_ratio` — ratio de marge de maintenance du palier, **chaîne
  bps décimale** (`"100"` = 1,00 %).

Le palier d'une position est le premier dont la borne `max_open_interest`
n'est pas dépassée par son intérêt ouvert (le palier supérieur `null` capte
tout ce qui dépasse la dernière borne finie). L'effet de levier diminue et le
ratio de maintenance augmente à mesure que l'intérêt ouvert croît. Ceci
remplace la requête autonome `margin_table`, désormais supprimée — l'échelle
est portée directement par l'enregistrement du marché.
:::

:::info
**Précision des prix vs `sz_decimals`.** `sz_decimals` est la précision de la
**TAILLE** (granularité de la quantité d'ordre — `5` ⇒ `0,00001` unités) ;
elle ne régit **pas** les décimales de prix, qui sont fixées par le tick de
prix (`tick_size`). Les deux sont des axes indépendants.
:::

`market_info` retourne l'enregistrement **complet** — l'union des champs
**dynamiques** servis par [`markets`](#markets) (`mark_px`, `oracle_px`,
`mid_px`, `premium`, `funding`, `open_interest`, `day_ntl_vlm`, `prev_day_px`,
`change_24h`, `halted`) et des champs **statiques** servis par
[`markets_meta`](#markets_meta) (`sz_decimals`, `tick_size`, `step_size`,
`min_order`, `max_leverage`, les ratios de marge, `margin_tiers`,
`strict_isolated`, `disable_open` / `disable_close`, `mark_source`,
`fba_enabled`, `asset_id`). Voir ces deux lectures pour la sémantique de
chaque champ.

### Obtenir l'état en direct de tous les marchés {#markets}

L'état **en direct (dynamique)** de chaque marché enregistré — les champs qui
évoluent à chaque bloc (prix mark / oracle / mid, prime de financement,
intérêt ouvert, le ticker glissant sur 24h, `halted`) plus les clés de
jointure `(coin, kind)` — accompagné du registre des paires/tokens au
comptant. Les métadonnées **statiques** de longue durée (grilles de
précision, échelles de levier/marge, source du mark, indicateurs de contrôle
des transactions) sont servies séparément par
[`markets_meta`](#markets_meta) ; [`market_info`](#market_info) retourne les
deux moitiés pour un seul coin.

```json
{ "type": "markets" }
```

Filtrer sur un seul produit avec `kind` (absent ⇒ les deux sections) :

```json
{ "type": "markets", "kind": "perp" }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | non | Filtre de section — absent = les deux ; `"perp"` = uniquement le tableau perp ; `"spot"` = uniquement la section spot |

La charge utile `data` est un **objet** contenant un tableau `perp` (chaque
ligne étant **dynamique**) et un objet `spot` `{pairs, tokens}`. Les lignes
`perp` sont ordonnées de manière déterministe par identifiant de marché
croissant ; `spot.pairs` / `spot.tokens` par ordre d'identifiant de
paire/token.

Réponse (tronquée à une entrée par liste) :

```json
{
  "type": "markets",
  "data": {
    "perp": [
      {
        "coin":            "BTC",
        "kind":            "perp",
        "mark_px":         "61521.1",
        "oracle_px":       "61529.3",
        "mid_px":          "61669.4",
        "premium":         "0.0018587",
        "funding": {
          "rate_per_hr":     "20",
          "cap_per_hr":      "1120",
          "interval_ms":     3600000,
          "next_payment_ts": 1783011600000
        },
        "open_interest":   "0.02346",
        "day_ntl_vlm":     "3772.890084",
        "prev_day_px":     "61719.4",
        "change_24h":      "-0.00300293",
        "halted":          false
      }
    ],
    "spot": {
      "pairs": [
        {
          "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "active": true, "mark_px": "50000", "mid_px": "50000", "prev_day_px": null,
          "day_ntl_vlm": "0", "min_notional": "1", "taker_fee_bps": "5",
          "circulating_supply": "0"
        }
      ],
      "tokens": [
        {
          "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6,
          "is_canonical": true, "evm_contract": null,
          "system_address": "0x80abd3bd8c42d2a279e4fa00f20bb30637734371",
          "token_id": "0xf23ea17597e324c04f842e6d8bfffe75636f0af88e7c7ab93ea755d9056396bc"
        }
      ]
    }
  }
}
```

Chaque ligne `perp` est la moitié **dynamique** du paquet
[`market_info`](#market_info) — construite par le même générateur, de sorte
que les deux ne divergent jamais ; la contrepartie **statique** se trouve
dans [`markets_meta`](#markets_meta), jointe sur `(coin, kind)`. `mid_px` est
**omis** d'une ligne lorsque le carnet est unilatéral (jamais envoyé comme
`null`). Le canal WS en direct
[`markets`](../../ws/subscriptions.md#markets) diffuse ces mêmes lignes
dynamiques (un instantané complet lors de l'abonnement, puis des deltas des
lignes modifiées).

| Champ | Type | Description |
|-------|------|-------------|
| `perp[*].coin` | string | Symbole du marché, ex. `"BTC"` (la clé de jointure) |
| `perp[*].kind` | `"perp"` | Type de marché (en minuscules, clé de jointure) |
| `perp[*].mark_px` | Decimal string | Mark du carnet, **plan décimal lisible par l'humain**, arrondi au tick (repli oracle ; `"0"` si non défini) |
| `perp[*].oracle_px` | Decimal string | Prix d'index, plan décimal lisible par l'humain, arrondi au tick (`"0"` si non défini) |
| `perp[*].mid_px` | Decimal string | Milieu du carnet `(meilleure enchère + meilleure offre) / 2`, décimal lisible par l'humain, arrondi au tick ; **omis** si unilatéral / vide |
| `perp[*].premium` | Decimal string \| null | Dernier échantillon de prime de financement validé (signé), chaîne à **8 décimales** (tronquée vers zéro) ; `null` si aucun |
| `perp[*].funding.rate_per_hr` | bps string | Dernier échantillon de taux de financement horaire (avant plafond), bps décimal |
| `perp[*].funding.cap_per_hr` | bps string | Plafond horaire du taux de financement, bps décimal |
| `perp[*].funding.interval_ms` | uint64 | Cadence de financement par actif (1h = `3600000`) |
| `perp[*].funding.next_payment_ts` | uint64 | Prochaine échéance de règlement de financement alignée (ms epoch) ; `0` jusqu'au premier échantillon |
| `perp[*].open_interest` | Decimal string | Intérêt ouvert actuel (unités de taille) |
| `perp[*].day_ntl_vlm` | Decimal string | Volume notionnel sur 24h |
| `perp[*].prev_day_px` | Decimal string \| null | Prix il y a 24h ; `null` si inconnu |
| `perp[*].change_24h` | Decimal string \| null | Variation de prix sur 24h (fraction, signée) ; `null` en l'absence de prix antérieur |
| `perp[*].halted` | bool | Marché suspendu |
| `spot.pairs` | array | Registre des paires au comptant (mêmes lignes que [`spot_meta`](./spot.md#spot_meta) `pairs`, plus `mark_px` / `mid_px` / `day_ntl_vlm` en direct) |
| `spot.tokens` | array | Registre des tokens au comptant (mêmes lignes que [`spot_meta`](./spot.md#spot_meta) `tokens`) |

Les champs **statiques** par marché (`sz_decimals`, `tick_size`, `step_size`,
`min_order`, `max_leverage`, `maint_margin_ratio`, `init_margin_ratio`,
`margin_tiers`, `strict_isolated`, `disable_open` / `disable_close`,
`mark_source`, `fba_enabled`, `asset_id`) ne figurent **pas** dans cette
lecture — récupérez-les depuis [`markets_meta`](#markets_meta). Pour la
sémantique des champs de paire/token au comptant, voir
[`spot_meta`](./spot.md#spot_meta).

### Obtenir les métadonnées statiques de tous les marchés {#markets_meta}

Les métadonnées **statiques** de chaque marché enregistré — les champs de
longue durée qu'un marché publie une seule fois et modifie rarement (grilles
de précision, échelles de levier/marge, indicateurs de contrôle des
transactions, source du mark) plus les clés de jointure `(coin, kind)` —
accompagnées du registre des paires/tokens au comptant. C'est la contrepartie
statique de [`markets`](#markets) : les deux moitiés couvrent ensemble tous
les champs que retourne [`market_info`](#market_info), de sorte qu'un client
peut mettre en cache la moitié statique et ne sonder que la moitié dynamique
[`markets`](#markets). Même filtre optionnel `kind`.

```json
{ "type": "markets_meta" }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | non | Filtre de section — absent = les deux ; `"perp"` = uniquement le tableau perp ; `"spot"` = uniquement la section spot |

La charge utile `data` est un **objet** contenant un tableau `perp` (chaque
ligne étant **statique**) et le même objet `spot` `{pairs, tokens}` que
retourne [`markets`](#markets). Les lignes `perp` sont ordonnées par
identifiant de marché croissant.

Réponse (perp tronqué à une entrée ; la section `spot` est identique à
[`markets`](#markets)) :

```json
{
  "type": "markets_meta",
  "data": {
    "perp": [
      {
        "coin":               "BTC",
        "kind":               "perp",
        "sz_decimals":        5,
        "tick_size":          "0.1",
        "step_size":          "0.00001",
        "min_order":          "0.00001",
        "max_leverage":       50,
        "maint_margin_ratio": "1320",
        "init_margin_ratio":  "200",
        "margin_tiers": [
          { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
          { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
          { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
          { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
        ],
        "strict_isolated": false,
        "disable_open":    false,
        "disable_close":   false,
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "asset_id":        0
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

Chaque ligne `perp` est la moitié **statique** du paquet
[`market_info`](#market_info), jointe à sa ligne dynamique
[`markets`](#markets) sur `(coin, kind)`. Aucun des champs dynamiques par
commit (`mark_px`, `oracle_px`, `mid_px`, `premium`, `funding`,
`open_interest`, `day_ntl_vlm`, `prev_day_px`, `change_24h`, `halted`)
n'apparaît ici.

| Champ | Type | Description |
|-------|------|-------------|
| `perp[*].coin` | string | Symbole du marché (la clé de jointure) |
| `perp[*].kind` | `"perp"` | Type de marché (en minuscules, clé de jointure) |
| `perp[*].sz_decimals` | uint8 | Décimales d'affichage de la taille |
| `perp[*].tick_size` | Decimal string | Incrément de prix minimum (décimal lisible par l'humain, ex. `"0.1"`) |
| `perp[*].step_size` | Decimal string | Incrément de taille minimum / taille de lot (décimal lisible par l'humain) |
| `perp[*].min_order` | Decimal string | Taille minimale d'un ordre (décimal lisible par l'humain) |
| `perp[*].max_leverage` | uint8 | Effet de levier maximal (le palier le plus haut de l'échelle de marge) |
| `perp[*].maint_margin_ratio` | bps string | Ratio de marge de maintenance de base, bps décimal |
| `perp[*].init_margin_ratio` | bps string | Ratio de marge initiale de base, bps décimal |
| `perp[*].margin_tiers` | array | Échelle de levier par paliers notionnels (voir [`market_info`](#market_info)) ; chaque palier `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`, paliers à borne supérieure ascendante, `null` = palier supérieur non borné |
| `perp[*].strict_isolated` | bool | Le marché impose une marge strict-isolated |
| `perp[*].disable_open` / `disable_close` | bool | Ouverture / clôture désactivée pour ce marché |
| `perp[*].mark_source` | string | Descripteur du prix mark (ex. `"oracle_median"`) |
| `perp[*].fba_enabled` | bool | Vente aux enchères par lots fréquente activée pour ce marché |
| `perp[*].asset_id` | uint32 | Champ de compatibilité indexeur **DÉPRÉCIÉ** — ne pas s'appuyer dessus |
| `spot.pairs` / `spot.tokens` | array | Registre des paires / tokens au comptant, identique à [`markets`](#markets) (voir [`spot_meta`](./spot.md#spot_meta)) |

Pour la sémantique des champs de paire/token au comptant, voir
[`spot_meta`](./spot.md#spot_meta).

### Obtenir les niveaux agrégés du carnet d'ordres {#l2_book}

Niveaux d'enchères/offres agrégés par marché.

```json
{ "type": "l2_book", "coin": "BTC" }
```

| Argument | Type | Requis |
|-----|------|----------|
| `coin` | symbol | oui |

`coin` manquant → `400 {"error":"missing field coin"}`.

Réponse :

```json
{
  "type": "l2_book",
  "data": {
    "coin": "BTC",
    "bids": [ { "px": "61663.1", "size": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "size": "0.04862", "n_orders": 1 } ]
  }
}
```

Les enchères sont classées par meilleur prix en premier (prix décroissant),
les offres par ordre croissant. Chaque niveau agrège la `size` cumulée et le
nombre `n_orders` d'ordres en attente. Un marché inconnu / vide retourne des
tableaux `bids` / `asks` vides.

| Champ | Type | Description |
|-------|------|-------------|
| `coin` | string | Symbole du marché renvoyé en écho |
| `bids[*].px` / `asks[*].px` | i128 string | Prix du niveau, chaîne décimale en virgule fixe (plan 1e8 ordres/carnet) |
| `bids[*].size` / `asks[*].size` | u128 string | Taille cumulée au niveau |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Ordres en attente au niveau |

### Obtenir les transactions publiques récentes {#recent_trades}

Bande de transactions publiques par marché, servie directement depuis
l'état validé sur le nœud (un anneau de transactions borné par marché
intégré dans l'AppHash — pas d'indexeur externe).

```json
{ "type": "recent_trades", "coin": "BTC" }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `coin` | symbol | oui | Symbole du marché |
| `limit` | uint32 | non | Limite le nombre d'enregistrements **les plus récents** retournés ; absent / `0` ⇒ l'anneau complet |

Réponse :

```json
{
  "type": "recent_trades",
  "data": {
    "coin":           "BTC",
    "last_trade_ms":  1783001424768,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783001424768,
        "tid":   17691615279761551171,
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

Les enregistrements sont ordonnés du plus ancien au plus récent (le plus
récent en dernier). L'anneau est borné, il s'agit donc d'une fenêtre récente,
pas de l'historique complet. Un marché inconnu / jamais tradé retourne
`"trades": []` et `last_trade_ms: 0`.

| Champ | Type | Description |
|-------|------|-------------|
| `coin` | string | Symbole du marché renvoyé en écho |
| `last_trade_ms` | uint64 | Horodatage de la dernière transaction (`0` si aucune) |
| `trades[*].coin` | string | Symbole du marché sur lequel la transaction a été exécutée |
| `trades[*].side` | `"B"` / `"A"` | Côté du token preneur (agresseur) — `"B"` = achat, `"A"` = vente |
| `trades[*].px` | Decimal string | Prix d'exécution, **USDC décimal** (lisible par l'humain) |
| `trades[*].sz` | Decimal string | Taille exécutée, **unités de base** (unité entière) |
| `trades[*].time` | uint64 | Horodatage de la transaction (ms de consensus) |
| `trades[*].tid` | uint64 | Identifiant de transaction déterministe (partagé par les deux jambes de l'impression) ; peut dépasser 2⁵³ — à analyser comme un entier 64 bits / big integer, pas comme un nombre JS |
| `trades[*].block` | uint64 | Hauteur de bloc validée dans laquelle la transaction a été réglée (localisateur on-chain) |
| `trades[*].hash` | hex string | Hash de transaction de l'ordre d'origine, hexadécimal préfixé `0x` — permet de tracer une impression on-chain |

### Obtenir les transactions sur une fenêtre temporelle {#trades_by_time}

Comme [`recent_trades`](#recent_trades), mais filtré sur une fenêtre
`[start_time, end_time]` au sein de l'anneau de transactions par marché — la
fenêtre récente bornée. Pour un historique plus profond au-delà de l'anneau,
utilisez les types d'archive de la passerelle.

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `coin` | symbol | oui | Symbole du marché |
| `start_time` | uint64 | non | Début de fenêtre (ms, inclusif) ; filtre sur `time` de la transaction. Absent ⇒ borne inférieure ouverte |
| `end_time` | uint64 | non | Fin de fenêtre (ms, inclusif). Absent ⇒ borne supérieure ouverte |

Réponse :

```json
{
  "type": "trades_by_time",
  "data": {
    "coin":       "BTC",
    "start_time": 1783000000000,
    "end_time":   1783011600000,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783000781368,
        "tid":   4898317237641214538,
        "block": 37692,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

`trades` utilise la même forme par transaction que
[`recent_trades`](#recent_trades), du plus ancien au plus récent. `start_time`
/ `end_time` sont renvoyés en écho (chacun `null` si omis). Un marché hors
fenêtre / jamais tradé retourne `"trades": []`.

### Obtenir des bougies OHLCV historiques {#candle_snapshot}

Barres OHLCV historiques pour `(coin, interval)`. La requête unique de
bougies (le type autonome `candle` a été **supprimé**) : priorité à
l'archive — servie depuis l'archive lorsqu'elle est connectée, avec repli
sur des barres pliées depuis le flux de transactions publiques sinon. Le
complément REST au canal WS
[`candles`](../../ws/subscriptions.md#candles) en direct.

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `coin` | symbol | oui | Symbole du marché, ex. `"BTC"` |
| `interval` | string | oui | Jeton de bucket — l'un de `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | non | Début de fenêtre (ms) ; filtre sur l'ouverture de la barre. Par défaut `0` |
| `end_time` | uint64 | non | Fin de fenêtre (ms) ; filtre sur l'ouverture de la barre. Par défaut non borné |

`coin` manquant → `400 {"error":"missing field coin"}` ; `interval` manquant
→ `400 {"error":"missing field interval"}`.

Réponse :

```json
{
  "type": "candle_snapshot",
  "data": {
    "candles": [
      {
        "t": 1783000020000,
        "T": 1783000080000,
        "i": "1m",
        "o": "6164610000000",
        "c": "6165270000000",
        "h": "6165270000000",
        "l": "6164610000000",
        "v": "576",
        "n": 24
      }
    ]
  }
}
```

Les barres sont ordonnées du plus ancien au plus récent par `t` (heure
d'ouverture) ; l'élément le plus récent est la barre en formation. Un
tableau `candles` vide est la réponse honnêtement vide pour un marché sans
historique (ou sans source d'archive/de pliage connectée).

| Champ | Type | Description |
|-------|------|-------------|
| `t` | uint64 | Horodatage d'**ouverture** de la barre (ms, aligné sur le bucket) |
| `T` | uint64 | Horodatage de **clôture** de la barre (ms) |
| `i` | string | Jeton de bucket d'intervalle |
| `o` / `c` / `h` / `l` | Decimal string | Prix d'**o**uverture / de **c**lôture / le plus **h**aut / le plus **b**as, chaîne en **virgule fixe 1e8** (ex. `"6165270000000"` = `61652.7`) |
| `v` | Decimal string | **Volume en actif de base** — Σ taille échangée dans la barre (unités de taille, PAS le notionnel) |
| `n` | uint64 | Nombre de transactions (exécutions) dans la barre |

### Obtenir l'historique de la prime de financement {#funding_history}

Échantillons de prime de financement par marché (l'anneau de primes).

```json
{ "type": "funding_history", "coin": "BTC" }
```

| Argument | Type | Requis | Description |
|-----|------|----------|-------------|
| `coin` | symbol | oui | Symbole du marché |
| `start_time` | uint64 | non | Début de fenêtre (ms) ; filtre sur `ts_ms` de l'échantillon |
| `end_time` | uint64 | non | Fin de fenêtre (ms) |

`coin` manquant → `400 {"error":"missing field coin"}`.

Réponse :

```json
{
  "type": "funding_history",
  "data": {
    "coin": "BTC",
    "samples": [
      { "ts_ms": 1783008579269, "premium": "0.00027179", "funding_rate": "0.00027179" },
      { "ts_ms": 1783008587316, "premium": "0.0005469",  "funding_rate": "0.0005469" }
    ]
  }
}
```

Les échantillons constituent l'anneau ordonné d'instantanés de prime
provenant du suivi de financement. `premium` est la valeur `Decimal` exacte
avant écrêtage, rendue sous forme de chaîne (signée, précision complète) ;
`funding_rate` est cette prime passée à travers le plafond de financement par
actif — le taux effectif qui serait réellement appliqué. Lorsque la prime
est dans les limites du plafond, `funding_rate == premium` ; au-delà,
`funding_rate` est écrêté au plafond signé. Un marché inconnu / vide retourne
`"samples": []`.

| Champ | Type | Description |
|-------|------|-------------|
| `coin` | string | Symbole du marché renvoyé en écho |
| `samples[*].ts_ms` | uint64 | Horodatage de l'échantillon (ms de consensus) |
| `samples[*].premium` | decimal string | Échantillon de prime de financement brut, avant écrêtage (signé) |
| `samples[*].funding_rate` | decimal string | Taux effectif = `premium` écrêté au plafond par actif (signé) |

### Obtenir les taux de financement prédits {#predicted_fundings}

Taux de financement prédit par marché + heure du prochain règlement, pour
l'ensemble des marchés perpétuels enregistrés. Aucun paramètre.

```json
{ "type": "predicted_fundings" }
```

La charge utile `data` est un **tableau**, une entrée par marché perpétuel
enregistré, dans l'ordre croissant des marchés. Un univers vide retourne
`"data": []`.

Réponse :

```json
{
  "type": "predicted_fundings",
  "data": [
    { "coin": "BTC", "predicted_rate": "0.0020702132945825193491902456", "next_funding_time": 1783011600000 },
    { "coin": "ETH", "predicted_rate": "0.0091563951859402408793685995", "next_funding_time": 1783011600000 }
  ]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `coin` | string | Symbole du marché |
| `predicted_rate` | decimal string | Le taux **écrêté** qui serait réellement appliqué à la prochaine échéance — la prime passée à travers le `±plafond` par actif, signée (`"0"` avant le premier échantillon) |
| `next_funding_time` | uint64 | La **prochaine échéance de règlement par actif alignée** (ms epoch) ; `0` avant le premier échantillon |

:::info
**`predicted_rate` est le taux facturé, pas la prime brute.** Il reflète le
plafond de financement par actif appliqué — le montant qui serait
débité/crédité sur une position si le financement se réglait maintenant. Le
financement se règle de manière **discrète** à l'échéance par actif
(`next_funding_time`), selon une cadence `interval_ms` par actif (1h par
défaut). Pour la série de primes brutes avant écrêtage, voir
[`funding_history`](#funding_history) ; pour la cadence / l'échéance, voir
[`market_info`](#market_info) `funding.interval_ms` /
`funding.next_payment_ts`.
:::

### Obtenir l'état de l'enchère au gaz pour le déploiement de contrats perpétuels {#mip3_active_bids}

Instantané de l'enchère au gaz pour le déploiement permissionless de
contrats perpétuels MIP-3. Aucun paramètre.

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

| Champ | Type | Description |
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

### Lister les comptes signalés pour liquidation {#liquidatable}

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

| Champ | Type | Description |
|-------|------|-------------|
| `accounts[*].address` | hex address | Compte nécessitant une action |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | Niveau BOLE |

Source d'état : `Exchange.bole_index.tier` (l'index des actions requises
BOLE — **pas** un rescan complet des comptes).

> **SIGNALÉ.** `bole_index` est un état dérivé non canonique
> `#[serde(skip)]`, reconstruit par un scan complet lors de la première
> utilisation / après le chargement d'un instantané. Sur un instantané
> fraîchement publié, il est vide jusqu'à ce que le moteur d'exécution ait
> effectué au moins une passe BOLE.

### Obtenir les limites de trading d'un utilisateur sur un marché {#active_asset_data}

Effet de levier, mode de marge et taille de transaction maximale d'un
utilisateur, par marché. Requis : `address` (hex 0x) + `coin` (symbole).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "coin": "BTC" }
```

| Argument | Type | Requis |
|-----|------|----------|
| `address` | hex address | oui |
| `coin` | symbol | oui |

`address` manquant → `400 {"error":"missing field: address"}` ; `coin`
manquant → `400 {"error":"missing field coin"}`.

Réponse :

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "coin": "BTC", "leverage": 50,
    "margin_mode": "cross", "mark_px": "61550.29664777",
    "max_trade_size": "0", "max_trade_szs": ["0", "0"],
    "available_to_trade": ["0", "0"], "has_position": false
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `coin` | string | Symbole du marché renvoyé en écho |
| `leverage` | uint32 | Effet de levier de la position si ouverte, sinon valeur par défaut du compte, sinon maximum du marché |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Mode de marge effectif |
| `mark_px` | decimal string | Mark actuel, plan décimal lisible par l'humain |
| `max_trade_size` | decimal string | Plafond de taille de transaction maximale par marché (voir [`max_market_order_ntls`](#max_market_order_ntls)) |
| `max_trade_szs` | [decimal string, decimal string] | Taille maximale négociable `[achat, vente]` |
| `available_to_trade` | [decimal string, decimal string] | Notionnel disponible pour ouvrir `[achat, vente]` |
| `has_position` | bool | Indique si l'utilisateur détient une position non nulle sur ce marché |

### Obtenir les plafonds notionnels des ordres au marché {#max_market_order_ntls}

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

| Champ | Type | Description |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | Identifiant d'actif |
| `ntls[*].max_market_order_ntl` | decimal string | Plafond de taille dérivé du plafond d'intérêt ouvert |

Source d'état : `PerpAnnotation.oi_cap` par marché, sinon
`default_mip3_limits.max_oi_per_market`.

> **SIGNALÉ.** Il n'existe pas de champ dédié « valeur notionnelle maximale
> d'un ordre au marché » par actif dans l'état validé ; le plafond d'intérêt
> ouvert (OI cap) est le plafond de risque validé le plus proche, exprimé en
> unités de **taille** (la couche de correspondance le convertit en
> notionnel au mark price en vigueur).

### Lister les actifs au plafond d'intérêt ouvert {#perps_at_open_interest_cap}

Actifs dont l'intérêt ouvert atteint ou dépasse le plafond. Aucun paramètre.

```json
{ "type": "perps_at_open_interest_cap" }
```

Réponse :

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Champ | Type | Description |
|-------|------|-------------|
| `assets` | uint32[] | Identifiants d'actifs atteignant ou dépassant leur `oi_cap`, par ordre croissant |

Source d'état : `open_interest` par carnet d'ordres vs
`PerpAnnotation.oi_cap` (les carnets sans plafond positif sont ignorés).

### `margin_table` — supprimé {#margin_table--removed}

:::warning
**`margin_table` a été SUPPRIMÉ.** L'échelle de marge est désormais portée
**en ligne** par chaque enregistrement de marché sous forme de
`margin_tiers` — à lire depuis [`market_info`](#market_info) (marché unique)
ou [`markets`](#markets) (tous les marchés). Chaque palier est
`{max_open_interest: string|null, max_leverage: u8, maint_margin_ratio:
bps-string}` : paliers à borne supérieure ascendante, `null` = palier
supérieur non borné. Une requête `margin_table` retourne désormais
`400 {"error":"unknown info type: margin_table"}`.
:::

### Lister les DEX perpétuels {#perp_dexs}

Liste le ou les DEX perpétuels. Aucun paramètre.

```json
{ "type": "perp_dexs" }
```

Réponse :

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Champ | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | Index du DEX dans `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Nombre de carnets d'actifs dans le DEX |
| `dexs[*].assets` | uint32[] | Identifiants d'actifs présents dans le DEX |

Source d'état : `Exchange.perp_dexs`.


## Voir aussi {#see-also}

- [`POST /info`](../info.md) — le point d'entrée de lecture de base (enveloppe, conventions, requêtes de compte et d'infrastructure)
- [Requêtes Spot et marge](./spot.md) — lectures spot / marge spot / Earn
- [Contrats perpétuels](../../../products/perpetuals.md) — le produit
