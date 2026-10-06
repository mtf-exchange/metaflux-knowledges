---
description: POST /info reads for governance. validator_votes is the one time-ranged read that reports every validator vote and every enacted parameter change. It replaces three retired governance reads.
---

# Governance reads {#post-info--governance}

This page describes the `POST /info` read for validator governance.

The read uses the same `POST /info` endpoint, envelope and conventions as the
[base page](../info.md). This page lists the governance `type`s.

## Summary {#tldr}

There is one query, [`validator_votes`](#validator_votes). It reports votes
that are still open and votes that already enacted, over a time range. It is
the one place where a caller learns that a governance action happened, who
voted for it, and what the parameter was before.

## What this read reports {#why}

A governance vote can change a margin parameter. For example, a vote can lower
`max_leverage` on BTC and ETH from 100 to 20. `validator_votes` reports that
change. Every vote cast and every enactment produces a row. The row has the
asset, the action, the agreeing stake, and the value before and after for each
field that the vote moved.

## Query types {#query-types}

### Validator votes, open and enacted {#validator_votes}

This read returns every governance vote in a time window. It includes the votes
that are still collecting stake and the votes that already changed a parameter.
There is one row for each vote lifecycle, not for each cast. All casts that
back the same payload in the same vote round fold into one row, and the row
lists the casts. All arguments are optional. With no arguments, the read
returns the most recent window that it can serve.

**Request**

```json
{
  "type":       "validator_votes",
  "start_time": 1753000000000,
  "end_time":   1753999999999,
  "limit":      500,
  "coin":       "BTC",
  "category":   "dynamic_risk",
  "validator":  "0x<val>",
  "status":     "enacted"
}
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `start_time` | uint64 | no | Window start (ms, inclusive). It filters on the *anchor time* of the row. See Rules. If absent, the lower bound is open |
| `end_time` | uint64 | no | Window end (ms, inclusive). It uses the same anchor time. If absent, the upper bound is open |
| `limit` | uint32 | no | Rows returned. Default `500`, clamped to `1 … 5000` |
| `coin` | string | no | Market symbol, for example `"BTC"`. It keeps only votes scoped to that market. It excludes a vote with no market scope |
| `category` | string | no | Vote category, for example `"dynamic_risk"`, `"vote_global"`, `"proposal"`, `"treasury_config"`, `"metaliquidity_set"`, `"oracle_weights"`, `"funding_formula"`, `"spot_margin_params"`, `"pm_collateral"`. The full list is the [`node_gov` category table](../../../nodes/data-streams.md#node_gov-categories) |
| `validator` | hex address | no | Keeps only rows in which this validator cast a vote |
| `status` | `"voting" \| "enacted" \| "expired"` | no | Keeps only rows in that lifecycle state |

**Response**

:::warning
**`type` is on the envelope, not inside `data`.** The reply is
`{"type": "validator_votes", "data": {"coverage", "votes"}}`. A client that
reads `data.type` to route the reply gets `undefined`.
:::

```json
{
  "type": "validator_votes",
  "data": {
    "coverage": {
      "start": 1787319823934,
      "end":   1788102195463,
      "reaches_oldest": false
    },
    "votes": [
      {
        "round":          2001003,
        "sub_id":         1003,
        "category":       "dynamic_risk",
        "action":         "SetDynamicRiskParam",
        "asset":          1003,
        "coin":           "GRAD:600519SH",
        "status":         "enacted",
        "first_cast_at":  1787319823934,
        "last_cast_at":   1787319824353,
        "enacted_at":     1787319824353,
        "enacted_block":  18523310,
        "total_stake":    "87600000",
        "quorum_stake":   "58402920",
        "agreeing_stake": "69400000",
        "casts": [
          { "validator": "0x<val_a>", "stake": "13100000", "cast_at": 1787319823934, "block": 18523306, "value": "0x0000…0201" }
        ],
        "changes": [
          { "field": "max_leverage",       "prior": "5",    "new": "4" },
          { "field": "maint_margin_ratio", "prior": "0.03", "new": "0.0402" }
        ]
      }
    ]
  }
}
```

:::danger
**`casts[*].value` on a `dynamic_risk` row is a raw `0x` blob, not a number.**
The payload packs several fields together, so there is no single value to
decode. A client that shows it as the voted leverage prints a long hex string
where a number should be. Live `dynamic_risk` casts have 116 to 150
characters, and the length changes with the payload.

**Read `changes[]` for the values, not `casts[*].value`.** `changes[]` is the
value before and after for each field that the enactment wrote. It is the only
decoded view of what the vote moved.
:::

| Field | Type | Meaning |
|-------|------|---------|
| `coverage.start` | uint64 | Anchor time of the oldest row in this answer |
| `coverage.end` | uint64 | Anchor time of the newest row in this answer |
| `coverage.reaches_oldest` | bool | `true` = the answer reaches the oldest row that the archive holds. `false` = **older votes exist that this answer does not include**. Page back with an earlier `end_time` |
| `round` | uint64 | Vote round id. Casts pool by round. The round also has the category |
| `sub_id` | uint32 | Sub-key inside the round. One round can have several independent payloads, one for each scope. A per-market vote uses the market id here. **Two rows can share a `round`. `(round, sub_id)` identifies a row** |
| `category` | string | Vote category (the same values that the `category` argument accepts). **`""` (an empty string) on a row with no category.** A direct action has no category. It is an empty string, never `null` |
| `action` | string | The signed action that the validators cast, for example `"SetDynamicRiskParam"`. **This field names what was voted**, and it is always present. It is `UpperCamelCase` |
| `asset` | uint32 \| null | The market id that the vote is scoped to. `null` for a category that has no market scope |
| `coin` | string \| null | Market symbol for `asset`. `null` on the same rows |
| `status` | `"voting" \| "enacted" \| "expired"` | Lifecycle state. See [Status](#status) |
| `first_cast_at` | uint64 \| null | Timestamp of the first cast in this row (consensus ms). **`null` on a row with no casts.** See below |
| `last_cast_at` | uint64 \| null | Timestamp of the most recent cast (consensus ms). **`null` on a row with no casts** |
| `enacted_at` | uint64 \| null | Enactment timestamp (consensus ms). `null` unless `status` is `"enacted"` |
| `enacted_block` | uint64 \| null | The committed block that the enactment settled in. `null` unless enacted |
| `total_stake` | Decimal string | Σ stake of non-jailed validators at the time of the vote. This is the quorum denominator |
| `quorum_stake` | Decimal string | The stake that this payload had to reach to enact (two thirds of `total_stake`) |
| `agreeing_stake` | Decimal string \| null | The stake pooled behind the payload of this row. Compare it with `quorum_stake` for the distance to quorum. **`null` on a row that did not enact.** See below |
| `casts` | array | The casts behind this row. It can be **empty**. See below |
| `casts[*].validator` | hex address | The validator that cast |
| `casts[*].stake` | Decimal string | **The stake of the caster at the time of the cast**, not its stake today. Stake moves. A tally calculated again from current stake would not match the enactment |
| `casts[*].cast_at` | uint64 | Cast timestamp (consensus ms) |
| `casts[*].block` | uint64 | The committed block that the cast settled in |
| `casts[*].value` | string | The voted payload. On most categories it is a raw `0x`-prefixed blob. Read `changes[]` instead |
| `changes` | array | The value before and after the enactment, for each field. **Always an array. `[]` when the row did not enact.** See below |
| `changes[*].field` | string | The parameter field that the vote moved, for example `"max_leverage"` |
| `changes[*].prior` | string \| null | The *effective* prior. See [effective prior](#effective-prior). `null` only where the enacting action does not know its own prior |
| `changes[*].new` | string | The value written. **Always a string**, for any field type. A boolean field reads `"true"` / `"false"`, not `true` / `false` |

#### Rows that did not enact {#not-enacted}

A row that did not enact is common. `expired` is the normal end of a vote that
did not get two thirds of stake. Four fields show this, each in its own way.
Only one of them uses `null` as a reader expects.

| Field | On a row that did NOT enact |
|-------|------------------------------|
| `changes` | **`[]`**: an empty array, **never `null`**. Test `changes.length`, not `changes !== null` |
| `agreeing_stake` | **`null`**. No tally is published. You cannot calculate the distance to quorum from it |
| `enacted_at` / `enacted_block` | **`null`** |
| `status` | `"voting"` or `"expired"`. This is the field to branch on |

**Branch on `status`.** It is the only field that separates "still collecting
stake" from "lifetime ended, nothing written".

#### Rows with no casts {#no-casts}

A *direct action* enacts without a vote round for each validator. Its row has
`"casts": []`, `"category": ""`, and `first_cast_at` and `last_cast_at` both
`null`. It still has `enacted_at`, `enacted_block`, `agreeing_stake` and a
populated `changes[]`.

Read `changes[]` and `enacted_at` of a row to learn what happened. Do not
conclude "nothing happened" from an empty `casts` array. The change is
committed.

**Rules**

- **The anchor time is `enacted_at` when the row enacted, and `last_cast_at`
  otherwise.** A vote that is still open therefore moves inside the window as
  new casts arrive. An enacted vote stays fixed at its enactment time.
- Rows return oldest first within the window, the same as
  [`user_fills`](./orders-fills.md#user_fills).
- The read addresses markets by `coin` symbol. There is no numeric market
  argument.
- Competing payloads in one round are separate rows. Two validators that vote
  different values in the same round do not tally together, so they do not fold
  together here either.

#### Effective `prior` value {#effective-prior}

`changes[*].prior` is the value that a caller would have read immediately before
the enactment. It is not the previous override row.

A vote can be the first override on a market. In that case there is no
previous override row, so a simple "previous override" answer is `null` and
tells the caller nothing. The effective prior resolves the same ladder that a
read resolves: the top step of the override ladder, else the flat override
value, else the genesis value of the market. A first-override BTC row therefore
reports `prior: "100"`, the number that the market showed before the vote.

#### Status {#status}

| `status` | Meaning |
|----------|---------|
| `enacted` | The vote reached quorum and the parameter change is committed. `enacted_at`, `enacted_block`, `agreeing_stake` and a populated `changes[]` are present |
| `voting` | The vote is open. The most recent cast is still inside the governance vote lifetime, so more stake can still join. `changes` is `[]` and `agreeing_stake` is `null` |
| `expired` | The vote never reached quorum and its lifetime ended. Nothing was written. `changes` is `[]` and `agreeing_stake` is `null`. There is no on-chain expiry event. The read derives this state from the last cast time |

An `expired` row is not an error and not a failure to record. It is the normal
end of a vote that did not get two thirds of stake.

#### Leverage change example {#worked-example}

This query finds who changed the leverage of a market:

```json
{ "type": "validator_votes", "coin": "BTC", "category": "dynamic_risk", "status": "enacted" }
```

The row answers all four parts of the question. `action` says what was voted.
`changes[]` says which field moved, and its values before and after.
`enacted_at` and `enacted_block` say when. `casts[]` says who voted, and with
how much stake.

**Take the values from `changes[]`, never from `casts[*].value`.** On this
category, the cast value is a packed `0x` blob that covers several fields.
`changes[]` is the decoded answer for each field.

#### Coverage {#coverage}

The archive serves the rows, so this read covers history, not only the recent
window. Votes older than this read are backfilled, so a query over their window
returns them.

**Read the `coverage` object before you conclude that a vote never happened.**
`coverage.reaches_oldest: false` means that the archive holds older rows that
this answer does not include. It says that the answer is cut, not that history
is empty. Page back with an earlier `end_time` until `reaches_oldest` is
`true`.

If a deployment has no archive configured, the read answers `200` with
`"votes": []`. It does not answer an error.

## Retired reads {#retired-reads}

The public gateway no longer serves the three reads below.
[`validator_votes`](#validator_votes) replaces each one.

| Retired read | Use instead |
|--------------|-------------|
| `gov_state` | [`validator_votes`](#validator_votes) with `status: "voting"` for the open votes. Current parameter values are on the reads that own them: the risk parameters of a market on [`markets_meta`](./perpetuals.md#markets_meta), the fee ladder on [`fee_schedule`](./fees-credit.md#fee_schedule), and global trading flags on [`exchange_status`](./node.md#exchange_status) |
| `gov_proposals` | [`validator_votes`](#validator_votes) with `status: "voting"`. It has the same rounds and the same stake tallies, and also the detail of each cast and the time range |
| `gov_history` | [`validator_votes`](#validator_votes) with `status: "enacted"`. It has every enactment, not a subset, with the asset, the voters and the prior value |

### Retired `gov_state` {#gov_state}

:::warning
**The public gateway no longer serves `gov_state`.** A request answers
`410 Gone`:

```json
{
  "error": {
    "code":    "UNKNOWN_TYPE",
    "message": "gov_state is retired; use validator_votes (time-ranged, served from the archive)",
    "details": { "field": "type", "use": "validator_votes" }
  }
}
```

`details.use` names the read to call instead. This is the one case that answers
`410`. A retired read is well formed and it did exist, so neither `400` nor
`404` describes it.

Use [`validator_votes`](#validator_votes). See the table above for the reads
that now hold the current parameter values.
:::

### Retired `gov_proposals` {#gov_proposals}

:::warning
**The public gateway no longer serves `gov_proposals`.** A request answers
`410 Gone` with the same body shape, and the body names `validator_votes`.

Use [`validator_votes`](#validator_votes) with `status: "voting"`. It has the
same rounds and stake tallies. It also adds the rows for each cast and the time
range, which the old read could not express.
:::

### Retired `gov_history` {#gov_history}

:::warning
**The public gateway no longer serves `gov_history`.** A request answers
`410 Gone` with the same body shape, and the body names `validator_votes`.

**Do not port a client to the new read field by field. The old read was
incomplete.** It had one value for each entry, no asset, no voters and no prior
value. It did not record every enactment. A margin-parameter vote could enact
and leave no row. [`validator_votes`](#validator_votes) with
`status: "enacted"` records every enactment.
:::

:::info
**A node that you run yourself still answers all three.** Only the public
gateway retired them. The `/info` of the node still serves `gov_state`,
`gov_proposals` and `gov_history` for validator operators. Operators need the
live vote machinery to cast a vote. These reads are not part of the public
API.
:::

The governance reads have their own page:
[governance queries](../info/governance.md).

One read serves all of governance:
[`validator_votes`](../info/governance.md#validator_votes). It reports votes
that are still open and votes that already enacted, over a time range. It is
the one place where a caller learns that a governance action happened, who
voted for it, and what the parameter was before.

This is important because a governance vote can move a margin parameter. A
two-thirds-stake vote once lowered `max_leverage` on BTC and ETH from 100 to
20, and no public read reported it. The stake quorum is ⅔, weighted by stake.
Jailed validators are excluded from the denominator and from every tally.

The public gateway no longer serves the three older governance reads. Each one
answers `410 Gone` with a body that names `validator_votes`.
