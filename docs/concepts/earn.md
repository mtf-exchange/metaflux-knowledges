# Earn

Earn is a USDC lending pool that pays depositors the interest from spot-margin borrowers.

:::info
**Live on testnet, and paying zero.** Earn is a USDC lending pool that earns
yield from [spot-margin](../products/spot-margin.md) borrowers. Supply, share
pricing, redemption bounded by idle liquidity, and the automatic spot-margin
liquidator that protects the pool all run end to end. See the
[actions](#deposit--withdraw) below.

Two governance votes must pass before a deposit earns any yield. A pool is
created with a borrow rate of zero, so nothing accrues. No spot pair has
calibrated per-pair risk parameters yet, so nobody can borrow. Until both votes
pass, the share price stays at its deposit value, and a redemption returns the
principal.
:::

## Summary {#tldr}

Deposit USDC into the *Earn pool* to earn yield. The pool lends USDC to [spot-margin](../products/spot-margin.md) borrowers, who pay interest. That interest accrues to the pool and increases the value of your *shares*. There is no claim step. Yield compounds continuously into your share value, and you realize it when you withdraw.

## Share and NAV model {#how-it-works--share--nav-model}

When you deposit, you receive shares at the current net asset value per share (NAV) of the pool. Interest from borrowers increases the total value of the pool, so each share is worth more USDC over time.

```
share_price        = pool_value / total_shares           # NAV per share
deposit D USDC  →  mint  D / share_price  shares
withdraw S shares → receive  S × share_price  USDC
```

- `pool_value` starts equal to total deposits. It grows as borrow interest accrues into it. It moves only while the pool has a nonzero borrow rate and an outstanding loan. If either is zero, it stays flat, at any block rate.
- `total_shares` changes only on deposits (mint) and withdrawals (burn).
- The first deposit sets `share_price = 1.0` (1 share = 1 USDC).

Interest increases `pool_value`, not the share count. Thus `share_price` rises monotonically while loans perform. The shares of every holder increase in value at the same rate. There is no race to claim and no per-user accounting.

## The earning calculation {#the-earning-calculation}

Your earnings are the increase in the value of your shares between deposit and withdrawal:

```
your_yield = your_shares × (share_price_now − share_price_at_deposit)
```

Per block, the pool grows by the interest that the outstanding loans owe. When there are no loans, it does not grow:

```
interest_this_block = total_borrowed × borrow_rate_per_ms × Δms
pool_value         += interest_this_block
share_price         = pool_value / total_shares          # recomputed
```

### Effective APY {#effective-apy}

The pool does not lend all deposited USDC at once. Only the *utilised* fraction earns the borrow rate. Thus the yield for a depositor is the borrow rate scaled by utilisation:

```
utilisation     = total_borrowed / pool_value            # 0 … 1
depositor_APY  ≈ borrow_APR × utilisation × (1 − protocol_fee)
```

| | Value |
|---|---|
| `borrow_APR` | The fixed spot-margin borrow rate. It is set per quote asset, not per pair, so one rate applies to every pair with that quote |
| `utilisation` | The fraction of the pool that is currently lent out |
| `protocol_fee` | An optional protocol share of interest, if configured |

Example: a 12% borrow APR at 50% utilisation, with no protocol fee, gives a depositor APY of about 6%. All arithmetic is fixed-point (`Decimal`), with no floating point.

## Deposit and withdraw {#deposit--withdraw}

Both actions are authorized by the sender on the public
[`/exchange`](../api/rest/exchange.md#spot-margin--earn) path. `asset` is the
id of the lendable quote asset: the pool key, which is the quote of a registered
spot pair. `amount` and `shares` are decimals sent as JSON strings. The node
creates the pool automatically on the first deposit for any lendable asset. To
confirm minted or remaining shares and pool totals, use
[`/info` `earn_state`](../api/rest/info/spot.md#earn_state).

```json
// supply 5,000 USDC into the Earn pool for asset 100
{ "type": "earn_deposit", "params": { "asset": 100, "amount": "5000" } }
```

```json
// redeem shares (receive shares × share_value), idle-bounded
{ "type": "earn_withdraw", "params": { "asset": 100, "shares": "1234.5" } }
```

| Action | Effect |
|---|---|
| [`earn_deposit`](../api/rest/exchange/spot-margin.md#earn_deposit) | Supplies quote and mints pool shares (1:1 on a new pool, otherwise priced from NAV) |
| [`earn_withdraw`](../api/rest/exchange/spot-margin.md#earn_withdraw) | Redeems shares for quote, clamped to idle liquidity |

**Idle bound.** A withdrawal has no waiting period, but idle liquidity
(`total_supplied − total_borrowed`) limits it. A redemption larger than idle
pays exactly the idle amount and burns proportionally fewer shares. A pool with
zero idle (fully lent out) rejects the withdrawal until borrowers repay. Thus a
supplier can always exit up to the amount that is not lent out, and the borrow
ledger is never left under-collateralized.

## Risk {#risk}

Earn is not risk-free. A [spot-margin](../products/spot-margin.md) position can
close at a loss that the borrower's collateral cannot cover. Suppliers then
share the shortfall: the pool's `total_supplied` decreases (floored at zero),
which lowers `share_value`. The pool's protection is the automatic liquidator
(live on testnet). Every block, it
[force-closes](../products/spot-margin.md#liquidation) underwater margin
accounts at the maintenance floor. A position is thus unwound while there is
normally still enough value to repay the loan. The conservative per-pair
maintenance ratio sets the size of that buffer, and its calibration is not
complete. An insurance-buffer waterfall ahead of suppliers is planned but not
yet wired. There is also liquidity risk. Idle liquidity limits redemptions, so
you cannot exit a fully utilised pool until borrowers repay.

## See also {#see-also}

- [Spot margin](../products/spot-margin.md): the borrowers whose interest is your yield.
- [Tiered liquidation](./tiered-liquidation.md): the insurance waterfall that protects the pool.
- [Vaults](./vaults.md): a different yield product (LP capital that a strategy trades), not a lending pool.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Do I have to claim my yield?**
A: No. Yield compounds into your share value continuously. You realize it when you withdraw.

**Q: Why is my APY below the borrow rate?**
A: Only the lent (utilised) fraction of the pool earns interest. APY ≈ borrow rate × utilisation.

**Q: Can I lose principal?**
A: Yes, if a spot-margin loss is larger than the borrower's collateral. Suppliers share the uncovered shortfall, which lowers share value. An insurance buffer ahead of suppliers is planned but not yet wired. The design makes this rare: the automatic liquidator force-closes underwater positions at the maintenance floor, and the per-pair ratio is conservative. Earn has lower risk than a trading [vault](./vaults.md), but it is not risk-free.

**Q: Why can't I withdraw my full balance now?**
A: Idle liquidity (`supplied − borrowed`) limits redemptions. If the pool is fully lent to spot-margin borrowers, you can withdraw only up to the idle amount. The rest becomes available as borrowers repay.

**Q: How is Earn different from a Metaliquidity vault?**
A: Earn is a passive USDC lending pool: the yield is borrow interest. A [vault](./vaults.md) is LP capital that a strategy trades: the yield or loss is the PnL of the strategy. The two have different risk profiles.

</details>
