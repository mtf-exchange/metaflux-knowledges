# Réseaux

:::info
**Statut.** **devnet stable**. Les `chainId` du testnet (`chainId 114514`) et du mainnet (`chainId 8964`) sont attribués ; leurs points de terminaison sont publiés avant le lancement.
:::

## Résumé

| Réseau | Statut | `chainId` | Format wire stable ? |
|--------|--------|-----------|:--------------------:|
| Devnet | ouvert à l'intégration | `31337` | oui |
| Testnet | aperçu avant le mainnet | `114514` | oui |
| Mainnet | non lancé | `8964` | oui |

## Devnet

L'environnement sandbox d'intégration. USDC gratuits via le faucet ; état éphémère (réinitialisations occasionnelles).

La passerelle constitue l'unique point d'entrée public. La surface MTF-native est desservie sur
`/info` · `/exchange` · `/ws` ; EVM JSON-RPC à `/evm`.

| Service | Point de terminaison |
|---------|----------------------|
| Porte d'entrée passerelle | `https://api.devnet.mtf.exchange` |
| MTF-native | `POST /info` · `POST /exchange` · `GET /ws` |
| EVM JSON-RPC | `POST /evm` |
| Faucet (devnet/testnet) | `POST /faucet` |
| WS passerelle (natif) | `wss://api.devnet.mtf.exchange/ws` |
| Explorateur | `https://app.mtf.exchange/explorer` |
| Statut | `https://status.mtf.exchange/devnet` |

Vous exécutez le nœud vous-même ? Le nœud expose directement la même surface native à
`http://localhost:8080` (`/info` · `/exchange` · `/ws` · `/faucet`), et son RPC EVM brut à
`http://localhost:8545`. Il s'agit des ports pour l'hébergement autonome, et non d'URL publiques.

| Paramètres de signature | Valeur |
|-------------------------|--------|
| `chainId` | `31337` |
| Domaine EIP-712 `name` | `"MetaFlux"` |
| Domaine EIP-712 `version` | `"1"` |
| Domaine EIP-712 `verifyingContract` | `0x0000000000000000000000000000000000000000` |

Pont USDC : via le **pont de garde MetaBridge** ([bridge](./bridge/)), et non Circle CCTP. Les dépôts sur le testnet utilisent le déploiement `MetaBridgeUSDC` de Base Sepolia ainsi que l'USDC de test Circle sur Base Sepolia.

### Faucet

`POST /faucet` sur la porte d'entrée de la passerelle crédite une adresse en fonds de test.
Devnet/testnet uniquement — la route **n'est jamais montée sur le mainnet** (`chainId 8964`).
L'attribution a le statut **`"queued"`** — mise en file d'attente pour le prochain bloc, de sorte que le solde est mis à jour après ~1 bloc, et non de façon synchrone. Contrat complet : [`POST /faucet`](api/rest/faucet.md).

```bash
curl -X POST https://api.devnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- Attribue **3000 USDC** en collatéral croisé **+ 10 MTF** au comptant — **une seule fois par
  adresse** (deuxième demande → `429 address already funded`).
- `amount` facultatif (USDC entiers) ; plafonne l'attribution USDC *à la baisse* (≤ 3000). MTF fixe.
- Limité à 1 requête / minute / IP (`429` en cas de dépassement).
- `400` adresse invalide · `429` déjà financée / IP limitée · `503` file d'attente saturée — corps `{"error":"…"}`.

### Réinitialisations d'état

Le devnet peut être réinitialisé lors des mises à niveau du protocole. Cadence : à la demande pendant le développement pré-mainnet ; préavis d'une semaine dans la mesure du possible. Consultez [statut](https://status.mtf.exchange/devnet) pour les annonces de réinitialisation.

## Testnet (prévu)

Réseau de répétition pré-mainnet avec garanties de stabilité.

| Service | Point de terminaison |
|---------|----------------------|
| REST passerelle | TBD |
| WS passerelle | TBD |
| Faucet | TBD (limité en débit) |
| Explorateur | TBD |

`chainId` du testnet : `114514` (`0x1bf52`). MetaFlux est un réseau indépendant avec ses propres identifiants de chaîne.

Différences entre le testnet et le mainnet :
- L'USDC est ponté via MetaBridge depuis une chaîne source de testnet (USDC de test Base Sepolia), et non un véritable USDC.
- L'ensemble de validateurs est contrôlé par l'opérateur.
- Aucune valeur économique réelle.

Le format wire du testnet est identique à celui du mainnet. Les clients testés sur le testnet ne devraient nécessiter **que le changement de `chainId` et d'URL de base** pour basculer vers le mainnet.

## Mainnet (prévu)

Réseau de production. USDC réels, valeur réelle, validateurs réels.

| Service | Point de terminaison |
|---------|----------------------|
| REST passerelle | TBD |
| WS passerelle | TBD |
| Explorateur | TBD |

`chainId` du mainnet : `8964` (`0x2304`).

Différences entre le mainnet et le devnet/testnet :
- L'USDC est réel, ponté via le pont de garde MetaBridge depuis Base (et ultérieurement Arbitrum / Solana).
- L'ensemble de validateurs est sans permission (élu par gouvernance).
- Valeur économique réelle.
- Limites de débit et frais conformément aux pages [limites de débit](./api/rate-limits.md) et [frais](./concepts/fees.md).

## Corridors de pontage

L'USDC (et les autres actifs) sont pontés via le **pont de garde MetaBridge** — cosignature pondérée par les ⅔ du stake des validateurs, sans dépendance à Circle CCTP. Chaînes sources :

| Chaîne | Statut |
|--------|--------|
| Base | **actif sur Base Sepolia** (`MetaBridgeUSDC` (MetaBridgeAlpha) [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00)) ; mainnet en pré-audit |
| Solana | **actif sur devnet** (programme `metabridge-solana` [`8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi`](https://solscan.io/account/8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi?cluster=devnet)) ; mainnet en pré-audit |
| Arbitrum | prévu |

Voir [bridge](./bridge/) pour le flux de dépôt / retrait ainsi que le tableau des déploiements.

## Statut

Statut opérationnel, historique des incidents et maintenance planifiée :

- Devnet : `https://status.mtf.exchange/devnet`
- Testnet : TBD
- Mainnet : TBD

La page de statut expose :
- L'état actuel du réseau (`operational`, `degraded`, `partial outage`, `major outage`)
- Les incidents récents avec leurs chronologies
- Les fenêtres de maintenance planifiées
- La hauteur du dernier bloc validé
- La taille de l'ensemble de validateurs actifs

## Fenêtres de compatibilité

| Réseau | Engagement sur le format wire |
|--------|-------------------------------|
| Devnet | Au mieux ; modifications incompatibles annoncées 24h à l'avance |
| Testnet | Stable ; modifications incompatibles soumises à un préavis de dépréciation de 30 jours |
| Mainnet | Stable ; modifications incompatibles conformément à la [politique de versionnage](./versioning.md) |

## Voir aussi

- [Bridge](./bridge/) — détails du pont de garde MetaBridge
- [Versionnage](./versioning.md) — politique de modification du format wire
- [Démarrage rapide](./integration/quickstart.md) — premier appel sur le devnet
- [Signature](./integration/signing.md) — utilisation du `chainId`
