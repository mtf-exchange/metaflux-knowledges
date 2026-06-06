# Mark prices

{% hint style="success" %}
**Stable.**
{% endhint %}

## TL;DR

The **mark price** is the protocol's authoritative price per asset for margin, liquidation, funding, and trigger evaluation. It's a composition of multiple sources (mid, oracle, EMA), guarded by sanity bands, recomputed every block. It is NOT the last trade price.

## Why mark ≠ last trade

Using last-trade for margin is exploitable: a small adversarial trade at a manipulated price can push other users into liquidation. Mark is a smoothed, multi-source composition that's hard to push.

## Composition

> The implemented mark is the **3-component median** below (`mark_source: "MedianOfOraclesAndMid"`), not a flat `median(mid, oracle, ema_mid)`.

### How it's computed

```
mark = median3( C1, C2.unwrap_or(C1), C3.unwrap_or(C1) )
```

with three components:

| Component | Definition |
|-----------|------------|
| **C1** (oracle anchor) | `C1 = oracle + EMA(MTF_mid − oracle)` over a **150 s** time-weighted EMA |
| **C2** (internal book) | `median(MTF_best_bid, MTF_best_ask, MTF_last_trade)`; degrades to a 2-point mid or a single value when inputs are missing; `None` if the book is fully empty |
| **C3** (external perps) | `weighted_median(CEX perp mids)` across **7 perp-capable sources** (weights mirror the spot table, less Kraken / KuCoin / MTF) |

The outer `median3` is robust to a single outlier. **The fallback is to C1 (the oracle anchor), not a flat re-average:** when the MTF book is empty `C2 = None → C1`; when every perp adapter is down `C3 = None → C1`. So with no internal book and no external perps, `mark = median3(C1, C1, C1) = C1 = oracle + EMA`. This degrades gracefully toward the spot oracle rather than freezing.

- The **C1 EMA** is the determinism-safe `DeterministicEma` (fixed-point `(num, denom)`, `decay = 0.5`, window 150 s) — the same primitive funding uses; it absorbs `MTF_mid − oracle` only when a usable internal mid (C2) exists, so an empty book doesn't feed the EMA noise.
- The EMA is **per-asset** (one `MarkPriceComputer` per market).

> ⚠️ **Correction vs. prior text.** The earlier doc modelled mark as `median(mid, oracle, ema_mid)` with a "degrade table". The real shape is `median3(C1, C2_or_C1, C3_or_C1)` where C1 already blends oracle + a 150 s EMA of (mid − oracle), C2 is a 3-point internal median, and C3 is a 7-venue weighted-median of *external perp* mids. The single-source degrade table is replaced by the `unwrap_or(C1)` fallback above.

### Two price planes (read this before reading any number)

MTF carries prices on **two distinct numeric planes** — the #1 source of scale confusion:

| Plane | Type | Scale | Used by |
|-------|------|-------|---------|
| **Book / order / mark plane** | `FixedPrice` (`i128`) / `price_e8` | **1e8 fixed-point** (raw integer = price × 10⁸) | order book, `last_mark_px`, the EVM precompiles (`mark_px_e8`, `entry_px_e8`), `l2_book` level `px`, order `limit_px`, `tick_size` |
| **Oracle / notional / collateral plane** | `rust_decimal::Decimal` | **whole-USDC** (1 unit = 1 USDC) | the oracle aggregator + mark computer (C1/C2/C3 all in `Decimal`), funding `oracle_px`, PM scenario engine, margin/health, and the human `market_info`/`markets` read fields `mark_px`/`oracle_px` |

The mark computer and the oracle aggregation operate entirely in the **`Decimal` whole-USDC plane**. The result is converted to the **1e8 `FixedPrice` plane** when written to the book / `last_mark_px`. The human `market_info` / `markets` read, however, reports `mark_px` and `oracle_px` already scaled back into the **whole-USDC plane** (e.g. `"67042.335"`, not raw 1e8) — only the order/book *submission* fields (`l2_book` level px, order `limit_px`, `tick_size`) stay 1e8. PnL/funding *settlement* runs on a third minor convention — USDC `1e6` (`accumulated_funding_e6` in `mark_settle`). Always check which plane a formula is in before comparing magnitudes.

## Oracle composition

`oracle` (the spot oracle, and the C1 anchor) is the **weighted median** of up to 10 spot sources, with weights that can be made **per-symbol** by governance.

### Default spot weight table (sum = 15)

| Venue | Weight | | Venue | Weight |
|-------|-------:|-|-------|-------:|
| Binance | 3 | | Kraken | 1 |
| OKX | 2 | | KuCoin | 1 |
| Bybit | 2 | | Gate | 1 |
| Coinbase | 2 | | MEXC | 1 |
| Bitget | 1 | | MTF spot | 1 |

The **C3 mark component** uses the same weights *filtered to perp-capable venues* (drops Kraken / KuCoin / MTF spot → 7 sources, weight sum = 12): Binance 3, OKX 2, Bybit 2, Coinbase 2, Bitget 1, Gate 1, MEXC 1.

### Per-symbol overrides

The default table is a fallback. A governance-only `SetOracleWeights { asset_id, weights }` action (`ActionId 148`) **replaces** (not merges) the default for a given asset — needed because long-tail / MIP-3 markets often aren't listed on Binance/Coinbase. MIP-3 deployers **cannot** set weights themselves (a deployer choosing weights = choosing their own mark price); new markets cold-start on the default table.

**Missing-source handling:** a venue absent in a tick is treated as weight 0 and the rest are renormalized. If less than **50 %** of total weight is present in a tick, the oracle slot is **not updated** — the previous good tick persists (the hard fallback that prevents a single CEX dominating during a market-wide outage).

The per-market source list is the committed oracle-weights table (the default
above, or a per-symbol `SetOracleWeights` override) — conceptually:

```
mark_source = "MedianOfOraclesAndMid"
oracle_sources = [
  { venue: BinanceSpot, weight: 3 },
  { venue: OkxSpot,     weight: 2 },
  { venue: BybitSpot,   weight: 2 },
  ...
]
```

The [`market_info`](../api/rest/info.md#market_info) read surfaces `mark_source`
(the descriptor `"MedianOfOraclesAndMid"`) but does **not** yet enumerate the
weighted source list as a wire field — the weights live in committed state
(`SetOracleWeights`).

Per-feed sub-rules:
- A feed that hasn't updated within `feed_staleness_ms` (default 60 s) is dropped from the median.
- A feed > `feed_deviation_pct` (default 5%) from the venue median is dropped as an outlier.

The composed `oracle` is itself published once per block, signed by the oracle validators in the active validator set.

## Sanity bands

> **Implementation status:** the 3-component `median3` and its `unwrap_or(C1)` fallback are implemented today. The per-block clamp described in this section (a `clamp(candidate, prior ± max_step)` ramp on top of the median) is a **design specification, not yet a discrete clamp in the mark computer** — the structural median is currently the primary manipulation defence. The closest live guard copies the oracle into a stale book's `last_mark_px` rather than ramping. Treat the numbers below as the intended band design; verify against the live values before relying on exact clamp numbers.

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
curl -X POST https://gateway.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

The [`market_info`](../api/rest/info.md#market_info) read reports `mark_px` and
`oracle_px` on the **whole-USDC plane** (e.g. `"67042.335"`), plus the
`mark_source` descriptor:

```json
{
  "type": "market_info",
  "data": {
    "asset_id":    0,
    "mark_source": "MedianOfOraclesAndMid",
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

A dedicated `mark` WS channel is on the [WS roadmap](../api/ws/subscriptions.md#roadmap--not-yet-available) (not yet streaming); poll [`market_info`](../api/rest/info.md#market_info) for `mark_px` meanwhile.

## Edge cases

- **Genuine 5% move in 1 s.** The band clamps the first 10 blocks; mark catches up at ~0.05% per block, then the regime-shift detection widens the band, and mark catches up faster. The total lag is ~1–2 seconds; large but bounded.
- **Oracle outage > 50 % weight missing.** When less than 50 % of the spot weight is present in a tick, the oracle slot is **not updated** — the previous good tick persists. C1 keeps using the last good oracle + its EMA, so mark stays anchored.
- **Empty MTF book.** `C2 = None → C1`. Mark = `median3(C1, C1, C3_or_C1)` — i.e. it tracks the oracle anchor blended with external perps. Funding still uses the available oracle. Liquidations proceed against the oracle-anchored mark.
- **All external perps down.** `C3 = None → C1`. Mark = `median3(C1, C2_or_C1, C1)` — internal book vs the oracle anchor.
- **No book and no perps.** `mark = median3(C1, C1, C1) = C1 = oracle + EMA(mid − oracle)`. Pure oracle-anchored.
- **Stale C1 EMA.** The EMA is by construction always defined once at least one internal mid has ever folded in; it holds its last value while no new mid arrives (it's only updated when C2 is present).
- **Trigger orders during freeze.** Trigger evaluation uses mark; during freeze, no trigger fires. Resting orders sit until a real mark resumes.

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

The defence is structural: to move the median an adversary must move at least **two** of the three components, and C1 (oracle) + C3 (7-venue external perp median) are exactly the hard-to-move ones. The optional per-block sanity band below is an additional clamp on top.

## See also

- [Funding rates](./funding-rates.md) — funding uses mark vs oracle
- [Tiered liquidation](./tiered-liquidation.md) — tier eval against mark
- [`mark` WS channel (roadmap)](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [Oracle](#oracle-composition) — full source list per market

## FAQ

**Q: Why not just use the oracle directly?**
A: A pure-oracle mark gives the oracle operators the ability to liquidate the book by manipulating the feed. Median-of-three diversifies the trust surface.

**Q: Can I see what the band did historically?**
A: Mark history with band-state will be exposed once the `mark` WS channel ships (roadmap) and via archival indexer responses; it is not on the live read surface yet.

**Q: Will the band cause unfair liquidations?**
A: The band slows mark relative to the underlying — so during a real crash, your maintenance can hold healthy for an extra ~1 second longer than at a venue that uses last-trade. The reverse is also true (mark unwinds slowly). Net effect: liquidation behaviour is more deterministic and harder to weaponise.
