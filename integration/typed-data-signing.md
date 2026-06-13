# Typed-data signing (`sig_scheme: "typed"`)

{% hint style="info" %}
**Status: available.** A subset of `/exchange` actions can be signed as
**structured EIP-712 typed data** (`eth_signTypedData_v4`) instead of the opaque
[default scheme](./signing.md). The default scheme stays fully supported — typed
signing is an **opt-in alternative** for the actions listed below.
{% endhint %}

The [default signing walkthrough](./signing.md) signs the whole `action` object
as a single EIP-712 `string` field (one frozen `MetaFluxTransaction`-free
encoder, the server hashes the raw bytes). That works everywhere but shows the
user an opaque blob in their wallet.

**Typed-data signing** gives a subset of actions a real per-action EIP-712 type,
so a wallet (MetaMask, Rabby, Ledger, WalletConnect) renders each field by name —
`destination`, `amount`, `agentName` — in its signing prompt. Pass
`sig_scheme: "typed"` on the POST to select it.

## When to use it

| | Default scheme | Typed scheme (`sig_scheme: "typed"`) |
|--|----------------|--------------------------------------|
| Wallet prompt | Opaque hash / blob | Each field rendered by name |
| Action coverage | **All** `/exchange` actions | **All wallet-signed actions** (listed below); only orders & cancels stay default-only |
| Primary type | `MetaFluxAction(string action,uint64 nonce)` (one, frozen) | `MetaFluxTransaction:<Action>` (one per action) |
| What is hashed | The raw `action` JSON bytes | The structured fields (atomic EIP-712 encoding) |
| Opt-in | default (absent / `"legacy"`) | set `sig_scheme: "typed"` |

Use typed signing when you want users to **see what they sign** in a standard
wallet — transfers, withdrawals, agent approvals, and account/staking/vault/
spot-margin/earn/bridge settings. Every wallet-signed `/exchange` action can be
typed-signed. Only **orders and cancels** stay default-scheme only — keep the
[default scheme](./signing.md) for those.

## Wire shape

The POST envelope is the same as the default path, with one extra field:

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* the action fields */ }
  },
  "sig_scheme": "typed"
}
```

| Field | Meaning |
|-------|---------|
| `sig_scheme: "typed"` | Selects the structured path. **Absent** or `"legacy"` keeps the [default opaque scheme](./signing.md). |
| `nonce` | The single envelope `nonce` is **also** the `nonce` field inside the signed typed struct — they must match. |
| `action.type` | `snake_case` action tag, exactly as on the default path. |
| `action.params` | The action fields. Must carry the **same values** (and the same canonical decimal strings) you hashed. |

The server reconstructs the typed struct from `action.type` + `action.params`,
recomputes the EIP-712 digest, recovers the signer, and authorizes it exactly
like the default path (signer is the account, or an approved
[agent](../concepts/agent-wallets.md) of it).

## EIP-712 domain

Identical to the default scheme — one domain per network, cache it:

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

Every typed message also carries a **`metafluxChain`** string as its first field.
It is a human-readable tag of the same chain id, and it is part of the signed
struct:

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| any other | `"Devnet"` |

Query the node's chain id from [`/info` `node_info`](../api/rest/info.md#node_info)
(`data.chain_id`) and use the matching tag. A `metafluxChain` or `chainId` that
doesn't match the node recovers a different signer and the request is rejected.

## Encoding rules (atomic EIP-712)

Standard EIP-712 `hashStruct`:

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` is each field, in declared order, encoded to one 32-byte word:

| Field type | Encoding |
|------------|----------|
| `address` | 20 bytes, right-aligned (12 zero bytes on the left). |
| `uintN` | big-endian, zero-left-padded to 32 bytes. |
| `bool` | `uint8` `0` / `1`, zero-padded to 32 bytes. |
| `string` | `keccak256(utf8_bytes)`. |
| `bytes` | `keccak256(raw_bytes)`. |
| `T[]` (e.g. `address[]`) | `keccak256(` concat of each element's 32-byte word `)`. |

Sign the 32-byte `digest` with secp256k1 and serialize the signature as
`r ‖ s ‖ v` (65 bytes). Both legacy `v ∈ {27, 28}` and `v ∈ {0, 1}` are accepted.

### Decimals are canonical strings — hash then parse

Any amount / quantity field is an EIP-712 **`string`** carrying the canonical
decimal text (`"1500.5"`, `"750.25"`). The server hashes the **verbatim string**
and *then* parses it to a number — so the exact characters matter:

{% hint style="warning" %}
**`"1.0"` and `"1.00"` hash differently** even though they are the same number.
Pick **one** canonical form per amount and send the **identical** string in
`action.params` that you put in the typed message you signed. A mismatch
(trailing zero, missing decimal point, scientific notation) recovers a different
signer and is rejected.
{% endhint %}

This is why typed signing carries decimals as strings rather than scaled
integers: the wallet prompt shows a human-readable amount, and the hash-then-parse
rule keeps the signed bytes unambiguous.

## The typed-signable actions

Every wallet-signed `/exchange` action is typed-signable (only orders and cancels
stay default-scheme only). For each action the **primary type** is
`MetaFluxTransaction:<Action>` and the `encodeType` string is given below (the
field order is the message field order). `action.type` is the `snake_case` tag you
put on the POST.

### Transfers

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

### Account, staking, vault & Metaliquidity

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

Notes on specific fields:

- `claim_rewards`: `validator` = the zero address means **claim across all
  delegations**.
- `create_vault`: `kind` is `0` = User, `1` = Metaliquidity.

### Margin

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` and `amount` are canonical decimal strings (hash-then-parse).

### Staking

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` is a canonical decimal string. `isUndelegate` = `true` undelegates,
`false` delegates.

### Vault

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` deposits, `false` withdraws; `amount` is a
canonical decimal string. `vault_withdraw.shares` is a canonical decimal string.

### Spot margin

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` and `borrow` are canonical decimal strings; `size` and `limitPx` are
integers.

### Earn

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` and `shares` are canonical decimal strings.

### Agent abstraction & bridge

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

Notes on specific fields:

- `agent_set_abstraction`: `value` is an EIP-712 **`string`** — sign the verbatim
  string (it is not a number; hashed as `keccak256(utf8)`).
- `mb_withdraw`: the typed `chain` field is a **`uint8`** — `0` = Solana, `1` =
  Base, `2` = Arbitrum. But the POST `action.params.chain` is the **string name**
  (`"Solana"` / `"Base"` / `"Arbitrum"`), exactly as on the default path. So sign
  the `uint8` in the typed message and send the string name in `params`.
- `mb_withdraw`: `amount` is a `uint64` **integer** (not a decimal string);
  `dstAddr` is the destination-chain address string.

### Fields that are *not* in the typed digest

Two actions accept extra `params` keys on the default path that the typed type
string does **not** cover, so under `sig_scheme: "typed"` the server forces them
to default:

- `approve_agent` — the typed `ApproveAgent` type has **no `expires_at_ms`**.
  Typed `approve_agent` is therefore **no-expiry**. **Omit** `expires_at_ms`.
- `create_vault` — the typed `CreateVault` type has **no `parent`**. Typed
  `create_vault` is therefore **top-level** (no parent). **Omit** `parent`.

If you need an agent expiry or a parented vault, use the
[default scheme](./signing.md) for that one action.

## Worked example — `send_asset` (a transfer)

A transfer of `"750.25"` of asset `2` from spot DEX `0` to perp DEX `1`, into the
perp wallet, on **Testnet** (`chainId = 114514`).

The object you hand to `eth_signTypedData_v4`:

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
// MetaMask / EIP-1193 provider
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 28,                       // MUST equal message.nonce
    action: {
      type: 'send_asset',
      params: {
        source_dex:      0,
        destination_dex: 1,
        asset:           2,
        destination:     '0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c',
        amount:          '750.25',   // SAME canonical string you signed
        to_perp:         true,
      },
    },
    sig_scheme: 'typed',
  }),
});
```

## Worked example — `approve_agent` (an account action)

Approve an agent named `"trading-bot"` on **Testnet** (`chainId = 114514`).
Remember: typed `approve_agent` is no-expiry — there is no `expires_at_ms`.

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
        // no expires_at_ms — typed approve_agent is no-expiry
      },
    },
    sig_scheme: 'typed',
  }),
});
```

See [agent wallets](../concepts/agent-wallets.md) for the approval lifecycle (an
approval becomes effective one block after commit).

## Verifying your encoding

Before submitting, recover the signer locally against your own assembled digest
and confirm it matches the expected address — if it doesn't, the bug is in your
typed-data assembly, not the chain. The atomic encoding above is the full
specification; a cross-implementation known-answer test pins each action's digest
byte-for-byte, so any compliant `eth_signTypedData_v4` implementation reproduces
the same result.

## Orders and cancels

Every wallet-signed `/exchange` action above is typed-signable. The **only**
actions that stay on the [default scheme](./signing.md) are **orders and
cancels** — posting them with `sig_scheme: "typed"` returns an unsupported-scheme
error, so sign them with the default opaque envelope.

## See also

- [Signing walkthrough](./signing.md) — the default opaque scheme (all actions)
- [`POST /exchange`](../api/rest/exchange.md) — the endpoint and full action catalog
- [Agent wallets](../concepts/agent-wallets.md) — approval lifecycle
- [Networks](../networks.md) — `chainId` per network
