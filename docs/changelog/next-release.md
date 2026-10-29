---
description: "What waits for the next node release: negative equity is backstopped on dust legs and refused new exposure. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

This page lists what waits for the next node release and which wire rows are unverified.

:::caution
One change on this page waits for the next node release: [negative equity](#negative-equity). It is in the shipped code and not on the running chain. Node 0.9.19 took effect at
[block 44,563,346](./block-44563346.md) and node 0.9.18 at
[block 44,478,893](./block-44478893.md). Signed faucet claims and the fixed faucet grant are in effect, and they moved to [block 34,135,466](./block-34135466.md). Every section the page staged for node 0.9.16 is in effect, and each one moved to [block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the same window. The action byte cap and the per-leg `batch_cancel` reply took effect at [block 17,113,494](./block-17113494.md). The rules staged for the releases after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

The [archive candle row](#archive-candle-plane) waits for a measurement. It is in the shipped code, but nobody has read it on the running chain. The row says what settles it.

The page also keeps [five corrections](#corrections) to this reference. They are not chain changes.
:::

## Negative equity is backstopped and refused new exposure {#negative-equity}

Status: in the shipped code, not on the running chain.

The running node reads an account under water on a dust position as safe, and lets it add to that
position. Measured on chain 114514: a wallet at negative equity added to one position 628 times in
four weeks, and four wallets sit at negative equity with no position.

| Case | Before the height | After |
|---|---|---|
| An order that opens or extends a position when free collateral is negative, and the whole-USDC initial-margin increase rounds to zero | admitted | refused, `MARGIN_INSUFFICIENT`. See [the pre-trade gate](../concepts/margin-modes.md#initial-margin-pre-trade-gate) |
| An account with negative `account_value` whose maintenance margin rounds to zero | idle, [`tier`](../api/rest/info/account.md#account_state) `"Safe"` | backstopped, `tier` `"T3"`. See [tiered liquidation](../concepts/tiered-liquidation.md#how-tiers-are-computed) |
| The maintenance margin of an account with several cross positions | each position floored to whole USDC, then summed | summed, then floored once. It can read up to one USDC per position higher |
| An account with negative `account_value` and no position | the deficit stays on the account | the deficit moves to the insurance fund, then to the treasury queue, and `account_value` reads `0`. No winner is haircut for it |
| A cross spot-margin position on an account with negative `account_value` | liquidated only when the maintenance margin is not zero | liquidated |
| The maintenance line of an isolated position | priced on its entry notional | priced on the greater of its entry notional and its notional at the mark, as a cross position is |

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
