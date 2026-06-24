# Marge au comptant

:::info
**Disponible sur le devnet (aperçu).** Trading au comptant avec effet de levier, financé par le pool de prêt [Earn](../concepts/earn.md). Le [trading au comptant simple](./spot.md) fonctionne uniquement sur la base du solde disponible (sans levier) ; la marge au comptant est la surcouche qui ajoute l'emprunt et l'effet de levier. La boucle complète dépôt → emprunt → achat avec levier → clôture ET la [liquidation forcée](#liquidation) automatique s'exécutent de bout en bout sur le **devnet aujourd'hui** (voir la [surface d'action](#action-surface) ci-dessous). Considérez ceci comme un **aperçu** : les **ratios de maintenance par paire sont des paramètres de gouvernance encore en cours de calibrage**. L'effet de levier fonctionne sur le devnet ; ne présumez pas d'une sécurité en production à grande échelle.
:::

## En résumé

La marge au comptant vous permet d'**emprunter du USDC en contrepartie de collatéral pour acheter au comptant avec effet de levier**, au lieu de payer 100 % d'avance. Le USDC emprunté provient du pool [Earn](../concepts/earn.md), vous payez des **intérêts** dessus, et la position comporte une **marge de maintenance** et un **prix de liquidation** à l'image d'un contrat perpétuel.

Dans la première version, la marge au comptant est **isolée par paire** — chaque position au comptant avec levier dépose sa propre marge et est liquidée de façon indépendante, séparément de votre compte croisé de perpétuels.

## Fonctionnement

```
1. Post collateral (USDC) for the pair — a pure loss buffer.
2. Borrow quote from the Earn pool; the borrow funds the buy 100%.
3. IOC-buy the base asset on the spot book with the borrowed quote.
   The bought base is held SEGREGATED on the margin account.
4. Pay borrow interest continuously while the loan is open.
5. Close: sell the base, repay borrow + accrued interest, keep the remainder.
```

Le collatéral ne **finance pas** l'achat — c'est l'emprunt qui le fait. Le collatéral constitue le tampon de perte qui rend la position sur-collatéralisable, de sorte que l'effet de levier ≈ `notional / collateral`. L'actif de base acheté est conservé dans un compartiment **ségrégué** sur le compte de marge, jamais mélangé à vos soldes au comptant disponibles — ainsi, une clôture (ou une liquidation ultérieure) ne touche qu'à cette position précise. La première version n'autorise **qu'une seule position ouverte par `(account, pair)`** (pas d'ajout) ; l'IOC d'ouverture **rembourse immédiatement tout emprunt non utilisé**, de sorte que l'encours correspond uniquement à ce que l'achat a effectivement dépensé.

### Surface d'action

Les six actions [`/exchange`](../api/rest/exchange.md#spot-margin--earn) (toutes autorisées par l'émetteur) pilotent la boucle. Confirmez l'état validé via [`/info` `spot_margin_state`](../api/rest/info.md#spot_margin_state).

| Action | Effet |
|---|---|
| [`spot_margin_deposit`](../api/rest/exchange.md#spot_margin_deposit) | Dépose du collatéral en USDC pour la paire (la marge doit être activée) |
| [`spot_margin_open`](../api/rest/exchange.md#spot_margin_open) | Emprunt + achat IOC de l'actif de base avec levier ; conditionné au respect de l'exigence de marge initiale |
| [`spot_margin_close`](../api/rest/exchange.md#spot_margin_close) | Vente IOC de l'actif de base détenu, remboursement du principal + intérêts, restitution du solde restant |
| [`spot_margin_withdraw`](../api/rest/exchange.md#spot_margin_withdraw) | Retrait du collatéral libre (totalité si la position est plate ; conditionné à la marge initiale si une position est ouverte) |

### Marge

```
position_value   = base_held × mark_px
debt             = borrowed + accrued_interest
equity           = position_value − debt
init_required    = position_value × spot_margin_initial_bps / 10000
maint_required   = position_value × spot_margin_maintenance_bps / 10000
health           = equity / maint_required
```

Une ouverture est rejetée si elle laissait `equity < init_required`. La position est liquidée lorsque `health < 1` (les capitaux propres tombent sous le plancher de maintenance).

Le **ratio de maintenance au comptant est un paramètre par paire, défini de façon conservatrice** — et généralement plus élevé que celui d'un perpétuel de liquidité comparable. La raison est mécanique : une liquidation avec marge au comptant **vend l'actif de base sur le carnet au comptant**, de sorte que le tampon de maintenance doit couvrir le **glissement** (slippage) réalisé lors du débouclage de la position au seuil, faute de quoi le pool de prêt absorbe le déficit. Les carnets moins profonds (actifs de longue traîne) subissent plus de glissement et affichent donc un ratio plus élevé. La valeur exacte par paire est **calibrée à partir de la profondeur du carnet et de la volatilité de cette paire, par rapport à une borne cible de glissement à la liquidation** — il s'agit d'un paramètre de risque fixé par la gouvernance, non d'une constante, et une paire n'active la marge au comptant que lorsque son ratio est calibré. **Sur le devnet, ces ratios par paire sont encore en cours de calibrage** — une paire sans paramètres de risque calibrés rejette toute action de marge au comptant la concernant (`spot margin not enabled for pair`).

### Intérêts

Le USDC emprunté accumule des intérêts à un taux par paire (`spot_borrow_rate_bps`, annualisé, accumulé à chaque bloc). Les intérêts vont au pool [Earn](../concepts/earn.md), en augmentant la valeur par part — c'est le rendement des prêteurs. Dans la première version, le taux est **fixe** ; une courbe basée sur l'utilisation est prévue dans une version ultérieure.

### Liquidation

**Active sur le devnet.** À chaque bloc, la chaîne réévalue chaque compte de marge au prix mark au comptant de la paire (dernier prix de transaction du carnet) et force la clôture de tout compte dont les capitaux propres sont tombés sous le plancher de maintenance :

```
liquidate when   collateral + base_held × mark − debt  <  base_held × mark × maint_bps / 10⁴
```

La clôture forcée emprunte le **même chemin réglé qu'une clôture volontaire** — l'actif de base détenu est vendu en IOC sur le carnet au comptant, le pool Earn est remboursé du principal + des intérêts, le solde restant (moins de petits **frais de liquidation** qui capitalisent le fonds d'assurance du protocole) est restitué et le compte se ferme. Deux propriétés anti-cascade reprennent celles de la [clôture forcée des perpétuels](../concepts/tiered-liquidation.md#how-a-forced-close-executes-the-price-floor) :

- **Plancher de prix.** La vente forcée est une LIMIT bornée à `mark × (1 − floor)` (par défaut : la moitié du ratio de maintenance, configurable par paire). Un carnet peu profond n'est jamais balayé — ce qui ne peut pas être vendu au-dessus du plancher reste en détention et est réévalué au bloc suivant.
- **Les remplissages partiels maintiennent le compte ouvert.** Le produit réalisé rembourse la dette immédiatement ; l'actif de base non vendu est retransmis au marché lorsque la liquidité revient.

Un défaut se règle contre le **collatéral isolé propre à la position** et le pool Earn — il n'atteint jamais votre compte croisé de perpétuels.

**Gestion du déficit.** Lorsqu'un débouclage complet ne suffit pas à couvrir la dette (le produit + le collatéral sont insuffisants), l'intégralité du principal du prêt sort quand même du livre d'emprunts du pool et le **déficit est socialisé auprès des fournisseurs Earn** — le total fourni par le pool est réduit (plancher à zéro), ce qui abaisse la valeur des parts. Le ratio de maintenance conservateur par paire et le liquidateur automatique ont pour but de rendre ce déficit rare.

## Frais

Une position avec marge au comptant comporte trois charges distinctes :

| Charge | Moment | Taux |
|---|---|---|
| **Frais de trading** | lors des remplissages IOC à l'ouverture et à la clôture | le [taux maker/taker au comptant](./spot.md#matching-fills-and-fees) de la paire (la marge au comptant opère sur le carnet au comptant) |
| **Intérêts d'emprunt** | en continu, sur l'encours de l'emprunt en USDC | `spot_borrow_rate_bps` — par paire, annualisé, accumulé à chaque bloc ; reversé au pool [Earn](../concepts/earn.md) en tant que rendement des prêteurs |
| **Frais de liquidation** | uniquement lors d'une clôture forcée | un petit frais par paire qui capitalise le fonds d'assurance du protocole |

L'ouverture et la clôture sont des remplissages IOC au comptant ordinaires, donc ils appliquent le barème de frais **au comptant**, et non les paliers des perpétuels. Les intérêts d'emprunt constituent le coût spécifique à la marge au comptant — ils correspondent exactement au rendement reçu par les fournisseurs [Earn](../concepts/earn.md). Tous les taux sont des paramètres de gouvernance par paire ; interrogez-les via [`/info spot_margin_state`](../api/rest/info.md#spot_margin_state) et le [`fee_schedule`](../api/rest/info.md#fee_schedule) au comptant.

## Portée du collatéral

| Version | Collatéral | Rayon de souffle de la liquidation |
|---|---|---|
| V1 | **Isolé par paire** — chaque position dépose son propre USDC | Uniquement cette position |
| Ultérieure | Éligible au mode croisé (partage le collatéral du compte) | À l'échelle du compte |

L'isolation par paire maintient la première version dans un périmètre maîtrisé : un défaut sur une position au comptant avec levier ne peut pas atteindre votre solde croisé de perpétuels.

## Relation avec Earn

Les emprunteurs en marge au comptant constituent le **côté demande** ; les déposants [Earn](../concepts/earn.md) constituent le **côté offre**. Les intérêts d'emprunt payés par les traders en marge au comptant correspondent exactement au rendement perçu par les déposants Earn. Consultez [Earn](../concepts/earn.md) pour le calcul du rendement.

## Voir aussi

- [Earn](../concepts/earn.md) — le pool de prêt qui finance les emprunts en marge au comptant, et la méthode de calcul du rendement
- [Modes de marge](../concepts/margin-modes.md) — le modèle de marge partagé avec les perpétuels
- [Liquidation à paliers](../concepts/tiered-liquidation.md) — l'échelle de liquidation et la cascade d'assurance

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Le trading au comptant simple (sans levier) est-il affecté ?**
R : Non. Acheter au comptant avec 100 % de votre propre solde fonctionne exactement comme avant — la marge au comptant est une surcouche optionnelle.

**Q : Une perte en marge au comptant peut-elle toucher mon compte de perpétuels ?**
R : Pas dans la première version — la marge au comptant est isolée par paire. La collatéralisation croisée est une mise à niveau ultérieure et optionnelle.

**Q : D'où provient le USDC emprunté ?**
R : Du pool de prêt [Earn](../concepts/earn.md). Les emprunts sont plafonnés à la liquidité disponible (non prêtée) du pool.

**Q : Quel taux est-ce que je paie ?**
R : Un taux annualisé fixe par paire dans la première version, accumulé à chaque bloc. Une tarification basée sur l'utilisation est prévue ultérieurement.

</details>
