# Interaction timings

This page gives the time that each interaction between the EVM and Core takes, so a bot can
plan for confirmation windows.

:::tip
**Active on testnet.** Block cadence and interaction timings work as described. This includes
CoreWriter action delays and the time for a credit from Core to appear on the EVM. Cadence
and budgets can still change before launch.
:::

## Block cadence {#block-cadence}

The chain makes one unified EVM block per fixed period (1000 ms by default). The period
is slower than the consensus round rate and separate from it. There is no separate slow lane.
Trading, transfers, CoreWriter calls, precompile reads AND contract deployments all confirm
through the same lane, at the same cadence. Consensus derives `block.timestamp` (see
[Execution model](execution-model.md)).

## EVM to Core (CoreWriter) {#evm--core-corewriter}

1. The contract calls `sendRawAction`. The call burns gas and emits `RawAction` at once.
2. The L1 takes the action after a short action delay. The action waits in a queue. It
   does not apply at the same instant. The L1 then applies it to Core state.
3. There is no acknowledgement on the EVM side. The contract must observe the outcome on
   Core, for example through the API or a later precompile read. The return of
   `sendRawAction` does not give the outcome.

For your design: treat a CoreWriter action as send now, confirm later. Never treat it as a
synchronous call.

## Core to EVM (credits) {#core--evm-credits}

A credit from Core to the EVM (`SpotCredit` or `BridgeMint`) appears as a system
pseudo-transaction in a later block. It is ordered by L1 round. An elastic slice of system
gas in each block bounds it (see [Core ↔ EVM transfers](core-evm-transfers.md)). It is not
visible in the block that triggered it. Expect it within a small number of blocks.

## Precompile reads {#precompile-reads}

A `staticcall` precompile read returns inside the calling block. Today the read precompiles
are stateless quoting helpers. They compute over inputs that the caller supplies. Reads
backed by current Core state, which query the positions and books of the chain directly, are
upcoming. A read will then show Core as of the calling block.

## See also {#see-also}

- [Execution model](execution-model.md)
- [Core ↔ EVM transfers](core-evm-transfers.md)
- [Interacting with Core](interacting-with-core.md)
