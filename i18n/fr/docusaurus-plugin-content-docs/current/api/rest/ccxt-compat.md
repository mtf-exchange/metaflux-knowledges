# Surface REST compatible CCXT

:::info
**Aperçu.** Un **sous-ensemble REST de 9 méthodes** est disponible dès aujourd'hui, chacune renvoyant exactement la structure unifiée [CCXT](https://docs.ccxt.com/). **L'analyse des symboles, la recherche de marché et l'authentification JWT sont opérationnelles** ; les champs monétaires sont des valeurs fictives (`"0.0"` / tableaux vides / ids `0`) jusqu'à l'arrivée du canal de lecture gateway → nœud. CCXT Pro (WS) est en préparation.
:::

## En bref

Pour les frameworks quant qui parlent déjà le protocole CCXT — pointez l'URL de base de l'exchange vers la gateway MetaFlux. La structure du protocole correspond aux attentes de CCXT pour les méthodes prises en charge. Utilisez cette surface si vous disposez déjà d'une intégration CCXT ; pour les nouveaux clients, commencez par [HL-compat](./hl-compat.md) ou [MTF-native](./exchange.md).

Comme [HL-compat](./hl-compat.md), cette surface vit **uniquement sur la gateway** — elle traduit les lectures MTF-natives du nœud en structures unifiées CCXT. Le nœud lui-même est MTF-natif (voir [`/info`](./info.md)) ; les structures CCXT ne transitent jamais par le nœud.

## URL

```
https://<gateway>/ccxt/<path>
```

Toutes les routes CCXT sont montées sous le préfixe `/ccxt/` (pour les distinguer de la surface MTF-native par défaut `/info` + `/exchange` et de la surface HL-compat `/hl/*`). Une requête vers un chemin sans préfixe (`/markets`) renvoie 404 — le préfixe est obligatoire.

## Méthode CCXT → route → lecture MTF-native du nœud

Les 9 méthodes REST disponibles aujourd'hui, ainsi que l'amorçage de l'authentification. La **traduction** est : structure-unifiée-CCXT ← MTF-natif du nœud : snake_case → camelCase CCXT, id de marché `u32` → symbole CCXT `BASE/QUOTE:SETTLE`, magnitudes entières → chaînes décimales.

| Méthode CCXT | Route | Auth | Statut | Source MTF-native du nœud |
|-------------|-------|------|--------|------------------------|
| `fetchMarkets` | `GET /ccxt/markets` | non | structure opérationnelle ; fixture genesis statique | [`markets`](./info/perpetuals.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | non | structure opérationnelle ; prix fictifs | [`market_info`](./info/perpetuals.md#market_info) + mid |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | non | structure opérationnelle ; carnet vide | [`l2_book`](./info/perpetuals.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | non | non servi | Historique OHLCV — indexeur gateway (feuille de route) |
| `createOrder` | `POST /ccxt/orders` | Bearer | structure opérationnelle | → [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | structure opérationnelle | → [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | structure opérationnelle ; soldes fictifs | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | structure opérationnelle ; positions fictives | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | adossé au nœud ; structure opérationnelle | [`user_fills`](./info.md#user_fills) |
| — amorçage auth — | `POST /ccxt/auth` | non | opérationnel | Connexion EIP-712 → JWT |

Légende : **structure opérationnelle** = route montée, structure CCXT correcte renvoyée, champs monétaires fictifs en attente du canal de lecture · **adossé au nœud** = la lecture sous-jacente du nœud est active · non servi = pas encore de nœud sous-jacent, servi par l'indexeur gateway (feuille de route).

:::warning
**La surface est volontairement minimale.** Les méthodes que CCXT définit mais que la gateway ne monte pas encore — `fetchTickers`, `fetchTrades` (flux public), `fetchOrder`, `fetchOpenOrders`, `fetchClosedOrders`, `fetchOHLCV` au-delà du stub, `setLeverage`, `setMarginMode`, `fetchFundingRate`, `cancelAllOrders` — retournent 404. Elles seront attachées sous `/ccxt/` au fur et à mesure que le canal de lecture s'étend. `fetchOpenOrders` / `fetchOrder` traduiront depuis les lectures nœud [`open_orders`](./info.md#open_orders) / [`order_status`](./info.md#order_status) ; `fetchTrades` traduira depuis le flux nœud [`recent_trades`](./info/perpetuals.md#recent_trades) ; `fetchOHLCV` / `fetchClosedOrders` ne sont pas encore servis (feuille de route indexeur gateway).
:::

## Format des symboles

CCXT utilise `"BASE/QUOTE:SETTLE"` pour les dérivés. Les marchés de contrats perpétuels MetaFlux s'affichent ainsi :

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

Les marchés au comptant (une fois qu'un univers spot sera disponible) utilisent `"BASE/QUOTE"` sans le suffixe `:SETTLE`. Le registre de marchés actuel est une **fixture genesis statique** (`with_genesis_markets` — les contrats perpétuels genesis) ; un registre adossé à gRPC qui se rafraîchit depuis la lecture [`markets`](./info/perpetuals.md#markets) du nœud sera activé avec le canal de lecture. L'analyse des symboles est **réelle** : symboles malformés → 400, symboles inconnus → 400.

## Intervalles de temps

`fetchOHLCV` accepte les jetons standard de CCXT : `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`. Les intervalles invalides retournent 400. L'historique OHLCV n'est pas encore servi — réponse vide mais conforme à la structure pour l'instant (feuille de route indexeur gateway) ; utilisez le canal WS [`candle`](../ws/subscriptions.md) pour les données en temps réel.

## Authentification

Les méthodes authentifiées (`createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`) nécessitent un **jeton Bearer JWT**. Il n'existe qu'**un seul** schéma d'authentification — un JWT émis depuis une enveloppe de connexion EIP-712. (Pas de schéma HMAC `X-API-KEY`.)

### 1. Connexion — `POST /ccxt/auth`

Envoyez une enveloppe de connexion signée EIP-712 ; recevez un JWT de session. L'enveloppe reflète le `SignedEnvelope` du nœud — la gateway recalcule le condensat EIP-712 sur `(address, nonce, expiry)` et vérifie la signature, puis émet un JWT HS256 dont le `sub` est l'adresse.

```bash
curl -X POST https://gateway/ccxt/auth \
  -H 'content-type: application/json' \
  -d '{
    "address":   "0x<addr>",
    "nonce":     1735689600000,
    "expiry":    1735689660000,
    "signature": "<base64 65-byte r||s||v>"
  }'
```

```json
{ "token": "<jwt>", "expiresAt": 1735693200 }
```

| Champ de l'enveloppe | Type | Remarques |
|----------------|------|-------|
| `address` | `0x` hex | Adresse EVM revendiquant la connexion |
| `nonce` | u64 | Nonce de protection contre les rejeux (vérifié au niveau du nœud ; le JWT est le jeton de session) |
| `expiry` | u64 ms | Enveloppe rejetée au-delà de cette valeur |
| `signature` | base64 | 65 octets `r‖s‖v` (convention EVM), encodés en base64 |

Consultez le [guide de signature](../../integration/signing.md) pour la construction du condensat EIP-712.

### 2. Appel — `Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

Les jetons manquants, expirés ou avec une signature incorrecte sont rejetés avec `401`. L'adresse `sub` du JWT restreint chaque lecture/écriture authentifiée à ce compte.

## Exemples

### Récupérer les marchés

```bash
curl https://gateway/ccxt/markets
```

```json
[
  {
    "id":           "BTC-PERP",
    "symbol":       "BTC/USDC:USDC",
    "base":         "BTC",
    "quote":        "USDC",
    "settle":       "USDC",
    "type":         "swap",
    "swap":         true,
    "spot":         false,
    "linear":       true,
    "contract":     true,
    "contractSize": 1,
    "precision":    { "price": 8, "amount": 8 },
    "limits":       { "amount": { "min": 0.0001 }, "price": { "min": 0.01 } },
    "maker":        0.0002,
    "taker":        0.0005,
    "active":       true
  }
]
```

### Récupérer le ticker

```bash
curl 'https://gateway/ccxt/ticker?symbol=BTC/USDC:USDC'
```

```json
{
  "symbol":      "BTC/USDC:USDC",
  "bid":         "0.0",
  "ask":         "0.0",
  "last":        "0.0",
  "high":        "0.0",
  "low":         "0.0",
  "open":        "0.0",
  "close":       "0.0",
  "baseVolume":  "0.0",
  "quoteVolume": "0.0"
}
```

Les champs monétaires sont des stubs `"0.0"` pour l'instant ; le canal de lecture les alimentera depuis le mid du nœud / [`market_info`](./info/perpetuals.md#market_info). La structure CCXT est conforme octet par octet, de sorte que les clients désérialisent correctement dès maintenant et obtiennent de vraies valeurs de manière transparente par la suite.

### Récupérer le carnet d'ordres

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` sont des tableaux `[[price, amount], …]` (structure CCXT). La troncature par `limit` s'appliquera une fois que les niveaux réels arriveront depuis [`l2_book`](./info/perpetuals.md#l2_book).

### Passer un ordre

```bash
curl -X POST https://gateway/ccxt/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "symbol": "BTC/USDC:USDC",
    "type":   "limit",
    "side":   "buy",
    "amount": "1.0",
    "price":  "100.5",
    "params": { "timeInForce": "GTC", "reduceOnly": false }
  }'
```

Réponse (objet ordre CCXT) :

```json
{
  "id":            "12345",
  "clientOrderId": null,
  "symbol":        "BTC/USDC:USDC",
  "type":          "limit",
  "side":          "buy",
  "price":         100.5,
  "amount":        1.0,
  "filled":        0.0,
  "remaining":     1.0,
  "status":        "open",
  "timestamp":     1735689600000,
  "fee":           { "currency": "USDC", "cost": 0.0 },
  "info":          { /* raw chain response */ }
}
```

`createOrder` traduit l'ordre CCXT en écriture [`/exchange`](./exchange.md) sous le compte `sub` du JWT.

### Annuler un ordre

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## Erreurs

La surface CCXT-compat retourne des codes de statut HTTP appropriés (et non la convention HL 200-avec-`status`), avec des corps d'erreur nommés selon CCXT pour que les SDK clients les acheminent vers la bonne classe d'exception :

| HTTP | Corps | Cause |
|------|------|-------|
| 400 | `{"error":"<message>"}` | Symbole malformé/inconnu, paramètres incorrects, intervalle de temps invalide |
| 401 | `{"error":"<message>"}` | Jeton Bearer manquant, expiré ou avec une signature incorrecte |
| 404 | — | Route inconnue / chemin sans préfixe / méthode non montée |

## CCXT Pro (WebSocket) — prévu

Une mise à niveau WS à 5 canaux (`GET /ccxt/ws`) est en cours d'élaboration ; la couverture complète reflète le REST :

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

Consultez les [abonnements WS](../ws/subscriptions.md) pour les canaux sous-jacents — CCXT Pro les traduit un pour un.

## Limitations par rapport à la spécification CCXT complète

- **Les champs monétaires sont des stubs** (`"0.0"` / tableaux vides / ids `0`) sur chaque méthode à structure opérationnelle, jusqu'à l'arrivée du canal de lecture gateway → nœud. La structure est définitive ; seules les valeurs sont en attente.
- **`fetchMyTrades`** est désormais adossé au nœud (le flux de trades validés par compte). L'**historique OHLCV** (`fetchOHLCV`) et le futur `fetchClosedOrders` ne sont pas encore servis — prévus pour l'indexeur gateway (feuille de route). Utilisez en attendant les canaux WS [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md) pour les données en temps réel.
- **Pas d'authentification par clé API HMAC.** Seul le schéma EIP-712 → JWT décrit ci-dessus est pris en charge. Les clients conservent la garde de leurs clés — la gateway n'escrow aucun secret.

## Voir aussi

- [HL-compat](./hl-compat.md) — l'autre surface de compatibilité
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md) — MTF-natif (source de ces traductions)
- [Abonnements WS](../ws/subscriptions.md) — sous-jacent CCXT Pro
- [Guide de signature](../../integration/signing.md) — enveloppe de connexion EIP-712
- [Limites de débit](../rate-limits.md)
