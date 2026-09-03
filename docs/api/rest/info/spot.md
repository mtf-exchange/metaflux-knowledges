---
description: POST /info read queries for spot markets, leveraged spot margin, and the Earn lending pool.
---

# `POST /info` — spot & margin queries

Read queries for [spot](../../../products/spot.md) markets, leveraged [spot margin](../../../products/spot-margin.md), and the [Earn](../../../concepts/earn.md) pool. Same `POST /info` endpoint and envelope as the [base page](../info.md).

:::info
**Plain spot token balances are on [`account_state`](../info.md#account_state).**
Its `spot.balances` array carries every token the account holds — USDC and spot
tokens alike — with `avg_entry_px` per row. There is no separate spot-balance
read.
:::

## Spot, spot-margin & Earn query types {#spot-spot-margin--earn-query-types}

### Spot pair universe and token registry {#spot_meta}

Every spot pair and every spot token in the market and token registry.

:::warning
The `spot_meta` query type is removed. Query
[`markets_meta`](./perpetuals.md#markets_meta) with `kind: "spot"` instead. A
`spot_meta` request now returns `400 UNKNOWN_TYPE`.
:::

**Request**

```json
{ "type": "markets_meta", "kind": "spot" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `kind` | string | yes | `"spot"` selects the spot section of the registry |

**Response**

The `spot` section of the `markets_meta` response:

```json
{
  "data": {
    "type": "markets_meta",
    "spot": {
      "pairs": [
        {
          "signing_id": 113, "name": "MTF/USDC", "base": 104, "quote": 100,
          "sz_decimals": 2, "taker_fee_bps": "3.5", "min_notional": "1",
          "active": true, "deployer": "0x17c5…d025", "registered_at": 0,
          "mark_px": "0.13787", "mid_px": "0.13787", "day_ntl_vlm": "0",
          "prev_day_px": null, "circulating_supply": "10000010"
        }
      ],
      "tokens": [
        {
          "id": 101, "name": "BTC", "sz_decimals": 5, "wei_decimals": 8,
          "token_id": "0xab…", "system_address": "0x55…",
          "evm_contract": { "address": "0x66…", "variant": 0, "evm_extra_wei_decimals": -3 },
          "is_canonical": true, "total_supply": "21000000"
        }
      ]
    }
  }
}
```

:::danger
**`taker_fee_bps` is the OVERRIDE, not the effective fee — and `null` is not
zero.**

A spot pair's deployer may set a taker override. **If an override exists it
WINS**, for every account, whatever the volume tier says. If none exists, the
volume-tiered [`fee_schedule`](../info.md#fee_schedule) applies. That is the
whole resolution rule, and this row is where it is now written down.

Two encodings used to hide it, and both are fixed:

- **The value was truncated.** The override is stored in deci-bps and rendered by
  integer division, so `35` deci-bps (3.5 bps) printed as `"3"`. It renders
  losslessly now — `"3.5"`.
- **"No override" printed as `"0"`.** Zero reads as "this pair is fee-free" and
  meant "the schedule applies". It is **`null`** now.

So `null` sends you to `fee_schedule`. A `"0"`, should you see one, is a real
zero-rate override. Measured live before the fix: a pair served `"5"` while
`fee_schedule` said `"3.5"`, and nothing on either read explained which one
charged. See the
[upgrade notice](../../upgrade-notice-ids-and-shapes.md#spot-taker-fee).
:::

:::info
**A pair row keys on `signing_id`, and its price fields can be `null`.** A
tradable pair has distinct `base` / `quote` (e.g. `"MTF/USDC"`). A per-token
"self pair" projects the token registry as a pair and has `base == quote`.

`mark_px`, `mid_px` and `prev_day_px` are sent as **`null`** on a pair that has
not traded — the key is present and holds `null`, it is never omitted. Most of
the registry reads `null` here at any moment, so treat `null` as the normal
answer, not as an error.
:::

| Field | Type | Meaning |
|-------|------|---------|
| `pairs[*].signing_id` | uint32 | **The number you put in the EIP-712 `market` field when you sign a spot order for this pair.** The field was named `id`; that name is gone. Every read keys the pair by `name` — see below |
| `pairs[*].name` | string | Pair name (e.g. `"MTF/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Base / quote asset id (equal for self-pairs) |
| `pairs[*].sz_decimals` | uint8 | Size precision of the pair's base leg |
| `pairs[*].taker_fee_bps` | bps string \| null | The pair's **deployer taker override**, decimal bps. **`null` means there is no override and the volume-tiered [`fee_schedule`](../info.md#fee_schedule) applies** — see the resolution rule below |
| `pairs[*].min_notional` | Decimal string | Min notional (whole USDC); `"0"` if unset |
| `pairs[*].active` | bool | Whether the pair is active for trading |
| `pairs[*].deployer` | hex address | The account that registered the pair |
| `pairs[*].registered_at` | uint64 | Block height at which the pair was registered. `0` on a genesis pair |
| `pairs[*].mark_px` | Decimal string \| null | Last-trade price (whole USDC); **`null`** before the first trade |
| `pairs[*].mid_px` | Decimal string \| null | Book mid, falls back to `mark_px`; **`null`** when neither exists |
| `pairs[*].day_ntl_vlm` | Decimal string | 24h notional volume |
| `pairs[*].prev_day_px` | Decimal string \| null | Price ~24h ago; **`null`** if unknown. It reads `null` on a traded pair too, until 24 hours of history exist |
| `pairs[*].circulating_supply` | Decimal string | Base token committed supply (whole units) |
| `tokens[*].id` | uint32 | Spot token asset id |
| `tokens[*].name` | string | Token name (e.g. `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Display / size precision |
| `tokens[*].wei_decimals` | uint8 | Native (ERC-20-style) token decimals |
| `tokens[*].token_id` | hex string (32 bytes) | Canonical token id, `0x`-hex |
| `tokens[*].system_address` | hex address | Core-side anchor address |
| `tokens[*].evm_contract` | object \| null | EVM binding; `null` when the token binds nothing |
| `tokens[*].evm_contract.address` | hex address | The ERC-20 the asset is bound to. Permanent once written — see Rules |
| `tokens[*].evm_contract.variant` | uint8 | How the token is bound: `0` a deployed contract, `1` first-storage-slot, `2` custom-storage-slot. It does not change whether the asset can cross |
| `tokens[*].evm_contract.evm_extra_wei_decimals` | int8 | The deployer's declared decimal offset. It has no effect on a credit — see Rules |
| `tokens[*].is_canonical` | bool | Canonical (genesis / governance-listed) token |
| `tokens[*].total_supply` | Decimal string | Committed token issuance (whole units); `"0"` when none |

**Rules**

- `tokens` and `pairs` are sorted by key (asset id / pair id).
- `evm_contract` reports the BINDING, never a declaration. `register_token`
  accepts an `evm_contract` field from the caller and stores it unvalidated,
  but no transfer path reads it. The address served here comes from the EVM
  binding registry — the same source the Core-to-EVM transfer checks — so this
  read never offers a contract the chain would refuse. A token whose deployer
  declared a contract that was never bound reports `null`. See
  [which assets can cross](../../../evm/core-evm-transfers.md#which-assets-cross).
- `evm_extra_wei_decimals` is the deployer's declared value. It has no effect
  on a credit — **a credit lands in the token's `wei_decimals`**, the sibling
  field.
- **A binding is first-write-wins and PERMANENT.** ⚠️ **Corrected — an earlier
  version of this page said the address rotates. It does not.** The binding vote
  refuses an asset that already has a binding, and refuses a contract already
  bound to another asset. Nothing removes a binding. So an address you read here
  stays valid for that asset. Still read it rather than hard-coding it: a token
  can gain its FIRST binding at any time, and `null` today is not `null`
  tomorrow. Key your own records on `tokens[*].id`.
- **The credit scale is the token's `wei_decimals`, not the contract's.** A
  binding does not carry a decimals value of its own, and it cannot change the
  one the token was registered with. Read `tokens[*].wei_decimals` to size a
  transfer.

### Every spot-margin position for an account {#spot_margin_state}

Every spot-margin position held by one account.

:::info
**Cross-collateralized.** Read surface for leveraged [spot margin](../../../products/spot-margin.md); the position's margin is held against your one unified USDC account, not a per-pair bucket. See the concept page for the model.
:::

**Request**

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `user` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "spot_margin_state",
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": "MTF/USDC",
        "collateral": "0",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `accounts[*].pair` | string | Spot pair symbol (e.g. `"MTF/USDC"`), not a numeric id |
| `accounts[*].collateral` | Decimal string | **Vestigial.** Spot margin is now cross-collateralized against your unified USDC account, so there is no per-pair collateral bucket. Reads `"0"`; kept only for wire-shape compatibility |
| `accounts[*].borrowed` | Decimal string | Outstanding loan **principal** (at the snapshot index) |
| `accounts[*].borrow_index_snapshot` | Decimal string | Pool borrow index captured at open (debt-accrual basis) |
| `accounts[*].base_held` | Decimal string | Segregated base bought on leverage (not in spendable balances) |
| `accounts[*].current_debt` | Decimal string | Debt accrued to now: `borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | Per-pair `{ init_bps, maint_bps }`; `null` = margin not enabled / uncalibrated for the pair |

**Rules**

- Positions are listed in pair-id order.
- An account with no positions returns an empty `accounts` array.

### Earn lending pools and account stake {#earn_state}

Every Earn lending pool, plus one account's stake when `user` is supplied.

:::info
**Live on testnet.** Read surface for the [Earn](../../../concepts/earn.md) lending pools. The pool list is empty until the first deposit creates one.
:::

**Request**

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `user` | hex address | no | Include this account's stake in the response |

**Response**

```json
{
  "data": {
    "type": "earn_state",
    "pools": [
      {
        "name": "USDC",
        "signing_id": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": "1000",
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `pools[*].name` | string | Pool token name (e.g. `"USDC"`) |
| `pools[*].signing_id` | uint32 | Lendable asset id — the pool key, and the number you sign an Earn action with |
| `pools[*].total_supplied` | Decimal string | Pool NAV — supplied principal plus folded-in repaid interest |
| `pools[*].total_borrowed` | Decimal string | Quote currently lent to spot-margin borrowers |
| `pools[*].idle` | Decimal string | `total_supplied − total_borrowed` — the instantly-withdrawable bound |
| `pools[*].shares_total` | Decimal string | Total shares outstanding |
| `pools[*].share_value` | Decimal string | `total_supplied / shares_total` (`0` when no shares) |
| `pools[*].borrow_index` | Decimal string | Cumulative borrow index (debt-accrual basis) |
| `pools[*].reserve_factor_bps` | bps string | Protocol cut of borrow interest, whole bps. It is a **string**, not a number |
| `pools[*].borrow_rate_bps_annual` | bps string | Annualised borrow rate, whole bps. It is a **string**, not a number. `"0"` on every live pool today — see Rules |
| `pools[*].reserve_accrued` | Decimal string | Protocol reserve accumulated from interest |
| `pools[*].user_shares` | Decimal string | **Only with `user`** — shares the account holds in the pool |
| `pools[*].user_value` | Decimal string | **Only with `user`** — `user_shares × share_value` |

**`user_shares` / `user_value` are ABSENT without `user`, not zero.** A request
that omits `user` drops both keys from every pool row. A request that sends
`user` carries both on every pool, and they read `"0"` for a pool the account
has not supplied. Absent means "not asked"; `"0"` means "asked, and the stake is
nothing". Test for key presence before you read a stake.

**Rules**

- Pools are listed in asset-id order.
- Omitting `user` drops the `user_shares` / `user_value` fields.
- **`pools` is empty until the first deposit creates a pool.** An empty array is
  the honest answer for a chain with no Earn supply, not a failure.
- **A `borrow_rate_bps_annual` of `0` means the pool pays nothing, and
  `share_value` will not move.** A pool auto-creates at rate `0`, and the
  per-block accrual stamps the time without stepping `borrow_index`. Do not
  compute an APY from a rising `share_value` that is not rising. A governance
  vote sets a non-zero rate — see [Earn](../../../concepts/earn.md).

### Spot-pair-deploy gas-auction state {#spot_deploy_auction}

MIP-1 spot-pair-deploy gas-auction state.

:::info
**`spot_deploy_auction` is the live name. `spot_deploy_state` is removed.** The
old name answers `400` with `error.code` `UNKNOWN_TYPE`.
:::

**Request**

```json
{ "type": "spot_deploy_auction" }
```

No parameters.

**Response**

```json
{
  "data": {
    "type": "spot_deploy_auction",
    "current_ask": "100",
    "floor": "100",
    "start": "100",
    "start_multiplier": 2,
    "duration_blocks": 100,
    "opened_at_block": 0,
    "now_block": 26435840,
    "last_clearing": "0",
    "sealed_round": {
      "auction_round": 0,
      "current_bid": "0",
      "current_winner": null,
      "auction_end": 0,
      "started_at": 0,
      "total_burned": "0",
      "deposit": "0"
    }
  }
}
```

**This is a descending-clock (Dutch) auction, and the top level is the clock.**
The ask starts at `start` and decays toward `floor` over `duration_blocks`,
measured from `opened_at_block`. An accept clears **immediately** at the clock
ask, so a bidder submits at or above `current_ask`.

**Read `current_ask` fresh on every accept; never cache it.** It falls every
block, and the chain clears against its own clock, not against the value you
read a minute ago.

| Field | Type | Meaning |
|-------|------|---------|
| `current_ask` | Decimal string | The price to deploy a pair **right now**, whole USDC. It falls every block |
| `floor` | Decimal string | The lowest price the decay reaches. `current_ask` never goes below it |
| `start` | Decimal string | The price the current decay opened at |
| `start_multiplier` | uint | Demand-adaptive multiplier that sets the **next** round's start price |
| `duration_blocks` | uint64 | Length of one decay, in blocks |
| `opened_at_block` | uint64 | Block height at which the current decay opened. `0` = no round has opened yet |
| `now_block` | uint64 | The chain height this answer was read at — the clock `current_ask` is priced against |
| `last_clearing` | Decimal string | Price the previous deploy cleared at. `"0"` = nothing has cleared yet |
| `sealed_round` | object | The sealed-bid round, described below |

**`sealed_round` is a SECOND auction, not a view of the clock.** It is the
sealed-bid round that runs beside the descending clock. Its `current_bid` and
`current_winner` come from submitted bids; its `total_burned` and `deposit` come
from settled rounds. None of them price the clock. A caller that reads
`sealed_round.current_bid` as the deploy price pays the wrong number — read
`current_ask` for that.

**The sealed-bid fields moved here, and lost the `_ms` suffixes.** They were
once at the top level as `auction_end_ms` and `started_at_ms`. Both names are
gone. Read them inside `sealed_round` as `auction_end` and `started_at`.

| Field | Type | Meaning |
|-------|------|---------|
| `sealed_round.auction_round` | uint64 | Current sealed-bid round |
| `sealed_round.current_bid` | Decimal string | Leading bid |
| `sealed_round.current_winner` | hex address \| null | Current high bidder. **`null`** when nobody has bid |
| `sealed_round.auction_end` | uint64 | Round close (consensus ms). `0` = no round is open |
| `sealed_round.started_at` | uint64 | Round start (consensus ms). `0` = no round is open |
| `sealed_round.total_burned` | Decimal string | Cumulative burned winning-bid notional |
| `sealed_round.deposit` | Decimal string | Total escrowed deposit (base units) |

## See also {#see-also}

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Perpetual queries](./perpetuals.md) — perp-market reads
- [Spot](../../../products/spot.md) / [Spot margin](../../../products/spot-margin.md) — the products
