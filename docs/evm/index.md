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
  tip. It keeps every receipt and log it produces, in a durable **receipt store**,
  and the block reads rebuild a block from that store, so
  `eth_getTransactionReceipt`, `eth_getLogs`, `eth_getBlockReceipts` and
  `eth_getBlockByNumber` all answer over the whole range it holds. It keeps the
  raw signed transaction from this release forward (no backfill) and stores no
  block hashes. See [Receipts and logs](#receipts-and-logs) and
  [the transaction object](#the-transaction-object).

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
| `eth_getStorageAt` | **ignored** | reads the tip. The slot is a QUANTITY, so `0x9` and the padded 64-digit form name the same key; a full 32-byte slot (every `keccak256(key . slot)` mapping slot) is accepted. Over 64 hex digits is refused with `-32602` |
| `eth_call` | **ignored** | runs at the tip; see [the block environment](#eth_call-block-environment) |
| `eth_estimateGas` | **ignored** | a real execution at the tip; see [below](#eth_estimategas-executes) |
| `eth_gasPrice` · `eth_maxPriorityFeePerGas` | none | fixed informational values; there is no priority-fee market |
| `eth_feeHistory` | range echoed | the shape is correct, the numbers are constants: `gasUsedRatio` is `0` and every `reward` is `0x0` |
| `eth_getBlockByNumber` | **honoured** | any block from the earliest block to the tip; see [below](#the-block-reads) |
| `eth_getBlockByHash` | **honoured** | the hash is number-keyed, so it resolves the same range |
| `eth_getBlockTransactionCountByNumber` · `eth_getBlockTransactionCountByHash` | **honoured** | the transaction count of one block |
| `eth_getTransactionByBlockNumberAndIndex` · `eth_getTransactionByBlockHashAndIndex` | **honoured** | one transaction by position; `null` past the end |
| `eth_getLogs` | **honoured** | `fromBlock` / `toBlock` scan the [receipt store](#receipts-and-logs). A range starting before the earliest block is refused with `-32001`, an oversized scan with `-32005`, a `blockHash` filter with `-32602` |
| `eth_getBlockReceipts` | **honoured** | every receipt of one block, in `transactionIndex` order. A block before the earliest block is refused with `-32001` |
| `eth_getTransactionByHash` | none | `null` for an unknown hash |
| `eth_getTransactionReceipt` | none | `null` means "not mined at or after the earliest block" — see [below](#null-is-not-never-existed) |
| `eth_sendRawTransaction` | none | see [Transaction submission](#transaction-submission) |
| `eth_sendTransaction` | none | refused with `-32000`: the node holds no user keys |
| `eth_subscribe` · `eth_unsubscribe` | none | WebSocket only; over HTTP they return `-32000` |
| `eth_syncing` | none | `false` once replay finished. While the node is replaying it answers the progress object instead, because the RPC is already serving then and a `false` would say the reads can be trusted |
| `eth_accounts` | none | always `[]` — the node custodies no keys, so it can name no account. Sign locally |
| `eth_coinbase` | none | the same address every block header names as `miner` |
| `eth_getUncleCountByBlockNumber` · `eth_getUncleCountByBlockHash` | accepted | always `0x0` |
| `eth_getUncleByBlockNumberAndIndex` · `eth_getUncleByBlockHashAndIndex` | accepted | always `null` |
| `eth_mining` · `eth_hashrate` | none | `false` and `0x0`. There is no proof of work here |

Any other method returns JSON-RPC error `-32601`.

**Three absences are deliberate, not gaps.** A stub for any of them would be a
lie a caller cannot detect:

| Method | Why it does not exist |
|--------|-----------------------|
| `eth_getProof` | The app hash is a fold, not a Merkle-Patricia trie. There is no proof to return, so there is nothing to verify against |
| `eth_createAccessList` | Access lists cost nothing here — the gas schedule has no EIP-2929 warm/cold split to pre-pay |
| `net_peerCount` | Consensus topology is not a client read |

**There are no uncles at any height, ever.** The chain finalizes one block per
consensus round and orphans none, so the uncle reads are constants and the block
header's `sha3Uncles` is always the empty-list hash. Do not walk them.

**An ignored block tag is never an error.** The call succeeds and returns current
data. A query for a past balance returns today's balance, with no signal that the
tag did nothing. Do not read a historical value through this RPC.

The **honoured** rows are the exception: they refuse a reference they cannot
serve instead of answering with something else.

#### The block reads {#the-block-reads}

A block read answers for any block from the earliest block the node retains to
the committed tip. Outside that span it says which way it is outside, and the two
answers mean different things.

| Request | Answer |
|---------|--------|
| `latest` · `pending` · `safe` · `finalized` | the tip |
| `earliest` | the earliest block the node retains |
| a number in `[earliest, tip]` | that block |
| a number above the tip | `null` — that block does not exist YET |
| a number below the earliest block | `-32001`, with `data.earliestBlock` |
| `eth_getBlockByHash` with a number-keyed hash in range | that block |
| `eth_getBlockByHash` with any other hash | `null` |

##### There is more than one earliest block {#two-floors}

**The block reads and the receipt reads keep separate histories, so they have
separate floors, and the block floor is usually the HIGHER of the two.** Two
different stores back them and each prunes on its own schedule.

Measured on the public testnet in one moment:

```
eth_getBlockByNumber("0x1")  -> -32001  data.earliestBlock 0x37de4   (229348)
eth_getBlockReceipts("0x1")  -> -32001  data.earliestBlock 0x28261   (164449)
eth_getLogs from 0x1         -> -32001  data.earliestBlock 0x28261   (164449)
```

Nearly 65,000 blocks apart. A caller that reads the floor from `eth_getLogs` and
then walks with `eth_getBlockByNumber` meets `-32001` long before it reaches the
number it was told, and the walk looks broken when it is not.

**Read the floor from the SAME method you intend to call**, and re-read it: a
floor RISES as the node prunes, and it rises in steps rather than one block at a
time, so a value cached at the start of a long backfill goes stale beneath you.

One out-of-range request is all it takes — ask for block `0x1` and read
`data.earliestBlock` off the error. There is no bisection and no separate
endpoint.

**`null` and `-32001` are not interchangeable.** `null` means "not yet"; poll
again and it will appear. `-32001` means "gone, and it is not coming back";
polling never resolves it. A client that treats the second as the first retries
for ever.

`transactions` and `gasUsed` are real. Pass `true` as the second argument for
whole transaction objects, `false` (or nothing) for hashes. An **empty block is a
real block**: it renders with `transactions: []` and `gasUsed: 0x0`, which is a
different answer from `null`.

`timestamp` is the value the `TIMESTAMP` opcode saw in that block, recorded per
block. It is not the time the node answered you.

##### Fields that stay placeholders

These are permanent, not a gap waiting on a release. MTF commits no block header,
so there is no root to report and nothing to hash. They are on the HTTP read and
the `newHeads` stream alike.

| Field | Value | Why |
|-------|-------|-----|
| `transactionsRoot` · `receiptsRoot` · `stateRoot` | all-zero | no header is committed, so there is no root; left zero rather than faked |
| `logsBloom` | all-zero | same; filter with `eth_getLogs` instead |
| `hash` · `parentHash` | the block number in the low 8 bytes | a number-keyed derivation, not a hash of the block |
| `size` · `difficulty` · `totalDifficulty` | `0x0` | no encoded block, no proof of work |
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

#### `eth_estimateGas` executes {#eth_estimategas-executes}

`eth_estimateGas` runs the call through the same simulation `eth_call` uses, then
returns the larger of two figures: the gas the run consumed BEFORE its refund, and
the EIP-7623 calldata floor.

Both terms are load-bearing. A receipt reports gas AFTER the refund, and EIP-3529
lets that be a fifth lower than what the transaction needed to run — a limit set
from a receipt runs out of gas on anything that clears storage. The floor binds in
the other direction: a calldata-heavy transaction is charged the floor even when
it executes for less.

One execution, no binary search. **It does not cover a contract that branches on
`gasleft()`.** Pass an explicit `gas` if yours does.

### Receipts and logs {#receipts-and-logs}

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

#### The transaction object {#the-transaction-object}

`eth_getTransactionByHash`, the two by-index reads, and a full transaction
object embedded in a block read all render from the receipt store. From this
release forward the store keeps the raw signed transaction, so these fields
are the real signed values, not placeholders:

| Field | Value |
|-------|-------|
| `type` | the real envelope type: `0x0` legacy, `0x2` EIP-1559 |
| `gas` | the gas limit the sender SIGNED |
| `gasPrice` | the price the sender SIGNED: the legacy `gasPrice`, or an EIP-1559 transaction's `maxFeePerGas` |
| `maxFeePerGas` · `maxPriorityFeePerGas` | present on an EIP-1559 transaction only; absent on a legacy one |
| `input` | the real calldata |
| `v` · `r` · `s` | the real signature |

**Three fields changed meaning, not just value.**

- `gas` held the gas the transaction USED. Now it holds the gas LIMIT the
  sender signed. A client that still renders it as "gas used" reports the
  wrong number.
- `gasPrice` was a fixed value, the same number `eth_gasPrice` returns. Now it
  is the price the sender actually signed.
- `type` was always `0x0`. Now it is the real envelope type, so an EIP-1559
  transaction reads `0x2`.

##### Rows with no raw bytes {#rows-with-no-raw-bytes}

Three kinds of row keep no raw bytes, and all three fall back to the OLD
placeholders:

- A transaction committed **before this release**. **There is no backfill**:
  its raw bytes were never stored, and none will be added later. The
  placeholder is permanent for that row.
- A **system-lane call**. No user signs it, so there is nothing to store.
- Any row served by a node that runs [without a receipt
  store](#no-store-node). Its in-memory window drops the raw bytes on
  arrival, so this applies to every transaction such a node serves, not only
  an old one.

A placeholder row renders:

| Field | Value |
|-------|-------|
| `type` | `0x0`, even when the sender actually used EIP-1559 |
| `gas` | the gas the transaction USED (the pre-release placeholder) |
| `gasPrice` | the same fixed value `eth_gasPrice` returns |
| `input` | `0x` |
| `v` | `0x0` |
| `r` · `s` | `0x0` (32 zero bytes) |

`maxFeePerGas` and `maxPriorityFeePerGas` are absent from a placeholder row,
whatever envelope the sender actually used.

**Tell the two apart from the signature, not from `gas` or `type`.** A real
secp256k1 signature never signs `r == 0`. So a non-zero `r` (or `s`) means
every field on that transaction is the real signed value; `r == 0x0` together
with `v == 0x0` means the row carries no raw bytes and every field above is
the old placeholder. Do not decide from `gas` or `type` alone — a
placeholder's gas-used value can coincidentally match a real gas limit, and
its `type` reads the same `0x0` a genuine legacy transaction also reports.

##### `contractAddress` stays null {#contractaddress-stays-null}

`contractAddress` on a receipt reads `null` for every transaction, deployment
included, on both old and new rows. This is unrelated to the raw-bytes change
above.

The field is carried, not missing: the receipt row reserves a slot for it, so
a future release can fill it in with no wire-shape change. It is never
populated today. revm reports the created address after a deployment runs,
but the node drops that address before it reaches the stored receipt. Read a
`null` here as "not implemented yet", not as a sign the deployment failed.

To learn a contract's address after a deployment, compute it locally from the
sender and the nonce — ethers v6 and viem both do this without an RPC call.

#### `mtfStatus` on a receipt {#mtf-status}

Every `eth_getTransactionReceipt` carries a non-standard `mtfStatus` field
alongside the standard `status`. `status` is spec-correct on its own: `0x1` for a
success, `0x0` for everything else. A client that ignores unknown fields is
unaffected.

`mtfStatus` says WHY a `0x0` happened, and it is the only place that distinction
is on the wire:

| `mtfStatus` | Meaning |
|-------------|---------|
| `success` | executed and succeeded |
| `reverted` | executed and reverted |
| `bad_nonce` | mined, never executed: the nonce did not match |
| `insufficient_funds` | mined, never executed: the sender could not pay |
| `not_executed_calldata` | mined, never executed: the calldata path was closed |

**Why it exists:** MTF receipts a transaction that failed a pre-check. Standard
Ethereum never includes such a transaction in a block, so a standard client
assumes any receipt means the nonce was consumed. On MTF that assumption is wrong
for the last three rows. Read `mtfStatus`, or read `gasUsed == 0x0`, before you
conclude a nonce was spent.

#### A node without the store {#no-store-node}

The receipt store is opt-in per node. A node that runs without it keeps a
bounded in-memory window instead: recent receipts only, emptied by a restart.
Such a node reports its own `earliestBlock` and refuses anything before it with
the same `-32001`. The error shape does not change, so one client handles both.

**This window drops the raw signed transaction on arrival**, to keep memory
bounded — see [rows with no raw bytes](#rows-with-no-raw-bytes). So every
transaction a store-less node serves carries the OLD placeholders, even one
signed and mined after this release. Point a client that needs the real signed
values at a node running the durable store instead.

### What the node keeps {#what-the-node-keeps}

| Data | Kept? |
|------|-------|
| Account state — balances, nonces, contract code, contract storage | **Yes**, as committed state, readable at the tip |
| Receipts and logs | **Yes**, on disk, from the [earliest block](#no-backfill) forward |
| Block bodies — the transaction list of any block | **Derived** from the receipts, over the same span |
| The raw signed transaction — calldata, gas limit, signature | **Yes**, from this release forward; no backfill for a row committed before it |
| Block hashes | **No** |

A node keeps **state** and **receipts**. State is what every node must agree on;
a block body is not, so nothing on the chain is obliged to carry it. Receipts are
kept because a caller cannot work without them: a transaction that certainly
landed must stay provable. The block reads rebuild a block's transaction list and
`gasUsed` from those receipts, which is why they cover exactly the receipt span
and no more.

The raw transaction now rides inside the same receipt row. A row written before
this release carries none, and none will be added later — see
[the transaction object](#the-transaction-object) for how a caller tells the two
kinds of row apart.

**The `[]` trap is gone.** An empty `eth_getLogs` result used to mean either "the
record was emptied" or "nothing matched", and no caller could tell which. The
store refuses a range it does not hold, so an empty array now means one thing:
nothing matched.

### Where to get past data {#where-to-get-past-data}

- **Receipts and logs come from the RPC.** `eth_getLogs` and
  `eth_getBlockReceipts` serve every block from the
  [earliest block](#no-backfill) forward. You no longer have to mirror them.
- **A block body is rebuilt from those same receipts.** `eth_getBlockByNumber`
  serves the transaction list and `gasUsed` of any block in the receipt span. It
  cannot go further back, and a row from before this release still has no raw
  transaction to serve — see [the transaction object](#the-transaction-object).
- **Core trading history comes from the native API**, not from the EVM RPC. Fills,
  orders, funding and closed positions are served by
  [`POST /info`](../api/rest/info.md) and by
  [position history](../api/rest/info/position-history.md).

:::note
**The receipts are the archive.** A block read, a log query and a receipt query
all answer from the one store and all stop at the same earliest block. The
chain keeps no block hashes; that is permanent, so do not design against it.
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
including the same placeholder fields — see [The block reads](#the-block-reads).
It carries an empty `transactions`, as a standard header notification does; call
`eth_getBlockByNumber` for the list.

Subscriptions are **forward-only** — they stream blocks committed *after* you
subscribe, and no subscription backfills. For past logs call `eth_getLogs`, which
serves them from the [earliest block](#no-backfill) forward. For a past block body call
`eth_getBlockByNumber`, which covers the same span as the receipts (see
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
