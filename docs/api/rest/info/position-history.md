---
description: POST /info reads for closed position lifecycles. It covers user_position_history and user_position_history_by_time, their completeness flags, and how to page them.
---

# Position history reads {#post-info--position-history}

These reads return the closed position lifecycles of an account.

They use the same `POST /info` endpoint, envelope and conventions as the
[base page](../info.md). This page lists the lifecycle `type`s.

## Summary {#tldr}

There is one row for each position that was opened and then closed. A row
folds every fill of that life into one record: peak size, average entry,
average close, realized PnL, fees and funding.

:::warning
**This is not a trade log.** One row covers a whole life, not one execution.
For one record for each execution, with price, size, fee and order id, use
[`user_fills`](./orders-fills.md#user_fills) and
[`user_fills`](./orders-fills.md#user_fills) with a time window. If you port
code that reads the per-trade history of a different exchange, use
`user_fills`, not this read.
:::

:::info
**An open position is never returned.** A life enters this history only when
it closes. An open position is not lost.
[`clearinghouse_state`](./account.md#clearinghouse_state) serves the current
position from the clearinghouse state of the node. The two reads complete each
other: `clearinghouse_state` for what you hold now, and position history for
what you already closed.
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
| `start_time` | uint64 | no | Window start (ms, inclusive). Filters on `closed_at`. If absent, the lower bound is open |
| `end_time` | uint64 | no | Window end (ms, inclusive). Filters on `closed_at`. If absent, the upper bound is open |

:::warning
**The request field is `address`, not `user`.** A request with `user` gets
`400`:

```json
{ "error": "missing field: address" }
```

An address that cannot be parsed gets the same rejection, which names the
value:

```json
{ "error": "invalid user address: nothex" }
```

**These two reads answer a validation error as a bare string.** `error` holds
the message directly. There is **no** `error.code` key and no `error.message`
key. Every other `/info` read answers `{"error":{"code":…,
"message":…}}`. A client that reads `error.code` gets `undefined` here, and can
report the rejection as a success. Handle a string `error` before you index
into it.
:::

There is no filter for each market. This read is scoped to the account only.
`coin` is not an accepted argument. Filter by `coin` on the client after the
read.

An account with no closed positions returns `"positions": []` with `200`. It is
not an error and not a `404`.

Response:

:::warning
**`type` is on the envelope here, not inside `data`.** Both position-history
reads answer `{"type": …, "data": {"address", "positions"}}`. Every other
`/info` read puts `type` inside `data`. A client that reads `data.type` to
route the reply gets `undefined` on these two. Read the outer `type`.
:::

```json
{
  "type": "user_position_history",
  "data": {
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

Rows are in newest-first order by `closed_at`.

### Closed position lifecycles in a time window {#user_position_history_by_time}

```json
{ "type": "user_position_history_by_time", "address": "0x<addr>", "start_time": 1700000000000, "end_time": 1700003600000 }
```

This read has the same arguments and the same row shape as
[`user_position_history`](#user_position_history). There is one difference:
rows are in oldest-first order.

Both types accept the same window. The order is the only difference, and it
decides which rows stay after a `limit` cut. See [paging](#paging).

## Window filter {#window}

`start_time` and `end_time` filter on `closed_at`, never on `opened_at`.

A lifecycle is a point event at the time it closes. A position that was opened
before the window and closed inside it is therefore returned. It has its true
`opened_at`, which is outside the window that you asked for. This is
deliberate. The alternative hides the rows that a period-PnL report needs.

A position opened inside the window but not closed yet is absent, because it is
not closed. It appears when it closes, in the window that holds its
`closed_at`.

## Paging {#paging}

`limit` caps the rows returned. Compare the row count that you got with the
`limit` that you asked for:

- If `len(positions) < limit`, you have every row in the window.
- If `len(positions) == limit`, there can be more. Rows were dropped.

**The type decides which rows are dropped.**
`user_position_history` keeps the newest rows and drops the oldest.
`user_position_history_by_time` keeps the oldest rows and drops the newest.

To get the dropped rows, narrow the window with `start_time` and `end_time` and
read again, or increase `limit` (up to `5000`). To walk a long history, move
the `closed_at` window. Use the `closed_at` of the last row as the next
boundary.

## Row fields {#row-fields}

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | The market symbol that the position traded on |
| `side` | `"long"` / `"short"` | Direction of the life |
| `max_sz` | Decimal string \| null | Peak size that the position reached, in **base units**. `null` when `entry_complete` is `false` |
| `closed_sz` | Decimal string | Size closed over the life, in **base units**. The field was once `closed_qty`. That name is gone |
| `avg_entry_px` | Decimal string \| null | Size-weighted average entry price, in **decimal USDC**. `null` when `entry_complete` is `false` |
| `avg_close_px` | Decimal string \| null | Size-weighted average close price, in **decimal USDC** |
| `closed_pnl` | Decimal string | Realized PnL before fees, in **decimal USDC** (signed). The lot-matched number of the chain. See [the warning below](#closed-pnl) |
| `fee_paid` | Decimal string | Total trading fees over the life, in **decimal USDC** |
| `realized_pnl` | Decimal string | `closed_pnl − fee_paid`, in **decimal USDC** (signed) |
| `funding_paid` | Decimal string | Net funding over the life, in **decimal USDC** (signed). `"0"` means unknown when `funding_complete` is `false` |
| `net_pnl` | Decimal string | `realized_pnl + funding_paid`, in **decimal USDC** (signed) |
| `opened_at` | uint64 | Open timestamp (consensus ms) |
| `closed_at` | uint64 | Close timestamp (consensus ms). The window filters on this field |
| `open_block` | uint64 | The committed block height of the first fill observed for this life |
| `close_block` | uint64 | The committed block height at which the life closed |
| `entry_complete` | bool | `false` means that the opening fill was never observed. The read withholds the entry-side numbers |
| `close_complete` | bool | `false` means that the close-side numbers are floors, not totals |
| `funding_complete` | bool | `false` means that `funding_paid` is unknown and `net_pnl` excludes funding |

### Identities {#identities}

```
realized_pnl = closed_pnl − fee_paid
net_pnl      = realized_pnl + funding_paid
```

The server computes both from the fields next to them, so the numbers in one
row always agree.

### Lot-matched `closed_pnl` {#closed-pnl}

:::warning
**Do not calculate `closed_pnl` again from the average prices.** It is **not**
`(avg_close_px − avg_entry_px) × closed_sz`. A check of that kind produces
false mismatches.

`closed_pnl` is the number of the chain. The chain matches it lot by lot, as
each closing fill consumes specific opening lots. The two averages summarize the
same life. They lose the lot pairing, so the product of the averages does not
give the matched result. Trust `closed_pnl`. Use the averages for display.
:::

## Completeness flags {#honesty-flags}

`entry_complete`, `close_complete` and `funding_complete` say if the numbers
next to them are trustworthy. Each row has its own flags. A row with a `false`
flag is degraded, not wrong. The fields that could mislead come back `null`.
The read does not return a partial average as if it were complete.

Read the flag before you read the number.

### `entry_complete` {#entry-complete}

It is `false` when the opening fill was never observed. There are three causes:
the open is below the history retention floor, the open happened before a
restart of the history service, or the open is inside a recorded archive gap.

When it is `false`, **`max_sz` and `avg_entry_px` are `null`**. An average over
part of a life is worse than no average. The read serves no number instead of
a plausible wrong one. `null` here means "not known", never "zero".

### `close_complete` {#close-complete}

It is `false` in two cases:

1. The leg went flat with no closing fill observed. The close was rebuilt from
   the newest fill that was seen.
2. `entry_complete` is `false`. The same cut that hid the open can hide a
   close, so no close-side number can claim to be complete over a known loss.

When it is `false`, treat `closed_sz`, `closed_pnl` and `fee_paid` as floors:
at least this much, and possibly more.

### `funding_complete` {#funding-complete}

It is `false` when the funding total cannot be trusted. **`funding_paid` is
then `"0"` with the meaning unknown, not "no funding was paid".** `net_pnl`
equals `realized_pnl`, because it excludes funding fully.

If either boundary flag reads `false`, the span that the funding total sums
over is shorter. That also clears `funding_complete`.

A `false` `funding_complete` is common, and it does not mean a data fault. The
funding stream lags the fill stream in normal operation. The funding of a
recently closed position is often still catching up.

**The boundary flags decide if it can recover.**

- If `entry_complete` and `close_complete` are both `true`, this is the lag
  case. Read the row again later, and `funding_complete` becomes `true`.
- If either boundary flag is `false`, **`funding_complete` never becomes
  `true`.** The boundary loss shortens the span that the total sums over, so the
  funding figure stays unknown permanently. Do not poll such a row for it.

## Effect of a restart {#restart-mark}

:::warning
**A position that was open across a restart of the history service gives a
degraded row permanently.**

The service accumulates open positions in memory. A restart loses that memory.
When the fills resume, the service sees a position that is already non-zero and
cannot know where it started. It starts a new accumulation at the first fill
that it observes, and marks `entry_complete: false`.

All the results are permanent. The row never recovers, because the fills that
would fix it are already behind the read:

- `entry_complete` is `false`, so `close_complete` is also `false`.
- `funding_complete` is also `false`, because a broken boundary shortens the
  span that funding sums over. `funding_paid` stays `"0"` with the meaning
  unknown, and `net_pnl` excludes funding permanently on this row. Do not poll
  it for the flag to clear. It will not clear.
- `max_sz` and `avg_entry_px` are `null`.
- `open_block` and `opened_at` show the first fill observed after the restart,
  not the true open. When one fill both starts the accumulation and closes the
  position, `open_block == close_block` and `opened_at == closed_at`. The row
  seems to open and close in one block.

The example row [above](#user_position_history) is this case: equal blocks,
equal timestamps, and both entry fields `null`.

**This is expected behaviour, not a bug.** A `null` entry price on such a row
is the system correctly reporting that it cannot know the entry.

You can still use `avg_close_px`, `closed_pnl`, `fee_paid` and `closed_sz`.
They all come from real observed fills. Read them as floors that cover the
observed part of the life, not as totals for the whole life.
:::

## See also {#see-also}

- [`user_fills`](./orders-fills.md#user_fills): fill history, one row for each execution
- [`account_state`](./account.md#account_state): current margin health and balances
- [`clearinghouse_state`](./account.md#clearinghouse_state): current perp positions
- [`POST /info` base page](../info.md): the envelope and shared conventions
