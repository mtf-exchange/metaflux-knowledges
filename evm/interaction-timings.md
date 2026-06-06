# Interaction timings

{% hint style="warning" %}
**Preview — not yet live on devnet.** Cadence and budgets are the target design and
may be tuned before launch.
{% endhint %}

How long each EVM↔Core interaction takes, so a bot can reason about confirmation
windows.

## Block cadence

One unified block per consensus round, at a **sub-second** cadence — there is no
separate slow lane, so trading, transfers, CoreWriter calls, precompile reads, AND
contract deployments all confirm in the same round. `block.timestamp` is
consensus-derived (see [Execution model](execution-model.md)).

## EVM → Core (CoreWriter)

1. The contract calls `sendRawAction`; the call burns gas and emits `RawAction`
   immediately.
2. The L1 consumes the action after a short **action-delay** (it is queued, not
   applied in the same instant), then applies it to Core state.
3. There is **no EVM-side acknowledgement** — the contract must observe the
   outcome on Core (e.g. via the API / a later precompile read), not from the
   `sendRawAction` return.

Design implication: treat a CoreWriter action as **fire-and-confirm-later**, never
as a synchronous call.

## Core → EVM (credits)

A Core→EVM credit (`SpotCredit` / `BridgeMint`) is materialized as a system
pseudo-transaction on a **subsequent** block, ordered by L1 round and bounded by an
elastic per-block system-gas slice (see
[Core ↔ EVM transfers](core-evm-transfers.md)). It is **not** visible in the same
block that triggered it; expect it within a small number of blocks.

## Precompile reads

`staticcall` precompile reads return within the calling block. Today the read
precompiles are **stateless quoting** helpers (they compute over inputs the caller
supplies); **live Core-state-backed reads** (querying the chain's own
positions / book directly) are upcoming, at which point a read reflects Core as of
the calling block.

## See also

- [Execution model](execution-model.md)
- [Core ↔ EVM transfers](core-evm-transfers.md)
- [Interacting with Core](interacting-with-core.md)
