---
title: Optimizing latency
sidebar_label: Latency
description: Measure the block cadence yourself, pick the fastest write transport, and learn where an order sits inside a block — plus the tricks that buy nothing here.
---

# Optimizing latency

MetaFlux is a BFT chain. Your order does not execute when the exchange receives it. It executes
when the block that carries it commits. So "lower latency" here means three separate things:

1. Get the action into the **next** block instead of the one after it.
2. Get a good **position inside** that block.
3. Learn the outcome **without waiting** for the commit.

This page covers 1 and 2, and the measurement you need to reason about either.
Point 3 belongs to the [market-maker performance guide](./market-maker-performance.md) —
`cloid`-keyed cancels, batched quotes, and WebSocket-driven state. Read that page first. This page
does not repeat it, with one exception: that guide's `?confirm=async` advice has an endpoint caveat,
stated under [choose the transport](#choose-the-transport).

:::warning
**Do not take a block cadence from any document, including this one.** The block interval is a
node configuration parameter, and the observed rate does not match the configured target. Measure
the chain you trade on. The method is in the next section.
:::

## Measure the cadence {#measure-the-cadence}

The public [`block_info`](../api/rest/info.md#block_info) read carries both a committed `height`
and the **consensus** `timestamp` of that block. Two reads give you the rate:

```bash
curl -s -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' -d '{"type":"block_info"}'
sleep 60
curl -s -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' -d '{"type":"block_info"}'
```

```
ms per block = (timestamp_2 - timestamp_1) / (height_2 - height_1)
```

**Use the returned `timestamp`, not your own clock.** `timestamp` is the consensus block time, so
the division needs no clock synchronisation and no correction for your network round-trip. Your
local clock only decides how long you wait between the two reads.

Sample over at least 30 seconds. A short sample measures jitter, not cadence.

:::info
**Worked example, not a constant.** Two samples taken on the devnet chain on 2026-08-07 gave
160.2 ms and 159.9 ms per block. That figure is an illustration of the method. It is not a value to
build against, and it will not match what you measure. Re-measure per network, and re-measure after
any release.
:::

Two things follow from whatever number you get:

- **A faster round-trip cannot buy an earlier block — only a better position inside it.** Once your
  action arrives before the next proposal, shaving further milliseconds off the send does not move
  it to an earlier block. It can still move you **within** that block — see
  [ties keep arrival order](#ties-keep-arrival-order).
- **A timeout shorter than a few block intervals is a false failure.** Size retry and expiry windows
  in units of measured blocks, not in fixed milliseconds. See
  [error handling](./error-handling.md) and [idempotency](./idempotency.md).

## Choose the transport {#choose-the-transport}

There are three transports on paper. On the public endpoint, one of them carries writes today.

| Transport | Carries writes | Notes |
|-----------|----------------|-------|
| [`POST /exchange`](../api/rest/exchange.md) | yes | The write path |
| [WebSocket subscriptions](../api/ws/subscriptions.md) | no | Read-only. This is how you learn the outcome |
| [WebSocket `post`](../api/ws/index.md#post-requestresponse-over-ws) | **not on the public endpoint yet** | See the admonition below |

**Today the lowest-latency public write path is `POST /exchange` on a kept-alive connection.**
The two gains that matter, largest first:

- **Keep the connection alive.** A cold HTTPS connection costs a TCP handshake plus a TLS
  handshake before a single byte of your order moves. On a chain whose block interval you just
  measured in the low hundreds of milliseconds, a fresh handshake per order can cost you a block.
  Hold one connection open and reuse it. This is the single largest saving on the send side, and
  the one integrators most often miss.
- **Send one action, not many.** A batched action occupies **one** block slot for the whole quote
  refresh instead of one slot per leg. See the
  [market-maker performance guide](./market-maker-performance.md).

:::warning
**`?confirm=async` is a node-level option and the public endpoint does not carry it.** The public
endpoint is served by a gateway. The gateway proxies the `/exchange` **body** to a node and does
not pass the query string on, so a `?confirm=async` sent to the public endpoint is silently
discarded and you get the default synchronous reply.

The option is real, and it works when your client addresses a node directly — for example a node
you run yourself. It is not a lever available over the public URL today. Do not build a quote loop
that depends on it without testing that your endpoint honours it. Send **two** orders — a fresh
nonce and a fresh `cloid` for each — one with the parameter and one without, then compare the two
replies. An accepted-ack against a full committed reply means the parameter took effect. Two
identical committed replies mean it was dropped.
:::

:::warning
**The WebSocket `post` write lane is not served publicly yet.** It is implemented on a validator's
own socket, but the public endpoint is served by the gateway and the gateway does not carry `post`
today. A `post` frame sent to the public endpoint comes back as an **error frame**, not a `post`
reply — that is how you detect the lane is closed. Track its status on the
[WebSocket page](../api/ws/index.md#post-requestresponse-over-ws).

When it does open, do not assume it is faster. `post` dispatches through the **exact same handlers**
as the REST routes, including signature verification. The only saving is framing and connection
reuse, and a kept-alive REST connection already has the second one. Measure it when the lane opens
rather than migrating on faith.
:::

Reads are a separate question. Take state from the [subscription channels](../api/ws/subscriptions.md),
not from polling — see [what does not help](#what-does-not-help).

## Ordering inside a block {#ordering-inside-a-block}

A block proposer sorts the user actions it drains from the mempool. The sort has exactly **one
boundary**:

```
[ cancel family ]  before  [ everything else ]
```

That is the whole rule. There is no separate class for post-only, no separate class for
immediate-or-cancel, and no separate class for market orders. Exactly seven actions sit in the
leading class:

`cancel_order` · `cancel_by_cloid` · `cancel_all_orders` · `batch_cancel` · `spot_cancel` ·
`cancel_chase` · `cancel_scale`

Every other action follows them. **The list is by action, not by name.** `twap_cancel` and
`schedule_cancel` read like cancels and are **not** in the leading class — they are ordinary
actions. So is `modify`. Match the list, do not match the word.

**The reason is quote safety.** A market maker must be able to pull a stale quote. If a paying
order could be lifted in front of another account's cancel, a maker could be picked off on a quote
it had already asked to remove. The boundary removes that.

Four properties fall out of the sort, and each one matters to a caller:

### Ties keep arrival order {#ties-keep-arrival-order}

The sort is **stable**, and the proposer takes actions off the mempool first-in-first-out. So two
actions with the same class and the same priority bid keep the order in which they reached the
proposer. **Among equal-key actions, arriving sooner means executing sooner.**

This is the case where raw send speed still pays. Two accounts racing the same resting liquidity,
in the same block, with no bid on either side: the one whose order reached the proposer first
takes it.

Treat this as a tendency, not a computable guarantee. "Arrival" means arrival at whichever node
proposes the block, and you do not choose that node. So you cannot derive your position from your
own send timestamp. What you can do is remove avoidable delay on your side — the kept-alive
connection above is the biggest such item.

### Your own actions keep the order you sent them {#your-own-actions-keep-order}

The sort is stable, and each sender's actions are held to non-decreasing keys. **Your actions apply
in send order, always** — a cancel you send after an order never overtakes that order.

The deliberate cost: a cancel that follows your own earlier order inherits that order's key. So a
foreign paying order can precede such a cancel. This is the one case where the cancel-first rule
yields, and it yields on purpose — the alternative rules are jointly contradictory, and any fix
that lifts the trailing cancel also lifts the sender's earlier order, which would hand free
priority to anyone who appends a junk cancel.

### `modify` is a place, not a pull {#modify-is-a-place}

`modify` and `batch_modify` re-place through the order path, so they sit in the **trailing** class
with plain orders. If your intent is genuinely "remove this quote", send a cancel from the list
above. If your intent is "replace this quote", `batch_modify` is still the right call — it is one
action, one signature, one block slot — but do not expect it to inherit cancel priority.

A `multi_sig` envelope is classified by the envelope alone. The inner payload stays opaque, so a
taker cannot ride the leading class by wrapping itself.

### A marketable resting order is a better taker than an IOC {#marketable-gtc-vs-ioc}

Both a marketable `gtc` order and an `ioc` order cross the book immediately, and both sit in the
same trailing class — the ordering does not distinguish them. The difference is what happens to the
part that does not fill.

- `ioc` — the unfilled remainder is **cancelled**. Gone.
- `gtc` — the unfilled remainder **rests** on the book at your limit price.

So a marketable `gtc` takes exactly what an `ioc` takes, and then keeps working. If liquidity
arrives one block later, the resting residual catches it with no second round-trip and no second
signature. Choose `ioc` when resting is genuinely wrong for the strategy — not as a way to be
"first". It buys no ordering advantage here. See [order types](../concepts/order-types.md#time-in-force).

### Priority fees {#priority-fees}

Within the trailing class, an order from an account holding a priority bid sorts ahead of orders
that do not. **[Priority fees](../concepts/priority-fees.md) is the chapter for this** — the rate,
the cap, who is paid, and when the bid is consumed. This page does not repeat it.

Three points belong here, because they are what a latency-minded caller gets wrong:

- **A bid costs you a block before it helps you.** The bid is a separate action, and it does
  nothing until it commits. So "send a bid, then send the order" is at least two blocks, and the
  order you were rushing arrives **later** than if you had just sent it. A bid is worth it for a
  planned entry you can arm in advance. It is not a way to speed up an order you are sending now.
  See [sequencing](../concepts/priority-fees.md#sequencing).
- **A bid never crosses the class boundary.** No bid, at any size, lifts an order in front of
  another account's cancel.
- **A bid does nothing for anything that is not an order.** See [below](#what-does-not-help).

## What does not help {#what-does-not-help}

This is the most useful section on the page. Each item below is a real thing integrators try, and
each buys nothing on this chain.

**Paying a priority bid to speed up a cancel.** The bid is read only for order actions. A cancel
carries no bid, and does not need one — the cancel family already leads the block for free. You
would be paying for a position you already have.

**Paying a priority bid from an agent hot key.** A bid must be signed by the master key. Signed by
an agent it lands on the agent's own account, while your orders arrive under the master's — the two
never meet, and you get no error. See
[who may sign it](../concepts/priority-fees.md#who-may-sign).

**Sending a priority bid to speed up the order you are about to send.** The bid must commit first,
so the pair takes two blocks instead of one. Arm a bid ahead of time or not at all — see
[priority fees](#priority-fees).

**Paying a priority bid to get in front of someone else's cancel.** The class boundary sorts first,
the bid sorts second. No amount of bid crosses it.

**Sending your actions out of order to reorder them.** Your own actions are held to send order.
Firing a cancel and an order concurrently and hoping the cancel wins does not work — whichever you
sent first applies first. Sequence your intent, do not race it.

**Using `ioc` "to get ahead".** Ordering has one boundary, and it is not time-in-force. An `ioc`
order and a `gtc` order sit in the same class. See [above](#marketable-gtc-vs-ioc).

**Splitting one batch into many single actions.** Each action consumes its own block slot and its
own signature. A block carries a bounded number of actions. Splitting makes you slower and more
likely to spill into the next block, not faster. Batch instead — see the
[market-maker performance guide](./market-maker-performance.md).

**Polling `/info` faster than the chain commits.** State changes at most once per commit, and the
WebSocket channels are change-driven: after each commit a channel publishes **only** if its state
actually changed. Polling between commits returns the same bytes and burns your rate budget, which
then throttles the writes you care about. See [rate limits](../api/rate-limits.md).

**Opening many parallel connections to "spread the load".** The per-account budget is keyed to the
account, not the connection, and the ordering rules above are per sender. Extra sockets add
handshakes and give you nothing. One kept-alive connection, reused.

**Re-sending an action you have not heard back about.** A resend cannot make the first copy commit
sooner. If the first copy was admitted, the resend comes back as `duplicate cloid`; if it was not,
you have burned a block interval discovering that. Correlate the original by `cloid` on the
WebSocket instead — see [idempotency](./idempotency.md).

**Adding `?confirm=async` to a public-endpoint URL and assuming it took effect.** The gateway
forwards the body, not the query string. You get the default synchronous reply and no warning.
Test it before you build on it — see [choose the transport](#choose-the-transport).

**Reading a cadence from a document.** Including this one. [Measure it](#measure-the-cadence).

## Checklist {#checklist}

- [ ] You measured the block cadence yourself, from two `block_info` reads, using the consensus
      `timestamp`.
- [ ] Timeouts and expiry windows are sized in measured blocks, not fixed milliseconds.
- [ ] Writes go over **one kept-alive** connection to `POST /exchange`, not a fresh one per order.
- [ ] If your loop relies on `?confirm=async`, you tested that your endpoint honours it.
- [ ] Quote pulls use a cancel action, not `modify`, when the intent is to remove.
- [ ] Taking orders are `gtc` unless resting is genuinely wrong for the strategy.
- [ ] No priority bid is attached to anything that is not an order.
- [ ] State comes from WebSocket subscriptions, not from polling.
