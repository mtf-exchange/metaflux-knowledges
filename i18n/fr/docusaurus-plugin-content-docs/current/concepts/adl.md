# Délevier automatique (ADL)

:::info
**Aperçu.** Le T4 ne se déclenche que lorsque le pool d'assurance ne peut pas couvrir intégralement un déficit T3 — rare en fonctionnement normal, mais conçu pour être déterministe lorsque cela se produit.
:::

## En bref

Lorsque le pool d'assurance ne peut pas absorber une perte de liquidation résiduelle, le protocole récupère auprès des contreparties bénéficiaires sur le même instrument, au prorata de leur PnL latent. L'allocation de MetaFlux repose sur un classement par apprentissage en ligne qui vise à minimiser la **décote excédentaire** (décote au-delà de ce que le déficit exige).

## Quand l'ADL se déclenche

L'[échelle par paliers](./tiered-liquidation.md) :

```
T0 carton jaune  →  T1 partiel  →  T2 complet  →  T3 filet de sécurité  →  T4 ADL
```

Le T3 transfère la position du compte défaillant vers un multisig de sécurité et prélève sur le pool d'assurance. Si `insurance_pool < shortfall`, le protocole passe au T4 : la perte non couverte restante est répartie sous forme de décote de position entre les contreparties bénéficiaires.

```
shortfall  =  liquidation_loss - insurance_pool_drawn
if shortfall > 0:
    fire_adl(asset, shortfall)
```

Le prélèvement sur le pool d'assurance est lui-même soumis à un plafond de débit — voir [liquidation par paliers](./tiered-liquidation.md#t3-backstop--netting-at-mark).

## Comment l'ADL est calculé

> **Pour aller plus loin :** « Autodeleveraging as Online Learning » (arXiv:2602.15182).

MTF n'utilise **pas** un score de classement unique. L'ADL se divise en deux sous-problèmes indépendants : une décision de **sévérité** en 1D (quelle décote appliquer à ce tour), apprise en ligne, et une **allocation pro-rata déterministe** (qui paie, selon la capacité en PnL).

> ⚠️ **Correction par rapport au texte précédent.** L'ancienne documentation décrivait un *classement* par apprentissage en ligne unique `score = α·pnl% + β·leverage + γ·age`. Ce n'est **pas** l'algorithme implémenté. Le vrai contrôleur est `θ ∈ [0,1]` pour la sévérité via descente de gradient en ligne projetée (OGD projetée) + allocation pro-rata par capacité. La formule de classement `α/β/γ` a été rejetée (« descente OGD 2D — explosion dimensionnelle »). La file classique `pnl% × leverage` est la référence HL que MTF remplace, non ce que MTF exécute.

### 1. Sévérité — descente de gradient en ligne 1D sur θ

Chaque tour choisit un scalaire `θ_t ∈ [0,1]` = la fraction du déficit de ce tour à décôter :

```
B_t          = θ_t · D_t                                  # budget pour ce tour
θ_needed_t   = clamp(B̂_needed / D_t, 0, 1)                 # estimation ex ante du besoin réel
grad         = D_t · sign(θ_t − θ_needed_t)
θ_{t+1}      = clamp(θ_t − η · grad, 0, 1)                 # pas OGD projeté
```

`D_t` = déficit du tour, `B̂_needed` = estimation de l'estimateur de prix d'exécution du besoin réel.

**Taille de pas η** (`AdlController::current_eta`) :
- Le mode par défaut est **Adaptatif** (Cor. 1 de l'article) : `η* = sqrt( (1 + 2·P_T^θ) / Σ D_t² )`, recalculé à chaque tour à partir de la télémétrie en cours (`path_variation`, `cumulative_squared_deficit`).
- Au premier tour (`Σ D_t² == 0`), il revient au `η₀ = 0.01` ajustable par la gouvernance (`default_eta`).
- Un mode `Fixed(c)` fixe `η = c` (interrupteur de gouvernance / reproductibilité).

Le contrôleur dispose d'une **borne de regret dynamique** (Prop 1) :

```
Reg_T^dyn  ≤  sqrt( (1 + 2·P_T^θ) · Σ D_t² )
```

exposée via `analytical_bound()` ; `check_bound(slack)` vérifie que le regret empirique ≤ `slack · bound` (slack par défaut : 4) dans les tests de chaos.

Tous les champs fractionnaires (`θ`, `η`, `path_variation`, …) sont de type `rust_decimal::Decimal` ; `sqrt` est une racine carrée `Decimal` par méthode de Newton entière (sans `f64`) ; chaque accumulateur utilise `saturating_*` (un `Decimal::from(u128 > MAX)` provoquerait sinon une panique et bloquerait le noyau). L'état persiste dans l'accumulateur BOLE **slot 5**.

### 2. Allocation — pro-rata déterministe par capacité

Avec le budget `B_t`, distribution entre les contreparties bénéficiaires `W_t` (chacune avec une capacité de décote `u_i` = PnL latent décotable, `u128`) :

```
total_u = Σ u_i
x_i     = floor( u_i · B_t / total_u )      capped at u_i        # mul 128 bits puis div 128 bits
```

Le **reliquat** de division entière `B_t − Σ x_i` est redistribué unité par unité dans l'**ordre croissant des AccountId** à tout gagnant ayant une capacité restante (`BTreeMap` itère dans l'ordre des clés → identique octet par octet entre les nœuds). Si `B_t > total_u`, le tour est limité par la capacité et `Σ x_i = total_u`.

Cela remplace les allocateurs par descente miroir vectorielle et par ILP rejetés (l'ILP est optimal, mais son solveur est non déterministe — incompatible avec la chaîne).

**Pourquoi le pro-rata** (relecture HL du 10 octobre 2025) :

| Algorithme | Objectif total du 10 octobre (plus bas = meilleur) |
|-----------|-----------------------------------------|
| HL production (heuristique ROE) | ~45 M$ de dépassement |
| **MTF pro-rata** | **3,40 M$** (~13× meilleur) |
| Descente miroir vectorielle | 4,41 M$ |
| ILP min-max (optimal, hors chaîne seulement) | 106 k$ |

Le pro-rata offre également **0 %** de violations de monotonicité (contre 11,4 % pour HL) et une stabilité de classement ≈ 1,0 (contre 0,34 pour HL).

### Cotation du prix ADL (côté lecture)

Le précompilé EVM `0x0902 adl_pro_rata_price` permet à un assistant Solidity de *coter* le prix moyen pondéré en volume (VWAP) qu'un ADL de taille N effacerait en parcourant la file selon la priorité adaptée au sens (ADL long : prix le plus élevé en premier ; ADL short : prix le plus bas en premier) — **tous les prix sur le plan à virgule fixe 1e8** (`price_e8`, `capacity_e8`). Il est exclusivement pro-rata ; l'OGD de sévérité vit dans l'état du cœur, non dans le précompilé sans état (la sévérité est une décision par tour ; la cotation de prix est appelée de nombreuses fois par seconde).

## Ce que signifie mécaniquement la « décote »

La décote n'est pas un transfert de position — la taille de position de la contrepartie **diminue** et son PnL latent est converti en perte réalisée. La position opposée du compte défaillant s'évapore du même montant.

Concrètement : supposons que le compte A est long de 1 BTC à l'entrée 100 et que le compte B est short de 1 BTC à l'entrée 100, avec un prix mark de 110.

- A est bénéficiaire (+10 USDC de PnL latent).
- B est le compte défaillant, liquidé ; la position se résout au prix mark de 110, mais B ne dispose que de 5 USDC de fonds propres. Déficit de 5 USDC.
- Pool d'assurance : 0 (épuisé).
- L'ADL se déclenche contre A :
  - La position longue de A est réduite à 0,5 BTC.
  - A réalise +5 USDC de PnL (la partie décotée).
  - Le 0,5 BTC long restant de A est à l'entrée 100, prix mark 110, +5 USDC de PnL latent.
  - La position short de B est entièrement clôturée.

A conserve le PnL latent sur sa position restante ; A ne perd que le PnL de la *portion clôturée*.

## Notification

Les événements ADL sont émis sur le [canal WS `userEvents`](../api/ws/subscriptions.md#userevents) :

```json
{
  "kind":        "adl",
  "asset":       0,
  "haircut_sz": "50000000",
  "realised_pnl": "5000000",
  "block":       12345
}
```

Ainsi qu'une notification à l'échelle du compte :

```json
{ "kind": "marginChange", "free": "...", ... }
```

Pour les bots automatisés, traitez les événements `adl` comme un remplissage forcé — votre position a changé, le protocole vous a fourni le prix d'exécution (prix mark au bloc de décote), et vous devrez généralement réévaluer votre stratégie.

## Prédire l'exposition à l'ADL

Pour les moniteurs de risque, l'état du compte [`/info`](../api/rest/info.md) inclut un champ `adl_rank_estimate` :

```json
"adl_rank_estimate": {
  "asset": 0,
  "percentile": 95,
  "score": 1.2
}
```

`percentile: 95` signifie que vous faites partie des 5 % de comptes les plus exposés sur cet actif. Les comptes dans le décile supérieur sont les plus exposés si l'ADL se déclenche.

Il s'agit d'une estimation — le classement réel intervient au moment du déclenchement de l'ADL, sur l'état alors en vigueur. Pour les teneurs de marché gérant de larges carnets d'ordres, le risque principal est la concentration (une position importante dominant l'intérêt ouvert de l'actif) ; diversifier les actifs réduit l'exposition à l'ADL.

## Cas limites

<details>
<summary>Afficher les cas limites</summary>

- **Déficits multiples dans un même bloc.** Chacun est alloué indépendamment vis-à-vis de l'ensemble des contreparties en vigueur à ce moment. Les classements peuvent évoluer entre les événements.
- **Absence de contrepartie.** Si, au sens strict, aucune contrepartie bénéficiaire n'existe sur le même instrument, le déficit est socialisé dans le registre des « pertes non couvertes » du pool d'assurance, remboursable lors du prochain rechargement du pool. Ne devrait jamais arriver sur un actif liquide ; peut théoriquement survenir sur un marché MIP-3 à longue queue.
- **Contrepartie inscrite au PM.** L'ADL cible toujours le PnL latent sur le même instrument — l'inscription au PM ne modifie pas la granularité par actif de l'ADL. Le moteur de scénarios PM voit l'état post-décote au prochain bloc.
- **Marchés au comptant.** Le marché au comptant ne comporte pas de PnL latent au sens des contrats perpétuels. L'ADL au comptant n'est pas défini pour V1 ; les positions au comptant sont exclues du classement ADL.

</details>

## Séquence — ADL sur un actif à queue fine

```
block T:   account X liquidates on asset 42 (MIP-3 market), loss = 100 USDC
           insurance pool on asset 42 = 60 USDC
           D_t (deficit) = 40 USDC
           severity controller: θ_t resolves to 1.0 (full deficit needed)
           B_t = θ_t · D_t = 40                  # budget this round
           winners W_t on asset 42 (by haircut capacity u_i):
             A: u_A = 30
             B: u_B = 50    →    total_u = 80
           pro-rata: x_i = floor(u_i · B_t / total_u)
             x_A = floor(30·40/80) = 15
             x_B = floor(50·40/80) = 25          # Σ = 40, no dust
           result:
             A's position haircut by 15 USDC of PnL realised, 15 kept
             B's position haircut by 25 USDC of PnL realised, 25 kept
```

(L'allocation est **pro-rata par capacité**, non un parcours par score classé : chaque gagnant cède la même *fraction* de sa capacité — ici 50 % — ce qui correspond exactement à la propriété d'équité min-max que garantit le pro-rata. À comparer avec l'ancien modèle « classer par score, épuiser d'abord le palier supérieur », qui n'est pas ce que fait le code.)

## Voir aussi

- [Liquidation par paliers](./tiered-liquidation.md) — échelle complète
- [Pool d'assurance](./vaults.md#insurance-pool) — mécanisme T3
- [Marge de portefeuille](./portfolio-margin.md) — interaction du PM avec l'ADL
- [WS `userEvents`](../api/ws/subscriptions.md#userevents) — recevoir les notifications ADL

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Puis-je me désinscrire de l'ADL ?**
R : Non. L'ADL est un mécanisme de mutualisation des pertes au niveau du protocole ; se désinscrire ne ferait que reporter la perte sur quelqu'un d'autre. La minimisation de la décote excédentaire constitue la protection.

**Q : Pourquoi allouer au prorata de la capacité en PnL plutôt qu'une file classée par score ?**
R : La décote pro-rata applique à chaque gagnant la même *fraction* de son PnL décotable — équité min-max intégrée, aucune violation de monotonicité (deux comptes avec la même capacité subissent le même sort) et stabilité de classement ≈ 1,0. Elle s'est révélée environ 13× meilleure que la file à heuristique ROE de HL lors de la relecture du 10 octobre 2025 et à ~30 % du minimum ILP hors chaîne, tout en restant entièrement déterministe et compatible avec la chaîne. C'est la *sévérité* (combien décôter au total) qui est apprise en ligne ; *qui paie* relève du simple pro-rata.

**Q : L'ADL respecte-t-il le mode Strict-Iso ?**
R : Oui. L'ADL est conçu par actif ; les positions Strict-Iso sont candidates comme contreparties si et seulement si elles détiennent le même actif.

**Q : Le classement est-il déterministe entre les validateurs ?**
R : Oui — toutes les entrées (capacité en PnL `u_i` de chaque gagnant, déficit du tour `D_t`) sont lues depuis l'état validé, et l'état du contrôleur de sévérité (`θ`, `path_variation`, `Σ D_t²`, `η`) vit dans l'accumulateur BOLE slot 5, intégré dans le LtHash de sorte que chaque nœud vérifie une identité octet par octet. Le pro-rata utilise une multiplication/division entière sur 128 bits avec gestion du reliquat en ordre croissant d'AccountId — ni virgule flottante, ni `HashMap`.

</details>
