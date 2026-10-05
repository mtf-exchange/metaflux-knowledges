---
description: The MTF points program — testnet trading volume earns points each week from genesis, in four seasons, by a public formula. Points convert to MTF at the TGE.
---

# Points

:::caution
**The weekly table and its three reads are not live yet.** The reads
[`points_weeks`](../api/rest/info.md#points_weeks),
[`points_leaderboard`](../api/rest/info.md#points_leaderboard) and
[`points_user`](../api/rest/info.md#points_user) ship with the next archive and
gateway release. Until then, each one answers `400` `UNKNOWN_TYPE`. Points
still count from genesis, so no week is lost. When publication starts after the
release, the archive publishes every past week.
:::

Trade on the testnet and earn points each week. Each week shares a pool of
**1,000,000 points** among the accounts that traded, pro rata to qualifying
volume. Points count from testnet genesis, **2026-09-01 15:08 UTC**. At the TGE
on mainnet, points convert to MTF.

Only testnet trading volume earns points. Mainnet activity earns none. The
program page on the official site is [mtf.exchange/tge](https://mtf.exchange/tge).

## Seasons {#seasons}

The program runs in four seasons, from testnet genesis to the TGE snapshot. The
claim at the TGE is named **Gimle**.

| Season | Name | Window (UTC) | Weeks | MTF ceiling |
|---:|---|---|---:|---|
| 1 | Ginnungagap | Testnet genesis to the first Wednesday cut after the TGE page goes live | 5 or more | At most 5,000,000 |
| 2 | Yggdrasil | Season 1 end, plus 8 weeks | 8 | At most 10,000,000 |
| 3 | Bifrost | Season 2 end, plus 8 weeks | 8 | Set at season start |
| 4 | Ragnarok | Season 3 end to the TGE snapshot | the rest | Set at season start |

The API and the weekly tables use the season **number**. The name is a label
only. Season 1 counts back to genesis. The [TGE page](https://mtf.exchange/tge)
states the date Season 1 ends.

## Schedule {#schedule}

- **The weekly cut is Wednesday 00:00 UTC.** Week 1 runs from genesis to
  2026-09-09 00:00 UTC. Every later week is seven days. The API numbers weeks
  from genesis: week 5 ends 2026-10-07 00:00 UTC.
- **The cut block** is the last block with a block time before the cut.
- **The archive publishes a week** when it holds every record up to the cut
  block. A published week never changes.
- **The last week of Season 4 is partial.** It ends at the TGE snapshot, and its
  pool is `1,000,000 × whole hours / 168`.
- **The TGE target is 2027-03-01.** The date may move.

## What qualifies {#what-qualifies}

**Root account.** A sub-account earns as its parent. A user vault earns as its
leader. Every other account is its own root. All volume of a sub-account or a
user vault goes to its root.

**Qualifying fill.** A fill qualifies when all five of these hold:

1. The market is a governance-listed perpetual market or spot pair. Builder-deployed
   ([MIP-3](../mip/mip-3.md)) markets, options, the MTF/USDC spot pair and the
   MTF perpetual market do not count.
2. Neither side of the trade is a liquidation.
3. The fill price is inside the mark band:
   `0.99 × bar.low ≤ px ≤ 1.01 × bar.high`. `bar` is the market's 1-minute
   mark bar for the minute of the fill. If that minute has no bar, the band uses
   the latest earlier bar. With no bar at all, the fill does not qualify. Read
   the bars with
   [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot),
   `interval: "1m"`, `candle_type: "mark"`.
4. The two accounts of the trade have different roots, and they are not in one
   cluster. See [Cluster](#rules).
5. Neither side is excluded. One exception: a fill against the protocol
   Metaliquidity vault (vault id 1) counts for the other side when that side is
   the taker.

## The formula {#formula}

**Qualifying volume (`qv`).** For each root and each week:

1. `raw` = the sum of the notional of the qualifying fills. Maker and taker
   fills both count at weight 1.0.
2. Volume against one counterparty cluster counts up to 25% of `raw`. The
   volume above that limit is the excess. Taker volume against vault id 1 has
   no limit.
3. `qv = raw − excess`.
4. If `qv` is below $1,000, or the first and last qualifying fills of the week
   are less than 24 hours apart, `qv = 0`.

**Points.**

```text
points = 1,000,000 × qv / max(Σqv, Q_floor)
```

| Term | Value |
|---|---|
| `qv` | Your qualifying volume for the week, in USD |
| `Σqv` | The sum of `qv` over every root, for the week |
| `Q_floor` | $50,000,000 of qualifying volume a week |
| Rounding | Toward zero, to 0.000001 point |

**There is no per-account cap.** Pro rata is linear, so one account split into
ten accounts earns the same total. Each part still needs $1,000 of `qv`.

**`Q_floor` bounds a thin week.** When `Σqv` is below $50,000,000, the formula
divides by `Q_floor`, and the week issues less than its pool. The points not
issued are not paid, and no MTF is paid for them.

**There is no referrer share.** A referral earns the referrer no points.

## Worked example {#worked-example}

One root trades in one week:

```text
raw volume                                   $3,000,000
volume against one counterparty cluster      $1,100,000
limit: 25% of raw                              $750,000
volume above the limit (excess)                $350,000
qualifying volume (qv)                       $2,650,000
```

**A busy week.** `Σqv` is $200,000,000. That is above `Q_floor`, so the formula
divides by `Σqv`:

```text
points = 1,000,000 × 2,650,000 / 200,000,000 = 13,250
```

The week issues its whole pool of 1,000,000 points.

**A thin week.** `Σqv` is $8,000,000. That is below `Q_floor`, so the formula
divides by $50,000,000:

```text
points = 1,000,000 × 2,650,000 / 50,000,000 = 53,000
```

The week issues `1,000,000 × 8,000,000 / 50,000,000 = 160,000` points of its
1,000,000. The rest is not issued, and no MTF is paid for it.

## Rules {#rules}

| Rule | Statement |
|---|---|
| Scope | Only testnet trading volume earns points. Mainnet activity earns none. |
| Markets | Governance-listed perpetual markets and spot pairs only. The MTF/USDC spot pair, the MTF perpetual market, builder-deployed markets and options earn nothing. |
| Root account | A sub-account earns as its parent, and a user vault as its leader. A fill between a root and its own sub-account or vault earns nothing. |
| Exclusion | Protocol accounts, validators, protocol vaults and accounts operated by the MetaFlux team earn no points. A fill against an excluded account earns nothing for either side. The one exception is a taker fill against the protocol Metaliquidity vault (vault id 1). |
| Cluster | Two roots are one cluster when one of these links them: a transfer between them; one agent wallet approved by both; a trade between them outside the mark band; a closed trading group, where most of each member's volume is against the other members. Faucet grants never link accounts. A fill inside a cluster earns nothing. The 25% rule counts a cluster as one counterparty. |
| Concentration | Volume against one counterparty cluster counts up to 25% of your weekly raw volume. Taker volume against vault id 1 is exempt. |
| Mark band | A fill more than 1% outside the market's 1-minute mark range earns nothing. |
| Liquidations | A trade with a liquidation on either side earns nothing. |
| Minimum | $1,000 of qualifying volume a week, and qualifying fills at least 24 hours apart. |
| Referrals | No referrer share. |
| Eligibility | Claims are screened at the TGE against sanctions lists and the Terms. The Terms exclude UK retail consumers from crypto-derivatives. IP data serves screening only, never scoring. |
| Final review | Weekly numbers are provisional. One review at the TGE snapshot may remove points for abuse. Removed points are not paid. |

Excluded accounts do not appear in the weekly table or in the leaderboard. A
lookup of an excluded account returns no rows, the same as an account with no raw
volume. An account with raw volume but no qualifying volume has a row with 0
points.

## Budget and conversion {#budget}

- **Program ceiling: 100,000,000 MTF.** It comes from the 300,000,000 MTF
  community airdrop allocation in [Tokenomics](./tokenomics.md#genesis-allocation).
  It is a ceiling, not a promise.
- **Reserved: 200,000,000 MTF.** The rest of the community allocation stays
  reserved. No use is assigned to it.
- **Season ceilings.** Season 1 is at most 5,000,000 MTF. Season 2 is at most
  10,000,000 MTF. Seasons 3 and 4 get their ceilings at season start, inside the
  program ceiling.
- **The rate is set at the TGE**, under the ceiling:

```text
MTF per point (season s) ≤ ceiling(s) / (weeks(s) × 1,000,000)
```

For Season 2, that is at most `10,000,000 / (8 × 1,000,000) = 1.25` MTF per
point. No fixed rate is published. A fixed rate would put a price on volume that
costs nothing to make.

**The upper bound per dollar.** $1 of qualifying volume earns at most 0.02
points, because the formula divides by at least $50,000,000. At the Season 2
ceiling, that is at most 0.025 MTF per $1.

## How to check {#how-to-check}

Not live yet: the three reads below answer `UNKNOWN_TYPE` until the next archive
and gateway release.

| You want | Read |
|---|---|
| Every published week: the pool, `Σqv`, `Q_floor`, the points issued, the block range and the hashes | [`points_weeks`](../api/rest/info.md#points_weeks) |
| Your raw volume, qualifying volume and points, per week | [`points_user`](../api/rest/info.md#points_user) |
| The full table of one week, or the season total, 1,000 rows a page | [`points_leaderboard`](../api/rest/info.md#points_leaderboard) |

**Recompute your points.** Take one week from `points_weeks` and your row from
`points_user`:

```text
points = pool × qualifying_volume / max(total_qualifying_volume, q_floor)
```

Round toward zero, to 0.000001 point.

**Check the table hash.** Each week publishes `table_sha256`, the SHA-256 of
the full table. To check it:

1. Read every page of the week with `points_leaderboard`. Stop at the first page
   with fewer than 1,000 rows.
2. Write each row as one line: `address,raw,qv,points` and a newline. Write each
   amount in millionths, as an integer: `"2650000"` is `2650000000000`.
3. Sort the lines by `address`, in lower-case hex.
4. Hash the lines with SHA-256. The result is `table_sha256`.

```sh
printf '%s\n' \
  "0x1933587ffa064e26bf8f6c7b0fdec771644b56de,5350000000000,5350000000000,107000000000" \
  "0xac7dc3a2f08610ddc46c7a3e4f54b80745cbd8e9,3000000000000,2650000000000,53000000000" \
  | sha256sum
# a5c941fbd48fb9774d4938a4cd625f345a324562f2e19c3d80e8ae84f492828e
```

`inputs_sha256` is the SHA-256 of the exclusion, root and cluster inputs of the
week. It commits to those inputs without showing them.

`gap_blocks` counts the blocks of the week's range where the archive has a
recorded gap in fills. The week counts the fills the archive holds. The pool
does not change.

## The claim: Gimle {#claim}

At the TGE on mainnet, points convert to MTF at the rate of their season. The
claim is named **Gimle**. The TGE target is **2027-03-01**. The date may move.

- The points-program allocation is 100% claimable at the TGE.
- You can lock your claim for a bonus. See
  [the airdrop lock bonus](./tokenomics.md#airdrop-lock-bonus).
- Claims are screened against sanctions lists and the Terms before they pay.

The [TGE page](https://mtf.exchange/tge) carries the season table, the formula
and the published weeks.

## See also {#see-also}

- [Tokenomics](./tokenomics.md) — the supply, the allocation and the lock bonus
- [Sub-accounts](./sub-accounts.md) — why a sub-account earns as its parent
- [Agent wallets](./agent-wallets.md) — the agent link in the cluster rule
- [Mark prices](./mark-prices.md) — the price the mark band reads
- [`POST /info`](../api/rest/info.md#points-reads) — the three points reads
