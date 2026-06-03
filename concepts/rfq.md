# Request-for-quote (RFQ)

{% hint style="info" %}
**Preview.**
{% endhint %}

## TL;DR

RFQ lets a taker request a private quote on a specific size from a set of registered market makers, accept the best, and settle at that price — without exposing the size on the public book first. Useful for sizes that would move the visible book.

## Why RFQ

Public CLOB execution leaks intent. A $5M order on a thin asset signals everything before the first fill clears. RFQ flips the model:

- **Taker** publishes an RFQ for asset, side, size, optional reference price.
- **Makers** (registered + opted in for the asset) respond with quotes within a window (typically 1–5 seconds).
- **Taker** accepts the best quote → atomic settlement at that price; the rest of the quotes expire.

Quotes are visible to the taker only (not on the public book). Other participants see the trade ex-post on the [`trades` WS feed](../api/ws/subscriptions.md#trades) with a `kind: "rfq"` tag.

## Lifecycle

```
   taker                                makers
     │                                    │
     │  POST /exchange RfqRequest         │   (creates rfq_id)
     ├───────────────────────────────────►│
     │                                    │
     │  WS rfqEvents { rfqOpen, rfq_id }  │
     │   ──── broadcast ───►              │
     │                                    │
     │                            quote ──►│  POST /exchange RfqQuote (per maker)
     │                            quote ──►│
     │                            quote ──►│
     │                                    │
     │  WS rfqEvents { quotes:[…] }       │
     │ ◄───────────────────────────────── │
     │                                    │
     │  POST /exchange RfqAccept          │   (chooses one quote)
     ├───────────────────────────────────►│
     │                                    │
     │   settle at quote price            │
     │   notify maker (filled)            │
     │   expire other quotes              │
     │                                    │
     │  WS userEvents { kind: "fill" }    │
     │ ◄───────────────────────────────── │
```

## Action flow

### Taker — request an RFQ

`RfqRequest` (action variant; mirrors [`submit_order`](../api/rest/exchange.md#submit_order) shape):

```json
{
  "type": "RfqRequest",
  "params": {
    "asset":          0,
    "side":           "Buy",
    "size":        "10000000000",
    "reference_px":"10050000000",
    "max_slippage_bps": 50,
    "ttl_ms":         5000
  }
}
```

| Field | Meaning |
|-------|---------|
| `reference_px` | The taker's hint price (often the public mark); used by makers to anchor quotes |
| `max_slippage_bps` | Upper bound on price deviation from reference; quotes outside are dropped |
| `ttl_ms` | How long the RFQ stays open before auto-expire |

Response:

```json
{ "accepted": true, "rfq_id": "0x<16 bytes>" }
```

The RFQ is broadcast to opted-in makers via the [`userEvents` WS channel](../api/ws/subscriptions.md#userevents) (a dedicated `rfq*` event stream is roadmap).

### Maker — submit a quote

`RfqQuote`:

```json
{
  "type": "RfqQuote",
  "params": {
    "rfq_id":       "0x<...>",
    "px":     "10049000000",
    "size":      "10000000000",
    "expires_at_ms":1735690000000
  }
}
```

A maker can submit multiple quotes (e.g. partial fills at different prices) over the RFQ's lifetime. Each `RfqQuote` is its own action and gets its own `quote_id`.

### Taker — accept

`RfqAccept`:

```json
{
  "type": "RfqAccept",
  "params": { "rfq_id": "0x<...>", "quote_id": "0x<...>" }
}
```

Settlement is atomic in the next block:
- Taker's position grows by `size` at `px`.
- Maker's position grows by `size` opposite-side at the same price.
- Other quotes for this `rfq_id` expire.
- Fee structure: same maker/taker tiers as a public-book fill ([fees](./fees.md)).

### Auto-expire

When `ttl_ms` elapses without an accept:

```json
{ "kind": "rfqExpired", "rfq_id": "0x<...>" }
```

No charge; all submitted quotes are discarded.

## Maker registration

To be eligible to quote on an asset, a maker registers via `RfqRegister`:

```json
{
  "type": "RfqRegister",
  "params": { "asset": 0, "active": true, "min_size": "1000000000" }
}
```

`min_size` lets makers ignore small RFQs they don't want to be paged on. Unregister with `active: false`.

Registered makers receive RFQ broadcasts on `rfqEvents`. They are NOT obligated to quote — quoting is opt-in per RFQ.

## Settlement semantics

| Property | RFQ fill |
|----------|----------|
| Price | Quote's `px`, regardless of public book |
| Counter-party | One maker only (the chosen quote's signer) |
| Book impact | None — the trade does not match against resting orders |
| Public visibility | Trade tape shows the fill ex-post, tagged `rfq` |
| Fees | Standard maker/taker per fee schedule |
| Margin | Same as a regular fill (`init_margin` debited from both sides) |
| Liquidation | Same — the position becomes a regular position post-settle |

## What RFQ doesn't do

- **Doesn't bypass margin.** Taker must have margin for the position; failure to admit due to insufficient margin returns a normal `422`.
- **Doesn't hide ex-post.** The trade is published on the public trade feed after settlement, with the `rfq` tag.
- **Not Dutch-auction.** Quotes don't decay; makers submit fixed-price quotes; taker picks one.
- **Not multi-maker fill.** A single RFQ accept matches one maker's quote in full. To split across makers, run multiple RFQs.

## Querying open RFQs

{% hint style="warning" %}
**Planned.** The RFQ *action* surface (`RfqRequest` / `RfqQuote` / `RfqAccept`)
is live on `/exchange`, but the `/info` **read** query types below
(`rfq_open` / `rfq_user`) are **not yet wired** into the node's `/info`
dispatch — the RFQ engine state exists in `core-state` but isn't exposed on the
read path. Track live RFQs via the `rfq*` WS events meanwhile.
{% endhint %}

```bash
# planned — not yet served by /info
curl -X POST https://gateway.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"rfq_open","asset":0}'
```

Returns active RFQs (anonymised — taker address not exposed during the open window).

For your own RFQs:

```bash
# planned — not yet served by /info
curl -X POST https://gateway.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"rfq_user","user":"0x..."}'
```

Returns RFQs you've submitted (open + recent history).

## Edge cases

- **Multiple quotes from same maker.** Allowed; taker picks the best.
- **Maker quote arrives after taker accepts.** Quote is silently dropped; no error.
- **RFQ expires while taker is signing accept.** Accept returns `{"error":"rfq expired"}`. Retry with a fresh `RfqRequest`.
- **Taker account ineligible at accept time.** If the taker's account moves to T1+ between request and accept, accept is rejected. Maker keeps the right to quote on future RFQs.
- **Maker insufficient margin at accept time.** Accept rejected with `{"error":"maker margin"}`. Taker can try a different quote from the same RFQ.

## Sequence — accepted RFQ

```
T = 0      taker sends RfqRequest, ttl=5000ms
T = 0.1s   commit; rfq_id broadcast to makers
T = 0.3s   maker A quotes 10049
T = 0.5s   maker B quotes 10048   ← best
T = 0.7s   maker C quotes 10050
T = 1.0s   taker sees the three quotes, picks B
T = 1.1s   commit RfqAccept; settle 10000000000 @ 10048
           - taker fills long 100 @ 10048
           - maker B fills short 100 @ 10048
           - quotes from A, C expire
           - public trade tape: "100 BTC @ 10048 rfq"
```

## See also

- [Order types](./order-types.md) — public-book alternatives
- [`/exchange` action catalog](../api/rest/exchange.md#action-catalog) — `RfqQuote` / `RfqAccept` (currently recognized-but-unmapped stubs)
- [`userEvents` WS](../api/ws/subscriptions.md#userevents) — RFQ events ride this channel
- [Fees](./fees.md) — RFQ fills are taxed at the standard tier

## FAQ

**Q: Why not just place a hidden order on the book?**
A: Hidden orders still leak through fills. RFQ doesn't post anywhere — the size is invisible until settlement.

**Q: Can RFQ quotes be cancelled?**
A: Yes — `RfqCancelQuote { quote_id }`. Useful when the maker's risk shifts mid-RFQ.

**Q: Is there an RFQ-fill-only matching algorithm I should be aware of?**
A: No — once the taker accepts, settlement is direct between taker and the chosen maker. The CLOB engine is not involved.

**Q: Can a market without much CLOB liquidity still have an RFQ market?**
A: Yes — registered makers can quote on any market, regardless of book depth. RFQ is particularly useful for thin / long-tail assets where the public book can't absorb size.
