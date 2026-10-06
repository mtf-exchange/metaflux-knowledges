---
description: "Deploy a perpetual market: the Dutch-clock deploy fee, the staking bond, and the leverage, fee and oracle configuration that a deployer sets before activating it."
---

# Perp deployment actions (MIP-3) {#perp-deployment-actions}

These actions deploy and configure a perpetual market through [`POST /exchange`](../exchange.md).

That page defines the request envelope, the EIP-712 signing rules, the number planes and the response shape. They apply to every action here.

:::warning
Confirm the lane against the network that you target. The ten deploy actions and [`mip3_set_oracle_px`](#mip3_set_oracle_px) are built. What varies by network is whether the running build carries them and whether the governance off-switch `mip3_enabled` is open. So the node can still refuse a call. Build against these shapes now. Probe one call on your target network before you depend on it.

[`perp_set_oracle`](#perp_set_oracle) is retired: the node refuses it. [`perp_set_sub_deployer_perms`](#perp_set_sub_deployers) has shipped, and the node accepts it now. [`perp_set_oi_cap`](#perp_set_oi_cap) has shipped too, since [block 25,599,540](../../../changelog/block-25599540.md#perp-set-oi-cap). Every other wire shape and signing type on this page is unchanged.
:::

These actions give permissionless perp market deployment, plus the deployer price push that the deployed market runs on. See the [catalog entry](../exchange.md#perp-deployment) for the lane at a glance.

Each action is sender-authorized: the recovered signer is the deployer. After `perp_register_asset`, only the deployer of that market or one of its sub-deployers can call the other actions. A sub-deployer holds one permission bit per handler. See [delegation](#perp_set_sub_deployers).

A deploy requires two things. The deployer must hold at least the staked-MTF floor (50,000 by default, governance-tunable). The deployer also pays the Dutch-clock ask at registration from free collateral. No action carries a bid, and the node refuses a non-zero bid. A registered market lands in the dex of the deployer, with an asset id at or above 1000. It never lands in the primary dex.

Registrations count against `mip3_max_deploys_per_epoch` per deploy epoch. See [Limits](../../../mip/mip-3.md#limits). `0` means uncapped.

### Register a perp asset {#perp_register_asset}

This action also creates your dex, on your first call. That is why it carries the dex name. There is no separate create-dex action.

```json
{ "type": "perp_register_asset", "params": { "symbol": "WIF:PERP", "decimals": 8, "name": "WIF" } }
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `symbol` | string | `<name>:<suffix>` | The market symbol. The part before the first `:` must equal your dex name, byte for byte, and the suffix must not be empty |
| `decimals` | uint8 | `0` keeps the default of 8 | The token decimals |
| `name` | string | 1-16 ASCII alphanumeric bytes | Your dex name. Required on your first registration. Omit it, or repeat it exactly, on every later registration |

Callers often get the name rules wrong, so read them as refusals and not as defaults:

| The call | Result |
|----------|--------|
| Your first registration, with `name` absent or empty | Rejected. There is no default name. An older client that does not send `name` has its first deploy refused. It does not get a nameless dex |
| `name` outside 1-16 ASCII alphanumeric bytes | Rejected. The check reads raw bytes: no `:`, no space, no punctuation, nothing outside ASCII. Fullwidth `ＧＲＡＤ` is not alphanumeric here and does not become `GRAD` |
| `name` equal to an existing dex name, ignoring case | Rejected. `grad` cannot be taken while `GRAD` exists |
| A later registration whose `name` differs from your stored name | Rejected. The name is write-once |
| A later registration that omits `name` | Accepted. Your stored name applies |
| `symbol` whose prefix before the first `:` is not your name | Rejected. The comparison is byte-exact. No trim, no case folding |
| `symbol` with an empty suffix, such as `GRAD:` | Rejected |

The name is write-once because it prefixes every market symbol on the dex, and a symbol can never be renamed. A renamed dex would leave all of its markets with the old prefix, and the prefix joins a position to its dex.

Every one of these checks runs before the node charges you. The name and symbol checks come before the node debits the Dutch-clock ask and before it takes an asset id. So a refused registration costs you nothing and consumes no id.

Your name is also your read key. Once the dex exists, its positions arrive under the key `name` in [`clearinghouse_state`](../info/account.md#clearinghouse_state). The dex reports the same string as `name` in [`perp_dexs`](../info/perpetuals.md#perp_dexs).

A governance listing symbol must not contain `:`. Governance lists core markets, not this action. A core symbol with a colon would claim a namespace of a deployer, so the node refuses such a listing. This keeps the core dex and every named dex disjoint, and one symbol never belongs to two dexes.

### Set the market oracle (retired) {#perp_set_oracle}

:::danger Retired. Do not call
The node refuses `perp_set_oracle` with:

```text
perp_set_oracle is retired: oracle_source_subset_mask has no reader. Use mip3SetOraclePx (action 210) for the deployer price push.
```

The action wrote the source-subset mask of the market, and nothing read the mask. The call returned OK and committed state changed, but the market priced exactly as before. An interface that lies is worse than a missing one.

Nothing replaces it, because it never did anything. The deployer price control is [`mip3_set_oracle_px`](#mip3_set_oracle_px) (action 210). That is a different action. It is the real price push, and it stays.

The `PerpSetOracle` signing type is not deleted, so every committed payload still decodes. Only the handler refuses. The mask field stays in market state, still with no reader, until the next re-genesis.
:::

### Set max leverage {#perp_set_leverage}

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `max_leverage` | uint8 | `1`-`50` | The max leverage |

### Set the fee tier {#perp_set_fee_tier}

The units differ inside one call. `taker_fee_dbps` and `maker_fee_dbps` are deci-bps (tenths of a bp). `deployer_fee_bps` is whole bps. A value that you move between them is off by ten. The governance ceilings `mip3_fee_ceiling_bps` and the deployer fee cap bound every fee.

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `taker_fee_dbps` | uint32 | at or below the ceiling | The taker fee, in deci-bps |
| `maker_fee_dbps` | uint32 | at or below the ceiling | The maker fee, in deci-bps |
| `deployer_fee_bps` | uint32 | at or below the deployer cap | Your cut, in whole bps |

### Set the maker rebate {#perp_set_maker_rebate}

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `rebate_bps` | uint16 | `0`-`2` | The maker rebate, in whole bps |

### Set the minimum order size {#perp_set_min_size}

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `min_order_size` | uint64 | `> 0` | The minimum size, in the size plane of the market |

### Set the open-interest cap {#perp_set_oi_cap}

`perp_set_oi_cap` sets the open-interest cap of your market. It is the cap that the chain enforces on a deployer market. The [capacity cap](../info/perpetuals.md#oi-cap-capacity) never applies to a deployer market, so this action is the one way to change the cap.

```json
{ "type": "perp_set_oi_cap", "params": { "asset": 1000, "oi_cap_units": 250000 } }
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `oi_cap_units` | uint64 | `>= 0` | The cap, in whole units of the base asset. It is not lots and not USD. `0` removes the cap |

The EIP-712 type string is frozen:

```text
MetaFluxTransaction:PerpSetOiCap(string metafluxChain,uint32 asset,uint64 oiCapUnits,uint64 nonce)
```

The cap uses whole units and not USD. The chain counts open interest in size units. A USD cap must convert through the price of the market, and on a deployer market you push that price. A lower push would then give a larger cap. A cap in whole units does not move with the price.

The cap uses whole units and not lots. The governance default [`max_oi`](../../../mip/mip-3.md#limits) is in whole units too, so one number means the same quantity in both places. The chain converts it to the size plane of the market once, at the write. Your [price push](#mip3_set_oracle_px) never changes the cap after that.

These rules apply:

- `0` removes the cap. The market is uncapped, and [`markets_meta`](../info/perpetuals.md#markets_meta) omits `oi_cap`.
- A cap below the current open interest closes no position. It changes no balance or margin. The chain then refuses an order that opens, extends or flips a position. It uses the [at-cap rules](../info/perpetuals.md#oi-cap-capacity) that every capped market uses. The at-cap sweep cancels resting orders that are priced through the mark, and it keeps orders that can only close.
- At activation, a market with no cap starts at the governance default `max_oi`. A market that has a cap keeps it. So after you send `0`, a later [deactivate and activate](#perp_activate_market) applies the default again. Send `0` again after the activation to keep the market uncapped.
- The deployer of the market can call it. So can a delegate that holds [bit 9](#perp_set_sub_deployers).

The node checks these rejections in this order:

| The call | Result |
|----------|--------|
| Governance has closed `mip3_enabled` | Rejected, `MIP-3 disabled by governance` |
| `asset` is not a deployer market. A core market that governance lists is not one | Rejected, `target is not a MIP-3 deployer perp market` |
| Sent by an address that is not the deployer and does not hold bit 9 | Rejected, `AUTH_UNAUTHORIZED` |
| `oi_cap_units` is too large to state in the size plane of the market | Rejected, `invalid parameters: oi_cap_units is too large for the market's size plane` |

### Activate and deactivate a market {#perp_activate_market}

`perp_activate_market` opens the market for trading. `perp_deactivate_market` closes it. Both take one field.

A full config is three settings: leverage, fee tier and min size. The oracle is not one of them. It was one until `perp_set_oracle` retired. That action was the only way to satisfy the fourth condition, so keeping it would have made every market that registered after the release impossible to activate.

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |

`perp_deactivate_market` takes the same one field. Its EIP-712 [typed-data](../exchange.md#signing) primary type is `MetaFluxTransaction:PerpDeactivateMarket`. Activation signs `MetaFluxTransaction:PerpActivateMarket`.

Deactivating cancels the book. It clears every resting order and every parked trigger on the market, in the same way that a governance delist halts a core market. Open positions are untouched. They stay open, and they still mark and fund. A deactivation cannot close a position for anyone.

The deployer of the market can call either action. A delegate can call it with [bit 5](#perp_set_sub_deployers) to activate and [bit 6](#perp_set_sub_deployers) to deactivate. Anyone else gets `AUTH_UNAUTHORIZED`.

The node refuses both actions unless the target is a MIP-3 deployer market (`target is not a MIP-3 deployer perp market`). It also refuses them unless governance leaves `mip3_enabled` open (`MIP-3 disabled by governance`). A core market that governance lists is not a deployer market, so this lane cannot reach one.

### Delegate to a sub-deployer {#perp_set_sub_deployers}

A grant names handlers, not a person. One bit is one deployer action, so you can hand out the price push without also handing out the fee rates. Two lanes lead into one stored grant.

Both lanes need the key of the deployer itself. Neither lane checks the permission bits. So a delegate that holds every bit still cannot grant or edit a delegation.

Lane 1 is `perp_set_sub_deployers`. It has an unchanged wire and an unchanged signing type. `add: true` grants every bit. `add: false` revokes the address.

```json
{
  "type": "perp_set_sub_deployers",
  "params": { "asset": 1000, "sub_deployer": "0x…", "add": true }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `sub_deployer` | address | `0x`-hex | The delegate |
| `add` | bool | | `true` grants all ten bits. `false` revokes |

Lane 2 is `perp_set_sub_deployer_perms`. It is new, and it grants an exact mask.

```json
{
  "type": "perp_set_sub_deployer_perms",
  "params": { "asset": 1000, "sub_deployer": "0x…", "permissions": 33 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | The target market |
| `sub_deployer` | address | `0x`-hex | The delegate |
| `permissions` | uint16 | `0`-`1023` | The bit mask. `0` revokes. `1023` is every bit |

| Bit | Value | Grants |
|-----|-------|--------|
| 0 | 1 | [`mip3_set_oracle_px`](#mip3_set_oracle_px), the price push |
| 1 | 2 | [`perp_set_leverage`](#perp_set_leverage) |
| 2 | 4 | [`perp_set_fee_tier`](#perp_set_fee_tier) |
| 3 | 8 | [`perp_set_maker_rebate`](#perp_set_maker_rebate) |
| 4 | 16 | [`perp_set_min_size`](#perp_set_min_size) |
| 5 | 32 | [`perp_activate_market`](#perp_activate_market) |
| 6 | 64 | `perp_deactivate_market` |
| 7 | 128 | `perp_set_fba_mode` |
| 8 | 256 | [`perp_register_asset`](#perp_register_asset) into this dex |
| 9 | 512 | [`perp_set_oi_cap`](#perp_set_oi_cap) |

`33` is bit 0 plus bit 5. It lets the delegate push the price and activate the market, and nothing else.

Your existing delegates keep every power. An address that is already in a committed delegate set reads as the full mask after the upgrade, as if you had granted all ten bits. An upgrade must not narrow in silence what anyone can already do. To narrow such a delegate, send lane 2 with the mask that you want to keep. The call drops the old all-powers grant.

A grant replaces and never merges. To take one power away, send the full mask that you want the delegate to end with. If you send only the bit that you want to remove, you grant that bit alone.

The node checks bit 8 against the dex and not against a market. It checks the other nine bits on the market that `asset` names. `perp_register_asset` has no market yet. So a sender that does not own the named dex can register into it if it holds bit 8 on at least one market of that dex. Three consequences follow:

- The delegate pays the Dutch-clock ask from its own free collateral.
- The `deployer` of the new market is the dex owner, never the delegate. A delegate does not become a deployer.
- The owner always registers the first market of a dex. No market carries the bit yet, so a delegate cannot bootstrap an empty dex.

These are the rules as rejections:

| The call | Result |
|----------|--------|
| Either lane sent by a sub-deployer | Rejected, `AUTH_UNAUTHORIZED`. Delegating needs the authority of the deployer itself, whatever bits the delegate holds. There is no bit for it, and there will not be one |
| `permissions` with any bit above bit 9 set | Rejected, `InvalidParams`. Bits 10-15 are reserved for handlers that a later release adds |
| `permissions: 0` | Accepted. It revokes. The node removes the address and does not store it with an empty mask |
| A handler that a delegate calls without the bit of that handler | Rejected, `AUTH_UNAUTHORIZED` |
| A second grant to the same address | Accepted. It replaces the mask |

### Push the deployer oracle price {#mip3_set_oracle_px}

A MIP-3 market prices from its own deployer, not from the validator oracle median. This action is that push. Only the market `deployer`, or a sub-deployer that holds [bit 0](#perp_set_sub_deployers), can call it. The market must already exist as a MIP-3 market.

```json
{ "type": "mip3_set_oracle_px", "params": { "asset": 1000, "px": "1250.500001" } }
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a MIP-3 market | The target market |
| `px` | string | `> 0`, at most `1000000000000` | The index price, as a whole-USDC decimal string |

`px` is a string, and the exact bytes that you send are the bytes that you sign. The node reads the raw string from your payload and puts it inside the signature digest without formatting it again. Send `"1250.500001"` and sign `"1250.500001"`. A client that parses the value to a number and prints it again as `"1250.5000010"` produces a different digest, and the node rejects the signature. `px` is on the whole-USDC plane, never the `1e8` book plane.

The EIP-712 type string is frozen:

```text
MetaFluxTransaction:Mip3SetOraclePx(string metafluxChain,uint32 asset,string px,uint64 nonce)
```

Both `asset` and `px` sit inside the digest on purpose. So the signature binds one exact (market, price) pair, and nobody can re-aim a replayed signature at another market or splice it onto another price.

The node applies these checks in order. The right-hand column is `error.message`, listed so that you can read a log. Its `code` is `PRECONDITION_FAILED`, `AUTH_UNAUTHORIZED` for `unauthorized`, or `INVALID_REQUEST` for an `invalid parameters` sentence. Never match on the text.

| Check | `error.message` on rejection |
|-------|------------------------------|
| Protocol feature active on this chain | `precondition failed: mip3_deployer_oracle feature not active` |
| Target is a MIP-3 market | `precondition failed: asset <id> is not a MIP-3 perp market` |
| Signer is the deployer or a registered sub-deployer | `unauthorized` |
| `px` is positive | `invalid parameters: oracle px must be positive` |
| `px` is at or below the ceiling | `invalid parameters: oracle px exceeds ceiling 1000000000000` |
| `px` is within ±10 % of the committed anchor | `invalid parameters: oracle px <px> outside the ±10% move band around committed anchor <anchor>` |

Every rejection returns before the node writes any state, so a refused push changes nothing. The push applies at commit, and this call waits for that commit. So the outcome is in the response that you already have.

The anchor of the ±10 % band is the last committed oracle price for the market, or the committed mark price of the market when no oracle price exists. The anchor is the committed value, so several pushes inside one block cannot compound. They all measure against the same anchor. When the market has neither, as on the first push on a new market, there is no anchor to compare against. The node accepts any price in `(0, ceiling]` once. Choose that first price with care, because every later push is chained to it.

The first push changes the margin regime of the market. It is the moment that the market becomes deployer-priced. The node migrates existing cross-margin positions on the market into their own strict-isolated buckets, and this conserves value per account. Every position that opens afterwards is strict-isolated. See [MIP-3 oracle](../../../mip/mip-3.md#oracle).

Keep pushing. If the feed ages past the staleness window (default 60,000 ms, governance-tunable), the market turns reduce-only for opens until a fresh push lands. Closing orders always pass. Monitor the window with the operator-lane [`mip3_deployer_oracle`](../info.md#operator-reads) read.

:::info
`mip3_deployer_oracle` is a per-chain feature. Check it before you rely on it. It is active from genesis on a chain that started fresh. It is dormant on any other chain until a two-thirds stake `ArmFeatures` vote arms it. While it is dormant, the node refuses this action with `mip3_deployer_oracle feature not active`. That is a precondition error, not an unknown-action error. Read `feature_active` from the operator-lane [`mip3_deployer_oracle`](../info.md#operator-reads) read on the network that you target.
:::

Liquidation on a deployed market follows the backstop settings of that market. See [MIP-3 liquidation](../../../mip/mip-3.md#liquidation). A market that prices from its own oracle defaults to `Disabled`.
