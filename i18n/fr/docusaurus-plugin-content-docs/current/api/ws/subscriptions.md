# Canaux d'abonnement WebSocket

:::info
**État.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `markets`, `fills`, `user_events`, `candles`, `order_updates`, `open_orders`, `notifications`, `ledger_updates`, `active_asset_data`, `user_fundings`, `user_twap_slice_fills`, `user_twap_history`, `account_state`, `spot_state`, `explorer_block` et `explorer_txs` sont actifs et transmettent des données validées en temps réel — pilotés par les changements d'état, un canal n'émet une trame que lorsque son état a effectivement changé depuis le dernier commit. Tout ce qui figure sous [Feuille de route](#roadmap--not-yet-available) n'est pas câblé. Le cycle de vie de la connexion et le format des trames sont décrits dans le [README WebSocket](./index.md). Les canaux par marché (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) exigent un `coin` ; `candles` exige un `coin` **et** un `interval` ; les canaux par compte (`fills`, `user_events`, `open_orders`) exigent un `user` (l'adresse 0x) ; `active_asset_data` exige **à la fois** un `user` et un `coin` ; les canaux globaux `all_mids`, `markets`, `explorer_block` et `explorer_txs` n'en prennent aucun.

:::warning
**`web_data2` (REST + WS) a été SUPPRIMÉ.** Recomposez l'équivalent à partir de
[`account_state`](#account_state) + [`spot_state`](#spot_state) + `order_updates`
(ou des lectures REST ciblées). S'abonner à `web_data2` renvoie désormais
`{"channel":"error","data":{"error":"unknown channel: web_data2"}}`.
:::
:::

:::info
**Les noms de canaux sont en snake_case (natif MTF).** Il s'agit de la surface native du nœud `/ws`, donc les noms de canaux sur le fil sont en snake_case (`l2_book`, `user_events`, …). La passerelle dessert ce même WS natif sur `api.<net>.mtf.exchange/ws`.
:::

Le protocole de trame reflète celui de HL ; les **noms de canaux sont en snake_case natif MTF**. L'abonnement s'effectue via :

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

Vous recevez ensuite un accusé de réception (`subscriptionResponse`), un instantané initial (`is_snapshot: true`), puis des poussées en direct pilotées par les changements `{"channel":...,"data":...}` (`is_snapshot: false`). Une poussée n'intervient que lorsque l'état de ce canal a effectivement changé depuis le dernier commit ; un canal inchangé n'émet rien. `coin` est **obligatoire** pour les canaux par marché (`l2_book`, `bbo`) ; voir [Paramètre coin](./index.md#coin-parameter) pour la manière dont il est canonicalisé (identifiant numérique d'actif ou symbole → clé d'identifiant d'actif).

## Aperçu de l'état des canaux {#channel-status-at-a-glance}

| Canal | État | Clé | Source en direct |
|---------|--------|:-------:|-------------|
| `l2_book` | **actif** | `coin` (obligatoire) | carnet d'ordres validé, à chaque changement |
| `bbo` | **actif** | `coin` (obligatoire) | carnet d'ordres validé, à chaque changement |
| `trades` | **actif** | `coin` (obligatoire) | exécutions du bloc validé, à chaque nouvelle exécution |
| `active_asset_ctx` | **actif** | `coin` (obligatoire) | mark / oracle / financement / OI par marché, à chaque changement |
| `all_mids` | **actif** | aucune | prix mark par marché, à chaque changement |
| `markets` | **actif** | aucune | état dynamique par marché (mark / oracle / mid / prime / financement / OI / ticker 24h / halted) — instantané complet, puis deltas des lignes modifiées |
| `fills` | **actif** | `user`/`address` (obligatoire) | exécutions du bloc validé pour ce compte |
| `user_events` | **actif** | `user`/`address` (obligatoire) | exécutions du bloc validé pour ce compte (d'autres types d'événements à venir) |
| `candles` | **actif** | `coin` + `interval` (tous deux obligatoires) | exécutions du bloc validé agrégées en barres OHLCV, à chaque changement |
| `order_updates` | **actif** | `user`/`address` (obligatoire) | cycle de vie des ordres par compte (placement / exécution / annulation / rejet), à chaque changement |
| `open_orders` | **actif** | `user`/`address` (obligatoire) | ensemble des ordres au repos par compte — instantané COMPLET réémis à chaque changement |
| `notifications` | **actif** | `user`/`address` (obligatoire) | avis de marge / liquidation par compte, à chaque changement |
| `ledger_updates` | **actif** | `user`/`address` (obligatoire) | mouvements de fonds par compte (dépôt / retrait / transfert), à chaque changement |
| `active_asset_data` | **actif** | `user` **et** `coin` (tous deux obligatoires) | contexte par (utilisateur, coin) d'effet de levier / mode de marge / taille de transaction maximale, à chaque changement |
| `user_fundings` | **actif** | `user`/`address` (obligatoire) | paiements de financement réalisés par compte, à chaque changement |
| `user_twap_slice_fills` | **actif** | `user`/`address` (obligatoire) | exécutions de tranches TWAP par compte (`{fill, twapId}`), à chaque changement |
| `user_twap_history` | **actif** | `user`/`address` (obligatoire) | cycle de vie TWAP par compte (`{time, state, status}` : activé / terminé / résilié), à chaque changement |
| `account_state` | **actif** | `user`/`address` (obligatoire) | état de la chambre de compensation PERP par compte — scalaires de marge, positions, soldes — à chaque changement |
| `spot_state` | **actif** | `user`/`address` (obligatoire) | état de la chambre de compensation SPOT par compte — soldes par token — à chaque changement |
| `explorer_block` | **actif** | aucune | en-tête du dernier bloc validé, à chaque nouveau bloc |
| `explorer_txs` | **actif** | aucune | transactions du dernier bloc validé, à chaque nouveau bloc |

Toute souscription à un `type` inconnu renvoie `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

---

## Canaux actifs {#live-channels}

### Carnet d'ordres L2 agrégé pour un marché {#l2_book}

Carnet d'ordres L2 agrégé pour un marché. **Exige `coin`.**

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC" } }
```

L'instantané initial et chaque poussée partagent cette structure :

```json
{
  "channel": "l2_book",
  "data": {
    "coin": "BTC",
    "levels": [
      [ { "px": "10050000000", "sz": "12", "n": 2 }, { "px": "10049000000", "sz": "3", "n": 1 } ],
      [ { "px": "10051000000", "sz": "4", "n": 1 }, { "px": "10052000000", "sz": "6", "n": 1 } ]
    ],
    "time": 1735689600000
  }
}
```

- `levels` vaut `[bids, asks]`. Les offres d'achat sont triées du meilleur (plus élevé) au moins bon ; les offres de vente du meilleur (plus bas) au moins bon.
- Chaque niveau est `{ px, sz, n }` : `px` / `sz` sont des magnitudes brutes en virgule fixe sous forme de **chaînes** décimales (la mise à l'échelle par tick propre à chaque actif est appliquée en aval dans la passerelle), `n` est le nombre d'ordres au repos à ce prix.
- Chaque côté est limité à **20 niveaux agrégés**.
- `time` est le `last_trade_ms` du carnet (dérivé du consensus) ; `0` tant que le carnet n'a enregistré aucune transaction.

Chaque poussée est un **instantané complet des 20 premiers niveaux**, non un diff partiel. L'enveloppe de trame contient un booléen `is_snapshot` — `true` pour l'instantané initial à l'abonnement, `false` pour les poussées ultérieures pilotées par les changements — mais le **corps est toujours le carnet complet des 20 premiers niveaux**, ce champ est donc informatif : remplacez simplement votre carnet local à chaque trame pour rester cohérent.

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque le carnet a effectivement changé depuis le dernier commit ; un commit qui laisse ce carnet inchangé n'émet rien. Si le coin ne correspond à aucun marché connu, vous recevez tout de même l'accusé de réception, mais le corps de l'instantané est le carnet vide (`"levels": [[], []]`, `"time": 0`) et aucune poussée ne suit.

### Meilleures offre et demande au sommet du carnet {#bbo}

Meilleure offre / demande au sommet du carnet pour un marché. Une version allégée de `l2_book`. **Exige `coin`.**

```json
{ "method": "subscribe", "subscription": { "type": "bbo", "coin": "BTC" } }
```

```json
{
  "channel": "bbo",
  "data": {
    "coin": "BTC",
    "time": 1735689600000,
    "bbo": [
      { "px": "10050000000", "sz": "12", "n": 2 },
      { "px": "10051000000", "sz": "4", "n": 1 }
    ]
  }
}
```

- `bbo` vaut `[best_bid, best_ask]`. Chaque entrée est un niveau `{ px, sz, n }`, ou `null` lorsque ce côté est vide.
- `time` est `last_trade_ms`, identique à `l2_book`.

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque le sommet du carnet a effectivement changé depuis le dernier commit ; un carnet inchangé n'émet rien à ce commit.

---

### Bande des transactions publiques pour un marché {#trades}

Bande des transactions publiques pour un marché. **Exige `coin`.** Le `data` de
chaque trame est un **tableau** d'enregistrements de transaction ; `px`/`sz` sont
des chaînes entières brutes en **plan 1e8** ; `side` est le côté du preneur
(`"B"` achat / `"A"` vente) ; `time` est l'horodatage du bloc de consensus (ms) ;
`tid` est un identifiant de transaction déterministe.

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

**Instantané à l'abonnement** (`is_snapshot: true`) — un tableau **non vide** des
impressions récentes bornées du marché (jusqu'aux **64** plus récentes, de la
plus récente à la plus ancienne ; vide uniquement si le marché n'a jamais
tradé). Les lignes de l'instantané portent **`users: null`** — les adresses de
contrepartie ne sont pas reconstruites pour les impressions historiques :

```json
{ "channel": "trades", "is_snapshot": true, "data": [
  { "coin": "BTC", "side": "A", "px": "6164370000000", "sz": "24000", "time": 1735689500000, "tid": 4898317237641214538, "users": null }
] }
```

**Poussées en direct** (`is_snapshot: false`) — les nouvelles impressions du
bloc tout juste validé ; le `users` de chaque ligne est `[taker, maker]`
(preneur en premier, l'agresseur) :

```json
{ "channel": "trades", "is_snapshot": false, "data": [
  { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] }
] }
```

- `tid` peut dépasser 2⁵³ — traitez-le comme un entier 64 bits / big integer, pas comme un nombre JS.

### Contexte de mark, d'oracle et de financement par marché {#active_asset_ctx}

Contexte par marché pour un marché — prix mark / oracle, taux de financement et intérêts ouverts — poussé lors de ses changements. **Exige `coin`.** Le corps contient les mêmes champs et unités que la lecture REST [`market_info`](../rest/info/perpetuals.md#market_info) : `mark_px` / `oracle_px` sont en **USDC entiers**, arrondis au tick (tronqués au tick de prix du marché), et le bloc `funding` reflète `market_info.funding`. Construit à partir du même générateur d'enregistrements par marché que la lecture REST, un push WS ctx ne diverge donc jamais de `market_info`.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_ctx", "coin": "BTC" } }
```

```json
{
  "channel": "active_asset_ctx",
  "data": {
    "coin": "BTC",
    "mark_px": "66735.25",
    "oracle_px": "66700",
    "funding": {
      "rate_per_hr": "0",
      "cap_per_hr": "400",
      "interval_ms": 3600000,
      "next_payment_ts": 0
    },
    "open_interest": "5000000000"
  }
}
```

- `mark_px` / `oracle_px` — USDC entiers, arrondis au tick (`"0"` lorsque non défini). Même plan que `market_info`, PAS le plan book 1e8.
- `funding` — `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, identique au bloc REST `market_info.funding` (`null` pour un marché inconnu — voir ci-dessous). `rate_per_hr` est le dernier échantillon de taux de financement horaire (avant plafonnement) et `cap_per_hr` le plafond de taux par marché, tous deux des **chaînes bps** tronquées vers zéro (p. ex. `"400"` = 0,04/h) ; `interval_ms` est la cadence de financement (`3600000` = 1h) ; `next_payment_ts` est en epoch-ms, `0` tant que le marché n'a pas son premier échantillon de financement.
- `open_interest` — intérêts ouverts actuels, chaîne en virgule fixe (`"0"` lorsqu'il n'y a pas de carnet).

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque le contexte de ce marché a effectivement changé depuis le dernier commit ; un contexte inchangé n'émet rien à ce commit.

Si le coin ne correspond à aucun marché connu, vous recevez tout de même l'accusé de réception, mais l'instantané est le corps **vide-honnête** — prix / OI nuls et un bloc `funding` à `null` — et aucune poussée ne suit (ainsi un client désérialisant une structure de contexte fixe ne se retrouve jamais en erreur) :

```json
{ "channel": "active_asset_ctx", "data": { "coin": "DOGE", "mark_px": "0", "oracle_px": "0", "funding": null, "open_interest": "0" } }
```

### Carte globale des prix médians pour tous les marchés {#all_mids}

Carte globale des prix médians — le prix mark de chaque marché, poussé lorsque les mids changent. Indexé par coin ; les valeurs sont le prix mark en USDC entiers arrondis au tick que la lecture REST [`markets`](../rest/info/perpetuals.md#markets) retourne. Aucun paramètre `coin`.

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### État dynamique global pour tous les marchés {#markets}

Flux global de l'état **dynamique** par marché — le prix mark / oracle / mid en direct, la prime de financement, l'intérêt ouvert, le ticker 24h et le drapeau halted de chaque marché, une ligne par marché. GLOBAL : ne prend **ni `coin` ni `user`** (comme [`all_mids`](#all_mids)). Les lignes partagent le même générateur dynamique REST [`markets`](../rest/info/perpetuals.md#markets), de sorte que le flux WS et la lecture REST ne divergent jamais.

```json
{ "method": "subscribe", "subscription": { "type": "markets" } }
```

La trame **à l'abonnement** (`is_snapshot: true`) est un **tableau contenant la ligne de chaque marché** (perp **et** spot) :

```json
{ "channel": "markets", "is_snapshot": true, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "66735.25", "oracle_px": "66700",
    "mid_px": "66735.30", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.01", "halted": false },
  { "coin": "BTC/USDC", "kind": "spot", "mark_px": "66730", "mid_px": "66731",
    "day_ntl_vlm": "58000", "prev_day_px": "66000" }
] }
```

Chaque **poussée** suivante (`is_snapshot: false`) ne porte que les **lignes modifiées** — la ligne complète de chaque marché dont la ligne a bougé lors de ce commit, les marchés inchangés étant omis (un commit calme ne pousse rien) :

```json
{ "channel": "markets", "is_snapshot": false, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "70000", "oracle_px": "70000",
    "mid_px": "70001", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.06", "halted": false }
] }
```

Ainsi, **l'instantané contient toutes les lignes** et un **delta ne contient que les lignes modifiées** — démultiplexez chaque ligne sur son `(coin, kind)` et remplacez-la dans votre table locale. Chaque ligne s'auto-étiquette avec `kind` (`"perp"` / `"spot"`). Les lignes perp portent :

| Champ | Type | Description |
|-------|------|-------------|
| `coin` | chaîne | Symbole du marché (clé de jointure) |
| `kind` | `"perp"` | Type de marché (clé de jointure) |
| `mark_px` | Chaîne décimale | Prix mark, **USDC entiers**, arrondi au tick (`"0"` lorsque non défini) |
| `oracle_px` | Chaîne décimale | Prix d'index, **USDC entiers**, arrondi au tick (`"0"` lorsque non défini) |
| `mid_px` | Chaîne décimale | Mid réel du carnet d'ordres, **USDC entiers**, arrondi au tick — **omis** lorsque le carnet est unilatéral (jamais envoyé comme `null`) |
| `premium` | Chaîne décimale \| null | Dernier échantillon de prime de financement, une chaîne à **8 décimales** (tronquée vers zéro) ; `null` en l'absence d'échantillon |
| `funding` | objet | `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, identique au bloc REST `market_info.funding` |
| `open_interest` | Chaîne décimale | Intérêt ouvert actuel, taille en unités entières |
| `day_ntl_vlm` | Chaîne décimale | Volume notionnel glissant sur 24h (USDC entiers) |
| `prev_day_px` | Chaîne décimale \| null | Mark il y a ~24h (USDC entiers) ; `null` en l'absence d'échantillon à 24h |
| `change_24h` | Chaîne décimale \| null | Fraction de variation signée sur 24h (`"0.05"` = +5 %) ; `null` en l'absence de prix antérieur |
| `halted` | booléen | Indique si le marché est suspendu |

Les lignes spot ne portent que les champs ayant un analogue spot — `coin`, `kind` (`"spot"`), `mark_px`, `mid_px` (omis lorsque unilatéral), `day_ntl_vlm`, `prev_day_px` ; les champs propres aux perp (`oracle_px` / `premium` / `funding` / `open_interest` / `change_24h` / `halted`) sont absents.

Fréquence : pilotée par les changements — une trame delta n'arrive que lors des commits où la ligne d'au moins un marché a bougé ; un commit qui ne change rien n'émet rien.

### Flux d'exécutions par compte {#fills}

Flux d'exécutions par compte. Exige `user` (l'adresse 0x ; `address` est également accepté) — PAS un `coin`. Chaque correspondance exécutée livre un enregistrement AUX DEUX parties, chacune depuis sa propre perspective, avec le même jeu de champs `{coin, side, px, sz, time, oid, cloid, tid, crossed}` :

- l'enregistrement du **preneur** — son propre `oid`, son `cloid` (ou `null`), le côté du preneur, `crossed: true` ;
- l'enregistrement du **faiseur** — son propre `oid`, `cloid: null` (aucun cloid n'est capturé pour le côté au repos), le côté **opposé**, `crossed: false`.

Les deux jambes d'une même correspondance partagent le même `tid` (la même valeur que porte l'impression publique `trades`). `px`/`sz` sont des chaînes en plan 1e8. Les enregistrements d'exécution par compte **ne contiennent pas de tableau `users`** — les adresses de la contrepartie n'apparaissent que sur le flux public [`trades`](#trades), jamais sur le flux limité au compte.

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

L'instantané initial est le tableau vide `[]` ; chaque poussée est un tableau contenant un enregistrement d'exécution :

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] }
```

### Flux d'événements par compte {#userevents}

Flux d'événements par compte. Exige `user` (l'adresse 0x) — PAS un `coin`. Il étiquette actuellement les `fills` ; d'autres types d'événements (liquidation, financement) arriveront comme clés sœurs.

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

Le nom natif du canal est `user_events` (snake_case).

:::warning
`user_events` est une donnée par compte, mais ne dispose actuellement d'**aucune authentification** — n'importe quelle connexion peut s'abonner au flux de n'importe quelle adresse. Ne le traitez pas comme un canal privé tant que la vérification d'authentification à l'abonnement n'est pas en place ; pour les lectures/écritures authentifiées, utilisez `post` avec une action signée.
:::

### Barres OHLCV glissantes pour un marché {#candles}

Barres OHLCV glissantes pour un marché à une taille de barre donnée. **Exige à la fois `coin` et `interval`** — ils forment ensemble la clé de routage, de sorte qu'un abonnement `1m` et un abonnement `5m` sur le même marché sont des abonnements indépendants, chacun avec son propre instantané et ses propres poussées.

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m" } }
```

- `interval` ∈ `1m` / `5m` / `15m` / `1h` / `4h` / `1d`. Un `interval` absent ou non reconnu est normalisé en **`1m`** (l'accusé de réception renvoie l'intervalle effectivement utilisé).
- L'accusé de réception renvoie `interval` dans l'abonnement afin qu'un client puisse corréler `(coin, interval)`.

L'**instantané initial** est un **tableau** des barres récentes (barres fermées + barre ouverte), de la plus ancienne à la plus récente — `[]` tant que le marché n'a pas tradé :

```json
{ "channel": "candles", "data": [
  { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 }
] }
```

Chaque **poussée** est un **objet barre unique** (pas le tableau) — la barre ouverte courante pour ce `(coin, interval)`, réémise à chaque bloc validé dont les exécutions tombent sur ce marché :

```json
{ "channel": "candles", "data": { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 } }
```

- `t` / `T` — epoch-ms d'ouverture / fermeture de la barre (dérivé du consensus) ; la barre couvre `[t, T]` et une exécution bascule dans une nouvelle barre lorsque l'horodatage de son bloc franchit `T`.
- `s` — symbole du coin / marché ; `i` — jeton de l'intervalle.
- `o` / `c` / `h` / `l` — ouverture / clôture / plus haut / plus bas, chaînes **USDC décimales** (dollars humains, p. ex. `"67002.50"`).
- `v` — volume d'actif de base agrégé dans la barre (taille en coin). `q` — volume en cotation (USD) = `Σ prix × taille` sur les exécutions de la barre. `n` — nombre d'exécutions dans la barre.

La série est **sans lacune** : un intervalle sans transaction émet une barre plate qui reporte la clôture précédente (`o = h = l = c = clôture précédente`, `v = q = 0`, `n = 0`). Aucune barre n'est émise avant la première transaction du marché — la série commence au bucket de la première impression.

Un store conserve jusqu'à **1 000 barres par série `(coin, interval)`** ; les séries froides (sans abonné) sont évincées, de sorte qu'un marché/intervalle non surveillé ne coûte rien.

### Événements de cycle de vie des ordres par compte {#order_updates}

Cycle de vie des ordres par compte. Exige `user` (l'adresse 0x). Chaque poussée est un tableau d'enregistrements de mises à jour d'ordres pour ce compte issus du bloc tout juste validé ; l'instantané initial est `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": 42, "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` ∈ `open` (au repos ; `order.sz` est le reliquat du carnet après le commit, `order.orig_sz` la taille avec laquelle l'ordre a été placé) / `filled` / `canceled` / `rejected` (+`reason`, `oid` nul) / `cancel_rejected` (+`reason`).
- Sur un enregistrement **`filled`**, `order.sz` = la taille **EXÉCUTÉE** et `order.orig_sz` = la taille **d'origine** de l'ordre (donc `sz / orig_sz` est la fraction exécutée) ; un preneur porte aussi `filled_sz` + `avg_px` cumulatifs, tandis qu'une jambe faiseur rapporte le `filled_sz` par correspondance avec `status` toujours à `open` tant qu'une taille reste au repos.
- `limit_px` / `sz` / `orig_sz` / `avg_px` sont des chaînes décimales en plan 1e8 ; `time` est en consensus-ms ; les champs inconnus sont `null`.
- **Non** émis aujourd'hui : `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / les transitions TWAP et les annulations initiées par le moteur (BOLE T0) — l'observation de dispatch pour ceux-ci est un ok/err opaque sans charge utile par ordre.

### Instantané des ordres au repos par compte {#open_orders}

**Ensemble** des ordres au repos par compte. Exige `user` (l'adresse 0x ; `address` est également accepté) — PAS un `coin`. Contrairement à [`order_updates`](#order_updates) (deltas par événement), **chaque** trame `open_orders` est un instantané COMPLET des ordres actuellement au repos du compte — `is_snapshot` vaut `true` sur la trame à l'abonnement **et à chaque réémission**. Le nœud réémet l'ensemble complet à chaque fois qu'un changement de cycle de vie d'ordre le touche (placement / exécution / annulation / modification / annulation initiée par le moteur), de sorte qu'un client **remplace simplement tout son ensemble d'ordres ouverts à chaque trame** ; il n'y a aucun delta partiel à réconcilier. Cela contourne la lacune de [`order_updates`](#order_updates) où `modify` / `batchModify` / les annulations initiées par le moteur ne portent aucun delta par ordre.

```json
{ "method": "subscribe", "subscription": { "type": "open_orders", "user": "0x<address>" } }
```

L'instantané est un **tableau** d'enregistrements, chacun ayant la même forme fixe qu'un élément [`order_updates`](#order_updates) à `status: "open"` — `[]` lorsque le compte n'a aucun ordre au repos :

```json
{ "channel": "open_orders", "is_snapshot": true, "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": null,
             "oid": 42, "cloid": null, "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- Chaque élément est un ordre au repos : l'objet imbriqué `order` (`coin`, `side`, `limit_px`, `sz` = taille restante, `orig_sz`, `oid`, `cloid`, `tif`, `reduce_only`), avec `filled_sz` / `avg_px` / `reason` tous à `null` (un ordre permanent, pas un événement) et `time` l'horodatage d'insertion de l'ordre (consensus ms). Sur cet instantané, `orig_sz` est `null` (la taille placée n'est pas re-dérivée pour un ordre permanent) et `reduce_only` vaut `false` ; `cloid` est l'identifiant client ou `null`. `limit_px` est en USDC entiers, `sz` est dans le plan de taille.
- Comme chaque trame est un instantané complet, `is_snapshot` vaut toujours `true` ici — traitez chaque trame comme l'ensemble complet et actuel des ordres au repos du compte, pas comme un changement incrémental.

### Avis de marge et de liquidation par compte {#notifications}

Avis de marge / liquidation par compte, dérivés en comparant des états validés consécutifs. Exige `user`. Une trame tableau par commit affecté ; instantané initial `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "notifications", "user": "0x<address>" } }
```

```json
{ "channel": "notifications", "data": [
  { "kind": "yellow_card", "tier": "yellow_card", "message": "...", "time": 1735689600123 },
  { "kind": "forced_close_tier", "tier": "partial_market_50", "message": "...", "time": 1735689600123 },
  { "kind": "tier_cleared", "tier": null, "message": "...", "time": 1735689600123 },
  { "kind": "forced_close", "coin": "BTC", "side": "long", "closed_sz": "600", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual", "coin": "BTC", "side": "long", "lots": "120", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual_cleared", "coin": "BTC", "side": "long", "message": "...", "time": 1735689600123 } ] }
```

- `kind` est le tag machine ; `message` est le texte lisible par un humain. `tier` ∈ `yellow_card` / `partial_market_50` / `full_market` / `backstop_takeover` (ou `null` lors d'une levée).
- `yellow_card` est la grâce d'avertissement de marge sur un bloc (le contrat T0 de [liquidation par paliers](../../concepts/tiered-liquidation.md)) ; `forced_close` se déclenche lorsqu'une liquidation s'exécute effectivement contre le compte.

### Historique des mouvements de fonds par compte {#ledger_updates}

Mouvements de fonds par compte, attribués à leur **cause** (lue depuis la charge utile du bloc validé — un enregistrement n'apparaît que lorsque l'action s'est appliquée). Exige `user`. L'instantané à l'abonnement est un **tableau** des enregistrements de solde les plus récents du compte, **du plus récent au plus ancien**, borné aux **100** derniers (`[]` lorsque le compte n'a aucun enregistrement récent) ; chaque poussée suivante est un tableau contenant le ou les nouveaux enregistrements du bloc tout juste validé.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` ∈ `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (+`token`), `asset_send` / `asset_receive` (+`asset`, `to_perp`), `withdraw` (`via` : `cctp` | `metabridge`), `deposit` (`amount` peut être `null` pour un crédit CCTP entrant), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer`, `vault_transfer`. Un transfert émet un enregistrement par partie (émetteur + récepteur).
- Les montants sont des chaînes décimales en token entier, sauf `withdraw` via MetaBridge qui porte `amount_units` (unités de base brutes). Les montants de crédits de pont entrants et les actions retardées par CoreWriter (dispatchées dans un bloc ultérieur) ne sont pas encore attribuées.

### Contexte de trading pour un compte et un marché {#active_asset_data}

Contexte de trading par (utilisateur, coin) — effet de levier, mode de marge et plafond actuel de taille de transaction maximale pour un compte sur un marché. Exige **à la fois** `user` (0x) et `coin`. L'instantané initial est le contexte en direct (valeurs par défaut à zéro lorsque le compte n'a pas de position), pas un tableau vide ; une poussée ne le réémet que lorsque ce contexte change.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "is_snapshot": true, "data": {
  "address": "0x<addr>", "coin": "BTC", "leverage": 50, "margin_mode": "cross",
  "mark_px": "61742.69625702", "max_trade_size": "0", "max_trade_szs": ["0", "0"],
  "available_to_trade": ["0", "0"], "has_position": false } }
```

- Indexé par `coin` (symbole). `margin_mode` ∈ `cross` / `isolated` / `strict_iso` ;
  `max_trade_size` est le plafond de taille dérivé du plafond OI, `max_trade_szs` /
  `available_to_trade` sont des paires `[achat, vente]` ; les champs sont identiques
  à la lecture REST [`active_asset_data`](../rest/info/perpetuals.md#active_asset_data).

### État de la chambre de compensation perp par compte {#account_state}

État de la chambre de compensation **PERP** par compte — le résumé de marge, les
positions ouvertes et les soldes pour un compte — poussé lorsqu'il change. Exige
`user` (l'adresse 0x ; `address` est également accepté) — PAS un `coin`. Le corps
est construit à partir du même générateur d'enregistrements que la lecture REST
de compte ciblée, de sorte qu'une poussée WS ne diverge jamais de cette lecture.
L'instantané initial est l'état en direct (mis à zéro pour un compte sans fonds),
pas un tableau vide.

```json
{ "method": "subscribe", "subscription": { "type": "account_state", "user": "0x<address>" } }
```

```json
{
  "channel": "account_state",
  "data": {
    "address": "0x<addr>",
    "account_value": "10000", "free_collateral": "8500", "maint_margin": "300",
    "init_margin": "1500", "health": "0.97", "tier": 0,
    "mode": "cross", "pm_enabled": false,
    "positions": [
      { "asset": 0, "size": "600", "entry": "62000", "upnl": "441",
        "isolated": false, "lev": 7, "side": "long" }
    ],
    "balances": { "usdc": "10000", "spot": { "MTF": { "total": "12.5", "hold": "0" } } }
  }
}
```

- Les scalaires de marge (`account_value` / `free_collateral` / `maint_margin` /
  `init_margin` / `health`) sont des chaînes décimales en **USDC entiers**,
  identiques aux `MarginScalars` de la lecture REST du compte ; `tier` est
  l'indice de palier de liquidation, `mode` la valeur par défaut du compte,
  `pm_enabled` indique si la marge de portefeuille est activée.
- `positions[]` — une entrée par position perp ouverte : `asset` (identifiant
  numérique), `size` (chaîne signée en plan 1e8), `entry` / `upnl` (USDC
  entiers), `isolated`, `lev` et `side` (`long` / `short`, présent en mode
  couverture).
- `balances` — `{usdc, spot}` : `usdc` est la garantie de cotation (USDC
  entiers) ; `spot` mappe token → `{total, hold}`.

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque l'état du compte a effectivement changé depuis le dernier commit ; un compte inchangé n'émet rien à ce commit.

:::warning
`account_state` est une donnée par compte, mais ne dispose actuellement d'**aucune authentification** — n'importe quelle connexion peut s'abonner à n'importe quelle adresse. Ne le traitez pas comme privé tant que la vérification d'authentification à l'abonnement n'est pas en place.
:::

### État de la chambre de compensation spot par compte {#spot_state}

État de la chambre de compensation **SPOT** par compte — les soldes spot par token pour un compte — poussé lorsqu'ils changent. Exige `user`. L'instantané initial est l'ensemble des soldes en direct (`[]` pour un compte sans avoirs spot).

```json
{ "method": "subscribe", "subscription": { "type": "spot_state", "user": "0x<address>" } }
```

```json
{
  "channel": "spot_state",
  "data": {
    "address": "0x<addr>",
    "balances": [
      { "asset": 1, "name": "USDC", "total": "2500", "hold": "100" },
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ]
  }
}
```

- `balances[]` — une entrée par token spot détenu : `asset` (identifiant numérique), `name` (symbole du token), `total` (chaîne décimale en token entier), `hold` (montant réservé par les ordres spot au repos). Identique à la lecture REST des soldes spot.

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque les soldes spot ont effectivement changé depuis le dernier commit ; un compte inchangé n'émet rien à ce commit.

### Paiements de financement réalisés par compte {#user_fundings}

**Paiements de financement réalisés** par compte — un enregistrement à chaque
règlement de financement contre le compte sur un marché. Exige `user` (l'adresse
0x ; `address` est également accepté) — PAS un `coin`. Le `data` de chaque trame
est un tableau d'enregistrements de financement issus du règlement tout juste
validé ; l'instantané initial est `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_fundings", "user": "0x<address>" } }
```

```json
{ "channel": "user_fundings", "data": [
  { "coin": "BTC", "payment": "-0.42", "szi": "600", "fundingRate": "0.0001", "time": 1735689600123 }
] }
```

- `coin` — symbole du marché sur lequel le paiement a été réglé.
- `payment` — le montant de financement appliqué, chaîne décimale **USDC entiers**, **signée** : négatif = le compte a payé, positif = le compte a reçu.
- `szi` — la taille de position signée sur laquelle le paiement a été calculé (unités de base).
- `fundingRate` — le taux par actif appliqué lors de ce règlement (chaîne décimale).
- `time` — horodatage du règlement (consensus ms).

### En-tête du dernier bloc validé {#explorer_block}

En-tête de bloc le plus récent validé, poussé à chaque nouveau bloc. Aucun
paramètre `coin` / `user`. Le `data` de chaque trame est un tableau (le ou les
en-têtes tout juste validés) ; `is_snapshot: true` sur la première trame après
l'abonnement.

```json
{ "method": "subscribe", "subscription": { "type": "explorer_block" } }
```

```json
{ "channel": "explorer_block", "is_snapshot": true, "data": [
  { "height": 72399, "round": 72399, "epoch": 0, "proposer": 5,
    "hash": "0x3a0572f514cb6bf4517c40b1511728d460b4f7c9b98a68932c6801f5aee80dfd",
    "time": 1783009348137, "tx_count": 0 }
] }
```

- `height` / `round` — hauteur du bloc validé / round de consensus.
- `epoch` — époque de staking.
- `proposer` — indice du validateur proposant.
- `hash` — hash du bloc (préfixé `0x`).
- `time` — horodatage du bloc (consensus ms).
- `tx_count` — nombre de transactions dans le bloc.

### Transactions du dernier bloc {#explorer_txs}

Transactions du dernier bloc validé, poussées à chaque nouveau bloc. Aucun
paramètre `coin` / `user`. Le `data` de chaque trame est un tableau
d'enregistrements de transaction (vide pour un bloc sans transaction) ;
`is_snapshot: true` sur la première trame après l'abonnement.

```json
{ "method": "subscribe", "subscription": { "type": "explorer_txs" } }
```

```json
{ "channel": "explorer_txs", "is_snapshot": false, "data": [
  { "hash": "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c" }
] }
```

- Chaque ligne porte un champ `hash` — le hash d'action `0x` de la transaction —
  qui est **vide (`""`)** pour une entrée **systémique** (une action interne au
  moteur sans hash signé par un utilisateur). Un bloc sans transaction pousse
  `"data": []`.

---

## `post` — requête/réponse via WebSocket {#post--requestresponse-over-ws}

Ce n'est pas un canal d'abonnement, mais la manière d'effectuer des lectures ponctuelles et des écritures signées sur le même socket. La `request` est la même enveloppe `{type, payload}` que les routes REST ; elle est dispatchée via les gestionnaires identiques (`POST /info`, `POST /exchange`). Voir [`post` dans le README WebSocket](./index.md#post-requestresponse-over-ws) pour les formes complètes de requête/réponse et les règles de signature.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

Il s'agit du chemin pris en charge pour les lectures authentifiées et pour la soumission d'actions signées via WebSocket aujourd'hui.

---

## Feuille de route — non encore disponible {#roadmap--not-yet-available}

Les canaux suivants ont figuré dans des versions préliminaires antérieures mais **ne sont pas implémentés** sur la surface WS du nœud. Ce ne sont pas des noms de canaux reconnus ; tenter de s'y abonner retourne une erreur `unknown channel`. Listés ici pour éviter que les intégrateurs ne soient induits en erreur par d'anciens stubs de SDK.

- **Données de marché publiques :** `meta` (métadonnées de l'univers), `mark` (prix mark/oracle), `fundingTicks` (mises à jour du taux de financement).
- **Par utilisateur (nécessiterait une authentification) :** `vaultEvents`, `rfqEvents`.

Également non implémentés aujourd'hui :

- **`l2_book` basé sur des diffs** (trames `updates` partielles) — le `l2_book` actuel envoie toujours des corps complets des 20 premiers niveaux. La trame porte bien un drapeau `is_snapshot` (`true` sur l'instantané initial, `false` sur les poussées pilotées par les changements), mais chaque corps est un instantané complet — il n'y a pas de trames `updates` avec diffs partiels.
- **`seq` / `resume` / tokens de reprise** — chaque (ré)abonnement repart d'un instantané frais.
- **Enveloppe d'authentification à l'abonnement** pour les canaux privés — utilisez `post` avec une action signée pour les opérations authentifiées.

---

## Ordre et livraison {#ordering--delivery}

- **Par abonnement**, les trames arrivent dans l'ordre des commits (une trame n'est émise que sur les commits où l'état du canal surveillé a changé). Il n'y a pas de `seq` ; l'ordonnancement est implicite dans l'ordre d'arrivée sur le socket unique.
- **Entre abonnements**, il n'y a aucune garantie d'ordre — l'entrelacement est arbitraire. Démultiplexez sur `channel` + le `coin` dans `data`.
- La livraison est **au plus une fois par changement** et **non mise en tampon pour la reprise** : un abonnement qui prend plus de 256 trames de retard est abandonné avec une trame d'erreur `lagged` (voir [Contre-pression et retard](./index.md#backpressure--lag)). Réabonnez-vous pour récupérer ; vous obtenez un instantané frais.

## Voir aussi {#see-also}

- [README WebSocket](./index.md) — cycle de vie de la connexion, trames, paramètre coin, `post`, contre-pression
- [`POST /info`](../rest/info.md) — équivalents REST pour les lectures ponctuelles (accessibles également via `post`)
- [`POST /exchange`](../rest/exchange.md) — enveloppe d'action signée partagée par le chemin d'action `post`
