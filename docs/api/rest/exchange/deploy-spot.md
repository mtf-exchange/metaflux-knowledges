---
description: "Register a spot token, list a pair, and seed its book — the permissionless spot deploy flow."
---

# Spot deployment actions (MIP-1) {#spot-deployment-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

The permissionless spot deployer lane. **Live on testnet.** See the
[catalog entry](../exchange.md#spot-deployment) for the fee model, and
[MIP-1](../../../mip/mip-1.md) for the concepts.

All six are **sender-authorized**: the recovered signer is the deployer, no
action carries an `owner`, and an agent signature acts for the agent's own
account. The body goes under `action.params`.

**Governance off-switch.** `mip1_enabled` closes the whole lane. When governance
sets it `false`, every action here rejects with
`MIP-1 spot deployment disabled by governance`.

### Deploy rate limits {#deploy-rate-limits}

Two governance-set numbers bound this lane. Both are voted through
[validator governance](../info/governance.md):

| Param | Unit | Binds |
|-------|------|-------|
| `mip3_max_deploys_per_epoch` | count | New registrations per **deploy epoch** — a fixed window of 100,000 committed rounds, about 3 hours at the current cadence, NOT the staking epoch. Counted across [`spot_register_token`](#spot_register_token), [`spot_register_pair`](#spot_register_pair) and perp registration. `0` means uncapped, never blocked |
| `mip3_fee_ceiling_bps` | **bps** | The highest market fee a deployer may set |

:::warning
**`0` means uncapped, not blocked.** Both params are `0` on the live network
today, and `0` leaves the lane fully open. These are **rate** controls; the
**off-switches** are `mip1_enabled` and `mip3_enabled`. Never read a `0` cap as
"deployment is closed".
:::

**Unit trap.** `mip3_fee_ceiling_bps` is in **basis points**, while
`taker_fee_dbps` / `maker_fee_dbps` on the wire are in **deci-bps** (tenths of a
basis point). They differ by a factor of 10. A fee is rejected if it exceeds
either the deci-bps per-market cap of `500` (50 bps) or the bps ceiling, whenever
that ceiling is non-zero.

**Enforcement of both params activates in the next release.** Today they are
served on `/info` and bind nothing.

---

### Register a spot token {#spot_register_token}

Register a fresh spot token and allocate its asset id. This creates the token
record only — it has no trading pair and no supply yet. Charges the
`TokenRegister` Dutch-clock ask at commit.

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
| `symbol` | string | non-empty, ≤ 32 chars, not already in use | Token symbol. Checked against every existing spot **and** perp symbol |
| `sz_decimals` | uint8 | `0`–`6` | Display / size precision. A value above `6` is rejected |
| `wei_decimals` | uint8 | `1`–`255` today; **`1`–`18` from the next release** | Native token decimals. See the two notices below |
| `max_deploy_fee` | decimal string | `≥ 0` | Highest deploy fee you accept, in whole USDC. Sent as a JSON string |

:::info
**`wei_decimals = 0` is now rejected. LIVE.** A token registered with `0` is
lossy the moment governance binds an EVM contract to it: the Core-to-EVM path
then divides by `10^8` and destroys any balance below one whole token. Admission
refuses `0` outright — it is not clamped, because you signed the declared
precision. This reject cannot repair a token registered with `0` before it landed.
:::

:::warning
**An upper bound of `18` is coming. NOT LIVE YET.** Today admission enforces only
the `≥ 1` floor, so a `wei_decimals` above `18` is accepted and stored. Do not
use one. `wei_decimals` sets the scale of every credit on the
[Core-to-EVM lane](../../../evm/core-evm-transfers.md), and no real ERC-20 exceeds
`18`; a value above it has no valid use and a later release will refuse it at
admission. A token already registered above `18` is not repaired by that release.
Register in `1`–`18`.
:::

**Gating.** Rejected if `symbol` is empty, longer than 32 characters, or already
used by a spot token, spot pair or perp market; if `sz_decimals` exceeds `6`; if
`wei_decimals` is `0`; if `max_deploy_fee` is negative; if the current ask
exceeds `max_deploy_fee`; if your free collateral is below the ask; or if
governance has closed the lane. The fee comes out of **free** collateral, so an
account whose value is committed to open positions is refused even when its total
value covers the ask.

**You cannot self-declare a canonical token.** The wire carries no
`is_canonical`, no `evm_contract` and no `evm_extra_wei_decimals` field. A
deployer never binds its own EVM contract; that binding is a governance action.

**Response.** The [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission
envelope. The allocated asset id appears on
[`/info` `spot_meta`](../info/spot.md); ids for this lane start at `1000`.

---

### List a spot trading pair {#spot_register_pair}

List a `(base, quote)` pair over two registered tokens and allocate its pair id.
The pair starts **inactive** and unconfigured. Charges the `SpotPairDeploy`
Dutch-clock ask at commit.

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
| `max_deploy_fee` | decimal string | `≥ 0` | Highest deploy fee you accept, in whole USDC |

:::info
**The quote must be USDC.** Spot fees are collected in the quote asset and drain
into shared pools that the buyback settles **as USDC**. A non-USDC quote would
let a destroyed non-USDC fee mint USDC one-for-one, so it is refused at listing
and refused again at activation.
:::

**Gating.** Rejected if `base` or `quote` is not registered, if `base == quote`,
if `quote` is not USDC, if `name` collides with an existing pair, if
`max_deploy_fee` is negative, if the ask exceeds `max_deploy_fee`, if your free
collateral is below the ask, or if governance has closed the lane.

**Response.** The `202 Accepted` admission envelope. An empty order book is
created with the pair, so trading paths see it as soon as it is configured and
activated.

---

### Set a pair's fee tier and min notional {#spot_set_pair_params}

Set the pair's maker/taker fees **and** its minimum order notional in one signed
intent. A pair needs both before it can be activated. Deployer-only; charges no
fee.

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

**Fees are deci-bps.** `taker_fee_dbps: 30` is 3 basis points, not 30. Values of
`1000` or more are refused at admission; the committed cap is `500` (50 bps) on
each leg.

**Gating.** Rejected if you are not the pair's deployer, if the target is a token
registration rather than a trading pair, if either fee is at or above `1000`
deci-bps or above the `500` cap, if `min_notional_cents` is `0`, or if it exceeds
`100000000` cents. A `0` floor is refused because it would let the pair activate
with no dust floor; the upper cap stops one mis-signed intent from making a live
pair untradeable. From the next release a non-zero `mip3_fee_ceiling_bps` also
binds here — see [Deploy rate limits](#deploy-rate-limits).

---

### Open or close a pair {#spot_set_pair_active}

Flip the pair between accepting and refusing new orders. Deployer-only; charges
no fee.

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

**Opening** requires the pair to be fully configured — a fee tier **and** a min
notional must already be set by
[`spot_set_pair_params`](#spot_set_pair_params) — and the quote must be USDC.
Where a trading grid is required, the pair also needs a non-zero tick size and
lot size.

**Closing refunds every resting order.** Deactivation drains the pair's book and
returns each resting order's locked escrow to its owner. Nothing is stranded in a
reserved balance. Existing **balances** are untouched; only resting orders are
cleared.

**Gating.** Rejected if you are not the pair's deployer, if an open is attempted
on a pair that is not fully configured, if the quote is not USDC, or if a
required trading grid is missing.

---

### Stage genesis holder rows {#spot_seed_holders}

Stage a genesis distribution for a token you deployed. This writes **no balances
and no supply** — it only records the intended rows. It is **repeatable**, so a
large distribution splits across several signed calls.

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
| `asset` | uint32 | a token you deployed, `≥ 1000` | Spot token being staged |
| `holders` | array of address strings | 1–128 per call, ≤ 4096 per token | Recipient addresses, parallel with `amounts` |
| `amounts` | array of decimal strings | each `> 0` | Whole-unit amounts, parallel with `holders`. Sent verbatim as JSON strings |

**A holder may be staged once only.** A repeat address — inside one call or
across calls — is rejected. Silent accumulation would let the
[checksum](#spot_finalize_supply) be satisfied by a distribution you did not
intend.

**Gating.** Rejected if `holders` and `amounts` differ in length; if `holders` is
empty or longer than 128 rows; if the token already has final supply; if you are
not the token's deployer; if any amount is zero or negative; if any amount is
**finer than the token's `wei_decimals`**; if a holder repeats; if more than 64
tokens hold a staged genesis at once; if the token would exceed 4096 staged rows;
or if the running total would pass the supply ceiling of `1000000000000` whole
units. USDC and every reserved core asset id are refused outright — this lane can
only mint tokens registered through it.

**Response.** The `202 Accepted` admission envelope. The committed outcome
reports how many holders are staged for the token in total.

---

### Mint the genesis supply {#spot_finalize_supply}

Seal the token: sum every staged row, compare that total against your
`max_supply` checksum, then credit all holders and set total supply in **one**
step. This is the only action in the lane that creates supply, and it succeeds
**once** per token.

```json
{
  "type": "spot_finalize_supply",
  "params": { "asset": 1000, "max_supply": "1250000.5" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a token you deployed with staged rows | Spot token being sealed |
| `max_supply` | decimal string | must equal the staged total exactly | Checksum over every staged row, in whole units. Sent verbatim as a JSON string |

:::warning
**`max_supply` is a checksum, never a target.** It does not define the
distribution — the staged rows do. It proves your `spot_seed_holders` sequence
arrived whole. Every staged amount is positive, so a dropped or truncated staging
call lowers the total, the comparison fails, and the mint refuses. Never derive
your seeds from `max_supply`; derive `max_supply` by summing your seeds.
:::

**Gating.** Rejected if the token has no staged genesis, if you are not the
deployer of record, if supply is already final, if `max_supply` does not equal
the staged total, or if that total is non-positive or above `1000000000000` whole
units.

**Response.** The `202 Accepted` admission envelope; the committed outcome
reports the minted total. Total supply is recorded from the **derived** sum, not
from the string you sent, so two numerically equal strings commit identical
bytes. After this succeeds the token's staged rows are cleared and no further
mint is possible.

---
