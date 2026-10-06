---
description: What a priority bid buys inside a block, who receives it, what caps it, and how it differs from a broker fee.
---

# Priority fees

A priority bid buys a position for your next order inside a block. This page describes what it buys, who receives it and what caps it.

A **priority bid** is a rate that you pay to move your next order toward the
front of a block. You send it as its own action, `priority_bid`, before the
order it applies to.

:::info
**Status: active.** `priority_bid` has an EIP-712 type string, `/exchange` accepts
it, and no height gate holds it back. The block-ordering step and the settlement
charge both run today.

One part is not enabled: governance control of the cap. The vote kind
`set_priority_bid_max_bps` exists and a quorum can enact it, but the read side
still returns the built-in cap. The cap is 8 bps, and nothing can change it
today. See [The cap](#cap).
:::

## Summary {#tldr}

1. You send `priority_bid` for one asset, with a rate in whole basis points.
2. You wait for that bid to commit. An uncommitted bid does nothing.
3. Your next order on that asset is placed nearer the front of the block.
4. That order consumes the bid and pays `filled notional × rate`.
5. The payment goes to the protocol fee pools, not to the validator that
   ordered you.

A priority bid buys a position in the block. It does not buy a position in the
order book. See [Priority fee and broker fee](#vs-broker). This page exists to
prevent that confusion.

## What the bid buys {#what-it-buys}

A block has a list of actions. Every node applies that list in order. The node
that proposes the block sorts the user part of the list, and your bid is one
term of the sort key. A higher bid moves your order earlier in that list.

That is the full effect. In particular:

| The bid does not | Why |
|------------------|-----|
| Change how your order matches | The book is price-time priority. The engine never reads the bid. |
| Reserve a price | You are earlier in the queue of actions. That does not entitle you to a fill. |
| Skip a risk check | Margin, tick, lot and open-interest checks run without change. |
| Pass a system write | Oracle prices, deposits and the other writes that a node injects are drained before the whole user segment. A bid cannot reach them. |
| Pass another account's standalone cancel | Cancels sort into a class ahead of every other action, whatever anybody bid. This is deliberate: a paid lift must never trap a maker who is trying to pull a quote. |
| Reach across blocks | The sort runs inside one proposed block only. It cannot pull you into an earlier block. |

A liquidation is an ordinary user action for this sort. It has no bid, so a
paying order can come before the liquidation of another account inside the same
block.

:::info
There is one exception to the cancel rule. An account keeps its own actions in
the order it sent them. A cancel that follows an earlier action of the same
account in the same block thus gets the rank of that earlier action, and a
paying order from another account can come before it. A cancel sent on its own
is always ahead.
:::

Only a plain single order is lifted. The sort reads the bid for a `submit_order`
and for nothing else. A `batch_order`, a `modify`, a scale ladder or a chase
order ranks as if it had no bid, and it still consumes the bid. See
[When the bid is consumed](#consumption).

:::warning
A bid is a preference, not a guarantee. The node that proposes the block applies
the sort, over the actions that node holds at that moment. Your order and a
competing order can land in different blocks, or reach different nodes at
different times. Nothing here promises that you are ahead of a specific
counterparty.
:::

## Bid sequence {#sequencing}

The sort reads committed state. A bid that has not committed yet is not in that
state, so it ranks as `0` and lifts nothing.

The safe sequence:

1. Send `priority_bid`. Wait for the response that confirms that it committed.
2. Send the order.

The common mistake is to send both together. The bid can commit in the same
block as the order or later. In both cases, the order is sorted with no bid. The
order still consumes the bid when the bid commits.

## Who is paid {#who-is-paid}

The validator is not paid. The charge is debited from the taker and credited to
the protocol fee pools, split by the standard schedule. See
[Where fees go](./fees.md#where-fees-go).

This is a design decision. The party that orders your action never receives your
bid, so a bid is not a payment to any individual proposer.

The charge is:

```text
charge = filled notional × bid_bps / 10000     (truncated toward zero)
```

It is in addition to your normal taker fee. Only the taker side pays it.

## The cap {#cap}

| | Value |
|---|---|
| Cap today | **8 bps** |
| Minimum accepted bid | 1 bps |
| Bounds a governance vote may set | 1 – 100 bps |

The node rejects a bid of `0` and a bid above the cap. Neither stores anything,
and neither costs anything.

The vote floor is 1 and not 0. A cap of `0` would reject every bid, so a vote
could remove the whole mechanism. With the floor, a vote can make the cap small
but cannot delete it.

The node enforces the cap twice, with one reader. Admission checks your bid
against the cap. Settlement clamps the stored bid to the cap again before it
charges. Both read the same value, so they can never disagree. A cap lowered
after you bid applies to the charge, not only to new bids.

The governance vote `set_priority_bid_max_bps` is built, but its read side is
not enabled yet. Until it is, the cap is the built-in 8 bps for every account
and every asset.

## When the bid is consumed {#consumption}

There is one bid per account per asset. A second `priority_bid` on the same
asset replaces the first. Bids on different assets are independent.

Your next accepted perpetual order on that asset consumes the bid. The node
removes the bid at that point, whatever happens next:

| Situation | Bid consumed? | Charged? |
|-----------|---------------|----------|
| Order fills | yes | yes, on the filled notional |
| Order rests, no fill | yes | no |
| Order fills a tiny size, charge truncates to `0` | yes | no |
| Order is rejected before it reaches the book | no | no |
| A `batch_order` leg on that asset is accepted | yes | yes, on that leg's fills |
| A **spot** order on that asset | no | no |

The rule behind the table: the order consumes the bid because the slot at the
front of the block is already used, not because the order succeeded. A resting
order that never fills thus uses the bid for nothing. For priority on a later
order, send a new bid.

Spot orders never consume a priority bid, and never pay one. The bid applies to
the perpetual order path only.

The node does not validate the asset. A bid names an asset id, and the handler
stores it without a check that a market exists. A bid on an id with no market is
accepted and stays, because no order will ever consume it.

## Priority fee and broker fee {#vs-broker}

Both are extra payments attached to an order. They buy different things, and
neither one replaces the other.

| | Priority fee | [Broker fee](./broker-codes.md) |
|---|---|---|
| What it buys | **Ordering**: a position in the block | **Routing**: it pays the front end or bot that sent the order |
| Who is paid | The protocol fee pools | The broker, in full |
| How it is sent | Its own `priority_bid` action, before the order | A `builder` block **on** the order |
| Approval needed | None. You bid for yourself. | The trader must approve the broker first |
| Cap | 8 bps | 8 bps protocol cap, plus the trader's own lower cap |
| Effect on matching | None | None |

:::warning
A broker fee does not move you up the queue. A broker fee pays for routing. The
block sort and the matching engine do not see it. For ordering, send a
`priority_bid`. There is no other way.

The reverse is also true. A priority bid pays nobody who routed for you, so it
cannot replace a broker agreement.
:::

## Rejected bids {#rejection}

The chain validates `priority_bid` on-chain, not at admission. The endpoint
accepts the signed action, the chain commits it, and the handler then rejects
it.

When that happens inside the wait window of the endpoint, you get the
[failure envelope](../api/errors.md#envelope):

```json
{
  "error": {
    "code":    "INVALID_REQUEST",
    "message": "invalid parameters: bid 9 exceeds cap 8"
  }
}
```

The `message` column below is prose, listed so that you can read a log. Match on
`code`.

| Bid | `error.message` |
|-----|-----------------|
| `bid_bps` above the cap | `invalid parameters: bid <n> exceeds cap <cap>` |
| `bid_bps` of `0` | `invalid parameters: zero bid` |

If the action has not committed before the wait window closes, you get `202
Accepted` instead. That is not a success. The action is still in flight, and the
chain can still reject it when it commits.

:::warning
A rejected bid still consumes its nonce. The replay window advances when the
action commits, before the handler runs. To send the corrected bid, use a new
nonce. Nothing else is charged or stored.
:::

## Signers {#who-may-sign}

Only the master key can sign it. An approved [agent wallet](./agent-wallets.md)
cannot send `priority_bid`. Agent authority covers trading only. A priority bid
commits the funds of the owner to a charge, so it is outside that authority,
with the transfer and staking actions.

A [multi-sig](./multi-sig.md) account can execute `priority_bid` through its
normal M-of-N path.

## Reading a bid {#reading}

No query returns a pending priority bid. Track what you sent and when it
committed. The charge itself appears with the fill on which it was taken.

## See also {#see-also}

- [Broker codes](./broker-codes.md): the other extra fee on an order, and what it buys.
- [Fees](./fees.md): the base maker/taker schedule, and the protocol split that the charge joins.
- [Order types](./order-types.md): the order that the bid applies to.
- [`POST /exchange`](../api/rest/exchange/utility.md#priority_bid): the wire shape and field table.
