---
description: "Two changes wait for the next node release: a stalled validator oracle keeps the mark, and spot tokens stay in an account at negative equity. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

This page lists what waits for the next node release and which wire rows are unverified.

:::caution
Two changes on this page wait for the next node release: [a stalled oracle keeps the mark](#stale-oracle-mark) and [spot tokens stay at negative equity](#negative-equity-spot). Both are in the shipped code and not on the running chain. Node 0.9.20 took effect at
[block 45,207,953](./block-45207953.md), node 0.9.19 at
[block 44,563,346](./block-44563346.md) and node 0.9.18 at
[block 44,478,893](./block-44478893.md). Signed faucet claims and the fixed faucet grant are in effect, and they moved to [block 34,135,466](./block-34135466.md). Every section the page staged for node 0.9.16 is in effect, and each one moved to [block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the same window. The action byte cap and the per-leg `batch_cancel` reply took effect at [block 17,113,494](./block-17113494.md). The rules staged for the releases after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

The [archive candle row](#archive-candle-plane) waits for a measurement. It is in the shipped code, but nobody has read it on the running chain. The row says what settles it.

The page also keeps [five corrections](#corrections) to this reference. They are not chain changes.
:::

## A stalled validator oracle keeps the mark {#stale-oracle-mark}

Status: in the shipped code, not on the running chain.

The running node treats a core market whose validator oracle is older than the staleness window
(60 s unless voted) as a market with no price: liquidation, ADL, triggers and the health check wait,
and one such position holds the whole account's liquidation back on every market. That is the
posture of an oracle-only venue. MetaFlux has a book, so it follows Hyperliquid: the oracle
component freezes at its last value and the mark keeps pricing.

| Case | Before the height | After |
|---|---|---|
| The risk mark of a core market whose validator oracle is stale | absent: liquidation, ADL, TP/SL triggers and TWAP slices wait | the committed mark, clamped into `last oracle × (1 ± band)` (5 % unless voted). Everything that reads the mark runs |
| An account with one position on such a market | the whole account's liquidation waits, on every market | judged as a whole, on that clamped mark |
| [`account_state`](../api/rest/info/account.md#account_state) `health_deferred` | present while any position is on a stale market | present only while a position is on a stale **self-priced** market, or on a market with no oracle at all |
| A self-priced market (MTF) whose index is stale | reduce-only; liquidation waits | unchanged. Its index is its own book, so a band around it protects nothing |
| A delisting with no voted price on a stale market | refused | unchanged: a settlement closes every position for good, so it still waits for a fresh index or a voted price |
| The funding premium sample on a stale market | omitted | unchanged. The interest term still accrues |

## Spot tokens stay in an account at negative equity {#negative-equity-spot}

Status: in the shipped code, not on the running chain.

Every exit that moves a spot token out of an account is refused while the account's equity, after
the losses it has not realized yet, is negative. The tokens are what the waterfall can still reach
once the account is flat. A fully margined account with positive equity is not affected: held
initial margin does not count.

| Action | Refusal |
|---|---|
| [`send_asset`](../api/rest/exchange/transfers.md#send_asset) (any token, either direction), [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer), [`send_to_evm_with_data`](../api/rest/exchange/transfers.md#send_to_evm_with_data), the legacy `withdraw3`, [`sub_account_spot_transfer`](../api/rest/exchange/account.md#sub_account_spot_transfer), an Earn deposit of a non-USDC token, a staking delegation | `PRECONDITION_FAILED`: `negative cross account value: spot tokens stay` |

Equity here is `cross_account_value` plus the loss side of unrealized PnL and of pending funding,
with no gain counted: the same figure as free collateral before held initial margin comes off.
An Earn deposit and a staking delegation keep the owner's title, but the liquidation waterfall reads only the spot ledger, so they are gated too. [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) moves USDC only and keeps its free-collateral refusal.

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
