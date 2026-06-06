# Dual-block architecture

{% hint style="warning" %}
**Preview.** The MetaFlux EVM is design-stable but **not yet live on devnet** — the
cadence, gas, and chain-id values below are the target design and may be tuned
before launch. Build against the shape, not the exact constants.
{% endhint %}

The MetaFlux EVM is a [revm](https://github.com/bluealloy/revm)-based sidechain
that produces **two flavours of block on one chain**, so latency-sensitive calls
get a fast lane while heavy work gets room to run.

| Block | Cadence | Gas limit (target) | Intended for |
|-------|---------|--------------------|--------------|
| **Small** | every **~1 s** | ~2 M | trading, transfers, **CoreWriter** calls — anything latency-sensitive |
| **Large** | every **~60 s** | ~30 M | contract **deployment** + batch settlement / heavy compute |

Key properties:

- **One linear block-number sequence.** Small and Large blocks share a single,
  monotonically-increasing EVM block number — there are not two separate chains.
  `block.number` advances by 1 each block regardless of flavour.
- **Deterministic timestamps.** `block.timestamp` is injected from L1 consensus
  (not wall-clock), so every validator builds a byte-identical block from the same
  committed tip. No `SystemTime`, no per-node drift.
- **EIP-1559 base-fee burn.** The base fee is burned at the coinbase (a burn
  address) rather than paid to a proposer.
- **Parallel execution.** Block construction uses a Block-STM-style parallel
  executor; the committed post-state is identical to a sequential replay (the
  determinism contract), so ordering is never thread-dependent.

Why two block sizes: a cheap limit order or a CoreWriter action should not wait
behind a 5 M-gas contract deployment. Routing deploys/heavy compute to the slower
Large block keeps the Small block's ~1 s cadence predictable for trading bots.

The EVM exposes a standard JSON-RPC (`eth_*`) and reports its own chain id via
`eth_chainId` — see [Networks & chain IDs](../networks.md). It is deliberately
**not** `998` / `999` (those are Hyperliquid's).

## See also

- [Interacting with Core](interacting-with-core.md) — precompiles (read) + CoreWriter (write)
- [Interaction timings](interaction-timings.md) — when a CoreWriter action / a Core→EVM credit actually lands
