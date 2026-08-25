---
description: Every scalar on the account read, written as the arithmetic that produces it — account value, withdrawable, held margin, health, and why hold is not what you think.
---

# Account value, and what you can actually withdraw

:::info
**Every number below is the exact arithmetic the chain runs.** Nothing here is a
description of intent. If a figure you compute from this page disagrees with the
one the node returns, that is a bug and we want to hear about it.
:::

Two reads carry these scalars:

```json
{ "type": "account_state",   "address": "0x…" }
{ "type": "account_state", "address": "0x…", "detail": "margin" }
```

`detail: "margin"` is the cheap one. It returns the scalars alone — no positions
and no balances. `account_state` returns the scalars plus positions and
balances, but it **omits `maint_margin`**. To compute `health` yourself, read
`detail: "margin"`.

## The scalars {#the-scalars}

| Field | Read | What it is |
|---|---|---|
| `account_value` | both | Everything the account is worth right now, unrealized profit included |
| `withdrawable` | both | Cash you can take out. **Clamped at zero** |
| `init_margin` | both | Margin currently committed to open CROSS positions |
| `maint_margin` | `detail: "margin"` only | Margin below which the account is liquidated |
| `health` | both | `account_value - maint_margin`. The cushion above liquidation |
| `tier` | both | The liquidation band the engine has you in |
| `abstraction` | both | `"unified"` (default) or `"portfolio"` (portfolio margin enrolled) |
| `health_deferred` | both, when true | The risk engine cannot price a leg. See below |

:::caution
**`health_deferred: true` means the risk numbers are not a solvency statement.**
The key is absent in the normal case. When it is present, at least one open
position has no usable price, so the chain reports `maint_margin` of `0` and
defers the decision. A `0` maintenance here does NOT mean the account carries no
requirement. Do not read `health` or `tier` as safe while the flag is set.
:::

**Isolated positions are outside every scalar on this page.** `account_value`,
`init_margin`, `maint_margin` and `health` cover the CROSS bucket only. An
isolated position posts its own margin bucket when it opens, that margin already
left settled cash, and the position is judged against that bucket alone. Read a
position's own `margin` field for an isolated leg.

## account_value {#account-value}

```
account_value = settled cash
              + unrealized PnL on every open CROSS position
              + unrealized funding, SIGNED
              + net equity of open spot-margin positions
```

**Settled cash** is realized USDC — deposits, closed-position PnL, fees already
paid. **Unrealized PnL** marks every open cross position to its mark price. Each
leg contributes `direction × (mark price − average entry price) × |size|`.

**Unrealized funding is SIGNED here, and this is the one rule the two formulas
do not share.** It is the funding an open position has accrued inside the
current period but has not been charged yet. `account_value` folds it in BOTH
directions: an account that owes funding sees the debit early, and an account
that is owed funding sees the credit early. `withdrawable` folds only the debit.
The two fields disagree on purpose — see the next section.

**Spot-margin positions** add `position value − debt` when the account holds
any. An account with no spot-margin borrowing adds exactly `0`.

A portfolio-margin account adds one more term: the value of its eligible
haircut collateral. `abstraction` tells you which class the account is in.

## withdrawable {#withdrawable}

**This is the number that surprises people, so here is the whole of it.**

```
withdrawable = max(0,  settled cash
                     - unrealized funding you OWE (debit side only)
                     - init_margin
                     - initial requirement of spot-margin borrowing )
```

Two differences from `account_value`, and both surprise people:

1. **Withdrawable does not count unrealized profit.** Open profit is not yours
   to remove until you close.
2. **The funding term is debit-only.** Funding you OWE reduces withdrawable.
   Funding you are OWED does not raise it. An unrealized credit must not fund a
   withdrawal.

`init_margin` in this formula is the same `init_margin` the account read
reports. The spot-margin term is a separate quantity and is NOT inside
`init_margin`: when an account has borrowed against spot, `withdrawable` is
lower than `settled cash - funding owed - init_margin` alone predicts. An
account with no spot-margin borrowing subtracts exactly `0`, and the two agree.

The consequence is worth stating plainly, because it looks alarming and is not:

> An account can be perfectly healthy, show a large `account_value`, and still
> have `withdrawable` of exactly **0**.

That happens whenever open profit is funding the margin. A worked example, real
figures from a live account. **The figures are full precision, not rounded to
cents** — round them first and the sums miss by a cent:

| | |
|---|---|
| Settled cash | 878.4866 |
| Unrealized PnL (two CROSS positions) | +807.9313 |
| Unrealized funding owed | -1.0439 |
| **account_value** | **1685.3740** |
| Committed margin (`init_margin`) | 1281.00 |
| **withdrawable** | **0** |

`account_value` is `878.4866 + 807.9313 - 1.0439 = 1685.3740`.

The raw withdrawable subtraction is `878.4866 - 1.0439 - 1281 = -403.5573`. It is
negative because the 1281 of margin is partly funded by the 807.93 of open
profit, and that profit cannot be withdrawn. The field reports **0**: there is no
such thing as less than nothing withdrawable.

:::tip
Every one of these fields is a full-precision decimal string. Do not round a
component before you reconcile a sum. Two cent-rounded components can each be
correct while their total is a cent away from the field the chain returns.
:::

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
`markets_meta.margin_tiers`; each rung carries its own `max_leverage` and
`maint_margin_ratio`.

**Leverage is capped by the maintenance ratio.** Admission refuses leverage that
could not survive its own maintenance requirement, so `markets_meta.max_leverage`
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

`account_state.balances` is the whole token ledger — the unified USDC pool and
every spot token, one row shape throughout.

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

The same read carries `max_trade_size`. **That one is not yours** — it is the
open-interest headroom left on the whole market, shared with every other account,
and `null` when the market has no cap. Size against `max_trade_szs`; treat
`max_trade_size` as a ceiling you race others for. See
[`max_trade_size` is market-wide](../api/rest/info/perpetuals.md#max-trade-size).

## See also {#see-also}

- [Margin modes](margin-modes.md)
- [Tiered liquidation](tiered-liquidation.md)
- [Funding rates](funding-rates.md)
