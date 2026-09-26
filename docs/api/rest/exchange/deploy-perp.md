---
description: "Deploy a perpetual market: the Dutch-clock deploy fee, the staking bond, and the leverage, fee and oracle configuration a deployer sets before activating it."
---

# Perp deployment actions (MIP-3) {#perp-deployment-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

:::warning
**Confirm the lane against the network you target.** The ten deploy actions and
[`mip3_set_oracle_px`](#mip3_set_oracle_px) are built. What varies by network is
whether the running build carries them and whether the governance off-switch
`mip3_enabled` is open, so a call can still be refused. Build against these
shapes now; probe one call on your target network before you depend on it.

[`perp_set_oracle`](#perp_set_oracle) is RETIRED: the node refuses it.
[`perp_set_sub_deployer_perms`](#perp_set_sub_deployers) has **shipped** — the
node accepts it now. [`perp_set_oi_cap`](#perp_set_oi_cap) is **not live yet**:
it ships with the node release after 2026-10-01. Every other wire shape and
signing type on this page is unchanged.
:::

Permissionless perp market deployment, plus the deployer price push the deployed
market runs on. See the [catalog entry](../exchange.md#perp-deployment) for the lane at a
glance. Each action is sender-authorized: the recovered signer is the
deployer. After `perp_register_asset`, only that market's deployer or one of its
sub-deployers may call the rest. A sub-deployer holds one permission bit per
handler — see [delegation](#perp_set_sub_deployers).

**What a deploy requires.** The deployer must hold at least the staked-MTF floor
(50,000 by default, governance-tunable), and pays the Dutch-clock ask at
registration from free collateral. **No action carries a bid** — a non-zero bid is
refused. A registered market lands in the deployer's own dex with an asset id at
or above 1000, never in the primary dex.

**Rate limit.** Registrations are counted against `mip3_max_deploys_per_epoch`
per deploy epoch — see [Limits](../../../mip/mip-3.md#limits). `0` means uncapped.

### Register a perp asset {#perp_register_asset}

This action also CREATES your dex, on your first call. That is why it carries the
dex name: there is no separate create-dex action.

```json
{ "type": "perp_register_asset", "params": { "symbol": "WIF:PERP", "decimals": 8, "name": "WIF" } }
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `symbol` | string | `<name>:<suffix>` | Market symbol. The part before the first `:` must equal your dex name, byte for byte, and the suffix must not be empty |
| `decimals` | uint8 | `0` keeps the default of 8 | Token decimals |
| `name` | string | 1-16 ASCII alphanumeric bytes | Your dex NAME. **Required on your first registration.** Omit it, or repeat it exactly, on every later one |

**The name rules, written as rejections.** These are the rows a caller gets
wrong, so read them as refusals, not as defaults.

| The call | Result |
|----------|--------|
| Your FIRST registration, with `name` absent or empty | **Rejected.** There is no default name. An older client that does not send `name` has its first deploy refused; it does not get a nameless dex |
| `name` outside 1-16 ASCII alphanumeric bytes | **Rejected.** The check reads raw bytes: no `:`, no space, no punctuation, nothing outside ASCII. Fullwidth `ＧＲＡＤ` is not alphanumeric here and does not become `GRAD` |
| `name` equal to an existing dex name, ignoring case | **Rejected.** `grad` cannot be taken while `GRAD` exists |
| A later registration whose `name` differs from your stored name | **Rejected.** The name is write-once |
| A later registration that omits `name` | **Accepted.** Your stored name applies |
| `symbol` whose prefix before the first `:` is not your name | **Rejected.** The comparison is byte-exact. No trim, no case folding |
| `symbol` with an empty suffix, such as `GRAD:` | **Rejected** |

**Why the name is write-once.** It prefixes every market symbol on the dex, and a
symbol can never be renamed. A renamed dex would leave all of its markets
carrying the old prefix, and the prefix is what joins a position to its dex.

**Every one of these checks runs BEFORE you are charged.** The name and symbol
checks come before the Dutch-clock ask is debited and before an asset id is
taken, so a refused registration costs you nothing and consumes no id.

**Your name is also your read key.** Once the dex exists, its positions arrive
under the key `name` in
[`clearinghouse_state`](../info/account.md#clearinghouse_state), and the dex reports the
same string as `name` in [`perp_dexs`](../info/perpetuals.md#perp_dexs).

**A governance listing symbol must not contain `:`.** Core markets are listed by
governance, not by this action, and a core symbol carrying a colon would claim a
deployer's namespace. Such a listing is refused. This keeps the core dex and
every named dex disjoint, so one symbol never belongs to two dexes.

### Set the market oracle — RETIRED {#perp_set_oracle}

:::danger Retired — do not call
The node refuses `perp_set_oracle` with:

```text
perp_set_oracle is retired: oracle_source_subset_mask has no reader. Use mip3SetOraclePx (action 210) for the deployer price push.
```

**Why.** The action wrote the market's source-subset mask, and nothing read the
mask. The call returned OK, committed state changed, and the market priced
exactly as before. An interface that lies is worse than a missing one.

**Nothing replaces it, because it never did anything.** The deployer price
control is [`mip3_set_oracle_px`](#mip3_set_oracle_px) (action 210). That is a
different action, it is the real price push, and it stays.

The `PerpSetOracle` signing type is not deleted, so every committed payload still
decodes. Only the handler refuses. The mask field stays in market state, still
with no reader, until the next re-genesis.
:::

### Set max leverage {#perp_set_leverage}

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `max_leverage` | uint8 | `1`-`50` | Max leverage |

### Set the fee tier {#perp_set_fee_tier}

**The units differ inside one call.** `taker_fee_dbps` and `maker_fee_dbps` are
DECI-bps (tenths of a bp); `deployer_fee_bps` is whole bps. A value moved between
them is off by ten. Every fee is bounded by the governance ceilings
`mip3_fee_ceiling_bps` and the deployer fee cap.

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `taker_fee_dbps` | uint32 | at or below the ceiling | Taker fee, DECI-bps |
| `maker_fee_dbps` | uint32 | at or below the ceiling | Maker fee, DECI-bps |
| `deployer_fee_bps` | uint32 | at or below the deployer cap | Your cut, whole bps |

### Set the maker rebate {#perp_set_maker_rebate}

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `rebate_bps` | uint16 | `0`-`2` | Maker rebate, whole bps |

### Set the minimum order size {#perp_set_min_size}

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `min_order_size` | uint64 | `> 0` | Minimum size, in the market's size plane |

### Set the open-interest cap {#perp_set_oi_cap}

:::caution
**Not live yet.** Ships with the node release after 2026-10-01. Until then, the
live node answers `unknown variant` for `perp_set_oi_cap`, the same answer a
made-up action gets. Build against this shape now. Send it after the release.
:::

You set the open-interest cap of your market. It is the cap the chain enforces
on a deployer market. The
[capacity cap](../info/perpetuals.md#oi-cap-capacity) never applies to a
deployer market, so this action is the one way to change the cap.

```json
{ "type": "perp_set_oi_cap", "params": { "asset": 1000, "oi_cap_units": 250000 } }
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `oi_cap_units` | uint64 | `>= 0` | The cap, in **whole units** of the base asset. Not lots, not USD. `0` removes the cap |

EIP-712 type string, frozen:

```text
MetaFluxTransaction:PerpSetOiCap(string metafluxChain,uint32 asset,uint64 oiCapUnits,uint64 nonce)
```

**Why whole units, not USD.** The chain counts open interest in size units. A
USD cap must convert through the market's price, and on a deployer market you
push that price. A lower push would then give a larger cap. A cap in whole
units does not move with the price.

**Why whole units, not lots.** The governance default
[`max_oi`](../../../mip/mip-3.md#limits) is in whole units too, so one number
means the same quantity in both places. The chain converts it to the market's
size plane once, at the write. Your
[price push](#mip3_set_oracle_px) never changes the cap after that.

**The rules.**

- `0` removes the cap. The market is uncapped, and
  [`markets_meta`](../info/perpetuals.md#markets_meta) omits `oi_cap`.
- A cap below the current open interest closes no position. It changes no
  balance or margin. The chain then refuses an order that opens, extends or
  flips a position, by the
  [at-cap rules](../info/perpetuals.md#oi-cap-capacity) every capped market
  uses. The at-cap sweep cancels resting orders priced through the mark, and it
  keeps orders that can only close.
- At activation, a market with no cap starts at the governance default
  `max_oi`. A market that has a cap keeps it. So after you send `0`, a later
  [deactivate and activate](#perp_activate_market) applies the default again.
  Send `0` again after the activation to keep the market uncapped.
- The market's deployer may call it, or a delegate holding
  [bit 9](#perp_set_sub_deployers).

**The rules, as rejections**, in the order the node checks them.

| The call | Result |
|----------|--------|
| Governance has closed `mip3_enabled` | **Rejected**, `MIP-3 disabled by governance` |
| `asset` is not a deployer market. A core market listed by governance is not one | **Rejected**, `target is not a MIP-3 deployer perp market` |
| Sent by an address that is not the deployer and does not hold bit 9 | **Rejected**, `AUTH_UNAUTHORIZED` |
| `oi_cap_units` is too large to state in the market's size plane | **Rejected**, `invalid parameters: oi_cap_units is too large for the market's size plane` |

### Activate and deactivate a market {#perp_activate_market}

`perp_activate_market` opens the market for trading; `perp_deactivate_market`
closes it. Both take one field.

**Full config is three settings: leverage, fee tier, min size.** The oracle is
not one of them. It was, until `perp_set_oracle` retired — that action was the
only way to satisfy the fourth condition, so keeping it would have made every
market registered after the release impossible to activate.

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |

`perp_deactivate_market` takes the same one field. Its EIP-712
[typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:PerpDeactivateMarket`; activation signs
`MetaFluxTransaction:PerpActivateMarket`.

**Deactivating CANCELS the book.** It clears every resting order and every parked
trigger on the market, the same way a governance delist halts a core market. Open
positions are untouched: they stay open, and they still mark and fund. Deactivate
cannot close a position for anyone.

**Who may call either one.** The market's deployer, or a delegate holding
[bit 5](#perp_set_sub_deployers) to activate and [bit 6](#perp_set_sub_deployers)
to deactivate. Anyone else reads `AUTH_UNAUTHORIZED`.

**Both are refused unless the target is a MIP-3 deployer market**
(`target is not a MIP-3 deployer perp market`), and unless governance leaves
`mip3_enabled` open (`MIP-3 disabled by governance`). A core market listed by
governance is not a deployer market, so this lane cannot reach one.

### Delegate to a sub-deployer {#perp_set_sub_deployers}

**A grant names HANDLERS, not a person.** One bit is one deployer action, so you
can hand out the price push without also handing out the fee rates. There are two
lanes into one stored grant.

**Both lanes need the deployer's own key.** Neither checks the permission bits,
so a delegate holding every bit still cannot grant or edit a delegation.

**Lane 1 — `perp_set_sub_deployers`.** Unchanged wire, unchanged signing type.
`add: true` grants **every** bit; `add: false` revokes the address.

```json
{
  "type": "perp_set_sub_deployers",
  "params": { "asset": 1000, "sub_deployer": "0x…", "add": true }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `sub_deployer` | address | `0x`-hex | The delegate |
| `add` | bool | | `true` grants all ten bits, `false` revokes |

**Lane 2 — `perp_set_sub_deployer_perms`.** New. It grants an exact mask.

```json
{
  "type": "perp_set_sub_deployer_perms",
  "params": { "asset": 1000, "sub_deployer": "0x…", "permissions": 33 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a market you deployed | Target market |
| `sub_deployer` | address | `0x`-hex | The delegate |
| `permissions` | uint16 | `0`-`1023` | Bit mask. `0` revokes. `1023` is every bit |

| Bit | Value | Grants |
|-----|-------|--------|
| 0 | 1 | [`mip3_set_oracle_px`](#mip3_set_oracle_px) — the price push |
| 1 | 2 | [`perp_set_leverage`](#perp_set_leverage) |
| 2 | 4 | [`perp_set_fee_tier`](#perp_set_fee_tier) |
| 3 | 8 | [`perp_set_maker_rebate`](#perp_set_maker_rebate) |
| 4 | 16 | [`perp_set_min_size`](#perp_set_min_size) |
| 5 | 32 | [`perp_activate_market`](#perp_activate_market) |
| 6 | 64 | `perp_deactivate_market` |
| 7 | 128 | `perp_set_fba_mode` |
| 8 | 256 | [`perp_register_asset`](#perp_register_asset) into this dex |
| 9 | 512 | [`perp_set_oi_cap`](#perp_set_oi_cap). **Not live yet:** a live node refuses bit 9 until the release after 2026-10-01 |

`33` is bit 0 plus bit 5: push the price and activate the market, nothing else.

**Your existing delegates keep every power.** An address already in a committed
delegate set reads as the full mask after the upgrade, as if you had granted all
ten bits. An upgrade must not silently narrow what anyone can already do. To
narrow such a delegate, send lane 2 with the mask you want to keep; the old
all-powers grant is dropped in the same call.

**A grant REPLACES, it never merges.** To take one power away, send the full mask
you want the delegate to end with. Sending only the bit you want removed grants
that bit alone.

**Bit 8 is checked against the dex, not against a market.** The other nine bits
are checked on the market named by `asset`. `perp_register_asset` has no market
yet, so a sender that does not own the named dex may register into it if it holds
bit 8 on at least one market of that dex. Three consequences:

- The delegate pays the Dutch-clock ask from **its own** free collateral.
- The new market's `deployer` is the **dex owner**, never the delegate. A
  delegate does not become a deployer.
- A dex's FIRST market is always registered by its owner. No market carries the
  bit yet, so a delegate cannot bootstrap an empty dex.

**The rules, as rejections.**

| The call | Result |
|----------|--------|
| Either lane sent by a sub-deployer | **Rejected**, `AUTH_UNAUTHORIZED`. Delegating needs the deployer's own authority, whatever bits the delegate holds. There is no bit for it, and there will not be one |
| `permissions` with any bit above bit 9 set | **Rejected**, `InvalidParams`. Bits 10-15 are reserved for handlers added later. **Not live yet:** until the release after 2026-10-01, bit 9 is refused too |
| `permissions: 0` | **Accepted.** It revokes. The address is removed, not stored with an empty mask |
| A handler called by a delegate that lacks that handler's bit | **Rejected**, `AUTH_UNAUTHORIZED` |
| A second grant to the same address | **Accepted.** It replaces the mask |

### Push the deployer oracle price {#mip3_set_oracle_px}

A MIP-3 market prices from **its own deployer**, not from the validator oracle
median. This action is that push. Only the market `deployer`, or a sub-deployer
holding [bit 0](#perp_set_sub_deployers), may call it, and the market **must
already exist** as a MIP-3 market.

```json
{ "type": "mip3_set_oracle_px", "params": { "asset": 1000, "px": "1250.500001" } }
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a MIP-3 market | Target market |
| `px` | string | `> 0`, at most `1000000000000` | Index price, **whole-USDC decimal string** |

**`px` is a string, and the exact bytes you send are the bytes you sign.** The
node reads the raw string from your payload and puts it inside the signature
digest without re-formatting it. Send `"1250.500001"` and sign `"1250.500001"` —
a client that parses the value to a number and re-prints it as `"1250.5000010"`
produces a different digest, and the node rejects the signature. `px` is on the
whole-USDC plane, never the `1e8` book plane.

EIP-712 type string, frozen:

```text
MetaFluxTransaction:Mip3SetOraclePx(string metafluxChain,uint32 asset,string px,uint64 nonce)
```

Both `asset` and `px` sit **inside** the digest on purpose. The signature
therefore binds one exact (market, price) pair, so a replayed signature cannot be
re-aimed at another market or spliced onto another price.

**Validation, in the order the node applies it.**

The right-hand column is `error.message`, listed so you can read a log. Its
`code` is `PRECONDITION_FAILED`, `AUTH_UNAUTHORIZED` for `unauthorized`, or
`INVALID_REQUEST` for an `invalid parameters` sentence. **Never match on the
text.**

| Check | `error.message` on rejection |
|-------|------------------------------|
| Protocol feature active on this chain | `precondition failed: mip3_deployer_oracle feature not active` |
| Target is a MIP-3 market | `precondition failed: asset <id> is not a MIP-3 perp market` |
| Signer is the deployer or a registered sub-deployer | `unauthorized` |
| `px` is positive | `invalid parameters: oracle px must be positive` |
| `px` is at or below the ceiling | `invalid parameters: oracle px exceeds ceiling 1000000000000` |
| `px` is within **±10 %** of the committed anchor | `invalid parameters: oracle px <px> outside the ±10% move band around committed anchor <anchor>` |

Every rejection returns **before** any state is written, so a refused push
changes nothing. The push is applied at commit, and this call waits for that
commit, so the outcome is in the response you already have.

**The ±10 % band, and the one push that escapes it.** The anchor is the last
**committed** oracle price for the market, or the market's committed mark price
when no oracle price exists. Because the anchor is the committed value, several
pushes inside one block cannot compound: they all measure against the same
anchor. When the market has neither — the **first push on a new market** — there
is no anchor to compare against, so any price in `(0, ceiling]` is accepted once.
Choose that first price carefully; every later push is chained to it.

**The first push changes the market's margin regime.** It is the moment the
market becomes deployer-priced. Existing cross-margin positions on the market are
migrated into their own strict-isolated buckets, value-conserving per account,
and every position opened afterwards is strict-isolated. See
[MIP-3 — oracle](../../../mip/mip-3.md#oracle).

**Keep pushing.** If the feed ages past the staleness window (default
**60,000 ms**, governance-tunable), the market turns **reduce-only for opens**
until a fresh push lands. Closing orders always pass. Monitor the window with
the operator-lane [`mip3_deployer_oracle`](../info.md#operator-reads) read.

:::info
**`mip3_deployer_oracle` is a per-chain feature — check before you rely on it.**
It is active from genesis on a chain that started fresh, and dormant on any other
chain until a two-thirds stake `ArmFeatures` vote arms it. While it is dormant
this action is refused with `mip3_deployer_oracle feature not active`, which is a
**precondition** error, not an unknown-action error. Read `feature_active` from
the operator-lane [`mip3_deployer_oracle`](../info.md#operator-reads) read on the network you
target.
:::

**Liquidation on a deployed market follows the market's own backstop settings** —
see [MIP-3 liquidation](../../../mip/mip-3.md#liquidation). A market that prices from
its own oracle defaults to `Disabled`.
