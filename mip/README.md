# MIP — Market Improvement Proposals

{% hint style="info" %}
**Status.** MIP-1 preview · MIP-2 in progress · MIP-3 preview · MIP-4 planned (V2) · MIP-6 deferred (V3).
{% endhint %}

MetaFlux follows a numbered improvement-proposal model (analogous to the improvement-proposal schemes used by established on-chain perp protocols) for protocol-level changes that affect listed markets, native liquidity, or core fee mechanisms.

| MIP | Title | Status |
|-----|-------|--------|
| [MIP-1](./mip-1.md) | Spot token standard + market deployment | Preview |
| [MIP-2](./mip-2.md) | Metaliquidity — protocol liquidity vault | In progress |
| [MIP-3](./mip-3.md) | Permissionless perp market deploy | Preview |
| [MIP-4](./mip-4.md) | Perps liquidity aggregator / internalizer | Planned (V2) |
| MIP-5 | *(reserved — undefined)* | TBD |
| MIP-6 | Outcomes / prediction markets | Deferred (V3) |

The deployment proposals split spot from perp the same way established venues do: **MIP-1** is permissionless spot token + market deploy, **MIP-3** is permissionless builder-deployed perp markets. (The current implementation still labels the spot actions "MIP-3"; this is being realigned — behaviour unchanged.) **MIP-2 (Metaliquidity)** is the protocol-owned native-liquidity vault. **MIP-4** is a MetaFlux-operated aggregator carrying retail flow, complementary to the permissionless markets. **MIP-6** (Outcomes) was previously numbered MIP-4 and renumbered when MIP-4 was redefined as the aggregator. **MIP-5** is an explicitly reserved, not-yet-specified slot.

## V1 scope

V1 covers MIP-1, MIP-2, and MIP-3. The framework is general — later numbering covers MIP-4 (aggregator) and onwards.
