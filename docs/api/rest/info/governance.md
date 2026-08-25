---
description: POST /info read queries for governance — validator_votes, the one time-ranged read that reports every validator vote and every enacted parameter change, and the three retired gov reads it replaces.
---

# `POST /info` — governance

Read queries for **validator governance**. Same `POST /info` endpoint, envelope,
and conventions as the [base page](../info.md) — this page carries the
governance-specific `type`s.

## TL;DR {#tldr}

One query, [`validator_votes`](#validator_votes). It reports **both** votes that
are still open and votes that already enacted, over a time range. It is the ONE
place a caller learns that a governance action happened, who voted for it, and
what the parameter was before.

## Why this read exists {#why}

**A governance vote can move a MARGIN parameter, and until this read nothing
published that it had happened.**

The founding case: a two-thirds-stake vote lowered `max_leverage` on BTC and ETH
from 100 to 20. The chain applied it correctly. No public read reported it. A
trader could see the new ceiling on the market, but could not learn that a vote
set it, when, at what prior value, or which validators agreed.

The old `gov_history` read did not close that hole. It logged a SUBSET of
enactments and classified only some of what it logged — many rows carried
`kind: 255`, `kind_name: null` and `via: "other"`. **A partial log is worse than
no log, because it reads as complete.** A caller who found no BTC row concluded
no vote had happened, which was wrong.

`validator_votes` is a ledger, not a classifier. Every vote cast and every
enactment produces a row, with the asset, the action, the agreeing stake, and the
before/after value of each field the vote moved.

## Upgrade notices {#upgrade-notices}

:::caution
**This page describes the target shape. Two parts are not live yet.**

1. **`validator_votes` is not served yet.** A request today returns
   `400 {"error":"unknown info type: validator_votes"}`. The shape below is the
   committed contract; build against it, but do not ship a client that depends on
   it until this notice is removed.
2. **The three retired reads still answer today.** `gov_state`, `gov_proposals`
   and `gov_history` are documented below as retired from the public gateway.
   The gateway has not started refusing them yet — it still answers them with
   their old shape. **Stop calling them now.** When the retirement lands they
   answer `410 Gone`, and the reply names `validator_votes` as the replacement.
:::

## Query types {#query-types}

### Validator votes, open and enacted {#validator_votes}

Every governance vote in a time window — the ones still collecting stake and the
ones that already changed a parameter. One row per vote **lifecycle**, not per
cast: all casts that back the same payload in the same vote round fold into one
row, with the casts listed inside it.

All arguments are optional. With no arguments the read returns the most recent
window it can serve.

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

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `start_time` | uint64 | no | Window start (ms, inclusive). Filters on the row's **anchor time** — see below. Absent ⇒ open lower bound |
| `end_time` | uint64 | no | Window end (ms, inclusive). Same anchor time. Absent ⇒ open upper bound |
| `limit` | uint32 | no | Rows returned. Default `500`, clamped to `1 … 5000` |
| `coin` | string | no | Market symbol, e.g. `"BTC"`. Keeps only votes scoped to that market. A vote with no market scope is excluded |
| `category` | string | no | Vote category, e.g. `"dynamic_risk"`, `"vote_global"`, `"gov_propose"`, `"treasury"`, `"metaliquidity"`, `"oracle_weights"`, `"funding_formula"`, `"spot_margin"` |
| `validator` | hex address | no | Keeps only rows this validator cast a vote in |
| `status` | `"voting" \| "enacted" \| "expired"` | no | Keeps only rows in that lifecycle state |

**The anchor time is `enacted_at` when the row enacted, and `last_cast_at`
otherwise.** A vote that is still open therefore moves inside the window as new
casts arrive; an enacted vote is pinned by its enactment. Rows return
oldest-first within the window, matching
[`user_fills`](../info.md#user_fills).

Markets are addressed by `coin` symbol. There is no numeric market argument.

Response:

```json
{
  "type": "validator_votes",
  "data": {
    "votes": [
      {
        "round":          2000000,
        "category":       "dynamic_risk",
        "action":         "setDynamicRiskParam",
        "asset":          0,
        "coin":           "BTC",
        "status":         "enacted",
        "first_cast_at":  1753000000000,
        "last_cast_at":   1753000090000,
        "enacted_at":     1753000090000,
        "enacted_block":  6512345,
        "total_stake":    "150000",
        "quorum_stake":   "100005",
        "agreeing_stake": "120000",
        "casts": [
          { "validator": "0x<val_a>", "stake": "60000", "cast_at": 1753000000000, "value": "20" },
          { "validator": "0x<val_b>", "stake": "60000", "cast_at": 1753000090000, "value": "20" }
        ],
        "changes": [
          { "field": "max_leverage", "prior": "100", "new": "20" }
        ]
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `round` | uint64 | Vote round id. Casts pool by round; the round also carries the category |
| `category` | string | Vote category (same values the `category` argument accepts) |
| `action` | string | The signed action the validators cast, e.g. `"setDynamicRiskParam"`. **This is the field that names WHAT was voted**, and it is always present |
| `asset` | uint32 \| null | Market id the vote is scoped to. `null` for a category that has no market scope |
| `coin` | string \| null | Market symbol for `asset`. `null` on the same rows |
| `status` | `"voting" \| "enacted" \| "expired"` | Lifecycle state — see [Status](#status) |
| `first_cast_at` | uint64 | Timestamp of the first cast in this row (consensus ms) |
| `last_cast_at` | uint64 | Timestamp of the most recent cast (consensus ms) |
| `enacted_at` | uint64 \| null | Enactment timestamp (consensus ms). `null` unless `status` is `"enacted"` |
| `enacted_block` | uint64 \| null | Committed block the enactment settled in. `null` unless enacted |
| `total_stake` | Decimal string | Σ stake of non-jailed validators at the time of the vote — the quorum denominator |
| `quorum_stake` | Decimal string | Stake this payload had to reach to enact (two thirds of `total_stake`) |
| `agreeing_stake` | Decimal string | Stake pooled behind this row's payload. Compare against `quorum_stake` for distance to quorum |
| `casts[*].validator` | hex address | Validator that cast |
| `casts[*].stake` | Decimal string | **The caster's stake AT THE MOMENT OF THE CAST**, not its stake today. Stake moves; a tally recomputed from present-day stake would not reproduce the enactment |
| `casts[*].cast_at` | uint64 | Cast timestamp (consensus ms) |
| `casts[*].value` | string | The voted value, decoded where the category's payload is known, else `0x`-prefixed hex |
| `changes` | array \| null | Per-field before/after of the enactment. `null` unless enacted |
| `changes[*].field` | string | Parameter field the vote moved, e.g. `"max_leverage"` |
| `changes[*].prior` | string \| null | The **effective** prior — see below. `null` only where the enacting action does not know its own prior |
| `changes[*].new` | string | The value written |

Competing payloads in one round are **separate rows**. Two validators voting
different values in the same round do not tally together, so they do not fold
together here either.

#### `prior` is the EFFECTIVE prior {#effective-prior}

`changes[*].prior` is the value a caller would have READ just before the
enactment — not the previous override row.

This distinction is the whole point of the field. The BTC vote was the FIRST
override on that market: there was no previous override, so a naive
"previous override" answer is `null` and tells the caller nothing. The effective
prior resolves the same ladder a read resolves — override ladder top rung, else
the flat override value, else the market's genesis value — so the BTC row reports
`prior: "100"`, which is the number the market actually showed.

#### Status {#status}

| `status` | Meaning |
|----------|---------|
| `enacted` | The vote reached quorum and the parameter change is committed. `enacted_at`, `enacted_block` and `changes` are present |
| `voting` | The vote is open. The most recent cast is still inside the governance vote lifetime, so more stake can still join |
| `expired` | The vote never reached quorum and its lifetime elapsed. Nothing was written. There is no on-chain expiry event — this state is derived from the last cast time |

An `expired` row is not an error and not a failure to record. It is the normal
end of a vote that did not persuade two thirds of stake.

#### Answering "who changed this market's leverage" {#worked-example}

```json
{ "type": "validator_votes", "coin": "BTC", "category": "dynamic_risk", "status": "enacted" }
```

The row answers all four parts of the question at once: `action` says what was
voted, `changes[]` says which field moved and from what to what, `enacted_at`
and `enacted_block` say when, and `casts[]` says who and with how much stake.

#### Coverage {#coverage}

Rows are served from the archive, so this read covers history, not only the live
window. The two founding leverage votes on BTC and ETH predate the read and are
backfilled, so a query over their window returns them.

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
{ "error": "gov_state is retired on the public gateway; use validator_votes (time-ranged, served from the archive)", "use": "validator_votes" }
```

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
