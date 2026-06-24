---
description: Les produits de trading pris en charge par MetaFlux — contrats perpétuels, marché au comptant, spot avec effet de levier, et les options et CDS en projet — avec leur statut et les liens vers la documentation détaillée.
---

# Produits

Les différents **produits de trading** proposés par MetaFlux. Chacun constitue un type de marché distinct, avec son propre carnet d'ordres, ses soldes et son modèle de risque ; cette section présente leur nature, leur statut actuel et des liens vers la mécanique complète. Pour les mécanismes transversaux qu'ils partagent — types d'ordres, marge, liquidation, frais — consultez les [Concepts](../concepts/index.md).

## Ce que vous pouvez trader

| Produit | Description | Statut |
|---|---|---|
| [Perpétuels](./perpetuals.md) | Position longue/courte avec effet de levier sur le prix d'un actif, sans expiration, ancrée par le taux de financement | **En production** |
| [Spot](./spot.md) | CLOB token-for-token, dénoué contre votre solde, sans effet de levier | **En production** |
| [Spot avec marge](./spot-margin.md) | Spot avec effet de levier, financé par le pool de prêt [Earn](../concepts/earn.md) | **Aperçu Devnet** |
| [Options](./options.md) | Options on-chain (calls / puts) | **Planifié** |
| [CDS](./cds.md) | Contrats de protection de type credit-default-swap | **Planifié** |

Les **perpétuels** constituent le marché par défaut et concentrent l'essentiel du trading avec effet de levier — les taux de financement, les prix marqués, les modes de marge et l'échelle de liquidation concernent les perps sauf indication contraire. Le **spot** est le mode de base, sans effet de levier. Le **spot avec marge** est la couche optionnelle d'effet de levier sur le spot, avec le pool [Earn](../concepts/earn.md) comme source d'approvisionnement en prêts. Les **options** et les **CDS** sont en projet et ne disposent pas encore d'interface de communication définie — consultez leurs pages pour connaître l'état actuel.

:::info
**Le spot sans effet de levier uniquement est conforme à la charia.** Parmi les produits présentés ici, seul le [spot](./spot.md) **sans effet de levier** — achat et vente directs à pleine valeur, **sans effet de levier, sans marge, sans emprunt et sans taux de financement** — est généralement considéré comme compatible avec les principes de la finance islamique (charia). Les produits non conformes incluent explicitement le **spot avec marge (trading spot avec effet de levier)**, ainsi que les **contrats à terme perpétuels** et tout autre produit avec effet de levier ou dérivé — l'effet de levier et l'emprunt introduisent des intérêts (riba), de la spéculation et de l'incertitude (maysir, gharar). À titre informatif uniquement, sans valeur religieuse ou de conseil financier.
:::

## Voir aussi

- [Concepts](../concepts/index.md) — les mécanismes partagés : [types d'ordres](../concepts/order-types.md), [modes de marge](../concepts/margin-modes.md), [taux de financement](../concepts/funding-rates.md), [liquidation par paliers](../concepts/tiered-liquidation.md), [frais](../concepts/fees.md)
- [`/exchange`](../api/rest/exchange.md) — les actions de communication derrière chaque produit
- [Par où commencer](../start-here.md) — une introduction en langage clair pour les nouveaux utilisateurs
