# MIP-5: Earn

MIP-5 defines Earn, the lending pool on the supply side of spot margin.

:::info Active on testnet, and paying zero
MIP-5 gives the reserved slot to Earn. Earn is a lending pool: depositors supply assets and earn
yield from the interest that spot-margin borrowers pay. Deposit and redeem work today. The yield
does not. A pool auto-creates at a borrow rate of zero, and no spot pair is calibrated for
borrowing. Both sides of the interest flow therefore wait on governance.
:::

## Definition {#what-earn-is}

Earn is the supply side of the MetaFlux spot lending market. A depositor lends an asset, for
example USDC, into a pool for that asset. The depositor receives shares priced from the pool's
net asset value (NAV). This is the same NAV/share accounting as the
[Metaliquidity vault](./mip-2.md). Spot-margin traders borrow from the pool and pay interest. That
interest accrues into the pool's NAV, so every share gains value. A depositor's yield is:

```
your_yield = shares × (share_price_now − share_price_at_deposit)
```

The borrow rate is a flat annual rate that governance sets for each quote asset. The utilisation
curve below is the target shape for later. It does not run today. Supply APY tracks the rate in
force:

```
supply_APY ≈ borrow_APR × utilisation × (1 − reserve_factor)
```

## Two sides of one market {#two-sides-of-one-market}

Earn (supply) and spot margin (demand) are the two sides of one lending market. The interest
that borrowers pay is the yield that lenders earn.

- Earn reuses the [MIP-2](./mip-2.md) NAV/share accounting for deposits and withdrawals. A
  deposit mints shares at the current share price. A withdrawal redeems at NAV.
- Earn adds what a vault does not have: an interest-rate curve from utilisation to APR, and
  continuous interest accrual per block.

## Status {#status}

Active on testnet, and paying zero. Deposit and redeem run today. Two governance votes, each at
two-thirds stake, stand between a deposit and any yield. One vote sets a non-zero borrow rate on
the quote asset. The other calibrates a spot pair for borrowing. Until both land, the share
price stays at its deposit value, and a redemption returns the principal. The utilisation curve
above is the target shape for later. It does not run today.

[Earn](../concepts/earn.md) describes the actions you can call today and the risk model.

## Governing reference {#governing-reference}

- The [MIP registry](./index.md) is the authoritative index and status of every MIP.
