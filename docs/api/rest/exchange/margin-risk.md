---
description: "Change leverage, toggle isolated margin, add or remove margin from a bucket, and switch between one-way and hedge position mode."
---

# Perpetual margin & risk actions {#perpetual-margin--risk-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

Leverage, isolated-margin and portfolio-margin controls for **perpetual**
positions, plus the BOLE liquidation backstop pool. See
[margin modes](../../../concepts/margin-modes.md) and
[portfolio margin](../../../concepts/portfolio-margin.md) for the models.

### Set leverage and margin mode {#update_leverage}

Set per-asset leverage and, optionally, flip the asset to isolated mode.
**Sender-authorized by default**; an approved agent may set it **as** an `owner`
it acts for.

```json
{
  "type": "update_leverage",
  "params": { "asset": 2, "leverage": 25, "is_isolated": true }
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional: set **as** this account (approved agents only). **Not** digest-bound — resolved at admission |
| `asset` | uint32 | — | Target asset |
| `leverage` | uint32 | `[1, 100]` and ≤ per-asset dynamic cap | New leverage |
| `is_isolated` | bool | — | `true` also flips the asset to isolated mode |

There is no separate margin-mode action: isolation is the `is_isolated` flag here.

---

### Adjust isolated margin by a delta {#update_isolated_margin}

Apply a signed margin delta to an isolated position (`+` adds, `−` withdraws).
**Sender-authorized by default**; an approved agent may adjust it **as** an
`owner` it acts for.

```json
{
  "type": "update_isolated_margin",
  "params": { "asset": 1, "delta": "-12.5" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: adjust **as** this account (approved agents only). **Not** digest-bound — resolved at admission |
| `asset` | uint32 | Target asset |
| `delta` | decimal (string or number) | Signed margin delta; non-zero |

---

### Add margin to a strict-isolated position {#top_up_isolated_only_margin}

Add margin to a strict-isolated position. Top-up direction only (positive amount).
**Sender-authorized by default**; an approved agent may add margin **as** an `owner`
it acts for.

```json
{
  "type": "top_up_isolated_only_margin",
  "params": { "asset": 5, "amount": "3.0" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | hex address \| omitted | Optional: add margin **as** this account (approved agents only). **Not** digest-bound — resolved at admission |
| `asset` | uint32 | Target asset |
| `amount` | decimal (string or number) | Positive amount to add |

---

### Enroll or unenroll portfolio margin {#user_portfolio_margin}

Enroll or unenroll the account in portfolio margin.

```json
{
  "type": "user_portfolio_margin",
  "params": { "enroll": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enroll` | bool | `true` = enroll, `false` = unenroll |

Enrollment is refused in two cases:

- Account equity is below `pm_min_equity` (governance parameter, default
  100 000 USDC).
- The enrolled-account count is at the governed cap `pm_max_enrolled_users`
  (default 512). The chain re-prices EVERY enrolled account each block, so the
  count is a per-block cost, not just a per-account one. An account that is
  already enrolled is exempt: it can always re-enroll, and it can always
  unenroll. Unenrollment frees a slot.

The equity check runs first, so an underfunded account at the cap reads the
equity refusal. See [portfolio margin](../../../concepts/portfolio-margin.md).

---

### Unenroll from portfolio margin — alias {#pm_unenroll}

An alias for [`user_portfolio_margin`](#user_portfolio_margin) with
`enroll: false`. It carries **no params**.

**It is always allowed.** Unlike enrollment, unenrolling checks nothing: not
equity, not the enrolled-account cap. Unenrolling an account that was never
enrolled is a no-op, not an error, so a client may send it without first reading
the account's state. Unenrolling frees a slot under the cap.

**There is no `pm_enroll` tag, and no `PmUnenroll` signing type.** To enroll,
post [`user_portfolio_margin`](#user_portfolio_margin) with `enroll: true`. To
sign this alias, sign the canonical
`MetaFluxTransaction:UserPortfolioMargin` type with `enroll` set to `false` — the
two spellings share one digest.

```json
{ "type": "pm_unenroll", "params": {} }
```

The action takes no fields. `params` may be an empty object or omitted.

---

### Lend to, or draw from, the BOLE pool {#borrow_lend}

The BOLE pool is the **liquidation backstop**. Any account may supply USD to it
and take that supply back. Only an **approved liquidator** may draw from it. That
asymmetry is the access model: three of the four kinds are open, and
one is not.

**There is no asset field.** The pool holds one asset, so `kind` and `amount` are
the entire body.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:BorrowLend`. **`kind` signs as a `uint8`, not as the string
you post**: `Lend` `UnLend` `Borrow` `Repay` sign as `0` `1` `2` `3`, in that
order. Sign the number, post the string — see
[typed-data signing](../../../integration/typed-data-signing.md#bole-pool).

```json
{
  "type": "borrow_lend",
  "params": { "kind": "Lend", "amount": "500" }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `kind` | enum string | `"Lend"`, `"UnLend"`, `"Borrow"`, `"Repay"` | Case-exact. Any other value fails decode with `unknown variant`, and the error lists the four |
| `amount` | decimal string | `> 0` | Amount in USD, as a JSON string |

**What each kind does, and what it refuses.**

| The call | Result |
|----------|--------|
| `"Lend"` | Supplies `amount` to the pool |
| `"UnLend"` | Takes supply back. **Rejected** above what you have lent — `insufficient lent balance` |
| `"Borrow"` | Draws from the pool. **Rejected**, `AUTH_UNAUTHORIZED`, unless the sender is an approved liquidator. This is the only kind with an allowlist |
| `"Repay"` | Repays a draw. **Rejected** above what you owe — `repay exceeds outstanding borrow` |
| Any kind, `amount` at or below zero | **Rejected** — `amount must be positive` |
| Any kind whose arithmetic would overflow | **Rejected** — code `INTERNAL`, message `internal error`. The node's own reason names the overflow, and the envelope replaces it: an overflow is our defect, not your input, so the text never reaches you. Do not grep for it. The pool never saturates, because a saturated total would silently break the supplied-versus-shares identity |

The BOLE bound is active on this network. An `amount` above `1000000000000` is
refused with `amount exceeds bole bound`. Probe one call on your target network
if you send figures near that size.

**The success message still reads `borrowLend accepted (stub)`.** The word is
stale: the pool accounting is real and the balances move. Do not treat the
message as a sign that nothing committed.

---
