---
title: Placing orders
sidebar_label: Placing orders
description: Order flow. One perp order, many at once, spot, cancels, and the order actions among the twenty-two that you can skip.
---

# Placing orders

This page explains how to place and cancel perp and spot orders.

:::tip
**Stable.** The core order path is committed: `submit_order`, `batch_order`, `spot_order` and the
cancel family.
:::

The action catalog lists twenty-two order actions. Five of them cover almost every integration.
This page gives you those five first. Then it sorts the rest into tiers, so you know what to skip.
For the field-level schema of an action, follow its link into
[`POST /exchange`](../api/rest/exchange.md).

## Summary {#tldr}

- One perp order is [`submit_order`](../api/rest/exchange/orders.md#submit_order). It returns
  the real `oid` in the HTTP response.
- Many perp orders are [`batch_order`](../api/rest/exchange/orders.md#batch_order): one action,
  one signature, and one status per leg.
- Spot uses [`spot_order`](../api/rest/exchange/spot.md#spot_order) on a separate id space. Spot
  cannot batch: send one action per spot order.
- A production client signs with an [agent key](./agent-wallets-howto.md), not with the master
  key.
- The write side carries integers on two planes: price is `× 1e8`, size is `× 10^sz_decimals`.
  The read side returns whole-unit decimal strings. A mix-up of the two is the classic bug of a
  first integration.

## One perp limit order {#one-perp-order}

### 1. Read the market ids and grids {#read-the-grids}

The write path takes a numeric market id. Read it once at start-up, with the price and size
grids, from [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta):

```bash
curl -X POST https://api.testnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"markets_meta","coin":"BTC"}'
```

| You need | Field on `markets_meta` | Example |
|----------|------------------------|---------|
| Market id for `market` | `signing_id` | `0` |
| Price grid | `tick_size` (whole units) | `"0.1"` |
| Size precision | `sz_decimals` | `5` |
| Size grid | `step_size` (whole units) | `"0.00001"` |
| Smallest order | `min_order` (whole units) | `"0.00001"` |

:::warning `/info` addresses markets by `coin`, and `/exchange` takes the number
You query a read by symbol. `asset_id` is on no part of the wire today: not as a request
argument, and not as a response field. If you read it, you get `undefined`.

The id lives on `markets_meta`. Its name is `signing_id`, because it is the value that a signed
action carries in `market` (perp) or `pair` (spot). The dynamic
[`markets`](../api/rest/info/perpetuals.md#markets) read carries no id on its perp rows. Join the
two reads on `coin`, and cache the map at start-up.
:::

### 2. Convert to the wire planes {#convert-to-planes}

```
limit_px = price × 1e8                 → 50000.00  ×  1e8   = 5000000000000
size     = quantity × 10^sz_decimals   → 0.1       ×  1e5   = 10000
```

Both values must be on the market's grid. The node rejects an off-grid price or size. It never
snaps them. The signature binds the exact integers that you sent, so a snap would execute a price
that you never signed.

### 3. Sign and post the action {#post-the-order}

```bash
curl -X POST https://api.testnet.mtf.exchange/exchange \
  -H 'content-type: application/json' \
  -d '{
  "signature": "0x<65-byte r||s||v>",
  "nonce": 1735689600001,
  "action": {
    "type": "submit_order",
    "order": {
      "owner":       "0x<your account>",
      "market":      0,
      "side":        "bid",
      "kind":        "limit",
      "size":        10000,
      "limit_px":    5000000000000,
      "tif":         "gtc",
      "stp_mode":    "cancel_oldest",
      "reduce_only": false,
      "cloid":       "0x0000000000000000000000000000ab01"
    }
  }
}'
```

This order buys `0.1` BTC at `50000.00`, good-till-cancelled.

| Field | Type | What it does |
|-------|------|--------------|
| `owner` | hex address | The account the order trades for. The recovered signer must equal it, or be an approved agent of it. **Required.** |
| `market` | uint32 | The numeric market id from step 1 |
| `side` | `"bid"` / `"ask"` | `bid` buys, `ask` sells |
| `kind` | `"limit"` / `"market"` | Use `"limit"`. The trigger kinds need a `trigger` block. See [trigger orders](../api/rest/exchange/orders.md#trigger-orders-stop_loss--take_profit) |
| `size` | uint64 | Quantity on the `10^sz_decimals` plane |
| `limit_px` | uint64 | Price on the `1e8` plane |
| `tif` | `"gtc"` / `"ioc"` / `"alo"` | Rest, take-then-cancel, or post-only. `"aon"` is rejected |
| `stp_mode` | `"cancel_oldest"` / `"cancel_newest"` / `"cancel_both"` | What happens when the order would match your own resting order. `"reject"` is rejected |
| `reduce_only` | bool | `true` refuses to grow the position |
| `cloid` | hex string \| null | Your own id, `0x` + 32 hex chars. Use one on every order. It is the retry key |

The envelope around `action` carries three fields: `signature`, `nonce` and `action`. An optional
signed [`expires_after`](../api/rest/exchange.md#optional-action-expiry-expiresafter) is the only
other one. There is no top-level `sender`. The account comes from `owner` inside the body.
[Typed-data signing](./typed-data-signing.md) shows how the digest is built.

### 4. Read the response {#read-the-response}

```json
{ "statuses": [ { "resting": { "oid": "12345", "cloid": "0x0000000000000000000000000000ab01" } } ] }
```

An order action waits for commit, then returns `200 OK`, so the `oid` is real. The entries are at
`body.data.statuses`, one per order placed. The union is:

| Entry | Meaning |
|-------|---------|
| `{"resting":{"oid":N,"cloid":"0x…"}}` | On the book |
| `{"filled":{"oid":N,"total_sz":"…","avg_px":"…"}}` | Matched |
| `{"error":{"code":"…","message":"…"}}` | Rejected. The same error object that the envelope carries. Match on `code`, never on `message` |
| `{"noop":{"reason":"…"}}` | Accepted, and it changed nothing: a `reduce_only` leg with nothing left to reduce. This is a success. Do not retry it. No `oid`. See [`noop`](../api/rest/exchange.md#statuses-noop) |
| `{"pending":{"action_hash":"0x…","nonce":N}}` | Admitted, no commit inside the wait window (5 s by default) |

`pending` is not a failure. The action can still commit. Track it on the
[WS feed](../api/ws/subscriptions.md#order_updates) by `cloid`. Never invent an `oid`.

## Other everyday actions {#everyday-path}

### Many perp orders in one action {#many-perp-orders}

[`batch_order`](../api/rest/exchange/orders.md#batch_order) carries up to 1000 perp orders under
one signature and one nonce:

```json
{
  "type": "batch_order",
  "params": {
    "owner": "0x<account the signer acts for>",
    "orders": [
      { "owner": "0x…", "market": 0, "side": "bid", "kind": "limit",
        "size": 10000, "limit_px": 4990000000000, "tif": "gtc",
        "stp_mode": "cancel_oldest", "reduce_only": false },
      { "owner": "0x…", "market": 0, "side": "ask", "kind": "limit",
        "size": 10000, "limit_px": 5010000000000, "tif": "gtc",
        "stp_mode": "cancel_oldest", "reduce_only": false }
    ],
    "grouping": "na"
  }
}
```

The response carries one status entry per placed leg, in input order. Each entry echoes its own
`cloid`. A batch gives you the same feedback per order that a single order gives:

```json
{ "statuses": [
  { "resting": { "oid": "12345" } },
  { "error": "reduce-only would grow position" }
] }
```

Three rules apply:

- **Legs are independent.** Each leg runs the full order gate on its own. One rejected leg does
  not roll back the others.
- **The batch is block-atomic.** Every leg sees the same begin-block state.
- **Only the batch-level `owner` routes.** The schema requires the per-leg `owner`, but the node
  ignores it, and it is not in the signed digest. Set the account you act for at
  `params.owner`. If you omit `params.owner`, the batch trades for the signer.

`grouping` links legs into a family of an entry plus protection. Its values are `"na"`,
`"normalTpsl"` and `"positionTpsl"`. They are the one camelCase corner of a snake_case wire. See
[order types](../concepts/order-types.md#grouping).

### Spot order {#spot-order}

Spot is a token-for-token book with its own id space. It uses
[`spot_order`](../api/rest/exchange/spot.md#spot_order), which takes a `pair` id, not a `market`
id:

```json
{
  "type": "spot_order",
  "order": {
    "pair":     110,
    "side":     "bid",
    "size":     10000,
    "limit_px": 5000000000000,
    "tif":      "gtc",
    "stp_mode": "cancel_oldest",
    "cloid":    "0x0000000000000000000000000000ab02"
  }
}
```

Read the pair id from [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) with
`kind: "spot"` (`spot.pairs[*].signing_id`). Read the base token's `sz_decimals` from
`spot.tokens[*].sz_decimals`. The price plane stays `1e8`.

:::warning A perp batch cannot carry spot legs, and spot has no batch action
To place five spot orders, you send five separate actions, each with its own signature and nonce.
They are not atomic: some can rest while others fail. Plan for partial success.
:::

By default, the signer is the trader. A spot order also accepts an optional `owner`, so an
approved agent can trade for the account it acts for.

### Cancel {#cancel}

| Goal | Action | Address the order by |
|------|--------|----------------------|
| Cancel one perp order | [`cancel_order`](../api/rest/exchange/orders.md#cancel_order) | `market` + `oid` |
| Cancel one spot order | [`spot_cancel`](../api/rest/exchange/spot.md#spot_cancel) | `pair` + `oid` |

```json
{ "type": "cancel_order", "cancel": { "owner": "0x…", "market": 0, "oid": 12345 } }
```

List the open orders with [`open_orders`](../api/rest/info/orders-fills.md#open_orders). Its rows
carry `oid` and a symbol `coin`. Map the symbol back to the numeric id from step 1 before you
cancel. A cancel of an order that already filled or is already cancelled is refused with
`ORDER_NOT_FOUND`. This is harmless.

A cancel is not an order action. It returns the admission payload
(`{"data":{"accepted":true, …}}`), not a `statuses` array. `accepted: true` reports mempool
admission only. No channel reports a cancel that fails at commit, so confirm the cancel by the
order's absence from `open_orders`. See
[`accepted` is not `committed`](../api/rest/exchange.md#accepted-is-not-committed).

## Shared fields {#one-mental-model}

Every order shape shares the same seven fields. Learn them once, and not twenty-two times.

| Shared field | Present on | Note |
|--------------|-----------|------|
| market id | every shape | `market` on perp, `pair` on spot. Different id spaces |
| `side` | every shape | `"bid"` / `"ask"` on order bodies |
| `size` | every shape | `10^sz_decimals` plane |
| `limit_px` | every shape | `1e8` plane |
| `tif` | every shape | `"gtc"` / `"ioc"` / `"alo"` |
| `stp_mode` | every shape | self-trade prevention |
| `cloid` | every shape | optional, your retry key |

Every other field belongs to one shape only:

| Field | Only on | Why |
|-------|---------|-----|
| `kind`, `trigger` | perp order | Spot has no trigger registry |
| `reduce_only` | perp order | Spot has no positions |
| `position_side` | perp order | [Hedge mode](../concepts/hedge-mode.md) leg selection |
| `builder` | perp order | [Broker fee](../concepts/broker-codes.md). A spot order carries no such field, so it can charge no broker fee |
| `grouping` | `batch_order` | Links legs into a TP/SL family |
| `owner` (required) | `submit_order`, `cancel_order` | The routing claim |
| `owner` (optional) | `batch_order`, `spot_order`, `spot_cancel`, and most of tiers 2–3 (`modify`, `cancel_by_cloid`, `cancel_all_orders`, `scale_order`, `chase_order`, `twap_order`, and more) | Absent means the signer acts for itself. See each action's page for whether `owner` is digest-bound |

## Two number planes {#number-planes}

First integrations break here. The write side and the read side use different units.

| Direction | Field | Unit |
|-----------|-------|------|
| **Write** (`/exchange`) | `limit_px`, `px_low`, `px_high`, `trigger_px` | integer, price `× 1e8` |
| **Write** (`/exchange`) | `size`, `total_size` | integer, quantity `× 10^sz_decimals` |
| **Read** (`/info`, WS) | `px`, `sz`, `mark_px`, `tick_size`, `step_size` | whole-unit decimal **string** |

Two habits keep you safe:

1. **Never parse a money field to a float.** Read it as a string, and use a decimal type. A float
   loses precision above 2^53 and rounds prices that you must reproduce exactly.
2. **Convert at the edge only.** Hold whole-unit decimals in your strategy. Scale to integers in
   the one function that builds the action. Scale back in the one function that parses a read.

The read side also uses different names. A resting order comes back as
`{"oid":…, "coin":"BTC", "side":"B", "px":"50000", "sz":"0.1", "cloid":…}`. The read side uses
`"B"` / `"A"`, and the write side uses `"bid"` / `"ask"`.

## Sign with an agent key {#sign-with-an-agent-key}

Real integrations do not sign orders with the master key. The master key approves an *agent key*
once. The agent key signs every order after that.

1. The master signs [`approve_agent`](../api/rest/exchange/account.md#approve_agent) for the
   agent address.
2. Wait one block.
3. The agent key signs each order. The body still names the master at `owner` (or at
   `params.owner` for a batch).

An agent can place, modify and cancel orders. It cannot withdraw funds, create sub-accounts or
approve another agent. The full walkthrough is in
[agent wallets in practice](./agent-wallets-howto.md).

## Action tiers {#which-action}

Read tier 1. Skip the rest until you need it.

### Tier 1 (everyday core) {#tier-1}

| Action | Use it when |
|--------|-------------|
| [`submit_order`](../api/rest/exchange/orders.md#submit_order) | You place one perp order |
| [`batch_order`](../api/rest/exchange/orders.md#batch_order) | You place two or more perp orders together |
| [`spot_order`](../api/rest/exchange/spot.md#spot_order) | You place one spot order |
| [`cancel_order`](../api/rest/exchange/orders.md#cancel_order) | You cancel one perp order and you know its `oid` |
| [`spot_cancel`](../api/rest/exchange/spot.md#spot_cancel) | You cancel one spot order |

### Tier 2 (order lifecycle) {#tier-2}

Use these when you keep orders resting.

| Action | Use it when |
|--------|-------------|
| [`batch_cancel`](../api/rest/exchange/orders.md#batch_cancel) | You cancel many perp orders under one signature |
| [`cancel_by_cloid`](../api/rest/exchange/orders.md#cancel_by_cloid) | You must cancel before the `oid` reaches you |
| [`cancel_all_orders`](../api/rest/exchange/orders.md#cancel_all_orders) | You clear the whole book, or one market |
| [`modify`](../api/rest/exchange/orders.md#modify) | You change the price or size of a resting order in place |
| [`batch_modify`](../api/rest/exchange/orders.md#batch_modify) | You change the price of a whole quote ladder at once |
| [`schedule_cancel`](../api/rest/exchange/orders.md#schedule_cancel) | You want a dead-man's switch that cancels all at a future block |

### Tier 3 (node-run orders) {#tier-3}

The node runs the order for you. One signature buys a behaviour that a client loop would otherwise
do.

| Action | Use it when | Availability |
|--------|-------------|--------------|
| [`twap_order`](../api/rest/exchange/orders.md#twap_order) · [`twap_cancel`](../api/rest/exchange/orders.md#twap_cancel) | You spread one large order over time | live for one-way accounts only, see below |
| [`scale_order`](../api/rest/exchange/orders.md#scale_order) · [`cancel_scale`](../api/rest/exchange/orders.md#cancel_scale) | You want N rungs across a price band from one signature | live |
| [`chase_order`](../api/rest/exchange/orders.md#chase_order) · [`cancel_chase`](../api/rest/exchange/orders.md#cancel_chase) | You want one post-only leg that the node moves to the touch | live |

## Grid snapping on a synthesized fire {#deferred-fill-notice}

The chain rounds a synthesized fire price onto the tick grid, always toward the mark, so the fire
cannot leave its slippage band. It floors a TWAP slice size onto the lot grid. A parent whose
whole remainder is smaller than one lot retires, and does not run out its schedule. A schedule
that ends with no fill reports `Terminated`, not `Finished`.

:::note Historical parents before block 13,350,001
A parent that ended below that height reports `Finished`, also when no slice ever filled. Read
`Finished` on a historical parent as "the schedule ended", never as "it executed". The size
refused below the height is permanent: nothing is credited back, and no order is replayed.
:::

:::danger A hedge-mode account must send `position_side` on `twap_order`, and a one-way account must omit it
The slices inherit the leg that the parent names. The chain therefore refuses a hedge parent that
names no leg, and it also refuses a one-way parent that names one. The refusal happens at commit.
No channel reports a commit-time refusal of a non-order action: the HTTP reply already said
`accepted: true`, and the TWAP never starts. Read `position_mode` from
[`account_state`](../api/rest/info/account.md#account_state) once at session start, and set the
field from it.

The same silence at commit applies to every non-order action. Read
[`accepted` is not `committed`](../api/rest/exchange.md#accepted-is-not-committed) before you
build a retry loop on `accepted: true`.
:::

### Tier 4 (specialist venues) {#tier-4}

Skip these on a first integration. They are separate venues, not variations on a limit order.

| Action | Use it when | Availability |
|--------|-------------|--------------|
| [`rfq_request`](../api/rest/exchange/rfq-utility.md#rfq_request) · [`rfq_quote`](../api/rest/exchange/rfq-utility.md#rfq_quote) · [`rfq_accept`](../api/rest/exchange/rfq-utility.md#rfq_accept) | You negotiate a block trade off the book | live |
| [`fba_submit`](../api/rest/exchange/rfq-utility.md#fba_submit) | You want a uniform batch clearing price instead of the book | market must set `fba_enabled` |
| [`submit_encrypted_order`](../api/rest/exchange/utility.md#submit_encrypted_order) | You hide an order until a target block | testnet preview |

### Not order actions {#not-order-actions}

These actions sit next to the order actions in the catalog, and they are easy to mistake for
order actions:

| Action | What it is |
|--------|------------|
| [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage) | Margin setting for a market |
| [`vault_modify`](../api/rest/exchange/vaults.md#vault_modify) | Vault configuration for a vault leader |
| [`noop`](../api/rest/exchange/rfq-utility.md#noop) | A deliberate no-op that burns a nonce |

## Common first-run errors {#common-errors}

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 signer is neither the owner nor an approved agent` | Wrong `chainId`, or the agent approval has not committed | Match `chainId` to the node. Wait one block after `approve_agent` |
| Order rejected off-grid | `limit_px` not on `tick_size`, or `size` not on `step_size` | Snap on the client before you sign |
| The price looks `1e8` times too small | A whole-unit price sent as `limit_px` | Multiply by `1e8` before you sign |
| `400 duplicate cloid` | The same `cloid` was already admitted for this account | The first order is live. Look it up by `cloid` |
| `{"pending":…}` on every order | The wait window elapsed before commit | Track by `cloid` on the WS feed. Do not resubmit without a check |

## See also {#see-also}

- [`POST /exchange`](../api/rest/exchange.md): the full field-level catalog
- [Order types](../concepts/order-types.md): TIF, triggers, grouping, STP
- [Agent wallets in practice](./agent-wallets-howto.md): the hot-key pattern
- [Idempotency](./idempotency.md): `cloid` and nonce strategy for safe retry
- [Error handling](./error-handling.md): admission, commit and network classes
- [Market-maker performance](./market-maker-performance.md): async confirm and batch quoting
- [WS subscriptions](../api/ws/subscriptions.md): the live order and fill feeds
