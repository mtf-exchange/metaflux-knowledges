---
description: POST /info read queries for the MetaFlux custody bridge — the per-entry status of a user's pending withdrawals, and the committed per-chain deployment row that defines their message ids.
---

# `POST /info` — bridge

Read queries for the **custody bridge**. Same `POST /info` endpoint, envelope,
and conventions as the [base page](../info.md) — this page carries the
bridge-specific `type`s.

## TL;DR {#tldr}

:::danger
**THERE IS NO PUBLIC BRIDGE READ ON THE LIVE CHAIN TODAY.**

This page documents [`bridge_withdrawal_history`](#bridge_withdrawal_history) as
the **target**. It is not live. A live gateway answers it `400` with
`{"error":"unknown info type: bridge_withdrawal_history"}`.

The two older names are already retired, so all three fail:

| `type` | Live answer |
|---|---|
| `bridge_withdrawal_history` | `400` — `unknown info type` |
| `bridge_chain_configs` | `410` — `UNKNOWN_TYPE`, `details.use` names `bridge_withdrawal_history` |
| `bridge_user_outbox` | `410` — `UNKNOWN_TYPE`, `details.use` names `bridge_withdrawal_history` |

**The `410` bodies point at a read that does not answer yet.** Following
`details.use` gets you a `400`, not data. That is the current state, not a
mistake in your request.

**Do not build a bridge-status poller against this page yet.** There is no
interim read to use instead — none exists. Track a withdrawal on the
destination chain until this read ships.
:::

One public query, once it lands:

- [`bridge_withdrawal_history`](#bridge_withdrawal_history) — your own pending withdrawals,
  each with a status, plus the committed [deployment row](#chain-configs) for
  each chain.

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
config row. Governance can rotate that row. When it does, **the same withdrawal
gets a new `message_id`**.

Every `message_id` on these reads is the id under the **current** row. It is the
only id a caller should ever act on. `economic_id` appears on the operator read
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
chain's release-retention window (see `effective_release_retention_ms`) so that
a destination-chain reorg can be re-relayed with the same authorization. It
leaves the outbox when that window elapses. `released_at_ms` carries the
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

:::warning
**The old names are retired, and the new one is not live.** This read was
`bridge_user_outbox`, and the operator read was `bridge_outbox`. A
`bridge_user_outbox` request now answers `410`, and its `details.use` names
`bridge_withdrawal_history` — which itself answers `400 unknown info type`
today. No name currently serves these rows. See the notice at the
[top of this page](#tldr).
:::

**This read is the whole answer**, in flight and finished alike. It is served by
the archive rather than a validator for exactly that reason: a validator prunes
an entry once its retention window expires after release, so it can only ever say
what is moving right now, never where a withdrawal went.

Read `open` to tell the two apart. `released_at_ms` cannot do it alone — an entry
pruned by retention also leaves the queue and carries no release stamp.

Neither carries `economic_id`. It is not a signing digest — do not pair it with
`message_id`.

## A user's pending bridge withdrawals {#bridge_withdrawal_history}

> ⬆️ **Upgrade notice — NOT LIVE YET.** Everything below describes the target
> shape. A live gateway answers this `type` with `400`
> `{"error":"unknown info type: bridge_withdrawal_history"}`. Read it as a
> specification to build against, not as a call you can make today. Until it
> ships there is **no** public read for bridge withdrawal status, and no
> substitute read exists.

One account's pending bridge withdrawals, plus the committed deployment row
for every configured chain, served by the archive rather than a validator.

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
    "withdrawals_halted": false,
    "configs": [
      {
        "chain": 1,
        "contract_address": "0x00000000000000000000000010f1a0f6153b8b77a355098e5f19c659a9a0965a",
        "validator_quorum_threshold_bps": "6700",
        "replay_nonce": 12,
        "paused": false,
        "evm_chain_id": 8453,
        "evm_contract_address": "0x10f1a0f6153b8b77a355098e5f19c659a9a0965a",
        "validator_set_epoch": 2,
        "release_retention_ms": 0,
        "effective_release_retention_ms": 86400000,
        "scan_policy": {
          "confirmations_only": false,
          "confirmations": 0,
          "effective_confirmations": 5,
          "confirmations_only_depth": 0,
          "usdc_token": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          "raw_transfer_credit": true
        }
      }
    ],
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
| `withdrawals_halted` | bool | Chain-wide refusal of new withdrawals — see the [deployment row](#chain-configs) |
| `configs` | object[] | One [deployment row](#chain-configs) per configured chain |
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

### The deployment row {#chain-configs}

One row per configured chain. This is the row a deployment-rotation vote must
restate in full. Each field is independently verifiable against the deployed
contract on Base or Arbitrum.

| Field | Type | Meaning |
|---|---|---|
| `chain` | number | Chain id, `1` (Base) or `2` (Arbitrum) |
| `withdrawals_halted` | bool | Chain-wide refusal of new withdrawals, all chains. Governance clears it. A bridge can be unable to PAY while still able to ACCEPT; this flag stops the accept |
| `contract_address` | string | The 32-byte deployment id — the EVM address left-padded |
| `validator_quorum_threshold_bps` | Decimal string | Stake share required to co-sign, in whole basis points. `"6700"` = 67% |
| `replay_nonce` | number | Per-chain replay counter. Shared by both directions. Preserved across a rotation |
| `paused` | bool | Per-chain kill switch. Blocks withdrawals AND deposit attestation on this chain |
| `evm_chain_id` | number | Part of the deployment triple folded into `message_id` — see [The message id moves](#message-id) |
| `evm_contract_address` | string | Part of the deployment triple folded into `message_id` — see [The message id moves](#message-id) |
| `validator_set_epoch` | number | Part of the deployment triple folded into `message_id` — see [The message id moves](#message-id) |
| `release_retention_ms` | number | `0`-as-unset sentinel — see [The `effective_*` fields](#effective-fields) |
| `effective_release_retention_ms` | number | The retention window actually in force, ms — see [The `effective_*` fields](#effective-fields) |
| `scan_policy.confirmations_only` | bool | Confirmation mode flag. Not a configuration a real-funds chain uses |
| `scan_policy.confirmations` | number | `0`-as-unset sentinel — see [The `effective_*` fields](#effective-fields) |
| `scan_policy.effective_confirmations` | number | The confirmation depth actually in force — see [The `effective_*` fields](#effective-fields) |
| `scan_policy.confirmations_only_depth` | number | Read only while `confirmations_only` is `true` |

:::danger
**Every value in this row ROTATES. Read it; never freeze it.** A governance
`mbConfigureChain` vote replaces the **whole** row, including the custody
contract address. Two things break in a client that cached one:

- A stale `evm_chain_id` / `evm_contract_address` / `validator_set_epoch`
  computes a **wrong `message_id`**. You then track, or relay against, an id no
  validator is signing.
- A stale `evm_contract_address` points a deposit at a **retired custody
  contract**. Funds sent there are not credited by the current deployment.

Do not copy any of these values into config, into source, or into your own
documentation. Read them from this response on each use.
:::

#### The `effective_*` fields carry the rule {#effective-fields}

`release_retention_ms` and `confirmations` are **0-as-unset sentinels**. A raw
`0` does not mean "no retention" or "no confirmations" — it means the field was
never set, and a built-in default applies. The read serves both the raw value
and the value actually in force:

| Raw field | Reading of `0` |
|---|---|
| `release_retention_ms` | `effective_release_retention_ms`, default 86400000 (24 h) |
| `confirmations` | `effective_confirmations`, default 5 |

Always read the `effective_*` field. The raw field only tells you whether
governance has set an explicit value.

`confirmations_only_depth` is read only while `confirmations_only` is `true`,
which is not a configuration a real-funds chain uses.

Two config fields are **not served here**: the backfill-acknowledgement pair is
internal node-instance identity with no caller value, and it appears on the
operator read instead. A retired always-zero field is omitted entirely.

**Rules**

- `entries[*].token` is a symbol string, resolved at admission — the entry
  carries no numeric `asset` id. Resolving at admission means a later token
  rename never rewrites what you asked for.
- `entries[*].message_id` is computed from the matching `configs[*]` row's
  deployment triple (`evm_chain_id`, `evm_contract_address`,
  `validator_set_epoch` — see [The message id moves](#message-id)). Read both
  together: an id read alone cannot tell you whether it is still current.
- `configs` and `withdrawals_halted` do not depend on `address`, and the
  `chain` filter does not narrow them. A caller who wants only the deployment
  rows passes their own address and reads an empty `entries` — one round trip
  either way.
- `entries` is capped at 256, which is also the per-user admission cap, so
  `truncated` is `false` in practice.
- An empty `entries` array means this account has no pending withdrawal. It
  does **not** mean a past withdrawal failed — a completed withdrawal leaves
  the outbox once its retention window elapses.

**Errors**

- `chain` outside `1` / `2` → `400`.
- Archive unreachable → `503`. This read never answers an empty `entries` list
  for that case — "no archive" and "no withdrawal in flight" are different
  facts, and only one of them is about your money.
