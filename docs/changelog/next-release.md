---
description: "Three backstop funding rules wait for the next node release. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

This page lists what waits for the next node release and which wire rows are unverified.

:::caution
Three [backstop funding rules](#backstop-funding) wait for the next node release. Node 0.9.21 took effect at
[block 45,811,287](./block-45811287.md), node 0.9.20 at
[block 45,207,953](./block-45207953.md), node 0.9.19 at
[block 44,563,346](./block-44563346.md) and node 0.9.18 at
[block 44,478,893](./block-44478893.md). Signed faucet claims and the fixed faucet grant are in effect, and they moved to [block 34,135,466](./block-34135466.md). Every section the page staged for node 0.9.16 is in effect, and each one moved to [block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the same window. The action byte cap and the per-leg `batch_cancel` reply took effect at [block 17,113,494](./block-17113494.md). The rules staged for the releases after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

The [archive candle row](#archive-candle-plane) waits for a measurement. It is in the shipped code, but nobody has read it on the running chain. The row says what settles it.

The page also keeps [five corrections](#corrections) to this reference. They are not chain changes.
:::

## Backstop funding {#backstop-funding}

Status: not in effect. These rules are in the code and wait for the next node release.

Three rules change how the [deficit waterfall](../concepts/tiered-liquidation.md#t4--the-deficit-waterfall) is funded. None changes an `/info` or `/exchange` field.

- **The treasury share pays queued debt as fees accrue.** On every protocol-fee split, the [~10% treasury share](../concepts/fees.md#where-fees-go) pays the debt queued on native markets, lowest market id first, until the share is spent. Today that debt waits for a multisig treasury draw. A debt on a builder-deployed market stays its own and is never paid from the share.
- **A liquidation fee pays down queued debt at once.** When a forced close credits the insurance fund of a market, the fund pays any debt queued on that same market before it holds the rest. Today the fund holds the fee and the debt waits for a treasury draw. The fund of one market never pays the debt of another market. The [capacity cap](../api/rest/info/perpetuals.md#oi-cap-capacity) of the market falls by the amount paid, because it is sized from the fund.
- **A reserve top-up pays from the treasury share.** The system operations that add to the insurance fund or to the treasury reserve pay from the [~10% treasury share](../concepts/fees.md#where-fees-go) of protocol fees. A top-up larger than that share is refused. Today a top-up adds to a reserve and takes the value from nowhere. A top-up is accepted only on the USDC token or on a native perp market, because those are the pools that hold USDC.

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
