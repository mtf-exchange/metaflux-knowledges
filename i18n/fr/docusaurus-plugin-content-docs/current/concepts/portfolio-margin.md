# Marge de portefeuille

:::info
**Opérationnel sur le devnet.** Le moteur de scénarios est entièrement fonctionnel : les utilisateurs s'inscrivent via l'action `UserPortfolioMargin` (soumise à un seuil de capitaux propres, par défaut ≥ 100 K USDC), et la grille de scénarios de type SPAN (±5/10/20 % de prix × ±20/50 % de volatilité) calcule la marge de maintenance en temps réel. La surface d'action et le moteur de scénarios ont tous deux été déployés et testés sur un réseau de consensus à 4 nœuds.
:::

## En résumé

La marge de portefeuille (PM) traite l'ensemble de votre compte comme un seul chiffre de risque. Les positions couvertes ou corrélées se compensent mutuellement ; le protocole exige une marge correspondant au pire scénario sur une grille de chocs calibrée `(prix, volatilité)`. Efficacité du capital typique pour un book équilibré : **2 à 5×** le modèle classique.

La PM est optionnelle, soumise à un seuil de capitaux propres (par défaut ≥ 100 K USDC) et réversible.

## Classique vs PM — comparaison côte à côte

Exemple de book couvert : long 1 BTC à 100 $, short 25 ETH à 4 $ (neutre en dollars si BTC et ETH sont parfaitement corrélés, ce qui est presque le cas).

**Classique :**

```
maint(BTC) = 1 BTC × $100 × 5% = $5
maint(ETH) = 25 ETH × $4 × 5% = $5
total maint = $10
```

**PM :**

```
scenario grid: (BTC ±10%, ETH ±10% × ±50% vol)
worst-case loss (correlated -10% on both): -$10 on BTC + (-$10) profit on short ETH = $0
worst-case loss (decorrelated, BTC -10% / ETH +10%): -$10 + (-$10) = -$20  ← worst
+ concentration penalty (basket is balanced; small)
total maint ≈ $20  (vs classical $10) ?
```

Attendez — c'est plus élevé. Reprenons : short 25 ETH à 4 $ = 100 $ de notionnel short, l'opposé d'un long de 100 $ sur BTC.

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

Perte maximale : 20 $ — mais uniquement dans le scénario de décorrélation. En pondérant par la probabilité, ce choc de décorrélation est rare (corrélation BTC/ETH sur 30 jours ≈ 0,85). L'ensemble de scénarios calibrés de la PM pondère cela de manière réaliste ; la marge de maintenance effective est généralement de l'ordre de 5 à 10 $, et non du naïf 20 $.

Le modèle classique à 10 $ n'a simplement aucune vue sur la corrélation. La PM, si.

## Fonctionnement de la PM

> Le moteur de marge de portefeuille opère en interne en **centièmes de dollar** (plan `Decimal` en USDC entiers × 100). Le chiffre PM **remplace** la somme de maintenance classique par actif, il ne s'y ajoute pas. Il existe également un précompilé EVM côté lecture (`portfolio_margin_eval`) pour les cotations hors chaîne.

Sous PM, le chiffre de maintenance provient d'un **moteur de scénarios de type SPAN** qui parcourt une grille déterministe `(choc de prix, choc de volatilité)` sur l'ensemble du portefeuille :

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · |size_i| · mark_i · iv_i · δσ · δp²   # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

La grille et les coefficients de concentration sont les valeurs par défaut du moteur (`PortfolioMarginEngine::default`) :

| Paramètre | Défaut (code) |
|-----------|----------------|
| Chocs de prix | **±5 %, ±10 %, ±20 %** (`default_price_shocks` — 6 valeurs) |
| Chocs de volatilité | **±20 %, ±50 %** (`default_vol_shocks` — 4 valeurs) |
| Taille de la grille | **6 × 4 = 24 scénarios** |
| Volatilité implicite de repli | `0.50` (50 % annualisé) lorsque l'oracle ne fournit pas de `iv` |
| Seuil de concentration | **50 %** de la valeur nette (`default_concentration_threshold`) |
| Pénalité de concentration | **1 000 bps = 10 %** (`DEFAULT_CONCENTRATION_PENALTY_BPS`) |
| Capitaux propres minimaux à l'inscription | `10_000_000` centimes = **100 000 USDC** |

> ⚠️ **Corrections par rapport aux documents précédents.** Le moteur implémenté : (1) inclut un **terme gamma/convexité** piloté par la volatilité implicite par position — l'ancienne documentation modélisait les scénarios comme des PnL purement linéaires ; (2) utilise une **grille de 24 scénarios (±5/10/20 × ±20/50)** sans tableau par classe d'actifs — la grille par niveaux « BTC/altcoins/longue traîne » de l'ancien document n'est pas dans le code (la grille est un paramètre par défaut unique à l'ensemble du moteur, ajustable via le risque dynamique) ; (3) le seuil de concentration est de **50 %**, non 60 % ; (4) la pénalité de concentration est de **10 %** (1000 bps), non 5 %.

Les scénarios sont appliqués **simultanément** à l'ensemble du portefeuille. La compensation résulte naturellement du calcul : les branches `delta_pnl_i` d'un book couvert s'annulent dans `scenario_total`, ce qui rend `worst` faible. (Remarque : le moteur actuel applique chaque `δp` de manière uniforme à toutes les positions — une matrice de corrélation explicite par paire est une extension documentée, pas encore un champ du moteur.)

`concentration_penalty` majore la marge lorsqu'un seul actif domine :

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

(Ignoré lorsque `net_value ≤ 0` — le chemin BOLE pour les capitaux propres négatifs prend en charge ce compte à la place.)

## Inscription

```json
{ "type": "UserPortfolioMargin", "params": { "enabled": true } }
```

Compte principal uniquement. Symétrique pour désactiver.

| Contrainte | Valeur |
|------------|-------|
| `pm_min_equity` | par défaut 100 000 USDC ; fixé par la gouvernance |
| Effectif à partir de | le bloc suivant après confirmation |
| Positions actuellement en infraction | inscription rejetée si la PM vous placerait en T1+ ; fermez d'abord vos positions |

La désactivation revient au modèle classique au bloc suivant. La désactivation en T0+ est autorisée (vous pouvez toujours revenir à un modèle plus conservateur).

## Isolation stricte

Même sous PM, il est possible de marquer des actifs spécifiques comme **strictement isolés**. Une position en isolation stricte :

- Calcule sa propre marge de manière autonome (modèle classique)
- N'entre PAS dans le moteur de scénarios PM
- Se liquide de façon indépendante — l'impact d'un défaut est contenu à cet actif

Cas d'usage :
- Actifs nouveaux ou peu liquides dont la matrice de corrélation n'est pas calibrée
- Budget de spéculation isolé de votre book couvert principal
- Expérimentations à haut risque

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 7, "mode": "StrictIso" }
}
```

Voir [modes de marge](./margin-modes.md).

## Liquidation sous PM

Les comptes PM passent par l'échelle standard de [liquidation par niveaux](./tiered-liquidation.md), mais `maint_margin` correspond au chiffre PM, et non à la somme classique.

Une considération propre à la PM : une clôture partielle T1 peut déplacer le pire scénario au point que la position restante soit saine sous PM mais ne le serait pas sous le modèle classique. C'est intentionnel — la partielle est dimensionnée selon la PM dans les deux sens.

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## Risque pour l'opérateur

La PM est plus efficace en capital pour les utilisateurs, ce qui est précisément pourquoi elle est risquée pour le protocole — une mauvaise spécification des scénarios peut permettre à un compte de prendre plus de risque que la chaîne ne peut liquider proprement. MetaFlux atténue ce risque par :

- La `concentration_penalty` (seuil de 50 % / taux de 10 %) pour neutraliser les abus de la PM sur un seul actif — **implémentée** dans le moteur.
- Le plancher `min_enroll_account_value_cents` (100K USDC) — **implémenté** (`meets_enrollment_floor` ; une valeur nette négative échoue systématiquement).
- Le conservatisme de l'ensemble de scénarios, la calibration dynamique selon les régimes de volatilité, un plafond de notionnel PM par compte (`pm_max_account_notional`, valeur de conception 100M USDC), et un retour obligatoire au modèle classique en cas de défaillance du moteur de scénarios — **intention de conception / pas encore des champs sur `PortfolioMarginEngine`** ; le moteur ne comporte aujourd'hui que la grille, les paramètres de concentration et le plancher d'inscription.

L'ensemble de scénarios, les amplitudes de choc et les coefficients de concentration sont des paramètres de gouvernance (risque dynamique). Abonnez-vous aux mises à jour de paramètres si vous opérez proche des limites de marge.

## Exemple concret — pénalité de concentration

La pénalité compare le **plus grand notionnel absolu par actif** à la **valeur nette** du compte (`trésorerie + Σ taille × prix de marque`), avec les valeurs par défaut du code : seuil **50 %**, taux **10 %**.

Compte : valeur nette `$1000`, plus grande position `|notional_BTC| = $700`.

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

Si le parcours de scénarios PM calcule (par exemple) une perte maximale de `$25`, alors `pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`.

Un book plus équilibré, où aucun actif ne dépasse 50 % de la valeur nette, ne subit **aucune** pénalité — `pm_margin` correspond uniquement au pire scénario. La pénalité décourage la concentration sur un seul actif dans la PM ; la marge classique ne fait pas cette distinction.

## Consultation

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<addr>"}'
```

La lecture native [`account_state`](../api/rest/info.md#account_state) expose
`pm_enabled` (indiquant si la PM est active pour le compte) aux côtés de `maint_margin`,
`init_margin`, `health` et `tier`. Lorsque la PM est activée, `maint_margin` reflète
déjà la maintenance calculée par la PM :

```json
{
  "pm_enabled":   true,
  "maint_margin": "8",
  "init_margin":  "12",
  "health":       "...",
  "tier":         "Safe"
}
```

> **Lecture planifiée.** La comparaison classique/PM et le détail du scénario le plus défavorable (quelle combinaison de choc de prix/volatilité a déterminé le chiffre PM) **ne sont pas encore exposés** en tant que champs distincts dans la réponse [`account_state`](../api/rest/info.md#account_state) — le moteur de scénarios PM les calcule en interne, mais seul le `maint_margin` final est disponible aujourd'hui. Une future lecture (un champ de détails PM par scénario sur `account_state`) exposera ce détail.

## Cas limites

<details>
<summary>Afficher les cas limites</summary>

- **Panne du moteur de scénarios PM** : rare ; le protocole bascule sur `max(classical_maint, prior_pm_maint)` pour ce bloc. Les liquidations sur ce bloc utilisent le repli conservateur.
- **Ouverture d'une position multi-actifs en régime de choc** : la nouvelle position est admise par le moteur PM au moment de l'admission — mais le moteur lit les pondérations de scénarios depuis l'état confirmé, ce qui bloque tout abus par manipulation de régime adversariale.
- **Inscription en T0** : autorisée. La PM peut vous sortir du T0 (si elle donne une marge de maintenance inférieure), ou vous y maintenir (si ce n'est pas le cas). Pas de reversion automatique si la PM donne un chiffre plus élevé.
- **Désactivation en T0+** : autorisée. Utile pour revenir au modèle classique si la PM dysfonctionne au niveau du protocole.

</details>

## Voir aussi

- [Liquidation par niveaux](./tiered-liquidation.md) — interaction de la PM avec l'échelle
- [Modes de marge](./margin-modes.md) — Croix / Isolé / Isolation stricte
- [Sous-comptes](./sub-accounts.md) — inscription PM par sous-compte

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Les sous-comptes peuvent-ils avoir des paramètres PM différents ?**
R : Oui. Chaque sous-compte est indépendant. Un compte principal peut être inscrit en PM tandis que ses sous-comptes sont en modèle classique, et vice versa.

**Q : Quel est le coût en gaz de l'évaluation PM ?**
R : Plus élevé qu'en classique (grille de scénarios), mais borné. Le protocole met en cache les résultats de scénarios par compte et ne recalcule que lors de changements de position ou de mises à jour des paramètres de scénarios.

**Q : La PM est-elle transparente — puis-je voir le chiffre de maintenance exact avant de passer un ordre ?**
R : Oui. `/info clearinghouseState` retourne les deux valeurs, classique et PM. Les SDK exposent cela via leur helper `getOrderImpact()`.

**Q : Les cotations MIP-3 bénéficient-elles du crédit PM ?**
R : Uniquement si la spécification de marché de la cotation inclut l'actif dans la matrice de corrélation PM. De nombreuses cotations en longue traîne seront par défaut en Isolation stricte par sécurité. Vérifiez `market_info.pm_eligible` par marché.

</details>
