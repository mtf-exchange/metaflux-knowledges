# Enchères par lots fréquentes (FBA)

:::info
**Aperçu.** Activation par marché via [MIP-3](../mip/mip-3.md) ; tous les marchés ne fonctionnent pas en FBA.
:::

## Résumé

Le FBA remplace le matching continu par des enchères discrètes par lots toutes les `batch_interval_ms`. Les ordres mis en attente au sein d'un lot sont exécutés simultanément à un prix de liquidation uniforme unique. Cela neutralise le MEV basé sur la latence : être une microseconde plus rapide ne procure aucun avantage.

## Continu vs par lots

| Propriété | CLOB continu | FBA |
|-----------|--------------|-----|
| Cadence de matching | À chaque arrivée d'ordre | Toutes les `batch_interval_ms` |
| Découverte des prix | Par transaction | Par lot (un prix de liquidation unique) |
| Valeur de la latence | Élevée (premier arrivé en cas d'égalité de prix) | Nulle au sein d'un lot |
| Surplus lié à la latence | Capturé par les HFT | Redistribué aux participants via le prix uniforme |
| Visibilité des ordres publics | Pré-transaction (carnet d'ordres en attente) | Pré-lot (file d'attente visible) |

## Mécanisme

```
lot t :        accepter les ordres pendant [t, t + batch_interval_ms)
fermeture t :  geler la file d'attente
               calculer le prix de liquidation p* :
                 p* = prix auquel |demande d'achat agrégée| = |offre de vente agrégée|
               exécuter tous les ordres croisés à p*
               reporter les ordres non croisés dans le lot t+1 (ou annuler selon TIF)
lot t+1 :      ouverture
```

Règles de liquidation :
- Tous les achats avec un prix ≥ p* sont exécutés à p*.
- Toutes les ventes avec un prix ≤ p* sont exécutées à p*.
- Le prix de liquidation unique p* maximise le volume total exécuté (équivalent à l'intersection des courbes de demande et d'offre).

Le prix d'exécution est **uniforme** pour tous les participants du lot — personne n'est exécuté à un prix moins favorable du simple fait d'être arrivé plus tard.

## Quand utiliser le FBA

| Classe d'actif | Mode par défaut | Raison |
|----------------|-----------------|--------|
| Perps majeurs (BTC, ETH) | CLOB continu | Liquide ; les avantages de latence sont faibles par rapport au spread |
| Inscriptions à longue traîne (MIP-3) | FBA optionnel | Carnet peu profond ; la toxicité HFT l'emporte sur la fourniture de liquidité |
| Paires au comptant | CLOB continu | Convention |
| Index / produits structurés | FBA | La tarification composite nécessite une liquidation synchrone |

Le mode de matching de chaque marché est indiqué dans [`market_info.fba_enabled`](../api/rest/info/perpetuals.md#market_info). Les marchés avec FBA activé acceptent à la fois les `FbaOrder` (ciblant un lot spécifique) et [`submit_order`](../api/rest/exchange.md#submit_order) (traités comme des ordres FBA pour le prochain lot). Consultez le [catalogue d'actions `/exchange`](../api/rest/exchange.md#action-catalog) — `FbaOrder` est un stub reconnu mais non mappé à ce jour.

## Intervalle de lot

Défaut : 1 seconde (10 blocs à 100 ms par bloc). Défini par gouvernance par marché dans `market_info.fba_batch_interval_ms`. Plage typique : 100 ms – 5 s.

Des intervalles plus courts réduisent l'attente mais augmentent le coût de calcul. La valeur par défaut d'1 seconde équilibre la neutralisation des HFT et l'expérience utilisateur.

## Structure d'un ordre

```json
{
  "type": "FbaOrder",
  "params": {
    "asset":     42,
    "side":      "Buy",
    "px":  "10050000000",
    "size":   "100000000",
    "batch_id":  9876,
    "cloid":     "0x..."
  }
}
```

`batch_id` indique le lot que l'ordre rejoint. L'identifiant du lot en cours est disponible dans [`market_info`](../api/rest/info/perpetuals.md#market_info) sous `fba_current_batch_id`. Les ordres avec `batch_id < current` sont rejetés (`{"error":"batch already closed"}`) ; les ordres avec un `batch_id` > current sont mis en file d'attente pour ce lot futur.

Omettre `batch_id` pour cibler le prochain lot — le serveur sélectionne automatiquement celui qui accepte actuellement des ordres.

## Exemple concret

Le lot t contient les ordres suivants pour l'actif 42 :

```
achats :
  bob:    5 @ 100.10
  alice:  3 @ 100.05
  carol:  2 @ 100.00

ventes :
  dave:   3 @ 99.95
  eve:    4 @ 100.00
  frank:  2 @ 100.05
```

Parcours de la demande (taille cumulée à chaque prix ≥ candidat) :

```
côté achat  cumulatif au prix ≥ p :
  100.10:  5
  100.05:  5+3 = 8
  100.00:  8+2 = 10
  99.95:   10  (aucun ici)
```

Parcours de l'offre (taille cumulée à chaque prix ≤ candidat) :

```
côté vente cumulatif au prix ≤ p :
  99.95:   3
  100.00:  3+4 = 7
  100.05:  7+2 = 9
  100.10:  9   (aucun ici)
```

Intersection : à p = 100.00, le cumulatif côté achat = 10, le cumulatif côté vente = 7. À p = 100.05, le cumulatif côté achat = 8, côté vente = 9. L'intersection se situe entre 100.00 et 100.05.

La règle de liquidation maximise le volume :

| p | min(achat, vente) |
|---|-------------------|
| 99.95  | min(10, 3) = 3 |
| 100.00 | min(10, 7) = 7 |
| 100.05 | min(8, 9)  = 8 |
| 100.10 | min(5, 9)  = 5 |

Le volume maximum exécuté est 8 à `p* = 100.05`. Ainsi :

- Tous les achats ≥ 100.05 sont exécutés : bob (5) + alice (3) = 8 BTC achetés à 100.05.
- Toutes les ventes ≤ 100.05 sont exécutées : dave (3) + eve (4) + frank (2) = 9 BTC proposés. Au prorata : 8/9 = 88,9 % de chacun → dave 2,67, eve 3,56, frank 1,78.
- Carol (achat 2 @ 100.00) n'est pas exécutée — reportée à t+1 ou expirée selon le TIF.

Tous les gagnants sont exécutés à 100.05. Bob ne reçoit pas un prix moins favorable pour être arrivé « plus tôt » — il n'y a pas d'antériorité dans le FBA.

## Équité lors de la liquidation

Lorsque l'offre > la demande à p*, le côté excédentaire est exécuté **au prorata** — chaque vendeur concerné obtient la même fraction. Pas de FIFO, pas de priorité de prix du côté en suroffre (tout le monde est déjà à p* ou à un meilleur prix).

C'est la propriété d'équité du FBA : au prix de liquidation, aucun participant n'obtient de meilleures conditions qu'un autre.

## Cas limites

<details>
<summary>Afficher les cas limites</summary>

- **Lot vide.** Aucun ordre → aucun événement de liquidation. Le lot suivant démarre immédiatement.
- **Lot unilatéral.** Uniquement des achats (ou uniquement des ventes). Pas de liquidation — tous les ordres sont reportés au lot suivant (Gtc) ou annulés (Ioc).
- **Égalité lors de la liquidation.** Lorsque deux prix maximisent tous deux le volume, le protocole choisit le prix le plus proche du mark précédent (réduit l'ambiguïté liée aux sauts de mark).
- **Ordres au marché dans le FBA.** Soumis en IOC à un prix extrême ; participent au lot et sont exécutés à p* s'ils croisent.
- **Reduce-only dans le FBA.** Vérifié à la fermeture du lot, par rapport à l'état post-exécution des positions remplies au sein du même lot. Liquidé atomiquement.

</details>

## Séquence

```
t=0.0s   batch_id = 9876 ouvre
t=0.2s   bob:    FbaOrder buy 5 @ 100.10, batch 9876
t=0.4s   alice:  FbaOrder buy 3 @ 100.05, batch 9876
t=0.5s   carol:  FbaOrder buy 2 @ 100.00, batch 9876
t=0.6s   dave:   FbaOrder sell 3 @ 99.95, batch 9876
t=0.7s   eve:    FbaOrder sell 4 @ 100.00, batch 9876
t=0.8s   frank:  FbaOrder sell 2 @ 100.05, batch 9876
t=1.0s   batch_id 9876 ferme ; liquidation déclenchée
         p* = 100.05 ; 8 BTC exécutés
         exécutions publiées sur le WS `trades` avec batch_id et "kind":"fba"
t=1.0s   batch_id = 9877 ouvre
```

## Interrogation

Le pool FBA en direct et la liquidation indicative sont exposés sur le chemin de lecture `/info` du nœud via [`fba_batch_state`](../api/rest/info.md#fba_batch_state) — consultez cette entrée pour la structure complète de la réponse et le tableau des champs. Il prend `market_id` (u32). Le FBA étant une activation par marché, un marché non enregistré ne retourne **pas une 404** — il renvoie un 200 avec des champs à zéro (`enabled:false`, `orders` vide, `indicative:null`).

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"fba_batch_state","market_id":42}'
```

```json
{
  "type": "fba_batch_state",
  "data": {
    "market_id":      42,
    "enabled":        true,
    "period_ms":      1000,
    "min_lot":        "1",
    "last_settle_ms": 1735689600000,
    "next_settle_ms": 1735689601000,
    "order_count":    11,
    "bid_count":      5,
    "ask_count":      6,
    "bid_size":       "1000000000",
    "ask_size":       "900000000",
    "orders":         [ /* {oid, owner, side, price, size, stp_group, submitted_at_ms} */ ],
    "indicative":     { "clearing_px": "10050000000", "matched_size": "800000000" }
  }
}
```

Les prix et tailles sont des chaînes d'entiers en **virgule fixe 1e8** brutes (plan carnet d'ordres / ordres). `next_settle_ms` est **dérivé** comme `last_settle_ms + period_ms`. Le bloc `indicative` correspond au prix uniforme maximisant le volume et à la taille matchée que le **prochain** lot *liquiderait* étant donné la fenêtre actuelle — calculé en lecture seule, pas encore réglé — et vaut `null` en l'absence de croisement (fenêtre unilatérale ou vide). Il s'agit de ce que serait p\* si le lot se fermait maintenant, ce qui est utile pour les traders qui décident s'ils souhaitent ajouter des ordres au lot.

## Voir aussi

- [Types d'ordres](./order-types.md)
- [Catalogue d'actions `/exchange`](../api/rest/exchange.md#action-catalog) — `FbaOrder` (stub reconnu mais non mappé à ce jour)
- [MIP-3](../mip/mip-3.md) — les marchés activent le FBA au déploiement
- [`market_info`](../api/rest/info/perpetuals.md#market_info) — vérifier `fba_enabled` par marché

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Le FBA ne sacrifie-t-il pas la découverte des prix ?**
R : Non — au sein d'un lot, le protocole découvre tout de même `p*` à partir des ordres des participants. La découverte se produit à une cadence fixe plutôt que de manière continue.

**Q : Pourquoi un lot d'1 s plutôt que 100 ms ?**
R : 100 ms est trop court pour neutraliser la latence de manière significative — même en 100 ms, les machines plus rapides peuvent resoumettre. 1 s offre une marge suffisante pour que la latence du réseau physique domine la latence intra-lot, éliminant ainsi l'avantage HFT.

**Q : Les marchés FBA peuvent-ils coexister avec les marchés CLOB ?**
R : Oui — chaque marché est indépendamment en mode FBA ou CLOB. Un compte peut détenir des positions sur les deux simultanément.

**Q : Le FBA réduit-il le coût en gas / calcul du matching ?**
R : Dans une certaine mesure. Le matching continu effectue un travail O(1) par arrivée ; le FBA effectue un travail O(N log N) à la fermeture du lot. Pour N ordres par lot, le FBA est comparable, avec l'avantage d'un coût par bloc plus prévisible.

</details>
