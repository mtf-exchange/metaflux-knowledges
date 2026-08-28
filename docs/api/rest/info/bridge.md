---
description: POST /info read queries for the MetaFlux custody bridge — the per-entry status of a user's pending withdrawals, and the committed per-chain deployment row that defines their message ids.
---

# `POST /info` — bridge

Read queries for the **custody bridge**. Same `POST /info` endpoint, envelope,
and conventions as the [base page](../info.md) — this page carries the
bridge-specific `type`s.

## TL;DR {#tldr}

One public query:

- [`bridge_withdrawal_history`](#bridge_withdrawal_history) — your own pending withdrawals,
  each with a status, plus the committed [deployment row](#chain-configs) for
  each chain.

Two operator queries, listed here for completeness. **The public API refuses
both**, exactly as it refuses `node_info`:

- [`bridge_outbound_queue`](#bridge_outbound_queue) — every pending withdrawal, plus the
  per-chain rotation verdict.
- [`bridge_finalized_cosignatures`](#bridge_finalized_cosignatures) — the
  validator multisig retained for one message id.

:::warning
**`bridge_chain_configs` is REMOVED.** It answered a strict subset of the read
above, so a caller had to pick, and picking the config read alone hid the
entries whose ids that config defines. A request now returns
`400 {"error":"unknown info type: bridge_chain_configs"}`. Read
[`bridge_withdrawal_history`](#bridge_withdrawal_history) — `withdrawals_halted` and `configs`
are on it, unchanged.
:::

## Why this read exists {#why}

**A withdrawal can be stuck, and until this read nothing told the user which
kind of stuck it was.**

A bridge withdrawal moves through the outbox. Validators co-sign it; at a
two-thirds stake quorum the co-signatures become a releasable multisig; a relay
submits that multisig to the destination chain. Every step is committed state,
and none of it was readable.

The founding case: governance rotated the Base deployment while one withdrawal
already held a quorum. That withdrawal can never be released, and no error was
ever reported to the user or to the operator who cast the vote. Both saw only a
balance that had been debited and funds that never arrived.

## The message id moves {#message-id}

A withdrawal has **two** 32-byte ids. Confusing them is the whole defect above.

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
can submit it now. **This is the only status a rotation can break** — see
[`safe_to_rotate`](#safe_to_rotate).

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

:::info
**Renamed at the 0.8.x swap.** This read was `bridge_user_outbox`, and the
operator read was `bridge_outbox`. The archive answers BOTH names through the
swap window, so a client built against either keeps working; the old names are
retired in a later release. A pre-swap node still answers only the old ones.
:::

**In-flight withdrawals also ride `account_state`**, under `bridge_withdrawals`.
That field answers "is my withdrawal moving". THIS read answers "where did it
go" — it is served by the archive, because a validator prunes an entry once its
retention window expires after release and can never answer the second question.

Neither carries `economic_id`. It is not a signing digest, and pairing it with
`message_id` on a public read is the confusion that stranded a live withdrawal.

## `bridge_withdrawal_history` {#bridge_withdrawal_history}

One user's pending bridge withdrawals, plus the committed deployment row for
every chain.

**Served by the archive, not by a validator.** A validator PRUNES a released
entry out of its outbox, so it can only ever answer "in flight right now". The
archive consumes the same state as a stream and keeps the history. Nothing about
the request or the reply changes for a caller.

One consequence is worth knowing: if the archive is unreachable, this read
answers `503`. It never answers an empty `entries` list, because "no archive"
and "no withdrawal in flight" are different facts and only one of them is about
your money.

The entry no longer carries a numeric `asset`. `token` names the asset, and it
is resolved at admission, so a later token rename never rewrites what you asked
for.

**The two halves belong together.** An entry's `message_id` is computed FROM the
deployment row — `evm_chain_id`, `evm_contract_address` and
`validator_set_epoch`, as [above](#message-id). Serving the id without the
domain that defines it made a caller join two reads to know whether the id they
held was still the current one. One read answers it.

Request:

| Param | Type | Required | Meaning |
|---|---|---|---|
| `address` | string | yes | The withdrawing account. `400` if missing or malformed. |
| `chain` | number | no | Restrict `entries` to `1` or `2`. `400` on any other value. |

```json
{ "type": "bridge_withdrawal_history", "address": "0x6629…0611", "chain": 1 }
```

Response `data`:

```json
{
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
      "released_at_ms": null
    }
  ],
  "truncated": false
}
```

`configs` and `withdrawals_halted` do not depend on `address`, and the `chain`
filter does not narrow them. A caller who wants only the deployment rows passes
their own address and reads an empty `entries` — one round trip either way.

`entries` is capped at 256, which is also the per-user admission cap, so
`truncated` is `false` in practice.

An empty `entries` array means this account has no pending withdrawal. It does
**not** mean a past withdrawal failed — a completed withdrawal leaves the outbox
once its retention window elapses.

### The deployment row {#chain-configs}

One row per configured chain. This is the row a deployment-rotation vote must
restate in full. Each field is independently verifiable against the deployed
contract on Base or Arbitrum.

| Field | Meaning |
|---|---|
| `withdrawals_halted` | Chain-wide refusal of new withdrawals, all chains. Governance clears it. A bridge can be unable to PAY while still able to ACCEPT; this flag stops the accept. |
| `contract_address` | The 32-byte deployment id — the EVM address left-padded. |
| `validator_quorum_threshold_bps` | Stake share required to co-sign, a decimal string of whole basis points. `"6700"` = 67%. |
| `replay_nonce` | Per-chain replay counter. Shared by both directions. Preserved across a rotation. |
| `paused` | Per-chain kill switch. Blocks withdrawals AND deposit attestation on this chain. |
| `evm_chain_id`, `evm_contract_address`, `validator_set_epoch` | The deployment triple folded into `message_id`. Rotating any of the three moves the id of every in-flight withdrawal. |

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

## `bridge_outbound_queue` {#bridge_outbound_queue}

:::warning
**Operator lane only — this query is REFUSED on the public API.** It answers
with the same error an unknown type gets. It stays available to node operators
reading a node directly.
:::

Every pending withdrawal on every chain, plus the per-chain rotation verdict and
the full config rows.

Request — all parameters optional:

| Param | Type | Default | Meaning |
|---|---|---|---|
| `chain` | number | all | Restrict `entries` to `1` or `2`. |
| `status` | string | all | Restrict `entries` to one of the four status values. |
| `start` | number | `0` | Page offset. |
| `limit` | number | `256` | Page size, clamped to `1024`. |

Response `data`:

```json
{
  "summary": [
    { "chain": 1, "total": 3,
      "awaiting_cosignatures": 1, "ready_to_release": 0,
      "released_retained": 1, "stranded_on_retired_domain": 1,
      "safe_to_rotate": true },
    { "chain": 2, "total": 0,
      "awaiting_cosignatures": 0, "ready_to_release": 0,
      "released_retained": 0, "stranded_on_retired_domain": 0,
      "safe_to_rotate": true }
  ],
  "configs": [ /* the public config rows, plus the backfill-ack pair */ ],
  "entries": [ /* bridge_withdrawal_history rows, plus user / economic_id / pending_cosigners */ ],
  "start": 0, "limit": 256, "returned": 3, "truncated": false
}
```

`summary` is always computed over the **full** per-chain outbox and always
carries a row for every chain, whatever `chain` / `status` / `start` / `limit`
say. Those parameters shape `entries` only. The summary is the rotation verdict,
and a verdict that a filter could hide would be worse than none.

Each entry adds three operator fields to the public shape:

| Field | Meaning |
|---|---|
| `user` | The withdrawing account. |
| `economic_id` | The rotation-invariant **dedup key**. Not a signing digest — never relay against it. Useful only for forensics against the replay guard. |
| `pending_cosigners` | Validator **addresses** that have signed so far, in canonical order — which validator is lagging. Signature bytes are never served. |

`configs` rows carry two fields the public read omits:
`scan_policy.backfill_ack_l1` and `scan_policy.backfill_ack_start_block`. A
deployment-rotation vote **replaces the whole scan policy**, so a rotation must
restate them; this read is where they are readable.

### `safe_to_rotate` is one of two numbers {#safe_to_rotate}

Rotating a deployment has two distinct hazards, at two different severities.
Read both.

**`safe_to_rotate` — fund safety.** It is `true` when
`ready_to_release == 0`. Rotating while any entry is `ready_to_release`
**permanently strands that withdrawal**: the user stays debited, and only a
governance re-credit recovers it. Never rotate a chain whose
`safe_to_rotate` is `false`.

**`released_retained` — entry leaking.** A released entry is retained for the
retention window, keyed under the current `message_id`. Rotating inside that
window makes the pruner unable to find it, and the entry stays in the outbox
forever. It costs no funds, but it never goes away.

:::tip
**Rotate at least one full retention window after the last release.** Read
`effective_release_retention_ms` from the config row for the window length —
24 hours by default. Waiting drives `released_retained` to `0` on its own, and
it drives `ready_to_release` to `0` too if the relay is healthy.
:::

## `bridge_finalized_cosignatures` {#bridge_finalized_cosignatures}

:::warning
**Operator lane only — this query is REFUSED on the public API.** It answers
with the same error an unknown type gets. It stays available to node operators
reading a node directly.
:::

The retained two-thirds multisig for one message id.

| Param | Type | Required | Meaning |
|---|---|---|---|
| `message_id` | string | yes | 32-byte hex. `400` if missing or malformed, `404` if no set exists. |

```json
{ "type": "bridge_finalized_cosignatures", "message_id": "0x3756…" }
```

Response `data`:

```json
{
  "message_id": "0x3756…",
  "cosigners": [
    { "validator": "0xd486…", "signature": "0x…130 hex chars" }
  ]
}
```

The lookup uses the id **as given**, including a retired-domain id. That is the
point: a stranded entry's multisig sits under an id that the current config row
can no longer derive, so this is the only way to inspect it. `404` means no set
exists under that exact id — for a stranded withdrawal, querying its *current*
`message_id` returns `404` while its *retired* id returns the bundle.
