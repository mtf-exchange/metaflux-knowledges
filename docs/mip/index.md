# Market Improvement Proposals (MIP)

A Market Improvement Proposal (MIP) is a numbered protocol change to listed markets, native
liquidity or core fee mechanisms.

:::info Status
MIP-1 implemented and callable · MIP-2 in progress (the vault backstop is live) · MIP-3 live and in use · MIP-4 planned (V2) · MIP-5 (Earn) live and paying zero · MIP-6 deferred (V3).
:::

MetaFlux uses a numbered improvement-proposal model for protocol-level changes. Established
on-chain perp protocols use similar improvement-proposal schemes.

| MIP | Title | Status |
|-----|-------|--------|
| [MIP-1](./mip-1.md) | Spot token standard + market deployment | Implemented |
| [MIP-2](./mip-2.md) | Metaliquidity: protocol liquidity vault | In progress. The [vault backstop](../concepts/tiered-liquidation.md#mlp-first-bite) is live. |
| [MIP-3](./mip-3.md) | Permissionless perp market deploy | Live and in use. Markets are deployed through it today. |
| [MIP-4](./mip-4.md) | Options | Live, fully collateralized. RFQ-cleared, no margined book. |
| [MIP-5](./mip-5.md) | Earn: spot lending pool | Live, and paying zero |
| [MIP-6](./mip-6.md) | Outcomes / prediction markets | Deferred (V3) |

The deployment proposals split spot from perp, as established venues do:

- **MIP-1** is the permissionless spot token and market deploy (the `spotDeploy` action family).
- **MIP-3** is permissionless, builder-deployed perp markets (the `perpDeploy` action family).

Both use the same three gas-auction streams. The current implementation still puts both action
families in one module, and labels the spot path "MIP-3". This label is being corrected. The
behaviour does not change.

- **MIP-2 (Metaliquidity)** is the protocol-owned native-liquidity vault.
- **MIP-4** is the options product. Its first release is fully collateralized and clears through
  [RFQ](../concepts/rfq.md) only. The margined options book is not built.
- **MIP-5 (Earn)** is the supply side of the lending pool. Depositors earn yield from the
  interest that spot-margin borrowers pay. It reuses the MIP-2 NAV/share model.
- **MIP-6 (Outcomes)** had the number MIP-4 before. It got a new number when MIP-4 was
  reassigned.

## V1 scope {#v1-scope}

V1 covers MIP-1, MIP-2, MIP-3, and the collateralized first release of MIP-4. The margined MIP-4
book is targeted for V2. MIP-6 (Outcomes) is deferred to V3. MIP-5 (Earn) is live: deposit and
redeem work, and it pays zero until two governance votes land. See [Earn](../concepts/earn.md).
