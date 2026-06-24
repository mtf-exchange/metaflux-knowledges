---
description: Le marché de contrats perpétuels en production — positions longues/courtes à effet de levier sans date d'expiration, ancrées au comptant par le financement, valorisées au prix mark et protégées par une liquidation par paliers.
---

# Contrats perpétuels

:::tip
**En production.** Les contrats perpétuels constituent le marché phare de MetaFlux et la valeur par défaut de la plateforme — taux de financement, prix mark, modes de marge et échelle de liquidation décrivent tous les perps, sauf indication contraire sur la page concernée.
:::

## En bref

Un **contrat perpétuel** (« perp ») est un contrat à effet de levier qui suit le prix d'un actif **sans date d'expiration** — on prend une position longue ou courte, on dépose une [marge](../concepts/margin-modes.md) pour couvrir la position, et on la conserve tant qu'elle reste saine. En l'absence de date de règlement, un paiement de [financement](../concepts/funding-rates.md) périodique entre acheteurs et vendeurs maintient le prix du contrat ancré à l'actif sous-jacent. Les positions sont valorisées par rapport à un [prix mark](../concepts/mark-prices.md) résistant aux manipulations, et une position qui ne peut plus couvrir sa marge est soldée par une [liquidation par paliers](../concepts/tiered-liquidation.md) plutôt que par une clôture brutale et unique.

Les perps sont entièrement distincts du [marché au comptant](./spot.md) : une position perpétuelle est une exposition à effet de levier adossée à un collatéral, et non une détention directe de l'actif.

## Fonctionnement d'un perp

- **Direction et effet de levier.** Achetez pour prendre une position longue, vendez pour prendre une position courte. [L'effet de levier](../concepts/margin-modes.md) permet à un montant de collatéral donné de contrôler une position plus importante ; il amplifie gains et pertes de façon identique. Configurez l'effet de levier par actif ainsi que le basculement cross/isolé via [`update_leverage`](../api/rest/exchange.md#update_leverage).
- **Aucune expiration.** Un perp ne se règle jamais à une date de livraison — la position persiste jusqu'à ce que vous la fermiez ou qu'elle soit liquidée.
- **Le financement assure la cohérence.** Toutes les heures, acheteurs et vendeurs échangent un [paiement de financement](../concepts/funding-rates.md) calibré pour rapprocher le prix du perp de l'actif sous-jacent. Il s'effectue **entre traders**, et non vers la plateforme.
- **Le prix mark pilote le risque.** Votre marge, le PnL non réalisé, le niveau de liquidation et les ordres déclencheurs sont tous calculés par rapport au [prix mark](../concepts/mark-prices.md), et non au dernier cours traité — ainsi, une impression isolée ne peut pas fausser votre position.

## Actions de trading

Un ordre perp cible un identifiant de **`market`** perp (distinct d'une `pair` au comptant). La surface d'ordres est le CLOB partagé utilisé sur l'ensemble de MetaFlux.

| Action | Effet |
|---|---|
| [`submit_order`](../api/rest/exchange.md#submit_order) | Passer un ordre perp (limite / marché / déclencheur), tout [type d'ordre](../concepts/order-types.md) |
| [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`batch_cancel`](../api/rest/exchange.md#batch_cancel) | Annuler par `oid`, un ou plusieurs par signature |
| [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) / [`cancel_all_orders`](../api/rest/exchange.md#cancel_all_orders) | Annuler par identifiant client, ou annuler tous les ordres (filtre d'actif optionnel) |
| [`update_leverage`](../api/rest/exchange.md#update_leverage) | Modifier l'effet de levier ou basculer la marge isolée sur un actif |
| [`set_position_mode`](../api/rest/exchange.md#set_position_mode) | Basculer entre le mode unidirectionnel et le [mode hedge](../concepts/hedge-mode.md) (long + court simultanés) |

`submit_order` retourne un statut **synchrone** par ordre dès validation — l'`oid` attribué avec une entrée `resting` / `filled` / `error`, ou `pending` si aucune validation n'intervient dans la fenêtre d'attente de l'ordre. Les ordres peuvent être signés par le compte principal ou un [portefeuille agent](../concepts/agent-wallets.md) actif.

## Marge et risque

Les perps partagent l'intégralité de la pile de marge et de risque de la plateforme :

- [**Modes de marge**](../concepts/margin-modes.md) — Cross / Isolé / Strict-Iso, et la façon dont le collatéral est mutualisé ou cloisonné entre les positions.
- [**Mode hedge**](../concepts/hedge-mode.md) — détenir simultanément une position longue et une position courte sur le même marché.
- [**Marge de portefeuille**](../concepts/portfolio-margin.md) — marge inter-actifs de type SPAN pour les expositions compensées.
- [**Liquidation par paliers**](../concepts/tiered-liquidation.md) — une échelle progressive (T0 alerte précoce → étapes partielles → T4) plutôt qu'une liquidation totale instantanée.
- [**ADL**](../concepts/adl.md) — déleviérisation automatique en dernier recours lorsque le fonds d'assurance est épuisé.

## Frais

Les exécutions perp facturent des frais de **maker** et de **taker**. Votre taux de base dépend de votre palier de volume sur les 30 derniers jours glissants ; un palier de remise maker et une réduction au staking s'y ajoutent ensuite (voir [Grille tarifaire](../concepts/fee-schedule.md) pour la combinaison des trois).

| Volume sur 30 jours | Taker | Maker |
|---------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

Un palier de remise maker (part de volume maker) peut rendre votre **taux maker net négatif** (rémunération à la mise en marché) ; une réduction au staking réduit votre **taux taker jusqu'à 50 %**. Les taux sont des paramètres de gouvernance — consultez la fiche en temps réel via [`/info fee_schedule`](../api/rest/info.md#fee_schedule).
**Le financement n'est pas un frais** — il s'agit d'un [paiement périodique long↔court](../concepts/funding-rates.md), et non d'un revenu pour la plateforme. Voir [Frais](../concepts/fees.md) pour la mécanique complète.

## Cotation de nouveaux marchés perp

Les marchés perp sont **ouverts à tous** pour leur déploiement : tout développeur peut coter un nouveau contrat perpétuel en remportant une enchère de gas on-chain et en fournissant des paramètres de risque initiaux (ratio de maintenance initial, effet de levier maximal, plafond de financement), dans les limites fixées par la gouvernance. Ni comité de validation, ni liste blanche. Voir [MIP-3](../mip/mip-3.md) pour le processus de déploiement, et [MIP-4](../mip/mip-4.md) pour l'agrégateur de liquidité prévu destiné à canaliser les flux retail par-dessus.

## Voir aussi

- [Taux de financement](../concepts/funding-rates.md) — le paiement horaire long↔court
- [Prix mark](../concepts/mark-prices.md) / [Prix oracle](../concepts/oracle-prices.md) — ce qui valorise votre position
- [Types d'ordres](../concepts/order-types.md) — TIF, STP, déclencheurs, TWAP, scale
- [Modes de marge](../concepts/margin-modes.md) — Cross / Isolé / Strict-Iso
- [Liquidation par paliers](../concepts/tiered-liquidation.md) — l'échelle de liquidation
- [`submit_order`](../api/rest/exchange.md#submit_order) — l'action wire et les tables de champs
- [MIP-3](../mip/mip-3.md) — déploiement de marché perp sans permission
- [Spot](./spot.md) — le marché au comptant sans effet de levier, basé sur la détention
