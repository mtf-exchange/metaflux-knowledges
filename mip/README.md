# MIP — Market Improvement Proposals

{% hint style="info" %}
**Status.** **MIP-3 preview**. **MIP-4 (perps liquidity aggregator / internalizer) planned**; **MIP-6 (outcomes) deferred to V3**.
{% endhint %}

MetaFlux follows a numbered improvement-proposal model (analogous to the improvement-proposal schemes used by established on-chain perp protocols) for protocol-level changes that affect listed markets or core fee mechanisms.

## Live

- [MIP-3 — permissionless market deploy](./mip-3.md): any builder can deploy a new perp or spot market by paying through an on-chain gas auction, with no protocol-team review.

## Planned

- **MIP-4 — perps liquidity aggregator / internalizer** — a MetaFlux-operated aggregator with its own order book and two-tier execution (internalize first, route residual to the canonical CLOB). Citadel-Securities-style internalization adapted to MetaFlux. Separate workstream from MIP-3; does not reuse the gas-auction infra.

## Deferred

- **MIP-6 — outcomes / prediction markets** — push to V3. (Previously numbered MIP-4; renumbered when MIP-4 was redefined as the aggregator.)

## V1 scope

V1 covers MIP-3 only. The framework is general — later numbering covers MIP-4 (aggregator) and onwards.
