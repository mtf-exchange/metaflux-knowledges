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

- **Unified block, parallel strata** — one block per fixed period (1000 ms by
  default, decoupled from the faster consensus round rate); its transactions
  are partitioned into parallel conflict-strata, so throughput scales with
  cores and even contract deployments confirm through the same lane as trading
  (no 60-second heavy-block lane). See [Execution model](execution-model.md).
- **Core access built in** — contracts read Core via **system precompiles** and
  write to Core via the **CoreWriter** system contract. See
  [Interacting with Core](interacting-with-core.md).
- **Deterministic** — consensus-injected timestamps, no floats, parallel execution
  with a sequential-equivalent committed state.
- **EIP-1559 base-fee burn** to a burn-address coinbase.
- **State, not history** — the chain keeps account state and serves it at the
  tip. It stores no past block bodies and no receipt archive, so the JSON-RPC
  serves no historical read. See [State and history](execution-model.md#state-and-history).

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

:::warning
**The RPC answers at the chain tip. It is not an archive node.**
Several methods accept a block tag and ignore it, so a query for a past value
returns today's value. Read [Method support](#method-support) and
[What the node keeps](#what-the-node-keeps) before you write a client.
:::

:::info Not live until the next release
The two block reads and the `eth_call` block environment change in the next
release, and so does the block header's `miner`. **The live chain still serves
the old behaviour**: the block reads answer every request with the tip,
`eth_call` runs against a placeholder environment, and `miner` reads all-zero.
This page states the shipped target, and each affected row says what the live
chain does today. See the
[upgrade notice](../api/upgrade-notice-ids-and-shapes.md#evm-rpc).
:::

### Method support {#method-support}

**Block tag** means the `latest` / `pending` / `0x<number>` argument, or the block
hash that `eth_getBlockByHash` takes.

| Method | Block tag | Notes |
|--------|-----------|-------|
| `eth_chainId` · `net_version` · `net_listening` · `web3_clientVersion` | none | |
| `eth_blockNumber` | none | the committed EVM tip |
| `eth_getBalance` | **ignored** | reads the tip |
| `eth_getTransactionCount` | **ignored** | reads the tip |
| `eth_getCode` | **ignored** | reads the tip |
| `eth_getStorageAt` | **ignored** | reads the tip |
| `eth_call` | **ignored** | runs at the tip; see [the block environment](#eth_call-block-environment) |
| `eth_estimateGas` | **ignored** | an intrinsic-gas formula, not a simulation; see [below](#eth_estimategas-is-a-lower-bound) |
| `eth_gasPrice` · `eth_maxPriorityFeePerGas` | none | fixed informational values; there is no priority-fee market |
| `eth_feeHistory` | range echoed | the shape is correct, the numbers are constants: `gasUsedRatio` is `0` and every `reward` is `0x0` |
| `eth_getBlockByNumber` | **tip only** | a tag, or the tip's own number, returns the tip header; every other reference returns `null` — see [below](#the-block-reads-serve-the-tip-only) |
| `eth_getBlockByHash` | **tip only** | only the tip's hash resolves; every other hash returns `null` |
| `eth_getLogs` | **honoured** | `fromBlock` / `toBlock` scan the recorded receipts; a `blockHash` filter is refused with `-32602` |
| `eth_getTransactionByHash` | none | `null` for an unknown hash |
| `eth_getTransactionReceipt` | none | `null` for an unknown hash |
| `eth_sendRawTransaction` | none | see [Transaction submission](#transaction-submission) |
| `eth_sendTransaction` | none | refused with `-32000`: the node holds no user keys |
| `eth_subscribe` · `eth_unsubscribe` | none | WebSocket only; over HTTP they return `-32000` |

Any other method returns JSON-RPC error `-32601`.

**An ignored block tag is never an error.** The call succeeds and returns current
data. A query for a past balance returns today's balance, with no signal that the
tag did nothing. Do not read a historical value through this RPC. The two block
reads are the exception: they refuse a reference they cannot serve.

#### The block reads serve the tip only {#the-block-reads-serve-the-tip-only}

The node stores no EVM block bodies, so the tip is the only block it can answer
for. The two reads say so instead of guessing.

| Request | Answer |
|---------|--------|
| `latest` · `pending` · `safe` · `finalized` | the tip header |
| the tip's own number | the tip header |
| `earliest`, a past number, a future number, anything unparsable | `null` |
| `eth_getBlockByHash` with the tip's hash | the tip header |
| `eth_getBlockByHash` with any other hash | `null` |

`null` is the standard JSON-RPC answer for "no such block", and every EVM client
already handles it.

:::warning Live behaviour today
**The live chain returns the TIP for every request instead.** Three calls for
`0x1`, `0x3e8` and `0x186a0` came back with three different rising numbers, each
one the tip at the moment of the call. The body is well formed and carries a
`number` the caller never asked for, so a client that trusts it indexes the wrong
block and sees no error.

**Until the release lands, compare the echoed `number` with the number you
requested and treat a mismatch as a failure.** That guard is correct against both
behaviours, so write it once and keep it.
:::

Every header also carries fixed placeholder fields, on the HTTP read and on the
`newHeads` stream alike:

| Field | Value | Why |
|-------|-------|-----|
| `transactions` | `[]`, even when you pass `true` | no block body is stored |
| `gasUsed` | `0x0` | the transaction list it sums is not stored |
| `transactionsRoot` · `receiptsRoot` · `stateRoot` | all-zero | left zero rather than faked |
| `hash` · `parentHash` | the block number in the low 8 bytes | a number-keyed derivation, not a hash of the block |
| `miner` | the burn coinbase | the address EIP-1559 base fees burn to, so the header agrees with the `COINBASE` an execution sees |

Do not treat `hash` as a commitment to the block contents, and do not use it to
detect a reorg. Single-slot BFT finality means a committed block never reorgs.
`hash` is number-keyed, so `eth_getBlockByHash` round-trips against the
`blockHash` that receipts, transactions and logs report.

#### `eth_call` runs in the committed block environment {#eth_call-block-environment}

`eth_call` executes real contract code against real committed state, so the
return value is correct for the state at the tip. The block environment around
that execution now mirrors what the committed block builder derives from the same
state, so a simulation and a real execution read the same opcodes:

| Opcode | `eth_call` returns |
|--------|--------------------|
| `NUMBER` | the EVM tip |
| `TIMESTAMP` | the consensus-derived block time, in seconds |
| `COINBASE` | the burn coinbase |
| `GASLIMIT` · `BASEFEE` | the governed committed values, not baked constants — a governance change moves both sides together |
| `PREVRANDAO` | `0x0` |
| `BLOCKHASH` | `0x0`, for every number |

`BLOCKHASH` still needs its own rule: **do not build on it.** The chain keeps no
block hashes (see [What the node keeps](#what-the-node-keeps)), so `0x0` is what
committed execution itself returns. A contract that uses `blockhash()` for
randomness or as a proof gets zero, not entropy.

:::warning Live behaviour today
**The live chain runs `eth_call` in a placeholder environment**, so a simulation
disagrees with the execution it simulates, with no error either way: `TIMESTAMP`
reads `0x1`, `COINBASE` and `PREVRANDAO` read `0x0`, `GASLIMIT` and `BASEFEE` are
baked constants, and `BLOCKHASH` returns a value derived from the requested
number instead of `0x0`.

**A `view` function that branches on `block.timestamp` — an expiry, a deadline, a
funding window — therefore simulates against timestamp 1 and can return the wrong
branch.** Until the release lands, pass the time in as an argument when the
simulation has to be correct.
:::

#### `eth_estimateGas` is a lower bound {#eth_estimategas-is-a-lower-bound}

`eth_estimateGas` charges the intrinsic-gas rule only: the base cost, the creation
surcharge, and the per-calldata-byte cost. It runs no execution and it does no
binary search. A call that touches storage costs more than the estimate. Set your
own gas limit for anything past a plain transfer.

### What the node keeps {#what-the-node-keeps}

| Data | Kept? |
|------|-------|
| Account state — balances, nonces, contract code, contract storage | **Yes**, as committed state, readable at the tip |
| Block bodies — the transaction list of any block | **No** |
| Receipts and logs | **In memory only**, recent and bounded |
| Block hashes | **No** |

A node keeps **state**, not **history**. State is what every node must agree on;
a past block body is not. So no store sits behind a historical read, and the RPC
cannot grow one by adding a method. This is a deliberate shape, not an outage.

**Receipts and logs are the one partial exception.** A node records the receipt
and the logs of each committed EVM transaction in memory. `eth_getLogs`,
`eth_getTransactionByHash` and `eth_getTransactionReceipt` answer from that
record, and `eth_getLogs` honours `fromBlock` / `toBlock` over it. The record is
bounded by count and it does not survive a node restart. Treat it as a live tail,
never as an archive.

That bound carries a trap: an emptied record and a genuine "nothing matched" both
answer `[]`. You cannot tell them apart at the wire. Never read an empty result as
proof that nothing happened.

### Where to get past data {#where-to-get-past-data}

- **Record it yourself, as it arrives.** Subscribe to `newHeads` and `logs` over
  the WebSocket and write what you need into your own store. This is the only
  reliable source of EVM history, and it starts at the moment you connect.
- **Read a receipt promptly.** After `eth_sendRawTransaction`, poll
  `eth_getTransactionReceipt` and keep the result. Do not plan to fetch it later.
- **Core trading history comes from the native API**, not from the EVM RPC. Fills,
  orders, funding and closed positions are served by
  [`POST /info`](../api/rest/info.md) and by
  [position history](../api/rest/info/position-history.md).

:::note
Whether the chain persists EVM history is an open product decision. It is not a
scheduled change, so do not design against it. This page states what the surface
does today, and it is updated in the same batch as any change to that surface.
:::

### Batch requests {#batch-requests}

`POST /evm` accepts a single JSON-RPC request object **or** a JSON array of them.
An array is dispatched element by element and answered as an array **in the same
order**, so element `i` of the response answers element `i` of the request. A
failing element yields its own JSON-RPC error object; it does not fail the other
elements and it does not fail the request.

A batch carries at most **100** elements. A larger array is rejected whole with
JSON-RPC error **`-32600`** (invalid request) — the elements are not partially
served, so you never have to work out which prefix ran. The refusal itself is
charged at the full cap of 100 weight, and so is an array whose element count the
gateway cannot parse. Malformed is never the cheap lane.

A batch costs **rate-limit weight equal to its element count**: 40 elements cost
40, the same as 40 separate calls. Batching saves round trips and connections; it
does not buy cheaper access. See [rate limits](../api/rate-limits.md).

The cap and the weight exist for the same reason. Each element is dispatched
independently, so one array is one request that can ask for unbounded work — an
uncapped, unweighted batch turns a single connection into an unmetered lane past
every per-request budget on the gateway.

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

A `newHeads` frame carries the same header shape the HTTP block read returns,
including the same placeholder fields — see
[The block reads serve the tip only](#the-block-reads-serve-the-tip-only).

Subscriptions are **forward-only** — they stream blocks committed *after* you
subscribe. There is no historical backfill, and no other method backfills either:
the EVM RPC serves no history at all, because nothing stores it (see
[What the node keeps](#what-the-node-keeps)). Record what you need as it arrives.
Because MetaFlux has single-slot BFT finality a committed block never reorgs, so
streamed logs are never `removed` and `newHeads` never rewinds.

> **`newPendingTransactions` = newly *committed* transactions, not a mempool feed.**
> MetaFlux exposes no public pending mempool, so this channel emits the hashes of
> transactions the instant they **commit** in a new block — the same timing as
> `newHeads`, not the pre-confirmation timing a geth mempool feed gives. If you call
> `watchPendingTransactions()` (viem) / `eth_subscribe(["newPendingTransactions"])`
> expecting pre-confirmation hashes, note that on MetaFlux they arrive at commit.

`eth_subscribe` / `eth_unsubscribe` are **WebSocket-only**; calling them over
`POST /evm` returns a JSON-RPC error directing you to a WebSocket connection.
