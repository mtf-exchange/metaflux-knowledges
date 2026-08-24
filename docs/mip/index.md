# MIP — Market Improvement Proposals

:::info
**Status.** MIP-1 implemented and callable · MIP-2 in progress (the vault backstop is live) · MIP-3 implemented, **deploy actions not released** · MIP-4 planned (V2) · MIP-5 (Earn) live and paying zero · MIP-6 deferred (V3).
:::

MetaFlux follows a numbered improvement-proposal model (analogous to the improvement-proposal schemes used by established on-chain perp protocols) for protocol-level changes that affect listed markets, native liquidity, or core fee mechanisms.

| MIP | Title | Status |
|-----|-------|--------|
| [MIP-1](./mip-1.md) | Spot token standard + market deployment | Implemented |
| [MIP-2](./mip-2.md) | Metaliquidity — protocol liquidity vault | In progress — the [vault backstop](../concepts/tiered-liquidation.md#mlp-first-bite) is live |
| [MIP-3](./mip-3.md) | Permissionless perp market deploy | **Live and in use** — markets are deployed through it today |
| [MIP-4](./mip-4.md) | Options | Planned — no code, no wire |
| [MIP-5](./mip-5.md) | Earn — spot lending pool | **Live, and paying zero** |
| [MIP-6](./mip-6.md) | Outcomes / prediction markets | Deferred (V3) |

The deployment proposals split spot from perp the same way established venues do: **MIP-1** is permissionless spot token + market deploy (the `spotDeploy` action family), **MIP-3** is permissionless builder-deployed perp markets (the `perpDeploy` action family). Both ride the same three gas-auction streams. (The current implementation still bundles both action families in one module and labels the spot path "MIP-3"; this is being realigned — behaviour unchanged.) **MIP-2 (Metaliquidity)** is the protocol-owned native-liquidity vault. **MIP-4** is the options product, cleared and margined in the same account as perpetuals. **MIP-6** (Outcomes) was previously numbered MIP-4 and renumbered when MIP-4 was reassigned. **MIP-5 (Earn)** is the lending-pool supply side — depositors earn yield from the interest spot-margin borrowers pay, reusing the MIP-2 NAV/share model.

## V1 scope {#v1-scope}

V1 covers MIP-1, MIP-2, and MIP-3. MIP-4 (Options) is targeted for V2; MIP-6 (Outcomes) is deferred to V3. MIP-5 (Earn) is live: deposit and redeem work, and it pays zero until two governance votes land — see [Earn](../concepts/earn.md).
