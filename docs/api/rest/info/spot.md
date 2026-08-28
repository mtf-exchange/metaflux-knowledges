---
description: POST /info read queries for spot markets, leveraged spot margin, and the Earn lending pool.
---

# `POST /info` — spot & margin queries

Read queries for [spot](../../../products/spot.md) markets, leveraged [spot margin](../../../products/spot-margin.md), and the [Earn](../../../concepts/earn.md) pool. Same `POST /info` endpoint and envelope as the [base page](../info.md).

:::info
**Plain spot token balances are on [`account_state`](../info.md#account_state).**
Its `balances` array carries every token the account holds — USDC and spot
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
          "signing_id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "taker_fee_bps": "5", "min_notional": "100", "active": true,
          "mark_px": "61650", "mid_px": "61651.5", "day_ntl_vlm": "15230.5",
          "prev_day_px": "61200", "circulating_supply": "21000000"
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

:::info
**`pairs` carries two kinds of entry.** Per-token "self pairs" (`id` = token
id, `base == quote`) project the token registry as pairs. Real tradable pairs
have distinct `base` / `quote` (e.g. `"BTC/USDC"`) and carry the live market
fields: `mark_px`, `mid_px`, `day_ntl_vlm`, `prev_day_px`,
`circulating_supply`.
:::

| Field | Type | Meaning |
|-------|------|---------|
| `pairs[*].id` | uint32 | Pair id |
| `pairs[*].name` | string | Pair name (e.g. `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Base / quote asset id (equal for self-pairs) |
| `pairs[*].taker_fee_bps` | bps string | Taker fee (whole bps); `"0"` if unset |
| `pairs[*].min_notional` | Decimal string | Min notional (whole USDC); `"0"` if unset |
| `pairs[*].active` | bool | Whether the pair is active for trading |
| `pairs[*].mark_px` | Decimal string \| null | Last-trade price (whole USDC); `null` before the first trade |
| `pairs[*].mid_px` | Decimal string \| null | Book mid, falls back to `mark_px`; `null` when neither exists |
| `pairs[*].day_ntl_vlm` | Decimal string | 24h notional volume |
| `pairs[*].prev_day_px` | Decimal string \| null | Price ~24h ago; `null` if unknown |
| `pairs[*].circulating_supply` | Decimal string | Base token committed supply (whole units) |
| `tokens[*].id` | uint32 | Spot token asset id |
| `tokens[*].name` | string | Token name (e.g. `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Display / size precision |
| `tokens[*].wei_decimals` | uint8 | Native (ERC-20-style) token decimals |
| `tokens[*].token_id` | hex string (32 bytes) | Canonical token id, `0x`-hex |
| `tokens[*].system_address` | hex address | Core-side anchor address |
| `tokens[*].evm_contract` | object \| null | EVM binding; `null` when the token binds nothing |
| `tokens[*].evm_contract.address` | hex address | The ERC-20 the asset is bound to. It ROTATES — see Rules |
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
- **The address in `evm_contract.address` ROTATES.** Read it on each use;
  never copy it into config or prose. A validator-quorum vote can re-bind a
  token to a different contract. An address you froze then names a contract
  the chain no longer credits, and a transfer against it fails silently — the
  burn succeeds and nothing arrives. Key your own records on `tokens[*].id`,
  which does not move.

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
| `pools[*].asset` | uint32 | Lendable quote asset id (the pool key) |
| `pools[*].total_supplied` | Decimal string | Pool NAV — supplied principal plus folded-in repaid interest |
| `pools[*].total_borrowed` | Decimal string | Quote currently lent to spot-margin borrowers |
| `pools[*].idle` | Decimal string | `total_supplied − total_borrowed` — the instantly-withdrawable bound |
| `pools[*].shares_total` | Decimal string | Total shares outstanding |
| `pools[*].share_value` | Decimal string | `total_supplied / shares_total` (`0` when no shares) |
| `pools[*].borrow_index` | Decimal string | Cumulative borrow index (debt-accrual basis) |
| `pools[*].reserve_factor_bps` | uint16 | Protocol cut of borrow interest (bps) |
| `pools[*].borrow_rate_bps_annual` | uint32 | Annualised borrow rate (bps). `0` on every live pool today — see Rules |
| `pools[*].reserve_accrued` | Decimal string | Protocol reserve accumulated from interest |
| `pools[*].user_shares` | Decimal string | **Only with `user`** — shares the account holds in the pool |
| `pools[*].user_value` | Decimal string | **Only with `user`** — `user_shares × share_value` |

**Rules**

- Pools are listed in asset-id order.
- Omitting `user` drops the `user_shares` / `user_value` fields.
- **A `borrow_rate_bps_annual` of `0` means the pool pays nothing, and
  `share_value` will not move.** A pool auto-creates at rate `0`, and the
  per-block accrual stamps the time without stepping `borrow_index`. Do not
  compute an APY from a rising `share_value` that is not rising. A governance
  vote sets a non-zero rate — see [Earn](../../../concepts/earn.md).

### Spot-pair-deploy gas-auction state {#spot_deploy_auction}

MIP-1 spot-pair-deploy gas-auction state.

:::warning
**The name is not live yet.** The node currently answers this read under the
old name `spot_deploy_state`. That old name still works; the rename lands at
a future release, and `spot_deploy_state` goes away then. Until the rename
ships, a `spot_deploy_auction` request returns
`400 UNKNOWN_TYPE`.
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
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `auction_round` | uint64 | Current round |
| `current_bid` | Decimal string | Leading bid |
| `current_winner` | hex address \| null | Current high bidder |
| `auction_end_ms` / `started_at_ms` | uint64 | Auction window (consensus ms) |
| `total_burned` | Decimal string | Cumulative burned winning-bid notional |
| `deposit` | Decimal string | Total escrowed deposit (base units) |

## See also {#see-also}

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Perpetual queries](./perpetuals.md) — perp-market reads
- [Spot](../../../products/spot.md) / [Spot margin](../../../products/spot-margin.md) — the products
