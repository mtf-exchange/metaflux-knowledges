# Interacting with Core

:::tip
**Live on devnet.** CoreWriter actions are operational, as are the stateless MTF
derivatives precompiles (`0x0900`–`0x0904`). Core-state-backed read precompiles —
querying the chain's own positions / book directly — are upcoming. The bridge
([Bridge](../bridge/)) is live.
:::

A contract on the MetaFlux EVM talks to **Core** (the L1 perps clearinghouse +
on-chain CLOB) in two directions:

- **Read** — `staticcall` a system **precompile** to get a Core-derived value.
- **Write** — call the **CoreWriter** system contract to submit an L1 action.

The read-precompile / write-contract split lets an EVM contract compose directly
with live L1 state — quote against the chain's own formulas, then act on the
clearinghouse — without leaving the VM.

## Writing to Core — CoreWriter {#writing-to-core--corewriter}

Submit an L1 action by calling **CoreWriter** at
`0x3333333333333333333333333333333333333333`:

```solidity
interface ICoreWriter {
    /// Emitted on every successful call; the L1 scanner consumes this log.
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` is a version- and id-prefixed payload:

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=22)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

The acting account is `msg.sender` (the calling contract). After a short
action-delay the L1 dispatches the decoded action.

:::info
**Atomicity.** A `sendRawAction` call only burns gas and emits `RawAction`. Any
L1-side failure **after** that is silent — there is **no EVM revert**. A contract
must self-recover and treat the `RawAction` event as the only causal link between
the EVM call and the L1 outcome.
:::

### Actions {#actions}

CoreWriter exposes 22 L1 actions (id, big-endian, in the `uint24` slot above):

| id | Action | Purpose |
|---:|--------|---------|
| 1 | `LimitOrder` | Place a limit order on a perp / spot market. **A fill on placement is recorded nowhere** — see [unrecorded fills](../api/rest/info.md#unrecorded-fills) |
| 2 | `VaultTransfer` | Deposit to / withdraw from a vault |
| 3 | `TokenDelegate` | Delegate stake to a validator. **MTF takes an optional 4th word, the lock tier** — see [below](#action-3-lock-tier) |
| 4 | `StakingDeposit` | Move tokens into the staking balance |
| 5 | `StakingWithdraw` | Move tokens out of the staking balance |
| 6 | `SpotSend` | Transfer a spot token to another account |
| 7 | `UsdClassTransfer` | Move USDC between the perp and spot class accounts |
| 8 | `FinalizeEvmContract` | Link an EVM contract to its Core token / contract id |
| 9 | `AddApiWallet` | Authorise a sub-key (agent wallet) for trading |
| 10 | `CancelByOid` | Cancel an order by server order id |
| 11 | `CancelByCloid` | Cancel an order by client order id |
| 12 | `ApproveBuilderFee` | Authorise a builder to charge a (capped) fee |
| 13 | `SendAsset` | Generic asset transfer (perp / spot / vault) |
| 14 | `ReflectEvmSupplyChange` | Sync an EVM-side ERC-20 supply change to Core |
| 15 | `BorrowLend` | Open / close a borrow-lend position |
| 16 | `PortfolioMarginEnroll` | Opt the sender in / out of cross-asset portfolio margin |
| 17 | `RfqSubmit` | Submit an RFQ quote (id, market, side, size, limit price) |
| 18 | `FbaConfigure` | Per-market frequent-batch-auction config |
| 19 | `CrossChainSend` | Chain-agnostic cross-chain transfer (queues into [MetaBridge](../bridge/)) |
| 20 | `EncryptedOrderSubmit` | Threshold-encrypted order (commitment + ciphertext) |
| 21 | `RfqQuote` | Maker quotes against an open RFQ request |
| 22 | `RfqAccept` | Taker accepts a quote, settling the RFQ off-book |

The typed parameter structs and a ready-to-use Solidity caller live in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo;
the on-chain CoreWriter at `0x3333…` is the production target (in tests a
deterministic Solidity stand-in emits the same `RawAction` payload).

### Action 3 carries a lock tier — a superset of HL's {#action-3-lock-tier}

**Do not assume Hyperliquid parity here.** HL's action 3 encodes three words:
`validator`, `wei`, `isUndelegate`. MTF accepts an **optional fourth 32-byte
word**, `lockMonths`. A three-word call stays legal and means tier `0`, so an
HL-shaped encoder keeps working unchanged.

**Why the word exists: tier `0` earns no revenue share.** MTF splits the
validator fee share by `amount × lock multiplier`, and the multiplier is `0×` at
tier `0` — see [the fee schedule](../concepts/fee-schedule.md#3-staking-discount-tiers-mtf-staked) and
[staking rewards](../concepts/staking.md#reward-sources). Without the fourth
word every EVM-originated delegation is flexible, so a contract can bond stake
and be paid nothing from the fee split. It still earns the Tier 1 fee discount.

| `lockMonths` | Meaning |
|---:|---|
| absent (3-word call) | tier `0` |
| `0` | Flexible. No revenue share. Undelegate any time. |
| `1` / `6` / `24` | Locked. Draws a revenue share. Cannot start unbonding until the lock matures. |

Any other value is **refused**. So are two cases a locked tier reaches: a
validator not on the governance allowlist for locked stake, and a top-up onto an
existing row that holds a **different** tier.

:::danger
**A refusal is silent, and the EVM receipt still says Success.** Every refusal
above is a deterministic no-op on Core — no funds move, no delegation row
appears, the free staking pool is untouched. The `sendRawAction` call itself only
burns gas and emits `RawAction`, so it cannot revert on an L1 outcome (see the
**Atomicity** note above). Read
[`staking_state`](../api/rest/info.md#staking_state) after the action delay to
confirm the tier the ledger actually stored. **Do not read the receipt status as
proof the delegation landed.**
:::

:::warning
**The tier is NOT LIVE on the chain yet.** This page leads the deployed binary.
The live node still decodes three words and ignores anything after them, so a
four-word call today delegates at tier `0` — silently, with no error. That row
then earns no revenue share, and the chain refuses a later top-up at a different
tier, so recovering costs an undelegate plus the whole unbonding window. Send
three words until the release lands.
:::

**Send exactly three words or at least four.** After the swap, a params section
between 97 and 127 bytes is refused as `params section truncated` — that is a
four-word call whose declared length is short. Bytes past the fourth word stay
ignored, as with every other action.

`encodeTokenDelegate` in the reference `Encoders` helper still emits three words
and keeps its pinned byte vector, so it stays a tier-`0` encoder. A separate
`encodeTokenDelegateLocked` takes the tier. If you are not using the helper,
build the payload as `abi.encodePacked(uint8(1), uint24(3), abi.encode(validator,
wei_, isUndelegate, lockMonths))`.

## Reading Core — precompiles {#reading-core--precompiles}

Each precompile is a `staticcall` to a fixed address with a hand-rolled,
big-endian **packed** input (not Solidity ABI). Sizes and prices are on the
**1e8 fixed-point** plane (`px_e8`, `size_e8`); USDC margins are **1e6**.

| Address | Precompile | Returns |
|---------|------------|---------|
| `0x0900` | `portfolio_margin_eval` | SPAN-like required maintenance margin, worst-case scenario index, concentration penalty |
| `0x0901` | `vault_nav` | Vault total NAV, total shares, NAV-per-share, unrealised PnL |
| `0x0902` | `adl_pro_rata_price` | VWAP an ADL of a given size clears at, walking the queue in side priority |
| `0x0903` | `mark_settle` | Per-position PnL delta, new accumulated funding, unrealised PnL at a mark |
| `0x0904` | `rfq_book_depth` | RFQ book depth (filtered by side, capped depth) |
| `0x0906` | `clob_bbo` | Best bid / best ask price + size (top of book) |
| `0x0907` | `clob_l2_depth` | Top-N aggregated `(price, size)` levels per side |
| `0x0908` | `inventory_risk` | Net / gross notional, concentration, risk-cap gate |

These are **stateless quoting** precompiles today: the caller passes the inputs
(positions, queue levels, quotes, …) and the precompile returns the computed
result, so a contract can reproduce a Core calculation off the chain's own
formulas. **Live Core-state-backed reads** (querying the chain's own positions /
book directly) are upcoming.

### `portfolio_margin_eval` (v1 ABI) {#portfolio_margin_eval-v1-abi}

The `0x0900` margin precompile delegates to the **same SPAN engine** that margins
live accounts (see [portfolio margin](../concepts/portfolio-margin.md)), so an
off-chain quote matches on-chain maintenance exactly — there is no second copy of
the math. Its v1 input adds a per-position **implied-vol** field and a **full-grid**
flag bit (run the complete scenario sweep, vs a faster subset); prices and sizes are
packed on the 1e8 plane and converted to the engine's internal USD cents at the
boundary. The return mirrors the engine result in **USD cents** — required
maintenance margin, the worst-case scenario index, the concentration penalty, and
the `100 000` USDC enrollment-equity floor the engine applies. The typed
calldata/return layout ships with the Solidity precompile interface in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo.

### Disabling a precompile (governance) {#disabling-a-precompile-governance}

Governance can switch an individual MTF precompile **off** (and later back **on**)
by a stake-weighted validator vote. A disabled precompile address stops returning a
Core-derived value until a subsequent vote re-enables it; the set of disabled
addresses is part of committed chain state, so every node agrees deterministically.

The vote is **range-guarded**: the standard Ethereum precompiles (`0x01`–`0x0a` —
`ecrecover`, `sha256`, `ripemd160`, `identity`, `modexp`, the bn256 / blake2f group)
**cannot** be disabled — a vote targeting them is rejected at both proposal and
enactment, so core EVM functionality can never be bricked. Only the MTF-specific
precompiles (the `0x09xx` range above) are eligible. This is a validator-governed
control, not a user action; it never appears on the `/exchange` path.

## Core ↔ EVM value transfers {#core--evm-value-transfers}

- **Into Core** from an EVM contract: `SpotSend` / `SendAsset` / `UsdClassTransfer`
  / `VaultTransfer` via CoreWriter (above).
- **Across chains**: `CrossChainSend` queues into the
  [MetaBridge custody bridge](../bridge/), which releases on the destination chain
  on a ⅔ validator co-signature.

## See also {#see-also}

- [Bridge](../bridge/) — cross-chain custody (the `CrossChainSend` destination)
- [Mark prices](../concepts/mark-prices.md) — the 1e8 fixed-point price plane the precompiles use
- [Portfolio margin](../concepts/portfolio-margin.md) / [ADL](../concepts/adl.md) — the Core math the `0x0900` / `0x0902` precompiles quote
