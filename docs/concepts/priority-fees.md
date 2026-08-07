---
description: Priority fees — what a priority bid buys inside a block, who is paid, what caps it, and why it is not a broker fee.
---

# Priority fees

A **priority bid** is a rate you pay to move your next order toward the front of
a block. You send it as its own action, `priority_bid`, before the order it
applies to.

:::info
**Status: live.** `priority_bid` has an EIP-712 type string, `/exchange` accepts
it, and no height gate holds it back. The block-ordering step and the settlement
charge both run today.

**One part is NOT enabled: governance control of the cap.** The vote kind
`set_priority_bid_max_bps` exists and a quorum can enact it, but the read side
still returns the built-in cap. **The cap is 8 bps and nothing can change it
today.** See [The cap](#cap).
:::

## TL;DR {#tldr}

1. You send `priority_bid` for ONE asset, with a rate in whole basis points.
2. You **wait for that bid to commit**. An uncommitted bid does nothing.
3. Your next order on that asset is placed nearer the front of the block.
4. That order consumes the bid, and pays `filled notional × rate`.
5. The payment goes to the protocol fee pools, **not** to the validator that
   ordered you.

A priority bid buys **position in the block**. It does not buy position in the
order book. See [Priority fee vs broker fee](#vs-broker) — that is the confusion
this page exists to prevent.

## What the bid buys {#what-it-buys}

A block carries a list of actions. Every node applies that list in order. The
node that proposes the block sorts the user part of the list, and your bid is
one term of the sort key. A higher bid moves your order earlier in that list.

That is the whole effect. In particular:

| The bid does NOT | Why |
|------------------|-----|
| Change how your order matches | The book is price-time priority. The engine never reads the bid. |
| Reserve a price | You are earlier in the queue of actions, not entitled to a fill. |
| Skip a risk check | Margin, tick, lot and open-interest checks run unchanged. |
| Pass a system write | Oracle prices, deposits and the other writes a node injects are drained ahead of the whole user segment. A bid cannot reach them. |
| Pass another account's standalone cancel | Cancels sort into a class **ahead of** every other action, whatever anybody bid. This is deliberate: a paid lift must never trap a maker who is trying to pull a quote. |
| Reach across blocks | The sort runs inside one proposed block only. It cannot pull you into an earlier block. |

A **liquidation** is an ordinary user action for this sort. It carries no bid, so
a paying order can precede another account's liquidation inside the same block.

:::info
**One exception to the cancel rule.** An account keeps its own actions in the
order it sent them. So a cancel that follows that same account's earlier action
in the same block inherits that earlier action's rank, and a paying order from
another account can precede it. A cancel sent on its own is always ahead.
:::

**Only a plain single order is lifted.** The sort reads the bid for a
`submit_order` and for nothing else. A `batch_order`, a `modify`, a scale ladder
or a chase order ranks as if it had no bid — **and it still consumes the bid**.
See [When the bid is consumed](#consumption).

:::warning
**A bid is a preference, not a guarantee.** The sort is applied by the node that
proposes the block, over the actions that node holds at that moment. Your order
and a competing order can land in different blocks, or reach different nodes at
different times. Nothing here promises you beat a specific counterparty.
:::

## Send the bid first, and let it commit {#sequencing}

The sort reads **committed** state. A bid that has not yet committed is not in
that state, so it ranks as `0` and lifts nothing.

The safe sequence:

1. Send `priority_bid`. Wait for the response that confirms it committed.
2. Send the order.

Sending both together is the common mistake. The bid may commit in the same
block as the order or later, and in both cases the order is sorted with no bid —
yet the order still consumes the bid once the bid is committed.

## Who is paid {#who-is-paid}

**Not the validator.** The charge is debited from the taker and credited to the
protocol fee pools, split by the standard schedule — see
[Where fees go](./fees.md#where-fees-go).

This is a design decision, not an accident of routing. The party that orders
your action is never the party that receives your bid, so a bid is not a payment
to any individual proposer.

The charge is:

```text
charge = filled notional × bid_bps / 10000     (truncated toward zero)
```

It is **additional** to your normal taker fee, and it is charged on the taker
side only.

## The cap {#cap}

| | Value |
|---|---|
| Cap today | **8 bps** |
| Minimum accepted bid | 1 bps |
| Bounds a governance vote may set | 1 – 100 bps |

A bid of `0` is rejected. A bid above the cap is rejected. Neither stores
anything and neither costs anything.

**Why the vote floor is 1 and not 0.** A cap of `0` would reject every bid, which
removes the whole lane by vote. The floor keeps that off the table: the lane can
be made narrow, not deleted.

**The cap is enforced twice, by one reader.** Admission checks your bid against
the cap, and settlement clamps the stored bid to the cap again before charging.
Both read the same value, so they can never disagree — and a cap lowered after
you bid applies to the charge, not just to new bids.

The governance vote `set_priority_bid_max_bps` is built but its read side is not
yet enabled. Until it is, the cap is the built-in 8 bps for every account and
every asset.

## When the bid is consumed {#consumption}

**One bid per account per asset.** A second `priority_bid` on the same asset
replaces the first. Bids on different assets are independent.

**Your next accepted perpetual order on that asset consumes it.** The bid is
removed at that point, whatever happens next:

| Situation | Bid consumed? | Charged? |
|-----------|---------------|----------|
| Order fills | yes | yes, on the filled notional |
| Order rests, no fill | yes | no |
| Order fills a tiny size, charge truncates to `0` | yes | no |
| Order is rejected before it reaches the book | no | no |
| A `batch_order` leg on that asset is accepted | yes | yes, on that leg's fills |
| A **spot** order on that asset | no | no |

The rule behind the table: the bid is consumed because the front-of-block slot
was already spent, not because the order worked out. A resting order that never
fills therefore burns the bid for nothing. If you want priority for a later
order, send a new bid.

**Spot orders never consume a priority bid**, and never pay one. The bid applies
to the perpetual order path only.

**The asset is not validated.** A bid names an asset id and the handler stores it
without checking that a market exists. A bid on an id with no market is accepted
and simply sits there, because no order will ever consume it.

## Priority fee vs broker fee {#vs-broker}

Both are extra money attached to an order. They buy different things, and neither
substitutes for the other.

| | Priority fee | [Broker fee](./broker-codes.md) |
|---|---|---|
| What it buys | **Ordering** — position in the block | **Routing** — it pays the front end or bot that sent the order |
| Who is paid | The protocol fee pools | The broker, in full |
| How it is sent | Its own `priority_bid` action, before the order | A `builder` block **on** the order |
| Approval needed | None. You bid for yourself. | The trader must approve the broker first |
| Cap | 8 bps | 8 bps protocol cap, plus the trader's own lower cap |
| Effect on matching | None | None |

:::warning
**Paying a broker does not move you up the queue.** A broker fee is compensation
for routing. It is invisible to the block sort and to the matching engine. If you
want ordering, you send a `priority_bid` — there is no other lever.

The reverse also holds: a priority bid pays nobody who routed for you, so it
cannot replace a broker agreement.
:::

## What a rejected bid looks like {#rejection}

`priority_bid` is validated **on-chain**, not at admission. The endpoint accepts
the signed action, the chain commits it, and the handler then rejects it.

When that happens inside the endpoint's wait window you get `200 OK` with a body
carrying `accepted: false` and the reason:

```json
{
  "accepted": false,
  "error": "invalid parameters: bid 9 exceeds cap 8",
  "mempool_depth": 3
}
```

| Bid | `error` |
|-----|---------|
| `bid_bps` above the cap | `invalid parameters: bid <n> exceeds cap <cap>` |
| `bid_bps` of `0` | `invalid parameters: zero bid` |

If the action has not committed before the wait window closes, you get `202
Accepted` instead. That is not a success: the action is still in flight, and it
may still be rejected when it commits.

:::warning
**A rejected bid still consumes its nonce.** The replay window advances when the
action commits, before the handler runs. Re-sending the corrected bid needs a
**new** nonce. Nothing else is charged or stored.
:::

## Who may sign it {#who-may-sign}

**Master key only.** An approved [agent wallet](./agent-wallets.md) **cannot**
send `priority_bid`. Agent authority is trading-only, and a priority bid commits
the owner's funds to a charge, so it sits outside that authority with the
transfer and staking actions.

A [multi-sig](./multi-sig.md) account can execute `priority_bid` through its
normal M-of-N path.

## Reading your bid back {#reading}

There is **no query that returns a pending priority bid**. Track what you sent
and when it committed. The charge itself appears with the fill it was taken on.

## See also {#see-also}

- [Broker codes](./broker-codes.md) — the other extra fee on an order, and what it really buys
- [Fees](./fees.md) — the base maker/taker schedule and the protocol split the charge joins
- [Order types](./order-types.md) — the order the bid applies to
- [`POST /exchange`](../api/rest/exchange.md#priority_bid) — the wire shape and field table
