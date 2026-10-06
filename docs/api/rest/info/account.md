---
description: "Collateral and margin health, the account's perp positions, and the reservation ledger a standard-mode account carries."
---

# Account state reads

These queries read account state through [`POST /info`](../info.md). That page defines the endpoint, the request envelope, the number planes and the error shape. They apply to every query here.

### Per-account collateral and margin health {#account_state}

This read returns one snapshot of one account. The top level holds the cross-account money figures. Then one summary per lane follows: `perp`, `spot`, `margin` and `option`.

:::info The lane split is active
A running node answers the lane shape on this page. The top level no longer
carries `maint_margin` or `mode`. `position_mode` replaces `mode`, and
`cross_maintenance_margin_used` is served only at `detail: "margin"`. The perp
position table moved to [`clearinghouse_state`](#clearinghouse_state) and the
option legs to [`option_state`](./options.md#option_state). To move a client
off the old flat shape, read [where every field went](#account-state-lane-split).
:::

`account_state` answers one question: what the
account is worth, and how close it is to liquidation. Every figure in it comes
from one committed block, so the set is consistent. Position
detail is a different question, so it has its own read:
[`clearinghouse_state`](#clearinghouse_state) for perp legs and
[`option_state`](./options.md#option_state) for option legs.

:::danger
Do not join two frames to compute one number. A summary and a detail frame
can come from commits that are one block apart, so a health figure built from both was never true
at any single block. Every frame carries `height`. Compare it before you combine
anything. For one consistent set, take it from `account_state` alone.
Each lane summary is whole inside that one body for this reason.
:::

**Request**

```json
{ "type": "account_state", "address": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|-------------|
| `address` | hex address | yes | Account address |
| `detail` | `"full"` \| `"margin"` \| `"overview"` | no | Response depth. Absent means `"full"` |

`account_state` refuses `detail: "adl"` with `400` / `INVALID_REQUEST`. The body carries
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

An unknown address (never seen on-chain) returns `200` with this zeroed
record. It does not return `404`.

#### Where every field went {#account-state-lane-split}

Use this table to find a field. `account_state` is the only read that
moved. Every field still exists.

| Was, at the top level | Is now | Note |
|---|---|---|
| `address` | `address` | unchanged |
| `height`, `time` | `height`, `time` | unchanged, and on every frame of both new reads too |
| `abstraction` | `abstraction` | unchanged, an account setting and not a lane |
| `position_mode` | `position_mode` | unchanged, an account setting and not a lane |
| `account_value` | `account_value` | unchanged, folds perp and spot-margin unrealised PnL |
| `total_raw_usd` | `total_raw_usd` | unchanged |
| `withdrawable` | `withdrawable` | unchanged, subtracts both lanes' held initial margin |
| `health` | `health` | unchanged, derives from `account_value` |
| `tier` | `tier` | unchanged, derives from `health` |
| `health_deferred` | `health_deferred` | unchanged, still present only when `true` |
| `pm_net_value` | `pm_net_value` | unchanged. It stays at the top level. See the warning below |
| `total_margin_used` | `perp.init_margin` | renamed as well as moved. The name `total_margin_used` survives only on `detail: "margin"` |
| `total_ntl_pos` | `perp.total_ntl_pos` | |
| `pm_maint_margin` | `perp.pm_maint_margin` | |
| `pm_concentration_penalty` | `perp.pm_concentration_penalty` | |
| `balances` | `spot.balances` | the rows are unchanged, field for field |
| `clearinghouse_state` | its own read: [`clearinghouse_state`](#clearinghouse_state) | same wire name, same row shape. Also a WS channel |
| `cross_maintenance_margin_used` | `detail: "margin"` only | it was already only on that depth, and it stays there |

Two more names moved outside this body:

- `option_positions` is renamed [`option_state`](./options.md#option_state). The old name
  answers `unknown info type`; it is not an alias.
- `detail: "adl"` moves from `account_state` to
  [`clearinghouse_state`](#clearinghouse_state).

:::warning
`pm_net_value` is not under `perp`, by design. Its cash term is
the whole unified USDC pool, and under multi-collateral it also folds
haircut-valued spot balances. It is the portfolio-margin twin of `account_value`,
so a client that sums the lanes would count the same USDC twice. The other three
`pm_*` figures are perp-scoped and sit under `perp`.
:::

There is no transition window. One builder serves one shape. The top level refuses the old flat
names, so a half-migrated body cannot ship.

#### Every lane key is always present {#account-state-lanes}

`perp`, `spot`, `margin` and `option` are always in the body, zeroed when the
lane is empty. A client does not need to test for a missing lane key. An
account with nothing in a lane reads:

| Lane | Empty-account value |
|---|---|
| `perp` | `{"init_margin":"0","total_ntl_pos":"0","pm_maint_margin":"0","pm_concentration_penalty":"0"}` |
| `spot` | `{"balances":[ <the USDC row, all zeros> ]}`: never an empty array |
| `margin` | `{"collateral":"0","debt":"0","pairs":0}` |
| `option` | `{"escrow":"0","legs":0}`: `next_expiry` is absent |

Code against two shapes:

- `spot.balances` is never `[]`. The USDC row is unconditional, even for an
  account that has never been funded. No real account returns an empty array. If you see one, you are reading a placeholder, not an account. Check
  the `height` stamp: a placeholder stamps `0`.
- `option.next_expiry` is absent when `legs` is `0`. It is the one
  non-uniform key in the body. A zero timestamp would read as 1970, so the key is
  omitted instead of zeroed. Test `legs > 0`, or test for the key.

#### The two depths do not carry the same names {#account-state-detail-margin}

`detail: "margin"` answers with the margin scalars only: `address`,
`account_value`, `total_raw_usd`, `withdrawable`, `total_margin_used`,
`cross_maintenance_margin_used`, `health`, `tier`, `abstraction`, plus
`health_deferred` when true and the `height` / `time` stamp. It skips the
position walk and the balance scan, so use it for a frequent
liquidation-health poll, such as a risk-watcher bot or an automated margin deposit. Both
depths compute the scalars with one shared helper, so the numbers always
agree.

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
The held initial margin has two names, one per depth. `detail: "margin"`
calls it `total_margin_used` at the top level. The full depth calls it
`init_margin` and files it under `perp`. The number and the helper are the same. Read the name that your depth serves. Neither depth serves the name of the other.
:::

The rest of the two depths differ in both directions:

- `cross_maintenance_margin_used` is served only at `detail: "margin"`. The
  full depth carries the per-leg `maint_margin` on each
  [`clearinghouse_state`](#clearinghouse_state) position row instead. The two are
  different quantities: one is the account aggregate, one is the contribution of a single leg.
- `perp.total_ntl_pos` is served only at the full depth. It is a sum over the
  position walk, and `detail: "margin"` skips that walk.

`detail: "overview"` answers the non-trading state of the account instead: vaults,
staking, sub-accounts, multisig, agents and the derived role. One account has one
state, so it has one read. `detail` chooses which half of that state you want.
`"full"` and `"margin"` both answer the trading half, and `margin` is the scalar-only
subset of it. `"overview"` answers the other half. The only fields all
three share are `address` and the `height` / `time` stamp. See
[`detail: "overview"`](#account_state-overview) below.

#### Field reference {#account-state-fields}

Top level: the cross-account figures.

| Field | Type | Meaning |
|-------|------|-------------|
| `address` | hex address | The account this body describes |
| `account_value` | Decimal string | Equity including settled PnL, whole-USDC plane (`"3000"` is 3000 USDC, not base units). It crosses lanes: it folds perp and spot-margin unrealised PnL over the one unified pool. Split `standard` account: the perp wallet alone. The spot wallet is the USDC row of `spot.balances`; add the two for the account total |
| `total_raw_usd` | Decimal string | Settled cash equity, whole-USDC. Realized USDC only: deposits, closed-position PnL and fees already paid. It excludes unrealised PnL, which is the one difference from `account_value`. It is the `settled cash` term that the `withdrawable` formula starts from, so a caller can reconcile that formula from the read alone |
| `withdrawable` | Decimal string | Cash you can take out, clamped at zero. The value is `total_raw_usd` minus funding you owe minus held initial margin. The margin is the held margin of both lanes, not the perp lane alone. It does not count unrealised profit, so a healthy account funded by open profit reads `"0"`. See [account value](../../../concepts/account-value.md#withdrawable). The admission gate uses the raw signed figure, which can be negative. The read never is. Split `standard` account: the perp wallet alone. Spot USDC is not in it |
| `health` | Decimal string | `account_value − cross_maintenance_margin_used` (a signed dollar figure that can be negative). It is not a ratio |
| `health_deferred` | `true` \| absent | Present, and only ever `true`, when the risk engine cannot price a leg. The risk numbers then do not state solvency. See [account value](../../../concepts/account-value.md). Absent is the normal case; treat absent as `false` |
| `tier` | enum string | `"Safe"`, `"T0"`, `"T1"`, `"T2"`, `"T3"` (the BOLE band of `account_value / cross_maintenance_margin_used`; `"Safe"` when there is no maintenance margin). See [tiered liquidation](../../../concepts/tiered-liquidation.md). It is a string, never a number |
| `abstraction` | enum | `"unified"` (default cross-collateral account), `"standard"` (two USDC wallets, see [account modes](../../../concepts/account-modes.md#standard)) or `"portfolio"` (portfolio-margin enrolled). Derive PM enrolment as `abstraction == "portfolio"`. A caller that switches on this field must handle all three values |
| `reservations` | object \| absent | The per-product reservation ledger. Present only when `abstraction` is `"standard"` and `split` is `false`. See [`reservations`](#account-state-reservations) below. A 0.9.6 node omits it in every mode |
| `split` | bool \| absent | Present only when `abstraction` is `"standard"`. `true` = the account holds two USDC wallets (it entered `standard` under the active split gate); `false` = one pooled balance, the posture of an account that entered before the arm. When `true`, `account_value` and `withdrawable` are the perp wallet, the USDC row of `spot.balances` is the spot wallet, and `reservations` is absent. Read it before you interpret the USDC row. See [the standard-mode split](../../../concepts/usdc.md#standard-split). Served from node 0.9.7; an older node omits the key in every mode |
| `pm_net_value` | Decimal string | PM engine's net scenario value, whole-USDC; `"0"` when not PM-enrolled. Account-scoped, so it is not under `perp`. See the warning above |
| `position_mode` | enum | `"one_way"` (single net position per asset) or `"hedge"` (separate long/short legs). See [hedge mode](../../../concepts/hedge-mode.md) |
| `height` | uint64 | Committed block height this snapshot reflects. A bare integer, not a Decimal string. Advances on every commit, even when nothing else in the record changed |
| `time` | uint64 | Consensus block time in milliseconds. A bare integer. Advances on every commit, from the same consensus clock as `height` |

`perp`: the perp lane summary. Always present. It holds no position rows;
read [`clearinghouse_state`](#clearinghouse_state) for those.

| Field | Type | Meaning |
|-------|------|-------------|
| `perp.init_margin` | Decimal string | Held initial-margin requirement, whole-USDC. Called `total_margin_used` on `detail: "margin"` |
| `perp.total_ntl_pos` | Decimal string | Mark notional of the account's cross perp positions, summed: `Σ \|real size\| × mark_px`, whole-USDC, unsigned. Isolated legs are excluded: they are margined and liquidated on their own. Equal to the sum of `notional` over every `clearinghouse_state` position row whose `isolated` is `false`. Full depth only |
| `perp.pm_maint_margin` | Decimal string | PM engine's maintenance requirement, whole-USDC; `"0"` when not PM-enrolled |
| `perp.pm_concentration_penalty` | Decimal string | PM single-asset concentration penalty, whole-USDC; `"0"` when not PM-enrolled |

The three `pm_*` figures are always present and are meaningful only when
`abstraction` is `"portfolio"`. See [portfolio margin](../../../concepts/portfolio-margin.md).

`spot`: the spot lane summary. Always present.

| Field | Type | Meaning |
|-------|------|-------------|
| `spot.balances` | array | The whole spot token ledger, one row per token held. Never empty: row 0 is always USDC |
| `spot.balances[*].name` | string | Token symbol (`"USDC"` for row 0). Rows are keyed and joined by `name` |
| `spot.balances[*].signing_id` | uint32 | The number you place in the `asset` field of a signed [`send_asset`](../../rest/exchange/transfers.md#send_asset), and in `asset` of an `earn_deposit`. `100` for USDC. It has no other meaning on the read plane. Do not use `spot_send`: no such action exists. That name is a [ledger record kind](../../ws/subscriptions.md#ledger_updates) |
| `spot.balances[*].total` | Decimal string | The whole holding of that token, escrow included. Not the spendable amount: perp margin sits inside it too. Use `withdrawable`. Split `standard` account: the USDC row is the spot wallet alone, and perp margin is not inside it, so `total − hold` is what a spot order may spend. See [the standard-mode split](../../../concepts/usdc.md#standard-split) |
| `spot.balances[*].hold` | Decimal string | Amount locked behind a resting spot order (escrow). A part of `total`, not a second bucket beside it. Never add the two. It is spot escrow only and never holds perp margin |
| `spot.balances[*].avg_entry_px` | Decimal string \| null | Average cost basis for the token. `null` when there is none. Always `null` on the USDC row, because USDC is the quote asset. See [cost basis](#avg-entry-px) |

A spot balance is the spot position, so nothing split off the way the perp
positions did. This lane answers the spot-balance question in full. There is no
separate spot-balance read.

:::warning
`total − hold` is not the spendable amount. `hold` counts spot order escrow
only. USDC that margins an open perpetual position stays in `total` and never
enters `hold`, so `total − hold` overstates the budget for every position holder.
The chain admits a spot buy against free collateral (equity minus held
initial margin). It refuses an order that only `total − hold` allows.

Read `withdrawable` for the spendable USDC figure: it is the same free-collateral
number the admission gate uses, clamped at zero. See
[account value](../../../concepts/account-value.md#balances-and-hold) for the rule
and a worked example.
:::

`margin`: the spot-margin lane summary. Always present. The per-pair detail
is [`spot_margin_state`](../info/spot.md#spot_margin_state).

| Field | Type | Meaning |
|-------|------|-------------|
| `margin.collateral` | Decimal string | Vestigial: it reads `"0"`. Spot margin is cross-collateralized against the one unified USDC account, so there is no per-pair collateral bucket to sum. It is the sum of the equally vestigial per-pair [`spot_margin_state`](../info/spot.md#spot_margin_state) `collateral` field, kept for wire-shape compatibility |
| `margin.debt` | Decimal string | Borrowed principal accrued to now, summed across pairs, whole-USDC. It uses the same accrual the `spot_margin_state` rows report, so the summary can never disagree with the detail |
| `margin.pairs` | uint32 | Number of open spot-margin pairs. A bare integer, not a Decimal string |

`debt` adds up across pairs because the quote asset of every spot pair is USDC.
The sum leaves out `base_held`. It is in per-pair base
units with no common unit, and a notional needs a mark that this read
must not fetch. Read `spot_margin_state` for it.

`option`: the option lane summary. Always present. The per-leg detail is
[`option_state`](./options.md#option_state).

| Field | Type | Meaning |
|-------|------|-------------|
| `option.escrow` | Decimal string | Total USDC this account has locked as a writer on put legs, whole-USDC. What it takes back if every put it wrote settles worthless |
| `option.legs` | uint32 | Number of series the account is party to, puts and calls alike. A bare integer |
| `option.next_expiry` | uint64 \| absent | Nearest expiry among those legs, consensus ms. Absent when `legs` is `0`: a zero timestamp reads as 1970 |

:::warning `option.escrow` counts put legs only
A [call](../../../products/options.md#why-a-call-escrows-one-coin) escrows one
coin per unit, not dollars. `option.escrow` is one USDC number, so adding a call
leg would sum coins into dollars. Call legs are therefore left out of the sum,
while `legs` still counts them.

So `escrow` can read `"0"` on an account with several written calls. This is not a
bug, and the account is not unencumbered: the coin escrow already left the
spot balance of the writer. Read
[`option_state`](./options.md#option_state) for the per-series amounts and their
`settle_asset`.
:::

The chain never prices an option, so this lane carries no mark-priced figure. See
[options](../../../products/options.md).

#### The `reservations` ledger {#account-state-reservations}

In effect from node 0.9.7. A 0.9.6 node omits the field in every mode.

Present only when `abstraction` is `"standard"` and `split` is `false`: an
account that entered `standard` before block 5,710,001 and still holds one USDC
balance. A split account holds two wallets and has no reservations, so the field
is absent. The other two modes have no ledger either.
[`user_set_abstraction`](../../rest/exchange/account.md#user_set_abstraction) clears
the reservations when an account returns to `"unified"`. It refuses to set one in
any mode except `"standard"`. Branch on `abstraction` and `split`, which are in the
same body.

The three keys are reservation scopes, not markets. `spot` covers spot and spot
margin: one reservation binds both, so this `spot` is wider than the `spot` of
the [`fee_schedule`](./fees-credit.md#fee_schedule) product rows, which split `spot_margin` off.

| Field | Type | Meaning |
|-------|------|-------------|
| `reservations.<perp\|spot\|option>.reserved` | Decimal string | The cap the owner set for that scope, whole-USDC. A scope the owner never set reads `"0"`, and `0` admits nothing in that scope: the ledger is fail-closed |
| `reservations.<scope>.held` | Decimal string | USDC that scope encumbers right now, whole-USDC: cross plus isolated perp initial margin, spot-margin initial margin, or option escrow |
| `reservations.<scope>.available` | Decimal string | What the pre-trade gate still admits for new exposure in that scope, clamped at zero |

`available` is not `reserved − held`. Its second arm stops one scope spending
another scope's unused reservation:

```
available(p) = max(0, min(reserved(p) − held(p),
                          withdrawable − Σ_{q≠p} max(0, reserved(q) − held(q))))
```

So a scope can read `"0"` while `reserved` still exceeds `held`: the other scopes
have promised the rest of the pool away. This is the figure that explains a
margin rejection on an account that holds USDC.

The ledger binds admission only. No engine path (liquidation, ADL, settlement,
funding) and no cash path (withdraw, transfer, vault, Earn) reads it, so a
reservation can never hold back your own money and never makes the account harder
to liquidate. `withdrawable` is unaffected by it.

```json
"abstraction": "standard",
"split": false,
"reservations": {
  "perp":   { "reserved": "900", "held": "250", "available": "600" },
  "spot":   { "reserved": "0",   "held": "0",   "available": "0"   },
  "option": { "reserved": "400", "held": "0",   "available": "350" }
}
```

The pool holds 1000. Perp reads 600, not its 650 of unused cap, because option
has promised 400. Option reads 350, not its 400 cap, because perp has promised
650. Spot reserved nothing, so it admits nothing.

#### The as-of stamp {#account-state-as-of}

`height` and `time` show which committed block the snapshot comes from.
They advance on every commit, even when no monetary
field moved. A client can use them to tell a fresh but quiet account (constant
`account_value`, with `height` and `time` still climbing) from a stalled
read path (`height` / `time` frozen: the node or your connection has stopped
advancing). The same stamp appears on the WS
[`account_state`](../../ws/subscriptions.md#account_state) channel with identical
values, so a client can cross-check or de-duplicate REST and WS against it.

The stamp also shows whether a detail frame belongs with a summary frame. Equal
`height` means one commit. Only then do the two frames describe the same instant.

#### Cost basis and spot PnL {#avg-entry-px}

:::caution
Treat a missing key like `null`: no basis is known. An older node
serves `spot.balances` rows carrying `name`, `total` and `hold` only.
:::

`avg_entry_px` is what the account paid, per token, for what it holds. Spot PnL needs only this input:

```
unrealized_spot_pnl = (mark_px − avg_entry_px) × total
```

`avg_entry_px` is a price, not a total, by design. `total` includes the part locked behind
resting orders (`hold`). A notional that the server computes would have to choose which
quantity to multiply by, and you could not see which one it chose. Multiply by the
quantity that you mean.

The node records basis on spot buys only:

- A spot buy rolls the weighted average acquisition cost forward.
- A spot sell reduces the balance but keeps the per-unit average
  unchanged. Selling does not re-price what remains.
- Deposits record no basis. Tokens that arrive by bridge deposit, by a
  Core↔EVM credit, by a spot transfer from another account, or by a governance
  adjustment were not bought on this chain, so there is no price to record.

Code against these consequences:

- A holding acquired entirely by deposit or transfer has `avg_entry_px:
  null`. It is never `"0"`. A zero would claim that the tokens were free and make
  the whole balance look like profit. `null` states that the basis is not
  known. The completeness flags of [position history](../info/position-history.md#honesty-flags) follow the same rule: `null` over a wrong but plausible value.
- A holding partly bought and partly transferred in prices the transferred
  tokens at the standing average, because the transfer wrote no basis of its own.
  `avg_entry_px` is then a real number, but it covers the bought portion's price
  applied across the whole balance.
- Do not render a PnL figure when `avg_entry_px` is `null`. Render "—" instead. A
  PnL computed against a null basis is not a small error. It reports the entire
  notional as gain.

Perp positions are unaffected. They carry their own `entry` price on the
[`clearinghouse_state`](#clearinghouse_state) rows. `avg_entry_px` is the equivalent on the spot
ledger.

:::info
The USDC row has no basis. USDC is the quote asset, so its cost basis in USDC
is meaningless. `spot.balances[0].avg_entry_px` is always `null`. See
[USDC unification](../../../concepts/usdc.md).
:::


#### The overview depth {#account_state-overview}

`detail: "overview"` returns the full non-trading state of the account: vaults, staking, sub-accounts,
multisig, agent wallets and the derived role. The default depth owns the
collateral and margin health of the account. This depth owns everything else.

The facets in this depth change rarely: a vault deposit, a delegation or an
agent approval. Margin and positions change on every commit. Ask
for this depth when you render an account page, approve an agent or list
sub-accounts. Do not ask for it in a poll loop. Use the default depth there.

The WS [`account_state`](../../ws/subscriptions.md#account_state) channel pushes
the default depth only. A depth is a REST parameter. Read this depth over REST
when you need it.

```json
{ "type": "account_state", "address": "0x<addr>", "detail": "overview" }
```

An unknown address answers `200` with every sub-object empty. It does not return a
`404`. The default depth follows the same rule.

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
| `address` | hex address | Resolved account address. Carried once at the top. No sub-object repeats it |
| `role` | `"missing" \| "user" \| "agent" \| "vault" \| "sub_account"` | Derived role. Precedence: `vault` (the address is a vault), then `sub_account`, then `agent` (an approved agent of some master), then `user` (has account, config or spot state), then `missing` |
| `vault.equities[*].vault_id` | uint64 | Vault id |
| `vault.equities[*].vault_address` | hex address | Vault address |
| `vault.equities[*].shares` | Decimal string | The account's share count in whole shares, not the raw 10¹⁸ integer. Send this exact string back to [`vault_withdraw`](../exchange/vaults.md#vault_withdraw): read and write use one plane |
| `vault.equities[*].equity` | Decimal string | `shares × share_price`, truncated: whole-USDC. Share price is mark-to-market NAV per share, so this is what a redemption pays now, not a high-water-mark figure |
| `vault.vaults[*]` | object | One [`vault_state`](./vaults-staking.md#vault_state) body per vault the account follows or leads, field-identical to that read. A leader with no deposit still gets a row |
| `staking.state` | object | A [`staking_state`](./vaults-staking.md#staking_state) body for this account, minus the repeated `address` |
| `staking.summary.undelegated` | Decimal string | The free staking pool: MTF moved in with [`c_deposit`](../exchange/staking.md#c_deposit) and not yet delegated (whole-MTF) |
| `staking.summary.total_delegated` | Decimal string | Sum of active delegations (whole-MTF) |
| `staking.summary.pending_withdrawal` | Decimal string | Sum of pending undelegations (whole-MTF) |
| `staking.summary.claimable_rewards` | Decimal string | Accumulated delegator rewards (whole-MTF) |
| `staking.summary.n_delegations` | uint64 | Number of active delegations |
| `sub_accounts[*].index` | uint32 | Sub-account index under this parent |
| `sub_accounts[*].address` | hex address | Sub-account address |
| `sub_accounts[*].equity` | Decimal string | The sub-account's mark-to-market equity, whole-USDC: the same figure its own `account_state.account_value` reports |
| `multisig.is_multi_sig` | bool | Whether the account is multisig |
| `multisig.threshold` | uint32 | M-of-N threshold; `0` if not multisig |
| `multisig.signers` | hex address[] | Signer set; empty if not multisig |
| `agents[*].agent` | hex address | Approved agent / API wallet address |
| `agents[*].name` | string \| null | Agent label set at approval time; `null` if unset |
| `agents[*].expires_at_ms` | uint64 \| null | Approval expiry (consensus ms); `null` for a never-expiring approval |
| `height` / `time` | uint64 | Committed block this snapshot was rendered against: the same as-of stamp the default depth carries |

The three staking balances are disjoint. Add them for the whole holding.
`staking.summary.undelegated`, `total_delegated` and `pending_withdrawal` never
overlap. A screen that shows `total_delegated` alone shows the user less than
they hold. `undelegated` is the figure a delegate form needs: `token_delegate`
draws from it, so an amount above it is refused.

`sub_accounts[*].equity` counts unrealised PnL. A sub-account deep in loss
reads lower here than at its settled cash, so a parent that scans this list sees the
one that is near liquidation.

Shares are whole shares on both read and write. Committed state keeps shares
as a raw integer on a 10¹⁸ scale. This depth divides by 10¹⁸ before it answers.
Do not multiply `shares` by 10¹⁸. The division truncates toward zero, so
the string that a holder reads back is never larger than the shares that holder has. A
holder can ask for too little but never burn too much.

Every sub-object is empty or zeroed, never absent. An account with no vaults,
no stake, no sub-accounts, no multisig and no agents still answers with all six
keys present.

### The account's perp positions {#clearinghouse_state}

This read returns the perp position detail of one account, keyed by dex. The table used to sit inside `account_state`. The row shape is unchanged.

:::info Active
This read and its WS channel are active. The response is keyed by dex, and
`detail: "adl"` widens the rows. The row shape is the one
[`account_state`](#account_state) used to carry.
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

An unknown address returns 200 with `{"": {"positions": []}}`, not a
`404`. The core-dex key `""` is always present, even for an account with no
positions, so a client can index it without a guard.

| Field | Type | Meaning |
|-------|------|-------------|
| `address` | hex address | The account these positions belong to |
| `clearinghouse_state` | object | Keyed by dex name (`""` is the core dex, otherwise the name of a deployed dex, for example `"GRAD"`). Each value is `{positions: [...]}`. See [the dex key](#dex-key) |
| `positions[*].coin` | string | Market symbol (e.g. `"BTC"`), not a numeric id |
| `positions[*].size` | Decimal string | Signed real size (`raw lots / 10^sz_decimals`); negative = short |
| `positions[*].entry` | Decimal string | Per-whole-unit entry price = `\|entry_notional\| / \|real size\|`, whole-USDC plane |
| `positions[*].upnl` | Decimal string | Mark-to-market PnL = `real size × mark − signed entry_notional`, whole-USDC plane (signed) |
| `positions[*].isolated` | bool | `true` unless the position is cross-margined |
| `positions[*].lev` | uint8 | Position's chosen leverage |
| `positions[*].liq` | Decimal string \| null | Mark price (whole-USDC) at which this leg reaches maintenance. Solved on the leg's own margin plane: a cross leg against the cross account, an isolated leg against its posted `isolated_margin` alone. `null` when no non-negative price breaches maintenance, and when size is zero: see below |
| `positions[*].roe` | Decimal string | `upnl / initial_margin` as a decimal fraction; `"0"` at zero leverage / notional |
| `positions[*].funding` | Decimal string | Accrued-but-unsettled funding for this leg, whole-USDC (signed; negative = you owe). Includes the accrual built up since the last funding charge, so it stays non-zero between funding periods, the same accrual `account_value` and `withdrawable` already fold in |
| `positions[*].margin` | Decimal string | This leg's initial margin, whole-USDC |
| `positions[*].maint_margin` | Decimal string | This leg's maintenance-margin contribution, whole-USDC: `\|entry_notional\| × maint_margin_ratio` |
| `positions[*].notional` | Decimal string | Position notional at mark, whole-USDC (signed): `real_size × mark_px` |
| `positions[*].side` | enum \| absent | [Hedge mode](../../../concepts/hedge-mode.md) only: `"long"` / `"short"`, the leg this object reports. Omitted on a one-way account (a single *net* position whose `size` may be negative). A hedge account holding both legs on one asset returns two objects, one per side |
| `positions[*].adl_lamps` | uint8 \| absent | `detail: "adl"` only: the ADL queue indicator, `0` to `4`. More lamps = sooner deleveraged. Omitted otherwise, and always omitted on the WS frame. See [`detail: "adl"`](#account_state-adl) |
| `height` | uint64 | Committed block height this snapshot reflects. A bare integer |
| `time` | uint64 | Consensus block time in milliseconds. A bare integer |

:::danger
This read carries no account figures, by design. It has no
`account_value`, no `withdrawable`, no `health` and no `balances`. Read those
from [`account_state`](#account_state). Do not compute an account-level
number by combining the two frames, because they can come from commits that are one block apart. Compare
the `height` of both frames before you treat them as one instant.
:::

#### The dex key {#dex-key}

The map key is the dex name. `""` is the core dex and is always present.
Every other key is the name of one deployed perp dex.

A dex name is 1 to 16 ASCII alphanumeric bytes. Names are unique without regard
to case, so `grad` cannot exist while `GRAD` does. A name is set when the dex is
created. It never changes, and there is no rename.

The name, the symbol prefix and this key are one identifier. Every market on
dex `NAME` carries the symbol `NAME:SUFFIX`, matched byte-exactly, with a
non-empty suffix. So every position under the key `GRAD` has a `coin` that starts
with `GRAD:`, and the same string is the `name` field of that dex's
[`perp_dexs`](../info/perpetuals.md#perp_dexs) row. One string joins the account
read, the market symbol and the dex registry. A core-dex symbol never contains
`:`, so the core bucket and a named bucket can never claim one symbol.

At the upgrade, each existing dex receives a name. The dex deployed
by `0x10572bc485ee62403eb8778c1303857d6f4f9913` becomes `GRAD`. Any other
deployed dex becomes `DEX<index>`, where `<index>` is the `index` that dex
already reports in `perp_dexs`. The core dex stays `""`.

If you cached the old address keys, join again through the registry. Every
`perp_dexs` row serves both `name` and `deployer`, so one read maps each cached
address to its new key. An integrator that is offline during the upgrade does
this once on the next connect.

The name applies to perp dexes only. A spot pair symbol such as `GRAD:USDCNY/USDC` is
a naming habit of its deployer. A dex name reserves nothing on the spot side, and
spot naming does not change.

#### Reading `liq` {#reading-liq}

`liq` is solved on the plane that liquidates the leg. A cross leg
shares one margin pool with every other cross leg, so its `liq` moves when any
other cross position moves. Only its own posted
`isolated_margin` backs an isolated leg. The cross balance never rescues it, and a large cross balance
never moves its `liq` away.

`liq` is `null`, never `"0"`, when the leg has no liquidation price. Two
cases produce it: a zero-size leg, and a long whose solved price is negative.
That long cannot be price-liquidated, because no non-negative mark breaches its
maintenance requirement. Treat `null` as "no price triggers this leg". Treat
`"0"`, if you ever see it, as a real price of zero. A client that renders
`null` as `0` tells the user that the position is at the brink, when the truth is the
opposite.

`liq` answers "what price liquidates this leg". It makes no promise about the
account: a move on a different market can still liquidate a cross account.

#### The ADL queue indicator {#account_state-adl}

`detail: "adl"` returns the default body with one extra key on every position
row: `adl_lamps`, an integer from `0` to `4`. More lamps means the position sits
sooner in the auto-deleveraging queue. Nothing else changes, so a caller can
switch a screen from the default depth to `"adl"` without touching any other
field.

`detail: "adl"` moved to another read. It was a depth of `account_state`. It is a
parameter of `clearinghouse_state` now, because that read holds the rows that it widens.
`account_state` refuses it with `400` and does not answer a body with no
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

The depth is opt-in because it costs more. Each lamp ranks the position against every other
position in that market, so the node makes one extra pass over the market per
row. Ask for `"adl"` only on a screen that shows the column. Poll the default
depth otherwise.

The depth is REST-only. The WS
[`clearinghouse_state`](../../ws/subscriptions.md#clearinghouse_state) frame always
carries the default shape and never `adl_lamps`. The lamp ranks your seat
against other accounts, so the PnL of a stranger that crosses a quartile edge would
re-emit your frame.

:::warning
Two rules that callers get wrong:

1. The lamps are a ranking, not a probability. They show where you sit in the
queue among the profitable holders on your side: the quartile of your seat, where `4`
is the top quarter and `1` is the bottom quarter. They do not say that ADL is likely. Four lamps
with nobody liquidated on the other side means that nothing happens.
Never render the lamps as a risk percentage.

2. Zero lamps has a meaning. Zero is not "unknown" and not "safest of the
ranked". Zero means not in the queue at all. This is the correct answer for
a position that ADL cannot reach: no committed mark for the market, no
unrealised profit, no cost basis, or nobody on the opposite side to deleverage
against. The last case includes a hedge account whose only
opposing leg is its own. ADL never nets an account against itself, so a sole
hedge holder reads `0` on both legs. A floor of one lamp would be a false alarm.
:::

The queue is ordered by the same expression the settle
path uses to pick its counterparty: return on committed margin, `unrealised PnL
÷ |entry notional|`, highest first, with a `(address, leg)` ascending tiebreak.
So a small, highly levered winner is netted ahead of a large, lightly levered one
with bigger absolute PnL. Hedge legs rank separately, because ADL settles per
leg: a long leg is only ever ranked against other longs.

The queue shows who gets deleveraged at mark. It is a different
question from who pays the [deficit haircut](../../../concepts/adl.md#2-allocation--deterministic-capacity-pro-rata),
which is allocated pro-rata by capacity and has no ranking at all.
