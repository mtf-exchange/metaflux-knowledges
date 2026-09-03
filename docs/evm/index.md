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
- **State plus receipts** — the chain keeps account state and serves it at the
  tip. It stores no past block bodies. It does keep every receipt and log it
  produces, in a durable **receipt store**, so `eth_getTransactionReceipt`,
  `eth_getLogs` and `eth_getBlockReceipts` answer over the whole range that store
  holds. See [Receipts and logs](#receipts-and-logs).

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
returns today's value. Receipts and logs are the one durable exception — see
[Receipts and logs](#receipts-and-logs). Read [Method support](#method-support)
and [What the node keeps](#what-the-node-keeps) before you write a client.
:::

:::info Not live until the next release
Four things change in the next release: the two block reads, the `eth_call`
block environment, the block header's `miner`, and the whole of
[Receipts and logs](#receipts-and-logs). **The live chain still serves the old
behaviour**: the block reads answer every request with the tip, `eth_call` runs
against a placeholder environment, `miner` reads all-zero, receipts live in
memory and die with the process, and `eth_getBlockReceipts` is not a method.
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
| `eth_getLogs` | **honoured** | `fromBlock` / `toBlock` scan the [receipt store](#receipts-and-logs). A range starting before the earliest block is refused with `-32001`, an oversized scan with `-32005`, a `blockHash` filter with `-32602` |
| `eth_getBlockReceipts` | **honoured** | every receipt of one block, in `transactionIndex` order. A block before the earliest block is refused with `-32001` |
| `eth_getTransactionByHash` | none | `null` for an unknown hash |
| `eth_getTransactionReceipt` | none | `null` means "not mined at or after the earliest block" — see [below](#null-is-not-never-existed) |
| `eth_sendRawTransaction` | none | see [Transaction submission](#transaction-submission) |
| `eth_sendTransaction` | none | refused with `-32000`: the node holds no user keys |
| `eth_subscribe` · `eth_unsubscribe` | none | WebSocket only; over HTTP they return `-32000` |

Any other method returns JSON-RPC error `-32601`.

**An ignored block tag is never an error.** The call succeeds and returns current
data. A query for a past balance returns today's balance, with no signal that the
tag did nothing. Do not read a historical value through this RPC.

The four **honoured** and **tip only** rows are the exception: they refuse a
reference they cannot serve instead of answering with something else.

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

### Receipts and logs {#receipts-and-logs}

:::warning Live behaviour today
**On the live chain a receipt lives in memory only, and a release forgets it.**
Every row in this section arrives with the next release. Until it lands, read a
receipt promptly after you send the transaction, and keep the result yourself.
:::

Receipts are the one part of EVM history the chain keeps. Each node writes the
receipt and the logs of every committed EVM transaction into a durable **receipt
store** on disk. `eth_getTransactionReceipt`, `eth_getTransactionByHash`,
`eth_getLogs` and `eth_getBlockReceipts` all answer from that store. A receipt
survives a node restart, and it survives a release.

The store sits outside the state commitment, so keeping it costs consensus
nothing. Two nodes with different receipt retention still agree on state.

#### The series starts when the feature ships {#no-backfill}

**There is no backfill, and there will not be one.** No node holds the raw
transactions of a past block, so no node can re-derive a receipt it did not
write. The store's **earliest block** is the first EVM block the new binary
executes. Every receipt from before that block is gone.

Ask for a range that starts before the earliest block and the request fails:

```json
{
  "jsonrpc": "2.0", "id": 1,
  "error": {
    "code": -32001,
    "message": "history unavailable before block 0x2f1a3",
    "data": { "earliestBlock": "0x2f1a3" }
  }
}
```

`eth_getLogs` and `eth_getBlockReceipts` both raise it.

**The whole request fails. You never get a partial answer.** This is deliberate.
A partial answer looks exactly like a complete one for the range you asked for,
so the missing part is written into your own store as "nothing happened here"
and nothing later corrects it. That is how an indexer corrupts itself silently.
An error you must handle costs less than a gap you never find.

Read `data.earliestBlock` and start your index at that block.

#### `null` is not "never existed" {#null-is-not-never-existed}

`eth_getTransactionReceipt` answers `null` for a hash it cannot find. On a node
with a receipt store that `null` carries one exact meaning:

> **The transaction was not mined at or after `earliestBlock`.**

The store never deletes a lookup row. A transaction that landed at or after the
earliest block therefore always resolves. So a `null` says one of two things: the
transaction never landed, or it landed before the earliest block.

**This is the row integrators get wrong.** Here is how each kind of caller
separates the two:

- **A poller** asks about a transaction it has just sent. That transaction is
  always at or after the earliest block, so `null` means "not mined yet" and
  nothing else. Keep polling.
- **An indexer** walks the chain by range. It meets the earliest block as a
  `-32001` from `eth_getLogs`, and that error names the block. Before that block
  the indexer must not index at all. At or after it, a `null` is a true "never
  existed".

Do not guess from a bare `null`. Ask for the range and read the error.

#### A range scan is bounded {#scan-bound}

`eth_getLogs` reads the store row by row. There is no address index, so a wide
range costs real work on a validator. The scan counts the rows it reads and
stops at **100,000**:

```json
{
  "jsonrpc": "2.0", "id": 1,
  "error": {
    "code": -32005,
    "message": "log scan exceeded the row budget; narrow fromBlock/toBlock",
    "data": { "maxRowsScanned": 100000 }
  }
}
```

Narrow `fromBlock` / `toBlock` and send the query again. Several narrow queries
return the same logs as one wide query, because a committed block never reorgs.

#### Log ordering changes {#log-ordering}

A log now carries its real position in its block. **This changes what the live
chain returns today.**

| Field | Was | Is |
|---|---|---|
| `transactionIndex` | always `"0x0"`, on every log and every receipt | the transaction's real position in its block |
| `logIndex` | counted per transaction, so it restarted at `0x0` on each receipt | counted per block, so it is unique inside the block |

**Check any code that keys a log by `(blockNumber, logIndex)`.** Under the old
behaviour two logs in one block could share that key, so a de-duplicating store
dropped one of them. Under the new behaviour the key is unique, which is what
every other EVM chain gives you.

`eth_getLogs` returns logs in `(block, transactionIndex, logIndex)` order.

#### A node without the store {#no-store-node}

The receipt store is opt-in per node. A node that runs without it keeps a
bounded in-memory window instead: recent receipts only, emptied by a restart.
Such a node reports its own `earliestBlock` and refuses anything before it with
the same `-32001`. The error shape does not change, so one client handles both.

### What the node keeps {#what-the-node-keeps}

| Data | Kept? |
|------|-------|
| Account state — balances, nonces, contract code, contract storage | **Yes**, as committed state, readable at the tip |
| Receipts and logs | **Yes**, on disk, from the [earliest block](#no-backfill) forward |
| Block bodies — the transaction list of any block | **No** |
| Block hashes | **No** |

A node keeps **state** and **receipts**. It keeps no block bodies. State is what
every node must agree on; a past block body is not, so nothing on the chain is
obliged to carry it. Receipts are kept because a caller cannot work without
them: a transaction that certainly landed must stay provable.

**The `[]` trap is gone.** An empty `eth_getLogs` result used to mean either "the
record was emptied" or "nothing matched", and no caller could tell which. The
store refuses a range it does not hold, so an empty array now means one thing:
nothing matched.

### Where to get past data {#where-to-get-past-data}

- **Receipts and logs come from the RPC.** `eth_getLogs` and
  `eth_getBlockReceipts` serve every block from the
  [earliest block](#no-backfill) forward. You no longer have to mirror them.
- **Block bodies have no source.** No node stores a transaction list, so no
  method returns one. Subscribe to `newHeads` and record what you need as it
  arrives.
- **Core trading history comes from the native API**, not from the EVM RPC. Fills,
  orders, funding and closed positions are served by
  [`POST /info`](../api/rest/info.md) and by
  [position history](../api/rest/info/position-history.md).

:::note
**Receipt persistence is decided. Block-body persistence is not.** The chain
keeps receipts and logs. It keeps no transaction lists and no block hashes, and
that is not a scheduled change, so do not design against it.
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
subscribe, and no subscription backfills. For past logs call `eth_getLogs`, which
serves them from the [earliest block](#no-backfill) forward. For past block
bodies there is no source at all, because nothing stores them (see
[What the node keeps](#what-the-node-keeps)). Because MetaFlux has single-slot
BFT finality a committed block never reorgs, so streamed logs are never `removed`
and `newHeads` never rewinds.

> **`newPendingTransactions` = newly *committed* transactions, not a mempool feed.**
> MetaFlux exposes no public pending mempool, so this channel emits the hashes of
> transactions the instant they **commit** in a new block — the same timing as
> `newHeads`, not the pre-confirmation timing a geth mempool feed gives. If you call
> `watchPendingTransactions()` (viem) / `eth_subscribe(["newPendingTransactions"])`
> expecting pre-confirmation hashes, note that on MetaFlux they arrive at commit.

`eth_subscribe` / `eth_unsubscribe` are **WebSocket-only**; calling them over
`POST /evm` returns a JSON-RPC error directing you to a WebSocket connection.
