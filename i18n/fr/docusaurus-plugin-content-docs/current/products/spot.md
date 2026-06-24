---
description: Le CLOB au comptant en production — échanges token-contre-token avec séquestre de solde réservé, sans effet de levier.
---

# Trading au comptant

:::tip
**En production.** Le trading au comptant simple est disponible — un carnet d'ordres token-contre-token, distinct des contrats perpétuels, sans effet de levier et sans positions. (Le comptant avec levier correspond à la piste distincte et planifiée [spot-margin](./spot-margin.md).)
:::

:::info
**Seul le trading au comptant sans levier est conforme à la charia.** Parmi les produits proposés sur MetaFlux, seul le trading au comptant **sans levier** — l'achat et la vente d'actifs à leur pleine valeur, sans **effet de levier, sans marge, sans emprunt et sans financement** — est généralement considéré comme compatible avec les principes de la finance islamique (charia). Ne lisez pas « comptant » en général comme conforme : seule la forme sans levier l'est. Les produits non conformes incluent explicitement le **trading au comptant avec marge (spot à effet de levier)**, ainsi que les contrats à terme perpétuels et tout autre produit à effet de levier, dérivé ou fondé sur l'emprunt. L'effet de levier et l'emprunt introduisent l'intérêt (riba), et la spéculation et l'incertitude qui en résultent introduisent le gharar et le maysir — ces produits ne sont donc généralement PAS conformes à la charia. Les utilisateurs musulmans doivent trader en conséquence et consulter leurs propres savants. Cette information est fournie à titre indicatif, et ne constitue pas un conseil religieux ou financier.
:::

## En bref

Le comptant est un **carnet d'ordres à cours limité central token-contre-token** : vous échangez un token contre un autre au prix de votre choix. Il est entièrement distinct des contrats perpétuels — carnets distincts, soldes distincts, **sans effet de levier et sans positions**. Vous ne tradez que ce que vous possédez. Un ordre au comptant en attente bloque les fonds qu'il devrait verser à l'exécution dans un **solde réservé** (séquestre) ; ces fonds sont versés à la contrepartie à l'exécution, ou remboursés lors de l'annulation.

Un ordre au comptant est simplement une autre action [`/exchange`](../api/rest/exchange.md) —
[`spot_order`](../api/rest/exchange.md#spot_order) pour passer un ordre,
[`spot_cancel`](../api/rest/exchange.md#spot_cancel) pour l'annuler. Les deux sont
**autorisés par l'expéditeur** (le signataire récupéré est le trader ; il n'y a pas de champ `owner`) et peuvent être signés par le compte principal ou un
[portefeuille agent](../concepts/agent-wallets.md) actif.

## Qu'est-ce qu'une paire au comptant

Une paire au comptant échange un token de **base** contre un token de **cotation** (ex. `B/Q`). Le côté de l'ordre détermine la direction :

| `side` | Vous donnez | Vous recevez | Séquestre bloqué en attente |
|--------|-------------|--------------|------------------------------|
| `bid` (achat) | cotation | base | **cotation** — notionnel à votre prix limite |
| `ask` (vente) | base | cotation | **base** — la base que vous proposez |

Le champ de l'ordre est l'**identifiant de la paire au comptant** (`pair`), distinct d'un identifiant de `market` perp et d'un identifiant de token. Les paires sont déployées sous
[MIP-1](../mip/mip-1.md) (standard de token au comptant + déploiement de marché) ; chacune porte ses propres tokens de base/cotation, décimales de taille, notionnel minimum optionnel et remplacements de frais.

## Séquestre de solde réservé

C'est le cœur du fonctionnement du comptant sans levier. Lorsqu'un ordre `gtc` / `alo`
(ou le résidu non apparié d'un tel ordre) **repose** dans le carnet, le protocole transfère les fonds qu'il devrait verser en cas d'exécution complète de votre solde dépensable vers un **solde réservé** :

- Un **bid** en attente réserve la **cotation** égale à son notionnel au prix limite
  (`size × limit_px`).
- Un **ask** en attente réserve la **base** qu'il propose.

Les fonds réservés ne sont pas dépensables. Ils sont :

- **versés à la contrepartie** lors de l'exécution de l'ordre,
- **remboursés sur votre solde dépensable** lors de l'[annulation](#lifecycle--cancel-refunds-escrow),
  en cas de prévention d'auto-transaction (STP), ou si le marché est désactivé.

Les soldes par token sont conservés exactement à travers chaque événement de repos, d'exécution, d'annulation et de STP — dépensable plus réservé est invariant par token par compte (vérifié par fuzz sur des flux aléatoires de repos/croisement/annulation).

## Écrêtage d'abordabilité

Vous ne pouvez jamais reposer ou exécuter plus que ce que vous pouvez financer. À l'admission, la taille de l'ordre est **écrêtée** à ce que votre solde couvre :

- un **bid** est écrêté par `quote_balance ÷ limit_px`,
- un **ask** est écrêté par la base que vous possédez réellement.

Un ordre entièrement inabordable est une **opération nulle acceptée** — rien ne s'exécute, rien ne repose, aucun identifiant d'ordre n'est consommé. Un ordre partiellement abordable trade/repose la portion abordable. Comme l'écrêtage s'effectue **avant** la mise en correspondance, chaque exécution résultante et chaque réservation de séquestre est financée ; il n'y a pas d'abandon d'exécution après mise en correspondance.

## Mise en correspondance, exécutions et frais

La mise en correspondance au comptant utilise le même CLOB prix-temps que le reste de MetaFlux. Une exécution échange la base contre la cotation au **prix de repos du teneur de marché**.

Les frais sont prélevés **sur la jambe que chaque côté reçoit** :

- les frais de **preneur** sont prélevés sur la jambe que le preneur reçoit,
- les frais de **teneur** sont prélevés sur la jambe que le teneur reçoit.

Ainsi, un acheteur (recevant la base) paie ses frais en base ; un vendeur (recevant la cotation) paie ses frais en cotation. Les frais s'accumulent sur un compte de frais au comptant dédié, distinct du pool de frais des contrats perpétuels.

| Côté | Frais prélevés sur | Taux |
|------|--------------------|------|
| **Preneur** | la jambe que vous recevez (acheteur → base, vendeur → cotation) | `taker_fee_bps` de la paire, sinon le défaut global au comptant |
| **Teneur** | la jambe que vous recevez | `maker_fee_bps` de la paire, sinon le défaut global au comptant |

Les frais au comptant sont **par paire** : une paire peut définir ses propres `taker_fee_bps` /
`maker_fee_bps`, et en l'absence de configuration le défaut global au comptant s'applique. Le comptant utilise un taux fixe par paire — les paliers de volume perp / remise teneur / staking ne s'appliquent **pas** au comptant. Consultez les valeurs en temps réel dans la réponse [`/info fee_schedule`](../api/rest/info.md#fee_schedule) ; voir [frais](../concepts/fees.md#spot-fees) pour le modèle de règlement.

## Durée de validité

Les ordres au comptant portent le même ensemble de TIF que les perpétuels, avec une règle spécifique au comptant :

| `tif` | Comportement au comptant |
|-------|--------------------------|
| `gtc` | Croise ce qu'il peut ; tout résidu **repose** (garanti par séquestre) jusqu'à exécution ou annulation |
| `alo` | Ajout de liquidité uniquement ; un `alo` croisant est **rejeté** (ne prend jamais). Un `alo` non croisant repose |
| `ioc` | Croise ce qu'il peut immédiatement ; le résidu est écarté — **ne repose jamais**, n'est jamais mis en séquestre |

`aon` est rejeté (pas d'équivalent dans le noyau). La prévention d'auto-transaction utilise le même ensemble
[`stp_mode`](../concepts/order-types.md) que les perpétuels (`cancel_oldest` / `cancel_newest` /
`cancel_both`) ; `reject` n'est pas pris en charge.

:::info
**Cours limité uniquement (pour l'instant).** Chaque ordre au comptant doit comporter un `limit_px` positif. Un ordre au marché (`limit_px = 0`) n'est **pas encore pris en charge** — un achat au marché sans borne nécessite un écrêtage d'abordabilité par parcours du carnet, encore en feuille de route. Envoyez un cours limité ; le coût est alors borné par `limit_px × size`.
:::

## Cycle de vie — l'annulation rembourse le séquestre

[`spot_cancel`](../api/rest/exchange.md#spot_cancel) retire l'un de **vos**
ordres en attente par `oid` sur une paire et rembourse le séquestre bloqué sur votre solde dépensable.

- **Propriétaire uniquement.** Seul le propriétaire de l'ordre peut l'annuler ; un tiers est rejeté
  (`not the order owner`).
- **Absence typée.** Un `oid` inconnu ou déjà disparu renvoie `order not found`
  (sans conséquence).
- **Toujours disponible.** Les annulations ne sont **pas** conditionnées par l'arrêt du comptant — même lorsque de nouveaux ordres sont désactivés, vous pouvez toujours sortir d'un ordre en attente et récupérer son séquestre.

## Limites et gouvernance

- **Plafond d'ordres en attente.** Chaque compte peut avoir jusqu'à **1000** ordres en attente par paire au comptant ; un nouvel ordre en attente dépassant ce plafond est rejeté (`spot resting-order cap reached — cancel some orders first`). Les comptes de teneurs de marché reconnus sont exemptés. Les ordres `ioc` ne reposent jamais, ils ne sont donc jamais soumis au plafond.
- **Notionnel minimum.** Une paire peut définir un notionnel minimum ; un ordre inférieur à ce seuil est rejeté.
- **Arrêt du comptant (gouvernance).** Le trading au comptant peut être globalement activé ou désactivé par la gouvernance. Lorsqu'il est désactivé, les **nouveaux** ordres sont rejetés (`spot trading disabled`), mais les annulations fonctionnent toujours afin que le séquestre en attente ne soit jamais bloqué.

## Lecture de l'état au comptant

Les soldes au comptant et les ordres au comptant ouverts sont interrogeables via
[`POST /info`](../api/rest/info.md). Un `spot_order` renvoie un statut **synchrone**
par ordre une fois validé — le `oid` réel attribué avec une entrée `resting` ou
`filled` (ou `error`), ou `pending` si aucune validation n'arrive dans la fenêtre d'attente d'ordre — la même union de statuts que le
[`submit_order`](../api/rest/exchange.md#submit_order) des perpétuels.

## Relation avec le spot-margin et Earn

Le comptant simple est la **référence de base** : tradez uniquement ce que vous possédez, sans effet de levier, sans liquidation. Deux couches planifiées s'appuient dessus :

- [**Spot margin**](./spot-margin.md) (planifié) — emprunter la cotation contre un collatéral
  pour acheter au comptant avec effet de levier, avec une marge de maintenance et un prix de liquidation.
- [**Earn**](../concepts/earn.md) (planifié) — un pool de prêt USDC qui finance les emprunts du spot-margin
  et génère les intérêts d'emprunt comme rendement.

Les deux sont des **couches optionnelles** ; le comptant simple n'est pas affecté par elles.

## Voir aussi

- [`spot_order`](../api/rest/exchange.md#spot_order) / [`spot_cancel`](../api/rest/exchange.md#spot_cancel) — les actions réseau et les tableaux de champs
- [Types d'ordres](../concepts/order-types.md) — sémantique TIF et STP partagée avec les perpétuels
- [Frais](../concepts/fees.md#spot-fees) — le barème de frais au comptant et la facturation sur la jambe reçue
- [Spot margin](./spot-margin.md) — la piste de comptant avec levier planifiée
- [MIP-1](../mip/mip-1.md) — standard de token au comptant et déploiement de marché

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Ai-je besoin de collatéral ou de marge pour trader au comptant ?**
R : Non. Le comptant est uniquement basé sur le solde — vous tradez ce que vous possédez. Il n'y a pas de marge, pas d'effet de levier et pas de liquidation. (L'effet de levier correspond à la piste distincte et planifiée [spot-margin](./spot-margin.md).)

**Q : Qu'arrive-t-il à mes fonds lorsque mon ordre est en attente ?**
R : Ils sont conservés dans un solde réservé (séquestre) — non dépensables, mais vous appartenant. Ils sont versés à la contrepartie à l'exécution, ou reviennent à votre solde dépensable lors de l'annulation.

**Q : Pourquoi mon grand achat n'a-t-il été que partiellement exécuté / en attente ?**
R : Écrêtage d'abordabilité. La taille de l'ordre est réduite à ce que votre solde de cotation finance au prix limite. Un ordre entièrement inabordable est une opération nulle acceptée.

**Q : Puis-je passer un ordre au marché au comptant ?**
R : Pas encore — envoyez toujours un `limit_px` positif. Les ordres au marché au comptant sont en feuille de route.

**Q : Les exécutions au comptant et les exécutions perp utilisent-elles le même carnet ?**
R : Non. Le comptant possède ses propres carnets, soldes et compte de frais, entièrement distincts des perpétuels.

</details>
