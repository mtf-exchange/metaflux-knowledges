---
description: Two wire rows that are not verified on the running chain — the rejected-leg error level and the size plane on archive candles — and two corrections to this reference. Nothing on this page waits for a node release.
---

# Unverified wire rows

:::caution
**Nothing on this page waits for a node release.** Every rule this page staged
for the releases after 0.9.7 is live, and each one moved to
[block 11,550,001](./block-11550001.md). The node rules turned on at that height.
The gateway rows are on the same page, and they shipped with gateway 0.9.8.

**What this page waits for is a MEASUREMENT.** Two rows below are in the shipped
code, but nobody has yet read them on the running chain. Each row says what would
settle it. Until then, code to BOTH shapes it names.

The page also keeps [two corrections](#corrections) to this reference. They are
not chain changes.
:::

## A rejected leg's `error` loses a level {#leg-error}

**Unverified on the running chain.**

From block 11,550,001 the code writes `statuses[i].error` AS the
`{code, message, details?}` object. Before that height a node wrapped it once
more, so a caller read `statuses[i].error.error.code`. The reference has always
documented the flat shape, and both client SDKs type it.

**What settles it:** a signed action with one leg that the commit refuses, read
from the public endpoint.

**Until then:** read `error.code`, and fall back to `error.error.code` when the
first is absent.

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
