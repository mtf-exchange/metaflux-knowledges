---
description: Every row on this page is active. One release turned every `oid` and `tid` into a decimal-digit string, gave `order_status` all its fill legs and real terminal states, labeled the token a fill's fee is charged in, put margin and funding on one plane, rejected four inputs that used to pass, removed the two explorer WS channels, made EVM receipts and logs survive a restart, and stopped the EVM RPC answering a non-tip block reference with the tip.
---

# Ids and wire shapes

This page records the changes to ids and wire shapes that one release made, and when.

:::tip
Every row below is active. Each row was measured on the public testnet after the release landed.

The page is for anyone whose client still assumes the old shapes. If your client reads `tid` as a JSON number, or treats a spot `taker_fee_bps` of `null` as a zero rate, read [Ids become decimal-digit strings](#id-strings) and [The spot taker fee](#spot-taker-fee). These two rows corrupt data silently and raise no error.

Everything here is read-side. No signing domain moved, no signed payload changed, and no consensus rule changed.
:::

One release moves every row below at one boundary. Each row is something that a caller can observe.

## Ids become decimal-digit strings {#id-strings}

This row corrupts data today. `tid` is a 64-bit hash-derived value. It is already past 2^53, so a JSON number cannot carry it into JavaScript:

```
current wire:      "tid": 16613428288414605024
after JSON.parse:         16613428288414605000     <- off by 24
> MAX_SAFE_INTEGER:       true
```

Nothing raises an error. The digits are wrong, and every use that compares ids fails silently. A `user_fills` to `trades` join by `tid` matches nothing. Fill de-duplication by `tid` drops nothing.

Every price and every size on this wire is already a string, for this reason. Ids are the last numeric family without that protection.

On every response, `oid` and `tid` become decimal-digit strings. The field names do not change.

| Surface | Fields |
|---|---|
| [`user_fills`](../api/rest/info/orders-fills.md#user_fills) | `fills[*].oid`, `fills[*].tid` |
| [`trades`](../api/rest/info/perpetuals.md#trades) | `trades[*].tid` |
| [`order_status`](../api/rest/info/orders-fills.md#order_status) | `order.oid`, `trigger.oid`, `fills[*].oid`, `fills[*].tid`, `outcome.oid` |
| [`open_orders`](../api/rest/info/orders-fills.md#open_orders) | each row's `oid` |
| [`historical_orders`](../api/rest/info/account-history.md#historical_orders) | `orders[*].oid` |
| The RFQ / FBA read | `oid` |
| [`/exchange`](../api/rest/exchange.md) | every id in the ACK union: `resting.oid`, `filled.oid`, `chase.chase_oid`, `chase.leg_oid` |
| WS [`trades`](../api/ws/subscriptions.md#trades), [`fills`](../api/ws/subscriptions.md#fills), [`order_updates`](../api/ws/subscriptions.md#order_updates), [`user_twap_slice_fills`](../api/ws/subscriptions.md#user_twap_slice_fills) | `oid`, `tid` |

Requests take either form. Wherever a request body carries an `oid`, and above all in the `order_status` lookup, the node accepts a JSON number and a decimal-digit string. Nothing that you send today stops working.

Two things do not change on purpose:

- `twap_id` and `twapId` stay a number. It is a small per-account counter, not a derived 64-bit value, so it is nowhere near the limit.
- The [node JSONL streams](../nodes/data-streams.md) keep the numeric form. They are a byte-pinned tape that the archive and the indexer consume. They are not a public API. Parse them with a 64-bit reader.

### The signed cancel keeps a `u64` oid {#signed-oid-cliff}

An `oid` inside a signed action payload is unchanged. The typed digest binds `uint64 oid`, and re-typing it would re-shape signing for every client at once. That is out of scope here.

The residual risk is small. `oid` is a counter, about 32.5 million today, so it is four orders of magnitude below 2^53 and there is no current problem. If it ever approaches that limit, the signed cancel path needs its own decision. That decision is a signing change, not a read change.

## `order_status` reports every fill leg, and real terminal states {#order-status}

The `order_status` read had two defects.

It returned one fill leg and did not mark it as partial. Measured on the running chain: order `32535358` filled `0.62` and then `0.87`. The read served `0.62`. That is wrong by 58%, and nothing in the response said that a second leg existed.

Five different outcomes also answered identically. Canceled, cancel-rejected, rejected, evicted from the ring and never existed all returned a byte-identical `{"status":"unknown"}`. No integrator can reconcile an order book against that.

### The `filled` shape {#order-status-filled}

`fills` and `total_filled_sz` replace the `fill` key:

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

The chain removes `fill` and keeps no alias. A field that serves one arbitrary leg out of N is not an alias for anything. A client that reads `fill.sz` would stay wrong while it believed that it had upgraded. If you need one leg, read `fills[0]` and know what you choose.

Compare `total_filled_sz` with the size of the order to tell a full fill from a partial fill.

### The terminal states {#order-status-terminal}

`status` gains `"canceled"`, `"cancel_rejected"` and `"rejected"`. Each carries an `outcome` object:

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
| `oid` | decimal-digit string \| `null` | Order id. `null` when the node holds no id for the record. It is always `null` on `rejected`, which the chain refuses before it assigns an id |
| `coin` | string | Market symbol (perp) or spot pair name |
| `side` | `"B"` / `"A"` \| `null` | Order side. `null` on `canceled` and `cancel_rejected`, because a cancel names the order and not its side |
| `time` | uint64 | Consensus ms the order reached this state |
| `reason` | string \| `null` | The refusal text. `null` on a successful cancel. Branch on `status`, never on this string |

The three tokens mean different things. `cancel_rejected` says that the cancel request failed, because the order had already left the open view of this node. `canceled` says that the cancel succeeded. `rejected` says that the chain refused the order at admission.

`expired` does not exist. An earlier draft of this page named it. No node path writes it, so the reference and both SDKs no longer list it. Do not code a branch for it.

`sz`, `filled_sz` and `cloid` are not on `outcome`. An earlier draft listed them. Two rules put them out of reach. A fill resolves before the terminal window, so an order that reaches `outcome` has no fills and `filled_sz` could only read `"0"`. The cancel event that the node records carries the id, the market and the time, not the size.

`outcome` is a separate key from the `order` of an open resting hit on purpose. The two answer different questions, and one name over two field sets is how a caller reads the wrong one.

An `unknown` answer carries `outcome_coverage`, the count of orders that the terminal window holds. A `0` means that the window is empty after a restart, so the `unknown` says nothing about the order that you asked for.

### `cloid` keeps resolving after the fill {#order-status-cloid}

A `cloid` lookup used to fail as soon as the write completed. The fill ring is keyed by `oid` and carried no cloid, so a `cloid` stopped resolving when the order filled. The node now carries the cloid into its read-side rings. A `cloid` resolves a filled order and a terminal order as well as an open order.

### `unknown` means "outside this node's retention view" {#order-status-unknown}

The node serves the terminal states from a node-local retention window, not from committed state. This has two consequences:

- A node restart empties the window. After a restart, the node answers `unknown` for orders that it answered before. The window is a retention window, not a history.
- `unknown` is not proof that the order never existed. It says that this node cannot see the order. For the archive answer, read [`historical_orders`](../api/rest/info/account-history.md#historical_orders).

`historical_orders` already documents the same retention contract.

## A fill says which token its fee is in {#fee-token}

Every fill object gains `fee_token`, the coin symbol that the `fee` is charged in.

Read it before you sum `fee` across an account. The rule is:

| Fill | `fee_token` |
|---|---|
| Any perp fill | `"USDC"` |
| A spot SELL (`side: "A"`) | `"USDC"` |
| A spot BUY (`side: "B"`) | the base token. A `BTC/USDC` buy pays its fee in BTC |

The spot-buy rule has been in effect since block 6,565,000. Below that height, the chain charged the fee in USDC, so a fill older than the pin carries `"USDC"` on both sides. `fee_token` is derived per record, so an old record and a new one each report the truth for their own height. Nothing committed changes.

Without this field, a sum of `fee` over a spot account adds one token to another and produces a meaningless number.

On a spot BUY, `fee_token` also warns that `fee` is not the whole charge. The chain nets the base fee out of the size delivered. It does not debit a balance. So `fee` can read `"0"` while the real charge is the gap between `sz` and the balance credit. See
[a spot BUY pays its fee in the base token](../concepts/fees.md#spot-buy-fee-in-base).

## The spot taker fee is lossless, and `null` means "the schedule applies" {#spot-taker-fee}

Two reads disagreed, and neither said why. A pair served `taker_fee_bps: "5"` while [`fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule) said
`"3.5"`.

The resolution rule: the deployer of a spot pair may set a taker override. If an override exists, it wins for every account, whatever the volume tier says. If no override exists, the volume-tiered [`fee_schedule`](../api/rest/info/fees-credit.md#fee_schedule) applies.

Two things hid this rule. Both change:

- The value was truncated. The chain stores the override in deci-bps and rendered it by integer division, so `35` deci-bps (3.5 bps) printed as `"3"`. `taker_fee_bps` now renders losslessly as `"3.5"`, the same way as the neighboring cap field.
- "No override" printed as `"0"`. A missing override rendered as zero. That reads as "this pair is fee-free" but means "the schedule applies". When there is no override, the field is now `null`.

`null` is not zero. A `null` sends you to `fee_schedule`. A `"0"` is a real zero-rate override.

## Margin and funding stop crossing planes {#one-plane}

One response carried the same rung twice, under the same field name, ten thousand times apart. Measured on BTC:

```json
"margin_tiers":    [ { "maint_margin_ratio": "50" } ],
"risk_override": {
  "margin_tiers":  [ { "maint_margin_ratio": "0.005" } ]
}
```

`"50"` is bps. `"0.005"` is a fraction. They are the same maintenance ratio.

The `risk_override` margin tiers move onto the bps-string plane that the top-level `margin_tiers` already use. One concept has one plane and one encoding inside one response.

`risk_override.maint_margin_ratio` is the flat, non-laddered value beside them. It moves the same way, for the same reason.

### `funding.rate_per_hr` is sub-bps precise {#funding-precision}

`rate_per_hr` was truncated to whole bps. A rate below one bps served `"0"`. This `"0"` did not mean "no funding is charged". It meant "smaller than this field can say". A client that skipped funding on a zero was wrong every time the rate was small.

It now renders losslessly. A `"0"` is now a true zero.

## Four inputs that used to pass are now rejected {#new-rejections}

Each of these accepted a bad request and answered as if it were a good request. A silent wrong answer costs more than an error.

| Surface | Was | Is |
|---|---|---|
| [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot) with an unknown `coin` | `200` with an empty `candles` array, the same answer that a quiet window gives | `400`, naming the coin as unknown |
| [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot) with an unknown `interval` | `200` with an empty `candles` array | `400`, naming the accepted set: `1m` `5m` `15m` `1h` `4h` `1d` |
| `portfolio` with an unrecognized `interval` | `400 invalid interval: <value>`, naming no valid value | `400`, naming the accepted value: `1d` |
| [`markets`](../api/rest/info/perpetuals.md#markets) / [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) with an unrecognized `kind` | Silently ignored. A typo returned both sections, a superset, with no diagnostic | `400`, naming the accepted values: `perp` and `spot` |

The `candle_snapshot` rows remove an inconsistency. [`l2_book`](../api/rest/info/perpetuals.md#l2_book) already answered `404` for the same unknown coin.

A quiet window is still a `200` with an empty array, and its [coverage envelope](../api/rest/info/perpetuals.md#candle_snapshot) still says so. The change separates "you asked for something that does not exist" from "nothing happened in that window". Before, both gave the same answer. Now they give two answers.

## `explorer_block` and `explorer_txs` are removed {#explorer-channels-removed}

Both WS channels are gone. A subscribe returns `{"channel":"error","data":{"error":"unknown channel: explorer_txs"}}`.

`explorer_txs` is a per-status firehose. It did per-event work on a validator for every watcher. The job of a validator is consensus, not serving. The chain removes the channels and does not move them, because the archive already serves the data.

Use these reads instead. Both are `/info` reads on the gateway. Both are archive-backed. Both take an optional `limit`:

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

Both reads answer in the standard `/info` envelope, with `type` inside `data`. The [history-archive lane](../api/rest/info.md#archive-lane) differs in its rejection shape only.

A poller must plan for two losses:

- `recent_blocks` carries no `proposer`. The WS header did. If you display the proposing validator, this read no longer gives it to you.
- `recent_transactions` carries no `hash`. The WS row did, and [`/exchange`](../api/rest/exchange.md) pointed at it as the hash-keyed way to check a submitted action. Correlate by `cloid` instead, or read [`action_outcome`](../api/rest/info/account-history.md#action_outcome).

Size the poll so that it cannot leave a gap. The block cadence is about 100 ms, so 100 rows span roughly 10 seconds of chain. A poll every 2 seconds with `limit: 100` overlaps every time and misses no height. Do not measure the cadence once and treat it as a constant. It moves between releases.

## `user_twap_slice_fills` serves data {#twap-slice-fills}

The REST read answered `200 {"fills": []}` for every account, because nothing fed it. An always-empty read is worse than an absent read, because it looks like an answer.

The read now has data. The record shape is the one that this reference already locked: `{twap_id, fill}`, where `fill` is a full [`user_fills`](../api/rest/info/orders-fills.md#user_fills) record. The envelope does not change.

The read serves a node-local retention window, with the same caveat as the terminal order states above. A node restart empties it, and an empty window after a restart is not the same fact as "this account has never run a TWAP". The read carries its coverage envelope so that you can tell the two apart.

The [WS channel](../api/ws/subscriptions.md#user_twap_slice_fills) of the same name is unchanged and remains the real-time path.

## The EVM JSON-RPC keeps receipts, and stops answering the wrong block {#evm-rpc}

This section has three rows. All three are active, and all three were measured again after the release.

### Receipts survive a restart, and a release {#evm-receipts-durable}

A receipt lived in memory, so a release forgot it. Every validator halts, swaps its binary and resumes, and the in-memory record started empty. `eth_getTransactionReceipt` then answered `null` for a transaction that landed, and an indexer could not tell that answer from "never existed".

Each node now writes every receipt and every log to disk. A restart keeps them, and so does a release. Three reads change with them:

| Read | Was | Is |
|---|---|---|
| `eth_getTransactionReceipt` | `null` after any restart | resolves for every transaction at or after the earliest block the node holds |
| `eth_getLogs` | `[]` for a range the memory record no longer held, the same answer that a genuine no-match gives | the logs, or `-32001` naming the earliest block |
| `eth_getBlockReceipts` | `-32601`, because it was not a method | every receipt of one block, in `transactionIndex` order |

Two JSON-RPC errors arrive with them. Both carry a `data` member, which no error on this RPC carried before:

| Code | When | `data` |
|---|---|---|
| `-32001` | the range starts before the earliest block the node holds | `{"earliestBlock":"0x…"}` |
| `-32005` | the scan reads more rows than the budget allows | `{"maxRowsScanned":100000}` |

A `-32001` fails the whole request. The node returns no partial answer. A partial answer looks like a complete answer, so the missing part becomes a silent gap in the store of the caller.

There is no backfill. No node holds the raw transactions of a past block, so no node can re-derive a receipt that it did not write. The series starts at the first block that the new binary executes. Nothing before it comes back.

`transactionIndex` and `logIndex` become real. Every log and every receipt reported `transactionIndex: "0x0"`, and `logIndex` restarted at `0x0` on each receipt. So two logs in one block could share `(blockNumber, logIndex)`. Both fields now carry the true position, and that pair is unique inside a block. Check any de-duplicating store that is keyed on it.

[Receipts and logs](../evm/index.md#receipts-and-logs) has the full rules, the error bodies and the `null` contract.

### A non-tip block reference answers `null` {#evm-block-null}

`eth_getBlockByNumber` and `eth_getBlockByHash` answered every request with the tip. A request for `0x1`, `0x3e8` and `0x186a0` in sequence returned three different rising numbers. Each one was the tip at the moment of the call. A parser that trusts the response body and does not re-check the echoed `number` indexes the wrong block and never learns.

Both methods now return `null` for any block reference that is not the tip. A tag (`latest`, `pending`, `safe` or `finalized`), the number of the tip or the hash of the tip serves the tip header. Everything else is `null`: `earliest`, a past number, a future number, an unknown hash and garbage. `null` is the standard JSON-RPC answer for "no such block", and every EVM client already handles it.

The `miner` of the block header changes with them. It was all-zero and it becomes the burn coinbase, so the header agrees with the `COINBASE` that an execution sees.

This section is superseded. See [The block reads answer a range](#evm-block-range) below. This section stood for one release. An earlier paragraph here said that block reads would never serve history. That was wrong, and the next section says why.

### The block reads answer a range {#evm-block-range}

`eth_getBlockByNumber` and `eth_getBlockByHash` now serve any block from the earliest retained block to the tip, with a real `transactions` list and a real `gasUsed`. The node rebuilds the block body from the receipt rows, so the span is exactly the receipt span.

The two out-of-range answers differ. Handle them differently:

| Request | Answer | Meaning |
|---------|--------|---------|
| above the tip | `null` | not yet; poll again |
| below the earliest block | `-32001`, with `data.earliestBlock` | gone; polling never resolves it |

This row broke wallets. MetaMask fetches `eth_getBlockByHash(receipt.blockHash)` after a receipt arrives, and destructures `baseFeePerGas` and `timestamp` from the result. The previous `null` threw inside that destructure. A transaction that had confirmed stayed on screen as pending, and the wallet retried every block. Any client that reads the block after the receipt hit the same wall.

The node now records `timestamp` per block. A past block reports the time that its own `TIMESTAMP` opcode saw, not the time of the request.

Four methods arrive with it. All four are slices of the same block:
`eth_getBlockTransactionCountByNumber`, `eth_getBlockTransactionCountByHash`,
`eth_getTransactionByBlockNumberAndIndex`, `eth_getTransactionByBlockHashAndIndex`.

The roots stay all-zero permanently. MTF commits no block header, so there is no root to report. See [The block reads](../evm/index.md#the-block-reads).

### `eth_estimateGas` executes {#evm-estimate-gas}

`eth_estimateGas` returned an intrinsic-gas formula (base cost, creation surcharge and per-calldata-byte cost) and ran no code. Every contract interaction that a default wallet or library sent therefore ran out of gas, reverted and burned the gas. An ERC-20 `transfer` estimated about 21.6k against a real cost several times that.

It now runs the call through the same simulation that `eth_call` uses. It returns the larger of the pre-refund gas consumed and the EIP-7623 calldata floor. A reverting call is an error, as on geth.

A plain native transfer still estimates 21000, so nothing changes for that path.

### `eth_call` runs in the committed block environment {#evm-call-env}

`eth_call` executed real contract code against real committed state, but inside a placeholder block environment. A simulation therefore disagreed with execution, with no error either way:

| Opcode | `eth_call` returned | Committed execution returns |
|---|---|---|
| `TIMESTAMP` | `0x1` | the consensus-derived block time |
| `COINBASE` | zero | the burn coinbase, the address base fees burn to |
| `GASLIMIT` · `BASEFEE` | baked constants | the governed committed values |
| `PREVRANDAO` | zero | zero; this one already agreed |
| `BLOCKHASH` | a fabricated `keccak256` of the block number | `0x0` |

The block environment now mirrors what the committed block builder uses, so a contract that branches on `block.timestamp` simulates the way it executes.

`BLOCKHASH` returns `0x0`, and this is the true answer. The node keeps no historical block hashes, so `0x0` is what committed execution itself returns. The empty backing store of the simulator invented the old value, and it agreed with nothing.

## What does NOT change {#no-change}

- No signing domain moves. No signed action payload changes shape.
- No `/info` or `/exchange` type changes availability. The two removed WS channels and the added `eth_getBlockReceipts` are the only availability changes.
- No consensus rule changes, so there is no fork gate and no behavior boundary at a height. Every row above takes effect when the binary swaps.
- Prices, sizes and money stay decimal strings on the same planes.
- `cloid` stays a `0x`-hex string. `twap_id` stays a number.
