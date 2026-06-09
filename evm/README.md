# EVM

{% hint style="success" %}
**Live on devnet.** EVM execution and CoreWriter actions are operational, as are
the stateless MTF derivatives precompiles (`0x0900`–`0x0904`). Core-state-backed
read precompiles (querying the chain's own positions / book directly) and the
cross-chain precompiles are upcoming. The [bridge](../bridge/) is live.
{% endhint %}

The MetaFlux EVM is a [revm](https://github.com/bluealloy/revm)-based **sidechain**
that runs ordinary Solidity contracts and exposes MetaFlux **Core** — the L1 perps
clearinghouse and on-chain CLOB — to those contracts. It is the MetaFlux analogue
of HyperEVM ↔ HyperCore.

## What's different from a vanilla EVM

- **Unified block, parallel strata** — one block per consensus round (sub-second);
  its transactions are partitioned into parallel conflict-strata, so throughput
  scales with cores and even contract deployments confirm in the next block (no
  60-second heavy-block lane). See [Execution model](execution-model.md).
- **Core access built in** — contracts read Core via **system precompiles** and
  write to Core via the **CoreWriter** system contract. See
  [Interacting with Core](interacting-with-core.md).
- **Deterministic** — consensus-injected timestamps, no floats, parallel execution
  with a sequential-equivalent committed state.
- **EIP-1559 base-fee burn** to a burn-address coinbase.

## Pages

| Page | What |
|------|------|
| [Execution model](execution-model.md) | Unified block, parallel conflict-strata, gas/fees, MEV-resistant trading |
| [Interacting with Core](interacting-with-core.md) | CoreWriter write path (the 20 actions) + the read precompiles |
| [Core ↔ EVM transfers](core-evm-transfers.md) | Moving value between Core and the EVM (and cross-chain) |
| [Interaction timings](interaction-timings.md) | When a CoreWriter action / a Core→EVM credit actually lands |

## System addresses (at a glance)

| Address | Role |
|---------|------|
| `0x3333…3333` | **CoreWriter** — submit L1 actions (`sendRawAction`) |
| `0x0900`–`0x0904` | derivatives read precompiles (margin, NAV, ADL, mark-settle, RFQ) |
| `0x0906`–`0x0908` | market-data read precompiles (BBO, L2 depth, inventory risk) |
| `0x0a01`–`0x0a02` | cross-chain precompiles (send / verify) |

## JSON-RPC

Standard `eth_*` JSON-RPC at `POST /evm` on the gateway; the chain reports its own
id via `eth_chainId` (see [Networks & chain IDs](../networks.md)). Deployable
contracts live in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo.
