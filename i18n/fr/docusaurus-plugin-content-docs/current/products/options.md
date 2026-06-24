---
description: Options sur MetaFlux — un marché d'options d'achat/vente on-chain en cours de planification. Intention générale uniquement ; les spécifications du contrat et l'interface réseau ne sont pas encore finalisées.
---

# Options

:::info
**Planifié — pas encore spécifié.** Les options on-chain figurent dans la feuille de route de MetaFlux, mais la spécification du contrat (style de règlement, échéances, grille de prix d'exercice, mise en marge et actions réseau `/exchange`) **n'est pas finalisée et n'est pas publique**. Cette page décrit uniquement l'intention. Elle sera complétée avec les mécanismes concrets lorsque la conception sera publiée via un MIP. Ne vous en servez pas encore comme base de développement — il n'existe pas d'interface réseau engagée.
:::

## Qu'est-ce qu'une option ?

Une **option** est un contrat qui confère à son détenteur le droit — mais non l'obligation — d'acheter (un **call**) ou de vendre (un **put**) un actif sous-jacent à un **prix d'exercice** fixe à ou avant une **échéance** donnée. L'acheteur verse une **prime** au moment de l'achat ; le vendeur (émetteur) perçoit la prime et assume l'obligation correspondante. Les options permettent aux traders d'exprimer des anticipations directionnelles, des vues sur la volatilité et des stratégies de couverture, avec un risque à la baisse défini et limité à la prime versée pour les acheteurs.

## Orientation envisagée sur MetaFlux

L'objectif est de créer un **marché d'options entièrement on-chain** qui réutilise l'infrastructure existante de la plateforme là où cela est pertinent — le [carnet d'ordres](../concepts/order-types.md) et le moteur de correspondance, les [portefeuilles agents](../concepts/agent-wallets.md) pour la signature, la [valorisation mark/oracle](../concepts/mark-prices.md) pour l'évaluation et le règlement, ainsi que le module de [marge et liquidation](../concepts/tiered-liquidation.md) pour la collatéralisation des positions émises. La question de savoir si le règlement est en espèces ou en physique, le calendrier des échéances et le modèle de marge exact sont des choix de conception encore ouverts et en cours d'étude.

:::caution
Tant que la spécification n'est pas publiée, considérez toute information au-delà de cette page concernant les options MetaFlux comme non confirmée. La définition générale ci-dessus relève de la finance standard ; les mécanismes propres à MetaFlux ne sont pas encore arrêtés.
:::

## Frais

**Pas encore définis.** Lorsque les options seront disponibles, les frais de trading s'inscriront dans le [cadre tarifaire](../concepts/fees.md) de la plateforme — les taux exacts pour les ordres à cours limité et les ordres au marché, ainsi que les éventuels frais basés sur la prime ou le règlement, font partie de la spécification inachevée et seront publiés en même temps qu'elle.

## Voir aussi

- [Contrats perpétuels](./perpetuals.md) — le marché de dérivés à effet de levier actuellement disponible
- [Concepts](../concepts/index.md) — les mécanismes partagés sur lesquels les options s'appuieront
- [Propositions d'amélioration](../mip/index.md) — là où les nouveaux types de marchés sont spécifiés
