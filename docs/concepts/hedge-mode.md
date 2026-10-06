# Hedge mode (two-way positions)

Hedge mode lets an account hold a long leg and a short leg in the same market. This page describes how to enable it, place orders, and read the legs.

:::info
**Active.** The opt-in toggle, explicit per-side order routing, independent
per-leg margin and dual-leg position reports are shipped. An account can switch
to hedge mode while it is flat. It routes each order to an explicit leg with
`position_side`. Each leg posts its own margin and reports as its own position
object. Per-leg liquidation is partly in place. When an account is flagged for a
forced close, the engine scans and scores both legs, and computes the
deterministic close order (larger-maintenance leg first) identically on all
validators. The per-leg close against the book is still rolling out. The default
and recommended behaviour is still one-way: one net position per market.
:::

## Summary {#tldr}

By default, an account holds one net position per market (*one-way*). A buy
while short reduces the position, then flips it. *Hedge mode* lets an account
hold a long leg and a short leg in the same market at the same time. The engine
tracks the two legs separately.

Hedge mode is opt-in per account, with no balance threshold. Any account can
enable it. The account can change the mode only while it is flat on every
market.

## One-way and hedge {#one-way-vs-hedge}

| | One-way (default) | Hedge |
|---|---|---|
| Positions per market | 1 net (signed) | up to 2 (a Long leg + a Short leg) |
| "Buy while short" | reduces, then flips the net position | reduces the Short leg only, or opens or extends the Long leg (you choose) |
| Order side selection | inferred from buy/sell | **explicit** `position_side` (`long` / `short`) required |
| Margin | one net requirement | each leg margined independently |
| Liquidation | one liquidation price | each leg scored on its own maintenance; deterministic close ordering in place, per-leg close emission rolling out |
| Reporting | one net position object | one object per non-zero leg (each labelled `position_side`) |

The toggle, per-side routing, independent per-leg margin and dual-leg reports
are active. Per-leg liquidation selection is in place. The per-leg close is still
rolling out. See the status note above.

## Enabling hedge mode {#enabling-it}

The position mode changes with a signed action. The action is valid only when
the account is flat on every market.

```json
// enable hedge mode (only legal when flat on ALL markets)
{ "type": "set_position_mode", "params": { "hedge": true } }
```

```json
// back to one-way (also only when flat)
{ "type": "set_position_mode", "params": { "hedge": false } }
```

`hedge` is a boolean: `true` is hedge (two-way), `false` is one-way (the
default). The flat-on-all-markets precondition is a safety rule. The node
rejects a switch while the account holds any open position. The rejection is a
clean no-op that changes nothing. A net position thus never becomes a stranded
leg without notice. A request for the mode that the account already has, while
flat, is a no-op success.

[`set_position_mode`](../api/rest/exchange/account.md#set_position_mode) in the
`/exchange` reference gives the request and response detail.

## Placing orders in hedge mode {#placing-orders-in-hedge-mode}

In hedge mode, every order must have an explicit `position_side` (`long` /
`short`). A one-way account must not send `position_side`. A hedge account must
send it. The field is on the `submit_order` order body, next to `side`,
`reduce_only` and the other fields.

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

`position_side` is explicit and never inferred. If it were inferred, a buy meant
to reduce a short could open or grow a long by mistake. The engine evaluates
`reduce_only` against the named leg only. A `reduce_only` order on the `short`
leg can never change the `long` leg.

Hedge mode has no flip. A close of the long leg never opens a short. That is a
separate order against the short leg.

## Margin {#margin}

Each leg has independent margin. The long leg and the short leg each post their
own initial and maintenance margin. The account requirement is the sum:

```
required_margin = initial_margin(long_leg) + initial_margin(short_leg)
```

This is deliberately conservative. A long plus a short in one market is
delta-neutral in price, but each leg still uses margin. A future upgrade may
give a netting credit for offsetting legs under
[portfolio margin](./portfolio-margin.md). Until then, hold both legs only if
you want separate exposures, for example different entry prices that you manage
independently.

Each leg keeps its own [margin mode](./margin-modes.md). For example, the long
leg can be isolated and the short leg cross.

## Liquidation {#liquidation}

When an account is flagged for a forced close, the engine scans both legs and
scores each one by its own maintenance contribution. It then computes the
deterministic close order through the standard
[tiered liquidation](./tiered-liquidation.md) ladder. The leg with the larger
maintenance goes first. On a tie, long goes before short. The order is identical
on all validators. The per-leg close against the book is still rolling out. When
it is active, the liquidation of one leg will not change the other.

## Reporting {#reporting}

When hedge mode is on, the `/info` position reads return one position object per
non-zero leg for a market with both legs. Each object has its `side` (`"long"` /
`"short"`). A one-way account returns a single net position with no `side`
field. Market-level open interest stays one net figure. Position rows are on
[`clearinghouse_state`](../api/rest/info/account.md#clearinghouse_state).
`position_mode` itself stays on
[`account_state`](../api/rest/info/account.md#account_state).

## See also {#see-also}

- [Margin modes](./margin-modes.md): cross, isolated and strict-iso, applied per leg.
- [Portfolio margin](./portfolio-margin.md): where a future leg-netting credit would be.
- [Tiered liquidation](./tiered-liquidation.md): per-leg ladders.
- [`/exchange` reference](../api/rest/exchange/account.md#set_position_mode): the wire format of the action.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Do I have to use hedge mode?**
A: No. One-way (net) is the default and behaves as before. Hedge mode is opt-in
only.

**Q: Is there a minimum balance to enable it?**
A: No. Any account can switch on hedge mode while it is flat.

**Q: Why can't I change the mode while I have an open position?**
A: The rule stops an existing net position from becoming an ambiguous, stranded
leg. Close the position, then switch.

**Q: Does a long and a short of equal size cost double margin?**
A: Yes. Each leg has independent margin, so an offsetting long and short use the
margin of both legs. A netting credit for offsetting legs is a later enhancement,
under [portfolio margin](./portfolio-margin.md).

</details>
