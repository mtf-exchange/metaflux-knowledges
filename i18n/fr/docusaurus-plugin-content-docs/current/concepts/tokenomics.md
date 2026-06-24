---
description: Le modèle économique du token MTF — utilité, offre, allocation, émission, le mécanisme de création de valeur, l'économie du staking et le périmètre de gouvernance.
---

# Tokenomics

:::info
**Le modèle définitif.** La couche d'**utilité** (gas, réductions de frais via le staking, consensus, gouvernance et rachat-et-destruction alimenté par les frais) est **déjà déployée et active** — c'est le cœur de valeur du token. Les **paramètres économiques** (offre totale, allocation, acquisition des droits, le modèle d'émission indexé sur la population, la répartition du rachat et la courbe du multiplicateur de staking) sont **finalisés** et documentés ci-dessous. Les valeurs des paliers et la répartition du rachat sont des paramètres réseau que la gouvernance peut ajuster ultérieurement ; l'offre totale est indexée sur la population de la Chine et ré-indexée annuellement par vote des validateurs.
:::

## En résumé

**MTF** est le token natif de MetaFlux — une L1 proof-of-stake indépendante qui fait tourner un cœur DEX de contrats perpétuels et une sidechain EVM. MTF remplit cinq fonctions :

1. **Gas** — il paie l'exécution sur la sidechain EVM MetaFlux.
2. **Réduction de frais** — staker du MTF réduit vos frais de prise de position (taker) selon un palier.
3. **Sécurité** — le MTF staké constitue le stake de validateur qui sécurise le consensus.
4. **Gouvernance** — le MTF staké est le poids de vote sur les paramètres du protocole.
5. **Création de valeur** — les frais nets du protocole rachètent du MTF sur le marché ouvert ; **70 % de chaque rachat est détruit**, liant la rareté du token au volume de l'exchange.

Le cadre économique repose sur une **déflation alimentée par les frais**. Les frais de trading nets (après remises pour les makers) rachètent du MTF sur le marché ouvert ; le MTF racheté est réparti **70 % détruit, 20 % aux validateurs qui le redistribuent à leurs stakers sous forme de partage de revenus, 10 % trésorerie**. Le staking — en particulier le staking **à durée verrouillée, de style vote-escrow** — rapporte à la fois une réduction de frais **et une part de ce rachat**, retirant l'offre du flottant pour la placer entre les mains des participants à long terme qui sécurisent la chaîne. Les avantages des paliers supérieurs sont **pondérés dans le temps** : plus vous bloquez longtemps, plus votre poids effectif, votre palier de réduction et votre part de revenus sont élevés. Un mode **flexible (sans blocage)** offre aux teneurs de marché la réduction de frais de base sans blocage ni partage de revenus. L'offre totale est de **1 404 890 000 MTF**, **indexée sur la population de la Chine** et ré-indexée par un vote annuel des validateurs — émission si la population a augmenté, destruction de MTF de la trésorerie si elle a diminué — de sorte que l'offre suit la population plutôt que d'être figée à un plafond fixe. Le rachat-et-destruction des frais est une force déflationniste **distincte** qui s'y ajoute.

## Utilité du token

Tout ce qui est décrit dans cette section est **actif**, non proposé. Ce sont les puits et sources existants qui confèrent sa valeur au token.

### 1. Gas sur la sidechain EVM

MTF est le token de gas de la sidechain EVM MetaFlux. C'est un actif à **18 décimales** au niveau de l'exécution EVM — chaque déploiement de contrat et chaque transaction sur la sidechain est mesuré et réglé en MTF, exactement comme l'ETH mesure l'EVM sur sa chaîne native. Le cœur DEX et la sidechain EVM partagent le même actif natif, de sorte que la demande en calcul on-chain est une demande en MTF.

### 2. Staking → réduction des frais taker

Staker du MTF accorde une **réduction sur vos frais de prise de position (taker)**, graduée selon une échelle administrative de dix niveaux allant jusqu'à **50 %** de réduction :

| Niveau | Réduction taker |
|--------|----------------:|
| Chef de section (Chef de canton)            | 5%  |
| Chef de section adjoint                      | 8%  |
| Chef de division (Chef de comté)             | 12% |
| Chef de division adjoint                     | 15% |
| Directeur général (Maire)                    | 20% |
| Directeur général adjoint                    | 25% |
| Ministre (Gouverneur)                        | 32% |
| Vice-ministre (Vice-gouverneur)              | 35% |
| Conseiller d'État / Vice-Premier ministre    | 40% |
| Premier ministre / Président / Secrétaire général *(n°1)* | 50% |

Seul le grade le plus élevé — **Premier ministre / Président / Secrétaire général** (l'unique compte n°1 par poids effectif) — est **plafonné et compétitif** ; tous les autres niveaux, y compris les grades **Adjoint** et **Ministre (Gouverneur)**, sont de purs seuils sans plafonnement. Le siège se réassigne en temps réel à mesure que les poids évoluent. Les seuils complets et les règles de siège figurent sur la page [Barème des frais](./fee-schedule.md#3-staking-discount-tiers-mtf-staked).

La réduction s'applique au **taux taker uniquement** et se cumule avec les paliers de frais basés sur le volume et les paliers de remise maker. Le palier de réduction **de base** est accessible à tout staker, y compris les stakers **flexibles (sans blocage)** — le canal délibéré pour les teneurs de marché à haute fréquence qui ont besoin d'un capital non bloqué. Les paliers **supérieurs** sont conditionnés à votre **poids effectif pondéré dans le temps** : plus vous bloquez longtemps, plus votre poids est élevé et plus le même montant de tokens atteint un palier élevé (voir [Staking pondéré dans le temps](#staking-pondéré-dans-le-temps-style-ve) ci-dessous pour la courbe du multiplicateur et les seuils de poids). La grille tarifaire complète et les règles de cumul figurent sur la page [Barème des frais](./fee-schedule.md#3-staking-discount-tiers-mtf-staked). C'est la raison directe et mécanique pour laquelle un trader actif détient et stake du MTF : cela se finance de lui-même grâce à la réduction des coûts de trading.

### 2b. Staking → partage des revenus en MTF

En plus de la réduction de frais, les stakers **bloqués** reçoivent un **partage des revenus** versé en **MTF**. Il est acheminé via le canal des validateurs : **20 % de chaque rachat** (MTF racheté avec les revenus nets des frais) vont aux validateurs, qui le redistribuent à **leurs stakers / délégants**. Votre part est proportionnelle à votre **poids effectif pondéré dans le temps**, de sorte que les blocages plus longs rapportent une part proportionnellement plus grande.

Le partage des revenus **nécessite un blocage d'au moins 1 mois** — les stakers flexibles (sans blocage) reçoivent **0** partage de revenus (ils conservent néanmoins la réduction de frais de base). Il ne s'agit pas d'un pool de frais distinct : c'est la part des 20 % du MTF racheté qui revient aux validateurs, redistribuée à ceux qui ont staké auprès d'eux. Voir [Création de valeur et mécanisme de flywheel](#création-de-valeur--mécanisme-de-flywheel) pour la répartition complète du rachat.

### 3. Staking → sécurité du consensus (proof-of-stake)

MetaFlux est une chaîne proof-of-stake. Le MTF staké **est** le stake des validateurs. Les validateurs s'auto-cautionnent en MTF et acceptent des délégations ; l'ensemble actif des validateurs, le poids de proposition de blocs et le poids de vote dans le consensus sont tous dérivés du stake engagé. Tout comportement malveillant est sanctionné par un slashing (double signature, temps d'arrêt, vote d'un fork invalide), de sorte que le budget de sécurité de la chaîne est libellé en MTF et garanti par lui. Voir [Staking](./staking.md) pour le modèle validateur/délégant, le slashing et le cycle de vie du déblocage.

### 4. Staking → poids de gouvernance

Le MTF staké constitue le **poids de vote** dans la gouvernance du protocole. Les paramètres réseau — paliers de frais, taux d'émission, paramètres de risque, listes blanches de coffres, cotation de marchés — sont modifiés par des votes on-chain pondérés par le stake. Voir [Périmètre de la gouvernance](#gouvernance) ci-dessous.

### 5. Création de valeur via les frais → rachat puis destruction

Les frais de trading du protocole sont convertis en MTF puis répartis. Après que les remises maker et les crédits référent/builder ont été prélevés **en premier**, **l'intégralité** des revenus nets de frais restants est utilisée pour **racheter du MTF sur le marché ouvert**. Le MTF racheté est ensuite réparti **70 % détruit / 20 % aux validateurs (qui le redistribuent à leurs stakers) / 10 % trésorerie**. Ainsi, le volume de trading crée une pression d'achat réelle et récurrente sur le MTF, et **70 % de chaque rachat est détruit à jamais**, tandis que 20 % devient le partage de revenus des stakers et 10 % alimente la trésorerie.

C'est la clé de voûte du modèle : ce n'est **pas** une destruction d'offre abstraite, c'est un vrai revenu d'exchange qui rachète du MTF sur le marché, puis détruit les tokens achetés. Le taux de déflation est une fonction directe du volume de trading. Le flux complet étape par étape et la répartition figurent dans [Création de valeur et mécanisme de flywheel](#création-de-valeur--mécanisme-de-flywheel) ; les mécanismes de frais sont décrits sur la page [Frais](./fees.md#burn-buyback-and-burn).

## Offre et allocation

:::info
**Définitif.** L'offre totale et l'allocation de genèse ci-dessous sont finalisées. Le total de genèse est de **1 404 890 000 MTF** — **indexé sur la population de la Chine** — réparti selon les trois catégories du tableau. Le total est **ré-indexé annuellement par vote des validateurs** (voir [Émission et inflation](#émission--inflation)).
:::

### Offre totale

**Offre totale à la genèse : 1 404 890 000 MTF — indexée sur la population de la Chine** (correspond à la population de la Chine en 2026).

Le token **n'a pas de plafond fixe.** Son objectif d'offre est la **population de la Chine**, et il est **ré-indexé une fois par an par un vote de gouvernance des validateurs** : si la population a augmenté, les validateurs votent pour **émettre** de nouveaux MTF ; si elle a diminué, ils votent pour **détruire** des MTF de la trésorerie — de sorte que l'offre totale suit la population actuelle dans le temps. Le chiffre de population de chaque année est la **médiane de plusieurs sources de données officielles du gouvernement central chinois** (médiane, afin qu'une source aberrante ne puisse pas déplacer l'indexation). Le mécanisme complet est décrit dans [Émission et inflation](#émission--inflation).

La **destruction par rachat alimentée par les frais est une force déflationniste distincte et indépendante** : la population est l'**objectif** d'offre (fixé par la ré-indexation annuelle), tandis que le rachat retire continuellement du MTF du flottant en plus. Les deux sont distincts — l'un est la ré-indexation annuelle de la trésorerie MTF sur la population, l'autre est la destruction pilotée par le volume.

Remarques :

- **Marge de granularité gas à 18 décimales.** En tant que token de gas EVM à 18 décimales, ~1,4 milliard d'unités nominales laissent une granularité suffisante pour que les transactions ordinaires sur la sidechain coûtent une petite fraction propre d'un token.
- **Échelle de l'échelle de staking.** Les niveaux de réduction de frais et les seuils de poids effectif pondéré dans le temps (Chef de section…Premier ministre / Président / Secrétaire général) sont libellés en tokens/poids ; sur une offre de ~1,4 milliard, le seuil du grade le plus élevé (10 000 000) représente une petite fraction de l'offre, accessible à une contrepartie sérieuse et engagée, ce qui est le signal recherché.

### Allocation à la genèse

| Allocation | Part | Tokens | Blocage / acquisition | Objectif |
|------------|-----:|-------:|----------------------|---------|
| **Airdrop TGE** | 30% | 421 467 000 | Distribué **au TGE sur le mainnet MetaFlux** (après la conclusion du testnet de 6 mois) | Distribué aux traders actifs, teneurs de marché et détenteurs du programme de points. L'événement de distribution communautaire. |
| **Contributeurs principaux** | 20% | 280 978 000 | **Blocage total de 1 an (cliff)**, puis **acquisition linéaire sur 6 ans** | Fondateurs et contributeurs principaux. Aucun token contributeur ne se débloque en première année ; une période d'acquisition linéaire de 6 ans s'ensuit. |
| **Trésorerie / Communauté / Écosystème / Validateurs** | 50% | 702 445 000 | Pool combiné ; libéré par gouvernance | Un seul pool à long horizon couvrant la trésorerie du protocole, les incitations communautaires et écosystémiques, l'amorçage du coffre de liquidité appartenant au protocole, et le bootstrap des récompenses de validation / staking. **Également la source/puits pour la ré-indexation annuelle sur la population** (émission vers / destruction depuis ce pool). |
| **Total** | **100%** | **1 404 890 000** | | |

Remarques :

- **Distribution à majorité communautaire.** La plus grande catégorie (50 %) est le pool combiné trésorerie / communauté / écosystème / validateurs, et avec les 30 % d'airdrop TGE, **80 % de l'offre est alignée sur la communauté et le protocole**. L'allocation aux contributeurs est de 20 %, la plus petite catégorie.
- **Airdrop TGE sur le mainnet.** Les 30 % d'airdrop sont distribués lors de l'événement de génération de tokens sur le **mainnet MetaFlux**, qui fait suite à la conclusion de la phase testnet de 6 mois. Il cible les participants avérés — traders actifs, teneurs de marché et détenteurs du programme de points — plutôt qu'une réclamation ouverte.
- **Contributeurs avec le blocage le plus long.** Les contributeurs principaux sont soumis à un **cliff d'1 an** (aucun déblocage en première année) suivi d'une **acquisition linéaire sur 6 ans** — une période particulièrement longue qui maintient l'alignement de l'équipe bien au-delà du lancement.
- **Un seul pool à long horizon combiné.** La trésorerie, les incitations communautaires/écosystémiques, l'amorçage du coffre de liquidité et le bootstrap validation/staking sont financés à partir d'un seul pool de 50 % libéré par gouvernance, plutôt que pré-répartis en sous-allocations fixes. Cela rend l'allocation lisible et permet à la gouvernance de diriger le pool là où c'est nécessaire (incitations, liquidité, sécurité) à mesure que le protocole mûrit (voir [Création de valeur et mécanisme de flywheel](#création-de-valeur--mécanisme-de-flywheel) et [MIP-2 Metaliquidity](../mip/mip-2.md)).

### Trajectoire de l'offre en circulation

```text
genesis total        : 1,404,890,000 MTF (pegged to China's population)
TGE (mainnet)        : 30% airdrop distributed; portions of the 50% pool seed
                       liquidity / early incentives per governance
year 1               : contributor cliff holds — ZERO contributor unlock; pool
                       releases drive early circulating growth
year 1 cliff lapses  : contributor 6-year linear vesting begins
years 2–7            : contributor linear unlock completes over six years; pool
                       releases continue only on governance vote
annual re-peg        : validators vote to mint (population grew) or burn treasury
                       MTF (population shrank), re-pegging total supply to the
                       median population figure for the year
steady state         : net float SHRINKS as buyback-and-burn outpaces residual
                       unlocks, pool releases, and any re-peg mint
```

L'intention de conception est que, bien avant la conclusion de l'acquisition sur 6 ans des contributeurs, le **puits de rachat-et-destruction retire de l'offre plus vite que les déblocages restants, les libérations de pool par gouvernance et toute émission de ré-indexation annuelle n'en ajoutent**, de sorte que l'offre en circulation tend à la baisse à l'état stable avec un volume suffisant. La ré-indexation sur la population déplace lentement l'objectif d'offre (la population de la Chine évolue d'une fraction de pourcent par an), tandis que la destruction par rachat est le puits rapide, piloté par le volume — les deux sont indépendants. Ce croisement est l'essence même du modèle.

## Émission & inflation

:::info
**Offre indexée sur la population, ré-indexée annuellement par vote des validateurs.** L'offre totale n'est pas un plafond fixe — elle **suit la population de la Chine**, en commençant à **1 404 890 000 MTF** à la genèse. Une fois par an, les validateurs votent pour **émettre** (si la population a augmenté) ou **détruire des MTF de la trésorerie** (si elle a diminué) afin de ré-indexer l'offre sur le chiffre de population de l'année. Les récompenses de staking ne sont pas versées par dilution ; la ré-indexation est un ajustement lent et gouverné de l'objectif d'offre, distinct de la destruction par rachat pilotée par le volume.
:::

### L'indexation sur la population

L'offre totale cible la **population de la Chine** et est **ré-indexée une fois par an par un vote de gouvernance des validateurs** :

1. **Prendre le chiffre de population de l'année** comme la **médiane de plusieurs sources de données officielles du gouvernement central chinois**. La médiane (et non une source unique, ni une moyenne) rend l'indexation **robuste aux valeurs aberrantes** — une source anormale ne peut pas la déplacer.
2. **Les validateurs votent pour ré-indexer.** Si la population médiane a **augmenté** au cours de l'année, les validateurs votent pour **émettre** la différence en nouveau MTF ; si elle a **diminué**, ils votent pour **détruire** ce même montant en **MTF de la trésorerie**. Dans tous les cas, l'offre totale est ajustée pour correspondre au nouveau chiffre de population.
3. **Le flux d'émission/destruction transite par le pool de trésorerie** (le pool combiné de 50 %), de sorte que la ré-indexation ne touche jamais les soldes des utilisateurs, contributeurs ou stakers — uniquement la trésorerie contrôlée par le protocole.

Étant donné que la population de la Chine n'évolue que d'une fraction de pourcent par an, la ré-indexation est un **ajustement annuel petit et lent** de l'objectif d'offre — pas un levier d'inflation récurrent tiré pour le rendement.

### Les récompenses de staking sont non dilutives

Les récompenses de staking sont versées depuis deux sources, **dont aucune n'est la ré-indexation sur la population** :

1. Le **bootstrap de récompenses de validation / staking** financé par le pool combiné trésorerie/communauté/écosystème/validateurs verse un APR en forme de courbe de stake pendant la période initiale.
2. Une **part des revenus de frais du protocole** est acheminée vers les stakers de façon continue (le rendement de staking financé par les frais et le [dividende](#2b-staking--partage-des-revenus-en-mtf)), financé par le volume réel de l'exchange.

L'APR de la période initiale suit une **courbe de stake** plutôt qu'un taux fixe : il est élevé lorsque peu de MTF est staké (pour amorcer la sécurité) et décroît à mesure que le stake total augmente, de sorte que le budget de récompenses n'est pas épuisé prématurément. La forme est un plafond plat en dessous d'un stake plancher, décroissant proportionnellement à `1/√stake` au-dessus — c'est-à-dire que plus le stake total est élevé, plus la part par staker est faible. L'APR effectif actuel et ses paramètres d'entrée sont observables en direct sur le chemin de lecture [`staking_apr`](./staking.md#apr-estimation).

**Le compromis accepté par ce choix.** Le budget de récompenses bootstrap est fini. Si les revenus de frais ne croissent pas suffisamment pour prendre en charge le rendement avant que le budget soit significativement entamé, l'APR de staking affiché baissera. Cela force le rendement à être **gagné grâce au volume**, et non imprimé — mais cela signifie que le budget de récompenses initiales (prélevé sur le pool de 50 %) doit être dimensionné pour couvrir la période jusqu'à ce que les revenus de frais prennent le relais. La ré-indexation annuelle sur la population n'est **pas** une source de rendement : elle ajuste l'objectif d'offre, elle ne finance pas le staking.

### Pourquoi une indexation sur la population plutôt qu'un plafond fixe

L'indexation sur la population donne à MTF une **ancre d'offre lisible et exogène** — un chiffre que personne au sein du protocole ne fixe manuellement — tout en préservant la thèse déflationniste, car la **destruction par rachat est une force distincte** qui retire du MTF du flottant plus vite que la lente ré-indexation annuelle ne peut en ajouter. Le token est déflationniste par construction grâce au rachat ; l'indexation sur la population déplace simplement la cible vers laquelle le rachat fait tendre l'offre.

La ré-indexation n'est **pas une inflation perpétuelle pour le rendement.** Émettre un pourcentage fixe de l'offre chaque année pour rémunérer les validateurs **combattrait directement le mécanisme de flywheel rachat-et-destruction** — brûler d'une main et imprimer de l'autre — et cette approche a été **rejetée**. La ré-indexation sur la population est différente : c'est un ajustement bilatéral, petit et gouverné (elle peut aussi bien **détruire** qu'émettre), lié à un chiffre externe, pas une dilution récurrente pour financer les récompenses. Le rendement du staking est financé par le budget bootstrap et les revenus de frais, jamais par la ré-indexation.

## Création de valeur & mécanisme de flywheel

La valeur du token est liée à l'activité de l'exchange via une boucle de renforcement. La boucle centrale est **volume → frais → rachat de MTF → 70 % détruits / 20 % aux validateurs (→ stakers) / 10 % trésorerie → rareté + rendement pour les stakers**, avec la sécurité PoS comme anneau stabilisateur autour d'elle.

### Comment les revenus de frais deviennent de la valeur pour le token — le flux

Le chemin de création de valeur est un pipeline en quatre étapes claires :

1. **Collecter les frais de trading.** Chaque exécution paie des frais, libellés dans l'actif de cotation.
2. **Payer les remises maker en premier.** La subvention de remise maker est prélevée **en premier** — elle est payée sur les frais collectés avant toute autre chose (les crédits référer / builder sont également réglés ici). Ce qui reste est le **revenu net de frais**.
3. **Racheter du MTF.** **L'intégralité** des revenus nets de frais restants est utilisée pour **racheter du MTF sur le marché ouvert**. C'est une vraie pression d'achat récurrente proportionnelle au volume de l'exchange — il n'y a pas de pool de frais inactif, la totalité du revenu net est convertie en MTF.
4. **Répartir le MTF racheté** en trois parts :

| Destination | Part du MTF racheté | Ce qui se passe |
|-------------|--------------------:|-----------------|
| **Destruction** | **70%** | Détruit de façon permanente — retiré de l'offre à jamais. Déflation pure. |
| **Validateurs → stakers** | **20%** | Distribué aux validateurs, qui le redistribuent à **leurs propres stakers / délégants**. C'est **le** partage de revenus des stakers — acheminé via le canal des validateurs, pas un pool distinct. |
| **Trésorerie** | **10%** | Réserve du protocole, contrôlée par la gouvernance. |

Ainsi, **70 % de chaque rachat est détruit**, 20 % devient le partage de revenus des stakers (versé en MTF, acheminé via les validateurs à leurs délégants), et 10 % alimente la trésorerie. Comme les entrées sont du MTF acheté, **les trois volets créent d'abord une pression d'achat**, puis soit détruisent le token (destruction) soit le remettent aux participants à long terme (stakers via validateurs) et à la trésorerie.

```text
            ┌──────────────┐    trading fees   ┌──────────────┐
            │   TRADERS    │ ────────────────▶ │   COLLECTED  │
            │  & volume    │                   │     FEES     │
            └──────────────┘                   └──────┬───────┘
                    ▲                                 │ pay maker rebates FIRST
                    │                                 ▼  (off the top)
                    │                          ┌──────────────┐
       lower taker  │                          │   NET FEE    │
       fees + MTF   │                          │   REVENUE    │
       revenue-share│                          └──────┬───────┘
                    │                                 │ buy MTF on the open market
                    │                                 ▼  (ALL of it)
                    │                          ┌──────────────┐
            ┌───────┴──────┐                   │ BOUGHT-BACK  │
            │   STAKERS    │                   │     MTF      │
            │  (locked,    │                   └──────┬───────┘
            │   via vals)  │           split:         │
            └───────┬──────┘     ┌──────────┬─────────┴────────┐
                    │            ▼          ▼                  ▼
       20% MTF      │      ┌──────────┐ ┌──────────┐    ┌──────────┐
       via          │      │ 70% BURN │ │   20%    │    │   10%    │
       validators ──┴──────│ (destroy)│ │VALIDATORS│    │ TREASURY │
                           └────┬─────┘ │→ STAKERS │    └──────────┘
                                │       └────┬─────┘
                                │ supply     │ MTF yield to
                                ▼ shrinks    │ long-term lockers
                          ┌────────────┐     │
                          │ SCARCITY / │◀────┘
                          │ TOKEN VALUE│
                          └────────────┘
```

Lisez la boucle comme trois anneaux de renforcement :

1. **L'anneau de destruction (déflation).** Le volume produit des frais ; les frais nets rachètent du MTF ; **70 % du MTF racheté est détruit**. Plus de volume → plus de rachat → plus de destruction → moins d'offre → token plus rare. C'est le principal chemin de création de valeur et il est **déjà actif**.

2. **L'anneau de partage de revenus (flux de trésorerie pour les bloqueurs).** **20 % du MTF racheté** vont aux validateurs, qui le redistribuent à **leurs stakers / délégants**. C'est le partage de revenus des stakers — versé **en MTF**, acheminé via le canal des validateurs. La part d'un staker évolue proportionnellement à son stake dans le pool d'un validateur, et la position de ce stake est **pondérée dans le temps** (voir [poids effectif](#staking-pondéré-dans-le-temps-style-ve)), de sorte que les blocages plus longs rapportent une plus grande part. Plus de volume → plus grand partage de revenus en MTF → rendement réel plus élevé sur le MTF bloqué → incitation plus forte à acquérir et bloquer sur le long terme.

3. **L'anneau de sécurité (PoS).** Le MTF staké sécurise le consensus, et les validateurs sont le conduit pour le partage de revenus de 20 % — sécuriser la chaîne et percevoir le partage de revenus sont donc **le même acte**. À mesure que le token prend de la valeur et que davantage est bloqué pour la réduction de frais et le partage de revenus en MTF, le coût d'une attaque contre la chaîne augmente avec la valeur du token — un token plus précieux signifie une chaîne plus sécurisée, ce qui rend le protocole plus sûr pour trader, ce qui soutient le volume.

Le **coffre de liquidité appartenant au protocole** ([MIP-2 Metaliquidity](../mip/mip-2.md)) s'inscrit dans cette boucle comme accélérateur : il fournit une profondeur de carnet d'ordres active dès le premier jour, permettant à l'exchange de générer du volume — et donc des frais et des destructions — sans attendre l'arrivée de teneurs de marché externes. Carnets plus serrés → plus de volume → plus de destruction.

Le mécanisme de flywheel ne fonctionne qu'avec un **vrai volume**. Aucun des anneaux ne dépend d'une émission de tokens ou d'une réflexivité spéculative pour fonctionner ; ce sont des conséquences mécaniques des échanges sur la plateforme.

## Staking

Le staking est **actif**. Cette section résume l'économie d'un point de vue tokenomics ; le détail opérationnel complet — actions, sélection des validateurs, slashing, cas limites — se trouve sur la page [Staking](./staking.md) dédiée.

### Ce que le staking vous apporte

| Avantage | Source | Remarques |
|----------|--------|-----------|
| **Réduction des frais taker** | Échelle de dix niveaux par **poids effectif pondéré dans le temps** | 5% à 50% de réduction taker, [Chef de section → Premier ministre / Président / Secrétaire général](./fee-schedule.md#3-staking-discount-tiers-mtf-staked) |
| **Partage de revenus en MTF** | **20 % de chaque rachat**, versé en MTF via votre validateur | Acheminé via les validateurs à leurs délégants ; pondéré par votre stake pondéré dans le temps |
| **Rendement de staking** | Bootstrap de récompenses (initial) + part de revenus de frais (continu) | APR selon courbe de stake, observable en direct |
| **Poids de consensus** | Stake du validateur / délégation | Sécurise la chaîne, soumis au slashing |
| **Poids de gouvernance** | MTF staké = poids de vote | Voir [Gouvernance](#gouvernance) |

La **réduction de frais** et le **partage de revenus en MTF** évoluent tous deux en fonction de votre **poids effectif pondéré dans le temps**, et non de votre montant brut de tokens — le mécanisme est décrit ci-après.

### Staking pondéré dans le temps (style ve)

Le niveau de staking est **pondéré dans le temps selon la durée de blocage que vous choisissez au moment du stake**. Votre position n'est pas votre montant staké brut mais un **poids effectif** :

```text
effective_weight = staked_amount × time_multiplier(committed_lock_duration)
```

Deux avantages en découlent, mais ils ont des **points d'entrée différents** :

- **La réduction des frais taker** est disponible pour **toute personne qui stake**, y compris les stakers flexibles (sans blocage) — le palier de réduction de base est la récompense d'entrée de gamme.
- **Le partage de revenus en MTF (dividende)** nécessite un **blocage d'au moins 1 mois** — les stakers flexibles reçoivent **0** partage de revenus. Dans la plage des blocages, les blocages plus longs rapportent une plus grande part.

#### La courbe du multiplicateur

| Mode de staking | `time_multiplier` (poids dividende) | Éligibilité à la réduction de frais | Partage de revenus (dividende) |
|-----------------|------------------------------------:|-------------------------------------|-------------------------------|
| **Flexible / sans blocage** | **0×** | **Palier de base uniquement** (réduction d'entrée de gamme) | **Aucun** — poids dividende de 0 |
| **Blocage 1 mois** | **1,0×** | Échelle complète des paliers | Le dividende commence ici |
| **Blocage 6 mois** | **2,5×** | Échelle complète des paliers | Part plus grande |
| **Blocage 24 mois (plafond)** | **4,0×** | Échelle complète des paliers | Part la plus grande |

Entre les points indiqués, le multiplicateur augmente avec la durée de blocage engagée ; **1 mois est la base du multiplicateur verrouillé (1,0×)** et **24 mois est le plafond (4,0×)**.

**Le mode flexible / sans blocage est le canal des teneurs de marché.** Les teneurs de marché à haute fréquence ont besoin que leur capital reste disponible et redéployable — ils ne peuvent pas s'engager sur un blocage de plusieurs mois. Le staking flexible leur accorde délibérément la **réduction de frais de base** sur leur flux taker sans exiger de blocage, au prix de **zéro partage de revenus**. Le dividende est réservé au capital qui s'engage dans le temps ; le capital flexible bénéficie d'une réduction de frais mais pas d'une part du rachat.

**L'éligibilité au dividende commence au blocage d'1 mois.** En dessous d'un engagement d'1 mois, il n'y a aucun poids dividende. À partir d'1 mois (1,0×), le poids monte à 2,5× à 6 mois et plafonne à 4,0× à 24 mois — ainsi, les **paliers de réduction de frais supérieurs** et la **part de dividende** évoluent tous deux en fonction de la durée du blocage.

#### Comment fonctionne le blocage

Le mécanisme est le modèle standard **vote-escrow (ve)** — **engagez-vous au départ, obtenez le poids immédiatement, impossible de débloquer avant terme** :

1. **Vous choisissez une durée de blocage au moment du stake** (1 mois … 24 mois, ou flexible). Cette durée engagée détermine votre `time_multiplier` — et donc votre palier et votre poids dividende — **immédiatement**, pas au fil du temps écoulé. Un staker qui s'engage sur un blocage de 6 mois dispose d'un poids de 6 mois (2,5×) dès le départ ; il n'a **pas** à attendre 6 mois pour l'atteindre.

2. **L'avantage devient actif après le délai d'activation universel de 24 heures** — le même délai d'activation qui s'applique à tous les stakers. Ainsi, un staker avec blocage de 6 mois profite de sa réduction (ex. Conseiller d'État / Vice-Premier ministre) et de son plein poids dividende après seulement **24 heures**.

3. **Le blocage est une contrainte de sortie anticipée.** En échange du poids plus élevé, vous **ne pouvez pas débloquer avant l'expiration de la durée engagée**. Le délai d'activation (24h, moment où l'avantage s'active) et la durée de blocage (la durée avant laquelle vous ne pouvez pas sortir) sont **deux choses distinctes** : 24h pour *activer*, la durée choisie pour *sortir*.

C'est la conception pionnière du veCRV (Curve) — bloquer plus longtemps, obtenir plus de poids et une plus grande part des frais, immédiatement au blocage et irrévocable jusqu'à expiration — reprise par les schémas de tokens escrow / points multiplicateurs sur d'autres tokens DEX (ex. style esGMX-vesting temporel sur les venues de type GMX). Le modèle MetaFlux applique le multiplicateur ve à la **réduction de frais et au partage de revenus en MTF**, et réserve un canal flexible sans dividende pour les teneurs de marché.

#### Seuils de grade pour le poids effectif

Les grades de réduction de frais (et l'allocation de dividende, pour les stakers bloqués) sont lus à partir du `effective_weight`, sur la **même échelle de dix niveaux** que celle utilisée par le barème des frais — mais évalué sur le poids :

| Grade | Seuil de poids effectif | Réduction taker | Limite de siège |
|-------|------------------------:|----------------:|:----------------|
| Chef de section (Chef de canton)        | `> 100`        | 5%  | illimité |
| Chef de section adjoint                  | `> 500`        | 8%  | illimité |
| Chef de division (Chef de comté)         | `> 2 000`      | 12% | illimité |
| Chef de division adjoint                 | `> 8 000`      | 15% | illimité |
| Directeur général (Maire)                | `> 30 000`     | 20% | illimité |
| Directeur général adjoint                | `> 100 000`    | 25% | illimité |
| Ministre (Gouverneur)                    | `> 500 000`    | 32% | illimité |
| Vice-ministre (Vice-gouverneur)          | `> 1 500 000`  | 35% | illimité |
| Conseiller d'État / Vice-Premier ministre | `> 5 000 000`  | 40% | illimité |
| Premier ministre / Président / Secrétaire général | `> 10 000 000` **et classé n°1 par poids** | 50% | **1 siège** |

Deux logiques coexistent ici, comme dans le [barème des frais](./fee-schedule.md#3-staking-discount-tiers-mtf-staked) : les grades **Adjoint**, **Ministre (Gouverneur)** et tous les grades inférieurs au sommet sont des **seuils purs sans plafonnement** ; seul **Premier ministre / Président / Secrétaire général** (le n°1 unique) est un **siège plafonné et compétitif** réassigné en temps réel. Les stakers flexibles (0×) n'atteignent que le **grade le plus bas** indépendamment du seuil ; les grades **supérieurs** nécessitent un blocage pour que `staked_amount × time_multiplier` passe la barre (et, pour le seul grade plafonné, un rang gagnant). Ainsi, **les tokens bruts seuls ne suffisent pas pour les grades supérieurs** — ils doivent être engagés dans un blocage suffisamment long, et le tout premier doit aussi surpasser les autres.

#### Exemple pratique — court / flexible NE monte PAS ; un long blocage oui

La contrainte forte que le modèle est conçu pour satisfaire :

> Une baleine stake **2 000 000 MTF** mais ne s'engage **pas** sur un long blocage.

Une position flexible ou inférieure à 1 mois contribue **0× de poids dividende** et est maintenue au **grade le plus bas** — 2 000 000 tokens bruts ne passent **pas** les seuils de poids des grades supérieurs sans multiplicateur de blocage :

```text
flexible:  2,000,000 × 0×   → 0 dividend weight, lowest grade (Section Chief) only
1-month :  2,000,000 × 1.0× = 2,000,000  → clears Vice Minister (> 1,500,000)
                                            but below State Councilor (> 5,000,000)
                                          → Vice Minister (35%)
```

Pour atteindre **Conseiller d'État / Vice-Premier ministre** (40 % de réduction taker **et** une part supérieure de dividende) avec les **mêmes** 2 000 000 tokens, la baleine doit **s'engager sur un blocage de ≥ ~6 mois**, où le multiplicateur atteint **2,5×** :

```text
effective_weight = 2,000,000 × time_multiplier(6-month lock) = 2,000,000 × 2.5 = 5,000,000
```

5 000 000 n'est **pas** strictement supérieur à la barre `> 5 000 000`, donc un peu plus de poids (un stake légèrement plus élevé ou un blocage de 24 mois à 4,0×) le fait passer proprement dans **Conseiller d'État / Vice-Premier ministre**. Fondamentalement, ce n'est **pas** "staker et attendre 6 mois pour progresser." C'est **s'engager sur le blocage et atteindre le grade après le délai d'activation de 24 heures** — le grade supérieur est accordé immédiatement sur la base de l'*engagement*, pas gagné par le temps écoulé. Le prix est que les tokens sont ensuite **bloqués pour toute la durée et ne peuvent pas être désengagés prématurément**.

**Le grade supérieur ajoute un deuxième obstacle.** Le seul grade le plus haut — **Premier ministre / Président / Secrétaire général** (l'unique n°1 par poids effectif) — nécessite non seulement de passer le seuil mais aussi de **remporter le siège**. Une baleine qui dépasse `> 10 000 000` sans être n°1 est maintenue au grade **non plafonné** le plus élevé auquel elle est éligible (Conseiller d'État / Vice-Premier ministre). Le siège se réassigne en temps réel à mesure que les poids effectifs évoluent.

Ainsi, les grades supérieurs s'**acquièrent par un engagement temporel, pas par la seule taille** — et le tout premier exige également un **rang compétitif**. Une baleine flexible ou à court blocage est cantonnée à un grade bas et ne perçoit aucun dividende ; un staker plus modeste qui s'engage sur un blocage plus long peut la surpasser et percevoir une part de dividende. Le capital qui refuse de se bloquer bénéficie d'une réduction de frais mais pas d'une part du rachat — la propriété centrale anti-mercenaire du design ve, avec un canal flexible délibéré pour les teneurs de marché.

### Validateurs vs délégants

- **Les validateurs** gèrent un nœud de consensus, s'auto-cautionnent au-dessus d'un minimum, proposent et votent des blocs, et prélèvent une commission sur les récompenses de ceux qui leur délèguent. Ils supportent la pleine exposition au slashing en cas de comportement malveillant.
- **Les délégants** détiennent du MTF, choisissent un validateur et perçoivent les récompenses de ce validateur moins la commission. Ils partagent l'exposition au slashing au prorata si leur validateur se comporte mal, mais ne gèrent aucune infrastructure.

### Modèle de timing du staking

Trois concepts de timing distincts régissent le cycle de vie du staking. Gardez-les bien séparés — ce sont **des choses différentes** :

| Concept | Ce que c'est | Fixé par | Plancher |
|---------|-------------|----------|:--------:|
| **Durée de blocage engagée** | La durée ve **que vous choisissez au moment du stake** — flexible, ou 1 / 6 / jusqu'à 24 mois. Vous **ne pouvez pas débloquer avant qu'elle s'écoule** ; elle définit votre `time_multiplier` et donc votre palier et votre poids dividende. **Le poids dividende commence au blocage de 1 mois** ; le flexible est à 0×. | Le staker, par stake | flexible, sinon ≥ 1 mois |
| **Délai d'activation** | Le **délai universel de 24 heures** avant que votre avantage (réduction de frais + poids dividende) s'active. S'applique à **tout** staker quelle que soit la durée de blocage. | Réseau (gouvernance) | ≥ 24h |
| **Délai de sortie** (déblocage) | Après l'expiration de votre blocage engagé et la demande de déstaking, un délai final avant que le MTF soit disponible au retrait. | Réseau (gouvernance) | ≥ 24h |

Les durées fixées par le réseau (délai d'activation, délai de sortie) sont **votées par gouvernance** mais comportent un plancher code absolu de **24 heures** qui ne peut jamais être abaissé — la gouvernance peut les augmenter au-dessus de 24h, jamais en dessous.

**Les deux choses souvent confondues — activation vs blocage.** Le **délai d'activation** (24h, moment où votre avantage *s'active*) et la **durée de blocage engagée** (la durée avant laquelle vous ne pouvez pas *sortir*) sont **indépendants** :

- Un staker qui s'engage sur un blocage de **6 mois** bénéficie de sa pleine réduction (ex. Conseiller d'État / Vice-Premier ministre) et de son plein poids dividende **24 heures après le staking** — il n'attend **pas** 6 mois pour l'avantage. Les 6 mois représentent uniquement la durée pendant laquelle il est **interdit de débloquer**.
- Un staker **flexible** (sans blocage) s'active également après 24h, mais à **poids 0×** : le palier de réduction **de base** uniquement, et **aucun** partage de revenus. C'est le canal des teneurs de marché.

**Pourquoi c'est non manipulable.** Parce que le multiplicateur supérieur et tout partage de revenus nécessitent un blocage **irrévocable** dont vous ne pouvez pas sortir prématurément, un trader ne peut pas saisir un palier supérieur et retirer immédiatement ses tokens — les paliers supérieurs et le dividende ne sont accessibles qu'au capital qui accepte le blocage. Le délai de 24h bloque par ailleurs le flash-staking à bloc unique autour d'une exécution. Ensemble, ces mécanismes maintiennent une part significative de l'offre durement bloquée et hors du flottant et garantissent que seul le stake genuinement engagé dans le temps atteint les paliers supérieurs et le partage de revenus.

### États de blocage et de déblocage

| État | Perçoit les avantages ? | Soumis au slashing ? |
|------|:-----------------------:|:--------------------:|
| Activation (premières 24h après le stake) | pas encore | oui |
| Actif & bloqué (pendant la durée engagée) | oui | oui |
| Déblocage (après expiration du blocage, délai de sortie) | non | oui (jusqu'à maturité) |
| Débloqué (réclamable) | non | non |

### D'où vient le rendement

Deux sources, dans l'ordre de prépondérance tout au long de la vie de la chaîne :

1. **Initial :** le bootstrap de récompenses de staking financé par le pool combiné trésorerie/communauté/écosystème/validateurs, versant un APR selon courbe de stake élevé lorsque peu est staké et décroissant à mesure que le stake augmente.
2. **Continu — le partage de revenus en MTF.** **20 % de chaque rachat** (MTF racheté avec les revenus nets de frais) vont aux validateurs, qui le redistribuent à leurs **stakers / délégants bloqués**, pondéré par le poids effectif pondéré dans le temps. C'est le dividende ; il est financé par le vrai volume de l'exchange, pas par la dilution, et croît avec le protocole. **Stakers bloqués (≥ 1 mois) uniquement** — les stakers flexibles bénéficient de la réduction de frais mais pas du partage de revenus.

Ainsi, à mesure que le volume augmente, le système passe d'un rendement financé par le bootstrap à un rendement financé par le partage de revenus **sans émission dilutive** — le rendement est versé en MTF que le protocole a acheté sur le marché ouvert, jamais depuis la ré-indexation sur la population. Les validateurs sont le conduit, donc sécuriser la chaîne et percevoir le partage de revenus sont le même acte.

## Gouvernance

Le MTF staké est le **poids de vote dans la gouvernance**. La gouvernance est le volant de pilotage on-chain du protocole ; les votes sont pondérés par le stake et mis en œuvre par la chaîne lorsqu'ils atteignent le seuil requis.

### Périmètre de la gouvernance

La gouvernance modifie les **paramètres du protocole**, pas les fonds des utilisateurs. Dans le périmètre :

- **Paramètres de frais** — les paliers de frais par volume, les paliers de remise maker, l'échelle de réduction par staking, et la répartition des frais du protocole (les parts destruction / validateurs / trésorerie).
- **Émission et récompenses** — le taux de récompense de staking et les paramètres de la courbe de récompenses.
- **Paramètres de risque** — paramètres de marge et de liquidation, pondération des oracles, et paramètres de risque par marché.
- **Cotation de marchés** — cotation et configuration des marchés.
- **Coffre et liquidité** — la liste blanche des fournisseurs reconnus pour le coffre de liquidité appartenant au protocole.
- **Trésorerie** — libérations de l'allocation de trésorerie du protocole.

### Comment les votes passent

Les actions de gouvernance nécessitent un **quorum pondéré par le stake** pour être adoptées ; un seul grand détenteur ne peut pas modifier unilatéralement un paramètre, et les validateurs emprisonnés pour comportement malveillant sont exclus du décompte. Les changements de paramètres qui passent sont appliqués de manière déterministe par la chaîne.

### Ce que la gouvernance ne contrôle PAS

- Elle ne peut pas émettre ni détruire du MTF arbitrairement. Le seul levier sur l'offre est la **ré-indexation annuelle sur la population** — un ajustement bilatéral et contraint du MTF de la **trésorerie** sur le chiffre de population médian de l'année (voir [Émission et inflation](#émission--inflation)) — pas un bouton d'inflation libre pour financer les récompenses.
- Elle ne peut pas saisir les soldes ou positions des utilisateurs (l'émission/destruction de la ré-indexation ne touche jamais que la trésorerie du protocole, jamais les soldes des utilisateurs, contributeurs ou stakers).
- Elle ne peut pas modifier un état engagé passé.

La gouvernance est un mécanisme de pilotage de paramètres orienté vers l'avenir, limité aux leviers économiques et de risque du protocole.

## Voir aussi

- [Frais](./fees.md) — la répartition des frais et les mécanismes de rachat-et-destruction
- [Barème des frais](./fee-schedule.md) — la grille tarifaire volume, remise maker et réduction par staking
- [Staking](./staking.md) — validateurs, délégants, slashing, déblocage, APR
- [MIP-2 Metaliquidity](../mip/mip-2.md) — le coffre de liquidité appartenant au protocole
- [Coffres](./vaults.md) — les familles de coffres opérés par le protocole et par les utilisateurs
- [Glossaire](./glossary.md) — termes propres au protocole

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : L'offre totale est-elle définitive ?**
R : Oui. Le total de genèse (**1 404 890 000 MTF**, indexé sur la population de la Chine), l'allocation de genèse en trois catégories, le modèle d'émission indexé sur la population, la répartition rachat/destruction, et la courbe du multiplicateur ve sont tous **définitifs**. L'**utilité** du token (gas, réduction par staking, consensus, gouvernance, rachat-et-destruction) est active.

**Q : Quelle est la taille de l'offre, et est-elle fixe ?**
R : Elle démarre à **1 404 890 000 MTF** à la genèse — **indexée sur la population de la Chine** — et n'est **pas un plafond fixe**. Une fois par an, les validateurs votent pour **émettre** (si la population a augmenté) ou **détruire des MTF de la trésorerie** (si elle a diminué) afin de ré-indexer l'offre totale sur le chiffre de population de l'année, pris comme la **médiane de plusieurs sources de données officielles du gouvernement central chinois**. La ré-indexation ne déplace jamais que le MTF de la **trésorerie**.

**Q : MTF est-il inflationniste ?**
R : Pas au sens dilutif. Les récompenses de staking ne sont **jamais** financées par émission — elles proviennent d'un budget bootstrap fini au début puis du partage de revenus du rachat de manière continue. Les seuls ajouts d'offre sont la **ré-indexation annuelle sur la population** (un ajustement bilatéral et modeste qui peut aussi **détruire**), et elle suit un chiffre externe plutôt qu'un objectif de rendement. Combinée à la destruction par rachat — une force déflationniste **distincte et plus rapide** — l'intention de conception est un token **net-déflationniste** à l'état stable avec un volume suffisant.

**Q : Comment les revenus de frais deviennent-ils de la valeur pour le token ?**
R : Les frais nets de trading (après paiement des remises maker en premier) sont utilisés pour **racheter du MTF sur le marché ouvert**. Le MTF racheté est réparti **70 % détruit / 20 % aux validateurs (redistribués à leurs stakers comme partage de revenus) / 10 % trésorerie**. Ainsi : volume → rachat → 70 % détruit, 20 % aux bloqueurs, 10 % trésorerie.

**Q : Qu'est-ce que le partage de revenus / dividende des stakers ?**
R : C'est la part de **20 % de chaque rachat** revenant aux validateurs, distribuée en MTF à leurs stakers / délégants, au prorata du **poids effectif pondéré dans le temps**. Ce n'est pas un pool distinct — il transite par le canal des validateurs. Il **nécessite un blocage d'au moins 1 mois** ; les stakers flexibles n'en perçoivent aucun.

**Q : Je suis teneur de marché — puis-je staker sans bloquer ?**
R : Oui. Le staking **flexible (sans blocage)** garde votre capital disponible et accorde le palier de **base** de réduction de frais taker — le canal délibéré pour les teneurs de marché à haute fréquence. Le compromis est un **poids de 0×** : pas de palier supérieur et **aucun partage de revenus**.

**Q : Mon multiplicateur augmente-t-il plus je reste staké longtemps ?**
R : Non. Le multiplicateur est fixé par la **durée de blocage que vous engagez au départ** (1 mois = 1,0×, 6 mois = 2,5×, 24 mois = plafond 4,0×) et s'applique intégralement après l'activation de 24h. S'engager sur un blocage de 6 mois vous donne 2,5× immédiatement — cela ne monte pas progressivement dans le temps.

**Q : Si je m'engage sur un blocage de 6 mois, dois-je attendre 6 mois pour la réduction maximale ?**
R : Non. Votre avantage s'active après le délai d'activation universel de **24 heures**, pas après le blocage. Les 6 mois représentent uniquement la durée pendant laquelle vous êtes **interdit de débloquer**. L'activation (24h) et le blocage de sortie (votre durée choisie) sont deux choses distinctes.

**Q : Une baleine peut-elle obtenir le grade supérieur en stakant simplement beaucoup ?**
R : Non. Les grades supérieurs sont conditionnés au **poids effectif = montant × multiplicateur temporel**, donc un montant élevé avec un blocage nul ou court est cantonné à un grade bas et ne perçoit aucun partage de revenus. Progresser nécessite de **s'engager sur un long blocage**. Le seul grade supérieur ajoute un second obstacle : **Premier ministre / Président / Secrétaire général** est l'**unique n°1** par poids effectif (1 siège) — il exige donc un **rang gagnant**, pas seulement une taille, et se réassigne en temps réel à mesure que les poids évoluent.

**Q : Dois-je staker pour utiliser la chaîne ?**
R : Non. Vous avez besoin de MTF pour payer le gas sur la sidechain EVM, mais trader sur le cœur de contrats perpétuels ne nécessite pas de détenir du MTF. Le staking est **optionnel** et vous rapporte une réduction de frais taker, le partage de revenus en MTF (si bloqué), un rendement et un poids de gouvernance.

**Q : Comment le rendement du staking est-il versé si les récompenses ne sont pas émises ?**
R : À partir de sources non dilutives — le budget de récompenses bootstrap au début, et le **partage de revenus du rachat à 20 %** (MTF que le protocole a acheté sur le marché ouvert, acheminé via les validateurs aux stakers bloqués) de manière continue. À mesure que le volume augmente, le partage de revenus prend de plus en plus en charge le rendement. La ré-indexation annuelle sur la population ne **finance pas** le rendement.

**Q : Comment la réduction de frais interagit-elle avec la destruction ?**
R : Elles se renforcent mutuellement. La réduction et le partage de revenus incitent les traders à détenir et bloquer du MTF (demande + immobilisation) et réduisent leur coût de trading (plus de volume), et plus de volume signifie plus de frais nets rachetant du MTF — alimentant à la fois la destruction à 70 % et le partage de revenus des stakers à 20 %.

</details>
