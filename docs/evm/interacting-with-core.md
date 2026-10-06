# Interacting with Core

This page describes how an EVM contract reads from Core and writes to Core.

:::tip
**Active on testnet.** CoreWriter actions work. The stateless MTF derivatives precompiles
(`0x0900`–`0x0904`) also work. Read precompiles backed by Core state, which query the
positions and books of the chain directly, are upcoming. The [bridge](../bridge/) is active.
:::

A contract on the MetaFlux EVM talks to Core (the L1 perps clearinghouse and on-chain
CLOB) in two directions:

- **Read.** A `staticcall` to a system precompile gets a value derived from Core.
- **Write.** A call to the CoreWriter system contract submits an L1 action.

With read precompiles and a write contract, an EVM contract composes directly with current L1
state. It can quote against the formulas of the chain and then act on the clearinghouse,
without a step outside the VM.

## Writing to Core with CoreWriter {#writing-to-core--corewriter}

To submit an L1 action, call CoreWriter at
`0x3333333333333333333333333333333333333333`:

```solidity
interface ICoreWriter {
    /// Emitted on every successful call; the L1 scanner consumes this log.
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` is a payload with a version prefix and an id prefix:

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=22)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

The acting account is `msg.sender`, the calling contract. After a short action delay, the L1
dispatches the decoded action.

:::info
**Atomicity.** A `sendRawAction` call only burns gas and emits `RawAction`. Any failure on
the L1 side after that is silent. There is no EVM revert. A contract must recover on
its own. It must treat the `RawAction` event as the only causal link between the EVM call and
the L1 outcome.
:::

### Actions {#actions}

CoreWriter exposes 22 L1 actions. The id goes big-endian in the `uint24` slot above:

| id | Action | Purpose |
|---:|--------|---------|
| 1 | `LimitOrder` | Places a limit order on a perp or spot market. No record of a fill on placement exists. See [unrecorded fills](../api/rest/info/orders-fills.md#unrecorded-fills). |
| 2 | `VaultTransfer` | Deposits to or withdraws from a vault. |
| 3 | `TokenDelegate` | Delegates stake to a validator. MTF takes an optional fourth word, the lock tier. See [below](#action-3-lock-tier). |
| 4 | `StakingDeposit` | Moves tokens into the staking balance. |
| 5 | `StakingWithdraw` | Moves tokens out of the staking balance. |
| 6 | `SpotSend` | Transfers a spot token to another account. |
| 7 | `UsdClassTransfer` | Moves USDC between the perp and spot class accounts. |
| 8 | `FinalizeEvmContract` | Links an EVM contract to its Core token or contract id. |
| 9 | `AddApiWallet` | Authorises a sub-key (agent wallet) for trading. |
| 10 | `CancelByOid` | Cancels an order by server order id. |
| 11 | `CancelByCloid` | Cancels an order by client order id. |
| 12 | `ApproveBuilderFee` | Authorises a builder to charge a fee, up to a cap. |
| 13 | `SendAsset` | Generic asset transfer (perp, spot or vault). |
| 14 | `ReflectEvmSupplyChange` | Syncs a supply change of an ERC-20 on the EVM side to Core. |
| 15 | `BorrowLend` | Opens or closes a borrow-lend position. |
| 16 | `PortfolioMarginEnroll` | Opts the sender in to or out of cross-asset portfolio margin. |
| 17 | `RfqSubmit` | Submits an RFQ quote (id, market, side, size, limit price). |
| 18 | `FbaConfigure` | Sets the frequent-batch-auction configuration of a market. |
| 19 | `CrossChainSend` | Chain-agnostic cross-chain transfer. It goes into the queue of [MetaBridge](../bridge/). |
| 20 | `EncryptedOrderSubmit` | Threshold-encrypted order (commitment and ciphertext). |
| 21 | `RfqQuote` | A maker quotes against an open RFQ request. |
| 22 | `RfqAccept` | A taker accepts a quote, and the RFQ settles off the book. |

The typed parameter structs and a Solidity caller are in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo. The on-chain
CoreWriter at `0x3333…` is the production target. In tests, a deterministic Solidity stand-in
emits the same `RawAction` payload.

### Lock tier on action 3 {#action-3-lock-tier}

Do not assume parity with Hyperliquid here. Action 3 on HL encodes three words:
`validator`, `wei` and `isUndelegate`. MTF accepts an optional fourth 32-byte word,
`lockMonths`. A three-word call stays legal and means tier `0`, so an encoder in the HL shape
works with no change.

The reason for the word: tier `0` earns no revenue share. MTF splits the validator fee
share by `amount × lock multiplier`, and the multiplier is `0×` at tier `0`. See
[the fee schedule](../concepts/fee-schedule.md#3-staking-discount-tiers-mtf-staked) and
[staking rewards](../concepts/staking.md#reward-sources). Without the fourth word, every
delegation from the EVM is flexible. A contract can then bond stake and get nothing from the
fee split. It still earns the Tier 1 fee discount.

| `lockMonths` | Meaning |
|---:|---|
| absent (3-word call) | tier `0` |
| `0` | Flexible. No revenue share. Undelegate at any time. |
| `1` / `6` / `24` | Locked. Draws a revenue share. Cannot start unbonding until the lock matures. |

Core refuses any other value. It also refuses two cases that a locked tier can reach: a
validator that is not on the governance allowlist for locked stake, and an addition to an
existing row that holds a different tier.

:::danger
A refusal is silent, and the EVM receipt still says Success. Each refusal above is a
deterministic no-op on Core. No funds move, no delegation row appears and the free staking
pool does not change. The `sendRawAction` call itself only burns gas and emits `RawAction`,
so it cannot revert on an L1 outcome (see the Atomicity note above). After the action
delay, read [`staking_state`](../api/rest/info/vaults-staking.md#staking_state) to confirm the
tier that the ledger stored. Do not read the receipt status as proof that the delegation
landed.
:::

Send exactly three words, or four or more. The fourth word selects the lock tier. Core
refuses a params section between 97 and 127 bytes as `params section
truncated`. That is a four-word call with a short declared length. Core ignores bytes past
the fourth word, as for every other action.

`encodeTokenDelegate` in the reference `Encoders` helper still emits three words and keeps its
pinned byte vector, so it stays a tier-`0` encoder. A separate `encodeTokenDelegateLocked`
takes the tier. If you do not use the helper, build the payload as
`abi.encodePacked(uint8(1), uint24(3), abi.encode(validator,
wei_, isUndelegate, lockMonths))`.

## Reading Core with precompiles {#reading-core--precompiles}

Each precompile is a `staticcall` to a fixed address. The input is a hand-rolled, big-endian
packed encoding. It is not the Solidity ABI. Sizes and prices are on the 1e8
fixed-point plane (`px_e8`, `size_e8`). USDC margins are 1e6.

| Address | Precompile | Returns |
|---------|------------|---------|
| `0x0900` | `portfolio_margin_eval` | Required maintenance margin in the style of SPAN, the index of the worst-case scenario, and the concentration penalty. |
| `0x0901` | `vault_nav` | Total NAV of the vault, total shares, NAV per share and unrealised PnL. |
| `0x0902` | `adl_pro_rata_price` | The VWAP at which an ADL of a given size clears, with a walk of the queue in side priority. |
| `0x0903` | `mark_settle` | PnL delta for each position, new accumulated funding and unrealised PnL at a mark. |
| `0x0904` | `rfq_book_depth` | RFQ book depth, filtered by side, with a capped depth. |
| `0x0906` | `clob_bbo` | Best bid and best ask price and size (top of book). |
| `0x0907` | `clob_l2_depth` | The top N aggregated `(price, size)` levels on each side. |
| `0x0908` | `inventory_risk` | Net and gross notional, concentration and the risk-cap gate. |

Today these are stateless quoting precompiles. The caller passes the inputs (positions,
queue levels, quotes, …), and the precompile returns the result. A contract can therefore
reproduce a Core calculation with the formulas of the chain. Reads backed by current Core
state, which query the positions and books of the chain directly, are upcoming.

### `portfolio_margin_eval` (v1 ABI) {#portfolio_margin_eval-v1-abi}

The `0x0900` margin precompile uses the same SPAN engine that margins active accounts (see
[portfolio margin](../concepts/portfolio-margin.md)). An off-chain quote therefore matches
on-chain maintenance exactly. There is no second copy of the math.

Its v1 input adds an implied-vol field for each position and a full-grid flag bit. The
flag runs the complete scenario sweep instead of a faster subset. Prices and sizes are packed
on the 1e8 plane and converted to the internal USD cents of the engine at the boundary.

The return gives the engine result in USD cents: the required maintenance margin, the
index of the worst-case scenario, the concentration penalty, and the `100 000` USDC
enrollment-equity floor that the engine applies. The typed calldata and return layout ship
with the Solidity precompile interface in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo.

### Disabling a precompile (governance) {#disabling-a-precompile-governance}

Governance can turn an MTF precompile off, and later back on, by a stake-weighted
validator vote. A disabled precompile address returns no value derived from Core until a
later vote enables it again. The set of disabled addresses is part of committed chain state,
so every node agrees deterministically.

The vote has a range guard. The standard Ethereum precompiles (`0x01`–`0x0a`:
`ecrecover`, `sha256`, `ripemd160`, `identity`, `modexp`, the bn256 and blake2f group)
cannot be disabled. The chain rejects a vote that targets them at both proposal and
enactment, so core EVM functions can never be disabled. Only the MTF precompiles (the `0x09xx`
range above) are eligible. This is a control for validator governance. It is not a user
action, and it never appears on the `/exchange` path.

## Core ↔ EVM value transfers {#core--evm-value-transfers}

- Into Core from an EVM contract: `SpotSend`, `SendAsset`, `UsdClassTransfer` or
  `VaultTransfer` through CoreWriter (above).
- Across chains: `CrossChainSend` goes into the queue of the
  [MetaBridge custody bridge](../bridge/). The bridge releases on the destination chain on a
  ⅔ validator co-signature.

## See also {#see-also}

- [Bridge](../bridge/): cross-chain custody, the destination of `CrossChainSend`.
- [Mark prices](../concepts/mark-prices.md): the 1e8 fixed-point price plane that the precompiles use.
- [Portfolio margin](../concepts/portfolio-margin.md) and [ADL](../concepts/adl.md): the Core math that the `0x0900` and `0x0902` precompiles quote.
