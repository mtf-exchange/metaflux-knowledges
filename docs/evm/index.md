# EVM

The MetaFlux EVM runs Solidity contracts and gives them access to MetaFlux Core. This page
covers its differences from a standard EVM, its system addresses and its JSON-RPC.

:::tip
**Live on testnet.** EVM execution and CoreWriter actions work. The stateless MTF
derivatives precompiles (`0x0900`–`0x0904`) also work. Read precompiles backed by Core
state, which query the positions and books of the chain directly, are upcoming. The
[bridge](../bridge/) is live.
:::

The MetaFlux EVM is a sidechain based on [revm](https://github.com/bluealloy/revm). It
runs ordinary Solidity contracts. It exposes MetaFlux Core, the L1 perps clearinghouse
and on-chain CLOB, to those contracts. It is an EVM execution layer connected directly to the
L1 against which it settles.

## Differences from a standard EVM {#whats-different-from-a-vanilla-evm}

- **Unified block, parallel strata.** The chain makes one block per fixed period (1000 ms by
  default). This period is separate from the faster consensus round rate. The transactions
  of a block are split into parallel conflict-strata, so throughput scales with cores.
  Contract deployments also confirm through the same lane as trading. There is no 60-second
  heavy-block lane. See [Execution model](execution-model.md).
- **Built-in Core access.** Contracts read Core through system precompiles. They write to
  Core through the CoreWriter system contract. See
  [Interacting with Core](interacting-with-core.md).
- **Deterministic.** Consensus injects the timestamps. There are no floats. Parallel
  execution gives a committed state equal to sequential execution.
- EIP-1559 base-fee burn to a burn-address coinbase.
- **State and receipts.** The chain keeps account state and serves it at the tip. It keeps
  every receipt and log that it produces in a durable receipt store. The block reads
  rebuild a block from that store. `eth_getTransactionReceipt`, `eth_getLogs`,
  `eth_getBlockReceipts` and `eth_getBlockByNumber` therefore all answer over the full range
  that the store holds. The store keeps the raw signed transaction from this release forward,
  with no backfill. It stores no block hashes. See [Receipts and logs](#receipts-and-logs)
  and [transaction object](#the-transaction-object).

## Pages {#pages}

- [Execution model](execution-model.md): the unified block, parallel conflict-strata, gas
  and fees, and MEV-resistant trading.
- [Interacting with Core](interacting-with-core.md): the CoreWriter write path (20 actions)
  and the read precompiles.
- [Core ↔ EVM transfers](core-evm-transfers.md): value transfers between Core and the EVM,
  and cross-chain.
- [Interaction timings](interaction-timings.md): when a CoreWriter action or a credit from
  Core to the EVM lands.

## System addresses {#system-addresses-at-a-glance}

| Address | Role |
|---------|------|
| `0x3333…3333` | CoreWriter. Submits L1 actions (`sendRawAction`), including the cross-chain `CrossChainSend`. |
| `0x0900`–`0x0904` | Derivatives read precompiles (margin, NAV, ADL, mark-settle, RFQ). |
| `0x0906`–`0x0908` | Market-data read precompiles (BBO, L2 depth, inventory risk). |

## JSON-RPC {#json-rpc}

The gateway serves standard `eth_*` JSON-RPC at `POST /evm`. The chain reports its own id
through `eth_chainId` (see [Networks & chain IDs](../networks.md)). Deployable contracts are
in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo.

:::warning
The RPC answers at the chain tip. It is not an archive node.
Several methods accept a block tag and ignore it, so a query for a past value returns the
value of today. Receipts and logs are the one durable exception. See
[Receipts and logs](#receipts-and-logs). Read [Method support](#method-support) and
[Retained data](#what-the-node-keeps) before you write a client.
:::

### Method support {#method-support}

Block tag is the `latest`, `pending` or `0x<number>` argument, or the block hash that
`eth_getBlockByHash` takes.

| Method | Block tag | Notes |
|--------|-----------|-------|
| `eth_chainId` · `net_version` · `net_listening` · `web3_clientVersion` | none | |
| `eth_blockNumber` | none | The committed EVM tip. |
| `eth_getBalance` | ignored | Reads the tip. |
| `eth_getTransactionCount` | ignored | Reads the tip. |
| `eth_getCode` | ignored | Reads the tip. |
| `eth_getStorageAt` | ignored | Reads the tip. The slot is a QUANTITY, so `0x9` and the padded 64-digit form name the same key. A full 32-byte slot (every `keccak256(key . slot)` mapping slot) is accepted. More than 64 hex digits is refused with `-32602`. |
| `eth_call` | ignored | Runs at the tip. See [block environment](#eth_call-block-environment). |
| `eth_estimateGas` | ignored | A real execution at the tip. See [below](#eth_estimategas-executes). |
| `eth_gasPrice` · `eth_maxPriorityFeePerGas` | none | Fixed informational values. There is no priority-fee market. |
| `eth_feeHistory` | range echoed | The shape is correct and the numbers are constants: `gasUsedRatio` is `0` and every `reward` is `0x0`. |
| `eth_getBlockByNumber` | honoured | Any block from the earliest block to the tip. See [below](#the-block-reads). |
| `eth_getBlockByHash` | honoured | The hash is number-keyed, so it resolves the same range. |
| `eth_getBlockTransactionCountByNumber` · `eth_getBlockTransactionCountByHash` | honoured | The transaction count of one block. |
| `eth_getTransactionByBlockNumberAndIndex` · `eth_getTransactionByBlockHashAndIndex` | honoured | One transaction by position. `null` past the end. |
| `eth_getLogs` | honoured | `fromBlock` and `toBlock` scan the [receipt store](#receipts-and-logs). A range that starts before the earliest block is refused with `-32001`, an oversized scan with `-32005` and a `blockHash` filter with `-32602`. |
| `eth_getBlockReceipts` | honoured | Every receipt of one block, in `transactionIndex` order. A block before the earliest block is refused with `-32001`. |
| `eth_getTransactionByHash` | none | `null` for an unknown hash. |
| `eth_getTransactionReceipt` | none | `null` means "not mined at or after the earliest block". See [below](#null-is-not-never-existed). |
| `eth_sendRawTransaction` | none | See [Transaction submission](#transaction-submission). |
| `eth_sendTransaction` | none | Refused with `-32000`. The node holds no user keys. |
| `eth_subscribe` · `eth_unsubscribe` | none | WebSocket only. Over HTTP they return `-32000`. |
| `eth_syncing` | none | `false` when replay is complete. During replay it returns the progress object. The RPC already serves at that time, and a `false` would say that the reads are reliable. |
| `eth_accounts` | none | Always `[]`. The node holds no keys, so it can name no account. Sign locally. |
| `eth_coinbase` | none | The same address that every block header names as `miner`. |
| `eth_getUncleCountByBlockNumber` · `eth_getUncleCountByBlockHash` | accepted | Always `0x0`. |
| `eth_getUncleByBlockNumberAndIndex` · `eth_getUncleByBlockHashAndIndex` | accepted | Always `null`. |
| `eth_mining` · `eth_hashrate` | none | `false` and `0x0`. There is no proof of work. |

Any other method returns JSON-RPC error `-32601`.

Three methods are absent on purpose. A stub for any of them would give a false answer
that a caller cannot detect:

| Method | Reason for absence |
|--------|-----------------------|
| `eth_getProof` | The app hash is a fold, not a Merkle-Patricia trie. There is no proof to return, so there is nothing to verify against. |
| `eth_createAccessList` | Access lists cost nothing here. The gas schedule has no EIP-2929 warm and cold split to pre-pay. |
| `net_peerCount` | Consensus topology is not a client read. |

There are no uncles at any height. The chain finalizes one block per consensus round and
orphans none. The uncle reads are constants, and the `sha3Uncles` of the block header is
always the empty-list hash. Do not walk them.

An ignored block tag is never an error. The call succeeds and returns current data. A
query for a past balance returns the balance of today. Nothing signals that the tag had no
effect. Do not read a historical value through this RPC.

The honoured rows are the exception. They refuse a reference that they cannot serve.
They do not answer with different data.

#### Block reads {#the-block-reads}

A block read answers for any block from the earliest block that the node retains to the
committed tip. Outside that span, it says on which side the request falls. The two answers
have different meanings.

| Request | Answer |
|---------|--------|
| `latest` · `pending` · `safe` · `finalized` | the tip |
| `earliest` | the earliest block the node retains |
| a number in `[earliest, tip]` | that block |
| a number above the tip | `null`. That block does not exist YET |
| a number below the earliest block | `-32001`, with `data.earliestBlock` |
| `eth_getBlockByHash` with a number-keyed hash in range | that block |
| `eth_getBlockByHash` with any other hash | `null` |

##### Two earliest blocks {#two-floors}

The block reads and the receipt reads keep separate histories. They have separate floors,
and the block floor is usually the HIGHER one. Two different stores back them, and each
store prunes on its own schedule.

A measurement on the public testnet at one moment:

```
eth_getBlockByNumber("0x1")  -> -32001  data.earliestBlock 0x37de4   (228836)
eth_getBlockReceipts("0x1")  -> -32001  data.earliestBlock 0x28261   (164449)
eth_getLogs from 0x1         -> -32001  data.earliestBlock 0x28261   (164449)
```

The floors are 64,387 blocks apart. A caller can read the floor from `eth_getLogs` and then
walk with `eth_getBlockByNumber`. That caller gets `-32001` long before it reaches the
number it was given. The walk looks broken, but it is not.

Read the floor from the SAME method that you intend to call. One request out of range is
sufficient. Ask for block `0x1` and read `data.earliestBlock` from the error. There is no
bisection and no separate endpoint.

Neither floor is a retention horizon, and neither floor moves. Nothing prunes these rows.
Each floor is a START MARK: the first block that the index recorded. The two floors differ
because the two indexes shipped in different releases. The gap between them is fixed. It
does not close and it does not widen.

One consequence affects your plan: a surface that reaches deeper today still reaches deeper
tomorrow. If you need both transactions that emit logs and transactions that emit none, run
two walks, each against its own floor. Do not choose one surface and wait for the shallower
floor to catch up.

`null` and `-32001` have different meanings. `null` means "not yet". Poll again and the
block appears. `-32001` means "gone, and it does not come back". Polling never resolves it.
A client that treats the second as the first retries for ever.

`transactions` and `gasUsed` are real. Pass `true` as the second argument for full
transaction objects. Pass `false`, or nothing, for hashes. An empty block is a real
block. It renders with `transactions: []` and `gasUsed: 0x0`, which is a different answer
from `null`.

`timestamp` is the value that the `TIMESTAMP` opcode saw in that block, recorded for each
block. It is not the time at which the node answered you.

##### Placeholder fields {#fields-that-stay-placeholders}

These placeholders are permanent. No release will fill them. MTF commits no block header, so
there is no root to report and nothing to hash. The HTTP read and the `newHeads` stream carry
the same placeholders.

| Field | Value | Reason |
|-------|-------|-----|
| `transactionsRoot` · `receiptsRoot` · `stateRoot` | all-zero | No header is committed, so there is no root. The field stays zero and is not faked. |
| `logsBloom` | all-zero | The same reason. Filter with `eth_getLogs`. |
| `hash` · `parentHash` | the block number in the low 8 bytes | A number-keyed derivation. It is not a hash of the block. |
| `size` · `difficulty` · `totalDifficulty` | `0x0` | No encoded block and no proof of work. |
| `miner` | the burn coinbase | The address to which EIP-1559 base fees burn, so the header agrees with the `COINBASE` that an execution sees. |

Do not treat `hash` as a commitment to the block contents. Do not use it to detect a reorg.
Single-slot BFT finality means that a committed block never reorgs. `hash` is number-keyed,
so `eth_getBlockByHash` round-trips against the `blockHash` that receipts, transactions and
logs report.

#### `eth_call` block environment {#eth_call-block-environment}

`eth_call` executes real contract code against real committed state. The return value is
correct for the state at the tip. The block environment of that execution is the same as the
one that the committed block builder derives from the same state. A simulation and a real
execution therefore read the same opcodes:

| Opcode | `eth_call` returns |
|--------|--------------------|
| `NUMBER` | the EVM tip |
| `TIMESTAMP` | the consensus-derived block time, in seconds |
| `COINBASE` | the burn coinbase |
| `GASLIMIT` · `BASEFEE` | The governed committed values, not baked constants. A governance change moves both sides together. |
| `PREVRANDAO` | `0x0` |
| `BLOCKHASH` | `0x0`, for every number |

`BLOCKHASH` has its own rule: do not build on it. The chain keeps no block hashes (see
[Retained data](#what-the-node-keeps)). Committed execution itself returns `0x0`. A contract
that uses `blockhash()` for randomness or as a proof gets zero. It gets no entropy.

#### `eth_estimateGas` execution {#eth_estimategas-executes}

`eth_estimateGas` runs the call through the same simulation as `eth_call`. It then returns
the larger of two figures: the gas that the run used BEFORE its refund, and the EIP-7623
calldata floor.

Both terms are necessary. A receipt reports gas AFTER the refund. EIP-3529 lets that figure
be a fifth lower than what the transaction needed to run. A limit set from a receipt runs out
of gas on any transaction that clears storage. The floor applies in the other direction. The
chain charges a transaction with much calldata the floor, even when it executes for less.

There is one execution and no binary search. The estimate does not cover a contract that
branches on `gasleft()`. If your contract does, pass an explicit `gas`.

### Receipts and logs {#receipts-and-logs}

Receipts are the one part of EVM history that the chain keeps. Each node writes the receipt
and the logs of every committed EVM transaction into a durable receipt store on disk.
`eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_getLogs` and
`eth_getBlockReceipts` all answer from that store. A receipt survives a node restart and a
release.

The store is outside the state commitment, so it costs consensus nothing. Two nodes with
different receipt retention still agree on state.

#### No backfill {#no-backfill}

There is no backfill, and there will not be one. No node holds the raw transactions of a
past block, so no node can derive again a receipt that it did not write. The earliest
block of the store is the first EVM block that the new binary executes. Every receipt from
before that block is gone.

A request for a range that starts before the earliest block fails:

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

The whole request fails. You never get a partial answer. This is deliberate. A partial
answer looks exactly like a complete one for the range you asked for. The missing part then
goes into your own store as "nothing happened here", and nothing later corrects it. That is
how an indexer silently corrupts itself. An error that you must handle costs less than a gap
that you never find.

Read `data.earliestBlock` and start your index at that block.

#### `null` receipts {#null-is-not-never-existed}

`eth_getTransactionReceipt` answers `null` for a hash that it cannot find. On a node with a
receipt store, that `null` has one exact meaning:

> The transaction was not mined at or after `earliestBlock`.

The store never deletes a lookup row. A transaction that landed at or after the earliest
block therefore always resolves. A `null` thus means one of two things: the transaction never
landed, or it landed before the earliest block.

Integrators often get this row wrong. Each kind of caller separates the two cases as
follows:

- A poller asks about a transaction that it just sent. That transaction is always at or
  after the earliest block, so `null` means "not mined yet" and nothing else. Keep polling.
- An indexer walks the chain by range. It meets the earliest block as a `-32001` from
  `eth_getLogs`, and that error names the block. Before that block, the indexer must not
  index at all. At or after it, a `null` is a true "never existed".

Do not guess from a bare `null`. Ask for the range and read the error.

#### Scan bound {#scan-bound}

`eth_getLogs` reads the store row by row. There is no address index, so a wide range costs
real work on a validator. The scan counts the rows that it reads and stops at 100,000:

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

Narrow `fromBlock` and `toBlock` and send the query again. Several narrow queries return the
same logs as one wide query, because a committed block never reorgs.

#### Log ordering {#log-ordering}

A log now carries its real position in its block. This changes what the live chain returns
today.

| Field | Was | Is |
|---|---|---|
| `transactionIndex` | always `"0x0"`, on every log and every receipt | the transaction's real position in its block |
| `logIndex` | counted per transaction, so it restarted at `0x0` on each receipt | counted per block, so it is unique inside the block |

Check any code that keys a log by `(blockNumber, logIndex)`. With the old behaviour, two
logs in one block could share that key, and a de-duplicating store dropped one of them. With
the new behaviour the key is unique, as on every other EVM chain.

`eth_getLogs` returns logs in `(block, transactionIndex, logIndex)` order.

#### Transaction object {#the-transaction-object}

`eth_getTransactionByHash`, the two by-index reads, and a full transaction object in a block
read all render from the receipt store. From this release forward, the store keeps the raw
signed transaction. These fields are therefore the real signed values, not placeholders:

| Field | Value |
|-------|-------|
| `type` | the real envelope type: `0x0` legacy, `0x2` EIP-1559 |
| `gas` | the gas limit the sender SIGNED |
| `gasPrice` | the price the sender SIGNED: the legacy `gasPrice`, or an EIP-1559 transaction's `maxFeePerGas` |
| `maxFeePerGas` · `maxPriorityFeePerGas` | present on an EIP-1559 transaction only; absent on a legacy one |
| `input` | the real calldata |
| `v` · `r` · `s` | the real signature |

Three fields changed meaning, and not only value.

- `gas` held the gas that the transaction USED. Now it holds the gas LIMIT that the sender
  signed. A client that still shows it as "gas used" reports the wrong number.
- `gasPrice` was a fixed value, the same number that `eth_gasPrice` returns. Now it is the
  price that the sender signed.
- `type` was always `0x0`. Now it is the real envelope type, so an EIP-1559 transaction reads
  `0x2`.

##### Rows with no raw bytes {#rows-with-no-raw-bytes}

Three kinds of row keep no raw bytes. All three fall back to the OLD placeholders:

- A transaction committed before this release. There is no backfill. Its raw bytes
  were never stored, and none will be added later. The placeholder is permanent for that row.
- A system-lane call. No user signs it, so there is nothing to store.
- Any row from a node that runs [without a receipt store](#no-store-node). Its in-memory
  window drops the raw bytes on arrival. This applies to every transaction that such a node
  serves, not only to an old one.

A placeholder row renders:

| Field | Value |
|-------|-------|
| `type` | `0x0`, even when the sender actually used EIP-1559 |
| `gas` | the gas the transaction USED (the pre-release placeholder) |
| `gasPrice` | the same fixed value `eth_gasPrice` returns |
| `input` | `0x` |
| `v` | `0x0` |
| `r` · `s` | `0x0` (32 zero bytes) |

A placeholder row has no `maxFeePerGas` and no `maxPriorityFeePerGas`, whatever envelope the
sender used.

Use the signature to tell the two kinds of row apart. Do not use `gas` or `type`. A real
secp256k1 signature never has `r == 0`. A non-zero `r` (or `s`) therefore means that every
field of that transaction is the real signed value. `r == 0x0` together with `v == 0x0` means
that the row has no raw bytes, and every field above is the old placeholder. Do not decide
from `gas` or `type` alone. The gas-used value of a placeholder can match a real gas limit by
chance. Its `type` reads the same `0x0` that a real legacy transaction also reports.

#### `contractAddress` on a deployment receipt {#contract-address}

The node fills the field for a successful deployment only:

| Receipt | `contractAddress` |
|---|---|
| A deployment (`to` is `null`) with `status` `0x1` | the address of the deployed contract |
| A deployment with `status` `0x0` | `null` |
| A call (`to` is set) | `null` |
| A system-lane call | `null` |
| Any receipt the node stored before block 25,599,540 | `null` |

A failed deployment reads `null`. A failed deployment creates no contract. On MTF, a
non-null `contractAddress` therefore always means that the deployment succeeded. Some
Ethereum clients fill the field for a failed deployment too. Do not expect that here.

An old receipt stays `null`. The node writes the field when it stores the receipt.
There is no backfill, so a receipt stored before block 25,599,540 keeps `null`
permanently. For such a receipt, compute the address locally from the sender and the nonce.
ethers v6 and viem both do this without an RPC call. The result is the same address that the
node reports for a new receipt.

#### `mtfStatus` on a receipt {#mtf-status}

Every `eth_getTransactionReceipt` carries a non-standard `mtfStatus` field next to the
standard `status`. `status` is correct to the specification on its own: `0x1` for a success,
`0x0` for everything else. A client that ignores unknown fields is not affected.

`mtfStatus` gives the reason for a `0x0`. It is the only place where the wire carries that
distinction:

| `mtfStatus` | Meaning |
|-------------|---------|
| `success` | executed and succeeded |
| `reverted` | executed and reverted |
| `bad_nonce` | mined, never executed: the nonce did not match |
| `insufficient_funds` | mined, never executed: the sender could not pay |
| `not_executed_calldata` | mined, never executed: the calldata path was closed |

The reason for this field: MTF writes a receipt for a transaction that failed a
pre-check. Standard Ethereum never includes such a transaction in a block. A standard client
therefore assumes that any receipt means the nonce was used. On MTF that assumption is wrong
for the last three rows. Read `mtfStatus`, or read `gasUsed == 0x0`, before you conclude
that a nonce was used.

#### Nodes without a receipt store {#no-store-node}

The receipt store is optional for each node. A node that runs without it keeps a bounded
in-memory window: recent receipts only, emptied by a restart. Such a node reports its own
`earliestBlock` and refuses anything before it with the same `-32001`. The error shape does
not change, so one client handles both kinds of node.

This window drops the raw signed transaction on arrival, to keep memory bounded. See
[rows with no raw bytes](#rows-with-no-raw-bytes). Every transaction that a node without a
store serves therefore carries the OLD placeholders, even one signed and mined after this
release. If a client needs the real signed values, point it at a node that runs the durable
store.

### Retained data {#what-the-node-keeps}

| Data | Kept? |
|------|-------|
| Account state: balances, nonces, contract code, contract storage | Yes, as committed state, readable at the tip |
| Receipts and logs | Yes, on disk, from the [earliest block](#no-backfill) forward |
| Block bodies: the transaction list of any block | Derived from the receipts, over the same span |
| The raw signed transaction: calldata, gas limit, signature | Yes, from this release forward; no backfill for a row committed before it |
| Block hashes | No |

A node keeps state and receipts. Every node must agree on state. Nodes do not need to
agree on a block body, so nothing on the chain must carry it. The node keeps receipts
because a caller cannot work without them: a transaction that landed must stay provable. The
block reads rebuild the transaction list and `gasUsed` of a block from those receipts. For
this reason, they cover exactly the receipt span and no more.

The raw transaction now goes in the same receipt row. A row written before this release has
none, and none will be added later. See [transaction object](#the-transaction-object) for how
a caller tells the two kinds of row apart.

The `[]` trap is gone. An empty `eth_getLogs` result used to mean either "the record was
emptied" or "nothing matched", and no caller could tell which. The store refuses a range that
it does not hold. An empty array now has one meaning: nothing matched.

### Past data {#where-to-get-past-data}

- Receipts and logs come from the RPC. `eth_getLogs` and `eth_getBlockReceipts` serve
  every block from the [earliest block](#no-backfill) forward. You do not need to mirror
  them.
- The block body comes from the same receipts. `eth_getBlockByNumber` serves the
  transaction list and `gasUsed` of any block in the receipt span. It cannot go further back.
  A row from before this release still has no raw transaction to serve. See
  [transaction object](#the-transaction-object).
- Core trading history comes from the native API, not from the EVM RPC.
  [`POST /info`](../api/rest/info.md) and
  [position history](../api/rest/info/position-history.md) serve fills, orders, funding and
  closed positions.

:::note
The receipts are the archive. A block read, a log query and a receipt query all answer
from the one store, and all stop at the same earliest block. The chain keeps no block hashes.
This is permanent, so do not design against it.
:::

### Batch requests {#batch-requests}

`POST /evm` accepts a single JSON-RPC request object or a JSON array of them. The gateway
dispatches an array element by element. It answers with an array in the same order, so
element `i` of the response answers element `i` of the request. A failing element gives its
own JSON-RPC error object. It does not fail the other elements, and it does not fail the
request.

A batch carries at most 100 elements. The gateway rejects a larger array as a whole with
JSON-RPC error `-32600` (invalid request). It serves no part of the elements, so you never
need to find which prefix ran. The refusal costs the full cap of 100 weight. An array whose
element count the gateway cannot parse costs the same. A malformed request is never the cheap
lane.

A batch costs rate-limit weight equal to its element count. 40 elements cost 40, the same
as 40 separate calls. A batch saves round trips and connections. It does not buy cheaper
access. See [rate limits](../api/rate-limits.md).

The cap and the weight have the same reason. The gateway dispatches each element
independently, so one array is one request that can ask for unbounded work. A batch with no
cap and no weight would turn a single connection into an unmetered lane past every
per-request budget on the gateway.

### Transaction submission {#transaction-submission}

Submit transactions with the standard Ethereum method `eth_sendRawTransaction`, with an
RLP-encoded signed transaction. The network verifies that the signature recovers to the
declared sender address. This deterministic security check stops unsigned or malformed
transactions from entering the chain. Standard EVM clients and wallets that sign correctly
see no change. The verification is automatic.

### WebSocket subscriptions {#websocket-subscriptions}

Real-time push is available over a WebSocket on the same `/evm` endpoint: `ws://…/evm`,
or `wss://` behind TLS. Standard EVM tooling (ethers, viem, wagmi) that dials a WebSocket
transport gets both regular request and reply (`eth_call`, `eth_getLogs`,
`eth_sendRawTransaction`, …) and `eth_subscribe` push notifications on the one connection.

Subscribe with `eth_subscribe` and unsubscribe with `eth_unsubscribe`. The server pushes each
update as a standard `eth_subscription` notification:

```json
{"jsonrpc":"2.0","method":"eth_subscription","params":{"subscription":"0x…","result":{ … }}}
```

Three channels are available:

| Channel | Emits |
|---------|-------|
| `newHeads` | the block header of each newly committed EVM block |
| `logs` (with an `{address, topics}` filter) | Each matching log in each newly committed block. The matching is identical to `eth_getLogs`. |
| `newPendingTransactions` | see the note below |

A `newHeads` frame has the same header shape as the HTTP block read, with the same placeholder
fields. See [Block reads](#the-block-reads). It has an empty `transactions`, like a standard
header notification. Call `eth_getBlockByNumber` for the list.

Subscriptions are forward-only. They stream blocks committed *after* you subscribe, and
no subscription backfills. For past logs, call `eth_getLogs`. It serves them from the
[earliest block](#no-backfill) forward. For a past block body, call `eth_getBlockByNumber`. It
covers the same span as the receipts (see [Retained data](#what-the-node-keeps)). MetaFlux has
single-slot BFT finality, so a committed block never reorgs. Streamed logs are never
`removed`, and `newHeads` never rewinds.

:::note
`newPendingTransactions` gives newly *committed* transactions. It is not a mempool feed.
MetaFlux exposes no public pending mempool. This channel emits the hashes of transactions
when they commit in a new block. The timing is the same as `newHeads`. It is not the
pre-confirmation timing of a geth mempool feed. If you call `watchPendingTransactions()`
(viem) or `eth_subscribe(["newPendingTransactions"])` and expect pre-confirmation hashes, note
that on MetaFlux the hashes arrive at commit.
:::

`eth_subscribe` and `eth_unsubscribe` are WebSocket only. A call to them over `POST /evm`
returns a JSON-RPC error that directs you to a WebSocket connection.
