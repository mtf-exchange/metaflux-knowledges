# Auto-deleverage (ADL)

Auto-deleverage (ADL) covers the bad debt that a liquidation leaves. This page describes when it runs and how it allocates the loss.

:::info
**Preview.** T4 runs only when a T3 close leaves the account flat and still negative. This is rare in normal operation, and the result is deterministic when it occurs.
:::

## Summary {#tldr}

When a liquidation leaves bad debt, the protocol takes back realized gains from profitable counter-parties on the same instrument, pro-rata to those gains. For a cross account with positions on several markets, [Which market pays](./tiered-liquidation.md#which-market-pays) defines which market takes the deficit. ADL runs before the insurance fund, and after the [Metaliquidity vault](./tiered-liquidation.md#mlp-first-bite) takes what it can. The MetaFlux allocation uses an online-learning controller. Its aim is to minimize *excess haircut*, which is a haircut larger than the deficit requires.

## When ADL runs {#when-adl-fires}

The [tiered ladder](./tiered-liquidation.md):

```
T0 yellow card  →  T1 partial  →  T2 full  →  T3 backstop  →  T4 ADL
```

T3 closes the failing position at the committed mark. On a core market, the [Metaliquidity vault](./tiered-liquidation.md#mlp-first-bite) takes the first bite. The engine nets what the vault declines against profitable counter-parties. If the account is then flat and its equity is still negative, T4 runs.

ADL comes before the insurance fund. The realized gains of the deleveraged winners absorb the loss first. This keeps the fund for real tail events. An earlier version of this page gave the two in the opposite order.

The winners are all accounts that realized a gain on the instrument in the current 60-second window or the window before it. The gain can come from any fill, from netting at mark, or from a delisting settlement. The haircut never takes a winner below its maintenance margin. ADL cannot reach a gain that has already left the cross balance, or a gain realized before that window. That part of the deficit goes on to the insurance fund. The protocol never holds back realized gains from withdrawal. Instead, the reach is bounded, so a haircut never pushes a winner into liquidation. See [the deficit waterfall](./tiered-liquidation.md#t4--the-deficit-waterfall).

```
deficit  =  |account_value|  after the account is flat
deficit -=  metaliquidity_vault_absorb(deficit)   # core markets only
if deficit > 0:
    fire_adl(asset, deficit)                      # then insurance, then treasury
```

[The deficit waterfall](./tiered-liquidation.md#t4--the-deficit-waterfall) gives the full order: vault, ADL, insurance fund and treasury queue.

## How ADL is computed {#how-adl-is-computed}

Further reading: "Autodeleveraging as Online Learning" (arXiv:2602.15182).

MTF does not use a single ranking score. ADL splits into two independent problems:

- A one-dimensional *severity* decision: how much to haircut in this round. The controller learns it online.
- A deterministic *pro-rata allocation*: who pays, in proportion to PnL capacity.

:::note
An earlier version of this page described a single online-learning ranking, `score = α·pnl% + β·leverage + γ·age`. That is not the implemented algorithm. The implemented controller is a severity `θ ∈ [0,1]` set by projected OGD, plus a capacity pro-rata allocation. The `α/β/γ` ranking formula was rejected ("2D OGD — dimension blow-up"). The classical `pnl% × leverage` queue is the HL baseline that MTF replaces. MTF does not run it.
:::

### 1. Severity by online gradient descent on θ {#1-severity--1-d-online-gradient-descent-on-θ}

Each round picks a scalar `θ_t ∈ [0,1]`. It is the fraction of the round's deficit to haircut:

```
B_t          = θ_t · D_t                                  # budget for this round
θ_needed_t   = clamp(B̂_needed / D_t, 0, 1)                 # ex-ante estimate of what's actually needed
grad         = D_t · sign(θ_t − θ_needed_t)
θ_{t+1}      = clamp(θ_t − η · grad, 0, 1)                 # projected OGD step
```

`D_t` is the round deficit. `B̂_needed` is the estimate of the true need from the execution-price estimator.

Step size η:

- The default mode is *Adaptive* (paper Cor. 1): `η* = sqrt( (1 + 2·P_T^θ) / Σ D_t² )`. The controller recomputes it each round from running telemetry (`path_variation`, `cumulative_squared_deficit`).
- On the first round (`Σ D_t² == 0`), it falls back to the governance-tunable `η₀ = 0.01` (`default_eta`).
- A `Fixed(c)` mode pins `η = c`. It serves as a governance kill switch and for reproducibility.

The controller has a *dynamic-regret bound* (Prop 1):

```
Reg_T^dyn  ≤  sqrt( (1 + 2·P_T^θ) · Σ D_t² )
```

The bound is available as `analytical_bound()`. In the chaos tests, `check_bound(slack)` asserts that empirical regret is at most `slack · bound` (default slack 4).

Every fractional field (`θ`, `η`, `path_variation`, …) is exact fixed-point. The square root is an integer method. There is no floating point on this path. Every accumulator saturates instead of overflowing, so an extreme value cannot halt the chain. The controller state is committed, so all validators agree on it.

### 2. Allocation by capacity pro-rata {#2-allocation--deterministic-capacity-pro-rata}

The budget `B_t` goes to the profitable counter-parties `W_t`. Each one has a haircut capacity `u_i`: the realized gain still in reach, in whole USDC, as `u128`.

```
total_u = Σ u_i
x_i     = floor( u_i · B_t / total_u )      capped at u_i        # 128-bit mul then 128-bit div
```

Integer division leaves *dust*, `B_t − Σ x_i`. The engine gives the dust one unit at a time, in ascending AccountId order, to any winner with remaining capacity. `BTreeMap` iterates in key order, so the result is byte-identical on all nodes. If `B_t > total_u`, capacity limits the round and `Σ x_i = total_u`.

This replaces the rejected vector-mirror-descent and ILP allocators. The ILP is optimal, but its solver is not deterministic, so it cannot run on-chain.

Pro-rata was chosen on the HL Oct-10 2025 replay:

| Algorithm | Oct-10 total objective (lower = better) |
|-----------|-----------------------------------------|
| HL production (ROE heuristic) | ~$45M overshoot |
| **MTF pro-rata** | **$3.40M** (~13× better) |
| Vector mirror descent | $4.41M |
| Min-max ILP (optimal, off-chain only) | $106k |

Pro-rata also gives 0 % monotonicity violations (HL: 11.4 %) and rank stability ≈ 1.0 (HL: 0.34).

### ADL price quotes {#quoting-adl-price-read-side}

The EVM precompile `0x0902 adl_pro_rata_price` lets a Solidity helper quote the VWAP fill that an ADL of size N would clear at. It walks the queue in the priority for the side: for a long ADL, highest price first; for a short ADL, lowest price first. All prices are on the 1e8 fixed-point plane (`price_e8`, `capacity_e8`). The precompile does pro-rata only. The severity OGD is in core-state, not in the stateless precompile, because severity is one decision per round, while price quotes are many calls per second.

## How a haircut works {#what-haircut-means-mechanically}

A haircut is not a position transfer. The position size of the counter-party decreases, and its unrealized PnL becomes realized PnL. The opposite-side position of the failing account closes by the same amount.

Example: account A is long 1 BTC at entry 100, account B is short 1 BTC at entry 100, and the mark is 110.

- A is profitable (+10 USDC unrealized).
- B is the failing account and is liquidated. The position resolves at mark 110, but B has only 5 USDC of equity. The shortfall is 5 USDC.
- The insurance pool is 0 (depleted).
- ADL runs against A:
  - A's long decreases to 0.5 BTC.
  - A realizes +5 USDC PnL (the part that the haircut closed).
  - A's remaining 0.5 BTC long has entry 100, mark 110 and +5 USDC unrealized.
  - B's short closes fully.

A keeps the unrealized PnL on its remaining position. A loses only the PnL of the closed portion.

## Notification {#notification}

No channel has a dedicated ADL event today. There is no
[`notifications`](../api/ws/subscriptions.md#notifications) kind, no `fills`
entry and no `ledger_updates` record. The haircut changes state directly. The
only real-time signal is the position itself: the position size and unrealized PnL of
the affected account change on the next
[`clearinghouse_state`](../api/ws/subscriptions.md#clearinghouse_state) push. The
push is change-driven, so any position or PnL change sends a frame.

For an automated bot, subscribe to `clearinghouse_state` and compare your
position set between pushes. Treat a decrease that you did not order as a forced
event (an ADL haircut or a liquidation), and re-evaluate your strategy.

## Predicting ADL exposure {#predicting-adl-exposure}

Read [`clearinghouse_state` with `detail: "adl"`](../api/rest/info/account.md#account_state-adl).
Each position row then has `adl_lamps`, an integer from `0` to `4`. More lamps
means that the position is earlier in the queue.

The lamps rank step 1, the netting at mark. That step closes the failing leg
against the most profitable positions on the opposite side. The order is return
on committed margin (`unrealised PnL ÷ |entry notional|`), highest first. The
lamps are the quartile of your position in that order: `4` is the top quarter,
`1` is the bottom quarter. Hedge legs rank separately, because the step settles
each leg separately.

The lamps do not rank step 2, the [deficit
haircut](#2-allocation--deterministic-capacity-pro-rata). That step is capacity
pro-rata and has no queue. Every winner gives up the same fraction of capacity,
so there is nothing to rank.

:::warning
The lamps are a ranking, not a probability. Four lamps mean nothing when no
account on the other side is being liquidated. Do not show the value as a
percentage chance.

Zero lamps is a real value, not an unknown. Zero means that the position is not
in the queue: it has no committed mark, no unrealized profit or no cost basis,
or no account on the opposite side can be deleveraged against it. A hedge
account whose only opposing leg is its own reads zero on both legs, because ADL
never nets an account against itself.
:::

The depth is opt-in. Each lamp costs one pass over the positions of the market.
Ask for `detail: "adl"` only on a screen that shows the column, and poll the
default shape at other times. The
[WS `clearinghouse_state`](../api/ws/subscriptions.md#clearinghouse_state) frame
always has the default shape and never has `adl_lamps`.

For market makers with large books, the main risk is still concentration: one
large winning position that dominates the profitable side of the asset.
Diversification across assets reduces ADL exposure.

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **Multiple shortfalls in one block.** The engine allocates each one independently against the counter-party set at that time. Ranks can change between events.
- **Empty counter-party set.** If no profitable counter-party exists on the same instrument, the shortfall goes to the "uncovered loss" register of the insurance pool. It is payable at the next pool replenishment. This should never occur on a liquid asset. It can occur in theory on a long-tail MIP-3 market.
- **PM-enrolled counter-party.** ADL still targets unrealized PnL on the same instrument. PM enrollment does not change the per-asset granularity of ADL. The PM scenario engine sees the post-haircut state at the next block.
- **Spot markets.** Spot has no unrealized PnL in the perp sense. Spot ADL is not defined for V1. ADL ranking excludes spot positions.

</details>

## ADL on a thin tail asset {#sequence--adl-on-a-thin-tail-asset}

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

The allocation is capacity pro-rata, not a walk down a score ranking. Every winner gives up the same fraction of capacity, here 50 %. This is the min-max fairness property that pro-rata gives. The old model ranked by score and drained the top tier first. The code does not do that.

## See also {#see-also}

- [Tiered liquidation](./tiered-liquidation.md): the full ladder.
- [Insurance pool](./vaults.md#insurance-pool): the T3 mechanism.
- [Portfolio margin](./portfolio-margin.md): how PM interacts with ADL.
- [`clearinghouse_state` WS](../api/ws/subscriptions.md#clearinghouse_state): the only real-time signal that an ADL haircut changed your position.
- [`clearinghouse_state` with `detail: "adl"`](../api/rest/info/account.md#account_state-adl): the `adl_lamps` queue indicator.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Can I opt out of ADL?**
A: No. ADL is a loss-mutualization mechanism at the protocol level. An opt-out would only move the loss onto another account. The objective to minimize excess haircut is the protection.

**Q: Why allocate pro-rata by PnL capacity instead of with a score-ranked queue?**
A: Pro-rata haircuts every winner by the same fraction of the PnL that the haircut can reach. This gives min-max fairness and no monotonicity violations: two accounts with the same capacity get the same result. Rank stability is ≈ 1.0. On the Oct-10 2025 replay, it measured ~13× better than the HL ROE-heuristic queue, and within ~30 % of an off-chain ILP optimum. It also stays fully deterministic and on-chain. The controller learns the severity (how much to haircut in total) online. Who pays is plain pro-rata.

**Q: Does ADL respect Strict-Iso?**
A: Yes. ADL is per-asset by design. A Strict-Iso position is a counter-party candidate if and only if it holds the same asset.

**Q: Is the ranking deterministic across validators?**
A: Yes. All inputs (the PnL capacity `u_i` of each winner and the round deficit `D_t`) come from committed state. The severity controller state (`θ`, `path_variation`, `Σ D_t²`, `η`) is in BOLE accumulator slot 5, which is folded into the LtHash, so every node verifies a byte-identical value. Pro-rata uses 128-bit integer mul and div, with dust handled in ascending AccountId order. It uses no float and no `HashMap`.

</details>
