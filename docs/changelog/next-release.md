---
description: "Eleven changes that wait for the next node or gateway release: order_status answers for a batch_cancel leg, contractAddress on a deployment receipt, mtfStatus for two transactions at one nonce, an open-interest cap on every native perp market, a deployer-set cap on a deployer market, a deficit charged to the markets that produced it, a bridge re-issue lane with spot tokens as portfolio-margin collateral, a node_gov label for every governance round, the reads after the fill-tape retirement, the removal of user_ledger_updates, and referral codes with a referee discount and caps. Also one wire row that is not verified on the running chain, and five corrections to this reference."
---

# Next release and unverified wire rows

:::caution
**Eleven sections wait for the next node release, and two of them also wait for
the next gateway release:**
[`order_status` for a `batch_cancel` leg](#batch-cancel-status),
[`contractAddress` on a deployment receipt](#contract-address),
[`mtfStatus` for two transactions at one nonce](#same-nonce-status),
[an open-interest cap on every native perp market](#oi-cap-capacity),
[a deployer sets its market's open-interest cap](#perp-set-oi-cap),
[a deficit is charged to the market that produced it](#deficit-attribution),
[a bridge re-issue lane and spot tokens as portfolio-margin collateral](#reissue-and-pm-collateral),
[a `node_gov` label for every governance round](#node_gov-labels),
[the reads after the fill-tape retirement](#tape-retirement-reads),
[the removal of `user_ledger_updates`](#user-ledger-updates-removed) and
[referral codes, a referee discount and caps](#referral-program). The action byte
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

The page also keeps [five corrections](#corrections) to this reference. They are
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

## An open-interest cap on every native perp market {#oi-cap-capacity}

**NOT LIVE YET.** This change ships with the next node release, after
2026-10-01.

| Surface | A live node | From the next release |
|---|---|---|
| [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `oi_cap` | present only on a market with a governance-set cap. No market has one, so every market is uncapped | present on every native perp market: the lower of the governance-set cap and the capacity cap. On a deployer market, the cap its deployer set: see [below](#perp-set-oi-cap) |
| `markets_meta` `oi_cap_usd` and `oi_cap_bound` | absent | present with `oi_cap`. `oi_cap_bound` reads `"deployer"` on a deployer market |
| `markets_meta` `max_market_order_ntl` and [`active_asset_data`](../api/rest/info/perpetuals.md#active_asset_data) `max_trade_size` | `null` on every market | a number on every native perp market that has a mark, and on every deployer market that has a cap |

**Why.** A liquidation can leave a deficit, and the protocol pays it from the
insurance fund and its other backstops. With no cap, open interest has no bound
against that money. The chain now derives a cap from what the backstops can
pay, and it recomputes the cap every block. See
[how the capacity cap works](../api/rest/info/perpetuals.md#oi-cap-capacity).
The capacity cap covers native perp markets only. The Metaliquidity vault
backstop never takes a deployer market's risk, so a deployer market gets its
cap from its deployer instead.

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

## A deployer sets its market's open-interest cap {#perp-set-oi-cap}

**NOT LIVE YET.** This change ships with the next node release, after
2026-10-01.

| Surface | A live node | From the next release |
|---|---|---|
| [`perp_set_oi_cap`](../api/rest/exchange/deploy-perp.md#perp_set_oi_cap) | `unknown variant` | accepted from the market's deployer, or from a delegate that holds bit 9 |
| [`perp_set_sub_deployer_perms`](../api/rest/exchange/deploy-perp.md#perp_set_sub_deployers) `permissions` with bit 9 set | refused: bits 9-15 are reserved | accepted. `1023` is every bit |
| The mask of a delegate added with `perp_set_sub_deployers` | `511` | `1023` |
| [`perp_activate_market`](../api/rest/exchange/deploy-perp.md#perp_activate_market) on a market that has a cap | sets the cap to the governance default `max_oi` | keeps the cap. Only a market with no cap starts at `max_oi` |
| [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `oi_cap_bound` on a deployer market | absent | `"deployer"` |
| A Metaliquidity vault order that opens, extends or flips a position on a deployer market | accepted | refused, `PRECONDITION_FAILED`: `metaliquidity vault cannot open or extend a position on a MIP-3 market` |

**Why.** A deployer market prices from its own deployer, and the protocol's
backstops never take its risk. The capacity cap measures what those backstops
can pay, so it does not fit a deployer market. The deployer owns the market's
risk, so the deployer sets the cap. For the same reason, the Metaliquidity
vault does not trade a deployer market. Its depositors did not deposit to carry
a price the protocol does not control.

**What to do.**

- As a deployer, set your cap with `perp_set_oi_cap` after the release. The
  cap is in whole units of the base asset, not lots and not USD. Until the
  release, your market carries the governance default it started at.
- Send `0` to remove the cap. Activation fills an empty cap with the governance
  default, so send `0` again after you deactivate and activate the market.
- To let a delegate set the cap, grant bit 9. A delegate added with
  `perp_set_sub_deployers` holds every bit, bit 9 included.
- Accept `"deployer"` as a value of `oi_cap_bound`.
- A lower cap closes no position. It stops new exposure only, by the
  [at-cap rules](../api/rest/info/perpetuals.md#oi-cap-capacity).
- The reference market maker refuses to start when its list names a deployer
  market. Remove such a market from the list.

## A deficit is charged to the market that produced it {#deficit-attribution}

**NOT LIVE YET.** This change ships with the next node release, after
2026-10-01.

| Surface | A live node | From the next release |
|---|---|---|
| The insurance fund a cross account's deficit draws | the fund of one market: the highest asset id among the markets the liquidation touched | the fund of each market where the account realized a loss in the liquidation run, in proportion to that loss |

**Why.** The open-interest cap on a native market is sized from the insurance
fund of that market. A loss on one market must not drain the insurance fund of
another market. See
[which market pays](../concepts/tiered-liquidation.md#which-market-pays).

**What to do.** Nothing. No action or read changes.

## A bridge re-issue lane and spot tokens as portfolio-margin collateral {#reissue-and-pm-collateral}

**NOT LIVE YET.** This change ships with the next node release.

| Surface | A live node | From the next release |
|---|---|---|
| A [`stranded_on_retired_domain`](../api/rest/info/bridge.md#stranded_on_retired_domain) withdrawal | no recovery lane | governance can [re-issue](../api/rest/info/bridge.md#reissue) it with a new nonce |
| A [disputed](../api/rest/info/bridge.md#disputed) withdrawal that reads `released` | no recovery lane | governance can re-issue it the same way |
| [`bridge_withdrawal_history`](../api/rest/info/bridge.md#bridge_withdrawal_history) after a re-issue | — | a NEW entry: same `amount_units` and `dst_addr`, a higher `nonce`, `awaiting_cosignatures`. The old entry stays terminal |
| [`markets_meta`](../api/rest/info/spot.md) `spot.tokens` | a spot token that governance registers is absent | the token appears, with its size and wei decimals |
| A spot token as [portfolio-margin collateral](../concepts/portfolio-margin.md#multi-collateral-cross-collateral-haircut) | never counts | counts when governance sets a collateral weight for that token and its price perpetual, native, listed and not self-priced, gives its mark |
| The perpetual that gives a collateral token its [mark](../concepts/portfolio-margin.md#pm-collateral-eligibility) | — | the perpetual governance names for the token or, when none is named, the perpetual with the same symbol. A token whose symbol differs from its perpetual, such as a bridged `gBTC` priced by `BTC`, needs the named mapping |
| [`node_gov`](../nodes/data-streams.md#node_gov) `asset` on a `pm_collateral_haircut` or `pm_collateral_price_asset` vote | — | a spot token id, not a market id |
| [`node_gov`](../nodes/data-streams.md#node_gov-vote-enacted) `changes[].field` on a `SetDynamicRiskParam` enactment | — | can be `pm_collateral_price_asset`, the perpetual that gives the token its mark |
| [`node_gov`](../nodes/data-streams.md#node_gov) `category` on a re-issue vote | — | `bridge_reissue` |
| An unsigned queued withdrawal that must not pay | no lane | governance can [void](../api/rest/info/bridge.md#voided) it and refund the full debit, fee included |
| [`bridge_withdrawal_history`](../api/rest/info/bridge.md#bridge_withdrawal_history) after a void | — | the entry finishes with `status: "voided"` and `open: false` |
| [`node_bridge_outbox`](../nodes/data-streams.md#node_bridge_outbox-event) `removed` record after a void | — | `status: "voided"` |
| [`node_gov`](../nodes/data-streams.md#node_gov) `category` on a void vote | — | `bridge_void` |
| A queued withdrawal while withdrawals are halted | validators keep signing it | validators sign nothing until the halt lifts; it stays [`awaiting_cosignatures`](../api/rest/info/bridge.md#awaiting_cosignatures) |
| [`node_gov`](../nodes/data-streams.md#node_gov) `category` on an `ArmFeatures` or SPAN shock-grid vote | `circle_promotion_attest` | `arm_features` or `pm_shock_grid` |
| [`node_gov`](../nodes/data-streams.md#node_gov-categories) `category` on a collateral weight or price-perpetual vote | — | `pm_collateral`, not `dynamic_risk`. `coin` is empty: `asset` is a spot token id |
| A `SetDynamicRiskParam` vote that sets a collateral field AND a market setting | — | refused. A collateral vote carries only collateral fields |

**Why.** A deployment rotation can strand a withdrawal, and a dispute on the
destination contract can make one unpayable. Before this release, neither had a
recovery lane. A re-issue pays the original withdrawal once, on the destination
chain. It never debits the user again and never credits the user on the
exchange. Governance re-issues a withdrawal once. A withdrawal that no validator has
signed can instead be voided: governance removes it and refunds the full debit
on the exchange, and nothing pays it on the destination chain.

A spot token takes its mark from its price perpetual: the one governance names
for the token or, when none is named, the perpetual with the same symbol. So the
collateral and a position on that perpetual share one price in the scenario
grid. A self-priced perpetual has no external price, so
its token never counts.

**What to do.**

- Before any re-issue, confirm on the destination chain that the old withdrawal
  was not paid. See the [danger box](../api/rest/info/bridge.md#stranded_on_retired_domain).
- After a re-issue, track the NEW entry. Its `message_id` is new.
- Read the collateral weight per token, not per market. The initial weights will
  be `0.95` for BTC and ETH and `0.8` for SOL and BNB, once those spot tokens
  exist.
- Expect no credit from a token while the oracle of its perpetual is stale, or
  before the oracle has sourced a price for it.

## `node_gov` labels every governance round {#node_gov-labels}

**NOT LIVE YET.** This change ships with the next node release.

| Surface | A live node | From the next release |
|---|---|---|
| [`node_gov`](../nodes/data-streams.md#node_gov-categories) `category` on a fixed-round vote with no label of its own, for example `DisableDex` | the label of the nearest labeled base below it, such as `oracle_weights` | the label of its own round, such as `disable_dex` |
| `node_gov` `sub_id` on that vote | the distance from that lower base, such as `12000000` | `0` |
| `node_gov` `round` on a `Listing`, `MintTreasury`, `BurnTreasury` or `SetPopulationTarget` vote | a round that another action also uses: 13,000,000, 13,000,000, 14,000,000 and 15,000,000, in that order | a round of its own: 48,000,000, 49,000,000, 50,000,000 and 51,000,000, in that order |

**Why.** A live node labels only eight bases. Thirty fixed rounds have no base
of their own, so each one reads as a different vote kind. The new
[category table](../nodes/data-streams.md#node_gov-categories) gives every round
its own label.

Every round has one action. On a live node, three rounds are shared by more
than one action. A validator has one vote slot per round, so its vote for one
of those actions replaces its vote for the other.

**What to do.**

- Filter a vote kind by `action`, before and after the release. `action` is the
  exact filter.
- Do not split a vote kind by `category` on a record written before the
  release. The old label on those records does not change.
- A vote cast on a shared round in the 24 hours before the release does not
  carry over for `Listing`, `MintTreasury`, `BurnTreasury` and
  `SetPopulationTarget`. Cast it again after the release.

## Reads after the fill-tape retirement {#tape-retirement-reads}

**NOT LIVE YET.** Each row below names the release it ships with. The node rows
ship with the next node release. The gateway rows ship with the next gateway
release. Some rows only change what a caller sees from the release that arms
the fill-tape retirement.

The fill-tape retirement stops two committed rings on the node: the trade ring
of each market and the fill ring of each account. The
[`node_trades`](../nodes/data-streams.md#node_trades) and
[`node_fills`](../nodes/data-streams.md#node_fills) streams do not change, so
the archive keeps every print. The reads below stop reading the node rings, and
read the archive or the gateway's own 24-hour trade window instead.

| Surface | Ships with | The rule |
|---|---|---|
| [`markets`](../api/rest/info/perpetuals.md#day-ntl-vlm-bound) `day_ntl_vlm`, perp and spot | node release | From the release that arms the fill-tape retirement, a node that holds no 24-hour window for a market serves `"0"` with `day_ntl_vlm_lower_bound_from` equal to the new top-level `time` |
| [`markets`](../api/rest/info/perpetuals.md#markets) `time` | node release | New top-level field: the block time of the read |
| `markets` `day_ntl_vlm` | gateway release | The gateway replaces `day_ntl_vlm` with the sum from its own window. It removes `day_ntl_vlm_lower_bound_from` only when its data covers the whole 24 hours. Otherwise the marker is the oldest instant its data covers |
| [`markets`](../api/rest/info/spot.md#spot_meta) spot `prev_day_px` | gateway release | When the gateway data covers the whole 24 hours, the price of the first print in that window |
| WebSocket [`markets`](../api/ws/subscriptions.md#markets) `day_ntl_vlm` and spot `prev_day_px` | gateway release | The same two rules on every snapshot and delta row. The window ends at the row's `time` |
| [`trades`](../api/rest/info/perpetuals.md#trades-archive), un-ranged | gateway release | The ask also reaches the archive. The answer merges the node ring, the gateway window and the archive, with no duplicate `tid` |
| `trades`, a row from the gateway window | gateway release | No `hash` key and no `block` key, the same as an archive row that has no block |
| WS [`trades`](../api/ws/subscriptions.md#trades) on-subscribe snapshot | gateway release | When the node has no ring for the market, the gateway serves the snapshot from its own window |
| [`user_twap_slice_fills`](../api/rest/info/account-history.md#user_twap_slice_fills) | gateway release | The answer merges the node answer with the archive fills of the same `address` that carry a `twap_id` |
| [`order_status`](../api/rest/info/orders-fills.md#order_status-archive-legs) for a filled order | gateway release | The legs can come from the archive when the ask carries `address` |
| WS [`l2_book`](../api/ws/subscriptions.md#l2_book) and [`bbo`](../api/ws/subscriptions.md#bbo) `time` on a spot pair | node release | From the release that arms the fill-tape retirement, the time of the newest print the serving node saw since it started. `0` until the first print |

**Why.** The node rings are bounded, and they are part of the committed state.
The archive and the gateway already hold the same prints, and they hold more of
them. A ring of 256 prints covers minutes on a busy market, so the gateway's
24-hour window is the fuller figure even before the retirement.

**What to do.**

- Read a `markets` row that still carries `day_ntl_vlm_lower_bound_from` as a
  lower bound. A marker within seconds of the current time means the serving
  layer held no window: `"0"` is then no data, never a quiet market.
- Send `address` on `order_status`. Without it, the answer can carry no
  `fills`, and a filled order can answer `unknown`.
- Keep reading `trades` rows with and without `hash`. A missing `hash` means
  "not recorded".
- Expect no type change. No field changes its type, and no field is removed.

## `user_ledger_updates` is removed {#user-ledger-updates-removed}

**NOT LIVE YET.** This change ships with the next node release and the next
gateway release.

| Surface | A live node | From the next release |
|---|---|---|
| [`POST /info`](../api/rest/info.md#retired-reads) `user_ledger_updates` | `200` with `updates: []` | `410` with `code: "UNKNOWN_TYPE"` and `details.use: "user_non_funding_ledger_updates"`. A node that you call directly answers `400` `UNKNOWN_TYPE` |

**Why.** This read could only answer `[]`. The node keeps no per-account ledger
history. The archive keeps every balance movement, in the stream's own record
shape: a signed `delta` and a token `coin`.
[`user_non_funding_ledger_updates`](../api/rest/info.md#archive-lane) serves
those records. One question, one read.

**What to do.**

- Call `user_non_funding_ledger_updates` for the balance ledger history of an
  account. It answers today.
- Read `delta` as a signed change, not as an unsigned amount.
- For live balance movement, keep the
  [`ledger_updates` WS channel](../api/ws/subscriptions.md#ledger_updates). It
  does not change.

## Referral codes, a referee discount and caps {#referral-program}

**NOT LIVE YET.** This change ships with the next node release.

**The release changes no fee.** Each new parameter starts at a value that
reproduces a live node: a 10% share, no discount, codes off, no cap.
Governance turns the program on with votes. Two rules change at the release
itself, with no vote: a liquidation fill pays no referrer share, and an account
that already has referees cannot bind to a referrer.

| Surface | A live node | From the next release |
|---|---|---|
| [`register_referral_code`](../api/rest/exchange/account.md#register_referral_code) | `unknown variant` | accepted while codes are on. Refused with `referral codes are not enabled` while they are off |
| [`set_referrer_by_code`](../api/rest/exchange/account.md#set_referrer_by_code) | `unknown variant` | binds the sender to the account that holds the code |
| [`set_referrer`](../api/rest/exchange/account.md#set_referrer) from an account that has referees | accepted | refused: `an account with referees cannot set a referrer` |
| `set_referrer` or `set_referrer_by_code` from an account that holds a referral code | — | refused: `an account with a referral code cannot set a referrer` |
| `set_referrer` to an address with no referral code, while codes are on | — | refused: `referrer has no referral code` |
| The referrer share | a fixed 10% of the taker fee | `referrer_share_bps` of the taker fee actually paid. Default `1000`, which is 10% |
| The referee discount | none | `referee_discount_permille` off the taker rate. The larger of it and the staking discount applies, never their sum. Default `0` |
| The share and the discount after the caps | — | each stops when the referee's taker volume since the bind reaches its cap. Default `0`, which is no cap |
| A liquidation fill of a referee | pays the referrer share | pays no share and gets no referee discount |
| [`vote_global`](../concepts/fees.md#referral-parameters) kinds 131 to 135 | unknown kind | `set_referrer_share_bps`, `set_referee_discount_permille`, `set_referral_code_min_volume_usd`, `set_referee_discount_cap_usd`, `set_referrer_reward_cap_usd` |
| [`fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule) | `referrer_share_bps` only | also `referee_discount_permille`, `referral_code_min_volume_usd`, `referee_discount_cap_usd`, `referrer_reward_cap_usd`, and `user.referee_discount_permille` |
| [`referral_state`](../api/rest/info/fees-credit.md#referral_state) | `user`, `address`, `claimable_rewards`, `referrer` | also `referrer_code`, `code`, `referee`, `referrer_stats`, `code_requirement` |
| [`referral_code`](../api/rest/info/fees-credit.md#referral_code), [`referral_referees`](../api/rest/info/fees-credit.md#referral_referees), [`referral_leaderboard`](../api/rest/info/fees-credit.md#referral_leaderboard) | `UNKNOWN_TYPE` | new reads |
| [`node_actions`](../nodes/data-streams.md#node_actions-types) `action_type` | — | can be `RegisterReferralCode` or `SetReferrerByCode` |

**Why.** A referrer can now hand out a short code instead of an address, and a
referee can see its discount, its counters and its caps. Governance can set the
share, the discount and the caps, so the program changes without a release. The
code minimum makes each referrer identity trade before it earns, and while
codes are on, a bind by address needs a code holder, so a trader cannot bind a
fresh address to itself for free. Referrals are single-level: a live node
checks only one direction, and the release checks both. A liquidation fill is
not flow the referrer brought, so it pays no share. See
[the referral program](../concepts/fees.md#referrer-credit).

**What to do.**

- Nothing, until governance votes. The planned values are a 10% share, a 40‰
  (4%) discount, a 10,000 USDC code minimum, a 25,000,000 USDC discount cap and
  a 1,000,000,000 USDC share cap. They are planned, not live. Read the values
  in force from `fee_schedule`.
- Send a referral code in lowercase. The node refuses an uppercase letter and
  does not fold it.
- A binding made before the release keeps its referrer. It reads `bound_ms: 0`
  and zero counters, and its caps count from the release.
- `referral_referees` lists every referee, a referee bound before the release
  included. Its counters start at the release.

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
