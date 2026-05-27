# Tiered liquidation

> Status: **stable**.

MetaFlux uses a 5-tier liquidation ladder driven by a single scalar — your account's **health ratio**:

```
health = account_value / maintenance_margin
```

Each tier defines what the protocol does as your health drops. Higher tiers preserve more position; lower tiers act more aggressively.

| Tier | Health band | Action | Position touched? |
|------|-------------|--------|---|
| (safe) | `health ≥ 1.1` | Idle | — |
| **T0** | `1.0 ≤ health < 1.1` | **Yellow card**: ALO orders force-cancelled, wallet notified | No |
| **T1** | `0.8 ≤ health < 1.0` | Partial market close (50%) — full close if T1 already fired within 30 s | Yes (50%) or Yes (100%) |
| **T2** | `0.667 ≤ health < 0.8` | Full market close | Yes (100%) |
| **T3** | `health < 0.667` | Backstop: account handed to multisig treasury | Position seized |
| **T4** | shortfall after T3 | ADL: protocol claws back winners pro-rata to cover deficit | Winners' positions reduced |

`account_value` includes unrealized PnL. `maintenance_margin` is per-asset baseline (or SPAN-derived if you've opted into [portfolio margin](./portfolio-margin.md)).

## Why a yellow card

Most public derivatives chains transition straight from "healthy" to "partial close" — a sudden volatility spike that knocks your health from 1.5 to 0.95 in one tick triggers a forced sale, which depresses the mark, which sweeps more accounts into the same tier. The cascade is the dominant source of liquidation pain in observed events.

T0 is a **one-block hysteresis layer**. You enter the band; the chain freezes your resting open orders (so you can't add risk) and notifies your client, but nothing of yours is sold. You have until the next consensus block to:
- top up margin via `Deposit`,
- close part of the position manually,
- or do nothing — in which case T1 fires on the next eval.

At a 100 ms block time the grace window is short, but it's deterministic and consistently large enough for an automated risk-management process to react.

## What "ALO force-cancel" means

Add-Limit-Only (ALO) orders are limit orders that **only post** (never take). They sit on the book parking collateral. When you're already at risk of liquidation, those orders represent capital the protocol can't immediately access to defend your position.

T0 cancels them automatically. Your live IOC / GTC orders are left alone — those are still your active risk decisions and might already be working in your favor.

## T1 partial / full transition

T1 starts as a 50% partial close. There's a 30-second cooldown:

- First T1 fire: 50% close. Cooldown armed.
- If health stays in [0.8, 1.0) and the cooldown is still active: T1 escalates to **full** close instead of another partial.
- Cooldown clears 30 s after the partial fired (cooldown is not re-armed by full closes or T2).

The intent: give the partial a chance to fix the account before doing more damage. If 30 s pass and the account is still unhealthy, the partial wasn't enough — go full.

## T3 backstop

Below `health = 0.667` (≈2/3 of maintenance) the chain hands the position to the backstop. The protocol seizes the remaining position and absorbs any residual loss out of the insurance pool. The user does not get any of the maintenance margin back.

T3 firing means the account has slid past the band where market liquidation can recover the position safely — at this point the insurance pool eats the difference between mark and actual fill.

## T4 ADL

If T3 still leaves a shortfall — the position couldn't be unwound at the marked price and the insurance pool didn't fully cover — the protocol claws back from profitable counter-parties **pro-rata** to the unrealised PnL on the same instrument. ADL is intentionally a last resort and is designed to allocate the haircut as accurately as the available data permits.

The MetaFlux ADL allocation uses an online learning algorithm with the explicit objective of **minimising excess haircut** (haircut beyond what the deficit requires). The mechanics are spelled out in [ADL allocation algorithm](./adl-algorithm.md).

## Two-point margin check

Liquidation eligibility is checked at **two points** during each block:

1. **Begin-block**, after mark prices update — catches accounts that just slid into a lower tier from a price move alone.
2. **Post-action**, after each `Order` / `Cancel` / `Withdraw` from this account — catches accounts that walked themselves into a lower tier (e.g. withdrawing too much collateral).

This prevents "free" intra-block manipulation where a user adds risk between begin-block and the rest of the block.

## How to stay clear

- Watch `health` via `userState` queries (HL-compat) or the MTF-native equivalent.
- Set internal alerts at `health < 1.2` — well above T0.
- For automated strategies, register a [risk-watcher bot](../integration/risk-watcher.md) (coming) to deposit when health crosses a threshold.

## See also

- [Portfolio margin](./portfolio-margin.md) — opt-in cross-asset margin reduces baseline maintenance
- [ADL allocation algorithm](./adl-algorithm.md) — the math underneath T4 (coming)
