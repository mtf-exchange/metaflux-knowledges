# Typed-data signing

Every `/exchange` action is signed as structured EIP-712 typed data (`eth_signTypedData_v4`).

:::info
**Status: this is the signing scheme.** There is no alternate or legacy scheme to choose. A wallet (MetaMask, Rabby, Ledger, WalletConnect) shows each action field by name in its signing prompt.
:::

Each action has its own EIP-712 type. The wallet shows the user the real fields they sign, such as `destination`, `amount` and `agentName`, and not an opaque blob. The server builds the typed struct from `action.type` and `action.params`, recomputes the digest and recovers the signer.

## How it works {#how-it-works}

| | Typed data |
|--|------------|
| Wallet prompt | Each field rendered by name |
| Primary type | `MetaFluxTransaction:<Action>` (one per action) |
| What is hashed | The structured fields (atomic EIP-712 encoding) |

A standard wallet shows the user what they sign. Transfers, withdrawals, agent approvals, and account, staking, vault, spot-margin, earn and bridge settings all carry named fields.

## Wire shape {#wire-shape}

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* the action fields */ }
  }
}
```

| Field | Meaning |
|-------|---------|
| `nonce` | The envelope `nonce` is also the `nonce` field in the signed typed struct. The two values must match. |
| `action.type` | `snake_case` action tag. |
| `action.params` | The action fields. They carry the same values, and the same canonical decimal strings, that you hashed. |

The server builds the typed struct from `action.type` and `action.params`, recomputes the EIP-712 digest and recovers the signer. It then authorizes the signer: the account itself, or an approved [agent](../concepts/agent-wallets.md) of the account.

:::info
**`sig_scheme` is vestigial.** Earlier builds carried a `sig_scheme` selector on the envelope. The server now ignores it and always runs typed-data recovery. Omit the field. If you send it, the only accepted value is `"typed"`.
:::

## EIP-712 domain {#eip-712-domain}

Each network has one domain. Cache it.

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

Every typed message also carries a `metafluxChain` string as its first field. The string is a readable tag of the same chain id, and it is part of the signed struct:

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| any other | `"Devnet"` |

The chain id is fixed per network. Take it from [networks](../networks.md#summary) and use the matching tag. A `metafluxChain` or `chainId` that does not match the node recovers a different signer, and the node rejects the request.

## Encoding rules (atomic EIP-712) {#encoding-rules-atomic-eip-712}

The encoding is standard EIP-712 `hashStruct`:

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` encodes each field, in declared order, to one 32-byte word:

| Field type | Encoding |
|------------|----------|
| `address` | 20 bytes, right-aligned (12 zero bytes on the left). |
| `uintN` | big-endian, zero-left-padded to 32 bytes. |
| `bool` | `uint8` `0` / `1`, zero-padded to 32 bytes. |
| `string` | `keccak256(utf8_bytes)`. |
| `bytes` | `keccak256(raw_bytes)`. |
| `T[]` (e.g. `address[]`) | `keccak256(` concat of each element's 32-byte word `)`. |

Sign the 32-byte `digest` with secp256k1 and serialize the signature as `r ‖ s ‖ v` (65 bytes). The node accepts both `v ∈ {27, 28}` and `v ∈ {0, 1}`.

### Canonical decimal strings {#decimals-are-canonical-strings--hash-then-parse}

Each amount or quantity field is an EIP-712 `string` that holds the canonical decimal text (`"1500.5"`, `"750.25"`). The server hashes the verbatim string and then parses it to a number, so the exact characters matter.

:::warning
`"1.0"` and `"1.00"` hash differently, although they are the same number. Pick one canonical form per amount. Send the identical string in `action.params` that you put in the typed message you signed. A mismatch (trailing zero, missing decimal point, scientific notation) recovers a different signer, and the node rejects the action.
:::

Typed signing carries decimals as strings, not as scaled integers. The wallet prompt then shows a readable amount, and the hash-then-parse rule keeps the signed bytes unambiguous.

## Action type strings {#action-type-strings}

The primary type of each action is `MetaFluxTransaction:<Action>`. The tables below give the `encodeType` string, with the fields in message order. `action.type` is the `snake_case` tag you put on the POST.

:::warning
**These tables are partial.** They list about half of the chain's type strings: the actions an integrator builds by hand. They do not list the order and cancel bodies (see [Orders and cancels](#orders-and-cancels)), the RFQ and FBA lanes, or the governance, validator and deployer actions.

For a trading or account action with no row here, take the string from a client SDK. Do not guess it. [`@metaflux-dex/client`](./typescript-sdk.md) and `metaflux-client` (Rust) carry the order, cancel, TWAP, sub-account and RFQ strings byte-identical to the chain.

Neither SDK carries the governance and validator actions. `ApproveUpgrade`, `ApproveUpgradeAt`, `ArmFeatures`, `ArmFeaturesAt`, `CValidator`, `GovAdjustSpotValue`, `GovVote`, `SetMarkMode`, `SetMetaliquiditySet`, `SetPmShockGrid`, `VoteAppHash` and `VoteGlobal` have no row here and no SDK type. A validator casts them with the `mtf-node gov` CLI over its local socket. The CLI builds the digest itself, so no integrator builds them by hand.

The typehash covers the whole type string. One wrong byte, one wrong field order or one missing field makes the action unsignable: the chain recovers a stranger and refuses the action. Copy the string. Never retype it.
:::

### Transfers {#transfers}

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` ⚠️ | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

⚠️ The network rejects `usd_class_transfer`. The type string above is the frozen form and your library may still carry it, but the action never succeeds. There is one USDC pool, so there is no second class to move to. The action answers `USDC is unified; no class transfer needed`, and it spends the nonce either way. See [USDC](../concepts/usdc.md#moving-usdc).

### Core to EVM {#core--evm}

Two actions move value from the Core ledger to MetaFluxEVM. See [which one to use](../api/rest/exchange/transfers.md#core-evm-which-action).

| `action.type` | `encodeType` |
|---------------|--------------|
| `core_evm_transfer` | `MetaFluxTransaction:CoreEvmTransfer(string metafluxChain,string amount,bool toEvm,address destination,uint32 asset,uint64 nonce)` |
| `core_evm_transfer` (V2) | `MetaFluxTransaction:CoreEvmTransferV2(string metafluxChain,string amount,bool toEvm,address destination,uint32 asset,uint32 destinationChainId,bytes data,uint64 nonce)` |
| `send_to_evm_with_data` ⚠️ | `MetaFluxTransaction:SendToEvmWithData(string metafluxChain,uint32 token,string amount,uint32 sourceDex,address destinationRecipient,bool toPerp,uint32 destinationChainId,bytes data,uint64 transferNonce,uint64 nonce)` |

Notes on specific fields:

- `core_evm_transfer`: the envelope you send picks the type string. With neither `data` nor `destination_chain_id`, you sign `CoreEvmTransfer`, byte-identical to the form before those fields existed. With either key, you sign `CoreEvmTransferV2`. Presence selects the type, not emptiness: `"data": []` and `"destination_chain_id": 0` both count as present.
- `send_to_evm_with_data`: the struct holds two nonces. `transferNonce` is `params.nonce`, and it travels with the transfer. The trailing `nonce` is the ordinary envelope nonce. They are separate signed fields. You may send the same value for both, but you do not have to.
- `send_to_evm_with_data`: `data` is a `bytes` field, hashed as `keccak256(raw_bytes)`. An empty payload hashes the empty byte string. On the POST it is an array of byte integers, not a hex string.
- `send_to_evm_with_data` is active. An earlier version of this note said the network refused the action. The lane has since been restored and released. The type string above is frozen. The action refuses five cases: a `source_dex` other than `0`, `to_perp: true`, a `destination_chain_id` that is neither `0` nor the local EVM chain id, `data` over 4096 bytes, and an amount that truncates to a zero EVM credit. See [the action](../api/rest/exchange/transfers.md#send_to_evm_with_data) for each rule.

### Account, staking & vault {#account-staking--vault}

| `action.type` | `encodeType` |
|---------------|--------------|
| `approve_agent` | `MetaFluxTransaction:ApproveAgent(string metafluxChain,address agentAddress,string agentName,uint64 expiresAtMs,uint64 nonce)` |
| `set_referrer` | `MetaFluxTransaction:SetReferrer(string metafluxChain,address referrer,uint64 nonce)` |
| `set_referrer_by_code` | `MetaFluxTransaction:SetReferrerByCode(string metafluxChain,string code,uint64 nonce)` |
| `register_referral_code` | `MetaFluxTransaction:RegisterReferralCode(string metafluxChain,string code,uint64 nonce)` |
| `approve_broker_fee` | `MetaFluxTransaction:ApproveBuilderFee(string metafluxChain,address builder,uint16 maxFeeBps,uint64 nonce)` |
| `set_display_name` | `MetaFluxTransaction:SetDisplayName(string metafluxChain,string displayName,uint64 nonce)` |
| `set_position_mode` | `MetaFluxTransaction:SetPositionMode(string metafluxChain,bool hedge,uint64 nonce)` |
| `user_portfolio_margin` | `MetaFluxTransaction:UserPortfolioMargin(string metafluxChain,bool enroll,uint64 nonce)` |
| `convert_to_multi_sig_user` | `MetaFluxTransaction:ConvertToMultiSigUser(string metafluxChain,address[] signers,uint32 threshold,uint64 nonce)` |
| `update_leverage` | `MetaFluxTransaction:UpdateLeverage(string metafluxChain,uint32 asset,uint32 leverage,bool isIsolated,uint64 nonce)` |
| `claim_rewards` | `MetaFluxTransaction:ClaimRewards(string metafluxChain,address validator,uint64 nonce)` |
| `link_staking_user` | `MetaFluxTransaction:LinkStakingUser(string metafluxChain,address target,uint64 nonce)` |
| `create_vault` | `MetaFluxTransaction:CreateVault(string metafluxChain,string name,uint64 lockPeriodSecs,uint8 kind,uint64 nonce)` |
| `vault_modify` | `MetaFluxTransaction:VaultModify(string metafluxChain,uint64 vaultId,string newName,bool hasNewLockPeriodSecs,uint64 newLockPeriodSecs,bool hasNewManagementFeeBps,uint16 newManagementFeeBps,bool hasNewPaused,bool newPaused,uint64 nonce)` |
| `spot_margin_close` | `MetaFluxTransaction:SpotMarginClose(string metafluxChain,uint32 pair,uint64 limitPx,uint64 nonce)` |
| `noop` | `MetaFluxTransaction:Noop(string metafluxChain,uint64 nonce)` |
| `claim_referral_rewards` | `MetaFluxTransaction:ClaimReferralRewards(string metafluxChain,uint64 nonce)` |
| `claim_broker_rewards` | `MetaFluxTransaction:ClaimBuilderRewards(string metafluxChain,uint64 nonce)` |

Notes on specific fields:

- `claim_rewards`: a `validator` of the zero address claims across all delegations.
- `create_vault`: `kind` is `0` for User and `1` for Metaliquidity.
- [`noop`](../api/rest/exchange/rfq-utility.md#noop): the chain tag and the envelope nonce are the only signed fields, because the action has no params. It touches no state and spends the nonce. Use it to invalidate an in-flight action signed with the same nonce.
- `approve_broker_fee`: the row above is not a typo. The action type says `broker` and the `encodeType` says `ApproveBuilderFee`. Sign the string exactly as printed. The type string is hashed into every signature ever made for this action, so one changed byte stops every historical signature from verifying. The older action type `approve_builder_fee` is still accepted and signs the same string. See [broker codes](../concepts/broker-codes.md#approval).
- `approve_agent`: `expiresAtMs` is a sentinel, and it is always in the digest. For an approval that never expires, omit `expires_at_ms` from the POST params and sign `expiresAtMs = 0`. Sign a non-zero value and the approval carries that expiry. A caller that leaves the field out of the struct signs a four-field digest that the chain never computes. The recovered signer is then a stranger, and the chain refuses the action.
- `vault_modify`: the digest binds every field the action applies. Each optional field signs as two words, a presence `bool` and then the value. Set the flag to `true` only when the wire payload carries that key. When it does not, sign the value as `0` or `false`. An absent key and a key sent as `0` give different digests, so one signature covers exactly one wire form. `newName` signs as `""` when the payload sends no name. The chain refuses an empty name, so `""` can only mean unchanged. This string replaces a four-field `VaultModify`. The chain refuses a signature made with the older string since [block 11,550,001](../changelog/block-11550001.md#vault_modify). See [the action](../api/rest/exchange/vaults.md#vault_modify).
- `set_referrer_by_code` and `register_referral_code`: `code` signs as the exact lowercase string the payload carries. The node does not fold the case, so sign the bytes you send.
- `claim_referral_rewards` and `claim_broker_rewards`: the chain tag and the envelope nonce are the only signed fields, because neither action has params. Both drain the whole accrued credit and neither reports the amount. Read the credit first. See [fees](../concepts/fees.md#referrer-credit).
- `claim_broker_rewards`: the same frozen-spelling rule as `approve_broker_fee` applies. The action type says `broker` and the `encodeType` says `ClaimBuilderRewards`. Sign the string exactly as printed. The older action type `claim_builder_rewards` is still accepted and signs the same string. See [broker codes](../concepts/broker-codes.md#claiming).

### Margin {#margin}

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` and `amount` are canonical decimal strings (hash-then-parse).

### Staking {#staking}

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint8 lockMonths,uint64 nonce)` |

`amount` is a canonical decimal string. `isUndelegate` set to `true` undelegates and `false` delegates.

`lockMonths` is the staking lock tier: `0` (flexible), `1`, `6` or `24`. Omitting it from the POST params is not the same as omitting it from the digest. The POST field defaults to `0`, so a bare delegate stays valid on the wire. The typed struct has no default. `lockMonths` is always one of the six signed fields, including on an undelegate, where the chain ignores the value but still hashes it. If you sign a five-field struct, the chain computes a digest you never signed. The recovered signer is then a stranger, and the chain refuses the action. Tier `0` earns no revenue share. See [staking](../concepts/staking.md#token_delegate) for the tier rules.

### Vault {#vault}

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` set to `true` deposits and `false` withdraws. `amount` is a canonical decimal string. `vault_withdraw.shares` is a canonical decimal string.

### Metaliquidity {#metaliquidity}

| `action.type` | `encodeType` |
|---------------|--------------|
| `register_metaliquidity_operator` | `MetaFluxTransaction:RegisterMetaliquidityOperator(string metafluxChain,uint64 vaultId,address operator,bool allowed,uint64 expiresAtMs,uint64 nonce)` |

`expiresAtMs` is a sentinel. For an operator that never expires, omit `expires_at_ms` from the POST params and sign `expiresAtMs = 0`. The node rejects an explicit `expires_at_ms: 0`, because an absent key and an explicit zero flatten to the same digest and the node refuses the ambiguity.

`expiresAtMs` is always in the digest, although `expires_at_ms` is optional on the wire. Omitting it signs as `0`, so encode `expiresAtMs = 0`. Sign a non-zero value and the approval carries that expiry. See [`register_metaliquidity_operator`](../api/rest/exchange/vaults.md#register_metaliquidity_operator).

### Spot margin {#spot-margin}

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` and `borrow` are canonical decimal strings. `size` and `limitPx` are integers.

### Earn {#earn}

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` and `shares` are canonical decimal strings.

`createEarnPool` has no typed struct. It is a validator governance vote, not a user action, and it is [not on `/exchange`](../api/rest/exchange/transfers.md#non-bridged-actions).

### BOLE pool {#bole-pool}

| `action.type` | `encodeType` |
|---------------|--------------|
| `borrow_lend` | `MetaFluxTransaction:BorrowLend(string metafluxChain,uint8 kind,string amount,uint64 nonce)` |

`kind` signs as a `uint8`, not as the string you POST. The wire carries `"Lend"`, `"UnLend"`, `"Borrow"` or `"Repay"`. The digest carries `0`, `1`, `2` or `3` in that order. Sign the number and post the string. `amount` is a canonical decimal string.

The chain refuses `"Borrow"` unless the sender is an approved liquidator. The other three kinds are open to any account. See [`borrow_lend`](../api/rest/exchange/transfers.md#non-bridged-actions).

### Spot deployment (MIP-1) {#spot-deployment}

These are the six [spot deployer](../api/rest/exchange/deploy-spot.md) actions. Each action is sender-authorized, so no struct carries an `owner`. The recovered signer is the deployer.

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_register_token` | `MetaFluxTransaction:SpotRegisterToken(string metafluxChain,string symbol,uint8 szDecimals,uint8 weiDecimals,string maxDeployFee,uint64 nonce)` |
| `spot_register_pair` | `MetaFluxTransaction:SpotRegisterPair(string metafluxChain,uint32 base,uint32 quote,string name,string maxDeployFee,uint64 nonce)` |
| `spot_set_pair_params` | `MetaFluxTransaction:SpotSetPairParams(string metafluxChain,uint32 pair,uint32 takerFeeDbps,uint32 makerFeeDbps,uint64 minNotionalCents,uint64 nonce)` |
| `spot_set_pair_active` | `MetaFluxTransaction:SpotSetPairActive(string metafluxChain,uint32 pair,bool active,uint64 nonce)` |
| `spot_seed_holders` | `MetaFluxTransaction:SpotSeedHolders(string metafluxChain,uint32 asset,address[] holders,string[] amounts,uint64 nonce)` |
| `spot_finalize_supply` | `MetaFluxTransaction:SpotFinalizeSupply(string metafluxChain,uint32 asset,string maxSupply,uint64 nonce)` |

### Perp deployer actions {#perp-deployer-actions}

:::warning
**`PerpSetSubDeployerPerms` is active.** On the public testnet, the node accepts the variant and asks for its `params`. A made-up action name in the same request answers `unknown variant`. That control separates the two answers.

`PerpRegisterAsset` also changes in a coming release. It gains `string name`, the name of the dex the market joins. The type string below is the new one, so the digest moves. After the upgrade, a signature over the old struct without `name` is invalid. Before the upgrade, a signature over the new struct is invalid.
:::

These are the [perp deployer](../api/rest/exchange/deploy-perp.md) actions. Each action is sender-authorized: the recovered signer is the deployer. The node checks per-market authority against the market's deployer and the permission bits its delegates hold.

| `action.type` | `encodeType` |
|---------------|--------------|
| `perp_register_asset` | `MetaFluxTransaction:PerpRegisterAsset(string metafluxChain,string symbol,uint8 decimals,string name,uint64 nonce)` |
| `perp_set_oracle` | RETIRED: `MetaFluxTransaction:PerpSetOracle(string metafluxChain,uint32 asset,uint16 oracleSourceMask,uint64 nonce)` |
| `perp_set_leverage` | `MetaFluxTransaction:PerpSetLeverage(string metafluxChain,uint32 asset,uint8 maxLeverage,uint64 nonce)` |
| `perp_set_fee_tier` | `MetaFluxTransaction:PerpSetFeeTier(string metafluxChain,uint32 asset,uint32 takerFeeDbps,uint32 makerFeeDbps,uint32 deployerFeeBps,uint64 nonce)` |
| `perp_set_maker_rebate` | `MetaFluxTransaction:PerpSetMakerRebate(string metafluxChain,uint32 asset,uint16 rebateBps,uint64 nonce)` |
| `perp_set_min_size` | `MetaFluxTransaction:PerpSetMinSize(string metafluxChain,uint32 asset,uint64 minOrderSize,uint64 nonce)` |
| `perp_set_oi_cap` | `MetaFluxTransaction:PerpSetOiCap(string metafluxChain,uint32 asset,uint64 oiCapUnits,uint64 nonce)` |
| `perp_activate_market` | `MetaFluxTransaction:PerpActivateMarket(string metafluxChain,uint32 asset,uint64 nonce)` |
| `perp_deactivate_market` | `MetaFluxTransaction:PerpDeactivateMarket(string metafluxChain,uint32 asset,uint64 nonce)` |
| `perp_set_sub_deployers` | `MetaFluxTransaction:PerpSetSubDeployers(string metafluxChain,uint32 asset,address subDeployer,bool add,uint64 nonce)` |
| `perp_set_sub_deployer_perms` | `MetaFluxTransaction:PerpSetSubDeployerPerms(string metafluxChain,uint32 asset,address subDeployer,uint16 permissions,uint64 nonce)` |

In `PerpSetOiCap`, `oiCapUnits` is in whole units of the base asset, and `0` removes the cap. See [`perp_set_oi_cap`](../api/rest/exchange/deploy-perp.md#perp_set_oi_cap).

Both changes below are in effect.

- `PerpSetSubDeployerPerms` is new. It grants a delegate an exact permission mask instead of every power. `permissions` is in the digest, so one signature binds one (market, delegate, mask) triple. The bit table is on [`perp_set_sub_deployers`](../api/rest/exchange/deploy-perp.md#perp_set_sub_deployers).
- `PerpSetOracle` is retired. The type string is not deleted, and every committed payload still decodes, but the node refuses the action. Stop signing it. The mask it wrote has no reader.

`PerpSetSubDeployers` itself does not change. Its type string, its digest and its meaning are the same before and after. `add: true` grants every permission bit and `add: false` revokes. A client that signs it keeps working, and a delegate you already granted keeps every power it has.

`name` sits between `decimals` and `nonce`, and it is in the digest. It names the dex, and `symbol` must start with `name` plus `:`. Both strings are hashed, so one signature binds one (dex, symbol) pair and cannot be re-aimed at another dex. `name` is required on your first registration and write-once after it. The rejection rules are on [`perp_register_asset`](../api/rest/exchange/deploy-perp.md#perp_register_asset).

Fee units differ inside one struct. `takerFeeDbps` and `makerFeeDbps` are deci-bps. `deployerFeeBps` is bps. A value moved between the two fields is off by ten.

No struct carries a bid. The Dutch clock prices a perp market and the deployer pays at registration, so the node refuses a non-zero bid.

`maxDeployFee` and `maxSupply` are canonical decimal strings under the [hash-then-parse rule](#decimals-are-canonical-strings--hash-then-parse). Hash the exact characters you send.

`spot_seed_holders` carries two arrays, and both are in the digest. `holders` is `address[]`. `amounts` is `string[]`, with one canonical decimal string per holder, in the same order. Encode each array as `keccak256(` concat of the elements' 32-byte words `)`. The word of a `string[]` element is `keccak256(utf8_bytes)` of that string. The two arrays are parallel. Reordering one alone changes the digest and produces a different distribution.

None of the six spot deployer actions carries a bid field. The deploy fee is paid at commit and bounded by the signed `maxDeployFee`. There is nothing to escrow and nothing to refund.

### Agent abstraction & bridge {#agent-abstraction--bridge}

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `bridge_withdraw` | `MetaFluxTransaction:BridgeWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

Notes on specific fields:

- `agent_set_abstraction`: `value` is an EIP-712 `string`. Sign the verbatim string. It is not a number, and it is hashed as `keccak256(utf8)`.
- `bridge_withdraw`: the typed `chain` field is a `uint8`, where `1` is Base and `2` is Arbitrum. The POST `action.params.chain` is the string name (`"Base"` or `"Arbitrum"`). Sign the `uint8` in the typed message and send the string name in `params`.
- `bridge_withdraw`: `amount` is a `uint64` integer, not a decimal string. `dstAddr` is the destination-chain address string.

### Scale ladder {#scale-ladder}

The [scale ladder](../api/rest/exchange/orders.md#scale_order) actions bind the compact request. You sign the range and the distribution, not the expanded rungs. Each action has an owner-less primary type and a `_WITH_OWNER` twin. The twin applies only when the wire carries an `owner` (an agent or operator acting for another account). It inserts `owner` right after `metafluxChain`, as `batch_order` does.

| `action.type` | `encodeType` |
|---------------|--------------|
| `scale_order` | `MetaFluxTransaction:ScaleOrder(string metafluxChain,uint32 market,string side,uint32 n,uint64 pxLow,uint64 pxHigh,uint64 totalSize,string dist,bytes32 weights,string tif,bool reduceOnly,string stpMode,string positionSide,string cloid,uint64 nonce)` |
| `scale_order` (with owner) | `MetaFluxTransaction:ScaleOrder(string metafluxChain,address owner,uint32 market,string side,uint32 n,uint64 pxLow,uint64 pxHigh,uint64 totalSize,string dist,bytes32 weights,string tif,bool reduceOnly,string stpMode,string positionSide,string cloid,uint64 nonce)` |
| `cancel_scale` | `MetaFluxTransaction:CancelScale(string metafluxChain,uint32 market,string cloid,uint64 nonce)` |
| `cancel_scale` (with owner) | `MetaFluxTransaction:CancelScale(string metafluxChain,address owner,uint32 market,string cloid,uint64 nonce)` |

Notes on specific fields:

- `weights` is a `bytes32` that the client pre-hashes `T[]`-style. For `dist == "custom"`, it is `keccak256(concat(per-weight uint256 words))`. For every other `dist`, it is the zero hash (`0x00…00`). This binds the exact weight vector without inflating the message: a 100-rung ladder signs a message of the same size as a 2-rung one. The wire `params.weights` still carries the full array, and the server rebuilds and re-verifies it. For a non-`custom` `dist`, send an empty array.
- `side`, `dist`, `tif`, `stpMode`, `positionSide` and `cloid` are EIP-712 `string`s, signed verbatim in their `snake_case` wire form. `positionSide` is `""` when omitted.
- `pxLow`, `pxHigh` and `totalSize` are `uint64` integers on the wire. The node widens them internally.

### Chase {#chase}

A [chase order](../api/rest/exchange/orders.md#chase_order) binds one self-repricing leg. You sign the intent, and the node re-prices the resting leg to track the touch. Like the scale ladder, it has an owner-less primary type and a `_WITH_OWNER` twin (`owner` right after `metafluxChain`).

| `action.type` | `encodeType` |
|---------------|--------------|
| `chase_order` | `MetaFluxTransaction:ChaseOrder(string metafluxChain,uint32 market,string side,uint64 size,string cloid,string stpMode,string positionSide,uint32 intervalBlocks,uint64 ttlMs,uint32 maxReprices,uint64 nonce)` |
| `chase_order` (with owner) | `MetaFluxTransaction:ChaseOrder(string metafluxChain,address owner,uint32 market,string side,uint64 size,string cloid,string stpMode,string positionSide,uint32 intervalBlocks,uint64 ttlMs,uint32 maxReprices,uint64 nonce)` |
| `cancel_chase` | `MetaFluxTransaction:CancelChase(string metafluxChain,uint32 market,uint64 chaseOid,uint64 nonce)` |
| `cancel_chase` (with owner) | `MetaFluxTransaction:CancelChase(string metafluxChain,address owner,uint32 market,uint64 chaseOid,uint64 nonce)` |

Notes on specific fields:

- `side`, `stpMode`, `positionSide` and `cloid` are EIP-712 `string`s signed verbatim in their `snake_case` wire form. Each is `""` when omitted. `cloid` is hashed as the verbatim `0x`-hex string, not the raw 16 bytes.
- `size`, `intervalBlocks`, `ttlMs` and `maxReprices` are integer words.
- `cancel_chase.chaseOid` is the registry cancel handle from the `chase_order` ack (`statuses[0].chase.chase_oid`). It is not the resting leg oid.

### Fields that are *not* in the typed digest {#fields-that-are-not-in-the-typed-digest}

One action has a `params` key that the typed type string does not cover, so the server forces the key to its default:

- `create_vault`: the `CreateVault` type has no `parent`, so `create_vault` is top-level. Omit `parent`.

`approve_agent` is not in this class, whatever an older copy of this page said. `ApproveAgent` does bind `uint64 expiresAtMs`. For a never-expiring approval, omit `expires_at_ms` from the POST. The struct still carries the field and signs it as `0`.

## Action expiry (`expiresAfter`) {#action-expiry-expiresafter}

Every action type optionally carries a top-level `expiresAfter` (uint64 milliseconds). It is an expiry time, signed into the digest. After it, the action is no longer valid. It defends against late replay: a signature that leaks, or that a relay holds back, stops working once its expiry passes. See [`POST /exchange`, optional action expiry](../api/rest/exchange.md#optional-action-expiry-expiresafter) for the wire behavior and rejection rules.

The fold is the same for every action type and follows one rule:

- `expiresAfter == 0` or absent (the default). The digest is byte-for-byte identical to the normal digest of the action. Nothing about signing changes unless you opt in.
- `expiresAfter != 0`. Two changes apply:
  1. The trailing `…,uint64 nonce)` of the type string becomes `…,uint64 nonce,uint64 expiresAfter)`.
  2. One extra 32-byte word is appended to `encodeData` after the `nonce` word. The word is `expiresAfter` as a big-endian `uint64`, left-padded.

For `withdraw`, the two forms are:

So for `withdraw`:

```
// expiresAfter == 0 (or omitted): unchanged
MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)

// expiresAfter != 0: folded
MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce,uint64 expiresAfter)
```

### `eth_signTypedData_v4` field placement {#expiresafter-field-placement}

When `expiresAfter` is non-zero, add it as the last field of the type array of the action. Set it in the message as a decimal string, like any `uint64`:

```js
types['MetaFluxTransaction:Withdraw'].push({ name: 'expiresAfter', type: 'uint64' });
message.expiresAfter = '1735693200000';   // only when non-zero
```

When the value is `0` or absent, do not add the field or the message key. That reproduces the legacy typed data exactly.

### Worked delta for `withdraw` {#worked-delta--withdraw-expiry}

Take a `withdraw` of `"100.5"` of asset `0` to chain id `8453` on Testnet (`chainId = 114514`), with `useCctp = false` and `nonce = 1735689600000`. A cross-implementation known-answer test pins the two digests below. A compliant `eth_signTypedData_v4` assembly reproduces them exactly:
| `expiresAfter` | Signed EIP-712 digest (32 bytes) |
|----------------|----------------------------------|
| `0` / omitted  | `0x425495f369661cdff0c274cd16ee5ad91294892a924b9a84033f09183b087c0e` |
| `1735693200000` | `0x9ad23a96bb83b8bdd427fe9023b4855e8689be66da73da745f9af0acb59f5833` |

The first row is identical to the digest of the plain `withdraw` without expiry, so opting out costs nothing. The second row differs only because the folded type string and the appended `expiresAfter` word change the struct hash.

## Worked example: `send_asset` {#worked-example--send_asset-a-transfer}

This example sends `"750.25"` of asset `2` from spot DEX `0` to perp DEX `1`, into the perp wallet, on Testnet (`chainId = 114514`).

Pass this object to `eth_signTypedData_v4`:

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
  }),
});
```

## Worked example: `approve_agent` {#worked-example--approve_agent-an-account-action}

This example approves an agent named `"trading-bot"` on Testnet (`chainId = 114514`), with no expiry. `expiresAtMs` is in the struct and signs as `0`. The POST omits `expires_at_ms` entirely. If you leave the field out of the struct, the digest has four fields where the chain hashes five, and the signature recovers a stranger.

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
      { "name": "expiresAtMs",   "type": "uint64"  },
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
    "expiresAtMs":   0,
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
        // no expires_at_ms on the wire; the struct signed expiresAtMs = 0
      },
    },
  }),
});
```

See [agent wallets](../concepts/agent-wallets.md) for the approval lifecycle. An approval becomes effective one block after commit.

## Verifying your encoding {#verifying-your-encoding}

Before you submit, recover the signer locally from your own assembled digest. Confirm that it matches the expected address. If it does not, the bug is in your typed-data assembly, not in the chain. The atomic encoding above is the full specification. A cross-implementation known-answer test pins the digest of each action byte-for-byte, so any compliant `eth_signTypedData_v4` implementation reproduces the same result.

## Orders and cancels {#orders-and-cancels}

Orders and cancels (`submit_order`, `batch_order`, `cancel_order`, `batch_cancel`, and the [`scale_order` / `cancel_scale`](#scale-ladder) ladder actions) use the same `/exchange` envelope and the same EIP-712 typed-data signing. Their action-body shapes are in the [`POST /exchange` action catalog](../api/rest/exchange.md#action-catalog).

### Order type strings and the trailing fold {#order-type-strings-and-the-trailing-fold}

A trigger leg may carry a trailing callback, [`trigger.trail_px`](../api/rest/exchange/orders.md#trailing-stops). The field moves where a position closes, so it is a control field and the signature covers it. It folds into the order type strings with the same presence-selected rule that folds [`expiresAfter`](#action-expiry-expiresafter) into every action. With no `trail_px` key, nothing changes. With a `trail_px` key anywhere, the type string and the digest change.

Presence selects the fold, not the value. An explicit `trail_px: 0` counts as a present trail. It takes the trailing digest, and admission then rejects it (`trailing callback must be > 0`). To sign as before, omit the key.

#### `submit_order` {#trailing-fold-submit_order}

```
// no trail_px key — the frozen type string, unchanged
MetaFluxTransaction:SubmitOrder(string metafluxChain,uint32 market,string side,string kind,uint64 size,uint64 limitPx,string tif,string stpMode,bool reduceOnly,string cloid,uint16 builderFee,address builderUser,string positionSide,uint64 triggerPx,bool triggerIsMarket,string triggerTpsl,uint64 nonce)

// trail_px present — trailPx folded in before nonce
MetaFluxTransaction:SubmitOrder(string metafluxChain,uint32 market,string side,string kind,uint64 size,uint64 limitPx,string tif,string stpMode,bool reduceOnly,string cloid,uint16 builderFee,address builderUser,string positionSide,uint64 triggerPx,bool triggerIsMarket,string triggerTpsl,uint64 trailPx,uint64 nonce)
```

`trailPx` is one extra 32-byte word: the callback as a big-endian `uint64`, left-padded. It goes after `triggerTpsl` and before `nonce`. It is not appended at the end, so it does not collide with the `expiresAfter` fold, which still goes last.

#### `batch_order` {#trailing-fold-batch_order}

A batch does not widen its per-leg encoding. The `orders` field stays what it was: a keccak over the fixed-width words of each leg, in leg order. A leg has the same number of words whether it trails or not. A wider leg would make the per-leg encoding variable-length inside a flat, unprefixed concatenation. That is malleable, because two different batches could hash the same.

Instead, the callbacks travel in a second field, `trailPxs`. It is present only when at least one leg trails:

```
// no leg carries trail_px — frozen, unchanged
MetaFluxTransaction:BatchOrder(string metafluxChain,bytes32 orders,string grouping,uint64 nonce)
MetaFluxTransaction:BatchOrder(string metafluxChain,address owner,bytes32 orders,string grouping,uint64 nonce)

// at least one leg carries trail_px — trailPxs folded in after grouping
MetaFluxTransaction:BatchOrder(string metafluxChain,bytes32 orders,string grouping,bytes32 trailPxs,uint64 nonce)
MetaFluxTransaction:BatchOrder(string metafluxChain,address owner,bytes32 orders,string grouping,bytes32 trailPxs,uint64 nonce)
```

To compute `trailPxs`, build a plain keccak over a concatenation, as for `orders`. It is not an EIP-712 array encoding. Walk the legs in the same order that `orders` walks them. Emit two fixed-width words per leg:

1. The presence flag: a 32-byte word, `1` if the leg carries `trail_px`, else `0`.
2. The callback: `trail_px` as a big-endian `uint64`, left-padded to 32 bytes. Use `0` for a leg that does not trail.

`trailPxs = keccak256(concat(those words))`. Every leg contributes both words, including legs with no trail. That makes the identity of the trailing leg part of the digest. If you move the trail from leg 0 to leg 1, `trailPxs` changes while `orders` stays identical, and the signature stops verifying.

The presence word is not redundant with the value word. Without it, "no trail" and "a trail of 0" hash alike, and one signature covers two wire forms that behave differently.

#### `eth_signTypedData_v4` field placement {#trailing-fold-field-placement}

```js
// submit_order, only when the order carries trail_px
types['MetaFluxTransaction:SubmitOrder'].splice(16, 0, { name: 'trailPx', type: 'uint64' });
message.trailPx = '100000000000';

// batch_order, only when some leg carries trail_px
// (index 3 without owner, 4 with owner — always just after `grouping`)
types['MetaFluxTransaction:BatchOrder'].splice(3, 0, { name: 'trailPxs', type: 'bytes32' });
message.trailPxs = '0x...';
```

When no trail is present, do not add the field or the message key. That reproduces the legacy typed data exactly, so an older client that does not know `trail_px` keeps signing valid orders unchanged.

#### Known-answer digests {#trailing-fold-kat}

These vectors are pinned on Testnet (`chainId = 114514`) with `nonce = 1`. A compliant `eth_signTypedData_v4` assembly reproduces them byte-for-byte.

| Vector | `expiresAfter` | Signed EIP-712 digest |
|---|---|---|
| `submit_order` with `trailPx = 50000000` | `0` | `0xf78212e9ab8ad38ad455552cd9343a7a6637a8d331f23528fe7ae84713a20b64` |
| the same order | `1900000000000` | `0x3f4d7fd0d3fb293e604fe6e5c4fc52e7b76830eaa39f8dc5d4d26b34372d5d92` |
| `batch_order` with `owner`, 2 legs, leg 1 trails | `0` | `0xdf6da2a4e1c3cabd1852bfa1aa05495a839d3787f1a01e2df18c199b53453b88` |
| the same batch with no leg trailing | `0` | `0xef21c04ccb568652ab2d8950dffd1bd289acaafde846199f74a8ba72e0f5dad8` |

The last row is the control. It is identical to the digest the same batch produced before `trail_px` was bound, so not sending the field costs nothing. The two batch rows share one `orders` hash, `0x1894b6b95a1e0af9b6c694e7ff0eef0f467701a1215973bb25c42f932f43f300`. They differ only in `trailPxs`: `0x74a1e15aa3dfcb4bfbf5c65b533597fe064fc7492edd6f5f843427d22feaf26d` (trailing) and `0x012893657d8eb2efad4de0a91bcd0e39ad9837745dec3ea923737ea803fc8e3d` (control).

#### Which actions can trail {#trailing-fold-scope}

Only `submit_order` and `batch_order` carry `trail_px`. The [`scale_order`](#scale-ladder) ladder, [`chase_order`](#chase), TWAP and RFQ derive their legs with no trailing callback, and their type strings do not change. A [multi-sig](../concepts/multi-sig.md) inner payload is signed over its own bytes and is also unaffected.

## See also {#see-also}

- [`POST /exchange`](../api/rest/exchange.md): the endpoint and full action catalog
- [Agent wallets](../concepts/agent-wallets.md): approval lifecycle
- [Networks](../networks.md): `chainId` per network
