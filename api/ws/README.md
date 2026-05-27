# WebSocket API

> Status: **planned** for V1 launch. The protocol shape below is committed; channel coverage rolls out incrementally.

## TL;DR

A single WS connection multiplexes subscriptions to many channels. Each message carries a per-channel `seq` number; reconnect with a `resume_token` to resume the stream without gaps. Read this page for the connection lifecycle; see [subscriptions](./subscriptions.md) for the channel catalog.

## URL

```
wss://<gateway>/ws
```

Devnet defaults to port `8443/ws`. Bare node exposes a smaller MTF-native WS at `:8080/ws` for trusted operators; do not connect public clients there.

## Connection lifecycle

```
client                              gateway
  │                                   │
  │ WS upgrade /ws                    │
  ├──────────────────────────────────►│
  │ 101 Switching Protocols           │
  │◄──────────────────────────────────┤
  │                                   │
  │ {"op":"subscribe","ch":"l2Book","args":{"coin":"BTC"}}
  ├──────────────────────────────────►│
  │ {"op":"subscribed","ch":"l2Book","sub_id":1,"args":{...}}
  │◄──────────────────────────────────┤
  │                                   │
  │ {"ch":"l2Book","seq":1,"data":{...}}     ◄── push
  │ {"ch":"l2Book","seq":2,"data":{...}}     ◄── push
  │ ...                               │
  │                                   │
  │ {"op":"ping","ts":1735689600000}  │
  ├──────────────────────────────────►│
  │ {"op":"pong","ts":1735689600000}  │
  │◄──────────────────────────────────┤
  │                                   │
  │ {"op":"unsubscribe","sub_id":1}   │
  ├──────────────────────────────────►│
  │ {"op":"unsubscribed","sub_id":1}  │
  │◄──────────────────────────────────┤
```

## Frames

All frames are JSON. Text frames (no binary).

### `subscribe`

```json
{
  "op": "subscribe",
  "ch": "<channel>",
  "args": { /* channel-specific */ },
  "auth": { /* optional, for private channels */ }
}
```

Response:

```json
{ "op": "subscribed", "ch": "<channel>", "sub_id": 1, "args": {...} }
```

Or, on rejection:

```json
{ "op": "error", "code": 400, "error": "<reason>", "ch": "<channel>" }
```

### `unsubscribe`

```json
{ "op": "unsubscribe", "sub_id": 1 }
```

```json
{ "op": "unsubscribed", "sub_id": 1 }
```

### `ping` / `pong`

```json
{ "op": "ping", "ts": 1735689600000 }
{ "op": "pong", "ts": 1735689600000 }
```

Send `ping` every 15 s. The server closes idle connections after 60 s without a frame in either direction.

### Push messages

```json
{
  "ch":   "l2Book",
  "seq":  1234,
  "ts":   1735689600123,
  "data": { /* channel-specific */ }
}
```

`seq` is monotonic per `(connection, channel, args)` tuple — i.e. per subscription. Gaps signal data loss; reconnect or resync.

### Resume

```json
{
  "op": "subscribe",
  "ch": "l2Book",
  "args": { "coin": "BTC" },
  "resume": { "seq": 1234, "token": "<resume_token>" }
}
```

If the server still has the buffer (default retention: 30 s of messages per sub), it replays from `seq=1235` and continues. If not, it responds `{"op":"resync"}` and the client must re-subscribe from scratch.

`resume_token` is opaque — present in every push as the closing-bracket `_token` field of the most recent message (channels that support resume document this).

## Authentication

Private channels (anything containing the user's account-specific data) require auth at subscribe time:

```json
{
  "op": "subscribe",
  "ch": "userEvents",
  "args": { "user": "0x<addr>" },
  "auth": {
    "sender":    "0x<addr>",
    "nonce":     1735689600000,
    "signature": "0x..."
  }
}
```

Auth is an EIP-712 signature over `{ "op": "ws_auth", "nonce": <n>, "expires_at_ms": <n+60000> }` with the same domain separator as [`/exchange`](../rest/exchange.md). One auth per subscribe; the server re-validates on the subscription, not per-message.

Authenticated subs survive for `expires_at_ms - now` only; after that the server unsubscribes you with `{"op":"error","code":401,"error":"auth expired"}` and you re-auth + re-subscribe.

## Multiplexing

A single connection can hold up to **256 subscriptions** by default. Pushes are interleaved across subs; the `sub_id` and `ch` fields demultiplex.

```
sub_id=1  l2Book BTC
sub_id=2  l2Book ETH
sub_id=3  userFills 0xabc...
sub_id=4  fundingTicks BTC
```

All four channels are pushed on the same connection; client routes by `sub_id`.

## Ordering guarantees

Per subscription, messages are strictly ordered by `seq` and arrive in commit order from the chain. Across subscriptions, there is **no** ordering guarantee — a fill on `userFills` for an order may arrive after the corresponding `orderEvents` push for the same fill. Match by `order_id` / `action_hash`, not by frame arrival order.

Channels documented as `commit-derived` are guaranteed to fire at most once per chain commit. Channels documented as `pre-commit` may fire at admit time and the action could be evicted later (rare); for those, treat the event as a hint and confirm via the commit-derived channel.

## Close codes

| Code | Reason |
|------|--------|
| `1000` | Normal close (client issued `close` frame) |
| `1006` | Abnormal close (network) — reconnect with backoff |
| `1011` | Server error — backoff and reconnect |
| `4000` | Rate-limit ban (too many subscribes / unsubscribes) |
| `4001` | Auth failed at upgrade |
| `4002` | Too many subscriptions (>256) |
| `4003` | Subscription buffer exhausted (resume token stale) |

## Reconnect strategy

1. Track the highest `seq` seen per subscription.
2. On disconnect, reconnect with exponential backoff (base 200 ms, max 30 s, jitter ±20%).
3. On reconnect, attempt `resume` per subscription with the stored `seq`.
4. If `{"op":"resync"}` arrives, re-subscribe without resume and discard local state for that sub (refresh from a snapshot if needed).

## Channel categories

- **Public market data** — no auth. Examples: `l2Book`, `trades`, `mark`, `fundingTicks`, `meta`.
- **Per-user data** — auth required. Examples: `userEvents`, `userFills`, `orderEvents`, `marginEvents`.
- **Operator / validator** — restricted. Out of scope for public docs.

Full catalog: [subscriptions](./subscriptions.md).

## See also

- [WS subscriptions catalog](./subscriptions.md)
- [Rate limits](../rate-limits.md) — WS budget shares the gateway pool
- [Signing walkthrough](../../integration/signing.md) — same envelope used for `auth`
