# Canaux d'abonnement WebSocket

:::info
**État.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `fills`, `user_events`, `candles`, `order_updates`, `notifications`, `ledger_updates`, `active_asset_data`, `user_fundings`, `user_twap_slice_fills`, `user_twap_history`, `account_state`, `spot_state` et `web_data2` sont actifs et transmettent des données validées en temps réel — pilotés par les changements d'état, un canal n'émet une trame que lorsque son état a effectivement évolué depuis le dernier commit. Tout ce qui figure sous [Feuille de route](#feuille-de-route--non-encore-disponible) n'est pas câblé. Le cycle de vie de la connexion et le format des trames sont décrits dans le [README WebSocket](./index.md). Les canaux par marché (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) exigent un `coin` ; `candles` exige un `coin` **et** un `interval` ; les canaux par compte (`fills`, `user_events`) exigent un `user` (l'adresse 0x) ; `active_asset_data` exige **à la fois** un `user` et un `coin` ; `all_mids` n'en prend aucun.
:::

:::info
**Les noms de canaux sont en snake_case (natif MTF).** Il s'agit de la surface native du nœud `/ws`, donc les noms de canaux sur le fil sont en snake_case (`l2_book`, `user_events`, …). Les clients souhaitant utiliser les noms de canaux en camelCase HL (`l2Book`, `userEvents`, `userFills`, `candle`, …) se connectent au **`/hl/ws`** de la passerelle (compatibilité HL), qui traduit vers ces canaux snake_case natifs en dessous. Conformément au routage de la passerelle unifiée : `<net>-gateway.mtf.exchange/ws` = snake_case natif, `/hl/ws` = camelCase HL.
:::

Le protocole de trame reflète celui de HL ; les **noms de canaux sont en snake_case natif MTF**. L'abonnement s'effectue via :

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

Vous recevez ensuite un accusé de réception (`subscriptionResponse`), un instantané initial (`is_snapshot: true`), puis des poussées en direct pilotées par les changements `{"channel":...,"data":...}` (`is_snapshot: false`). Une poussée n'intervient que lorsque l'état de ce canal a effectivement changé depuis le dernier commit ; un canal inchangé n'émet rien. `coin` est **obligatoire** pour les canaux par marché (`l2_book`, `bbo`) ; voir [Paramètre coin](./index.md#coin-parameter) pour la manière dont il est canonicalisé (identifiant numérique d'actif ou symbole → clé d'identifiant d'actif).

## Aperçu de l'état des canaux

| Canal | État | Clé | Source en direct |
|---------|--------|:-------:|-------------|
| `l2_book` | **actif** | `coin` (obligatoire) | carnet d'ordres validé, à chaque changement |
| `bbo` | **actif** | `coin` (obligatoire) | carnet d'ordres validé, à chaque changement |
| `trades` | **actif** | `coin` (obligatoire) | exécutions du bloc validé, à chaque nouvelle exécution |
| `active_asset_ctx` | **actif** | `coin` (obligatoire) | prix mark/oracle, financement et intérêts ouverts par marché, à chaque changement |
| `all_mids` | **actif** | aucune | prix mark par marché, à chaque changement |
| `fills` | **actif** | `user`/`address` (obligatoire) | exécutions du bloc validé pour ce compte |
| `user_events` | **actif** | `user`/`address` (obligatoire) | exécutions du bloc validé pour ce compte (d'autres types d'événements à venir) |
| `candles` | **actif** | `coin` + `interval` (tous deux obligatoires) | exécutions du bloc validé agrégées en barres OHLCV, à chaque changement |
| `order_updates` | **actif** | `user`/`address` (obligatoire) | cycle de vie des ordres par compte (placement / exécution / annulation / rejet), à chaque changement |
| `notifications` | **actif** | `user`/`address` (obligatoire) | avis de marge / liquidation par compte, à chaque changement |
| `ledger_updates` | **actif** | `user`/`address` (obligatoire) | mouvements de fonds par compte (dépôt / retrait / transfert), à chaque changement |
| `active_asset_data` | **actif** | `user` **et** `coin` (tous deux obligatoires) | contexte d'effet de levier / mode de marge / taille max par (utilisateur, coin), à chaque changement |
| `user_fundings` | **actif** | `user`/`address` (obligatoire) | paiements de financement réalisés par compte, à chaque changement |
| `user_twap_slice_fills` | **actif** | `user`/`address` (obligatoire) | exécutions de tranches TWAP par compte (`{fill, twapId}`), à chaque changement |
| `user_twap_history` | **actif** | `user`/`address` (obligatoire) | cycle de vie TWAP par compte (`{time, state, status}` : activé / terminé / résilié), à chaque changement |
| `account_state` | **actif** | `user`/`address` (obligatoire) | état de la chambre de compensation PERP par compte — scalaires de marge, positions, soldes — à chaque changement |
| `spot_state` | **actif** | `user`/`address` (obligatoire) | état de la chambre de compensation SPOT par compte — soldes par token — à chaque changement |
| `web_data2` | **actif** | `user`/`address` (obligatoire) | instantané composite par compte pour l'interface — chambre de compensation + soldes spot + ordres ouverts + équités de coffre-fort + statut de l'exchange — à chaque changement |

Toute souscription à un `type` inconnu renvoie `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

---

## Canaux actifs

### `l2_book`

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

### `bbo`

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

### `trades`

Flux public des transactions pour un marché — un enregistrement par exécution sur ce marché, émis lors des commits où ce marché a effectivement tradé. `px`/`sz` sont des chaînes entières brutes en **plan 1e8** ; `side` est le côté du preneur (`"B"` achat / `"A"` vente) ; `time` est l'horodatage du bloc de consensus (ms) ; `tid` est un identifiant de transaction déterministe ; `users` est `[taker, maker]` (preneur en premier, l'agresseur).

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

```json
{ "channel": "trades", "data": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] } }
```

### `active_asset_ctx`

Contexte par marché pour un marché — prix mark / oracle, taux de financement et intérêts ouverts — poussé lors de ses changements. **Exige `coin`.** Le corps contient les mêmes champs et unités que la lecture REST [`market_info`](../rest/info/perpetuals.md#market_info) : `mark_px` / `oracle_px` sont en **USDC entiers**, arrondis au tick de prix (tronqués au tick de prix du marché), et le bloc `funding` reflète `market_info.funding`. Construit à partir du même générateur d'enregistrements par marché que la lecture REST, un push WS ctx ne diverge donc jamais de `market_info`.

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

### `all_mids`

Carte globale des prix médians — le prix mark de chaque marché, poussé lorsque les mids changent. Indexé par coin ; les valeurs sont le prix mark en USDC entiers arrondis au tick que la lecture REST [`markets`](../rest/info/perpetuals.md#markets) retourne. Aucun paramètre `coin`.

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### `fills` <a id="fills"></a>

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

### `user_events` <a id="userevents"></a>

Flux d'événements par compte. Exige `user` (l'adresse 0x) — PAS un `coin`. Il étiquette actuellement les `fills` ; d'autres types d'événements (liquidation, financement) arriveront comme clés sœurs.

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

Le nom natif du canal est `user_events` (snake_case) ; sur le `/hl/ws` de la passerelle (compatibilité HL), l'équivalent est `userEvents` de HL.

:::warning
`user_events` est une donnée par compte, mais ne dispose actuellement d'**aucune authentification** — n'importe quelle connexion peut s'abonner au flux de n'importe quelle adresse. Ne le traitez pas comme un canal privé tant que la vérification d'authentification à l'abonnement n'est pas en place ; pour les lectures/écritures authentifiées, utilisez `post` avec une action signée.
:::

### `candles`

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

Un store conserve jusqu'à **1 000 barres par série `(coin, interval)`** ; les séries froides (sans abonné) sont évincées, de sorte qu'un marché/intervalle non surveillé ne coûte rien. Sur le `/hl/ws` de la passerelle (compatibilité HL), le nom de canal équivalent est `candle` de HL (singulier).

### `order_updates`

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

- `status` ∈ `open` (au repos ; `sz` est le reliquat dans le carnet après le commit) / `filled` (un preneur porte `filled_sz` + `avg_px` cumulatifs ; une jambe faiseur rapporte le `filled_sz` par correspondance avec `status` toujours à `open` tant qu'une taille est au repos) / `canceled` / `rejected` (+`reason`, `oid` nul) / `cancel_rejected` (+`reason`).
- `limit_px` / `sz` / `orig_sz` / `avg_px` sont des chaînes décimales en plan 1e8 ; `time` est en consensus-ms ; les champs inconnus sont `null`.
- **Non émis** aujourd'hui : `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / les transitions TWAP et les annulations initiées par le moteur (BOLE T0) — l'observation de dispatch pour ceux-ci est un ok/err opaque sans charge utile par ordre.

### `notifications`

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

### `ledger_updates`

Mouvements de fonds par compte, attribués à leur **cause** (lue depuis la charge utile du bloc validé — un enregistrement n'apparaît que lorsque l'action s'est appliquée). Exige `user` ; instantané initial `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` ∈ `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (+`token`), `asset_send` / `asset_receive` (+`asset`, `to_perp`), `withdraw` (`via` : `cctp` | `metabridge`), `deposit` (`amount` peut être `null` pour un crédit CCTP entrant), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer`, `vault_transfer`. Un transfert émet un enregistrement par partie (émetteur + récepteur).
- Les montants sont des chaînes décimales en token entier, sauf `withdraw` via MetaBridge qui porte `amount_units` (unités de base brutes). Les montants de crédits de pont entrants et les actions retardées par CoreWriter (dispatchées dans un bloc ultérieur) ne sont pas encore attribuées.

### `active_asset_data`

Contexte de trading par (utilisateur, coin) — effet de levier, mode de marge et plafond de taille de transaction maximum actuel pour un compte sur un marché. Exige **à la fois** `user` (0x) et `coin`. L'instantané initial est le contexte en direct (valeurs par défaut à zéro lorsque le compte n'a pas de position), pas un tableau vide ; une poussée ne le réemet que lorsque ce contexte change.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "data": {
  "address": "0x<addr>", "asset_id": 0, "leverage": 7, "margin_mode": "isolated",
  "max_trade_size": "5000000000", "has_position": true } }
```

- `margin_mode` ∈ `cross` / `isolated` / `strict_iso` ; `max_trade_size` est le plafond de taille dérivé du plafond OI (chaîne de lots bruts) ; les champs sont identiques à la lecture REST [`active_asset_data`](../rest/info.md).

Sur le `/hl/ws` de la passerelle (compatibilité HL), le nom de canal équivalent est `activeAssetData` de HL, et la trame est traduite dans la forme camelCase de HL :

```json
{ "channel": "activeAssetData", "data": {
  "user": "0x<address>", "coin": "BTC", "leverage": 7,
  "maxTradeSzs": ["5.0", "5.0"], "availableToTrade": ["35000.00", "35000.00"] } }
```

- `user` — l'adresse 0x du compte ; `coin` — le symbole du marché.
- `maxTradeSzs` — `[achat, vente]` : la **taille** maximale négociable de chaque côté (unités de base), sous forme de chaînes décimales.
- `availableToTrade` — `[achat, vente]` : le notionnel **USD** disponible au trading de chaque côté, sous forme de chaînes décimales.

### `account_state`

État de la chambre de compensation **PERP** par compte — le résumé de marge, les positions ouvertes et les soldes pour un compte — poussé lorsqu'il change. Exige `user` (l'adresse 0x ; `address` est également accepté) — PAS un `coin`. Le corps est construit à partir du même générateur d'enregistrements que la lecture REST de compte ciblée, de sorte qu'une poussée WS ne diverge jamais de cette lecture. L'instantané initial est l'état en direct (mis à zéro pour un compte sans fonds), pas un tableau vide.

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

- Les scalaires de marge (`account_value` / `free_collateral` / `maint_margin` / `init_margin` / `health`) sont des chaînes décimales en **USDC entiers**, identiques aux `MarginScalars` de la lecture REST du compte ; `tier` est l'indice de palier de liquidation, `mode` la valeur par défaut du compte, `pm_enabled` indique si la marge de portefeuille est activée.
- `positions[]` — une entrée par position perp ouverte : `asset` (identifiant numérique), `size` (chaîne signée en plan 1e8), `entry` / `upnl` (USDC entiers), `isolated`, `lev` et `side` (`long` / `short`, présent en mode couverture).
- `balances` — `{usdc, spot}` : `usdc` est la garantie de cotation (USDC entiers) ; `spot` mappe token → `{total, hold}`.

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque l'état du compte a effectivement changé depuis le dernier commit ; un compte inchangé n'émet rien à ce commit.

:::warning
`account_state` est une donnée par compte, mais ne dispose actuellement d'**aucune authentification** — n'importe quelle connexion peut s'abonner à n'importe quelle adresse. Ne le traitez pas comme privé tant que la vérification d'authentification à l'abonnement n'est pas en place.
:::

### `spot_state`

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

### `web_data2`

Instantané **composite** par compte « tout pour le frontend » — le résumé de la chambre de compensation perp, les soldes spot, les ordres ouverts, les équités de coffre-fort et le statut global de l'exchange pour un compte, le tout en une seule trame, poussé lorsqu'il change. Exige `user` (l'adresse 0x ; `address` est également accepté) — PAS un `coin`. Le corps est l'identique octet-pour-octet du composite que retourne la lecture REST [`web_data2`](../rest/info.md#web_data2) (il compose les mêmes sous-lecteurs), de sorte qu'une poussée WS ne diverge jamais de cette lecture. L'instantané initial est le composite en direct (valeurs par défaut à zéro lorsque le compte n'a ni fonds ni positions ni ordres), pas un tableau vide.

```json
{ "method": "subscribe", "subscription": { "type": "web_data2", "user": "0x<address>" } }
```

```json
{
  "channel": "web_data2",
  "data": {
    "address": "0x<addr>",
    "clearinghouse": {
      "account_value": "10000",
      "margin_used": "300",
      "positions": [
        { "asset": 0, "size": "600", "entry_ntl": "2500", "mode": "cross", "lev": 10 }
      ]
    },
    "spot_balances": [
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ],
    "open_orders": [
      { "oid": 42, "market_id": 0, "side": "bid", "px": "6700000000000", "size": "10000000",
        "tif": "gtc", "cloid": "0xab..", "trigger": null, "inserted_at_ms": 1735689600123 }
    ],
    "vault_equities": [
      { "vault_id": 1, "vault_address": "0x<vault>", "shares": "1000", "equity": "1050" }
    ],
    "exchange_status": {
      "spot_disabled": false,
      "post_only_until_time_ms": 0,
      "post_only_until_height": 0,
      "scheduled_freeze_height": null,
      "mip3_enabled": true,
      "frozen": false,
      "replay_complete": true
    }
  }
}
```

Le composite contient exactement ces sections (chacune composée à partir du sous-lecteur correspondant, de sorte que les formes ne divergent jamais des lectures autonomes) :

- `address` — l'adresse 0x canonique en minuscules sur laquelle la trame est indexée.
- `clearinghouse` — le résumé du compte perp : `account_value` (valeur du compte croisé, chaîne décimale en USDC entiers), `margin_used` (Σ marge de maintenance utilisée par actif, en USDC entiers) et `positions[]`. Chaque ligne de position est `{asset, size, entry_ntl, mode, lev}` : `asset` est l'identifiant numérique du marché, `size` est la chaîne de taille signée en plan 1e8 (une ligne par jambe non nulle, donc un compte en mode couverture rapporte les deux jambes), `entry_ntl` est en USDC entiers, `mode` ∈ `cross` / `isolated` / `strict_iso`, `lev` est l'effet de levier maximum de la position. Les jambes de taille nulle sont omises.
- `spot_balances` — le tableau `balances` de [`spot_state`](#spot_state) / REST `spot_clearinghouse_state` : une entrée par token spot détenu, `{asset, name, total, hold}`.
- `open_orders` — le tableau `orders` de REST `frontend_open_orders` : une entrée par ordre au repos **et** par TP/SL garé / déclencheur stop, `{oid, market_id, side, px, size, tif, cloid, trigger, inserted_at_ms}`. `side` ∈ `bid` / `ask` ; `px` / `size` sont des chaînes décimales en plan 1e8 ; `tif` ∈ `alo` / `ioc` / `gtc` (ou `trigger` pour un stop garé hors carnet) ; `cloid` est l'identifiant d'ordre client ou `null` ; `trigger` est `null` pour un ordre de carnet ordinaire, sinon `{trigger_px, trigger_above}` (les stops garés portent également `is_parked: true`).
- `vault_equities` — le tableau `equities` de REST `user_vault_equities` : une entrée par coffre-fort dans lequel le compte détient des parts, `{vault_id, vault_address, shares, equity}` (`equity` est en USDC entiers, `shares` est une chaîne entière brute). Vide lorsque le compte ne suit aucun coffre-fort.
- `exchange_status` — les scalaires de statut de trading global (même corps que REST `exchange_status`) : `{spot_disabled, post_only_until_time_ms, post_only_until_height, scheduled_freeze_height, mip3_enabled, frozen, replay_complete}`. Ce bloc est identique pour tous les abonnés sur un commit donné.

Fréquence : pilotée par les changements — une trame n'est envoyée que lorsque le composite a effectivement changé depuis le dernier commit ; un commit qui laisse le composite de ce compte inchangé n'émet rien.

:::warning
`web_data2` est une donnée par compte, mais ne dispose actuellement d'**aucune authentification** — n'importe quelle connexion peut s'abonner à n'importe quelle adresse. Ne le traitez pas comme privé tant que la vérification d'authentification à l'abonnement n'est pas en place ; pour les lectures authentifiées, utilisez `post` avec une action signée.
:::

---

## `post` — requête/réponse via WebSocket

Ce n'est pas un canal d'abonnement, mais la manière d'effectuer des lectures ponctuelles et des écritures signées sur le même socket. La `request` est la même enveloppe `{type, payload}` que les routes REST ; elle est dispatchée via les gestionnaires identiques (`POST /info`, `POST /exchange`). Voir [`post` dans le README WebSocket](./index.md#post-requestresponse-over-ws) pour les formes complètes de requête/réponse et les règles de signature.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

Il s'agit du chemin pris en charge pour les lectures authentifiées et pour la soumission d'actions signées via WebSocket aujourd'hui.

---

## Feuille de route — non encore disponible

Les canaux suivants ont figuré dans des versions préliminaires antérieures mais **ne sont pas implémentés** sur la surface WS du nœud. Ce ne sont pas des noms de canaux reconnus ; tenter de s'y abonner retourne une erreur `unknown channel`. Listés ici pour éviter que les intégrateurs ne soient induits en erreur par d'anciens stubs de SDK.

- **Données de marché publiques :** `meta` (métadonnées de l'univers), `mark` (prix mark/oracle), `fundingTicks` (mises à jour du taux de financement).
- **Par utilisateur (nécessiterait une authentification) :** `vaultEvents`, `rfqEvents`.

Également non implémentés aujourd'hui :

- **`l2_book` basé sur des diffs** (trames `updates` partielles) — le `l2_book` actuel envoie toujours des corps complets des 20 premiers niveaux. La trame porte bien un drapeau `is_snapshot` (`true` sur l'instantané initial, `false` sur les poussées pilotées par les changements), mais chaque corps est un instantané complet — il n'y a pas de trames `updates` avec diffs partiels.
- **`seq` / `resume` / tokens de reprise** — chaque (ré)abonnement repart d'un instantané frais.
- **Enveloppe d'authentification à l'abonnement** pour les canaux privés — utilisez `post` avec une action signée pour les opérations authentifiées.

---

## Ordre et livraison

- **Par abonnement**, les trames arrivent dans l'ordre des commits (une trame n'est émise que sur les commits où l'état du canal surveillé a changé). Il n'y a pas de `seq` ; l'ordonnancement est implicite dans l'ordre d'arrivée sur le socket unique.
- **Entre abonnements**, il n'y a aucune garantie d'ordre — l'entrelacement est arbitraire. Démultiplexez sur `channel` + le `coin` dans `data`.
- La livraison est **au plus une fois par changement** et **non mise en tampon pour la reprise** : un abonnement qui prend plus de 256 trames de retard est abandonné avec une trame d'erreur `lagged` (voir [Contre-pression et retard](./index.md#backpressure--lag)). Réabonnez-vous pour récupérer ; vous obtenez un instantané frais.

## Voir aussi

- [README WebSocket](./index.md) — cycle de vie de la connexion, trames, paramètre coin, `post`, contre-pression
- [`POST /info`](../rest/info.md) — équivalents REST pour les lectures ponctuelles (accessibles également via `post`)
- [`POST /exchange`](../rest/exchange.md) — enveloppe d'action signée partagée par le chemin d'action `post`
