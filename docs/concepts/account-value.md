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

`detail: "margin"` is the cheap one. It returns the scalars alone — no lane
summaries and no balances. The full read returns the scalars plus the four lane
summaries, but it **omits `cross_maintenance_margin_used`**. To compute `health`
yourself, read `detail: "margin"`.

The two depths do not carry the same scalar set, and the reason is cost.
`total_ntl_pos` needs the position walk, and `detail: "margin"` is defined by
skipping that walk — so it is on the full read only, as `perp.total_ntl_pos`.

:::caution
**The held initial margin has two names, one per depth.** `detail: "margin"`
serves it as `total_margin_used` at the top level. The full read serves it as
`perp.init_margin`. Same number; read the name your depth serves. See the
[lane split](../api/migration.md#account-state-lane-split).
:::

## The scalars {#the-scalars}

| Field | Read | What it is |
|---|---|---|
| `account_value` | both | Everything the account is worth right now, unrealized profit included |
| `total_raw_usd` | both | **Settled cash equity.** Realized USDC only — it does NOT count unrealized PnL. This is the `settled cash` term both formulas below start from |
| `withdrawable` | both | Cash you can take out. **Clamped at zero** |
| `total_margin_used` / `perp.init_margin` | both, under two names | Margin currently committed to open CROSS positions |
| `perp.total_ntl_pos` | full read only | Mark notional of the account's CROSS positions, summed. Isolated legs are NOT in it |
| `cross_maintenance_margin_used` | `detail: "margin"` only | Margin below which the CROSS account is liquidated. **The scope is cross, and the name says so on purpose** — see the caution below |
| `health` | both | `account_value - cross_maintenance_margin_used`. The cushion above liquidation |
| `tier` | both | The liquidation band the engine has you in |
| `abstraction` | both | `"unified"` (default), `"standard"` (per-product reservations) or `"portfolio"` (portfolio margin enrolled) |
| `health_deferred` | both, when true | The risk engine cannot price a leg. See below |

:::caution
**`health_deferred: true` means the risk numbers are not a solvency statement.**
The key is absent in the normal case. When it is present, at least one open
position has no usable price, so the chain reports
`cross_maintenance_margin_used` of `0` and defers the decision. A `0`
maintenance here does NOT mean the account carries no requirement. Do not read
`health` or `tier` as safe while the flag is set.
:::

:::caution
**Do not size an isolated position off `cross_maintenance_margin_used`.**
Isolated positions are outside every scalar on this page. `account_value`,
the held initial margin, `perp.total_ntl_pos`,
`cross_maintenance_margin_used` and `health` cover the CROSS bucket only. An isolated position posts its own margin
bucket when it opens, that margin already left settled cash, and the engine
judges the position against that bucket alone. For an isolated leg, read that
position's own `margin` and `maint_margin` fields instead.

This is why the field carries `cross` in its name. An account that holds only
isolated positions reports a `cross_maintenance_margin_used` of `0` and is still
one adverse mark from a per-leg liquidation.
:::

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

> ⬆️ **Upgrade notice — the unrealized-loss term is not live yet.** It ships
> with the next node release. On the live chain today `withdrawable` folds
> neither side of unrealized PnL, so an account holding a losing position reads
> HIGHER than the formula below. Everything else on this page is live.

```
withdrawable = max(0,  settled cash
                     - unrealized funding you OWE (debit side only)
                     - unrealized PnL you are DOWN (loss side only)
                     - total_margin_used
                     - initial requirement of spot-margin borrowing )
```

Two differences from `account_value`, and both surprise people:

1. **Unrealized PnL is loss-only here.** A loss REDUCES withdrawable. A gain
   does NOT raise it — open profit is not yours to remove until you close. The
   two halves are asymmetric on purpose, and the loss half is what stops a
   withdrawal from taking back the collateral admission just made you post: held
   margin is measured at ENTRY notional, so a position opened far under the mark
   holds almost nothing against a loss that is already real. Without the loss
   term a trader opens at a stale price, fills, and withdraws the margin behind
   the position.
2. **The funding term is debit-only, for the same reason.** Funding you OWE
   reduces withdrawable. Funding you are OWED does not raise it. An unrealized
   credit must not fund a withdrawal.

**A position the engine cannot price contributes `0`, not a guess.** When a leg
has no usable mark the loss term for the whole account is exactly zero, the same
deferral `health_deferred` reports.

`total_margin_used` in this formula is the same `total_margin_used` the account
read reports, and `settled cash` is the same quantity `total_raw_usd` reports.
The spot-margin term is a separate quantity and is NOT inside
`total_margin_used`: when an account has borrowed against spot, `withdrawable`
is lower than `total_raw_usd - funding owed - total_margin_used` alone predicts.
An account with no spot-margin borrowing subtracts exactly `0`, and the two
agree.

The consequence is worth stating plainly, because it looks alarming and is not:

> An account can be perfectly healthy, show a large `account_value`, and still
> have `withdrawable` of exactly **0**.

That happens whenever open profit is funding the margin. A worked example, real
figures from a live account. **The figures are full precision, not rounded to
cents** — round them first and the sums miss by a cent:

| | |
|---|---|
| Settled cash (`total_raw_usd`) | 878.4866 |
| Unrealized PnL (two CROSS positions) | +807.9313 |
| Unrealized funding owed | -1.0439 |
| **account_value** | **1685.3740** |
| Committed margin (`total_margin_used`) | 1281.00 |
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

## Held initial margin and cross_maintenance_margin_used {#margins}

The held initial margin (`total_margin_used` on `detail: "margin"`,
`perp.init_margin` on the full read) is the sum, over every open position, of what admission
reserved when it opened. Per position:

```
initial margin = |notional| / effective leverage
```

`cross_maintenance_margin_used` is what the liquidation engine demands to LET
you keep it:

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

## total_ntl_pos {#total-ntl-pos}

```
total_ntl_pos = Σ over open CROSS positions of  |size| × mark price
```

Position notional at the MARK, not at entry — it moves when the mark moves. The
sum is taken over the same cross legs the scalars above cover, so an isolated
leg contributes nothing to it. Add up the `notional` field of every position row
whose `isolated` is `false` and you get the same figure.

It is served on the full `account_state` read only. `detail: "margin"` skips the
position walk, so it cannot produce this sum.

## health and tier {#health-and-tier}

```
health = account_value - cross_maintenance_margin_used
```

Positive is the cushion above liquidation, in USDC. `tier` is the band the
engine's own classifier puts you in, computed from the same truncated values the
engine uses, so the band you are shown can never disagree with the band you are
in.

## balances, and what `hold` really is {#balances-and-hold}

Each row of `spot.balances`:

| Field | Meaning |
|---|---|
| `name` | The spot token symbol. Rows are keyed and joined by it |
| `signing_id` | The uint32 you sign against for that token |
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

`account_state`'s `spot.balances` is the whole token ledger — the unified USDC
pool and every spot token, one row shape throughout. It is never an empty array:
the USDC row is always there, even on an unfunded account.

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

Because it is derived from `withdrawable`, it carries the same unrealized-loss
term: an open loss shrinks what the ticket offers on the increasing side, and an
open gain does not grow it.

The same read carries `max_trade_size`. **That one is not yours** — it is the
open-interest headroom left on the whole market, shared with every other account,
and `null` when the market has no cap. Size against `max_trade_szs`; treat
`max_trade_size` as a ceiling you race others for. See
[`max_trade_size` is market-wide](../api/rest/info/perpetuals.md#max-trade-size).

## See also {#see-also}

- [Margin modes](margin-modes.md)
- [Tiered liquidation](tiered-liquidation.md)
- [Funding rates](funding-rates.md)
