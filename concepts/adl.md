# Auto-deleverage (ADL)

{% hint style="info" %}
**Preview.** T4 fires only when the insurance pool can't fully cover a T3 shortfall — rare in normal operations but designed to be deterministic when it does.
{% endhint %}

## TL;DR

When the insurance pool can't absorb a residual liquidation loss, the protocol claws back from profitable counter-parties on the same instrument, pro-rata to their unrealised PnL. MetaFlux's allocation uses an online-learning ranking that aims to minimise **excess haircut** (haircut beyond what the deficit requires).

## When ADL fires

The [tiered ladder](./tiered-liquidation.md):

```
T0 yellow card  →  T1 partial  →  T2 full  →  T3 backstop  →  T4 ADL
```

T3 hands the dying account's position to a backstop multisig and pays out of the insurance pool. If `insurance_pool < shortfall`, the protocol moves to T4: the remaining unfunded loss is allocated as a position haircut to profitable counter-parties.

```
shortfall_e6  =  liquidation_loss - insurance_pool_drawn
if shortfall_e6 > 0:
    fire_adl(asset, shortfall_e6)
```

Insurance pool drawdown is itself rate-limited — see [tiered liquidation](./tiered-liquidation.md#t3-backstop).

## Allocation: who gets the haircut

The classical ADL ranking (used by HL and most CEXes) ranks counter-party accounts by:

```
classical_score = unrealised_pnl_pct  *  leverage
```

Highest score is haircut first; allocation walks down the list until the shortfall is covered. The reasoning: profitable, highly-leveraged accounts have the most "free" PnL to give up.

MetaFlux uses a refinement — an **online-learning ranking** that observes haircut outcomes over time and re-weights the ranking inputs to minimise excess haircut.

```
score_t  =  α_t * unrealised_pnl_pct  +  β_t * leverage  +  γ_t * position_age_blocks
```

`(α, β, γ)` are tuned online with the explicit objective:

```
minimise  Σ (haircut_applied - haircut_needed)²   subject to  Σ haircut_applied ≥ shortfall
```

i.e. give as little haircut beyond the deficit as possible. The math is the same Hessian-free gradient-descent used for online portfolio selection; weights converge over weeks of observed ADL events. Until convergence (the first dozens of ADL fires after launch), the protocol pins weights to the classical `score = unrealised_pnl_pct * leverage`.

## Pro-rata haircut within a rank tier

For accounts at the same rank score, haircut is **pro-rata** to position size on the same instrument:

```
haircut_account_i  =  remaining_shortfall  *  (size_i / Σ size_j_at_same_rank)
```

The walk:

```
sort counter-party accounts by score desc
remaining = shortfall
for tier in tiers_of_equal_score:
    if remaining <= 0: break
    tier_capacity = Σ unrealised_pnl(account)  for account in tier
    if tier_capacity <= remaining:
        haircut entire tier        # everyone in this tier surrenders all unrealised PnL
        remaining -= tier_capacity
    else:
        # pro-rata partial
        for account in tier:
            haircut_account = remaining * pnl(account) / tier_capacity
        remaining = 0
```

## What "haircut" means mechanically

Haircut is not a position transfer — the counter-party's position size **shrinks** and their unrealised PnL is converted into a realised loss. The dying account's opposite-side position evaporates by the same amount.

Concretely: suppose account A is long 1 BTC at entry 100 and account B is short 1 BTC at entry 100, mark = 110.

- A is profitable (+10 USDC unrealised).
- B is the dying account, liquidated; the position resolves at mark 110 but B has only 5 USDC of equity. 5 USDC shortfall.
- Insurance pool: 0 (depleted).
- ADL fires against A:
  - A's long is reduced to 0.5 BTC.
  - A realises +5 USDC PnL (the part that got haircut).
  - A's remaining 0.5 BTC long is at entry 100, mark 110, +5 USDC unrealised.
  - B's short is fully closed.

A keeps the unrealised PnL on its remaining position; A only loses the *closed* portion's PnL.

## Notification

ADL events fire on [`userEvents` WS channel](../api/ws/subscriptions.md#userevents):

```json
{
  "kind":        "adl",
  "asset":       0,
  "haircut_sz_e8": "50000000",
  "realised_pnl_e6": "5000000",
  "block":       12345
}
```

Plus an account-wide notification:

```json
{ "kind": "marginChange", "free_e6": "...", ... }
```

For automated bots, treat `adl` events as you would a forced fill — your position changed, the protocol gave you the fill price (mark at the haircut block), you'd typically re-evaluate your strategy.

## Predicting ADL exposure

For risk monitors, the [`/info`](../api/rest/info.md) account state includes an `adl_rank_estimate` field:

```json
"adl_rank_estimate": {
  "asset": 0,
  "percentile": 95,
  "score": 1.2
}
```

`percentile: 95` means you're in the top 5% of accounts at risk on this asset. Accounts in the top decile face the most exposure if ADL fires.

This is an estimate — actual ranking happens at the moment of ADL trigger against then-current state. For market makers running large books, the headline risk is concentration (one big position dominating the asset's open interest); diversifying across assets reduces ADL exposure.

## Edge cases

- **Multiple shortfalls in one block.** Each is allocated independently against the then-current counter-party set. Ranks can move between events.
- **Empty counter-party set.** If literally no profitable counter-party on the same instrument exists, the shortfall is socialised to the insurance pool's "uncovered loss" register, payable at the next pool replenishment. Should never happen for a liquid asset; can theoretically happen on a long-tail MIP-3 market.
- **PM-enrolled counter-party.** ADL still targets unrealised PnL on the same instrument — PM enrollment doesn't change ADL's per-asset granularity. The PM scenario engine sees the post-haircut state at the next block.
- **Spot markets.** Spot doesn't have unrealised PnL in the perp sense. Spot ADL is not defined for V1; spot positions are excluded from ADL ranking.

## Sequence — ADL on a thin tail asset

```
block T:   account X liquidates on asset 42 (MIP-3 market), loss = 100 USDC
           insurance pool on asset 42 = 60 USDC
           shortfall = 40 USDC
           ADL fires:
             rank counter-parties on asset 42 by score
             top account A: pnl = 30, size = 1, score = highest
             top account B: pnl = 50, size = 2, score = next
           walk:
             remaining = 40
             tier 1: { A }, capacity = 30 → consume all; remaining = 10
             tier 2: { B }, capacity = 50, pro-rata 10/50 = 20% haircut
           result:
             A's position closed entirely on asset 42, +30 USDC realised
             B's position closed by 20%, +10 USDC realised, 80% kept
```

## See also

- [Tiered liquidation](./tiered-liquidation.md) — full ladder
- [Insurance pool](./vaults.md#insurance-pool) — T3 mechanism
- [Portfolio margin](./portfolio-margin.md) — how PM interacts with ADL
- [`userEvents` WS](../api/ws/subscriptions.md#userevents) — receive ADL notifications

## FAQ

**Q: Can I opt out of ADL?**
A: No. ADL is a protocol-level loss-mutualisation mechanism; opting out would just push the loss onto someone else. The minimisation-of-excess-haircut objective is the protection.

**Q: Why allocate by PnL × leverage instead of by size?**
A: Size-based allocation punishes liquidity providers. PnL × leverage targets the accounts that have the most "free" headroom to absorb the haircut without becoming distressed themselves.

**Q: Does ADL respect Strict-Iso?**
A: Yes. ADL is per-asset by construction; Strict-Iso positions are counter-party candidates if and only if they hold the same asset.

**Q: Is the ranking deterministic across validators?**
A: Yes — all inputs (PnL, leverage, position age) are read from the committed state at the ADL block. The score function and online-weight tuple are also part of consensus state.
