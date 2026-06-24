# Modèle d'exécution

:::tip
**Actif sur le devnet.** Le modèle de bloc unifié — un bloc par cycle de consensus et une exécution parallèle par strates de conflits — est opérationnel et testé. La cadence et les valeurs de gas peuvent encore être ajustées avant le lancement. Le [bridge](../bridge/) est actif.
:::

L'EVM MetaFlux produit **un bloc unifié par cycle de consensus** — il n'existe pas de blocs distincts « légers » et « lourds ». Au sein de chaque bloc, l'exécution est répartie en **strates de conflits parallèles**, ce qui permet au débit de croître avec le nombre de cœurs, et **chaque classe de transaction — y compris les déploiements de contrats — est confirmée dans le même cycle inférieur à la seconde**.

## Un bloc, des strates parallèles

- **Un bloc par cycle de consensus** à une cadence inférieure à la seconde. Il n'existe pas de voie « bloc lourd » de 60 secondes : un déploiement de contrat ou un règlement volumineux atterrit dans le bloc suivant immédiat, aux côtés des flux d'échanges — sans attente d'une minute.
- Les transactions du bloc sont regroupées en **strates** selon leurs ensembles d'accès en lecture/écriture. Les transactions indépendantes s'exécutent **de façon concurrente** ; celles qui entrent en conflit s'exécutent dans l'ordre. Le débit agrégé est `budget par voie × largeur parallèle`, ce qui lui permet de croître avec les cœurs disponibles plutôt que d'être limité par un palier de gas fixe par bloc.
- La partition est **indicative** — elle détermine uniquement ce qui s'exécute en parallèle. Le résultat validé (état + racine d'état) est produit par la même exécution déterministe qu'une simple relecture séquentielle, et est donc **identique sur chaque nœud honnête**, quel que soit le nombre de cœurs ou l'ordonnancement des fils d'exécution.

## Formation du bloc

`ASSEMBLE → PARTITION → EXECUTE → COMMIT` :

1. **Assembler** — Les crédits Core→EVM (envois spot vers des destinataires côté EVM, mints du bridge) sont placés en premier, puis les transactions utilisateur dans l'ordre canonique du consensus.
2. **Partitionner** — Les transactions sont regroupées en strates de conflits selon une règle dérivée du contenu que chaque nœud recalcule de manière identique.
3. **Exécuter** — Les strates s'exécutent en parallèle sous l'exécuteur Block-STM. Un ensemble d'accès mal estimé est détecté par la revalidation de l'ensemble de lecture et réexécuté, de sorte que la correction ne dépend jamais de la partition — seule la vitesse en dépend.
4. **Valider** — Les écritures finalisées sont validées dans l'ordre d'index des transactions ; la racine d'état est calculée sur l'état validé.

## Gas et frais

- Une **limite de gas agrégée par bloc** (plafond anti-DoS) ainsi qu'un **plafond de gas par transaction**. Le plafond par transaction absorbe l'ancien rôle du bloc lourd : les déploiements / `CREATE` bénéficient d'un plafond élevé **à chaque bloc** ; les échanges ordinaires sont soumis à un plafond bas.
- Un seul marché de base fee **EIP-1559** ; la base fee est **brûlée**. Le budget de gas par bloc est **élastique** — il s'élargit sous charge soutenue et se réduit en période de faible activité — avec un **plancher minimum** strict, de sorte que la capacité dans le pire des cas ne descend jamais en dessous d'une base fixe.
- La cadence est rythmée par les cycles de consensus ; `block.timestamp` est dérivé du consensus (déterministe — pas d'horloge murale).

## Trading résistant au MEV (opt-in, par marché)

La microstructure de marché est une préoccupation de premier ordre, aussi la résistance au MEV est une propriété de la **construction du bloc**, et non une mesure secondaire du marché des frais — et elle est opt-in par marché :

- Un marché en mode **enchère par lots fréquente (FBA)** regroupe ses intentions d'ordres pour un cycle en **un seul lot atomique** qui se liquide à un **prix uniforme unique**. Il n'existe aucune priorité intra-lot à devancer, le sandwiching est sans intérêt (tout le monde obtient le même prix), et la course à la latence ne fait pas bouger le prix.
- Les intentions d'ordres peuvent être **chiffrées à seuil** — leur contenu est caché au proposant du bloc jusqu'à ce que l'ordonnancement soit déjà validé.
- Les transactions qu'une enchère ne peut pas couvrir bénéficient d'un **ordonnancement équitable vérifiable** (une graine dérivée du hash du parent du bloc et de son numéro), supprimant ainsi toute discrétion du proposant dans l'ordonnancement.
- Les marchés sont par défaut en **mode continu** (largement compatible avec les attentes EVM standard) et optent par marché pour le mode FBA, de sorte que le déploiement est progressif et réversible.

La liquidation s'effectue sur le moteur de correspondance MetaFlux Core ; le bloc EVM **synchronise** son flux d'intentions d'échange avec cette enchère — il n'existe qu'**un seul** chemin de liquidation, sans doublon à l'intérieur de l'EVM.

## Niveaux de confirmation

- Confirmation **finale** (consensus) à chaque cycle — le seul niveau qui entre dans l'état validé.
- Un **accusé de réception optionnel** peut être exposé pour les expériences utilisateur sensibles à la latence ; il **ne fait pas** partie du consensus. Les actions à risque financier — mints du bridge, retraits — reposent uniquement sur la confirmation **finale**.

## Voir aussi

- [Interagir avec Core](interacting-with-core.md) — précompilés (lecture) + CoreWriter (écriture)
- [Transferts Core ↔ EVM](core-evm-transfers.md)
- [Délais d'interaction](interaction-timings.md)
