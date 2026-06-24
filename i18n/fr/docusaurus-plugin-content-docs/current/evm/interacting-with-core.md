# Interagir avec Core

:::tip
**Disponible sur le devnet.** Les actions CoreWriter sont opérationnelles, ainsi que les précompiles MTF dérivées sans état (`0x0900`–`0x0904`). Les précompiles de lecture adossées à l'état de Core — permettant d'interroger directement les positions et le carnet d'ordres de la chaîne — ainsi que les précompiles inter-chaînes sont à venir. Le pont ([Bridge](../bridge/)) est en ligne.
:::

Un contrat sur la MetaFlux EVM communique avec **Core** (la chambre de compensation L1 des contrats perpétuels + le CLOB on-chain) dans deux directions :

- **Lecture** — `staticcall` vers un **précompile** système pour obtenir une valeur dérivée de Core.
- **Écriture** — appel au contrat système **CoreWriter** pour soumettre une action L1.

La séparation précompile de lecture / contrat d'écriture permet à un contrat EVM de se composer directement avec l'état L1 en temps réel — coter contre les formules propres à la chaîne, puis agir sur la chambre de compensation — sans quitter la VM.

## Écrire dans Core — CoreWriter

Soumettez une action L1 en appelant **CoreWriter** à l'adresse
`0x3333333333333333333333333333333333333333` :

```solidity
interface ICoreWriter {
    /// Emitted on every successful call; the L1 scanner consumes this log.
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` est une charge utile préfixée par une version et un identifiant :

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=20)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

Le compte actif est `msg.sender` (le contrat appelant). Après un court délai d'action, le L1 dispatche l'action décodée.

:::info
**Atomicité.** Un appel `sendRawAction` ne fait que consommer du gaz et émettre l'événement `RawAction`. Tout échec côté L1 **survenant après** est silencieux — il n'y a **pas de revert EVM**. Un contrat doit se récupérer lui-même et traiter l'événement `RawAction` comme le seul lien causal entre l'appel EVM et le résultat L1.
:::

### Actions

CoreWriter expose 20 actions L1 (identifiant, big-endian, dans le slot `uint24` ci-dessus) :

| id | Action | Rôle |
|---:|--------|------|
| 1 | `LimitOrder` | Placer un ordre à cours limité sur un marché perpétuel ou au comptant |
| 2 | `VaultTransfer` | Déposer sur ou retirer depuis un vault |
| 3 | `TokenDelegate` | Déléguer du stake à un validateur |
| 4 | `StakingDeposit` | Transférer des tokens vers le solde de staking |
| 5 | `StakingWithdraw` | Retirer des tokens du solde de staking |
| 6 | `SpotSend` | Transférer un token spot vers un autre compte |
| 7 | `UsdClassTransfer` | Déplacer des USDC entre le compte de classe perpétuel et le compte de classe spot |
| 8 | `FinalizeEvmContract` | Associer un contrat EVM à son token Core / identifiant de contrat |
| 9 | `AddApiWallet` | Autoriser une sous-clé (wallet agent) pour le trading |
| 10 | `CancelByOid` | Annuler un ordre par identifiant d'ordre serveur |
| 11 | `CancelByCloid` | Annuler un ordre par identifiant d'ordre client |
| 12 | `ApproveBuilderFee` | Autoriser un builder à prélever des frais (plafonnés) |
| 13 | `SendAsset` | Transfert d'actif générique (perpétuel / spot / vault) |
| 14 | `ReflectEvmSupplyChange` | Synchroniser une variation d'offre ERC-20 côté EVM vers Core |
| 15 | `BorrowLend` | Ouvrir / fermer une position d'emprunt-prêt |
| 16 | `PortfolioMarginEnroll` | Inscrire ou désinscrire l'émetteur dans la marge de portefeuille multi-actifs |
| 17 | `RfqSubmit` | Soumettre un devis RFQ (identifiant, marché, sens, taille, prix limite) |
| 18 | `FbaConfigure` | Configuration de la vente aux enchères par lots fréquents par marché |
| 19 | `CrossChainSend` | Transfert inter-chaînes agnostique (mis en file d'attente dans [MetaBridge](../bridge/)) |
| 20 | `EncryptedOrderSubmit` | Ordre chiffré à seuil (engagement + texte chiffré) |

Les structs de paramètres typés et un caller Solidity prêt à l'emploi sont disponibles dans le dépôt public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) ;
le CoreWriter on-chain à l'adresse `0x3333…` est la cible de production (dans les tests, un substitut Solidity déterministe émet la même charge utile `RawAction`).

## Lire Core — les précompiles

Chaque précompile est un `staticcall` vers une adresse fixe avec une entrée **compacte** big-endian construite manuellement (pas de l'ABI Solidity). Les tailles et les prix sont exprimés sur le plan à **virgule fixe 1e8** (`px_e8`, `size_e8`) ; les marges USDC sont en **1e6**.

| Adresse | Précompile | Retourne |
|---------|------------|----------|
| `0x0900` | `portfolio_margin_eval` | Marge de maintenance minimale de type SPAN, indice du scénario le plus défavorable, pénalité de concentration |
| `0x0901` | `vault_nav` | NAV totale du vault, nombre total de parts, NAV par part, PnL non réalisé |
| `0x0902` | `adl_pro_rata_price` | Prix VWAP auquel un ADL d'une taille donnée se règle, en parcourant la file par priorité de sens |
| `0x0903` | `mark_settle` | Delta de PnL par position, nouveau financement accumulé, PnL non réalisé au prix mark |
| `0x0904` | `rfq_book_depth` | Profondeur du carnet RFQ (filtrée par sens, profondeur plafonnée) |
| `0x0906` | `clob_bbo` | Meilleur prix d'achat / meilleur prix de vente + taille (sommet du carnet) |
| `0x0907` | `clob_l2_depth` | Top-N niveaux agrégés `(price, size)` par sens |
| `0x0908` | `inventory_risk` | Notionnel net / brut, concentration, seuil de plafond de risque |

Ce sont aujourd'hui des précompiles de **cotation sans état** : l'appelant fournit les entrées (positions, niveaux de la file, devis, …) et le précompile retourne le résultat calculé, permettant à un contrat de reproduire un calcul Core à partir des formules propres à la chaîne. Les **lectures adossées à l'état de Core en direct** (interrogation directe des positions / du carnet de la chaîne) sont à venir.

## Transferts de valeur Core ↔ EVM

- **Vers Core** depuis un contrat EVM : `SpotSend` / `SendAsset` / `UsdClassTransfer`
  / `VaultTransfer` via CoreWriter (voir ci-dessus).
- **Entre chaînes** : `CrossChainSend` met en file d'attente dans le
  [pont de conservation MetaBridge](../bridge/), qui libère les fonds sur la chaîne de destination
  sous co-signature ⅔ des validateurs.

## Voir aussi

- [Bridge](../bridge/) — conservation inter-chaînes (destination de `CrossChainSend`)
- [Prix mark](../concepts/mark-prices.md) — le plan de prix à virgule fixe 1e8 utilisé par les précompiles
- [Marge de portefeuille](../concepts/portfolio-margin.md) / [ADL](../concepts/adl.md) — les calculs Core cotés par les précompiles `0x0900` / `0x0902`
