---
description: "The two spot CLOB actions: place a spot order, and cancel a resting one. Reserved balances, size clamping at admission, and which leg the fee comes out of."
---

# Spot trading actions {#spot-trading-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

Token-for-token [spot](../../../products/spot.md) actions — no leverage, no positions,
with books and balances entirely separate from perps.

### Place a single spot order {#spot_order}

Place a single order on a **spot** market. Spot trades are a token-for-token
swap with no leverage and no positions; books and balances are entirely separate
from perps. The order body is carried under `action.order`. A spot order is
**sender-authorized by default** — omit `owner` and the recovered signer is the
trader. An **optional** `owner` lets an approved
[agent](../../../concepts/agent-wallets.md) trade **as** the account it is approved
for; when it is present the digest binds it (a distinct type string with
`address owner` right after `metafluxChain`), so a signer that is not an approved
agent of `owner` is rejected `401`. `pair` is the **spot pair id**
(`SpotPairSpec.pair_id`), which is distinct from a perp `market` id and from a
token id.

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
| `owner` | hex address \| omitted | 40 hex chars | Optional: trade **as** this account (approved agents only). **Digest-bound** when present. Omit for plain sender-authorized trading |
| `pair` | uint32 | an active spot pair | Spot pair id (`SpotPairSpec.pair_id`) — **not** a token id |
| `side` | enum | `"bid"` / `"ask"` | `bid` buys base (pays quote); `ask` sells base (receives quote) |
| `size` | uint64 | `> 0` | Base-asset size in raw lots (`10^sz_decimals` per whole unit); widened to `u128` |
| `limit_px` | uint64 | `>= 0` | Limit price in the `1e8` plane. `0` places a **market** order — it crosses the book at whatever price is available and never rests |
| `tif` | enum | `"gtc"`, `"ioc"`, `"alo"` | `gtc` / `alo` residuals **rest** (escrow-backed); `ioc` never rests. A market order (`limit_px = 0`) requires `"ioc"` — `gtc`/`alo` is rejected, since it has no price to rest at. `"aon"` is rejected |
| `stp_mode` | enum | `"cancel_oldest"`, `"cancel_newest"`, `"cancel_both"` | Self-trade prevention. `"reject"` is rejected (no core equivalent) |
| `cloid` | hex string \| null | `0x` + 32 hex chars (16 bytes) | Optional client order id |

**Escrow.** A resting spot order (a `gtc` / `alo` residual) locks the funds it
would owe on fill into a reserved balance: a `bid` reserves **quote** (its
notional at the limit price), an `ask` reserves the **base** it offers. Reserved
funds are not spendable; they are paid to the counterparty on fill, or refunded
to you on cancel, self-trade-prevention, or market deactivation. Per-token
balances are conserved exactly.

**Affordability.** The order size is clamped at admission to what you can fund:
a priced buy (`limit_px > 0`) by `quote_balance ÷ limit_px`; a sell by the base
you own. A market buy (`limit_px = 0`) has no single price to divide by, so it
is clamped by walking the resting asks level by level against your quote
balance. An order your balance cannot fund at all is refused with
`insufficient spot balance`, and no order id is burned. The refusal is about
money, not liquidity: a funded order that finds no counterparty still answers
`filled` with `total_sz: "0"`. One exception stays an accepted no-op: a market
buy that holds quote, when the pair carries no **foreign ask** (an ask from
another account). A foreign ask your quote cannot buy one lot of is a refusal,
not a no-op.

:::caution Not live yet
The refusal ships with the next node release after 0.9.7. Until then, a live node
accepts an entirely unaffordable order as a no-op and answers `filled` with
`total_sz: "0"`.
:::

**Fees & settlement.** A fill swaps base for quote at the **maker's** resting
price. The taker fee is taken from the leg the taker receives; the maker fee from
the leg the maker receives. Fees accrue to the spot fee account.

**Limits.** Each account may rest up to **1000** orders per spot pair; a new
resting order past that cap is rejected (`spot resting-order cap reached` — cancel
some first). Recognized market-maker accounts are exempt. When spot is halted by
governance, new orders are rejected (`spot trading disabled`) — but you can still
[`spot_cancel`](#spot_cancel) and reclaim escrow.

**Response.** Like the perp [`submit_order`](./orders.md#submit_order), a `spot_order`
returns a **synchronous** per-order status once the order commits — the real
assigned `oid` with a `resting` or `filled` entry (or `error`), or `pending` if
no commit lands within the order-wait window. The status union is the same as
[`submit_order`](../exchange.md#200-ok--order-path-synchronous-oid). Spot balances / open
orders are also queryable via [`/info`](../info.md); spot fills are not yet pushed
to the WebSocket trades feed.

---

### Cancel a resting spot order {#spot_cancel}

Cancel one of **your** resting spot orders by `oid` on a pair, refunding the
escrow it locked. Sender-authorized; **only the order's owner may cancel it** —
a third party (or wrong owner) is rejected (`not the order owner`). An unknown or
non-resting `oid` is a typed miss (`order not found`). Cancels are **not** gated
by the spot halt, so you can always exit a resting order and reclaim escrow.

```json
{
  "type": "spot_cancel",
  "cancel": { "pair": 200, "oid": 12345 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional: cancel **as** this account (approved agents only). **Digest-bound** when present |
| `pair` | uint32 | an active spot pair | Spot pair id the order rests on |
| `oid` | uint64 | a resting spot `oid` | Server order id to cancel (cancel-by-`cloid` is not yet mapped for spot) |

---
