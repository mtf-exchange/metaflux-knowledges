# Prix oracle

:::tip
**Stable.**
:::

## TL;DR

Le **prix oracle** est le prix de référence par actif sous-jacent utilisé par le protocole, composé à chaque bloc en tant que **médiane pondérée de places au comptant externes**. C'est l'ancre externe sur laquelle reposent à la fois le [prix mark](./mark-prices.md) (sa composante C1) et le [financement](./funding-rates.md) (la référence de règlement). L'oracle est délibérément *dérivé du marché au comptant et lent à propager* — il ne correspond pas au prix du carnet d'ordres MetaFlux ni au dernier trade exécuté.

Deux ensembles de flux distincts alimentent le protocole, et il est facile de les confondre :

| Ensemble de flux | Places | Agrégation | Pilote |
|----------|--------|-------------|--------|
| **Oracle au comptant** | jusqu'à **10 places au comptant** | médiane pondérée | `oracle_px` ; ancre C1 du prix mark ; notionnel de règlement du financement |
| **Mids de perps externes** | **5 places de perps** (Binance, OKX, Bybit, Gate, MEXC) | médiane (≥ 2 présentes) | uniquement la composante **C3** du prix mark |

## Pourquoi un oracle (et non le carnet d'ordres) ?

La marge, la liquidation et le financement ont tous besoin d'un prix qu'un acteur malveillant **ne peut pas** manipuler avec un seul trade sur un carnet d'ordres MetaFlux peu profond. Une médiane pondérée à l'échelle du marché, calculée sur de nombreuses places au comptant profondes, répond exactement à ce besoin : pour la déplacer, il faudrait bouger le prix au comptant sur de nombreuses places simultanément, ce qui est coûteux et s'auto-arbitre. Le carnet interne *contribue bien* au mark (via les termes C2 et la base C1) — mais toujours en combinaison avec cette ancre externe.

## Composition

`oracle_px` est la **médiane pondérée** des places au comptant disponibles pour l'actif.

### Table de poids par défaut des places au comptant (somme = 15)

| Place | Poids | | Place | Poids |
|-------|-------:|-|-------|-------:|
| Binance | 3 | | Kraken | 1 |
| OKX | 2 | | KuCoin | 1 |
| Bybit | 2 | | Gate | 1 |
| Coinbase | 2 | | MEXC | 1 |
| Bitget | 1 | | MetaFlux spot | 1 |

Une **médiane pondérée** (et non une moyenne pondérée) est utilisée afin qu'une seule place affichant un tick erroné ne puisse pas fausser le résultat — elle déplace seulement l'échantillon qui se situe au point médian pondéré.

### Poids de gouvernance par symbole

La table par défaut sert de valeur de repli. Une action de gouvernance exclusive `SetOracleWeights { asset_id, weights }` (`ActionId 148`) **remplace** (sans fusionner) la table pour un actif — ce qui est nécessaire car les marchés à longue traîne et sans permission ([MIP-3](../mip/mip-3.md)) ne sont souvent pas listés sur Binance / Coinbase, de sorte que les poids par défaut ne permettraient d'aboutir à rien d'utilisable. Les déployeurs de marchés **ne peuvent pas** définir leurs propres poids (choisir ses sources oracle équivaut à choisir son propre prix mark) ; les nouveaux marchés démarrent avec la table par défaut, et seule la gouvernance peut la remplacer.

L'ensemble de sources validé par marché est interrogeable — voir [`oracle_sources`](#querying) — sous forme de masque de sous-ensemble sur la liste des places.

## Règles de fiabilité

L'agrégateur est conçu pour se dégrader progressivement plutôt que de produire des valeurs erronées. À chaque tick, dans l'ordre :

- **Obsolescence par flux.** Une place qui n'a pas produit de nouveau tick dans le délai `feed_staleness_ms` (par défaut **60 s**) est considérée comme absente pour ce tick.
- **Rejet des valeurs aberrantes inter-places.** Une place s'écartant de plus de `feed_deviation_pct` (par défaut **5 %**) par rapport à la médiane inter-places est exclue avant le calcul de la médiane pondérée — une défense contre un tick bloqué, nul ou erroné.
- **Renormalisation sur les survivants.** Les places absentes reçoivent un poids de 0 et les poids restants sont renormalisés.
- **Seuil de couverture minimale.** Si **moins de 50 %** du poids total configuré est présent dans un tick, le slot oracle **n'est pas mis à jour** — la dernière valeur valide est conservée. Il s'agit du plancher absolu qui empêche une ou deux places survivantes de définir le prix lors d'une panne généralisée des flux.

Une place dont le poids est fixé à 0 (par ex. retirée de la liste pour ce symbole) n'est tout simplement jamais sollicitée.

## Publication

Le `oracle_px` composé est publié **une fois par bloc**, dérivé de l'horodatage de bloc du consensus (jamais de l'horloge locale), et signé par les validateurs oracle de l'ensemble actif. Comme la médiane, les filtres d'obsolescence/valeur aberrante et l'horodatage sont tous issus du consensus, chaque validateur honnête calcule un snapshot oracle **identique octet par octet** pour le bloc.

## Relation avec le mark et le financement

- **Mark.** L'oracle est l'**ancre C1** du mark : `C1 = oracle + EMA(book_mid − oracle)`. En l'absence de carnet interne et de perps externes, le mark se réduit entièrement à l'oracle. Voir [prix mark](./mark-prices.md).
- **Financement.** Le financement correspond à l'écart entre le **prix d'impact** (prix du carnet pondéré par la profondeur) et l'**oracle**, et se **règle contre l'oracle**. Point crucial : lorsque l'oracle d'un marché est obsolète ou non fiable, le financement de ce marché est *suspendu* et tend vers 0 plutôt que de se régler contre un prix que personne ne peut considérer comme fiable. Voir [taux de financement](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Interrogation

Le `oracle_px` composé est renvoyé dans le **plan USDC entier** (ex. `"67042.335"`) par la lecture [`market_info`](../api/rest/info/perpetuals.md#market_info), aux côtés de `mark_px` :

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

```json
{
  "type": "market_info",
  "data": {
    "asset_id":  0,
    "mark_px":   "67042.335",
    "oracle_px": "67042.335"
  }
}
```

L'ensemble de sources validé par marché est interrogeable via `oracle_sources` (le sous-ensemble de places activées pour un marché) :

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"oracle_sources","asset_id":0}'
```

Les entrées brutes par place et les poids exacts utilisés dans un tick résident dans l'état de consensus ; ils ne sont pas (encore) exposés en tant que champs distincts dans le protocole filaire, au-delà du sous-ensemble de sources.

## Cas limites

<details>
<summary>Afficher les cas limites</summary>

- **Une place bloquée sur un prix obsolète.** Éliminée par le filtre d'obsolescence (> 60 s) ou le filtre de valeur aberrante (> 5 % par rapport à la médiane inter-places), selon ce qui se déclenche en premier ; la médiane est calculée sur les survivants.
- **Panne généralisée du marché (< 50 % du poids présent).** Le slot oracle conserve sa dernière valeur valide. Le C1 du mark continue d'utiliser cette valeur, de sorte que la marge et la liquidation restent ancrées au lieu de se figer ou de se caler sur un tick peu profond.
- **Marché à longue traîne non listé sur les principales places.** Démarre sur la table par défaut (qui aboutit en grande partie à rien) jusqu'à ce que la gouvernance définisse un remplacement `SetOracleWeights` par symbole pointant vers les places qui le listent réellement.
- **Oracle au comptant sain mais divergence des perps.** Situation normale — le perp peut trader avec une prime/décote persistante par rapport au comptant. L'oracle (au comptant) reste inchangé ; le mark évolue avec le perp via C2/C3 et l'EMA de base C1. Voir [mark vs oracle](./mark-prices.md#mark-vs-oracle--why-they-diverge).

</details>

## Voir aussi

- [Prix mark](./mark-prices.md) — l'oracle est l'ancre C1 du mark
- [Taux de financement](./funding-rates.md) — le financement est l'écart prix d'impact vs oracle, réglé contre l'oracle
- [MIP-3 — déploiement de perp sans permission](../mip/mip-3.md) — pourquoi les poids oracle par symbole existent

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : L'oracle est-il identique au prix mark ?**
R : Non. L'oracle est une référence pure au marché au comptant externe. Le mark est une *composition* résistante à la manipulation qui combine l'oracle avec le carnet d'ordres MetaFlux et les mids de perps externes. Ils coïncident lorsque le perp suit le comptant et divergent lorsque le perp présente une base. Voir [prix mark](./mark-prices.md).

**Q : Les opérateurs de l'oracle peuvent-ils modifier mon prix de liquidation ?**
R : Un mark basé uniquement sur l'oracle le permettrait. C'est précisément la raison pour laquelle le mark est une médiane de trois sources : l'oracle n'est qu'une des trois composantes, de sorte qu'un flux manipulé est mis en minorité à moins que le carnet et les perps externes n'évoluent dans le même sens.

**Q : Quelles places établissent le prix d'un marché donné ?**
R : La table par défaut de 10 places, sauf si la gouvernance a défini un remplacement par symbole. Interrogez `oracle_sources` pour connaître le sous-ensemble validé d'un marché spécifique.

</details>
