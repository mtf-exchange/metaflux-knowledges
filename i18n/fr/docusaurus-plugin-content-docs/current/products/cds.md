---
description: CDS sur MetaFlux — un marché de protection de type credit default swap en cours de planification. Intention générale uniquement ; la spécification du contrat et l'interface réseau ne sont pas encore finalisées.
---

# CDS

:::info
**Planifié — pas encore spécifié.** Un marché de protection de type credit default swap figure
sur la feuille de route de MetaFlux, mais la spécification du contrat (événements de référence,
calendrier de prime, collatéralisation, règlement et conception de l'oracle/résolution, ainsi que
les actions réseau `/exchange`) **n'est pas finalisée et n'est pas publique**. Cette page décrit
uniquement l'intention. Elle sera complétée avec des mécaniques concrètes lorsque la conception
sera publiée via une MIP. N'implémentez rien contre cette interface pour l'instant — aucune
surface réseau n'est engagée.
:::

## Qu'est-ce qu'un CDS

Un **credit default swap (CDS)** est un contrat par lequel un **acheteur** de protection verse
une prime périodique à un **vendeur** de protection ; en contrepartie, le vendeur indemnise
l'acheteur si un **événement de crédit** défini survient sur une entité ou une obligation de
référence (par exemple, un défaut). Il s'agit, en substance, d'une assurance contre un événement
de crédit : l'acheteur transfère le risque de défaut au vendeur en échange d'une prime continue.

## Orientation envisagée sur MetaFlux

L'objectif est de créer un **marché de protection on-chain** qui, comme le reste de MetaFlux,
réutilise les primitives de la plateforme là où elles s'y prêtent — le [carnet d'ordres](../concepts/order-types.md)
pour la découverte des prix sur les primes, les [portefeuilles d'agents](../concepts/agent-wallets.md) pour
la signature, et la pile de [marge et de liquidation](../concepts/tiered-liquidation.md)
pour la collatéralisation de l'obligation du vendeur de protection. Les questions de conception
les plus difficiles sont les mêmes qui rendent les produits de crédit on-chain si rares : **comment
un événement de crédit est défini et résolu on-chain** (oracle, fenêtres temporelles, gestion des
litiges) — un problème étroitement lié à la machinerie de résolution que la proposition différée
[Outcomes / marchés de prédiction](../mip/mip-6.md) doit également résoudre. Rien de tout cela
n'est encore arrêté.

:::caution
Jusqu'à ce que la spécification soit publiée, considérez tout ce qui dépasse cette page au sujet
du CDS MetaFlux comme non confirmé. La définition générale ci-dessus est standard en finance ; les
mécaniques propres à MetaFlux ne sont pas encore décidées.
:::

## Frais

**Pas encore définis.** Lorsqu'un marché CDS sera lancé, les frais suivront le
[cadre tarifaire](../concepts/fees.md) de la plateforme — la structure de prime et les éventuels
frais de règlement lors d'un événement de protection font partie de la spécification inachevée
et seront publiés avec elle.

## Voir aussi

- [Perpétuels](./perpetuals.md) — le marché de dérivés à effet de levier disponible aujourd'hui
- [Concepts](../concepts/index.md) — les mécaniques partagées sur lesquelles un marché CDS s'appuierait
- [MIP-6 — Outcomes / marchés de prédiction](../mip/mip-6.md) — le problème connexe de résolution on-chain
- [Propositions d'amélioration](../mip/index.md) — là où les nouveaux types de marchés sont spécifiés
