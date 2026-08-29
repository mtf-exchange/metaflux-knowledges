---
description: Breaking API changes on the MetaFlux read API — the account-scalar rename, the read-surface cut, and the earlier 0.7.14 addressing change. A migration checklist for integrators and market makers.
---

# API migrations

:::warning
**Breaking changes.** Five migrations are on this page, newest first. Signed
`/exchange` actions are **unchanged** by all five — only the RESPONSE shape and
the read surface move. Work through the checklists before upgrading a client.
:::

## The account-state lane split {#account-state-lane-split}

:::warning Not live yet
This migration is written ahead of the release that carries it. A live node still
answers the OLD flat shape, and answers `clearinghouse_state` and `option_state`
with `unknown info type`. Prepare your client against this page, then switch when
the release fires.
:::

:::info
**`account_state` is now four lane summaries, and position detail has its own
read.** The flat body carried perp margin scalars, a spot balance array and a
dex-keyed position table side by side, with nothing saying which lane a field
belonged to. It is now the account's cross-lane money figures plus one summary
per lane — `perp`, `spot`, `margin`, `option` — and the position table has left
the body.
:::

**The rule behind the split.** `account_state` answers ONE question: what the
account is worth and how close it is to liquidation. Every figure in it is
rendered from one committed block, so the set is internally consistent. Position
DETAIL is a different question, so it gets its own read. Each lane SUMMARY stays
whole inside `account_state`, so no caller has to join two frames to get one
consistent number set.

:::danger
**Never join two frames to compute one number.** A summary frame and a detail
frame can be rendered a commit apart. A health figure built from both was true at
no single block. Every frame carries `height` — compare it before you combine
anything.
:::

### Where every field went {#lane-split-field-map}

| Was, at the top level of `account_state` | Is now |
|---|---|
| `address`, `height`, `time` | unchanged |
| `abstraction`, `position_mode` | unchanged — account settings, not lanes |
| `account_value`, `total_raw_usd`, `withdrawable`, `health`, `tier` | unchanged — each is cross-lane |
| `health_deferred` | unchanged, still present only when `true` |
| `pm_net_value` | **unchanged — it stays at the top level** |
| `total_margin_used` | `perp.init_margin` — **renamed as well as moved** |
| `total_ntl_pos` | `perp.total_ntl_pos` |
| `pm_maint_margin` | `perp.pm_maint_margin` |
| `pm_concentration_penalty` | `perp.pm_concentration_penalty` |
| `balances` | `spot.balances` — the rows are unchanged, field for field |
| `clearinghouse_state` | its own read, [`clearinghouse_state`](./rest/info.md#clearinghouse_state), same wire name and same row shape |
| `cross_maintenance_margin_used` | `detail: "margin"` only — it was already only there |

Two names moved outside the body:

| Was | Is now |
|---|---|
| `option_positions` (read) | [`option_state`](./rest/info.md#option_state) — a rename, **not an alias**. The old name answers `unknown info type` |
| `account_state` with `detail: "adl"` | [`clearinghouse_state`](./rest/info.md#account_state-adl) with `detail: "adl"`. On `account_state` it is now refused with `400` |

Two new lanes have no old field to map from: `margin` (spot-margin collateral,
debt and pair count) and `option` (writer escrow, leg count, nearest expiry).
Both were previously reachable only through their own detail reads.

### The traps {#lane-split-traps}

**1. `pm_net_value` is NOT under `perp`.** Three of the four `pm_*` figures moved
into the `perp` lane; this one did not. Its cash term is the whole unified USDC
pool, and under multi-collateral it also folds haircut-valued spot balances. It
is the portfolio-margin twin of `account_value`. A client that sums the lanes
would count the same USDC twice.

**2. The held initial margin has two names, one per depth.** The full body calls
it `perp.init_margin`. `detail: "margin"` calls it `total_margin_used`, at the
top level, exactly as before. Same number, same helper — two names. Neither depth
serves the other's name.

**3. `spot.balances` is never an empty array.** The USDC row is unconditional,
even on an account that has never been funded. An empty array is a shape no real
account returns. If you see one you are reading a placeholder, not an account —
check `height`, which a placeholder stamps `0`.

**4. `option.next_expiry` is absent, not zero, when `option.legs` is `0`.** A
zero timestamp reads as 1970. It is the one non-uniform key in the body.

**5. `tier` is a string.** `"Safe"` / `"T0"` / `"T1"` / `"T2"` / `"T3"`. It has
always been a string. Type it as one, and do not accept a number in its place.

**6. There is no transition window.** One builder serves one shape. The old flat
names are not merely dropped — they are refused at the top level, so a
half-migrated body cannot ship. Prepare the client before the release, not after.

### Checklist {#lane-split-checklist}

1. **Re-type your account DTO.** This is the urgent step. A stale account type
   fails to DECODE, so every account read stops working — it does not silently
   lag. Both client SDKs carry the new type; an older build cannot parse the new
   body.
2. **Move four reads into `perp`**: `init_margin` (from `total_margin_used`),
   `total_ntl_pos`, `pm_maint_margin`, `pm_concentration_penalty`.
3. **Move `balances` to `spot.balances`.** Row fields are unchanged.
4. **Leave `pm_net_value` at the top level.** Do not move it with the other
   `pm_*` fields.
5. **Subscribe to, or poll, [`clearinghouse_state`](./rest/info.md#clearinghouse_state)
   for positions.** Same wire name, same rows, its own read and its own WS
   channel. Both require a `user` on subscribe.
6. **Rename `option_positions` to `option_state`**, in REST calls and as a WS
   channel name.
7. **Move `detail: "adl"` onto `clearinghouse_state`.** On `account_state` it now
   answers `400`.
8. **Delete any code that joins a summary and a detail frame.** Take a consistent
   number set from `account_state` alone, or compare `height` first.
9. **Handle the two new lanes** — `margin` and `option` — or ignore them safely:
   both are always present and zeroed.

See [`account_state`](./rest/info.md#account_state) for the full field table, and
[WS subscriptions](./ws/subscriptions.md#account_state) for the three channels.

# The one response envelope {#response-envelope}

:::info
**`/info` and `/exchange` now answer ONE envelope.** A success carries `data`. A
failure carries a structured `error` object with a stable `code`. This replaces
the per-endpoint response and rejection shapes.
:::

**The new shape.**

```json
{ "data": { /* payload */ } }
```

```json
{ "error": { "code": "ORDER_INVALID_PRICE", "message": "...", "details": { "field": "px", "limit": "100", "actual": "12345" } } }
```

The two keys are asymmetric on purpose. `error` appears only on a failure, so a
hot market-data read carries no dead field. `data` appears on every success and
may itself be `null`, because a read can succeed with no content.

**What changed, by call site.**

| Was | Is now | What breaks |
|---|---|---|
| `/info`: `{"type": "<t>", "data": {…}}` | `{"data": {"type": "<t>", …}}` | Only the `type` READ moves, from `body.type` to `body.data.type`. **Every payload field keeps its path** — `body.data.fills` is still `body.data.fills` |
| `/exchange` order path: `{"statuses": […]}` | `{"data": {"statuses": […]}}` | One level of unwrap |
| `/exchange` admission: `{"accepted": true, …}` | `{"data": {"accepted": true, …}}` | One level of unwrap |
| Any rejection: `{"error": "<string>"}` | `{"error": {"code", "message", "details"?}}` | `error` is an OBJECT now. A client that prints `body.error` prints `[object Object]` |
| Rejection: `{"accepted": false, …}` | (gone) | The PRESENCE of `error` is the rejection. There is no `accepted: false` |
| Per-leg: `{"error": "<reason>"}` in `statuses` | `{"error": {"code", "message", "details"?}}` | Same object as the envelope, at leg level |
| `429`: `{"status":"err","response":"…"}` | `{"error": {"code": "RATE_LIMITED", …}}` | One shape for every failure now |

**Checklist.**

1. **Unwrap `data`.** Read the payload at `body.data`, not at `body`.
2. **Move the `/info` discriminator read** from `body.type` to `body.data.type`.
3. **Stop reading `error` as a string.** It is an object. Read `error.code`.
4. **Replace every `message` match with a `code` match.** `code` is the stable
   contract; `message` is prose and can be reworded in any release. This is the
   change most likely to break a client silently — grep for every comparison
   against an error sentence.
5. **Stop reading `accepted: false`.** Test whether `error` is PRESENT.
6. **Do not treat `data: null` as a failure.** It is a success with no content.
   Test for the presence of `error`, not for a null `data`.
7. **Drop any `422` branch.** No code answers `422`. A logically invalid request
   answers `400` with the code that names it.
8. **Walk `statuses` on a grouped batch — there is none.** A batch with
   `grouping` other than `"na"` is atomic: it rejects at the action level with
   one `error` and no `statuses` array. Only an UNGROUPED batch reports per-leg
   failures.

The full code list, with the status each answers and the caller action for each,
is in [errors](./errors.md).

# The account-scalar rename {#account-scalar-rename}

:::note
**Read [the lane split](#account-state-lane-split) first.** It is newer and it
moves three of the fields named below into the `perp` lane. This section records
the RENAME; the lane split records where each renamed field now sits.
:::

:::info
**`account_state` now uses institution-standard names for its account-level
scalars.** Two fields are renamed and two are new. Only the ACCOUNT object
changes — every position row under `clearinghouse_state` keeps its own field
names.
:::

| Was | Is now | Read |
|---|---|---|
| `init_margin` | `total_margin_used` | both depths |
| `maint_margin` | `cross_maintenance_margin_used` | `detail: "margin"` only, as before |
| — | `total_raw_usd` **(new)** | both depths |
| — | `total_ntl_pos` **(new)** | full depth only |

**The old names are gone, not aliased.** A client that reads `init_margin`
receives `undefined`, which arithmetic turns into a silent `NaN` rather than an
error. Grep your client for both old names before you upgrade.

**Do not run a blind find-and-replace on `maint_margin`.** Three other fields
share the word and NONE of them changed:

| Field | Where | Status |
|---|---|---|
| `clearinghouse_state["<dex>"].positions[*].maint_margin` | position row | **unchanged** — this leg's maintenance contribution |
| `pm_maint_margin` | account object | **unchanged by this rename** — the portfolio-margin figure. The [lane split](#account-state-lane-split) later moved it to `perp.pm_maint_margin` |
| `maint_margin_ratio` / `init_margin_ratio` | `markets_meta` | **unchanged** — per-market ratios, in bps |

**The two new fields.**

- **`total_raw_usd`** — settled cash equity, whole-USDC. Realized USDC only; it
  excludes unrealized PnL, which is the one difference from `account_value`. It
  is the `settled cash` term the `withdrawable` formula starts from, so the
  formula is now reconcilable from one read.
- **`total_ntl_pos`** — mark notional of the account's CROSS positions, summed
  and unsigned. **Isolated legs are excluded.** It equals the sum of the
  `notional` of every position row whose `isolated` is `false`. Full depth only:
  `detail: "margin"` skips the position walk that produces it.

**Why the name says `cross`.** `cross_maintenance_margin_used` is the figure the
liquidation engine judges the CROSS bucket against. An isolated position posts
its own margin bucket and is liquidated per leg, so it contributes nothing to
this number. An account holding only isolated legs reports `"0"` and can still
be liquidated. **Sizing an isolated position off this field is wrong** — read
that leg's own `maint_margin` row instead. The old name did not say this, and
the scope was the same then.

Checklist:

1. Rename `init_margin` → `total_margin_used` at every read site.
2. Rename `maint_margin` → `cross_maintenance_margin_used`, but ONLY where you
   read the account object. Leave every position-row read alone.
3. If you derive the health ratio, it is now
   `account_value / cross_maintenance_margin_used` — still on `detail: "margin"`
   only. See [two meanings of health](../concepts/tiered-liquidation.md#two-meanings-of-health).
4. Upgrade the client SDK. `@metaflux-dex/client` and the Rust client carry the
   new field names; an older SDK build cannot reach them.

See [account value](../concepts/account-value.md#the-scalars) for the arithmetic
behind each scalar, and [`account_state`](./rest/info.md#account_state) for the
full field table.

# The read-surface cut {#read-surface-cut}

:::info
**One question, one read.** The `/info` surface carried several reads that
answered the same question as another read. A caller had to choose, and a wrong
choice was silent. The cut removes the duplicate in every such pair and keeps
the read that answers the question completely in one round trip.
:::

**Nothing a public caller could read is gone.** Every retired name has a
forwarding address. The full table, with the replacement for each, is
[Reads that are no longer public](./rest/info.md#retired-reads).

The four shapes of the change:

| Shape | What to do |
|---|---|
| **A read merged into a bigger one** — `agents`, `sub_accounts`, `user_to_multi_sig_signers`, `user_vault_equities`, `delegator_summary`, `user_role`, `pm_summary`, `evm_contract_bindings`, `bridge_chain_configs` | Call the read that owns the question. [`account_state`](./rest/info.md#account_state) with `detail: "overview"` carries the first six as named sub-objects; `account_state` already carries the PM figures; the EVM binding rides [`markets_meta`](./rest/info/perpetuals.md#markets_meta) `kind: "spot"`; the bridge config rows ride [`bridge_withdrawal_history`](./rest/info/bridge.md#bridge_withdrawal_history) |
| **A read became a PARAMETER** — `market_info`, `margin_summary`, `account_overview` (and its old name `web_data`), `user_fills_by_time`, `trades_by_time`, `max_builder_fee` | Same question, one read, one argument: `coin` on [`markets`](./rest/info/perpetuals.md#markets), `detail: "margin"` or `detail: "overview"` on [`account_state`](./rest/info.md#account_state), `start_time` / `end_time` on [`user_fills`](./rest/info.md#user_fills) and [`trades`](./rest/info/perpetuals.md#trades) |
| **A read was RENAMED** — `spot_deploy_state` → [`spot_deploy_auction`](./rest/info/spot.md#spot_deploy_auction), `recent_trades` → [`trades`](./rest/info/perpetuals.md#trades) | Change the `type` string. The payload is the same |
| **A read a change made UNNECESSARY** — `encode_action` | The multisig inner blob now accepts the ordinary `{type, params}` wire action, so there is nothing left to encode. UTF-8 encode the action you would post to `/exchange` and let every member sign those bytes. See [signing the inner action](../concepts/multi-sig.md#signing-the-inner-action) |
| **A read left the public API** — `mip3_deployer_oracle`, `fba_batch_state` | Operator lane. The FBA read ships publicly with its engine |
| **A read CAME BACK** — `rfq_open`, `rfq_user` | Both are public again. They shipped with the option lane, because an accept cannot be completed without them: a taker finds its own `rfq_id` and a maker finds a request to answer |
| **A read was DELETED outright** — `protocol_metrics`, `node_info`, `block_info` | None of the three is served any more. Every public fact `protocol_metrics` carried is on [`markets`](./rest/info/perpetuals.md#markets), [`markets_meta`](./rest/info/perpetuals.md#markets_meta) and [`staking_state`](./rest/info.md#staking_state); the chain id is fixed per network, see [networks](../networks.md#summary); the committed height and consensus time stamp every read, and the block head streams on [`explorer_block`](./ws/subscriptions.md#explorer_block) |
| **A read was DELETED outright** — `oracle_sources` | It served a per-market source bitmask nothing acts on. Its static facts — the ten source slots and their protocol-fixed weights — are prose on [oracle prices](../concepts/oracle-prices.md#source-table) |

**Two reads gained a field**, and both answer a question that used to need
off-wire knowledge:

- [`markets_meta[*].signing_id`](./rest/info/perpetuals.md#signing_id) — the
  uint32 you put in the EIP-712 `market` field. It replaces the deprecated
  `asset_id` shim. The signing type string is unchanged.
- [`markets_meta[*].risk_override`](./rest/info/perpetuals.md#risk_override) —
  the governance risk override in force on that market, `null` when none.

**Three WS channels are retired**: `all_mids` and `active_asset_ctx` (both
projections of [`markets`](./ws/subscriptions.md#markets) rows) and `user_events`
(a grab-bag; every event it carried has a typed home on `fills`,
`order_updates`, `ledger_updates` or `notifications`). See
[WS subscriptions](./ws/subscriptions.md#channels-at-a-glance).

# API migration — 0.7.14 {#migration-0714}

:::note
**This section is history.** It describes the earlier `coin` / `address`
addressing change. Where it names a query type the cut above retired, read the
cut's table for the current name.
:::

## At a glance {#at-a-glance}

| Area | Old | New |
|------|-----|-----|
| Address a market (reads) | `asset_id` / `market_id` (numeric) | **`coin`** (symbol, e.g. `"BTC"`) |
| Address an account (reads) | `account_id` **or** `address` | **`address`** (0x hex) only |
| Candle history | `candle` (executed-trade bars) | **`candle_snapshot`** (the single candle query) — **price** bars, `candle_type` `mark` (default) / `oracle` |
| Composite frontend snapshot | `web_data2` (REST + WS) | **removed** — compose focused reads |
| Margin ladder | `margin_table` query | **`margin_tiers`** inline on `markets_meta` |
| Recent trades by window | — | a ranged **`trades`** ask |
| WS subscription cap | 256 / connection | **64 / connection** |

## 1. Markets are addressed by `coin` {#1-markets-are-addressed-by-coin}

Every market-scoped read now resolves the market by its **`coin` symbol**. The
numeric `asset_id` / `market_id` request arguments are **removed** — a request
that supplies them (and omits `coin`) is rejected with
`400` with `INVALID_REQUEST`.

Affected reads: `markets`, `markets_meta`, `l2_book`, `trades`,
`funding_history`, `active_asset_data`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"markets","asset_id":0}
+ {"type":"markets","coin":"BTC"}
```

Responses echo the `coin` symbol (e.g. `trades` rows carry `"coin":"BTC"`).
The deprecated `asset_id` shim is gone; the number a SIGNER needs is
[`markets_meta[*].signing_id`](./rest/info/perpetuals.md#signing_id).

## 2. Accounts are addressed by `address` {#2-accounts-are-addressed-by-address}

Account-scoped reads no longer accept `account_id`; pass `address` (0x hex).

Affected reads: `open_orders`, `user_fills`, `account_state`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

The `account_id` echo field is gone from these responses.

## 3. Removed query types {#3-removed-query-types}

| Removed | Returns now | Use instead |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` inline on [`markets_meta`](./rest/info/perpetuals.md#markets_meta) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) (default and `detail: "overview"`) + [`open_orders`](./rest/info.md#open_orders) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2` (WS channel) | `unknown channel: web_data2` | `account_state` WS channel |

## 4. `margin_tiers` — inline notional-banded ladder {#4-margin_tiers--inline-notional-banded-ladder}

The maintenance-margin ladder now rides **inline** on each market record as
`margin_tiers`, an ascending list of upper-bound bands:

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` — **upper bound** of the band (decimal string, whole-USDC notional);
  `null` = the **unbounded top tier**.
- `max_leverage` — max leverage in this band (`u8`).
- `maint_margin_ratio` — maintenance-margin ratio, **decimal bps string**
  (`"100"` = 1.00%).

Tier = the first band whose `max_open_interest` is STRICTLY greater than your
position's notional — a notional landing exactly on a bound takes the next band
up. Leverage
falls and maintenance rises as open interest grows.

## 5. New: a ranged `trades` ask {#5-new-ranged-trades}

Recent public prints for one market over a `[start_time, end_time]` window (the
bounded ring; deep history via the gateway archive):

```json
{ "type": "trades", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

Rows share the un-ranged [`trades`](./rest/info/perpetuals.md#trades) shape.

## 6. `markets` shape {#6-markets-shape}

`markets.data` is now an **object**, not an array:

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

Each `perp[]` element carries a market's **dynamic** fields only. The **static** fields (precision grids, leverage/margin ladders, trade-control flags) live separately on [`markets_meta`](./rest/info/perpetuals.md#markets_meta), joined on `(coin, kind)`.

## 7. WebSocket changes {#7-websocket-changes}

- **`web_data2` channel removed** — see the replacement above.
- **`trades`**: `data` is an **array**; the on-subscribe frame
  (`is_snapshot: true`) is a **non-empty** array of recent prints (empty only if
  the market never traded), and snapshot rows carry **`users: null`**. Live
  pushes carry `users: [taker, maker]`.
- **`user_fundings`**: records now carry `{coin, payment, szi, fundingRate, time}`
  (`payment` signed whole-USDC: negative = paid, positive = received).
- **`explorer_txs`** rows carry a **`hash`** field (the `0x` action hash; empty
  `""` for a systemic entry). **`explorer_block`** streams the committed block
  header.
- **`order_updates`**: on a `filled` record, the `order.sz` is the **FILLED** size
  and `order.orig_sz` the **original** order size.
- **Active channels**: see the [channels at a glance](./ws/subscriptions.md#channels-at-a-glance)
  table for the current set. `all_mids`, `active_asset_ctx` and `user_events`
  were retired by the cut above.

## 8. Predicted funding semantics {#8-predicted-funding-semantics}

The predicted rate is on each [`markets`](./rest/info/perpetuals.md#markets)
row's `funding` block:

- `rate_per_hr` is the **clamped** rate actually charged at the boundary
  (premium passed through the per-asset `±cap`), not the raw premium.
- `next_payment_ts` is the **next aligned per-asset settlement boundary** (ms).

Funding settles **discretely** at per-asset boundaries (1h default); the
`funding_history` samples remain the raw premium ring. The same `funding` block
carries `interval_ms` (per-asset cadence).

## 9. Rate limits {#9-rate-limits}

- Per-IP: **1200 weight / minute** — allowlisted IPs exempt.
- Per-account `/exchange` token bucket — **metaliquidity-set signers exempt**.
- WS: **64 subscriptions per connection** (down from 256) — allowlisted
  connections exempt.

See [rate limits](./rate-limits.md).

## 10. Unchanged {#10-unchanged}

- **Order / trade ids**: `oid`, `tid`, `cloid` are unchanged (`tid` is a `u64` —
  parse as a big integer, it can exceed 2⁵³).
- **Signed `/exchange` actions**: the typed-action digests are
  **consensus-frozen** — `asset` remains a numeric `u32` in signed actions. The
  `coin`/`address` change is a **read-API** change only; it does **not** affect
  how you sign an order or cancel. See [`POST /exchange`](./rest/exchange.md).

## See also {#see-also}

- [`POST /info`](./rest/info.md) · [perpetual queries](./rest/info/perpetuals.md) · [spot & margin queries](./rest/info/spot.md)
- [WS subscriptions](./ws/subscriptions.md)
- [Rate limits](./rate-limits.md) · [Errors](./errors.md)
