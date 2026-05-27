# Funding rates

{% hint style="success" %}
**Stable.**
{% endhint %}

## TL;DR

Perpetual positions accrue a hourly funding payment proportional to the gap between **mark price** and an EMA-smoothed **oracle price**. Longs pay shorts when mark > oracle; shorts pay longs when mark < oracle. The cap is a per-market governance parameter (default `±0.05% / hour`).

## Why funding exists

Perps have no expiry, so there's no arbitrage force to peg them to the underlying. Funding does that job: when perp price drifts above spot, longs pay, which incentivises shorts and disincentivises longs until the perp drifts back down. The protocol never takes either side — it's user-to-user.

## Formula

For each market, every hour:

```
premium_index  =  EMA(mid - oracle, window=60_min)
funding_rate   =  clamp(premium_index / oracle, -cap, +cap)
payment_e8     =  position_size_e8 * mark_e8 * funding_rate
```

| Symbol | Meaning |
|--------|---------|
| `mid` | Mid-price across the venue's book |
| `oracle` | Composed oracle price — see [mark prices](./mark-prices.md) |
| EMA window | 60-minute exponential moving average; α tuned for stability |
| `cap` | Governance per market; default `0.0005 / hour` = `0.05%` |

`funding_rate` is signed: positive → longs pay shorts; negative → shorts pay longs.

## Payment cadence

Funding pays **every hour** at the top of the hour by default, with a governance hook to shorten to 15-minute or stretch to 8-hour for individual markets. Active positions at the exact hour-mark are charged; positions opened mid-hour pay a proportional fraction at the next hour-mark.

```
T-0:00      ─────── snapshot positions
T+0:00      ─────── compute funding_rate
T+0:00.5s   ─────── apply payments (single block)
```

Payments settle as balance adjustments — no on-chain trade, no fee. They show on the user's history as `kind: "funding"`.

## Worked example

Market: BTC perp, current state:

```
mark        = 100.50  (= mid, equal because deep)
oracle      = 100.00
premium     = 0.005  → 0.5% above oracle
funding cap = 0.05% / hour
```

Account positions:

```
long 1 BTC      → pays funding
short 0.5 BTC   → receives funding
```

Funding period: 1 hour.

```
funding_rate    = clamp(0.005 / 100.00, -0.0005, +0.0005) = +0.0005
                   (capped at +0.05% / hour)

long 1 BTC:
  payment       = 1 * 100.50 * 0.0005 = 0.05025 USDC  (long pays)

short 0.5 BTC:
  payment       = -0.5 * 100.50 * 0.0005 = -0.02513 USDC (short receives 0.02513)
```

Note this is per-hour. Over a day at the same rate, longs pay 1.2%. The cap matters most for sustained one-sided imbalance.

## Funding caps & dynamic limits

| Parameter | Default | Bounds | Notes |
|-----------|---------|--------|-------|
| `max_funding_per_hour` | `0.0005` (`0.05%`) | governance | Hard clip on `funding_rate` |
| `ema_window_minutes` | `60` | governance | Premium EMA window |
| `payment_interval_ms` | `3_600_000` (1 h) | governance | Payment cadence |
| `damping_factor` | `1.0` | governance | Multiplier on rate (regime-dependent) |

The `damping_factor` lets the protocol respond to volatility regimes — in calm markets damping defaults to `1.0`; during stress periods governance can reduce it to slow funding swings without dropping the cap.

## Funding history

Per-account history via [`POST /info userFills`](../api/rest/info.md) or [HL-compat `userFills`](../api/rest/hl-compat.md) — funding payments appear with `kind: "funding"` and the relevant asset.

Per-market history:

```bash
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"funding_history","asset_id":0,"since_ts":1735000000000,"limit":1000}'
```

Returns array of:

```json
{ "asset": 0, "ts": 1735689600000, "rate_e8": "5000", "premium_e8": "5000000" }
```

Live updates stream on [`fundingTicks` WS channel](../api/ws/subscriptions.md#fundingticks).

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
- [`fundingTicks` WS channel](../api/ws/subscriptions.md#fundingticks)
- [Fees](./fees.md) — separate from funding

## FAQ

**Q: Is funding the same as on a CEX?**
A: Same mental model. Most CEXes pay every 8 hours; MetaFlux defaults to hourly so the impact per payment is smaller and the carry is steadier.

**Q: Can funding force-liquidate me?**
A: Yes — a funding payment reduces `account_value`. If you're already in the T0 band, a funding charge can push you into T1. Watch `health` near hour-marks if your position is large.

**Q: Does funding apply to spot positions?**
A: No. Funding is a perp mechanism only. Spot positions accrue no carry.

**Q: Are funding receipts taxable?**
A: That's not a protocol question. Talk to your jurisdiction's accountants.
