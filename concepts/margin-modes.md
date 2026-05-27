# Margin modes

> Status: **stable**.

## TL;DR

Three modes per-asset: **Cross**, **Isolated**, **Strict-Iso**. Cross pools collateral across all your positions; Isolated walls off margin per asset; Strict-Iso additionally excludes that asset from any [portfolio-margin](./portfolio-margin.md) netting.

## Comparison

| Mode | Collateral source | Loss can drain | PM eligible | Liquidation isolation |
|------|-------------------|----------------|-------------|----------------------|
| **Cross** | Free balance, account-wide | Other positions | Yes | Whole-account ladder |
| **Isolated** | Pre-allocated bucket per asset | Only that bucket | No | Per-asset ladder; max loss = bucket |
| **Strict-Iso** | Pre-allocated bucket per asset | Only that bucket | No (excluded even when master is PM-enrolled) | Per-asset ladder |

In Cross, profitable positions can carry less-healthy ones — your free balance is fungible across the account. In Isolated, blowing up one asset is contained to that asset's bucket.

## Cross — the default

```
                 ┌────────────────┐
account_value  = │ free_balance + │  + Σ unrealised PnL (cross positions)
                 │ locked_margin  │
                 └────────────────┘

health        = account_value / maint_margin
```

`maint_margin` is the sum of per-position maintenance requirements (or the PM number if [portfolio margin](./portfolio-margin.md) is enrolled).

Implication: a 10% adverse move on BTC reduces account-wide health, even if your ETH position is fine. You can prop up the BTC position by closing the ETH winner.

## Isolated

When you toggle `is_isolated: true` for an asset, the protocol moves `isolated_amount_e6` USDC from cross balance into a per-position bucket. That position's gain/loss settles into the bucket only:

```
                     ┌──────────────────┐
asset_bucket     =   │ deposited_margin │ ± unrealised PnL (this asset)
                     └──────────────────┘

position_health  =   asset_bucket / maint_margin(asset)
```

If `position_health` falls into a liquidation tier, the **per-position** ladder fires. The rest of the account is untouched.

You can deposit/withdraw to the bucket while the position is open:

```json
// add 500 USDC to the isolated bucket on asset 0
{ "type":"UpdateIsolatedMargin", "params": {
  "asset": 0, "is_isolated": true, "isolated_amount_e6": "500000000"
}}
```

`isolated_amount_e6` can be **positive** (move cross → bucket) or **negative** (withdraw bucket → cross). Withdrawal that would push the position into a worse tier is rejected.

## Strict-Iso

Same wall as Isolated, plus an explicit opt-out from PM scenario inclusion. Even if your master is portfolio-margin-enrolled, a Strict-Iso position:

- Does NOT contribute to the cross scenario engine
- Does NOT receive netting credit
- Is margined under the **classical** model (per-asset baseline)

Use Strict-Iso for:
- New / illiquid assets where PM's correlation assumptions don't apply
- Speculation budget you want firewalled from your hedged core book
- Listings (MIP-3) where the maintenance ratio is conservative until liquidity builds

## When to use each

| Goal | Mode |
|------|------|
| Maximise capital efficiency on a coherent book | Cross (+ PM) |
| Run multiple uncorrelated strategies under one account | Isolated per strategy, OR sub-accounts |
| Contain one risky position from threatening the rest | Isolated or Strict-Iso |
| Hedge across assets, want netting credit | Cross + PM |
| Trade a long-tail listing with unknown vol regime | Strict-Iso |

For multi-strategy isolation, [sub-accounts](./sub-accounts.md) are usually a better fit than Isolated — sub-accounts isolate the entire account, including agent keys and order space, not just margin.

## Transitions

Switching modes is a `UpdateMarginMode` action and is allowed only when:

| From → To | Allowed when |
|-----------|--------------|
| Cross → Isolated | You specify `isolated_amount_e6` covering at least the maintenance margin |
| Isolated → Cross | Bucket merges into cross balance; allowed any time the merged account stays in `Safe` tier |
| Isolated → Strict-Iso | Always (no margin movement) |
| Strict-Iso → Isolated | Always |
| Strict-Iso/Isolated → Cross (under PM-enrolled master) | Requires the position to fit under the PM scenario set |

Switching mode mid-position is **not** a flat-and-reopen — the position stays, only the margin accounting changes.

## Liquidation behaviour

The [tiered liquidation](./tiered-liquidation.md) ladder applies independently per scope:

- **Cross**: one ladder for the whole account
- **Isolated**: one ladder per isolated asset
- **Strict-Iso**: one ladder per strict-iso asset

A Cross-tier T1 closes positions on the cross book proportional to their contribution to maintenance. An Isolated T1 closes only the isolated position. T3 backstop and T4 ADL are per-scope — an isolated blowup doesn't claw back from cross winners.

```
account (master, PM-enrolled)
├── Cross book          ──► ladder #1 (PM-derived maint)
├── Isolated BTC        ──► ladder #2 (BTC-only)
├── Isolated ETH        ──► ladder #3 (ETH-only)
└── Strict-Iso SOL      ──► ladder #4 (SOL-only, classical)
```

## Sequence — flip cross → isolated

```
client                                node
  │                                    │
  │ initial: long 1 BTC cross          │
  │ free_balance = 5000 USDC           │
  │                                    │
  │ UpdateIsolatedMargin                                  │
  │   asset=0, is_isolated=true,                          │
  │   isolated_amount_e6=1000000000   (1000 USDC)          │
  ├───────────────────────────────────►│
  │                                    │ 1) check 1000 ≥ maint_margin(BTC, 1)
  │                                    │ 2) move 1000 USDC: cross → BTC bucket
  │                                    │ 3) BTC position now in Isolated mode
  │                                    │
  │ /info account_state                │
  ├───────────────────────────────────►│
  │   cross free_balance = 4000        │
  │   BTC bucket          = 1000       │
  │   margin_mode[BTC]    = Isolated   │
  │◄───────────────────────────────────┤
```

## Edge cases

- **Auto-deposit on margin add.** Isolated positions take maintenance shortfall from the bucket only — once the bucket is depleted, the position liquidates. Cross does NOT auto-cover an Isolated bucket; you must manually `UpdateIsolatedMargin` with positive `isolated_amount_e6` to top up.
- **Closing an Isolated position.** Closing the full position releases the bucket back into cross balance.
- **Mode of a fresh asset.** New positions default to Cross unless the asset's `meta` flag `onlyIsolated: true` forces Isolated (set per-market at deploy time via [MIP-3](../mip/mip-3.md)).
- **Isolated under PM master.** PM netting credit applies to Cross positions only. Isolated positions are summed classically. A PM-enrolled master with one giant Isolated position and tiny Cross book sees almost no PM benefit.

## See also

- [Portfolio margin](./portfolio-margin.md) — PM-vs-classical math
- [Tiered liquidation](./tiered-liquidation.md) — per-scope ladders
- [Sub-accounts](./sub-accounts.md) — full account-level isolation
- [`UpdateMarginMode`](../api/rest/exchange.md#updatemarginmode)
- [`UpdateIsolatedMargin`](../api/rest/exchange.md#updateisolatedmargin)

## FAQ

**Q: Can one asset have both Isolated and Strict-Iso buckets?**
A: No. The mode is per-asset, single-value: `Cross | Isolated | StrictIso`.

**Q: Does switching modes cost a trade?**
A: No fees, no fills. It's a pure state transition.

**Q: What happens if I deplete an Isolated bucket below maintenance?**
A: That asset's liquidation ladder fires. The rest of your account is unaffected.

**Q: Is auto-deleverage (ADL) cross-scope or per-scope?**
A: Per-scope. ADL on an Isolated position only claws back from counter-parties of *that* asset, not from your Cross book or other Isolated positions.
