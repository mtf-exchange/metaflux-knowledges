---
description: "Surface REST et WebSocket — le protocole MTF-native, adossé à la chaîne."
---

# Référence API

Un seul protocole MTF-native, desservi par la passerelle d'entrée
(`https://<net>-gateway.mtf.exchange`).

| Surface | Emplacement | Notes |
|---------|-------------|-------|
| **MTF-native** | `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Format compact en snake_case. Expose toutes les fonctionnalités, y compris les fonctionnalités avancées de MTF (RFQ, FBA, inscription PM, cross-chain). |

> La passerelle est le point d'entrée de la surface MTF-native
> (`/info`, `/exchange`, `/ws`). Vous exécutez le nœud vous-même ? Il expose directement
> la même surface native sur `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native ; catalogue complet des actions
- [`POST /info`](./rest/info.md) — MTF-native ; schémas par type

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
