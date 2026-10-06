---
title: Market-maker performance guide
sidebar_label: MM performance
---

# Market-maker performance guide

This page describes how a market maker keeps block finality out of its quote loop.

MetaFlux is a BFT chain. An order gets a final on-chain id (`oid`) only after the block commits.
A quoting bot that blocks on that commit for every place and cancel has a quote loop capped by
block finality. High-frequency market makers do not wait on the commit. They use three built-in
fast paths. With all three, the quote loop has no commit latency.

## Async confirm {#1-submit-with-confirmasync}

:::warning
A node honours `?confirm=async`. The public endpoint does not honour it today. A gateway serves
the public endpoint, and the gateway forwards the `/exchange` body without the query string. If
you send the parameter there, the gateway discards it, and you get the default synchronous reply.
Test your endpoint before you build the quote loop on it. See
[optimizing latency](./latency.md#choose-the-transport).
:::

`POST /exchange?confirm=async` returns `202 Accepted` at once (T+0) with a correlation handle. It
does not block until commit:

```json
{ "accepted": true, "action_hash": "0x…", "cloid": "0x…", "nonce": 123 }
```

The response has no `oid`, because the chain assigns the `oid` at commit. Get the outcome from
the WebSocket feed (next section). A rejection that the chain can know only at execution time
arrives on the [`order_updates`](../api/ws/subscriptions.md#order_updates) channel as `{"status":"rejected", "reason":"<free-text reason>"}`.
Correlate by `cloid`, not by `action_hash`. `order_updates` has no `action_hash` field.

Use the synchronous path (`/exchange` without `?confirm=async`) only when you need the `oid` in
the response, for example a one-shot order. A quote refresh does not need it.

## Cancel by cloid {#2-cancel-and-modify-by-cloid-not-oid}

Set a *client order id* (`cloid`) on every order you place. Then cancel or replace by `cloid`.
This does not depend on the `oid` that the commit assigns:

- `CancelByCloid`: `buildNativeCancelByCloidAction` (TS), or the equivalent in the Rust SDK.

A loop keyed on `cloid` never waits for an `oid`, and never correlates one, before it can
cancel.

## Batched quotes {#3-batch-your-quotes--one-action-one-nonce-one-round}

Do not send N separate orders or cancels for an N-level quote refresh. Send one batched action:

- `batchModify`: `buildNativeBatchModifyAction`. It cancels and replaces many resting orders in
  one signed action, up to 1000 legs.
- `batchOrder`: `buildNativeBatchOrderAction`. It places many orders in one signed action.

One batch uses one signature, one nonce and one commit round for the whole refresh. A 50-level
two-sided requote is 1 action instead of 100 round trips. It uses 1 block inclusion slot instead
of 100. This is the largest throughput multiplier available to a market maker.

## WebSocket state {#4-drive-state-from-websocket-do-not-poll}

Subscribe to the per-account channels and act on deltas. Do not poll `/info`:

- `order_updates`: resting, fill and cancel transitions. Correlate by `cloid` or `action_hash`.
- `fills` / `user_fills`: your executions.
- `account_state`: margin health and the whole token ledger (`spot.balances`).
  `clearinghouse_state`: perp positions. `spot_margin_state`: spot-margin positions.

Subscriptions are free. A subscribe costs 0 weight, and so does every pushed message.
`/exchange` is weight 5 per request, and `/info` polling uses your rate budget. See
[Rate limits](../api/rate-limits.md).

## The quote loop {#putting-it-together--the-quote-loop}

```
on market move:
  batchModify([ cancel-replace all N levels ])   // 1 signed action, ?confirm=async
  // do NOT await an oid
on order_updates / fills WS delta:
  update local book, size next requote
```

Your local strategy and the network RTT bound this loop. Per-order block finality does not.
Batch your refreshes. Do not fire many individual orders in a burst. A batched action is faster,
and it puts less load on the mempool.

## Checklist

- [ ] Every order carries a `cloid`.
- [ ] Quote refreshes go through `batchModify` / `batchOrder`, not per-order calls.
- [ ] Submits use `?confirm=async`, and the loop never awaits an `oid`.
- [ ] Order, fill and account state come from the `order_updates` / `fills` / `account_state` WS
  channels, not from polling.
- [ ] Cancels and replaces are keyed by `cloid` (`CancelByCloid`).
