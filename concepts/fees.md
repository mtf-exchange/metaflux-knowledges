# Fees

> Status: **stable** in shape; tier values are network parameters and can be updated by governance.

## TL;DR

Maker / taker per-fill fees with volume-tiered rebates. Builder rebate routes a portion to the order-flow originator. A configurable fraction of taker revenue is burned. Fees are deducted from USDC balance at fill time and shown in [`userFills`](../api/rest/info.md#user_fills).

## Tier table (default — see live values)

```bash
curl -X POST https://gateway/info -d '{"type":"fee_schedule"}'
```

| 30-day volume | Maker | Taker |
|---------------|------:|------:|
| `< 100k`     | 2.0 bps | 5.0 bps |
| `100k – 1M`  | 1.5 bps | 4.5 bps |
| `1M – 10M`   | 1.0 bps | 4.0 bps |
| `10M – 100M` | 0.5 bps | 3.5 bps |
| `100M – 1B`  | 0.0 bps | 3.0 bps |
| `> 1B`       | −0.5 bps | 2.5 bps |

Bps = basis points (1 bps = 0.01%). Negative maker = maker rebate.

Volume is measured in USDC notional, summed across all markets, across all your sub-accounts. Volume rolls forward on a 30-day window.

## Where fees go

```
                    fill at price P, size S, taker pays fee F
                                       │
              ┌────────────────────────┼─────────────────────────────┐
              │                        │                             │
              ▼                        ▼                             ▼
        maker_rebate              builder_rebate (if any)        protocol_share
        (paid to maker)           (paid to order-flow origin)    (the rest)
                                                                      │
                                                            ┌─────────┴─────────┐
                                                            ▼                   ▼
                                                       burn (configurable)  treasury / vault
```

Concretely per fill:

```
F           = taker_fee_bps * notional  (notional = S * P)
maker_amt   = maker_rebate_bps * notional        (paid to maker; negative if rebate is positive)
builder_amt = builder_rebate_bps * notional      (paid to builder if order set builder)
protocol    = F - maker_amt - builder_amt
burn        = protocol * burn_ratio
treasury    = protocol - burn
```

| Symbol | Default |
|--------|---------|
| `builder_rebate_bps` | `0.2 bps` (governance) |
| `burn_ratio` | `0.30` (governance — 30% of protocol revenue burned) |

`burn` returns to the protocol's emission account and reduces effective supply over time; `treasury` funds the insurance pool + protocol operations.

## Builder rebate

A trade originator can claim a share by setting `builder: 0x<builder_addr>` on their order (passed as an optional `params.builder` on `Order`). The rebate is paid out per fill to that address.

Use cases:
- A front-end / aggregator that routed user flow.
- A market-data API that bundles execution.
- An automated risk service that placed protective braces.

The builder must be a registered address (see [`RegisterReferrer`](../api/rest/exchange.md#registerreferrer); builder registration uses the same primitive). Unregistered builders are silently dropped.

## Burn

A fraction of protocol revenue is burned. The default is `0.30`; governance can shift this between `[0.0, 1.0]`. Burned MTF (or the platform's emission token) exits circulation permanently.

The burned amount per-block is published via:

```bash
curl -X POST https://gateway/info -d '{"type":"protocol_metrics"}'
```

Returns cumulative `burned_e8`, `treasury_e8`, fee revenue per epoch.

## Referrer share

Independent of fees themselves: when an account has a `referrer` set, a portion of its taker fees is routed to the referrer's account:

```
referrer_amt = referrer_share_bps * notional        (default 1 bps; governance)
protocol    = F - maker_amt - builder_amt - referrer_amt - ...
```

Set once with `SetReferrer` per account; immutable thereafter.

## Spot vs perp fees

Spot markets use a separate fee schedule, generally higher (default 5/15 bps maker/taker). See `fee_schedule.spot_tiers` in the `/info fee_schedule` response.

Spot fees are debited from the **quote** balance (the asset on the right of the symbol — typically USDC).

## Fees on liquidation fills

Liquidation fills (T1/T2 closes) charge a **liquidation fee** in addition to the standard taker fee. Default `100 bps` (1%); set by governance per asset. Half goes to the insurance pool; half to the protocol treasury.

The liquidation fee is the protocol's incentive to keep insurance solvent and to compensate market-makers who absorb forced liquidation flow.

Liquidated accounts pay these fees as part of the loss settled at T1/T2. They show up in [`userFills`](../api/rest/info.md#user_fills) with `is_liquidation: true`.

## Querying

```bash
# tier overview
curl -X POST https://gateway/info -d '{"type":"fee_schedule"}'

# your personal tier and recent volume
curl -X POST https://gateway/info \
  -d '{"type":"userFees","user":"0x<addr>"}'
```

Per-fill fee is in every `userFills` entry as `fee` (USDC base units; positive = paid, negative = rebate received).

## Worked example

A market-maker with $50M 30-day volume:
- Tier: `10M – 100M` → maker 0.5 bps, taker 3.5 bps.

A 1 BTC × $100 fill where they're the maker:
- notional = $100
- maker fee = $100 × 0.00005 = $0.005 (paid by maker; positive because still in the tier with positive maker fee)

A market-maker with $500M 30-day volume:
- Tier: `100M – 1B` → maker 0.0 bps, taker 3.0 bps.
- Maker fees zero; only pays in taker direction.

A market-maker with $5B 30-day volume:
- Tier: `> 1B` → maker −0.5 bps, taker 2.5 bps.
- Receives $0.005 per $100 maker fill.

## Edge cases

- **Volume across sub-accounts.** A master and all its subs share one volume tier. Use this for scaling — a desk that runs many strategies under one master gets the aggregate tier.
- **Tier evaluation cadence.** Tier is re-evaluated every block based on the current 30-day window. No periodic snapshot — a $10 trade that pushes you into a new tier applies on the next fill.
- **Builder rebate ≠ referrer share.** Both can apply to the same fill: a user's account has a referrer AND that fill's order specified a builder. Both routes pay out independently.
- **Negative-fee maker tier.** When `maker_fee_bps < 0`, the maker is paid from protocol revenue. This is funded out of taker fees on the same fill (and across all fills in the same block); the protocol never pays out more than it takes in.

## See also

- [`POST /info fee_schedule`](../api/rest/info.md#fee_schedule)
- [`POST /info userFees`](../api/rest/hl-compat.md#userfees) — HL-compat
- [Tiered liquidation](./tiered-liquidation.md) — liquidation-fee mechanics

## FAQ

**Q: Are fees applied on a per-fill or per-order basis?**
A: Per-fill. A partially-filled order accrues fee in proportion to the filled size at each fill event.

**Q: Are fees paid in USDC or in MTF?**
A: USDC, deducted from the account's USDC balance. The burn portion is denominated separately; the protocol converts internally and burns in MTF.

**Q: Is there a min-fee floor?**
A: No floor. A 0.00001 BTC fill at 100k mark would compute a sub-cent fee (rounded down on display, paid at full precision internally).

**Q: Do TWAP slices each pay taker?**
A: Yes — each slice is an IOC at the protocol's discretion. Total TWAP fee = sum of slice fees.

**Q: Can builder rebate be 0?**
A: Yes. If you don't set `params.builder` on an order, no rebate is allocated; the full protocol share lands in burn + treasury.
