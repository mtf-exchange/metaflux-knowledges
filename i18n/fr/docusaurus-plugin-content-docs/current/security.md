# Modèle de sécurité

:::tip
**Stable.**
:::

Ce que le protocole garantit, ce qu'il ne garantit pas, et où vous portez le risque.

## Résumé

- Le protocole garantit : une sémantique de machine à états déterministe, une autorisation liée à la signature et une auditabilité on-chain de chaque action.
- Le protocole NE garantit PAS : l'exactitude de l'oracle au-delà de la composition publiée, la conservation de votre clé privée, ni l'absence de risque de gouvernance.
- Des programmes de bug bounty sont hébergés sur des plateformes tierces ; une divulgation coordonnée est attendue.

## Surface de confiance

### Ce que le protocole prend en charge

| Couche | Garantie du protocole |
|--------|-----------------------|
| Consensus | Accord M-sur-N entre validateurs ; transitions d'état déterministes ; blocs signés |
| Machine à états | Exécution identique sur tous les validateurs ; temps déterministe ; arithmétique entière uniquement |
| Récupération de signature | EIP-712 sur msgpack ; récupération secp256k1 ; table d'approbation des agents |
| Prix mark | Formule de composition + bande de cohérence telle que documentée dans [les prix mark](./concepts/mark-prices.md) |
| Liquidation | L'échelle graduée se déclenche de façon déterministe sur l'état validé |
| Calcul des frais | Barème par palier + ratio de destruction appliqués identiquement à chaque exécution |

Un nœud qui ne respecte pas ces règles n'est pas un validateur valide ; le consensus le rejette.

### Ce que l'utilisateur prend en charge

| Couche | Responsabilité de l'utilisateur |
|--------|---------------------------------|
| Conservation de la clé privée | Stockage à froid pour la clé maîtresse ; stockage chaud pour les agents ; hygiène de rotation |
| Logique de bot hors-chaîne | Quels ordres placer, quand recharger la marge, quand déboucler |
| Gestion du risque | Dimensionnement des positions par rapport au bucket / aux fonds propres |
| Risque de contrepartie du bridge | Choix du portefeuille sur la chaîne source et de la route de bridge |

### Où la confiance est partagée

| Couche | Hypothèse de confiance |
|--------|------------------------|
| Composition de l'oracle | Faire confiance à l'oracle publié par les validateurs dans le cadre de la composition documentée |
| MetaBridge | Faire confiance à la co-signature pondérée par la mise (⅔) du jeu de validateurs MetaFlux sur TOUS les transferts de bridge — USDC inclus — derrière une fenêtre de contestation de retrait (mêmes clés que le consensus ; pas de service d'attestation tiers ; voir [bridge](./bridge/)) |
| Gouvernance | Les modifications de paramètres sont contrôlées par la gouvernance ; faire confiance à la gouvernance pour agir dans l'intérêt du protocole |

Le principe : la confiance est minimisée, non éliminée. Là où une confiance partagée est inévitable (oracles, services d'attestation), la surface de confiance est documentée et délimitée.

## Modèle de menace

### Hors du périmètre du protocole

- Un utilisateur signe un ordre qu'il regrette.
- La clé chaude d'un utilisateur est volée et le voleur signe des transactions (c'est pourquoi les agents n'ont pas l'autorité de retrait).
- Un utilisateur ne recharge pas sa marge et se fait liquider selon l'échelle graduée documentée.
- Un utilisateur accepte un prix de cotation RFQ défavorable.
- Un utilisateur dépose dans un vault qui perd de l'argent.
- Un paramètre défini par la gouvernance change dans ses limites et affecte la position d'un utilisateur.

Ce ne sont pas des problèmes de sécurité. Il s'agit de risques opérationnels que les utilisateurs assument.

### Dans le périmètre (à signaler)

- Falsification de signature / acceptation de signatures invalides.
- Exécution non déterministe de la machine à états (deux validateurs ne s'accordent pas sur l'état validé).
- Rejeu de signatures valides d'un réseau à l'autre (contournement de l'isolation du domaine chainId).
- Élévation de privilèges (un agent obtient l'autorité de retrait ; un non-maître déclenche une action réservée au maître).
- Perte de fonds en dehors des mécanismes documentés de liquidation / ADL / frais.
- Failles d'intégration du bridge (co-signature MetaBridge / vérification du quorum ⅔, rejeu d'identifiant de message, contournement de la fenêtre de contestation).
- Contournement de l'authentification WS (abonnement à des canaux privés sans authentification).
- DoS empêchant l'admission d'actions valides dans les limites de débit documentées.
- Invariants documentés non respectés (ex. : contournement de la monotonicité des nonces).

## Politique de divulgation

Pour les vulnérabilités de sécurité :

1. **Ne pas** ouvrir un ticket public sur GitHub.
2. Envoyer un e-mail à `security@mtf.exchange` (clé PGP disponible sur le site web avant le lancement) avec :
   - Une description de la vulnérabilité
   - Les étapes de reproduction
   - Votre évaluation de l'impact
   - Vos coordonnées pour le suivi
3. Attendre une réponse sous 48 heures accusant réception.
4. Calendrier de divulgation coordonnée : 90 jours après l'accusé de réception, ou plus tôt si le correctif est déployé.

Un programme de bug bounty avec des récompenses par palier est hébergé sur une plateforme tierce ; les détails seront publiés avant le lancement.

## Auditabilité on-chain

Chaque action est inscrite en permanence on-chain. Les outils d'analyse forensique permettent de reconstituer :

- L'historique complet des actions par adresse (signataire, action_hash, bloc de validation).
- L'historique complet des liquidations (compte, palier, prix mark, perte réalisée).
- Le cycle de vie des approbations d'agents (maître, agent, événements d'approbation / expiration / ré-approbation).
- La trajectoire de la valeur liquidative (NAV) du vault et la table des déposants.

Les explorateurs exposent ces données ; les indexeurs les fournissent sous forme requêtable.

## Exécution déterministe

La machine à états est une fonction pure :

```
state_{t+1} = apply(state_t, ordered_actions_in_block)
```

Les validateurs qui ne s'accordent pas sur `state_{t+1}` sont non-conformes. Les sources de non-déterminisme (virgule flottante, itération sur des maps non ordonnées, heure système) sont interdites dans le chemin de consensus. Les audits ciblent explicitement cette propriété.

Si votre bot calcule une valeur d'état future (ex. : marge PM attendue après un ordre), il peut l'obtenir de façon identique à ce que la chaîne calculerait, à partir des mêmes entrées. La spécification du protocole de communication contient tout ce dont vous avez besoin.

## Recommandations de sécurité opérationnelle

Pour les utilisateurs institutionnels / en production :

| Recommandation | Pourquoi |
|----------------|----------|
| Multi-sig sur le compte maître | La compromission d'une clé unique = point de défaillance unique |
| Un agent par hôte / stratégie | Le rayon d'impact d'une compromission reste limité |
| Expiration courte des agents (≤ 30 j) | Rotation forcée à intervalles réguliers |
| HSM / portefeuille matériel pour le maître et le sous-compte maître | Surface de signature à froid |
| Limiter le débit sortant de votre bot | Éviter que des boucles incontrôlées n'épuisent le budget par compte |
| Maintenir un agent de surveillance du risque distinct | Rechargements de marge indépendants de la logique de trading |
| Exécuter des nœuds redondants pour les flux WS | Résilience en cas de latence / reconnexion |
| S'abonner aux alertes de statut | Les incidents côté opérateur affectent votre latence / disponibilité |
| Auditer la réconciliation action_hash → validation | Détecter les suppressions silencieuses |
| Tester les migrations de changements majeurs sur testnet 60 jours à l'avance | Éviter les mauvaises surprises le jour du déploiement en production |

## Que faire en cas de défaillance de la chaîne

Les arrêts de consensus (ex. : partition empêchant le quorum) sont rares en pratique mais possibles. Pendant un arrêt :

- `/info` continue de servir depuis le dernier état validé.
- `/exchange` répond avec `503 chain_unavailable`.
- WS reste en keep-alive ; aucune nouvelle diffusion jusqu'à la reprise.
- Les liquidations s'arrêtent — le prix mark reste à la dernière valeur ; aucune transition de palier pendant l'arrêt.

À la reprise, la chaîne rejoue depuis le dernier bloc validé. Aucun état n'est perdu. Le temps avance selon l'heure de bloc dérivée du consensus, non l'horloge murale ; les paiements de financement s'accumulent et s'exécutent à la reprise.

Si un nœud détecte un arrêt du consensus, basculez vers un autre nœud / passerelle (le jeu de validateurs est distribué). La conception du protocole suppose qu'au moins ⅔ des validateurs sont honnêtes et en ligne ; les arrêts transitoires inférieurs au seuil de défaillance de ce quorum sont prévisibles.

## Voir aussi

- [Bridge](./bridge/) — surface de confiance de la garde MetaBridge
- [Versionnage](./versioning.md) — politique de gestion des changements
- [Réseaux](./networks.md) — points de terminaison opérationnels
- [Multi-sig](./concepts/multi-sig.md) — garde institutionnelle

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Le consensus est-il formellement vérifié ?**
R : Le modèle de consensus est formellement spécifié ; la vérification formelle (TLA+ / Stateright) couvre les invariants de sûreté et de vivacité. L'implémentation en production est auditée par rapport à la spécification.

**Q : Les oracles sont-ils soumis à des pénalités (slashing) ?**
R : Les données d'oracle sont signées par le jeu de validateurs. Un validateur publiant des données d'oracle manifestement erronées (hors des bandes de cohérence de façon répétée) est passible de pénalités (slashing) selon les règles de [staking](./concepts/staking.md).

**Q : Quelle est la perte maximale pour un utilisateur en cas de bug connu du protocole ?**
R : Cela dépend du bug. L'architecture limite le rayon d'impact — isolation des sous-comptes, blocage des retraits par les agents, plafonds par corridor sur le bridge, pool d'assurance — mais un bug profond dans la machine à états pourrait en principe vider des comptes. C'est pourquoi la divulgation est essentielle et les audits sont continus.

**Q : Le protocole peut-il annuler un état (rollback) ?**
R : Pas unilatéralement. Un rollback nécessite une décision coordonnée du jeu de validateurs et est traité comme un hard fork. La politique standard : ne jamais effectuer de rollback pour des pertes individuelles d'utilisateurs ; rollback uniquement pour des bugs affectant l'ensemble du protocole qui compromettent la correction du consensus. Le seuil exact relève de la gouvernance.

</details>
