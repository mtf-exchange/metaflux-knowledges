# Earn

:::info
**Disponible sur le devnet (aperçu).** Un pool de prêt en USDC qui génère du rendement à partir des emprunteurs sur [marge au comptant](../products/spot-margin.md). L'alimentation du pool, la tarification des parts, le rachat borné par les liquidités disponibles ET le liquidateur automatique de marge au comptant qui protège le pool fonctionnent tous de bout en bout sur le **devnet aujourd'hui** (voir la [surface d'action](#deposit--withdraw) ci-dessous). Considérez-le comme un **aperçu** : les ratios de maintenance par paire sont encore en cours de calibration.
:::

## En bref

Déposez des USDC dans le **pool Earn** et générez du rendement. Le pool prête des USDC à des emprunteurs sur [marge au comptant](../products/spot-margin.md), qui paient des intérêts ; ces intérêts s'accumulent dans le pool et augmentent la valeur de vos **parts**. Il n'y a **aucune étape de réclamation** — le rendement se capitalise en continu dans la valeur de vos parts, et vous le réalisez au moment du retrait.

## Fonctionnement — modèle parts / VNI

Lorsque vous déposez, vous recevez des **parts** dont le prix correspond à la valeur nette d'inventaire par part (VNI) actuelle du pool. Les intérêts versés par les emprunteurs augmentent la valeur totale du pool, de sorte que chaque part vaut progressivement plus en USDC.

```
share_price        = pool_value / total_shares           # NAV per share
deposit D USDC  →  mint  D / share_price  shares
withdraw S shares → receive  S × share_price  USDC
```

- `pool_value` commence égal au total des dépôts et **croît à chaque bloc** au fur et à mesure que les intérêts d'emprunt s'y accumulent.
- `total_shares` ne change que lors des dépôts (émission) et des retraits (destruction).
- Le premier dépôt fixe `share_price = 1.0` (1 part = 1 USDC).

Comme les intérêts augmentent `pool_value` (et non le nombre de parts), `share_price` augmente de façon monotone tant que les prêts sont actifs — les parts de chaque détenteur s'apprécient au même rythme, sans course aux réclamations ni comptabilité par utilisateur.

## Le calcul du rendement

Votre gain correspond à l'appréciation de vos parts entre le dépôt et le retrait :

```
your_yield = your_shares × (share_price_now − share_price_at_deposit)
```

À chaque bloc, le pool croît du montant des intérêts dus sur les prêts en cours :

```
interest_this_block = total_borrowed × borrow_rate_per_ms × Δms
pool_value         += interest_this_block
share_price         = pool_value / total_shares          # recomputed
```

### APY effectif

Tous les USDC déposés ne sont pas prêtés en même temps — seule la fraction **utilisée** bénéficie du taux d'emprunt. Le rendement observé par un déposant correspond donc au taux d'emprunt pondéré par le taux d'utilisation :

```
utilisation     = total_borrowed / pool_value            # 0 … 1
depositor_APY  ≈ borrow_APR × utilisation × (1 − protocol_fee)
```

| | Valeur |
|---|---|
| `borrow_APR` | le taux d'emprunt fixe sur marge au comptant (par paire) |
| `utilisation` | fraction du pool actuellement prêtée |
| `protocol_fee` | part optionnelle des intérêts prélevée par le protocole, si configurée |

Exemple : un APR d'emprunt de 12 % à 50 % d'utilisation, sans frais de protocole → APY du déposant ≈ 6 %. Toute l'arithmétique est en virgule fixe (`Decimal`), sans virgule flottante.

## Dépôt / retrait

Les deux actions sont autorisées par l'expéditeur sur le chemin public
[`/exchange`](../api/rest/exchange.md#spot-margin--earn) ; `asset` est
l'**identifiant de l'actif de cotation prêtable** (la clé du pool — la cotation d'une paire au comptant enregistrée),
et `amount` / `shares` sont des décimaux envoyés sous forme de chaînes JSON. Le pool
**se crée automatiquement au premier dépôt** pour tout actif prêtable. Confirmez les parts émises /
restantes et les totaux du pool via
[`/info` `earn_state`](../api/rest/info.md#earn_state).

```json
// supply 5,000 USDC into the Earn pool for asset 100
{ "type": "earn_deposit", "params": { "asset": 100, "amount": "5000" } }
```

```json
// redeem shares (receive shares × share_value), idle-bounded
{ "type": "earn_withdraw", "params": { "asset": 100, "shares": "1234.5" } }
```

| Action | Effet |
|---|---|
| [`earn_deposit`](../api/rest/exchange.md#earn_deposit) | Apport de la cotation → parts du pool (1:1 sur un pool vierge, sinon valorisé sur la VNI) |
| [`earn_withdraw`](../api/rest/exchange.md#earn_withdraw) | Rachat de parts → cotation, **plafonné aux liquidités disponibles** |

**Borne sur les liquidités disponibles.** Un retrait est immédiat mais **limité par les liquidités disponibles**
(`total_supplied − total_borrowed`) : un rachat supérieur aux liquidités disponibles paie exactement
ces liquidités et détruit proportionnellement moins de parts ; un pool avec **zéro liquidité disponible** (entièrement
prêté) rejette le retrait jusqu'au remboursement des emprunteurs. Cela garantit qu'un fournisseur
peut toujours retirer jusqu'à ce qui n'est pas prêté, sans jamais laisser le registre d'emprunt
sous-collatéralisé.

## Risques

Earn **n'est pas sans risque**. Si une position sur [marge au comptant](../products/spot-margin.md) est clôturée
à perte et que les garanties de l'emprunteur ne suffisent pas à la couvrir, le **déficit est mutualisé
entre les fournisseurs** : le `total_supplied` du pool est réduit (plancher à zéro), ce qui
abaisse `share_value`. La protection du pool repose sur le **liquidateur automatique** (actif
sur le devnet) : à chaque bloc, les comptes de marge sous-provisionnés sont
[clôturés de force](../products/spot-margin.md#liquidation) au plancher de maintenance, de sorte qu'une
position est dénouée alors qu'il reste normalement suffisamment de valeur pour rembourser le prêt.
Le ratio de maintenance conservateur par paire (encore en cours de calibration) détermine ce
tampon ; un mécanisme de cascade par tampon d'assurance en amont des fournisseurs est prévu mais pas encore implémenté. Il existe également un **risque de liquidité** : les rachats sont bornés par les liquidités disponibles,
de sorte qu'un pool entièrement utilisé ne peut pas être quitté tant que les emprunteurs n'ont pas remboursé.

## Voir aussi

- [Marge au comptant](../products/spot-margin.md) — les emprunteurs dont les intérêts constituent votre rendement
- [Liquidation échelonnée](./tiered-liquidation.md) — la cascade d'assurance qui protège le pool
- [Coffres](./vaults.md) — un produit de rendement différent (capital de fournisseur de liquidité géré par stratégie), qui n'est pas un pool de prêt

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Dois-je réclamer mon rendement ?**
R : Non. Le rendement se capitalise en continu dans la valeur de vos parts ; vous le réalisez au moment du retrait.

**Q : Pourquoi mon APY est-il inférieur au taux d'emprunt ?**
R : Seule la fraction prêtée (utilisée) du pool génère des intérêts. APY ≈ taux d'emprunt × utilisation.

**Q : Puis-je perdre mon capital ?**
R : Oui, si une perte sur marge au comptant dépasse les garanties de l'emprunteur — le déficit non couvert est mutualisé entre les fournisseurs et abaisse la valeur des parts (un tampon d'assurance en amont des fournisseurs est prévu mais pas encore implémenté). Ce cas est conçu pour être rare : le liquidateur automatique clôture de force les positions sous-provisionnées au plancher de maintenance, et le ratio par paire est défini de manière conservatrice. Earn est moins risqué qu'un [coffre](./vaults.md) de trading, mais n'est pas sans risque.

**Q : Pourquoi ne puis-je pas retirer la totalité de mon solde en ce moment ?**
R : Les rachats sont bornés par les **liquidités disponibles** (`supplied − borrowed`). Si le pool est entièrement prêté à des emprunteurs sur marge au comptant, vous ne pouvez retirer que le montant disponible ; le reste se débloque au fur et à mesure que les emprunteurs remboursent.

**Q : En quoi Earn diffère-t-il d'un coffre Metaliquidity ?**
R : Earn est un pool de **prêt** passif en USDC (rendement = intérêts d'emprunt). Un [coffre](./vaults.md) est du capital de fournisseur de liquidité **géré activement** (rendement/perte = le PnL de la stratégie). Des profils de risque différents.

</details>
