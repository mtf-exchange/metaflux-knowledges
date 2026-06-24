# Délais d'interaction

:::tip
**Actif sur le devnet.** La cadence des blocs et les délais d'interaction — délais d'action CoreWriter et matérialisation des crédits Core→EVM — sont opérationnels tels que décrits. La cadence et les budgets pourront encore être ajustés avant le lancement.
:::

Durée de chaque interaction EVM↔Core, afin qu'un bot puisse raisonner sur les fenêtres de confirmation.

## Cadence des blocs

Un bloc unifié par tour de consensus, à une cadence **inférieure à la seconde** — il n'existe pas de voie lente séparée ; ainsi, les transactions, transferts, appels CoreWriter, lectures de précompilations ET déploiements de contrats sont tous confirmés dans le même tour. `block.timestamp` est dérivé du consensus (voir [Modèle d'exécution](execution-model.md)).

## EVM → Core (CoreWriter)

1. Le contrat appelle `sendRawAction` ; l'appel consomme du gaz et émet `RawAction` immédiatement.
2. Le L1 consomme l'action après un court **délai d'action** (elle est mise en file d'attente, et non appliquée à l'instant même), puis l'applique à l'état Core.
3. Il n'y a **aucun accusé de réception côté EVM** — le contrat doit observer le résultat sur Core (par exemple via l'API ou une lecture de précompilation ultérieure), et non depuis le retour de `sendRawAction`.

Implication de conception : traitez une action CoreWriter comme un envoi **sans attente de confirmation immédiate**, jamais comme un appel synchrone.

## Core → EVM (crédits)

Un crédit Core→EVM (`SpotCredit` / `BridgeMint`) est matérialisé sous forme de pseudo-transaction système dans un bloc **ultérieur**, ordonné par tour L1 et limité par une tranche de gaz système élastique par bloc (voir [Transferts Core ↔ EVM](core-evm-transfers.md)). Il n'est **pas** visible dans le même bloc qui l'a déclenché ; attendez-le dans un petit nombre de blocs.

## Lectures de précompilations

Les lectures de précompilations via `staticcall` retournent dans le bloc appelant. Actuellement, les précompilations de lecture sont des aides de **cotation sans état** (elles calculent à partir des entrées fournies par l'appelant) ; les **lectures adossées à l'état Core en direct** (interrogeant directement les positions ou le carnet d'ordres de la chaîne) sont à venir, auquel point une lecture reflétera l'état Core au bloc appelant.

## Voir aussi

- [Modèle d'exécution](execution-model.md)
- [Transferts Core ↔ EVM](core-evm-transfers.md)
- [Interagir avec Core](interacting-with-core.md)
