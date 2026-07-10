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
    uint24(actionId),    // action id, big-endian (1..=20)
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

CoreWriter exposes 20 L1 actions (id, big-endian, in the `uint24` slot above):

| id | Action | Purpose |
|---:|--------|---------|
| 1 | `LimitOrder` | Place a limit order on a perp / spot market |
| 2 | `VaultTransfer` | Deposit to / withdraw from a vault |
| 3 | `TokenDelegate` | Delegate stake to a validator |
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

The typed parameter structs and a ready-to-use Solidity caller live in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo;
the on-chain CoreWriter at `0x3333…` is the production target (in tests a
deterministic Solidity stand-in emits the same `RawAction` payload).

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
