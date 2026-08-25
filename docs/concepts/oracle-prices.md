# Oracle prices

:::tip
**Stable.**
:::

## TL;DR {#tldr}

The **oracle price** is the protocol's per-asset reference price for an underlying, composed once per block as a **weighted median of external spot venues**. It is the external anchor that both the [mark price](./mark-prices.md) (its C1 component) and [funding](./funding-rates.md) (the settlement reference) are built on. The oracle is deliberately *spot-derived and slow to push* — it is not the MetaFlux book price and not the last trade.

Two distinct feed sets feed the protocol, and they are easy to confuse:

| Feed set | Venues | Aggregation | Drives |
|----------|--------|-------------|--------|
| **Spot oracle** | up to **10 spot venues** | weighted median | `oracle_px`; the mark C1 anchor; funding settlement notional |
| **External perp mids** | **5 perp venues** (Binance, OKX, Bybit, Gate, MEXC) | median (≥ 2 present) | the mark **C3** component only |

## Why an oracle (and not the book)? {#why-an-oracle-and-not-the-book}

Margin, liquidation, and funding all need a price that an adversary **cannot** push with a single trade on a thin MetaFlux book. A market-wide weighted median of deep external spot venues is exactly that: to move it you must move spot across many venues at once, which is expensive and self-arbitraging. The internal book *does* feed the mark (via the C2 and C1-basis terms) — but always blended against this external anchor.

## Composition {#composition}

`oracle_px` is the **weighted median** of the present spot venues for the asset.

### The ten source slots and their weights {#source-table}

| Venue | Weight | | Venue | Weight |
|-------|-------:|-|-------|-------:|
| Binance | 3 | | Kraken | 1 |
| OKX | 2 | | KuCoin | 1 |
| Bybit | 2 | | Gate | 1 |
| Coinbase | 2 | | MEXC | 1 |
| Bitget | 1 | | MetaFlux spot | 1 |

A **weighted median** (not a weighted mean) is used so a single venue printing a garbage tick cannot drag the result — it only shifts which sample sits at the weighted midpoint.

**There are exactly TEN source slots, and both the slot identities and these
default weights are protocol-fixed.** They are not committed state, so no read
serves them and no governance vote moves them. They change only when a node
release changes them. Track them in the release notes for the version you run,
and re-read this table after an upgrade.

### Per-symbol governance weights {#per-symbol-governance-weights}

The default table is a fallback. A governance-only `SetOracleWeights { asset_id, weights }` action (`ActionId 148`) **replaces** (not merges) the table for one asset — necessary because long-tail and permissionless ([MIP-3](../mip/mip-3.md)) markets are often not listed on Binance / Coinbase, so the default weights would resolve to nothing usable. Inside this venue-weighted-median lane, market deployers **cannot** set their own weights (choosing your oracle sources = choosing your own mark); new markets cold-start on the default table and only governance can override.

A market also carries a **source-subset mask** — one bit per slot, committed per market. The mask is **recorded, not enforced**: the aggregator does not filter its inputs by it today, so every market composes its price from the same source set. Source filtering is a change to price formation, so it needs its own hard-fork boundary; it is not scheduled. Do not size risk on the mask.

**A market's own mask is not a fixed value.** A [MIP-3](../mip/mip-3.md) market's deployer rewrites it at will with `perp_set_oracle`. This page therefore states that the mechanism exists and who controls it; it never states a value for any market. Anything you cache goes stale on the next deployer push.

:::warning
**There is a second price lane, and this page does not describe it.** Everything above is the **venue-weighted-median** lane: validators feed it, governance owns the weights, and no deployer can touch either. A market deployed through [MIP-3](../mip/mip-3.md) does **not** use it. That market prices from a **deployer-operated oracle**: the deployer pushes the index price itself, through [`mip3_set_oracle_px`](../api/rest/exchange.md#mip3_set_oracle_px).

So "deployers cannot choose their own price" is true of this lane only. On a MIP-3 market the deployer **is** the price source. That is why such a market is isolated from the shared collateral pool and why its deploy bond is slashable. The push is bounded (±10 % per push against the committed anchor, an absolute ceiling, and a staleness window that flips the market reduce-only), but the party choosing the number is the deployer.

**The deployer owns price continuity, and the protocol will not fill a gap for it.** MetaFlux runs
no price-discovery mechanism on a deployer market: there is no band that widens when the underlying
goes quiet, and no re-anchoring. Whether the market trades while its underlying is closed is
therefore the deployer's decision, not the protocol's, and BOTH answers are supported.

- **Keep pushing through the closed hours**, at whatever price your own discovery produces, and the
  market trades continuously. A push must land at least once per staleness window
  (`stale_threshold_ms`, read it from
  the operator-lane `mip3_deployer_oracle` read; **60 s** on the live devnet),
  for every market you operate.
- **Or stop, and let the market FREEZE.** Past the window it goes reduce-only, so no one may open,
  and liquidation defers rather than run at a price nobody trusts. Open positions sit untouched
  until a fresh push arrives. For an instrument that genuinely has no price overnight — an equity
  index over a weekend — this is an honest state, not an outage, and several live markets use it.

What you may not do is push a price you do not believe. The push is bounded, but inside those bounds
the number is yours, and the deploy bond is slashable.

That lane is gated per chain by the `mip3_deployer_oracle` protocol feature. A [`mip3_set_oracle_px`](../api/rest/exchange.md#mip3_set_oracle_px) push is refused with `mip3_deployer_oracle feature not active` on a chain where it is off, so a test push tells you the posture. See [MIP-3 — oracle](../mip/mip-3.md#oracle) for the operator rules.
:::

## Reliability rules {#reliability-rules}

The aggregator is built to degrade rather than lie. Per tick, in order:

- **Per-feed staleness.** A venue that has not produced a fresh print within `feed_staleness_ms` (default **60 s**) is treated as absent for this tick.
- **Cross-venue outlier reject.** A venue more than `feed_deviation_pct` (default **5 %**) away from the cross-venue median is dropped before the weighted median is taken — a defence against a single stuck/zero/fat-finger print.
- **Renormalize on the survivors.** Absent venues are treated as weight 0 and the remaining weights are renormalized.
- **Minimum-coverage hold.** If **less than 50 %** of the total configured weight is present in a tick, the oracle slot is **not updated** — the previous good value persists. This is the hard floor that stops one or two surviving venues from defining the price during a market-wide feed outage.

A venue whose weight is set to 0 (e.g. delisted for that symbol) is simply never requested.

## Publication {#publication}

The composed `oracle_px` is published **once per block**, derived from the consensus block timestamp (never wall-clock), and signed by the oracle validators in the active set. Because the median, the staleness/outlier filters, and the timestamp are all consensus-derived, every honest validator computes a **byte-identical** oracle snapshot for the block.

## Relationship to mark and funding {#relationship-to-mark-and-funding}

- **Mark.** The oracle is the mark's **C1 anchor**: `C1 = oracle + EMA(book_mid − oracle)`. With no internal book and no external perps, the mark degrades all the way to the oracle. See [mark prices](./mark-prices.md).
- **Funding.** Funding is the gap between the **impact price** (depth-weighted book price) and the **oracle**, and it **settles against the oracle**. Crucially, when the oracle for a market is stale or untrusted, funding for that market is *gated off* and decays toward 0 rather than settling against a price nobody trusts. See [funding rates](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Querying {#querying}

The composed `oracle_px` is reported on the **whole-USDC plane** (e.g. `"67042.335"`) by the [`markets`](../api/rest/info/perpetuals.md#markets) read, alongside `mark_px`:

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"markets","coin":"BTC"}'
```

```json
{
  "type": "markets",
  "data": {
    "coin":      "BTC",
    "mark_px":   "67042.335",
    "oracle_px": "67042.335"
  }
}
```

**Only the composed price is on the wire.** The per-venue raw inputs, the weights used in a tick, and the per-market source-subset mask are not served by any read. The weights and the slot identities are [protocol-fixed](#source-table) — read them from the release notes. The mask decides nothing today, so there is nothing to act on.

A [MIP-3](../mip/mip-3.md) market prices from its deployer instead. A deployer monitors that feed with the operator-lane `mip3_deployer_oracle` read, which reports the last pushed price, the staleness window, and whether the market is currently reduce-only for opens:

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"mip3_deployer_oracle","coin":"WIF"}'
```

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **One venue stuck at a stale price.** Dropped by the staleness filter (> 60 s) or the outlier filter (> 5 % from the cross-venue median), whichever trips first; the median is taken over the survivors.
- **Market-wide outage (< 50 % weight present).** The oracle slot holds its last good value. Mark's C1 keeps using that value, so margin/liquidation stay anchored instead of freezing or snapping to a thin print.
- **Long-tail market not on the majors.** Cold-starts on the default table (which mostly resolves to nothing) until governance sets a per-symbol `SetOracleWeights` override pointing at the venues that actually list it.
- **Spot oracle healthy but perps diverge.** Normal — the perp can trade at a persistent premium/discount to spot. The oracle (spot) stays put; the mark moves with the perp via C2/C3 and the C1 basis EMA. See [mark vs oracle](./mark-prices.md#mark-vs-oracle--why-they-diverge).

</details>

## See also {#see-also}

- [Mark prices](./mark-prices.md) — the oracle is the mark's C1 anchor
- [Funding rates](./funding-rates.md) — funding is impact-price vs oracle, settled vs oracle
- [MIP-3 — permissionless perp deploy](../mip/mip-3.md) — why per-symbol oracle weights exist

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is the oracle the same as the mark price?**
A: No. The oracle is a pure external-spot reference. The mark is a manipulation-resistant *composition* that blends the oracle with the MetaFlux book and external perp mids. They agree when the perp tracks spot and diverge when the perp carries a basis. See [mark prices](./mark-prices.md).

**Q: Can the oracle operators move my liquidation price?**
A: A pure-oracle mark would let them. That is exactly why mark is a median-of-three: the oracle is only one of three components, so a manipulated feed is outvoted unless the book and external perps move with it.

**Q: Which venues price a given market?**
A: The default 10-venue table, unless governance set a per-symbol override. The per-market subset mask is recorded, not enforced — the aggregator does not filter by it today — so in practice every market prices off the same ten slots. See [the source table](#source-table).

**Q: Does this apply to a market deployed through MIP-3?**
A: No. A MIP-3 market prices from a **deployer-operated oracle**: its deployer pushes the index price directly, and none of the venue table, the weights or the reliability rules above apply to it. See [MIP-3 — oracle](../mip/mip-3.md#oracle).

</details>
