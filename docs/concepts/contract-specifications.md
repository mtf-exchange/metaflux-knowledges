---
description: The per-contract specification for every MetaFlux perpetual (instrument type, contract unit, margin, mark, oracle, funding, increments and limits) and how to read each field from the API.
---

# Contract specifications

This page lists the specification fields of a MetaFlux perpetual and says where each value comes from.

:::tip
**Stable.** The API serves every value on this page in real time, for each market, from
[`POST /info markets`](../api/rest/info/perpetuals.md#markets). The spec is data, not a static
listing. The shapes below are what an integrator sees.
:::

## Overview {#tldr}

Every MetaFlux market is a linear, USDC-margined perpetual. It has no expiry and settles in USDC.
The chain values it against a [mark](../concepts/mark-prices.md) that resists manipulation and
rests on an [oracle index](../concepts/oracle-prices.md). The per-contract parameters are leverage,
margin ratios, funding period and cap, price and size increments, and the open-interest cap. They
are set per asset and governed on-chain. The authoritative copy of each is a field on the
[`markets`](../api/rest/info/perpetuals.md#markets) read. Fetch these values. Do not hard-code
them.

This page says what each spec field means and where it comes from. For the mechanics behind a
field, follow the link in its row.

## The spec at a glance {#the-spec-at-a-glance}

| Spec | Value | Source field |
|------|-------|-------------------|
| Instrument type | Linear perpetual future (no expiry, USDC-settled) | `kind: "perp"` |
| Contract unit | 1 unit of the underlying token, quoted and settled in USDC | `name`, `sz_decimals` |
| Underlying | MTF [oracle index](../concepts/oracle-prices.md): weighted median of up to 10 external spot venues | `oracle_px` |
| Quote, settlement and margin currency | USDC (multi-collateral haircut for PM, below) | — |
| Initial margin fraction | `1 / max_leverage` | `init_margin_ratio` (bps) |
| Maintenance margin fraction | Per market. 3% (300 bps) baseline, or the dynamic-risk override | `maint_margin_ratio` (bps) |
| Max leverage | Per market, `1..=50` at listing. The per-account `updateLeverage` hard ceiling is 100× | `max_leverage` |
| Margin tiers | Per-market notional-banded ladder (leverage falls and maintenance rises as notional grows) | `margin_tiers` (inline on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta)) |
| Mark price | Oracle-anchored median, clamped into the oracle band | `mark_px`, `mark_source` |
| Funding | Per-asset discrete settlement at the asset's period boundary. Per-asset ±cap (default 2%). Settled against the oracle | `funding{...}` |
| Funding impact notional | Depth to fill for the impact-price premium (default $10,000) | (Binance-formula markets) |
| Tick size | Per-market minimum price increment | `tick_size` |
| Size decimals and step | Per-market size precision and lot step | `sz_decimals`, `step_size` |
| Min order size | Per-market minimum order | `min_order` |
| Max order value | Margin gate plus the market's remaining open-interest headroom. There is no fixed per-order dollar cap | [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `max_market_order_ntl` |
| Open-interest cap | The cap the chain enforces. On a native perp market, the lower of the governance-set cap and the [capacity cap](../api/rest/info/perpetuals.md#oi-cap-capacity). On a deployer market, the cap its deployer set with [`perp_set_oi_cap`](../api/rest/exchange/deploy-perp.md#perp_set_oi_cap). A per-second OI velocity limit also applies | [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `oi_cap`, `oi_cap_usd`, `oi_cap_bound` vs [`markets`](../api/rest/info/perpetuals.md#markets) `open_interest` |
| Margin modes | Cross, Isolated and Strict-Iso. Strict-Iso can also apply at market level | `strict_isolated` |
| Portfolio margin | SPAN price and vol scenario grid, 100K USDC enroll floor, multi-collateral haircut | [`account_state`](../api/rest/info/account.md#account_state) `abstraction` |
| FBA eligible | Whether [frequent batch auction](../concepts/fba.md) is enabled | `fba_enabled` |

## Reading a spec from the API {#reading-a-spec-from-the-api}

One read returns the full universe. `markets` responds with
`{ "perp": [ … ], "spot": { "pairs": […], "tokens": […] } }`. Each `perp[]` element is one
per-market record. It has the same shape that
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) returns for a single market by
`coin`. One such record:

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"markets"}'
```

```json
{
  "coin": "BTC",
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
  "margin_tiers": [
    { "max_open_interest": "100000", "max_leverage": 50, "maint_margin_ratio": "100" },
    { "max_open_interest": null,     "max_leverage": 5,  "maint_margin_ratio": "1000" }
  ],
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

- Ratios are bps strings. `maint_margin_ratio: "300"` is 3%. `init_margin_ratio: "200"` is 2%, which
  is `1/50`. `funding.cap_per_hr: "200"` is a 2% cap. Divide by `10000`.
- Prices are on the whole-USDC plane (`mark_px`, `oracle_px`, for example `"67042.33"`). The chain
  snaps them to `tick_size`. The submission fields are on the order-book plane: `tick_size`, order
  `limit_px` and the `l2_book` level `px`. See
  [two price planes](../concepts/mark-prices.md#two-price-planes-read-this-before-reading-any-number).
- Sizes are whole units (`step_size`, `min_order`, `open_interest`). They are the raw lots divided
  by `10^sz_decimals`, not the raw integer size.

## Instrument type and contract unit {#instrument-type--contract-unit}

Every MetaFlux market is a linear perpetual future:

- Linear: PnL is `size × Δprice` in USDC. There are no inverse (coin-margined) contracts.
- Perpetual: there is no expiry and no delivery. [Funding](../concepts/funding-rates.md), not
  settlement, ties the contract to the underlying.
- Contract unit: one contract is 1 unit of the underlying token. Size is in token units at
  `sz_decimals` precision. `name` is the token symbol, for example `BTC`. There is no contract
  multiplier. A size of `1.5` is 1.5 of the underlying.
- Settlement and margin currency: USDC throughout. Collateral, margin, PnL and funding are all USDC
  (see [the clearing plane](../concepts/margin-modes.md#how-margin-is-computed)).

Perps are separate from [spot](../products/spot.md). A perp position is leveraged exposure backed
by collateral. It is not ownership of the asset.

## Oracle index as underlying {#underlying--the-oracle-index}

The underlying of the contract is the MTF [oracle index](../concepts/oracle-prices.md)
(`oracle_px`). It is a per-block weighted median of up to 10 external spot venues. The default
weight table sums to 15: Binance 3, OKX 2, Bybit 2, Coinbase 2, then Bitget, Kraken, KuCoin, Gate,
MEXC and MetaFlux-spot 1 each. A weighted median, not a mean, means one garbage tick cannot drag
the index. The index drops feeds that are stale (over 60 s) or more than 5% off the median. Below
50% present weight, the slot holds its last good value. Governance sets the per-symbol weights.
Long-tail markets start on the default table until governance points the index at venues that list
them.

## Initial and maintenance margin {#initial--maintenance-margin}

| | Fraction | Source |
|---|---|---|
| Initial (open gate) | `1 / max_leverage` | `init_margin_ratio` |
| Maintenance (liquidation floor) | Per market. 3% (300 bps) baseline | `maint_margin_ratio` |

- Initial margin is the conservative open gate. An order that opens exposure must post
  `ceil(notional / max_leverage)` of free collateral, rounded up. `reduce_only` orders bypass the
  gate. So `init_margin_ratio = 1 / max_leverage`.
- Maintenance margin sits below initial margin. A position can ride down to the maintenance floor
  before [liquidation](../concepts/tiered-liquidation.md). The baseline is 3%. A per-market
  dynamic-risk override replaces it.
- Leverage caps: a market lists with `max_leverage` in `1..=50`. The per-market cap and a global
  100× hard ceiling bound a per-account
  [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage).

### Dynamic-risk margin tiers {#dynamic-risk-margin-tiers}

Governance sets per-market risk on-chain. It auto-tunes from 30-day realized volatility and is not
a static table. A market's dynamic-risk override carries:

- `max_leverage`: the per-market leverage cap.
- `maint_margin_ratio`: the per-market maintenance fraction.
- `funding_rate_cap`: the per-market funding cap (see [Funding](#funding)).
- A notional-banded tier ladder: ascending upper-bound bands, each
  `{max_open_interest, max_leverage, maint_margin_ratio}`. The applicable tier is the first band
  whose `max_open_interest` is strictly greater than the selecting value. `null` marks the
  unbounded top band. As the band rises, leverage steps down and maintenance steps up.

  Callers often get two details wrong. First, the comparison is strict. A value that lands exactly
  on a published `max_open_interest` belongs to the next band up. Second, despite the field name,
  the ladder selects on your own position's notional. The market's open interest never enters it.

The ladder ships inline as `margin_tiers` on the
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) and
[`markets`](../api/rest/info/perpetuals.md#markets) record. Each tier is
`{max_open_interest: string|null, max_leverage, maint_margin_ratio: bps-string}`. The standalone
`margin_table` read is removed. See [margin modes](../concepts/margin-modes.md) and
[tiered liquidation](../concepts/tiered-liquidation.md).

## Mark price {#mark-price}

`mark_px` (`mark_source: "oracle_median"`) is the authoritative price of the protocol for margin,
liquidation, funding and trigger evaluation. It is not the last trade. It is an oracle-anchored
median of the present components: the oracle anchor plus basis EMA, the internal book mid and the
external-perp median. The chain then clamps it into the oracle band, `oracle × [1 − band, 1 + band]`.
The default band is ±5%, and a per-market `band_ppm` override can replace it. So a thin-book wash
print can move the mark by at most ±band. The chain rejects a lone internal-book mid. For the full
mechanics, see [mark prices](../concepts/mark-prices.md).

## Funding {#funding}

:::info
Funding is discrete for each asset. It is not continuous, and there is no fixed global hour.
Each market settles funding only at its own funding-period boundary. The period is a governed
per-asset parameter. For example, a major can run 8h and a meme market 1h. The default is 1h.
:::

| Field | Meaning |
|-------|---------|
| `funding.rate_per_hr` | Latest funding-rate sample (bps) |
| `funding.cap_per_hr` | Per-asset funding cap (bps). Default 2% (200 bps) |
| `funding.interval_ms` | Settlement period for the market (default `3600000`, which is 1h) |
| `funding.next_payment_ts` | Next settlement boundary (unix ms) |

A settlement works like this:

- A boundary is `floor(now / period) × period`. It is an absolute multiple of the period of the
  asset, derived from consensus time. There is no wall clock and no drift. Every node settles at
  the same bucket. Nothing moves between boundaries.
- At a crossed boundary, the position pays the full period's funding in one discrete step:
  `clamp(rate, ±cap) × notional`, settled against the oracle. So the cap bounds the realized
  funding of each settlement. The per-asset default is ±2% of notional. A per-market
  `funding_rate_cap` override replaces the default.
- Funding is a zero-sum transfer between longs and shorts. It is never revenue to the venue. It
  decays to 0 when the oracle is stale or untrusted.
- The rate comes from the per-asset premium-index EMA plus a small interest term. See
  [funding rates](../concepts/funding-rates.md). On-chain governance sets the per-asset period and
  formula.

Query the current rate and next boundary for each market with the
[`markets`](../api/rest/info/perpetuals.md#markets) `funding` block. Query the premium-sample
history with [`funding_history`](../api/rest/info/perpetuals.md#funding_history).

### Funding impact notional {#funding-impact-notional}

Some markets use the impact-price (Binance-style) funding formula. On those markets, the premium
that drives funding comes from the impact price. This is the volume-weighted price to fill a fixed
clip of depth. The default is $10,000 of notional, and each asset can override it. It is not the
last trade or the top of the book. To move funding, you must move real depth. One printed lot does
not move it.

## Price and size increments {#price--size-increments}

| Field | Meaning | Plane |
|-------|---------|-------|
| `tick_size` | Minimum price increment | order-book plane (whole-USDC string) |
| `sz_decimals` | Size precision (decimals) of the underlying token | — |
| `step_size` | Lot step (`= 10^-sz_decimals`) | whole units |
| `min_order` | Minimum order size | whole units |

The chain snaps `mark_px` and `oracle_px` reads to `tick_size`, so a read never shows sub-tick
precision. Submit order `limit_px` on the order-book plane. Submit order `size` as a multiple of
`step_size`, at or above `min_order`.

:::warning
`sz_decimals` is per market, and it can change. Read it. Never hard-code it.
A perp reads `0` until a governance listing vote gives that market a precision. At `0`, only whole
units trade, so `step_size` is one whole coin. Several active perps read `0` today for this reason.
The vote that fixes one moves its `step_size` by orders of magnitude. A client that cached
`sz_decimals` then sizes every order on that market wrong. Re-read it from `markets_meta` and do
not store it.

The vote that performs a raise is in effect since
[block 11,550,001](../changelog/block-11550001.md#size-plane). It rides the governance listing
vote. Encode sizes to the rules below before a raise enacts on a market you trade, not after.

What a raise does: the vote can only raise a precision. The chain refuses a decrease. The vote
multiplies every stored lot count on that market by `10^Δ`. This covers positions, resting orders,
triggers, TWAP parents, open interest and the OI cap. So no real quantity moves. Your position is
the same number of coins, at the same entry price, with the same PnL and the same margin. Only the
integer that expresses it gets bigger, because each lot got smaller.

An order signed before the raise executes `10^Δ` smaller. An order carries a raw lot count, and you
encode that from `sz_decimals`. A raise does not reach an order that is already signed and in
flight. On a raise from `0` to `5`, an order that meant 2 whole coins lands as 2 lots, which is
`0.00002` coins. The direction is always smaller, so you cannot overspend. But a market maker that
does not re-read keeps quoting `10^Δ` too thin.

Re-read `markets_meta` when a listing vote enacts. That is the only step you need.
:::

## Order and position limits {#order--position-limits}

MetaFlux bounds risk by open interest and the margin gate. It sets no fixed per-order dollar cap.

- Max order value: no fixed per-order cap exists. Your free collateral times `max_leverage` bounds
  an order (the initial-margin gate). The remaining open-interest headroom of the market bounds
  the whole market. It is
  [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `max_market_order_ntl`. That value
  is a size, not a notional.
- Open-interest cap: `oi_cap` on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) is
  the cap the chain enforces, in size units. On a native perp market, it is the lower of the
  governance-set cap and the [capacity cap](../api/rest/info/perpetuals.md#oi-cap-capacity). On a
  deployer market, it is the cap its deployer set with
  [`perp_set_oi_cap`](../api/rest/exchange/deploy-perp.md#perp_set_oi_cap). The capacity cap does
  not apply there. The chain recomputes the capacity cap every block. It uses the backstop capacity
  of the protocol and the worst loss of the market per unit of notional. `oi_cap_usd` gives its
  USDC value at the committed risk mark. `oi_cap_bound` names the source. At the cap, or when the
  new exposure of an order would pass it, the chain refuses an order that opens, extends or flips a
  position and is priced through the committed mark. On a self-priced market, it refuses every such
  order. A passive order rests. The cap never closes a position.
- Open-interest velocity: a separate per-second limit. The chain rejects an OI-increasing order
  once the 1-second window reaches its ceiling.
- `open_interest` on the [`markets`](../api/rest/info/perpetuals.md#markets) record is true
  position OI (positions outstanding). It is not the resting depth of the book.

Every native perp market carries the capacity cap. A deployer market carries the cap its deployer
set. Both are in effect since [block 25,599,540](../changelog/block-25599540.md#oi-cap-capacity).
Before that block, `oi_cap` was the governance-set cap only, no market had one, and every market
was uncapped.

## Account and margin modes {#account--margin-modes}

Each asset has a margin mode. `account_state` and the market `strict_isolated` flag show it. For
the full semantics, see [margin modes](../concepts/margin-modes.md).

| Mode | Collateral | PM eligible |
|------|-----------|-------------|
| Cross | Account-wide free balance | Yes |
| Isolated | Pre-allocated per-asset bucket | No |
| Strict-Iso | Per-asset bucket, excluded from PM netting | No |

Strict-Iso can also apply at the market level. When the `strict_isolated` field of a market is
`true`, the market allows mode 2 only. The chain stamps every new position strict-isolated,
whatever mode the trader requests. It rejects a cross open on that market, and an `update_leverage`
to cross. Governance uses this control for new, risky or illiquid listings. It differs from a
trader who chooses Strict-Iso for their own position.

## Portfolio margin {#portfolio-margin}

Portfolio margin is an opt-in cross-asset margin (`account_state` `abstraction == "portfolio"`). It
replaces the classical per-asset maintenance sum with one risk number from a SPAN-style scenario
grid. For the full mechanics, see [portfolio margin](../concepts/portfolio-margin.md).

| Parameter | Value |
|-----------|-------|
| Price shocks | ±5%, ±10%, ±20% |
| Vol shocks | ±20%, ±50% |
| Grid | 6 × 4 = 24 scenarios (worst-case loss across the grid) |
| Concentration | 50% threshold, 10% penalty on the over-concentrated portion |
| Enroll floor | 100,000 USDC equity (governance-set) |

Hedged and correlated positions net inside the grid. A balanced book margins at a fraction of
classical margin. Multi-collateral PM is in preview. Governance can make a non-USDC spot token count
toward the PM value of an enrolled account at `balance × mark × haircut`. The haircut is a
per-token weight in `(0, 1]`. The mark is the oracle price of the perpetual that governance names
for the token, or of the same-symbol perpetual when none is named. The grid takes it in as a spot
leg, so a portfolio can post collateral beyond plain USDC. See
[which tokens count](./portfolio-margin.md#pm-collateral-eligibility).

## MTF vs HL {#mtf-vs-hyperliquid}

MetaFlux adapts the HL perp model. The contract spec differs in these areas:

| Area | Hyperliquid model | MetaFlux |
|------|-------------------|----------|
| Funding | Uniform ~1h cadence, fixed cap | Per-asset discrete settlement at a governed per-asset period (for example 8h major, 1h meme). Per-asset ±cap (default 2%). Settled against the oracle |
| Strict isolation | Isolated is a per-user position choice | Strict-Iso also applies at market level. Governance can force a whole market to mode 2 only (new or risky listings) |
| Portfolio margin | HLP-style cross margin | SPAN price and vol scenario grid (24 scenarios), 100K floor and multi-collateral haircut (non-USDC spot as PM collateral) |
| Risk parameters | Largely static tiers | Governed on-chain and dynamic. `max_leverage`, `maint_margin_ratio`, `funding_rate_cap` and the notional-banded tier ladder auto-tune from 30-day realized volatility |

These are protocol-level choices. They are not a wire-compatible shim. MetaFlux is its own L1 with
an [MTF-native API](../integration/migrating-from-hl.md). It is not an HL deployment.

## See also {#see-also}

- [`markets`](../api/rest/info/perpetuals.md#markets) and [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta): the current and static halves of the per-market spec record
- `margin_tiers` and `oi_cap`, inline on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta)
- [Perpetuals](../products/perpetuals.md): the product overview
- [Margin modes](../concepts/margin-modes.md), [Portfolio margin](../concepts/portfolio-margin.md) and [Tiered liquidation](../concepts/tiered-liquidation.md)
- [Mark prices](../concepts/mark-prices.md), [Oracle prices](../concepts/oracle-prices.md) and [Funding rates](../concepts/funding-rates.md)
- [MIP-3](../mip/mip-3.md): permissionless perp market deploy (how a new spec is created)
