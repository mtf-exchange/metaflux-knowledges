---
title: Account modes
description: unified, standard and portfolio — what each one changes, and what it does not
---

# Account modes

An account carries ONE of three modes: `unified`, `standard` or `portfolio`.
`/info` [`account_state`](../api/rest/info/account.md#account_state) reports it as
`abstraction`.

:::caution Two different things are called a "mode"
This page is about the **account** mode. `cross` / `isolated` / `strict_iso` is a
**position** setting and lives in [margin modes](./margin-modes.md). They are
independent axes: a `standard` account can hold isolated positions, and a
`portfolio` account can hold cross ones.
:::

## What each mode changes {#what-changes}

The three modes do not sit on one dial. They move **three separate properties**,
and each mode moves a different subset:

| | What counts as collateral | How margin is computed | Where the USDC is held |
|---|---|---|---|
| **`unified`** | USDC only | Sum of each position's requirement | One balance |
| **`standard`** | USDC only | Sum of each position's requirement | **Two wallets: perp and spot** |
| **`portfolio`** | USDC **plus eligible spot tokens**, at a governance haircut | **Scenario (SPAN) sweep over the whole account** | One balance |

`unified` is the origin: one balance, USDC only, per-position sum. `standard`
changes ONLY the third column. `portfolio` changes ONLY the first two.

**Only `standard` changes the ledger.** `unified` and `portfolio` fund every
product from ONE USDC balance. A `standard` account holds a perp wallet and a
spot wallet, and USDC crosses between them only by an explicit transfer — see
[`standard` is two wallets](#standard-is-two-wallets).

## `unified` {#unified}

The default. Every account starts here, and an account that has never sent
[`user_set_abstraction`](../api/rest/exchange/account.md#user_set_abstraction) is in it.

One USDC balance backs every product. A perp loss, a spot-margin loss and an
option premium all draw on it, and any of them can consume what another was
counting on. `withdrawable` is what is left after every open requirement.

## `standard` {#standard}

Two USDC wallets, and an explicit transfer between them. An account that enters
`standard` at or above block 5,710,001 (node 0.9.7) gets the two wallets. An
account that was already in `standard` below that height keeps one balance — see
[before the split](#before-the-split).

`account_state` reports the posture as `split`: `true` for two wallets, `false`
for one balance.

### `standard` is two wallets {#standard-is-two-wallets}

| Wallet | What it funds | Where to read it |
|---|---|---|
| **Perp wallet** | Perp orders and positions, option orders and escrow, withdrawals. Liquidation judges this wallet alone | `account_value` and `withdrawable` on `account_state` |
| **Spot wallet** | Spot orders and fills | The USDC row (`signing_id 100`) of `spot.balances` |

The full list of which action reads which wallet is in
[the standard-mode split](./usdc.md#standard-split).

The spot wallet starts empty.
[`usd_class_transfer`](../api/rest/exchange/transfers.md#usd_class_transfer) is the
only way USDC crosses:

- **Perp → spot** moves free collateral only. USDC that margins an open position
  stays in the perp wallet.
- **Spot → perp** moves USDC that no resting spot order holds.

**A perp loss cannot reach the spot wallet.** A split account's perp bankruptcy
is absorbed by the insurance fund and ADL, never by its spot USDC. For full
isolation, with its own address and its own liquidation, use a
[sub-account](./sub-accounts.md).

**Each wallet funds its own orders, with no cap.** A perp or option order is
admitted against the perp wallet's free collateral. A spot order is admitted
against the spot wallet. A spot order the spot wallet cannot fund is refused with
`insufficient spot balance`. A split account has no reservations and no spot
margin.

:::caution Not live yet
Uncapped admission, the refusal of an unfunded spot order and the refusal of every
reservation ship with the next node release after 0.9.7. Until then, a live node:

- caps the perp and option orders of a split account by its `perp` and `option`
  reservations, so a split account with no `perp` reservation opens no perp
  position;
- accepts a spot order the spot wallet cannot fund as a no-op, and answers
  `filled` with `total_sz: "0"`.

To trade perps on a live node, first set a `perp` reservation with
[`user_set_abstraction`](../api/rest/exchange/account.md#user_set_abstraction) `kind: 1`.
:::

**Reading the two wallets.** `account_value` and `withdrawable` are the perp
wallet. The USDC row of `spot.balances` is the spot wallet. Its `total` includes
the USDC that resting spot bids hold, so `total − hold` is what a new spot order
may spend. The account total is `account_value` plus that row's `total`.

### Before the split {#before-the-split}

An account that entered `standard` below block 5,710,001 reads `split: false`. It
keeps ONE USDC balance and a **spending cap per product**. The caps are called
reservations, and there are three:

| Scope | Covers |
|---|---|
| `perp` | Perpetual positions, cross AND isolated |
| `spot` | Spot **and spot margin** — one cap for both |
| `option` | Option escrow |

Set each one with `user_set_abstraction` kinds 1–3. Read them back on
[`account_state.reservations`](../api/rest/info/account.md#account-state-reservations).

**The caps are fail-closed.** An unset reservation is zero, and zero admits
nothing.

**A reservation binds admission only.** No liquidation, ADL, settlement, funding
or seizure path reads it, and neither does any cash path — withdraw, transfer,
vault or Earn. So a reservation:

- cannot hold back your own money (`withdrawable` is unaffected);
- cannot make the account harder to liquidate;
- **cannot stop a loss in one product from consuming another product's USDC.**

A reservation is a cap on what you may OPEN, not a wall around money you hold. To
get two wallets, switch to `unified` and back to `standard`. Both changes need a
flat account.

## `portfolio` {#portfolio}

Portfolio margin, for accounts that qualify. Enrol with
[`user_portfolio_margin`](../api/rest/exchange/margin-risk.md#user_portfolio_margin). Two
things change:

**Eligible spot tokens become collateral.** A token whose governance
`pm_collateral_haircut` is positive is credited at `balance × mark × haircut`,
and the FULL un-haircut exposure is folded into the scenario sweep as a long spot
leg — so a crash in the collateral raises the requirement. USDC is weight 1 and
is never haircut. In the other two modes, a non-USDC spot balance is worth
nothing as collateral.

**Margin becomes a scenario sweep.** Instead of summing each position's
requirement, the engine stresses the whole account and takes the worst outcome,
with a concentration penalty. Offsetting positions can require LESS than their
sum; a concentrated book can require more.

Two governance limits gate entry, read at enrol time only:

| Limit | Default | Knob |
|---|---|---|
| Minimum net value | 100,000 USDC | `SetPmMinEnrollValueCents` |
| Enrolled accounts | 512 | `SetPmMaxEnrolledUsers` |

**Leaving is always allowed**, even while the account is underwater under PM
margining — PM can require MORE than the per-asset sum, so blocking the exit
would trap an account inside the worse model.

## `standard` and `portfolio` are mutually exclusive {#exclusivity}

Enforced in both directions, so the pair is unreachable:

- `user_set_abstraction` refuses while the account is PM-enrolled —
  `"cannot change abstraction while enrolled in portfolio margin"`.
- `user_portfolio_margin` refuses while the account is in standard mode —
  `"cannot enroll portfolio margin in standard abstraction mode"`.

`unified` is the way between them: leave one, then enter the other.

This is also why `abstraction` can be a single three-valued field. In state these
are two separate things — a mode value and an enrolment row — and the field
reports `portfolio` whenever the enrolment exists.

## Changing mode {#changing-mode}

`user_set_abstraction` kind 0 with value `1` (standard) or `0` (unified).

**The account must be FLAT on every surface.** The node refuses the change while
any of these exists: a perp position, a resting perp order, a parked trigger, a
live TWAP, a resting spot order, a spot TWAP, a spot-margin position, an option
position, or an open RFQ quote. The rejection names what it found.

**Entering `standard`** splits the USDC: all of it stays in the perp wallet, and
the spot wallet starts empty. Entry is refused while the perp wallet is below
zero.

**Returning to `unified`** folds the spot wallet back into the one balance and
clears every reservation. It is refused while the spot wallet is below zero.

## Which mode do you want {#which-mode}

| You want | Use |
|---|---|
| The simplest thing; everything shares one balance | `unified` |
| Spot USDC that a perp loss cannot reach, moved between wallets by hand | `standard` |
| Full isolation, with its own address and its own liquidation | **A sub-account**, in any mode |
| Spot holdings to back perp positions, and offsetting risk to net off | `portfolio` |
