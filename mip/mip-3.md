# MIP-3 — Permissionless market deploy

{% hint style="info" %}
**Preview.**
{% endhint %}

Any builder can deploy a new perpetual or spot market on MetaFlux by paying through an on-chain gas auction. There is no protocol-team gate, no review committee, no allow-list. The auction price plus a minimum deposit are the only barriers.

## Why this exists

A core differentiation axis. Centralised exchanges curate listings; MetaFlux makes the listing process itself part of the protocol. Builders who want a market for some niche asset don't need permission — they need to win an auction and supply seed parameters.

This is MetaFlux's adaptation of the permissionless-market-deploy design pioneered by leading on-chain perp venues, with the following equivalences and adjustments preserved:

- Three distinct gas-auction streams (perp deploy, spot pair deploy, token register) — same structure as HL
- Auction parameters (decay, refund window, slot interval) governance-configurable
- Initial maintenance ratio, max leverage, funding cap — submitted with the deploy bid, bounded by governance-set ranges

## Deploy flow

```
builder ─ TokenRegisterGasAuctionBid ──► auction wins slot
          (register a new token symbol)         │
                                                ▼
builder ─ PerpDeployGasAuctionBid ────► auction wins slot
          (PerpMarketSpec attached)             │
                                                ▼
                                          market live, first block
                                          accepts orders next block
```

Three actions, in sequence:

1. **`TokenRegisterGasAuctionBid`** — claim a token symbol. Required if the asset isn't already in the registry.
2. **`PerpDeployGasAuctionBid`** — bid to deploy a perpetual market on a registered token.
3. **`SpotPairDeployGasAuctionBid`** — alternative to step 2 if you want a spot market.

Each bid carries:
- A USDC amount, escrowed at submit and refunded on loss (minus a small fee).
- The market spec — initial leverage, maintenance margin ratio, funding parameters, oracle source config.

Auctions resolve at block boundaries — highest bidder per slot wins, paid amount is burned (not paid to anyone), spec parameters become the deployed market's parameters.

## Bid escrow & refund

Bids are held in escrow while the auction runs. On loss, the bid is returned to the builder's account minus a small auction fee. On win, the winning amount is burned at slot close (not paid to anyone).

Active bids are visible via:

```json
POST /info { "type": "mip3_active_bids" }
```

## Parameter bounds

Governance sets the bounds within which bid spec parameters must fall:

- Initial leverage in `[1, max_leverage]` (default `max_leverage = 50`)
- Maintenance margin ratio ≥ `min_maintenance_ratio` (default 1%)
- Funding cap ≤ `max_funding_per_hour` (default 0.5%)
- Oracle source from approved list

Bids with out-of-bounds parameters are rejected at submission.

## Auction parameters

Per stream (perp / spot / token-register), the auction has:

- **Slot interval** — how often a new auction settles (governance, default 1 hour)
- **Decay** — how the minimum bid declines if a slot is unclaimed (governance, default linear over 24 h)
- **Refund window** — how long after slot close losing bidders can claim refunds (governance, default 7 days)

All three are governance-mutable via `SetMip3Config`.

## After deploy

The new market lives in the canonical asset registry from the next block. Liquidity is the builder's problem; the protocol provides no seed orders.

Builders typically combine MIP-3 deploy with a stake to MFlux Vault on the same market (or a third-party LP source) to bootstrap depth.

## MIP-4 — Perps Liquidity Aggregator / Internalizer

MIP-4 is a MetaFlux-operated **perps liquidity aggregator / internalizer** (Citadel-Securities-style). It runs its own order book and a two-tier execution path: order flow is first matched internally against the aggregator's book, with residual flow routed out to the canonical on-chain CLOB. The aggregator is operated by MetaFlux, not by third-party builders.

This is a separate workstream from MIP-3 permissionless deploy; it does not reuse the gas-auction infrastructure.

Outcomes / prediction markets — previously sketched here as MIP-4 — have been renumbered to **MIP-6** and deferred to V3.

## See also

- [Tiered liquidation](../concepts/tiered-liquidation.md) — applies to MIP-3 deployed markets just like protocol-listed ones
- [Portfolio margin](../concepts/portfolio-margin.md) — MIP-3 markets opt into PM via the standard scenario inclusion
