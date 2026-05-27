# WS subscription channels

{% hint style="info" %}
**Status.** **planned** at V1. Public-data channels ship first; private channels follow with auth.
{% endhint %}

The connection lifecycle and frame format are documented in the [WS README](./README.md). This page is the channel-by-channel catalog: args, payload shape, frequency, ordering guarantees, auth.

## Public channels (no auth)

### `meta`

Universe metadata: asset list, tick sizes, leverage caps, maintenance ratios. Pushed on subscribe and whenever governance updates a market.

```json
{ "op": "subscribe", "ch": "meta" }
```

Push payload:

```json
{
  "ch": "meta",
  "seq": 1,
  "ts": 1735689600000,
  "data": {
    "universe": [
      {
        "asset_id": 0,
        "name":     "BTC",
        "tick_size_e8":      "100",
        "step_size_e8":      "10000",
        "max_leverage":      50,
        "maint_margin_ratio_e6": "5000",
        "kind": "Perp"
      }
    ]
  }
}
```

Frequency: rare (only on governance change). Resume: yes.

### `allMids`

Mid price per asset, one map per push. Pushed every block-commit (~100 ms).

```json
{ "op": "subscribe", "ch": "allMids" }
```

```json
{
  "ch": "allMids",
  "seq": 999,
  "data": {
    "mids": { "BTC": "10050000000", "ETH": "320000000" }
  }
}
```

Frequency: ~10 / s. Resume: yes.

### `l2Book`

Order book snapshots + diffs for one asset.

```json
{
  "op": "subscribe",
  "ch": "l2Book",
  "args": { "coin": "BTC", "depth": 50, "agg": "0" }
}
```

| Arg | Default | Range | Description |
|-----|---------|-------|-------------|
| `coin` | — | required | Asset name |
| `depth` | 20 | `[1, 100]` | Top-N levels per side |
| `agg` | `"0"` | tick multiples | Price aggregation (`"0"` = no agg, `"100"` = group by 100×tick) |

First message is a snapshot (`is_snapshot: true`); subsequent are diffs:

```json
{
  "ch": "l2Book",
  "seq": 1,
  "data": {
    "coin": "BTC",
    "is_snapshot": true,
    "bids": [{ "px": "10050000000", "sz": "1000000" }, ...],
    "asks": [{ "px": "10060000000", "sz": "2000000" }, ...]
  }
}
{
  "ch": "l2Book",
  "seq": 2,
  "data": {
    "coin": "BTC",
    "is_snapshot": false,
    "updates": [
      { "side": "bid", "px": "10050000000", "sz": "500000" },
      { "side": "ask", "px": "10060000000", "sz": "0" }
    ]
  }
}
```

`sz: "0"` means level removed. Apply diffs in `seq` order.

Frequency: every commit that touches the book (~10 / s steady, bursts during volatile periods).
Resume: yes (server retains 30 s of diffs).

### `trades`

Public trade tape for one asset.

```json
{ "op": "subscribe", "ch": "trades", "args": { "coin": "BTC" } }
```

```json
{
  "ch": "trades",
  "seq": 555,
  "data": {
    "trades": [
      {
        "px": "10055000000",
        "sz": "100000",
        "side": "Buy",
        "ts": 1735689600123,
        "trade_id": 987654
      }
    ]
  }
}
```

Frequency: bursty; one push per commit-with-fills. Resume: yes.

### `mark`

Mark price stream for one asset.

```json
{ "op": "subscribe", "ch": "mark", "args": { "coin": "BTC" } }
```

```json
{
  "ch": "mark",
  "seq": 1234,
  "data": { "coin": "BTC", "mark_e8": "10055000000", "oracle_e8": "10054200000" }
}
```

Frequency: every commit. Resume: yes. See [mark prices](../../concepts/mark-prices.md).

### `fundingTicks`

Funding-rate updates per market.

```json
{ "op": "subscribe", "ch": "fundingTicks", "args": { "coin": "BTC" } }
```

```json
{
  "ch": "fundingTicks",
  "seq": 42,
  "data": {
    "coin":          "BTC",
    "rate_per_hr_e8": "1000",
    "next_payment_ts": 1735693200000
  }
}
```

Frequency: 1 / hour by default per market. Resume: yes.

### `candle`

OHLCV candle stream.

```json
{
  "op": "subscribe",
  "ch": "candle",
  "args": { "coin": "BTC", "interval": "1m" }
}
```

Intervals: `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"`.

```json
{
  "ch": "candle",
  "seq": 1,
  "data": {
    "coin": "BTC",
    "interval": "1m",
    "open_ts":  1735689540000,
    "open_e8":  "10050000000",
    "high_e8":  "10060000000",
    "low_e8":   "10049000000",
    "close_e8": "10055000000",
    "volume_e8":"5000000",
    "closed":   false
  }
}
```

Push frequency: every commit while a candle is open; one final push with `closed: true`.

### `bbo`

Best bid / offer for one asset (a thinner `l2Book`).

```json
{ "op": "subscribe", "ch": "bbo", "args": { "coin": "BTC" } }
```

```json
{
  "ch": "bbo",
  "seq": 999,
  "data": {
    "coin": "BTC",
    "bid_px_e8": "10049000000", "bid_sz_e8": "1000000",
    "ask_px_e8": "10051000000", "ask_sz_e8": "2000000"
  }
}
```

Frequency: every BBO change. Resume: yes.

---

## Private channels (auth required)

### `userEvents`

Catch-all per-user event firehose: order events, fills, margin events, liquidations.

```json
{
  "op": "subscribe",
  "ch": "userEvents",
  "args": { "user": "0x<addr>" },
  "auth": { /* see WS README */ }
}
```

Push payload union (dispatch on `kind`):

```json
{ "ch": "userEvents", "seq": 1, "data": { "kind": "orderResting", "oid": 12345, "cloid": "0x...", "asset": 0 } }
{ "ch": "userEvents", "seq": 2, "data": { "kind": "fill",         "oid": 12345, "px_e8": "...", "sz_e8": "...", "side": "Buy", "fee_e6": "100" } }
{ "ch": "userEvents", "seq": 3, "data": { "kind": "orderCancelled","oid": 12345, "reason": "user" } }
{ "ch": "userEvents", "seq": 4, "data": { "kind": "marginChange",  "asset": 0, "free_e6": "...", "locked_e6": "..." } }
{ "ch": "userEvents", "seq": 5, "data": { "kind": "liquidation",   "asset": 0, "tier": "T1", "closed_sz_e8": "..." } }
{ "ch": "userEvents", "seq": 6, "data": { "kind": "yellowCard",    "ts": ..., "health_e6": "...", "alo_cancelled": 3 } }
{ "ch": "userEvents", "seq": 7, "data": { "kind": "transferIn",    "from": "0x...", "amount_e6": "..." } }
```

Commit-derived. Resume: yes.

### `userFills`

Same fills as `userEvents { kind: "fill" }` but narrower (just fills, paginated history on subscribe).

```json
{
  "op": "subscribe",
  "ch": "userFills",
  "args": { "user": "0x<addr>", "since_ts": 1735000000000 }
}
```

`since_ts` controls how far back the initial replay goes (max 24 h). Subsequent pushes are live.

### `orderEvents`

Order-lifecycle-only stream.

```json
{ "op": "subscribe", "ch": "orderEvents", "args": { "user": "0x<addr>" } }
```

Variants of `kind`: `pendingAdmit`, `admitted`, `resting`, `partialFill`, `filled`, `cancelled`, `error`.

Pre-commit events (`pendingAdmit`, `admitted`) are hints. The corresponding commit-derived event (`resting`, `filled`, etc.) is authoritative.

### `marginEvents`

Margin-only stream (less chatty than `userEvents` for risk monitors).

```json
{
  "ch": "marginEvents",
  "seq": 1,
  "data": {
    "account_value_e6": "100000000",
    "maint_margin_e6":  "10000000",
    "health_e6":        "10000000",
    "tier":             "Safe"
  }
}
```

Tiers: `"Safe"`, `"T0"`, `"T1"`, `"T2"`, `"T3"`. Frequency: every commit that changes any input. Resume: yes.

### `vaultEvents`

Per-vault event stream (deposits, withdrawals, share-price ticks).

```json
{
  "op": "subscribe",
  "ch": "vaultEvents",
  "args": { "vault": "0x<vault_addr>" }
}
```

Public — anyone can subscribe to public vault telemetry.

### `twapEvents`

Per-TWAP slice events.

```json
{ "op": "subscribe", "ch": "twapEvents", "args": { "twap_id": "0x..." } }
```

```json
{
  "ch": "twapEvents",
  "seq": 1,
  "data": {
    "kind": "slice",
    "twap_id": "0x...",
    "slice_idx": 7,
    "slice_total": 60,
    "filled_e8": "100000",
    "avg_px_e8": "10052000000"
  }
}
```

Final push has `kind: "done"` (TWAP completed) or `kind: "cancelled"`.

### `rfqEvents`

```json
{ "op": "subscribe", "ch": "rfqEvents", "args": { "user": "0x..." } }
```

Variants: `rfqOpen`, `rfqQuoteReceived`, `rfqAccepted`, `rfqExpired`. See [RFQ](../../concepts/rfq.md).

---

## Ordering & delivery summary

| Channel | Source | At-least-once | Strict per-sub order |
|---------|--------|:-------------:|:--------------------:|
| `meta`, `allMids`, `l2Book`, `trades`, `mark`, `fundingTicks`, `candle`, `bbo` | commit-derived | yes (resume buffer 30 s) | yes |
| `userEvents`, `userFills`, `marginEvents`, `vaultEvents`, `twapEvents`, `rfqEvents` | commit-derived | yes | yes |
| `orderEvents` `pendingAdmit` / `admitted` | pre-commit | yes | yes |
| `orderEvents` `resting` / `filled` / `cancelled` / `error` | commit-derived | yes | yes |

No cross-subscription ordering. Match by `oid` / `cloid` / `action_hash`.

## Sizing & budget

Subscribe budget is **1 weight per `subscribe`**. In-stream messages cost **0**. A client with 50 subscriptions spends 50 weight one-time at connect, then consumes the firehose freely.

WS connections share the [per-IP / per-account rate-limit pool](../rate-limits.md), so the constraint is on subscribe/unsubscribe churn, not on push volume.

## See also

- [WS README](./README.md) — connection lifecycle, frames, auth, resume
- [Rate limits](../rate-limits.md)
- [`POST /info`](../rest/info.md) — REST equivalents for one-shot reads
