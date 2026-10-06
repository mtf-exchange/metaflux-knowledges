---
description: "The permissionless spot deploy flow: register a spot token, list a pair and seed the genesis supply."
---

# Spot deployment actions (MIP-1) {#spot-deployment-actions}

These actions register a spot token, list a pair and mint the genesis supply.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

This is the permissionless spot deployer lane. It is live on testnet. See the
[catalog entry](../exchange.md#spot-deployment) for the fee model, and
[MIP-1](../../../mip/mip-1.md) for the concepts.

All six actions are sender-authorized. The recovered signer is the deployer, no
action has an `owner`, and an agent signature acts for the account of the agent.
The body goes under `action.params`.

**Governance off-switch.** `mip1_enabled` closes the whole lane. When governance
sets it to `false`, every action here fails with
`MIP-1 spot deployment disabled by governance`.

### Deploy rate limits {#deploy-rate-limits}

Two parameters that governance sets limit this lane. Validators vote on both
through [validator governance](../info/governance.md):

| Param | Unit | Binds |
|-------|------|-------|
| `mip3_max_deploys_per_epoch` | count | New registrations in each *deploy epoch*. A deploy epoch is a fixed window of 100,000 committed rounds, about 3 hours at the current cadence. It is not the staking epoch. The count includes [`spot_register_token`](#spot_register_token), [`spot_register_pair`](#spot_register_pair) and perp registration. `0` means no cap. It never means blocked |
| `mip3_fee_ceiling_bps` | **bps** | The highest market fee that a deployer can set |

:::warning
**`0` means no cap. It does not mean blocked.** Both parameters are `0` on the
live network today, and `0` leaves the lane fully open. These parameters control the
rate. The off-switches are `mip1_enabled` and `mip3_enabled`. Never read a `0`
cap as "deployment is closed".
:::

**Unit trap.** `mip3_fee_ceiling_bps` is in basis points. `taker_fee_dbps` and
`maker_fee_dbps` on the wire are in deci-bps (tenths of a basis point). The two
units differ by a factor of 10. The chain rejects a fee that is above the
per-market cap of `500` deci-bps (50 bps). When the bps ceiling is not zero, it
also rejects a fee above that ceiling.

Both parameters apply at admission.

---

### Register a spot token {#spot_register_token}

This action registers a new spot token and allocates its asset id. It creates
the token record only. The token has no trading pair and no supply yet. The
action charges the `TokenRegister` Dutch-clock ask at commit.

```json
{
  "type": "spot_register_token",
  "params": {
    "symbol": "ACME",
    "sz_decimals": 2,
    "wei_decimals": 8,
    "max_deploy_fee": "500"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `symbol` | string | non-empty, ≤ 32 chars, not already in use | Token symbol. The chain checks it against every existing spot symbol and perp symbol |
| `sz_decimals` | uint8 | `0`–`6` | Display and size precision. The chain rejects a value above `6` |
| `wei_decimals` | uint8 | `1`–`18` | Native token decimals. See the two notices below |
| `max_deploy_fee` | decimal string | `≥ 0` | The highest deploy fee that you accept, in whole USDC. Send it as a JSON string |

:::info
**`wei_decimals = 0` is now rejected. Live.** A token registered with `0` loses
value when governance binds an EVM contract to it. The Core-to-EVM path then
divides by `10^8` and destroys any balance below one whole token. Admission
refuses `0`. It does not clamp the value, because you signed the declared
precision. This rejection cannot repair a token that was registered with `0`
before the rejection landed.
:::

:::warning
**Admission refuses `wei_decimals` above `18` with `wei_decimals exceeds 18`.**
`wei_decimals` sets the scale of every credit on the
[Core-to-EVM lane](../../../evm/core-evm-transfers.md), and no real ERC-20 is
above `18`. This rejection does not repair a token that was registered above
`18` before the rejection landed.
:::

**Gating.** The chain rejects the action in these cases:

- `symbol` is empty, longer than 32 characters, or already used by a spot
  token, spot pair or perp market.
- `sz_decimals` is above `6`.
- `wei_decimals` is `0`.
- `max_deploy_fee` is negative.
- The current ask is above `max_deploy_fee`.
- Your free collateral is less than the ask.
- Governance has closed the lane.

The fee comes out of free collateral. An account whose value is committed to
open positions is refused, even when its total value covers the ask.

**A deployer cannot declare its own token canonical.** The wire has no
`is_canonical`, no `evm_contract` and no `evm_extra_wei_decimals` field. A
deployer never binds its own EVM contract. That binding is a governance action.

**Response.** The [`202 Accepted`](../exchange.md#202-accepted--non-order-admission)
admission envelope. The allocated asset id appears on
[`/info` `spot_meta`](../info/spot.md). Ids for this lane start at `1000`.

---

### List a spot trading pair {#spot_register_pair}

This action lists a `(base, quote)` pair over two registered tokens and
allocates its pair id. The pair starts inactive and has no configuration. The
action charges the `SpotPairDeploy` Dutch-clock ask at commit.

```json
{
  "type": "spot_register_pair",
  "params": {
    "base": 1000,
    "quote": 100,
    "name": "ACME/USDC",
    "max_deploy_fee": "500"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `base` | uint32 | a registered token, `≠ quote` | Base token id |
| `quote` | uint32 | **must be USDC** | Quote token id |
| `name` | string | not already in use by another pair | Pair display name |
| `max_deploy_fee` | decimal string | `≥ 0` | The highest deploy fee that you accept, in whole USDC |

:::info
**The quote must be USDC.** The chain collects spot fees in the quote asset.
The fees drain into shared pools that the buyback settles as USDC. With a
non-USDC quote, a destroyed non-USDC fee would mint USDC one-for-one. The chain
refuses a non-USDC quote at listing and again at activation.
:::

**Gating.** The chain rejects the action in these cases:

- `base` or `quote` is not registered.
- `base == quote`.
- `quote` is not USDC.
- `name` is the same as the name of an existing pair.
- `max_deploy_fee` is negative.
- The ask is above `max_deploy_fee`.
- Your free collateral is less than the ask.
- Governance has closed the lane.

**Response.** The `202 Accepted` admission envelope. The chain creates an empty
order book with the pair. Trading paths see the pair as soon as it is
configured and activated.

---

### Set pair fees and minimum notional {#spot_set_pair_params}

This action sets the maker and taker fees of the pair and its minimum order
notional in one signed intent. A pair needs both before it can be activated.
Only the deployer can send it. It charges no fee.

```json
{
  "type": "spot_set_pair_params",
  "params": {
    "pair": 1001,
    "taker_fee_dbps": 30,
    "maker_fee_dbps": 10,
    "min_notional_cents": 1000
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | a pair you deployed | Spot pair id |
| `taker_fee_dbps` | uint32 | `< 1000`, and `≤ 500` | Taker fee in **deci-bps** (tenths of a bp) |
| `maker_fee_dbps` | uint32 | `< 1000`, and `≤ 500` | Maker fee in **deci-bps** |
| `min_notional_cents` | uint64 | `1`–`100000000` | Minimum order notional, in USDC cents |

**Fees are in deci-bps.** `taker_fee_dbps: 30` is 3 basis points, not 30.
Admission refuses a value of `1000` or more. The committed cap is `500`
(50 bps) on each leg.

**Gating.** The chain rejects the action in these cases:

- You are not the deployer of the pair.
- The target is a token registration and not a trading pair.
- A fee is at or above `1000` deci-bps, or above the `500` cap.
- `min_notional_cents` is `0`, or above `100000000` cents.

The chain refuses a `0` floor, because the pair could then activate with no
dust floor. The upper cap stops one mis-signed intent from making an active
pair impossible to trade. A non-zero `mip3_fee_ceiling_bps` also applies here.
See [Deploy rate limits](#deploy-rate-limits).

---

### Open or close a pair {#spot_set_pair_active}

This action switches the pair between accepting and refusing new orders. Only
the deployer can send it. It charges no fee.

```json
{
  "type": "spot_set_pair_active",
  "params": { "pair": 1001, "active": true }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | a pair you deployed | Spot pair id |
| `active` | bool | — | `true` opens the pair, `false` closes it |

**Opening** requires a fully configured pair. A fee tier and a minimum notional
must already be set by [`spot_set_pair_params`](#spot_set_pair_params), and the
quote must be USDC. Where a trading grid is required, the pair also needs a
non-zero tick size and lot size.

**Closing refunds every resting order.** Deactivation drains the book of the
pair. It returns the locked escrow of each resting order to its owner. No
amount stays in a reserved balance. Existing balances do not change. Only
resting orders are cleared.

**Gating.** The chain rejects the action in these cases:

- You are not the deployer of the pair.
- The action opens a pair that is not fully configured.
- The quote is not USDC.
- A required trading grid is missing.

---

### Stage genesis holder rows {#spot_seed_holders}

This action stages a genesis distribution for a token that you deployed. It
writes no balances and no supply. It only records the intended rows. You can
send it more than once, so a large distribution can use several signed calls.

```json
{
  "type": "spot_seed_holders",
  "params": {
    "asset": 1000,
    "holders": ["0x1111...", "0x2222..."],
    "amounts": ["1000000", "250000.5"]
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a token you deployed, `≥ 1000` | The spot token to stage |
| `holders` | array of address strings | 1–128 per call, ≤ 4096 per token | Recipient addresses, parallel with `amounts` |
| `amounts` | array of decimal strings | each `> 0` | Whole-unit amounts, parallel with `holders`. Send them verbatim as JSON strings |

**You can stage a holder once only.** The chain rejects a repeat address, in
one call or across calls. If repeats added up silently, a distribution that
you did not intend could satisfy the [checksum](#spot_finalize_supply).

**Gating.** The chain rejects the action in these cases:

- `holders` and `amounts` have different lengths.
- `holders` is empty or has more than 128 rows.
- The token already has final supply.
- You are not the deployer of the token.
- An amount is zero or negative.
- An amount is finer than the `wei_decimals` of the token.
- A holder repeats.
- More than 64 tokens hold a staged genesis at the same time.
- The token would have more than 4096 staged rows.
- The running total would pass the supply ceiling of `1000000000000` whole
  units.

The chain refuses USDC and every reserved core asset id. This lane can only
mint tokens that were registered through it.

**Response.** The `202 Accepted` admission envelope. The committed outcome
reports the total number of holders staged for the token.

---

### Mint the genesis supply {#spot_finalize_supply}

This action seals the token. It sums every staged row and compares the total
with your `max_supply` checksum. It then credits all holders and sets the total
supply in one step. This is the only action in the lane that creates supply. It
succeeds once for each token.

```json
{
  "type": "spot_finalize_supply",
  "params": { "asset": 1000, "max_supply": "1250000.5" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a token you deployed with staged rows | The spot token to seal |
| `max_supply` | decimal string | must equal the staged total exactly | Checksum over every staged row, in whole units. Send it verbatim as a JSON string |

:::warning
**`max_supply` is a checksum, never a target.** The staged rows define the
distribution, not `max_supply`. The checksum proves that your
`spot_seed_holders` sequence arrived complete. Every staged amount is positive.
A dropped or truncated staging call lowers the total, the comparison fails, and
the mint refuses. Never derive your seeds from `max_supply`. Derive
`max_supply` from the sum of your seeds.
:::

**Gating.** The chain rejects the action in these cases:

- The token has no staged genesis.
- You are not the deployer of record.
- The supply is already final.
- `max_supply` does not equal the staged total.
- The total is not positive, or is above `1000000000000` whole units.

**Response.** The `202 Accepted` admission envelope. The committed outcome
reports the minted total. The chain records the total supply from the derived
sum, not from the string that you sent. Two numerically equal strings commit
identical bytes. After this action succeeds, the chain clears the staged rows
of the token and no further mint is possible.

---
