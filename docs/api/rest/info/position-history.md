---
description: POST /info read queries for closed position lifecycles — user_position_history and user_position_history_by_time, their completeness flags, and how to page them.
---

# `POST /info` — position history

Read queries for **closed position lifecycles**. Same `POST /info` endpoint,
envelope, and conventions as the [base page](../info.md) — these are the
lifecycle-specific `type`s.

## TL;DR {#tldr}

One row per position that was **opened and then closed**. A row folds every fill
of that life into a single record: peak size, average entry, average close,
realized PnL, fees and funding.

:::warning
**This is not a trade log.** One row covers a whole life, not one execution. For
**per-fill** rows — one record per execution, with price, size, fee and order id
— use [`user_fills`](../info.md#user_fills) and
[`user_fills`](../info.md#user_fills) with a time window. If you are porting code
that reads another exchange's per-trade history, `user_fills` is the query you
want, not this one.
:::

:::info
**An OPEN position is never returned.** A life enters this history only when it
closes. An open position is not lost — the live position is served by
[`clearinghouse_state`](../info.md#clearinghouse_state) from the node's
clearinghouse state. The two reads are complements: `clearinghouse_state` for
what you hold now, position
history for what you already closed.
:::

## Upgrade notices {#upgrade-notices}

:::caution
**This page describes the target shape. Two parts are not live yet.**

1. **The `coverage` object is being removed.** Responses today still carry a
   top-level `coverage` block (`fills_gaps`, `truncated`, `complete`). It is
   deprecated. Do not read it and do not depend on it. The reply shape is
   `{address, positions}`, matching [`user_fills`](../info.md#user_fills). The
   per-row completeness flags described below are the supported mechanism and
   they are **not** going away.
2. **`closed_sz` is served as `closed_qty` today.** The field is being renamed to
   match `max_sz` and the `sz` term used everywhere else on the wire. Until the
   rename lands, parse `closed_qty`. Accept **either** key for a release, then
   drop `closed_qty`.
:::

## Query types {#query-types}

### Closed position lifecycles, newest first {#user_position_history}

```json
{ "type": "user_position_history", "address": "0x<addr>", "limit": 100 }
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `address` | hex address | yes | Account address |
| `limit` | uint32 | no | Rows returned. Default `500`, clamped to `1 … 5000` |
| `start_time` | uint64 | no | Window start (ms, inclusive). Filters on `closed_at`. Absent ⇒ open lower bound |
| `end_time` | uint64 | no | Window end (ms, inclusive). Filters on `closed_at`. Absent ⇒ open upper bound |

:::warning
**The request field is `address`, not `user`.** Sending `user` is rejected:

```json
{
  "error": {
    "code":    "INVALID_REQUEST",
    "message": "missing field: address"
  }
}
```

An unparseable address is rejected the same way, with `INVALID_REQUEST` and a
`message` naming the address. Match on `code`; the `message` can change.
:::

There is **no per-market filter**. This read is account-scoped only; `coin` is
not an accepted argument. Filter by `coin` on the client after the read.

An account with no closed positions returns `"positions": []` with **200**, not
an error and not a `404`.

Response:

```json
{
  "data": {
    "type": "user_position_history",
    "address": "0x662971350e886a0a5631d3e9133d33f767f80611",
    "positions": [
      {
        "coin":             "SOL",
        "side":             "short",
        "max_sz":           null,
        "closed_sz":        "0.80",
        "avg_entry_px":     null,
        "avg_close_px":     "74.75000000",
        "closed_pnl":       "-0.8960000000",
        "fee_paid":         "0.020930",
        "realized_pnl":     "-0.9169300000",
        "funding_paid":     "0",
        "net_pnl":          "-0.9169300000",
        "opened_at":        1786162051867,
        "closed_at":        1786162051867,
        "open_block":       6831775,
        "close_block":      6831775,
        "entry_complete":   false,
        "close_complete":   false,
        "funding_complete": false
      }
    ]
  }
}
```

Rows are ordered **newest first** by `closed_at`.

### Closed position lifecycles in a time window {#user_position_history_by_time}

```json
{ "type": "user_position_history_by_time", "address": "0x<addr>", "start_time": 1700000000000, "end_time": 1700003600000 }
```

Same arguments and the same row shape as
[`user_position_history`](#user_position_history). One difference: rows are
ordered **oldest first**.

Both types accept the same window. The ordering is the only difference, and it
decides which rows survive a `limit` cut — see [paging](#paging).

## The window is judged at CLOSE {#window}

`start_time` and `end_time` filter on **`closed_at`**, never on `opened_at`.

A lifecycle is a point event at the moment it closes. So a position that was
**opened before the window and closed inside it IS returned** — with its true
`opened_at`, which falls outside the window you asked for. This is deliberate:
the alternative hides the exact rows a period-PnL report needs.

A position opened inside the window but **not yet closed** is absent, because it
is not closed yet. It appears once it closes, in whatever window holds its
`closed_at`.

## Paging {#paging}

`limit` caps the rows returned. Compare the row count you got against the `limit`
you asked for:

- `len(positions) < limit` ⇒ you have every row in the window.
- `len(positions) == limit` ⇒ there may be more. Rows were dropped.

**Which rows get dropped depends on the type.**
`user_position_history` keeps the **newest** and drops the oldest.
`user_position_history_by_time` keeps the **oldest** and drops the newest.

To reach the dropped rows, narrow the window with `start_time` / `end_time` and
read again, or raise `limit` (up to `5000`). Walk a long history by moving the
`closed_at` window, using the last row's `closed_at` as the next boundary.

## Row fields {#row-fields}

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Market symbol the position traded on |
| `side` | `"long"` / `"short"` | Direction of the life |
| `max_sz` | Decimal string \| null | Peak size the position reached, **base units**. `null` when `entry_complete` is `false` |
| `closed_sz` | Decimal string | Size closed over the life, **base units**. Served as `closed_qty` until the rename lands — see [upgrade notices](#upgrade-notices) |
| `avg_entry_px` | Decimal string \| null | Size-weighted average entry price, **decimal USDC**. `null` when `entry_complete` is `false` |
| `avg_close_px` | Decimal string \| null | Size-weighted average close price, **decimal USDC** |
| `closed_pnl` | Decimal string | Realized PnL before fees, **decimal USDC** (signed). The chain's own lot-matched number — see [the warning below](#closed-pnl) |
| `fee_paid` | Decimal string | Total trading fees over the life, **decimal USDC** |
| `realized_pnl` | Decimal string | `closed_pnl − fee_paid`, **decimal USDC** (signed) |
| `funding_paid` | Decimal string | Net funding over the life, **decimal USDC** (signed). `"0"` means UNKNOWN when `funding_complete` is `false` |
| `net_pnl` | Decimal string | `realized_pnl + funding_paid`, **decimal USDC** (signed) |
| `opened_at` | uint64 | Open timestamp (consensus ms) |
| `closed_at` | uint64 | Close timestamp (consensus ms). The field the window filters on |
| `open_block` | uint64 | Committed block height of the first fill observed for this life |
| `close_block` | uint64 | Committed block height the life closed at |
| `entry_complete` | bool | `false` ⇒ the opening fill was never observed; entry-side numbers are withheld |
| `close_complete` | bool | `false` ⇒ close-side numbers are floors, not totals |
| `funding_complete` | bool | `false` ⇒ `funding_paid` is UNKNOWN and `net_pnl` excludes funding |

### The two identities {#identities}

```
realized_pnl = closed_pnl − fee_paid
net_pnl      = realized_pnl + funding_paid
```

Both are computed server-side from the fields beside them, so the numbers in one
row always agree with each other.

### `closed_pnl` is lot-matched {#closed-pnl}

:::warning
**Do not recompute `closed_pnl` from the average prices.** It is **not**
`(avg_close_px − avg_entry_px) × closed_sz`, and checking it that way produces
false mismatches.

`closed_pnl` is the chain's own number, matched lot by lot as each closing fill
consumed specific opening lots. The two averages are summaries of the same life;
they lose the lot pairing, so the product of the averages does not reproduce the
matched result. Trust `closed_pnl`; use the averages for display.
:::

## The three honesty flags {#honesty-flags}

`entry_complete`, `close_complete` and `funding_complete` say whether the numbers
beside them are trustworthy. They are per row. A row with a `false` flag is
**degraded, not wrong** — the fields that could be misleading come back `null`
rather than carrying a partial average as if it were whole.

Read the flag before you read the number.

### `entry_complete` {#entry-complete}

`false` when the **opening fill was never observed**. Three causes: the open sits
below the history retention floor, the open happened before a restart of the
history service, or the open sits inside a recorded archive gap.

When it is `false`, **`max_sz` and `avg_entry_px` are `null`**. An average over
part of a life is worse than no average, so no number is served instead of a
plausible wrong one. `null` here means "not known", never "zero".

### `close_complete` {#close-complete}

`false` in two situations.

1. The leg went flat with **no closing fill observed**, so the close was
   reconstructed from the newest fill that was seen.
2. **Whenever `entry_complete` is `false`.** The same cut that hid the open can
   hide a close, so no close-side number can claim to be whole over a known loss.

When it is `false`, treat `closed_sz`, `closed_pnl` and `fee_paid` as **floors** —
at least this much, possibly more.

### `funding_complete` {#funding-complete}

`false` when the funding total cannot be trusted. **`funding_paid` is then `"0"`
meaning UNKNOWN — not "no funding was paid"**, and `net_pnl` equals
`realized_pnl` because it excludes funding entirely.

Either boundary flag reading `false` shortens the span the funding total sums
over, so it clears `funding_complete` too.

A `false` `funding_complete` is common and does **not** imply a data fault: the
funding stream lags the fill stream in normal operation, so a recently closed
position often has funding still catching up.

**Whether it can heal depends on the boundary flags.**

- `entry_complete` and `close_complete` both `true` ⇒ this is the lag case.
  Re-read the row later and `funding_complete` will turn `true`.
- Either boundary flag `false` ⇒ **`funding_complete` never turns `true`.** The
  boundary loss shortens the span the total sums over, so the funding figure
  stays UNKNOWN permanently. Do not poll such a row waiting for it.

## A restart leaves a permanent mark {#restart-mark}

:::warning
**A position that was open across a restart of the history service yields a
degraded row, forever.**

Open positions are accumulated **in memory**. On a restart that memory is gone.
When the fills resume, the service sees a position that is already non-zero and
cannot know where it started, so it opens a fresh accumulation at the first fill
it observes and marks `entry_complete: false`.

The consequences, all permanent — the row never heals, because the fills that
would fix it are already behind the read:

- `entry_complete` is `false`, and so `close_complete` is too.
- `funding_complete` is `false` as well, because a broken boundary shortens the
  span funding sums over. `funding_paid` stays `"0"` meaning UNKNOWN and
  `net_pnl` excludes funding **for good** on this row. Do not poll it waiting
  for the flag to clear — it will not.
- `max_sz` and `avg_entry_px` are `null`.
- `open_block` and `opened_at` reflect the **first fill observed after the
  restart**, not the true open. When a single fill both starts the accumulation
  and closes the position, `open_block == close_block` and
  `opened_at == closed_at` — the row appears to have opened and closed in one
  block.

The example row [above](#user_position_history) is exactly this case: equal
blocks, equal timestamps, both entry fields `null`.

**This is expected behaviour, not a bug.** A `null` entry price on such a row is
the system reporting honestly that it cannot know the entry.

What you can still use: `avg_close_px`, `closed_pnl`, `fee_paid` and `closed_sz`
all come from real observed fills. Read them as **floors** covering the part of
the life that was seen, not as whole-life totals.
:::

## See also {#see-also}

- [`user_fills`](../info.md#user_fills) — per-fill history, one row per execution
- [`account_state`](../info.md#account_state) — live margin health and balances
- [`clearinghouse_state`](../info.md#clearinghouse_state) — live perp positions
- [`POST /info` base page](../info.md) — envelope and shared conventions
