---
description: "Surface REST et WebSocket — trois familles de protocoles, toutes adossées à la même chaîne."
---

# Référence API

Trois familles de protocoles, toutes desservies par la même passerelle d'entrée
(`https://<net>-gateway.mtf.exchange`) — le choix du format d'échange côté client n'est
qu'un choix de chemin.

| Famille | Emplacement | À utiliser quand |
|---------|-------------|------------------|
| **MTF-native** | Chemin **par défaut** de la passerelle : `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Nouveaux clients. Format compact en snake_case. Expose toutes les fonctionnalités, y compris les fonctionnalités avancées de MTF (RFQ, FBA, inscription PM, cross-chain). |
| **HL-compat** | Passerelle sous `/hl/*` : `POST /hl/exchange`, `POST /hl/info`, `GET /hl/ws` | Migration d'un client HL existant. Les formats JSON correspondent exactement à ceux de HL. Aucun changement de code requis pour `order`, `cancel` (d'autres variantes seront disponibles au fil du temps). |
| **CCXT-compat** | Passerelle sous `/ccxt/*` | Frameworks quants utilisant déjà CCXT. Sous-ensemble REST minimal disponible ; CCXT Pro WS à venir. |

> La passerelle constitue le point d'entrée unifié — MTF-native est le chemin par défaut
> (`/info`, `/exchange`), HL-compat est accessible sous `/hl/*`, CCXT sous
> `/ccxt/*`. Vous exécutez le nœud vous-même ? Il expose directement la même
> surface native sur `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native ; catalogue complet des actions
- [`POST /info`](./rest/info.md) — MTF-native ; schémas par type
- [HL-compat](./rest/hl-compat.md) — miroir du protocole HL
- [CCXT-compat](./rest/ccxt-compat.md) — méthodes REST CCXT

## WebSocket

- [Protocole WS](./ws/index.md) — cycle de vie de la connexion, trames, authentification, reprise
- [Abonnements](./ws/subscriptions.md) — catalogue complet des canaux

## Aspects transversaux

- [Erreurs](./errors.md) — catalogue complet des erreurs avec mesures correctives
- [Limites de débit](./rate-limits.md) — quotas de poids par IP et de QPS par compte

## Voir aussi

- [Démarrage rapide d'intégration](../integration/quickstart.md) — bout en bout en 5 minutes
- [Guide de signature](../integration/signing.md) — enveloppe EIP-712
- [Réseaux](../networks.md) — points de terminaison par réseau
