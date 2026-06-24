# Présentation de la signature

:::info
**Cette page a été déplacée.** Les actions `/exchange` sont signées avec des **données typées structurées EIP-712** (`eth_signTypedData_v4`). Il s'agit du seul schéma de signature.
La présentation complète — domaine, chaînes de type par action, condensé (digest), exemples détaillés et vérification locale — se trouve désormais dans
[**la signature de données typées**](./typed-data-signing.md).
:::

Chaque requête `/exchange` est une signature de données typées EIP-712 : le portefeuille affiche chaque champ de l'action par son nom, le serveur reconstruit la structure typée à partir de `action.type` + `action.params`, recalcule le condensé et détermine le signataire (le compte, ou un [agent](../concepts/agent-wallets.md) autorisé par celui-ci). Il n'existe pas de second schéma entre lequel choisir.

Consultez [**la signature de données typées**](./typed-data-signing.md) pour la spécification complète et des exemples TypeScript / Python prêts à l'emploi.

## Voir aussi

- [Signature de données typées](./typed-data-signing.md) — le schéma de signature, de bout en bout
- [`POST /exchange`](../api/rest/exchange.md) — l'endpoint
- [Portefeuilles agents](../concepts/agent-wallets.md) — configuration multi-signataires
- [Idempotence](./idempotency.md) — stratégie de nonce et nouvelles tentatives
- [Erreurs](../api/errors.md) — toutes les erreurs susceptibles de survenir lors du déploiement de la signature
- [Réseaux](../networks.md) — chainId par réseau
