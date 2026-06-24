# Mode de couverture (positions bilatérales)

:::info
**En production.** Le basculement opt-in, le routage explicite des ordres par côté, la **marge indépendante par jambe** et le **reporting de position à deux jambes** sont disponibles : un compte peut passer en mode de couverture (lorsqu'il est à plat), router chaque ordre vers une jambe explicite via `position_side`, et chaque jambe dépose sa propre marge et s'affiche comme son propre objet de position. La **liquidation par jambe** est partiellement en place : lorsqu'un compte est signalé pour une fermeture forcée, les deux jambes sont analysées et évaluées, et l'ordre de fermeture déterministe (la jambe à maintenance la plus élevée en premier) est calculé de manière identique sur tous les validateurs — l'émission effective de fermeture par jambe contre le carnet d'ordres est encore en cours de déploiement. Le comportement par défaut et recommandé reste le mode unidirectionnel (une position nette unique par marché).
:::

## En bref

Par défaut, un compte détient **une position nette par marché** (mode unidirectionnel) : acheter en position courte réduit, puis inverse, la même position. Le **mode de couverture** permet à un compte de détenir **simultanément une jambe longue et une jambe courte sur le même marché**, suivies séparément.

Le mode de couverture est **opt-in par compte** sans **seuil de solde** — tout compte peut l'activer. Il ne peut être basculé que lorsque le compte est **à plat sur tous les marchés**.

## Unidirectionnel vs couverture

| | Unidirectionnel (défaut) | Couverture |
|---|---|---|
| Positions par marché | 1 nette (signée) | jusqu'à 2 (une jambe Longue + une jambe Courte) |
| « Acheter en position courte » | réduit, puis inverse la position nette | réduit uniquement la jambe **Courte** (ou ouvre/étend la jambe **Longue** — à votre choix) |
| Sélection du côté d'un ordre | déduite de achat/vente | `position_side` **explicite** (`long` / `short`) requis |
| Marge | une exigence nette | chaque jambe margée indépendamment |
| Liquidation | un prix de liquidation | chaque jambe évaluée selon sa propre maintenance ; ordre de fermeture déterministe en place, émission de fermeture par jambe en cours de déploiement |
| Reporting | un objet de position nette | un objet par jambe non nulle (chacune étiquetée `position_side`) |

Le basculement, le routage par côté, la marge indépendante par jambe et le reporting à deux jambes sont en production ; la sélection de liquidation par jambe est en place, l'émission de fermeture par jambe étant encore en cours de déploiement (voir la note de statut ci-dessus).

## Activation

Le changement de mode de position est une action signée ; il n'est autorisé que lorsque le compte est **à plat sur tous les marchés**.

```json
// activer le mode de couverture (uniquement autorisé lorsque à plat sur TOUS les marchés)
{ "type": "set_position_mode", "params": { "hedge": true } }
```

```json
// revenir en mode unidirectionnel (également uniquement lorsque à plat)
{ "type": "set_position_mode", "params": { "hedge": false } }
```

`hedge` est un booléen : `true` = couverture (bilatéral), `false` = unidirectionnel (valeur par défaut).
La condition préalable **à plat sur tous les marchés** est une règle de sécurité — le basculement avec une position ouverte est rejeté (une opération neutre qui ne modifie rien), afin qu'une position nette ne puisse jamais être silencieusement réinterprétée comme une jambe isolée. Définir le mode sur la valeur qu'il a déjà, en étant à plat, est une réussite sans effet.

Voir [`set_position_mode`](../api/rest/exchange.md#set_position_mode) dans la référence `/exchange` pour les détails requête/réponse.

## Placement d'ordres en mode de couverture

En mode de couverture, chaque ordre **doit comporter un `position_side` explicite** (`long` /
`short`). Un compte en mode unidirectionnel ne doit **pas** envoyer `position_side` ; un compte en mode de couverture le doit. Le champ figure dans le corps de l'ordre `submit_order` aux côtés de `side`, `reduce_only`, etc.

```json
{
  "type": "submit_order",
  "order": {
    "owner": "0x...aa", "market": 0, "side": "bid",
    "kind": "limit", "size": 100000000, "limit_px": 5000000000,
    "tif": "gtc", "stp_mode": "cancel_oldest",
    "reduce_only": false,
    "position_side": "long"
  }
}
```

| Intention | `side` | `position_side` | `reduce_only` |
|---|---|---|---|
| Ouvrir / ajouter à une position longue | `bid` | `long` | false |
| Réduire / clôturer une position longue | `ask` | `long` | true |
| Ouvrir / ajouter à une position courte | `ask` | `short` | false |
| Réduire / clôturer une position courte | `bid` | `short` | true |

`position_side` est **explicite, jamais déduit** — sinon un achat destiné à
*réduire une position courte* pourrait par erreur ouvrir ou accroître une position longue. `reduce_only` est
évalué **contre la jambe nommée uniquement** : un ordre `reduce_only` sur la jambe `short`
ne peut jamais toucher la jambe `long`.

Il n'y a **pas d'« inversion »** en mode de couverture. La fermeture de la jambe longue n'ouvre jamais une position courte —
cela correspond à un ordre distinct contre la jambe courte.

## Marge

Chaque jambe est margée **indépendamment** — la jambe longue et la jambe courte déposent
chacune leur propre marge initiale et de maintenance, additionnées dans l'exigence du compte :

```
required_margin = init_margin(long_leg) + init_margin(short_leg)
```

Cette approche est délibérément conservatrice : un long+court sur un même marché est delta-neutre
en termes de prix, mais chaque jambe immobilise tout de même de la marge. (Une future mise à jour pourra proposer
un crédit de compensation pour les jambes en sens inverse dans le cadre de la [marge de portefeuille](./portfolio-margin.md) ;
d'ici là, ne détenez les deux jambes que si vous souhaitez des expositions genuinement séparées, par exemple
des prix d'entrée différents que vous entendez gérer indépendamment.)

Chaque jambe conserve son propre [mode de marge](./margin-modes.md) — vous pouvez, par exemple,
opérer la jambe longue en marge isolée et la jambe courte en marge croisée.

## Liquidation

Lorsqu'un compte est signalé pour une fermeture forcée, les deux jambes sont analysées et évaluées selon
leur propre contribution à la maintenance, et l'ordre de fermeture déterministe — la jambe à
**maintenance la plus élevée en premier** (à égalité : le long avant le court), identique sur tous les
validateurs — est calculé via l'échelle standard de [liquidation par paliers](./tiered-liquidation.md).
L'émission effective de fermeture par jambe contre le carnet d'ordres est encore en cours de déploiement ; lorsqu'elle sera
disponible, la liquidation d'une jambe ne touchera pas l'autre.

## Reporting

Lorsque le mode de couverture est actif, l'état du compte et les lectures de positions `/info` retournent **un
objet de position par jambe non nulle** pour un marché ayant les deux jambes, chacune étiquetée
avec son `position_side` (`"long"` / `"short"`). Un compte en mode unidirectionnel retourne une
seule position *nette* sans champ `position_side`, exactement comme aujourd'hui.
L'intérêt ouvert au niveau du marché reste une valeur nette unique. Voir
[`account_state` positions](../api/rest/info.md#account_state).

## Voir aussi

- [Modes de marge](./margin-modes.md) — croisé / isolé / iso-strict, appliqués par jambe
- [Marge de portefeuille](./portfolio-margin.md) — où vivra le crédit futur de compensation des jambes
- [Liquidation par paliers](./tiered-liquidation.md) — échelles par jambe
- [Référence `/exchange`](../api/rest/exchange.md#set_position_mode) — le format filaire de l'action

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Dois-je utiliser le mode de couverture ?**
R : Non. Le mode unidirectionnel (net) est le mode par défaut et fonctionne exactement comme avant ; le mode de couverture est purement opt-in.

**Q : Y a-t-il un solde minimum pour l'activer ?**
R : Aucun seuil — tout compte peut basculer en mode de couverture lorsqu'il est à plat.

**Q : Pourquoi ne puis-je pas basculer si j'ai une position ouverte ?**
R : Pour éviter qu'une position nette existante ne devienne une jambe ambiguë et isolée.
Clôturez vos positions, puis basculez.

**Q : Un long + court de taille égale coûte-t-il le double de marge ?**
R : Oui — les jambes sont margées indépendamment, ainsi un long+court en compensation immobilise
la marge des deux jambes. Le crédit de compensation pour les jambes en sens inverse est une amélioration ultérieure
(dans le cadre de la [marge de portefeuille](./portfolio-margin.md)).

</details>
