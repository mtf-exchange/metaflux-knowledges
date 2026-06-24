# MIP-1 — Standard de token spot + déploiement de marché

:::info
**Implémenté.** Livré sous la famille d'actions `spotDeploy` ; voir la note sur la numérotation ci-dessous.
:::

MIP-1 est le standard natif de token spot de MetaFlux ainsi que le mécanisme permettant de déployer un
marché spot pour un token via une enchère de gaz on-chain. Il est le pendant spot du déploiement
**perp** sans permission de [MIP-3](./mip-3.md) — sur les plateformes on-chain établies, la primitive
analogue pour le spot fait l'objet d'une proposition distincte de celle pour les perps, et MetaFlux
reproduit cette séparation.

## Pourquoi ce mécanisme existe

L'inscription d'un token sur le marché spot, tout comme celle d'un perp, relève du protocole et non
d'une décision d'équipe curatée. Toute personne peut enregistrer un symbole de token et ouvrir un
marché spot en remportant l'enchère de gaz correspondante et en fournissant les paramètres de démarrage
— aucune liste d'autorisation, aucun comité de révision.

## Déroulement

Le déploiement spot correspond à l'action `spotDeploy`, dispatchée via un sous-variant `SpotDeployKind`
qui couvre l'intégralité du cycle de vie d'une paire :

1. **`RegisterToken`** — enregistre un nouveau token spot ; alloue un `AssetId`.
2. **`SetPair`** — enregistre une paire de trading `(base, quote)` (ex. `(BTC, USDC)`) ;
   alloue l'`AssetId` de la paire.
3. **`SetFee`** — définit le niveau de frais par paire.
4. **`ActivatePair`** — active la paire (ouvre les échanges).
5. **`DeactivatePair`** — désactive la paire (ferme les nouveaux ordres).

L'obtention d'un créneau de déploiement passe par l'enchère de gaz partagée : un constructeur appelle
**`submitGasAuctionBid`** sur le flux `register_token_gas_auction` (pour réclamer un symbole de token)
ou sur le flux `spot_pair_deploy_gas_auction` (pour déployer une paire). Chaque offre séquestre un
montant en USDC (remboursé en cas de perte, déduction faite d'un petit frais) et transporte les
spécifications du marché. Les paramètres d'enchère (décroissance, fenêtre de remboursement, intervalle
de créneau) sont configurables par la gouvernance et partagés avec le mécanisme MIP-3.

## Note sur la numérotation

Dans l'implémentation actuelle, les actions `spotDeploy` résident dans le même module que les actions
`perpDeploy` et étaient historiquement étiquetées « MIP-3 ». Conformément au
[registre MIP](./index.md), le déploiement spot est correctement **MIP-1** et le déploiement perp est
**MIP-3** (reflétant la séparation spot/perp des plateformes établies).
Le comportement est inchangé ; seule l'étiquette est réalignée.
