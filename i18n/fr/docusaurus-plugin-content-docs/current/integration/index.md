---
description: Connecter un client à MetaFlux — SDK, signature, migration, idempotence, gestion des erreurs.
---

# Intégration

Comment connecter un client à MetaFlux. Choisissez le chemin qui correspond à votre point de départ.

## Points de départ

| Si vous partez de… | Aller à |
|--------------------------|-------|
| Rien — juste envie d'essayer | [Démarrage rapide](./quickstart.md) |
| Un bot / outil HL existant | [Migration depuis HL](./migrating-from-hl.md) |
| TypeScript / navigateur en partant de zéro | [SDK TypeScript](./typescript-sdk.md) |
| Service Rust en partant de zéro | [SDK Rust](./rust-sdk.md) |
| Autre chose (Python, Go, …) | [Signature de données typées](./typed-data-signing.md) — implémentez vous-même la signature EIP-712 sur des données typées |

## Sujets

- [Démarrage rapide](./quickstart.md) — end-to-end en 5 minutes (dépôt → trade → retrait)
- [Signature de données typées](./typed-data-signing.md) — le schéma de signature EIP-712, end-to-end avec des exemples fonctionnels
- [Procédure de signature](./signing.md) — renvoi vers la signature de données typées (conservé pour les anciens liens)
- [Guide des portefeuilles agents](./agent-wallets-howto.md) — code concret pour le pattern hot-key
- [Idempotence](./idempotency.md) — stratégie de nonce et relance sécurisée
- [Gestion des erreurs](./error-handling.md) — arbre de décision admission / commit / réseau
- [Pattern risk-watcher](./risk-watcher.md) — rechargement automatique de la marge
- [Migration depuis HL](./migrating-from-hl.md) — remplacement direct pour les bots HL

## SDK

| Langage | Statut | Package |
|----------|--------|---------|
| TypeScript / JavaScript | preview | [`@metaflux/sdk`](./typescript-sdk.md) |
| Rust | preview | [`metaflux-client`](./rust-sdk.md) |

Pour les autres langages (Python, Go, Java, C++ …), implémentez la signature EIP-712 sur des données typées conformément à la page [signature de données typées](./typed-data-signing.md) — chaque étape est documentée avec des exemples détaillés. Le format de transport est suffisamment compact pour qu'un client écrit à la main soit le bon choix pour les stacks moins courants.

## Points de terminaison réseau

Consultez [networks](../networks.md) pour la référence complète par réseau.

La passerelle (`https://<net>-gateway.mtf.exchange`) est le point d'entrée public unique.

| Chemin | Sert | Rôle |
|------|--------|---------|
| `POST /info` · `POST /exchange` · `GET /ws` | MTF-native | Surface native en snake_case |
| `POST /evm` | EVM JSON-RPC | RPC de la sidechain EVM |
| `POST /faucet` | Faucet | Robinet de test devnet/testnet |

En production, le TLS est terminé au niveau de la passerelle, elle-même placée derrière un CDN ; le nœud n'est volontairement pas exposé sur Internet — il se trouve derrière la passerelle. Si vous exécutez le nœud vous-même, la même surface native est servie directement à l'adresse `http://localhost:8080` (RPC EVM brut sur `http://localhost:8545`).

## Patterns courants

- **Bot maker** — signé par un agent, cotation persistante, sidecar risk-watcher, ordres ALO pour garantir le niveau maker
- **Surveillance des liquidations** — abonné WS sur `marginEvents` + `userEvents` (`yellowCard`) ; déclenche des rechargements avant T1
- **Wrapper TWAP** — soumet un `TwapOrder`, surveille les `twapEvents` pour la télémétrie des tranches, annulation manuelle optionnelle en cours d'exécution
- **Gestionnaire de vault** — `VaultDeploy` une fois, puis ordres signés par agent sur l'adresse du vault lors des rééquilibrages
- **Conservation institutionnelle** — master multi-sig + agents par hôte + enveloppe multi-sig pour les flux à haute valeur
