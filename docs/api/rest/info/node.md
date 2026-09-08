---
description: "Node-scoped snapshots: peers, sync state and the figures an operator reads off a running node."
---

# Node snapshot reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

## Node snapshot query types {#node-snapshot-query-types}

These reads answer from the node's committed state, over the same
`{type, data}` envelope and the same conventions as every read above: money as
decimal strings, addresses as `0x`-hex, asset ids as unsigned integers, map
keys in sorted order. Each is a keyed lookup, not a scan, except where the set
is inherently small (markets, vaults, validators).

Perpetual market reads are on the [perpetual queries](../info/perpetuals.md)
page, and spot, spot-margin and Earn reads on the
[spot & margin queries](../info/spot.md) page. The reads below are the ones
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
    "chain_identity": "c114514-t1788275280000-g8f6fce34e462c553",
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
| `chain_identity` | string | Which chain answered. See [chain identity](#chain-identity) below |
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

#### Chain identity {#chain-identity}

**A `chain_id` does not identify a chain.** Two chains can run the same
`chain_id`, and everything else that is stable about them — the endpoint shape,
the validator addresses, the `eth_chainId` answer — can be identical too. Only
the moving state differs, and moving state cannot be asserted on.

`chain_identity` is the value that does identify one. It reads
`c<chain_id>-t<chain start, ms>-g<first 16 hex of the genesis hash>`. The
genesis hash folds the validator set, the epoch length and the initial state
root, so two chains that agree on all three parts are the same chain.

**Assert it at startup and refuse to run on a mismatch.** Put the expected value
in your configuration next to the endpoint URL, read `exchange_status` before
your first write, compare the two strings, and exit on a difference. Requiring
the URL to be configured is not enough on its own: that stops a default endpoint
from being used, not a wrong one. Rows written against the wrong chain are
byte-identical in shape to correct rows and carry a colliding `chain_id` as
their only provenance, so the mistake cannot be found afterwards.

| Value | Meaning | What to do |
|-------|---------|------------|
| `c…-t…-g…` | The chain the node runs | Compare to your configured constant |
| `underivable` | The node proves no genesis | Treat as a mismatch. Never as a match |
| absent | A node older than the field | Treat as a mismatch |

`underivable` can never collide with a real chain's value, because a derived
identity always starts `c` and a digit.

**What it changes on.** Only a re-genesis of the chain you are reading. It
survives a node restart, a release, a node upgrade and a validator-set change,
and a re-genesis of a DIFFERENT chain does not move it. So cache it for the life
of your process, and re-read it on every reconnect to a new endpoint.

It also survives any config edit the node still boots on. Two edits are not in
that set: removing the genesis file turns the value to `underivable`, and
changing the genesis timestamp under a genesis file stops the boot. Neither can
produce a false match — one refuses, the other never starts.

:::warning
`frontend_open_orders` is removed (folded into `open_orders`, wire-v2 phase 2).
A request now returns `400 UNKNOWN_TYPE`.
The TIF / `cloid` / trigger detail it used to carry is on every
[`open_orders`](./orders-fills.md#open_orders) row already — see that entry.
:::

### Active TWAP parents for an account {#user_twaps}

The account's active TWAP parent orders: the live slice schedulers, with total
size versus executed size. A completed or cancelled TWAP leaves this set — it
is the live set, not history. For slice-fill history, use
[`user_twap_slice_fills`](./account-history.md#user_twap_slice_fills). Required: `address` (0x hex).

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
| `twaps[*].twap_id` | uint64 | Parent TWAP id (pass to [`twap_cancel`](../exchange/orders.md#twap_cancel)) |
| `twaps[*].coin` | string | Market symbol |
| `twaps[*].side` | `"B"` / `"A"` | Side token — the same `"B"`/`"A"` form as [`user_fills`](./orders-fills.md#user_fills) |
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
      { "id": 7, "address": "0x<vault>", "leader": "0x<leader>", "name": "MLP", "tvl": "10000000000", "follower_count": 2, "kind": "user" }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `vaults[*].id` | uint64 | Vault id |
| `vaults[*].address` / `leader` | hex address | Vault on-chain address / leader |
| `vaults[*].name` | string | Display name of the vault. Present on every row |
| `vaults[*].tvl` | decimal string | Mark-to-market NAV, whole-USDC — same figure as [`vault_state.tvl`](./vaults-staking.md#vault_state) |
| `vaults[*].follower_count` | uint64 | Number of share holders |
| `vaults[*].kind` | `"user" \| "metaliquidity"` | Vault kind |

Every vault appears, and each row names its `leader`. To list the vaults led
by one address, filter these rows on `leader` — there is no per-leader read.

### A user's action stats {#user_rate_limit}

A user's action counters. Required: `address` (0x hex).

**Despite the name, this does not report a rate-limit budget.** It returns
nonce and action counters only, not bucket state. No read exposes remaining
budget — track your own spend against [rate limits](../../rate-limits.md).

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
    "latest_round": 0,
    "votes": [ { "round": 43000000, "validator": "0x<validator>", "submitted_at": 1700000000000 } ]
  }
}
```

| Field | Type | Meaning |
|-------|------|-------------|
| `latest_round` | uint64 | **A governance proposal-id counter. It is NOT the latest vote round, and it is not the maximum `round` in `votes`.** The governance proposal path increments it; nothing derives it from the votes. On a chain that has opened no proposal it stays `0` while `votes[*].round` runs into the millions. Never use it to page or to date the votes |
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

:::info Live
A live node answers the `peers` shape below. The previous shape,
`{ "root_ips": ["host:port", ...] }`, is removed — there is no `root_ips` key.
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
does not appear. An empty `peers` array is therefore the honest answer
for a deployment that advertises nothing, not an error and not a sign of an
unhealthy node.

The roster reflects node config published at startup. It is not committed
state and is not folded into the AppHash.
