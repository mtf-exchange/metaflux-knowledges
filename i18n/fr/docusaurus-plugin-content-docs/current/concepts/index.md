---
description: Mécanismes fondamentaux — portefeuilles d'agents, marge, liquidation, types d'ordres, coffres, frais et glossaire.
---

# Concepts

Explications en langage clair des mécanismes fondamentaux de MetaFlux — leur fonctionnement, leur utilisation et leur comportement sous contrainte.

## Ordre de lecture pour les intégrateurs

1. [Portefeuilles d'agents](./agent-wallets.md) — délégation de clés chaudes, configuration standard pour les teneurs de marché
2. [Types d'ordres](./order-types.md) — TIF, STP, déclencheurs, TWAP, scale
3. [Modes de marge](./margin-modes.md) — Cross / Isolated / Strict-Iso
4. [Prix de marque](./mark-prices.md) — ce qui détermine la marge, la liquidation et les déclencheurs
5. [Liquidation par paliers](./tiered-liquidation.md) — T0 carton jaune → T4 ADL
6. [Taux de financement](./funding-rates.md) — paiement horaire entre utilisateurs
7. [Frais](./fees.md) — paliers maker/taker + burn
8. [Grille tarifaire](./fee-schedule.md) — paliers de volume, de remise maker et de réduction par staking
9. [Sous-comptes](./sub-accounts.md) — isolation des stratégies et des risques
10. [Marge de portefeuille](./portfolio-margin.md) — marge inter-actifs de type SPAN

## Earn et produits connexes

Les marchés négociables sont désormais répertoriés sous [Produits](../products/index.md) — voir
[Perpétuels](../products/perpetuals.md), [Spot](../products/spot.md) et
[Spot sur marge](../products/spot-margin.md). Le pool de prêt qui finance les emprunts spot sur marge est un concept :

- [Earn](./earn.md) — **prévu** : pool de prêt USDC qui finance les emprunts spot sur marge
- [Spot](../products/spot.md) — **en ligne** : CLOB token contre token, séquestre par réserve de solde, sans effet de levier
- [Spot sur marge](../products/spot-margin.md) — **aperçu devnet** : spot à effet de levier financé par le pool Earn

:::info
**Seul le spot sans effet de levier est conforme à la charia.** Seul le trading spot **sans effet de levier** — acheter et vendre directement à pleine valeur, sans effet de levier, sans marge, sans emprunt et sans financement — est le produit MetaFlux généralement considéré comme compatible avec les principes de la finance islamique (charia). Les produits non conformes comprennent explicitement **le spot sur marge (trading spot à effet de levier)**, ainsi que les contrats perpétuels et tout autre produit à effet de levier ou dérivé — l'effet de levier et l'emprunt introduisent un intérêt (riba), de la spéculation et de l'incertitude (maysir, gharar). Voir [Trading spot](../products/spot.md). À titre informatif uniquement, sans valeur de conseil religieux ou financier.
:::

## Avancé

- [ADL](./adl.md) — calcul du délevier automatique T4
- [Multi-sig](./multi-sig.md) — M-of-N institutionnel
- [Coffres](./vaults.md) — MFlux Vault + coffres utilisateurs
- [Staking](./staking.md) — déléguer MTF, percevoir des récompenses
- [RFQ](./rfq.md) — demande de cotation pour les gros volumes
- [FBA](./fba.md) — correspondance par enchères groupées fréquentes

## Référence

- [Glossaire](./glossary.md) — définition de chaque terme propre au protocole
