# MIP-6 — Outcomes / prediction markets

{% hint style="info" %}
**Deferred to V3.** Not in v1 or v2 scope. Renumbered from MIP-4.
{% endhint %}

MIP-6 is MetaFlux's **Outcomes / prediction-markets** mechanism — on-chain
markets where users trade on the resolution of binary or categorical outcomes
(the analogue of the prediction-market improvement proposal on established
on-chain venues). It is a future differentiation axis, deferred to **V3**.

## Why this exists as a separate number

Outcomes was **originally numbered MIP-4**. When the project repurposed MIP-4 into
the [Perps Liquidity Aggregator / Internalizer](./mip-4.md) (ADR-022), the
Outcomes concept was renumbered to **MIP-6** and pushed from V2 to the V3 backlog.
Giving it a fresh number avoids the confusion of reusing MIP-4 for two unrelated
mechanisms. Do not refer to Outcomes as "MIP-4".

## Why deferred

- It is a lower-priority differentiation axis: derivatives / perps are the main
  battleground, and the retail revenue from the MIP-4 aggregator dwarfs the
  Outcomes opportunity.
- Outcomes settlement adds clearing complexity the core does not otherwise need:
  it depends on external oracle resolution, time windows, and dispute handling.
- Prediction markets carry jurisdiction-specific regulatory sensitivity, which is
  better addressed once the core protocol is mature.

When Outcomes ships, it ships as MIP-6 with its own resolution / oracle / dispute
design — none of which is reserved eagerly today.

## Governing reference

- ADR-022 — redefined MIP-4 to the aggregator and pushed Outcomes to MIP-6 / V3.
- ADR-004 — the original framing (MIP-4 = Outcomes), now superseded by ADR-022.

## See also

- [MIP-4 — perps liquidity aggregator / internalizer](./mip-4.md) — the proposal
  that took over the MIP-4 number.
