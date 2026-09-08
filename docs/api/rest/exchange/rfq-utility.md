---
description: "Request-for-quote, frequent-batch-auction, and the utility actions that do not belong to one product lane."
---

# RFQ, FBA & utility actions {#rfq-fba--utility-actions}

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

[RFQ](../../../concepts/rfq.md) block trading, the
[FBA](../../../concepts/fba.md) frequent-batch-auction entry, and the deliberate
no-op. All five return the
[`202 Accepted`](../exchange.md#202-accepted--non-order-admission) admission envelope, so a
commit-time refusal comes back as a `200` with an `error` body — read
[`accepted` is not `committed`](../exchange.md#accepted-is-not-committed).

**RFQ is the option trade path.** It clears
[option series](../../../products/options.md) and nothing else. The market a
request names is the `signing_id` of a live series, from
[`option_series`](../info/options.md#option_series).

:::note[The session is read by polling, not by a feed]
[`rfq_open`](../../../concepts/rfq.md#querying-open-rfqs) lists every open session and its quotes, and
[`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) lists the sessions one account requested or
quoted on. Both are public. **No WS channel carries an RFQ event**, so a taker
polls for its quotes and a maker polls for requests to answer.

A fill itemises nothing of its own: the **balance change** on
[`account_state`](../info/account.md#account_state) is the public trace of the premium
and the escrow.
:::

**Wire planes.** The RFQ / FBA numeric fields (`size`, `price`, `max_size`,
`limit_px`) are unsigned fixed-point `u64` JSON **numbers** on the wire — the
same 1e8 price plane / raw-lot size plane as [`submit_order`](./orders.md#submit_order),
widened to `u128` / `i128` internally. They are **not** decimal strings: the
strings-on-the-wire policy covers the whole-USDC decimal plane, not the
fixed-point book plane. `side` here uses the core `"Bid"` / `"Ask"` tokens
(capitalized — unlike the perp order body's lowercase `"bid"` / `"ask"`).

**Acting as a vault / master (`owner`).** Each RFQ action takes an optional
`owner` (0x hex): an approved [agent](../../../concepts/agent-wallets.md) may act
**as** the master / vault it is approved for. Unlike the order actions, the RFQ
`owner` **is bound into the EIP-712 digest** (a distinct type string with
`address owner` right after `metafluxChain`): the signer cryptographically
commits **which** account requests / quotes / accepts, because an RFQ session is
gated to its requester. A signer that is not an approved agent of `owner` is
rejected `401`. Omitting `owner` keeps the plain sender-authorized digest.
`fba_submit`'s `owner` follows the **order** convention instead — resolved at
admission, **not** digest-bound.

### Open an RFQ session {#rfq_request}

:::danger[`market` is an option series, and nothing else]
`market` takes the `signing_id` of a **live option series**, from
[`option_series`](../info/options.md#option_series). Every other market is refused, on
all three actions:

```
precondition failed: rfq is options-only: market <n> is not an option series
```

A series that has already expired is refused too, with
`precondition failed: option series expired`.

**Do not compute the number.** `signing_id` is served whole because the encoding
behind it is internal. There is no public formula and no base to add.

**Why the lane is options-only.** A request-for-quote lane beside a public order
book is not fair to that book: it lets size trade away from the price everyone
else is posting against. MetaFlux offers RFQ only where there is no continuous
book to undercut, and options have none. See
[options](../../../products/options.md) and [MIP-4](../../../mip/mip-4.md).
:::


Taker opens a request-for-quote session: `size` on `market`, optionally bounded
by `limit_px`, open for maker quotes until `expiry_ms`.

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
| `owner` | hex address \| omitted | 40 hex chars | Optional: open the RFQ **as** this master / vault (approved agents only). **Digest-bound** — see above |
| `market` | uint32 | a live option series | The [`option_series`](../info/options.md#option_series) `signing_id`. Any other market is refused |
| `side` | enum | `"Bid"` / `"Ask"` | Side the requester wants to take. `"Bid"` BUYS the option and pays the premium; `"Ask"` WRITES it and locks the escrow |
| `size` | uint64 | `> 0` | Requested size, on the series' `10^sz_decimals` plane (widened to `u128`) |
| `limit_px` | uint64 \| null | — | Optional taker limit price, 1e8 plane; `null` / omitted = none |
| `expiry_ms` | uint64 | — | Session expiry timestamp (consensus ms) |
| `stp_group` | uint64 \| null | — | Optional self-trade-prevention group |

Typed-data primary type (`owner` absent / present):

```
MetaFluxTransaction:RfqRequest(string metafluxChain,uint32 market,uint8 side,uint64 size,bool hasLimitPx,uint64 limitPx,uint64 expiryMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
MetaFluxTransaction:RfqRequest(string metafluxChain,address owner,uint32 market,uint8 side,uint64 size,bool hasLimitPx,uint64 limitPx,uint64 expiryMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
```

In the digest, `side` encodes as a `uint8` (`0` = bid, `1` = ask) and each
optional flattens to a presence `bool` + value (`0` when absent).

The assigned `rfq_id` is a committed effect — read it back from
[`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs). No WS channel carries it, so poll. The session
is **requester-gated**: only the account that
opened it can [`rfq_accept`](#rfq_accept) on it.

**A bounded request is collateral-checked at once.** With `limit_px` present the
chain proves the taker can carry the worst case now — the premium on a `"Bid"`,
or the escrow the premium does not fund on an `"Ask"`. It refuses with
`precondition failed: insufficient free collateral for the request`. Without
`limit_px` the worst case is unbounded, so the binding check waits for the
[accept](#rfq_accept), which gates both sides at the real price.

**On a coin-settled series that check reads a COIN balance.** A call escrows one
unit of the underlying per whole unit, out of the writer's spot balance, so an
`"Ask"` with a `limit_px` on such a series is refused with `precondition failed:
insufficient underlying balance for the escrow` when the sender does not hold the
coin. Read [`settle_asset`](../info/options.md#option_series) on the series row to know
which asset the request will be measured in.

`expiry_ms` is an absolute consensus-ms stamp, not a duration. `0` takes the
governed default window. There is no expiry sweep: an expired request is refused
by every later action, but it stays in the book until the open-request cap
evicts it.

---

### Quote onto an open RFQ {#rfq_quote}

Maker posts a quote onto an open RFQ session: a `price` and the maximum size the
maker will fill, valid until `valid_until_ms`.

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
| `owner` | hex address \| omitted | 40 hex chars | Optional: quote **as** this master / vault (approved agents only). **Digest-bound** — see above |
| `rfq_id` | uint64 | an open session | The RFQ session id, from [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) |
| `price` | uint64 | `> 0` | Quoted **premium per whole unit**, 1e8 plane (widened to `i128`) |
| `max_size` | uint64 | `> 0` | Maximum size the maker will fill, on the series' `10^sz_decimals` plane (widened to `u128`) |
| `valid_until_ms` | uint64 | — | Quote validity deadline (consensus ms) |
| `stp_group` | uint64 \| null | — | Optional self-trade-prevention group |

Typed-data primary type (`owner` absent / present):

```
MetaFluxTransaction:RfqQuote(string metafluxChain,uint64 rfqId,uint64 price,uint64 maxSize,uint64 validUntilMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
MetaFluxTransaction:RfqQuote(string metafluxChain,address owner,uint64 rfqId,uint64 price,uint64 maxSize,uint64 validUntilMs,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
```

The optional `stp_group` flattens to a presence `bool` + value in the digest.
The quote is recorded under the acting account as its maker — the digest-bound
`owner` when quoting as a vault, else the signer — and the taker sees it on the
session (`quotes[*]` in the [`rfq_open`](../../../concepts/rfq.md#querying-open-rfqs) / [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) reads).

---

### Accept an RFQ quote {#rfq_accept}

Taker accepts one specific quote (`quote_idx`) on their session for a fill of
`size`, settling off-book at the quoted price. The remaining quotes expire with
the session.

```json
{
  "type": "rfq_accept",
  "params": { "rfq_id": 9, "quote_idx": 0, "size": 100000000 }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional: accept **as** this master / vault (approved agents only). **Digest-bound**. Both legs must carry `owner` for an operator to open **and** accept as the vault |
| `rfq_id` | uint64 | own open session | The RFQ session id |
| `quote_idx` | uint32 | a quote on the session | Index of the accepted quote, from the [`rfq_open`](../../../concepts/rfq.md#querying-open-rfqs) / [`rfq_user`](../../../concepts/rfq.md#querying-open-rfqs) reads |
| `size` | uint64 | `> 0` | Fill size, on the series' `10^sz_decimals` plane (widened to `u128`) |

Typed-data primary type (`owner` absent / present):

```
MetaFluxTransaction:RfqAccept(string metafluxChain,uint64 rfqId,uint32 quoteIdx,uint64 size,uint64 nonce)
MetaFluxTransaction:RfqAccept(string metafluxChain,address owner,uint64 rfqId,uint32 quoteIdx,uint64 size,uint64 nonce)
```

**Requester-gated.** The accept is only honored for the account that opened the
session — this binding is why the RFQ `owner` is part of the signed digest.

#### What the fill moves {#rfq_accept-effects}

The accept settles one option fill. It moves three amounts and nothing else.

1. The **premium** goes from the buyer to the writer. Premium in USDC = quoted
   `price` × whole units, truncated toward zero to micro-USDC. **The premium is
   USDC on both kinds.**
2. The **escrow** goes from the writer's balance into the series pot. Escrow =
   [`escrow_per_unit`](../info/options.md#option_series) × whole units, **denominated in
   the row's [`settle_asset`](../info/options.md#option_series)**. It is the strike in USDC
   for a put, and **ONE COIN of the underlying** for a call.
3. A closing writer's escrow comes **out** of the pot, exactly, in the same asset.
   The chain nets each account's own legs first, so a round trip returns what it
   locked.

The fill charges the TAKER a fee, in USDC — the account that sent the request,
whichever leg it took. The quoting maker pays none. The fee is the smaller of a
rate on the option's strike face and a fraction of the premium, and both rates
start unset, which charges nothing. See
[the option fee](../../../products/options.md#option-fee).

The affordability check covers the premium AND the fee, so a taker that can fund
the premium alone is refused before anything moves. The request is checked the
same way, so an `rfq_request` you could not afford to accept is refused up front.

**On a coin-settled series the writer is checked TWICE, once per asset.** A USDC
escrow nets the premium it receives, so one number covers it. A coin escrow cannot
net a USDC premium, so the chain tests the coin balance for the escrow and the
USDC balance for the fee, separately. That is why a call writer holding every coin
it needs can still be refused for the fee.

**The response does not carry the fee, so compute it.** Read
`option_taker_bps` and `option_premium_cap_ppm` from the `option` row of
`products` on [`/info fee_schedule`](../info/fees-credit.md#fee_schedule), then:

```text
strike_face = strike x size          # BOTH kinds, in USDC
premium     = price x size           # USDC
fee         = min( strike_face x option_taker_bps / 10000 ,
                   premium x option_premium_cap_ppm / 1000000 )
```

**The notional is the strike face on a call too, not the coin escrow.** The chain
would need a price to value one coin in dollars, and it never prices an option, so
the strike is the notional it can read.

Both terms truncate toward zero and the smaller wins. Your balance moves by the
premium plus this fee if you are the taker on a buy, or by the escrow plus this
fee less the premium if you are the taker on a sell — and on a call the escrow
leg moves your COIN balance, not your USDC.

The fill opens no perpetual position and reserves no margin. An option position
can never be liquidated. See [options](../../../products/options.md).

#### Refusals {#rfq_accept-refusals}

Every check runs before anything moves, so a refused accept changes no state.

The column below is `error.message`. Its `code` is `PRECONDITION_FAILED`,
`AUTH_UNAUTHORIZED` for `unauthorized`, or `INVALID_REQUEST` for an
`invalid parameters` sentence. **Match on the code, not on this text** — the
text is prose and it can change. It is listed so you can read a log.

| `error.message` | Cause |
|---|---|
| `precondition failed: rfq is options-only: market <n> is not an option series` | The session's market is not a live series |
| `precondition failed: option series expired` | The series is at or past its `expiry` |
| `precondition failed: request expired` / `quote expired` | The session or the quote is past its own deadline |
| `precondition failed: quote idx <n> not found on rfq RfqId(<n>)` | No quote at that index |
| `precondition failed: quote price violates taker limit` | The quote is worse than the request's `limit_px` |
| `precondition failed: self-trade blocked` | Buyer and writer are the same account, or share an STP group |
| `precondition failed: premium truncates to zero` | `price` × units is below one micro-USDC. Raise the size or the price |
| `precondition failed: insufficient free collateral for premium` | The buyer cannot pay the premium |
| `precondition failed: insufficient free collateral for escrow` | USDC series only. The writer cannot fund the escrow the premium does not cover |
| `precondition failed: insufficient underlying balance for the escrow` | Coin series only. The writer does not hold the coin the escrow takes — one unit of the underlying per whole unit |
| `precondition failed: insufficient free collateral for the fee` | Coin series only. The writer holds the coin but cannot pay the USDC fee. The two assets are gated separately |
| `precondition failed: option series holds the maximum number of positions` | The series holds 2,048 position rows. Closing an existing row is still allowed |
| `precondition failed: option position registry is full` | The chain holds 32,768 option position rows |
| `precondition failed: series escrow would exceed the ceiling` | The series pot is at its ceiling |
| `unauthorized` | The accepter is not the account that opened the session |
| `invalid parameters: accepted size exceeds quote max_size` / `... exceeds request size` | The fill size is above one of the two bounds |

---

### Submit into a frequent-batch auction {#fba_submit}

Submit an order into the market's live [FBA](../../../concepts/fba.md) window; it
clears at the batch's uniform price on the next settle boundary.

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
| `owner` | hex address \| omitted | 40 hex chars | Optional: submit **as** this master / vault (approved agents only). **Not** digest-bound — resolved at admission, mirroring the order actions |
| `market` | uint32 | an FBA-enabled market | The market's [`signing_id`](../info/perpetuals.md#signing_id); check `fba_enabled` on the same [`markets_meta`](../info/perpetuals.md#markets_meta) row |
| `side` | enum | `"Bid"` / `"Ask"` | Order side |
| `size` | uint64 | `> 0` | Order size, fixed-point size plane (widened to `u128`) |
| `price` | uint64 | `> 0` | Order price, 1e8 plane (widened to `i128`) |
| `stp_group` | uint64 \| null | — | Optional self-trade-prevention group |

Typed-data primary type:

```
MetaFluxTransaction:FbaSubmit(string metafluxChain,uint32 market,uint8 side,uint64 size,uint64 price,bool hasStpGroup,uint64 stpGroup,uint64 nonce)
```

Observe the pooled order and the indicative uniform clearing via
the operator-lane `fba_batch_state` read.

---

### Deliberate no-op {#noop}

A deliberate no-op: the handler touches **no state** — the action's only effect
is burning the envelope `nonce`. Use it as a keepalive or for nonce-gap
management (committing a `noop` at nonce `N` invalidates any other in-flight
action signed with nonce `N`, since replay protection enforces per-account nonce
uniqueness at commit). Sender-authorized; the action carries **no params**.

```json
{ "type": "noop" }
```

Typed-data primary type — the chain tag and the envelope nonce are the only
signed fields:

```
MetaFluxTransaction:Noop(string metafluxChain,uint64 nonce)
```

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

---
