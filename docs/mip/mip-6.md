# MIP-6: Outcomes / prediction markets

MIP-6 defines Outcomes, the MetaFlux prediction-market mechanism.

:::info Deferred to V3
Not in v1 or v2 scope. Renumbered from MIP-4.
:::

Outcomes are on-chain markets where users trade on the resolution of binary or categorical
outcomes. MIP-6 is the MetaFlux analogue of the prediction-market improvement proposal on
established on-chain venues. It is a future capability, deferred to V3.

## Number history {#why-this-exists-as-a-separate-number}

Outcomes had the number MIP-4 first. It got the number MIP-6 and moved from V2 to the V3 backlog
when MIP-4 was reassigned. MIP-4 now names [Options](./mip-4.md). Do not call Outcomes "MIP-4".

## Reasons for the deferral {#why-deferred}

- It has a lower priority. Derivatives and perps are the main market, and the retail revenue
  from the MIP-4 aggregator is much larger than the Outcomes opportunity.
- Outcomes settlement adds clearing complexity that the core does not otherwise need. It depends
  on external oracle resolution, time windows and dispute handling.
- Prediction markets carry regulatory sensitivity that differs per jurisdiction. It is better to
  address this when the core protocol is mature.

When Outcomes ships, it ships as MIP-6 with its own resolution, oracle and dispute design. None
of that design is reserved today.

## See also {#see-also}

- [MIP-4: Options](./mip-4.md): the proposal that now holds the MIP-4 number.
