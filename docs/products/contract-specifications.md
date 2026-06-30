---
description: The per-contract specification for every MetaFlux perpetual — instrument type, contract unit, margin, mark, oracle, funding, increments, and limits — and how to read each field live from the API.
---

# Contract specifications

:::tip
**Stable.** Every value on this page is read live, per market, from
[`POST /info markets`](../api/rest/info/perpetuals.md#markets) — the spec is data,
not a static listing. The shapes below are the integration surface an integrator
actually sees.
:::

## TL;DR

Every MetaFlux market is a **linear USDC-margined perpetual**: no expiry, settled
in USDC, valued against a manipulation-resistant [mark](../concepts/mark-prices.md)
built on an [oracle index](../concepts/oracle-prices.md). The per-contract
parameters — leverage, margin ratios, funding period and cap, price/size
increments, open-interest cap — are **per-asset and governed on-chain**, and the
authoritative copy of each is a field on the [`markets`](../api/rest/info/perpetuals.md#markets)
read. Don't hard-code them; fetch them.

This page is the reference for **what each spec field means and where it comes
from**. For the mechanics behind a field, follow the link in its row.

## The spec at a glance

| Spec | Value | Live source field |
|------|-------|-------------------|
| **Instrument type** | Linear perpetual future (no expiry, USDC-settled) | `kind: "perp"` |
| **Contract unit** | 1 unit of the underlying token, quoted & settled in USDC | `name`, `sz_decimals` |
| **Underlying** | MTF [oracle index](../concepts/oracle-prices.md) — weighted median of up to **10** external spot venues | `oracle_px` |
| **Quote / settlement / margin currency** | USDC (multi-collateral haircut for PM, below) | — |
| **Initial margin fraction** | `1 / max_leverage` | `init_margin_ratio` (bps) |
| **Maintenance margin fraction** | per-market; **3% (300 bps)** baseline, or the dynamic-risk override | `maint_margin_ratio` (bps) |
| **Max leverage** | per-market, `1..=50` at listing; per-account `updateLeverage` hard ceiling **100×** | `max_leverage` |
| **Margin tiers** | per-market notional-banded ladder (leverage ↓ / maint ↑ as notional grows) | [`margin_table`](../api/rest/info/perpetuals.md#margin_table) |
| **Mark price** | oracle-anchored median, clamped into the oracle band | `mark_px`, `mark_source` |
| **Funding** | **per-asset discrete** settlement at the asset's period boundary; per-asset **±cap (default 2%)**; settled vs oracle | `funding{...}` |
| **Funding impact notional** | depth to fill for the impact-price premium (default **$10,000**) | (Binance-formula markets) |
| **Tick size** | per-market min price increment | `tick_size` |
| **Size decimals / step** | per-market size precision + lot step | `sz_decimals`, `step_size` |
| **Min order size** | per-market minimum order | `min_order` |
| **Max order value** | OI-cap-derived size ceiling + margin gate (no fixed per-order $ cap) | [`max_market_order_ntls`](../api/rest/info/perpetuals.md#max_market_order_ntls) |
| **Open-interest cap** | per-market OI ceiling + per-second OI velocity limit | [`perps_at_open_interest_cap`](../api/rest/info/perpetuals.md#perps_at_open_interest_cap) |
| **Margin modes** | Cross / Isolated / Strict-Iso (Strict-Iso also imposable at **market** level) | `strict_isolated` |
| **Portfolio margin** | SPAN price×vol scenario grid, 100K USDC enroll floor, multi-collateral haircut | [`account_state`](../api/rest/info.md#account_state) `pm_enabled` |
| **FBA eligible** | whether [frequent batch auction](../concepts/fba.md) is enabled | `fba_enabled` |

## Reading a spec from the API

One read returns the full per-market record for every registered perp. The same
shape comes back for a single market via [`market_info`](../api/rest/info/perpetuals.md#market_info).

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"markets"}'
```

```json
{
  "asset_id": 0,
  "name": "BTC",
  "kind": "perp",
  "sz_decimals": 5,
  "mark_px": "67042.33",
  "oracle_px": "67042.33",
  "mid_px": "67042.30",
  "premium": "0.0004",
  "tick_size": "0.01",
  "step_size": "0.00001",
  "min_order": "0.0001",
  "max_leverage": 50,
  "maint_margin_ratio": "300",
  "init_margin_ratio": "200",
  "strict_isolated": false,
  "funding": {
    "rate_per_hr": "...",
    "cap_per_hr": "200",
    "interval_ms": 3600000,
    "next_payment_ts": 1700003600000
  },
  "mark_source": "oracle_median",
  "fba_enabled": false,
  "open_interest": "..."
}
```

- **Ratios are bps strings.** `maint_margin_ratio: "300"` = 3%; `init_margin_ratio:
  "200"` = 2% = `1/50`; `funding.cap_per_hr: "200"` = a 2% cap. Divide by `10000`.
- **Prices are on the whole-USDC plane** (`mark_px`, `oracle_px`, e.g. `"67042.33"`),
  already snapped to `tick_size`. **Submission fields** (`tick_size`, order
  `limit_px`, `l2_book` level `px`) are the order-book plane. See
  [two price planes](../concepts/mark-prices.md#two-price-planes-read-this-before-reading-any-number).
- **Sizes are whole units** (`step_size`, `min_order`, `open_interest`) — raw lots
  divided by `10^sz_decimals`, not the raw integer size.

## Instrument type & contract unit

Every MetaFlux market is a **linear perpetual future**:

- **Linear** — PnL is `size × Δprice` in USDC; no inverse (coin-margined) contracts.
- **Perpetual** — no expiry, no delivery. The contract is tethered to the
  underlying by [funding](../concepts/funding-rates.md), not settlement.
- **Contract unit** — one contract is **1 unit of the underlying token**. Size is
  expressed in token units at `sz_decimals` precision (`name` is the token symbol,
  e.g. `BTC`). There is no contract multiplier; `1.5` size = 1.5 of the underlying.
- **Settlement & margin currency** — USDC throughout. Collateral, margin, PnL, and
  funding are all USDC (see [the clearing plane](../concepts/margin-modes.md#how-margin-is-computed)).

Perps are entirely separate from [spot](./spot.md) — a perp position is leveraged
exposure backed by collateral, not ownership of the asset.

## Underlying — the oracle index

The contract's underlying is the MTF **[oracle index](../concepts/oracle-prices.md)**
(`oracle_px`), a per-block **weighted median of up to 10 external spot venues**
(default weight table sums to 15: Binance 3, OKX 2, Bybit 2, Coinbase 2, then
Bitget / Kraken / KuCoin / Gate / MEXC / MetaFlux-spot 1 each). A weighted median
(not mean) means a single garbage tick cannot drag the index. Stale (> 60 s) or
> 5%-outlier feeds are dropped; below 50% present weight the slot holds its last
good value. Per-symbol weights are governed (long-tail markets cold-start on the
default table until governance points the index at venues that list them).

## Initial & maintenance margin

| | Fraction | Source |
|---|---|---|
| **Initial** (open gate) | `1 / max_leverage` | `init_margin_ratio` |
| **Maintenance** (liquidation floor) | per-market; **3% (300 bps)** baseline | `maint_margin_ratio` |

- **Initial margin** is the conservative open gate: an order opening exposure must
  post `ceil(notional / max_leverage)` of free collateral (rounded up). `reduce_only`
  orders bypass it. So `init_margin_ratio = 1 / max_leverage`.
- **Maintenance margin** sits below initial, so a position can ride down to the
  maintenance floor before [liquidation](../concepts/tiered-liquidation.md). The
  baseline is **3%**; a per-market dynamic-risk override replaces it.
- **Leverage caps**: a market lists with `max_leverage` in `1..=50`; a per-account
  [`update_leverage`](../api/rest/exchange.md#update_leverage) is bounded by the
  per-market cap and a global **100×** hard ceiling.

### Dynamic-risk margin tiers

Per-market risk is **governed on-chain and auto-tunable** (driven by 30-day
realized volatility), not a static table. A market's dynamic-risk override carries:

- `max_leverage` — the per-market leverage cap.
- `maint_margin_ratio` — the per-market maintenance fraction.
- `funding_rate_cap` — the per-market funding cap (below).
- a **notional-banded tier ladder** — ascending bands, each `{lower_bound_notional,
  max_leverage, maint_margin_ratio}`. The applicable tier is the **highest band
  whose lower bound ≤ the position notional**: as a position grows, leverage steps
  **down** and maintenance steps **up**, so large positions are margined harder
  (HL-style).

The [`margin_table`](../api/rest/info/perpetuals.md#margin_table) read returns the
effective `{max_leverage, maint_margin_ratio, init_margin_ratio}` per asset (the
override, else the static baseline). See [margin modes](../concepts/margin-modes.md)
and [tiered liquidation](../concepts/tiered-liquidation.md).

## Mark price

`mark_px` (`mark_source: "oracle_median"`) is the protocol's authoritative price
for margin, liquidation, funding, and trigger evaluation — **not** the last trade.
It is an **oracle-anchored median** of present components (oracle anchor + basis
EMA, internal book mid, external-perp median), then **clamped into the oracle band**
(`oracle × [1 − band, 1 + band]`, default ±5%, per-market `band_ppm` override) so a
thin-book wash print can move the mark at most ±band. A lone internal-book mid is
rejected. Full mechanics: [mark prices](../concepts/mark-prices.md).

## Funding

:::info
**Funding is per-asset DISCRETE — not continuous, and not a fixed global hour.**
Each market settles funding **only at its own funding-period boundary**, and the
period is a **per-asset governed parameter** (e.g. a major may run **8h**, a meme
market **1h**; default **1h**).
:::

| Field | Meaning |
|-------|---------|
| `funding.rate_per_hr` | Latest funding-rate sample (bps) |
| `funding.cap_per_hr` | Per-asset funding **cap** (bps) — default **2% (200 bps)** |
| `funding.interval_ms` | Settlement period for the market (default `3600000` = 1h) |
| `funding.next_payment_ts` | Next settlement boundary (unix ms) |

How a settlement works:

- A boundary is `floor(now / period) × period` — an **absolute** multiple of the
  asset's period, derived from consensus time (no wall-clock, no drift; every node
  settles at the identical bucket). Between boundaries **nothing moves**.
- At a crossed boundary the position pays the **full period's** funding in one
  discrete step: `clamp(rate, ±cap) × notional`, **settled against the oracle**.
  The realized per-settlement funding is therefore bounded to the per-asset cap
  (default **±2%** of notional); a per-market `funding_rate_cap` override replaces
  the default.
- Funding is a **long↔short transfer** (zero-sum), never revenue to the venue. It
  is gated off (decays to 0) when the oracle is stale or untrusted.
- The rate itself is derived from the per-asset premium-index EMA plus a small
  interest term — see [funding rates](../concepts/funding-rates.md). Per-asset
  period and formula are set by on-chain governance.

Query the live rate + next boundary per market with
[`predicted_fundings`](../api/rest/info/perpetuals.md#predicted_fundings); the
premium-sample history with [`funding_history`](../api/rest/info/perpetuals.md#funding_history).

### Funding impact notional

On markets using the impact-price (Binance-style) funding formula, the premium that
drives funding is measured from the **impact price** — the volume-weighted price to
fill a fixed clip of depth, default **$10,000** notional (per-asset overridable) —
not the last trade or top-of-book. You must move genuine depth, not print one lot,
to move funding.

## Price & size increments

| Field | Meaning | Plane |
|-------|---------|-------|
| `tick_size` | Minimum price increment | order-book plane (whole-USDC string) |
| `sz_decimals` | Size precision (decimals) of the underlying token | — |
| `step_size` | Lot step (`= 10^-sz_decimals`) | whole units |
| `min_order` | Minimum order size | whole units |

`mark_px` / `oracle_px` reads are snapped to `tick_size`, so a read never shows
sub-tick precision. Submit order `limit_px` on the order-book plane and order `size`
as a multiple of `step_size`, at or above `min_order`.

## Order & position limits

MetaFlux bounds risk by **open interest and the margin gate**, rather than a fixed
per-order dollar cap:

- **Max order value** — [`max_market_order_ntls`](../api/rest/info/perpetuals.md#max_market_order_ntls)
  returns the per-asset OI-cap-derived size ceiling (the matching layer converts to
  notional at the live mark). An order's notional is additionally bounded by your
  free collateral × `max_leverage` (the initial-margin gate).
- **Open-interest cap** — each market carries an OI ceiling plus a per-second OI
  **velocity** limit (an OI-increasing order is rejected once the 1-second window
  hits the ceiling). [`perps_at_open_interest_cap`](../api/rest/info/perpetuals.md#perps_at_open_interest_cap)
  lists assets currently at/over their cap. `open_interest` on the market record is
  true position OI (positions outstanding), not the book's resting depth.

## Account & margin modes

Per-asset margin mode, surfaced via `account_state` and the market `strict_isolated`
flag (full semantics: [margin modes](../concepts/margin-modes.md)):

| Mode | Collateral | PM eligible |
|------|-----------|-------------|
| **Cross** | Account-wide free balance | Yes |
| **Isolated** | Pre-allocated per-asset bucket | No |
| **Strict-Iso** | Per-asset bucket, excluded from PM netting | No |

**Strict-Iso can also be imposed at the market level.** When a market's
`strict_isolated` field is `true`, the market is **mode-2-only**: every new position
is force-stamped strict-isolated regardless of the trader's requested mode, and a
cross open (or an `update_leverage` → cross) on that market is rejected. This is a
**governance** control for new / risky / illiquid listings — distinct from a trader
choosing Strict-Iso on their own position.

## Portfolio margin

Opt-in cross-asset margin (`account_state` `pm_enabled`) that replaces the classical
per-asset maintenance sum with a single risk number from a **SPAN-style scenario
grid** (full mechanics: [portfolio margin](../concepts/portfolio-margin.md)):

| Parameter | Value |
|-----------|-------|
| Price shocks | ±5%, ±10%, ±20% |
| Vol shocks | ±20%, ±50% |
| Grid | 6 × 4 = **24 scenarios** (worst-case loss across the grid) |
| Concentration | 50% threshold / 10% penalty on the over-concentrated portion |
| Enroll floor | **100,000 USDC** equity (governance-set) |

Hedged / correlated positions net inside the grid, so a balanced book margins at a
fraction of classical. **Multi-collateral PM** (preview): governance can make a
non-USDC spot asset count toward an enrolled account's PM value at
`balance × mark × haircut` (a per-asset haircut weight in `(0, 1]`), folded into the
grid as a spot leg — letting a portfolio post collateral beyond plain USDC.

## MTF vs Hyperliquid

MetaFlux adapts the Hyperliquid perp model; where the contract spec **differs**:

| Area | Hyperliquid model | MetaFlux |
|------|-------------------|----------|
| **Funding** | Uniform ~1h cadence, fixed cap | **Per-asset discrete** settlement at a **governed per-asset period** (e.g. 8h major / 1h meme), per-asset **±cap (default 2%)**, settled vs oracle |
| **Strict isolation** | Isolated is a per-user position choice | Strict-Iso is also **market-level** — governance can force a whole market mode-2-only (new / risky listings) |
| **Portfolio margin** | HLP-style cross margin | **SPAN** price×vol scenario grid (24 scenarios) + 100K floor + **multi-collateral haircut** (non-USDC spot as PM collateral) |
| **Risk parameters** | Largely static tiers | **Governed on-chain + dynamic** — `max_leverage`, `maint_margin_ratio`, `funding_rate_cap`, and the notional-banded tier ladder auto-tune from 30-day realized volatility |

These are protocol-level choices, not a wire-compatible shim — MetaFlux is its own
L1 with an [MTF-native API](../integration/migrating-from-hl.md), not a Hyperliquid
deployment.

## See also

- [`markets`](../api/rest/info/perpetuals.md#markets) / [`market_info`](../api/rest/info/perpetuals.md#market_info) — the live per-market spec record
- [`margin_table`](../api/rest/info/perpetuals.md#margin_table) · [`max_market_order_ntls`](../api/rest/info/perpetuals.md#max_market_order_ntls) · [`perps_at_open_interest_cap`](../api/rest/info/perpetuals.md#perps_at_open_interest_cap)
- [Perpetuals](./perpetuals.md) — the product overview
- [Margin modes](../concepts/margin-modes.md) · [Portfolio margin](../concepts/portfolio-margin.md) · [Tiered liquidation](../concepts/tiered-liquidation.md)
- [Mark prices](../concepts/mark-prices.md) · [Oracle prices](../concepts/oracle-prices.md) · [Funding rates](../concepts/funding-rates.md)
- [MIP-3](../mip/mip-3.md) — permissionless perp market deploy (how a new spec is created)
