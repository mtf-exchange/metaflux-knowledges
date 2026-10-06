# Frequent batch auctions (FBA)

A frequent batch auction (FBA) clears orders in discrete batches at one uniform price. This page describes the mechanism, its order shape and its read.

:::info
**Preview.** Each market opts in through [MIP-3](../mip/mip-3.md). Not all markets run FBA.
:::

## Summary {#tldr}

FBA replaces continuous matching with a discrete auction batch every `batch_interval_ms`. The engine clears all orders in a batch at the same time, at one uniform clearing price. This removes latency-based MEV: an order that arrives one microsecond earlier gets no benefit.

## Continuous and batch matching {#continuous-vs-batch}

| Property | Continuous CLOB | FBA |
|----------|-----------------|-----|
| Matching cadence | On every order arrival | Every `batch_interval_ms` |
| Price discovery | Per-trade | Per-batch (one clearing price) |
| Latency value | High (first-to-arrive wins ties at price) | Zero within a batch |
| Surplus from latency | Captured by HFT | Returned to participants via uniform price |
| Public order visibility | Pre-trade (resting book) | Pre-batch (visible queue) |

## Mechanism {#mechanism}

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
- The single clearing price p* maximizes total cleared volume. This is the same as a walk along the demand and supply curves to their intersection.

The fill price is *uniform* for all participants in the batch. A later arrival does not get a worse price.

## When to use FBA {#when-to-use-fba}

| Asset class | Default | Why |
|-------------|---------|-----|
| Major perps (BTC, ETH) | Continuous CLOB | Liquid. The latency advantage is small compared with the bid-ask spread |
| Long-tail listings (MIP-3) | Optional FBA | Thin book. HFT toxicity costs more than the liquidity it provides |
| Spot pairs | Continuous CLOB | Convention |
| Index / structured products | FBA | Composite pricing needs synchronous clearing |

[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) shows the matching mode of each market as `fba_enabled`. A market with FBA on accepts `fba_submit` into the open batch window. [`fba_submit`](../api/rest/exchange/rfq-utility.md#fba_submit) gives the full action.

## Batch interval {#batch-interval}

Governance sets the interval per market as `period_ms`, in the range
`[100 ms, 5 s]`. Read the current value from the operator read
`fba_batch_state`. Do not assume a fixed default, and do not derive it from
block cadence.

A shorter interval reduces the wait but increases the computational cost.

## Order shape {#order-shape}

```json
{
  "type": "fba_submit",
  "params": {
    "market": 42,
    "side":   "Bid",
    "size":   100000000,
    "price":  10050000000
  }
}
```

`size` and `price` are raw `u64` JSON numbers on the 1e8 plane, not decimal
strings. There is no `batch_id` or `cloid` field. An `fba_submit` always joins
the window that is open for `market` at that time. It cannot target a future
batch. [`fba_submit`](../api/rest/exchange/rfq-utility.md#fba_submit) gives the
full field table.

## Worked example {#worked-example}

Batch t has these orders for asset 42:

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

Walk the demand (cumulative size at each price ≥ candidate):

```
buy-side  cumulative at price ≥ p:
  100.10:  5
  100.05:  5+3 = 8
  100.00:  8+2 = 10
  99.95:   10  (none here)
```

Walk the supply (cumulative size at price ≤ candidate):

```
sell-side cumulative at price ≤ p:
  99.95:   3
  100.00:  3+4 = 7
  100.05:  7+2 = 9
  100.10:  9   (none here)
```

Intersection: at p = 100.00, the buy-side cumulative is 10 and the sell-side cumulative is 7. At p = 100.05, the buy side is 8 and the sell side is 9. The intersection is between 100.00 and 100.05.

The clearing rule maximizes volume:

| p | min(buy, sell) |
|---|----------------|
| 99.95  | min(10, 3) = 3 |
| 100.00 | min(10, 7) = 7 |
| 100.05 | min(8, 9)  = 8 |
| 100.10 | min(5, 9)  = 5 |

The maximum cleared volume is 8, at `p* = 100.05`. Thus:

- All buys ≥ 100.05 fill: bob (5) + alice (3) = 8 BTC bought at 100.05.
- All sells ≤ 100.05 fill: dave (3) + eve (4) + frank (2) = 9 BTC offered. Pro-rata: 8/9 = 88.9% of each, so dave 2.67, eve 3.56 and frank 1.78.
- Carol (buy 2 @ 100.00) does not fill. Her order rolls to t+1 or expires per its TIF.

All filled orders fill at 100.05. Bob does not get a worse price for an earlier arrival, because arrival order has no effect inside a batch.

## Fairness in clearing {#fairness-in-clearing}

When supply > demand at p*, the larger side fills *pro-rata*. Every seller in it gets the same fraction. There is no FIFO and no price priority on the over-supplied side, because every order on it is already at p* or better.

This is the FBA fairness property: at the clearing price, no participant gets a better price than another.

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **Empty batch.** No orders means no clearing event. The next batch starts at once.
- **Single-sided batch.** The batch has only buys or only sells. There is no clearing. All orders roll to the next batch (Gtc) or cancel (Ioc).
- **Tie at clearing.** When two prices both maximize volume, the protocol picks the price closer to the prior mark. This reduces ambiguity in the mark step.
- **Market orders in FBA.** A market order goes in as IOC at an extreme price. It takes part in the batch and fills at p* if it crosses.
- **Reduce-only in FBA.** The engine checks reduce-only at batch close, against the state after earlier fills in the same batch. Clearing is atomic.

</details>

## Sequence {#sequence}

```
window opens
bob:    fba_submit buy 5 @ 100.10
alice:  fba_submit buy 3 @ 100.05
carol:  fba_submit buy 2 @ 100.00
dave:   fba_submit sell 3 @ 99.95
eve:    fba_submit sell 4 @ 100.00
frank:  fba_submit sell 2 @ 100.05
window closes; clearing fires — p* = 100.05; 8 BTC clears
next window opens
```

FBA fills settle into the positions and balances of each account like any other
fill. Node 0.9.6 records a batch clearing on
[`trades`](../api/ws/subscriptions.md#trades) and [`fills`](../api/ws/subscriptions.md#fills).
An older node did not. See
[every order lane records its fill](../api/rest/info/orders-fills.md#unrecorded-fills).
No `/info` read lists past fills for a closed window. To confirm a settlement,
compare [`clearinghouse_state`](../api/ws/subscriptions.md#clearinghouse_state)
before and after, and [`account_state`](../api/ws/subscriptions.md#account_state)
for the balance side.

## Querying {#querying}

The node `/info` read path returns the current FBA pool and the indicative
clearing through `fba_batch_state`.

:::warning
This read is an operator read, not a public read. The public `/exchange` cannot
reach the FBA engine yet, so its read is not public either. The public API
answers with the same error that an unknown type gets. See
[operator lane](../api/rest/info.md#operator-reads). The shape below is what a
node operator sees today. The public API will return the same shape when the
engine opens.
:::

The read takes `coin` (the market symbol). FBA is opt-in per market, so an
unregistered market does not return a 404. It returns a 200 with zeroed fields
(`enabled:false`, empty `orders`, `indicative:null`).

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"fba_batch_state","coin":"BTC"}'
```

```json
{
  "type": "fba_batch_state",
  "data": {
    "coin":        "BTC",
    "enabled":     true,
    "period_ms":   1000,
    "min_lot":     "1",
    "last_settle": 1735689600000,
    "next_settle": 1735689601000,
    "order_count": 11,
    "bid_count":   5,
    "ask_count":   6,
    "bid_size":    "10",
    "ask_size":    "9",
    "orders":      [ /* {oid, owner, side, price, sz, submitted_at} */ ],
    "indicative":  { "clearing_px": "100.5", "matched_size": "8" }
  }
}
```

Prices and sizes are human decimal strings, normalized to tick and lot. This is
a read, not the raw plane of order submission. `next_settle` is derived as
`last_settle + period_ms`. The `indicative` block is the uniform price that
maximizes volume, and the matched size, that the next batch would clear with the
current window. It is computed read-only and is not settled. It is `null` when
there is no cross (a one-sided or empty window). It shows what p\* would be if
the batch closed now. Traders can use it to decide whether to add to the batch.

Timestamp keys have no `_ms` suffix. Only a key that names a duration keeps the
suffix. Thus `period_ms` has it and `last_settle` does not. The
`fba_batch_state` read above shows the full rows.

Orders have no `stp_group`. The chain resolves a self-trade group from committed
state. To publish it would tell every reader which vault an address operates.

The engine computes `indicative` on the window after self-trade prevention, with
the same filter that the auction runs. The price you read is thus the price that
settlement uses. `orders` is the raw parked window and is not filtered. A later
arrival can still change which orders the filter drops.

## Self-trade prevention {#fba-stp}

A batch auction applies self-trade prevention before it clears.

Two parked orders belong to one party when they share an account or a self-trade
group. The chain resolves the group. It ignores the `stp_group` that you send. A
metaliquidity vault and the operator that runs it are one party.

The rule is `CancelNewest`, applied across the whole window. Two orders of one
party can be on opposite sides and *cross*: the bid price is at or above the ask
price. The engine then drops the newer order from that batch. The older order
stays. A dropped order does not cause a drop of any order after it.

Two quotes that do not cross both stay. A party can quote a bid at 99 and an ask
at 101 in the same batch, because no clearing price fills both.

A dropped order is not cancelled and is not held. It leaves the batch with every
other unfilled order, and nothing carries to the next window.

The engine judges the party on two values: the group stored when the order
parked, and the group that committed state resolves at settlement. This is
deliberate. The resolved value catches a binding created inside the window. The
stored value catches a binding revoked inside the window. Neither direction
allows a self-cross.

## See also {#see-also}

- [Order types](./order-types.md)
- [`fba_submit`](../api/rest/exchange/rfq-utility.md#fba_submit): the full action reference.
- [MIP-3](../mip/mip-3.md): markets opt into FBA at deploy.
- [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta): check `fba_enabled` per market.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Does FBA give up price discovery?**
A: No. Within a batch, the protocol still discovers `p*` from the orders of the participants. Discovery occurs at a fixed cadence, not continuously.

**Q: Why a 1 s batch and not 100 ms?**
A: 100 ms is too short to remove the latency advantage. Within 100 ms, faster machines can still send again. With 1 s, physical network latency is larger than the latency inside a batch, which removes the HFT advantage.

**Q: Can FBA markets exist with CLOB markets?**
A: Yes. Each market is FBA or CLOB independently. An account can hold positions in both at the same time.

**Q: Does FBA reduce the gas or compute cost of matching?**
A: Approximately. Continuous matching does O(1) work per arrival. FBA does O(N log N) at batch close. For N orders per batch, FBA is comparable, and its cost per block is more predictable.

</details>
