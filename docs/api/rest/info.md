---
description: The POST /info read endpoint — query types, envelope, and conventions. Perp-market and spot/margin queries have their own pages.
---

# `POST /info` — read & query endpoint

:::info
**Status.** **stable** shape. Query types are added over time; the envelope is committed.
:::

## TL;DR {#tldr}

Single endpoint, multi-type. Dispatches on the request body's `type` field. Read-only — never mutates state, never requires a signature.

:::tip
**Split by product.** Perp-market read queries are on [perpetual queries](./info/perpetuals.md); spot, spot-margin, and Earn read queries are on [spot & margin queries](./info/spot.md); closed-position lifecycle queries are on [position history](./info/position-history.md); governance queries are on [governance queries](./info/governance.md). This page covers the envelope, conventions, and account/vault/validator reads.
:::

## URL {#url}

```
POST  https://api.<net>.mtf.exchange/info
```

| Path | Wire shape |
|------|-----------|
| `POST /info` (gateway) | MTF-native (this document) |

The gateway serves the MTF-native `/info`. Running the node yourself, the same
native `/info` is served directly at `http://localhost:8080`.

## Envelope {#envelope}

Every `/info` response is one envelope. A success carries `data`. A failure
carries `error`. The two keys never appear together.

**Request**

```json
{ "type": "<query_type>", /* type-specific args */ }
```

**Success** — `200 OK`. The `type` discriminator is echoed INSIDE `data`:

```json
{
  "data": {
    "type": "<query_type>",
    /* type-specific payload */
  }
}
```

The payload fields keep their old path. A field you read at `body.data.fills`
before is still at `body.data.fills`. Only `type` moved: it was a sibling of
`data`, and it is now the first key of `data`.

A success has **no** `error` key. Do not test `error === null` — test whether
the key is present.

**A `data` of `null` is a SUCCESS.** A read can succeed with no content. That
answers `{"data": null}` with status `200`. Treat it as an empty result, not as
a failure.

**Failure** — no `data` key, and the HTTP status that the code maps to:

```json
{
  "error": {
    "code":    "UNKNOWN_TYPE",
    "message": "unknown info type: markest"
  }
}
```

| Field | Presence | Meaning |
|-------|----------|---------|
| `code` | always | The stable contract. **Match on this.** |
| `message` | always | Prose for a human. It can change in any release. **Never match on it.** |
| `details` | optional | The bound the request broke: `{"field","limit","actual"}`. It is **omitted** when the rejection carries no bound — never sent as `{}` |

The HTTP status keeps its normal meaning. One code always answers with one
status. Every code, its status, and the caller action for it are in the
[error reference](../errors.md).

Two common `/info` failures: an unknown `type` answers `400` with
`UNKNOWN_TYPE`; an unknown named resource, such as a vault id, answers `404`
with `NOT_FOUND`.

## Query types {#query-types}

### Per-account collateral and margin health {#account_state}

One account, one snapshot: the cross-account money figures at the top level, then
one summary per **lane** — `perp`, `spot`, `margin`, `option`.

:::warning Not live yet
The shape on this page is the target state. The release that carries it has not
fired. Until it does a live node answers `account_state` in the previous FLAT
shape, and answers [`clearinghouse_state`](#clearinghouse_state) and
[`option_state`](#option_state) with `unknown info type`. Read
[where every field went](#account-state-lane-split) first, then ship your client
change with the release, not before it.
:::

**The rule behind the shape.** `account_state` answers one question: what the
account is worth, and how close it is to liquidation. Every figure in it is
rendered from one committed block, so the set is internally consistent. Position
DETAIL is a different question, so it has its own read —
[`clearinghouse_state`](#clearinghouse_state) for perp legs,
[`option_state`](#option_state) for option legs.

:::danger
**Do not join two frames to compute one number.** A summary and a detail frame
can be rendered a commit apart, so a health figure built from both was never true
at any single block. Every frame carries `height`; compare it before you combine
anything. If you need one consistent set, take it from `account_state` alone —
each lane summary is WHOLE inside that one body for exactly this reason.
:::

**Request**

```json
{ "type": "account_state", "address": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|-------------|
| `address` | hex address | yes | Account address |
| `detail` | `"full"` \| `"margin"` \| `"overview"` | no | Response depth. Absent ⇒ `"full"` |

**`detail: "adl"` is REFUSED**, with `400` / `INVALID_REQUEST`. The body carries
no position rows to widen. The rejection message names
[`clearinghouse_state`](#clearinghouse_state), which takes the same `detail`.

**Response** (a faucet-funded account, no positions):

```json
{
  "data": {
    "type": "account_state",
    "address":        "0x00000000000000000000000000000000000ca11e",
    "account_value":  "3000",
    "total_raw_usd":  "3000",
    "withdrawable":   "3000",
    "health":         "3000",
    "tier":           "Safe",
    "abstraction":    "unified",
    "pm_net_value":   "0",
    "perp": {
      "init_margin":              "0",
      "total_ntl_pos":            "0",
      "pm_maint_margin":          "0",
      "pm_concentration_penalty": "0"
    },
    "spot": {
      "balances": [
        { "name": "USDC", "signing_id": 100, "total": "3000", "hold": "0", "avg_entry_px": null }
      ]
    },
    "margin": { "collateral": "0", "debt": "0", "pairs": 0 },
    "option": { "escrow": "0", "legs": 0 },
    "position_mode": "one_way",
    "height": 562,
    "time":   1700000000555
  }
}
```

An **unknown address** (never seen on-chain) returns **200** with this zeroed
record, NOT a `404`.

#### Where every field went {#account-state-lane-split}

A working client finds its field here. `account_state` is the only read that
moved; every field still exists somewhere.

| Was, at the top level | Is now | Note |
|---|---|---|
| `address` | `address` | unchanged |
| `height`, `time` | `height`, `time` | unchanged, and on **every** frame of both new reads too |
| `abstraction` | `abstraction` | unchanged — an ACCOUNT setting, not a lane |
| `position_mode` | `position_mode` | unchanged — an ACCOUNT setting, not a lane |
| `account_value` | `account_value` | unchanged — folds perp AND spot-margin unrealised PnL |
| `total_raw_usd` | `total_raw_usd` | unchanged |
| `withdrawable` | `withdrawable` | unchanged — subtracts BOTH lanes' held initial margin |
| `health` | `health` | unchanged — derives from `account_value` |
| `tier` | `tier` | unchanged — derives from `health` |
| `health_deferred` | `health_deferred` | unchanged, still present only when `true` |
| `pm_net_value` | `pm_net_value` | **unchanged — it stays at the top level.** See the warning below |
| `total_margin_used` | `perp.init_margin` | **renamed as well as moved.** The name `total_margin_used` survives only on `detail: "margin"` |
| `total_ntl_pos` | `perp.total_ntl_pos` | |
| `pm_maint_margin` | `perp.pm_maint_margin` | |
| `pm_concentration_penalty` | `perp.pm_concentration_penalty` | |
| `balances` | `spot.balances` | the ROWS are unchanged, field for field |
| `clearinghouse_state` | its own read: [`clearinghouse_state`](#clearinghouse_state) | same wire name, same row shape. Also a WS channel |
| `cross_maintenance_margin_used` | `detail: "margin"` only | it was already only on that depth, and it stays there |

Two more names moved outside this body:

- `option_positions` is renamed [`option_state`](#option_state). The old name
  answers `unknown info type`; it is not an alias.
- `detail: "adl"` moves from `account_state` to
  [`clearinghouse_state`](#clearinghouse_state).

:::warning
**`pm_net_value` is NOT under `perp`, and that is deliberate.** Its cash term is
the whole unified USDC pool, and under multi-collateral it also folds
haircut-valued spot balances. It is the portfolio-margin twin of `account_value`,
so a client that sums the lanes would count the same USDC twice. The other three
`pm_*` figures ARE perp-scoped and do sit under `perp`.
:::

**There is no transition window.** One builder serves one shape. The old flat
names are not merely dropped — they are refused at the top level, so a
half-migrated body cannot ship.

#### Every lane key is always present {#account-state-lanes}

`perp`, `spot`, `margin` and `option` are **always** in the body, zeroed when the
lane is empty. A client never has to test for a missing lane key. Per lane, an
account with nothing in it reads:

| Lane | Empty-account value |
|---|---|
| `perp` | `{"init_margin":"0","total_ntl_pos":"0","pm_maint_margin":"0","pm_concentration_penalty":"0"}` |
| `spot` | `{"balances":[ <the USDC row, all zeros> ]}` — **never an empty array** |
| `margin` | `{"collateral":"0","debt":"0","pairs":0}` |
| `option` | `{"escrow":"0","legs":0}` — `next_expiry` is **absent** |

Two shapes to code against:

- **`spot.balances` is never `[]`.** The USDC row is unconditional, even for an
  account that has never been funded. An empty array is a shape no real account
  returns — if you see one, you are reading a placeholder, not an account. Check
  the `height` stamp: a placeholder stamps `0`.
- **`option.next_expiry` is absent when `legs` is `0`.** It is the one
  non-uniform key in the body. A zero timestamp would read as 1970, so the key is
  omitted instead of zeroed. Test `legs > 0`, or test for the key.

#### The two depths do not carry the same names {#account-state-detail-margin}

`detail: "margin"` answers with the **margin scalars only** — `address`,
`account_value`, `total_raw_usd`, `withdrawable`, `total_margin_used`,
`cross_maintenance_margin_used`, `health`, `tier`, `abstraction`, plus
`health_deferred` when true and the `height` / `time` stamp. It skips the
position walk and the balance scan, so it is the right call for a frequent
liquidation-health poll (a risk-watcher bot, an automated margin top-up). Both
depths compute the scalars with one shared helper, so the numbers can never
disagree.

```json
{
  "data": {
    "type": "account_state",
    "address":                       "0x00000000000000000000000000000000000ca11e",
    "account_value":                 "3000",
    "total_raw_usd":                 "3000",
    "withdrawable":                  "3000",
    "total_margin_used":             "0",
    "cross_maintenance_margin_used": "0",
    "health":                        "3000",
    "tier":                          "Safe",
    "abstraction":                   "unified",
    "height": 562,
    "time":   1700000000555
  }
}
```

:::caution
**The held initial margin has two names, one per depth.** `detail: "margin"`
calls it `total_margin_used` at the top level. The full depth calls it
`init_margin` and files it under `perp`. Same number, same helper — two names.
Read the one your depth serves; neither depth serves the other's name.
:::

The rest of the two depths differ in both directions:

- **`cross_maintenance_margin_used` is served only at `detail: "margin"`.** The
  full depth carries the per-leg `maint_margin` on each
  [`clearinghouse_state`](#clearinghouse_state) position row instead. The two are
  different quantities — one is the account aggregate, one is a single leg's
  contribution.
- **`perp.total_ntl_pos` is served only at the full depth.** It is a sum over the
  position walk, and `detail: "margin"` is defined by skipping that walk.

`detail: "overview"` answers the account's **non-trading** state instead — vaults,
staking, sub-accounts, multisig, agents and the derived role. One account has one
state, so it has one read; `detail` chooses which half of that state you want.
`"full"` and `"margin"` both answer the trading half — `margin` is the scalar-only
subset of it — while `"overview"` answers the other half. The only fields all
three share are `address` and the `height` / `time` stamp. See
[`detail: "overview"`](#account_state-overview) below.

#### Field reference {#account-state-fields}

**Top level — the cross-account figures.**

| Field | Type | Meaning |
|-------|------|-------------|
| `address` | hex address | The account this body describes |
| `account_value` | Decimal string | Equity incl. settled PnL, **whole-USDC plane** (`"3000"` = 3000 USDC, NOT base units). Cross-lane: it folds perp AND spot-margin unrealised PnL over the one unified pool |
| `total_raw_usd` | Decimal string | **Settled cash equity**, whole-USDC. Realized USDC only — deposits, closed-position PnL, fees already paid. It **excludes unrealised PnL**, which is the one difference from `account_value`. It is the `settled cash` term the `withdrawable` formula starts from, so a caller can reconcile that formula from the read alone |
| `withdrawable` | Decimal string | Cash you can take out, **clamped at zero**. `total_raw_usd` minus funding you owe minus held initial margin — **both lanes' held margin**, not the perp lane's alone. It does NOT count unrealised profit, so a healthy account funded by open profit reads `"0"` — see [account value](../../concepts/account-value.md#withdrawable). The admission gate uses the raw signed figure, which can be negative; the read never is |
| `health` | Decimal string | `account_value − cross_maintenance_margin_used` (signed dollar figure; can be negative) — **not a ratio** |
| `health_deferred` | `true` \| absent | Present, and only ever `true`, when the risk engine cannot price a leg. **The risk numbers are then not a solvency statement** — see [account value](../../concepts/account-value.md). Absent is the normal case; treat absent as `false` |
| `tier` | enum **string** | `"Safe"`, `"T0"`, `"T1"`, `"T2"`, `"T3"` (BOLE band of `account_value / cross_maintenance_margin_used`; `"Safe"` when no maintenance margin) — see [tiered liquidation](../../concepts/tiered-liquidation.md). It is a STRING, never a number |
| `abstraction` | enum | `"unified"` (default cross-collateral account), `"standard"` (per-product reservations — see [`user_set_abstraction`](../rest/exchange.md#user_set_abstraction)) or `"portfolio"` (portfolio-margin enrolled). Derive PM enrolment as `abstraction == "portfolio"`. A caller that switches on this field must handle all three values |
| `pm_net_value` | Decimal string | PM engine's net scenario value, whole-USDC; `"0"` when not PM-enrolled. **Account-scoped, so it is NOT under `perp`** — see the warning above |
| `position_mode` | enum | `"one_way"` (single net position per asset) or `"hedge"` (separate long/short legs) — see [hedge mode](../../concepts/hedge-mode.md) |
| `height` | uint64 | Committed block height this snapshot reflects. A **bare integer**, not a Decimal string. Advances on **every** commit, even when nothing else in the record changed |
| `time` | uint64 | Consensus block time in **milliseconds**. A **bare integer**. Advances on every commit, from the same consensus clock as `height` |

**`perp` — the perp lane summary.** Always present. It holds no position rows;
read [`clearinghouse_state`](#clearinghouse_state) for those.

| Field | Type | Meaning |
|-------|------|-------------|
| `perp.init_margin` | Decimal string | Held initial-margin requirement, whole-USDC. Called `total_margin_used` on `detail: "margin"` |
| `perp.total_ntl_pos` | Decimal string | Mark notional of the account's **CROSS** perp positions, summed: `Σ \|real size\| × mark_px`, whole-USDC, unsigned. **Isolated legs are excluded** — they are margined and liquidated on their own. Equal to the sum of `notional` over every `clearinghouse_state` position row whose `isolated` is `false`. Full depth only |
| `perp.pm_maint_margin` | Decimal string | PM engine's maintenance requirement, whole-USDC; `"0"` when not PM-enrolled |
| `perp.pm_concentration_penalty` | Decimal string | PM single-asset concentration penalty, whole-USDC; `"0"` when not PM-enrolled |

The three `pm_*` figures are always present and are **meaningful only when
`abstraction` is `"portfolio"`** — see [portfolio margin](../../concepts/portfolio-margin.md).

**`spot` — the spot lane summary.** Always present.

| Field | Type | Meaning |
|-------|------|-------------|
| `spot.balances` | array | The **whole** spot token ledger, one row per token held. Never empty: row 0 is USDC unconditionally |
| `spot.balances[*].name` | string | Token symbol (`"USDC"` for row 0). Rows are keyed and joined by `name` |
| `spot.balances[*].signing_id` | uint32 | The number you place in the `token` field of a signed [`spot_send`](../rest/exchange.md), and in `asset` of an `earn_deposit`. `100` for USDC. It has no other meaning on the read plane |
| `spot.balances[*].total` | Decimal string | Full balance. **Not** the spendable amount — perp margin sits inside it. Use `withdrawable` |
| `spot.balances[*].hold` | Decimal string | Amount locked behind a resting spot order (escrow). Spot escrow only; it never holds perp margin |
| `spot.balances[*].avg_entry_px` | Decimal string \| null | Average cost basis for the token; `null` when there is none (always `null` on the USDC row — USDC is the quote asset). See [cost basis](#avg-entry-px) |

**A spot balance IS the spot position**, so nothing split off the way the perp
positions did. This lane answers the spot-balance question in full; there is no
separate spot-balance read.

:::warning
**`total − hold` is NOT the spendable amount.** `hold` counts spot order escrow
only. USDC that margins an open PERPETUAL position stays in `total` and never
enters `hold`, so `total − hold` overstates the budget for every position holder.
The chain admits a spot buy against **free collateral** (equity minus held
initial margin), and refuses an order that only `total − hold` allows.

Read `withdrawable` for the spendable USDC figure — it is the same free-collateral
number the admission gate uses, clamped at zero. See
[account value](../../concepts/account-value.md#balances-and-hold) for the rule
and a worked example.
:::

**`margin` — the spot-margin lane summary.** Always present. The per-pair detail
is [`spot_margin_state`](./info/spot.md#spot_margin_state).

| Field | Type | Meaning |
|-------|------|-------------|
| `margin.collateral` | Decimal string | **Vestigial, and reads `"0"`.** Spot margin is cross-collateralized against the one unified USDC account, so there is no per-pair collateral bucket to sum. It is the sum of the equally vestigial per-pair [`spot_margin_state`](./info/spot.md#spot_margin_state) `collateral` field, kept for wire-shape compatibility |
| `margin.debt` | Decimal string | Borrowed principal **accrued to now**, summed across pairs, whole-USDC. It uses the same accrual the `spot_margin_state` rows report, so the summary can never disagree with the detail |
| `margin.pairs` | uint32 | Number of open spot-margin pairs. A **bare integer**, not a Decimal string |

`debt` adds up across pairs because the quote asset of every spot pair is USDC by
construction. **`base_held` is deliberately not folded in**: it is per-pair BASE
units with no common unit, and turning it into a notional needs a mark this read
must not fetch. Read `spot_margin_state` for it.

**`option` — the option lane summary.** Always present. The per-leg detail is
[`option_state`](#option_state).

| Field | Type | Meaning |
|-------|------|-------------|
| `option.escrow` | Decimal string | Total USDC this account has locked as a **writer**, whole-USDC. What it takes back if every series it wrote settles worthless |
| `option.legs` | uint32 | Number of series the account is party to. A **bare integer** |
| `option.next_expiry` | uint64 \| **absent** | Nearest expiry among those legs, consensus ms. **Absent when `legs` is `0`** — a zero timestamp reads as 1970 |

The chain never prices an option, so this lane carries no mark-priced figure. See
[options](../../products/options.md).

#### The as-of stamp {#account-state-as-of}

`height` / `time` tell you which committed block the snapshot was rendered
against, and they advance on every commit regardless of whether any monetary
field moved. This lets a client tell a **fresh-but-quiet** account (constant
`account_value`, but `height` / `time` still climbing) apart from a **stalled**
read path (`height` / `time` frozen — the node or your connection has stopped
advancing). The same stamp appears on the WS
[`account_state`](../ws/subscriptions.md#account_state) channel with identical
values, so a client can cross-check or de-duplicate REST and WS against it.

It is also how you check that a detail frame belongs with a summary frame: equal
`height` means one commit, and only then do the two describe the same instant.

#### Cost basis and spot PnL {#avg-entry-px}

:::caution
**Treat a missing key exactly like `null`** — no basis known. An older node
serves `spot.balances` rows carrying `name`, `total` and `hold` only.
:::

`avg_entry_px` is what the account paid, per token, for what it holds. It is the
one input spot PnL needs:

```
unrealized_spot_pnl = (mark_px − avg_entry_px) × total
```

It is a PRICE and not a total on purpose. `total` includes the part locked behind
resting orders (`hold`), so a server-computed notional would have to choose which
quantity to multiply by, and you could not see which it chose. Multiply by the
quantity YOU mean.

**The rule behind it — basis is recorded on spot BUYS only.**

- A spot **buy** rolls the weighted average acquisition cost forward.
- A spot **sell** reduces the balance but **keeps the per-unit average
  unchanged**. Selling does not re-price what remains.
- **Deposits record no basis.** Tokens that arrive by bridge deposit, by a
  Core↔EVM credit, by a spot transfer from another account, or by a governance
  adjustment were not bought on this chain, so there is no price to record.

**Consequences to code against:**

- A holding acquired **entirely** by deposit or transfer has **`avg_entry_px:
  null`**. It is never `"0"`. A zero would claim the tokens were free and make
  the whole balance look like profit; `null` says plainly that the basis is not
  known. This matches the `null`-over-wrong-but-plausible rule used by the
  [position history](./info/position-history.md#honesty-flags) completeness flags.
- A holding **partly** bought and partly transferred in prices the transferred
  tokens at the standing average, because the transfer wrote no basis of its own.
  `avg_entry_px` is then a real number, but it covers the bought portion's price
  applied across the whole balance.
- Do not render a PnL figure when `avg_entry_px` is `null`. Render "—" instead. A
  PnL computed against a null basis is not a small error; it is the entire
  notional reported as gain.

**Perp positions are unaffected.** They carry their own `entry` price on the
[`clearinghouse_state`](#clearinghouse_state) rows; `avg_entry_px` is the spot
ledger's equivalent.

:::info
**No basis on the USDC row.** USDC is the quote asset — its cost basis in USDC
is meaningless — so `spot.balances[0].avg_entry_px` is always `null`. See
[USDC unification](../../concepts/usdc.md).
:::


#### `detail: "overview"` — everything that is not trading {#account_state-overview}

The account's full **non-trading** state: vaults, staking, sub-accounts,
multisig, agent wallets, and the derived role. The default depth owns the
account's collateral and margin health. This depth owns everything else.

The facets in this depth change rarely — a vault deposit, a delegation, an
agent approval — unlike margin and positions, which change every commit. Ask
for this depth when you render an account page, approve an agent, or list
sub-accounts. Do not ask for it in a poll loop; use the default depth there.

**The WS [`account_state`](../ws/subscriptions.md#account_state) channel pushes
the DEFAULT depth only.** A depth is a REST parameter. Read this depth over REST
when you need it.

```json
{ "type": "account_state", "address": "0x<addr>", "detail": "overview" }
```

An **unknown address** answers **200** with every sub-object honest-empty, NOT a
`404` — the same rule the default depth follows.

**Response**

```json
{
  "data": {
    "type": "account_state",
    "address": "0x<addr>",
    "role":    "user",
    "vault": {
      "equities": [
        { "vault_id": 7, "vault_address": "0x<vault>", "shares": "1", "equity": "5000000000" }
      ],
      "vaults": [ /* a <vault_state> body per vault this account follows or leads */ ]
    },
    "staking": {
      "state":   { /* a <staking_state> body, minus the repeated address */ },
      "summary": {
        "undelegated":        "250",
        "total_delegated":    "500",
        "pending_withdrawal": "50",
        "claimable_rewards":  "7",
        "n_delegations":      2
      }
    },
    "sub_accounts": [
      { "index": 0, "address": "0x<sub_addr>", "equity": "2500" }
    ],
    "multisig": { "is_multi_sig": true, "threshold": 2, "signers": ["0x…", "0x…"] },
    "agents": [
      { "agent": "0x<agent_addr>", "name": "trading-bot", "expires_at_ms": 1700000500000 }
    ],
    "height": 562,
    "time":   1700000000555
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `address` | hex address | Resolved account address. Carried ONCE at the top — no sub-object repeats it |
| `role` | `"missing" \| "user" \| "agent" \| "vault" \| "sub_account"` | Derived role. Precedence: `vault` (the address is a vault) → `sub_account` → `agent` (an approved agent of some master) → `user` (has account, config or spot state) → `missing` |
| `vault.equities[*].vault_id` | uint64 | Vault id |
| `vault.equities[*].vault_address` | hex address | Vault address |
| `vault.equities[*].shares` | Decimal string | The account's share count in **WHOLE shares**, not the raw 10¹⁸ integer. Send this exact string back to [`vault_withdraw`](./exchange.md#vault_withdraw) — read and write use one plane |
| `vault.equities[*].equity` | Decimal string | `shares × share_price`, truncated — whole-USDC. Share price is mark-to-market NAV per share, so this is what a redemption pays now, not a high-water-mark figure |
| `vault.vaults[*]` | object | One [`vault_state`](#vault_state) body per vault the account **follows or leads**, field-identical to that read. A leader with no deposit still gets a row |
| `staking.state` | object | A [`staking_state`](#staking_state) body for this account, minus the repeated `address` |
| `staking.summary.undelegated` | Decimal string | The free staking pool: MTF moved in with [`c_deposit`](./exchange.md#c_deposit) and **not yet delegated** (whole-MTF) |
| `staking.summary.total_delegated` | Decimal string | Sum of active delegations (whole-MTF) |
| `staking.summary.pending_withdrawal` | Decimal string | Sum of pending undelegations (whole-MTF) |
| `staking.summary.claimable_rewards` | Decimal string | Accumulated delegator rewards (whole-MTF) |
| `staking.summary.n_delegations` | uint64 | Number of active delegations |
| `sub_accounts[*].index` | uint32 | Sub-account index under this parent |
| `sub_accounts[*].address` | hex address | Sub-account address |
| `sub_accounts[*].equity` | Decimal string | The sub-account's mark-to-market equity, whole-USDC — the same figure its own `account_state.account_value` reports |
| `multisig.is_multi_sig` | bool | Whether the account is multisig |
| `multisig.threshold` | uint32 | M-of-N threshold; `0` if not multisig |
| `multisig.signers` | hex address[] | Signer set; empty if not multisig |
| `agents[*].agent` | hex address | Approved agent / API wallet address |
| `agents[*].name` | string \| null | Agent label set at approval time; `null` if unset |
| `agents[*].expires_at_ms` | uint64 \| null | Approval expiry (consensus ms); `null` for a never-expiring approval |
| `height` / `time` | uint64 | Committed block this snapshot was rendered against — the same as-of stamp the default depth carries |

**The three staking balances are disjoint — add them for the whole holding.**
`staking.summary.undelegated`, `total_delegated` and `pending_withdrawal` never
overlap. A screen that shows `total_delegated` alone shows the user less than
they hold. `undelegated` is the figure a delegate form needs: `token_delegate`
draws from it, so an amount above it is refused.

**`sub_accounts[*].equity` counts unrealised PnL.** A sub-account deep in loss
reads DOWN here, not at its settled cash, so a parent scanning this list sees the
one that is near liquidation.

**Shares are WHOLE shares on both read and write.** Committed state keeps shares
as a raw integer on a 10¹⁸ scale; this depth divides by 10¹⁸ before it answers.
Do **not** multiply `shares` by 10¹⁸. The division truncates **toward zero**, so
the string a holder reads back is never larger than the shares they hold — a
holder can under-ask, never over-burn.

**Every sub-object is honest-empty, never absent.** An account with no vaults,
no stake, no sub-accounts, no multisig and no agents still answers with all six
keys present and each one empty or zeroed.

### The account's perp positions {#clearinghouse_state}

The perp position DETAIL for one account, keyed by dex. This is the table that
used to sit inside `account_state`; the row shape is unchanged.

:::warning Not live yet
This read and its WS channel land with the release that reshapes
[`account_state`](#account_state). A live node answers `unknown info type` until
then.
:::

**Request**

```json
{ "type": "clearinghouse_state", "address": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|-------------|
| `address` | hex address | yes | Account address |
| `detail` | `"adl"` | no | Widen every row with `adl_lamps`. See [`detail: "adl"`](#account_state-adl) |

**Response**

```json
{
  "data": {
    "type": "clearinghouse_state",
    "address": "0x00000000000000000000000000000000000ca11e",
    "clearinghouse_state": {
      "": {
        "positions": [
          {
            "coin":         "BTC",
            "size":         "1.00000",
            "entry":        "67000.00",
            "upnl":         "5.00",
            "isolated":     false,
            "lev":          10,
            "liq":          "61000.00",
            "roe":          "0.0075",
            "funding":      "-0.12",
            "margin":       "201.00",
            "maint_margin": "670.00",
            "notional":     "6705.00"
          }
        ]
      }
    },
    "height": 562,
    "time":   1700000000555
  }
}
```

An **unknown address** returns **200** with `{"": {"positions": []}}`, NOT a
`404`. The core-dex key `""` is **always present**, even for an account with no
positions, so a client can index it without a guard.

| Field | Type | Meaning |
|-------|------|-------------|
| `address` | hex address | The account these positions belong to |
| `clearinghouse_state` | object | Keyed by dex (`""` = core dex, else a MIP-3 deployer's lowercase `0x` address); each value is `{positions: [...]}` |
| `positions[*].coin` | string | Market symbol (e.g. `"BTC"`), not a numeric id |
| `positions[*].size` | Decimal string | Signed **real** size (`raw lots / 10^sz_decimals`); negative = short |
| `positions[*].entry` | Decimal string | Per-whole-unit entry price = `\|entry_notional\| / \|real size\|`, **whole-USDC plane** |
| `positions[*].upnl` | Decimal string | Mark-to-market PnL = `real size × mark − signed entry_notional`, **whole-USDC plane** (signed) |
| `positions[*].isolated` | bool | `true` unless the position is cross-margined |
| `positions[*].lev` | uint8 | Position's chosen leverage |
| `positions[*].liq` | Decimal string \| null | Mark price (whole-USDC) at which this leg reaches maintenance. **Solved on the leg's own margin plane**: a cross leg against the cross account, an isolated leg against its posted `isolated_margin` alone. `null` when no non-negative price breaches maintenance, and when size is zero — see below |
| `positions[*].roe` | Decimal string | `upnl / initial_margin` as a decimal fraction; `"0"` at zero leverage / notional |
| `positions[*].funding` | Decimal string | Accrued-but-unsettled funding for **this leg**, **whole-USDC** (signed; negative = you owe). Includes the accrual built up since the last funding charge, so it stays non-zero between funding periods — the same accrual `account_value` and `withdrawable` already fold in |
| `positions[*].margin` | Decimal string | This leg's INITIAL margin, **whole-USDC** |
| `positions[*].maint_margin` | Decimal string | This leg's maintenance-margin contribution, **whole-USDC**: `\|entry_notional\| × maint_margin_ratio` |
| `positions[*].notional` | Decimal string | Position notional at mark, **whole-USDC** (signed): `real_size × mark_px` |
| `positions[*].side` | enum \| absent | **[Hedge mode](../../concepts/hedge-mode.md) only** — `"long"` / `"short"`, the leg this object reports. **Omitted on a one-way account** (a single *net* position whose `size` may be negative). A hedge account holding both legs on one asset returns **two** objects, one per side |
| `positions[*].adl_lamps` | uint8 \| absent | **`detail: "adl"` only** — the ADL queue indicator, `0` to `4`. More lamps = sooner deleveraged. Omitted otherwise, and always omitted on the WS frame. See [`detail: "adl"`](#account_state-adl) |
| `height` | uint64 | Committed block height this snapshot reflects. A **bare integer** |
| `time` | uint64 | Consensus block time in **milliseconds**. A **bare integer** |

:::danger
**This read carries no account figures, on purpose.** There is no
`account_value`, no `withdrawable`, no `health`, no `balances` here. Read those
from [`account_state`](#account_state), and do not compute an account-level
number by combining the two frames — they can be rendered a commit apart. Compare
the `height` of both frames before you treat them as one instant.
:::

#### Reading `liq` {#reading-liq}

`liq` is solved on the plane that actually liquidates the leg. A **cross** leg
shares one margin pool with every other cross leg, so its `liq` moves when any
other cross position moves. An **isolated** leg is backed only by its own posted
`isolated_margin`; the cross balance never rescues it, and a large cross balance
never pushes its `liq` away.

`liq` is **`null`, never `"0"`**, when the leg has no liquidation price. Two
cases produce it: a zero-size leg, and a long whose solved price is negative —
that long cannot be price-liquidated, because no non-negative mark breaches its
maintenance requirement. Treat `null` as "no price triggers this leg", and treat
`"0"` — should you ever see it — as a real price of zero. A client that renders
`null` as `0` tells the user the position is at the brink when it is the
opposite.

`liq` answers "what price liquidates THIS leg". It is not a promise about the
account: a cross account can still be liquidated by a move on a different market.

#### `detail: "adl"` — the ADL queue indicator {#account_state-adl}

`detail: "adl"` returns the DEFAULT body with one extra key on every position
row: `adl_lamps`, an integer from `0` to `4`. More lamps means the position sits
sooner in the auto-deleveraging queue. Nothing else changes, so a caller can
switch a screen from the default depth to `"adl"` without touching any other
field.

**It moved read.** `detail: "adl"` was a depth of `account_state`. It is a
parameter of `clearinghouse_state` now, because that is where the rows it widens
live. `account_state` refuses it with `400` rather than answering a body with no
rows in it.

```json
{ "type": "clearinghouse_state", "address": "0x<addr>", "detail": "adl" }
```

```json
{
  "coin":              "BTC",
  "size":              "1.00000",
  "entry":             "67000.00",
  "upnl":              "5.00",
  "isolated":          false,
  "lev":               10,
  "liq":               "61000.00",
  "roe":               "0.0075",
  "funding":           "-0.12",
  "margin":            "201.00",
  "maint_margin":      "670.00",
  "notional":          "6705.00",
  "adl_lamps":         3
}
```

**It is opt-in for a reason.** Each lamp ranks the position against every other
position in that market, so the node pays one extra pass over the market per
row. Ask for `"adl"` only on a screen that shows the column; poll the default
depth otherwise.

**It is REST-only.** The WS
[`clearinghouse_state`](../ws/subscriptions.md#clearinghouse_state) frame always
carries the default shape and never `adl_lamps` — the lamp ranks your seat
against OTHER accounts, so a stranger's PnL crossing a quartile edge would
re-emit your frame.

:::warning
**Two rules a caller gets wrong.**

**1. It is a RANKING, not a probability.** The lamps say where you sit in the
queue among the profitable holders on your side — the quartile of your seat, `4`
= top quarter, `1` = bottom quarter. They do NOT say ADL is likely. Four lamps
with nobody being liquidated on the other side still means **nothing happens**.
Never render it as a risk percentage.

**2. ZERO lamps is meaningful.** Zero is not "unknown" and not "safest of the
ranked". Zero means **not in the queue at all**, which is the honest answer for
a position ADL cannot structurally reach: no committed mark for the market, no
unrealised profit, no cost basis, or **nobody on the opposite side to be
deleveraged against**. That last one includes a hedge account whose only
opposing leg is its OWN — ADL never nets an account against itself, so a sole
hedge holder reads `0` on both legs. A floor of one lamp would be a false alarm.
:::

**What the ranking is.** The queue is ordered by the same expression the settle
path uses to pick its counterparty: return on committed margin, `unrealised PnL
÷ |entry notional|`, highest first, with a `(address, leg)` ascending tiebreak.
So a small, highly levered winner is netted ahead of a large, lightly levered one
with bigger absolute PnL. Hedge legs rank SEPARATELY, because ADL settles per
leg: a long leg is only ever ranked against other longs.

This is the **netting-at-mark** queue — who gets deleveraged. It is a different
question from who pays the [deficit haircut](../../concepts/adl.md#2-allocation--deterministic-capacity-pro-rata),
which is allocated pro-rata by capacity and has no ranking at all.

### Per-vault TVL, share price, and strategy {#vault_state}

Returns a snapshot of one vault: TVL, share price, and strategy.

**Request**

```json
{ "type": "vault_state", "vault": "0x<vault_addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `vault` | hex address | yes | Vault to read |

**Response**

```json
{
  "data": {
    "type": "vault_state",
    "vault":              "0x<addr>",
    "name":               "MFlux Conservative",
    "tvl":             "10000000000",
    "share_price":     "10500000",
    "depositor_count":    142,
    "high_water_mark": "10500000",
    "performance_fee_bps":"1000",
    "lock_period_ms":     86400000,
    "strategy":           "User"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `vault` | hex address | Vault address |
| `name` | string | Vault display name |
| `tvl` | Decimal string | Mark-to-market net asset value — see Rules |
| `share_price` | Decimal string | Mark-to-market value of one share — see Rules |
| `depositor_count` | uint | Number of depositors |
| `high_water_mark` | Decimal string | Performance-fee ratchet, not NAV — see Rules |
| `performance_fee_bps` | Decimal string | Performance fee, in basis points |
| `lock_period_ms` | uint64 | Minimum deposit lock period, in milliseconds |
| `strategy` | string | Vault kind: `"User"` or `"Metaliquidity"` |

**Rules**

- `strategy` is the vault's kind, `"User"` or `"Metaliquidity"`. It is not a free-text strategy label.
- `tvl` and `share_price` are mark-to-market NAV: settled cash, plus unrealised PnL on every open position at the latest oracle mark, plus unrealised funding. The Metaliquidity backstop vault also subtracts its pending-loss reserve. This is the same NAV that [`vault_withdraw`](exchange.md#vault_withdraw) burns shares against, so the read and the payout agree.
- `high_water_mark` is not NAV. It is a ratchet for performance-fee accounting: profit raises it, a deposit raises it, a withdrawal lowers it, and a trading loss never changes it. In drawdown, `high_water_mark` sits above `share_price` — the gap is the profit the vault must re-earn before it charges a performance fee again. Never price a redemption off `high_water_mark`.

### Per-account staking and delegation state {#staking_state}

Returns one account's staking, delegation, and unbonding state.

**Request**

```json
{ "type": "staking_state", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "staking_state",
    "address":                  "0x<addr>",
    "total_staked":             "1000000000",
    "undelegated_pool_balance": "250000000",
    "delegations": [
      {
        "validator":         "0x<val_addr>",
        "amount":         "500000000",
        "since_ts":          1735000000000,
        "pending_rewards":"1000000"
      }
    ],
    "pending_unstakes": [
      { "amount": "200000000", "matures_at_ts": 1735780000000 }
    ],
    "reward_pool": {
      "total_stake":                 "1000000",
      "pending_validator_pool_usdc": "25.75",
      "reward_source":               "fee_funded_on_book_buy"
    }
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `total_staked` | Decimal string | Delegated stake only, whole-MTF — the sum of `delegations[*].amount` |
| `undelegated_pool_balance` | Decimal string | Stake deposited but not delegated, whole-MTF, same plane as `total_staked` |
| `delegations[*].validator` | hex address | Validator the stake is delegated to |
| `delegations[*].amount` | Decimal string | Stake delegated to this validator, whole-MTF |
| `delegations[*].since_ts` | uint64 | When the delegation began, consensus ms |
| `delegations[*].pending_rewards` | Decimal string | Accrued, unclaimed rewards, whole-MTF |
| `pending_unstakes[*].amount` | Decimal string | Stake in the unbonding window, whole-MTF |
| `pending_unstakes[*].matures_at_ts` | uint64 | When that amount becomes withdrawable, consensus ms |
| `reward_pool.total_stake` | Decimal string | Total staked MTF across the chain, whole-MTF — the denominator this account's delegated stake competes in |
| `reward_pool.pending_validator_pool_usdc` | Decimal string | Fees accrued to the validator pool, not yet distributed, whole USDC. This is the reward the next distribution draws from |
| `reward_pool.reward_source` | string | Always `"fee_funded_on_book_buy"`. Lets a client tell a fee-funded chain from an emission-funded one without inferring it |

**Rules**

- `reward_pool` serves no APR, on purpose. The emission era is over: rewards are funded from fees, not minted on a curve, so there is no annual rate to publish. Do not derive one. The pending pool is a snapshot of accrued fees, not a rate — it depends on trading volume that has not happened yet.
- `undelegated_pool_balance` and `reward_pool` are not live yet. A node that predates them omits the keys. Treat a missing key as "this node predates the field", not as a zero balance.
- `total_staked` alone under-reports what an account holds: it counts delegated stake only. [`c_deposit`](./exchange.md#c_deposit) credits a free pool and [`c_withdraw`](./exchange.md#c_withdraw) debits it, and stake can sit in that pool undelegated for as long as the holder likes. Add `undelegated_pool_balance` to get the account's full staked balance.
- The free pool is not the same as `pending_unstakes`. Undelegated stake is already free. `pending_unstakes` is stake still inside its unbonding window, not withdrawable until `matures_at_ts`.
- The three balances are disjoint — add them for the whole staked holding. [`c_deposit`](./exchange.md#c_deposit) credits `undelegated_pool_balance`; `token_delegate` moves stake out of that pool into `total_staked`; undelegating moves it out of `total_staked` into `pending_unstakes` for the unbonding window. `undelegated_pool_balance` is the spendable figure `token_delegate` draws from, and the only one of the three that [`c_withdraw`](./exchange.md#c_withdraw) returns to spot with no unbonding window.

### Volume-tiered maker and taker fees {#fee_schedule}

Returns the maker/taker fee schedule and its volume tiers.

**Request**

```json
{ "type": "fee_schedule" }
```

No parameters.

**Response**

```json
{
  "data": {
    "type": "fee_schedule",
    "tiers": [
      { "volume_30d": "0",         "maker_bps": "2.0", "taker_bps": "5.0" },
      { "volume_30d": "100000000", "maker_bps": "1.5", "taker_bps": "4.5" },
      { "volume_30d": "1000000000","maker_bps": "1.0", "taker_bps": "4.0" }
    ],
    "pooled_volume_sunset_day": 20340,
    "pooled_volume_sunset_ms":  "1757376000000",
    "pooled_volume_counts":     true,
    "burn_ratio":         "0.30",
    "referrer_share_bps": "1.0"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `tiers[*].volume_30d` | Decimal string | 30-day trailing volume threshold for this tier |
| `tiers[*].maker_bps` | Decimal string | Maker fee rate at this tier, in basis points |
| `tiers[*].taker_bps` | Decimal string | Taker fee rate at this tier, in basis points |
| `pooled_volume_sunset_day` | uint64 | The day the pooled volume counter stops buying a discount. `0` = not armed yet |
| `pooled_volume_sunset_ms` | Decimal string | The same instant in milliseconds. `"0"` = not armed yet |
| `pooled_volume_counts` | bool | `true` while pooled volume still feeds a tier |
| `burn_ratio` | Decimal string | Fraction of fees burned |
| `referrer_share_bps` | Decimal string | Referrer's share of fees, in basis points |

**Rules**

- Fee rates are decimal basis points as strings with one fractional digit (e.g. `"2.0"` = 2 bps = 0.02%, `"0.5"` = 0.5 bps = 0.005%), for sub-basis-point precision.
- `burn_ratio` is a decimal fraction (`"0.30"` = 30% of fees burned).
- **There is no builder-rebate field on this read, and there is no protocol rebate to a broker.**
  A broker is paid the `builder.fee` it sets on each order, and that rate is capped by the
  ceiling the trader granted it — read the ceiling from
  [`approved_builders`](#approved_builders) `max_fee_bps`. The broker fee is charged ON TOP of
  the schedule above, so no field here changes when a broker is paid. See
  [broker codes](../../concepts/broker-codes.md#claiming).

**Send an `address` to get that account's resolved rates.** The response then also
carries a `user` block:

```json
{
  "data": {
    "type": "fee_schedule",
    "tiers": [],
    "user": {
      "address":                   "0x<addr>",
      "taker_volume_30d":          "12500000",
      "maker_volume_30d":          "3100000",
      "taker_bps":                 "4.5",
      "maker_bps":                 "1.5",
      "effective_taker_bps":       "4.05",
      "effective_maker_bps":       "1.2",
      "staking_discount_permille": 100,
      "maker_rebate_bps":          "0.3",
      "products": [
        { "product": "perp",        "taker_bps": "4.05", "maker_bps": "1.2",
          "taker_volume_30d": "12500000", "maker_volume_30d": "3100000" },
        { "product": "spot",        "taker_bps": "9.0",  "maker_bps": "2.0",
          "taker_volume_30d": "12500000", "maker_volume_30d": "3100000" },
        { "product": "spot_margin", "taker_bps": "9.0",  "taker_volume_30d": "12500000" },
        { "product": "option",      "option_taker_bps": "0.5", "option_premium_cap_ppm": 150000 }
      ],
      "daily_volume": []
    }
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user.taker_volume_30d` | Decimal string | Pooled trailing 30-day taker volume, every product together |
| `user.maker_volume_30d` | Decimal string | Pooled trailing 30-day maker volume |
| `user.taker_bps` / `maker_bps` | Decimal string | The PERP base rate, before the discount and the rebate |
| `user.effective_taker_bps` | Decimal string | The PERP rate a fill charges, discount applied |
| `user.effective_maker_bps` | Decimal string | The PERP rate a fill charges, rebate subtracted. Negative = a credit |
| `user.staking_discount_permille` | uint32 | Taker-only staking discount, per mille (`100` = 10%) |
| `user.maker_rebate_bps` | Decimal string | The PERP maker rebate, before it is subtracted |
| `user.products[*].product` | string | `perp`, `spot`, `spot_margin` or `option` |
| `user.products[*].taker_bps` | Decimal string | The rate a fill on THIS product charges, discount applied |
| `user.products[*].maker_bps` | Decimal string | The rate a fill on THIS product charges, rebate subtracted. ABSENT on a product with no maker leg |
| `user.products[*].taker_volume_30d` | Decimal string | The volume THIS product's tier reads |
| `user.products[*].maker_volume_30d` | Decimal string | The volume THIS product's maker tier reads. ABSENT on a product with no maker leg |
| `user.products[*].option_taker_bps` | Decimal string | OPTION ROW ONLY. The rate charged on the option's maximum payout |
| `user.products[*].option_premium_cap_ppm` | uint32 | OPTION ROW ONLY. The fee ceiling as a fraction of the premium, in ppm |

**The four products price apart. Read `products`, not the top-level pair.** The
top-level `effective_*_bps` fields are the PERP rate, which is what they have
always meant. A spot or an option fill can charge a different rate. See
[Each product has its own fee table](../../concepts/fees.md#per-product-fees).

**The `option` row has a DIFFERENT shape, because an option does not price on a
volume ladder.** It carries no `taker_bps` and no volume; instead it carries
`option_taker_bps` and `option_premium_cap_ppm`, and the fee charged is the
SMALLER of a rate on the option's maximum payout and that fraction of the
premium. Both start unset, which charges nothing. See
[the option fee](../../products/options.md#option-fee).

**A row with no `maker_bps` has no maker leg.** A maker rests on the shared spot
book and never carries a lane, so a maker is always priced as `spot`. That leaves
`spot_margin` and `option` with a taker leg only, and those two rows omit both
maker keys rather than render a rate nothing can charge.

**Every `products[*]` row can carry the same volume today, and later cannot.**
Until the pooled window sunsets, a product's tier reads the LARGER of your pooled
volume and the volume you traded on that product, so the rows agree. After the
sunset each row reads only its own product. `pooled_volume_sunset_ms` in the same
response is the date; the rule is in
[the pooled window](../../concepts/fees.md#pooled-volume-sunset).

See [fees](../../concepts/fees.md).

### Accrued referral credit for one account {#referral_state}

One account's claimable referral credit, and the referrer it is bound to.

**The parameter is `user`, not `address`.** Most reads on this page take
`address`. These two fee-credit reads take `user`. Sending `address` answers
`400 INVALID_REQUEST`, with `details.field` set to `user`.

**Request**

```json
{ "type": "referral_state", "user": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `user` | hex address | yes | The account to read |

**Response**

```json
{
  "data": {
    "type": "referral_state",
    "user":              "0x00000000000000000000000000000000000ca11e",
    "claimable_rewards": "12.451",
    "referrer":          "0x00000000000000000000000000000000000000bb"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user` | hex address | The account read, echoed back |
| `claimable_rewards` | Decimal string | USDC credit this account can claim right now |
| `referrer` | hex address \| null | The referrer this account is bound to. `null` = never bound |

**Rules**

- **Read the credit here before you claim it. The claim action reports no
  amount.** [`claim_referral_rewards`](./exchange.md#claim_referral_rewards)
  drains the whole balance and answers with no figure, so this read is the only
  way to show a claimable balance or to decide whether a claim is worth sending.
- **`claimable_rewards` of `"0"` is normal, not an error state.** Claiming with
  nothing accrued claims `0` and succeeds. Do not block the button on it.
- **`referrer: null` means the account never bound one.** It does not mean the
  node is old and it does not mean the referrer is unknown. A referrer is bound
  once with [`set_referrer`](./exchange.md#set_referrer) and is immutable after
  that, so `null` is a durable answer until the account sends that action.
- **This read cannot list the accounts YOU referred.** The referral graph is
  address-based and one-directional: the chain stores each referee's referrer,
  and no reverse map. There is no read that enumerates a referrer's referees,
  and no referral code to enumerate them by. Track your own referees off-chain.
- **`claimable_rewards` can under-report what a referrer earned.** A referrer
  share on a spot BUY arrives in the base token, paid at the fill, and a base
  amount cannot join this USDC-denominated credit. Only the USDC shares
  accumulate here. See
  [in-kind fees](../../concepts/fees.md#referrer-credit).

### Accrued broker credit for one account {#builder_state}

One broker's claimable broker-code fee credit.

**Request**

```json
{ "type": "builder_state", "user": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `user` | hex address | yes | The broker account to read |

**Response**

```json
{
  "data": {
    "type": "builder_state",
    "user":              "0x00000000000000000000000000000000000000aa",
    "claimable_rewards": "308.9"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user` | hex address | The account read, echoed back |
| `claimable_rewards` | Decimal string | USDC credit this broker can claim right now |

**Rules**

- **Read the credit here before you claim it. The claim action reports no
  amount.** [`claim_builder_rewards`](../../concepts/broker-codes.md#claiming)
  drains the whole balance and answers with no figure.
- **The read keeps the `builder` spelling.** The wire type is `builder_state`.
  There is no `broker_state` read.
- **A broker credit and a referral credit are separate balances with separate
  claims.** One fill can pay both. Reading one tells you nothing about the
  other. See [broker credit is not referrer credit](../../concepts/fees.md#referrer-credit).
- **This is a credit balance, not a fee rate.** The rate a broker charges is the
  `builder.fee` on each order, capped by its
  [`approved_builders`](#approved_builders) grant.

### Account's resting orders across all books {#open_orders}

Returns an account's resting orders, across every perp book and every spot book.

**Request**

```json
{ "type": "open_orders", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "open_orders",
    "address":    "0x<addr>",
    "orders": [
      {
        "oid":         12345,
        "coin":        "BTC",
        "side":        "B",
        "px":          "99000",
        "sz":          "0.007",
        "orig_sz":     null,
        "cloid":       "0x000000000000000000000000cafef00d",
        "tif":         "gtc",
        "reduce_only": false,
        "trigger":     null,
        "inserted_at": 1700000000000
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `orders[*].oid` | uint64 | Server order id — the real resting id, cancellable per-`oid` |
| `orders[*].coin` | string | Market symbol the order rests on (e.g. `"BTC"`, or a pair name like `"BTC/USDC"`) |
| `orders[*].side` | `"B"` / `"A"` | Order side. `B` = bid, `A` = ask. The `/exchange` order body uses `"bid"` / `"ask"` instead |
| `orders[*].px` | Decimal string | Resting price, whole units, tick-snapped |
| `orders[*].sz` | Decimal string | Remaining size, whole units |
| `orders[*].orig_sz` | Decimal string \| null | Original size when known; `null` on a resting-order row |
| `orders[*].cloid` | hex string \| null | Client order id the order was placed with (`0x` + 32 hex chars); `null` when the order set none |
| `orders[*].tif` | string | Lowercase time-in-force (`"gtc"` / `"ioc"` / `"alo"`), or the literal `"trigger"` on a parked TP/SL row |
| `orders[*].reduce_only` | bool | Reduce-only flag |
| `orders[*].trigger` | object \| null | Trigger detail when the row is, or carries, a trigger; `null` otherwise |
| `orders[*].inserted_at` | uint64 | Placement / insertion timestamp, consensus ms |

**Errors**

- Missing `address` → `400 INVALID_REQUEST`.

**Rules**

- A spot entry labels `coin` with the pair name (e.g. `"BTC/USDC"`) and renders `px` / `sz` in the pair's own planes: pair tick, base-token size decimals.
- Every row is the same canonical shape the WS [`open_orders`](../ws/subscriptions.md#open_orders) snapshot renders, so REST and WS never drift. An unknown field renders `null`.
- A parked TP/SL leg is an open order too: it renders with `tif: "trigger"` and a populated `trigger` block.

**Inside the `trigger` block**

A resting book order with an attached trigger carries `trigger_px` and
`trigger_above` only. A parked (off-book) leg also carries `is_parked`,
`is_market`, and `limit_px`. Two more keys appear only on the leg that owns
them.

| Key | Type | When it is present |
|-----|------|--------------------|
| `trigger_px` | Decimal string | Always. The mark level the leg fires at |
| `trigger_above` | bool | Always. `true` = fire when the mark rises to `trigger_px` |
| `is_parked` | bool | Parked legs only. Absent on a resting book order's block |
| `is_market` | bool | Parked legs only. `true` = fires a market exit; `false` = rests a limit exit |
| `limit_px` | Decimal string \| null | Parked legs only. The resting price of a limit trigger; `null` on a market trigger |
| `group` | uint64 | Ladder legs only. The handle every leg of one scaled TP/SL ladder shares |
| `trail_px` | Decimal string | Trailing legs only. The callback offset the level ratchets by |

`group` and `trail_px` are absent unless the leg owns them. Read absence as
"not a ladder leg" and "not a trailing leg". A decoder that types them as
optional needs no change when they first appear on a leg; a decoder that
makes them required fails on every ordinary trigger.

**`group` — the scaled TP/SL ladder.** A
[`positionTpsl`](./exchange.md#position-tpsl-ladder) batch of three or more
protective legs parks a ladder: the legs share one `group`, and they are not
OCO — a fill of one leg does not cancel the others, which is the point of
scaling out in steps. One or two legs stay the older shapes: a lone trigger,
or an OCO pair whose first fill cancels its partner. Group the rows by this
value to render one ladder as one control. The whole ladder retires together
the moment the position it protects is closed, by any path.

**`trail_px` — the trailing stop.** The parked level ratchets toward the mark
by this offset, and never away from it, once per block. So when `trail_px`
is present, `trigger_px` is the ratcheted level, not the level the owner
sent — do not render it as a static order the user placed. A trailing leg is
always a stop-loss; the chain refuses a trailing take-profit, which would
chase its level away from a winning position. `trail_px` is submittable —
see [trailing stops](./exchange.md#trailing-stops), and note that sending it
changes the order's signing digest.
### Recent fill history for an account {#user_fills}

Account-scoped fill history: one row per execution, served directly from the
node's committed on-chain state (a bounded per-account fill ring folded into
the AppHash — no external indexer). For one row per
**opened-then-closed position** instead — peak size, average entry, average
close, realized PnL and funding folded over the whole life — use
[position history](./info/position-history.md).

**Request**

```json
{ "type": "user_fills", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address. Missing `address` returns `400 INVALID_REQUEST` |
| `limit` | uint32 | no | Cap on the number of most-recent records returned. Absent or `0` returns the full ring |
| `start_time` | uint64 | no | Window start (consensus ms, inclusive), filtered on the fill `time`. Absent is an open lower bound |
| `end_time` | uint64 | no | Window end (consensus ms, inclusive). Absent is an open upper bound |

Send `address` alone for the recent window, or add `start_time` / `end_time` to
filter the same records by time. The response echoes both bounds back as
`start_time` / `end_time` (`null` for a bound you omit); the fill-record shape
is identical either way.

**Response**

```json
{
  "data": {
    "type": "user_fills",
    "address":    "0x<addr>",
    "start_time": null,
    "end_time":   null,
    "fills": [
      {
        "coin":           "BTC",
        "side":           "B",
        "px":             "67042.50",
        "sz":             "0.125",
        "time":           1700000000555,
        "oid":            12345,
        "tid":            90123,
        "fee":            "4.19",
        "closed_pnl":     "0",
        "cause":          "twap",
        "twap_id":        41,
        "dir":            "Open Long",
        "start_position": "0",
        "block":          562,
        "hash":           "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
      }
    ]
  }
}
```

Records are ordered oldest-first (newest last). The ring is bounded, so this is
a recent window, not the account's full history. An account with no fills
returns `"fills": []`.

A request whose `start_time` is older than the oldest ring record is answered
from the archive instead. A request with no time bound always answers from the
ring.

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Resolved account address |
| `fills[*].coin` | string | Market symbol the fill executed on |
| `fills[*].side` | `"B"` / `"A"` | This leg's side: `"B"` = buy/bid, `"A"` = sell/ask |
| `fills[*].px` | Decimal string | Execution price, **decimal USDC** (human-readable) |
| `fills[*].sz` | Decimal string | Filled size, **base units** (whole-unit) |
| `fills[*].time` | uint64 | Fill timestamp (consensus ms) |
| `fills[*].oid` | uint64 | This party's order id |
| `fills[*].tid` | uint64 | Deterministic trade id, shared by both legs of the print |
| `fills[*].fee` | Decimal string | Fee this party paid, **decimal USDC** |
| `fills[*].closed_pnl` | Decimal string | Realized PnL on the closed portion, **decimal USDC** (signed) |
| `fills[*].dir` | string | Direction label: `"Open Long"`, `"Close Short"`, `"Open Short"`, or `"Close Long"` |
| `fills[*].start_position` | Decimal string | Signed leg size before the fill, **base units** (whole-unit, signed) |
| `fills[*].block` | uint64 | Committed block height the fill settled in |
| `fills[*].cause` | string | Present only when this leg did not execute by its own order crossing. `"forced_close_partial"` / `"forced_close_full"` — the liquidation ladder; `"forced_close_isolated"` — an isolated leg breached its own bucket; `"forced_close_governance"` — a validator-quorum forced close settled against the book; `"trigger"` — a TP/SL fired; `"twap"` — a TWAP slice. Absent on an ordinary fill and on every maker leg: a counterparty that was merely hit is not itself forced. `forced_close_governance` is a forced close that is NOT a liquidation — it charges no liquidation fee and does not count toward liquidation totals |
| `fills[*].liquidated_user` | hex address | Present on a forced-close leg only, on both sides of the print. The account whose position was closed — so a taker can see whose liquidation it absorbed |
| `fills[*].mark_px` | Decimal string | Present with `liquidated_user`. The mark the liquidation ladder priced from when it classified the leg — not the fill price, and not a later mark |
| `fills[*].broker` | hex address | Present when a [broker code](../../concepts/broker-codes.md) routed the order. Taker leg only |
| `fills[*].broker_fee` | Decimal string | Present with `broker`. The carve charged on this fill, **decimal USDC**. `"0"` is legal — a zero-rate broker is still attributed |
| `fills[*].twap_id` | uint64 | Present on a TWAP slice (`cause` is `"twap"`). The parent order this slice belongs to. Taker leg only |
| `fills[*].hash` | hex string | Transaction hash of the originating signed order, `0x`-prefixed hex, letting the fill be traced on-chain. A taker leg carries its order's hash; a **maker leg carries the hash of the maker's own resting order** (its original order-submit action), so both legs of a match trace to the action that placed them. **Empty string (`""`)** when no signed user order stands behind the leg — a system, begin-block, or liquidation print — and, for maker legs, on fills recorded before the network upgrade |

**Rules**

- Archive-served fills (a window older than the fill ring) carry the
  attribution fields (`liquidated_user`, `mark_px`, `broker`, `broker_fee`,
  `twap_id`, `hash`) but never `cause`. Classify a forced close by
  `liquidated_user` and a TWAP slice by `twap_id` — both work on every row; a
  `cause` test silently misses archive-era rows.

### A single order's lifecycle {#order_status}

Single-order lifecycle lookup by `oid` (server order id) or `cloid` (client
order id). Reads the resting books, the trigger registry, and the committed
fill ring.

**Request**

```json
{ "type": "order_status", "oid": 12345 }
```

Or by client order id:

```json
{ "type": "order_status", "cloid": "0x000000000000000000000000cafef00d" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `oid` | uint64 | one of `oid` / `cloid` | Server order id |
| `cloid` | hex string | one of `oid` / `cloid` | Client order id — `0x` + 32 hex chars |

Neither field present returns `400 INVALID_REQUEST`. A
malformed `cloid` returns `400`. Resolution stops at the first hit, in this
order: live resting order, then parked trigger, then terminal fill, then
unknown.

**Response**

The `data.status` field discriminates which shape follows.

`"resting"` — a live order open in a perp or spot book:

```json
{
  "data": {
    "type": "order_status",
    "status": "resting",
    "order": {
      "oid":         12345,
      "coin":        "BTC",
      "side":        "B",
      "px":          "67000",
      "sz":          "700",
      "inserted_at": 1700000000000,
      "cloid":       "0x000000000000000000000000cafef00d"
    }
  }
}
```

`"triggered"` — a parked TP/SL/stop entry awaiting its mark cross:

```json
{
  "data": {
    "type": "order_status",
    "status": "triggered",
    "trigger": {
      "oid":           12345,
      "coin":          "BTC",
      "side":          "A",
      "trigger_px":    "66000",
      "trigger_above": false,
      "is_market":     false,
      "limit_px":      "65000",
      "sz":            "700",
      "registered_at": 1700000000000,
      "fired":         false
    }
  }
}
```

A **ladder** leg adds `group`, and a **trailing** leg adds `trail_px`. Both
keys follow the same absence rule as on [`open_orders`](#open_orders) — the
node writes each one only on the leg that owns it, so an ordinary trigger
carries neither:

```json
{
  "data": {
    "type": "order_status",
    "status": "triggered",
    "trigger": {
      "oid":           12346,
      "coin":          "BTC",
      "side":          "A",
      "trigger_px":    "65750",
      "trigger_above": false,
      "is_market":     true,
      "limit_px":      null,
      "sz":            "250",
      "registered_at": 1700000000000,
      "fired":         false,
      "group":         12345,
      "trail_px":      "250"
    }
  }
}
```

`"filled"` — the most recent matching fill in the per-account ring (the `fill`
object is the same shape as one [`user_fills`](#user_fills) record):

```json
{
  "data": {
    "type": "order_status",
    "status": "filled",
    "fill": { /* same shape as a user_fills fill record */ }
  }
}
```

`"unknown"` — never seen, or evicted from the bounded ring (a `cloid`-only
query that matched no resting/triggered order also resolves here, since the
trigger registry and fill ring are keyed by `oid`):

```json
{ "data": { "type": "order_status", "status": "unknown" } }
```

| Field | Type | Meaning |
|-------|------|---------|
| `status` | `"resting" \| "triggered" \| "filled" \| "unknown"` | Resolved lifecycle state |
| `order` | object | Present on `"resting"` — `oid`, `coin` (market symbol or spot pair name), `side` (`"B"` = bid / `"A"` = ask), `px` / `sz` (decimal strings), `inserted_at`, `cloid` (hex \| null) |
| `trigger` | object | Present on `"triggered"` — `oid`, `coin`, `side` (`"B"` / `"A"`), `trigger_px` / `sz` (decimal strings), `trigger_above` (bool: fire when mark crosses above), `is_market` (bool: `true` = fires a market exit, `false` = rests a limit exit), `limit_px` (decimal string \| `null`: the resting price for a limit trigger, `null` for a market trigger), `registered_at`, `fired` (bool). **Ladder legs only:** `group` (uint64, the shared ladder handle). **Trailing legs only:** `trail_px` (decimal string, the callback; `trigger_px` is then the RATCHETED level). Both keys are absent on every other trigger — see [`open_orders`](#open_orders) |
| `fill` | object | Present on `"filled"` — the matching fill record (see [`user_fills`](#user_fills)) |

### The live option series registry {#option_series}

Every live [option](../../products/options.md) series, oldest series first.

**Request**

```json
{ "type": "option_series" }
```

No parameters.

**Response**

```json
{
  "data": {
    "type": "option_series",
    "series": [
      {
        "signing_id":      2147483649,
        "underlying":      "BTC",
        "kind":            "put",
        "strike":          "100000",
        "expiry":          1735689600000,
        "sz_decimals":     5,
        "escrow_per_unit": "100000"
      },
      {
        "signing_id":      2147483650,
        "underlying":      "BTC",
        "kind":            "capped_call",
        "strike":          "100000",
        "cap":             "130000",
        "expiry":          1735689600000,
        "sz_decimals":     5,
        "escrow_per_unit": "30000"
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `signing_id` | uint32 | **The number to sign.** Put it in the `market` field of every RFQ action for this series |
| `underlying` | string | Symbol of the underlying market the settlement price comes from |
| `kind` | enum | `"put"` or `"capped_call"`. A call is always capped |
| `strike` | Decimal string | Strike `K`, whole USDC |
| `cap` | Decimal string | Cap `C`, whole USDC. Present on a `capped_call` only — **absent on a put** |
| `expiry` | uint64 | Expiry (consensus ms). The first settlement attempt runs at this stamp |
| `sz_decimals` | uint8 | Size precision. An RFQ `size` of `10^sz_decimals` is ONE whole unit |
| `escrow_per_unit` | Decimal string | What a **writer** locks per whole unit, whole USDC |

An empty registry returns `200` with `"series": []`.

**Rules**

- `escrow_per_unit` on a `capped_call` is the strike-to-cap width
  (`cap − strike`), not the strike — a $100,000 strike capped at $130,000
  escrows **$30,000** per unit, not $100,000.
- Sign `signing_id`; do not compute it. There is no public formula, base, or
  arithmetic that derives it from the series terms — the encoding is internal
  and it can move. A client that derives its own number signs a market the
  chain may not resolve.
- The row carries no option price, implied volatility, or open interest. The
  chain never prices an option: the premium is what two accounts agree on in
  an [RFQ](../../concepts/rfq.md). For your own holding in a series, read
  [`option_state`](#option_state).

### An account's open option legs {#option_state}

Every open [option](../../products/options.md) leg one account holds. Each row
carries the series terms beside the position, so one call answers both
questions.

:::warning Renamed
**This read was called `option_positions`.** The old name is **not an alias** —
it answers `unknown info type`, the same as a name that never existed. Send the
new name.
:::

For the account-wide totals — escrow, leg count and nearest expiry — read the
`option` lane of [`account_state`](#account_state) instead. This read is the
per-leg detail behind that summary.

**Request**

```json
{ "type": "option_state", "address": "0x0000000000000000000000000000000000000000" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "option_state",
    "address": "0x0000000000000000000000000000000000000000",
    "positions": [
      {
        "signing_id": 2147483649,
        "underlying": "BTC",
        "kind":       "put",
        "strike":     "100000",
        "expiry":     1735689600000,
        "long":       "2.5",
        "short":      "0",
        "escrow":     "0"
      },
      {
        "signing_id": 2147483650,
        "underlying": "BTC",
        "kind":       "capped_call",
        "strike":     "100000",
        "expiry":     1735689600000,
        "long":       "0",
        "short":      "1.5",
        "escrow":     "45000"
      }
    ]
  }
}
```

| Field | Type | Plane | Meaning |
|-------|------|-------|---------|
| `signing_id` | uint32 | — | **The number to sign.** The same value [`option_series`](#option_series) serves for this series |
| `underlying` | string | — | Symbol of the underlying market the settlement price comes from |
| `kind` | enum | — | `"put"` or `"capped_call"` |
| `strike` | Decimal string | money | Strike `K`, whole USDC |
| `expiry` | uint64 | — | Expiry (consensus ms) |
| `long` | Decimal string | **units** | Units held, on the series size scale. Already whole units |
| `short` | Decimal string | **units** | Units written, on the series size scale. Already whole units |
| `escrow` | Decimal string | **money** | USDC this account has locked in the series pot |

An account that is party to no series returns `200` with `"positions": []`. A
missing `address` returns `400` with `missing field: address`.

**Rules**

- `long` and `short` are unit counts, on the series size scale and already
  divided — the node applies `sz_decimals` for you, so `"2.5"` means two and a
  half whole units. `escrow` is money: a decimal USDC string, like every other
  money field on this page. Both planes are decimal strings, so a caller that
  reads `escrow` as a unit count, or `short` as a dollar figure, reads a wrong
  number that still parses.
- Exactly one of `long` / `short` is `"0"` on any row. A fill consumes an
  account's opposite leg before it opens a new one: a holder that writes gives
  up long units, and a writer that buys closes short units. So a row is either
  a holding or a written position, never both. `escrow` is what stays locked
  after that netting, and it is `"0"` on a pure holding.
- The row omits the series-wide terms: no `cap`, no `sz_decimals`, no
  `escrow_per_unit`. Read [`option_series`](#option_series) for those — on a
  `capped_call` the cap is there, not on the position row.
- An option fill writes no ledger row of its own. Between the fill and expiry,
  this is the only read where a writer sees the escrow it locked and a holder
  sees the units it owns.

## Account history query types {#account-history-query-types}

Per-account history reads — funding payments, ledger updates, past orders,
TWAP slice fills, and staking rewards. Same `{type, data}` envelope and
MTF-native conventions as the reads above (decimal-string money, `0x`-hex
addresses, coin **symbols**). Every type here requires `address` (0x hex;
missing or malformed → `400`); an **unknown address is never an error** — it
returns **200** with the empty shape (the zeroed-default convention used
elsewhere in this reference).

Some of these types ship the locked wire contract with an **honest-empty**
array today (marked **Status: empty (history retention pending)** below):
their backing events currently stream on the live
[WS channels](../ws/subscriptions.md) only and are not yet retained for REST.
The retention backfill fills them **without a wire change** — the
request/response envelopes below are final, and the documented record shapes
are the locked forms the arrays will carry.

[`user_ledger_updates`](#user_ledger_updates) is empty for a different reason:
its records live in the archive, not on the node. Read its own notice below.

**An honest-empty array is not the same as a hardcoded one.** A read that
could only ever answer `[]` was deleted rather than documented — see
[removed reads](#retired-reads).
### Realized funding-payment history {#user_funding}

Realized funding payments for an account, over an optional time window.

**Status: empty (history retention pending).** The envelope is live, but
`fundings` returns `[]` until funding payments are retained for REST. For live
per-account funding payments today, subscribe to the
[`user_fundings` WS channel](../ws/subscriptions.md#user_fundings).

**Request**

```json
{ "type": "user_funding", "address": "0x<addr>", "start_time": 1700000000000, "end_time": 1700003600000 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `start_time` | uint64 | no | Window start, ms. Echoed back; `null` when omitted |
| `end_time` | uint64 | no | Window end, ms. Echoed back; `null` when omitted |

**Response**

```json
{
  "data": {
    "type": "user_funding",
    "address":    "0x<addr>",
    "start_time": 1700000000000,
    "end_time":   1700003600000,
    "fundings":   []
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `start_time` | uint64 \| null | Echoes the request window start |
| `end_time` | uint64 \| null | Echoes the request window end |
| `fundings` | array | Funding-payment records. Empty until REST retention ships |

Locked record shape, for when retention ships:

| Field | Type | Meaning |
|-------|------|---------|
| `fundings[*].coin` | string | Market symbol the payment settled on |
| `fundings[*].payment` | Decimal string | Funding payment, whole USDC, signed |
| `fundings[*].szi` | Decimal string | Signed position size at settlement, whole units |
| `fundings[*].funding_rate` | Decimal string | Funding rate applied, signed |
| `fundings[*].time` | uint64 | Settlement timestamp, consensus ms |

### Balance ledger update history {#user_ledger_updates}

> ⚠️ **This read answers `[]` today, and it is not scheduled.** The node keeps
> no per-account ledger history for REST. The archive does retain the deltas,
> but in the node stream's own record shape: a signed `delta` and a numeric
> token id. The locked record shape below instead matches the
> [`ledger_updates` WS record](../ws/subscriptions.md#ledger_updates), which
> carries an unsigned `amount` and a fine-grained `kind`. The gateway will not
> route the archive's data through a shape it does not match. This opens when
> the archive stores the matching record shape, not before.

**Neither side can answer this read today.** The node emits each balance delta
once, on the [`ledger_updates` WS channel](../ws/subscriptions.md#ledger_updates),
and keeps nothing after. The archive keeps the deltas, in the different shape
above. Use the WS channel for live movement; there is no REST history for it
yet.

**A deployment with no archive answers typed-empty**: `updates` is `[]`, never
an error. So `[]` carries two meanings — "no archive here" and "no delta in
this window" — and the reply does not tell them apart. For a live per-account
feed, subscribe to the WS channel instead.

**Request**

```json
{ "type": "user_ledger_updates", "address": "0x<addr>", "start_time": 1700000000000, "end_time": 1700003600000 }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `start_time` / `end_time` | uint64 | no | Window, ms. Echoed back; `null` when omitted |

**Response**

```json
{
  "data": {
    "type": "user_ledger_updates",
    "address":    "0x<addr>",
    "start_time": 1700000000000,
    "end_time":   1700003600000,
    "updates":    []
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `start_time` | uint64 \| null | Echoes the request window start |
| `end_time` | uint64 \| null | Echoes the request window end |
| `updates` | array | Ledger-update records. Always `[]` today |

Locked record shape: the
[`ledger_updates` WS record](../ws/subscriptions.md#ledger_updates) verbatim —
`{kind, amount, time}` plus the kind-specific fields
(`destination`, `token`, `asset`, `to_perp`, `via`). Every `amount` is a
whole-token decimal string; no record carries raw base units. The underlying
deltas, once retention lands, come from the archive's
[`node_ledger`](../../nodes/data-streams.md#node_ledger) stream.

### Past executed orders {#historical_orders}

An account's past (executed) orders, folded from the same committed
per-account fill records that [`user_fills`](#user_fills) reads. One record
per order (`oid`), newest first, with `filled_sz` the exact sum of that
order's fills.

**Request**

```json
{ "type": "historical_orders", "address": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account address |
| `limit` | uint32 | no | Cap on the number of most-recent records returned. Absent or `0` returns all, bounded by the underlying fill history |

**Response**

```json
{
  "data": {
    "type": "historical_orders",
    "address": "0x<addr>",
    "orders": [
      {
        "oid":       12345,
        "coin":      "BTC",
        "side":      "B",
        "px":        "67042.5",
        "filled_sz": "1.2",
        "time":      1700000000555,
        "block":     562,
        "hash":      "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c",
        "status":    "filled"
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `orders[*].oid` | uint64 | Order id, the fold key |
| `orders[*].coin` | string | Market symbol the order executed on |
| `orders[*].side` | `"B"` / `"A"` | Side token — `"B"` = buy/bid, `"A"` = sell/ask. Same token as [`user_fills`](#user_fills) |
| `orders[*].px` | Decimal string | Price of the order's most-recent fill, decimal USDC |
| `orders[*].filled_sz` | Decimal string | Total executed size — the exact sum of every fill of this `oid`, whole units |
| `orders[*].time` | uint64 | Timestamp of the most-recent fill, consensus ms |
| `orders[*].block` | uint64 | Committed block of the most-recent fill |
| `orders[*].hash` | hex string | Transaction hash of the originating order. `""` when none was recorded |
| `orders[*].status` | `"filled"` | The only status emitted today — see below |

**Rules**

- Records list newest-first. The underlying history is bounded, so this is a
  recent window, not the full account history.
- `status` is `"filled"` only, today. The history holds executed legs only, so
  cancel, reject and expire records are not emitted yet — a
  partially-filled-then-cancelled order still renders as `"filled"`, with
  `filled_sz` equal to the executed portion.
- Live resting orders and parked triggers are not repeated here; they are
  derivable. Read them from [`open_orders`](#open_orders) or
  [`order_status`](#order_status).

### Commit-time verdict on a submitted action {#action_outcome}

:::danger[Removed]
**`action_outcome` no longer exists.** The node answers it with
`unknown info type`, the same error a type that never existed gets.

There is nothing to migrate to, because the answer already arrives earlier.
`POST /exchange` waits for the commit and returns the real outcome: an order
gets its assigned `oid` and its resting or filled state; any other action gets
a committed confirmation, or a rejection with its reason. Read
[the submit response](./exchange.md) instead of calling this a second time.

The read existed for two residual cases, and neither needs a second endpoint:

- **The wait expired.** `/exchange` bounds its wait at about fifty blocks. If
  it gives up, the chain is not keeping up; the action may still commit.
  Re-read the state the action was meant to change. Do not treat the timeout
  as a failure.
- **You passed `?confirm=async`.** You asked not to wait. For orders,
  subscribe to the `order_updates` [WS channel](../ws/subscriptions.md)
  instead.

:::caution[Re-submitting the same nonce answers nothing]
Re-submitting is replay-safe — the committed nonce window rejects the
duplicate — but it is usually silent. The block builder drops a committed
replay before the commit loop sees it, so no verdict is ever produced, and the
second call times out exactly like the first. Re-read state instead.
:::
:::

### TWAP slice-fill history {#user_twap_slice_fills}

Fill history for individual TWAP order slices.

**Status: empty (history retention pending).** `fills` returns `[]` until TWAP
slice fills are retained for REST. For live slice fills today, subscribe to
the `user_twap_slice_fills` [WS channel](../ws/subscriptions.md); the
account's active TWAP parents are on [`user_twaps`](#user_twaps).

**Request**

```json
{ "type": "user_twap_slice_fills", "address": "0x<addr>" }
```

No parameters beyond `address`, which is required (hex address).

**Response**

```json
{ "data": { "type": "user_twap_slice_fills", "address": "0x<addr>", "fills": [] } }
```

| Field | Type | Meaning |
|-------|------|---------|
| `address` | hex address | Echoes the request address |
| `fills` | array | Slice-fill records. Empty until REST retention ships |

Locked record shape, for when retention ships: `{twap_id, fill}` —
`twap_id` (uint64) is the parent TWAP id, and `fill` is a full
[`user_fills`](#user_fills) record for the slice.

### Per-validator staking reward accruals {#delegator_rewards}

The delegator's live per-validator reward accruals, plus the total a
claim-all would pay right now.

**Request**

```json
{ "type": "delegator_rewards", "address": "0x<addr>" }
```

No parameters beyond `address`, which is required (hex address).

**Response**

```json
{
  "data": {
    "type": "delegator_rewards",
    "address":           "0x<addr>",
    "claimable_rewards": "9",
    "rewards": [
      { "validator": "0x<val_a>", "unclaimed": "3", "last_claim_time": 1700000000000 },
      { "validator": "0x<val_b>", "unclaimed": "4", "last_claim_time": 1700000500000 }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `claimable_rewards` | Decimal string | What a claim-all ([`claim_rewards`](./exchange.md#claim_rewards) without `validator`) pays the delegator now: the sum of every row's `unclaimed`, plus the account's legacy reward roll-up bucket, which drains on claim. Delegator side only — the separate validator-commission credit a claim also pays out is not delegator-claimable, and is excluded |
| `rewards[*].validator` | hex address | Validator the delegation accrues under |
| `rewards[*].unclaimed` | Decimal string | Live unclaimed reward accrued on this delegation, whole MTF |
| `rewards[*].last_claim_time` | uint64 | Last claim timestamp on this delegation, consensus ms. `0` if never claimed |

**Rules**

- Rows list in ascending validator-address order.
- An account with no staking state returns `claimable_rewards: "0"` and an
  empty `rewards` array.

## Governance query types {#governance-query-types}

**The governance reads have their own page now:
[governance queries](./info/governance.md).**

One read serves the whole surface —
[`validator_votes`](./info/governance.md#validator_votes). It reports votes
that are still open and votes that already enacted, over a time range. It is
the one place a caller learns that a governance action happened, who voted for
it, and what the parameter was before.

That matters because a governance vote can move a **margin** parameter. A
two-thirds-stake vote once lowered `max_leverage` on BTC and ETH from 100 to
20, and no public read reported that it had happened. Stake quorum is ⅔,
stake-weighted; **jailed** validators are excluded from the denominator and
from every tally.

The three older governance reads are retired from the public gateway. Each
answers `410 Gone` with a body naming `validator_votes`.

## Node snapshot query types {#node-snapshot-query-types}

These reads answer from the node's committed state, over the same
`{type, data}` envelope and the same conventions as every read above: money as
decimal strings, addresses as `0x`-hex, asset ids as unsigned integers, map
keys in sorted order. Each is a keyed lookup, not a scan, except where the set
is inherently small (markets, vaults, validators).

Perpetual market reads are on the [perpetual queries](./info/perpetuals.md)
page, and spot, spot-margin and Earn reads on the
[spot & margin queries](./info/spot.md) page. The reads below are the ones
that belong to no single product: exchange status, open-order helpers,
liquidation, rate limits, vaults, validators and multi-sig.
### Global exchange trading status {#exchange_status}

Global trading status. No parameters.

```json
{ "type": "exchange_status" }
```

**Response**

```json
{
  "data": {
    "type": "exchange_status",
    "spot_disabled": false,
    "post_only": false,
    "mip3_enabled": true,
    "frozen": false,
    "timestamp": 1735689600000
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `spot_disabled` | bool | Spot trading globally disabled |
| `post_only` | bool | A post-only window is in force — new orders must be maker-only |
| `frozen` | bool | The chain is in a pending upgrade halt |
| `timestamp` | uint64 | Consensus block time, ms — the "as of" for every field above |
| `mip3_enabled` | bool | `true` once any MIP-3 market/pair spec is registered |

:::info
This reports current status only. It does not return the pending upgrade
height or the node's replay progress. `frozen` shows a halt is coming; it does
not give a date.
:::

:::warning
`frontend_open_orders` is removed (folded into `open_orders`, wire-v2 phase 2).
A request now returns `400 UNKNOWN_TYPE`.
The TIF / `cloid` / trigger detail it used to carry is on every
[`open_orders`](#open_orders) row already — see that entry.
:::

### Active TWAP parents for an account {#user_twaps}

The account's active TWAP parent orders: the live slice schedulers, with total
size versus executed size. A completed or cancelled TWAP leaves this set — it
is the live set, not history. For slice-fill history, use
[`user_twap_slice_fills`](#user_twap_slice_fills). Required: `address` (0x hex).

```json
{ "type": "user_twaps", "address": "0x<addr>" }
```

**Response**

```json
{
  "data": {
    "type": "user_twaps",
    "address": "0x<addr>",
    "twaps": [
      {
        "twap_id":         1,
        "coin":            "BTC",
        "side":            "B",
        "sz":              "1.5",
        "executed_sz":     "0.6",
        "slices_total":    10,
        "slices_done":     4,
        "delay_ms":        3000,
        "last_fire_ts": 42000,
        "reduce_only":     false
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `twaps[*].twap_id` | uint64 | Parent TWAP id (pass to [`twap_cancel`](./exchange.md#twap_cancel)) |
| `twaps[*].coin` | string | Market symbol |
| `twaps[*].side` | `"B"` / `"A"` | Side token — the same `"B"`/`"A"` form as [`user_fills`](#user_fills) |
| `twaps[*].sz` | Decimal string | Parent total size (whole units) |
| `twaps[*].executed_sz` | Decimal string | Size already filled by fired slices (whole units) |
| `twaps[*].slices_total` | uint32 | Slice count the parent was scheduled with |
| `twaps[*].slices_done` | uint32 | Slices fired so far |
| `twaps[*].delay_ms` | uint64 | Inter-slice delay (ms) |
| `twaps[*].last_fire_ts` | uint64 | Last slice fire timestamp (consensus ms) |
| `twaps[*].reduce_only` | bool | Parent is reduce-only |

Rows are listed in ascending `twap_id` order. There is no `duration` field:
compute it as `slices_total × delay_ms`. The wire carries only the independent
values.

### Summary of all vaults {#vault_summaries}

All vaults summary. No parameters.

```json
{ "type": "vault_summaries" }
```

**Response**

```json
{
  "data": {
    "type": "vault_summaries",
    "vaults": [
      { "id": 7, "address": "0x<vault>", "leader": "0x<leader>", "tvl": "10000000000", "follower_count": 2, "kind": "user" }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `vaults[*].id` | uint64 | Vault id |
| `vaults[*].address` / `leader` | hex address | Vault on-chain address / leader |
| `vaults[*].tvl` | decimal string | Mark-to-market NAV, whole-USDC — same figure as [`vault_state.tvl`](#vault_state) |
| `vaults[*].follower_count` | uint64 | Number of share holders |
| `vaults[*].kind` | `"user" \| "metaliquidity"` | Vault kind |

Every vault appears, and each row names its `leader`. To list the vaults led
by one address, filter these rows on `leader` — there is no per-leader read.

### A user's action stats {#user_rate_limit}

A user's action counters. Required: `address` (0x hex).

**Despite the name, this does not report a rate-limit budget.** It returns
nonce and action counters only, not bucket state. No read exposes remaining
budget — track your own spend against [rate limits](../rate-limits.md).

```json
{ "type": "user_rate_limit", "address": "0x<addr>" }
```

**Response**

```json
{
  "data": { "type": "user_rate_limit", "address": "0x<addr>", "last_nonce": 9, "pending_count": 2, "lifetime_count": 123 }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `last_nonce` | uint64 | Last accepted action nonce |
| `pending_count` | uint32 | Pending (in-flight) action count |
| `lifetime_count` | uint64 | Lifetime actions submitted |

An address with no record reads as all zeros.

### All approved builder-fee grants {#approved_builders}

Every builder-fee grant an account has approved, and the bps ceiling on each.
Required: `address` (0x hex). To check one `(address, builder)` pair, look the
builder up in this list — an address that is absent is not approved, which is
the same answer as a `"0"` ceiling.

```json
{ "type": "approved_builders", "address": "0x<addr>" }
```

**Response**

```json
{
  "data": {
    "type": "approved_builders",
    "address": "0x<addr>",
    "builders": [
      { "builder": "0x<builder_a>", "max_fee_bps": "25" },
      { "builder": "0x<builder_b>", "max_fee_bps": "50" }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `builders[*].builder` | hex address | Approved builder address |
| `builders[*].max_fee_bps` | string | Approved bps ceiling as a decimal string of whole basis points |

> ⬆️ **Upgrade notice — `max_fee_bps` becomes a STRING at the next node
> release.** The value stays the same; only the JSON type changes. Parse every
> `*_bps` field as a decimal string. Most carry whole basis points.
> `maker_bps` and `taker_bps` carry one fraction digit, because the fee ladder
> stores deci-bps. A client that reads any `*_bps` field as a number will
> break on release day. Accept a string now.

Builders list in ascending address order; an account with no approvals returns
an empty array.

### Current per-validator oracle vote metadata {#validator_l1_votes}

Current validator L1 votes. No parameters.

```json
{ "type": "validator_l1_votes" }
```

**Response**

```json
{
  "data": {
    "type": "validator_l1_votes",
    "latest_round": 5,
    "votes": [ { "round": 5, "validator": "0x<validator>", "submitted_at": 1700000000000 } ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `latest_round` | uint64 | Latest accepted vote round |
| `votes[*].round` | uint64 | Vote round |
| `votes[*].validator` | hex address | Casting validator |
| `votes[*].submitted_at` | uint64 | Submission timestamp (consensus ms) |

The vote payload is opaque oracle bytes, decoded internally. This read reports
metadata only, not the raw payload.

### Per-validator stake and status snapshot {#validator_summaries}

Per-validator snapshot: stake, status, and delegation for every validator in
the active validator registry (a small, bounded set), in ascending key order.

Optional: `address` (0x hex). Naming an address adds that caller's own stake
to every row; it changes nothing else.

```json
{ "type": "validator_summaries", "address": "0x<addr>" }
```

**Response**

```json
{
  "data": {
    "type": "validator_summaries",
    "total_stake": "1400",
    "n_active": 1,
    "validators": [
      {
        "validator": "0x1111…", "signer": "0xa1a1…", "validator_index": 0,
        "display_name": "alice.mtf",
        "stake": "1000", "self_stake": "100", "delegated_stake": "900",
        "your_stake": "7", "commission_bps": "500",
        "is_active": true, "is_jailed": false, "jailed_at": null,
        "unjail_at": null, "first_active_epoch": 2
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `total_stake` | decimal string | Σ stake across all validators |
| `n_active` | uint64 | Size of the active set |
| `validators[*].validator` | 0x address | Validator primary address |
| `validators[*].signer` | 0x address | Operational signer (hot key) |
| `validators[*].validator_index` | uint32 | Consensus index |
| `validators[*].display_name` | string \| null | The operator's chosen handle (`set_display_name`), or `null` when it set none |
| `validators[*].stake` | decimal string | Total stake: self plus everyone else's |
| `validators[*].self_stake` | decimal string | Validator's own contribution |
| `validators[*].delegated_stake` | decimal string | `stake − self_stake`: everything staked by someone OTHER than the validator |
| `validators[*].your_stake` | decimal string \| null | The stake the REQUESTING address has delegated to this validator |
| `validators[*].commission_bps` | string | Commission in whole basis points, as a decimal string |
| `validators[*].is_active` | bool | In the active set this epoch |
| `validators[*].is_jailed` | bool | Currently jailed |
| `validators[*].jailed_at` | uint64 \| null | Jail start ts (null if not jailed) |
| `validators[*].unjail_at` | uint64 \| null | Earliest unjail ts (null if not jailed) |
| `validators[*].first_active_epoch` | uint64 | First epoch the validator was active |

**`display_name` of `null` means UNSET, never "unknown".** Fall back to the
address. Do not invent a name, and do not treat `null` as a node that predates
the field.

**`your_stake` distinguishes two different blanks.** `"0"` means the request
named an address and that address has delegated nothing to THIS validator.
`null` means the request named **no** address, so the field is about nobody —
render the column as empty, not as a zero balance.

**`delegated_stake` is derived, not stored.** It is exactly `stake − self_stake`,
so it can never drift from the two figures beside it. Do not sum it across rows
to get `total_stake`: that sum excludes every validator's self-stake.

**There is no `epoch` key**, and there was never a live one. The chain's
current-epoch counter has no production writer, so any value served would be a
constant rather than the chain's real epoch. Read `first_active_epoch` per
validator instead.

`n_recent_blocks` is not tracked on-chain — omitted rather than fabricated.

### Advertised peer roster {#gossip_root_ips}

The nodes this deployment advertises for peer discovery. No parameters. Network
topology, **not** committed state.

:::warning Not live yet
The `peers` shape below is the target state. The release that carries it has not
fired. Until it does, a live node answers this query with the previous shape,
`{ "root_ips": ["host:port", ...] }`. Do not ship a client against `peers`
before the release.
:::

```json
{ "type": "gossip_root_ips" }
```

**Response**

```json
{
  "data": {
    "type": "gossip_root_ips",
    "peers": [
      {
        "id": 3,
        "gossip": "203.0.113.7:4001",
        "peer_rpc": "203.0.113.7:4002",
        "auth": "203.0.113.7:4003",
        "pubkey_hex": "02ab..."
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `peers` | object[] | One row per advertised node. Empty when the deployment advertises nothing. |
| `peers[*].id` | uint16 | The node's numeric id |
| `peers[*].gossip` | string | Public gossip endpoint, `host:port` |
| `peers[*].peer_rpc` | string | Public peer-RPC endpoint, `host:port` |
| `peers[*].auth` | string | Public auth endpoint, `host:port` |
| `peers[*].pubkey_hex` | string (optional) | Compressed secp256k1 public key for the peer's TCP auth. The key is **absent** when the operator did not publish it. |

**Why a row holds all three ports.** A row is a copy-shaped peer config: the
five fields map one-to-one onto a joining node's own peer entry, so you paste
a row and dial it.

**Where the rows come from.** Each node serves an operator-curated roster from
its own config. The roster states public reachability. It is **not** the
node's internal dial list, and no address from that dial list can appear here.

**A node that advertises nothing is absent from the rows.** There is no
fallback. A validator can run, vote and serve while publishing no address — it
simply does not appear. An empty `peers` array is therefore the honest answer
for a deployment that advertises nothing, not an error and not a sign of an
unhealthy node.

The roster reflects node config published at startup. It is not committed
state and is not folded into the AppHash.

## Removed reads {#retired-reads}

Each name here answers `UNKNOWN_TYPE`. The read surface is cut so that **each
question has exactly one read**: two reads for one question force a choice, and
a wrong choice is silent. For the release a removal landed in, see
[migration](../migration.md).

The status splits the two kinds of removal:

- **`400`** — the name never named a read on this API, or its answer is gone.
- **`410`** — the name was public and its answer MOVED. Eight names get this:
  `account_overview`, `bridge_chain_configs`, `bridge_user_outbox`,
  `evm_contract_bindings`, `gov_history`, `gov_proposals`, `gov_state` and
  `pm_summary`. The error carries `details.use`, naming the read to call
  instead, so a client can follow the move without reading this table.

| Removed | Call this instead |
|---|---|
| `abstraction_state` | Nothing. Its `kind` / `value` pair was per-kind free-form, so a value had no wire-defined meaning |
| `account_overview`, `web_data` | [`account_state`](#account_state) with `detail: "overview"` — the same body |
| `agents` | [`account_state`](#account_state) with `detail: "overview"` — `agents` |
| `block_info` | [`account_state`](#account_state) for the committed `height` / `time` stamp; the [`explorer_block`](../ws/subscriptions.md#explorer_block) WS channel for the full block head |
| `bridge_chain_configs` | [`bridge_withdrawal_history`](./info/bridge.md#bridge_withdrawal_history) — `withdrawals_halted` and `configs` |
| `bridge_finalized_cosignatures`, `bridge_outbound_queue` | [`bridge_withdrawal_history`](./info/bridge.md#bridge_withdrawal_history) for one account's own withdrawals. The whole-chain queue and the raw validator cosignature bytes are not part of this API |
| `delegator_history` | Nothing. No delegation event log is committed |
| `delegator_summary` | [`account_state`](#account_state) with `detail: "overview"` — `staking.summary` |
| `dynamic_risk` | [`markets_meta`](./info/perpetuals.md#markets_meta) — `risk_override` |
| `encode_action` | Nothing. The multisig inner blob takes the ordinary `{type, params}` wire action — see [signing the inner action](../../concepts/multi-sig.md#signing-the-inner-action) |
| `evm_contract_bindings` | [`markets_meta`](./info/perpetuals.md#markets_meta) with `kind: "spot"` — `evm_contract` |
| `gov_state`, `gov_proposals`, `gov_history` | [`validator_votes`](./info/governance.md#validator_votes) — `status: "voting"` for open votes, `status: "enacted"` for history. A parameter VALUE is on the read that owns it: [`markets_meta`](./info/perpetuals.md#markets_meta), [`fee_schedule`](#fee_schedule), [`exchange_status`](#exchange_status) |
| `leading_vaults` | [`vault_summaries`](#vault_summaries) — filter the rows on `leader` |
| `margin_summary` | [`account_state`](#account_state) with `detail: "margin"` |
| `market_info` | [`markets`](./info/perpetuals.md#markets) with `coin`, plus [`markets_meta`](./info/perpetuals.md#markets_meta) with `coin` |
| `max_builder_fee` | [`approved_builders`](#approved_builders) — look the builder up in the list |
| `max_market_order_ntls`, `perps_at_open_interest_cap` | [`markets_meta`](./info/perpetuals.md#markets_meta) — `max_market_order_ntl` is the served headroom, one row per market. `null` = uncapped, `"0"` = at the cap. Do not rebuild it from `open_interest` and `oi_cap`: an uncapped row OMITS `oi_cap`, so that arithmetic reads uncapped as zero headroom |
| `node_info` | Nothing on this API. Per-node identity is not consensus state, so two honest nodes answer differently. The chain id is fixed per network — see [networks](../../networks.md#summary) |
| `oracle_sources` | Nothing. The per-market bitmask it served is not read by the price aggregator. The static source facts are prose — see [oracle prices](../../concepts/oracle-prices.md#source-table) |
| `perp_dex_limits` | [`perp_dexs`](./info/perpetuals.md#perp_dexs) — `limits` |
| `pm_summary` | [`account_state`](#account_state) — `perp.pm_maint_margin`, `perp.pm_concentration_penalty` and the top-level `pm_net_value`, with `abstraction: "portfolio"` as the enrolment flag |
| `predicted_fundings` | [`markets`](./info/perpetuals.md#markets) — each row's `funding` block carries the charged rate and the next boundary |
| `protocol_metrics` | [`markets`](./info/perpetuals.md#markets), [`markets_meta`](./info/perpetuals.md#markets_meta) and [`staking_state`](#staking_state) carry every public fact it held. The rest was node diagnostics |
| `recent_trades`, `trades_by_time` | [`trades`](./info/perpetuals.md#trades) — un-ranged for the recent window, ranged for a time window |
| `spot_clearinghouse_state` | [`account_state`](#account_state) — `spot.balances` is the whole token ledger |
| `spot_deploy_state` | [`spot_deploy_auction`](./info/spot.md#spot_deploy_auction) — the same read, renamed |
| `staking_apr` | [`staking_state`](#staking_state) — `reward_pool`. It never served an APR |
| `sub_accounts` | [`account_state`](#account_state) with `detail: "overview"` — `sub_accounts` |
| `token_info` | [`markets_meta`](./info/perpetuals.md#markets_meta) with `kind: "spot"` |
| `user_fees` | [`fee_schedule`](#fee_schedule) with `address` — it resolves the effective maker / taker bps |
| `user_fills_by_time` | [`user_fills`](#user_fills) with `start_time` / `end_time` |
| `user_role` | [`account_state`](#account_state) with `detail: "overview"` — `role` |
| `user_to_multi_sig_signers` | [`account_state`](#account_state) with `detail: "overview"` — `multisig` |
| `user_vault_equities` | [`account_state`](#account_state) with `detail: "overview"` — `vault.equities` |
| `web_data2` | [`account_state`](#account_state) for margin and balances, [`clearinghouse_state`](#clearinghouse_state) for positions, `detail: "overview"` for vault equities; [`open_orders`](#open_orders) for resting orders; [`exchange_status`](#exchange_status) for status. The WS channel is removed too, and answers `{"channel":"error","data":{"error":"unknown channel: web_data2"}}` |

## Reads gated by their capability {#operator-reads}

These two reads exist on the wire already. Each answers with the same error an
unknown type gets, not because it is restricted to an operator, but because the
capability it reads is not reachable yet. Each ships publicly the day that
capability does.

| Read | Ships when |
|---|---|
| `mip3_deployer_oracle` | The `mip3_deployer_oracle` protocol feature is armed on the target chain |
| `fba_batch_state` | The FBA engine becomes reachable from `/exchange` |


## Errors {#errors}

Read the full list, with the caller action for each code, in the
[error reference](../errors.md). These are the codes `/info` produces:

| HTTP | `error.code` | Cause |
|------|--------------|-------|
| 200 | — | Success. An **unknown address** on `account_state` and its siblings is a **200** with a zeroed record, NOT a 404 |
| 400 | `INVALID_REQUEST` | No `type` discriminator, a required type-specific argument omitted, or a malformed address |
| 400 | `UNKNOWN_TYPE` | The `type` names no read. It is misspelled, or the read is removed |
| 410 | `UNKNOWN_TYPE` | The `type` names a read whose answer MOVED. `details.use` names the read to call instead — see [removed reads](#retired-reads) |
| 404 | `MARKET_NOT_FOUND` | The `coin` symbol is unknown (`markets`, `l2_book` and other market reads) |
| 404 | `NOT_FOUND` | A named resource is unknown, such as a vault address on `vault_state` |
| 429 | `RATE_LIMITED` | No retry hint is sent — see [rate limits](../rate-limits.md) |
| 500 | `INTERNAL` | Our defect, not your request. Retry, then report it |

A `405` carries no envelope: the endpoint is POST-only, and the router refuses
another method before the envelope exists.

:::warning
There is **no `account not found`** error: account-keyed readers (`account_state`,
`open_orders`, `user_rate_limit`, `staking_state`, …) return a **200** zeroed
record for an address that has never appeared on-chain — they never 404.
:::

## Read-after-write consistency {#read-after-write-consistency}

`/info` reads from the most recent committed block. A `POST /exchange` admitted at time `T` is not visible in `/info` until the leader commits the block containing it — one committed block later. Block cadence is a governed, per-deployment target, not a fixed duration; measure your own deployment's committed-round rate if you need a wall-clock estimate.

For read-your-writes semantics, subscribe to [`order_updates`](../ws/subscriptions.md#order_updates) (order lifecycle) and [`fills`](../ws/subscriptions.md#fills) (executions); committed events arrive in commit order, removing the need to poll.

## Sequence — query an account, see your own order {#sequence--query-an-account-see-your-own-order}

```mermaid
sequenceDiagram
    participant client
    participant gateway
    participant node
    client->>gateway: POST /exchange Order
    gateway->>node: admit
    node-->>gateway: 202 Accepted
    gateway-->>client: 202 Accepted
    Note over client,node: ... one committed block later ...
    client->>gateway: POST /info open_orders
    gateway->>node: 
    node->>node: read committed state
    node-->>gateway: 200 [order present]
    gateway-->>client: 200 [order present]
```

## See also {#see-also}

- [`POST /exchange`](./exchange.md) — write path
- [`POST /faucet`](./faucet.md) — devnet/testnet test-fund grant (USDC + MTF)
- [WS subscriptions](../ws/subscriptions.md) — push equivalents

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: How do I address a market — by id or by name?**
A: By `coin` symbol (`"BTC"`). The legacy numeric `asset_id` / `market_id` request
arguments were removed; only `coin` is accepted, and responses render coin symbols
everywhere. (The signed `/exchange` write path still uses the numeric `asset` —
that field is consensus-frozen and unrelated to these read args.)

**Q: Do `user_fills` / `trades` need an external indexer?**
A: No. Both read a committed on-node tape (a bounded per-account fill ring and per-market trade ring folded into the AppHash), so any node serves real records directly — no external indexer required. The rings are bounded, so they hold a recent window; for an unbroken live feed subscribe to the [WS channels](../ws/subscriptions.md). History PAST the ring is a different question: the archive holds it, and a RANGED ask (one that carries `start_time`) reaches it. An un-ranged ask always answers from the ring — see [Deep history, past the ring](./info/perpetuals.md#trades-archive).

**Q: Is the response deterministic across nodes?**
A: Yes. Any honest node returns identical responses for the same query at the same committed height. Nodes with different commit heights may differ, so compare the `height` / `time` stamp [`account_state`](#account_state) carries before you call two answers inconsistent. `gossip_root_ips` is the one field that is NOT consensus state: it reads each node's own config, so nodes that carry the same roster answer identically, and nodes that do not may differ.

</details>
