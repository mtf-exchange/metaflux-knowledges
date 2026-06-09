# Earn

{% hint style="info" %}
**Upcoming.** A USDC lending pool that earns yield from [spot-margin](./spot-margin.md) borrowers.
{% endhint %}

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

{% hint style="info" %}
**Reference only.** The actions below describe the planned Earn surface; they are
**not yet wired on the public [`/exchange`](../api/rest/exchange.md) path**. Earn
ships alongside [spot-margin](./spot-margin.md) — the borrowers whose interest is
the pool's yield.
{% endhint %}

```json
// deposit 1,000 USDC into Earn
{ "type": "earn_deposit", "params": { "amount": "1000000000" } }
```

```json
// withdraw by burning shares (receive shares × share_price)
{ "type": "earn_withdraw", "params": { "shares": "..." } }
```

A withdrawal lock period may apply (`earn_lock_period_ms`) so the pool cannot be drained faster than loans unwind.

## Risk

Earn is **not risk-free**. If a [spot-margin](./spot-margin.md) borrower is liquidated at a loss that the position's collateral cannot cover, the shortfall is absorbed by the **insurance buffer first**; only an uncovered remainder beyond insurance would reduce `pool_value` (and therefore `share_price`). The conservative spot maintenance ratio and the dedicated spot-liquidator role exist to make this rare.

## See also

- [Spot margin](./spot-margin.md) — the borrowers whose interest is your yield
- [Tiered liquidation](./tiered-liquidation.md) — the insurance waterfall that protects the pool
- [Vaults](./vaults.md) — a different yield product (strategy-traded LP capital), not a lending pool

## FAQ

**Q: Do I have to claim my yield?**
A: No. Yield compounds into your share value continuously; you realise it on withdrawal.

**Q: Why is my APY below the borrow rate?**
A: Only the lent (utilised) fraction of the pool earns interest. APY ≈ borrow rate × utilisation.

**Q: Can I lose principal?**
A: Only if a spot-margin loss exceeds both the position's collateral and the insurance buffer — designed to be rare. Earn is lower-risk than a trading [vault](./vaults.md) but not risk-free.

**Q: How is Earn different from a Metaliquidity vault?**
A: Earn is a passive USDC **lending** pool (yield = borrow interest). A [vault](./vaults.md) is **traded** LP capital (yield/loss = the strategy's PnL). Different risk profiles.
