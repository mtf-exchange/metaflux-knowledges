---
description: POST /info read queries for the MetaFlux custody bridge — the per-entry status of a user's pending withdrawals, and the deployment rotation that moves their message ids.
---

# `POST /info` — bridge

Read queries for the **custody bridge**. Same `POST /info` endpoint, envelope,
and conventions as the [base page](../info.md) — this page carries the
bridge-specific `type`s.

## TL;DR {#tldr}

One public query:

- [`bridge_withdrawal_history`](#bridge_withdrawal_history) — your own pending
  withdrawals, each with a status.

Two older names are retired: `bridge_chain_configs` and `bridge_user_outbox`.
Both answer `410` with `code: "UNKNOWN_TYPE"`, and `details.use` names
`bridge_withdrawal_history`.

## The withdrawal lifecycle {#why}

A bridge withdrawal moves through the outbox. Validators co-sign it. At a
two-thirds stake quorum, the co-signatures become a releasable multisig. A
relay submits that multisig to the destination chain.

## The message id moves {#message-id}

A withdrawal has **two** 32-byte ids.

| Id | What it is | Moves on rotation? |
|---|---|---|
| `message_id` | The **signing digest**. Validators co-sign this, and the destination contract verifies it. | **Yes** |
| `economic_id` | An internal **dedup key**. Not a signature digest, never co-signed. | No |

`message_id` folds the deployment context — `evm_chain_id`,
`evm_contract_address` and `validator_set_epoch` from the chain's committed
**deployment row**. Governance can rotate that row. When it does, **the same
withdrawal gets a new `message_id`**.

The deployment row is not part of this read. A node publishes the full row on
its [`node_bridge_outbox`](../../../nodes/data-streams.md#node_bridge_outbox-configs)
stream, and the custody address for each chain is in the
[Deployments](../../../bridge/index.md#deployments) table. The row rotates, so
never hardcode an address or an epoch: a stale value computes a `message_id` no
validator signs, and points a deposit at a retired custody contract.

Every `message_id` on this read is the id under the **current** row. It is the
only id a caller should ever act on. `economic_id` appears on the node stream
only, labeled for what it is.

## Withdrawal status {#status}

Every outbox entry carries exactly one `status`. The four values, and what each
means for the user:

### `awaiting_cosignatures`

Validators are still co-signing. **Normal, and it survives a deployment
rotation** — the relay re-derives the new `message_id` and re-signs under it.
Only partial-signature progress resets; the withdrawal itself is not at risk.

`pending_cosigner_count` reports how many validators have signed so far.

### `ready_to_release`

A releasable two-thirds multisig exists under the current deployment. The relay
can submit it now.

**This is the only status a rotation can break.** A deployment rotation retires
the domain the multisig was signed under, so the entry moves to
`stranded_on_retired_domain` and no releasable multisig ever appears again. You
stay debited until a governance re-credit. A withdrawal below quorum is safe: it
re-signs under the new domain by itself.

### `stranded_on_retired_domain`

Quorum was reached under a deployment that has since been **retired**. The
outbound replay guard keys on the `economic_id`, which does not move, so the
chain deliberately refuses to re-finalize this withdrawal under the new
deployment. That refusal is what prevents a double release — but it also means
**no releasable multisig can ever appear for this entry**.

:::danger
**`stranded_on_retired_domain` is terminal, and it covers TWO states with
opposite outcomes.** Waiting does not clear either, and no relay action can.

1. The withdrawal was never paid. It needs a governance re-credit.
2. The withdrawal was **already paid**, and its deployment was then rotated
   inside the retention window. The funds are on the destination chain already.

**Confirm which one it is on the destination chain BEFORE any re-credit.** A
re-credit against state 2 pays the same withdrawal twice.

Contact the operators; do not re-submit the withdrawal.
:::

**Do not try to tell the two apart by message id.** A payment made before a
rotation was recorded under the OLD deployment's id, and `message_id` on this
read is always the CURRENT one, so an id lookup answers "not paid" for a paid
entry. Check whether `dst_addr` actually received the amount on the destination
chain instead.

### `released`

The destination-chain release is quorum-confirmed. The entry is retained for the
chain's release-retention window so that a destination-chain reorg can be
re-relayed with the same authorization. It leaves the outbox when that window
elapses. `released_at_ms` carries the
release timestamp; it is `null` for every other status.

## Conventions {#conventions}

- `amount_units` is in the destination chain's **base units**, not whole coins.
  USDC has 6 decimals, so `"1000000"` is 1.0 USDC. It is a **string**: the value
  is a `u128` and does not fit a JSON number.
- `chain` is `1` (Base) or `2` (Arbitrum). No other value exists.
- 32-byte values (`message_id`, `economic_id`, `dst_addr`, `contract_address`)
  render as `0x` plus 64 hex characters. Addresses render as `0x` plus 40.
- Timestamps and nonces are JSON numbers.
- Entries keep queue order, oldest first.

## A user's pending bridge withdrawals {#bridge_withdrawal_history}

One account's bridge withdrawals, served by the archive rather than a validator.

**This read is the whole answer**, in flight and finished alike. The archive
serves it for exactly that reason: a validator prunes an entry once its
retention window expires after release, so a validator can only say what is
moving right now, never where a withdrawal went.

Read `open` to tell the two apart. `released_at_ms` cannot do it alone — an entry
pruned by retention also leaves the queue and carries no release stamp.

This read does not carry `economic_id`. It is not a signing digest — do not pair
it with `message_id`.

**Request**

```json
{ "type": "bridge_withdrawal_history", "address": "0x6629…0611", "chain": 1 }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `address` | string | yes | The withdrawing account. |
| `chain` | number | no | Restrict `entries` to `1` or `2`. |

**Response**

```json
{
  "data": {
    "type": "bridge_withdrawal_history",
    "address": "0x6629…0611",
    "entries": [
      {
        "chain": 1,
        "token": "USDC",
        "amount_units": "1000000",
        "dst_addr": "0x000000000000000000000000662971350e886a0a5631d3e9133d33f767f80611",
        "nonce": 1,
        "ts_ms": 1753576000000,
        "message_id": "0x8565…",
        "status": "stranded_on_retired_domain",
        "pending_cosigner_count": 0,
        "released_at_ms": null,
        "open": true
      }
    ],
    "truncated": false
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `address` | string | The account you asked for, echoed back |
| `entries[*].chain` | number | Chain id, `1` (Base) or `2` (Arbitrum) — see [Conventions](#conventions) |
| `entries[*].token` | string | Asset symbol, resolved at admission |
| `entries[*].amount_units` | Decimal string | Amount in the destination chain's base units — see [Conventions](#conventions) |
| `entries[*].dst_addr` | string | Destination address, 32-byte, left-padded |
| `entries[*].nonce` | number | Per-entry nonce |
| `entries[*].ts_ms` | number | When the entry was recorded, consensus ms |
| `entries[*].message_id` | string | The current signing digest for this withdrawal — see [The message id moves](#message-id) |
| `entries[*].status` | enum | One of the four values — see [Withdrawal status](#status) |
| `entries[*].pending_cosigner_count` | number | How many validators have signed so far |
| `entries[*].released_at_ms` | number \| null | Release timestamp. `null` for every status except `released` |
| `entries[*].open` | bool | Whether the entry is still moving — see [Conventions](#conventions) |
| `truncated` | bool | Whether `entries` was cut short — see Rules |

**Rules**

- `entries[*].token` is a symbol string, resolved at admission — the entry
  carries no numeric `asset` id. Resolving at admission means a later token
  rename never rewrites what you asked for.
- `entries[*].message_id` is computed from the chain's deployment triple
  (`evm_chain_id`, `evm_contract_address`, `validator_set_epoch` — see
  [The message id moves](#message-id)). The id alone cannot tell you whether it
  is still current: compare it against the deployment row in force.
- `entries` is capped at 256, which is also the per-user admission cap, so
  `truncated` is `false` in practice.
- An empty `entries` array means this account has no pending withdrawal. It
  does **not** mean a past withdrawal failed — a completed withdrawal leaves
  the outbox once its retention window elapses.

**Errors**

- **A `chain` outside `1` / `2` is not rejected.** It answers `200` with an
  empty `entries` list, the same body an account with no pending withdrawal
  gets. Only `1` (Base) and `2` (Arbitrum) carry withdrawals, so an empty list
  on any other value tells you nothing about the account. Send a chain the
  bridge serves.
- Archive unreachable → `503`. This read never answers an empty `entries` list
  for that case — "no archive" and "no withdrawal in flight" are different
  facts, and only one of them is about your money.
