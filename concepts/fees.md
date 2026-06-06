# Fees

{% hint style="info" %}
**Status.** **stable** in shape; tier values are network parameters and can be updated by governance.
{% endhint %}

## TL;DR

Maker / taker per-fill fees with volume-tiered rebates. Builder rebate routes a portion to the order-flow originator. A configurable fraction of taker revenue is burned. Fees are deducted from USDC balance at fill time and shown in [`userFills`](../api/rest/info.md#user_fills).

## Tier table (default — see live values)

```bash
curl -X POST https://gateway.devnet.mtf.exchange/info -d '{"type":"fee_schedule"}'
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

> **What's live vs. this table:** the settlement path currently charges the **flat global tier** — `default_taker_bps = 5`, `default_maker_bps = 1` (`GlobalFeeSchedule::default`). Per-user 30-day-volume tiering exists as `FeeTracker` accumulators but is not yet wired into the charge. The bottom (`< 100k`) row above shows taker 5 / maker 2; the implemented flat maker is **1 bps**. Treat the tiered ladder as the target schedule.

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

## How fees are computed

> Fees settle on the **whole-USDC `Decimal` plane** (notional = raw `px × size` integer product), truncated toward zero.

### Per fill

```
notional    = |px × qty|                         # raw scale-0 Decimal product
taker_fee   = trunc( notional × taker_bps / 10_000 )      # fee_amount()
maker_fee   = trunc( notional × maker_bps / 10_000 )
builder_fee = trunc( notional × builder_bps / 10_000 )    # ADDITIVE, taker-only, ≤ 8 bps
```

Defaults (`GlobalFeeSchedule::default`): `default_taker_bps = 5`, `default_maker_bps = 1`. (Per-user 30-day volume tiering exists as trackers but the settlement path currently charges the flat global tier — the tier table below is the *target* schedule.)

### Distribution of the base fee

The **taker** fee carves the referrer share **first**, then splits the remainder. The **maker** fee splits wholesale (no referrer, no builder):

```
# taker fee:
referrer_share = trunc( taker_fee × 1_000 / 10_000 )   # = 10% of the TAKER FEE (REFERRER_BPS = 1000), only if referrer set
protocol_fee   = taker_fee − referrer_share
# protocol_fee (and the whole maker_fee) split 80/10/10:
burn      = trunc( protocol_fee × 8_000 / 10_000 )     # 80%  → buyback-and-burn
validator = trunc( protocol_fee × 1_000 / 10_000 )     # 10%  → validators (stake-weighted)
treasury  = protocol_fee − burn − validator            # 10%  → foundation/treasury (absorbs truncation dust, leak-free)
# mflux_vault share = 0 (revised 2026-05-28)
```

| Symbol | Default | Notes |
|--------|---------|-------|
| `default_taker_bps` | `5` (5 bps) | `GlobalFeeSchedule` |
| `default_maker_bps` | `1` (1 bps) | `GlobalFeeSchedule` |
| referrer share | **10 % of the taker fee** (`REFERRER_BPS = 1000`) | — |
| `burn_bps` | `8_000` (80 %) | revised |
| `validator_bps` | `1_000` (10 %) | — |
| `treasury_bps` | `1_000` (10 %) | — |
| `mflux_vault_bps` | `0` | vault fee share zeroed |
| `BUILDER_FEE_MAX_BPS` | `8` | vs HL's 10 |
| deployer fee cap | `5` default (`MAX_DEPLOYER_FEE_CAP_BPS = 20`) | — |

> ⚠️ **Corrections vs. prior text.** (1) The referrer share is **10 % of the taker fee** (`REFERRER_BPS = 1000` bps-of-fee), **not** `1 bps × notional`. (2) The protocol split is **80 / 10 / 10** (burn / validator / treasury), **not** `burn_ratio = 0.30` on a generic "protocol" pool, and **not** the historical `50/25/15/10`. The 80 % is a **buyback-and-burn** (accrued USDC market-buys MTF then burns it — buy pressure + deflation), not a direct USDC burn. (3) MFlux-vault fee share is **0**. (4) Default taker/maker is `5 / 1` bps at the flat tier.

### Burn = buyback-and-burn

The 80 % "burn" share accrues as USDC; a periodic buyback executor drains the pool, market-buys MTF at the deterministic mark, and burns the acquired MTF (`fee_distribution.burned` USDC pool → `burned_mtf`). It is **not** a direct USDC burn or abstract supply reduction.

## Builder rebate

A trade originator can claim a share by setting `builder: 0x<builder_addr>` on their order (passed as an optional `params.builder` on `Order`). The rebate is paid out per fill to that address.

Use cases:
- A front-end / aggregator that routed user flow.
- A market-data API that bundles execution.
- An automated risk service that placed protective braces.

The builder must be a registered address (see [`approve_builder_fee`](../api/rest/exchange.md#approve_builder_fee); the referrer primitive is [`set_referrer`](../api/rest/exchange.md#set_referrer)). Unregistered builders are silently dropped.

## Burn (buyback-and-burn)

**80 %** of protocol revenue (`burn_bps = 8_000`) goes to buyback-and-burn — accrued USDC market-buys MTF, which is then burned. (The earlier `0.30` ratio is obsolete.) The acquired-and-burned MTF exits circulation permanently.

The cumulative amounts (`burned` USDC pool, `burned_mtf`, `treasury`, validator pool) are tracked in committed state and exposed on the read path via [`protocol_metrics`](../api/rest/info.md#protocol_metrics) (`fee_pools.{burned, burned_mtf, treasury, validator_pool, mflux_vault}`):

```bash
curl -X POST https://gateway.devnet.mtf.exchange/info -d '{"type":"protocol_metrics"}'
```

## Referrer share

When an account has a `referrer` set, **10 % of its taker fee** (`REFERRER_BPS = 1000` bps-of-fee) is carved to the referrer *before* the 80/10/10 split — it comes out of the protocol take, not as an extra charge to the taker:

```
referrer_share = trunc( taker_fee × 1000 / 10000 )   # 10% of the taker FEE, not of notional
protocol_fee   = taker_fee − referrer_share          # then splits 80/10/10
```

Single-level (no multi-level referral — anti-Ponzi). Set once with `SetReferrer`; immutable thereafter (`setReferrer(self)` is rejected). The maker fee carries **no** referrer carve.

## Spot vs perp fees

Spot markets use a separate fee schedule, generally higher (default 5/15 bps maker/taker). See `fee_schedule.spot_tiers` in the `/info fee_schedule` response.

Spot fees are debited from the **quote** balance (the asset on the right of the symbol — typically USDC).

## Fees on liquidation fills

> **Implementation pending / unverified.** A discrete **liquidation fee** (the `100 bps`, insurance/treasury split, `is_liquidation` flag described below) is **not** currently implemented. Liquidation closes (T1/T2) currently route through the same `charge_fees` taker path as ordinary fills. Treat the section below as a **design intent**, not a verified parameter — confirm against the live behaviour before quoting a number.

The intended model: liquidation fills charge a liquidation fee on top of the standard taker fee, split between the insurance pool and treasury, to keep insurance solvent and compensate makers who absorb forced flow. Liquidated accounts would pay it as part of the loss settled at T1/T2, surfaced in [`userFills`](../api/rest/info.md#user_fills) with `is_liquidation: true`.

## Querying

```bash
# tier overview (MTF-native — gateway default path; running the node yourself: localhost:8080)
curl -X POST https://gateway.devnet.mtf.exchange/info -d '{"type":"fee_schedule"}'

# your personal tier and recent volume — MTF-native (gateway default path)
curl -X POST https://gateway.devnet.mtf.exchange/info \
  -d '{"type":"user_fees","address":"0x<addr>"}'

# or the HL-compat shape under /hl on the gateway
curl -X POST https://gateway.devnet.mtf.exchange/hl/info \
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
- [`POST /info user_fees`](../api/rest/info.md#user_fees) — MTF-native per-user tier / 30-day volume
- [`POST /info protocol_metrics`](../api/rest/info.md#protocol_metrics) — cumulative fee pools (burn / treasury / validator)
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
