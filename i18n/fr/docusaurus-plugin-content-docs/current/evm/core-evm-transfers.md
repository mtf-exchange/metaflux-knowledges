# Transferts Core ↔ EVM

:::tip
**Disponible sur devnet.** Les actions de transfert de valeur EVM→Core (`SpotSend`, `SendAsset`,
`UsdClassTransfer`, `VaultTransfer` via CoreWriter) ainsi que la matérialisation des crédits Core→EVM
sont opérationnelles et testées. Le [bridge](../bridge/) (conservation inter-chaînes)
est en ligne.
:::

La valeur circule entre **Core** (le moteur de compensation L1 / registre au comptant) et la couche
**EVM** dans les deux sens. Les deux directions sont déterministes et liées au compte concerné.

## EVM → Core (via CoreWriter)

Un contrat transfère de la valeur vers Core en soumettant une action L1 via
[CoreWriter](interacting-with-core.md#writing-to-core--corewriter) (`0x3333…3333`).
Le compte agissant est le contrat appelant (`msg.sender`) :

| Action | Effet |
|--------|-------|
| `SpotSend` | Transfert d'un token au comptant vers un autre compte sur Core |
| `SendAsset` | Transfert d'actif générique (classes perp / spot / vault) |
| `UsdClassTransfer` | Déplacement d'USDC entre les comptes de classe perp et spot |
| `VaultTransfer` | Dépôt dans un vault ou retrait depuis un vault |

Ces actions sont soumises à la règle d'atomicité de CoreWriter : l'appel consomme du gas et émet
`RawAction` ; tout échec côté L1 survenant ensuite est **silencieux** (pas de revert EVM).

## Core → EVM (pseudo-transactions système)

Lorsqu'un effet de début de bloc L1 doit s'appliquer côté EVM — par exemple un envoi au comptant
dont le destinataire est une adresse EVM, ou un mint entrant via bridge — il est mis en file
d'attente et matérialisé sous forme de **pseudo-transaction système déterministe au prochain bloc
EVM** :

| Op | Source | Échelle de montant |
|----|--------|--------------------|
| `SpotCredit` | un solde au comptant L1 crédité à un destinataire EVM 20 octets | virgule fixe `1e8` |
| `BridgeMint` | un mint entrant [MetaBridge](../bridge/) (ex. USDC) | `1e6` (natif USDC) |

Ordonnancement et débit :

- Mis en file par **round L1**, vidé dans l'ordre croissant des rounds, FIFO au sein d'un round —
  deux validateurs matérialisent ainsi les mêmes opérations dans le même ordre (déterminisme).
- Chaque opération est facturée d'un coût en **gas système** et prélevée sur une **tranche de
  gas système élastique par bloc** (proportionnelle au budget de gas du bloc) ; les opérations
  restantes sont reportées au bloc suivant. Les crédits Core→EVM arrivent en quelques blocs,
  pas instantanément dans le même bloc que celui qui les a déclenchés.

## Inter-chaînes (une surface distincte)

`CrossChainSend` (action CoreWriter 19) ne déplace **pas** de valeur vers l'EVM local —
il met en file d'attente un retrait vers le [bridge de conservation MetaBridge](../bridge/),
qui est libéré sur la chaîne de destination (Base / Solana) après une co-signature ⅔ validateurs
derrière une fenêtre de contestation.

## Voir aussi

- [Interagir avec Core](interacting-with-core.md)
- [Délais d'interaction](interaction-timings.md)
- [Bridge](../bridge/)
