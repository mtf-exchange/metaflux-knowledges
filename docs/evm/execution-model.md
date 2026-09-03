# Execution model

:::tip
**Live on devnet.** The unified block model — one EVM block per fixed period,
with parallel conflict-strata execution inside each block — is operational and
tested. Cadence and gas values may still be tuned before launch. The
[bridge](../bridge/) is live.
:::

The MetaFlux EVM produces **one unified block per fixed period** (1000 ms by
default) — there are no separate "small" and "large" block sizes. That period
is decoupled from the consensus round rate, which usually runs faster: a round
that lands before the period elapses mints no new EVM block, and its EVM
transactions carry forward to the next round that does mint one. Within each
EVM block, execution is partitioned into **parallel conflict-strata**, so
throughput scales with cores, and **every transaction class — including
contract deployments — confirms through the same lane, with no separate slow
path**.

## One block, parallel strata {#one-block-parallel-strata}

- **One block per fixed period** (1000 ms by default), not one per consensus
  round. There is no 60-second heavy-block lane: a contract deployment or a fat
  settlement lands in the same lane as trading flow — not after a minute-long
  wait.
- The block's transactions are grouped into **strata** by their read/write access
  sets. Independent transactions execute **concurrently**; conflicting ones execute
  in order. Aggregate throughput is `per-lane budget × parallel width`, so it
  scales with available cores instead of a fixed per-block gas tier.
- The partition is **advisory** — it only decides what runs in parallel. The
  committed result (state + state root) is produced by the same deterministic
  execution as a plain in-order replay, so it is **identical on every honest node**
  regardless of core count or thread scheduling.

## Block formation {#block-formation}

`ASSEMBLE → PARTITION → EXECUTE → COMMIT`:

1. **Assemble** — Core→EVM credits (spot sends to EVM-side recipients, bridge
   mints) are placed first, then user transactions in canonical consensus order.
2. **Partition** — transactions are grouped into conflict-strata by a
   content-derived rule that every node recomputes identically.
3. **Execute** — strata run in parallel under the Block-STM executor. A
   mis-estimated access set is caught by read-set re-validation and re-run, so
   correctness never depends on the partition — only speed does.
4. **Commit** — finalized writes commit in transaction-index order; the state root
   is taken over the committed state.

## Gas & fees {#gas--fees}

- An **aggregate per-block gas limit** (anti-DoS ceiling) plus a **per-transaction
  gas cap**. The per-tx cap absorbs the old heavy-block role: deploys / `CREATE`
  get a high cap **every block**; ordinary trades are capped low.
- A single **EIP-1559** base-fee market; the base fee is **burned**. The block gas
  budget is **elastic** — it widens under sustained load and shrinks when idle —
  with a hard **minimum floor**, so worst-case capacity never drops below a fixed
  baseline.
- Cadence is paced by the fixed EVM period, not the consensus round rate;
  `block.timestamp` is consensus-derived (deterministic — no wall clock).

## MEV-resistant trading (opt-in, per market) {#mev-resistant-trading-opt-in-per-market}

Market microstructure is a first-class concern, so MEV resistance is a property of
**block construction**, not a fee-market afterthought — and it is opt-in per market:

- A market in **frequent-batch-auction (FBA)** mode collects its order intents for
  a round into **one atomic batch** that clears at a **single uniform price**.
  There is no intra-batch priority to front-run, sandwiching is meaningless
  (everyone gets one price), and latency racing does not move the price.
- Order intents may be **threshold-encrypted** — their contents are hidden from the
  block proposer until ordering is already committed.
- Transactions an auction can't cover get **verifiable fair ordering** (a seed
  derived from the block's own parent hash + number), removing proposer ordering
  discretion.
- Markets default to **continuous mode** (broadly compatible with standard EVM
  expectations) and opt in per market, so rollout is incremental and reversible.

Clearing runs on the MetaFlux Core matching engine; the EVM block **synchronizes**
its trade-intent flow to that auction — there is exactly **one** clearing path, not
a duplicate inside the EVM.

## Confirmation tiers {#confirmation-tiers}

- **Final** (consensus) confirmation at the EVM block that includes the
  transaction — the only tier that enters committed state.
- An optional **soft acknowledgement** may be exposed for latency-sensitive UX; it
  is **not** part of consensus. Risk-bearing actions — bridge mints, withdrawals —
  rely on **final** confirmation only.

## State and history {#state-and-history}

The EVM keeps **state** and **receipts**. It does not keep block bodies.

- **State is durable.** Account balances, nonces, contract code and contract
  storage are committed state. Every node holds the same state and serves it at
  the tip.
- **Receipts are durable too.** Each node writes the receipt and the logs of
  every committed EVM transaction to disk, outside the state commitment. See
  [Receipts and logs](index.md#receipts-and-logs) for the range each node holds
  and for the two errors that guard it.
- **Block bodies are not kept.** No node stores a past EVM block body or a past
  transaction list. A block executes once; what survives is the state it
  produced and the receipts it wrote, not the block.
- **Block hashes are not kept either.** The state store reserves a number-keyed
  slot for block hashes, to back the `BLOCKHASH` opcode. Nothing writes that slot
  today, so `BLOCKHASH` returns `0x0` in a committed transaction, for every
  number. Do not build on it.

State is what every node must agree on. A past block body is not, so nothing on
the chain is obliged to carry it. This is a deliberate shape, and it sets what
the JSON-RPC can serve: reads at the tip, plus the receipt series. A block
reference that is not the tip has no answer, so the RPC returns `null` for it
rather than serving the tip in its place. **That `null` is not live until the
next release**, and neither are durable receipts — see the
[upgrade notice](../api/upgrade-notice-ids-and-shapes.md#evm-block-null).

See [Method support](index.md#method-support) for which methods this limits, and
[Where to get past data](index.md#where-to-get-past-data) for what each kind of
past data does have a source.

Receipt persistence is decided and shipping. Block-body persistence stays an
open product decision.

## See also {#see-also}

- [Interacting with Core](interacting-with-core.md) — precompiles (read) + CoreWriter (write)
- [Core ↔ EVM transfers](core-evm-transfers.md)
- [Interaction timings](interaction-timings.md)
