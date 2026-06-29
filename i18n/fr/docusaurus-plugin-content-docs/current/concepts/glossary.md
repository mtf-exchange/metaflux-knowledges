# Glossaire

:::tip
**Stable.** De nouveaux termes sont ajoutés à chaque expansion du protocole.
:::

Définitions des termes utilisés dans l'ensemble de la documentation. Renvois croisés vers les pages dédiées le cas échéant.

## A

**ADL — Délevier automatique (Auto-deleverage).** Mécanisme de mutualisation des pertes qui récupère les PnL latents auprès des contreparties bénéficiaires lorsque le fonds d'assurance ne peut pas couvrir un déficit de liquidation T3. Voir [ADL](./adl.md).

**Portefeuille agent (Agent wallet).** Clé de signature approuvée par un compte maître pour agir en son nom, **sans** autorité de retrait. Voir [portefeuilles agents](./agent-wallets.md).

**ALO — Ajout en mode limite uniquement (Add-Limit-Only).** TIF d'ordre qui rejette l'ordre en totalité si une partie quelconque viendrait croiser le carnet. Maker garanti. Voir [types d'ordres](./order-types.md#time-in-force).

**Identifiant d'actif (Asset ID).** Identifiant entier canonique d'un marché. Différent selon les réseaux ; à consulter via les informations `meta`.

**Action.** Appel modifiant l'état vers `POST /exchange`. Union à variantes taguées comptant une trentaine de types. Voir [exchange.md](../api/rest/exchange.md#action-catalog).

## B

**Filet de sécurité (T3) — Backstop.** Niveau de liquidation où le protocole saisit la position d'un compte sous le seuil dans le fonds d'assurance. Voir [liquidation par paliers](./tiered-liquidation.md#t3-backstop--netting-at-mark).

**Bande de prix mark (Mark-price band).** Limite par bloc sur l'amplitude de variation du prix mark. Protège contre la manipulation de l'oracle ou du mid. Voir [prix mark](./mark-prices.md#sanity-bands).

**Identifiant de lot (Batch ID).** Identifiant de lot d'enchères pour les marchés FBA. Voir [FBA](./fba.md).

**bps — Point de base (Basis point).** 0,01 % (= `1e-4`). Les taux de frais sont exprimés en bps ; `5 bps` = 0,05 %.

**Ristourne constructeur (Builder rebate).** Part des frais versée à l'adresse qui a soumis un ordre (interface, agrégateur, service d'automatisation). Voir [frais](./fees.md#builder-rebate).

## C

**CCTP — Protocole de transfert inter-chaînes (Cross-Chain Transfer Protocol).** Protocole inter-chaînes de Circle. MetaFlux n'utilise **pas** le CCTP ; à la place, l'USDC est ponté via [MetaBridge](../bridge/) (un pont de dépôt signé par des validateurs).

**chainId.** Champ de domaine EIP-712 sélectionnant le réseau. `31337` devnet, `114514` testnet, `8964` mainnet. Voir [réseaux](../networks.md).

**Cloid — Identifiant d'ordre client (Client Order ID).** Identifiant de 16 octets défini par le client ; permet `CancelByCloid` et l'idempotence des ordres. Voir [exchange.md `submit_order`](../api/rest/exchange.md#submit_order).

**Prix de compensation (FBA) — Clearing price.** Le prix uniforme unique auquel un lot FBA se règle. Voir [FBA](./fba.md).

**Marge croisée (Cross margin).** Mode de marge où toutes les positions partagent les garanties à l'échelle du compte. Efficace en capital ; non isolée. Voir [modes de marge](./margin-modes.md).

## D

**Délégation (staking).** Mise en MTF d'un délégateur affectée au pool d'un validateur. Génère des récompenses, exposée au slashing. Voir [staking](./staking.md).

**Séparateur de domaine (Domain separator).** Constante EIP-712 de 32 octets par réseau ; l'une des entrées du hachage signé. Voir [signature](../integration/signing.md).

## E

**EIP-712.** Norme Ethereum pour les données structurées typées et signées. La signature MetaFlux utilise l'enveloppe EIP-712 (`0x1901 || domain || hash`). Voir [signature](../integration/signing.md).

**EMA — Moyenne mobile exponentielle (Exponential Moving Average).** Utilisée dans le lissage du prix mid pour le calcul du prix mark. Voir [prix mark](./mark-prices.md).

## F

**FBA — Enchère par lots fréquents (Frequent Batch Auction).** Variante de matching à temps discret, alternative au CLOB continu. Voir [FBA](./fba.md).

**FIFO — Premier entré, premier sorti (First-In-First-Out).** Priorité de matching des ordres au même niveau de prix sur le CLOB continu.

**FOK — Tout ou rien (Fill-or-Kill).** TIF qui exécute l'ordre en totalité ou l'annule entièrement. Voir [types d'ordres](./order-types.md#time-in-force).

**Taux de financement (Funding rate).** Paiement horaire entre utilisateurs qui ancre le prix du contrat perpétuel sur l'oracle sous-jacent. Voir [taux de financement](./funding-rates.md).

## G

**Regroupement (Grouping).** Paramètre `Order` qui lie des branches dans une famille OCO (`NormalTpsl`) ou des accolades attachées à une position (`PositionTpsl`). Voir [types d'ordres](./order-types.md#grouping).

**GTC — Valable jusqu'à annulation (Good-Till-Cancelled).** TIF par défaut ; l'ordre reste dans le carnet indéfiniment. Voir [types d'ordres](./order-types.md#time-in-force).

## H

**Ratio de santé (Health ratio).** `account_value / maint_margin`. Pilote l'échelle de [liquidation par paliers](./tiered-liquidation.md).

**Filigrane (High-water mark).** Prix d'action historique le plus élevé d'un vault, utilisé pour conditionner l'accumulation des commissions de performance. Voir [vaults](./vaults.md).

## I

**IOC — Immédiat ou annulé (Immediate-Or-Cancel).** TIF : exécute ce qui est disponible, annule tout reliquat non exécuté. Voir [types d'ordres](./order-types.md#time-in-force).

**Idempotence (Idempotency).** Propriété selon laquelle la répétition d'une requête produit le même effet observable. Voir [idempotence](../integration/idempotency.md).

**Fonds d'assurance (Insurance pool).** Sous-ensemble du MFlux Vault réservé à la couverture de filet de sécurité T3. Voir [vaults](./vaults.md#insurance-pool).

**Marge isolée (Isolated margin).** Mode de marge où un compartiment par actif plafonne la perte sur cet actif. Voir [modes de marge](./margin-modes.md).

## L

**Carnet L2 (L2 book).** Le carnet d'ordres à une profondeur donnée (N premiers niveaux par côté). Voir [`l2_book` info](../api/rest/info/perpetuals.md#l2_book).

**Palier de liquidation (Liquidation tier).** Étape de [l'échelle par paliers](./tiered-liquidation.md) : T0 carton jaune, T1 partielle, T2 complète, T3 filet de sécurité, T4 ADL.

**Période de blocage (Lock-up) — staking / vault.** Délai requis entre le signal de déstaking/retrait et la disponibilité des fonds. Voir [staking](./staking.md), [vaults](./vaults.md).

## M

**Marge de maintenance (Maintenance margin).** Garantie minimale requise pour maintenir une position ouverte. Santé = `account_value / maint_margin`. Voir [modes de marge](./margin-modes.md).

**Maker / Taker.** Le maker apporte de la liquidité (ordre au repos) ; le taker la retire (ordre croiseur). Taux de frais différents. Voir [frais](./fees.md).

**Prix mark (Mark price).** Prix de référence du protocole pour la marge et la liquidation. Composition médiane de mid + oracle + EMA. Voir [prix mark](./mark-prices.md).

**Compte maître (Master account).** Le compte dont l'état est modifié par les actions ; peut être signé par lui-même ou par un agent approuvé. Voir [portefeuilles agents](./agent-wallets.md).

**MFlux Vault.** Pool d'assurance et de market-making opéré par le protocole. Voir [vaults](./vaults.md#mflux-vault).

**MIP — Proposition d'amélioration de marché (Market Improvement Proposal).** Amélioration numérotée du protocole (analogue aux schémas de proposition d'amélioration utilisés par les protocoles perpétuels on-chain établis). Voir [MIP](../mip/).

**msgpack.** Format de sérialisation binaire. Le payload signé d'une action est constitué d'octets msgpack. Voir [signature](../integration/signing.md).

**MTF.** Le jeton du protocole MetaFlux. Utilisé pour le staking, la gouvernance et la combustion de frais.

**Multi-sig.** Exigence de signature M-parmi-N pour un compte. Voir [multi-sig](./multi-sig.md).

## N

**Nonce.** Uint64 strictement monotone par expéditeur, inclus dans chaque action ; protection contre le rejeu. Voir [idempotence](../integration/idempotency.md).

## O

**Oid — Identifiant d'ordre (Order ID).** Uint64 assigné par le serveur ; retourné dans la réponse `Order` et sur `userEvents`/`orderEvents`. Voir [exchange.md](../api/rest/exchange.md).

**Oracle.** Flux de prix externe composé à partir des prix de CEX via TWA. Entrée du prix mark et du financement. Voir [prix mark](./mark-prices.md#the-oracle-c1-anchor).

## P

**PnL.** Profit et perte. Latent (mark-to-market sur position ouverte) ou réalisé (clôturé à l'exécution de sortie).

**Marge de portefeuille (PM) — Portfolio margin.** Modèle de marge multi-actifs basé sur des scénarios ; efficace en capital pour les portefeuilles couverts. Voir [marge de portefeuille](./portfolio-margin.md).

**Indice de prime (Premium index).** EMA de `mid - oracle` ; entrée du financement. Voir [taux de financement](./funding-rates.md).

## R

**Réduction seule (Reduce-only).** Indicateur d'ordre qui rejette l'ordre à l'admission s'il augmenterait la taille de la position. Voir [types d'ordres](./order-types.md#reduce-only).

**RFQ — Demande de cotation (Request for Quote).** Flux de travail de cotation maker pour les volumes qui ne souhaitent pas s'afficher dans le carnet public. Voir [RFQ](./rfq.md).

## S

**Expéditeur (Sender).** L'adresse dont l'état est modifié lors d'une requête `POST /exchange`. Peut être signé par lui-même ou par un agent approuvé.

**Part (vault) — Share.** Unité de participation au vault ; émise au dépôt au `share_price` courant, brûlée au retrait au `share_price` courant. Voir [vaults](./vaults.md).

**Slashing.** Sanction imposée à un validateur pour double-signature ou indisponibilité ; réduit la mise du validateur (et des délégateurs). Voir [staking](./staking.md#slashing).

**STP — Prévention des auto-transactions (Self-Trade Prevention).** Paramètre d'ordre définissant le comportement lorsqu'un nouvel ordre correspondrait à votre propre ordre au repos. Voir [types d'ordres](./order-types.md#self-trade-prevention).

**Strict-Iso.** Mode de marge similaire à la marge isolée, avec la propriété supplémentaire que la position est exclue de tout netting en marge de portefeuille. Voir [modes de marge](./margin-modes.md).

**Sous-compte (Sub-account).** Compte dérivé d'un compte maître ; positions et ordres isolés, partage les dépôts/retraits uniquement avec le compte maître. Voir [sous-comptes](./sub-accounts.md).

## T

**Taker.** Côté d'une exécution qui retire de la liquidité en croisant le carnet.

**Pas de prix (Tick size).** Incrément de prix minimum pour un marché. Les ordres doivent s'y aligner.

**TIF — Durée de validité (Time-In-Force).** Paramètre d'ordre : GTC / IOC / ALO / FOK. Voir [types d'ordres](./order-types.md#time-in-force).

**TPSL — Take-Profit / Stop-Loss.** Regroupement d'ordres déclencheurs pour des accolades protectrices. Voir [types d'ordres](./order-types.md#triggers).

**TVL — Valeur totale bloquée (Total Value Locked).** Somme de la valeur nette d'inventaire du vault sur l'ensemble des déposants.

**TWAP — Prix moyen pondéré dans le temps (Time-Weighted Average Price).** Primitive d'ordre qui découpe un grand ordre sur la durée. Voir [types d'ordres](./order-types.md#twap).

## U

**Univers (Universe).** La liste active des marchés (perpétuels + comptant) sur le protocole. Retournée par les informations `meta`.

**PnL latent (Unrealised PnL).** Profit/perte mark-to-market sur les positions ouvertes. Pas encore réalisé par la clôture.

**USDC.** La devise de cotation pour les marchés MetaFlux ; ponté en entrée/sortie via [MetaBridge](../bridge/).

## V

**Validateur (Validator).** Participant au consensus ; propose des blocs et vote. Perçoit une commission sur les récompenses des délégateurs ; soumis au slashing.

**Vault.** Pool d'USDC sous l'autorité de signature d'un gestionnaire, avec une sémantique de mint/burn de parts. Voir [vaults](./vaults.md).

## W

**Disponible au retrait (Withdrawable).** Solde libre pouvant quitter le compte (non retenu comme marge contre des positions ouvertes, non dans un compartiment isolé, non bloqué dans un vault).

## Y

**Carton jaune (T0) — Yellow card.** Premier palier de liquidation. Les ordres ALO sont annulés ; les positions sont intactes ; le client est notifié. Voir [liquidation par paliers](./tiered-liquidation.md#why-a-yellow-card).
