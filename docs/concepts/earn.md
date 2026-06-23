# Earn

:::info
**Available on devnet (preview).** A USDC lending pool that earns yield from
[spot-margin](./spot-margin.md) borrowers. Supply, share-pricing, idle-bounded
redemption AND the automatic spot-margin liquidator that protects the pool all
run end-to-end on **devnet today** (see the
[action surface](#deposit--withdraw) below). Treat it as a **preview**:
per-pair maintenance ratios are still being calibrated.
:::

## TL;DR

Deposit USDC into the **Earn pool** and earn yield. The pool lends USDC to [spot-margin](./spot-margin.md) borrowers, who pay interest; that interest accrues to the pool and lifts the value of your **shares**. There is **no claim step** — yield compounds continuously into your share value, and you realise it when you withdraw.

## How it works — share / NAV model

When you deposit you receive **shares** priced at the pool's current net asset value per share (NAV). Interest paid by borrowers raises the pool's total value, so each share is worth progressively more USDC.

```
share_price        = pool_value / total_shares           # NAV per share
deposit D USDC  →  mint  D / share_price  shares
withdraw S shares → receive  S × share_price  USDC
```

- `pool_value` starts equal to total deposits and **grows every block** as borrow interest accrues into it.
- `total_shares` only changes on deposits (mint) and withdrawals (burn).
- The first deposit sets `share_price = 1.0` (1 share = 1 USDC).

Because interest inflates `pool_value` (not the share count), `share_price` rises monotonically while loans perform — every holder's shares appreciate at the same rate, with no claim race and no per-user accounting.

## The earning calculation

Your earnings are the appreciation of your shares between deposit and withdrawal:

```
your_yield = your_shares × (share_price_now − share_price_at_deposit)
```

Per block, the pool grows by the interest the outstanding loans owe:

```
interest_this_block = total_borrowed × borrow_rate_per_ms × Δms
pool_value         += interest_this_block
share_price         = pool_value / total_shares          # recomputed
```

### Effective APY

Not all deposited USDC is lent at once — only the **utilised** fraction earns the borrow rate. So the yield a depositor sees is the borrow rate scaled by utilisation:

```
utilisation     = total_borrowed / pool_value            # 0 … 1
depositor_APY  ≈ borrow_APR × utilisation × (1 − protocol_fee)
```

| | Value |
|---|---|
| `borrow_APR` | the fixed spot-margin borrow rate (per pair) |
| `utilisation` | fraction of the pool currently lent out |
| `protocol_fee` | optional protocol cut of interest, if configured |

Example: a 12% borrow APR at 50% utilisation, no protocol fee → depositor APY ≈ 6%. All arithmetic is fixed-point (`Decimal`), no floating point.

## Deposit / withdraw

Both actions are sender-authorized on the public
[`/exchange`](../api/rest/exchange.md#spot-margin--earn) path; `asset` is the
**lendable quote asset id** (the pool key — the quote of a registered spot pair),
and `amount` / `shares` are decimals sent as JSON strings. The pool
**auto-creates on the first deposit** for any lendable asset. Confirm minted /
remaining shares and pool totals via
[`/info` `earn_state`](../api/rest/info.md#earn_state).

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
| [`earn_deposit`](../api/rest/exchange.md#earn_deposit) | Supply quote → pool shares (1:1 on a fresh pool, else priced off NAV) |
| [`earn_withdraw`](../api/rest/exchange.md#earn_withdraw) | Redeem shares → quote, **clamped to idle liquidity** |

**Idle bound.** A withdrawal is instant but **bounded by idle liquidity**
(`total_supplied − total_borrowed`): a redemption larger than idle pays exactly
idle and burns proportionally fewer shares, and a pool with **zero idle** (fully
lent out) rejects the withdrawal until borrowers repay. This guarantees a supplier
can always exit up to what is not lent out, and never strands the borrow ledger
under-collateralized.

## Risk

Earn is **not risk-free**. If a [spot-margin](./spot-margin.md) position is closed
at a loss that the borrower's collateral cannot cover, the **shortfall is socialized
to suppliers**: the pool's `total_supplied` is reduced (floored at zero), which
lowers `share_value`. The pool's protection is the **automatic liquidator** (live
on devnet): every block, underwater margin accounts are
[forced-closed](./spot-margin.md#liquidation) at the maintenance floor, so a
position is unwound while there is normally still enough value to repay the loan.
The conservative per-pair maintenance ratio (still being calibrated) sizes that
buffer; an insurance-buffer waterfall ahead of suppliers is planned but not yet
wired. There is also **liquidity risk**: redemptions are bounded by idle liquidity,
so a fully-utilised pool cannot be exited until borrowers repay.

## See also

- [Spot margin](./spot-margin.md) — the borrowers whose interest is your yield
- [Tiered liquidation](./tiered-liquidation.md) — the insurance waterfall that protects the pool
- [Vaults](./vaults.md) — a different yield product (strategy-traded LP capital), not a lending pool

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Do I have to claim my yield?**
A: No. Yield compounds into your share value continuously; you realise it on withdrawal.

**Q: Why is my APY below the borrow rate?**
A: Only the lent (utilised) fraction of the pool earns interest. APY ≈ borrow rate × utilisation.

**Q: Can I lose principal?**
A: Yes, if a spot-margin loss exceeds the borrower's collateral — the uncovered shortfall is socialized to suppliers and lowers share value (an insurance buffer ahead of suppliers is planned but not yet wired). Designed to be rare: the automatic liquidator forced-closes underwater positions at the maintenance floor, and the per-pair ratio is set conservatively. Earn is lower-risk than a trading [vault](./vaults.md) but not risk-free.

**Q: Why can't I withdraw my full balance right now?**
A: Redemptions are bounded by **idle liquidity** (`supplied − borrowed`). If the pool is fully lent to spot-margin borrowers, you can only withdraw up to the idle amount; the rest unlocks as borrowers repay.

**Q: How is Earn different from a Metaliquidity vault?**
A: Earn is a passive USDC **lending** pool (yield = borrow interest). A [vault](./vaults.md) is **traded** LP capital (yield/loss = the strategy's PnL). Different risk profiles.

</details>
