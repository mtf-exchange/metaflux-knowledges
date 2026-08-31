---
description: POST /info read queries for governance — validator_votes, the one time-ranged read that reports every validator vote and every enacted parameter change, and the three retired gov reads it replaces.
---

# `POST /info` — governance

Read queries for **validator governance**. Same `POST /info` endpoint, envelope,
and conventions as the [base page](../info.md) — this page carries the
governance-specific `type`s.

## TL;DR {#tldr}

One query, [`validator_votes`](#validator_votes). It reports both votes that
are still open and votes that already enacted, over a time range. It is the
one place a caller learns that a governance action happened, who voted for
it, and what the parameter was before.

## What this read reports {#why}

A governance vote can change a margin parameter. For example, a vote can
lower `max_leverage` on BTC and ETH from 100 to 20. `validator_votes` is the
read that reports it: every vote cast and every enactment produces a row,
carrying the asset, the action, the agreeing stake, and the before/after
value of each field the vote moved.

## Query types {#query-types}

### Validator votes, open and enacted {#validator_votes}

Every governance vote in a time window — the ones still collecting stake and
the ones that already changed a parameter. One row per vote **lifecycle**, not
per cast: all casts that back the same payload in the same vote round fold
into one row, with the casts listed inside it. All arguments are optional;
with no arguments the read returns the most recent window it can serve.

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
| `start_time` | uint64 | no | Window start (ms, inclusive). Filters on the row's **anchor time** — see Rules. Absent ⇒ open lower bound |
| `end_time` | uint64 | no | Window end (ms, inclusive). Same anchor time. Absent ⇒ open upper bound |
| `limit` | uint32 | no | Rows returned. Default `500`, clamped to `1 … 5000` |
| `coin` | string | no | Market symbol, e.g. `"BTC"`. Keeps only votes scoped to that market. A vote with no market scope is excluded |
| `category` | string | no | Vote category, e.g. `"dynamic_risk"`, `"vote_global"`, `"gov_propose"`, `"treasury"`, `"metaliquidity"`, `"oracle_weights"`, `"funding_formula"`, `"spot_margin"` |
| `validator` | hex address | no | Keeps only rows this validator cast a vote in |
| `status` | `"voting" \| "enacted" \| "expired"` | no | Keeps only rows in that lifecycle state |

**Response**

:::warning
**`type` sits on the ENVELOPE, not inside `data`.** The reply is
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
**`casts[*].value` on a `dynamic_risk` row is a RAW `0x` BLOB, not a number.**
The payload packs several fields at once, so there is no single value to decode.
A client that renders it as the voted leverage prints a long hex string where a
number should be. Live `dynamic_risk` casts carry 116 to 150 characters, and the
length changes with the payload.

**Read `changes[]` for the values, not `casts[*].value`.** `changes[]` is the
per-field before/after the enactment actually wrote. It is the only decoded view
of what the vote moved.
:::

| Field | Type | Meaning |
|-------|------|---------|
| `coverage.start` | uint64 | Anchor time of the oldest row in THIS answer |
| `coverage.end` | uint64 | Anchor time of the newest row in THIS answer |
| `coverage.reaches_oldest` | bool | `true` = the answer reaches the oldest row the archive holds. `false` = **older votes exist that this answer does not include** — page back with an earlier `end_time` |
| `round` | uint64 | Vote round id. Casts pool by round; the round also carries the category |
| `sub_id` | uint32 | Sub-key inside the round. One round can carry several independent payloads, one per scope — a per-market vote uses the market id here. **Two rows can share a `round`; `(round, sub_id)` is what identifies a row** |
| `category` | string | Vote category (same values the `category` argument accepts). **`""` (an empty string) on a row with no category** — a direct action has none. It is an empty string, never `null` |
| `action` | string | The signed action the validators cast, e.g. `"SetDynamicRiskParam"`. **This is the field that names WHAT was voted**, and it is always present. It is `UpperCamelCase` |
| `asset` | uint32 \| null | Market id the vote is scoped to. `null` for a category that has no market scope |
| `coin` | string \| null | Market symbol for `asset`. `null` on the same rows |
| `status` | `"voting" \| "enacted" \| "expired"` | Lifecycle state — see [Status](#status) |
| `first_cast_at` | uint64 \| null | Timestamp of the first cast in this row (consensus ms). **`null` on a row with no casts** — see below |
| `last_cast_at` | uint64 \| null | Timestamp of the most recent cast (consensus ms). **`null` on a row with no casts** |
| `enacted_at` | uint64 \| null | Enactment timestamp (consensus ms). `null` unless `status` is `"enacted"` |
| `enacted_block` | uint64 \| null | Committed block the enactment settled in. `null` unless enacted |
| `total_stake` | Decimal string | Σ stake of non-jailed validators at the time of the vote — the quorum denominator |
| `quorum_stake` | Decimal string | Stake this payload had to reach to enact (two thirds of `total_stake`) |
| `agreeing_stake` | Decimal string \| null | Stake pooled behind this row's payload. Compare against `quorum_stake` for distance to quorum. **`null` on a row that did not enact** — see below |
| `casts` | array | The casts behind this row, possibly **empty** — see below |
| `casts[*].validator` | hex address | Validator that cast |
| `casts[*].stake` | Decimal string | **The caster's stake AT THE MOMENT OF THE CAST**, not its stake today. Stake moves; a tally recomputed from present-day stake would not reproduce the enactment |
| `casts[*].cast_at` | uint64 | Cast timestamp (consensus ms) |
| `casts[*].block` | uint64 | Committed block the cast settled in |
| `casts[*].value` | string | The voted payload. On most categories it is a raw `0x`-prefixed blob — read `changes[]` instead |
| `changes` | array | Per-field before/after of the enactment. **Always an array; `[]` when the row did not enact** — see below |
| `changes[*].field` | string | Parameter field the vote moved, e.g. `"max_leverage"` |
| `changes[*].prior` | string \| null | The **effective** prior — see [prior is the effective prior](#effective-prior). `null` only where the enacting action does not know its own prior |
| `changes[*].new` | string | The value written. **Always a string**, whatever the field's type — a boolean field reads `"true"` / `"false"`, not `true` / `false` |

#### Four fields answer "did not enact" differently {#not-enacted}

A row that did not enact is common: `expired` is the normal end of a vote that
did not persuade two thirds of stake. These four fields each say so in their own
way, and only one of them uses `null` the way a reader expects.

| Field | On a row that did NOT enact |
|-------|------------------------------|
| `changes` | **`[]`** — an empty array, **never `null`**. Test `changes.length`, not `changes !== null` |
| `agreeing_stake` | **`null`** — no tally is published. You cannot compute distance to quorum from it |
| `enacted_at` / `enacted_block` | **`null`** |
| `status` | `"voting"` or `"expired"` — the field to branch on |

**Branch on `status`.** It is the only field that distinguishes "still
collecting stake" from "lifetime elapsed, nothing written".

#### A row can have NO casts {#no-casts}

A **direct action** enacts without a per-validator vote round. Its row carries
`"casts": []`, `"category": ""`, and `first_cast_at` / `last_cast_at` both
`null`. It still carries `enacted_at`, `enacted_block`, `agreeing_stake` and a
populated `changes[]`.

Read a row's `changes[]` and `enacted_at` for what happened. Do **not** derive
"nothing happened" from an empty `casts` array — the change is committed.

**Rules**

- **The anchor time is `enacted_at` when the row enacted, and `last_cast_at`
  otherwise.** A vote that is still open therefore moves inside the window as
  new casts arrive; an enacted vote is pinned by its enactment.
- Rows return oldest-first within the window, matching
  [`user_fills`](../info.md#user_fills).
- Markets are addressed by `coin` symbol. There is no numeric market argument.
- Competing payloads in one round are **separate rows**. Two validators voting
  different values in the same round do not tally together, so they do not
  fold together here either.

#### `prior` is the EFFECTIVE prior {#effective-prior}

`changes[*].prior` is the value a caller would have READ just before the
enactment — not the previous override row.

A vote can be the FIRST override on a market. When it is, there is no
previous override row, so a naive "previous override" answer is `null` and
tells the caller nothing. The effective prior instead resolves the same
ladder a read resolves — override ladder top rung, else the flat override
value, else the market's genesis value — so a first-override BTC row reports
`prior: "100"`, the number the market actually showed before the vote.

#### Status {#status}

| `status` | Meaning |
|----------|---------|
| `enacted` | The vote reached quorum and the parameter change is committed. `enacted_at`, `enacted_block`, `agreeing_stake` and a populated `changes[]` are present |
| `voting` | The vote is open. The most recent cast is still inside the governance vote lifetime, so more stake can still join. `changes` is `[]` and `agreeing_stake` is `null` |
| `expired` | The vote never reached quorum and its lifetime elapsed. Nothing was written. `changes` is `[]` and `agreeing_stake` is `null`. There is no on-chain expiry event — this state is derived from the last cast time |

An `expired` row is not an error and not a failure to record. It is the normal
end of a vote that did not persuade two thirds of stake.

#### Answering "who changed this market's leverage" {#worked-example}

```json
{ "type": "validator_votes", "coin": "BTC", "category": "dynamic_risk", "status": "enacted" }
```

The row answers all four parts of the question at once: `action` says what was
voted, `changes[]` says which field moved and from what to what, `enacted_at`
and `enacted_block` say when, and `casts[]` says who and with how much stake.

**Take the values from `changes[]`, never from `casts[*].value`.** On this
category the cast value is a packed `0x` blob covering several fields at once.
`changes[]` is the decoded, per-field answer.

#### Coverage {#coverage}

Rows are served from the archive, so this read covers history, not only the
live window. Votes that predate this read are backfilled, so a query over their
window returns them.

**Read the `coverage` object before you conclude a vote never happened.**
`coverage.reaches_oldest: false` means the archive holds older rows this answer
does not include. It says the answer is CUT, not that history is empty. Page
back with an earlier `end_time` until `reaches_oldest` is `true`.

If a deployment has no archive configured, the read answers `200` with
`"votes": []` rather than an error.

## Retired reads {#retired-reads}

The three reads below are **retired from the public gateway**. Each one is
replaced by [`validator_votes`](#validator_votes).

| Retired read | Use instead |
|--------------|-------------|
| `gov_state` | [`validator_votes`](#validator_votes) with `status: "voting"` for the open votes. Current parameter VALUES are on the reads that own them — a market's risk parameters on [`markets_meta`](./perpetuals.md#markets_meta), the fee ladder on [`fee_schedule`](../info.md#fee_schedule), global trading flags on [`exchange_status`](../info.md#exchange_status) |
| `gov_proposals` | [`validator_votes`](#validator_votes) with `status: "voting"` — same rounds, same stake tallies, plus the per-cast detail and the time range |
| `gov_history` | [`validator_votes`](#validator_votes) with `status: "enacted"` — every enactment, not a subset, with the asset, the voters and the prior value |

### `gov_state` — retired {#gov_state}

:::warning
**`gov_state` is retired from the public gateway.** A request answers
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

`details.use` names the read to call instead. This is the one place `410` is
answered: a retired read is well formed and it did exist, so neither `400` nor
`404` describes it.

Use [`validator_votes`](#validator_votes). See the table above for where the
current parameter values now live.
:::

### `gov_proposals` — retired {#gov_proposals}

:::warning
**`gov_proposals` is retired from the public gateway.** A request answers
`410 Gone` with the same body shape, naming `validator_votes`.

Use [`validator_votes`](#validator_votes) with `status: "voting"`. It carries
the same rounds and stake tallies, and adds the per-cast rows and the time range
the old read had no way to express.
:::

### `gov_history` — retired {#gov_history}

:::warning
**`gov_history` is retired from the public gateway.** A request answers
`410 Gone` with the same body shape, naming `validator_votes`.

**Do not port a client to the new read field-for-field — the old one was
incomplete.** It carried one value per entry, no asset, no voters and no prior
value, and it did not record every enactment. A margin-parameter vote could
enact and leave no row at all. [`validator_votes`](#validator_votes) with
`status: "enacted"` records every one.
:::

:::info
**A node you run yourself still answers all three.** The retirement is on the
public gateway only; the node's own `/info` keeps serving `gov_state`,
`gov_proposals` and `gov_history` for validator operators, who need the live
vote machinery to cast a vote. They are not part of the public API.
:::
