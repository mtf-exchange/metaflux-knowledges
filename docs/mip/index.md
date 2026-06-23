# MIP — Market Improvement Proposals

:::info
**Status.** MIP-1 implemented · MIP-2 in progress · MIP-3 implemented · MIP-4 planned (V2) · MIP-5 (Earn) planned · MIP-6 deferred (V3).
:::

MetaFlux follows a numbered improvement-proposal model (analogous to the improvement-proposal schemes used by established on-chain perp protocols) for protocol-level changes that affect listed markets, native liquidity, or core fee mechanisms.

| MIP | Title | Status |
|-----|-------|--------|
| [MIP-1](./mip-1.md) | Spot token standard + market deployment | Implemented |
| [MIP-2](./mip-2.md) | Metaliquidity — protocol liquidity vault | In progress |
| [MIP-3](./mip-3.md) | Permissionless perp market deploy | Implemented |
| [MIP-4](./mip-4.md) | Perps liquidity aggregator / internalizer | Planned (V2) |
| [MIP-5](./mip-5.md) | Earn — spot lending pool | Planned |
| [MIP-6](./mip-6.md) | Outcomes / prediction markets | Deferred (V3) |

The deployment proposals split spot from perp the same way established venues do: **MIP-1** is permissionless spot token + market deploy (the `spotDeploy` action family), **MIP-3** is permissionless builder-deployed perp markets (the `perpDeploy` action family + `SetGlobal` governance). Both ride the same three gas-auction streams. (The current implementation still bundles both action families in one module and labels the spot path "MIP-3"; this is being realigned — behaviour unchanged.) **MIP-2 (Metaliquidity)** is the protocol-owned native-liquidity vault. **MIP-4** is a MetaFlux-operated aggregator carrying retail flow, complementary to the permissionless markets. **MIP-6** (Outcomes) was previously numbered MIP-4 and renumbered when MIP-4 was redefined as the aggregator. **MIP-5 (Earn)** is the lending-pool supply side — depositors earn yield from the interest spot-margin borrowers pay, reusing the MIP-2 NAV/share model.

## V1 scope

V1 covers MIP-1, MIP-2, and MIP-3. MIP-4 (aggregator) is targeted for V2; MIP-6 (Outcomes) is deferred to V3. MIP-5 (Earn) is planned, following the spot-margin work it builds on.
