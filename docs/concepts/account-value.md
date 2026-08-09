---
description: Every scalar on the account read, written as the arithmetic that produces it — account value, withdrawable, held margin, health, and why hold is not what you think.
---

# Account value, and what you can actually withdraw

:::info
**Every number below is the exact arithmetic the chain runs.** Nothing here is a
description of intent. If a figure you compute from this page disagrees with the
one the node returns, that is a bug and we want to hear about it.
:::

Read them all with one call:

```json
{ "type": "account_state", "address": "0x…" }
```

## The scalars {#the-scalars}

| Field | What it is |
|---|---|
| `account_value` | Everything the account is worth right now, unrealized profit included |
| `withdrawable` | Cash you can take out. **Clamped at zero** |
| `init_margin` | Margin currently committed to open positions |
| `maint_margin` | Margin below which the position is liquidated |
| `health` | `account_value - maint_margin`. The cushion above liquidation |
| `tier` | The liquidation band the engine has you in |

## account_value {#account-value}

```
account_value = settled cash
              + unrealized PnL on every open position
              - unrealized funding not yet charged
```

**Settled cash** is realized USDC — deposits, closed-position PnL, fees already
paid. **Unrealized PnL** marks every open position to its mark price.
**Unrealized funding** is the funding an open position has accrued inside the
current period but has not been charged yet; only the side that OWES is folded
in, so an account owed funding does not see it early.

## withdrawable {#withdrawable}

**This is the number that surprises people, so here is the whole of it.**

```
withdrawable = max(0,  settled cash
                     - unrealized funding you owe
                     - init_margin )
```

Read the difference from `account_value` carefully: **withdrawable does not
count unrealized profit.** Open profit is not yours to remove until you close.

The consequence is worth stating plainly, because it looks alarming and is not:

> An account can be perfectly healthy, show a large `account_value`, and still
> have `withdrawable` of exactly **0**.

That happens whenever open profit is funding the margin. A worked example, real
figures from a live account:

| | |
|---|---|
| Settled cash | 878.49 |
| Unrealized PnL (two positions) | +807.93 |
| Unrealized funding owed | -1.04 |
| **account_value** | **1685.37** |
| Committed margin (`init_margin`) | 1281.00 |
| **withdrawable** | **0** |

The raw subtraction is `878.49 - 1.04 - 1281 = -403.56`. It is negative because
the 1281 of margin is partly funded by the 807.93 of open profit, and that profit
cannot be withdrawn. The field reports **0**: there is no such thing as less than
nothing withdrawable.

To free cash, close a position. Realizing that 807.93 turns it into settled cash
and releases the margin behind it at the same time.

## init_margin and maint_margin {#margins}

`init_margin` is the sum, over every open position, of what admission reserved
when it opened. Per position:

```
initial margin = |notional| / effective leverage
```

`maint_margin` is what the liquidation engine demands to LET you keep it:

```
maintenance margin = |notional| × maintenance ratio
```

The maintenance ratio comes from the market's margin ladder — a bigger position
sits in a higher band with a stricter ratio. Read the ladder from
`market_info.margin_tiers`; each rung carries its own `max_leverage` and
`maint_margin_ratio`.

**Leverage is capped by the maintenance ratio.** Admission refuses leverage that
could not survive its own maintenance requirement, so `market_info.max_leverage`
is the ceiling admission accepts, not merely the one configured. An order above
it is refused with `InsufficientMargin` — no order id is burned and nothing
rests on the book.

## health and tier {#health-and-tier}

```
health = account_value - maint_margin
```

Positive is the cushion above liquidation, in USDC. `tier` is the band the
engine's own classifier puts you in, computed from the same truncated values the
engine uses, so the band you are shown can never disagree with the band you are
in.

## balances, and what `hold` really is {#balances-and-hold}

Each row of `balances`:

| Field | Meaning |
|---|---|
| `asset` / `name` | The spot token |
| `total` | Everything you hold of it |
| `hold` | The part locked in **resting spot orders** |
| `avg_entry_px` | Your average cost basis; `null` when there is none |

:::warning
**`total - hold` is NOT your withdrawable balance.** `hold` covers spot order
escrow only. Margin committed to PERPETUAL positions is not in it — in the
worked example above, USDC shows `total 878.49`, `hold 0`, while 1,281 USDC is
committed to open positions.

Use `withdrawable` for withdrawable. It is the only field that answers that
question.
:::

`account_state.balances` and `spot_clearinghouse_state.balances` return the SAME
row shape. Either read answers the same question the same way.

## Per-market sizing {#per-market-sizing}

`withdrawable` is account-wide. For "how much can I open on THIS market", ask the
market:

```json
{ "type": "active_asset_data", "address": "0x…", "coin": "BTC" }
```

`available_to_trade` is a `[buy, sell]` pair of notional amounts, already
side-aware and never negative. It is `withdrawable × leverage` on the increasing
side; the reducing side may additionally close what is already open. This is the
right field behind an order ticket's "available" line.

## See also {#see-also}

- [Margin modes](margin-modes.md)
- [Tiered liquidation](tiered-liquidation.md)
- [Funding rates](funding-rates.md)
