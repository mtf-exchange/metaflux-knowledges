---
description: "The live option series registry, and an account's open option legs with their escrow."
---

# Option reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

### The live option series registry {#option_series}

Every live [option](../../../products/options.md) series, oldest series first.

:::info Live
The **standard European** option lane is live. A live series carries `kind` of
`"put"` or `"call"` only, carries `settle_asset`, and carries no `cap` field.
The capped-call lane and its third `kind` token are removed. See
[what changed](../../../products/options.md#what-changed).
:::

**Request**

```json
{ "type": "option_series" }
```

No parameters.

**Response**

```json
{
  "data": {
    "type": "option_series",
    "series": [
      {
        "signing_id":      2147483649,
        "underlying":      "BTC",
        "kind":            "put",
        "strike":          "100000",
        "expiry":          1735689600000,
        "sz_decimals":     5,
        "settle_asset":    "USDC",
        "escrow_per_unit": "100000"
      },
      {
        "signing_id":      2147483650,
        "underlying":      "BTC",
        "kind":            "call",
        "strike":          "100000",
        "expiry":          1735689600000,
        "sz_decimals":     5,
        "settle_asset":    "BTC",
        "escrow_per_unit": "1"
      }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `signing_id` | uint32 | **The number to sign.** Put it in the `market` field of every RFQ action for this series |
| `underlying` | string | Symbol of the underlying market the settlement price comes from |
| `kind` | enum | `"put"` or `"call"`. Standard European, both of them |
| `strike` | Decimal string | Strike `K`, whole USDC. A USDC price for both kinds |
| `expiry` | uint64 | Expiry (consensus ms). The first settlement attempt runs at this stamp |
| `sz_decimals` | uint8 | Size precision. An RFQ `size` of `10^sz_decimals` is ONE whole unit |
| `settle_asset` | string | **The currency of `escrow_per_unit` and of every settlement amount.** `"USDC"` on a put; the underlying's spot-token symbol on a call |
| `escrow_per_unit` | Decimal string | What a **writer** locks per whole unit, **in `settle_asset`** — the strike on a put, `"1"` (one coin) on a call |

An empty registry returns `200` with `"series": []`.

**Rules**

- **`settle_asset` is the field to read before you format anything.** A put
  escrows and pays USDC. A **call escrows and pays the underlying coin** — one
  coin per unit, whatever the strike. So `escrow_per_unit` of `"1"` on a call is
  ONE BTC, not one dollar. A client that assumes dollars is wrong about every
  call by the whole asset class.
- **Why the call is denominated that way:** a cash call pays `max(S* − K, 0)`,
  which has no ceiling, so no finite cash escrow can cover it. Read in the coin
  the same payoff is `max(1 − K / S*, 0)`, which is below one at every price. One
  coin per contract therefore funds the worst case, which is what keeps the lane
  free of margin and of liquidation. See
  [why a call escrows one coin](../../../products/options.md#why-a-call-escrows-one-coin).
- **`settle_asset` does NOT govern the premium.** An RFQ `price` is a premium per
  whole unit in **USDC** on both kinds, and the taker fee is USDC on both kinds.
  Only the escrow and the settlement payout follow `settle_asset`. See
  [the premium is always USDC](../../../products/options.md#the-premium-is-always-usdc).
- Sign `signing_id`; do not compute it. There is no public formula, base, or
  arithmetic that derives it from the series terms — the encoding is internal
  and it can move. A client that derives its own number signs a market the
  chain may not resolve.
- The row carries no option price, implied volatility, or open interest. The
  chain never prices an option: the premium is what two accounts agree on in
  an [RFQ](../../../concepts/rfq.md). For your own holding in a series, read
  [`option_state`](#option_state).
- There is no `cap` field. The chain lists single legs only, so no series row can
  describe a spread.

### An account's open option legs {#option_state}

Every open [option](../../../products/options.md) leg one account holds. Each row
carries the series terms beside the position, so one call answers both
questions.

:::warning Renamed
**This read was called `option_positions`.** The old name is **not an alias** —
it answers `unknown info type`, the same as a name that never existed. Send the
new name.
:::

:::warning Not live yet
`settle_asset` and the coin-denominated `escrow` land with the same release as
the [`option_series`](#option_series) shape above. Until then a live node answers
the retired call token in `kind`, omits `settle_asset`, and renders every `escrow`
in USDC.
:::

For the account-wide totals — escrow, leg count and nearest expiry — read the
`option` lane of [`account_state`](./account.md#account_state) instead. This read is the
per-leg detail behind that summary, and it is the **only** read that gives a call
leg's escrow a currency.

**Request**

```json
{ "type": "option_state", "address": "0x0000000000000000000000000000000000000000" }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `address` | hex address | yes | Account to read |

**Response**

```json
{
  "data": {
    "type": "option_state",
    "address": "0x0000000000000000000000000000000000000000",
    "positions": [
      {
        "signing_id":   2147483649,
        "underlying":   "BTC",
        "kind":         "put",
        "strike":       "100000",
        "expiry":       1735689600000,
        "long":         "2.5",
        "short":        "0",
        "settle_asset": "USDC",
        "escrow":       "0"
      },
      {
        "signing_id":   2147483650,
        "underlying":   "BTC",
        "kind":         "call",
        "strike":       "100000",
        "expiry":       1735689600000,
        "long":         "0",
        "short":        "1.5",
        "settle_asset": "BTC",
        "escrow":       "1.5"
      }
    ],
    "height": 562,
    "time":   1700000000555
  }
}
```

| Field | Type | Plane | Meaning |
|-------|------|-------|---------|
| `signing_id` | uint32 | — | **The number to sign.** The same value [`option_series`](#option_series) serves for this series |
| `underlying` | string | — | Symbol of the underlying market the settlement price comes from |
| `kind` | enum | — | `"put"` or `"call"` |
| `strike` | Decimal string | money | Strike `K`, whole USDC |
| `expiry` | uint64 | — | Expiry (consensus ms) |
| `long` | Decimal string | **units** | Units held, on the series size scale. Already whole units |
| `short` | Decimal string | **units** | Units written, on the series size scale. Already whole units |
| `settle_asset` | string | — | The currency of `escrow` on THIS row. `"USDC"` on a put; the underlying's spot-token symbol on a call |
| `escrow` | Decimal string | **money, in `settle_asset`** | What this account has locked in the series pot. Whole USDC on a put; whole coins on a call |
| `height` | uint64 | — | Committed block height this snapshot reflects. A **bare integer**, not a Decimal string |
| `time` | uint64 | — | Consensus timestamp of that block, unix ms |

An account that is party to no series returns `200` with `"positions": []`. A
missing `address` returns `400` with `missing field: address`.

**Rules**

- `long` and `short` are unit counts, on the series size scale and already
  divided — the node applies `sz_decimals` for you, so `"2.5"` means two and a
  half whole units. `escrow` is money in `settle_asset`. All three are decimal
  strings, so a caller that reads `escrow` as a unit count, or a call's `escrow`
  as a dollar figure, reads a wrong number that still parses.
- **`escrow` is dollars on a put and COIN on a call.** The rate is the strike on
  a put and exactly one coin per unit on a call, so on a call row `escrow` and
  `short` carry the same digits and mean different things: `"1.5"` units written,
  `"1.5"` BTC locked. Read `settle_asset` before you render either.
- `escrow` on a call is coin the writer no longer holds on its spot balance. It
  is NOT counted by `option.escrow` on
  [`account_state`](./account.md#account_state), which sums put legs only.
- Exactly one of `long` / `short` is `"0"` on any row. A fill consumes an
  account's opposite leg before it opens a new one: a holder that writes gives
  up long units, and a writer that buys closes short units. So a row is either
  a holding or a written position, never both. `escrow` is what stays locked
  after that netting, and it is `"0"` on a pure holding.
- The row omits the series-wide terms: no `sz_decimals` and no
  `escrow_per_unit`. Read [`option_series`](#option_series) for those.
- An option fill writes no ledger row of its own. Between the fill and expiry,
  this is the only read where a writer sees the escrow it locked and a holder
  sees the units it owns.
