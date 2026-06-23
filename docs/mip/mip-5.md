# MIP-5 — Earn

:::info
**Planned.** MIP-5 assigns the previously-reserved slot to **Earn** — a lending
pool where depositors supply assets and earn yield from the interest paid by
spot-margin borrowers. Specification and rollout follow the spot-margin work it
builds on.
:::

## What Earn is

Earn is the **supply side of MetaFlux's spot lending market**. A depositor lends
an asset (e.g. USDC) into a per-asset pool and receives **shares** priced off the
pool's net asset value (NAV) — the same NAV/share accounting as the
[Metaliquidity vault](./mip-2.md). Spot-margin traders borrow from the pool and
pay interest; that interest accrues into the pool's NAV, so every share
appreciates. A depositor's yield is:

```
your_yield = shares × (share_price_now − share_price_at_deposit)
```

The borrow rate is a deterministic function of **utilisation** (borrowed ÷
supplied). Supply APY tracks it:

```
supply_APY ≈ borrow_APR × utilisation × (1 − reserve_factor)
```

## Two sides of one market

Earn (supply) and spot margin (demand) are the two sides of a single lending
market: the interest borrowers pay **is** the yield lenders earn.

- **Reuses [MIP-2](./mip-2.md)** NAV/share accounting for deposits and
  withdrawals (deposit mints shares at the current share price; withdraw redeems
  at NAV).
- Adds what a vault does not have: a utilisation→APR interest-rate curve and
  continuous (per-block) interest accrual.

## Status

Planned. Depends on spot trading and spot margin landing first; not yet part of
the V1 finished feature set.

## Governing reference

- See the [MIP registry](./index.md) for the authoritative index and status of
  every MIP.
