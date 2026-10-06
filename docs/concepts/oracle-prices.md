# Oracle prices

The oracle price is the external reference price of each asset. This page describes its sources, its reliability rules and how it is published.

:::tip
**Stable.**
:::

## Summary {#tldr}

The **oracle price** is the reference price of the protocol for the underlying of each asset. The protocol composes it once per block as a weighted median of external spot venues. Both the [mark price](./mark-prices.md) (its C1 component) and [funding](./funding-rates.md) (the settlement reference) are built on this external anchor. The oracle comes from spot and is deliberately slow to push. It is not the MetaFlux book price and not the last trade.

Two distinct feed sets supply the protocol. They are easy to confuse:

| Feed set | Venues | Aggregation | Drives |
|----------|--------|-------------|--------|
| **Spot oracle** | up to **10 spot venues** | weighted median | `oracle_px`; the mark C1 anchor; funding settlement notional |
| **External perp mids** | **5 perp venues** (Binance, OKX, Bybit, Gate, MEXC) | median (≥ 2 present) | the mark **C3** component only |

## Oracle and book price {#why-an-oracle-and-not-the-book}

Margin, liquidation and funding all need a price that an adversary cannot push with a single trade on a thin MetaFlux book. A market-wide weighted median of deep external spot venues gives that price. To move it, an adversary must move spot on many venues at the same time. That is expensive, and arbitrage corrects it. The internal book does feed the mark (through the C2 and C1-basis terms), but the protocol always blends it with this external anchor.

## Composition {#composition}

`oracle_px` is the weighted median of the spot venues that are present for the asset.

### The ten source slots and their weights {#source-table}

| Venue | Weight | | Venue | Weight |
|-------|-------:|-|-------|-------:|
| Binance | 3 | | Kraken | 1 |
| OKX | 2 | | KuCoin | 1 |
| Bybit | 2 | | Gate | 1 |
| Coinbase | 2 | | MEXC | 1 |
| Bitget | 1 | | MetaFlux spot | 1 |

The protocol uses a weighted median, not a weighted mean. A single venue that prints a bad tick thus cannot pull the result. It only changes which sample is at the weighted midpoint.

There are exactly ten source slots. The protocol fixes both the slot identities
and these default weights. They are not committed state, so no read returns them
and no governance vote changes them. Only a node release changes them. Track them
in the release notes for the version that you run, and read this table again
after an upgrade.

### Per-symbol governance weights {#per-symbol-governance-weights}

The default table is a fallback. A governance-only `SetOracleWeights { asset_id, weights }` action (`ActionId 148`) replaces the table for one asset. It does not merge with it. This is necessary because long-tail and permissionless ([MIP-3](../mip/mip-3.md)) markets are often not listed on Binance or Coinbase. The default weights would then give nothing usable. In this venue-weighted-median path, market deployers cannot set their own weights, because a choice of oracle sources is a choice of mark. New markets start on the default table, and only governance can override it.

A market also has a *source-subset mask*: one bit per slot, committed per market. The mask is recorded, not enforced. The aggregator does not filter its inputs by it today, so every market composes its price from the same source set. Source filtering changes price formation, so it needs its own hard-fork boundary. It is not scheduled. Do not size risk on the mask.

Nobody can change the mask of a market now. The action that wrote it, `perp_set_oracle`, is [retired](../mip/mip-3.md#perp-set-oracle-retired) and refused, because the mask has no reader: the write returned OK and changed no price. The committed value stays frozen until the next re-genesis.

The deployer price control is a different action. A [MIP-3](../mip/mip-3.md) deployer sets the index price of its market with the [`mip3_set_oracle_px`](../api/rest/exchange/deploy-perp.md#mip3_set_oracle_px) overlay. That action is not related to the source mask, and it stays.

:::warning
There is a second price path, and this page does not describe it. All of the above is the venue-weighted-median path. Validators feed it, governance owns the weights, and no deployer can change either. A market deployed through [MIP-3](../mip/mip-3.md) does not use it. That market prices from a *deployer-operated oracle*: the deployer pushes the index price itself, through [`mip3_set_oracle_px`](../api/rest/exchange/deploy-perp.md#mip3_set_oracle_px).

Thus "deployers cannot choose their own price" is true of this path only. On a MIP-3 market, the deployer is the price source. For that reason, such a market is isolated from the shared collateral pool, and its deploy bond is slashable. The push is bounded: ±10 % per push against the committed anchor, an absolute ceiling, and a staleness window that sets the market to reduce-only. But the deployer chooses the number.

The deployer owns price continuity, and the protocol does not fill a gap for it. MetaFlux runs
no price-discovery mechanism on a deployer market. There is no band that widens when the underlying
goes quiet, and no re-anchoring. The deployer thus decides whether the market trades while its
underlying is closed. The protocol supports both answers.

- **Push through the closed hours**, at the price that your own discovery produces, and the market
  trades continuously. A push must land at least once per staleness window
  (`stale_threshold_ms`; read it from the operator read `mip3_deployer_oracle`; **60 s** on the
  live chain), for every market that you operate.
- **Or stop, and let the market freeze.** After the window, the market goes reduce-only, so no one
  can open, and liquidation waits instead of running at a price nobody trusts. Open positions do
  not change until a fresh push arrives. For an instrument that has no price overnight, for example
  an equity index over a weekend, this is a correct state, not an outage. Several live markets use
  it.

Do not push a price that you do not believe. The push is bounded, but inside those bounds the
number is yours, and the deploy bond is slashable.

The `mip3_deployer_oracle` protocol feature gates that path per chain. On a chain where it is off, the node refuses a [`mip3_set_oracle_px`](../api/rest/exchange/deploy-perp.md#mip3_set_oracle_px) push with `mip3_deployer_oracle feature not active`. A test push thus tells you the status. See [MIP-3 — oracle](../mip/mip-3.md#oracle) for the operator rules.
:::

## Self-priced markets {#self-priced-markets}

Some markets have no external venue to price from. MTF is one. Governance marks
such a market *self-priced*. Its index price then comes from a MetaFlux book:
the `<COIN>/USDC` spot pair when one exists, otherwise the perp book of the
market.

One order can move the best bid or the best ask, so the index does not read the
touch. At each oracle update, it applies these rules in order:

1. **Rest time.** An order counts only after it has rested for the rest time. A
   quote that is placed and pulled inside the rest time does not count.
2. **Depth.** Each side prices at the volume-weighted average price (VWAP) of
   its rested orders. The walk starts at the best price and stops at the depth
   floor, in notional. Only orders inside the depth band around the rested mid
   count.
3. **Mid.** The book price is the mid of the bid VWAP and the ask VWAP.
4. **Smoothing.** The index closes 1/N of its gap to that mid, where N is the
   smoothing value. A gap smaller than N × 0.00000001 closes in full, so the
   index reaches the mid exactly.
5. **Move band.** One update never moves the index further than the move band
   from its previous value.

| Rule | Current value |
|---|---|
| Rest time | 2 s |
| Depth floor | 1,000 USDC per side |
| Depth band | 500 bps (5 %) around the rested mid |
| Smoothing | 8 updates |
| Move band | 500 bps (5 %) per update |

These are the current values. They can change.

The index uses a VWAP and not a minimum order size. A small order at the touch
moves the VWAP only by its share of the depth floor. To move the index, a trader
must rest the full depth floor at the new price for the full rest time. Other
traders can fill that order.

The index uses smoothing because the move band limits only one update. With
smoothing, one update covers only part of the gap. The book must thus hold a new
price over several updates before the index reaches it. A real move still
arrives, because the index converges on the book mid.

### When the book gives no price {#self-priced-no-price}

The index keeps its previous value in three cases: one side has no rested order,
the rested best bid is above the rested best ask, or one side cannot fill the
depth floor inside the depth band.

A kept value is not a fresh price. After 60 s without a fresh price, the
[`markets`](../api/rest/info/perpetuals.md#markets) read shows
`px_stale: true` and the market is reduce-only. The node refuses an order that
opens or adds to a position. It accepts an order that reduces a position.
Liquidation and funding wait until a fresh price arrives.

## Reliability rules {#reliability-rules}

The aggregator holds a value instead of reporting a wrong one. Per tick, in order:

- **Per-feed staleness.** A venue with no fresh print within `feed_staleness_ms` (default **60 s**) counts as absent for this tick.
- **Cross-venue outlier reject.** A venue more than `feed_deviation_pct` (default **5 %**) away from the cross-venue median is dropped before the weighted median. This protects against a single stuck, zero or fat-finger print.
- **Renormalize on the survivors.** Absent venues get weight 0, and the remaining weights are renormalized.
- **Minimum-coverage hold.** If less than 50 % of the total configured weight is present in a tick, the oracle slot does not update. The previous good value stays. This hard floor stops one or two surviving venues from setting the price during a market-wide feed outage.

The aggregator never requests a venue whose weight is 0 (for example, a venue that delisted the symbol).

## Publication {#publication}

The composed `oracle_px` is published once per block. It is derived from the consensus block timestamp, never from wall-clock time, and the oracle validators in the active set sign it. The median, the staleness and outlier filters and the timestamp all come from consensus. Thus every honest validator computes a byte-identical oracle snapshot for the block.

A price for one asset needs fresh submissions from validators that hold at least
one third of the active stake. Exactly one third is enough. With less, the asset
keeps its previous price. After 60 s, liquidation and funding on that market
wait for a fresh price. A validator with less than one third of the stake thus
cannot set a price alone. The cost is liveness. If validators that hold more
than two thirds of the stake stop submitting, every market with an external
price holds its price. With the stakes read on 2026-09-26, the largest validator
holds just under one third, so no validator sets a price alone. Two dark
validators never stall the oracle. Three can: the largest and the second largest,
together with any other one, hold more than two thirds.

The 60 s count runs on the block clock. It thus also runs when no asset gets a
fresh price and the chain publishes no new oracle price. A self-priced market
needs no validator stake, so it keeps its book price while some validators still
submit.

## Relationship to mark and funding {#relationship-to-mark-and-funding}

- **Mark.** The oracle is the C1 anchor of the mark: `C1 = oracle + EMA(book_mid − oracle)`. With no internal book and no external perps, the mark falls back fully to the oracle. See [mark prices](./mark-prices.md).
- **Funding.** Funding is the gap between the *impact price* (the depth-weighted book price) and the oracle, and it settles against the oracle. When the oracle for a market is stale or untrusted, funding for that market is *gated off*. It decays toward 0 and does not settle against a price nobody trusts. See [funding rates](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Querying {#querying}

The [`markets`](../api/rest/info/perpetuals.md#markets) read reports the composed `oracle_px` on the whole-USDC plane (for example `"67042.335"`), next to `mark_px`:

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
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

Only the composed price is on the wire. No read returns the raw per-venue inputs, the weights used in a tick, or the per-market source-subset mask. The weights and the slot identities are [fixed by the protocol](#source-table). Read them from the release notes. The mask decides nothing today, so there is nothing to act on.

A [MIP-3](../mip/mip-3.md) market prices from its deployer instead. A deployer monitors that feed with the operator read `mip3_deployer_oracle`. It reports the last pushed price, the staleness window, whether the market is reduce-only for opens now, and who can push:

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"mip3_deployer_oracle","coin":"WIF"}'
```

Two fields on that response name the delegates. `sub_deployers` lists every
address with some authority on the market. `sub_deployer_perms` maps each one to
its exact [permission mask](../mip/mip-3.md#delegation) as an integer. Read the
mask, not the list, before you decide who can push a price. A delegate is in
`sub_deployers` whether it holds bit 0 or only the fee bits. A delegate added
with `perp_set_sub_deployers` reads back as the full mask, `1023`. That mask
includes bit 9 for `perp_set_oi_cap`.

## Edge cases {#edge-cases}

<details>
<summary>Show edge cases</summary>

- **One venue stuck at a stale price.** The staleness filter (> 60 s) or the outlier filter (> 5 % from the cross-venue median) drops it, whichever applies first. The median is taken over the venues that remain.
- **Market-wide outage (< 50 % weight present).** The oracle slot holds its last good value. The C1 of the mark keeps that value, so margin and liquidation stay anchored. They do not freeze or jump to a thin print.
- **Long-tail market not on the major venues.** The market starts on the default table, which mostly gives nothing. Then governance sets a per-symbol `SetOracleWeights` override that points at the venues that list it.
- **Spot oracle healthy but perps diverge.** This is normal. The perp can trade at a persistent premium or discount to spot. The oracle (spot) stays. The mark moves with the perp through C2/C3 and the C1 basis EMA. See [mark vs oracle](./mark-prices.md#mark-vs-oracle--why-they-diverge).

</details>

## See also {#see-also}

- [Mark prices](./mark-prices.md): the oracle is the C1 anchor of the mark.
- [Funding rates](./funding-rates.md): funding is the impact price against the oracle, settled against the oracle.
- [MIP-3 — permissionless perp deploy](../mip/mip-3.md): why per-symbol oracle weights exist.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is the oracle the same as the mark price?**
A: No. The oracle is an external spot reference only. The mark is a *composition* that resists manipulation. It blends the oracle with the MetaFlux book and external perp mids. The two agree when the perp tracks spot, and diverge when the perp has a basis. See [mark prices](./mark-prices.md).

**Q: Can the oracle operators move my liquidation price?**
A: A mark from the oracle only would let them. For that reason, the mark is a median of three. The oracle is only one of three components, so the other two outvote a manipulated feed unless the book and external perps move with it.

**Q: Which venues price a given market?**
A: The default 10-venue table, unless governance set a per-symbol override. The per-market subset mask is recorded, not enforced. The aggregator does not filter by it today. In practice, every market thus prices from the same ten slots. See [the source table](#source-table).

**Q: Does this apply to a market deployed through MIP-3?**
A: No. A MIP-3 market prices from a *deployer-operated oracle*: its deployer pushes the index price directly. The venue table, the weights and the reliability rules above do not apply to it. See [MIP-3 — oracle](../mip/mip-3.md#oracle).

</details>
