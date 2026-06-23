# Oracle prices

:::tip
**Stable.**
:::

## TL;DR

The **oracle price** is the protocol's per-asset reference price for an underlying, composed once per block as a **weighted median of external spot venues**. It is the external anchor that both the [mark price](./mark-prices.md) (its C1 component) and [funding](./funding-rates.md) (the settlement reference) are built on. The oracle is deliberately *spot-derived and slow to push* — it is not the MetaFlux book price and not the last trade.

Two distinct feed sets feed the protocol, and they are easy to confuse:

| Feed set | Venues | Aggregation | Drives |
|----------|--------|-------------|--------|
| **Spot oracle** | up to **10 spot venues** | weighted median | `oracle_px`; the mark C1 anchor; funding settlement notional |
| **External perp mids** | **5 perp venues** (Binance, OKX, Bybit, Gate, MEXC) | median (≥ 2 present) | the mark **C3** component only |

## Why an oracle (and not the book)?

Margin, liquidation, and funding all need a price that an adversary **cannot** push with a single trade on a thin MetaFlux book. A market-wide weighted median of deep external spot venues is exactly that: to move it you must move spot across many venues at once, which is expensive and self-arbitraging. The internal book *does* feed the mark (via the C2 and C1-basis terms) — but always blended against this external anchor.

## Composition

`oracle_px` is the **weighted median** of the present spot venues for the asset.

### Default spot weight table (sum = 15)

| Venue | Weight | | Venue | Weight |
|-------|-------:|-|-------|-------:|
| Binance | 3 | | Kraken | 1 |
| OKX | 2 | | KuCoin | 1 |
| Bybit | 2 | | Gate | 1 |
| Coinbase | 2 | | MEXC | 1 |
| Bitget | 1 | | MetaFlux spot | 1 |

A **weighted median** (not a weighted mean) is used so a single venue printing a garbage tick cannot drag the result — it only shifts which sample sits at the weighted midpoint.

### Per-symbol governance weights

The default table is a fallback. A governance-only `SetOracleWeights { asset_id, weights }` action (`ActionId 148`) **replaces** (not merges) the table for one asset — necessary because long-tail and permissionless ([MIP-3](../mip/mip-3.md)) markets are often not listed on Binance / Coinbase, so the default weights would resolve to nothing usable. Market deployers **cannot** set their own weights (choosing your oracle sources = choosing your own mark); new markets cold-start on the default table and only governance can override.

The committed per-market source set is queryable — see [`oracle_sources`](#querying) — as a subset mask over the venue list.

## Reliability rules

The aggregator is built to degrade rather than lie. Per tick, in order:

- **Per-feed staleness.** A venue that has not produced a fresh print within `feed_staleness_ms` (default **60 s**) is treated as absent for this tick.
- **Cross-venue outlier reject.** A venue more than `feed_deviation_pct` (default **5 %**) away from the cross-venue median is dropped before the weighted median is taken — a defence against a single stuck/zero/fat-finger print.
- **Renormalize on the survivors.** Absent venues are treated as weight 0 and the remaining weights are renormalized.
- **Minimum-coverage hold.** If **less than 50 %** of the total configured weight is present in a tick, the oracle slot is **not updated** — the previous good value persists. This is the hard floor that stops one or two surviving venues from defining the price during a market-wide feed outage.

A venue whose weight is set to 0 (e.g. delisted for that symbol) is simply never requested.

## Publication

The composed `oracle_px` is published **once per block**, derived from the consensus block timestamp (never wall-clock), and signed by the oracle validators in the active set. Because the median, the staleness/outlier filters, and the timestamp are all consensus-derived, every honest validator computes a **byte-identical** oracle snapshot for the block.

## Relationship to mark and funding

- **Mark.** The oracle is the mark's **C1 anchor**: `C1 = oracle + EMA(book_mid − oracle)`. With no internal book and no external perps, the mark degrades all the way to the oracle. See [mark prices](./mark-prices.md).
- **Funding.** Funding is the gap between the **impact price** (depth-weighted book price) and the **oracle**, and it **settles against the oracle**. Crucially, when the oracle for a market is stale or untrusted, funding for that market is *gated off* and decays toward 0 rather than settling against a price nobody trusts. See [funding rates](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Querying

The composed `oracle_px` is reported on the **whole-USDC plane** (e.g. `"67042.335"`) by the [`market_info`](../api/rest/info.md#market_info) read, alongside `mark_px`:

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

```json
{
  "type": "market_info",
  "data": {
    "asset_id":  0,
    "mark_px":   "67042.335",
    "oracle_px": "67042.335"
  }
}
```

The committed per-market source set is queryable via `oracle_sources` (the enabled-venue subset for a market):

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"oracle_sources","asset_id":0}'
```

The per-venue raw inputs and the exact weights used in a tick live in committed state; they are not (yet) broken out as wire fields beyond the source subset.

## Edge cases

<details>
<summary>Show edge cases</summary>

- **One venue stuck at a stale price.** Dropped by the staleness filter (> 60 s) or the outlier filter (> 5 % from the cross-venue median), whichever trips first; the median is taken over the survivors.
- **Market-wide outage (< 50 % weight present).** The oracle slot holds its last good value. Mark's C1 keeps using that value, so margin/liquidation stay anchored instead of freezing or snapping to a thin print.
- **Long-tail market not on the majors.** Cold-starts on the default table (which mostly resolves to nothing) until governance sets a per-symbol `SetOracleWeights` override pointing at the venues that actually list it.
- **Spot oracle healthy but perps diverge.** Normal — the perp can trade at a persistent premium/discount to spot. The oracle (spot) stays put; the mark moves with the perp via C2/C3 and the C1 basis EMA. See [mark vs oracle](./mark-prices.md#mark-vs-oracle--why-they-diverge).

</details>

## See also

- [Mark prices](./mark-prices.md) — the oracle is the mark's C1 anchor
- [Funding rates](./funding-rates.md) — funding is impact-price vs oracle, settled vs oracle
- [MIP-3 — permissionless perp deploy](../mip/mip-3.md) — why per-symbol oracle weights exist

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Is the oracle the same as the mark price?**
A: No. The oracle is a pure external-spot reference. The mark is a manipulation-resistant *composition* that blends the oracle with the MetaFlux book and external perp mids. They agree when the perp tracks spot and diverge when the perp carries a basis. See [mark prices](./mark-prices.md).

**Q: Can the oracle operators move my liquidation price?**
A: A pure-oracle mark would let them. That is exactly why mark is a median-of-three: the oracle is only one of three components, so a manipulated feed is outvoted unless the book and external perps move with it.

**Q: Which venues price a given market?**
A: The default 10-venue table, unless governance set a per-symbol override. Query `oracle_sources` for the committed subset of a specific market.

</details>
