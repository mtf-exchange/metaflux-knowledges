# Mark prices

:::tip
**Stable.**
:::

## TL;DR

The **mark price** is the protocol's authoritative price per asset for margin, liquidation, funding, and trigger evaluation. It's a median of three components — the oracle anchor (plus a basis EMA), the internal quote mid, and the external perp median — recomputed continuously. It is NOT the last trade price.

## Why mark ≠ last trade

Using last-trade for margin is exploitable: a small adversarial trade at a manipulated price can push other users into liquidation. Mark is a smoothed, multi-source composition that's hard to push.

## Composition

> The implemented mark is the **3-component median** below (`mark_source: "MedianOfOraclesAndMid"`), not a flat `median(mid, oracle, ema_mid)`.

### How it's computed

```
mark = median( present components of {C1, C2, C3} )
        # 3 present → median3   2 present → midpoint   1 present → that value
        # a lone C2 (no external anchor) yields no update — see below
```

with three components:

| Component | Definition |
|-----------|------------|
| **C1** (oracle anchor) | `C1 = oracle + EMA(quote_mid − oracle)` — the oracle plus a fixed-decay EMA of the perp's **basis** (≈ **150 s** half-life at the recompute cadence) |
| **C2** (internal book) | `mid(best_bid, best_ask)` — best bid/ask **only**. Requires both sides and an uncrossed book, else `None`. It deliberately **excludes the last trade** (folding the last trade back in would make the recompute self-referential and could freeze a thin one-sided book). |
| **C3** (external perps) | `median(external perp mids)` over the **5 perp venues** (Binance, OKX, Bybit, Gate, MEXC); requires **≥ 2** venues present, else `None` |

The outer median is robust to a single outlier. **Absent components simply drop out** — with two present the mark is their midpoint, with one it's that value. With no internal book and no external perps, `mark = C1 = oracle + EMA(basis)`, degrading gracefully toward the spot oracle rather than freezing.

**A lone C2 is rejected.** If the *only* present component is the internal quote-mid (no oracle, no external perps), the mark is left untouched rather than letting a single resting spread — which an adversary controls — define the liquidation/funding price. A lone C1 (external oracle) or a lone C3 (already a ≥ 2-venue median) is allowed.

- The **C1 EMA** is the determinism-safe `DeterministicEma` (fixed-point `(num, denom)`, fixed decay `0.9548` ≈ a 150 s half-life at the ~10 s recompute cadence). It folds `quote_mid − oracle` only when both a usable two-sided quote and an oracle exist, so an empty or one-sided book doesn't feed it noise. A market that has never had a usable quote keeps `EMA = 0`, i.e. `C1 = the bare oracle`.
- The EMA is **per-asset** (one per perp market).
- The computed median is written to the market's **authoritative mark** (the value every consumer reads), so an ordinary fill stamping the last-trade price cannot shadow it — the median is authoritative for active markets, not just quiet ones.

> ⚠️ **Correction vs. prior text.** The earlier doc modelled C2 as `median(bid, ask, last_trade)` and C3 as a 7-venue weighted median. The real shapes are: C2 = a **two-sided quote mid** (best bid/ask only, last trade excluded), C3 = the **median of 5 external perp venues** (≥ 2 required), and C1 = the oracle plus a fixed-decay (`0.9548`) EMA of the perp basis. Absent components drop out of the median (no `unwrap_or(C1)` substitution), and a lone C2 yields no update.

### Two price planes (read this before reading any number)

MTF carries prices on **two distinct numeric planes** — the #1 source of scale confusion:

| Plane | Type | Scale | Used by |
|-------|------|-------|---------|
| **Book / order / mark plane** | `FixedPrice` (`i128`) / `price_e8` | **1e8 fixed-point** (raw integer = price × 10⁸) | order book, `last_mark_px`, the EVM precompiles (`mark_px_e8`, `entry_px_e8`), `l2_book` level `px`, order `limit_px`, `tick_size` |
| **Oracle / notional / collateral plane** | `rust_decimal::Decimal` | **whole-USDC** (1 unit = 1 USDC) | the oracle aggregator + mark computer (C1/C2/C3 all in `Decimal`), funding `oracle_px`, PM scenario engine, margin/health, and the human `market_info`/`markets` read fields `mark_px`/`oracle_px` |

The mark computer and the oracle aggregation operate entirely in the **`Decimal` whole-USDC plane**. The result is converted to the **1e8 `FixedPrice` plane** when written to the book / `last_mark_px`. The human `market_info` / `markets` read, however, reports `mark_px` and `oracle_px` already scaled back into the **whole-USDC plane** (e.g. `"67042.335"`, not raw 1e8) — only the order/book *submission* fields (`l2_book` level px, order `limit_px`, `tick_size`) stay 1e8. PnL/funding *settlement* runs on a third minor convention — USDC `1e6` (`accumulated_funding_e6` in `mark_settle`). Always check which plane a formula is in before comparing magnitudes.

## The oracle (C1 anchor)

`oracle` — the C1 anchor — is the **weighted median** of up to 10 external spot venues (Binance 3, OKX 2, Bybit 2, Coinbase 2, Bitget / Kraken / KuCoin / Gate / MEXC / MetaFlux-spot 1 each; sum 15), published once per block and signed by the oracle validators. Per-symbol weights are governance-settable (`SetOracleWeights`, `ActionId 148`); a feed stale > 60 s or > 5 % off the cross-venue median is dropped; if < 50 % of weight is present the slot holds its last good value.

The mark's **C3 component is a separate feed set** — perp mids from the **5 perp venues** (Binance, OKX, Bybit, Gate, MEXC), not the spot oracle table. See **[Oracle prices](./oracle-prices.md)** for the full composition, reliability rules, per-symbol overrides, and the `oracle_sources` read.

The [`market_info`](../api/rest/info/perpetuals.md#market_info) read surfaces `mark_source` (the descriptor `"MedianOfOraclesAndMid"`) and the composed `mark_px` / `oracle_px`; the individual C1/C2/C3 components and the weighted source list are not broken out as wire fields.

## Mark vs oracle — why they diverge

It is **normal and expected** for the mark to sit far from the oracle. The oracle tracks **spot**; the mark tracks where the **perp** trades — and a perp can carry a persistent **basis** (premium or discount) to spot:

- **C2** is the MetaFlux perp book mid, **C3** is the external *perp* median — both reflect perp, not spot.
- **C1** is `oracle + EMA(quote_mid − oracle)` — the basis EMA pulls even the oracle anchor toward the perp's running premium, so all three components track the perp.

So when a perp trades at, say, a 30 % discount to its spot index, `mark ≈ perp` and `oracle ≈ spot` legitimately diverge by ~30 %. That gap is exactly what **[funding](./funding-rates.md)** is there to close — and note that if the oracle itself is unreliable, funding is *gated off and decays to 0* even while the mark/oracle gap is wide (so a large gap with ~0 funding means the oracle for that market is being distrusted, not that funding is broken). See [funding gating](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Sanity bands

> **Implementation status:** the 3-component median (absent components dropping out, lone-C2 rejected) is implemented today. The per-block clamp described in this section (a `clamp(candidate, prior ± max_step)` ramp on top of the median) is a **design specification, not yet a discrete clamp in the mark computer** — the structural median is currently the primary manipulation defence. The closest live guard copies the oracle into a stale book's `last_mark_px` rather than ramping. Treat the numbers below as the intended band design; verify against the live values before relying on exact clamp numbers.

Even with composition, an adversary can push two of three sources simultaneously. Mark therefore is intended to enforce **bands** per block:

```
prior_mark   = mark at block T-1
band_pct     = market parameter, default 0.5% per second
max_step     = prior_mark * band_pct * (block_time_ms / 1000)

candidate    = median(...)
mark_T       = clamp(candidate, prior_mark - max_step, prior_mark + max_step)
```

| Default | Value |
|---------|-------|
| `band_pct` | 0.5% per second |
| `block_time_ms` | 100 ms |
| `max_step_per_block` | ~0.05% |

At 0.05% per 100 ms, a 5% move takes ≈10 seconds. Genuine fast moves catch up over a small number of blocks; adversarial spikes are clamped to a short ramp.

If the candidate exceeds the band repeatedly for `band_violation_blocks` (default 50 = ~5 s), the protocol assumes a real regime shift and widens the band by 2× for one window. This prevents permanent freeze during true market dislocations.

## What uses mark

| Consumer | Why mark? |
|----------|-----------|
| Margin (init + maint) | Stable basis; resistant to manipulation |
| Liquidation tier eval | Same |
| Funding (vs oracle) | Required by funding formula |
| Trigger orders (StopLoss / TakeProfit) | Resistant to single-trade spikes |
| PnL display (unrealised) | Stable user-facing number |
| Insurance accounting | Stable |

Consumers that use **last trade** instead of mark:
- Fill prices on the book (trades fill at actual book prices)
- Maker / taker fees (computed against fill price, not mark)
- Realised PnL (computed at exit fill price)

## Querying

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","coin":"BTC"}'
```

The [`market_info`](../api/rest/info/perpetuals.md#market_info) read reports `mark_px` and
`oracle_px` on the **human-decimal plane** (e.g. `"67042.335"`), plus the
`mark_source` descriptor:

```json
{
  "type": "market_info",
  "data": {
    "coin":        "BTC",
    "mark_source": "oracle_median",
    "mark_px":     "67042.335",
    "oracle_px":   "67042.335"
  }
}
```

The three internal components `C1`/`C2`/`C3` (oracle+EMA anchor / internal-book
median / external-perp weighted median) and the band-state (`Ok` / `Banded` /
`Frozen`) live inside the mark computer; they are
**not** broken out as `market_info` wire fields today — only the composed
`mark_px` is published. Banded means the band clamped the candidate this block;
Frozen means all sources failed and the protocol is holding prior mark.

A dedicated `mark` WS channel is on the [WS roadmap](../api/ws/subscriptions.md#roadmap--not-yet-available) (not yet streaming); poll [`market_info`](../api/rest/info/perpetuals.md#market_info) for `mark_px` meanwhile.

## Edge cases

<details>
<summary>Show edge cases</summary>

- **Genuine 5% move in 1 s.** The band clamps the first 10 blocks; mark catches up at ~0.05% per block, then the regime-shift detection widens the band, and mark catches up faster. The total lag is ~1–2 seconds; large but bounded.
- **Oracle outage > 50 % weight missing.** When less than 50 % of the spot weight is present in a tick, the oracle slot is **not updated** — the previous good tick persists. C1 keeps using the last good oracle + its EMA, so mark stays anchored.
- **Empty / one-sided MTF book.** C2 drops out. Mark = `midpoint(C1, C3)` (or `C1` alone if perps are also down) — it tracks the oracle anchor blended with external perps. Funding still uses the available oracle; liquidations proceed against the oracle-anchored mark.
- **All external perps down.** C3 drops out. Mark = `midpoint(C1, C2)` — internal quote mid vs the oracle anchor.
- **No book and no perps.** Only C1 remains ⇒ `mark = C1 = oracle + EMA(basis)`. Pure oracle-anchored.
- **Only a one-sided/empty oracle-less quote.** A lone C2 is rejected ⇒ no update; the mark holds its last value until an external anchor (oracle or perps) returns.
- **Stale C1 EMA.** The EMA is by construction always defined once at least one internal mid has ever folded in; it holds its last value while no new mid arrives (it's only updated when C2 is present).
- **Trigger orders during freeze.** Trigger evaluation uses mark; during freeze, no trigger fires. Resting orders sit until a real mark resumes.

</details>

## Sequence — mark band engages on a spike

The 3-component median already neutralises a single-source spike before any band:

```
block T-1   C2(book mid)=100.0  C1(oracle+EMA)=100.0  C3(perps)=100.0  →  median3 = 100.0

block T:    thin MTF book; adversary lifts the internal mid to 110.0
            C2 = 110.0,  C1 = 100.05,  C3 = 100.05   (external perps + oracle unmoved)
            mark = median3(100.05, 110.0, 100.05) = 100.05
            ↑ the adversarial C2 is the OUTLIER → median discards it; mark ≈ oracle anchor

block T+1:  adversary persists at 110.0; oracle/perps drift up slowly
            C2 = 110.0,  C1 = 100.10,  C3 = 100.10
            mark = median3(100.10, 110.0, 100.10) = 100.10

... mark tracks the (C1, C3) consensus; a single manipulated source never wins the median
```

The defence is structural: to move the median an adversary must move at least **two** of the three components, and C1 (oracle) + C3 (5-venue external perp median) are exactly the hard-to-move ones. The optional per-block sanity band below is an additional clamp on top.

## See also

- [Funding rates](./funding-rates.md) — funding uses mark vs oracle
- [Tiered liquidation](./tiered-liquidation.md) — tier eval against mark
- [`mark` WS channel (roadmap)](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [Oracle prices](./oracle-prices.md) — full source list, weights, reliability rules

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Why not just use the oracle directly?**
A: A pure-oracle mark gives the oracle operators the ability to liquidate the book by manipulating the feed. Median-of-three diversifies the trust surface.

**Q: Can I see what the band did historically?**
A: Mark history with band-state will be exposed once the `mark` WS channel ships (roadmap) and via archival indexer responses; it is not on the live read surface yet.

**Q: Will the band cause unfair liquidations?**
A: The band slows mark relative to the underlying — so during a real crash, your maintenance can hold healthy for an extra ~1 second longer than at a venue that uses last-trade. The reverse is also true (mark unwinds slowly). Net effect: liquidation behaviour is more deterministic and harder to weaponise.

</details>
