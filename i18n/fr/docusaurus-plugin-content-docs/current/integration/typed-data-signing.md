# Signature de données typées

:::info
**Statut : c'est le schéma de signature en vigueur.** Chaque action `/exchange` est signée en tant que **données typées structurées EIP-712** (`eth_signTypedData_v4`). Il n'existe pas de schéma alternatif ou hérité à choisir — un portefeuille (MetaMask, Rabby, Ledger, WalletConnect) affiche chaque champ de l'action par son nom dans l'invite de signature.
:::

Chaque action possède un type EIP-712 réel propre à cette action, de sorte que le portefeuille montre à l'utilisateur les champs réels qu'il signe — `destination`, `amount`, `agentName` — plutôt qu'un bloc opaque. Le serveur reconstruit la structure typée à partir de `action.type` + `action.params`, recalcule le condensé, et récupère le signataire.

## Fonctionnement

| | Données typées |
|--|----------------|
| Invite du portefeuille | Chaque champ affiché par son nom |
| Type primaire | `MetaFluxTransaction:<Action>` (un par action) |
| Ce qui est haché | Les champs structurés (encodage atomique EIP-712) |

Les utilisateurs **voient ce qu'ils signent** dans un portefeuille standard — les transferts, les retraits, les approbations d'agents, ainsi que les paramètres de compte, de staking, de coffre, de marge au comptant, d'épargne et de pont portent tous des champs nommés.

## Format sur le fil

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* les champs de l'action */ }
  }
}
```

| Champ | Signification |
|-------|--------------|
| `nonce` | Le `nonce` unique de l'enveloppe est **également** le champ `nonce` à l'intérieur de la structure typée signée — ils doivent correspondre. |
| `action.type` | Étiquette d'action en `snake_case`. |
| `action.params` | Les champs de l'action. Doivent porter les **mêmes valeurs** (et les mêmes chaînes décimales canoniques) que celles que vous avez hachées. |

Le serveur reconstruit la structure typée à partir de `action.type` + `action.params`, recalcule le condensé EIP-712, récupère le signataire, et l'autorise (le signataire est le compte, ou un [agent](../concepts/agent-wallets.md) approuvé par ce compte).

:::info
**`sig_scheme` est vestigial.** Les versions antérieures incluaient un sélecteur `sig_scheme` sur l'enveloppe. Il n'est plus requis et le serveur l'ignore — la récupération par données typées s'exécute de manière inconditionnelle. **Omettez-le.** Si vous l'envoyez quand même, la seule valeur acceptée est `"typed"`.
:::

## Domaine EIP-712

Un domaine par réseau, à mettre en cache :

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

Chaque message typé porte également une chaîne **`metafluxChain`** comme premier champ. Il s'agit d'une étiquette lisible par l'humain du même identifiant de chaîne, et elle fait partie de la structure signée :

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| tout autre | `"Devnet"` |

Interrogez l'identifiant de chaîne du nœud via [`/info` `node_info`](../api/rest/info.md#node_info)
(`data.chain_id`) et utilisez l'étiquette correspondante. Un `metafluxChain` ou `chainId` qui ne correspond pas au nœud récupère un signataire différent et la requête est rejetée.

## Règles d'encodage (EIP-712 atomique)

`hashStruct` EIP-712 standard :

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` correspond à chaque champ, dans l'ordre déclaré, encodé en un mot de 32 octets :

| Type de champ | Encodage |
|---------------|---------|
| `address` | 20 octets, alignés à droite (12 octets zéro à gauche). |
| `uintN` | Big-endian, complété à gauche par des zéros jusqu'à 32 octets. |
| `bool` | `uint8` `0` / `1`, complété par des zéros jusqu'à 32 octets. |
| `string` | `keccak256(utf8_bytes)`. |
| `bytes` | `keccak256(raw_bytes)`. |
| `T[]` (ex. `address[]`) | `keccak256(` concaténation du mot de 32 octets de chaque élément `)`. |

Signez le `digest` de 32 octets avec secp256k1 et sérialisez la signature sous la forme `r ‖ s ‖ v` (65 octets). Les formats `v ∈ {27, 28}` (hérité) et `v ∈ {0, 1}` sont tous deux acceptés.

### Les décimales sont des chaînes canoniques — hacher puis analyser

Tout champ de montant ou de quantité est un **`string`** EIP-712 contenant le texte décimal canonique (`"1500.5"`, `"750.25"`). Le serveur hache la **chaîne verbatim** et *ensuite* l'analyse en nombre — les caractères exacts ont donc leur importance :

:::warning
**`"1.0"` et `"1.00"` ont des hachages différents** même s'ils représentent le même nombre. Choisissez **une** forme canonique par montant et envoyez la chaîne **identique** dans `action.params` à celle que vous avez placée dans le message typé que vous avez signé. Toute discordance (zéro de fin, point décimal manquant, notation scientifique) récupère un signataire différent et est rejetée.
:::

C'est pourquoi la signature typée transporte les décimales sous forme de chaînes plutôt que d'entiers mis à l'échelle : l'invite du portefeuille affiche un montant lisible par l'humain, et la règle hacher-puis-analyser garantit que les octets signés restent sans ambiguïté.

## Chaînes de type d'action

Pour chaque action, le **type primaire** est `MetaFluxTransaction:<Action>` et la chaîne `encodeType` est donnée ci-dessous (l'ordre des champs correspond à l'ordre des champs du message). `action.type` est l'étiquette en `snake_case` placée sur le POST.

### Transferts

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

### Compte, staking, coffre et Metaliquidity

| `action.type` | `encodeType` |
|---------------|--------------|
| `approve_agent` | `MetaFluxTransaction:ApproveAgent(string metafluxChain,address agentAddress,string agentName,uint64 nonce)` |
| `set_referrer` | `MetaFluxTransaction:SetReferrer(string metafluxChain,address referrer,uint64 nonce)` |
| `approve_builder_fee` | `MetaFluxTransaction:ApproveBuilderFee(string metafluxChain,address builder,uint16 maxFeeBps,uint64 nonce)` |
| `set_display_name` | `MetaFluxTransaction:SetDisplayName(string metafluxChain,string displayName,uint64 nonce)` |
| `set_position_mode` | `MetaFluxTransaction:SetPositionMode(string metafluxChain,bool hedge,uint64 nonce)` |
| `user_portfolio_margin` | `MetaFluxTransaction:UserPortfolioMargin(string metafluxChain,bool enroll,uint64 nonce)` |
| `convert_to_multi_sig_user` | `MetaFluxTransaction:ConvertToMultiSigUser(string metafluxChain,address[] signers,uint32 threshold,uint64 nonce)` |
| `update_leverage` | `MetaFluxTransaction:UpdateLeverage(string metafluxChain,uint32 asset,uint32 leverage,bool isIsolated,uint64 nonce)` |
| `claim_rewards` | `MetaFluxTransaction:ClaimRewards(string metafluxChain,address validator,uint64 nonce)` |
| `link_staking_user` | `MetaFluxTransaction:LinkStakingUser(string metafluxChain,address target,uint64 nonce)` |
| `create_vault` | `MetaFluxTransaction:CreateVault(string metafluxChain,string name,uint64 lockPeriodSecs,uint8 kind,uint64 nonce)` |
| `vault_modify` | `MetaFluxTransaction:VaultModify(string metafluxChain,uint64 vaultId,string newName,uint64 nonce)` |
| `spot_margin_close` | `MetaFluxTransaction:SpotMarginClose(string metafluxChain,uint32 pair,uint64 limitPx,uint64 nonce)` |
| `REDACTED` | `MetaFluxTransaction:REDACTED(string metafluxChain,address account,bool allowed,uint64 nonce)` |
| `REDACTED` | `MetaFluxTransaction:REDACTED(string metafluxChain,uint64 vaultId,address operator,bool allowed,uint64 expiresAtMs,uint64 nonce)` |

Remarques sur des champs spécifiques :

- `claim_rewards` : `validator` = l'adresse zéro signifie **réclamer sur toutes les délégations**.
- `create_vault` : `kind` vaut `0` = Utilisateur, `1` = Metaliquidity.

### Marge

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` et `amount` sont des chaînes décimales canoniques (hacher-puis-analyser).

### Staking

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` est une chaîne décimale canonique. `isUndelegate` = `true` retire la délégation, `false` délègue.

### Coffre

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` effectue un dépôt, `false` un retrait ; `amount` est une chaîne décimale canonique. `vault_withdraw.shares` est une chaîne décimale canonique.

### Marge au comptant

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` et `borrow` sont des chaînes décimales canoniques ; `size` et `limitPx` sont des entiers.

### Épargne

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` et `shares` sont des chaînes décimales canoniques.

### Abstraction d'agent et pont

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

Remarques sur des champs spécifiques :

- `agent_set_abstraction` : `value` est un **`string`** EIP-712 — signez la chaîne verbatim (ce n'est pas un nombre ; hachée en tant que `keccak256(utf8)`).
- `mb_withdraw` : le champ typé `chain` est un **`uint8`** — `0` = Solana, `1` = Base, `2` = Arbitrum. Mais le `action.params.chain` du POST est le **nom sous forme de chaîne** (`"Solana"` / `"Base"` / `"Arbitrum"`). Signez donc le `uint8` dans le message typé et envoyez le nom en chaîne dans `params`.
- `mb_withdraw` : `amount` est un **entier** `uint64` (pas une chaîne décimale) ; `dstAddr` est la chaîne d'adresse de destination sur la chaîne cible.

### Champs qui ne font *pas* partie du condensé typé

Deux actions ont des clés `params` que la chaîne de type typée ne couvre **pas**, et le serveur les force à leur valeur par défaut :

- `approve_agent` — le type `ApproveAgent` n'a **pas de `expires_at_ms`**, donc `approve_agent` est **sans expiration**. **Omettez** `expires_at_ms`.
- `create_vault` — le type `CreateVault` n'a **pas de `parent`**, donc `create_vault` est **de niveau supérieur** (sans parent). **Omettez** `parent`.

## Exemple concret — `send_asset` (un transfert)

Un transfert de `"750.25"` de l'actif `2` depuis le DEX spot `0` vers le DEX perp `1`, dans le portefeuille perp, sur **Testnet** (`chainId = 114514`).

L'objet à passer à `eth_signTypedData_v4` :

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "chainId",           "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "MetaFluxTransaction:SendAsset": [
      { "name": "metafluxChain",  "type": "string"  },
      { "name": "sourceDex",      "type": "uint32"  },
      { "name": "destinationDex", "type": "uint32"  },
      { "name": "asset",          "type": "uint32"  },
      { "name": "destination",    "type": "address" },
      { "name": "amount",         "type": "string"  },
      { "name": "toPerp",         "type": "bool"    },
      { "name": "nonce",          "type": "uint64"  }
    ]
  },
  "primaryType": "MetaFluxTransaction:SendAsset",
  "domain": {
    "name": "MetaFlux",
    "version": "1",
    "chainId": 114514,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "message": {
    "metafluxChain":  "Testnet",
    "sourceDex":      0,
    "destinationDex": 1,
    "asset":          2,
    "destination":    "0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c",
    "amount":         "750.25",
    "toPerp":         true,
    "nonce":          28
  }
}
```

```javascript
// MetaMask / fournisseur EIP-1193
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 28,                       // DOIT être égal à message.nonce
    action: {
      type: 'send_asset',
      params: {
        source_dex:      0,
        destination_dex: 1,
        asset:           2,
        destination:     '0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c',
        amount:          '750.25',   // MÊME chaîne canonique que celle signée
        to_perp:         true,
      },
    },
  }),
});
```

## Exemple concret — `approve_agent` (une action de compte)

Approuver un agent nommé `"trading-bot"` sur **Testnet** (`chainId = 114514`). Rappel : le type `approve_agent` est sans expiration — il n'y a pas de `expires_at_ms`.

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "chainId",           "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "MetaFluxTransaction:ApproveAgent": [
      { "name": "metafluxChain", "type": "string"  },
      { "name": "agentAddress",  "type": "address" },
      { "name": "agentName",     "type": "string"  },
      { "name": "nonce",         "type": "uint64"  }
    ]
  },
  "primaryType": "MetaFluxTransaction:ApproveAgent",
  "domain": {
    "name": "MetaFlux",
    "version": "1",
    "chainId": 114514,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "message": {
    "metafluxChain": "Testnet",
    "agentAddress":  "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    "agentName":     "trading-bot",
    "nonce":         1
  }
}
```

```javascript
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 1,
    action: {
      type: 'approve_agent',
      params: {
        agent: '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
        name:  'trading-bot',
        // pas de expires_at_ms — approve_agent est sans expiration
      },
    },
  }),
});
```

Consultez les [portefeuilles agents](../concepts/agent-wallets.md) pour le cycle de vie des approbations (une approbation prend effet un bloc après la validation).

## Vérifier votre encodage

Avant de soumettre, récupérez le signataire localement à partir de votre propre condensé assemblé et confirmez qu'il correspond à l'adresse attendue — si ce n'est pas le cas, le bogue se trouve dans votre assemblage de données typées, pas dans la chaîne. L'encodage atomique décrit ci-dessus constitue la spécification complète ; un test de réponse connue entre implémentations fixe le condensé de chaque action octet par octet, de sorte que toute implémentation conforme de `eth_signTypedData_v4` reproduit le même résultat.

## Ordres et annulations

Les ordres et annulations (`submit_order`, `batch_order`, `cancel_order`, `batch_cancel`) sont soumis via la même enveloppe `/exchange` et signés de la même manière par données typées EIP-712. Les structures du corps d'action se trouvent dans le [catalogue d'actions `POST /exchange`](../api/rest/exchange.md#action-catalog).

## Voir aussi

- [`POST /exchange`](../api/rest/exchange.md) — le point de terminaison et le catalogue d'actions complet
- [Portefeuilles agents](../concepts/agent-wallets.md) — cycle de vie des approbations
- [Réseaux](../networks.md) — `chainId` par réseau
