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
shortfall  =  liquidation_loss - insurance_pool_drawn
if shortfall > 0:
    fire_adl(asset, shortfall)
```

Insurance pool drawdown is itself rate-limited — see [tiered liquidation](./tiered-liquidation.md#t3-backstop).

## How ADL is computed

> **Further reading:** "Autodeleveraging as Online Learning" (arXiv:2602.15182).

MTF does **not** use a single ranking score. ADL splits into two independent sub-problems: a 1-D **severity** decision (how much to haircut this round) learned online, and a deterministic **pro-rata allocation** (who, by PnL capacity).

> ⚠️ **Correction vs. prior text.** The earlier doc described a single online-learning *ranking* `score = α·pnl% + β·leverage + γ·age`. That is **not** the implemented algorithm. The real controller is `θ ∈ [0,1]` severity via projected OGD + capacity-pro-rata allocation. The `α/β/γ` ranking formula was rejected ("2D OGD — dimension blow-up"). The classical `pnl% × leverage` queue is the HL baseline MTF replaces, not what MTF runs.

### 1. Severity — 1-D online gradient descent on θ

Each round picks a scalar `θ_t ∈ [0,1]` = the fraction of this round's deficit to haircut:

```
B_t          = θ_t · D_t                                  # budget for this round
θ_needed_t   = clamp(B̂_needed / D_t, 0, 1)                 # ex-ante estimate of what's actually needed
grad         = D_t · sign(θ_t − θ_needed_t)
θ_{t+1}      = clamp(θ_t − η · grad, 0, 1)                 # projected OGD step
```

`D_t` = round deficit, `B̂_needed` = the execution-price estimator's guess of the true need.

**Step size η** (`AdlController::current_eta`):
- Default mode is **Adaptive** (paper Cor. 1): `η* = sqrt( (1 + 2·P_T^θ) / Σ D_t² )`, recomputed each round from running telemetry (`path_variation`, `cumulative_squared_deficit`).
- On the first round (`Σ D_t² == 0`) it falls back to the governance-tunable `η₀ = 0.01` (`default_eta`).
- A `Fixed(c)` mode pins `η = c` (governance kill-switch / reproducibility).

The controller carries a **dynamic-regret bound** (Prop 1):

```
Reg_T^dyn  ≤  sqrt( (1 + 2·P_T^θ) · Σ D_t² )
```

exposed as `analytical_bound()`; `check_bound(slack)` asserts empirical regret ≤ `slack · bound` (default slack 4) in the chaos tests.

All fractional fields (`θ`, `η`, `path_variation`, …) are `rust_decimal::Decimal`; `sqrt` is an integer-Newton `Decimal` sqrt (no `f64`); every accumulator uses `saturating_*` (a `Decimal::from(u128 > MAX)` would otherwise panic and halt the kernel). State persists in BOLE accumulator **slot 5**.

### 2. Allocation — deterministic capacity pro-rata

Given budget `B_t`, distribute across the profitable counter-parties `W_t` (each with haircut capacity `u_i` = haircut-able unrealised PnL, `u128`):

```
total_u = Σ u_i
x_i     = floor( u_i · B_t / total_u )      capped at u_i        # 128-bit mul then 128-bit div
```

Integer-division **dust** `B_t − Σ x_i` is redistributed one unit at a time in **ascending AccountId order** to any winner with remaining capacity (`BTreeMap` iterates in key order → byte-identical across nodes). If `B_t > total_u` the round is capacity-bound and `Σ x_i = total_u`.

This replaces the rejected vector-mirror-descent and ILP allocators (the ILP is optimal but a non-deterministic solver — can't go on-chain).

**Why pro-rata** (HL Oct-10 2025 replay):

| Algorithm | Oct-10 total objective (lower = better) |
|-----------|-----------------------------------------|
| HL production (ROE heuristic) | ~$45M overshoot |
| **MTF pro-rata** | **$3.40M** (~13× better) |
| Vector mirror descent | $4.41M |
| Min-max ILP (optimal, off-chain only) | $106k |

Pro-rata also gives **0 %** monotonicity violations (vs HL's 11.4 %) and rank stability ≈ 1.0 (vs HL's 0.34).

### Quoting ADL price (read side)

The EVM precompile `0x0902 adl_pro_rata_price` lets a Solidity helper *quote* the VWAP fill an ADL of size N would clear at, walking the queue in side-appropriate priority (long ADL: highest price first; short ADL: lowest first) — **all prices on the 1e8 fixed-point plane** (`price_e8`, `capacity_e8`). It is pro-rata-only; the severity OGD lives in core-state, not the stateless precompile (severity is one decision per round; price quoting is many calls/sec).

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
  "haircut_sz": "50000000",
  "realised_pnl": "5000000",
  "block":       12345
}
```

Plus an account-wide notification:

```json
{ "kind": "marginChange", "free": "...", ... }
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
           D_t (deficit) = 40 USDC
           severity controller: θ_t resolves to 1.0 (full deficit needed)
           B_t = θ_t · D_t = 40                  # budget this round
           winners W_t on asset 42 (by haircut capacity u_i):
             A: u_A = 30
             B: u_B = 50    →    total_u = 80
           pro-rata: x_i = floor(u_i · B_t / total_u)
             x_A = floor(30·40/80) = 15
             x_B = floor(50·40/80) = 25          # Σ = 40, no dust
           result:
             A's position haircut by 15 USDC of PnL realised, 15 kept
             B's position haircut by 25 USDC of PnL realised, 25 kept
```

(Allocation is **capacity-pro-rata**, not a score-ranked walk: every winner gives up the same *fraction* of capacity — here 50 % — which is exactly the min-max fairness property pro-rata buys. Compare this to the old "rank by score, drain top tier first" model, which is not what the code does.)

## See also

- [Tiered liquidation](./tiered-liquidation.md) — full ladder
- [Insurance pool](./vaults.md#insurance-pool) — T3 mechanism
- [Portfolio margin](./portfolio-margin.md) — how PM interacts with ADL
- [`userEvents` WS](../api/ws/subscriptions.md#userevents) — receive ADL notifications

## FAQ

**Q: Can I opt out of ADL?**
A: No. ADL is a protocol-level loss-mutualisation mechanism; opting out would just push the loss onto someone else. The minimisation-of-excess-haircut objective is the protection.

**Q: Why allocate pro-rata by PnL capacity instead of a score-ranked queue?**
A: Pro-rata haircuts every winner by the same *fraction* of their haircut-able PnL — built-in min-max fairness, no monotonicity violations (two accounts with the same capacity get the same fate), and rank stability ≈ 1.0. It measured ~13× better than HL's ROE-heuristic queue on the Oct-10 2025 replay and within ~30 % of an off-chain ILP optimum, while staying fully deterministic and on-chain. The *severity* (how much total to haircut) is the part that's learned online; *who pays* is plain pro-rata.

**Q: Does ADL respect Strict-Iso?**
A: Yes. ADL is per-asset by construction; Strict-Iso positions are counter-party candidates if and only if they hold the same asset.

**Q: Is the ranking deterministic across validators?**
A: Yes — all inputs (each winner's PnL capacity `u_i`, the round deficit `D_t`) are read from committed state, and the severity controller's state (`θ`, `path_variation`, `Σ D_t²`, `η`) lives in BOLE accumulator slot 5, folded into the LtHash so every node verifies byte-identical. Pro-rata uses 128-bit integer mul/div with ascending-AccountId dust handling — no float, no `HashMap`.
