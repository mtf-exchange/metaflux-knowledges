---
description: The live spot CLOB — token-for-token swaps with reserved-balance escrow, no leverage.
---

# Spot trading

:::tip
**Live.** Plain spot trading is shipped — a token-for-token order book, separate
from perps, with no leverage and no positions. (Leveraged spot is the separate,
planned [spot-margin](./spot-margin.md) track.)
:::

:::info
**Non-leveraged spot only is Sharia-compliant.** Among the products on MetaFlux,
only **non-leveraged** spot trading — buying and selling assets outright at full
value, with **no leverage, no margin, no borrowing, and no funding** — is
generally regarded as compatible with Islamic (Sharia) finance principles. Do not
read "spot" in general as compliant: only the non-leveraged form is. The
non-compliant products explicitly include **spot margin (leveraged spot
trading)** as well as perpetual futures and every other leveraged, derivative, or
borrowed product. The leverage and borrowing introduce interest (riba), and the
resulting speculation and uncertainty introduce gharar and maysir — so these are
generally NOT Sharia-compliant. Muslim users should trade accordingly and consult
their own scholars. This is informational, not religious or financial advice.
:::

## TL;DR

Spot is a **token-for-token central limit order book**: you swap one token for
another at a price you choose. It is entirely separate from perps — separate
books, separate balances, **no leverage and no positions**. You trade only what
you own. A resting spot order locks the funds it would owe on fill into a
**reserved balance** (escrow); those funds are paid to the counterparty on fill,
or refunded to you on cancel.

A spot order is just another [`/exchange`](../api/rest/exchange.md) action —
[`spot_order`](../api/rest/exchange.md#spot_order) to place,
[`spot_cancel`](../api/rest/exchange.md#spot_cancel) to cancel. Both are
**sender-authorized** (the recovered signer is the trader; there is no `owner`
field) and can be signed by the master account or an active
[agent wallet](./agent-wallets.md).

## What a spot pair is

A spot pair trades a **base** token against a **quote** token (e.g. `B/Q`). The
order side picks the direction:

| `side` | You give | You receive | Escrow locked while resting |
|--------|----------|-------------|------------------------------|
| `bid` (buy) | quote | base | **quote** — notional at your limit price |
| `ask` (sell) | base | quote | **base** — the base you are offering |

The order field is the **spot pair id** (`pair`), which is distinct from a perp
`market` id and from a token id. Pairs are deployed under
[MIP-1](../mip/mip-1.md) (spot token standard + market deploy); each carries its
own base/quote tokens, size decimals, optional minimum notional, and fee
overrides.

## Reserved-balance escrow

This is the core of how spot stays solvent without leverage. When a `gtc` / `alo`
order (or the un-crossed residual of one) **rests** on the book, the protocol
moves the funds it would owe on a full fill out of your spendable balance into a
**reserved balance**:

- A resting **bid** reserves **quote** equal to its notional at the limit price
  (`size × limit_px`).
- A resting **ask** reserves the **base** it offers.

Reserved funds are not spendable. They are:

- **paid to the counterparty** when the order fills,
- **refunded to your spendable balance** on [cancel](#lifecycle--cancel-refunds-escrow),
  on self-trade-prevention, or if the market is deactivated.

Per-token balances are conserved exactly across every rest, fill, cancel, and
STP event — spendable plus reserved is invariant per token per account (it is
fuzz-verified across randomized rest/cross/cancel streams).

## Affordability clamping

You can never rest or fill more than you can fund. At admission the order size is
**clamped** to what your balance covers:

- a **bid** is clamped by `quote_balance ÷ limit_px`,
- an **ask** is clamped by the base you actually own.

An order that is entirely unaffordable is an **accepted no-op** — nothing fills,
nothing rests, no order id is burned. A partially-affordable order trades/rests
the affordable portion. Because the clamp runs **before** matching, every
resulting fill and every escrow reservation is funded; there is no post-match
fill drop.

## Matching, fills, and fees

Spot matching is the same price-time CLOB the rest of MetaFlux uses. A fill swaps
base for quote at the **maker's resting price**.

Fees are charged **from the leg each side receives**:

- the **taker** fee is taken from the leg the taker receives,
- the **maker** fee is taken from the leg the maker receives.

So a buyer (receiving base) pays its fee in base; a seller (receiving quote) pays
its fee in quote. Fees accrue to a dedicated spot fee account, separate from the
perp fee pool. A pair may set its own `taker_fee_bps` / `maker_fee_bps`; when a
pair leaves them unset, the global spot default applies. See [fees](./fees.md#spot-fees)
for the schedule.

## Time-in-force

Spot orders carry the same TIF set as perps, with one spot-specific rule:

| `tif` | Behavior on spot |
|-------|------------------|
| `gtc` | Crosses what it can; any residual **rests** (escrow-backed) until filled or cancelled |
| `alo` | Add-liquidity-only; a crossing `alo` is **rejected** (never takes). A non-crossing `alo` rests |
| `ioc` | Crosses what it can immediately; the residual is discarded — **never rests**, never escrows |

`aon` is rejected (no core equivalent). Self-trade prevention uses the same
[`stp_mode`](./order-types.md) set as perps (`cancel_oldest` / `cancel_newest` /
`cancel_both`); `reject` is not supported.

:::info
**Limit only (for now).** Every spot order must carry a positive `limit_px`. A
market order (`limit_px = 0`) is **not yet supported** — an unbounded market buy
needs a book-walk affordability clamp that is still on the roadmap. Send a limit;
the cost is then bounded by `limit_px × size`.
:::

## Lifecycle — cancel refunds escrow

[`spot_cancel`](../api/rest/exchange.md#spot_cancel) retires one of **your**
resting orders by `oid` on a pair and refunds the escrow it locked back to your
spendable balance.

- **Owner-only.** Only the order's owner may cancel it; a third party is rejected
  (`not the order owner`).
- **Typed miss.** An unknown or already-gone `oid` returns `order not found`
  (harmless).
- **Always available.** Cancels are **not** gated by the spot halt — even when
  new orders are disabled, you can always exit a resting order and reclaim its
  escrow.

## Limits and governance

- **Resting-order cap.** Each account may rest up to **1000** orders per spot
  pair; a new resting order past the cap is rejected (`spot resting-order cap
  reached — cancel some orders first`). Recognized market-maker accounts are
  exempt. `ioc` orders never rest, so they are never subject to the cap.
- **Minimum notional.** A pair may set a minimum notional; an order below it is
  rejected.
- **Spot halt (governance).** Spot trading can be globally enabled or disabled by
  governance. When disabled, **new** orders are rejected (`spot trading
  disabled`), but cancels still work so resting escrow is never trapped.

## Reading spot state

Spot balances and open spot orders are queryable via
[`POST /info`](../api/rest/info.md). A `spot_order` returns a **synchronous**
per-order status once it commits — the real assigned `oid` with a `resting` or
`filled` entry (or `error`), or `pending` if no commit lands within the
order-wait window — the same status union as the perp
[`submit_order`](../api/rest/exchange.md#submit_order).

## Relationship to spot-margin and Earn

Plain spot is the **baseline**: trade only what you own, no leverage, no
liquidation. Two planned overlays build on it:

- [**Spot margin**](./spot-margin.md) (planned) — borrow quote against collateral
  to buy spot with leverage, with a maintenance margin and a liquidation price.
- [**Earn**](./earn.md) (planned) — a USDC lending pool that funds spot-margin
  borrows and earns the borrow interest as yield.

Both are **opt-in overlays**; plain spot is unaffected by them.

## See also

- [`spot_order`](../api/rest/exchange.md#spot_order) / [`spot_cancel`](../api/rest/exchange.md#spot_cancel) — the wire actions and field tables
- [Order types](./order-types.md) — TIF and STP semantics shared with perps
- [Fees](./fees.md#spot-fees) — the spot fee schedule and received-leg charging
- [Spot margin](./spot-margin.md) — the planned leveraged spot track
- [MIP-1](../mip/mip-1.md) — spot token standard and market deploy

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Do I need collateral or margin to trade spot?**
A: No. Spot is balance-only — you trade what you own. There is no margin, no
leverage, and no liquidation. (Leverage is the separate, planned
[spot-margin](./spot-margin.md) track.)

**Q: What happens to my funds when my order is resting?**
A: They are held in a reserved balance (escrow) — not spendable, but yours. They
pay the counterparty on fill, or come back to your spendable balance on cancel.

**Q: Why did my large buy only partially fill / rest?**
A: Affordability clamping. The order size is reduced to what your quote balance
funds at the limit price. An entirely unaffordable order is an accepted no-op.

**Q: Can I place a spot market order?**
A: Not yet — always send a positive `limit_px`. Market spot orders are on the
roadmap.

**Q: Are spot fills and perp fills on the same book?**
A: No. Spot has its own books, balances, and fee account, entirely separate from
perps.

</details>
