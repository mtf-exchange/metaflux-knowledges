---
description: "Open and close a leveraged spot position, and supply or redeem the Earn lending pool that funds it."
---

# Spot margin and Earn actions {#spot-margin--earn-actions}

These actions open and close a leveraged spot position, and supply or redeem the Earn pool that funds it.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

The page covers leveraged [spot margin](../../../products/spot-margin.md) and
its [Earn](../../../concepts/earn.md) lending supply side. These actions are
active on testnet. All of them are sender-authorized and return the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission
envelope.

**Earn pays no yield yet.** A pool is created automatically with a borrow rate
of zero. Only a governance vote can set a nonzero rate. Share value moves only
while a pool has a nonzero rate and an outstanding loan. Today a deposit earns
exactly 0. The principal stays redeemable up to the idle liquidity of the pool.



### Open a leveraged spot position {#spot_margin_open}

:::info
**Active on testnet.** The position is [cross-collateralized](spot-margin.md) against your unified USDC account. Forced liquidation is active (see [Liquidation](../../../products/spot-margin.md#liquidation)). **A pair is enabled only after governance calibrates its risk parameters, and no pair is calibrated yet.** Until then, this action fails with `spot margin not enabled for pair`.
:::

This action opens a leveraged long. It borrows `borrow` quote from the Earn pool
of the pair and sends an IOC buy of `size` base at up to `limit_px`.

- The borrow funds 100% of the buy.
- The margin requirement of the position is held against the free collateral
  of the whole account. This is the same unified USDC account that backs your
  perpetual positions. There is no separate collateral to post first. Leverage
  ≈ notional / free collateral.
- The bought base is held segregated on the margin account. The chain does not
  credit it to your spendable balances.
- The chain repays any unspent borrow right after the IOC settles. The
  outstanding loan equals only what the buy spent.
- An IOC with zero fill is an accepted no-op: a full refund, with nothing
  borrowed.
- v1 allows one open position for each `(account, pair)`. You cannot add to it.

The action is sender-authorized. The body goes under `action.params`.

```json
{
  "type": "spot_margin_open",
  "params": { "pair": 200, "size": 200, "limit_px": 200000000, "borrow": "400" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | an active spot pair with margin enabled | Spot pair id (`SpotPairSpec.pair_id`) |
| `size` | uint64 | `> 0` | Buy size in base raw lots (`10^sz_decimals` per whole unit). The chain widens it to `u128` |
| `limit_px` | uint64 | `> 0` | Limit price in the `1e8` plane |
| `borrow` | decimal string | `> 0` | Quote principal to draw from the Earn pool (whole units), as a JSON string |

**Initial-margin gate.** The chain checks the open in advance against the
worst-case cost (`limit_px × size`). It rejects the open unless
`free collateral ≥ init_ratio × worst_cost`. Free collateral is the free
collateral of the whole account, the same figure that a perpetual open uses.
`init_ratio` is the calibrated initial-margin parameter of the pair. While the
position is open, the held requirement reduces your free collateral. The gate
uses the worst case, so an open that passes never needs to unwind. The real
spend can only be lower, because maker prices are `≤ limit_px` and the size is
clamped. The gate reads the raw signed free collateral. The account read
publishes the same budget clamped, as
[`withdrawable`](../info/account.md#account_state) `= max(0, free collateral)`.

**Gating.** The chain rejects the action in these cases:

- The account is a split `standard` account
  (`spot margin is not available in standard mode`, see
  [the standard-mode split](../../../concepts/usdc.md#standard-split)).
- Margin is not enabled for the pair.
- A position is already open on the pair.
- Your free collateral is less than the initial-margin requirement.
- The idle liquidity of the Earn pool is less than `borrow`.
- Spot trading is halted.
- `size` is zero, or `borrow` is not positive.

**Response.** The action returns the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission
envelope. It does not return a synchronous `oid`, because the fill of the inner
IOC is a committed effect. Read the resulting `borrowed` and `base_held` with
[`/info` `spot_margin_state`](../info/spot.md#spot_margin_state). The
`total_borrowed` of the Earn pool changes on
[`earn_state`](../info/spot.md#earn_state). See
[spot margin](../../../products/spot-margin.md).

---

### Close a leveraged spot position {#spot_margin_close}

:::info
**Active on testnet.** See the [Spot margin & Earn](spot-margin.md) overview for the cross-collateralized model.
:::

This action closes the position. It sends an IOC sell of the held base at no
less than `limit_px`. It repays the accrued debt (principal + interest) to the
Earn pool, and returns the remainder to your unified USDC account.

- On a full unwind, the sale proceeds repay the debt and any remainder credits
  your account. The chain releases the held margin requirement and closes the
  position.
- A partial fill keeps the position open. The unsold base goes back into the
  segregated holding. Only the realized proceeds repay, and the outstanding
  principal drops by that amount.
- v1 accepts a full-close intent only. There is no `size` argument. The action
  offers the whole holding.

The action is sender-authorized. The body goes under `action.params`.

```json
{
  "type": "spot_margin_close",
  "params": { "pair": 200, "limit_px": 200000000 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | an active spot pair | The spot pair id of the position |
| `limit_px` | uint64 | `> 0` | Floor price for the close sell, in the `1e8` plane |

**Settlement.** Interest accrues `O(1)` from the borrow index of the pool since
the open. If the sale proceeds cannot cover the debt, your account collateral
covers the shortfall first. Only a residual that the account cannot cover
leaves the borrowed book of the pool. The chain socializes that residual to
suppliers: it reduces the supplied total of the pool, with a floor at zero.
This `spot_margin_close` action is always a voluntary close that the user
sends. A forced liquidation runs automatically through the same settlement path
when the account falls below the maintenance floor (see
[Liquidation](../../../products/spot-margin.md#liquidation)). The user does not
send a forced liquidation.

**Gating.** The chain rejects the action in these cases:

- There is no open position (nothing is held).
- The position has debt, but the Earn pool of the pair is missing.

**Response.** The action returns the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission
envelope. Read [`/info` `spot_margin_state`](../info/spot.md#spot_margin_state)
to confirm a full or partial close and the repaid amount. A pruned account no
longer appears there. The effects on suppliers show on
[`earn_state`](../info/spot.md#earn_state).

---

### Supply quote into the Earn pool {#earn_deposit}

:::info
**Active on testnet.** Yield is zero until governance votes a nonzero borrow rate. See the [Spot margin & Earn](spot-margin.md) overview.
:::

This action supplies quote into a lending pool. You receive pool shares priced
from the net asset value (NAV) of the pool. The first supplier into a pool
mints shares 1:1. Later deposits are priced from NAV. When borrower interest
has raised the pool, a deposit of the same size mints proportionally fewer
shares. The pool is created automatically on the first deposit, for any asset
that is the quote of a registered spot pair. The action is sender-authorized.
The body goes under `action.params`. `asset` is the lendable quote asset id
(the pool key), not a pair id.

```json
{
  "type": "earn_deposit",
  "params": { "asset": 100, "amount": "5000" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a registered spot pair's quote asset (or an existing pool) | Lendable asset id, which is the pool key |
| `amount` | decimal string | `> 0` | Quote to supply (whole units), as a JSON string |

**Gating.** The chain rejects the action in these cases:

- `amount` is not positive.
- The spendable balance is less than `amount`.
- `asset` is not lendable: it is not the quote of a pair and has no existing
  pool.
- The deposit is so small that it would mint zero shares.

**Response.** The action returns the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission
envelope. Confirm the minted shares and your stake with
[`/info` `earn_state`](../info/spot.md#earn_state). Pass `user` to include your
`user_shares` and `user_value`. See [Earn](../../../concepts/earn.md).

---

### Redeem Earn pool shares {#earn_withdraw}

:::info
**Active on testnet.** Yield is zero until governance votes a nonzero borrow rate. See the [Spot margin & Earn](spot-margin.md) overview.
:::

This action redeems pool shares back to quote and pays your spendable balance.
The payout is clamped to the idle liquidity of the pool
(`total_supplied − total_borrowed`). A redemption larger than the idle amount
pays exactly the idle amount and burns proportionally fewer shares. A supplier
can always exit up to the amount that is not lent out, and the exit never
strands the borrow ledger. There is no claim step. Yield compounds into share value
as borrower interest raises NAV, and you realize it on withdrawal. **With no
borrow rate voted, NAV does not move and the payout equals the deposit.** The
action is sender-authorized. The body goes under `action.params`.

```json
{
  "type": "earn_withdraw",
  "params": { "asset": 100, "shares": "1234.5" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a pool you hold shares in | Lendable asset id, which is the pool key |
| `shares` | decimal string | `> 0`, `≤` shares you own | Pool shares to redeem, as a JSON string |

**Gating.** The chain rejects the action in these cases:

- The pool does not exist.
- `shares` is not positive, or is more than you own.
- The pool is insolvent: zero NAV with shares outstanding.
- The pool has zero idle liquidity. All of it is lent out. Wait for borrowers
  to repay.
- The redemption quantizes to zero.

**Response.** The action returns the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission
envelope. When the chain clamps the payout to the idle amount, the count of
burned shares can be less than the request. Confirm the remaining stake and the
pool totals with [`/info` `earn_state`](../info/spot.md#earn_state). See
[Earn](../../../concepts/earn.md).

---

### Retired spot-margin deposit {#spot_margin_deposit}

:::danger Retired, it commits nothing
`spot_margin_deposit` decodes and passes admission, and then does nothing.
**Spot margin is [cross-collateralized](spot-margin.md).** A position takes
its margin from your one unified USDC account, so there is no separate
collateral bucket to fund. The node drops the action before the state machine
sees it. It writes no state and it does not advance a nonce.

**The admission envelope is not a confirmation.** A dropped action still returns
the ordinary [`202 Accepted`](../exchange.md#202-accepted--non-order-admission)
shape. A slow action returns the same shape. Read
[`accepted` is not `committed`](../exchange.md#accepted-is-not-committed).
Nothing appears in
[`/info` `spot_margin_state`](../info/spot.md#spot_margin_state), because
nothing happened.

**Do this instead.** Fund the position with your USDC account. Free collateral
backs the open in the same way that it backs a perpetual open. See
[`spot_margin_open`](#spot_margin_open).
:::

The tag stays on the wire so that every committed block still decodes. Do not
build on it. Both fields are still required at decode, so a malformed post
fails earlier, with `400` `INVALID_REQUEST`.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:SpotMarginDeposit`.

```json
{
  "type": "spot_margin_deposit",
  "params": { "pair": 200, "amount": "1000" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | a spot pair id | Spot pair id (`SpotPairSpec.pair_id`) |
| `amount` | decimal string | `> 0` | Quote to post, as a JSON string. Decode rejects a bare JSON number |

---

### Retired spot-margin withdrawal {#spot_margin_withdraw}

:::danger Retired, it commits nothing
`spot_margin_withdraw` is the mirror of
[`spot_margin_deposit`](#spot_margin_deposit). It is retired in the same way,
for the same reason: there is no separate collateral bucket to draw from. It
decodes and passes admission, and the node drops it before the state machine
sees it.

**Do this instead.** Your spot-margin collateral is your unified USDC account.
Withdraw from it with the ordinary paths:
[`usd_class_transfer`](./transfers.md#usd_class_transfer) to move USDC to spot,
or [`bridge_withdraw`](./transfers.md#bridge_withdraw) to leave the chain. Both
check free collateral, so an open spot-margin position keeps back what it
needs.
:::

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:SpotMarginWithdraw`.

```json
{
  "type": "spot_margin_withdraw",
  "params": { "pair": 200, "amount": "1000" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | a spot pair id | The spot pair id of the position |
| `amount` | decimal string | `> 0` | Collateral to draw, as a JSON string. Decode rejects a bare JSON number |

---
