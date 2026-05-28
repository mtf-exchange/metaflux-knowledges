# Mark prices

{% hint style="success" %}
**Stable.**
{% endhint %}

## TL;DR

The **mark price** is the protocol's authoritative price per asset for margin, liquidation, funding, and trigger evaluation. It's a composition of multiple sources (mid, oracle, EMA), guarded by sanity bands, recomputed every block. It is NOT the last trade price.

## Why mark ≠ last trade

Using last-trade for margin is exploitable: a small adversarial trade at a manipulated price can push other users into liquidation. Mark is a smoothed, multi-source composition that's hard to push.

## Composition

```
mark = median(
   mid,
   oracle,
   ema_mid
)
```

| Source | Definition |
|--------|-----------|
| `mid` | Best-bid–best-offer midpoint at last commit. `null` if book empty on either side. |
| `oracle` | External price feed — see [Oracle composition](#oracle-composition) below. |
| `ema_mid` | EMA of `mid` over `mark_ema_window_ms` (default 5 minutes). |

The median of three values is robust to a single outlier — if mid spikes from a thin-book burst, the median falls back to oracle + ema_mid. If the oracle pauses, median = mid + ema_mid.

When fewer than 3 valid sources exist (e.g. empty book → no mid), the rule degrades:

| Valid sources | Mark |
|---------------|------|
| mid, oracle, ema_mid | `median()` |
| oracle, ema_mid | `(oracle + ema_mid) / 2` |
| oracle only | `oracle` |
| ema_mid only (oracle failed) | `ema_mid` (with [sanity-band freeze](#sanity-bands)) |
| none | freeze: keep prior mark |

## Oracle composition

`oracle` is itself a composition of external feeds. Defaults per market are governance-set; common shape:

```
oracle = TWA(
   external_cex_feeds,  // e.g. weighted median across CEXes
   window_ms = 30_000
)
```

The full source list per market is published in the `market_info` response:

```json
{
  "type": "market_info",
  "data": {
    "asset_id": 0,
    "mark_source": "MedianOfOraclesAndMid",
    "oracle_sources": [
      { "kind": "cex_feed", "venue": "BinanceSpot", "weight": 1 },
      { "kind": "cex_feed", "venue": "OkxSpot",     "weight": 1 },
      { "kind": "cex_feed", "venue": "BybitSpot",   "weight": 1 }
    ]
  }
}
```

Per-feed sub-rules:
- A feed that hasn't updated within `feed_staleness_ms` (default 60 s) is dropped from the median.
- A feed > `feed_deviation_pct` (default 5%) from the venue median is dropped as an outlier.

The composed `oracle` is itself published once per block, signed by the oracle validators in the active validator set.

## Sanity bands

Even with composition, an adversary can push two of three sources simultaneously. Mark therefore enforces **bands** per block:

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
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

Returns the latest mark + the components:

```json
{
  "type": "market_info",
  "data": {
    "asset_id":  0,
    "mark":   "10055000000",
    "mid":    "10055000000",
    "oracle": "10054200000",
    "ema_mid":"10055100000",
    "mark_status": "Ok"
  }
}
```

`mark_status` ∈ `"Ok"`, `"Banded"`, `"Frozen"`. Banded means the band clamped the candidate this block; Frozen means all sources failed and the protocol is holding prior mark.

Streaming via [WS `mark` channel](../api/ws/subscriptions.md#mark).

## Edge cases

- **Genuine 5% move in 1 s.** The band clamps the first 10 blocks; mark catches up at ~0.05% per block, then the regime-shift detection widens the band, and mark catches up faster. The total lag is ~1–2 seconds; large but bounded.
- **Oracle outage > `feed_staleness_ms`.** All feeds drop; `oracle` is null; median falls back to mid + ema_mid. If both are also unavailable (empty book + oracle out), mark freezes at the prior value. Liquidations halt during freeze.
- **Empty book.** mid = null. Median uses oracle + ema_mid only. Funding computation uses the available oracle. Liquidations proceed against oracle-anchored mark.
- **Stale ema_mid.** ema_mid is by construction always defined once at least one mid has ever been published. Decay continues even with an empty book — `ema_mid_t = ema_mid_{t-1}` while no new mid arrives.
- **Trigger orders during freeze.** Trigger evaluation uses mark; during freeze, no trigger fires. Resting orders sit until a real mark resumes.

## Sequence — mark band engages on a spike

```
block T-1   mid = 100.0,  oracle = 100.0,  ema_mid = 100.0  →  mark = 100.0
block T:    thin book; adversary lifts mid to 110.0
            mid = 110.0,  oracle = 100.05,  ema_mid = 100.01
            candidate = median(110, 100.05, 100.01) = 100.05
            band: max_step = 100.0 * 0.0005 = 0.05 USDC
            mark_T = clamp(100.05, 99.95, 100.05) = 100.05  (within band)

block T+1:  adversary persists at 110.0; oracle updates slowly
            mid = 110.0,  oracle = 100.10,  ema_mid = 100.02
            candidate = median(110, 100.10, 100.02) = 100.10
            band: max_step = 100.05 * 0.0005 = 0.05
            mark_T+1 = clamp(100.10, 100.00, 100.10) = 100.10  (within band)

... mark ramps at 0.05/block; adversary can't push faster
```

## See also

- [Funding rates](./funding-rates.md) — funding uses mark vs oracle
- [Tiered liquidation](./tiered-liquidation.md) — tier eval against mark
- [`mark` WS channel](../api/ws/subscriptions.md#mark)
- [Oracle](#oracle-composition) — full source list per market

## FAQ

**Q: Why not just use the oracle directly?**
A: A pure-oracle mark gives the oracle operators the ability to liquidate the book by manipulating the feed. Median-of-three diversifies the trust surface.

**Q: Can I see what the band did historically?**
A: Yes — mark history with `mark_status` is in the `mark` WS channel's replay buffer and in archival indexer responses.

**Q: Will the band cause unfair liquidations?**
A: The band slows mark relative to the underlying — so during a real crash, your maintenance can hold healthy for an extra ~1 second longer than at a venue that uses last-trade. The reverse is also true (mark unwinds slowly). Net effect: liquidation behaviour is more deterministic and harder to weaponise.
