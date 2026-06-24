---
description: La grille tarifaire des contrats perpétuels MetaFlux — paliers de frais en fonction du volume, paliers de remise maker et paliers de réduction par staking, et comment les trois se combinent.
---

# Grille tarifaire

:::info
**Fiche tarifaire.** Cette page présente la grille de taux de trading de contrats perpétuels destinée aux utilisateurs.
Pour les mécanismes sous-jacents — comment les frais sont répartis, le flux de rachat et de distribution,
ainsi que les crédits de parrainage et de builder — consultez [Frais](./fees.md). Les valeurs de palier
sont des paramètres réseau et peuvent être mises à jour par la gouvernance.
:::

## Résumé

Votre taux effectif de trading de contrats perpétuels résulte de **trois systèmes de paliers indépendants
qui se cumulent** :

1. **Paliers de frais** — votre taux taker et maker de base, défini par votre volume total échangé sur les 30 derniers jours glissants.
2. **Paliers de remise maker** — une remise supplémentaire **soustraite de votre taux maker**, définie par votre part du volume maker total de l'exchange. Elle peut rendre votre taux maker net **négatif** (vous êtes payé pour apporter de la liquidité).
3. **Paliers de réduction par staking** — une réduction en pourcentage appliquée uniquement à votre **taux taker**, définie par le montant de MTF que vous avez staké.

Les trois paliers sont évalués en continu et s'appliquent simultanément. Les crédits de parrainage et de builder-code s'appliquent séparément, en supplément.

## 1. Paliers de frais (volume)

Vos taux taker et maker de base sont définis par votre **volume total échangé sur les 30 derniers jours glissants** (taker + maker, cumulé sur tous les marchés et l'ensemble de vos sous-comptes).

| Volume sur 30 jours | Taker | Maker |
|---------------------|------:|------:|
| `< $5M`             | 0,0350 % | 0,0100 % |
| `≥ $5M`             | 0,0300 % | 0,0080 % |
| `≥ $25M`            | 0,0270 % | 0,0060 % |
| `≥ $100M`           | 0,0250 % | 0,0040 % |
| `≥ $500M`           | 0,0220 % | 0,0020 % |
| `≥ $2B`             | 0,0200 % | 0,0000 % |

Le volume est mesuré en notionnel USDC. La fenêtre avance en continu — il n'y a pas de snapshot mensuel, de sorte qu'un trade qui franchit un seuil s'applique à votre prochain remplissage d'ordre.

## 2. Paliers de remise maker (part du volume maker)

En plus du taux maker issu de votre palier de frais, vous pouvez bénéficier d'une **remise maker supplémentaire** définie par votre **part du volume maker total de l'exchange** sur les 30 derniers jours glissants. La remise est **soustraite** de votre taux maker et peut faire passer votre taux maker net en dessous de zéro — ce qui signifie que l'exchange vous paie pour fournir de la liquidité.

| Part du volume maker | Remise maker supplémentaire |
|----------------------|----------------------------:|
| `≥ 0.5%`             | −0,0010 % |
| `≥ 1.5%`             | −0,0020 % |
| `≥ 3.0%`             | −0,0030 % |

Cette remise s'applique uniquement au **taux maker**. Elle n'affecte pas votre taux taker.

## 3. Paliers de réduction par staking (MTF staké)

Le staking de MTF confère une **réduction en pourcentage sur votre taux taker**. La réduction s'applique au taux taker uniquement — elle ne réduit jamais votre taux maker. L'échelle est une **grille administrative à dix échelons** évaluée sur votre **poids effectif pondéré dans le temps** (et non sur le nombre brut de tokens — consultez [Staking](./staking.md) pour le multiplicateur).

| Échelon | Poids effectif | Réduction taker | Cap de places |
|---------|---------------:|----------------:|---------------|
| Chef de section (Chef de canton)               | `> 100`        | 5 %  | illimité |
| Chef de section adjoint                        | `> 500`        | 8 %  | illimité |
| Chef de division (Chef de département)         | `> 2,000`      | 12 % | illimité |
| Chef de division adjoint                       | `> 8,000`      | 15 % | illimité |
| Directeur général (Maire)                      | `> 30,000`     | 20 % | illimité |
| Directeur général adjoint                      | `> 100,000`    | 25 % | illimité |
| Ministre (Gouverneur)                          | `> 500,000`    | 32 % | illimité |
| Vice-ministre (Vice-gouverneur)                | `> 1,500,000`  | 35 % | illimité |
| Conseiller d'État / Vice-Premier ministre      | `> 5,000,000`  | 40 % | illimité |
| Premier ministre / Président / Secrétaire général | `> 10,000,000` **et classé n° 1 par poids** | 50 % | **1 place** |

Les réductions progressent de façon monotone de **5 % à 50 %**, et les seuils de **100 à 10 000 000**.

### Deux filières : échelons illimités et place unique compétitive

L'échelle fonctionne selon **deux filières** :

- **Échelons à seuil (illimités).** Chaque échelon, à l'exception du grade le plus élevé, est un pur seuil : franchissez la barre de poids effectif et vous conservez l'échelon, sans limite quant au nombre de comptes éligibles. Les échelons **Adjoint** et **Ministre (Gouverneur)** sont tous des seuils purs et illimités.
- **Place compétitive (avec cap).** Seul l'échelon le plus élevé est **limité et compétitif** — vous devez à la fois franchir le seuil **et** être suffisamment bien classé :
  - **Premier ministre / Président / Secrétaire général** est le **compte unique classé n° 1** par poids effectif parmi ceux dépassant `10,000,000`. Il n'existe **qu'une seule place**.

  La place est attribuée **en temps réel** : si le titulaire réduit son staking ou si son poids effectif passe en dessous de celui d'un concurrent, la place **est immédiatement transférée au prochain compte qualifié le mieux classé**. Un compte qui franchit le seuil `> 10,000,000` sans remporter la place est maintenu au **grade illimité le plus élevé pour lequel il est qualifié** (Conseiller d'État / Vice-Premier ministre).

Consultez [Staking](./staking.md) pour savoir comment staker du MTF et comment le poids effectif est calculé. **Le staking flexible (sans blocage) porte un poids de 0×** et n'atteint donc jamais que le **grade le plus bas** (Chef de section) sans percevoir **aucun dividende** — c'est la filière délibérément conçue pour les market makers.

## Comment les trois paliers se combinent

Le palier de frais définit vos taux taker et maker de **base** à partir de votre volume. Les deux autres paliers viennent ensuite ajuster ces bases :

**Taux taker effectif** — la réduction par staking est appliquée au taux taker du palier de frais :

```text
effective_taker = fee_tier_taker × (1 − staking_discount)
```

**Taux maker effectif** — la remise maker est soustraite du taux maker du palier de frais (la réduction par staking ne s'applique **pas** au maker) :

```text
effective_maker = fee_tier_maker − maker_rebate
```

Un `effective_maker` négatif représente une remise versée **à** vous.

| Composante | Affecte le taker ? | Affecte le maker ? |
|------------|:------------------:|:------------------:|
| Palier de frais (volume)               | taux de base | taux de base |
| Remise maker (part maker)              | —            | soustraite   |
| Réduction par staking (MTF staké)      | multipliée   | —            |

## Exemples chiffrés

**Un staker Conseiller d'État / Vice-Premier ministre au palier de volume de base.**
Votre poids effectif dépasse `> 5,000,000` (Conseiller d'État / Vice-Premier ministre, 40 %
de réduction taker), mais votre volume sur 30 jours est inférieur à 5 M$ (palier de frais de base : taker 0,0350 %,
maker 0,0100 %).

```text
effective_taker = 0.0350% × (1 − 0.40) = 0.0210%
effective_maker = 0.0100% − 0.0000%    = 0.0100%
```

Vous payez **0,0210 % en taker** et **0,0100 % en maker**.

**Un top maker au palier de volume le plus élevé.**
Votre volume sur 30 jours est `≥ $2B` (palier de frais : taker 0,0200 %, maker 0,0000 %) et votre
part du volume maker est `≥ 3.0%` (remise −0,0030 %).

```text
effective_maker = 0.0000% − 0.0030% = −0.0030%
```

Votre taux maker net est **−0,0030 %** — l'exchange **vous verse 0,0030 %** du notionnel
sur chaque remplissage maker. Votre taux taker reste à 0,0200 % (moins toute réduction par staking).

**Cumul des trois paliers.**
Volume `≥ $100M` (taker 0,0250 %, maker 0,0040 %), part maker `≥ 1.5%` (remise
−0,0020 %), et staking Directeur général (Maire) (20 % de réduction taker) :

```text
effective_taker = 0.0250% × (1 − 0.20) = 0.0200%
effective_maker = 0.0040% − 0.0020%    = 0.0020%
```

Vous payez **0,0200 % en taker** et **0,0020 % en maker**.

## Au-delà de la grille tarifaire

Les crédits de parrainage et de builder-code s'appliquent **séparément**, en supplément de vos taux effectifs :

- **Parrainage** — lorsque vous avez un parrain, une part de vos frais taker lui est reversée depuis la commission du protocole ; il ne s'agit pas d'un surcoût pour vous.
- **Builder codes** — un apporteur de flux d'ordres (front-end, agrégateur) peut réclamer une part lorsque son adresse est renseignée sur l'ordre.

Consultez [Frais](./fees.md) pour les mécanismes complets — comment les crédits sont répartis et comment les frais collectés alimentent le rachat de MTF qui est brûlé et distribué aux stakers.

## Cas particuliers

<details>
<summary>Afficher les cas particuliers</summary>

- **Volume cumulé entre sous-comptes.** Un compte principal et l'ensemble de ses sous-comptes partagent un seul volume sur 30 jours et, par conséquent, un seul palier de frais. Un desk gérant de nombreuses stratégies sous un même compte principal bénéficie du palier agrégé.
- **Évaluation continue.** Les trois paliers sont réévalués sur une fenêtre glissante de 30 jours — il n'y a pas de coupure mensuelle. Le franchissement d'un seuil s'applique à votre prochain remplissage d'ordre.
- **La remise maker est financée par les frais taker.** Un taux maker net négatif est versé à partir des frais taker collectés sur le même flux. L'exchange ne verse jamais en remises maker davantage qu'il ne perçoit.
- **Réduction par staking et taux maker.** La réduction par staking s'applique au taker uniquement. Un staker Premier ministre / Président / Secrétaire général paie (ou perçoit) tout de même le taux maker complet ; seul le côté taker est réduit.
- **Le grade le plus élevé est compétitif.** Seul le grade le plus élevé (Premier ministre / Président / Secrétaire général, 1 place) est attribué par **classement**, et non par seuil seul. Franchir le seuil est nécessaire mais pas suffisant — si la place est déjà prise, vous conservez le grade illimité le plus élevé pour lequel vous êtes qualifié, jusqu'à ce qu'elle se libère. La place est réattribuée en temps réel à mesure que les poids effectifs évoluent.

</details>

## Voir aussi

- [Frais](./fees.md) — mécanismes des frais, flux de rachat et distribution, crédits de parrainage et de builder
- [Staking](./staking.md) — stakez du MTF pour débloquer les paliers de réduction taker
- [Trading au comptant](../products/spot.md) — les remplissages spot appliquent leurs propres taux par paire
