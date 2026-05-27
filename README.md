# MetaFlux Knowledge Base

> Integration reference and user-facing docs for the MetaFlux derivatives exchange. Synced to GitBook.

Welcome. This is the place to start if you are **integrating with** or **building on** MetaFlux.

## Sections

### [API](./api/)
- [REST](./api/rest/) — `POST /exchange`, `POST /info`, and the HL-compat / CCXT-compat surfaces
- [WS](./api/ws/) — subscriptions (coming)

### [Integration](./integration/)
- How to bring an HL-style client over with zero code change
- Authentication & signing (EIP-712, agent wallets)

### [Concepts](./concepts/)
- Cross-asset portfolio margin
- Tiered liquidation (T0 yellow card → T1 partial → T2 full → T3 backstop → T4 ADL)
- API wallets / agent delegation
- Sub-accounts

### [MIP](./mip/)
- MIP-3 permissionless market deploy (perp / spot)

### [Bridge](./bridge/)
- USDC via Circle CCTP
- Other assets via a single third-party bridge (selection TBD)

## Conventions

- All endpoints documented here are the **stable, public** wire surface.
- Request / response examples use real shapes — copy-paste safe.

## Status legend

Each doc carries a "Status" tag near the top:

- **stable** — wire shape committed for V1; can build against it.
- **preview** — works today; minor wire changes possible before mainnet (will be called out).
- **planned** — described but not yet shipped.
