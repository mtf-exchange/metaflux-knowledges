# Bridge

:::info
**Statut.** Le bridge de dépôt USDC MetaBridge est **en ligne sur Base Sepolia** (testnet,
`MetaBridgeUSDC` (MetaBridgeAlpha) [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00)),
et un programme de dépôt Solana est en ligne sur **devnet** selon le même modèle. Les deux
directions sont vérifiées de bout en bout sur Base Sepolia : un vrai dépôt
(watcher → cosign → cosignataire auto-enregistré → crédit au quorum ⅔) et un
cycle de retrait complet (cosign L1 → boucle relay → `batchWithdraw` on-chain →
fenêtre de contestation → `claim`). Améliorations de sécurité : `batchWithdraw`/`batchClaim`
à gaz amorti, lots à succès partiel, fenêtre de contestation double temps+blocs,
séparation des clés de validateur hot/cold, rotation de validateurs en deux phases avec veto
**cancel** par un seul validateur hot pendant la fenêtre, et signatures liées au domaine
et à l'époque, fixées octet par octet dans le contrat EVM, le programme Solana et le L1
(vecteurs de réponse connue cross-langage). Le déploiement sur Arbitrum et un audit
pré-mainnet restent à réaliser.
:::

MetaFlux achemine **tous les actifs — USDC inclus — via MetaBridge**, un bridge de dépôt
signé par les validateurs MetaFlux (équivalent HL-Bridge2). Il n'y a **ni bridge tiers,
ni dépendance au Circle CCTP** sur le chemin critique.

## Pourquoi un modèle de dépôt et non le CCTP

Le CCTP ne déplace l'USDC qu'entre les chaînes que Circle a inscrites comme *domaines* CCTP.
MetaFlux est un L1 indépendant ; son ajout en tant que domaine CCTP relève d'une décision
commerciale de Circle sur laquelle nous n'avons aucune prise. Un chemin de dépôt qui dépend
du bon vouloir d'un tiers n'est pas une base solide. MetaFlux exploite donc son propre bridge
de dépôt, sous la **même hypothèse de confiance en l'ensemble des validateurs que la chaîne
elle-même** — sans comité externe, réseau de gardiens ni contrôleur d'accès.

## Modèle

Un **contrat Bridge sur la chaîne source** (Base en premier) conserve les tokens déposés.
Les validateurs MetaFlux observent les dépôts et les créditent sur le L1 ; les retraits
sont libérés par le contrat au moyen d'un ensemble de co-signatures de validateurs pondérées
par le stake, à ⅔, derrière une fenêtre de contestation.

### Dépôt (chaîne source → MetaFlux)

```
Base:
  1. user.approve(USDC, bridge)
  2. bridge.deposit(mtfDest, amount)        // USDC pulled into custody
  3. bridge emits Deposit{user, mtfDest, amount, nonce, …}

MetaFlux:
  4. each validator observes the Deposit event and submits an mbAttest
     (an Inbound MetaBridgeMsg partial co-signature) — validator authority,
     NEVER the public /exchange path
  5. on ⅔ stake-weighted quorum the L1 credits the user's USDC cross-collateral
     (the same system-credit primitive the faucet uses); each deposit credits
     EXACTLY ONCE (idempotent by message id)
```

L'événement `Deposit` est compatible octet pour octet avec le `message_id` déterministe du
L1 : `keccak256(chain ‖ direction ‖ user ‖ asset ‖ amount ‖ dst ‖ nonce)`.

### Retrait (MetaFlux → chaîne source)

```
MetaFlux:
  1. user submits a withdraw action (Outbound MetaBridgeMsg)
  2. validators co-sign it to ⅔ quorum; the L1 retains the signature set in
     meta_bridge.mb_outbox + finalized_cosignatures

Base (two-phase: request → claim):
  3. each validator's RELAY LOOP polls the committed L1 state and submits a
     batchWithdraw(...) tx — signed with the validator's OWN key, gas paid by the
     validator's EVM address (no separate relayer key). The contract recovers
     each entry's signers, sums HOT-set stake, requires ≥⅔, and QUEUES it into
     the dispute window. A bad/raced entry in the batch is skipped (FailedWithdrawal
     event), not reverted.
  4. after BOTH the dispute window (seconds) AND a minimum block count elapse,
     claim(id) / batchClaim(ids) releases USDC to the user. Any single validator
     can dispute(id) a queued withdrawal, or the COLD ⅔-quorum can
     invalidateWithdrawal(id), as an emergency revoke during the window.
```

## Modèle de sécurité

- **Autorité** — Multisig de validateurs MetaFlux pondéré par le stake à ⅔ (secp256k1, les
  mêmes clés qui sécurisent le consensus ; quorum `6700` bps). Le multisig de validateurs et
  la fenêtre de contestation des retraits sont des mécanismes porteurs : compromettre les clés
  du bridge entraîne une perte de fonds ; les contrats font donc l'objet d'une revue au niveau
  consensus/signature ainsi que d'un audit pré-mainnet.
- **Rejeu** — chaque `message_id` n'est honoré qu'une seule fois, indexé sur l'identité
  économique chaîne/nonce-source, de sorte qu'un crédit ne tombe qu'une seule fois, même à
  travers une rotation de l'ensemble des validateurs ; cette règle est appliquée à la fois sur
  le L1 et sur le contrat (`withdrawalSeen` / marqueur de dépense permanent côté Solana). Les
  signatures sont liées au domaine et à l'époque, donc une co-signature ne peut pas être
  rejouée sur un autre déploiement, une autre chaîne ou une autre époque de l'ensemble des
  validateurs.
- **Gouvernance & rotation** — aucun compte administrateur ; chaque opération privilégiée
  nécessite une co-signature de validateur. La rotation de l'ensemble des validateurs est
  en deux phases (requête → finalisation derrière une fenêtre de contestation) ; pendant cette
  fenêtre, n'importe quel **unique** validateur hot peut `pause` (limité par un cooldown
  par validateur) ou **annuler** la rotation en attente, de sorte qu'un quorum de gouvernance
  compromis ne peut pas échanger silencieusement l'ensemble. Sur Solana, le même ensemble
  dispose d'une surface d'urgence `pause`/`dispute` à validateur unique et d'un
  `unpause` / `invalidateWithdrawal` à quorum.
- **Hors `/exchange`** — les crédits de dépôt sont injectés via le chemin système des
  validateurs et sont structurellement inaccessibles depuis la surface publique `/exchange`
  de l'utilisateur, comptabilisés uniquement sur l'ensemble des validateurs actifs.
- **Mise en garde sur la garde** — l'USDC sur MetaFlux est une créance bridgée adossée au
  solde du contrat source, et non un USDC natif Circle sur MetaFlux (même modèle que HL).

## Déploiements

| Réseau | Contrat | Adresse |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` (v3) | [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00) |
| Solana **devnet** | `metabridge-solana` | [`8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi`](https://solscan.io/account/8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi?cluster=devnet) |
| Base / Solana mainnet | — | (pré-audit) |

Conserve en dépôt l'USDC Base Sepolia de Circle (`0x036CbD…f3dCF7e`) ; **ensemble de
validateurs pondéré par le stake à ⅔, aucun administrateur** (toutes les opérations
privilégiées nécessitent une co-signature de validateur), fenêtre de contestation double
300 s + 150 blocs. Signatures séparées par domaine et liées à l'époque.
Les contrats et le guide de déploiement se trouvent dans le dépôt
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) ;
la logique de co-signature / crédit côté L1 reste sur le nœud. Testnet pré-audit —
non destiné à un usage avec des fonds réels.

## Méthodes du contrat

### Base — `MetaBridgeUSDC` (EVM)

| Méthode | Autorisation | Objectif |
|--------|---------------|---------|
| `deposit(mtfDest, amount)` | tout utilisateur (déposant) | Placer l'USDC en dépôt, émettre `Deposit` pour l'attestation par les validateurs |
| `withdraw(...)` / `batchWithdraw(reqs)` | tout relayeur d'un ensemble de co-signatures **HOT ⅔** | Vérifier le quorum et mettre en file d'attente le ou les retraits dans la fenêtre de contestation |
| `claim(mid)` / `batchClaim(mids)` | tout utilisateur | Libérer l'USDC arrivé à maturité après la fenêtre double temps + blocs (non pausable) |
| `dispute(mid)` | n'importe quel validateur **HOT** | Annuler un retrait en file d'attente dans sa fenêtre de contestation |
| `cancelValidatorSetUpdate()` | n'importe quel validateur **HOT** | Opposer son veto à une rotation de l'ensemble des validateurs en attente dans sa fenêtre |
| `pause()` | n'importe quel validateur **HOT** | Geler les nouveaux dépôts et la mise en file d'attente des retraits (cooldown par validateur) |
| `unpause(...)` | **COLD ⅔** | Lever la pause |
| `invalidateWithdrawal(mid, ...)` | **COLD ⅔** | Révoquer un retrait frauduleux en file d'attente non réclamé |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **COLD ⅔** | Déposer une rotation de l'ensemble hot+cold des validateurs en deux phases |
| `finalizeValidatorSetUpdate()` | tout utilisateur (sans permission) | Appliquer la rotation déposée après sa fenêtre de contestation |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **COLD ⅔** | Ajuster la fenêtre de contestation (min/max bornés) |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | Reproduire les octets exacts qu'un validateur co-signe |
| Getters `hot*`/`cold*` | view | Stake, membres, nombre, total, bps de quorum / quantité requise des validateurs |

Tous les appels co-signés prennent `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)` triés par signataire croissant, S faible, `v ∈ {27,28}`.

### Solana — `metabridge-solana`

| Instruction | Autorisation | Objectif |
|-------------|---------------|---------|
| `initialize(params)` | déployeur (unique) | Fixer le mint USDC, l'ensemble des validateurs, le quorum, la fenêtre de contestation double |
| `deposit(mtf_dest, amount)` | déposant (signataire) | Placer l'USDC SPL en dépôt, émettre `DepositEvent` |
| `withdraw(mid, user, amount, dst, nonce, cosigs)` | tout relayeur d'un ensemble de co-signatures **⅔** | Vérifier le quorum + créer le PDA `PendingWithdrawal` (+ marqueur de dépense permanent) |
| `claim(message_id)` | tout utilisateur | Libérer l'USDC en dépôt après la fenêtre double temps + slot |
| `dispute(mid, cosig)` | n'importe quel validateur (1 co-sig) | Annuler un retrait en file d'attente dans sa fenêtre |
| `pause(cosig)` | n'importe quel validateur (1 co-sig) | Geler les dépôts / retraits / finalisation de rotation |
| `unpause(gov_nonce, cosigs)` | co-signature **⅔** | Lever la pause |
| `invalidate_withdrawal(mid, gov_nonce, cosigs)` | co-signature **⅔** | Révoquer un retrait en file d'attente |
| `request_validator_set_update(...)` | co-signature **⅔** | Déposer une rotation de l'ensemble des validateurs |
| `finalize_validator_set_update()` | tout utilisateur (sans permission) | Appliquer la rotation déposée après sa fenêtre |

Solana utilise UN seul ensemble de validateurs (sans séparation hot/cold) et ne dispose pas de points d'entrée `setDisputeWindow` / batch ; l'identifiant de récupération est le `{0,1}` secp256k1 brut (contre `{27,28}` sur EVM). Les deux chaînes rejettent les signatures à S élevé et lient l'identifiant du programme/contrat et l'époque dans chaque digest co-signé.

## Feuille de route

- Vrai watcher de dépôts Base + relayeur de retraits (le cœur L1 déterministe et
  le contrat Base sont terminés ; les observateurs hors chaîne sont câblés et utilisent
  le tag de bloc `finalized` de la chaîne pour se prémunir contre les réorgs).
- Déploiement multi-chaînes : le programme de dépôt Solana est en ligne sur devnet selon
  le même modèle ; Arbitrum est la prochaine étape.
- Audit de sécurité avant tout déploiement en valeur réelle (mainnet).
- Composabilité cross-chain (appel de contrats d'autres chaînes depuis MTF) — V2.

## Voir aussi

- [Réseaux](../networks.md) — points de terminaison et identifiants de chaîne par réseau
