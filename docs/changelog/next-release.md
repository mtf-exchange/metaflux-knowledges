---
description: "No change waits for the next node release. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

:::caution
**No change on this page waits for the next node release.** Every section it
staged for node 0.9.16 is live, and each one moved to
[block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the
same window. The action byte cap and the per-leg `batch_cancel` reply went live
at [block 17,113,494](./block-17113494.md). The rules staged for the releases
after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

**What this page waits for is a MEASUREMENT.** The row below is in the shipped
code, but nobody has yet read it on the running chain. It says what would settle
it.

The page also keeps [five corrections](#corrections) to this reference. They are
not chain changes.
:::

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

## Five corrections to this reference {#corrections}

None is a change to the chain. The reference was wrong and the code was right.

- [`top_up_isolated_only_margin`](../api/rest/exchange/margin-risk.md#top_up_isolated_only_margin)
  accepts a PLAIN isolated position, not strict-isolated only.
- [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot-volume-join)
  serves real trade volume in `v`, `q` and `n` on a `mark` or `oracle` bar. They
  are not `"0"`, and `n` is not a sample count.
- [`node_gov`](../nodes/data-streams.md#node_gov) `action` is the protocol
  action name with a capital first letter, such as `"SetDynamicRiskParam"`. The
  example showed `"setDynamicRiskParam"`.
- WS [`l2_book`](../api/ws/subscriptions.md#l2_book) and `bbo` on a spot pair
  carry the time of the newest print on the pair in `time`. The reference said
  a spot book always reads `time: 0`.
- [`order_status`](../api/rest/info/orders-fills.md#order_status) serves
  `fills` newest first. The reference said oldest first.
