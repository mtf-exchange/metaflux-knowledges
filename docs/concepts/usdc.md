---
description: Where a trader's USDC lives on MetaFlux — one unified balance, four identities (perp collateral, spot token 100, the EVM FiatToken, external chains), and the precision of each surface.
---

# USDC

:::tip
**Stable.** USDC is **one balance** on MetaFlux. The perp collateral account and
the spendable spot-USDC balance are the same number.
:::

## TL;DR {#tldr}

- One pool. A perp order, a spot buy, an Earn deposit and a withdrawal all spend
  the **same** USDC, gated on the **same** free collateral.
- The concept still carries **several ids**: `asset: 0` on bridge and withdraw
  surfaces, `asset: 100` on spot market and balance surfaces, an ERC-20 on the
  EVM, and a separate contract on every external chain.
- Two number planes. `/info` and most `/exchange` fields are **whole-USDC decimal
  strings**. [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) and the EVM
  token are **6-decimal integers**. Mixing them is an error of 10⁶.
- [`usd_class_transfer`](#moving-usdc) is **rejected**. There is no second pool
  to move to.

## The four identities {#four-identities}

One concept, four addressing schemes. This is the table to read before you write
any code that names USDC.

| Surface | How USDC is addressed | Number plane |
|---------|----------------------|--------------|
| **Perp collateral** (the pool) | Not a ledger row. It is the account's own balance, read as `account_value` / `withdrawable`. Bridge deposits, [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) and [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer) address it as **`asset: 0`** | whole-USDC decimal string |
| **Spot token** | Asset id **`100`** — the `quote` of every `*/USDC` pair and the id of the `USDC` row in [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `tokens[]` and in `account_state.balances[]` | whole-USDC decimal string |
| **EVM token** | ERC-20 at the fixed predeploy `0x0000000000000000000000000000000000010000` | **6-decimal integer** |
| **External chains** | Each chain's own USDC contract, held in [MetaBridge](../bridge/index.md) custody | 6-decimal integer on the MTF wire |

:::warning
**`asset: 0` and `asset: 100` both mean USDC.** They are not two currencies and,
on this network, not two balances either. `0` is the collateral-plane id the
bridge and withdraw paths use; `100` is the spot-ledger token id the market and
balance surfaces use. Which id an action wants is **fixed per action** — it is
not a free choice:

- [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) and
  [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer) take **`0`**.
  On `core_evm_transfer`, `asset: 100` is rejected with
  `asset not linked to an EVM contract` — the spot USDC token id carries **no EVM
  contract binding**, because the EVM-side USDC is reached through the
  collateral-plane id instead. `asset` defaults to `0`; leave it alone.
- The spot market and balance surfaces — [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta),
  [`account_state.balances[]`](../api/rest/info.md#account_state),
  and every `*/USDC` pair's `quote` — use **`100`**.
:::

## One pool {#one-pool}

MetaFlux does **not** hold a separate spendable spot-USDC ledger. Every USDC
movement — perp margin, spot buys, spot-order escrow, Earn deposits, spot-margin
positions, account-to-account sends, EVM moves and external withdrawals — debits
and credits **one** account balance: the settled USDC balance that
[`account_state`](#account-state) reports in its USDC row and folds into
`account_value`.

The spot token id `100` still exists. It names the `*/USDC` pairs and it still
keys the **escrow bucket** that holds USDC locked behind a resting spot bid. What
it no longer keys is a second spendable balance.

:::info
**Self-hosted networks differ.** The unified rule is active from block 0 on the
public network (`chainId 114514`) and on mainnet (`chainId 8964`). A network
running any **other** chain id keeps two separate USDC ledgers — a spot balance
and a perp collateral balance — until its validators arm the change by a
two-thirds stake vote. On such a network `usd_class_transfer` is a working
action. Check which world you are in with `eth_chainId`.
:::

## Which balance your order spends {#which-balance}

All of them spend the pool. What differs is the **gate**.

| You do this | It spends | Gate |
|-------------|-----------|------|
| Open or add to a perp position | the pool | initial margin ≤ free collateral |
| Place a **spot buy** | the pool | the buyable size is clamped to **free collateral**, not to any spot balance |
| Rest a **spot bid** | the pool | the quote cost moves out of the pool into escrow (`hold`) at admission |
| Place a **spot sell** | the base token on the spot ledger | you must own the base |
| Deposit to [Earn](./earn.md) | the pool | amount ≤ free collateral |
| Open a [spot-margin](../products/spot-margin.md) position | the pool | its initial margin is held against the pool |
| [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) / [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer) / a send | the pool | amount ≤ free collateral |

**Free collateral** is the one budget every debit above is measured against:

```
free collateral = settled USDC balance
                − initial margin held by open CROSS perp positions
                − initial margin held by open spot-margin positions
                − any impending funding CHARGE
```

**The gate figure is signed; the published field is not.** The admission and
withdrawal checks compare a debit against the raw value above, which goes
**negative** when open profit funds the held margin. The API publishes the same
budget as `withdrawable`, clamped:

```
withdrawable = max(0, free collateral)
```

Read it from [`account_state.withdrawable`](../api/rest/info.md#account_state)
or the lighter [`account_state` with `detail: "margin"`](../api/rest/info.md#account_state). A
`withdrawable` of `"0"` therefore means "nothing to take out", NOT "the account
is broke" — see [account value](./account-value.md#withdrawable). Two rules
behind the formula are worth stating:

- **Unrealised gains never count.** Free collateral folds an impending funding
  **debit** but never an unrealised profit — so a paper gain does not fund a new
  order, a spot buy or a withdrawal.
- **Nothing is subtracted twice.** A committed lock (spot escrow, an Earn
  deposit, a spot-margin post) is **debited out of the balance** at the moment it
  commits. It is gone from the balance, not carried as a separate held term.

Because it is one pool, the two directions are real and intended:

- A resting spot bid **lowers your perp margin headroom** for as long as it rests.
- A perp loss **lowers what you can spend** on spot or supply to Earn.

Cancel the bid and the escrow returns to the pool.

## Moving USDC {#moving-usdc}

| Move | How | What it costs |
|------|-----|---------------|
| Perp ↔ spot class | — | **Rejected.** See below |
| To another MetaFlux account | [`send_asset`](../integration/typed-data-signing.md#transfers) | No protocol fee |
| Parent ↔ sub-account | [`sub_account_transfer`](../api/rest/exchange.md#sub_account_transfer) / [`sub_account_spot_transfer`](../api/rest/exchange.md#sub_account_spot_transfer) | No protocol fee |
| Core → EVM | [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer) | No protocol fee; the amount is rescaled ×10⁶ |
| EVM → Core | An EVM **burn** transaction — **not** an `/exchange` action | EVM gas |
| Off the network | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) | A bridge withdraw fee, withheld from the released amount |

:::warning
**`usd_class_transfer` is rejected**, with
`USDC is unified; no class transfer needed`. Nothing is lost — the move it used
to perform has no destination now.

The rejection is in the shared handler, so **every** route to it rejects: the
`/exchange` action, the CoreWriter `UsdClassTransfer` from an EVM contract, and a
self-`send_asset` on asset `100` that crosses the spot/perp boundary (which is
routed into the same handler by design).
:::

**Every debit path is free-collateral gated; no credit path is.** A send, an EVM
move or a withdrawal is rejected when it would eat collateral that is margining
an open position — you cannot withdraw your way below maintenance margin. An
incoming credit only raises free collateral, so it needs no gate.

**The bridge withdraw fee** is a governance parameter in 6-decimal units,
withheld from the released amount: you are debited the gross `amount`, the
outbound message carries the net, and the difference accrues to the protocol.
The action rejects when `amount` does not **exceed** the fee. This page does not
publish the live fee value — read the rejection, or quote the withdrawal in your
client and compare gross against released.

## Precision, surface by surface {#precision}

| Surface | Field | Unit | `1 USDC` looks like |
|---------|-------|------|---------------------|
| `POST /info` reads | `account_value`, `withdrawable`, `balances[*].total` / `.hold` | whole-USDC **decimal string** | `"1"` |
| `POST /exchange` `send_asset` | `amount` | whole-USDC **decimal string** | `"1"` |
| `POST /exchange` `core_evm_transfer` | `amount` | whole-USDC **decimal string** | `"1"` |
| `POST /exchange` `mb_withdraw` | `amount` | **6-decimal integer** (`uint64`) | `1000000` |
| EVM ERC-20 at `0x…010000` | `balanceOf`, `transfer` | **6-decimal integer** | `1000000` |
| Bridge deposit attestations | amount | **6-decimal integer** | `1000000` |

The one conversion:

```
evm_or_bridge_units = whole_usdc × 1_000_000
```

:::warning
**`mb_withdraw` is the exception, and it is a 10⁶ trap.** It is the only
MTF-native USDC field that is a **bare integer in base units** rather than a
decimal string. `"amount": 1000000` there is **1 USDC**. The same literal on
`send_asset` or `core_evm_transfer` is **1,000,000 USDC** — those fields are
whole-USDC strings. Check which action you are signing before you fill the field.
:::

Both planes are exact: MetaFlux holds USDC as a fixed-point decimal, never a
float, and the ×10⁶ rescale only repositions the decimal point. See
[two price planes](./mark-prices.md#two-price-planes-read-this-before-reading-any-number)
for the separate question of price scaling.

## What the account reads report {#account-reads}

Two reads claim to show "your USDC". They do not agree, and one of them shows
nothing at all.

### `account_state` {#account-state}

[`POST /info` `account_state`](../api/rest/info.md#account_state) is the read to
use.

| Field | What it is | The rule behind it |
|-------|-----------|--------------------|
| `account_value` | Mark-aware **equity**: settled USDC plus unrealised perp PnL, unrealised funding and spot-margin unrealised PnL | This is the figure the liquidation engine judges you on |
| `balances[0]` (`asset: 100`, `name: "USDC"`) | `total` = **settled** USDC plus escrow; `hold` = USDC escrowed behind resting spot bids | `total` deliberately **excludes unrealised PnL**, so it never moves with the mark. `total − hold` is **not** spendable: `hold` is spot escrow only and never holds perp margin, so the subtraction leaves the margin in. Use `withdrawable` |
| `withdrawable` | What a new order, send, withdrawal or Earn deposit may consume | The [budget above](#which-balance), **clamped at zero** |

**Why two numbers.** `account_value` and `balances[0].total` both look like "my
USDC" and differ by unrealised PnL. Use `account_value` for equity and risk; use
`balances[0].total` for cash that has actually settled. The USDC row is always
present, even at zero.

### One ledger, one read {#one-ledger}

[`account_state.balances`](../api/rest/info.md#account_state) carries the WHOLE
token ledger: the unified USDC pool in row 0, and every spot token after it.
There is no second balance read to merge in.

:::warning
**Read `withdrawable`, not `total − hold`.** `hold` is spot order escrow only.
USDC that margins an open perpetual position stays in `total` and never enters
`hold`, so the subtraction leaves the margin in and overstates the budget.
:::

Cost basis rides on the same rows.
[`avg_entry_px`](../api/rest/info.md#avg-entry-px) is the per-token acquisition
price spot PnL needs. The USDC row always reads `null` — a cost basis on the
quote asset in terms of itself has no meaning.

### A worked check {#worked-check}

Claim the devnet [faucet](../networks.md#faucet), which grants 3000 USDC and
10 MTF, then read `account_state`:

- `account_value: "3000"`, and `balances` carries the USDC row (`asset 100`,
  `total "3000"`) **and** an MTF row (`asset 104`, `total "10"`).

One call, both rows. That is the unification.

## USDC on the MetaFlux EVM {#evm-side}

USDC on the [MetaFlux EVM](../evm/index.md) is Circle's `FiatTokenV2_2`
implementation behind a proxy, seeded at genesis at the fixed address
**`0x0000000000000000000000000000000000010000`**, with **6 decimals**. It is a
real ERC-20 — `balanceOf`, `transfer`, `approve` — and, being the Circle
implementation, it carries `permit` (EIP-2612) and `transferWithAuthorization`
(EIP-3009).

**Core → EVM** is [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer).
The Core debit is atomic at commit and the EVM credit is minted on the next EVM
block, so the queued credit is always fully backed. Optional calldata attached to
the transfer **never unwinds the credit**: if it reverts, the transfer still
stands — read its receipt.

**EVM → Core is not an `/exchange` action.** It must originate as an EVM
transaction that **burns** the EVM USDC; the node then mirrors the confirmed burn
onto the Core balance. Posting `core_evm_transfer` with `to_evm: false` is
rejected. The rule behind it: crediting Core without a confirmed burn would mint
value out of nothing.

Full mechanics and timings: [Core ↔ EVM transfers](../evm/core-evm-transfers.md).

## USDC from outside {#external-side}

All USDC enters and leaves MetaFlux through the self-built
[MetaBridge](../bridge/index.md) custody bridge, co-signed by two thirds of
active validator stake. There is no Circle CCTP path.

- A **deposit** credits the pool directly — it lands as collateral, ready to
  margin a perp or fund a spot buy, with no second step.
- A **withdrawal** is [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) with
  `asset: 0`. Only USDC is bridgeable today; any other asset id is rejected.
- The destination-chain release is asynchronous: the Core debit is immediate at
  commit, the payout follows co-signing and relay.

## Not covered here {#not-covered}

- **The live bridge withdraw-fee value.** The mechanism is above; the number is a
  governance parameter and no `/info` read publishes it.
- **Per-chain USDC contract addresses.** See the [bridge page](../bridge/index.md).
- **Non-USDC collateral.** Cross-asset collateral haircuts are a
  [portfolio-margin](./portfolio-margin.md) topic.

## See also {#see-also}

- [Margin modes](./margin-modes.md) — how the initial and maintenance margin that
  reduce free collateral are computed
- [Spot](../products/spot.md) — the escrow model behind `hold`
- [Earn](./earn.md) — the lending pool USDC can be supplied to
- [Bridge](../bridge/index.md) — deposits, withdrawals and the co-signing pipeline
