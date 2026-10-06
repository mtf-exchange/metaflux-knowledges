---
title: Account modes
description: The unified, standard and portfolio account modes, what each one changes, and what it does not change.
---

# Account modes

This page describes the three account modes and what each one changes.

An account has one of three modes: `unified`, `standard` or `portfolio`. `/info`
[`account_state`](../api/rest/info/account.md#account_state) reports the mode as
`abstraction`.

:::caution Two different things are called a "mode"
This page is about the account mode. `cross` / `isolated` / `strict_iso` is a
position setting. It is in [margin modes](./margin-modes.md). The two settings
are independent: a `standard` account can hold isolated positions, and a
`portfolio` account can hold cross positions.
:::

## What each mode changes {#what-changes}

The three modes are not points on one scale. They change three separate
properties, and each mode changes a different subset:

| | What counts as collateral | How margin is computed | Where the USDC is held |
|---|---|---|---|
| **`unified`** | USDC only | Sum of each position's requirement | One balance |
| **`standard`** | USDC only | Sum of each position's requirement | Two wallets: perp and spot |
| **`portfolio`** | USDC plus eligible spot tokens, at a governance haircut | Scenario (SPAN) sweep over the whole account | One balance |

`unified` is the base: one balance, USDC only, and a sum per position.
`standard` changes only the third column. `portfolio` changes only the first two.

Only `standard` changes the ledger. `unified` and `portfolio` fund every product
from one USDC balance. A `standard` account holds a perp wallet and a spot
wallet. USDC moves between them only by an explicit transfer. See
[`standard` is two wallets](#standard-is-two-wallets).

## `unified` {#unified}

`unified` is the default. Every account starts in it. An account that never
sent [`user_set_abstraction`](../api/rest/exchange/account.md#user_set_abstraction)
is in it.

One USDC balance backs every product. A perp loss, a spot-margin loss and an
option premium all draw on it. Any one of them can consume the USDC that another
one needs. `withdrawable` is what is left after every open requirement.

## `standard` {#standard}

`standard` has two USDC wallets and an explicit transfer between them. An
account that enters `standard` at or above block 5,710,001 (node 0.9.7) gets the
two wallets. An account that was in `standard` below that height keeps one
balance. See [before the split](#before-the-split).

`account_state` reports this as `split`: `true` for two wallets, `false` for one
balance.

### `standard` is two wallets {#standard-is-two-wallets}

| Wallet | What it funds | Where to read it |
|---|---|---|
| **Perp wallet** | Perp orders and positions, option orders and escrow, withdrawals. Liquidation looks at this wallet only | `account_value` and `withdrawable` on `account_state` |
| **Spot wallet** | Spot orders and fills | The USDC row (`signing_id 100`) of `spot.balances` |

[The standard-mode split](./usdc.md#standard-split) lists which action reads
which wallet.

The spot wallet starts empty.
[`usd_class_transfer`](../api/rest/exchange/transfers.md#usd_class_transfer) is
the only way to move USDC between the wallets:

- Perp to spot moves free collateral only. USDC that margins an open position
  stays in the perp wallet.
- Spot to perp moves USDC that no resting spot order holds.

A perp loss cannot reach the spot wallet. The insurance fund and ADL absorb the
perp bankruptcy of a split account. Its spot USDC never does. For full
isolation, with a separate address and a separate liquidation, use a
[sub-account](./sub-accounts.md).

Each wallet funds its own orders, with no cap. The perp wallet's free collateral
admits a perp or option order. The spot wallet admits a spot order. The node
refuses a spot order that the spot wallet cannot fund, with
`insufficient spot balance`. A split account has no reservations and no spot
margin.

To read the two wallets, use these fields. `account_value` and `withdrawable`
are the perp wallet. The USDC row of `spot.balances` is the spot wallet. Its
`total` includes the USDC that resting spot bids hold, so `total − hold` is what
a new spot order can spend. The account total is `account_value` plus the
`total` of that row.

### Before the split {#before-the-split}

An account that entered `standard` below block 5,710,001 reads `split: false`.
It keeps one USDC balance and a spending cap per product. These caps are
*reservations*. There are three:

| Scope | Covers |
|---|---|
| `perp` | Perpetual positions, cross and isolated |
| `spot` | Spot and spot margin, one cap for both |
| `option` | Option escrow |

Set each one with `user_set_abstraction` kinds 1–3. Read them on
[`account_state.reservations`](../api/rest/info/account.md#account-state-reservations).

The caps fail closed. An unset reservation is zero, and zero admits nothing.

A reservation applies to admission only. No liquidation, ADL, settlement,
funding or seizure path reads it. No cash path reads it: withdraw, transfer,
vault and Earn ignore it. Thus a reservation:

- cannot hold back your own money (`withdrawable` does not change);
- cannot make the account harder to liquidate;
- cannot stop a loss in one product from consuming the USDC of another product.

A reservation caps what you can open. It does not protect money that you hold.
To get two wallets, switch to `unified` and then back to `standard`. Both
changes need a flat account.

## `portfolio` {#portfolio}

`portfolio` is portfolio margin, for accounts that qualify. Enrol with
[`user_portfolio_margin`](../api/rest/exchange/margin-risk.md#user_portfolio_margin).
Two things change.

Eligible spot tokens become collateral. A spot token counts only when governance
sets a positive collateral weight (`pm_collateral_haircut`) for that token. The
credit is `balance × mark × weight`. The mark is the oracle price of the
perpetual market that governance names for the token. When governance names
none, the mark is the perpetual with the same symbol. A token with no such
native perpetual never counts. A token whose perpetual is self-priced never
counts. A token whose symbol is different from its perpetual needs the named
mapping, for example a bridged `gBTC` that `BTC` prices. No token has a positive
weight yet, so no spot token counts today. A stale oracle removes the credit.
The sweep includes the full balance, without the weight, as a long spot leg. A
crash in the collateral thus raises the requirement. USDC has weight 1 and gets
no haircut. In the other two modes, a non-USDC spot balance has no collateral
value. See [the full rules](./portfolio-margin.md#multi-collateral-cross-collateral-haircut).

Margin becomes a scenario sweep. The engine does not sum the requirement of each
position. It stresses the whole account and takes the worst outcome, with a
concentration penalty. Offsetting positions can require less than their sum. A
concentrated book can require more.

Two governance limits control entry. The node reads them at enrol time only:

| Limit | Default | Knob |
|---|---|---|
| Minimum net value | 100,000 USDC | `SetPmMinEnrollValueCents` |
| Enrolled accounts | 512 | `SetPmMaxEnrolledUsers` |

An account can always leave, even when it is underwater under PM margin. PM can
require more than the per-asset sum. A block on the exit would trap an account
inside the model that is worse for it.

## `standard` and `portfolio` are mutually exclusive {#exclusivity}

The node enforces this in both directions, so no account can have both:

- `user_set_abstraction` refuses while the account is PM-enrolled, with
  `"cannot change abstraction while enrolled in portfolio margin"`.
- `user_portfolio_margin` refuses while the account is in standard mode, with
  `"cannot enroll portfolio margin in standard abstraction mode"`.

`unified` is the path between them: leave one, then enter the other.

This is also why `abstraction` can be one field with three values. In state, the
two are separate: a mode value and an enrolment row. The field reports
`portfolio` when the enrolment exists.

## Changing mode {#changing-mode}

Send `user_set_abstraction` kind 0 with value `1` (standard) or `0` (unified).

The account must be flat on every surface. The node refuses the change while any
of these exists: a perp position, a resting perp order, a parked trigger, an open
TWAP, a resting spot order, a spot TWAP, a spot-margin position, an option
position, or an open RFQ quote. The rejection names what it found.

When the account enters `standard`, the node splits the USDC. All of it stays in
the perp wallet, and the spot wallet starts empty. The node refuses entry while
the perp wallet is below zero.

When the account returns to `unified`, the node folds the spot wallet back into
the one balance and clears every reservation. The node refuses the return while
the spot wallet is below zero.

## Choosing a mode {#which-mode}

| You want | Use |
|---|---|
| The simplest setup, with one balance for everything | `unified` |
| Spot USDC that a perp loss cannot reach, moved between wallets by hand | `standard` |
| Full isolation, with a separate address and a separate liquidation | A sub-account, in any mode |
| Spot holdings that back perp positions, and offsetting risk that nets off | `portfolio` |
