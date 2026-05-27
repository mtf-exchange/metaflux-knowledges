# MetaFlux Knowledge Base

> Integration reference and user-facing docs for the MetaFlux L1 derivatives chain. Synced to GitBook.

Welcome. This is the place to start if you are **integrating with** or **building on** MetaFlux. For the source tree see [`mtf-exchange/metaflux`](https://github.com/mtf-exchange/metaflux).

## Sections

### [API](./api/)
- [REST](./api/rest/) — node-native `POST /exchange`, `POST /info`, and the gateway's HL-compat / CCXT-compat surfaces
- [WS](./api/ws/) — subscriptions (coming)

### [Integration](./integration/)
- How to bring an HL-style client over with zero code change
- How to use the MTF-native SDK (Rust / TypeScript)
- Authentication & signing (EIP-712, agent wallets, multi-sig)

### [Concepts](./concepts/)
- Cross-asset portfolio margin
- Tiered liquidation (T0 yellow card → T1 partial → T2 full → T3 backstop → T4 ADL)
- API wallets / agent delegation
- Sub-accounts

### [MIP](./mip/)
- MIP-3 permissionless market deploy (perp / spot)
- MIP-4 outcomes (deferred to V2 post-launch)

### [Bridge](./bridge/)
- USDC via Circle CCTP
- Other assets via third-party bridges (TBD per S13 ADR)

## Conventions

- All endpoints documented here are the **stable, public** surface. Internal node-to-node ports (4001 / 4002 / 4003) are out of scope.
- Request / response examples use real wire shapes — copy-paste safe.
- "Status: stable / preview / planned" tag on each doc indicates maturity. Planned-only docs explicitly say so up top.

## Internal-only material

Research notes, paper drafts, perf bottleneck analyses, and similar engineering R&D **do not live here** — they are in [`mtf-exchange/metaflux`](https://github.com/mtf-exchange/metaflux) under `docs/research/`. Those are team-internal and may be speculative; this knowledge base is reader-facing only.
