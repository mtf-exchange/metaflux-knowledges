---
description: "No change waits for the next node release. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

This page lists what waits for the next node release and which wire rows are unverified.

:::caution
No change on this page waits for the next node release. Every section it staged for node 0.9.16 is in effect, and each one moved to [block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the same window. The action byte cap and the per-leg `batch_cancel` reply took effect at [block 17,113,494](./block-17113494.md). The rules staged for the releases after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

This page now waits for a measurement. The row below is in the shipped code, but nobody has read it on the running chain. The row says what settles it.

The page also keeps [five corrections](#corrections) to this reference. They are not chain changes.
:::

## Archive candles state their size plane {#archive-candle-plane}

Status: unverified on the running chain.

The candle archive records the size plane that each trade bar was folded on. The [`candle`](../api/rest/info/perpetuals.md#candle_snapshot) read divides the volume of the bar by that plane. For a bar that states no plane, it falls back to the current precision of the market. The gateway half is active. See [block 11,550,001](./block-11550001.md#read-side). The archive half ships separately, and the date it took effect is not confirmed.

Bars folded before the archive recorded the plane state none. A backfill to stamp them has not run.

The fallback is exact until the first governance raise of the precision of a market. After a raise, a bar with no stated plane reads `10^Δ` too small.

To settle it, read back from the store an archive bar that states its plane, and run the backfill.

Until then, treat the archive trade-bar volume from before a raise on that market as unconfirmed.

## Five corrections to this reference {#corrections}

None of these is a change to the chain. The reference was wrong and the code was right.

- [`top_up_isolated_only_margin`](../api/rest/exchange/margin-risk.md#top_up_isolated_only_margin) accepts a plain isolated position, not only a strict-isolated one.
- [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot-volume-join) serves real trade volume in `v`, `q` and `n` on a `mark` or `oracle` bar. They are not `"0"`, and `n` is not a sample count.
- [`node_gov`](../nodes/data-streams.md#node_gov) `action` is the protocol action name with a capital first letter, such as `"SetDynamicRiskParam"`. The example showed `"setDynamicRiskParam"`.
- WS [`l2_book`](../api/ws/subscriptions.md#l2_book) and `bbo` on a spot pair carry the time of the newest print on the pair in `time`. The reference said that a spot book always reads `time: 0`.
- [`order_status`](../api/rest/info/orders-fills.md#order_status) serves `fills` newest first. The reference said oldest first.
