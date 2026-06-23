# Frequent batch auctions (FBA)

:::info
**Preview.** Per-market opt-in via [MIP-3](../mip/mip-3.md); not all markets run FBA.
:::

## TL;DR

FBA replaces continuous matching with discrete auction batches every `batch_interval_ms`. Orders queued within a batch are cleared simultaneously at a single uniform clearing price. This neutralises latency-based MEV: there's no benefit to being one microsecond faster.

## Continuous vs batch

| Property | Continuous CLOB | FBA |
|----------|-----------------|-----|
| Matching cadence | On every order arrival | Every `batch_interval_ms` |
| Price discovery | Per-trade | Per-batch (one clearing price) |
| Latency value | High (first-to-arrive wins ties at price) | Zero within a batch |
| Surplus from latency | Captured by HFT | Returned to participants via uniform price |
| Public order visibility | Pre-trade (resting book) | Pre-batch (visible queue) |

## Mechanism

```
batch t:        accept orders during [t, t + batch_interval_ms)
batch close t:  freeze the queue
                compute clearing price p*:
                  p* = price at which |aggregated buy demand| = |aggregated sell demand|
                fill all crossing orders at p*
                roll any non-crossing orders into batch t+1 (or cancel per TIF)
batch t+1:      open
```

Clearing rules:
- All buys with price ≥ p* fill at p*.
- All sells with price ≤ p* fill at p*.
- The single clearing price p* maximises total cleared volume (equivalent to walking demand/supply curves to the intersection).

The fill price is **uniform** across all participants in the batch — no one is filled at a worse price by virtue of arriving later.

## When to use FBA

| Asset class | Default | Why |
|-------------|---------|-----|
| Major perps (BTC, ETH) | Continuous CLOB | Liquid; latency advantages are small relative to bid-ask |
| Long-tail listings (MIP-3) | Optional FBA | Thin book; HFT toxicity outweighs liquidity provision |
| Spot pairs | Continuous CLOB | Convention |
| Index / structured products | FBA | Composite pricing needs synchronous clearing |

Each market's matching mode is in [`market_info.fba_enabled`](../api/rest/info.md#market_info). Markets with FBA on accept both `FbaOrder` (batch-targeted) and [`submit_order`](../api/rest/exchange.md#submit_order) (treated as FBA orders for the next batch). See the [`/exchange` action catalog](../api/rest/exchange.md#action-catalog) — `FbaOrder` is a recognized-but-unmapped stub today.

## Batch interval

Default: 1 second (10 blocks at 100 ms block time). Governance-set per market in `market_info.fba_batch_interval_ms`. Typical range: 100 ms – 5 s.

Faster intervals reduce the wait but increase computational cost. The 1-second default balances HFT-neutralisation against UX.

## Order shape

```json
{
  "type": "FbaOrder",
  "params": {
    "asset":     42,
    "side":      "Buy",
    "px":  "10050000000",
    "size":   "100000000",
    "batch_id":  9876,
    "cloid":     "0x..."
  }
}
```

`batch_id` selects which batch the order joins. The current batch id is in [`market_info`](../api/rest/info.md#market_info) under `fba_current_batch_id`. Orders with `batch_id < current` are rejected (`{"error":"batch already closed"}`); orders with `batch_id` > current are queued for that future batch.

Omit `batch_id` to target the next batch — the server selects the one currently accepting orders.

## Worked example

Batch t has the following orders for asset 42:

```
buys:
  bob:    5 @ 100.10
  alice:  3 @ 100.05
  carol:  2 @ 100.00

sells:
  dave:   3 @ 99.95
  eve:    4 @ 100.00
  frank:  2 @ 100.05
```

Walk demand (cumulative size at each price ≥ candidate):

```
buy-side  cumulative at price ≥ p:
  100.10:  5
  100.05:  5+3 = 8
  100.00:  8+2 = 10
  99.95:   10  (none here)
```

Walk supply (cumulative size at price ≤ candidate):

```
sell-side cumulative at price ≤ p:
  99.95:   3
  100.00:  3+4 = 7
  100.05:  7+2 = 9
  100.10:  9   (none here)
```

Intersection: at p = 100.00, buy-side cumulative = 10, sell-side cumulative = 7. At p = 100.05, buy-side cumulative = 8, sell-side = 9. Intersection between 100.00 and 100.05.

Clearing rule maximises volume:

| p | min(buy, sell) |
|---|----------------|
| 99.95  | min(10, 3) = 3 |
| 100.00 | min(10, 7) = 7 |
| 100.05 | min(8, 9)  = 8 |
| 100.10 | min(5, 9)  = 5 |

Max cleared volume is 8 at `p* = 100.05`. So:

- All buys ≥ 100.05 fill: bob (5) + alice (3) = 8 BTC bought at 100.05.
- All sells ≤ 100.05 fill: dave (3) + eve (4) + frank (2) = 9 BTC offered. Pro-rata: 8/9 = 88.9% of each → dave 2.67, eve 3.56, frank 1.78.
- Carol (buy 2 @ 100.00) doesn't fill — rolls to t+1 or expires per TIF.

All winners fill at 100.05. Bob doesn't get a worse price for being "earlier" — there's no earlier in FBA.

## Fairness in clearing

When supply > demand at p*, the larger side is **pro-rata** filled — every seller above gets the same fraction. No FIFO, no price priority among the over-supplied side (everyone's already at or better than p*).

This is the FBA fairness property: at the clearing price, no participant gets a better deal than another.

## Edge cases

<details>
<summary>Show edge cases</summary>

- **Empty batch.** No orders → no clearing event. The next batch starts immediately.
- **Single-sided batch.** Only buys (or only sells). No clearing — all orders roll to the next batch (Gtc) or cancel (Ioc).
- **Tie at clearing.** When two prices both maximise volume, the protocol picks the price closer to the prior mark (reduces mark-step ambiguity).
- **Market orders in FBA.** Submitted as IOC at extreme price; participate in the batch and fill at p* if they cross.
- **Reduce-only in FBA.** Checked at batch close, against post-fill state of prior fills within the same batch. Cleared atomically.

</details>

## Sequence

```
t=0.0s   batch_id = 9876 opens
t=0.2s   bob:    FbaOrder buy 5 @ 100.10, batch 9876
t=0.4s   alice:  FbaOrder buy 3 @ 100.05, batch 9876
t=0.5s   carol:  FbaOrder buy 2 @ 100.00, batch 9876
t=0.6s   dave:   FbaOrder sell 3 @ 99.95, batch 9876
t=0.7s   eve:    FbaOrder sell 4 @ 100.00, batch 9876
t=0.8s   frank:  FbaOrder sell 2 @ 100.05, batch 9876
t=1.0s   batch_id 9876 closes; clearing fires
         p* = 100.05; 8 BTC clears
         fills published on `trades` WS with batch_id and "kind":"fba"
t=1.0s   batch_id = 9877 opens
```

## Querying

The live FBA pool + indicative clearing is exposed on the node `/info` read path
via [`fba_batch_state`](../api/rest/info.md#fba_batch_state) — see that entry for
the full response shape and field table. It takes `market_id` (u32). FBA is a
per-market opt-in, so an unregistered market is **not a 404** — it returns a 200
with zeroed fields (`enabled:false`, empty `orders`, `indicative:null`).

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"fba_batch_state","market_id":42}'
```

```json
{
  "type": "fba_batch_state",
  "data": {
    "market_id":      42,
    "enabled":        true,
    "period_ms":      1000,
    "min_lot":        "1",
    "last_settle_ms": 1735689600000,
    "next_settle_ms": 1735689601000,
    "order_count":    11,
    "bid_count":      5,
    "ask_count":      6,
    "bid_size":       "1000000000",
    "ask_size":       "900000000",
    "orders":         [ /* {oid, owner, side, price, size, stp_group, submitted_at_ms} */ ],
    "indicative":     { "clearing_px": "10050000000", "matched_size": "800000000" }
  }
}
```

Prices / sizes are raw **1e8 fixed-point** integer strings (the book / order plane). `next_settle_ms` is **derived** as `last_settle_ms + period_ms`. The `indicative` block is the volume-maximising uniform price + matched size the **next** batch *would* clear given the current window — computed read-only, not yet settled — and is `null` when there is no cross (one-sided or empty window). This is what p\* would be if the batch closed now, useful for traders deciding whether to add to the batch.

## See also

- [Order types](./order-types.md)
- [`/exchange` action catalog](../api/rest/exchange.md#action-catalog) — `FbaOrder` (recognized-but-unmapped stub today)
- [MIP-3](../mip/mip-3.md) — markets opt into FBA at deploy
- [`market_info`](../api/rest/info.md#market_info) — check `fba_enabled` per market

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Doesn't FBA give up price discovery?**
A: No — within a batch the protocol still discovers `p*` from the participants' orders. The discovery happens at fixed cadence rather than continuously.

**Q: Why a 1 s batch instead of 100 ms?**
A: 100 ms is too tight to neutralise latency in any meaningful sense — even within 100 ms, faster machines can re-submit. 1 s gives enough buffer that physical-network latency dominates within-batch latency, removing the HFT edge.

**Q: Can FBA markets co-exist with CLOB markets?**
A: Yes — each market is FBA or CLOB independently. An account can hold positions in both at the same time.

**Q: Does FBA reduce the gas / compute cost of matching?**
A: Roughly. Continuous matching does O(1) work per arrival; FBA does O(N log N) at batch close. For N orders per batch FBA is comparable, with the advantage of being more predictable per-block cost.

</details>
