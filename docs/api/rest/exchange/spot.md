---
description: "The two spot CLOB actions: place a spot order, and cancel a resting one. Reserved balances, size clamping at admission, and which leg the fee comes out of."
---

# Spot trading actions {#spot-trading-actions}

These actions place and cancel orders on a spot market.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

[Spot](../../../products/spot.md) actions trade one token for another. There
is no leverage and there are no positions. Spot books and balances are fully
separate from perps.

### Place a single spot order {#spot_order}

This action places one order on a spot market. A spot trade swaps one token for
another, with no leverage and no positions. The order body goes under
`action.order`.

- A spot order is sender-authorized by default. Omit `owner`, and the
  recovered signer is the trader.
- An optional `owner` lets an approved
  [agent](../../../concepts/agent-wallets.md) trade as the account that it is
  approved for. When `owner` is present, the digest binds it: the type string
  is different and has `address owner` right after `metafluxChain`. The chain
  rejects a signer that is not an approved agent of `owner` with `401`.
- `pair` is the spot pair id (`SpotPairSpec.pair_id`). It is different from a
  perp `market` id and from a token id.

```json
{
  "type": "spot_order",
  "order": {
    "pair":      200,
    "side":      "bid",
    "size":      100000000,
    "limit_px":  200000000,
    "tif":       "gtc",
    "stp_mode":  "cancel_oldest",
    "cloid":     "0xabababababababababababababababab"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Trade as this account (approved agents only). The digest binds it when present. Omit it for plain sender-authorized trading |
| `pair` | uint32 | an active spot pair | Spot pair id (`SpotPairSpec.pair_id`). It is not a token id |
| `side` | enum | `"bid"` / `"ask"` | `bid` buys base and pays quote. `ask` sells base and receives quote |
| `size` | uint64 | `> 0` | Base-asset size in raw lots (`10^sz_decimals` per whole unit). The chain widens it to `u128` |
| `limit_px` | uint64 | `>= 0` | Limit price in the `1e8` plane. `0` places a market order. A market order crosses the book at the available price and never rests |
| `tif` | enum | `"gtc"`, `"ioc"`, `"alo"` | A `gtc` or `alo` residual rests, backed by escrow. An `ioc` order never rests. A market order (`limit_px = 0`) requires `"ioc"`. The chain rejects `gtc` and `alo` for it, because it has no price to rest at. The chain rejects `"aon"` |
| `stp_mode` | enum | `"cancel_oldest"`, `"cancel_newest"`, `"cancel_both"` | Self-trade prevention. The chain rejects `"reject"`, because it has no core equivalent |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | Optional client order id |

**Escrow.** A resting spot order (a `gtc` or `alo` residual) locks the funds
that it would owe on fill into a reserved balance. A `bid` reserves quote, equal
to its notional at the limit price. An `ask` reserves the base that it offers.
You cannot spend reserved funds. The chain pays them to the counterparty on
fill. It refunds them to you on cancel, on self-trade prevention, or on market
deactivation. The balance of each token is conserved exactly.

**Affordability.** At admission, the chain clamps the order size to the amount
that you can fund:

- A priced buy (`limit_px > 0`) is clamped by `quote_balance ÷ limit_px`.
- A sell is clamped by the base that you own.
- A market buy (`limit_px = 0`) has no single price to divide by. The chain
  clamps it by walking the resting asks, level by level, against your quote
  balance.

The chain refuses an order that your balance cannot fund at all with
`insufficient spot balance`, and it does not use an order id. The refusal is
about money, not liquidity. A funded order that finds no counterparty still
answers `filled` with `total_sz: "0"`. One case stays an accepted no-op: a
market buy that holds quote, when the pair has no *foreign ask*. A foreign ask
is an ask from a different account. If a foreign ask exists but your quote
cannot buy one lot of it, the result is a refusal, not a no-op.

**Fees and settlement.** A fill swaps base for quote at the resting price of
the maker. The chain takes the taker fee from the leg that the taker receives,
and the maker fee from the leg that the maker receives. Fees accrue to the spot
fee account.

**Limits.** Each account can rest up to 1000 orders on each spot pair. The
chain rejects a new resting order above that cap with
`spot resting-order cap reached`. Cancel some orders first. Recognized
market-maker accounts are exempt. When governance halts spot, the chain rejects
new orders with `spot trading disabled`. You can still send
[`spot_cancel`](#spot_cancel) and get your escrow back.

**Response.** A `spot_order` returns a synchronous status for each order when
the order commits, in the same way as the perp
[`submit_order`](./orders.md#submit_order). The status is the assigned `oid`
with a `resting` or `filled` entry, or `error`. It is `pending` if no commit
lands within the order-wait window. The status union is the same as for
[`submit_order`](../exchange.md#200-ok--order-path-synchronous-oid). You can
also query spot balances and open orders with [`/info`](../info.md). The
WebSocket trades feed does not push spot fills yet.

---

### Cancel a resting spot order {#spot_cancel}

This action cancels one of your resting spot orders by `oid` on a pair. It
refunds the escrow that the order locked. The action is sender-authorized.
Only the owner of the order can cancel it. The chain rejects a third party or a
wrong owner with `not the order owner`. An unknown `oid`, or an `oid` that is
not resting, gets a typed miss (`order not found`). The spot halt does not
block cancels, so you can always exit a resting order and get the escrow back.

```json
{
  "type": "spot_cancel",
  "cancel": { "pair": 200, "oid": 12345 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Cancel as this account (approved agents only). The digest binds it when present |
| `pair` | uint32 | an active spot pair | The spot pair id that the order rests on |
| `oid` | uint64 | a resting spot `oid` | Server order id to cancel. Cancel by `cloid` is not mapped for spot yet |

---
