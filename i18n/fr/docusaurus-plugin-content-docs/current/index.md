---
description: Référence d'intégration, surface API et concepts fondamentaux de la bourse de dérivés MetaFlux.
slug: /
---

<img src="/img/og.svg" alt="MetaFlux — derivatives, on first principles" class="hero-banner" />

# Base de connaissances MetaFlux

Bienvenue. Commencez ici si vous **intégrez** ou **développez sur** MetaFlux.

:::info
**Nouveau ?** Consultez le [Démarrage rapide](./integration/quickstart.md) (5 minutes : dépôt → trading → retrait).
**Migration depuis un autre DEX de perpetuels ?** Rendez-vous sur [Migrer depuis HL](./integration/migrating-from-hl.md) — les modèles s'appliquent à d'autres bots compatibles HL.
**Développement on-chain ?** Voir [MIP-3 : déploiement de marché sans permission](./mip/mip-3.md).
:::

## Explorer

<div class="mtf-cardgrid">

- [**Référence API**](./api/) — REST `/exchange` · `/info`, compatibilité HL & CCXT, WebSocket, erreurs, limites de débit
- [**Concepts**](./concepts/) — marge, liquidation par paliers, types d'ordres, financement, coffres, frais
- [**Intégration**](./integration/) — démarrage rapide, signature, idempotence, gestion des erreurs, SDK
- [**EVM**](./evm/) — modèle d'exécution, transferts Core ↔ EVM, précompilations
- [**Propositions d'amélioration**](./mip/) — déploiement spot/perp, métaliquidité, earn
- [**Bridge**](./bridge/) — pont d'actifs signé par des validateurs

</div>

## Liens rapides

- [Démarrage rapide](./integration/quickstart.md) — dépôt → trading → retrait en 5 minutes
- [Migrer depuis HL](./integration/migrating-from-hl.md) — remplacement direct pour bots compatibles HL
- [`POST /exchange`](./api/rest/exchange.md) — chemin d'écriture + catalogue complet des actions
- [`POST /info`](./api/rest/info.md) — chemin de lecture
- [Liquidation par paliers](./concepts/tiered-liquidation.md) — échelle T0 → T4
- [Glossaire](./concepts/glossary.md)

La barre latérale gauche constitue l'index exhaustif ; les cartes ci-dessus sont le point d'entrée rapide.

## Conventions

- Les endpoints documentés ici constituent la surface de protocole **stable et publique**.
- Les exemples de requêtes et réponses utilisent des structures réelles — ils peuvent être copiés-collés directement.
- Les champs de prix et de taille sont des entiers à virgule fixe (échelle à 8 décimales) ; les montants en USDC sont des unités de base à 6 décimales. Les deux sont transmis sous forme de chaînes JSON afin d'éviter les pertes de précision IEEE-754.
- Toutes les dates dans les champs `_ts` / `_ms` sont en millisecondes Unix (dérivées du consensus).

## Légende des statuts

Chaque document porte un tag « Statut » en haut de page :

- **stable** — format de protocole figé pour la V1 ; sûr à utiliser comme base de développement.
- **preview** — fonctionnel aujourd'hui ; des modifications mineures du protocole restent possibles avant le mainnet (signalées explicitement).
- **planned** — décrit, mais pas encore disponible.

Voir [versioning](./versioning.md) pour la politique de gestion des changements.
