# Marge de portefeuille

:::info
**Disponible sur le devnet.** Le moteur de scénarios est pleinement opérationnel : les utilisateurs s'inscrivent via l'action `UserPortfolioMargin` (soumise à un seuil de fonds propres, par défaut ≥ 100 000 USDC), et la grille de scénarios de style SPAN (±5/10/20 % de prix × ±20/50 % de volatilité) calcule la marge de maintenance en temps réel. L'interface d'actions et le moteur de scénarios sont tous deux déployés et testés sur un consensus à 4 nœuds.
:::

## En résumé

La PM traite l'ensemble du compte comme un seul chiffre de risque. Les positions couvertes ou corrélées se compensent mutuellement ; le protocole prélève une marge en fonction du scénario le plus défavorable sur une grille de chocs `(prix, vol)` calibrée. Efficacité en capital typique pour un portefeuille équilibré : **2 à 5 fois** celle du modèle classique.

La PM est optionnelle, soumise à un seuil de fonds propres (par défaut ≥ 100 000 USDC) et réversible.

## Classique vs PM — comparaison côte à côte

Exemple de portefeuille couvert : long 1 BTC à 100 $, short 25 ETH à 4 $ (parfaitement neutre en dollars si BTC et ETH sont parfaitement corrélés, ce qui est presque le cas).

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

Attendez — c'est pire. Reprenons : short 25 ETH à 4 $ = 100 $ de notionnel short, à l'opposé du long 100 $ BTC.

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

Perte maximale : 20 $ — mais uniquement dans le scénario de décorrélation. En pondérant par la probabilité, le choc de décorrélation est rare (corrélation 30 jours BTC/ETH ≈ 0,85). L'ensemble de scénarios calibré de la PM pondère cela de manière réaliste ; la marge de maintenance effective est généralement de l'ordre de 5 à 10 $, et non le naïf 20 $.

Le modèle classique à 10 $ n'a tout simplement aucune vue sur la corrélation. La PM, si.

## Fonctionnement de la PM

> Le moteur de marge de portefeuille opère en **centimes USD** en interne (plan `Decimal` en USDC entiers × 100). Le chiffre PM **remplace** la somme de maintenance classique par actif, il ne s'y ajoute pas. Il existe également un précompile EVM en lecture seule (`portfolio_margin_eval`) pour les cotations hors chaîne.

Sous PM, la marge de maintenance est dérivée d'un **moteur de scénarios de style SPAN** qui balaie une grille déterministe `(choc de prix, choc de vol)` sur l'ensemble du portefeuille :

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · |size_i| · mark_i · iv_i · δσ · δp²   # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

La grille et les coefficients de concentration sont les valeurs par défaut du moteur (`PortfolioMarginEngine::default`) :

| Paramètre | Valeur par défaut (code) |
|-----------|--------------------------|
| Chocs de prix | **±5 %, ±10 %, ±20 %** (`default_price_shocks` — 6 valeurs) |
| Chocs de volatilité | **±20 %, ±50 %** (`default_vol_shocks` — 4 valeurs) |
| Taille de la grille | **6 × 4 = 24 scénarios** |
| Volatilité implicite de repli | `0.50` (50 % annualisée) lorsque l'oracle ne fournit pas de `iv` |
| Seuil de concentration | **50 %** de la valeur nette (`default_concentration_threshold`) |
| Pénalité de concentration | **1 000 bps = 10 %** (`DEFAULT_CONCENTRATION_PENALTY_BPS`) |
| Fonds propres minimum d'inscription | `10_000_000` centimes = **100 000 USDC** |

> ⚠️ **Corrections par rapport au texte précédent.** Le moteur implémenté : (1) inclut un **terme gamma/convexité** piloté par la volatilité implicite par position — le document précédent modélisait les scénarios comme du PnL purement linéaire ; (2) utilise une **grille de 24 scénarios unique (±5/10/20 × ±20/50)** sans tableau par classe d'actifs — la grille à niveaux « BTC/altcoins/longue traîne » dans l'ancien document n'est pas dans le code (la grille est une valeur par défaut commune au moteur, ajustable via le risque dynamique) ; (3) le seuil de concentration est de **50 %**, non 60 % ; (4) la pénalité de concentration est de **10 %** (1 000 bps), non 5 %.

Les scénarios sont appliqués **simultanément** sur l'ensemble du portefeuille. La compensation émerge naturellement : les jambes `delta_pnl_i` d'un portefeuille couvert s'annulent dans `scenario_total`, de sorte que `worst` est faible. (Remarque : le moteur actuel applique chaque `δp` uniformément à toutes les positions — une matrice de corrélation explicite par paire est une extension documentée, pas encore un champ du moteur.)

`concentration_penalty` rajoute de la marge lorsqu'un actif unique domine :

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

(Ignoré si `net_value ≤ 0` — le chemin BOLE de fonds propres négatifs gère ce compte à la place.)

## Inscription

```json
{ "type": "UserPortfolioMargin", "params": { "enabled": true } }
```

Compte maître uniquement. Symétrique pour la désactivation.

| Contrainte | Valeur |
|------------|--------|
| `pm_min_equity` | par défaut 100 000 USDC ; défini par la gouvernance |
| Effectif à partir de | le bloc suivant après validation |
| Positions en violation | l'inscription est rejetée si la PM vous place en T1+ ; réduisez d'abord vos positions |

La désactivation revient au modèle classique dès le bloc suivant. La désactivation en T0+ est autorisée (vous pouvez toujours revenir à un modèle plus conservateur).

## Isolation stricte

Même sous PM, vous pouvez marquer des actifs spécifiques comme **strictement isolés**. Une position en isolation stricte :

- Calcule sa propre marge de manière autonome (modèle classique)
- N'entre PAS dans le moteur de scénarios PM
- Est liquidée de manière indépendante — les pertes sont contenues à cet actif

Cas d'usage :
- Actifs nouveaux ou illiquides dont la matrice de corrélation n'est pas calibrée
- Budget de spéculation isolé de votre noyau couvert
- Expériences à haut risque

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 7, "mode": "StrictIso" }
}
```

Voir [modes de marge](./margin-modes.md).

## Liquidation sous PM

Les comptes PM passent par l'échelle standard de [liquidation par niveaux](./tiered-liquidation.md), mais `maint_margin` correspond au chiffre PM, non à la somme classique.

Un point propre à la PM : une clôture partielle en T1 peut décaler le scénario le plus défavorable au point que la position restante est saine sous PM mais ne le serait pas sous le modèle classique. C'est voulu — la clôture partielle est dimensionnée contre la PM dans les deux sens.

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## Risque pour l'opérateur

La PM est plus efficace en capital pour les utilisateurs, ce qui est précisément pourquoi elle est risquée pour le protocole — une mauvaise spécification de scénario peut permettre à un compte de prendre plus de risque que la chaîne ne peut liquider proprement. MetaFlux atténue cela grâce à :

- `concentration_penalty` (seuil 50 % / taux 10 %) pour déjouer les stratégies d'exploitation de la PM sur un actif unique — **implémentée** dans le moteur.
- Le plancher `min_enroll_account_value_cents` (100 000 USDC) — **implémenté** (`meets_enrollment_floor` ; une valeur nette négative échoue toujours).
- Le conservatisme de l'ensemble de scénarios, le calibrage dynamique en fonction des régimes de volatilité, un plafond PM par compte (`pm_max_account_notional`, valeur de conception 100 M USDC), et un repli obligatoire vers le modèle classique en cas de défaillance du moteur de scénarios — **intention de conception / pas encore des champs sur `PortfolioMarginEngine`** ; le moteur actuel ne porte que la grille, les paramètres de concentration et le plancher d'inscription.

L'ensemble de scénarios, les amplitudes des chocs et les coefficients de concentration sont des paramètres de gouvernance (risque dynamique). Abonnez-vous aux mises à jour des paramètres si vous opérez près des limites de marge.

## Exemple détaillé — pénalité de concentration

La pénalité compare le **notionnel absolu du plus grand actif unique** avec la **valeur nette** du compte (`cash + Σ size × mark`), avec les valeurs par défaut du code : seuil **50 %**, taux **10 %**.

Compte : valeur nette `$1000`, position la plus importante `|notional_BTC| = $700`.

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

Si le balayage de scénarios PM calcule (par exemple) une perte maximale de `25 $`, alors `pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`.

Un portefeuille plus équilibré où aucun actif unique ne dépasse 50 % de la valeur nette ne paye **aucune** pénalité — `pm_margin` correspond uniquement au scénario le plus défavorable. La pénalité décourage la concentration sur un seul actif dans le cadre de la PM ; la marge classique n'applique pas une telle pénalité.

## Interrogation

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
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

> **Lecture planifiée.** La comparaison classique vs PM et la décomposition du scénario le plus défavorable (quelle combinaison de choc de prix/vol a déterminé le chiffre PM) **ne sont pas encore exposées** comme champs distincts dans la réponse [`account_state`](../api/rest/info.md#account_state) — le moteur de scénarios PM les calcule en interne, mais seul le `maint_margin` final est disponible aujourd'hui. Une future lecture (un champ de détails PM par scénario sur `account_state`) exposera la décomposition.

## Cas limites

<details>
<summary>Afficher les cas limites</summary>

- **Panne du moteur de scénarios PM** : rare ; le protocole se replie sur `max(classical_maint, prior_pm_maint)` pour ce bloc. Les liquidations sur ce bloc utilisent le repli conservateur.
- **Ouverture d'une position inter-actifs pendant un régime de choc** : la nouvelle position est admise contre le moteur PM au moment de l'admission — mais le moteur lit les pondérations de scénario depuis l'état validé, ce qui bloque toute manipulation par changement de régime adverse.
- **Inscription en T0** : autorisée. La PM peut vous sortir du T0 (si elle donne une maintenance plus faible), ou vous y maintenir (si ce n'est pas le cas). Pas de réversion automatique si la PM donne un chiffre moins favorable.
- **Désactivation en T0+** : autorisée. Utile pour revenir au modèle classique si la PM dysfonctionne au niveau du protocole.

</details>

## Voir aussi

- [Liquidation par niveaux](./tiered-liquidation.md) — comment la PM interagit avec l'échelle
- [Modes de marge](./margin-modes.md) — Croisé / Isolé / Isolation stricte
- [Sous-comptes](./sub-accounts.md) — inscription PM par sous-compte

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Les sous-comptes peuvent-ils avoir des paramètres PM différents ?**
R : Oui. Chaque sous-compte est indépendant. Un compte maître peut être inscrit en PM tandis que ses sous-comptes sont en mode classique, et inversement.

**Q : Quel est le coût en gas de l'évaluation PM ?**
R : Supérieur au modèle classique (grille de scénarios), mais borné. Le protocole met en cache les résultats de scénarios par compte et ne les recalcule que lors de changements de position ou de mises à jour des paramètres de scénario.

**Q : La PM est-elle transparente — puis-je voir le chiffre de maintenance exact avant de passer un ordre ?**
R : Oui. `/info clearinghouseState` retourne à la fois le classique et la PM. Les SDK exposent cela dans leur helper `getOrderImpact()`.

**Q : Les inscriptions MIP-3 bénéficient-elles du crédit PM ?**
R : Uniquement si la spécification de marché de l'inscription inclut l'actif dans la matrice de corrélation PM. De nombreuses inscriptions de longue traîne seront par défaut en Strict-Iso par mesure de sécurité. Vérifiez `market_info.pm_eligible` par marché.

</details>
