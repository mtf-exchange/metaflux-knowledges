---
description: POST /info reads for the MetaFlux custody bridge. They give the status of each pending withdrawal of a user, and describe the deployment rotation that moves its message id.
---

# Bridge reads {#post-info--bridge}

This page describes the `POST /info` read for the custody bridge.

The read uses the same `POST /info` endpoint, envelope and conventions as the
[base page](../info.md). This page lists the bridge `type`s.

## Summary {#tldr}

There is one public query:

- [`bridge_withdrawal_history`](#bridge_withdrawal_history): your own pending
  withdrawals, each with a status.

Two older names are retired: `bridge_chain_configs` and `bridge_user_outbox`.
Both answer `410` with `code: "UNKNOWN_TYPE"`, and `details.use` names
`bridge_withdrawal_history`.

## Withdrawal lifecycle {#why}

A bridge withdrawal moves through the outbox. Validators co-sign it. At a
two-thirds stake quorum, the co-signatures become a releasable multisig. A
relay submits that multisig to the destination chain.

## Message id rotation {#message-id}

A withdrawal has two 32-byte ids.

| Id | What it is | Moves on rotation? |
|---|---|---|
| `message_id` | The *signing digest*. Validators co-sign it, and the destination contract verifies it. | **Yes** |
| `economic_id` | An internal *dedup key*. It is not a signature digest, and validators never co-sign it. | No |

`message_id` includes the deployment context: `evm_chain_id`,
`evm_contract_address` and `validator_set_epoch` from the committed
*deployment row* of the chain. Governance can rotate that row. When it does,
**the same withdrawal gets a new `message_id`**.

This read does not include the deployment row. A node publishes the full row on
its [`node_bridge_outbox`](../../../nodes/data-streams.md#node_bridge_outbox-configs)
stream. The custody address for each chain is in the
[Deployments](../../../bridge/index.md#deployments) table. The row rotates, so
never hardcode an address or an epoch. A stale value computes a `message_id`
that no validator signs, and it points a deposit at a retired custody contract.

Every `message_id` on this read is the id under the current row. It is the only
id that a caller should act on. `economic_id` appears only on the node stream,
with a label that says what it is.

## Withdrawal status {#status}

Every outbox entry has exactly one `status`. The four values below show what
each status means for the user. A fifth value, [`voided`](#voided), appears
only on a finished entry in
[`bridge_withdrawal_history`](#bridge_withdrawal_history).

### `awaiting_cosignatures`

Validators are still co-signing. This status is normal, and it survives a
deployment rotation. The relay derives the new `message_id` and signs again
under it. Only the partial-signature progress resets. The withdrawal is not at
risk.

`pending_cosigner_count` reports how many validators have signed so far.

While withdrawals are halted, validators sign nothing. A queued withdrawal
stays in this status until the halt ends. The halt exists so that governance
can still [void](#voided) a withdrawal before any signature exists.

### `ready_to_release`

A releasable two-thirds multisig exists under the current deployment. The relay
can submit it now.

**A rotation can break this status only.** A deployment rotation retires the
domain that the multisig was signed under. The entry then moves to
`stranded_on_retired_domain`, and a releasable multisig never appears again.
The withdrawal stays unpaid until governance [re-issues](#reissue) it. A
withdrawal below quorum is safe: it signs again under the new domain without
help.

### `stranded_on_retired_domain`

Quorum was reached under a deployment that governance has since retired. The
outbound replay guard keys on the `economic_id`, which does not move. The chain
therefore refuses on purpose to finalize this withdrawal again under the new
deployment. That refusal prevents a double release. It also means that **no
releasable multisig can ever appear for this entry**.

:::danger
**`stranded_on_retired_domain` is terminal, and it covers two states with
opposite outcomes.** Waiting does not clear either state, and no relay action
can.

1. The withdrawal was never paid. Governance can [re-issue](#reissue) it.
2. The withdrawal was **already paid**, and then its deployment was rotated
   inside the retention window. The funds are already on the destination chain.

**Confirm which state it is on the destination chain before any re-issue.** A
re-issue against state 2 pays the same withdrawal twice.

Contact the operators. Do not submit the withdrawal again.
:::

**Do not use the message id to tell the two states apart.** A payment made
before a rotation was recorded under the id of the old deployment. `message_id`
on this read is always the current one, so an id lookup answers "not paid" for
a paid entry. Instead, check if `dst_addr` received the amount on the
destination chain.

### `released`

A quorum confirms the release on the destination chain. The chain keeps the
entry for its release-retention window. A reorg on the destination chain can
then be relayed again with the same authorization. The entry leaves the outbox
when that window ends. `released_at_ms` has the release timestamp. It is `null`
for every other status.

## Re-issue of a withdrawal {#reissue}

Governance can re-issue a stranded withdrawal under the current deployment. The
re-issue has the fields of the original withdrawal and a new nonce.

After a re-issue, [`bridge_withdrawal_history`](#bridge_withdrawal_history)
shows two entries for the withdrawal:

- A new entry. It has the same `amount_units` and `dst_addr`, a higher `nonce`,
  and the status `awaiting_cosignatures`. It then moves through the normal
  lifecycle.
- The stranded entry. It leaves the outbox, and its last status stays
  `stranded_on_retired_domain`. No lane can release it after the re-issue.

The new nonce gives the new entry a new `message_id`. Act on the new entry only.

The re-issue moves no exchange balance:

- The user is never debited twice. The original withdrawal has the only debit.
- The user is never credited on the exchange. The funds go to `dst_addr` on the
  destination chain.
- Governance re-issues a withdrawal once. The chain refuses a second re-issue of
  the same withdrawal.

### `voided` {#voided}

Governance removed the withdrawal before any validator signed it, and refunded
the user on the exchange in the same step. The entry is finished: `open` is
`false`.

- The refund is the full amount that the withdrawal debited, including the
  bridge fee. The fee comes back because the relay that it paid for never
  happens.
- Nothing pays the withdrawal on the destination chain. The chain refuses every
  later signature for it, under any deployment.
- A withdrawal that has a validator signature cannot be voided.

The refund appears in the exchange balance of the account, but the ledger has
no refund row. The withdrawal row keeps its debit, and its joined outbox entry
reads `voided`. Add the refund yourself when you rebuild a balance from the
ledger.

### Disputed withdrawal {#disputed}

A validator can dispute a withdrawal on the destination contract. The dispute
makes that `message_id` permanently unpayable. The exchange can still read
`released` for the entry, because the exchange records the release before the
dispute stops the payment.

The same governed re-issue restores a disputed withdrawal. A new entry with a
new nonce appears, as for a stranded withdrawal.

To learn if a `released` withdrawal was paid, check that `dst_addr` received
the amount on the destination chain.

## Conventions {#conventions}

- `amount_units` is in the base units of the destination chain, not whole
  coins. USDC has 6 decimals, so `"1000000"` is 1.0 USDC. It is a string,
  because the value is a `u128` and does not fit a JSON number.
- `chain` is `1` (Base) or `2` (Arbitrum). No other value exists.
- 32-byte values (`message_id`, `economic_id`, `dst_addr`, `contract_address`)
  render as `0x` and 64 hex characters. Addresses render as `0x` and 40.
- Timestamps and nonces are JSON numbers.
- Entries keep queue order, oldest first.

## Bridge withdrawal history {#bridge_withdrawal_history}

This read returns the bridge withdrawals of one account. The archive serves it,
not a validator.

**This read is the full answer**, for withdrawals in flight and finished ones.
That is the reason the archive serves it. A validator prunes an entry when its
retention window after release ends. A validator can only say what is moving
now. It cannot say where a withdrawal went.

Read `open` to tell the two apart. `released_at_ms` alone cannot do it,
because an entry that retention pruned also leaves the queue and has no release
stamp.

This read does not include `economic_id`. That id is not a signing digest. Do
not pair it with `message_id`.

**Request**

```json
{ "type": "bridge_withdrawal_history", "address": "0x6629…0611", "chain": 1 }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `address` | string | yes | The withdrawing account. |
| `chain` | number | no | Limit `entries` to `1` or `2`. Any other value is a `400`. See Errors below. |

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
| `address` | string | The account that you asked for |
| `entries[*].chain` | number | Chain id, `1` (Base) or `2` (Arbitrum). See [Conventions](#conventions) |
| `entries[*].token` | string | Asset symbol, resolved at admission |
| `entries[*].amount_units` | Decimal string | Amount in the base units of the destination chain. See [Conventions](#conventions) |
| `entries[*].dst_addr` | string | Destination address, 32-byte, left-padded |
| `entries[*].nonce` | number | Nonce of the entry |
| `entries[*].ts_ms` | number | When the entry was recorded, in consensus ms |
| `entries[*].message_id` | string | The current signing digest for this withdrawal. See [Message id rotation](#message-id) |
| `entries[*].status` | enum | One of the four values, or `voided` on a finished entry. See [Withdrawal status](#status) |
| `entries[*].pending_cosigner_count` | number | How many validators have signed so far |
| `entries[*].released_at_ms` | number \| null | Release timestamp. `null` for every status except `released` |
| `entries[*].open` | bool | Whether the entry is still moving. See [Conventions](#conventions) |
| `truncated` | bool | Whether `entries` was cut short. See Rules |

**Rules**

- `entries[*].token` is a symbol string, resolved at admission. The entry has
  no numeric `asset` id. Because the symbol is resolved at admission, a later
  token rename never rewrites what you asked for.
- The chain computes `entries[*].message_id` from the deployment triple of the
  chain: `evm_chain_id`, `evm_contract_address` and `validator_set_epoch` (see
  [Message id rotation](#message-id)). The id alone cannot tell you if it is
  still current. Compare it against the deployment row in force.
- The cap on `entries` is 256. That is also the per-user admission cap, so
  `truncated` is `false` in practice.
- An empty `entries` array means that this account has no pending withdrawal.
  It does not mean that a past withdrawal failed. A completed withdrawal leaves
  the outbox when its retention window ends.

**Errors**

- **A `chain` other than `1` or `2` is a `400`.** The error names both
  accepted values. Only `1` (Base) and `2` (Arbitrum) have withdrawals. The
  refusal keeps a bad `chain` separate from an account with no pending
  withdrawal. Without it, both would answer the same empty `entries` list.
- If the archive is unreachable, the read answers `503`. It never answers an
  empty `entries` list in that case. "No archive" and "no withdrawal in flight"
  are different facts, and only one of them is about your money.
