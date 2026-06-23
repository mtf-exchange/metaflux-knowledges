# Core ↔ EVM transfers

:::tip
**Live on devnet.** The EVM→Core value-transfer actions (`SpotSend`, `SendAsset`,
`UsdClassTransfer`, `VaultTransfer` via CoreWriter) and Core→EVM credit
materialization are operational and tested. The [bridge](../bridge/) (cross-chain
custody) is live.
:::

Value moves between **Core** (the L1 clearinghouse / spot ledger) and the **EVM**
side in two directions. Both are deterministic and account-scoped.

## EVM → Core (via CoreWriter)

A contract pushes value into Core by submitting an L1 action through
[CoreWriter](interacting-with-core.md#writing-to-core--corewriter) (`0x3333…3333`).
The acting account is the calling contract (`msg.sender`):

| Action | Effect |
|--------|--------|
| `SpotSend` | Transfer a spot token to another account on Core |
| `SendAsset` | Generic asset transfer (perp / spot / vault classes) |
| `UsdClassTransfer` | Move USDC between the perp and spot class accounts |
| `VaultTransfer` | Deposit to / withdraw from a vault |

These are subject to CoreWriter's atomicity rule: the call burns gas + emits
`RawAction`; any L1-side failure afterwards is **silent** (no EVM revert).

## Core → EVM (system pseudo-transactions)

When an L1 begin-block effect needs to land on the EVM side — e.g. a spot send
whose recipient is an EVM-side address, or a bridge inbound mint — it is queued
and materialized as a **deterministic system pseudo-transaction on the next EVM
block**:

| Op | Source | Amount scale |
|----|--------|--------------|
| `SpotCredit` | an L1 spot balance credited to a 20-byte EVM recipient | `1e8` fixed-point |
| `BridgeMint` | a [MetaBridge](../bridge/) inbound mint (e.g. USDC) | `1e6` (USDC native) |

Ordering + throughput:

- Queued by **L1 round**, drained in ascending round order, FIFO within a round —
  so two validators materialize the same ops in the same order (determinism).
- Each op is billed a **system-gas** cost and drained against an **elastic
  per-block system-gas slice** (it scales with the block gas budget); leftover ops
  carry to the next block. Expect Core→EVM credits to land within a small number of
  blocks, not instantly in the same block they were triggered.

## Cross-chain (a different surface)

`CrossChainSend` (CoreWriter action 19) does **not** move value to the local EVM —
it queues a withdrawal into the [MetaBridge custody bridge](../bridge/), which
releases on the destination chain (Base / Solana) on a ⅔ validator co-signature
behind a dispute window.

## See also

- [Interacting with Core](interacting-with-core.md)
- [Interaction timings](interaction-timings.md)
- [Bridge](../bridge/)
