---
description: Breaking API changes on the MetaFlux read API. The account-scalar rename, the read-surface cut, and the earlier 0.7.14 addressing change. A migration checklist for integrators and market makers.
---

# API migrations

This page lists the breaking changes to the MetaFlux read API. Each section has a migration checklist.

:::warning
This page covers five migrations, newest first. None of them changes a signed `/exchange` action. Only the response shape and the read surface move. Work through the checklists before you upgrade a client.
:::

## The account-state lane split {#account-state-lane-split}

:::info
Live. The node answers the four-lane shape and serves `clearinghouse_state` and `option_state`. A 0.9.6 node does both.
:::

:::info
`account_state` is now four lane summaries, and position detail has its own read. The flat body carried perp margin scalars, a spot balance array and a dex-keyed position table side by side. Nothing said which lane a field belonged to. The body is now the cross-lane money figures of the account plus one summary per lane: `perp`, `spot`, `margin` and `option`. The position table has left the body.
:::

`account_state` answers one question: what the account is worth and how close it is to liquidation. The node renders every figure in it from one committed block, so the set is internally consistent. Position detail is a different question, so it has its own read. Each lane summary stays whole inside `account_state`, so no caller needs to join two frames to get one consistent number set.

:::danger
Never join two frames to compute one number. A summary frame and a detail frame can be rendered one commit apart. A health figure built from both was true at no single block. Every frame carries `height`. Compare it before you combine anything.
:::

### Where every field went {#lane-split-field-map}

| Was, at the top level of `account_state` | Is now |
|---|---|
| `address`, `height`, `time` | unchanged |
| `abstraction`, `position_mode` | unchanged: account settings, not lanes |
| `account_value`, `total_raw_usd`, `withdrawable`, `health`, `tier` | unchanged: each is cross-lane |
| `health_deferred` | unchanged, still present only when `true` |
| `pm_net_value` | unchanged: it stays at the top level |
| `total_margin_used` | `perp.init_margin`: renamed as well as moved |
| `total_ntl_pos` | `perp.total_ntl_pos` |
| `pm_maint_margin` | `perp.pm_maint_margin` |
| `pm_concentration_penalty` | `perp.pm_concentration_penalty` |
| `balances` | `spot.balances`: the rows are unchanged, field for field |
| `clearinghouse_state` | its own read, [`clearinghouse_state`](../api/rest/info/account.md#clearinghouse_state), same wire name and same row shape |
| `cross_maintenance_margin_used` | `detail: "margin"` only: it was already only there |

Two names moved outside the body:

| Was | Is now |
|---|---|
| `option_positions` (read) | [`option_state`](../api/rest/info/options.md#option_state): a rename, not an alias. The old name answers `unknown info type` |
| `account_state` with `detail: "adl"` | [`clearinghouse_state`](../api/rest/info/account.md#account_state-adl) with `detail: "adl"`. On `account_state` it is now refused with `400` |

Two new lanes have no old field to map from: `margin` (spot-margin collateral, debt and pair count) and `option` (writer escrow, leg count, nearest expiry). Before, only their own detail reads reached them.

### The traps {#lane-split-traps}

1. `pm_net_value` is not under `perp`. Three of the four `pm_*` figures moved into the `perp` lane. This one did not. Its cash term is the whole unified USDC pool, and under multi-collateral it also folds haircut-valued spot balances. It is the portfolio-margin twin of `account_value`. A client that sums the lanes counts the same USDC twice.

2. The held initial margin has two names, one for each depth. The full body calls it `perp.init_margin`. `detail: "margin"` calls it `total_margin_used`, at the top level, as before. It is the same number from the same helper. Neither depth serves the name of the other.

3. `spot.balances` is never an empty array. The USDC row is unconditional, even on an account that has never had funds. No real account returns an empty array. If you see one, you are reading a placeholder, not an account. Check `height`, which a placeholder stamps `0`.

4. `option.next_expiry` is absent, not zero, when `option.legs` is `0`. A zero timestamp reads as 1970. This is the one non-uniform key in the body.

5. `tier` is a string: `"Safe"`, `"T0"`, `"T1"`, `"T2"` or `"T3"`. It has always been a string. Type it as one, and do not accept a number in its place.

6. There is no transition window. One builder serves one shape. The body refuses the old flat names at the top level, so a half-migrated body cannot ship. Prepare the client before the release.

### Checklist {#lane-split-checklist}

1. Re-type your account DTO. This step is urgent. A stale account type fails to decode, so every account read stops working. It does not lag silently. Both client SDKs carry the new type. An older build cannot parse the new body.
2. Move four reads into `perp`: `init_margin` (from `total_margin_used`), `total_ntl_pos`, `pm_maint_margin` and `pm_concentration_penalty`.
3. Move `balances` to `spot.balances`. The row fields are unchanged.
4. Leave `pm_net_value` at the top level. Do not move it with the other `pm_*` fields.
5. Subscribe to or poll [`clearinghouse_state`](../api/rest/info/account.md#clearinghouse_state) for positions. It has the same wire name and the same rows, with its own read and its own WS channel. Both require a `user` on subscribe.
6. Rename `option_positions` to `option_state`, in REST calls and as a WS channel name.
7. Move `detail: "adl"` onto `clearinghouse_state`. On `account_state` it now answers `400`.
8. Delete any code that joins a summary frame and a detail frame. Take a consistent number set from `account_state` alone, or compare `height` first.
9. Handle the two new lanes, `margin` and `option`, or ignore them safely. Both are always present and zeroed.

See [`account_state`](../api/rest/info/account.md#account_state) for the full field table, and [WS subscriptions](../api/ws/subscriptions.md#account_state) for the three channels.

# The one response envelope {#response-envelope}

:::info
`/info` and `/exchange` now answer one envelope. A success carries `data`. A failure carries a structured `error` object with a stable `code`. This replaces the per-endpoint response and rejection shapes.
:::

The new shape:

```json
{ "data": { /* payload */ } }
```

```json
{ "error": { "code": "ORDER_INVALID_PRICE", "message": "...", "details": { "field": "px", "limit": "100", "actual": "12345" } } }
```

The two keys differ on purpose. `error` appears only on a failure, so a hot market-data read carries no dead field. `data` appears on every success and can itself be `null`, because a read can succeed with no content.

What changed, by call site:

| Was | Is now | What breaks |
|---|---|---|
| `/info`: `{"type": "<t>", "data": {…}}` | `{"data": {"type": "<t>", …}}` | Only the `type` READ moves, from `body.type` to `body.data.type`. Every payload field keeps its path: `body.data.fills` is still `body.data.fills` |
| `/exchange` order path: `{"statuses": […]}` | `{"data": {"statuses": […]}}` | One level of unwrap |
| `/exchange` admission: `{"accepted": true, …}` | `{"data": {"accepted": true, …}}` | One level of unwrap |
| Any rejection: `{"error": "<string>"}` | `{"error": {"code", "message", "details"?}}` | `error` is an OBJECT now. A client that prints `body.error` prints `[object Object]` |
| Rejection: `{"accepted": false, …}` | (gone) | The PRESENCE of `error` is the rejection. There is no `accepted: false` |
| Per-leg: `{"error": "<reason>"}` in `statuses` | `{"error": {"code", "message", "details"?}}` | Same object as the envelope, at leg level |
| `429`: `{"status":"err","response":"…"}` | `{"error": {"code": "RATE_LIMITED", …}}` | One shape for every failure now |

Checklist:

1. Unwrap `data`. Read the payload at `body.data`, not at `body`.
2. Move the `/info` discriminator read from `body.type` to `body.data.type`.
3. Stop reading `error` as a string. It is an object. Read `error.code`.
4. Replace every `message` match with a `code` match. `code` is the stable contract. `message` is prose, and any release can reword it. This change is the most likely to break a client silently. Search for every comparison against an error sentence.
5. Stop reading `accepted: false`. Test whether `error` is present.
6. Do not treat `data: null` as a failure. It is a success with no content. Test for the presence of `error`, not for a null `data`.
7. Drop any `422` branch. No code answers `422`. A logically invalid request answers `400` with the code that names it.
8. Do not walk `statuses` on a grouped batch, because there is none. A batch with `grouping` other than `"na"` is atomic. It rejects at the action level with one `error` and no `statuses` array. Only an ungrouped batch reports per-leg failures.

[Errors](../api/errors.md) has the full code list, with the status of each and the caller action for each.

# The account-scalar rename {#account-scalar-rename}

:::note
Read [the lane split](#account-state-lane-split) first. It is newer, and it moves three of the fields named below into the `perp` lane. This section records the rename. The lane split records where each renamed field now sits.
:::

:::info
`account_state` now uses institution-standard names for its account-level scalars. Two fields are renamed and two are new. Only the account object changes. Every position row under `clearinghouse_state` keeps its own field names.
:::

| Was | Is now | Read |
|---|---|---|
| `init_margin` | `total_margin_used` | both depths |
| `maint_margin` | `cross_maintenance_margin_used` | `detail: "margin"` only, as before |
| — | `total_raw_usd` (new) | both depths |
| — | `total_ntl_pos` (new) | full depth only |

The old names are gone and have no alias. A client that reads `init_margin` receives `undefined`. Arithmetic turns it into a silent `NaN`, not an error. Search your client for both old names before you upgrade.

Do not run a blind find-and-replace on `maint_margin`. Three other fields share the word, and none of them changed:

| Field | Where | Status |
|---|---|---|
| `clearinghouse_state["<dex>"].positions[*].maint_margin` | position row | unchanged: this leg's maintenance contribution |
| `pm_maint_margin` | account object | unchanged by this rename: the portfolio-margin figure. The [lane split](#account-state-lane-split) later moved it to `perp.pm_maint_margin` |
| `maint_margin_ratio` / `init_margin_ratio` | `markets_meta` | unchanged: per-market ratios, in bps |

The two new fields:

- `total_raw_usd` is settled cash equity in whole USDC. It holds realized USDC only. It excludes unrealized PnL, which is the one difference from `account_value`. It is the `settled cash` term that the `withdrawable` formula starts from, so you can now reconcile the formula from one read.
- `total_ntl_pos` is the mark notional of the cross positions of the account, summed and unsigned. Isolated legs are excluded. It equals the sum of the `notional` of every position row whose `isolated` is `false`. It exists at full depth only. `detail: "margin"` skips the position walk that produces it.

The name says `cross` because `cross_maintenance_margin_used` is the figure that the liquidation engine judges the cross bucket against. An isolated position posts its own margin bucket and is liquidated per leg, so it adds nothing to this number. An account that holds only isolated legs reports `"0"` and can still be liquidated. Do not size an isolated position from this field. Read the `maint_margin` row of that leg instead. The old name did not say this, although the scope was the same.

Checklist:

1. Rename `init_margin` to `total_margin_used` at every read site.
2. Rename `maint_margin` to `cross_maintenance_margin_used`, but only where you read the account object. Leave every position-row read alone.
3. If you derive the health ratio, it is now `account_value / cross_maintenance_margin_used`, still on `detail: "margin"` only. See [two meanings of health](../concepts/tiered-liquidation.md#two-meanings-of-health).
4. Upgrade the client SDK. `@metaflux-dex/client` and the Rust client carry the new field names. An older SDK build cannot reach them.

See [account value](../concepts/account-value.md#the-scalars) for the arithmetic behind each scalar, and [`account_state`](../api/rest/info/account.md#account_state) for the full field table.

# The read-surface cut {#read-surface-cut}

:::info
One question has one read. The `/info` surface carried several reads that answered the same question as another read. A caller had to choose, and a wrong choice was silent. The cut removes the duplicate in every such pair. It keeps the read that answers the question completely in one round trip.
:::

Nothing that a public caller could read is gone. Every retired name has a replacement. [Reads that are no longer public](../api/rest/info.md#retired-reads) has the full table.

The change has these shapes:

| Shape | What to do |
|---|---|
| A read merged into a bigger one: `agents`, `sub_accounts`, `user_to_multi_sig_signers`, `user_vault_equities`, `delegator_summary`, `user_role`, `pm_summary`, `evm_contract_bindings`, `bridge_chain_configs` | Call the read that owns the question. [`account_state`](../api/rest/info/account.md#account_state) with `detail: "overview"` carries the first six as named sub-objects; `account_state` already carries the PM figures; the EVM binding rides [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `kind: "spot"`; no public read carries the deployment row: a node publishes it on its [`node_bridge_outbox`](../nodes/data-streams.md#node_bridge_outbox-configs) stream, and the custody address per chain is in [Deployments](../bridge/index.md#deployments) |
| A read became a PARAMETER: `market_info`, `margin_summary`, `account_overview` (and its old name `web_data`), `user_fills_by_time`, `trades_by_time`, `max_builder_fee` | Same question, one read, one argument: `coin` on [`markets`](../api/rest/info/perpetuals.md#markets), `detail: "margin"` or `detail: "overview"` on [`account_state`](../api/rest/info/account.md#account_state), `start_time` / `end_time` on [`user_fills`](../api/rest/info/orders-fills.md#user_fills) and [`trades`](../api/rest/info/perpetuals.md#trades) |
| A read was RENAMED: `spot_deploy_state` → [`spot_deploy_auction`](../api/rest/info/spot.md#spot_deploy_auction), `recent_trades` → [`trades`](../api/rest/info/perpetuals.md#trades) | Change the `type` string. The payload is the same |
| A read a change made UNNECESSARY: `encode_action` | The multisig inner blob now accepts the ordinary `{type, params}` wire action, so there is nothing left to encode. UTF-8 encode the action you would post to `/exchange` and let every member sign those bytes. See [signing the inner action](../concepts/multi-sig.md#signing-the-inner-action) |
| A read left the public API: `mip3_deployer_oracle`, `fba_batch_state` | Operator lane. The FBA read ships publicly with its engine |
| A read CAME BACK: `rfq_open`, `rfq_user` | Both are public again. They shipped with the option lane, because an accept cannot be completed without them: a taker finds its own `rfq_id` and a maker finds a request to answer |
| A read was DELETED outright: `protocol_metrics`, `node_info`, `block_info` | None of the three is served any more. Every public fact `protocol_metrics` carried is on [`markets`](../api/rest/info/perpetuals.md#markets), [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) and [`staking_state`](../api/rest/info/vaults-staking.md#staking_state); the chain id is fixed per network, see [networks](../networks.md#summary); the committed height and consensus time stamp every read, and the block head is on [`recent_blocks`](../api/rest/info/chain.md#recent_blocks) |
| A read was DELETED outright: `oracle_sources` | It served a per-market source bitmask nothing acts on. Its static facts are prose on [oracle prices](../concepts/oracle-prices.md#source-table): the ten source slots and their protocol-fixed weights |

Two reads gained a field. Each field answers a question that used to need knowledge from outside the wire:

- [`markets_meta[*].signing_id`](../api/rest/info/perpetuals.md#signing_id) is the uint32 that you put in the EIP-712 `market` field. It replaces the deprecated `asset_id` shim. The signing type string is unchanged.
- [`markets_meta[*].risk_override`](../api/rest/info/perpetuals.md#risk_override) is the governance risk override in force on that market. It is `null` when none applies.

Three WS channels are retired. `all_mids` and `active_asset_ctx` were projections of [`markets`](../api/ws/subscriptions.md#markets) rows. `user_events` was a catch-all channel. Every event it carried has a typed home on `fills`, `order_updates`, `ledger_updates` or `notifications`. See [WS subscriptions](../api/ws/subscriptions.md#channels-at-a-glance).

# API migration 0.7.14 {#migration-0714}

:::note
This section is history. It describes the earlier `coin` and `address` addressing change. Where it names a query type that the cut above retired, read the table of the cut for the current name.
:::

## At a glance {#at-a-glance}

| Area | Old | New |
|------|-----|-----|
| Address a market (reads) | `asset_id` / `market_id` (numeric) | `coin` (symbol, e.g. `"BTC"`) |
| Address an account (reads) | `account_id` or `address` | `address` (0x hex) only |
| Candle history | `candle` (executed-trade bars) | `candle_snapshot` (the single candle query): price bars, `candle_type` `mark` (default) / `oracle` |
| Composite frontend snapshot | `web_data2` (REST + WS) | removed: compose focused reads |
| Margin ladder | `margin_table` query | `margin_tiers` inline on `markets_meta` |
| Recent trades by window | — | a ranged `trades` ask |
| WS subscription cap | 256 / connection | 64 / connection |

## 1. Markets are addressed by `coin` {#1-markets-are-addressed-by-coin}

Every market-scoped read now resolves the market by its `coin` symbol. The numeric `asset_id` and `market_id` request arguments are removed. A request that supplies them and omits `coin` is rejected with `400` and `INVALID_REQUEST`.

Affected reads: `markets`, `markets_meta`, `l2_book`, `trades`,
`funding_history`, `active_asset_data`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"markets","asset_id":0}
+ {"type":"markets","coin":"BTC"}
```

Responses echo the `coin` symbol. For example, `trades` rows carry `"coin":"BTC"`. The deprecated `asset_id` shim is gone. A signer needs [`markets_meta[*].signing_id`](../api/rest/info/perpetuals.md#signing_id).

## 2. Accounts are addressed by `address` {#2-accounts-are-addressed-by-address}

Account-scoped reads no longer accept `account_id`. Pass `address` (0x hex).

Affected reads: `open_orders`, `user_fills`, `account_state`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

The `account_id` echo field is gone from these responses.

## 3. Removed query types {#3-removed-query-types}

| Removed | Returns now | Use instead |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` inline on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](../api/rest/info/account.md#account_state) (default and `detail: "overview"`) + [`open_orders`](../api/rest/info/orders-fills.md#open_orders) + [`exchange_status`](../api/rest/info/node.md#exchange_status) |
| `web_data2` (WS channel) | `unknown channel: web_data2` | `account_state` WS channel |

## 4. `margin_tiers`, inline notional-banded ladder {#4-margin_tiers--inline-notional-banded-ladder}

The maintenance-margin ladder now rides inline on each market record as `margin_tiers`, an ascending list of upper-bound bands:

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` is the upper bound of the band, as a decimal string in whole-USDC notional. `null` means the unbounded top tier.
- `max_leverage` is the maximum leverage in this band (`u8`).
- `maint_margin_ratio` is the maintenance-margin ratio, as a decimal bps string (`"100"` = 1.00%).

The tier is the first band whose `max_open_interest` is strictly greater than the notional of your position. A notional that lands exactly on a bound takes the next band up. Leverage falls and maintenance rises as open interest grows.

## 5. New: a ranged `trades` ask {#5-new-ranged-trades}

A ranged `trades` ask returns recent public prints for one market over a `[start_time, end_time]` window. The window reads the bounded ring. Deep history comes from the gateway archive.

```json
{ "type": "trades", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

Rows share the un-ranged [`trades`](../api/rest/info/perpetuals.md#trades) shape.

## 6. `markets` shape {#6-markets-shape}

`markets.data` is now an object, not an array:

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

Each `perp[]` element carries only the dynamic fields of a market. The static fields (precision grids, leverage and margin ladders, trade-control flags) live separately on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta), joined on `(coin, kind)`.

## 7. WebSocket changes {#7-websocket-changes}

- The `web_data2` channel is removed. See the replacement above.
- `trades`: `data` is an array. The on-subscribe frame (`is_snapshot: true`) is a non-empty array of recent prints. It is empty only if the market never traded. Snapshot rows carry `users: null`. Live pushes carry `users: [taker, maker]`.
- `user_fundings`: records now carry `{coin, payment, szi, fundingRate, time}`. `payment` is signed whole-USDC: negative means paid, positive means received.
- `explorer_txs` and `explorer_block` are removed. Read [`recent_transactions`](../api/rest/info/chain.md#recent_transactions) and [`recent_blocks`](../api/rest/info/chain.md#recent_blocks) instead. See [Ids and wire shapes](./ids-and-wire-shapes.md#explorer-channels-removed).
- `order_updates`: on a `filled` record, `order.sz` is the filled size and `order.orig_sz` is the original order size.
- Active channels: the [channels at a glance](../api/ws/subscriptions.md#channels-at-a-glance) table lists the current set. The cut above retired `all_mids`, `active_asset_ctx` and `user_events`.

## 8. Predicted funding semantics {#8-predicted-funding-semantics}

The predicted rate is on each [`markets`](../api/rest/info/perpetuals.md#markets)
row's `funding` block:

- `rate_per_hr` is the clamped rate that the chain charges at the boundary. It is the premium after the per-asset `±cap`, not the raw premium.
- `next_payment_ts` is the next aligned per-asset settlement boundary, in ms.

Funding settles in discrete steps at per-asset boundaries (1h default). The `funding_history` samples remain the raw premium ring. The same `funding` block carries `interval_ms`, the per-asset cadence.

## 9. Rate limits {#9-rate-limits}

- Per IP: 1200 weight per minute. Allowlisted IPs are exempt.
- Per account: a `/exchange` token bucket. Metaliquidity-set signers are exempt.
- WS: 64 subscriptions per connection, down from 256. Allowlisted connections are exempt.

See [rate limits](../api/rate-limits.md).

## 10. Unchanged {#10-unchanged}

- `cloid` is unchanged. It is a `0x`-hex string.
- `oid` and `tid` changed after this release. Both are now decimal-digit strings on every response, because `tid` exceeds 2⁵³ and a JSON number loses its low digits. A request still accepts either form, and the signed action payload still binds a `uint64` `oid`. See [Ids and wire shapes](./ids-and-wire-shapes.md#id-strings).
- Signed `/exchange` actions: the typed-action digests are consensus-frozen. `asset` remains a numeric `u32` in signed actions. The `coin` and `address` change affects the read API only. It does not affect how you sign an order or a cancel. See [`POST /exchange`](../api/rest/exchange.md).

## See also {#see-also}

- [`POST /info`](../api/rest/info.md), [perpetual queries](../api/rest/info/perpetuals.md) and [spot and margin queries](../api/rest/info/spot.md)
- [WS subscriptions](../api/ws/subscriptions.md)
- [Rate limits](../api/rate-limits.md) and [Errors](../api/errors.md)
