# Mark prices

The mark price is the price that the protocol uses for margin, liquidation, funding and triggers. This page describes how the protocol computes it and where to read it.

:::tip
**Stable.**
:::

## Summary {#tldr}

The **mark price** is the authoritative price of the protocol per asset. It is the price for margin, liquidation, funding and trigger evaluation. It is a median of three components: the oracle anchor (plus a basis EMA), the internal quote mid, and the external perp median. The protocol recomputes it continuously. It is not the last trade price.

## Mark price and last trade {#why-mark--last-trade}

A margin system on the last trade price is open to abuse. A small adversarial trade at a manipulated price can push other users into liquidation. The mark is a smoothed composition of several sources, which is hard to push.

## Composition {#composition}

The implemented mark is the 3-component median below (`mark_source: "MedianOfOraclesAndMid"`). It is not a flat `median(mid, oracle, ema_mid)`.

### Computation {#how-its-computed}

```
mark = median( present components of {C1, C2, C3} )
        # 3 present → median3   2 present → midpoint   1 present → that value
        # a lone C2 (no external anchor) yields no update — see below
```

The three components are:

| Component | Definition |
|-----------|------------|
| **C1** (oracle anchor) | `C1 = oracle + EMA(quote_mid − oracle)`. The oracle plus a fixed-decay EMA of the perp's basis (a half-life of about 150 s at the recompute cadence) |
| **C2** (internal book) | `mid(best_bid, best_ask)`. Best bid and ask only. It requires both sides and an uncrossed book, otherwise `None`. It excludes the last trade deliberately: with the last trade in it, the recompute would refer to itself and could freeze a thin one-sided book |
| **C3** (external perps) | `median(external perp mids)` over the 5 perp venues (Binance, OKX, Bybit, Gate, MEXC). It requires at least 2 venues, otherwise `None` |

The outer median tolerates one outlier component. Absent components drop out. With two components, the mark is their midpoint. With one, the mark is that value. With no internal book and no external perps, `mark = C1 = oracle + EMA(basis)`. The mark thus moves toward the spot oracle and does not freeze.

The protocol rejects a lone C2. If the only component is the internal quote mid (no oracle, no external perps), the mark does not change. A single resting spread, which an adversary controls, thus cannot set the liquidation and funding price. A lone C1 (external oracle) or a lone C3 (already a median of at least 2 venues) is allowed.

- The C1 EMA is the deterministic `DeterministicEma`: fixed-point `(num, denom)`, fixed decay `0.9548`, which is about a 150 s half-life at the ~10 s recompute cadence. It folds in `quote_mid − oracle` only when a usable two-sided quote and an oracle both exist. An empty or one-sided book thus adds no noise to it. A market that never had a usable quote keeps `EMA = 0`, that is, `C1 = the bare oracle`.
- The EMA is per asset (one for each perp market).
- The protocol writes the computed median to the authoritative mark of the market, which every consumer reads. An ordinary fill that writes the last trade price cannot replace it. The median is authoritative for active markets, not only for quiet ones.

:::note
An earlier version of this page modelled C2 as `median(bid, ask, last_trade)` and C3 as a 7-venue weighted median. The real shapes are as follows. C2 is a two-sided quote mid: best bid and ask only, with the last trade excluded. C3 is the median of 5 external perp venues, with at least 2 required. C1 is the oracle plus a fixed-decay (`0.9548`) EMA of the perp basis. Absent components drop out of the median (there is no `unwrap_or(C1)` substitution), and a lone C2 gives no update.
:::

### Two price planes {#two-price-planes-read-this-before-reading-any-number}

Read this section before you read any number. MTF keeps prices on two distinct numeric planes. This is the most common cause of scale errors.

| Plane | Type | Scale | Used by |
|-------|------|-------|---------|
| **Book / order / mark plane** | `FixedPrice` (`i128`) / `price_e8` | **1e8 fixed-point** (raw integer = price × 10⁸) | the order book in committed state, `last_mark_px`, the EVM precompiles (`mark_px_e8`, `entry_px_e8`), and the **write** side: `/exchange` order `limit_px` and `trigger_px` |
| **Oracle / notional / collateral plane** | `rust_decimal::Decimal` | **whole-USDC** (1 unit = 1 USDC) | the oracle aggregator + mark computer (C1/C2/C3 all in `Decimal`), funding `oracle_px`, PM scenario engine, margin/health, and the human `markets` read fields `mark_px`/`oracle_px` |

The mark computer and the oracle aggregation run fully in the `Decimal`
whole-USDC plane. The protocol converts the result to the 1e8 `FixedPrice` plane
when it writes it to the book and `last_mark_px`.

The read side is human. The write side is raw. This rule decides the plane of a
number:

- Every `/info` read answers in whole units, as a decimal string. `markets`
  reports `mark_px` and `oracle_px` scaled back (for example `"67042.335"`, not
  raw 1e8). `l2_book` level `px` and `sz`, and `tick_size`, are the same. The
  node divides by 10⁸ and rounds to the tick before it answers. Do not multiply
  a read value by 10⁸.
- `/exchange` order submission fields stay raw 1e8. `limit_px` and `trigger_px`
  are `u64` tick units, and `size` is raw lots. The caller must convert a read
  price back for submission.

Funding settlement is not on a third plane. Core settles funding in the
`Decimal` whole-USDC plane, the same plane as the oracle and margin.
`accumulated_funding_e6` is a field of the EVM precompile ABI only. It is in the
encoded input and output of the `mark_settle` precompile, because a Solidity
caller has no decimal type and needs a fixed integer scale. Core does not settle
on it, and no `/info` read returns it. Always check the plane of a formula
before you compare magnitudes.

## The oracle (C1 anchor) {#the-oracle-c1-anchor}

`oracle`, the C1 anchor, is the *weighted median* of up to 10 external spot venues: Binance 3, OKX 2, Bybit 2, Coinbase 2, and Bitget, Kraken, KuCoin, Gate, MEXC and MetaFlux-spot 1 each, for a sum of 15. It is published once per block, and the oracle validators sign it. Governance can set the weights per symbol (`SetOracleWeights`, `ActionId 148`). A feed that is stale for more than 60 s, or more than 5 % away from the cross-venue median, is dropped. If less than 50 % of the weight is present, the slot keeps its last good value.

The C3 component of the mark uses a separate set of feeds: perp mids from the 5 perp venues (Binance, OKX, Bybit, Gate, MEXC), not the spot oracle table. See [Oracle prices](./oracle-prices.md) for the full composition, the reliability rules and the per-symbol overrides.

[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) returns `mark_source` (the descriptor `"MedianOfOraclesAndMid"`). [`markets`](../api/rest/info/perpetuals.md#markets) returns the composed `mark_px` and `oracle_px`. The individual C1/C2/C3 components and the weighted source list are not wire fields.

## Mark and oracle divergence {#mark-vs-oracle--why-they-diverge}

The mark can be far from the oracle. This is normal. The oracle tracks spot. The mark tracks the price at which the perp trades. A perp can have a persistent *basis*, a premium or a discount to spot:

- C2 is the mid of the MetaFlux perp book, and C3 is the external perp median. Both reflect the perp, not spot.
- C1 is `oracle + EMA(quote_mid − oracle)`. The basis EMA pulls the oracle anchor toward the running premium of the perp. Thus all three components track the perp.

For example, when a perp trades at a 30 % discount to its spot index, `mark ≈ perp` and `oracle ≈ spot` correctly diverge by about 30 %. [Funding](./funding-rates.md) exists to close that gap. If the oracle itself is unreliable, funding is *gated off and decays to 0*, even while the mark-oracle gap is wide. A large gap with funding near 0 thus means that the protocol does not trust the oracle for that market. It does not mean that funding is broken. See [funding gating](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Sanity bands {#sanity-bands}

:::note
The mark computer runs the 3-component median: absent components drop out, and a lone C2 is rejected. It does not run the per-block clamp that this section describes. The `clamp(candidate, prior ± max_step)` ramp is a design specification. The structural median is the main defence against manipulation. The nearest guard in the code copies the oracle into the `last_mark_px` of a stale book, with no ramp. Read the numbers below as the intended band design. Check them against the values that a market reports before you rely on them.
:::

Even with the composition, an adversary can push two of the three sources at the same time. The design thus has the mark enforce *bands* per block:

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

At 0.05% per 100 ms, a 5% move takes about 10 seconds. A real fast move catches up over a small number of blocks. An adversarial spike is clamped to a short ramp.

If the candidate exceeds the band repeatedly for `band_violation_blocks` (default 50, about 5 s), the protocol assumes a real regime change. It widens the band by 2× for one window. This prevents a permanent freeze during a real market dislocation.

## What uses mark {#what-uses-mark}

| Consumer | Why mark? |
|----------|-----------|
| Margin (init + maint) | Stable basis that resists manipulation |
| Liquidation tier eval | Same |
| Funding (vs oracle) | The funding formula requires it |
| Trigger orders (StopLoss / TakeProfit) | Resists single-trade spikes |
| PnL display (unrealised) | Stable number for users |
| Insurance accounting | Stable |

These consumers use the last trade, not the mark:

- Fill prices on the book. Trades fill at actual book prices.
- Maker and taker fees. They are computed on the fill price, not the mark.
- Realized PnL. It is computed at the exit fill price.

## Querying {#querying}

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"markets","coin":"BTC"}'
```

The [`markets`](../api/rest/info/perpetuals.md#markets) read reports `mark_px`
and `oracle_px` on the human-decimal plane (for example `"67042.335"`), and the
`mark_source` descriptor:

```json
{
  "type": "markets",
  "data": {
    "coin":        "BTC",
    "mark_source": "oracle_median",
    "mark_px":     "67042.335",
    "oracle_px":   "67042.335"
  }
}
```

The three internal components `C1`/`C2`/`C3` (oracle+EMA anchor, internal-book
median, external-perp weighted median) and the band state (`Ok` / `Banded` /
`Frozen`) are inside the mark computer. They are not `markets` wire fields
today. Only the composed `mark_px` is published. `Banded` means that the band
clamped the candidate in this block. `Frozen` means that all sources failed and
the protocol holds the prior mark.

A dedicated `mark` WS channel is on the [WS roadmap](../api/ws/subscriptions.md#roadmap--not-yet-available). It does not stream yet. Until then, poll [`markets`](../api/rest/info/perpetuals.md#markets) for `mark_px`.

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **Real 5% move in 1 s.** The band clamps the first 10 blocks, and the mark catches up at about 0.05% per block. Then the regime-change detection widens the band, and the mark catches up faster. The total lag is about 1–2 seconds: large but bounded.
- **Oracle outage with more than 50 % of the weight missing.** When less than 50 % of the spot weight is present in a tick, the oracle slot does not update. The previous good tick stays. C1 keeps the last good oracle plus its EMA, so the mark stays anchored.
- **Empty or one-sided MTF book.** C2 drops out. The mark is `midpoint(C1, C3)`, or `C1` alone if the perps are also down. It tracks the oracle anchor blended with the external perps. Funding still uses the available oracle. Liquidations continue against the oracle-anchored mark.
- **All external perps down.** C3 drops out. The mark is `midpoint(C1, C2)`: the internal quote mid against the oracle anchor.
- **No book and no perps.** Only C1 remains, so `mark = C1 = oracle + EMA(basis)`. The mark is anchored on the oracle only.
- **Only a one-sided or empty quote, with no oracle.** The protocol rejects a lone C2, so there is no update. The mark keeps its last value until an external anchor (oracle or perps) returns.
- **Stale C1 EMA.** The EMA is always defined once at least one internal mid has folded in. It keeps its last value while no new mid arrives, because it updates only when C2 is present.
- **Trigger orders during a freeze.** Trigger evaluation uses the mark. During a freeze, no trigger fires. Resting orders wait until a real mark resumes.

</details>

## Mark during a spike {#sequence--mark-band-engages-on-a-spike}

The 3-component median removes a single-source spike before any band applies:

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

The defence is structural. To move the median, an adversary must move at least two of the three components. C1 (oracle) and C3 (the 5-venue external perp median) are the components that are hard to move. The optional per-block [sanity band](#sanity-bands) is an extra clamp on top.

## See also {#see-also}

- [Funding rates](./funding-rates.md): funding uses the mark against the oracle.
- [Tiered liquidation](./tiered-liquidation.md): tier evaluation against the mark.
- [`mark` WS channel (roadmap)](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [Oracle prices](./oracle-prices.md): the full source list, weights and reliability rules.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Why not use the oracle directly?**
A: With a mark from the oracle only, the oracle operators could liquidate the book by manipulating the feed. A median of three spreads the trust across sources.

**Q: Can I see what the band did in the past?**
A: Mark history with the band state will be available when the `mark` WS channel ships (roadmap), and through archive indexer responses. It is not on the current read surface yet.

**Q: Will the band cause unfair liquidations?**
A: The band slows the mark relative to the underlying. During a real crash, your maintenance can stay healthy about 1 second longer than at a venue that uses the last trade. The reverse is also true: the mark unwinds slowly. The net effect is that liquidation behaviour is more deterministic and harder to abuse.

</details>
