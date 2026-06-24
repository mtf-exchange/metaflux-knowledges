# EVM

:::tip
**Disponible sur le devnet.** L'exécution EVM et les actions CoreWriter sont opérationnelles, tout comme les précompilations de dérivés MTF sans état (`0x0900`–`0x0904`). Les précompilations de lecture adossées à l'état du Core (interrogation directe des positions et du carnet d'ordres de la chaîne) ainsi que les précompilations inter-chaînes sont à venir. Le [bridge](../bridge/) est disponible.
:::

L'EVM MetaFlux est une **sidechain** basée sur [revm](https://github.com/bluealloy/revm) qui exécute des contrats Solidity ordinaires et expose le **Core** MetaFlux — la chambre de compensation de contrats perpétuels L1 et le CLOB on-chain — à ces contrats : une couche d'exécution EVM connectée directement au L1 sur lequel elle se règle.

## Différences avec un EVM standard

- **Bloc unifié, strates parallèles** — un bloc par cycle de consensus (sous la seconde) ; ses transactions sont réparties en strates de conflit parallèles, ce qui permet un débit qui évolue avec le nombre de cœurs, et même les déploiements de contrats sont confirmés dans le bloc suivant (sans file d'attente pour les blocs lourds de 60 secondes). Voir [Modèle d'exécution](execution-model.md).
- **Accès au Core intégré** — les contrats lisent le Core via des **précompilations système** et écrivent dans le Core via le contrat système **CoreWriter**. Voir [Interaction avec le Core](interacting-with-core.md).
- **Déterministe** — horodatages injectés par consensus, sans virgule flottante, exécution parallèle avec un état validé équivalent à une exécution séquentielle.
- **Destruction des frais de base EIP-1559** vers une adresse de destruction coinbase.

## Pages

| Page | Contenu |
|------|---------|
| [Modèle d'exécution](execution-model.md) | Bloc unifié, strates de conflit parallèles, gaz/frais, trading résistant au MEV |
| [Interaction avec le Core](interacting-with-core.md) | Chemin d'écriture CoreWriter (les 20 actions) + les précompilations de lecture |
| [Transferts Core ↔ EVM](core-evm-transfers.md) | Déplacement de valeur entre le Core et l'EVM (et inter-chaînes) |
| [Délais d'interaction](interaction-timings.md) | Quand une action CoreWriter / un crédit Core→EVM est effectivement pris en compte |

## Adresses système (en un coup d'œil)

| Adresse | Rôle |
|---------|------|
| `0x3333…3333` | **CoreWriter** — soumettre des actions L1 (`sendRawAction`) |
| `0x0900`–`0x0904` | précompilations de lecture pour les dérivés (marge, NAV, ADL, mark-settle, RFQ) |
| `0x0906`–`0x0908` | précompilations de lecture des données de marché (BBO, profondeur L2, risque d'inventaire) |
| `0x0a01`–`0x0a02` | précompilations inter-chaînes (envoi / vérification) |

## JSON-RPC

JSON-RPC `eth_*` standard via `POST /evm` sur la passerelle ; la chaîne expose son propre identifiant via `eth_chainId` (voir [Réseaux et identifiants de chaîne](../networks.md)). Les contrats déployables sont disponibles dans le dépôt public [`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts).
