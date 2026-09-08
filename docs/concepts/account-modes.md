---
title: Account modes
description: unified, standard and portfolio — what each one changes, and what it does not
---

# Account modes

An account carries ONE of three modes: `unified`, `standard` or `portfolio`.
`/info` [`account_state`](../api/rest/info.md#account_state) reports it as
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

| | What counts as collateral | How margin is computed | How the budget is divided |
|---|---|---|---|
| **`unified`** | USDC only | Sum of each position's requirement | Not divided — one pool |
| **`standard`** | USDC only | Sum of each position's requirement | **Per-product caps** |
| **`portfolio`** | USDC **plus eligible spot tokens**, at a governance haircut | **Scenario (SPAN) sweep over the whole account** | Not divided — one pool |

`unified` is the origin: no division, USDC only, per-position sum. `standard`
changes ONLY the third column. `portfolio` changes ONLY the first two.

**Nothing here changes the ledger.** All three modes spend from the SAME single
USDC balance. There is no second wallet in any of them, and there is no transfer
between products — see [what standard is not](#standard-is-not-two-wallets).

## `unified` {#unified}

The default. Every account starts here, and an account that has never sent
[`user_set_abstraction`](../api/rest/exchange/account.md#user_set_abstraction) is in it.

One USDC balance backs every product. A perp loss, a spot-margin loss and an
option premium all draw on it, and any of them can consume what another was
counting on. `withdrawable` is what is left after every open requirement.

## `standard` {#standard}

The same single USDC balance, plus a **spending cap per product**. The caps are
called reservations and there are three:

| Scope | Covers |
|---|---|
| `perp` | Perpetual positions, cross AND isolated |
| `spot` | Spot **and spot margin** — one cap for both |
| `option` | Option escrow |

Set each one with `user_set_abstraction` kinds 1–3. Read them back on
[`account_state.reservations`](../api/rest/info.md#account-state-reservations).

**The mode is fail-closed.** An unset reservation is zero, and zero admits
nothing. A fresh `standard` account can place NO order until it allocates. That
is the point of the mode, not a defect.

**A reservation binds admission only.** No liquidation, ADL, settlement, funding
or seizure path reads it, and neither does any cash path — withdraw, transfer,
vault or Earn. So a reservation:

- cannot hold back your own money (`withdrawable` is unaffected);
- cannot make the account harder to liquidate;
- **cannot stop a loss in one product from consuming another product's USDC.**

That last line is the one to read twice.

### `standard` is NOT two wallets {#standard-is-not-two-wallets}

A reservation is a cap on what you may OPEN, not a wall around money you hold. If
perps lose, the loss comes out of the one balance, and the USDC your `spot`
reservation names goes with it. The reservation is unchanged; the pool behind it
is smaller.

If you want money that a position in another product genuinely cannot reach,
**use a sub-account**. A sub-account is a separate address with its own balance
and its own liquidation, and it needs no mode at all.

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

Returning to `unified` clears every reservation.

## Which mode do you want {#which-mode}

| You want | Use |
|---|---|
| The simplest thing; everything shares one balance | `unified` |
| A ceiling on what one product can commit, so a mistake in one place cannot spend the whole account | `standard` |
| Money that another product's loss genuinely cannot reach | **A sub-account**, in any mode |
| Spot holdings to back perp positions, and offsetting risk to net off | `portfolio` |
