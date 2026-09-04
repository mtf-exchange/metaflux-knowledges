---
description: Every row on this page is LIVE. One release turned every `oid` and `tid` into a decimal-digit string, gave `order_status` all its fill legs and real terminal states, labelled the token a fill's fee is charged in, put margin and funding on one plane, rejected four inputs that used to pass, removed the two explorer WS channels, made EVM receipts and logs survive a restart, and stopped the EVM RPC answering a non-tip block reference with the tip.
---

# Upgrade notice — id strings and wire shapes

:::tip
**LIVE. Every row below has shipped.** This page was written ahead of the
release so the reference and the two client SDKs moved as one batch. The
release has landed, and each row was re-measured on the public testnet
afterwards. Code against it.

It stays published as the record of what changed and when, for anyone whose
client still assumes the old shapes. If your client reads `tid` as a JSON
number, or treats a spot `taker_fee_bps` of `null` as a zero rate, read
[Ids become decimal-digit strings](#id-strings) and
[The spot taker fee](#spot-taker-fee) — those two are the rows that corrupt
data silently rather than erroring.

Everything here is read-side. No signing domain moved, no signed payload
changed, and no consensus rule changed.
:::


One release moves every row below at one boundary. Each row is something a
caller can observe.

## Ids become decimal-digit strings {#id-strings}

**This is the row that is corrupting data today.** `tid` is a 64-bit
hash-derived value. It is already past 2^53, so a JSON number cannot carry it
into JavaScript:

```
live wire:         "tid": 16613428288414605024
after JSON.parse:         16613428288414605000     <- off by 24
> MAX_SAFE_INTEGER:       true
```

Nothing raises an error. The digits are simply wrong, and every use that
COMPARES ids fails silently: a `user_fills` to `trades` join by `tid` matches
nothing, and fill de-duplication by `tid` drops nothing.

Every price and every size on this wire is already a string, for exactly this
reason. Ids are the last numeric family without the protection.

**What changes.** On every RESPONSE, `oid` and `tid` become decimal-digit
strings. The field names do not change.

| Surface | Fields |
|---|---|
| [`user_fills`](rest/info.md#user_fills) | `fills[*].oid`, `fills[*].tid` |
| [`trades`](rest/info/perpetuals.md#trades) | `trades[*].tid` |
| [`order_status`](rest/info.md#order_status) | `order.oid`, `trigger.oid`, `fills[*].oid`, `fills[*].tid`, `outcome.oid` |
| [`open_orders`](rest/info.md#open_orders) | each row's `oid` |
| [`historical_orders`](rest/info.md#historical_orders) | `orders[*].oid` |
| [`user_ledger_updates`](rest/info.md#user_ledger_updates) | a trade row's `tid` |
| The RFQ / FBA read | `oid` |
| [`/exchange`](rest/exchange.md) | EVERY id in the ACK union — `resting.oid`, `filled.oid`, `chase.chase_oid`, `chase.leg_oid` |
| WS [`trades`](ws/subscriptions.md#trades), [`fills`](ws/subscriptions.md#fills), [`order_updates`](ws/subscriptions.md#order_updates), [`user_twap_slice_fills`](ws/subscriptions.md#user_twap_slice_fills) | `oid`, `tid` |

**Requests take either.** Wherever a request body carries an `oid` — the
`order_status` lookup above all — a JSON number and a decimal-digit string are
both accepted. Nothing you send today stops working.

**Two things deliberately do NOT change.**

- **`twap_id` / `twapId` stays a number.** It is a small per-account counter,
  not a derived 64-bit value, so it is nowhere near the cliff.
- **The [node JSONL streams](../nodes/data-streams.md) keep the numeric form.**
  They are a byte-pinned tape that the archive and the indexer consume, not a
  public API. Parse them with a 64-bit reader.

### The signed cancel keeps a `u64` oid {#signed-oid-cliff}

An `oid` inside a **signed action payload** is unchanged. The typed digest binds
`uint64 oid`, and re-typing it would re-shape signing for every client at once.
That is out of scope here.

State the residual risk plainly: `oid` is a counter, about 32.5 million today,
so it is four orders of magnitude below 2^53 and there is no live problem. If it
ever approaches that ceiling, the SIGNED cancel path needs its own decision, and
that decision is a signing change, not a read change.

## `order_status` reports every fill leg, and real terminal states {#order-status}

Two defects, one read.

**It returned ONE fill leg, unmarked as partial.** Measured on the live chain:
order `32535358` filled `0.62` and then `0.87`. The read served `0.62` — wrong by
58%, with nothing in the response to say a second leg existed.

**And five different outcomes answered identically.** Cancelled, cancel-rejected,
rejected, evicted from the ring and NEVER EXISTED all returned a byte-identical
`{"status":"unknown"}`. No integrator can reconcile an order book against that.

### The `filled` shape {#order-status-filled}

The `fill` key is REPLACED by `fills` and `total_filled_sz`:

```json
{
  "data": {
    "type": "order_status",
    "status": "filled",
    "fills": [ /* every matching leg, oldest first — same shape as a user_fills record */ ],
    "total_filled_sz": "1.49"
  }
}
```

`fill` is removed rather than kept as an alias. A field that serves one arbitrary
leg out of N is not an alias for anything — a client reading `fill.sz` would go on
being wrong while believing it had upgraded. If you truly want one leg, read
`fills[0]` and know what you are choosing.

Compare `total_filled_sz` with the order's own size to tell a full fill from a
partial one.

### The terminal states {#order-status-terminal}

`status` gains `"canceled"`, `"cancel_rejected"` and `"rejected"`. Each carries
an `outcome` object:

```json
{
  "data": {
    "type": "order_status",
    "status": "canceled",
    "outcome": {
      "oid":    "32535358",
      "coin":   "BTC",
      "side":   null,
      "time":   1788004665371,
      "reason": null
    }
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `oid` | decimal-digit string \| `null` | Order id. `null` when the node holds no id for the record — always on `rejected`, which is refused before an id is assigned |
| `coin` | string | Market symbol (perp) or spot pair name |
| `side` | `"B"` / `"A"` \| `null` | Order side. `null` on `canceled` and `cancel_rejected`: a cancel names the order, not its side |
| `time` | uint64 | Consensus ms the order reached this state |
| `reason` | string \| `null` | The refusal text. `null` on a successful cancel. **Branch on `status`, never on this string** |

**Three tokens, and `cancel_rejected` is the one nobody expects.** It says the
CANCEL request failed, because the order had already left this node's live view.
`canceled` says the cancel succeeded. `rejected` says the ORDER was refused at
admission.

**`expired` does not exist.** An earlier draft of this page named it. No node
path writes it, so it is struck from the reference and from both SDKs. Do not
code a branch for it.

**`sz`, `filled_sz` and `cloid` are not on `outcome`.** An earlier draft listed
them. Two rules put them out of reach: a fill resolves BEFORE the terminal
window, so an order that reaches `outcome` has no fills and `filled_sz` could
only ever read `"0"`; and the cancel event the node records carries the id, the
market and the time, not the size.

`outcome` is a separate key from the `order` of a live resting hit on purpose.
The two answer different questions, and one name over two field sets is exactly
how a caller reads the wrong one.

An `unknown` answer carries `outcome_coverage`, the count of orders the terminal
window holds. A `0` means the window is empty after a restart, so the `unknown`
says nothing about the order you asked for.

### `cloid` keeps resolving after the fill {#order-status-cloid}

A `cloid` lookup used to die at the moment the write completed: the fill ring is
keyed by `oid` and carried no cloid, so a `cloid` stopped resolving as soon as the
order filled. The node now carries the cloid into its read-side rings, so a
`cloid` resolves a filled and a terminal order as well as a live one.

### `unknown` means "outside this node's retention view" {#order-status-unknown}

The terminal states are served from a **node-local retention window**, not from
committed state. Two consequences, and both are the honest kind:

- **A node restart empties the window.** After a restart the node answers
  `unknown` for orders it would have answered before. It is a retention window,
  not a history.
- **`unknown` is not proof the order never existed.** It says this node cannot
  see it. For the archive answer, read
  [`historical_orders`](rest/info.md#historical_orders).

This is the same retention contract `historical_orders` already documents.

## A fill says which token its fee is in {#fee-token}

Every fill object gains **`fee_token`**, the coin symbol the `fee` is charged in.

**Read it before you sum `fee` across an account.** The rule it exposes:

| Fill | `fee_token` |
|---|---|
| Any perp fill | `"USDC"` |
| A spot SELL (`side: "A"`) | `"USDC"` |
| A spot BUY (`side: "B"`) | the **base** token — a `BTC/USDC` buy pays its fee in BTC |

The spot-buy rule has been live since block **6,565,000**. Below that height the
fee was charged in USDC, so a fill older than the pin carries `"USDC"` on both
sides. `fee_token` is derived per record, so an old record and a new one each
report the truth for their own height. Nothing committed changes.

Without this field, summing `fee` over a spot account adds one token to another
and produces a number that means nothing.

**On a spot BUY, `fee_token` also warns you that `fee` is not the whole story.**
The base fee is NETTED out of the size delivered, not debited from a balance, so
`fee` can read `"0"` while the real charge is the gap between `sz` and the
balance credit. See
[a spot BUY pays its fee in the base token](../concepts/fees.md#spot-buy-fee-in-base).

## The spot taker fee is lossless, and `null` means "the schedule applies" {#spot-taker-fee}

Two reads disagreed, and neither said why. A pair served
`taker_fee_bps: "5"` while [`fee_schedule`](rest/info.md#fee_schedule) said
`"3.5"`.

**The resolution rule.** A spot pair's deployer may set a taker override. If an
override exists it WINS, for every account, whatever the volume tier says. If no
override exists the volume-tiered [`fee_schedule`](rest/info.md#fee_schedule)
applies.

Two things made that undiscoverable, and both change:

- **The value was truncated.** The override is stored in **deci-bps** and was
  rendered by integer division, so `35` deci-bps (3.5 bps) printed as `"3"`.
  `taker_fee_bps` now renders losslessly — `"3.5"` — the same way the neighbouring
  cap field already does.
- **"No override" printed as `"0"`.** A missing override rendered as zero, which
  reads as "this pair is fee-free" and means "the schedule applies". When there
  is no override the field is now **`null`**.

**`null` is not zero.** A `null` sends you to `fee_schedule`. A `"0"`, if you ever
see one, is a real zero-rate override.

## Margin and funding stop crossing planes {#one-plane}

One response carried the same rung twice, under the same field name, ten
thousand times apart. Measured live on BTC:

```json
"margin_tiers":    [ { "maint_margin_ratio": "50" } ],
"risk_override": {
  "margin_tiers":  [ { "maint_margin_ratio": "0.005" } ]
}
```

`"50"` is bps. `"0.005"` is a fraction. They are the same maintenance ratio.

**What changes.** The `risk_override` margin tiers move onto the bps-string plane
the top-level `margin_tiers` already use. One concept, one plane, one encoding,
inside one response.

`risk_override.maint_margin_ratio` — the flat, non-laddered value beside them —
moves the same way, for the same reason.

### `funding.rate_per_hr` is sub-bps precise {#funding-precision}

`rate_per_hr` was truncated to whole bps. A rate below one bps therefore served
`"0"`, and `"0"` did NOT mean "no funding is charged" — it meant "smaller than
this field can say". A client that skipped funding on a zero was wrong every
time the rate was small.

It now renders losslessly. **A `"0"` is now a true zero.**

## Four inputs that used to pass are now rejected {#new-rejections}

Each of these accepted a bad request and answered as if it were a good one. A
silent wrong answer costs more than an error.

| Surface | Was | Is |
|---|---|---|
| [`candle_snapshot`](rest/info/perpetuals.md#candle_snapshot) with an unknown `coin` | `200` with an empty `candles` array — the same answer a quiet window gives | `400`, naming the coin as unknown |
| [`candle_snapshot`](rest/info/perpetuals.md#candle_snapshot) with an unknown `interval` | `200` with an empty `candles` array | `400`, naming the accepted set: `1m` `5m` `15m` `1h` `4h` `1d` |
| `portfolio` with an unrecognized `interval` | `400 invalid interval: <value>`, naming no valid value | `400`, naming the accepted value: **`1d`** |
| [`markets`](rest/info/perpetuals.md#markets) / [`markets_meta`](rest/info/perpetuals.md#markets_meta) with an unrecognized `kind` | Silently ignored — a typo returned BOTH sections, a superset, with no diagnostic | `400`, naming the accepted values: `perp` and `spot` |

The `candle_snapshot` rows close a surface that disagreed with itself:
[`l2_book`](rest/info/perpetuals.md#l2_book) already answered `404` for the same
unknown coin.

**A quiet window is still a `200` with an empty array**, and its
[coverage envelope](rest/info/perpetuals.md#candle_snapshot) still tells you so.
The change separates "you asked for something that does not exist" from "nothing
happened in that window". They were the same answer; they are two answers now.

## `explorer_block` and `explorer_txs` are REMOVED {#explorer-channels-removed}

Both WS channels are gone. Subscribing returns
`{"channel":"error","data":{"error":"unknown channel: explorer_txs"}}`.

**Why.** `explorer_txs` is a per-status firehose that did per-event work **on a
validator**, for every watcher. A validator's job is consensus, not serving. The
channels are removed rather than moved because the data is already served from
the archive.

**Use these instead** — both are `/info` reads on the gateway, both archive-backed,
and both take an optional `limit`:

```json
{ "type": "recent_blocks", "limit": 100 }
```

```json
{
  "data": {
    "blocks": [
      { "height": 26616908, "block_hash": "0x3bbc…d583",
        "ts_ms": 1788169351971, "action_count": 0, "fill_count": 0 }
    ]
  }
}
```

```json
{ "type": "recent_transactions", "limit": 100 }
```

```json
{
  "data": {
    "txns": [
      { "oid": "34143530", "user": "0x0c4e…96ab", "coin": "PUMP",
        "action": "resting", "status": 1, "side": 0, "time": 1788169342234 }
    ]
  }
}
```

Both reads answer in the [history-archive envelope](rest/info.md#archive-lane) —
`type` sits beside `data`, not inside it.

**Two facts a poller must plan for, because they are real losses.**

- **`recent_blocks` carries no `proposer`.** The WS header did. If you display the
  proposing validator, you no longer have it from this read.
- **`recent_transactions` carries no `hash`.** The WS row did, and
  [`/exchange`](rest/exchange.md) pointed at it as the hash-keyed way to check a
  submitted action. Correlate by `cloid` instead, or read
  [`action_outcome`](rest/info.md#action_outcome).

**Size the poll so it cannot gap.** The block cadence is about 100 ms, so 100
rows span roughly 10 seconds of chain. A poll every 2 seconds with `limit: 100`
overlaps every time and misses no height. Do not measure the cadence once and
treat it as a constant — it moves between releases.

## `user_twap_slice_fills` serves data {#twap-slice-fills}

The REST read answered `200 {"fills": []}` for every account, forever, because
nothing fed it. An always-empty read is worse than an absent one: it looks like
an answer.

It is now backed. The record shape is the one this reference already locked —
`{twap_id, fill}`, where `fill` is a full
[`user_fills`](rest/info.md#user_fills) record — so the envelope does not change.

**It is a node-local retention window, with the same caveat as the terminal order
states above:** a node restart empties it, and an empty window after a restart is
not the same fact as "this account has never run a TWAP". The read carries its
coverage envelope so the two are distinguishable.

The [WS channel](ws/subscriptions.md#user_twap_slice_fills) of the same name is
unchanged and remains the live path.

## The EVM JSON-RPC keeps receipts, and stops answering the wrong block {#evm-rpc}

Three rows. All three are live, and all three were re-measured after the release.

### Receipts survive a restart, and a release {#evm-receipts-durable}

**A receipt lives in memory today, so a release forgets it.** Every validator
halts, swaps its binary and resumes, and the in-memory record starts empty.
`eth_getTransactionReceipt` then answers `null` for a transaction that certainly
landed, and an indexer cannot tell that answer apart from "never existed".

**Each node now writes every receipt and every log to disk.** A restart keeps
them, and so does a release. Three reads move with them:

| Read | Was | Is |
|---|---|---|
| `eth_getTransactionReceipt` | `null` after any restart | resolves for every transaction at or after the earliest block the node holds |
| `eth_getLogs` | `[]` for a range the memory record no longer held — the same answer a genuine no-match gives | the logs, or `-32001` naming the earliest block |
| `eth_getBlockReceipts` | `-32601`; it was not a method | every receipt of one block, in `transactionIndex` order |

Two JSON-RPC errors arrive with them. Both carry a **`data`** member, which no
error on this RPC carried before:

| Code | When | `data` |
|---|---|---|
| `-32001` | the range starts before the earliest block the node holds | `{"earliestBlock":"0x…"}` |
| `-32005` | the scan reads more rows than the budget allows | `{"maxRowsScanned":100000}` |

**A `-32001` fails the WHOLE request.** No partial answer is returned. A partial
answer looks exactly like a complete one, so the missing part becomes a silent
gap in the caller's own store.

**There is no backfill.** No node holds the raw transactions of a past block, so
no node can re-derive a receipt it did not write. The series starts at the first
block the new binary executes, and nothing before it comes back.

**`transactionIndex` and `logIndex` become real.** Every log and every receipt
reported `transactionIndex: "0x0"`, and `logIndex` restarted at `0x0` on each
receipt, so two logs in one block could share `(blockNumber, logIndex)`. Both
now carry the true position, and that pair is unique inside a block. Check any
de-duplicating store keyed on it.

Full rules, error bodies and the `null` contract:
[Receipts and logs](../evm/index.md#receipts-and-logs).

### A non-tip block reference answers `null` {#evm-block-null}

`eth_getBlockByNumber` and `eth_getBlockByHash` answered EVERY request with the
tip. Asking for `0x1`, `0x3e8` and `0x186a0` in sequence returned three DIFFERENT
rising numbers — each one the tip at the moment of the call. A parser that trusts
the response body and does not re-check the echoed `number` indexes the wrong
block and never learns.

**Both methods now return `null` for any block reference that is not the tip.**
A tag (`latest` / `pending` / `safe` / `finalized`), the tip's own number, or the
tip's own hash serves the tip header. Everything else — `earliest`, a past
number, a future number, an unknown hash, garbage — is `null`. `null` is the
standard JSON-RPC answer for "no such block", and every EVM client already
handles it.

The block header's `miner` moves with them: it was all-zero and it becomes the
burn coinbase, so the header agrees with the `COINBASE` an execution sees.

**Superseded — see [The block reads answer a range](#evm-block-range) below.**
This section stood for one release. The paragraph that used to sit here said
block reads would never serve history; that was wrong, and the next section says
why.

### The block reads answer a range {#evm-block-range}

`eth_getBlockByNumber` and `eth_getBlockByHash` now serve **any block from the
earliest retained block to the tip**, with a real `transactions` list and a real
`gasUsed`. The block body is rebuilt from the receipt rows, which is why the span
is exactly the receipt span.

The two out-of-range answers are different and must be handled differently:

| Request | Answer | Meaning |
|---------|--------|---------|
| above the tip | `null` | not yet; poll again |
| below the earliest block | `-32001`, with `data.earliestBlock` | gone; polling never resolves it |

**This is the row that broke wallets.** MetaMask fetches
`eth_getBlockByHash(receipt.blockHash)` after a receipt arrives, and destructures
`baseFeePerGas` and `timestamp` from the result. The previous `null` threw inside
that destructure, so a transaction that had CONFIRMED stayed on screen as pending,
retrying every block. Any client that reads the block after the receipt hit the
same wall.

`timestamp` is now recorded per block, so a past block reports the time its own
`TIMESTAMP` opcode saw — not the time you asked.

Four methods arrive with it, all slices of the same block:
`eth_getBlockTransactionCountByNumber`, `eth_getBlockTransactionCountByHash`,
`eth_getTransactionByBlockNumberAndIndex`, `eth_getTransactionByBlockHashAndIndex`.

The roots stay all-zero, permanently: MTF commits no block header, so there is no
root to report. See [The block reads](../evm/index.md#the-block-reads).

### `eth_estimateGas` executes {#evm-estimate-gas}

`eth_estimateGas` returned an intrinsic-gas formula — base cost, creation
surcharge, per-calldata-byte cost — and ran no code. **Every contract interaction
sent with a default wallet or library therefore ran out of gas, reverted, and
burned the gas.** An ERC-20 `transfer` estimated about 21.6k against a real cost
several times that.

It now runs the call through the same simulation `eth_call` uses and returns the
larger of the pre-refund gas consumed and the EIP-7623 calldata floor. A
reverting call is an error, as it is on geth.

A plain native transfer still estimates 21000, so nothing changes for that path.

### `eth_call` runs in the committed block environment {#evm-call-env}

`eth_call` executed real contract code against real committed state, but inside a
placeholder block environment. A simulation therefore disagreed with execution,
with no error either way:

| Opcode | `eth_call` returned | Committed execution returns |
|---|---|---|
| `TIMESTAMP` | `0x1` | the consensus-derived block time |
| `COINBASE` | zero | the burn coinbase, the address base fees burn to |
| `GASLIMIT` · `BASEFEE` | baked constants | the governed committed values |
| `PREVRANDAO` | zero | zero — this one already agreed |
| `BLOCKHASH` | a fabricated `keccak256` of the block number | `0x0` |

The block environment now mirrors what the committed block builder uses, so a
contract that branches on `block.timestamp` simulates the way it executes.

**`BLOCKHASH` returns `0x0`, and that is the truthful answer.** The node keeps no
historical block hashes, so `0x0` is what committed execution itself returns. The
old value was invented by the simulator's empty backing store, and it agreed with
nothing.

## What does NOT change {#no-change}

- No signing domain moves. No signed action payload changes shape.
- No `/info` or `/exchange` type changes availability. The two removed WS
  channels and the added `eth_getBlockReceipts` are the only availability moves.
- No consensus rule changes, so no fork gate and no behaviour boundary at a
  height. Every row above takes effect when the binary swaps.
- Prices, sizes and money stay decimal strings on the same planes.
- `cloid` stays a `0x`-hex string. `twap_id` stays a number.
