---
description: "Changements majeurs (breaking) de l'API dans node + gateway 0.7.14 — adressage par coin/address, types de requêtes supprimés, paliers de marge en ligne, et mises à jour des canaux WS. Une checklist de migration pour les intégrateurs et les market makers."
---

# Migration de l'API — 0.7.14

:::warning
**Changements majeurs.** Cette version modifie la façon dont les marchés et les comptes
sont adressés sur l'API de lecture, supprime trois types de requêtes, et met à jour
plusieurs canaux WS. Les actions signées `/exchange` sont **inchangées**. Parcourez la
checklist ci-dessous avant de mettre à niveau un client.
:::

## En un coup d'œil {#at-a-glance}

| Domaine | Avant | Après |
|------|-----|-----|
| Adresser un marché (lectures) | `asset_id` / `market_id` (numérique) | **`coin`** (symbole, p. ex. `"BTC"`) |
| Adresser un compte (lectures) | `account_id` **ou** `address` | **`address`** (hex 0x) uniquement |
| Historique des bougies | `candle` | **`candle_snapshot`** (la requête bougie unique) |
| Instantané composite frontend | `web_data2` (REST + WS) | **supprimé** — composez des lectures ciblées |
| Échelle de marge | requête `margin_table` | **`margin_tiers`** en ligne sur `market_info` / `markets` |
| Transactions récentes par fenêtre | — | **`trades_by_time`** (nouveau) |
| Plafond d'abonnements WS | 256 / connexion | **64 / connexion** |

## 1. Les marchés sont adressés par `coin` {#1-markets-are-addressed-by-coin}

Chaque lecture ciblant un marché résout désormais le marché via son **symbole
`coin`**. Les arguments de requête numériques `asset_id` / `market_id` sont
**supprimés** — une requête qui les fournit (et omet `coin`) est rejetée avec
`400 {"error":"missing field coin"}`.

Lectures concernées : `market_info`, `markets`, `l2_book`, `recent_trades`,
`trades_by_time`, `funding_history`, `oracle_sources`, `active_asset_data`,
`fba_batch_state`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"market_info","asset_id":0}
+ {"type":"market_info","coin":"BTC"}
```

Les réponses reflètent le symbole `coin` (p. ex. les lignes de `recent_trades`
portent `"coin":"BTC"`). `market_info` / `markets` conservent pour l'instant un
champ **`asset_id`** en tant que shim d'indexeur déprécié — **ne construisez pas
votre logique dessus** ; il peut être retiré sans montée de version du wire.

## 2. Les comptes sont adressés par `address` {#2-accounts-are-addressed-by-address}

Les lectures ciblant un compte n'acceptent plus `account_id` ; passez `address`
(hex 0x).

Lectures concernées : `open_orders`, `user_fills`, `user_fills_by_time`,
`agents`, `sub_accounts`, `rfq_user`, `pm_summary`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

Le champ d'écho `account_id` a disparu de ces réponses.

## 3. Types de requêtes supprimés {#3-removed-query-types}

| Supprimé | Renvoie désormais | Utilisez à la place |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` en ligne sur [`market_info`](./rest/info/perpetuals.md#market_info) / [`markets`](./rest/info/perpetuals.md#markets) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) + [`spot_clearinghouse_state`](./rest/info/spot.md#spot_clearinghouse_state) + [`frontend_open_orders`](./rest/info.md#frontend_open_orders) + [`user_vault_equities`](./rest/info.md#user_vault_equities) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2` (canal WS) | `unknown channel: web_data2` | canaux WS `account_state` + `spot_state` |

## 4. `margin_tiers` — échelle en ligne par paliers de notionnel {#4-margin_tiers--inline-notional-banded-ladder}

L'échelle de marge de maintenance vit désormais **en ligne** sur chaque
enregistrement de marché sous `margin_tiers`, une liste ascendante de paliers à
borne supérieure :

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` — **borne supérieure** du palier (chaîne décimale, en
  unités de taille) ; `null` = le **palier supérieur illimité**.
- `max_leverage` — levier maximal dans ce palier (`u8`).
- `maint_margin_ratio` — ratio de marge de maintenance, **chaîne décimale en
  points de base** (`"100"` = 1,00 %).

Palier = le premier palier dont la borne `max_open_interest` n'est pas
dépassée. Le levier baisse et la marge de maintenance augmente à mesure que
l'open interest croît.

## 5. Nouveau : `trades_by_time` {#5-new-trades_by_time}

Les transactions publiques récentes pour un marché sur une fenêtre
`[start_time, end_time]` (l'anneau borné ; l'historique profond passe par
l'archive de la gateway) :

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

Les lignes partagent la forme de [`recent_trades`](./rest/info/perpetuals.md#recent_trades).

## 6. Forme de `markets` {#6-markets-shape}

`markets.data` est désormais un **objet**, plus un tableau :

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

Chaque élément de `perp[]` ne porte que les champs **dynamiques** d'un marché
— le même sous-ensemble dynamique que `market_info` inclut pour un `coin`
donné. Les champs **statiques** (grilles de précision, échelles de levier/marge,
drapeaux de contrôle de trading) vivent séparément sur
[`markets_meta`](./rest/info/perpetuals.md#markets_meta) ; `market_info`
renvoie l'union des deux.

## 7. Changements WebSocket {#7-websocket-changes}

- **Canal `web_data2` supprimé** — voir le remplacement ci-dessus.
- **`trades`** : `data` est un **tableau** ; la trame initiale à l'abonnement
  (`is_snapshot: true`) est un tableau **non vide** de transactions récentes
  (vide uniquement si le marché n'a jamais tradé), et les lignes de
  l'instantané portent **`users: null`**. Les émissions en direct portent
  `users: [taker, maker]`.
- **`user_fundings`** : les enregistrements portent désormais
  `{coin, payment, szi, fundingRate, time}` (`payment` en USDC entier signé :
  négatif = payé, positif = reçu).
- **`explorer_txs`** : les lignes portent un champ **`hash`** (le hash `0x` de
  l'action ; vide `""` pour une entrée systémique). **`explorer_block`** diffuse
  l'en-tête du bloc commité.
- **`order_updates`** : sur un enregistrement `filled`, `order.sz` est la
  taille **REMPLIE** et `order.orig_sz` la taille **d'origine** de l'ordre.
- **Canaux actifs** : `account_state`, `spot_state`, `order_updates`, `fills`,
  `user_events`, `user_fundings`, `ledger_updates`, `l2_book`, `bbo`, `trades`,
  `candles`, `all_mids`, `active_asset_ctx`, `active_asset_data`,
  `explorer_block`, `explorer_txs`.

## 8. Sémantique de `predicted_fundings` {#8-predicted_fundings-semantics}

Indexé par `coin` ; chaque entrée est
`{coin, predicted_rate, next_funding_time}` :

- `predicted_rate` est le taux **plafonné** réellement facturé à la borne
  (la prime passée à travers le `±cap` par actif), pas la prime brute.
- `next_funding_time` est la **prochaine borne de règlement alignée par
  actif** (ms).

Le funding se règle **discrètement** aux bornes par actif (1h par défaut) ;
les échantillons de `funding_history` restent l'anneau de la prime brute.
`market_info.funding` porte `interval_ms` (cadence par actif) et
`next_payment_ts` (la borne).

## 9. Limites de débit {#9-rate-limits}

- Par IP : **1200 poids / minute** — les IP en liste blanche sont exemptées.
- Seau à jetons par compte pour `/exchange` — **les signataires configurés en
  metaliquidity sont exemptés**.
- WS : **64 abonnements par connexion** (contre 256 auparavant) — les
  connexions en liste blanche sont exemptées.

Voir [limites de débit](./rate-limits.md).

## 10. Inchangé {#10-unchanged}

- **Identifiants d'ordre / de transaction** : `oid`, `tid`, `cloid` sont
  inchangés (`tid` est un `u64` — traitez-le comme un grand entier, il peut
  dépasser 2⁵³).
- **Actions signées `/exchange`** : les digests des actions typées sont
  **figés par le consensus** — `asset` reste un `u32` numérique dans les
  actions signées. Le changement `coin`/`address` est un changement de
  **l'API de lecture** uniquement ; il n'affecte **pas** la façon dont vous
  signez un ordre ou une annulation. Voir [`POST /exchange`](./rest/exchange.md).

## Voir aussi {#see-also}

- [`POST /info`](./rest/info.md) · [requêtes perpétuels](./rest/info/perpetuals.md) · [requêtes spot & marge](./rest/info/spot.md)
- [Abonnements WS](./ws/subscriptions.md)
- [Limites de débit](./rate-limits.md) · [Erreurs](./errors.md)
