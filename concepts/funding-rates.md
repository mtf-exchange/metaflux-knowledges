# Funding rates

{% hint style="success" %}
**Stable.**
{% endhint %}

## TL;DR

Perpetual positions accrue a continuous funding payment (settled every **8 s** on-chain) proportional to the gap between **mark price** and an EMA-smoothed **oracle price**. Longs pay shorts when mark > oracle; shorts pay longs when mark < oracle. The cap is a per-market governance parameter (default **`±4% / hour`**).

## Why funding exists

Perps have no expiry, so there's no arbitrage force to peg them to the underlying. Funding does that job: when perp price drifts above spot, longs pay, which incentivises shorts and disincentivises longs until the perp drifts back down. The protocol never takes either side — it's user-to-user.

## Formula

> The TL;DR above is the conceptual model. The numbers below are the **implemented** values. Where the prose and the code differ, the code wins; the differences are flagged inline.

### How it's computed

Funding is driven by a **deterministic EMA** of the premium (mark − oracle), settled every **8 seconds**, not hourly. The cap is **4 % / hour**, not 0.05 %.

Two begin-block effects run the cycle, each behind an 8000 ms `BucketGuard`:

- **effect 4 `update_funding_rates`** — folds the latest premium sample into the per-asset EMA, then clamps.
- **effect 2 `distribute_funding`** — settles each open position against the cumulative funding index.

#### 1. Premium EMA (per market)

The EMA accumulator stores a fixed-point fraction `(num, denom)` — no floats, exact `rust_decimal::Decimal` arithmetic so node-to-node state is bit-identical. Each sample folds in as:

```
num'   = num   * decay + sample
denom' = denom * decay + 1
value  = num / denom
```

- `sample` = latest premium for the asset × the per-asset `funding_rate_multiplier` (default `1.0`; auto-driven by the dynamic-risk engine).
- `decay = 0.5` (proposed default → ≈ 7 s half-life at the 5 s sample cadence). Clamped to `[0, 1]` at update time.
- Sample cadence: **5 s**; EMA fold + settle cadence: **8000 ms** (`funding_update_guard` / `funding_distribute_guard`).

> **Status:** the full funding loop is **live** end to end. Each 8 s period the rate driver samples the premium from committed state (`premium = (mark − oracle) / oracle`, one sample per perp market) and folds it into the per-asset EMA (capped); settlement then advances the cumulative funding index by the accrued rate and moves `size × Δindex` between position owners' balances (zero-sum: longs pay shorts or vice versa, no mint/burn). So a perp trading above its index drives a positive rate which charges longs — all from committed market divergence, no external premium feeder. Conservation- and determinism-fuzzed, with a 4-node e2e proving divergence → premium → EMA → index → balance transfer.

#### 2. Cap (clamp)

After the EMA update, the absolute value is clamped to the per-hour cap by truncating the running numerator (preserves `denom > 0`):

```
cap_per_hour = 0.04          # 4 %/h default
if |value| > cap_per_hour:
    num = sign(value) * cap_per_hour * denom
```

The cap is a per-market governance parameter: a `dynamic_risk_overrides[asset].funding_rate_cap` replaces the `0.04` default when set.

#### 3. Payment (per position, per settle)

Funding accrues into a cumulative index per market (`clearinghouse.cumulative_funding`); each position carries its last-settled index (`funding_entry`). At settle:

```
payment = size_signed * oracle_px * (cum_global - funding_entry) * funding_rate_multiplier[asset]
funding_entry := cum_global      # roll forward
```

(The arithmetic is wired and determinism-locked; the actual balance transfer lands with full BOLE settlement.)

| Symbol | Meaning / plane |
|--------|-----------------|
| `size_signed` | Signed position size; `i128`. Long > 0, short < 0. |
| `oracle_px` | Composed oracle price — whole-USDC `Decimal` plane (see [mark prices](./mark-prices.md)). |
| `cum_global − funding_entry` | Cumulative funding accrued for this market since the position last settled. |
| `decay` | EMA decay 0.5. |
| `cap_per_hour` | Default `0.04` (4 %/h); per-market override via dynamic risk. |
| `funding_rate_multiplier` | Per-asset multiplier, default `1.0`, auto-driven by dynamic risk. |

`funding_rate` (the EMA value) is signed: positive → longs pay shorts; negative → shorts pay longs.

**Base interest:** `0.0000125/h` (= `0.01%/8h`) — the baseline carry the premium EMA is added to.

> ⚠️ **Correction vs. prior text.** The older prose said "every hour", "60-minute EMA window", and "cap 0.05 %/hour". The implementation settles every **8 s**, the EMA `decay` is **0.5** (≈ 7 s half-life), and the cap is **4 %/hour**. The hourly mental model is fine for back-of-envelope carry math, but the on-chain cadence and cap are as above.

## Payment cadence

Funding settles **every 8 seconds** (the `funding_distribute_guard` interval), driven by consensus-derived block timestamps — not wall-clock hours. Positions are settled against the cumulative funding index, so a position opened mid-interval only pays for the accrual since it opened (no "snapshot at the hour" step).

```
every 8000ms (BucketGuard fires):
  effect 4  ─── fold latest premium into per-asset EMA, clamp to cap
  effect 2  ─── settle each open position vs cumulative_funding index
```

Payments settle as balance adjustments — no on-chain trade, no fee. They show on the user's history as `kind: "funding"`.

## Worked example

Market: BTC perp, current state (oracle plane in whole USDC):

```
mark         = 100.50
oracle       = 100.00
premium      = mark - oracle = 0.50
EMA(premium) settles toward 0.50 with decay 0.5 over a few 5s samples
funding cap  = 4% / hour (default)
```

Suppose the EMA value resolves to a funding rate of `+0.0005` (0.05 %) for the interval (well inside the 4 %/h cap). Account positions:

```
long 1 BTC      → pays funding
short 0.5 BTC   → receives funding
```

```
funding_rate = clamp(ema_value, -0.04, +0.04) = +0.0005   (not capped — far below 4%/h)

long 1 BTC:
  payment = +1   * oracle_px * Δcum  ≈ +1   * 100.00 * 0.0005 = +0.0500 USDC  (long pays)

short 0.5 BTC:
  payment = -0.5 * oracle_px * Δcum  ≈ -0.5 * 100.00 * 0.0005 = -0.0250 USDC  (short receives 0.0250)
```

(Payment uses `size_signed * oracle_px * (cum_global - funding_entry)`; here `Δcum` is the funding accrued since the position last settled.) Settled every 8 s, the per-interval magnitude is tiny; the cap matters only for sustained one-sided imbalance, where 4 %/h is the ceiling.

## Funding caps & dynamic limits

| Parameter | Default | Source / override |
|-----------|---------|-------------------|
| funding cap (per hour) | `0.04` (`4 %/h`) | `dynamic_risk_overrides[asset].funding_rate_cap` (governance vote) |
| EMA `decay` | `0.5` (≈ 7 s half-life) | Proposed; calibration may retune to 0.3/0.7 |
| sample cadence | `5 s` | protocol-fixed |
| settle / update interval | `8000 ms` | `funding_distribute_guard` / `funding_update_guard` BucketGuards |
| base interest | `0.0000125/h` (`0.01 %/8h`) | protocol-fixed |
| `funding_rate_multiplier` | `1.0` | per-asset, auto-driven by dynamic risk |

The per-asset `funding_rate_multiplier` is MTF's differentiation over HL's governance-static value: it's auto-driven from 30-day realized volatility by the dynamic-risk engine, scaling the premium sample before it enters the EMA.

## Funding history

Per-account history via [`POST /info userFills`](../api/rest/info.md) or [HL-compat `userFills`](../api/rest/hl-compat.md) — funding payments appear with `kind: "funding"` and the relevant asset.

Per-market history:

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"funding_history","market_id":0}'
```

Returns the ordered ring of `(ts_ms, premium)` samples (see
[`funding_history`](../api/rest/info.md#funding_history)):

```json
{
  "type": "funding_history",
  "data": {
    "market_id": 0,
    "samples": [
      { "ts_ms": 1700000000000, "premium": "0.0015" },
      { "ts_ms": 1700000008000, "premium": "-0.0007" }
    ]
  }
}
```

A dedicated `fundingTicks` WS channel is on the [WS roadmap](../api/ws/subscriptions.md#roadmap--not-yet-available); poll [`funding_history`](../api/rest/info.md#funding_history) meanwhile.

## What funding doesn't do

- **No relation to fees.** Funding is user-to-user; fees are maker/taker rebates to the venue. See [fees](./fees.md).
- **No interest on collateral.** USDC balance does not accrue interest from funding. Funding is purely about closing the mark-oracle gap.
- **Not predictable across long windows.** Funding can flip sign hour-to-hour. Don't model it as a constant carry.

## Edge cases

- **Position opens 0.1 s before snapshot.** Position is in the snapshot at hour-mark `T`; pays the full hour at `T+0`. (Effectively a small grace period for last-second openers.)
- **Position closes mid-hour.** No partial-hour funding — closed before snapshot = no payment. Conversely, opening just after snapshot skips one payment period.
- **Negative cap regime.** A market with persistent shorts paying longs (mark < oracle) sees `funding_rate` negative for sustained periods. Longs receive funding.
- **Oracle outage.** If the oracle composition fails sanity bands for a window, that window's `premium_index` uses the last good oracle. Sustained outage triggers a [mark-price freeze](./mark-prices.md#sanity-bands).

## See also

- [Mark prices](./mark-prices.md) — how `oracle` is derived
- [Tiered liquidation](./tiered-liquidation.md) — funding payments adjust `account_value`, which moves `health`
- [`fundingTicks` WS channel (roadmap)](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [Fees](./fees.md) — separate from funding

## FAQ

**Q: Is funding the same as on a CEX?**
A: Same mental model. Most CEXes pay every 8 hours; MetaFlux settles every 8 seconds (the `funding_distribute_guard` interval) so the impact per payment is tiny and the carry is steadier. The 4 %/h cap is what bounds a sustained one-sided rate.

**Q: Can funding force-liquidate me?**
A: Yes — a funding payment reduces `account_value`. If you're already in the T0 band, a funding charge can push you into T1. Watch `health` near hour-marks if your position is large.

**Q: Does funding apply to spot positions?**
A: No. Funding is a perp mechanism only. Spot positions accrue no carry.

**Q: Are funding receipts taxable?**
A: That's not a protocol question. Talk to your jurisdiction's accountants.
