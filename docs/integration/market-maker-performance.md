---
title: Market-maker performance guide
sidebar_label: MM performance
---

# Market-maker performance guide

MetaFlux is a BFT chain: an order gets a **final on-chain id (`oid`) only after the block
commits**. If a quoting bot blocks on that commit for every place and cancel, its quote loop is
capped by block finality. High-frequency market makers do **not** wait on the commit — they use
three built-in fast paths. Adopting all three removes commit latency from the quote loop entirely.

## 1. Submit with `?confirm=async`

`POST /exchange?confirm=async` returns **`202 Accepted` immediately (T+0)** with a correlation
handle instead of blocking until commit:

```json
{ "accepted": true, "action_hash": "0x…", "cloid": "0x…", "nonce": 123 }
```

You get no `oid` in the response (the `oid` is assigned at commit). Learn the outcome from the
WebSocket feed (next section). A rejection that is only knowable at execution time arrives on the
`order_updates` / `user_events` channel keyed by `action_hash`.

Use the synchronous path (`/exchange` without `?confirm=async`) only when you genuinely need the
`oid` in the response — e.g. a one-shot order, not a quote refresh.

## 2. Cancel and modify by `cloid`, not `oid`

Set a **client order id (`cloid`)** on every order you place. Then cancel or replace by `cloid`
with no dependency on the commit-assigned `oid`:

- `CancelByCloid` — `buildNativeCancelByCloidAction` (TS) / the equivalent in the Rust SDK.

A `cloid`-keyed loop never has to wait for, or correlate, an `oid` before it can cancel.

## 3. Batch your quotes — one action, one nonce, one round

Do not send N separate orders/cancels for an N-level quote refresh. Send **one batched action**:

- `batchModify` — `buildNativeBatchModifyAction`: cancel-replace many resting orders in one signed
  action (up to **1000 legs**).
- `batchOrder` — `buildNativeBatchOrderAction`: place many orders in one signed action.

One batch = **one signature, one nonce, one commit round** for the whole refresh. A 50-level
two-sided requote is 1 action, not 100 round-trips — and it consumes 1 block inclusion slot instead
of 100. This is the single largest throughput multiplier available to a market maker.

## 4. Drive state from WebSocket, do not poll

Subscribe to the per-account channels and react to deltas instead of polling `/info`:

- `order_updates` — resting/fill/cancel transitions (correlate by `cloid` or `action_hash`).
- `fills` / `user_fills` — your executions.
- `account_state` / `spot_state` — margin, balances, positions.

Subscriptions are cheap (1 weight at subscribe, 0 per message); `/exchange` is weight 5 per
request and `/info` polling burns your rate budget. See [Rate limits](../api/rate-limits.md).

## Putting it together — the quote loop

```
on market move:
  batchModify([ cancel-replace all N levels ])   // 1 signed action, ?confirm=async
  // do NOT await an oid
on order_updates / fills WS delta:
  update local book, size next requote
```

This loop is bound by your local strategy + network RTT, not by per-order block finality. Batch
your refreshes rather than firing many individual orders in a burst — a batched action is both
faster and kinder to the mempool.

## Checklist

- [ ] Every order carries a `cloid`.
- [ ] Quote refreshes go through `batchModify` / `batchOrder`, not per-order calls.
- [ ] Submits use `?confirm=async`; the loop never awaits an `oid`.
- [ ] Order/fill/account state comes from `order_updates` / `fills` / `account_state` WS, not polling.
- [ ] Cancels/replaces are keyed by `cloid` (`CancelByCloid`).
