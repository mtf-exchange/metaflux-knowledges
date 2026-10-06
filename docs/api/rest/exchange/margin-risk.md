---
description: "Change leverage, set isolated margin, add or remove margin from a bucket, and switch between one-way and hedge position mode."
---

# Perpetual margin and risk actions {#perpetual-margin--risk-actions}

These actions set leverage and margin for perpetual positions, and fund the BOLE pool.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

The page covers the leverage, isolated-margin and portfolio-margin controls for
perpetual positions, and the BOLE liquidation backstop pool. See
[margin modes](../../../concepts/margin-modes.md) and
[portfolio margin](../../../concepts/portfolio-margin.md) for the models.

### Set leverage and margin mode {#update_leverage}

This action sets the leverage of one asset. It can also switch the asset to
isolated mode. By default the action is sender-authorized. An approved agent
can set it as an `owner` that it acts for.

```json
{
  "type": "update_leverage",
  "params": { "asset": 2, "leverage": 25, "is_isolated": true }
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Set the leverage as this account (approved agents only). It is not bound to the digest. Admission resolves it |
| `asset` | uint32 | — | Target asset |
| `leverage` | uint32 | `[1, 100]` and ≤ per-asset dynamic cap | New leverage |
| `is_isolated` | bool | — | `true` also switches the asset to isolated mode |

There is no separate margin-mode action. The `is_isolated` flag here sets
isolation.

**`asset` must name a listed perp market.** The chain refuses an id that no DEX
hosts with `MARKET_NOT_FOUND` and the message `no perp market for asset`.
Before [block 11,550,001](../../../changelog/block-11550001.md#refusals) the
chain wrote a permanent leverage row for a market that does not exist.

---

### Adjust isolated margin by a delta {#update_isolated_margin}

This action applies a signed margin delta to an isolated position. A `+` delta
adds margin and a `−` delta withdraws it. By default the action is
sender-authorized. An approved agent can adjust the margin as an `owner` that
it acts for.

```json
{
  "type": "update_isolated_margin",
  "params": { "asset": 1, "delta": "-12.5" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional. Adjust the margin as this account (approved agents only). It is not bound to the digest. Admission resolves it |
| `asset` | uint32 | Target asset |
| `delta` | decimal (string or number) | Signed margin delta. It must not be zero |

---

### Add margin to an isolated position {#top_up_isolated_only_margin}

This action adds margin to an isolated position. It only adds, so the amount is
positive. By default the action is sender-authorized. An approved agent can add
margin as an `owner` that it acts for.

:::info
**Correction: this action is not only for strict-isolated positions.** This
page said that it was. The chain has always accepted a plain isolated position
as well. The code is correct and the earlier rule was wrong. Nothing changed on
the chain.

The action requires an open isolated position on `asset`, with margin mode
isolated or strict-isolated. The chain refuses a cross position with
`PRECONDITION_FAILED` and the message `no isolated position`. On a
strict-isolated position this is the only margin action, because
[`update_isolated_margin`](#update_isolated_margin) refuses a withdrawal there.
On a plain isolated position it is the add-only half of that action.
:::

```json
{
  "type": "top_up_isolated_only_margin",
  "params": { "asset": 5, "amount": "3.0" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional. Add margin as this account (approved agents only). It is not bound to the digest. Admission resolves it |
| `asset` | uint32 | Target asset |
| `amount` | decimal (string or number) | Positive amount to add |

---

### Enroll or unenroll portfolio margin {#user_portfolio_margin}

This action enrolls the account in portfolio margin, or removes it.

```json
{
  "type": "user_portfolio_margin",
  "params": { "enroll": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enroll` | bool | `true` = enroll, `false` = unenroll |

The chain refuses enrollment in two cases:

- The account equity is less than `pm_min_equity`. This is a governance
  parameter with a default of 100 000 USDC.
- The count of enrolled accounts is at the governed cap
  `pm_max_enrolled_users` (default 512). The chain prices every enrolled
  account again in each block, so the count is a cost for each block, not only
  for each account. An account that is already enrolled is exempt. It can
  always enroll again, and it can always unenroll. An unenroll frees a slot.

The equity check runs first. An underfunded account at the cap gets the equity
refusal. See [portfolio margin](../../../concepts/portfolio-margin.md).

---

### Portfolio margin unenroll alias {#pm_unenroll}

This action is an alias for [`user_portfolio_margin`](#user_portfolio_margin)
with `enroll: false`. It has no params.

**The chain always allows it.** An unenroll checks nothing: not equity and not
the cap on enrolled accounts. An unenroll of an account that was never enrolled
does nothing and is not an error. A client can send it without first reading
the state of the account. An unenroll frees a slot under the cap.

**There is no `pm_enroll` tag, and no `PmUnenroll` signing type.** To enroll,
post [`user_portfolio_margin`](#user_portfolio_margin) with `enroll: true`. To
sign this alias, sign the canonical
`MetaFluxTransaction:UserPortfolioMargin` type with `enroll` set to `false`.
The two spellings share one digest.

```json
{ "type": "pm_unenroll", "params": {} }
```

The action takes no fields. `params` can be an empty object, or you can omit it.

---

### BOLE pool lending and borrowing {#borrow_lend}

The BOLE pool is the liquidation backstop. Any account can supply USD to it and
take that supply back. Only an approved liquidator can draw from it. That
difference is the access model: three of the four kinds are open, and one is
not.

**There is no asset field.** The pool holds one asset, so `kind` and `amount`
are the full body.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:BorrowLend`. **`kind` signs as a `uint8`, not as the
string that you post.** `Lend` `UnLend` `Borrow` `Repay` sign as `0` `1` `2`
`3`, in that order. Sign the number and post the string. See
[typed-data signing](../../../integration/typed-data-signing.md#bole-pool).

```json
{
  "type": "borrow_lend",
  "params": { "kind": "Lend", "amount": "500" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `kind` | enum string | `"Lend"`, `"UnLend"`, `"Borrow"`, `"Repay"` | Case-exact. Any other value fails decode with `unknown variant`, and the error lists the four values |
| `amount` | decimal string | `> 0` | Amount in USD, as a JSON string |

**Result and refusal of each kind**

| The call | Result |
|----------|--------|
| `"Lend"` | Supplies `amount` to the pool |
| `"UnLend"` | Takes supply back. Rejected above the amount you have lent, with `insufficient lent balance` |
| `"Borrow"` | Draws from the pool. Rejected with `AUTH_UNAUTHORIZED` unless the sender is an approved liquidator. This is the only kind with an allowlist |
| `"Repay"` | Repays a draw. Rejected above the amount you owe, with `repay exceeds outstanding borrow` |
| Any kind, `amount` at or below zero | Rejected with `amount must be positive` |
| Any kind whose arithmetic would overflow | Rejected with code `INTERNAL` and message `internal error`. The node's own reason names the overflow, and the envelope replaces it. An overflow is a server defect, not an input error, so the text never reaches you. Do not search for it. The pool never saturates, because a saturated total would silently break the identity between supply and shares |

The BOLE bound is active on this network. The chain refuses an `amount` above
`1000000000000` with `amount exceeds bole bound`. If you send figures near that
size, test one call on your target network first.

**The success message still reads `borrowLend accepted (stub)`.** The word
"stub" is out of date. The pool accounting is real and the balances move. Do
not read the message as a sign that nothing committed.

---
