---
description: "One change waits for the next node release: a deployer market past its refresh window trades in an off-session discovery band instead of turning reduce-only. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

This page lists what waits for the next node release and which wire rows are unverified.

:::caution
One change on this page waits for the next node release: the
[off-session discovery band](#discovery-band) on deployer markets. Node 0.9.18 took effect at
[block 44,478,893](./block-44478893.md). Signed faucet claims and the fixed faucet grant are in effect, and they moved to [block 34,135,466](./block-34135466.md). Every section the page staged for node 0.9.16 is in effect, and each one moved to [block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the same window. The action byte cap and the per-leg `batch_cancel` reply took effect at [block 17,113,494](./block-17113494.md). The rules staged for the releases after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

The [archive candle row](#archive-candle-plane) waits for a measurement. It is in the shipped code, but nobody has read it on the running chain. The row says what settles it.

The page also keeps [five corrections](#corrections) to this reference. They are not chain changes.
:::

## Off-session discovery band on deployer markets {#discovery-band}

Status: in the code, not on the running chain.

A deployer market whose push feed has aged past its refresh window (`mip3_stale_mark_ms`, default
60,000 ms) no longer turns reduce-only. It trades in a discovery band around the last push.

| Case | Today | Next release |
|---|---|---|
| An order that opens or extends a position on a deployer market past its refresh window | refused, `PRECONDITION_FAILED`: `deployer oracle stale: market is reduce-only` | admitted under the standing rules: isolated margin |
| The mark of such a market | the last push, frozen | the impact mid of the book at the market's funding impact notional, clamped into `reference × (1 ± band)`. The reference is the last push; the band is the narrower of the push move band `min(10 %, 1/(2L))` and the risk oracle band (5 % unless voted). A book too thin to fill the impact notional on both sides keeps the reference, so one touch quote cannot move the mark |
| A batch auction on such a market | parked until a fresh push | crosses on the indicative mark |
| Liquidation on such a market | deferred | runs on the indicative mark, so no position is liquidated further than one band from the reference |
| Funding on such a market | the premium sample is omitted | unchanged: the premium sample stays omitted while the feed is off-session. The interest term still accrues |
| [`markets`](../api/rest/info/perpetuals.md#markets) `px_stale` on a deployer market | `true` past the window | absent: the market always has a mark |

The first push after the session reopens becomes the mark again, through the same band: the move
band already bounds how far one push may move the price.

The reason is in [MIP-3](../mip/mip-3.md#oracle): an underlying with venue hours should not halt
its perp. The band keeps the discovery honest: the book cannot carry the mark more than one band
from the last official price.

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
