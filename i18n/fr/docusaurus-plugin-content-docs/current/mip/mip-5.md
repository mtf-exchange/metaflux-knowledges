# MIP-5 — Earn

:::info
**Planifié.** MIP-5 attribue l'emplacement précédemment réservé à **Earn** — un
pool de prêt dans lequel les déposants fournissent des actifs et perçoivent un
rendement provenant des intérêts payés par les emprunteurs opérant sur marge au
comptant. La spécification et le déploiement suivront les travaux sur la marge
au comptant sur lesquels cette fonctionnalité s'appuie.
:::

## Qu'est-ce qu'Earn

Earn constitue le **côté offre du marché de prêt au comptant de MetaFlux**. Un
déposant prête un actif (par exemple USDC) dans un pool dédié par actif et reçoit
des **parts** évaluées sur la valeur nette d'inventaire (VNI) du pool — le même
mécanisme de comptabilité VNI/part que celui du
[coffre Metaliquidity](./mip-2.md). Les traders opérant sur marge au comptant
empruntent depuis le pool et paient des intérêts ; ces intérêts s'accumulent dans
la VNI du pool, de sorte que chaque part prend de la valeur. Le rendement d'un
déposant est :

```
your_yield = shares × (share_price_now − share_price_at_deposit)
```

Le taux d'emprunt est une fonction déterministe du **taux d'utilisation**
(emprunté ÷ fourni). Le taux annuel de l'offre en découle :

```
supply_APY ≈ borrow_APR × utilisation × (1 − reserve_factor)
```

## Deux faces d'un même marché

Earn (l'offre) et la marge au comptant (la demande) sont les deux faces d'un seul
et même marché de prêt : les intérêts versés par les emprunteurs **constituent**
le rendement perçu par les prêteurs.

- **Réutilise la comptabilité VNI/part de [MIP-2](./mip-2.md)** pour les dépôts
  et les retraits (un dépôt émet des parts au prix actuel de la part ; un retrait
  les rachète à la VNI).
- Ajoute ce qu'un coffre ne possède pas : une courbe de taux d'intérêt basée sur
  l'utilisation→APR et une capitalisation des intérêts continue (par bloc).

## Statut

Planifié. Dépend du déploiement préalable du trading au comptant et de la marge
au comptant ; ne fait pas encore partie de l'ensemble des fonctionnalités finalisées de la V1.

## Référence de gouvernance

- Consultez le [registre des MIP](./index.md) pour l'index faisant autorité et
  le statut de chaque MIP.
