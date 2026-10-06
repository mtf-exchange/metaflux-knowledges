---
description: "Node-scoped snapshots: peers, sync state and the figures an operator reads from a running node."
---

# Node snapshot reads

These reads return exchange status, account helpers, vault and validator summaries, and the peer roster.

They are read queries on [`POST /info`](../info.md). That page describes the
endpoint, the request envelope, the number planes and the error shape. These
apply to every query here.

## Node snapshot query types {#node-snapshot-query-types}

These reads answer from the committed state of the node. They use the same
`{type, data}` envelope and the same conventions as every other read: money as
decimal strings, addresses as `0x`-hex, asset ids as unsigned integers, and map
keys in sorted order. Each read is a keyed lookup, not a scan, except where the
set is small by nature (markets, vaults, validators).

Perpetual market reads are on the [perpetual queries](../info/perpetuals.md)
page. Spot, spot-margin and Earn reads are on the
[spot & margin queries](../info/spot.md) page. The reads below belong to no
single product: exchange status, open-order helpers, liquidation, rate limits,
vaults, validators and multi-sig.

### Global exchange trading status {#exchange_status}

This read returns the global trading status. It takes no parameters.

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
| `chain_identity` | string | The chain that answered. See [chain identity](#chain-identity) below |
| `spot_disabled` | bool | Spot trading is disabled globally |
| `post_only` | bool | A post-only window is in force. New orders must be maker-only |
| `frozen` | bool | The chain is in a pending upgrade halt |
| `timestamp` | uint64 | Consensus block time, in ms. It is the "as of" time for every field above |
| `mip3_enabled` | bool | `true` when any MIP-3 market or pair spec is registered |

:::info
This read reports the current status only. It does not return the pending
upgrade height or the replay progress of the node. `frozen` shows that a halt
is coming. It does not give a date.
:::

#### Chain identity {#chain-identity}

**A `chain_id` does not identify a chain.** Two chains can run the same
`chain_id`. All their other stable properties can also be identical: the
endpoint shape, the validator addresses and the `eth_chainId` answer. Only the
moving state differs, and a client cannot assert on moving state.

`chain_identity` is the value that identifies one chain. It reads
`c<chain_id>-t<chain start, ms>-g<first 16 hex of the genesis hash>`. The
genesis hash includes the validator set, the epoch length and the initial state
root. Two chains that agree on all three parts are the same chain.

**Assert it at startup, and refuse to run on a mismatch.**

1. Put the expected value in your configuration next to the endpoint URL.
2. Read `exchange_status` before your first write.
3. Compare the two strings.
4. Exit if they differ.

A required URL setting alone is not sufficient. It stops the use of a default
endpoint, not of a wrong one. Rows written against the wrong chain have the
same shape as correct rows. Their only provenance is a `chain_id` that
collides, so nobody can find the mistake later.

| Value | Meaning | What to do |
|-------|---------|------------|
| `c…-t…-g…` | The chain the node runs | Compare to your configured constant |
| `underivable` | The node proves no genesis | Treat as a mismatch. Never as a match |
| absent | A node older than the field | Treat as a mismatch |

`underivable` can never collide with the value of a real chain, because a
derived identity always starts with `c` and a digit.

**When it changes.** Only a re-genesis of the chain that you read changes it.
It survives a node restart, a release, a node upgrade and a validator-set
change. A re-genesis of a different chain does not change it. Cache it for the
life of your process, and read it again on every reconnect to a new endpoint.

It also survives any config edit that the node still boots with. Two edits are
not in that set. If you remove the genesis file, the value becomes
`underivable`. If you change the genesis timestamp under a genesis file, the
node does not boot. Neither edit can produce a false match: one refuses, and
the other never starts.

:::warning
`frontend_open_orders` is removed (folded into `open_orders`, wire-v2 phase 2).
A request now returns `400 UNKNOWN_TYPE`.
Every [`open_orders`](./orders-fills.md#open_orders) row already has the TIF,
`cloid` and trigger detail that it used to return. See that entry.
:::

### Active TWAP parents for an account {#user_twaps}

This read returns the active TWAP parent orders of the account. These are the
running slice schedulers, with the total size and the executed size. A TWAP
that completes or is cancelled leaves this set. The set holds current TWAPs
only, not history. For the history of slice fills, use
[`user_twap_slice_fills`](./account-history.md#user_twap_slice_fills).
Required: `address` (0x hex).

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
| `twaps[*].twap_id` | uint64 | Parent TWAP id (pass it to [`twap_cancel`](../exchange/orders.md#twap_cancel)) |
| `twaps[*].coin` | string | Market symbol |
| `twaps[*].side` | `"B"` / `"A"` | Side token. It uses the same `"B"`/`"A"` form as [`user_fills`](./orders-fills.md#user_fills) |
| `twaps[*].sz` | Decimal string | Total size of the parent (whole units) |
| `twaps[*].executed_sz` | Decimal string | The size that fired slices already filled (whole units) |
| `twaps[*].slices_total` | uint32 | The slice count of the parent schedule |
| `twaps[*].slices_done` | uint32 | Slices fired so far |
| `twaps[*].delay_ms` | uint64 | Delay between slices (ms) |
| `twaps[*].last_fire_ts` | uint64 | Timestamp of the last slice fire (consensus ms) |
| `twaps[*].reduce_only` | bool | The parent is reduce-only |

Rows are in ascending `twap_id` order. There is no `duration` field. Calculate
it as `slices_total × delay_ms`. The wire has only the independent values.

### All vault summaries {#vault_summaries}

This read returns a summary of all vaults. It takes no parameters.

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
| `vaults[*].address` / `leader` | hex address | On-chain address of the vault, and its leader |
| `vaults[*].name` | string | Display name of the vault. Present on every row |
| `vaults[*].tvl` | decimal string | Mark-to-market NAV, in whole USDC. It is the same figure as [`vault_state.tvl`](./vaults-staking.md#vault_state) |
| `vaults[*].follower_count` | uint64 | Number of share holders |
| `vaults[*].kind` | `"user" \| "metaliquidity"` | Vault kind |

Every vault appears, and each row names its `leader`. To list the vaults that
one address leads, filter these rows on `leader`. There is no read for each
leader.

### User action counters {#user_rate_limit}

This read returns the action counters of a user. Required: `address` (0x hex).

**This read does not report a rate-limit budget, although its name suggests
it.** It returns only nonce and action counters, not bucket state. No read
shows the remaining budget. Track your own spend against
[rate limits](../../rate-limits.md).

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
| `pending_count` | uint32 | Count of pending (in-flight) actions |
| `lifetime_count` | uint64 | Actions submitted over the lifetime of the account |

An address with no record reads as all zeros.

### Approved broker-fee grants {#approved_brokers}

This read returns every builder-fee grant that an account has approved, and the
bps ceiling of each. Required: `address` (0x hex). To check one
`(address, builder)` pair, find the builder in this list. An address that is
absent is not approved. That is the same answer as a `"0"` ceiling.

```json
{ "type": "approved_brokers", "address": "0x<addr>" }
```

**Response**

```json
{
  "data": {
    "type": "approved_brokers",
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
| `builders[*].max_fee_bps` | string | Approved bps ceiling, as a decimal string of whole basis points |

Builders are in ascending address order. An account with no approvals returns
an empty array.

### Validator oracle vote metadata {#validator_l1_votes}

This read returns the current validator L1 votes. It takes no parameters.

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
| `latest_round` | uint64 | **A governance proposal-id counter. It is not the latest vote round, and it is not the maximum `round` in `votes`.** The governance proposal path increments it. Nothing derives it from the votes. On a chain that has opened no proposal, it stays `0` while `votes[*].round` goes into the millions. Never use it to page or to date the votes |
| `votes[*].round` | uint64 | Vote round |
| `votes[*].validator` | hex address | Casting validator |
| `votes[*].submitted_at` | uint64 | Submission timestamp (consensus ms) |

The vote payload is opaque oracle bytes that the node decodes internally. This
read reports metadata only, not the raw payload.

### Validator stake and status {#validator_summaries}

This read returns a snapshot for every validator in the active validator
registry: stake, status and delegation. The registry is a small, bounded set.
Rows are in ascending key order.

Optional: `address` (0x hex). If you name an address, every row includes the
stake of that caller. It changes nothing else.

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
| `validators[*].validator` | 0x address | Primary address of the validator |
| `validators[*].signer` | 0x address | Operational signer (hot key) |
| `validators[*].validator_index` | uint32 | Consensus index |
| `validators[*].display_name` | string \| null | The handle that the operator chose (`set_display_name`), or `null` when it set none |
| `validators[*].stake` | decimal string | Total stake: the self stake and the stake of all others |
| `validators[*].self_stake` | decimal string | The contribution of the validator |
| `validators[*].delegated_stake` | decimal string | `stake − self_stake`: all stake from accounts other than the validator |
| `validators[*].your_stake` | decimal string \| null | The stake that the requesting address has delegated to this validator |
| `validators[*].commission_bps` | string | Commission in whole basis points, as a decimal string |
| `validators[*].is_active` | bool | In the active set this epoch |
| `validators[*].is_jailed` | bool | Jailed now |
| `validators[*].jailed_at` | uint64 \| null | Jail start ts (null if not jailed) |
| `validators[*].unjail_at` | uint64 \| null | Earliest unjail ts (null if not jailed) |
| `validators[*].first_active_epoch` | uint64 | The first epoch in which the validator was active |

**A `display_name` of `null` means unset, never "unknown".** Use the address
instead. Do not invent a name, and do not read `null` as a node older than the
field.

**`your_stake` has two different blank values.** `"0"` means that the request
named an address, and that address has delegated nothing to this validator.
`null` means that the request named no address, so the field is about nobody.
Show the column as empty, not as a zero balance.

**`delegated_stake` is derived, not stored.** It is exactly
`stake − self_stake`, so it always agrees with the two figures next to it. Do
not sum it across rows to get `total_stake`. That sum excludes the self stake
of every validator.

**There is no `epoch` key, and there never was one in use.** No production code
writes the current-epoch counter of the chain. Any value served would be a
constant, not the real epoch of the chain. Read `first_active_epoch` for each
validator instead.

The chain does not track `n_recent_blocks`. The read omits it and does not
invent a value.

### Advertised peer roster {#gossip_root_ips}

This read returns the nodes that this deployment advertises for peer discovery.
It takes no parameters. It reports network topology, not committed state.

:::info Active
A running node answers with the `peers` shape below. The previous shape,
`{ "root_ips": ["host:port", ...] }`, is removed. There is no `root_ips` key.
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
| `peers` | object[] | One row for each advertised node. Empty when the deployment advertises nothing. |
| `peers[*].id` | uint16 | The numeric id of the node |
| `peers[*].gossip` | string | Public gossip endpoint, `host:port` |
| `peers[*].peer_rpc` | string | Public peer-RPC endpoint, `host:port` |
| `peers[*].auth` | string | Public auth endpoint, `host:port` |
| `peers[*].pubkey_hex` | string (optional) | Compressed secp256k1 public key for the TCP auth of the peer. The key is **absent** when the operator did not publish it. |

**Row shape.** A row has the shape of a peer config entry. The five fields map
one-to-one onto the peer entry of a joining node, so you can paste a row and
dial it.

**Row source.** Each node serves a roster that the operator curates in its own
config. The roster states public reachability. It is not the internal dial list
of the node, and no address from that dial list can appear here.

**A node that advertises nothing is absent from the rows.** There is no
fallback. A validator can run, vote and serve while it publishes no address.
Such a validator does not appear. An empty `peers` array is therefore the
correct answer for a deployment that advertises nothing. It is not an error,
and it does not show an unhealthy node.

The roster shows the node config published at startup. It is not committed
state, and it is not part of the AppHash.
