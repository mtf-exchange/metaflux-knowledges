---
description: Une introduction accessible à MetaFlux pour les nouveaux arrivants — ce que c'est, ce que vous pouvez y faire, et les quelques notions essentielles à connaître avant de commencer à trader.
---

# MetaFlux 101 — Commencer ici

:::info
**Vous découvrez MetaFlux ?** Cette page ne suppose aucune connaissance préalable en cryptomonnaie ou en produits dérivés. À la fin, vous comprendrez ce qu'est MetaFlux, ce que vous pouvez y faire dès aujourd'hui, et les quelques concepts à maîtriser avant votre premier trade.
:::

## Qu'est-ce que MetaFlux

MetaFlux est un **exchange ouvert et entièrement on-chain** — une place de marché pour trader, fonctionnant entièrement sur un réseau public plutôt qu'au sein des serveurs privés d'une seule entreprise. Imaginez un exchange traditionnel comme un bâtiment avec une salle des marchés verrouillée : vous devez faire confiance à ceux qui détiennent les clés. MetaFlux ressemble davantage à un grand livre public que tout le monde peut consulter et qu'aucune entité ne contrôle seule. Les règles sont inscrites dans le code, chaque transaction est enregistrée de façon transparente, et vous conservez la garde de vos propres fonds.

Parce qu'il vit on-chain, MetaFlux est **transparent** (tout le monde peut vérifier ce qui s'est passé), **ouvert** (tout le monde peut s'y connecter, construire dessus ou y inscrire un marché), et **toujours disponible** (il est opéré par de nombreux opérateurs indépendants, et non par une seule entreprise qui pourrait couper le contact). Vous vous connectez avec un portefeuille crypto, déposez des fonds et tradez — sans demande de compte, sans gardien.

## Ce que vous pouvez faire aujourd'hui

- **Trader des contrats perpétuels.** Prenez position sur la hausse ou la baisse du prix d'un actif, avec un effet de levier optionnel, sans jamais détenir l'actif lui-même. (Retrouvez plus bas la signification de « perpétuel ».)
- **Trader au comptant (spot).** Achetez et vendez les actifs eux-mêmes, réglés sur votre solde (solde uniquement — sans effet de levier pour l'instant).
- **Maintenir des positions bidirectionnelles (hedge)** — conserver simultanément une position longue et une position courte sur le même marché. Voir [mode hedge](concepts/hedge-mode.md).

Et prochainement :

- **Générer du rendement sur vos USDC inactifs** via [Earn](concepts/earn.md), un pool de prêt rémunéré.
- **Trading spot avec effet de levier** (marge spot), disponible en même temps qu'Earn. Voir [marge spot](products/spot-margin.md).

Pour la liste complète des produits de trading et leur état — perpétuels, spot, marge spot, et les pistes options et CDS planifiées — consultez [Produits](products/index.md).

## Les quelques concepts à connaître

Vous n'avez pas besoin d'être expert pour commencer, mais quelques notions vous aideront à tout comprendre plus facilement. Chacune renvoie à une explication plus détaillée.

**Perpétuel vs. spot.** Le trading *spot* est la forme de transaction la plus directe : vous échangez un actif contre un autre et vous possédez le résultat. Un *contrat à terme perpétuel* (« perp ») est un contrat qui suit le prix d'un actif pour vous permettre de profiter de ses mouvements — à la hausse comme à la baisse — sans le détenir, et sans date d'expiration, de sorte que la position reste ouverte tant que vous la maintenez en bonne santé. Les perps sont le principal instrument de trading avec effet de levier sur MetaFlux.

**Le carnet d'ordres.** C'est la liste en temps réel des offres d'achat et de vente de tous les participants pour un marché donné, triées par prix. Lorsque votre offre d'achat rencontre une offre de vente au même prix, une transaction est exécutée. Un *ordre au marché* prend le meilleur prix disponible immédiatement ; un *ordre à cours limité* attend le prix que vous avez défini. MetaFlux prend en charge de nombreux [types d'ordres](concepts/order-types.md) au-delà de ces bases.

**Effet de levier et marge.** La *marge* est le collatéral que vous déposez pour garantir une position. L'*effet de levier* permet à ce collatéral de contrôler une position plus importante — un levier de 10x signifie qu'un dépôt de 100 $ peut maintenir une position de 1 000 $. L'effet de levier amplifie les gains **et** les pertes à égalité. La façon dont votre collatéral est partagé ou isolé entre les positions constitue votre *mode de marge* — voir [modes de marge](concepts/margin-modes.md).

**Liquidation.** Si une position avec effet de levier évolue tellement contre vous que votre collatéral ne peut plus la couvrir, la position est fermée automatiquement pour stopper les pertes. C'est la *liquidation*. MetaFlux utilise un processus de [liquidation par paliers](concepts/tiered-liquidation.md) — un avertissement précoce et des étapes progressives plutôt qu'une liquidation totale et soudaine — pour laisser aux positions une chance de se redresser.

**Taux de financement.** Un contrat perpétuel n'ayant pas de date d'expiration, un petit paiement périodique maintient son prix ancré au prix de marché réel. Lorsque davantage de traders sont en position longue, les longs paient les shorts ; lorsque davantage sont en position courte, les shorts paient les longs. C'est le [taux de financement](concepts/funding-rates.md), versé directement entre traders, et non à l'exchange.

**Prix mark.** Plutôt que de se fier au dernier prix traité — qu'un seul ordre de grande taille ou aberrant pourrait fausser — MetaFlux valorise vos positions selon une référence robuste et résistante à la manipulation appelée le [prix mark](concepts/mark-prices.md). C'est lui qui détermine votre marge, votre seuil de liquidation et vos profits et pertes non réalisés.

:::tip
**En résumé :** déposez de la *marge*, utilisez optionnellement l'*effet de levier* pour dimensionner votre position, surveillez la santé de votre position par rapport au *prix mark*, et évitez la *liquidation*. Le [glossaire](concepts/glossary.md) définit chaque terme que vous rencontrerez.
:::

## Ce qui distingue MetaFlux

- **Entièrement on-chain et transparent.** Chaque ordre, chaque transaction et chaque liquidation est enregistré sur un grand livre public que tout le monde peut vérifier. Il n'y a pas de correspondance cachée, pas de vue privilégiée du carnet — les mêmes règles s'appliquent à tous.
- **Ouvert et sans autorisation requise.** N'importe qui peut connecter un portefeuille et trader, créer des outils et des applications par-dessus, ou même inscrire un nouveau marché — sans approbation nécessaire. Voir [déploiement de marché sans autorisation](mip/mip-3.md).
- **Résilient par conception.** MetaFlux est validé par un ensemble distribué d'opérateurs indépendants, et non par une seule entreprise. Il n'y a pas d'interrupteur unique à couper, pas de point de défaillance unique, et aucun opérateur ne peut geler vos fonds.
- **Rapide.** MetaFlux est conçu pour un débit élevé et une faible latence, de sorte que le trading reste réactif même en cas de charge importante.

L'avantage profond de MetaFlux réside dans ses *capacités*, non dans ses prix : MetaFlux investit dans une microstructure de marché avancée, des modèles de risque et de marge sophistiqués, et une couche d'exécution haute performance — permettant à la plateforme de prendre en charge des stratégies et des protections que des plateformes plus simples ne peuvent pas offrir. Vous le constaterez tout au long de la section [Concepts](concepts/).

## Comment commencer

:::info
**Vous voulez juste trader ?** Connectez un portefeuille compatible et commencez par la page [réseaux et identifiants de chaîne](networks.md) pour configurer votre portefeuille sur le bon réseau et les bons points de terminaison.
:::

- **Choisissez un réseau.** [Réseaux et identifiants de chaîne](networks.md) liste les points de terminaison devnet, testnet et mainnet ainsi que leurs identifiants de chaîne. Commencez sur un réseau de test si vous souhaitez vous entraîner sans risquer de vrais fonds.
- **Vous développez ou créez un bot ?** Le [guide de démarrage rapide](integration/quickstart.md) pour développeurs vous accompagne du dépôt au retrait en quelques minutes.
- **Choisissez un SDK.** Des clients prêts à l'emploi en [TypeScript](integration/typescript-sdk.md) et en [Rust](integration/rust-sdk.md) gèrent la signature et le format réseau pour vous.

## Où aller ensuite

- Parcourez la section [Concepts](concepts/) pour des explications accessibles de chaque mécanisme fondamental.
- Vous débutez avec les termes des produits dérivés ? Le [Glossaire](concepts/glossary.md) les définit tous.
- Prêt à construire ? Rendez-vous dans les guides d'[Intégration](integration/).
