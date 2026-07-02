---
description: Breaking API changes in node + gateway 0.7.14 — coin/address addressing, removed query types, inline margin tiers, and WS channel updates. A migration checklist for integrators and market makers.
---

# API migration — 0.7.14

:::warning
**Breaking changes.** This release changes how markets and accounts are addressed
on the read API, removes three query types, and updates several WS channels.
Signed `/exchange` actions are **unchanged**. Work through the checklist below
before upgrading a client.
:::

## At a glance

| Area | Old | New |
|------|-----|-----|
| Address a market (reads) | `asset_id` / `market_id` (numeric) | **`coin`** (symbol, e.g. `"BTC"`) |
| Address an account (reads) | `account_id` **or** `address` | **`address`** (0x hex) only |
| Candle history | `candle` | **`candle_snapshot`** (the single candle query) |
| Composite frontend snapshot | `web_data2` (REST + WS) | **removed** — compose focused reads |
| Margin ladder | `margin_table` query | **`margin_tiers`** inline on `market_info` / `markets` |
| Recent trades by window | — | **`trades_by_time`** (new) |
| WS subscription cap | 256 / connection | **64 / connection** |

## 1. Markets are addressed by `coin`

Every market-scoped read now resolves the market by its **`coin` symbol**. The
numeric `asset_id` / `market_id` request arguments are **removed** — a request
that supplies them (and omits `coin`) is rejected with
`400 {"error":"missing field coin"}`.

Affected reads: `market_info`, `markets`, `l2_book`, `recent_trades`,
`trades_by_time`, `funding_history`, `oracle_sources`, `active_asset_data`,
`fba_batch_state`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"market_info","asset_id":0}
+ {"type":"market_info","coin":"BTC"}
```

Responses echo the `coin` symbol (e.g. `recent_trades` rows carry
`"coin":"BTC"`). `market_info` / `markets` keep a **`asset_id`** field for now as
a deprecated indexer shim — **do not build against it**; it may be dropped
without a wire-version bump.

## 2. Accounts are addressed by `address`

Account-scoped reads no longer accept `account_id`; pass `address` (0x hex).

Affected reads: `open_orders`, `user_fills`, `user_fills_by_time`, `agents`,
`sub_accounts`, `rfq_user`, `pm_summary`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

The `account_id` echo field is gone from these responses.

## 3. Removed query types

| Removed | Returns now | Use instead |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` inline on [`market_info`](./rest/info/perpetuals.md#market_info) / [`markets`](./rest/info/perpetuals.md#markets) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) + [`spot_clearinghouse_state`](./rest/info/spot.md#spot_clearinghouse_state) + [`frontend_open_orders`](./rest/info.md#frontend_open_orders) + [`user_vault_equities`](./rest/info.md#user_vault_equities) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2` (WS channel) | `unknown channel: web_data2` | `account_state` + `spot_state` WS channels |

## 4. `margin_tiers` — inline notional-banded ladder

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

- `max_open_interest` — **upper bound** of the band (decimal string, size units);
  `null` = the **unbounded top tier**.
- `max_leverage` — max leverage in this band (`u8`).
- `maint_margin_ratio` — maintenance-margin ratio, **decimal bps string**
  (`"100"` = 1.00%).

Tier = the first band whose `max_open_interest` bound is not exceeded. Leverage
falls and maintenance rises as open interest grows.

## 5. New: `trades_by_time`

Recent public prints for one market over a `[start_time, end_time]` window (the
bounded ring; deep history via the gateway archive):

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

Rows share the [`recent_trades`](./rest/info/perpetuals.md#recent_trades) shape.

## 6. `markets` shape

`markets.data` is now an **object**, not an array:

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

Each `perp[]` element is the same record `market_info` returns for one `coin`.

## 7. WebSocket changes

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
- **Active channels**: `account_state`, `spot_state`, `order_updates`, `fills`,
  `user_events`, `user_fundings`, `ledger_updates`, `l2_book`, `bbo`, `trades`,
  `candles`, `all_mids`, `active_asset_ctx`, `active_asset_data`,
  `explorer_block`, `explorer_txs`.

## 8. `predicted_fundings` semantics

Keyed by `coin`; each entry is
`{coin, predicted_rate, next_funding_time}`:

- `predicted_rate` is the **clamped** rate actually charged at the boundary
  (premium passed through the per-asset `±cap`), not the raw premium.
- `next_funding_time` is the **next aligned per-asset settlement boundary** (ms).

Funding settles **discretely** at per-asset boundaries (1h default); the
`funding_history` samples remain the raw premium ring. `market_info.funding`
carries `interval_ms` (per-asset cadence) and `next_payment_ts` (the boundary).

## 9. Rate limits

- Per-IP: **1200 weight / minute** — allowlisted IPs exempt.
- Per-account `/exchange` token bucket — **metaliquidity-set signers exempt**.
- WS: **64 subscriptions per connection** (down from 256) — allowlisted
  connections exempt.

See [rate limits](./rate-limits.md).

## 10. Unchanged

- **Order / trade ids**: `oid`, `tid`, `cloid` are unchanged (`tid` is a `u64` —
  parse as a big integer, it can exceed 2⁵³).
- **Signed `/exchange` actions**: the typed-action digests are
  **consensus-frozen** — `asset` remains a numeric `u32` in signed actions. The
  `coin`/`address` change is a **read-API** change only; it does **not** affect
  how you sign an order or cancel. See [`POST /exchange`](./rest/exchange.md).

## See also

- [`POST /info`](./rest/info.md) · [perpetual queries](./rest/info/perpetuals.md) · [spot & margin queries](./rest/info/spot.md)
- [WS subscriptions](./ws/subscriptions.md)
- [Rate limits](./rate-limits.md) · [Errors](./errors.md)
