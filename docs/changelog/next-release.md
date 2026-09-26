---
description: Four changes that wait for the next node release — order_status answers for a batch_cancel leg, contractAddress on a deployment receipt, mtfStatus for two transactions at one nonce, and an open-interest cap on every perp market — one wire row that is not verified on the running chain, and two corrections to this reference.
---

# Next release and unverified wire rows

:::caution
**Four sections wait for the next node release:**
[`order_status` for a `batch_cancel` leg](#batch-cancel-status),
[`contractAddress` on a deployment receipt](#contract-address),
[`mtfStatus` for two transactions at one nonce](#same-nonce-status) and
[an open-interest cap on every perp market](#oi-cap-capacity). The action byte
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

## `contractAddress` on a deployment receipt {#contract-address}

**NOT LIVE YET.** This change ships with the next node release.

| Surface | A live node | From the next release |
|---|---|---|
| [`eth_getTransactionReceipt`](../evm/index.md#contract-address) `contractAddress` for a successful deployment | `null` | the address of the deployed contract |

**Why.** The node derives the address from the sender and the nonce when it
stores the receipt of a successful deployment. A call, a failed deployment and
a receipt stored before the release keep `null`. There is no backfill.

**What to do.** Nothing. Until the release, and for an older receipt, compute
the address locally from the sender and the nonce.

## `mtfStatus` for two transactions at one nonce {#same-nonce-status}

**NOT LIVE YET.** This change ships with the next node release.

One EVM block can hold two transactions from one sender at the same nonce. When
the node refuses the first before it runs (for example `insufficient_funds`),
the nonce stays free, and the second transaction runs.

| Surface | A live node | From the next release |
|---|---|---|
| [`mtfStatus`](../evm/index.md#mtf-status) and `status` of the second transaction | `bad_nonce`, `0x0` | what really happened to it, for example `success`, `0x1` |

**Why.** The live node counts the refused transaction as if it used the nonce.

**What to do.** Nothing. Until the release, a `bad_nonce` receipt next to a
refused transaction at the same nonce can be wrong. Read the sender's nonce or
the contract code to confirm.

## An open-interest cap on every perp market {#oi-cap-capacity}

**NOT LIVE YET.** This change ships with the next node release, after
2026-10-01.

| Surface | A live node | From the next release |
|---|---|---|
| [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `oi_cap` | present only on a market with a governance-set cap. No market has one, so every market is uncapped | present on every perp market: the lower of the governance-set cap and the capacity cap |
| `markets_meta` `oi_cap_usd` and `oi_cap_bound` | absent | present with `oi_cap` |
| `markets_meta` `max_market_order_ntl` and [`active_asset_data`](../api/rest/info/perpetuals.md#active_asset_data) `max_trade_size` | `null` on every market | a number on every market that has a mark |

**Why.** A liquidation can leave a deficit, and the protocol pays it from the
insurance fund and its other backstops. With no cap, open interest has no bound
against that money. The chain now derives a cap from what the backstops can
pay, and it recomputes the cap every block. See
[how the capacity cap works](../api/rest/info/perpetuals.md#oi-cap-capacity).

**What to do.**

- Keep the `null` branch for `max_market_order_ntl` and `max_trade_size`. A
  market that has never had a mark still reads `null`.
- Expect `MARKET_OI_CAP` on an order that opens, extends or flips a position
  and is priced through the committed mark, while the market is at its cap or
  when the order's new exposure would pass the cap. On a self-priced market,
  every such order is refused. A passive order rests, and the chain cancels it
  if the mark moves through it while the market is at its cap. An order that
  can only close its owner's position passes.
- Do not cache `oi_cap`. It changes as the capacity and the mark change.

The cap never closes a position.

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
