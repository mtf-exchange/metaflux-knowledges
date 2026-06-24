# MIP-2 — Metaliquidity

:::info
**En cours.** Le vault on-chain est en déploiement ; la stratégie de market-making s'exécute off-chain.
:::

Metaliquidity est le **vault de fournisseurs de liquidité** du protocole/de la communauté MetaFlux — le socle de liquidité native, analogue aux propositions de fourniture de liquidité automatisée présentes sur les plateformes on-chain établies. Les fournisseurs de liquidité déposent des USDC dans le vault et participent au PnL d'une stratégie de market-making qui affiche des cotations dans les carnets d'ordres. Il fournit la liquidité au repos contre laquelle les preneurs négocient, de sorte que les marchés ne dépendent pas exclusivement de teneurs de marché externes dès le premier jour.

## Ce qui est on-chain vs off-chain

Une séparation délibérée maintient la surface de consensus réduite :

- **On-chain — le vault uniquement.** Capital LP mutualisé, comptabilité des parts, VNI
  (valorisée au prix de marché via l'oracle), un verrou de retrait, et une liste blanche
  des adresses de fournisseurs reconnus.
- **Off-chain — la stratégie.** La logique de market-making (cotation, gestion des stocks)
  s'exécute comme un client MTF natif ordinaire : une clé de stratégie whitelistée signe
  des ordres **au nom du compte du vault** et les soumet via le chemin d'ordres signés
  habituel. Aucune logique de stratégie n'est intégrée dans le consensus.

## Pour les fournisseurs de liquidité

- **Déposer** des USDC, sans permission, et recevoir des parts du vault valorisées à la
  VNI actuelle (`cash + valorisation au prix de marché des positions ouvertes du vault`).
- **Retirer** en rachetant des parts à leur valeur de VNI, sous réserve d'un verrou de retrait
  de **7 jours** à compter de votre dépôt le plus récent.
- Vos parts s'apprécient ou se déprécient en fonction du PnL réalisé et non réalisé de
  la stratégie — il existe un risque de marché ; il ne s'agit pas d'une garantie de rendement.

## Liste blanche des fournisseurs

Les adresses de fournisseurs Metaliquidity reconnus constituent une **liste**, initialisée à la
genèse et modifiable par la gouvernance. Seule une adresse whitelistée peut opérer un vault
Metaliquidity et être autorisée à négocier le capital mutualisé ; les dépôts restent ouverts
à tous.

## Statut & historique

Metaliquidity fournit la liquidité native du carnet d'ordres qu'un fournisseur appartenant
au protocole est censé amorcer. Le vault de protocole équivalent à HLP avait initialement
été reporté après le lancement (à la V2) en faveur de teneurs de marché externes ; il a été
avancé car une liquidité au repos native est nécessaire plus tôt que prévu. Le vault
on-chain est en cours de déploiement ; la stratégie off-chain et l'initialisation de la
liste blanche des fournisseurs l'accompagnent.
