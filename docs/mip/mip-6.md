# MIP-6 — Outcomes / prediction markets

:::info
**Deferred to V3.** Not in v1 or v2 scope. Renumbered from MIP-4.
:::

MIP-6 is MetaFlux's **Outcomes / prediction-markets** mechanism — on-chain
markets where users trade on the resolution of binary or categorical outcomes
(the analogue of the prediction-market improvement proposal on established
on-chain venues). It is a future capability, deferred to **V3**.

## Why this exists as a separate number {#why-this-exists-as-a-separate-number}

Outcomes was **originally numbered MIP-4**. When the project repurposed MIP-4 into
the [Perps Liquidity Aggregator / Internalizer](./mip-4.md), the
Outcomes concept was renumbered to **MIP-6** and pushed from V2 to the V3 backlog.
Giving it a fresh number avoids the confusion of reusing MIP-4 for two unrelated
mechanisms. Do not refer to Outcomes as "MIP-4".

## Why deferred {#why-deferred}

- It is a lower-priority capability: derivatives / perps are the main
  battleground, and the retail revenue from the MIP-4 aggregator dwarfs the
  Outcomes opportunity.
- Outcomes settlement adds clearing complexity the core does not otherwise need:
  it depends on external oracle resolution, time windows, and dispute handling.
- Prediction markets carry jurisdiction-specific regulatory sensitivity, which is
  better addressed once the core protocol is mature.

When Outcomes ships, it ships as MIP-6 with its own resolution / oracle / dispute
design — none of which is reserved eagerly today.

## See also {#see-also}

- [MIP-4 — perps liquidity aggregator / internalizer](./mip-4.md) — the proposal
  that took over the MIP-4 number.
