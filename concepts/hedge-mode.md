# Hedge mode (two-way positions)

{% hint style="info" %}
**Live.** The opt-in toggle, explicit per-side order routing, **independent
per-leg margin**, and **dual-leg position reporting** are shipped: an account can
switch to hedge mode (while flat), route each order to an explicit leg via
`position_side`, and each leg posts its own margin and reports as its own position
object. **Per-leg liquidation** is partly in place: when an account is flagged for
a forced close, both legs are scanned and scored, and the deterministic close
ordering (larger-maintenance leg first) is computed identically across validators
— the actual per-leg close emission against the book is still rolling out. The
default and recommended behaviour remains one-way (single net position per market).
{% endhint %}

## TL;DR

By default an account holds **one net position per market** (one-way): buying
while short reduces, then flips, the same position. **Hedge mode** lets an
account hold a **long leg and a short leg in the same market at the same time**,
tracked separately.

Hedge mode is **opt-in per account** with **no balance threshold** — any account
can enable it. It can only be toggled while the account is **flat on every
market**.

## One-way vs hedge

| | One-way (default) | Hedge |
|---|---|---|
| Positions per market | 1 net (signed) | up to 2 (a Long leg + a Short leg) |
| "Buy while short" | reduces, then flips the net position | reduces the **Short** leg only (or opens/extends the **Long** leg — you choose) |
| Order side selection | inferred from buy/sell | **explicit** `position_side` (`long` / `short`) required |
| Margin | one net requirement | each leg margined independently |
| Liquidation | one liquidation price | each leg scored on its own maintenance; deterministic close ordering in place, per-leg close emission rolling out |
| Reporting | one net position object | one object per non-zero leg (each labelled `position_side`) |

The toggle, per-side routing, independent per-leg margin, and dual-leg reporting
are live; per-leg liquidation selection is in place, with per-leg close emission
still rolling out (see the status note above).

## Enabling it

Switching the position mode is a signed action; it is only legal when the
account is **flat on every market**.

```json
// enable hedge mode (only legal when flat on ALL markets)
{ "type": "set_position_mode", "params": { "hedge": true } }
```

```json
// back to one-way (also only when flat)
{ "type": "set_position_mode", "params": { "hedge": false } }
```

`hedge` is a boolean: `true` = hedge (two-way), `false` = one-way (the default).
The **flat-on-all-markets** precondition is a safety rule — switching while
holding any open position is rejected (a clean no-op that mutates nothing), so a
net position can never be silently re-interpreted as a stranded leg. Setting the
mode to the value it already has, while flat, is a no-op success.

See [`set_position_mode`](../api/rest/exchange.md#set_position_mode) in the
`/exchange` reference for the request/response detail.

## Placing orders in hedge mode

In hedge mode every order **must carry an explicit `position_side`** (`long` /
`short`). A one-way account must **not** send `position_side`; a hedge account
must. The field is on the `submit_order` order body alongside `side`,
`reduce_only`, etc.

```json
{
  "type": "submit_order",
  "order": {
    "owner": "0x...aa", "market": 0, "side": "bid",
    "kind": "limit", "size": 100000000, "limit_px": 5000000000,
    "tif": "gtc", "stp_mode": "cancel_oldest",
    "reduce_only": false,
    "position_side": "long"
  }
}
```

| Intent | `side` | `position_side` | `reduce_only` |
|---|---|---|---|
| Open / add to long | `bid` | `long` | false |
| Reduce / close long | `ask` | `long` | true |
| Open / add to short | `ask` | `short` | false |
| Reduce / close short | `bid` | `short` | true |

`position_side` is **explicit, never inferred** — otherwise a buy meant to
*reduce a short* could mistakenly open or grow a long. `reduce_only` is
evaluated **against the named leg only**: a `reduce_only` order on the `short`
leg can never touch the `long` leg.

There is **no "flip"** in hedge mode. Closing the long leg never opens a short —
that is a separate order against the short leg.

## Margin

Each leg is margined **independently** — the long leg and the short leg each
post their own initial and maintenance margin, summed into the account
requirement:

```
required_margin = init_margin(long_leg) + init_margin(short_leg)
```

This is intentionally conservative: a long+short in one market is delta-neutral
in price terms, but each leg still ties up margin. (A future upgrade may offer
netting credit for offsetting legs under [portfolio margin](./portfolio-margin.md);
until then, hold both legs only if you want genuinely separate exposures, e.g.
different entry prices you intend to manage independently.)

Each leg keeps its own [margin mode](./margin-modes.md) — you may, for example,
run the long leg isolated and the short leg cross.

## Liquidation

When an account is flagged for a forced close, both legs are scanned and scored by
their own maintenance contribution, and the deterministic close ordering — the
**larger-maintenance leg first** (ties: long before short), identical across
validators — is computed through the standard [tiered liquidation](./tiered-liquidation.md)
ladder. The actual per-leg close emission against the book is still rolling out;
when it lands, liquidating one leg will not touch the other.

## Reporting

When hedge mode is on, the account state and `/info` position reads return **one
position object per non-zero leg** for a market that has both legs, each labelled
with its `position_side` (`"long"` / `"short"`). A one-way account returns a
single *net* position with **no** `position_side` field, exactly as today.
Market-level open interest stays a single net figure. See
[`account_state` positions](../api/rest/info.md#account_state).

## See also

- [Margin modes](./margin-modes.md) — cross / isolated / strict-iso, applied per leg
- [Portfolio margin](./portfolio-margin.md) — where future leg-netting credit would live
- [Tiered liquidation](./tiered-liquidation.md) — per-leg ladders
- [`/exchange` reference](../api/rest/exchange.md#set_position_mode) — the action wire format

## FAQ

**Q: Do I have to use hedge mode?**
A: No. One-way (net) is the default and behaves exactly as before; hedge mode is
purely opt-in.

**Q: Is there a minimum balance to enable it?**
A: No threshold — any account can switch on hedge mode while flat.

**Q: Why can't I toggle while I have an open position?**
A: To prevent an existing net position from becoming an ambiguous, stranded leg.
Close out, then switch.

**Q: Does a long + short of equal size cost double margin?**
A: Yes — legs are margined independently, so an offsetting long+short ties up
both legs' margin. Netting credit for offsetting legs is a later enhancement
(under [portfolio margin](./portfolio-margin.md)).
