---
description: "Requêtes en lecture POST /info pour les marchés au comptant, la marge sur comptant avec effet de levier, et le pool de prêt Earn."
---

# `POST /info` — requêtes spot & marge

Requêtes en lecture pour les marchés [au comptant](../../../products/spot.md), la [marge sur comptant](../../../products/spot-margin.md) avec effet de levier, et le pool [Earn](../../../concepts/earn.md). Même endpoint `POST /info` et même enveloppe que la [page de base](../info.md).

## Types de requêtes spot, marge sur comptant & Earn

### `spot_meta`

Univers des paires au comptant + registre par jeton. Aucun paramètre.

```json
{ "type": "spot_meta" }
```

Réponse :

```json
{
  "type": "spot_meta",
  "data": {
    "pairs": [
      { "id": 100, "name": "USDC", "base": 100, "quote": 100, "taker_fee_bps": 0, "min_notional": "0", "active": true },
      { "id": 101, "name": "BTC",  "base": 101, "quote": 101, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 104, "name": "MTF",  "base": 104, "quote": 104, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true },
      { "id": 113, "name": "MTF/USDC", "base": 104, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true }
    ],
    "tokens": [
      { "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6 },
      { "id": 101, "name": "BTC",  "sz_decimals": 5, "wei_decimals": 8 },
      { "id": 102, "name": "ETH",  "sz_decimals": 4, "wei_decimals": 18 },
      { "id": 103, "name": "SOL",  "sz_decimals": 2, "wei_decimals": 9 },
      { "id": 104, "name": "MTF",  "sz_decimals": 2, "wei_decimals": 8 }
    ]
  }
}
```

:::info
**`pairs` contient deux types d'entrées.** Les « paires auto-référentes » par jeton (`id` =
id du jeton, `base == quote`, par ex. `100`/USDC, `101`/BTC, …, `104`/MTF) représentent
le registre des jetons projeté sous forme de paires ; les **vraies paires négociables** ont des ids `110+`
(`BTC/USDC`=110, `ETH/USDC`=111, `SOL/USDC`=112, `MTF/USDC`=113) avec des champs `base`/`quote` distincts
et `active:true`. Pour une paire auto-référente, le champ `active` indique si le carnet d'ordres
autonome de ce jeton est actif (seul USDC l'est, sur Devnet).
:::

| Champ | Type | Description |
|-------|------|-------------|
| `pairs[*].id` | uint32 | Id de la paire (`SpotPairSpec.pair_id`) ; `110+` = vraies paires `BASE/USDC` |
| `pairs[*].name` | string | Nom de la paire (ex. `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Id de l'actif de base / de cotation (identiques pour les paires auto-référentes) |
| `pairs[*].taker_fee_bps` | uint16 | Commission preneur (bps) ; `0` si non définie |
| `pairs[*].min_notional` | decimal string | Notionnel minimum (centimes USDC) ; `"0"` si non défini |
| `pairs[*].active` | bool | Indique si la paire est active pour les échanges |
| `tokens[*].id` | uint32 | Id d'actif au comptant (`100`=USDC, `101`=BTC, `102`=ETH, `103`=SOL, `104`=MTF) |
| `tokens[*].name` | string | Nom du jeton (ex. `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Précision d'affichage / de taille |
| `tokens[*].wei_decimals` | uint8 | Décimales natives du jeton (style ERC-20) : USDC=6, BTC=8, ETH=18, SOL=9, MTF=8 |

`tokens` et `pairs` sont triés selon l'ordre validé du `BTreeMap` (par id d'actif / de paire).

Source d'état : `Exchange.mip3_spot_pair_specs` (paires) + `Exchange.mip3_spot_token_specs` (jetons).

### `spot_clearinghouse_state`

Soldes des jetons au comptant par compte. Paramètre requis : `address` (hex 0x).

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

Réponse :

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "total": "10", "hold": "0" } ]
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `balances[*].asset` | uint32 | Id d'actif au comptant (`104` = MTF) |
| `balances[*].name` | string | Nom du jeton / de la paire, sinon `asset:<id>` |
| `balances[*].total` | decimal string | Solde total, tronqué vers zéro |
| `balances[*].hold` | decimal string | Montant bloqué en garantie d'ordres au comptant en attente (séquestre) ; disponible = `total − hold` |

L'ensemble des jetons est l'union des clés de solde et de séquestre (`reserved`) du compte —
un jeton intégralement bloqué avec un solde disponible nul apparaît quand même. Scanné par
plage par compte (pas un parcours complet de la table). Source d'état :
`locus.spot_clearinghouse.{balances, reserved}` (les deux indexés par `(owner, asset)`).

### `spot_margin_state`

:::info
**Disponible sur Devnet (aperçu).** Surface de lecture pour la [marge sur comptant](../../../products/spot-margin.md) avec effet de levier ; consultez la page produit pour les limitations de cette version aperçu.
:::

Toutes les positions de marge sur comptant détenues par un compte. Paramètre requis : `user` (hex 0x).

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

Réponse :

```json
{
  "type": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": 200,
        "collateral": "5",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ]
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `accounts[*].pair` | uint32 | Id de la paire au comptant sur laquelle porte la position |
| `accounts[*].collateral` | decimal string | Garantie de cotation déposée (tampon de perte) |
| `accounts[*].borrowed` | decimal string | **Principal** du prêt en cours (à l'index de snapshot) |
| `accounts[*].borrow_index_snapshot` | decimal string | Index d'emprunt du pool capturé à l'ouverture (base d'accumulation de la dette) |
| `accounts[*].base_held` | decimal string | Actif de base acheté à effet de levier mis en ségrégation (non inclus dans les soldes disponibles) |
| `accounts[*].current_debt` | decimal string | Dette accumulée à ce jour : `borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | `{ init_bps, maint_bps }` par paire ; `null` = marge non activée / non calibrée pour la paire |

Les positions sont listées dans l'ordre des ids de paire. Un compte sans position renvoie un tableau `accounts` vide.

### `earn_state`

:::info
**Disponible sur Devnet (aperçu).** Surface de lecture pour les pools de prêt [Earn](../../../concepts/earn.md) ; consultez la page produit pour les limitations de cette version aperçu.
:::

Tous les pools de prêt Earn, plus la participation d'un compte lorsque `user` est fourni. Paramètre optionnel : `user` (hex 0x).

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

Réponse :

```json
{
  "type": "earn_state",
  "data": {
    "pools": [
      {
        "asset": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": 1000,
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `pools[*].asset` | uint32 | Id de l'actif de cotation prêtable (clé du pool) |
| `pools[*].total_supplied` | decimal string | VNI du pool — principal déposé plus intérêts remboursés incorporés |
| `pools[*].total_borrowed` | decimal string | Cotation actuellement prêtée aux emprunteurs de marge sur comptant |
| `pools[*].idle` | decimal string | `total_supplied − total_borrowed` — plafond de retrait immédiat |
| `pools[*].shares_total` | decimal string | Total des parts en circulation |
| `pools[*].share_value` | decimal string | `total_supplied / shares_total` (`0` en l'absence de parts) |
| `pools[*].borrow_index` | decimal string | Index d'emprunt cumulé (base d'accumulation de la dette) |
| `pools[*].reserve_factor_bps` | uint16 | Part du protocole sur les intérêts d'emprunt (bps) |
| `pools[*].borrow_rate_bps_annual` | uint32 | Taux d'emprunt annualisé (bps) |
| `pools[*].reserve_accrued` | decimal string | Réserve protocolaire accumulée sur les intérêts |
| `pools[*].user_shares` | decimal string | **Uniquement avec `user`** — parts détenues par le compte dans le pool |
| `pools[*].user_value` | decimal string | **Uniquement avec `user`** — `user_shares × share_value` |

Les pools sont listés dans l'ordre des ids d'actif. Omettre `user` supprime les champs `user_shares` / `user_value`.

### `spot_deploy_state`

État de l'enchère de déploiement de paire au comptant MIP-1. Aucun paramètre.

```json
{ "type": "spot_deploy_state" }
```

Réponse :

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Tour en cours |
| `current_bid` | decimal string | Offre en tête |
| `current_winner` | hex address \| null | Actuel meilleur enchérisseur |
| `auction_end_ms` / `started_at_ms` | uint64 | Fenêtre d'enchère (ms de consensus) |
| `total_burned` | decimal string | Notionnel cumulé brûlé sur les offres gagnantes |
| `deposit` | decimal string | Total du dépôt en séquestre (unités de base) |

Source d'état : `Exchange.spot_pair_deploy_gas_auction`.


## Voir aussi

- [`POST /info`](../info.md) — l'endpoint de lecture de base (enveloppe, conventions, requêtes de compte et d'infrastructure)
- [Requêtes perpétuelles](./perpetuals.md) — lectures des marchés à terme perpétuels
- [Spot](../../../products/spot.md) / [Marge sur comptant](../../../products/spot-margin.md) — les produits
