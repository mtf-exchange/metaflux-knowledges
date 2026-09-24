---
description: One change that waits for the next node release — order_status answers for a batch_cancel leg — one wire row that is not verified on the running chain, and two corrections to this reference.
---

# Next release and unverified wire rows

:::caution
**One section waits for the next node release:**
[`order_status` for a `batch_cancel` leg](#batch-cancel-status). The action byte
cap and the per-leg `batch_cancel` reply went live at
[block 17,113,494](./block-17113494.md).

Every other rule this page staged for the releases after 0.9.7 is live, and each
one moved to [block 11,550,001](./block-11550001.md). The node rules turned on at
that height. The gateway rows are on the same page, and they shipped with gateway
0.9.8.

**What this page waits for is a MEASUREMENT.** The row below is in the shipped
code, but nobody has yet read it on the running chain. It says what would settle
it.

The rejected-leg `error` level is settled: a live `batch_cancel` reply read on
2026-09-23 carries `statuses[i].error` as the flat `{code, message}` object.

The page also keeps [two corrections](#corrections) to this reference. They are
not chain changes.
:::

## `order_status` answers for a `batch_cancel` leg {#batch-cancel-status}

**NOT LIVE YET.** This change ships with the next node release.

| Surface | A live node | From the next release |
|---|---|---|
| [`order_status`](../api/rest/info/orders-fills.md) for an order a `batch_cancel` leg removed | `unknown` | `canceled` |

**Why.** A `batch_cancel` carries a verdict per leg, so the node can prove which
legs removed an order. It records only those. A refused leg leaves the order's
earlier terminal state untouched.

**What to do.** Nothing. Until the release, read a leg's outcome from the
`batch_cancel` reply or from `order_updates`.

## Archive candles state their size plane {#archive-candle-plane}

**Unverified on the running chain.**

The candle archive records the size plane each trade bar was folded on. The
[`candle`](../api/rest/info/perpetuals.md#candle_snapshot) read divides the bar's
volume by that plane, and falls back to the market's current precision for a bar
that states none. The gateway half is live — see
[block 11,550,001](./block-11550001.md#read-side). The archive half ships
separately, and the date it went live is not confirmed.

Bars folded before the archive recorded the plane state none. A backfill to
stamp them has not run.

**Why it matters only after a raise.** The fallback is exact until the first
governance raise of a market's precision. After a raise, a bar with no stated
plane reads `10^Δ` too small.

**What settles it:** an archive bar that states its plane, read back from the
store, and the backfill run.

**Until then:** treat archive trade-bar volume from before a raise on that market
as unconfirmed.

## Two corrections to this reference {#corrections}

Neither is a change to the chain. The reference was wrong and the code was right.

- [`top_up_isolated_only_margin`](../api/rest/exchange/margin-risk.md#top_up_isolated_only_margin)
  accepts a PLAIN isolated position, not strict-isolated only.
- [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot-volume-join)
  serves real trade volume in `v`, `q` and `n` on a `mark` or `oracle` bar. They
  are not `"0"`, and `n` is not a sample count.
