---
description: "Where a trader's USDC lives on MetaFlux: one unified balance, four identities (perp collateral, spot token 100, the EVM FiatToken, external chains), and the precision of each surface."
---

# USDC

This page explains where USDC lives on MetaFlux, which balance each order spends and how each surface scales the number.

:::tip
**Stable.** USDC is one balance on MetaFlux. The perp collateral account and the spendable
spot-USDC balance are the same number. One exception applies: a `standard`-mode account holds two.
See [the standard-mode split](#standard-split).
:::

## Overview {#tldr}

- One pool. A perp order, a spot buy, an Earn deposit and a withdrawal all spend the same USDC.
  They use the same free collateral as the gate.
- The concept still carries several ids. `asset: 0` is on bridge and withdraw surfaces. `asset: 100`
  is on spot market and balance surfaces. The EVM has an ERC-20, and every external chain has a
  separate contract.
- There are two number planes. `/info` and most `/exchange` fields are whole-USDC decimal strings.
  [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) and the EVM token are
  6-decimal integers. Mixing them is an error of 10⁶.
- The chain rejects [`usd_class_transfer`](#moving-usdc) on a unified account, because there is no
  second pool to move to. A split `standard` account is the one exception. See
  [the standard-mode split](#standard-split).

## The four identities {#four-identities}

One concept has four addressing schemes. Read this table before you write any code that names USDC.

| Surface | How USDC is addressed | Number plane |
|---------|----------------------|--------------|
| Perp collateral (the pool) | Not a ledger row. It is the own balance of the account, read as `account_value` and `withdrawable`. Bridge deposits, [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) and [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer) address it as `asset: 0` | whole-USDC decimal string |
| Spot token | Asset id `100`. It is the `quote` of every `*/USDC` pair and the id of the `USDC` row in [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `tokens[]` and in `account_state` `spot.balances[]` | whole-USDC decimal string |
| EVM token | ERC-20 at the fixed predeploy `0x0000000000000000000000000000000000010000` | 6-decimal integer |
| External chains | The USDC contract of each chain, held in [MetaBridge](../bridge/index.md) custody | 6-decimal integer on the MTF wire |

:::warning
`asset: 0` and `asset: 100` both mean USDC. They are not two currencies. On this network they are
not two balances either. `0` is the collateral-plane id that the bridge and withdraw paths use.
`100` is the spot-ledger token id that the market and balance surfaces use. Each action fixes which
id it takes. You cannot choose freely.

- [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) and
  [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer) take `0`. On
  `core_evm_transfer`, the chain rejects `asset: 100` with `asset not linked to an EVM contract`.
  The spot USDC token id has no EVM contract binding, because the EVM-side USDC is reached through
  the collateral-plane id. `asset` defaults to `0`. Leave it alone.
- The spot market and balance surfaces use `100`. These are
  [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta),
  [`account_state` `spot.balances[]`](../api/rest/info/account.md#account_state) and the `quote` of
  every `*/USDC` pair.
:::

## One pool {#one-pool}

MetaFlux does not hold a separate spendable spot-USDC ledger. Every USDC movement debits and credits
one account balance. The movements are perp margin, spot buys, spot-order escrow, Earn deposits,
spot-margin positions, account-to-account sends, EVM moves and external withdrawals. The balance is
the settled USDC balance that [`account_state`](#account-state) reports in its USDC row and folds
into `account_value`.

The spot token id `100` still exists. It names the `*/USDC` pairs. It also still keys the escrow
bucket that holds USDC locked behind a resting spot bid. It no longer keys a second spendable
balance.

:::info
**Self-hosted networks differ.** The unified rule is active from block 0 on the public network
(`chainId 114514`) and on mainnet (`chainId 8964`). A network with any other chain id keeps two
separate USDC ledgers: a spot balance and a perp collateral balance. This holds until its
validators arm the change by a two-thirds stake vote. On such a network, `usd_class_transfer` is a
working action. Check which case you are in with `eth_chainId`.
:::

## Which balance your order spends {#which-balance}

All of these spend the pool. The gate differs.

| You do this | It spends | Gate |
|-------------|-----------|------|
| Open or add to a perp position | the pool | initial margin ≤ free collateral |
| Place a spot buy | the pool | the buyable size is clamped to free collateral, not to any spot balance |
| Rest a spot bid | the pool | the quote cost moves out of the pool into escrow (`hold`) at admission |
| Place a spot sell | the base token on the spot ledger | you must own the base |
| Deposit to [Earn](./earn.md) | the pool | amount ≤ free collateral |
| Open a [spot-margin](../products/spot-margin.md) position | the pool | its initial margin is held against the pool |
| [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw), [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer) or a send | the pool | amount ≤ free collateral |

*Free collateral* is the one budget that every debit above is measured against:

```
free collateral = settled USDC balance
                − initial margin held by open CROSS perp positions
                − initial margin held by open spot-margin positions
                − any impending funding CHARGE
```

The gate figure is signed. The published field is not. The admission and withdrawal checks compare
a debit against the raw value above. That value goes negative when open profit funds the held
margin. The API publishes the same budget as `withdrawable`, clamped:

```
withdrawable = max(0, free collateral)
```

Read it from [`account_state.withdrawable`](../api/rest/info/account.md#account_state) or from the
lighter [`account_state` with `detail: "margin"`](../api/rest/info/account.md#account_state). A
`withdrawable` of `"0"` means there is nothing to take out. It does not mean the account is broke.
See [account value](./account-value.md#withdrawable). Two rules sit behind the formula:

- Unrealised gains never count. Free collateral folds in an impending funding debit but never an
  unrealised profit. So a paper gain does not fund a new order, a spot buy or a withdrawal.
- Nothing is subtracted twice. A committed lock is debited out of the balance at the moment it
  commits. Spot escrow, an Earn deposit and a spot-margin post are such locks. The lock is gone
  from the balance. The formula does not carry it as a separate held term.

Because it is one pool, both directions below are real and intended:

- A resting spot bid lowers your perp margin headroom for as long as it rests.
- A perp loss lowers what you can spend on spot or supply to Earn.

Cancel the bid and the escrow returns to the pool.

## The standard-mode split {#standard-split}

:::info
**In effect from node 0.9.7, block 5,710,001.** An account already in `standard` at the swap keeps one
balance until it leaves the mode and enters again.
:::

From the swap, an account that enters `standard` mode holds two USDC wallets:

- The perp wallet is the collateral account. Perp margin, funding, liquidation, ADL, vaults and
  bridge withdrawals read and write this wallet.
- The spot wallet is spot token `100`. Spot orders, spot fills, spot fees, `send_asset` of USDC,
  Core to EVM transfers and Earn read and write this wallet. The chain refuses an Earn deposit that
  the spot wallet cannot fund with `PRECONDITION_FAILED` and the message `insufficient balance`. It
  does not use `ASSET_INSUFFICIENT_BALANCE`.
- [`usd_class_transfer`](../api/rest/exchange/transfers.md#usd_class_transfer) is the only lane
  that crosses. It moves one amount from one wallet to the other.

Four rules follow, and each is deliberate:

1. A perp loss cannot reach the spot wallet. The insurance fund and ADL absorb the perp bankruptcy
   of a split account. Its spot USDC never does.
2. A split account has no reservations. The chain refuses it spot margin
   (`spot margin is not available in standard mode`) and every reservation
   (`a split standard account has no reservations`).
3. Each wallet funds its own orders, with no cap. The chain admits perp and option orders against
   the free collateral of the perp wallet. It admits spot orders against the spot wallet. It
   refuses a spot order that the spot wallet cannot fund: `insufficient spot balance`.
4. Only entry splits. An account already in `standard` at the swap keeps one balance until it
   leaves the mode and enters again. Leaving folds the spot wallet back into the pool.

To read the two wallets: `account_value` and `withdrawable` on
[`account_state`](../api/rest/info/account.md#account_state) are the perp wallet. The USDC row of
`spot.balances` is the spot wallet. The value `total − hold` is what a new spot order may spend. Add
`account_value` and the `total` of that row for the account total.

## Moving USDC {#moving-usdc}

| Move | How | What it costs |
|------|-----|---------------|
| Perp to spot class, or back | [`usd_class_transfer`](../api/rest/exchange/transfers.md#usd_class_transfer), split `standard` accounts only | No protocol fee. Rejected on every other account (see below) |
| To another MetaFlux account | [`send_asset`](../integration/typed-data-signing.md#transfers) | No protocol fee |
| Parent to sub-account, or back | [`sub_account_transfer`](../api/rest/exchange/account.md#sub_account_transfer) or [`sub_account_spot_transfer`](../api/rest/exchange/account.md#sub_account_spot_transfer) | No protocol fee |
| Core to EVM | [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer) | No protocol fee. The amount is rescaled ×10⁶ |
| EVM to Core | An EVM burn transaction. It is not an `/exchange` action | EVM gas |
| Off the network | [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) | A bridge withdraw fee, withheld from the released amount |

:::warning
The chain rejects `usd_class_transfer` with `USDC is unified; no class transfer needed`. Nothing is
lost. The move it used to perform has no destination now.

The rejection is in the shared handler, so every route to it rejects. The routes are the
`/exchange` action, the CoreWriter `UsdClassTransfer` from an EVM contract and a self-`send_asset`
on asset `100` that crosses the spot and perp boundary. The design routes that last one into the
same handler.
:::

Every debit path is gated on free collateral. No credit path is. The chain rejects a send, an EVM
move or a withdrawal when it would eat collateral that margins an open position. You cannot
withdraw your way below maintenance margin. An incoming credit only raises free collateral, so it
needs no gate.

The bridge withdraw fee is a governance parameter in 6-decimal units. The chain withholds it from
the released amount. You are debited the gross `amount`, the outbound message carries the net, and
the difference accrues to the protocol. The action rejects when `amount` does not exceed the fee.
This page does not publish the current fee value. Read the rejection, or quote the withdrawal in your
client and compare the gross amount with the released amount.

## Precision by surface {#precision}

| Surface | Field | Unit | `1 USDC` looks like |
|---------|-------|------|---------------------|
| `POST /info` reads | `account_value`, `withdrawable`, `spot.balances[*].total` and `.hold` | whole-USDC decimal string | `"1"` |
| `POST /exchange` `send_asset` | `amount` | whole-USDC decimal string | `"1"` |
| `POST /exchange` `core_evm_transfer` | `amount` | whole-USDC decimal string | `"1"` |
| `POST /exchange` `bridge_withdraw` | `amount` | 6-decimal integer (`uint64`) | `1000000` |
| EVM ERC-20 at `0x…010000` | `balanceOf`, `transfer` | 6-decimal integer | `1000000` |
| Bridge deposit attestations | amount | 6-decimal integer | `1000000` |

The one conversion:

```
evm_or_bridge_units = whole_usdc × 1_000_000
```

:::warning
`bridge_withdraw` is the exception, and it is a 10⁶ trap. It is the only MTF-native USDC field that
is a bare integer in base units, not a decimal string. `"amount": 1000000` there is 1 USDC. The
same literal on `send_asset` or `core_evm_transfer` is 1,000,000 USDC, because those fields are
whole-USDC strings. Check which action you sign before you fill the field.
:::

Both planes are exact. MetaFlux holds USDC as a fixed-point decimal, never a float. The ×10⁶
rescale only moves the decimal point. For the separate question of price scaling, see
[two price planes](./mark-prices.md#two-price-planes-read-this-before-reading-any-number).

## What the account reads report {#account-reads}

Two reads claim to show your USDC. They do not agree, and one of them shows nothing at all.

### `account_state` {#account-state}

Use [`POST /info` `account_state`](../api/rest/info/account.md#account_state).

| Field | What it is | The rule behind it |
|-------|-----------|--------------------|
| `account_value` | Mark-aware equity: settled USDC plus unrealised perp PnL, unrealised funding and spot-margin unrealised PnL | The liquidation engine judges you on this figure. Split `standard` account: the perp wallet only |
| `spot.balances[0]` (`name: "USDC"`, `signing_id: 100`) | `total` is settled USDC plus escrow. `hold` is USDC escrowed behind resting spot bids | `total` deliberately excludes unrealised PnL, so it never moves with the mark. `total − hold` is not spendable. `hold` is spot escrow only and never holds perp margin, so the subtraction leaves the margin in. Use `withdrawable`. Split `standard` account: the row is the spot wallet alone, so `total − hold` is what a spot order may spend. See [the standard-mode split](#standard-split) |
| `withdrawable` | What a new order, send, withdrawal or Earn deposit may consume | The [budget above](#which-balance), clamped at zero. Split `standard` account: a USDC send and a spot order read the spot wallet (`insufficient spot balance`), and so does an Earn deposit (`insufficient balance`). `withdrawable` bounds perp and option orders and withdrawals only. See [the standard-mode split](#standard-split) |

There are two numbers because `account_value` and `spot.balances[0].total` both look like your
USDC and differ by unrealised PnL. Use `account_value` for equity and risk. Use
`spot.balances[0].total` for cash that has settled. The USDC row is always present, even at zero.

### One ledger, one read {#one-ledger}

[`account_state` `spot.balances`](../api/rest/info/account.md#account_state) carries the whole token
ledger. Row 0 is the unified USDC pool, and every spot token follows. There is no second balance
read to merge in.

:::warning
Read `withdrawable`, not `total − hold`. `hold` is spot order escrow only. USDC that margins an
open perpetual position stays in `total` and never enters `hold`. So the subtraction leaves the
margin in and overstates the budget.
:::

Cost basis rides on the same rows. [`avg_entry_px`](../api/rest/info/account.md#avg-entry-px) is
the per-token acquisition price that spot PnL needs. The USDC row always reads `null`, because a
cost basis on the quote asset in terms of itself has no meaning.

### A worked check {#worked-check}

Claim the testnet [faucet](../networks.md#faucet), which grants 3000 USDC and 10 MTF. Then read
`account_state`:

- `account_value: "3000"`.
- `spot.balances` carries the USDC row (`signing_id 100`, `total "3000"`) and an MTF row
  (`asset 104`, `total "10"`).

One call returns both rows. That is the unification.

## USDC on the MetaFlux EVM {#evm-side}

USDC on the [MetaFlux EVM](../evm/index.md) is the Circle `FiatTokenV2_2` implementation behind a
proxy. Genesis seeds it at the fixed address `0x0000000000000000000000000000000000010000`, with 6
decimals. It is a real ERC-20 with `balanceOf`, `transfer` and `approve`. It is the Circle
implementation, so it also carries `permit` (EIP-2612) and `transferWithAuthorization` (EIP-3009).

Core to EVM uses [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer). The
Core debit is atomic at commit. The chain mints the EVM credit on the next EVM block, so the queued
credit is always fully backed. Optional calldata attached to the transfer never unwinds the credit.
If the calldata reverts, the transfer still stands. Read its receipt.

EVM to Core is not an `/exchange` action. It must start as an EVM transaction that burns the EVM
USDC. The node then mirrors the confirmed burn onto the Core balance. The chain rejects
`core_evm_transfer` with `to_evm: false`. The rule behind this: crediting Core without a confirmed
burn would mint value out of nothing.

For full mechanics and timings, see [Core and EVM transfers](../evm/core-evm-transfers.md).

## USDC from outside {#external-side}

All USDC enters and leaves MetaFlux through the self-built [MetaBridge](../bridge/index.md) custody
bridge. Two thirds of active validator stake co-sign it. There is no Circle CCTP path.

- A deposit credits the pool directly. It lands as collateral, ready to margin a perp or fund a
  spot buy, with no second step.
- A withdrawal is [`bridge_withdraw`](../api/rest/exchange/transfers.md#bridge_withdraw) with
  `asset: 0`. Only USDC is bridgeable today. The chain rejects any other asset id.
- The release on the destination chain is asynchronous. The Core debit is immediate at commit. The
  payout follows co-signing and relay.

## Not covered here {#not-covered}

- The current bridge withdraw-fee value. The mechanism is above. The number is a governance parameter,
  and no `/info` read publishes it.
- Per-chain USDC contract addresses. See the [bridge page](../bridge/index.md).
- Non-USDC collateral. Cross-asset collateral haircuts belong to
  [portfolio margin](./portfolio-margin.md).

## See also {#see-also}

- [Margin modes](./margin-modes.md): how the chain computes the initial and maintenance margin that reduce free collateral
- [Spot](../products/spot.md): the escrow model behind `hold`
- [Earn](./earn.md): the lending pool that USDC can be supplied to
- [Bridge](../bridge/index.md): deposits, withdrawals and the co-signing pipeline
