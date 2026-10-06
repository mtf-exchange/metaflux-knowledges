# Core ↔ EVM transfers

This page describes how value moves between Core and the EVM, and which assets can move.

:::tip
**Live on testnet.** The value-transfer actions from the EVM to Core work and are tested.
These are `SpotSend`, `SendAsset`, `UsdClassTransfer` and `VaultTransfer` through CoreWriter.
Credits from Core to the EVM also work and are tested. The [bridge](../bridge/) (cross-chain
custody) is live.
:::

Value moves between Core (the L1 clearinghouse and spot ledger) and the EVM side in
two directions. Both directions are deterministic, and each transfer stays in one account.

## Value from EVM to Core {#evm--core-value}

Use this lane to move a balance from the EVM to Core. Send an ordinary EVM transaction to
the system withdraw sink:

```
to:   0x0000000000000000000000000000000000000602
data: abi.encode(uint256 asset_id, uint256 amount)   // 64 bytes, exactly two words
```

The node burns `amount` of your system token on the EVM side. It credits the SAME account on
Core. USDC (`asset_id` 0) goes to your perp cross-collateral. Any other asset goes to your
spot balance. The credit is always backed. It credits only what the burn removed, so the lane
cannot mint.

| Requirement | Reason |
|---|---|
| The transaction must SUCCEED | The scan skips a reverted transaction. |
| `data` is at least 64 bytes | The node silently ignores shorter calldata. |
| `asset_id` is the LOW 4 bytes of word 0 | The node reads it as a `uint32`. |
| `amount` is the LOW 16 bytes of word 1 | The node reads it as a `uint128`. |
| The asset must be registered | The node ignores an `asset_id` that does not resolve. |

:::warning
The node IGNORES short or malformed calldata. It does not reject it. The transaction
succeeds, gas is spent and nothing moves. There is no revert to catch. Check your balance on
Core, not the EVM receipt.
:::

:::info
The `/exchange` action `core_evm_transfer` with `to_evm: false` is REFUSED, on purpose.
A credit on Core without a confirmed EVM burn would create value from nothing. That path
therefore fails closed and points here.
:::

### Eligible assets {#which-assets-cross}

Not every token that you hold can cross. Ask the chain. Do not guess:

```json
{ "type": "markets_meta", "kind": "spot" }
```

```json
{ "spot": { "tokens": [
  { "id": 101, "name": "BTC",
    "evm_contract": { "address": "0x…", "variant": 0, "evm_extra_wei_decimals": 0 } },
  { "id": 5, "name": "TOKEN5", "evm_contract": null }
] } }
```

`evm_contract` is the test. A token with an object can cross. A token with `null`
cannot. The read resolves the address through the SAME predicate as the transfer path, so it
can never offer a binding that the chain then refuses. `variant` names how the token is
bound: `0` is a deployed contract, and `1` and `2` are storage-slot forms. `variant` does not
change whether the asset crosses.

The [token registry](../api/rest/info/spot.md#spot_meta) is one section of
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta). The call that gives you the
tradable markets therefore gives you this too. There is no separate bindings read.

Two assets cross without a bound ERC-20 row. USDC is the fixed FiatToken predeploy. The
native gas token is the EVM balance itself, not a contract.

:::info
A binding is permanent. The first write wins in the binding vote. The vote refuses an
asset that already has a binding. It also refuses a contract already bound to another asset.
Nothing removes a binding. Still read the address from `markets_meta`, because a token can
get its FIRST binding at any time. Key your own records on the asset id.
:::

### Binding vote {#binding-vote}

A binding of a token to an ERC-20 is a validator vote of ⅔ of stake
(`FinalizeEvmContract`, [CoreWriter action 8](interacting-with-core.md#actions)). Every
validator must submit a byte-equal proposal for the vote to count.

The proposal fixes the asset, the `variant` and the contract. It does not set the
decimals of the token. A credit lands in the `wei_decimals` of the token. That value is
chosen once at
[`spot_register_token`](../api/rest/exchange/deploy-spot.md#spot_register_token) and never
changes after. Registration therefore decides the SIZE of every credit on this lane. The
binding only decides where the credit goes.

:::warning
The proposal has no decimals field. The tallied payload folds in the `wei_decimals` of
the registry, and the `node_gov` cast record shows it. The chain refuses a bind above 18. But
the proposal that a validator reads has no scale of its own. Before you vote on a binding,
read the `wei_decimals` of the token from
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) `kind: "spot"`.
:::

Offer the transfer only for assets that resolve. An asset that the chain cannot resolve is
the silent failure above: the burn transaction succeeds and nothing moves.

## Actions from EVM to Core (CoreWriter) {#evm--core-via-corewriter}

A contract submits an L1 ACTION through
[CoreWriter](interacting-with-core.md#writing-to-core--corewriter) (`0x3333…3333`). The
acting account is the calling contract (`msg.sender`):

| Action | Effect |
|--------|--------|
| `SpotSend` | Transfers a spot token to another account on Core. |
| `SendAsset` | Generic asset transfer (perp, spot or vault classes). |
| `UsdClassTransfer` | Rejected. There is one USDC pool, so there is no second class to move to. The call still burns gas and emits `RawAction`. The L1 rejection is silent, by the atomicity rule below. See [USDC](../concepts/usdc.md#moving-usdc). |
| `VaultTransfer` | Deposits to or withdraws from a vault. |

The atomicity rule of CoreWriter applies to these actions. The call burns gas and emits
`RawAction`. Any failure on the L1 side after that is silent. There is no EVM revert.

A CoreWriter call from a contract reaches Core, subject to the atomicity rule above.

## Value from Core to EVM {#core--evm-value}

Use this lane to move a balance from Core to the EVM. Two `/exchange` actions do it. Both
reach the same queue and land the same credit:

| Action | Field shape | Debits | Availability |
|---|---|---|---|
| [`core_evm_transfer`](../api/rest/exchange/transfers.md#core_evm_transfer) | MTF-native | the perp collateral pool for `asset: 0`, else the spot ledger | live at every height |
| [`send_to_evm_with_data`](../api/rest/exchange/transfers.md#send_to_evm_with_data) | Hyperliquid-compatible | the spot ledger, always | live |

Use `core_evm_transfer` if you have a choice. Both actions are live. Only `core_evm_transfer`
can move USDC out of the perp collateral pool, which is the balance that `account_value` and
`withdrawable` report. Use `send_to_evm_with_data` to port a client that already builds the
Hyperliquid field shape. For the full comparison, see
[which Core → EVM action to use](../api/rest/exchange/transfers.md#core-evm-which-action).

Both actions debit the exchange ledger of the sender when the action commits. Both queue one
EVM credit, which the node mints on the next EVM block. The debit lands first, so the queued
credit is always backed and the lane cannot mint. Both actions can carry an optional EVM
payload of up to 4096 bytes. The payload runs against the recipient after the credit
lands. The payload never unwinds the credit. A revert leaves the credit in place, so read
its receipt.

Only assets that the chain can resolve can cross. See
[eligible assets](#which-assets-cross).

:::warning
Amounts are decimal strings. The chain REFUSES an amount too small to credit. It does not
round it to nothing. The lane truncates two times toward zero: first to 8 decimal places,
then to the EVM decimals of the token. The smallest amount that can be credited is
`10 ^ -min(8, the token's EVM decimals)`. This is `0.000001` for USDC and `0.00000001` for
native MTF. Below that amount, the action refuses. Above it, the debit equals the credit
exactly, so no sub-quantum remainder is lost in transit.
:::

### Transfer fee {#core-to-evm-fee}

Both lanes charge a fee, and the fee is in MTF.

The fee parameter is `0`, so the chain charges no fee. A governance vote of two-thirds of
stake sets it. The charge starts when a vote enacts a value above `0`. Both actions then
charge the same fee, so neither lane is cheaper.

The fee is a quantity of MTF. The chain debits it in addition to the amount. It does not
depend on the asset that you move: a transfer of USDC debits USDC for the amount and MTF for
the fee. The chain takes the fee from your spot MTF balance first. It then takes it from
your USDC at the MTF reference price. If neither balance covers it, the chain refuses
the transfer.

:::warning
The chain can refuse a transfer for a reason not related to the asset that you move. MTF
is priced from its own book, so the USDC step needs that reference price. When the price is
not usable, the chain refuses the transfer. It does not charge at a guessed price. If you
hold enough spot MTF to cover the fee, the chain never reads the reference price.
:::

The rule, the rejection strings and the governance parameter are in
[the fee](../api/rest/exchange/transfers.md#core-evm-fee) and
[Fees](../concepts/fees.md#core-evm-transfer-fee).

## System pseudo-transactions from Core to EVM {#core--evm-system-pseudo-transactions}

Some L1 begin-block effects must land on the EVM side. Examples are a spot send to a recipient
on the EVM side, and an inbound bridge mint. The chain puts such an effect in a queue. It
appears as a deterministic system pseudo-transaction on the next EVM block:

| Op | Source | Amount scale |
|----|--------|--------------|
| `SpotCredit` | an L1 spot balance credited to a 20-byte EVM recipient | `1e8` fixed-point |
| `BridgeMint` | a [MetaBridge](../bridge/) inbound mint (e.g. USDC) | `1e6` (USDC native) |

Ordering and throughput:

- The queue is ordered by L1 round. It drains in ascending round order, and first in,
  first out inside a round. Two validators therefore apply the same ops in the same order
  (determinism).
- Each op has a system-gas cost. Ops drain against an elastic slice of system gas in
  each block, which scales with the block gas budget. Ops that do not fit carry to the next
  block. Expect a credit from Core to the EVM within a small number of blocks. It does not
  land in the block that triggered it.

## Cross-chain transfers {#cross-chain-a-different-surface}

`CrossChainSend` (CoreWriter action 19) does not move value to the local EVM. It queues a
withdrawal into the [MetaBridge custody bridge](../bridge/). The bridge releases on the
destination chain (Base or Arbitrum) on a ⅔ validator co-signature, after a dispute window.

## See also {#see-also}

- [Interacting with Core](interacting-with-core.md)
- [Interaction timings](interaction-timings.md)
- [Bridge](../bridge/)
