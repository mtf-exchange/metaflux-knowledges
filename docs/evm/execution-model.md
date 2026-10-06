# Execution model

This page describes how the MetaFlux EVM forms, executes and commits blocks.

:::tip
**Live on testnet.** The unified block model is operational and tested. It makes one EVM
block per fixed period and runs parallel conflict-strata inside each block. Cadence and gas
values can still change before launch. The [bridge](../bridge/) is live.
:::

The MetaFlux EVM makes one unified block per fixed period (1000 ms by default). There are
no separate "small" and "large" block sizes. The period is separate from the consensus round
rate, which is usually faster. A round that lands before the period ends mints no new EVM
block. Its EVM transactions carry forward to the next round that mints one. Inside each EVM
block, execution is split into parallel conflict-strata, so throughput scales with
cores. Every transaction class, contract deployments included, confirms through the same
lane. There is no separate slow path.

## One block, parallel strata {#one-block-parallel-strata}

- One block per fixed period (1000 ms by default). It is not one block per consensus
  round. There is no 60-second heavy-block lane. A contract deployment or a large settlement
  lands in the same lane as trading flow. It does not wait a minute.
- The transactions of a block are grouped into strata by their read and write access
  sets. Independent transactions execute concurrently. Conflicting transactions execute
  in order. Aggregate throughput is `per-lane budget × parallel width`. It scales with the
  available cores, and not with a fixed gas tier for each block.
- The partition is advisory. It only decides what runs in parallel. The same
  deterministic execution as a plain in-order replay makes the committed result (state and
  state root). The result is therefore identical on every honest node, whatever the core
  count or thread scheduling.

## Block formation {#block-formation}

`ASSEMBLE → PARTITION → EXECUTE → COMMIT`:

1. **Assemble.** Credits from Core to the EVM come first. These are spot sends to recipients
   on the EVM side, and bridge mints. User transactions follow in canonical consensus order.
2. **Partition.** Transactions are grouped into conflict-strata by a rule derived from the
   content. Every node computes the same partition.
3. **Execute.** Strata run in parallel under the Block-STM executor. If an access set is
   estimated wrongly, read-set validation catches it and the transaction runs again.
   Correctness therefore never depends on the partition. Only speed does.
4. **Commit.** Finalized writes commit in transaction-index order. The state root is taken
   over the committed state.

## Gas and fees {#gas--fees}

- An aggregate gas limit for each block (a ceiling against DoS) and a gas cap for each
  transaction. The transaction cap takes over the old role of the heavy block. Deploys and
  `CREATE` get a high cap in every block. Ordinary trades get a low cap.
- One EIP-1559 base-fee market. The base fee is burned. The block gas budget is
  elastic. It widens under sustained load and shrinks when the chain is idle. It has a
  hard minimum floor, so worst-case capacity never drops below a fixed baseline.
- The fixed EVM period sets the cadence. The consensus round rate does not. Consensus derives
  `block.timestamp`, so it is deterministic and uses no wall clock.

## MEV-resistant trading (opt-in, per market) {#mev-resistant-trading-opt-in-per-market}

Market microstructure is a primary design concern. MEV resistance is therefore a property of
block construction, and it is opt-in for each market:

- A market in frequent-batch-auction (FBA) mode collects its order intents for a round
  into one atomic batch. The batch clears at a single uniform price. There is no
  priority inside the batch to front-run. A sandwich has no effect, because everyone gets one
  price. A latency race does not move the price.
- Order intents can be threshold-encrypted. The block proposer cannot see their contents
  until the ordering is committed.
- Transactions that an auction cannot cover get verifiable fair ordering. A seed derived
  from the parent hash and number of the block sets the order, so the proposer has no choice
  of order.
- Markets use continuous mode by default, which is broadly compatible with standard EVM
  expectations. Each market opts in on its own, so the rollout is incremental and reversible.

Clearing runs on the MetaFlux Core matching engine. The EVM block synchronizes its flow of
trade intents to that auction. There is exactly one clearing path. The EVM does not hold a
duplicate.

## Confirmation tiers {#confirmation-tiers}

- Final (consensus) confirmation comes at the EVM block that includes the transaction.
  It is the only tier that enters committed state.
- An optional soft acknowledgement can be exposed for UX that needs low latency. It is
  not part of consensus. Actions that carry risk, such as bridge mints and withdrawals,
  rely on final confirmation only.

## State and history {#state-and-history}

The EVM keeps state and receipts. It keeps no raw transactions.

- State is durable. Account balances, nonces, contract code and contract storage are
  committed state. Every node holds the same state and serves it at the tip.
- Receipts are durable too. Each node writes the receipt and the logs of every committed
  EVM transaction to disk, outside the state commitment. See
  [Receipts and logs](index.md#receipts-and-logs) for the range that each node holds and for
  the two errors that guard it.
- A block body is DERIVED from those receipts. No node stores a block body as such.
  `eth_getBlockByNumber` rebuilds the transaction list and `gasUsed` from the receipt rows, so
  it covers exactly the receipt range.
- The raw transaction is not kept. The calldata, the declared gas limit and the signature
  are gone when the block executes, so no read can return them. See
  [transaction object](index.md#the-transaction-object).
- Block hashes are not kept either. The state store reserves a number-keyed slot for
  block hashes, to back the `BLOCKHASH` opcode. Nothing writes that slot today, so
  `BLOCKHASH` returns `0x0` in a committed transaction, for every number. Do not build on it.

Every node must agree on state. Nodes do not need to agree on a block body, so nothing on the
chain must carry it. The receipts make a rebuild of the block body possible, but the chain
makes no commitment to it. This sets what the JSON-RPC can serve: reads at the tip, and
everything that the receipt series supports. A block above the tip returns `null`. A block
below the earliest receipt returns `-32001`.

See [Method support](index.md#method-support) for the methods that this limits. See
[Past data](index.md#where-to-get-past-data) for the source of each kind of past data.

Receipt persistence is decided and shipping. Block-body persistence is still an open product
decision.

## See also {#see-also}

- [Interacting with Core](interacting-with-core.md): precompiles (read) and CoreWriter (write).
- [Core ↔ EVM transfers](core-evm-transfers.md)
- [Interaction timings](interaction-timings.md)
