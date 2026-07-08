# MIP — Propositions d'amélioration du marché

:::info
**Statut.** MIP-1 implémenté · MIP-2 en cours · MIP-3 implémenté · MIP-4 planifié (V2) · MIP-5 (Earn) planifié · MIP-6 différé (V3).
:::

MetaFlux suit un modèle numéroté de propositions d'amélioration (analogue aux schémas de propositions d'amélioration utilisés par les protocoles de contrats perpétuels on-chain établis) pour les modifications au niveau du protocole qui affectent les marchés listés, la liquidité native ou les mécanismes de frais fondamentaux.

| MIP | Titre | Statut |
|-----|-------|--------|
| [MIP-1](./mip-1.md) | Standard de token spot + déploiement de marché | Implémenté |
| [MIP-2](./mip-2.md) | Metaliquidity — coffre de liquidité protocolaire | En cours |
| [MIP-3](./mip-3.md) | Déploiement de marché perp sans permission | Implémenté |
| [MIP-4](./mip-4.md) | Agrégateur / internaliseur de liquidité perp | Planifié (V2) |
| [MIP-5](./mip-5.md) | Earn — pool de prêt spot | Planifié |
| [MIP-6](./mip-6.md) | Marchés de résultats / de prédiction | Différé (V3) |

Les propositions de déploiement séparent le spot du perp de la même façon que le font les plateformes établies : **MIP-1** concerne le déploiement sans permission de tokens spot et de marchés (la famille d'actions `spotDeploy`), **MIP-3** concerne les marchés perp déployés par des builders sans permission (la famille d'actions `perpDeploy`). Les deux s'appuient sur les mêmes trois flux d'enchères de gaz. (L'implémentation actuelle regroupe encore les deux familles d'actions dans un seul module et désigne le chemin spot sous l'appellation « MIP-3 » ; ce point est en cours de réalignement — le comportement reste inchangé.) **MIP-2 (Metaliquidity)** est le coffre de liquidité native appartenant au protocole. **MIP-4** est un agrégateur opéré par MetaFlux acheminant les flux de détail, en complément des marchés sans permission. **MIP-6** (Outcomes) portait précédemment le numéro MIP-4 et a été renuméroté lorsque MIP-4 a été redéfini comme agrégateur. **MIP-5 (Earn)** représente le côté offre du pool de prêt — les déposants perçoivent un rendement issu des intérêts payés par les emprunteurs sur marge spot, en réutilisant le modèle NAV/part de MIP-2.

## Périmètre V1

La V1 couvre MIP-1, MIP-2 et MIP-3. MIP-4 (agrégateur) est ciblé pour la V2 ; MIP-6 (Outcomes) est différé à la V3. MIP-5 (Earn) est planifié, à la suite des travaux sur la marge spot sur lesquels il repose.
