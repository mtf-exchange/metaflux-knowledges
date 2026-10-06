---
description: Every scalar on the account read, written as the arithmetic that produces it, including account value, withdrawable, held margin, health, and what hold covers.
---

# Account value and withdrawable {#account-value-and-what-you-can-actually-withdraw}

This page gives the arithmetic behind each scalar on the account read.

:::info
Every number below is the exact arithmetic that the chain runs. None of it is a
description of intent. If a figure that you compute from this page is different
from the one the node returns, that is a bug. Please report it.
:::

Two reads return these scalars:

```json
{ "type": "account_state",   "address": "0x…" }
{ "type": "account_state", "address": "0x…", "detail": "margin" }
```

`detail: "margin"` is the cheap read. It returns only the scalars, with no lane
summaries and no balances. The full read returns the scalars and the four lane
summaries, but it omits `cross_maintenance_margin_used`. To compute `health`
yourself, read `detail: "margin"`.

The two depths do not return the same set of scalars, because of cost.
`total_ntl_pos` needs the position walk, and `detail: "margin"` skips that walk
by definition. Thus `total_ntl_pos` is on the full read only, as
`perp.total_ntl_pos`.

:::caution
The held initial margin has two names, one for each depth. `detail: "margin"`
returns it as `total_margin_used` at the top level. The full read returns it as
`perp.init_margin`. The number is the same. Read the name that your depth
returns. See the [lane split](../changelog/migrations.md#account-state-lane-split).
:::

## The scalars {#the-scalars}

| Field | Read | What it is |
|---|---|---|
| `account_value` | both | The current value of the account, unrealized profit included. Split `standard` account: the perp wallet only. The spot wallet is the USDC row of `spot.balances` |
| `total_raw_usd` | both | *Settled cash equity*. Realized USDC only. It does not count unrealized PnL. Both formulas below start from this `settled cash` term |
| `withdrawable` | both | Cash that you can take out. Clamped at zero. Split `standard` account: the perp wallet only |
| `total_margin_used` / `perp.init_margin` | both, under two names | Margin that open cross positions currently use |
| `perp.total_ntl_pos` | full read only | The sum of the mark notional of the account's cross positions. Isolated legs are not in it |
| `cross_maintenance_margin_used` | `detail: "margin"` only | The margin below which the engine liquidates the cross account. The scope is cross, and the name says so deliberately. See the caution below |
| `health` | both | `account_value - cross_maintenance_margin_used`. The cushion above liquidation |
| `tier` | both | The liquidation band that the engine puts you in |
| `abstraction` | both | `"unified"` (default), `"standard"` (two USDC wallets, see [account modes](./account-modes.md#standard)) or `"portfolio"` (enrolled in portfolio margin) |
| `health_deferred` | both, when true | The risk engine cannot price a leg. See below |

:::caution
`health_deferred: true` means that the risk numbers are not a solvency
statement. The key is absent in the normal case. When it is present, at least
one open position has no usable price. The chain then reports
`cross_maintenance_margin_used` of `0` and defers the decision. A `0`
maintenance here does not mean that the account has no requirement. Do not read
`health` or `tier` as safe while the flag is set.
:::

:::caution
Do not size an isolated position from `cross_maintenance_margin_used`. Isolated
positions are outside every scalar on this page. `account_value`, the held
initial margin, `perp.total_ntl_pos`, `cross_maintenance_margin_used` and
`health` cover the cross bucket only. An isolated position posts its own margin
bucket when it opens. That margin has already left settled cash, and the engine
judges the position against that bucket only. For an isolated leg, read the
`margin` and `maint_margin` fields of that position.

This is why the field has `cross` in its name. An account that holds only
isolated positions reports a `cross_maintenance_margin_used` of `0`. It can
still be one adverse mark away from a per-leg liquidation.
:::

## account_value {#account-value}

```
account_value = settled cash
              + unrealized PnL on every open CROSS position
              + unrealized funding, SIGNED
              + net equity of open spot-margin positions
```

*Settled cash* is realized USDC: deposits, closed-position PnL and fees already
paid. *Unrealized PnL* marks every open cross position to its mark price. Each
leg adds `direction × (mark price − average entry price) × |size|`.

Unrealized funding is signed here. This is the one rule that the two formulas do
not share. Unrealized funding is the funding that an open position has accrued
in the current period and that the engine has not charged yet. `account_value`
includes it in both directions. An account that owes funding sees the debit
early. An account that is owed funding sees the credit early. `withdrawable`
includes only the debit. The two fields disagree deliberately. See the next
section.

Spot-margin positions add `position value − debt` when the account holds any.
An account with no spot-margin borrowing adds exactly `0`.

A portfolio-margin account adds one more term: the value of its eligible
haircut collateral. `abstraction` tells you the class of the account.

## withdrawable {#withdrawable}

This section gives the full formula, because this number often surprises users.

```
withdrawable = max(0,  settled cash
                     - unrealized funding you OWE (debit side only)
                     - unrealized PnL you are DOWN (loss side only)
                     - total_margin_used
                     - initial requirement of spot-margin borrowing )
```

There are two differences from `account_value`:

1. Unrealized PnL counts only as a loss here. A loss reduces `withdrawable`. A
   gain does not increase it: you cannot remove open profit until you close the
   position. The asymmetry is deliberate. The loss half stops a withdrawal from
   taking back the collateral that admission just made you post. Held margin is
   measured at entry notional. A position opened far below the mark thus holds
   almost nothing against a loss that is already real. Without the loss term, a
   trader could open at a stale price, get a fill, and withdraw the margin
   behind the position.
2. The funding term counts only as a debit, for the same reason. Funding that
   you owe reduces `withdrawable`. Funding that you are owed does not increase
   it. An unrealized credit must not fund a withdrawal.

A position that the engine cannot price contributes `0`. The engine does not
guess. When a leg has no usable mark, the loss term for the whole account is
exactly zero. This is the same deferral that `health_deferred` reports.

`total_margin_used` in this formula is the same `total_margin_used` that the
account read reports. `settled cash` is the same quantity that `total_raw_usd`
reports. The spot-margin term is a separate quantity and is not inside
`total_margin_used`. When an account has borrowed against spot, `withdrawable`
is lower than `total_raw_usd - funding owed - total_margin_used` predicts. An
account with no spot-margin borrowing subtracts exactly `0`, and the two values
agree.

The result can look alarming, but it is correct:

> An account can be perfectly healthy, show a large `account_value`, and still
> have `withdrawable` of exactly **0**.

This occurs when open profit funds the margin. The example below uses real
figures from a live account. The figures are full precision, not rounded to
cents. If you round them first, the sums miss by a cent:

| | |
|---|---|
| Settled cash (`total_raw_usd`) | 878.4866 |
| Unrealized PnL (two CROSS positions) | +807.9313 |
| Unrealized funding owed | -1.0439 |
| **account_value** | **1685.3740** |
| Committed margin (`total_margin_used`) | 1281.00 |
| **withdrawable** | **0** |

`account_value` is `878.4866 + 807.9313 - 1.0439 = 1685.3740`.

The raw withdrawable subtraction is `878.4866 - 1.0439 - 1281 = -403.5573`. It
is negative because the 807.93 of open profit funds part of the 1281 of margin,
and you cannot withdraw that profit. The field reports 0, because the amount
that you can withdraw cannot be less than zero.

:::tip
Every one of these fields is a full-precision decimal string. Do not round a
component before you reconcile a sum. Two components rounded to the cent can
each be correct while their total is a cent away from the field that the chain
returns.
:::

To free cash, close a position. When you realize the 807.93, it becomes settled
cash, and the margin behind it is released at the same time.

## Held initial margin and cross_maintenance_margin_used {#margins}

The held initial margin is `total_margin_used` on `detail: "margin"` and
`perp.init_margin` on the full read. It is the sum, over every open position, of
what admission reserved when the position opened. Per position:

```
initial margin = |notional| / effective leverage
```

`cross_maintenance_margin_used` is the margin that the liquidation engine
demands before it lets you keep the position:

```
maintenance margin = |notional| × maintenance ratio
```

The maintenance ratio comes from the margin ladder of the market. A bigger
position is in a higher band with a stricter ratio. Read the ladder from
`markets_meta.margin_tiers`. Each rung has its own `max_leverage` and
`maint_margin_ratio`.

The maintenance ratio caps leverage. Admission refuses leverage that could not
survive its own maintenance requirement. `markets_meta.max_leverage` is thus the
ceiling that admission accepts, not only the configured value. The node refuses
an order above it with `InsufficientMargin`. No order id is used and nothing
rests on the book.

## total_ntl_pos {#total-ntl-pos}

```
total_ntl_pos = Σ over open CROSS positions of  |size| × mark price
```

This is position notional at the mark, not at entry. It moves when the mark
moves. The sum covers the same cross legs as the scalars above, so an isolated
leg adds nothing to it. The sum of the `notional` field of every position row
whose `isolated` is `false` gives the same figure.

Only the full `account_state` read returns it. `detail: "margin"` skips the
position walk, so it cannot produce this sum.

## health and tier {#health-and-tier}

```
health = account_value - cross_maintenance_margin_used
```

A positive value is the cushion above liquidation, in USDC. `tier` is the band
that the engine's own classifier puts you in. The classifier uses the same
truncated values as the engine, so the band that you see always agrees with the
band that you are in.

## Balances and `hold` {#balances-and-hold}

Each row of `spot.balances`:

| Field | Meaning |
|---|---|
| `name` | The spot token symbol. It is the key that rows are joined by |
| `signing_id` | The uint32 that you sign against for that token |
| `total` | All that you hold of it |
| `hold` | The part locked in resting spot orders |
| `avg_entry_px` | Your average cost basis; `null` when there is none |

:::warning
`total - hold` is not your withdrawable balance. `hold` covers spot order escrow
only. It does not include margin that perpetual positions use. In the example
above, USDC shows `total 878.49` and `hold 0`, while open positions use 1,281
USDC of margin.

Use `withdrawable` for the withdrawable amount. It is the only field that gives
that value.
:::

`spot.balances` on `account_state` is the full token ledger: the unified USDC
pool and every spot token, with one row shape for all. It is never an empty
array. The USDC row is always present, also on an unfunded account.

## Per-market sizing {#per-market-sizing}

`withdrawable` applies to the whole account. To find how much you can open on
one market, query that market:

```json
{ "type": "active_asset_data", "address": "0x…", "coin": "BTC" }
```

`available_to_trade` is a `[buy, sell]` pair of notional amounts. It already
accounts for the side and is never negative. On the increasing side it is
`withdrawable × leverage`. On the reducing side it can also close what is
already open. Use this field for the "available" line of an order ticket.

A split `standard` account gets the same formula over its perp wallet, with no
reservation cap. A `standard` account that entered before the split is also
capped by its `perp` reservation.

The value comes from `withdrawable`, so it has the same unrealized-loss term. An
open loss reduces what the ticket offers on the increasing side. An open gain
does not increase it.

The same read returns `max_trade_size`. This value is not specific to your
account. It is the open-interest headroom left on the whole market, shared with
every other account. It is `null` when the market has no cap. Size against
`max_trade_szs`. Treat `max_trade_size` as a ceiling that other accounts also
compete for. See
[`max_trade_size` is market-wide](../api/rest/info/perpetuals.md#max-trade-size).

## See also {#see-also}

- [Margin modes](margin-modes.md)
- [Tiered liquidation](tiered-liquidation.md)
- [Funding rates](funding-rates.md)
