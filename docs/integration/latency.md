---
title: Optimizing latency
sidebar_label: Latency
description: Measure the block cadence yourself, pick the fastest write transport, and find where an order sits inside a block. Also lists the methods that gain nothing here.
---

# Optimizing latency

This page explains how to get an order into an early block and a good position inside it.

MetaFlux is a BFT chain. Your order does not execute when the exchange receives it. It executes
when the block that carries it commits. Lower latency here therefore means three separate things:

1. Get the action into the next block, and not the one after it.
2. Get a good position inside that block.
3. Learn the outcome without a wait for the commit.

This page covers 1 and 2, and the measurement that you need for both. Point 3 belongs to the
[market-maker performance guide](./market-maker-performance.md): `cloid`-keyed cancels, batched
quotes, and state from the WebSocket. Read that page first. This page does not repeat it, with one
exception. The `?confirm=async` advice in that guide has an endpoint caveat, stated under
[choose the transport](#choose-the-transport).

:::warning Do not take a block cadence from any document, this one included
The block interval is a node configuration parameter, and the observed rate does not match the
configured target. Measure the chain you trade on. The next section gives the method.
:::

## Cadence measurement {#measure-the-cadence}

[`account_state`](../api/rest/info/account.md#account_state) stamps the committed `height` it answers at
and the consensus `time` of that block. It is the only read that does, and it is cheap. Both
stamps advance on every commit, also for an address that never traded, and `detail: "margin"`
skips the position walk. Two reads give you the rate:

```bash
ADDR=0x0000000000000000000000000000000000000001
curl -s -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"'$ADDR'","detail":"margin"}'
sleep 60
curl -s -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"'$ADDR'","detail":"margin"}'
```

```
ms per block = (time_2 - time_1) / (height_2 - height_1)
```

**Use the returned `time`, not your own clock.** `time` is the consensus block time. The division
therefore needs no clock synchronisation and no correction for your network round trip. Your local
clock only sets how long you wait between the two reads.

For a view per block, use [`recent_blocks`](../api/rest/info/chain.md#recent_blocks). It returns
the same `height` and timestamp for a window of recent blocks in one read, so one call gives many
gaps to average. The `explorer_block` WS channel that pushed them before is
[removed](../changelog/ids-and-wire-shapes.md#explorer-channels-removed).

Sample over at least 30 seconds. A short sample measures jitter, not cadence.

:::info A worked example, not a constant
Two samples on the hosted chain on 2026-08-07 gave 160.2 ms and 159.9 ms per block. That figure
shows the method. It is not a value to build against, and it will not match what you measure.
Measure again per network, and again after any release.
:::

Two things follow from any number you get:

- **A faster round trip cannot buy an earlier block. It can only buy a better position inside the
  block.** When your action arrives before the next proposal, fewer milliseconds on the send do
  not move it to an earlier block. They can still move you within that block. See
  [ties keep arrival order](#ties-keep-arrival-order).
- **A timeout shorter than a few block intervals gives a false failure.** Size retry and expiry
  windows in measured blocks, not in fixed milliseconds. See
  [error handling](./error-handling.md) and [idempotency](./idempotency.md).

## Transport choice {#choose-the-transport}

Three transports exist on paper. On the public endpoint, one of them carries writes today.

| Transport | Carries writes | Notes |
|-----------|----------------|-------|
| [`POST /exchange`](../api/rest/exchange.md) | yes | The write path |
| [WebSocket subscriptions](../api/ws/subscriptions.md) | no | Read-only. This is how you learn the outcome |
| [WebSocket `post`](../api/ws/index.md#post-requestresponse-over-ws) | **not on the public endpoint yet** | See the admonition below |

Today the lowest-latency public write path is `POST /exchange` on a kept-alive connection. The
two gains that matter, largest first:

- **Keep the connection alive.** A cold HTTPS connection costs a TCP handshake and a TLS
  handshake before a single byte of your order moves. On a chain with a block interval in the low
  hundreds of milliseconds, a new handshake per order can cost you a block. Hold one connection
  open and reuse it. This is the largest saving on the send side, and integrators miss it most
  often.
- **Send one action, not many.** A batched action uses one block slot for the whole quote refresh,
  and not one slot per leg. See the
  [market-maker performance guide](./market-maker-performance.md).

:::warning `?confirm=async` is a node-level option, and the public endpoint does not carry it
A gateway serves the public endpoint. The gateway proxies the `/exchange` body to a node, and it
does not pass the query string on. The gateway therefore discards a `?confirm=async` sent to the
public endpoint without a signal, and you get the default synchronous reply.

The option is real. It works when your client addresses a node directly, for example a node that
you run yourself. It is not available over the public URL today. Do not build a quote loop that
depends on it until you test that your endpoint honours it. To test, send two orders, each with a
new nonce and a new `cloid`. Send one with the parameter and one without, then compare the two
replies. An accepted-ack against a full committed reply means the parameter took effect. Two
identical committed replies mean the endpoint dropped it.
:::

:::warning The WebSocket `post` write lane is not served publicly yet
The lane is implemented on a validator's own socket. The gateway serves the public endpoint, and
the gateway does not carry `post` today. A `post` frame sent to the public endpoint comes back as
an error frame, not as a `post` reply. That error frame tells you the lane is closed. Track its
status on the [WebSocket page](../api/ws/index.md#post-requestresponse-over-ws).

When the lane opens, do not assume it is faster. `post` dispatches through the exact same
handlers as the REST routes, signature verification included. The only savings are framing and
connection reuse, and a kept-alive REST connection already has the second one. Measure it when
the lane opens before you migrate.
:::

Reads are a separate question. Take state from the
[subscription channels](../api/ws/subscriptions.md), not from polling. See
[what does not help](#what-does-not-help).

## Ordering inside a block {#ordering-inside-a-block}

A block proposer sorts the user actions that it takes from the mempool. The sort has exactly one
boundary:

```
[ cancel family ]  before  [ everything else ]
```

That is the whole rule. Post-only, immediate-or-cancel and market orders have no separate class.
Exactly seven actions are in the leading class:

`cancel_order` · `cancel_by_cloid` · `cancel_all_orders` · `batch_cancel` · `spot_cancel` ·
`cancel_chase` · `cancel_scale`

Every other action follows them. **The list is by action, not by name.** `twap_cancel` and
`schedule_cancel` read like cancels, but they are not in the leading class. They are ordinary
actions. So is `modify`. Match the list, not the word.

**The reason is quote safety.** A market maker must be able to pull a stale quote. If a paying
order could be lifted in front of another account's cancel, a maker could lose on a quote that it
had already asked to remove. The boundary removes that risk.

The sort has four results, and each one matters to a caller.

### Arrival order among ties {#ties-keep-arrival-order}

The sort is stable, and the proposer takes actions from the mempool first in, first out. Two
actions with the same class and the same priority bid therefore keep the order in which they
reached the proposer. **Among actions with equal keys, earlier arrival means earlier execution.**

This is the case where raw send speed still pays. Two accounts race for the same resting
liquidity, in the same block, with no bid on either side. The account whose order reached the
proposer first takes it.

Treat this as a tendency, not a guarantee that you can compute. Arrival means arrival at the node
that proposes the block, and you do not choose that node. You therefore cannot derive your
position from your own send timestamp. You can remove avoidable delay on your side. The
kept-alive connection above is the largest such item.

### Send order of your own actions {#your-own-actions-keep-order}

The sort is stable, and the actions of each sender keep non-decreasing keys. **Your actions apply
in send order, always.** A cancel that you send after an order never overtakes that order.

This has a deliberate cost. A cancel that follows your own earlier order gets that order's key. A
foreign paying order can therefore come before such a cancel. This is the one case where the
cancel-first rule yields, and it yields on purpose. The alternative rules contradict each other.
Any fix that lifts the trailing cancel also lifts the sender's earlier order. That fix would give
free priority to anyone who appends a junk cancel.

### `modify` as a place {#modify-is-a-place}

`modify` and `batch_modify` place again through the order path. They therefore sit in the
trailing class with plain orders. If you want to remove a quote, send a cancel from the list
above. If you want to replace a quote, `batch_modify` is still the right call: one action, one
signature, one block slot. Do not expect it to get cancel priority.

The chain classifies a `multi_sig` envelope by the envelope alone. The inner payload stays
opaque, so a taker cannot enter the leading class by wrapping itself.

### Marketable `gtc` and `ioc` {#marketable-gtc-vs-ioc}

A marketable resting order is a better taker than an IOC. A marketable `gtc` order and an `ioc`
order both cross the book at once. Both sit in the same trailing class, and the ordering does not
tell them apart. The difference is what happens to the part that does not fill:

- `ioc`: the chain cancels the unfilled remainder.
- `gtc`: the unfilled remainder rests on the book at your limit price.

A marketable `gtc` therefore takes exactly what an `ioc` takes, and then keeps working. If
liquidity arrives one block later, the resting remainder catches it with no second round trip and
no second signature. Choose `ioc` when resting is wrong for the strategy. Do not choose it to be
"first": it buys no ordering advantage here. See
[order types](../concepts/order-types.md#time-in-force).

### Priority fees {#priority-fees}

Within the trailing class, an order from an account with a priority bid sorts ahead of orders
without one. [Priority fees](../concepts/priority-fees.md) is the chapter for this. It covers the
rate, the cap, who is paid, and when the bid is consumed. This page does not repeat it.

Three points belong here, because callers who focus on latency get them wrong:

- **A bid costs you a block before it helps you.** The bid is a separate action, and it does
  nothing until it commits. "Send a bid, then send the order" therefore takes at least two blocks.
  The urgent order arrives later than if you had sent it alone. A bid is useful for a planned entry
  that you can arm in advance. It does not speed up an order that you send now. See
  [sequencing](../concepts/priority-fees.md#sequencing).
- **A bid never crosses the class boundary.** No bid, of any size, lifts an order in front of
  another account's cancel.
- **A bid does nothing for an action that is not an order.** See [below](#what-does-not-help).

## Methods that do not help {#what-does-not-help}

This is the most useful section on the page. Integrators try each method below, and each one gains
nothing on this chain.

**A priority bid to speed up a cancel.** The chain reads the bid only for order actions. A cancel
carries no bid and needs none, because the cancel family already leads the block at no cost. You
would pay for a position that you already have.

**A priority bid from an agent hot key.** The master key must sign a bid. A bid signed by an agent
lands on the agent's own account, and your orders arrive under the master's account. The two never
meet, and you get no error. See [who may sign it](../concepts/priority-fees.md#who-may-sign).

**A priority bid to speed up the order you are about to send.** The bid must commit first, so the
pair takes two blocks instead of one. Arm a bid ahead of time, or not at all. See
[priority fees](#priority-fees).

**A priority bid to get in front of another account's cancel.** The class boundary sorts first,
and the bid sorts second. No bid amount crosses the boundary.

**Actions sent out of order to reorder them.** Your own actions keep send order. A cancel and an
order sent at the same time, in the hope that the cancel wins, does not work. The one you sent
first applies first. Put your intent in sequence. Do not race it.

**`ioc` to get ahead.** Ordering has one boundary, and time-in-force is not that boundary. An `ioc`
order and a `gtc` order sit in the same class. See [above](#marketable-gtc-vs-ioc).

**One batch split into many single actions.** Each action uses its own block slot and its own
signature. A block carries a bounded number of actions. A split makes you slower, and more likely
to spill into the next block. Batch instead. See the
[market-maker performance guide](./market-maker-performance.md).

**`/info` polls faster than the chain commits.** State changes at most once per commit. The
WebSocket channels are change-driven: after each commit, a channel publishes only if its state
changed. A poll between commits returns the same bytes and uses your rate budget. That budget then
throttles the writes you care about. See [rate limits](../api/rate-limits.md).

**Many parallel connections to spread the load.** The budget is keyed to the account, not the
connection, and the ordering rules above apply per sender. Extra sockets add handshakes and give
you nothing. Use one kept-alive connection, and reuse it.

**A resend of an action with no reply yet.** A resend cannot make the first copy commit sooner. If
the server admitted the first copy, the resend comes back as `duplicate cloid`. If it did not, you
lose a block interval to find that out. Correlate the original by `cloid` on the WebSocket. See
[idempotency](./idempotency.md).

**`?confirm=async` on a public-endpoint URL, assumed to take effect.** The gateway forwards the
body, not the query string. You get the default synchronous reply and no warning. Test it before
you build on it. See [choose the transport](#choose-the-transport).

**A cadence read from a document.** This document included. [Measure it](#measure-the-cadence).

## Checklist {#checklist}

- [ ] You measured the block cadence yourself, from two reads, with the `height` / `time` that the
      response carries.
- [ ] Timeouts and expiry windows are sized in measured blocks, not in fixed milliseconds.
- [ ] Writes go over one kept-alive connection to `POST /exchange`, not a new one per order.
- [ ] If your loop relies on `?confirm=async`, you tested that your endpoint honours it.
- [ ] Quote pulls use a cancel action, not `modify`, when the intent is to remove.
- [ ] Taking orders are `gtc`, unless resting is wrong for the strategy.
- [ ] No priority bid is attached to an action that is not an order.
- [ ] State comes from WebSocket subscriptions, not from polling.
