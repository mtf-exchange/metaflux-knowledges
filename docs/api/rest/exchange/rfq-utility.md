---
description: "Request-for-quote, frequent-batch-auction, and the utility actions that do not belong to one product lane."
---

# RFQ, FBA & utility actions {#rfq-fba--utility-actions}

These actions open and settle quote requests, submit into batch auctions and burn a nonce, through [`POST /exchange`](../exchange.md).

That page defines the request envelope, the EIP-712 signing rules, the number planes and the response shape. They apply to every action here.

This page covers [RFQ](../../../concepts/rfq.md) block trading, the [FBA](../../../concepts/fba.md) frequent-batch-auction entry and the deliberate no-op. All five actions return the [`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope. So a commit-time refusal comes back as a `200` with an `error` body. Read [`accepted` is not `committed`](../exchange.md#accepted-is-not-committed).

RFQ is the option trade path. It clears [option series](../../../products/options.md) and nothing else. The market that a request names is the `signing_id` of a live series, from [`option_series`](../info/options.md#option_series).

:::note[The session is read by polling, not by a feed]
[`rfq_open`](../../../concepts/rfq.md#querying-open-rfqs) lists every open session and its quotes. [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) lists the sessions that one account requested or quoted on. Both are public. No WS channel carries an RFQ event. So a taker polls for its quotes, and a maker polls for requests to answer.

A fill itemises nothing of its own. The balance change on [`account_state`](../info/account.md#account_state) is the public trace of the premium and the escrow.
:::

The RFQ and FBA numeric fields (`size`, `price`, `max_size`, `limit_px`) are unsigned fixed-point `u64` JSON numbers on the wire. They use the same 1e8 price plane and raw-lot size plane as [`submit_order`](./orders.md#submit_order), and the node widens them to `u128` or `i128` internally. They are not decimal strings. The strings-on-the-wire policy covers the whole-USDC decimal plane, not the fixed-point book plane. `side` here uses the core `"Bid"` / `"Ask"` tokens. They are capitalized, unlike the lowercase `"bid"` / `"ask"` of the perp order body.

Each RFQ action takes an optional `owner` (0x hex). With it, an approved [agent](../../../concepts/agent-wallets.md) can act as the master or vault that it is approved for. Unlike the order actions, the digest binds the RFQ `owner`. A distinct type string has `address owner` right after `metafluxChain`. The signer commits cryptographically to which account requests, quotes or accepts, because an RFQ session is gated to its requester. The node rejects a signer that is not an approved agent of `owner` with `401`. If you omit `owner`, the digest stays the plain sender-authorized digest. The `owner` of `fba_submit` follows the order convention instead: admission resolves it, and the digest does not bind it.

### Open an RFQ session {#rfq_request}

:::danger[`market` is an option series, and nothing else]
`market` takes the `signing_id` of a live option series, from [`option_series`](../info/options.md#option_series). The node refuses every other market, on all three actions:

```
precondition failed: rfq is options-only: market <n> is not an option series
```

The node also refuses a series that has already expired, with `precondition failed: option series expired`.

Do not compute the number. The API serves `signing_id` whole because the encoding behind it is internal. There is no public formula and no base to add.

The lane is options-only for a reason. A request-for-quote lane beside a public order book is not fair to that book. It lets size trade away from the price that everyone else posts against. MetaFlux offers RFQ only where there is no continuous book to undercut, and options have none. See [options](../../../products/options.md) and [MIP-4](../../../mip/mip-4.md).
:::

`rfq_request` lets the taker open a request-for-quote session: `size` on `market`, optionally bounded by `limit_px`, open for maker quotes until `expiry_ms`.

```json
{
  "type": "rfq_request",
  "params": {
    "market":    0,
    "side":      "Bid",
    "size":      100000000,
    "limit_px":  10050000000,
    "expiry_ms": 1735689605000,
    "stp_group": 42
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Open the RFQ as this master or vault (approved agents only). The digest binds it. See above |
| `market` | uint32 | a live option series | The [`option_series`](../info/options.md#option_series) `signing_id`. The node refuses any other market |
| `side` | enum | `"Bid"` / `"Ask"` | The side that the requester wants to take. `"Bid"` buys the option and pays the premium. `"Ask"` writes it and locks the escrow |
| `size` | uint64 | `> 0` | The requested size, on the `10^sz_decimals` plane of the series (widened to `u128`) |
| `limit_px` | uint64 \| null | — | An optional taker limit price, on the 1e8 plane. `null` or omitted means none |
| `expiry_ms` | uint64 | — | The session expiry timestamp (consensus ms) |
| `stp_group` | uint64 \| null | — | Ignored. The chain resolves your self-trade group from committed state, and a value that you send here has no effect. The field stays on the wire because it is inside the signed digest, so keep signing exactly what you sign today. See [self-trade prevention](../../../concepts/order-types.md#stp-groups) |

The typed-data primary type has two forms, for `owner` absent and for `owner` present:

```
MetaFluxTransaction:RfqRequest(string metafluxChain,uint32 market,uint8 side,uint64 size,bool hasLimitPx,uint64 limitPx,uint64 expiryMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
MetaFluxTransaction:RfqRequest(string metafluxChain,address owner,uint32 market,uint8 side,uint64 size,bool hasLimitPx,uint64 limitPx,uint64 expiryMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
```

In the digest, `side` encodes as a `uint8` (`0` is bid, `1` is ask). Each optional field flattens to a presence `bool` plus a value (`0` when absent).

The assigned `rfq_id` is a committed effect. Read it back from [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs). No WS channel carries it, so poll. The session is requester-gated: only the account that opened it can [`rfq_accept`](#rfq_accept) on it.

The chain checks a bounded request for collateral at once. When `limit_px` is present, the chain proves now that the taker can carry the worst case. That is the premium on a `"Bid"`, or the escrow that the premium does not fund on an `"Ask"`. It refuses with `precondition failed: insufficient free collateral for the request`. Without `limit_px`, the worst case is unbounded. So the binding check waits for the [accept](#rfq_accept), which gates both sides at the real price.

On a coin-settled series, that check reads a coin balance. A call escrows one unit of the underlying per whole unit, out of the spot balance of the writer. So an `"Ask"` with a `limit_px` on such a series is refused with `precondition failed: insufficient underlying balance for the escrow` when the sender does not hold the coin. Read [`settle_asset`](../info/options.md#option_series) on the series row to learn which asset the request is measured in.

`expiry_ms` is an absolute consensus-ms stamp, not a duration. `0` takes the governed default window. There is no expiry sweep. Every later action refuses an expired request, but it stays in the book until the open-request cap evicts it.

---

### Quote onto an open RFQ {#rfq_quote}

`rfq_quote` lets the maker post a quote onto an open RFQ session: a `price` and the maximum size that the maker fills, valid until `valid_until_ms`.

```json
{
  "type": "rfq_quote",
  "params": {
    "rfq_id":         9,
    "price":          2500000000,
    "max_size":       100000000,
    "valid_until_ms": 1735689604000,
    "stp_group":      7
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Quote as this master or vault (approved agents only). The digest binds it. See above |
| `rfq_id` | uint64 | an open session | The RFQ session id, from [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) |
| `price` | uint64 | `> 0` | The quoted premium per whole unit, on the 1e8 plane (widened to `i128`) |
| `max_size` | uint64 | `> 0` | The maximum size that the maker fills, on the `10^sz_decimals` plane of the series (widened to `u128`) |
| `valid_until_ms` | uint64 | — | The quote validity deadline (consensus ms) |
| `stp_group` | uint64 \| null | — | Ignored. The chain resolves your self-trade group from committed state, and a value that you send here has no effect. The field stays on the wire because it is inside the signed digest, so keep signing exactly what you sign today. See [self-trade prevention](../../../concepts/order-types.md#stp-groups) |

The typed-data primary type has two forms, for `owner` absent and for `owner` present:

```
MetaFluxTransaction:RfqQuote(string metafluxChain,uint64 rfqId,uint64 price,uint64 maxSize,uint64 validUntilMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
MetaFluxTransaction:RfqQuote(string metafluxChain,address owner,uint64 rfqId,uint64 price,uint64 maxSize,uint64 validUntilMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
```

The optional `stp_group` flattens to a presence `bool` plus a value in the digest. The node records the quote under the acting account as its maker. That account is the digest-bound `owner` when you quote as a vault, and the signer otherwise. The taker sees the quote on the session (`quotes[*]` in the [`rfq_open`](../../../concepts/rfq.md#querying-open-rfqs) and [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) reads).

---

### Accept an RFQ quote {#rfq_accept}

`rfq_accept` lets the taker accept one specific quote (`quote_idx`) on their session for a fill of `size`. The fill settles off-book at the quoted price. The remaining quotes expire with the session.

```json
{
  "type": "rfq_accept",
  "params": { "rfq_id": 9, "quote_idx": 0, "size": 100000000 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Accept as this master or vault (approved agents only). The digest binds it. Both legs must carry `owner` for an operator to open and accept as the vault |
| `rfq_id` | uint64 | own open session | The RFQ session id |
| `quote_idx` | uint32 | a quote on the session | The index of the accepted quote, from the [`rfq_open`](../../../concepts/rfq.md#querying-open-rfqs) and [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) reads |
| `size` | uint64 | `> 0` | The fill size, on the `10^sz_decimals` plane of the series (widened to `u128`) |

The typed-data primary type has two forms, for `owner` absent and for `owner` present:

```
MetaFluxTransaction:RfqAccept(string metafluxChain,uint64 rfqId,uint32 quoteIdx,uint64 size,uint64 nonce)
MetaFluxTransaction:RfqAccept(string metafluxChain,address owner,uint64 rfqId,uint32 quoteIdx,uint64 size,uint64 nonce)
```

The accept is requester-gated. The node honors it only for the account that opened the session. This binding is why the RFQ `owner` is part of the signed digest.

#### What the fill moves {#rfq_accept-effects}

The accept settles one option fill. It moves three amounts and nothing else.

1. The premium goes from the buyer to the writer. The premium in USDC is the quoted `price` times whole units, truncated toward zero to micro-USDC. The premium is USDC on both kinds.
2. The escrow goes from the balance of the writer into the series pot. The escrow is [`escrow_per_unit`](../info/options.md#option_series) times whole units, denominated in the [`settle_asset`](../info/options.md#option_series) of the row. It is the strike in USDC for a put, and one coin of the underlying for a call.
3. The escrow of a closing writer comes out of the pot, exactly, in the same asset. The chain nets the own legs of each account first, so a round trip returns what it locked.

The fill charges the taker a fee, in USDC. The taker is the account that sent the request, whichever leg it took. The quoting maker pays none. The fee is the smaller of a rate on the strike face of the option and a fraction of the premium. Both rates start unset, which charges nothing. See [the option fee](../../../products/options.md#option-fee).

The affordability check covers the premium and the fee. So a taker that can fund the premium alone is refused before anything moves. The node checks the request in the same way, so it refuses up front an `rfq_request` that you could not afford to accept.

On a coin-settled series, the chain checks the writer twice, once per asset. A USDC escrow nets the premium that the writer receives, so one number covers it. A coin escrow cannot net a USDC premium. So the chain tests the coin balance for the escrow and the USDC balance for the fee, separately. That is why a call writer that holds every coin it needs can still be refused for the fee.

The response does not carry the fee, so compute it. Read `option_taker_bps` and `option_premium_cap_ppm` from the `option` row of `products` on [`/info fee_schedule`](../info/fees-credit.md#fee_schedule), then:

```text
strike_face = strike x size          # BOTH kinds, in USDC
premium     = price x size           # USDC
fee         = min( strike_face x option_taker_bps / 10000 ,
                   premium x option_premium_cap_ppm / 1000000 )
```

The notional is the strike face on a call too, not the coin escrow. The chain would need a price to value one coin in dollars, and it never prices an option. So the strike is the notional that it can read.

Both terms truncate toward zero, and the smaller one wins. If you are the taker on a buy, your balance moves by the premium plus this fee. If you are the taker on a sell, your balance moves by the escrow plus this fee, less the premium. On a call, the escrow leg moves your coin balance and not your USDC.

The fill opens no perpetual position and reserves no margin. An option position can never be liquidated. See [options](../../../products/options.md).

#### Refusals {#rfq_accept-refusals}

Every check runs before anything moves, so a refused accept changes no state.

The column below is `error.message`. Its `code` is `PRECONDITION_FAILED`, `AUTH_UNAUTHORIZED` for `unauthorized`, or `INVALID_REQUEST` for an `invalid parameters` sentence. Match on the code, not on this text. The text is prose, and it can change. It is listed so that you can read a log.

| `error.message` | Cause |
|---|---|
| `precondition failed: rfq is options-only: market <n> is not an option series` | The market of the session is not a live series |
| `precondition failed: option series expired` | The series is at or past its `expiry` |
| `precondition failed: request expired` / `quote expired` | The session or the quote is past its own deadline |
| `precondition failed: quote idx <n> not found on rfq RfqId(<n>)` | No quote at that index |
| `precondition failed: quote price violates taker limit` | The quote is worse than the `limit_px` of the request |
| `precondition failed: self-trade blocked` | Buyer and writer are the same account, or share an STP group |
| `precondition failed: premium truncates to zero` | `price` × units is below one micro-USDC. Raise the size or the price |
| `precondition failed: insufficient free collateral for premium` | The buyer cannot pay the premium |
| `precondition failed: insufficient free collateral for escrow` | USDC series only. The writer cannot fund the escrow that the premium does not cover |
| `precondition failed: insufficient underlying balance for the escrow` | Coin series only. The writer does not hold the coin that the escrow takes: one unit of the underlying per whole unit |
| `precondition failed: insufficient free collateral for the fee` | Coin series only. The writer holds the coin but cannot pay the USDC fee. The two assets are gated separately |
| `precondition failed: option series holds the maximum number of positions` | The series holds 2,048 position rows. Closing an existing row is still allowed |
| `precondition failed: option position registry is full` | The chain holds 32,768 option position rows |
| `precondition failed: series escrow would exceed the ceiling` | The series pot is at its ceiling |
| `unauthorized` | The accepter is not the account that opened the session |
| `invalid parameters: accepted size exceeds quote max_size` / `... exceeds request size` | The fill size is above one of the two bounds |

---

### Submit into a frequent-batch auction {#fba_submit}

`fba_submit` submits an order into the live [FBA](../../../concepts/fba.md) window of the market. The order clears at the uniform price of the batch on the next settle boundary.

```json
{
  "type": "fba_submit",
  "params": {
    "market": 0,
    "side":   "Bid",
    "size":   100000000,
    "price":  10050000000
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Submit as this master or vault (approved agents only). The digest does not bind it. Admission resolves it, as for the order actions |
| `market` | uint32 | an FBA-enabled market | The [`signing_id`](../info/perpetuals.md#signing_id) of the market. Check `fba_enabled` on the same [`markets_meta`](../info/perpetuals.md#markets_meta) row |
| `side` | enum | `"Bid"` / `"Ask"` | The order side |
| `size` | uint64 | `> 0` | The order size, on the fixed-point size plane (widened to `u128`) |
| `price` | uint64 | `> 0` | The order price, on the 1e8 plane (widened to `i128`) |
| `stp_group` | uint64 \| null | — | Ignored. A value that you send here has no effect. Self-trade prevention that asks the restrained party to describe itself restrains nobody, so the chain never trusts a caller-declared group. The chain resolves your self-trade group from committed state at the moment the order parks, and stores that. The field stays on the wire because it is inside the signed digest, so keep signing exactly what you sign today. `fba_batch_state` does not echo it back. The batch auction does apply self-trade prevention: see [self-trade prevention in a batch](../../../concepts/fba.md#fba-stp). See [self-trade prevention](../../../concepts/order-types.md#stp-groups) |

The typed-data primary type is:

```
MetaFluxTransaction:FbaSubmit(string metafluxChain,uint32 market,uint8 side,uint64 size,uint64 price,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
```

To observe the pooled order and the indicative uniform clearing, use the operator-lane `fba_batch_state` read.

---

### Deliberate no-op {#noop}

`noop` is a deliberate no-op. The handler touches no state. The only effect of the action is that it burns the envelope `nonce`. Use it as a keepalive or for nonce-gap management. Replay protection enforces per-account nonce uniqueness at commit. So a `noop` that commits at nonce `N` invalidates any other in-flight action that was signed with nonce `N`. The action is sender-authorized and carries no params.

```json
{ "type": "noop" }
```

The typed-data primary type is below. The chain tag and the envelope nonce are the only signed fields:

```
MetaFluxTransaction:Noop(string metafluxChain,uint64 nonce)
```

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

---
