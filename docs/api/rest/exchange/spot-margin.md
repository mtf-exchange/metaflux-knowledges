---
description: "Open and close a leveraged spot position, and supply or redeem the Earn lending pool that funds it."
---

# Spot margin & Earn actions {#spot-margin--earn-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

Leveraged [spot margin](../../../products/spot-margin.md) and its
[Earn](../../../concepts/earn.md) lending supply side. **Live on testnet.** All actions here are
sender-authorized and return the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope.

**Earn pays no yield yet.** A pool auto-creates with a borrow rate of **zero**, and only a
governance vote can set a nonzero rate. Share value moves only while a pool carries a nonzero rate
AND has an outstanding loan, so today a deposit earns exactly 0. Principal stays redeemable up to
the pool's idle liquidity.



### Open a leveraged spot position {#spot_margin_open}

:::info
**Live on testnet.** The position is [cross-collateralized](spot-margin.md) against your unified USDC account, including live forced liquidation (see [Liquidation](../../../products/spot-margin.md#liquidation)). **A pair enables only once governance calibrates its per-pair risk parameters, and no pair is calibrated yet** — until then this action rejects with `spot margin not enabled for pair`.
:::

Open a leveraged long: borrow `borrow` quote from the pair's Earn pool and **IOC-buy** `size` base at up to `limit_px`. The buy is funded 100% by the borrow; the position's margin requirement is **held against your account-wide free collateral** — the same unified USDC account that backs your perpetual positions — so there is **no separate collateral to post first** (leverage ≈ notional / free collateral). The bought base is held **segregated** on the margin account — it is not credited to your spendable balances. Any **unspent borrow is repaid instantly** after the IOC settles, so the outstanding loan equals only what the buy actually spent. A zero-fill IOC is an accepted no-op (full refund, nothing borrowed). v1 allows **one open position per `(account, pair)`** — no add-on. Sender-authorized; body under `action.params`.

```json
{
  "type": "spot_margin_open",
  "params": { "pair": 200, "size": 200, "limit_px": 200000000, "borrow": "400" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | an active spot pair with margin enabled | Spot pair id (`SpotPairSpec.pair_id`) |
| `size` | uint64 | `> 0` | Buy size in base raw lots (`10^sz_decimals` per whole unit); widened to `u128` |
| `limit_px` | uint64 | `> 0` | Limit price in the `1e8` plane |
| `borrow` | decimal string | `> 0` | Quote principal to draw from the Earn pool (whole units), as a JSON string |

**Initial-margin gate.** The open is gated up front on the **worst-case cost** (`limit_px × size`): the open is rejected unless `free collateral ≥ init_ratio × worst_cost`, where free collateral is your account-wide free collateral (the same figure a perpetual open draws on) and `init_ratio` is the pair's calibrated initial-margin parameter. The held requirement then reduces your free collateral while the position is open. Because the gate uses the worst case, a passing open never needs to unwind — the realized spend can only be lower (maker prices `≤ limit_px`, clamped size). The gate reads the **raw signed** free collateral; the account read publishes the same budget clamped, as [`withdrawable`](../info/account.md#account_state) `= max(0, free collateral)`.

**Gating.** Rejected if the account is a split `standard` account (`spot margin is not available in standard mode`, see [the standard-mode split](../../../concepts/usdc.md#standard-split)), if margin is not enabled for the pair, if a position is already open on the pair, if your free collateral is below the initial-margin requirement, if the Earn pool's idle liquidity is below `borrow`, if spot trading is halted, or on a zero `size` / non-positive `borrow`.

**Response.** Returns the [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope (not a synchronous `oid` — the inner IOC's fill is a committed effect). Observe the resulting `borrowed` / `base_held` via [`/info` `spot_margin_state`](../info/spot.md#spot_margin_state); the Earn pool's `total_borrowed` moves on [`earn_state`](../info/spot.md#earn_state). See [spot margin](../../../products/spot-margin.md).

---

### Close a leveraged spot position {#spot_margin_close}

:::info
**Live on testnet.** See the [Spot margin & Earn](spot-margin.md) overview for the cross-collateralized model.
:::

Close the position: **IOC-sell** the held base at no less than `limit_px`, repay the accrued debt (principal + interest) to the Earn pool, and return the remainder to your unified USDC account. On a **full unwind** the sale proceeds repay the debt, any leftover credits your account, the held margin requirement is released, and the position closes. A **partial fill keeps the position open**: unsold base goes back into the segregated holding, only the realized proceeds repay, and the outstanding principal drops accordingly. v1 is full-close intent only (no `size` argument — the whole holding is offered). Sender-authorized; body under `action.params`.

```json
{
  "type": "spot_margin_close",
  "params": { "pair": 200, "limit_px": 200000000 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `pair` | uint32 | an active spot pair | Spot pair id the position is on |
| `limit_px` | uint64 | `> 0` | Floor price for the close sell, in the `1e8` plane |

**Settlement.** Interest accrues `O(1)` off the pool's borrow index since the open. On a close where the sale proceeds cannot cover the debt, your **account collateral covers the shortfall first**; only a residual the account cannot cover leaves the pool's borrowed book and is **socialized to suppliers** (the pool's supplied total is reduced, floored at zero). This `spot_margin_close` action is always a **voluntary** user-submitted close; a forced liquidation runs automatically through this same settlement path when the **account** falls through the maintenance floor (see [Liquidation](../../../products/spot-margin.md#liquidation)) — it is not something the user submits.

**Gating.** Rejected if there is no open position (nothing held), or if the position carries debt but the pair's Earn pool is missing.

**Response.** Returns the [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope. Confirm full vs partial close and the repaid amount via [`/info` `spot_margin_state`](../info/spot.md#spot_margin_state) (a pruned account no longer appears); supplier-side effects show on [`earn_state`](../info/spot.md#earn_state).

---

### Supply quote into the Earn pool {#earn_deposit}

:::info
**Live on testnet.** Yield is zero until governance votes a nonzero borrow rate — see the [Spot margin & Earn](spot-margin.md) overview.
:::

Supply quote into a lending pool and receive **pool shares** priced off the pool's net asset value. The first supplier into a pool mints shares **1:1**; later deposits price off NAV, so once borrower interest has lifted the pool a same-size deposit mints proportionally **fewer** shares. The pool **auto-creates on first deposit** for any asset that is the quote of a registered spot pair. Sender-authorized; body under `action.params`. `asset` is the **lendable quote asset id** (the pool key), not a pair id.

```json
{
  "type": "earn_deposit",
  "params": { "asset": 100, "amount": "5000" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a registered spot pair's quote asset (or an existing pool) | Lendable asset id — the pool key |
| `amount` | decimal string | `> 0` | Quote to supply (whole units), as a JSON string |

**Gating.** Rejected on a non-positive `amount`, on a spendable balance below `amount`, or if `asset` is not lendable (not any pair's quote and has no existing pool). A deposit so small it would mint zero shares is rejected.

**Response.** Returns the [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope. Confirm minted shares / your stake via [`/info` `earn_state`](../info/spot.md#earn_state) (pass `user` to include your `user_shares` / `user_value`). See [Earn](../../../concepts/earn.md).

---

### Redeem Earn pool shares {#earn_withdraw}

:::info
**Live on testnet.** Yield is zero until governance votes a nonzero borrow rate — see the [Spot margin & Earn](spot-margin.md) overview.
:::

Redeem pool shares back to quote, paid to your spendable balance. The payout is **clamped to the pool's idle liquidity** (`total_supplied − total_borrowed`): a redemption larger than idle pays exactly idle and burns proportionally fewer shares, so a supplier can always exit up to what is not lent out and never strands the borrow ledger. There is **no claim step** — yield compounds into share value as borrower interest lifts NAV, and you realize it on withdrawal. **With no borrow rate voted, NAV does not move and the payout equals the deposit.** Sender-authorized; body under `action.params`.

```json
{
  "type": "earn_withdraw",
  "params": { "asset": 100, "shares": "1234.5" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `asset` | uint32 | a pool you hold shares in | Lendable asset id — the pool key |
| `shares` | decimal string | `> 0`, `≤` shares you own | Pool shares to redeem, as a JSON string |

**Gating.** Rejected if the pool does not exist, on a non-positive `shares`, if `shares` exceeds what you own, if the pool is insolvent (zero NAV with shares outstanding), or if the pool has **zero idle liquidity** (everything is currently lent out — wait for borrowers to repay). A redemption that quantizes to zero is rejected.

**Response.** Returns the [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope; the burned-share count may be **less than requested** when the payout was idle-clamped. Confirm the remaining stake and pool totals via [`/info` `earn_state`](../info/spot.md#earn_state). See [Earn](../../../concepts/earn.md).

---

### Retired: post separate spot-margin collateral {#spot_margin_deposit}

:::danger Retired — it commits nothing
`spot_margin_deposit` decodes and admits, and then does nothing at all.
**Spot margin is [cross-collateralized](spot-margin.md)**: a position
draws its margin from your one unified USDC account, so there is no separate
collateral bucket to fund. The node drops the action before the state machine
sees it. It writes no state and it advances no nonce.

**The admission envelope is not a confirmation.** A dropped action still returns
the ordinary [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) shape, the same
shape an action that is only slow returns — read
[`accepted` is not `committed`](../exchange.md#accepted-is-not-committed). Nothing appears in
[`/info` `spot_margin_state`](../info/spot.md#spot_margin_state), because nothing
happened.

**Do this instead.** Fund the position with your USDC account. Free collateral
backs the open exactly as it backs a perpetual open. See
[`spot_margin_open`](#spot_margin_open).
:::

The tag stays on the wire so that every committed block still decodes. It is not
a lane to build on. Both fields are still required at decode, so a malformed post
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
| `amount` | decimal string | `> 0` | Quote to post, as a JSON string. A bare JSON number is rejected at decode |

---

### Retired: withdraw separate spot-margin collateral {#spot_margin_withdraw}

:::danger Retired — it commits nothing
`spot_margin_withdraw` is the mirror of
[`spot_margin_deposit`](#spot_margin_deposit), and it is retired the same way,
for the same reason: there is no separate collateral bucket to draw from. It
decodes, admits, and is dropped before the state machine sees it.

**Do this instead.** Your spot-margin collateral IS your unified USDC account.
Withdraw from it with the ordinary paths —
[`usd_class_transfer`](./transfers.md#usd_class_transfer) to move USDC to spot, or
[`bridge_withdraw`](./transfers.md#bridge_withdraw) to leave the chain. Both are gated on free
collateral, so an open spot-margin position holds back what it needs.
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
| `pair` | uint32 | a spot pair id | Spot pair id the position is on |
| `amount` | decimal string | `> 0` | Collateral to draw, as a JSON string. A bare JSON number is rejected at decode |

---
