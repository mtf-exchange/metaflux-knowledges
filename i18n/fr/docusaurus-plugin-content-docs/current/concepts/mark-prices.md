# Prix de marque

:::tip
**Stable.**
:::

## En résumé

Le **prix de marque** est le prix de référence par actif utilisé par le protocole pour le calcul des marges, des liquidations, du financement et de l'évaluation des ordres déclencheurs. Il correspond à la médiane de trois composantes — l'ancrage oracle (plus une EMA de la base), le milieu de carnet interne, et la médiane des contrats perpétuels externes — recalculée en continu. Ce n'est PAS le prix de la dernière transaction.

## Pourquoi prix de marque ≠ dernier cours

Utiliser le dernier cours pour les marges est exploitable : une petite transaction adverse à un prix manipulé peut forcer d'autres utilisateurs en liquidation. Le prix de marque est une composition lissée, multi-sources, difficile à manipuler.

## Composition

> Le prix de marque implémenté est la **médiane de 3 composantes** ci-dessous (`mark_source: "MedianOfOraclesAndMid"`), et non une simple `median(mid, oracle, ema_mid)`.

### Mode de calcul

```
mark = median( composantes présentes parmi {C1, C2, C3} )
        # 3 présentes → median3   2 présentes → point médian   1 présente → cette valeur
        # un C2 isolé (sans ancrage externe) ne produit pas de mise à jour — voir ci-dessous
```

avec trois composantes :

| Composante | Définition |
|-----------|------------|
| **C1** (ancrage oracle) | `C1 = oracle + EMA(quote_mid − oracle)` — l'oracle plus une EMA à décroissance fixe de la **base** du contrat perpétuel (≈ **150 s** de demi-vie au rythme de recalcul) |
| **C2** (carnet interne) | `mid(best_bid, best_ask)` — meilleure offre/meilleure demande **uniquement**. Requiert les deux côtés et un carnet non croisé, sinon `None`. Elle exclut délibérément **le dernier cours** (le réintégrer rendrait le recalcul autoréférentiel et pourrait bloquer un carnet mince à sens unique). |
| **C3** (perpétuels externes) | `median(external perp mids)` sur les **5 places perpétuelles** (Binance, OKX, Bybit, Gate, MEXC) ; requiert **≥ 2** places disponibles, sinon `None` |

La médiane externe résiste à un seul point aberrant. **Les composantes absentes sont simplement écartées** — avec deux présentes, le prix de marque est leur point médian ; avec une seule, c'est cette valeur. Sans carnet interne ni perpétuels externes, `mark = C1 = oracle + EMA(basis)`, dégradant gracieusement vers l'oracle au comptant plutôt que de se figer.

**Un C2 isolé est rejeté.** Si la *seule* composante présente est le milieu de carnet interne (sans oracle ni perpétuels externes), le prix de marque reste inchangé plutôt que de laisser un simple écart d'offre/demande — que peut contrôler un adversaire — définir le prix de liquidation/financement. Un C1 isolé (oracle externe) ou un C3 isolé (déjà une médiane sur ≥ 2 places) est autorisé.

- L'**EMA de C1** est le `DeterministicEma` compatible déterminisme (virgule fixe `(num, denom)`, décroissance fixe `0.9548` ≈ une demi-vie de 150 s au rythme de recalcul ~10 s). Elle intègre `quote_mid − oracle` uniquement lorsqu'une cotation bilatérale utilisable et un oracle existent simultanément, de sorte qu'un carnet vide ou unilatéral ne lui injecte pas de bruit. Un marché n'ayant jamais eu de cotation utilisable conserve `EMA = 0`, soit `C1 = l'oracle brut`.
- L'EMA est **par actif** (une par marché perpétuel).
- La médiane calculée est écrite dans la **marque de référence** du marché (la valeur lue par tous les consommateurs), de sorte qu'une exécution ordinaire estampillant le dernier cours ne peut pas la masquer — la médiane fait autorité pour les marchés actifs, pas seulement pour les marchés calmes.

> ⚠️ **Correction par rapport au texte précédent.** La documentation antérieure modélisait C2 comme `median(bid, ask, last_trade)` et C3 comme une médiane pondérée sur 7 places. Les formes réelles sont : C2 = un **milieu de cotation bilatérale** (meilleur bid/ask uniquement, dernier cours exclu), C3 = la **médiane de 5 places perpétuelles externes** (≥ 2 requises), et C1 = l'oracle plus une EMA à décroissance fixe (`0.9548`) de la base perpétuelle. Les composantes absentes sont exclues de la médiane (sans substitution `unwrap_or(C1)`), et un C2 isolé ne produit pas de mise à jour.

### Deux plans de prix (à lire avant toute valeur numérique)

MTF utilise deux **plans numériques distincts** — première source de confusion d'échelle :

| Plan | Type | Échelle | Utilisé par |
|-------|------|-------|---------|
| **Plan carnet / ordre / marque** | `FixedPrice` (`i128`) / `price_e8` | **virgule fixe 1e8** (entier brut = prix × 10⁸) | carnet d'ordres, `last_mark_px`, les précompilés EVM (`mark_px_e8`, `entry_px_e8`), niveau `px` du `l2_book`, `limit_px` des ordres, `tick_size` |
| **Plan oracle / notionnel / collatéral** | `rust_decimal::Decimal` | **USDC entier** (1 unité = 1 USDC) | l'agrégateur oracle + calculateur de marque (C1/C2/C3 tous en `Decimal`), `oracle_px` de financement, moteur de scénarios PM, marge/santé, et les champs de lecture humains `mark_px`/`oracle_px` de `market_info`/`markets` |

Le calculateur de marque et l'agrégation oracle opèrent entièrement dans le **plan `Decimal` USDC entier**. Le résultat est converti vers le **plan `FixedPrice` 1e8** lors de l'écriture dans le carnet / `last_mark_px`. Toutefois, la lecture humaine `market_info` / `markets` reporte `mark_px` et `oracle_px` déjà reconvertis dans le **plan USDC entier** (par ex. `"67042.335"`, et non le brut 1e8) — seuls les champs de *soumission* d'ordre/carnet (`l2_book` niveau px, ordre `limit_px`, `tick_size`) restent en 1e8. Le *règlement* PnL/financement utilise une troisième convention mineure — USDC `1e6` (`accumulated_funding_e6` dans `mark_settle`). Vérifiez toujours dans quel plan se trouve une formule avant de comparer des grandeurs.

## L'oracle (ancrage C1)

`oracle` — l'ancrage C1 — est la **médiane pondérée** de jusqu'à 10 places au comptant externes (Binance 3, OKX 2, Bybit 2, Coinbase 2, Bitget / Kraken / KuCoin / Gate / MEXC / MetaFlux-spot 1 chacun ; total 15), publiée une fois par bloc et signée par les validateurs oracle. Les pondérations par symbole sont paramétrables par gouvernance (`SetOracleWeights`, `ActionId 148`) ; un flux de données périmé de plus de 60 s ou déviant de plus de 5 % par rapport à la médiane cross-places est écarté ; si moins de 50 % du poids est présent, le slot conserve sa dernière bonne valeur.

La **composante C3 de la marque est un ensemble de flux distinct** — les milieux perpétuels des **5 places perpétuelles** (Binance, OKX, Bybit, Gate, MEXC), et non la table des oracles au comptant. Voir **[Prix oracle](./oracle-prices.md)** pour la composition complète, les règles de fiabilité, les remplacements par symbole et la lecture `oracle_sources`.

La lecture [`market_info`](../api/rest/info.md#market_info) expose `mark_source` (le descripteur `"MedianOfOraclesAndMid"`) ainsi que les `mark_px` / `oracle_px` composés ; les composantes individuelles C1/C2/C3 et la liste des sources pondérées ne sont pas décomposées en champs de protocole.

## Prix de marque vs oracle — pourquoi ils divergent

Il est **normal et attendu** que le prix de marque s'écarte significativement de l'oracle. L'oracle suit le marché **au comptant** ; la marque suit là où le **contrat perpétuel** se négocie — et un perpétuel peut porter une **base** persistante (prime ou décote) par rapport au comptant :

- **C2** est le milieu de carnet perpétuel MetaFlux, **C3** est la médiane des *perpétuels* externes — les deux reflètent le perpétuel, pas le comptant.
- **C1** vaut `oracle + EMA(quote_mid − oracle)` — l'EMA de la base tire même l'ancrage oracle vers la prime courante du perpétuel, de sorte que les trois composantes suivent le perpétuel.

Ainsi, lorsqu'un perpétuel se négocie, par exemple, avec une décote de 30 % par rapport à son indice au comptant, `mark ≈ perp` et `oracle ≈ spot` divergent légitimement d'environ 30 %. Cet écart est précisément ce que le **[financement](./funding-rates.md)** est censé résorber — et notez que si l'oracle lui-même est peu fiable, le financement est *désactivé et décroît vers 0* même lorsque l'écart marque/oracle est large (un grand écart avec un financement ≈ 0 signifie donc que l'oracle de ce marché est jugé non fiable, pas que le financement est défaillant). Voir [désactivation du financement](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Plages de validité

> **État d'implémentation :** la médiane à 3 composantes (composantes absentes exclues, C2 isolé rejeté) est implémentée aujourd'hui. Le bridage par bloc décrit dans cette section (un `clamp(candidate, prior ± max_step)` en surcouche de la médiane) est une **spécification de conception, pas encore un bridage discret dans le calculateur de marque** — la médiane structurelle est actuellement la principale défense anti-manipulation. La garde vivante la plus proche copie l'oracle dans le `last_mark_px` d'un carnet périmé plutôt que de le ramper. Traitez les valeurs ci-dessous comme la conception de plage prévue ; vérifiez par rapport aux valeurs en production avant de vous appuyer sur des chiffres de bridage exacts.

Même avec la composition, un adversaire peut pousser deux des trois sources simultanément. La marque est donc conçue pour appliquer des **plages** par bloc :

```
prior_mark   = mark au bloc T-1
band_pct     = paramètre de marché, défaut 0.5% par seconde
max_step     = prior_mark * band_pct * (block_time_ms / 1000)

candidate    = median(...)
mark_T       = clamp(candidate, prior_mark - max_step, prior_mark + max_step)
```

| Défaut | Valeur |
|---------|-------|
| `band_pct` | 0.5% par seconde |
| `block_time_ms` | 100 ms |
| `max_step_per_block` | ~0.05% |

À 0.05% par 100 ms, un mouvement de 5 % prend ≈10 secondes. Les mouvements rapides authentiques rattrapent en un petit nombre de blocs ; les pics adversariaux sont bridés à une rampe courte.

Si le candidat dépasse la plage de façon répétée pendant `band_violation_blocks` (défaut 50 = ~5 s), le protocole suppose un vrai changement de régime et élargit la plage de 2× pour une fenêtre. Cela évite un gel permanent lors de véritables dislocations de marché.

## Consommateurs du prix de marque

| Consommateur | Pourquoi le prix de marque ? |
|----------|-----------|
| Marge (initiale + maintenance) | Base stable ; résistante à la manipulation |
| Évaluation des niveaux de liquidation | Idem |
| Financement (vs oracle) | Requis par la formule de financement |
| Ordres déclencheurs (StopLoss / TakeProfit) | Résistant aux pics liés à une seule transaction |
| Affichage PnL (non réalisé) | Valeur stable côté utilisateur |
| Comptabilité du fonds de garantie | Stable |

Consommateurs utilisant le **dernier cours** plutôt que la marque :
- Les prix d'exécution sur le carnet (les transactions s'exécutent aux prix réels du carnet)
- Les frais de maker / taker (calculés sur le prix d'exécution, pas sur la marque)
- Le PnL réalisé (calculé au prix d'exécution de sortie)

## Consultation

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

La lecture [`market_info`](../api/rest/info.md#market_info) reporte `mark_px` et
`oracle_px` dans le **plan USDC entier** (par ex. `"67042.335"`), ainsi que le
descripteur `mark_source` :

```json
{
  "type": "market_info",
  "data": {
    "asset_id":    0,
    "mark_source": "MedianOfOraclesAndMid",
    "mark_px":     "67042.335",
    "oracle_px":   "67042.335"
  }
}
```

Les trois composantes internes `C1`/`C2`/`C3` (ancrage oracle+EMA / médiane du carnet
interne / médiane pondérée des perpétuels externes) et l'état de plage (`Ok` / `Banded` /
`Frozen`) résident dans le calculateur de marque ; elles ne sont
**pas** décomposées en champs de protocole `market_info` aujourd'hui — seul le
`mark_px` composé est publié. `Banded` signifie que la plage a bridé le candidat sur ce bloc ;
`Frozen` signifie que toutes les sources ont échoué et que le protocole conserve la marque précédente.

Un canal WS `mark` dédié figure dans la [feuille de route WS](../api/ws/subscriptions.md#roadmap--not-yet-available) (pas encore disponible en flux) ; interrogez [`market_info`](../api/rest/info.md#market_info) pour `mark_px` en attendant.

## Cas limites

<details>
<summary>Afficher les cas limites</summary>

- **Mouvement authentique de 5 % en 1 s.** La plage bride les 10 premiers blocs ; la marque rattrape à ~0.05 % par bloc, puis la détection de changement de régime élargit la plage, et la marque rattrape plus vite. Le retard total est d'environ 1 à 2 secondes ; important mais borné.
- **Panne oracle — plus de 50 % du poids manquant.** Lorsque moins de 50 % du poids au comptant est présent dans un tick, le slot oracle n'est **pas mis à jour** — le dernier bon tick persiste. C1 continue d'utiliser le dernier bon oracle + son EMA, de sorte que la marque reste ancrée.
- **Carnet MTF vide ou unilatéral.** C2 est écarté. Marque = `midpoint(C1, C3)` (ou `C1` seul si les perpétuels sont également indisponibles) — elle suit l'ancrage oracle combiné aux perpétuels externes. Le financement utilise toujours l'oracle disponible ; les liquidations se déroulent contre la marque ancrée sur l'oracle.
- **Tous les perpétuels externes indisponibles.** C3 est écarté. Marque = `midpoint(C1, C2)` — milieu de cotation interne vs ancrage oracle.
- **Ni carnet ni perpétuels.** Seul C1 subsiste ⇒ `mark = C1 = oracle + EMA(basis)`. Ancrage purement oracle.
- **Seule une cotation sans oracle, vide ou unilatérale.** Un C2 isolé est rejeté ⇒ pas de mise à jour ; la marque conserve sa dernière valeur jusqu'au retour d'un ancrage externe (oracle ou perpétuels).
- **EMA C1 périmée.** L'EMA est par construction toujours définie dès qu'au moins un milieu interne a été intégré ; elle conserve sa dernière valeur en l'absence de nouveau milieu (elle n'est mise à jour que lorsque C2 est présent).
- **Ordres déclencheurs pendant un gel.** L'évaluation des déclencheurs utilise la marque ; pendant un gel, aucun déclencheur ne se déclenche. Les ordres en attente restent en place jusqu'à la reprise d'une vraie marque.

</details>

## Séquence — la plage de marque s'engage sur un pic

La médiane à 3 composantes neutralise déjà un pic à source unique avant toute plage :

```
bloc T-1    C2(book mid)=100.0  C1(oracle+EMA)=100.0  C3(perps)=100.0  →  median3 = 100.0

bloc T :    carnet MTF peu liquide ; un adversaire pousse le milieu interne à 110.0
            C2 = 110.0,  C1 = 100.05,  C3 = 100.05   (perpétuels externes + oracle inchangés)
            mark = median3(100.05, 110.0, 100.05) = 100.05
            ↑ le C2 adversarial est l'ABERRANT → la médiane l'écarte ; mark ≈ ancrage oracle

bloc T+1 :  l'adversaire persiste à 110.0 ; oracle/perpétuels dérivent lentement à la hausse
            C2 = 110.0,  C1 = 100.10,  C3 = 100.10
            mark = median3(100.10, 110.0, 100.10) = 100.10

... la marque suit le consensus (C1, C3) ; une seule source manipulée ne remporte jamais la médiane
```

La défense est structurelle : pour déplacer la médiane, un adversaire doit mouvoir au moins **deux** des trois composantes, et C1 (oracle) + C3 (médiane perpétuelle externe sur 5 places) sont précisément les plus difficiles à manipuler. La plage de validité par bloc optionnelle décrite ci-dessus constitue un bridage supplémentaire en surcouche.

## Voir aussi

- [Taux de financement](./funding-rates.md) — le financement utilise la marque vs l'oracle
- [Liquidation par niveaux](./tiered-liquidation.md) — évaluation des niveaux contre la marque
- [Canal WS `mark` (feuille de route)](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [Prix oracle](./oracle-prices.md) — liste complète des sources, pondérations, règles de fiabilité

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Pourquoi ne pas simplement utiliser l'oracle directement ?**
R : Un prix de marque basé uniquement sur l'oracle donne aux opérateurs oracle la capacité de liquider le carnet en manipulant le flux. La médiane de trois composantes diversifie la surface de confiance.

**Q : Puis-je consulter l'historique de ce qu'a fait la plage ?**
R : L'historique des prix de marque avec l'état de plage sera exposé une fois le canal WS `mark` déployé (feuille de route) et via les réponses de l'indexeur d'archivage ; il n'est pas encore disponible sur la surface de lecture en production.

**Q : La plage peut-elle provoquer des liquidations injustes ?**
R : La plage ralentit la marque par rapport à l'actif sous-jacent — ainsi, lors d'un vrai krach, votre maintenance reste saine pendant environ 1 seconde supplémentaire par rapport à une place qui utilise le dernier cours. L'inverse est également vrai (la marque se détend lentement). Effet net : le comportement de liquidation est plus déterministe et plus difficile à instrumentaliser.

</details>
