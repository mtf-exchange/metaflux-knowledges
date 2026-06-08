# Hedge mode (two-way positions)

{% hint style="info" %}
**Upcoming.** Opt-in two-way positions. The default and current behaviour is one-way (single net position per market).
{% endhint %}

## TL;DR

By default an account holds **one net position per market** (one-way): buying while short reduces, then flips, the same position. **Hedge mode** lets an account hold a **long leg and a short leg in the same market at the same time**, tracked separately with their own entry price, margin and liquidation price.

Hedge mode is **opt-in per account** with **no balance threshold** — any account can enable it. It can only be toggled while the account is **flat on every market**.

## One-way vs hedge

| | One-way (default) | Hedge |
|---|---|---|
| Positions per market | 1 net (signed) | up to 2 (a Long leg + a Short leg) |
| "Buy while short" | reduces, then flips the net position | reduces the **Short** leg only (or opens/extends the **Long** leg — you choose) |
| Order side selection | inferred from buy/sell | **explicit** `position_side` (`long` / `short`) required |
| Margin | one net requirement | each leg margined independently |
| Liquidation | one liquidation price | each leg has its own liquidation price |
| Funding | on the net position | per leg |

## Enabling it

```json
// enable hedge mode (only legal when flat on ALL markets)
{ "type": "set_position_mode", "params": { "mode": "hedge" } }
```

```json
// back to one-way (also only when flat)
{ "type": "set_position_mode", "params": { "mode": "one_way" } }
```

The **flat-on-all-markets** precondition is a safety rule: switching while holding an open position is rejected as a no-op, so a net position can never be silently re-interpreted as a stranded leg.

## Placing orders in hedge mode

In hedge mode every order **must carry an explicit `position_side`**:

```json
{ "type": "order", "params": {
  "asset": 0, "is_buy": true, "size": "...", "limit_px": "...",
  "position_side": "long",            // open / extend the LONG leg
  "reduce_only": false
}}
```

| Intent | `is_buy` | `position_side` | `reduce_only` |
|---|---|---|---|
| Open / add to long | true | `long` | false |
| Reduce / close long | false | `long` | true |
| Open / add to short | false | `short` | false |
| Reduce / close short | true | `short` | true |

`position_side` is **explicit, never inferred** — otherwise a buy meant to *reduce a short* could mistakenly open or grow a long. A one-way account that sends `position_side` is rejected; a hedge account that omits it is rejected.

There is **no "flip"** in hedge mode. Closing the long leg never opens a short — that is a separate order against the short leg.

## Margin

Each leg is margined **independently** — the long leg and the short leg each post their own initial and maintenance margin, summed into the account requirement:

```
required_margin = init_margin(long_leg) + init_margin(short_leg)
```

This is intentionally conservative: a long+short in one market is delta-neutral in price terms, but each leg still ties up margin. (A future upgrade may offer netting credit for offsetting legs under [portfolio margin](./portfolio-margin.md); until then, hold both legs only if you want genuinely separate exposures, e.g. different entry prices you intend to manage independently.)

Each leg keeps its own [margin mode](./margin-modes.md) — you may, for example, run the long leg isolated and the short leg cross.

## Liquidation

Each leg liquidates on its **own** liquidation price through the standard [tiered liquidation](./tiered-liquidation.md) ladder. Liquidating one leg does not touch the other.

## Reporting

When hedge mode is on, the account state and `/info` position reads return **two position objects** for a market that has both legs (one `long`, one `short`). A one-way account returns a single net position, exactly as today. Market-level open interest stays a single net figure.

## See also

- [Margin modes](./margin-modes.md) — cross / isolated / strict-iso, applied per leg
- [Portfolio margin](./portfolio-margin.md) — where future leg-netting credit would live
- [Tiered liquidation](./tiered-liquidation.md) — per-leg ladders

## FAQ

**Q: Do I have to use hedge mode?**
A: No. One-way (net) is the default and behaves exactly as before; hedge mode is purely opt-in.

**Q: Is there a minimum balance to enable it?**
A: No threshold — any account can switch on hedge mode while flat.

**Q: Why can't I toggle while I have an open position?**
A: To prevent an existing net position from becoming an ambiguous, stranded leg. Close out, then switch.

**Q: Does a long + short of equal size cost double margin?**
A: In the first release, yes — legs are margined independently. Netting credit for offsetting legs is a later enhancement.
