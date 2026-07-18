# EVM

:::tip
**Live on devnet.** EVM execution and CoreWriter actions are operational, as are
the stateless MTF derivatives precompiles (`0x0900`–`0x0904`). Core-state-backed
read precompiles (querying the chain's own positions / book directly) are upcoming.
The [bridge](../bridge/) is live.
:::

The MetaFlux EVM is a [revm](https://github.com/bluealloy/revm)-based **sidechain**
that runs ordinary Solidity contracts and exposes MetaFlux **Core** — the L1 perps
clearinghouse and on-chain CLOB — to those contracts: an EVM execution layer wired
directly into the L1 it settles against.

## What's different from a vanilla EVM {#whats-different-from-a-vanilla-evm}

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

## Pages {#pages}

| Page | What |
|------|------|
| [Execution model](execution-model.md) | Unified block, parallel conflict-strata, gas/fees, MEV-resistant trading |
| [Interacting with Core](interacting-with-core.md) | CoreWriter write path (the 20 actions) + the read precompiles |
| [Core ↔ EVM transfers](core-evm-transfers.md) | Moving value between Core and the EVM (and cross-chain) |
| [Interaction timings](interaction-timings.md) | When a CoreWriter action / a Core→EVM credit actually lands |

## System addresses (at a glance) {#system-addresses-at-a-glance}

| Address | Role |
|---------|------|
| `0x3333…3333` | **CoreWriter** — submit L1 actions (`sendRawAction`), including the cross-chain `CrossChainSend` |
| `0x0900`–`0x0904` | derivatives read precompiles (margin, NAV, ADL, mark-settle, RFQ) |
| `0x0906`–`0x0908` | market-data read precompiles (BBO, L2 depth, inventory risk) |

## JSON-RPC {#json-rpc}

Standard `eth_*` JSON-RPC at `POST /evm` on the gateway; the chain reports its own
id via `eth_chainId` (see [Networks & chain IDs](../networks.md)). Deployable
contracts live in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo.

### Transaction submission {#transaction-submission}

Transactions are submitted via the standard Ethereum method `eth_sendRawTransaction`
with an RLP-encoded signed transaction. The network verifies that the signature
recovers to the declared sender address — this is a deterministic security check that
prevents unsigned or malformed transactions from entering the chain. Standard EVM
clients and wallets that correctly sign transactions see no change; the verification
is automatic and transparent.

### WebSocket subscriptions {#websocket-subscriptions}

Realtime push is available over a WebSocket on the **same** `/evm` endpoint —
`ws://…/evm` (or `wss://` behind TLS). Standard EVM tooling (ethers, viem, wagmi)
that dials a WebSocket transport gets both regular request/reply (`eth_call`,
`eth_getLogs`, `eth_sendRawTransaction`, …) and `eth_subscribe` push notifications
on the one connection.

Subscribe with `eth_subscribe`, unsubscribe with `eth_unsubscribe`; the server
pushes each update as a standard `eth_subscription` notification:

```json
{"jsonrpc":"2.0","method":"eth_subscription","params":{"subscription":"0x…","result":{ … }}}
```

Three channels are supported:

| Channel | Emits |
|---------|-------|
| `newHeads` | the block header of each newly **committed** EVM block |
| `logs` (with an `{address, topics}` filter) | each matching log in each newly committed block — identical matching to `eth_getLogs` |
| `newPendingTransactions` | see the note below |

Subscriptions are **forward-only** — they stream blocks committed *after* you
subscribe, with no historical backfill (use `eth_getLogs` / `eth_getBlockByNumber`
for history). Because MetaFlux has single-slot BFT finality a committed block never
reorgs, so streamed logs are never `removed` and `newHeads` never rewinds.

> **`newPendingTransactions` = newly *committed* transactions, not a mempool feed.**
> MetaFlux exposes no public pending mempool, so this channel emits the hashes of
> transactions the instant they **commit** in a new block — the same timing as
> `newHeads`, not the pre-confirmation timing a geth mempool feed gives. If you call
> `watchPendingTransactions()` (viem) / `eth_subscribe(["newPendingTransactions"])`
> expecting pre-confirmation hashes, note that on MetaFlux they arrive at commit.

`eth_subscribe` / `eth_unsubscribe` are **WebSocket-only**; calling them over
`POST /evm` returns a JSON-RPC error directing you to a WebSocket connection.
