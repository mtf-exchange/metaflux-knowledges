# MIP-3 — Déploiement de marché de contrats perpétuels sans permission

:::info
**Implémenté.**
:::

N'importe quel développeur peut déployer un nouveau marché de contrats perpétuels sur MetaFlux en passant par une enchère de gaz on-chain. Il n'existe aucun contrôle de la part de l'équipe protocole, aucun comité de révision, aucune liste d'autorisation. Le prix de l'enchère additionné d'un dépôt minimum constituent les seules barrières d'entrée. (Le déploiement sans permission de marché **au comptant** est la proposition sœur, [MIP-1](./mip-1.md).)

## Pourquoi ce mécanisme existe

C'est un axe de différenciation fondamental. Les exchanges centralisés sélectionnent manuellement leurs listings ; MetaFlux fait du processus de listing lui-même une composante du protocole. Les développeurs qui souhaitent ouvrir un marché sur un actif de niche n'ont besoin d'aucune autorisation — il leur suffit de remporter une enchère et de fournir les paramètres initiaux.

Il s'agit de l'adaptation par MetaFlux du modèle de déploiement de marchés sans permission pionnier des principales plateformes de contrats perpétuels on-chain, avec les équivalences et ajustements suivants :

- Trois flux d'enchères de gaz distincts (`perp_deploy_gas_auction`, `spot_pair_deploy_gas_auction`, `register_token_gas_auction`) — même structure que HL. Le déploiement perp relève du MIP-3 ; les flux au comptant renvoient au [MIP-1](./mip-1.md).
- Paramètres d'enchère (décroissance, fenêtre de remboursement, intervalle de slot) configurables par la gouvernance
- Ratio de maintenance initial, effet de levier maximal, plafond de financement — soumis avec l'offre de déploiement, limités par des plages définies par la gouvernance

## Flux de déploiement

```mermaid
flowchart TD
    A["builder — submitGasAuctionBid<br/>(register_token stream, if the asset is new)"] --> B["auction wins slot"]
    B --> C["builder — perpDeploy { RegisterAsset }<br/>+ lifecycle sub-variants (SetOracle, SetLeverage, ...)"]
    C --> D["AssetId allocated"]
    D --> E["perpDeploy { ActivateMarket }"]
    E --> F["market live, first block<br/>accepts orders next block"]
```

Le déploiement d'un contrat perpétuel s'effectue via l'action `perpDeploy`, dispatchée par une sous-variante `PerpDeployKind` couvrant l'ensemble du cycle de vie du marché (8 sous-variantes) :

1. **`RegisterAsset`** — enregistre un nouvel actif perpétuel ; alloue un `AssetId`. (Nécessite que le symbole du token soit préalablement enregistré via le flux `register_token_gas_auction`, s'il ne l'est pas déjà.)
2. **`SetOracle`** — associe ou fait tourner le sous-ensemble de sources oracle pour l'actif.
3. **`SetLeverage`** — définit le plafond d'effet de levier maximal.
4. **`SetFeeTier`** — définit le palier de frais maker/taker (en bps, plafonné par les limites par marché).
5. **`SetMakerRebate`** — définit le rabais maker (en bps, ≤ 2).
6. **`SetMinSize`** — définit la taille minimale d'ordre pour le marché.
7. **`ActivateMarket`** — active le marché (autorisation des échanges ; nécessite une configuration complète).
8. **`DeactivateMarket`** — ferme le marché aux nouveaux ordres (les positions existantes sont conservées).

L'obtention d'un slot de déploiement passe par l'enchère de gaz : un développeur appelle **`submitGasAuctionBid { auction_kind, bid_amount, ... }`** contre le flux concerné. Chaque offre comporte :
- Un montant en USDC, séquestré à la soumission et remboursé en cas de perte (déduction faite d'une petite commission).
- La spécification du marché — effet de levier initial, ratio de marge de maintenance, paramètres de financement, configuration des sources oracle.

Les enchères se résolvent aux frontières de bloc — le plus offrant par slot remporte l'enchère, le montant payé est brûlé (non versé à quiconque), et les paramètres de spécification deviennent les paramètres du marché déployé.

## Séquestre et remboursement des offres

Les offres sont conservées en séquestre pendant toute la durée de l'enchère. En cas de perte, l'offre est restituée sur le compte du développeur, déduction faite d'une petite commission d'enchère. En cas de victoire, le montant gagnant est brûlé à la clôture du slot (non versé à quiconque).

Les offres actives sont consultables via :

```json
POST /info { "type": "mip3_active_bids" }
```

## Limites des paramètres

La gouvernance définit les bornes dans lesquelles les paramètres de spécification des offres doivent s'inscrire :

- Effet de levier initial dans `[1, max_leverage]` (valeur par défaut `max_leverage = 50`)
- Ratio de marge de maintenance ≥ `min_maintenance_ratio` (valeur par défaut 1 %)
- Plafond de financement ≤ `max_funding_per_hour` (valeur par défaut 0,5 %)
- Source oracle issue de la liste approuvée

Les offres dont les paramètres sont hors limites sont rejetées à la soumission.

## Paramètres des enchères

Par flux (perp / au comptant / enregistrement de token), l'enchère dispose de :

- **Intervalle de slot** — fréquence à laquelle une nouvelle enchère se règle (gouvernance, valeur par défaut : 1 heure)
- **Décroissance** — rythme de baisse de l'offre minimale si un slot n'est pas attribué (gouvernance, valeur par défaut : linéaire sur 24 h)
- **Fenêtre de remboursement** — durée après la clôture du slot pendant laquelle les enchérisseurs perdants peuvent réclamer un remboursement (gouvernance, valeur par défaut : 7 jours)

Ces trois paramètres sont modifiables par la gouvernance via l'action `SetGlobal` (variables globales de gouvernance des développeurs MIP-3 : `SetGasAuctionDuration`, `SetMinDeployStake`, `SetGasAuctionMinBid`, `SetDeployerFeeCap`, `SetPerMarketLimits`, `SetEnableMip3`).

## Après le déploiement

Le nouveau marché figure dans le registre d'actifs canonique dès le bloc suivant. La liquidité est à la charge du développeur ; le protocole ne fournit aucun ordre initial.

Les développeurs amorcent généralement la profondeur de marché en combinant un déploiement MIP-3 avec une source de liquidité sur le même marché — [MIP-2 Métaliquidité](./mip-2.md), un teneur de marché externe attiré par les rabais de frais pour les développeurs, ou un vault créé par l'utilisateur.

## MIP-4

Voir [MIP-4 — agrégateur / internaliseur de liquidité perps](mip-4.md) pour l'agrégateur opéré par MetaFlux qui complète le déploiement sans permission.

## Voir aussi

- [MIP-1 — standard de token au comptant + déploiement de marché](./mip-1.md) — la proposition sœur pour le déploiement sans permission au comptant
- [Liquidation étagée](../concepts/tiered-liquidation.md) — s'applique aux marchés déployés via MIP-3 de la même façon qu'aux marchés listés par le protocole
- [Marge de portefeuille](../concepts/portfolio-margin.md) — les marchés MIP-3 optent pour la PM via l'inclusion de scénarios standard
