---
description: POST /info read queries for spot markets, leveraged spot margin, and the Earn lending pool.
---

# `POST /info` — spot & margin queries

Read queries for [spot](../../../products/spot.md) markets, leveraged [spot margin](../../../products/spot-margin.md), and the [Earn](../../../concepts/earn.md) pool. Same `POST /info` endpoint and envelope as the [base page](../info.md).

## Spot, spot-margin & Earn query types {#spot-spot-margin--earn-query-types}

### Spot pair universe and token registry {#spot_meta}

:::warning API change
The standalone `spot_meta` query type has been **removed** — it was a
byte-identical alias of the `spot` section that
[`markets_meta`](./perpetuals.md#markets_meta) (and dynamic
[`markets`](./perpetuals.md#markets)) already return. Query `markets_meta` with
`kind: "spot"` instead; a `spot_meta` request now returns
`400 {"error":"unknown info type: spot_meta"}`.
:::

```json
{ "type": "markets_meta", "kind": "spot" }
```

Response (the `spot` section):

```json
{
  "type": "markets_meta",
  "data": {
    "spot": {
      "pairs": [
        {
          "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "taker_fee_bps": "5", "min_notional": "100", "active": true,
          "mark_px": "61650", "mid_px": "61651.5", "day_ntl_vlm": "15230.5",
          "prev_day_px": "61200", "circulating_supply": "21000000"
        }
      ],
      "tokens": [
        {
          "id": 101, "name": "BTC", "sz_decimals": 5, "wei_decimals": 8,
          "token_id": "0xab…", "system_address": "0x55…",
          "evm_contract": { "address": "0x66…", "evm_extra_wei_decimals": -3 },
          "is_canonical": true, "total_supply": "21000000"
        }
      ]
    }
  }
}
```

:::info
**`pairs` carries two kinds of entry.** The per-token "self pairs" (`id` =
token id, `base == quote`) are the token registry projected as pairs; the
**real tradable pairs** have distinct `base`/`quote` (e.g. `"BTC/USDC"`).
Real pairs carry the live market-context fields (`mark_px`, `mid_px`,
`day_ntl_vlm`, `prev_day_px`, `circulating_supply`).
:::

| Field | Type | Description |
|-------|------|-------------|
| `pairs[*].id` | uint32 | Pair id (`SpotPairSpec.pair_id`) |
| `pairs[*].name` | string | Pair name (e.g. `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Base / quote asset id (equal for self-pairs) |
| `pairs[*].taker_fee_bps` | bps string | Taker fee (whole bps); `"0"` if unset |
| `pairs[*].min_notional` | decimal string | Min notional (whole USDC); `"0"` if unset |
| `pairs[*].active` | bool | Whether the pair is active for trading |
| `pairs[*].mark_px` | decimal string \| null | Last-trade price (whole USDC); `null` before the first trade |
| `pairs[*].mid_px` | decimal string \| null | Book mid, falls back to `mark_px`; `null` when neither exists |
| `pairs[*].day_ntl_vlm` | decimal string | 24h notional volume |
| `pairs[*].prev_day_px` | decimal string \| null | Price ~24h ago; `null` if unknown |
| `pairs[*].circulating_supply` | decimal string | Base token committed supply (whole units) |
| `tokens[*].id` | uint32 | Spot token asset id |
| `tokens[*].name` | string | Token name (e.g. `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Display / size precision |
| `tokens[*].wei_decimals` | uint8 | Native (ERC-20-style) token decimals |
| `tokens[*].token_id` | hex string (32 bytes) | Canonical token id, `0x`-hex |
| `tokens[*].system_address` | hex address | Core-side anchor address |
| `tokens[*].evm_contract` | object \| null | EVM binding `{address, evm_extra_wei_decimals}`; `null` when unbound |
| `tokens[*].is_canonical` | bool | Canonical (genesis / governance-listed) token |
| `tokens[*].total_supply` | decimal string | Committed token issuance (whole units); `"0"` when none |

`tokens` and `pairs` are in committed `BTreeMap` order (by asset / pair id).

State source: `Exchange.spot_pair_specs` (pairs) + `Exchange.spot_token_specs`
(tokens) + `spot_clearinghouse.total_supply` (supply).

### Single-token detail with tradable pairs and fees {#token_info}

One spot token's identity / EVM-binding block, plus every tradable pair it
fronts (where it is the **base**) with each pair's live market context and
resolved fee rates. Resolve by `token` — the token **symbol** (`"MTF"`) or its
numeric asset id sent as a string (`"104"`). Optionally pass `address` to also
get that account's **effective** (post-staking-discount / post-maker-rebate)
rates per pair.

```json
{ "type": "token_info", "token": "MTF" }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `token` | string | yes | Spot-token symbol, or its numeric asset id as a string |
| `address` | hex address | no | Adds per-pair effective fee fields for this account (and echoes `address` top-level) |

Missing `token` → `400 {"error":"missing field: token"}`; unknown token →
`404 {"error":"spot token not found"}`.

Response:

```json
{
  "type": "token_info",
  "data": {
    "token": {
      "id":             104,
      "name":           "MTF",
      "sz_decimals":    2,
      "wei_decimals":   8,
      "token_id":       "0xabababababababababababababababababababababababababababababababab",
      "system_address": "0x5555555555555555555555555555555555555555",
      "is_canonical":   true,
      "total_supply":   "1000000",
      "evm_contract":   { "address": "0x6666666666666666666666666666666666666666", "evm_extra_wei_decimals": -3 }
    },
    "pairs": [
      {
        "pair_id":            113,
        "name":               "MTF/USDC",
        "base":               104,
        "quote":              100,
        "active":             true,
        "deployer":           "0x7777777777777777777777777777777777777777",
        "registered_at_ms":   1700000000000,
        "min_notional":       "10",
        "tick_size":          "0.0001",
        "lot_size":           "1",
        "mark_px":            "2.05",
        "mid_px":             "2.06",
        "day_ntl_vlm":        "15230.5",
        "prev_day_px":        "1.98",
        "circulating_supply": "1000000",
        "fee": { "taker_bps": "3.0", "maker_bps": "1.0", "source": "pair_override" }
      }
    ]
  }
}
```

The `token` identity / binding block renders **identically** to the same token's
row in [`spot_meta`](#spot_meta) `tokens` — the two reads never drift.

| Field | Type | Description |
|-------|------|-------------|
| `token.id` | uint32 | Spot token asset id |
| `token.name` | string | Token symbol |
| `token.sz_decimals` | uint8 | Display / size precision |
| `token.wei_decimals` | uint8 | Native (ERC-20-style) token decimals |
| `token.token_id` | hex string (32 bytes) | MTF-native canonical token id, `0x`-hex; all-zero for a token registered without one |
| `token.system_address` | hex address | The token's Core-side system anchor address |
| `token.is_canonical` | bool | Canonical (protocol-registered) token flag |
| `token.total_supply` | Decimal string | Committed Core-side total supply (whole units) |
| `token.evm_contract` | object \| null | The token's EVM (ERC-20) binding — `null` when unbound, never a fabricated object |
| `token.evm_contract.address` | hex address | Bound ERC-20 contract address on MetaFluxEVM |
| `token.evm_contract.evm_extra_wei_decimals` | int (signed) | The EVM contract's decimals minus the Core token's `wei_decimals` |
| `pairs[*].pair_id` | uint32 | Spot pair id (`SpotPairSpec.pair_id`) |
| `pairs[*].name` | string | `BASE/QUOTE` display name |
| `pairs[*].base` / `quote` | uint32 | Base / quote token asset ids |
| `pairs[*].active` | bool | Pair active for trading |
| `pairs[*].deployer` | hex address | Account that registered the pair (pair-level provenance) |
| `pairs[*].registered_at_ms` | uint64 | Pair registration timestamp (consensus ms) |
| `pairs[*].min_notional` | Decimal string | Minimum order notional, whole-USDC |
| `pairs[*].tick_size` | Decimal string | Price tick, human-decimal |
| `pairs[*].lot_size` | u128 string | Size lot, raw base lots |
| `pairs[*].mark_px` | Decimal string \| null | Last-trade mark; `null` before the first trade |
| `pairs[*].mid_px` | Decimal string \| null | Book mid (falls back to the mark when one-sided); `null` when neither exists |
| `pairs[*].day_ntl_vlm` | Decimal string | 24h notional volume |
| `pairs[*].prev_day_px` | Decimal string \| null | Price ~24h ago; `null` if unknown |
| `pairs[*].circulating_supply` | Decimal string | Base token committed total supply |
| `pairs[*].fee.taker_bps` / `maker_bps` | bps string | The pair's resolved base rates, decimal bps (`"3.0"` = 3 bps) — the same rates the settlement path charges |
| `pairs[*].fee.source` | `"pair_override"` \| `"volume_tier"` | Where the resolved rate came from — a per-pair deployer override, or the shared volume-tier ladder (the default) |

With `address`, each pair's `fee` object additionally carries the account's
effective rates, and the resolved `address` is echoed top-level:

| Field | Type | Description |
|-------|------|-------------|
| `pairs[*].fee.effective_taker_bps` | bps string | Taker rate after the account's staking discount |
| `pairs[*].fee.effective_maker_bps` | bps string | Maker rate after the account's maker rebate |
| `pairs[*].fee.staking_discount_permille` | uint | Staking taker-fee discount applied (per-mille) |
| `pairs[*].fee.maker_rebate_bps` | bps string | Maker rebate applied |
| `address` | hex address | Echoed **only** when the request carried it |

Pairs list the markets where this token is the base, in pair-id order; a token
fronting no tradable pair returns an empty `pairs` array.

State source: `Exchange.mip3_spot_token_specs` (identity / binding) + `Exchange.mip3_spot_pair_specs` (pairs) + the spot clearinghouse supply and per-pair market context.

### Per-account spot token balances {#spot_clearinghouse_state}

Per-account spot token balances. Required: `address` (0x hex).

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

Response:

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "total": "10", "hold": "0" } ],
    "height": 562,
    "time":   1700000000555
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balances[*].asset` | uint32 | Spot asset id (`104` = MTF) |
| `balances[*].name` | string | Token / pair name, else `asset:<id>` |
| `balances[*].total` | decimal string | Full balance, truncated toward zero |
| `balances[*].hold` | decimal string | Locked behind resting spot orders (escrow); spendable = `total − hold` |
| `height` | uint64 | Committed block height this snapshot reflects — a **bare integer**, not a Decimal string. Advances on **every** commit, even when the balances are unchanged |
| `time` | uint64 | Consensus block time in **milliseconds** — a **bare integer**, same consensus clock as `height` |

`height` / `time` are an **as-of stamp** (identical semantics to the perp
[`account_state`](../info.md#account_state) read, and matching the WS
[`spot_state`](../../ws/subscriptions.md#spot_state) channel): they advance every
commit even when no balance moved, letting a client distinguish a fresh-but-quiet
account from a stalled read path.

Token set is the union of the account's balance and escrow (`reserved`) keys —
a token that is entirely held with zero spendable still appears. Range-scanned
per account (not a full-table walk). State source:
`locus.spot_clearinghouse.{balances, reserved}` (both keyed by `(owner, asset)`).

### Every spot-margin position for an account {#spot_margin_state}

:::info
**Cross-collateralized from the scheduled network upgrade on testnet `114514`.** Read surface for leveraged [spot margin](../../../products/spot-margin.md); the position's margin is held against your one unified USDC account, not a per-pair bucket. See the concept page for the model.
:::

Every spot-margin position held by one account. Required: `user` (0x hex).

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

Response:

```json
{
  "type": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": 200,
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

| Field | Type | Description |
|-------|------|-------------|
| `accounts[*].pair` | uint32 | Spot pair id the position is on |
| `accounts[*].collateral` | decimal string | **Vestigial.** Spot margin is now cross-collateralized against your unified USDC account, so there is no per-pair collateral bucket. Reads `"0"`; kept only for wire-shape compatibility |
| `accounts[*].borrowed` | decimal string | Outstanding loan **principal** (at the snapshot index) |
| `accounts[*].borrow_index_snapshot` | decimal string | Pool borrow index captured at open (debt-accrual basis) |
| `accounts[*].base_held` | decimal string | Segregated base bought on leverage (not in spendable balances) |
| `accounts[*].current_debt` | decimal string | Debt accrued to now: `borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | Per-pair `{ init_bps, maint_bps }`; `null` = margin not enabled / uncalibrated for the pair |

Positions are listed in pair-id order. An account with no positions returns an empty `accounts` array.

### Earn lending pools and account stake {#earn_state}

:::info
**Available on devnet (preview).** Read surface for the [Earn](../../../concepts/earn.md) lending pools; see the concept page for the preview caveats.
:::

Every Earn lending pool, plus one account's stake when `user` is supplied. Optional: `user` (0x hex).

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

Response:

```json
{
  "type": "earn_state",
  "data": {
    "pools": [
      {
        "asset": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": 1000,
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pools[*].asset` | uint32 | Lendable quote asset id (the pool key) |
| `pools[*].total_supplied` | decimal string | Pool NAV — supplied principal plus folded-in repaid interest |
| `pools[*].total_borrowed` | decimal string | Quote currently lent to spot-margin borrowers |
| `pools[*].idle` | decimal string | `total_supplied − total_borrowed` — the instantly-withdrawable bound |
| `pools[*].shares_total` | decimal string | Total shares outstanding |
| `pools[*].share_value` | decimal string | `total_supplied / shares_total` (`0` when no shares) |
| `pools[*].borrow_index` | decimal string | Cumulative borrow index (debt-accrual basis) |
| `pools[*].reserve_factor_bps` | uint16 | Protocol cut of borrow interest (bps) |
| `pools[*].borrow_rate_bps_annual` | uint32 | Annualised borrow rate (bps) |
| `pools[*].reserve_accrued` | decimal string | Protocol reserve accumulated from interest |
| `pools[*].user_shares` | decimal string | **Only with `user`** — shares the account holds in the pool |
| `pools[*].user_value` | decimal string | **Only with `user`** — `user_shares × share_value` |

Pools are listed in asset-id order. Omitting `user` drops the `user_shares` / `user_value` fields.

### Spot-pair-deploy gas-auction state {#spot_deploy_state}

MIP-1 spot-pair-deploy gas-auction state. No parameters.

```json
{ "type": "spot_deploy_state" }
```

Response:

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Current round |
| `current_bid` | decimal string | Leading bid |
| `current_winner` | hex address \| null | Current high bidder |
| `auction_end_ms` / `started_at_ms` | uint64 | Auction window (consensus ms) |
| `total_burned` | decimal string | Cumulative burned winning-bid notional |
| `deposit` | decimal string | Total escrowed deposit (base units) |

State source: `Exchange.spot_pair_deploy_gas_auction`.


## See also {#see-also}

- [`POST /info`](../info.md) — the base read endpoint (envelope, conventions, account & infra queries)
- [Perpetual queries](./perpetuals.md) — perp-market reads
- [Spot](../../../products/spot.md) / [Spot margin](../../../products/spot-margin.md) — the products
