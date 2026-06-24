# MIP-6 — Marchés de résultats / prédiction

:::info
**Reporté à la V3.** Hors du périmètre de la v1 et de la v2. Renuméroté depuis MIP-4.
:::

MIP-6 est le mécanisme de **marchés de résultats / prédiction** de MetaFlux — des marchés
on-chain où les utilisateurs tradent sur la résolution de résultats binaires ou catégoriels
(l'équivalent des propositions d'amélioration de marchés de prédiction sur les plateformes
on-chain existantes). Il s'agit d'un axe de différenciation futur, reporté à la **V3**.

## Pourquoi ce numéro distinct

Les marchés de résultats étaient **initialement numérotés MIP-4**. Lorsque le projet a
réaffecté MIP-4 à l'[Agrégateur/Internaliseur de liquidités perps](./mip-4.md), le
concept de marchés de résultats a été renuméroté en **MIP-6** et repoussé du backlog V2
vers le backlog V3. L'attribution d'un nouveau numéro évite toute confusion liée à la
réutilisation de MIP-4 pour deux mécanismes sans rapport. Ne pas désigner les marchés de
résultats sous le nom « MIP-4 ».

## Pourquoi ce report

- Il s'agit d'un axe de différenciation de moindre priorité : les dérivés / contrats
  perpétuels constituent le principal terrain de jeu, et les revenus retail générés par
  l'agrégateur MIP-4 dépassent largement l'opportunité offerte par les marchés de résultats.
- La liquidation des marchés de résultats introduit une complexité de compensation dont le
  cœur du protocole n'a pas besoin par ailleurs : elle repose sur la résolution par oracle
  externe, des fenêtres temporelles et la gestion des litiges.
- Les marchés de prédiction présentent une sensibilité réglementaire spécifique à chaque
  juridiction, qu'il est préférable d'aborder une fois le protocole central arrivé à maturité.

Lorsque les marchés de résultats seront déployés, ils le seront en tant que MIP-6, avec leur
propre conception en matière de résolution, d'oracle et de gestion des litiges — aucun de
ces éléments n'est réservé à l'avance aujourd'hui.

## Voir aussi

- [MIP-4 — agrégateur/internaliseur de liquidités perps](./mip-4.md) — la proposition
  qui a repris le numéro MIP-4.
