# MIP-6 — Marchés de résultats / prédiction

:::info
**Reporté à la V3.** Hors du périmètre v1 et v2. Renuméroté depuis MIP-4.
:::

MIP-6 est le mécanisme de **marchés de résultats / prédiction** de MetaFlux — des
marchés on-chain sur lesquels les utilisateurs tradent sur la résolution de résultats
binaires ou catégoriels (l'équivalent de la proposition d'amélioration des marchés de
prédiction sur les plateformes on-chain existantes). Il s'agit d'une fonctionnalité
future, reportée à la **V3**.

## Pourquoi ce mécanisme a son propre numéro

Outcomes était **initialement numéroté MIP-4**. Lorsque le projet a réaffecté MIP-4 à
l'[Agrégateur / Internaliseur de liquidité pour les perps](./mip-4.md), le concept
Outcomes a été renuméroté **MIP-6** et déplacé du backlog V2 vers le backlog V3.
L'attribution d'un nouveau numéro évite toute confusion liée à la réutilisation de MIP-4
pour deux mécanismes sans rapport. Ne pas désigner Outcomes sous l'appellation « MIP-4 ».

## Pourquoi le report

- Il s'agit d'une fonctionnalité de moindre priorité : les dérivés / contrats perpétuels
  constituent le terrain de jeu principal, et les revenus retail générés par l'agrégateur
  MIP-4 dépassent largement l'opportunité représentée par Outcomes.
- Le règlement des Outcomes ajoute une complexité de compensation dont le cœur du
  protocole n'a pas besoin par ailleurs : il dépend de la résolution par oracle externe,
  de fenêtres temporelles et d'un mécanisme de gestion des litiges.
- Les marchés de prédiction présentent une sensibilité réglementaire propre à chaque
  juridiction, qu'il est préférable d'adresser une fois le protocole central mature.

Lorsque Outcomes sera livré, il le sera sous le nom MIP-6 avec sa propre conception en
matière de résolution, d'oracle et de gestion des litiges — aucun de ces éléments n'est
réservé à l'avance aujourd'hui.

## Voir aussi

- [MIP-4 — agrégateur / internaliseur de liquidité pour les perps](./mip-4.md) — la
  proposition qui a repris le numéro MIP-4.
