---
description: "The registry of active option series, and the open option legs of an account with their escrow."
---

# Option reads

These reads return the option series registry and the open option legs of an account.

They are read queries on [`POST /info`](../info.md). That page describes the
endpoint, the request envelope, the number planes and the error shape. These
apply to every query here.

### Option series registry {#option_series}

This read returns every active [option](../../../products/options.md) series,
oldest series first.

:::info Live
The standard European option lane is live. An active series has a `kind` of
`"put"` or `"call"` only, has `settle_asset`, and has no `cap` field. The
capped-call lane and its third `kind` token are removed. See
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
| `underlying` | string | Symbol of the underlying market that gives the settlement price |
| `kind` | enum | `"put"` or `"call"`. Both are standard European |
| `strike` | Decimal string | Strike `K`, in whole USDC. It is a USDC price for both kinds |
| `expiry` | uint64 | Expiry (consensus ms). The first settlement attempt runs at this time |
| `sz_decimals` | uint8 | Size precision. An RFQ `size` of `10^sz_decimals` is one whole unit |
| `settle_asset` | string | **The currency of `escrow_per_unit` and of every settlement amount.** `"USDC"` on a put. The spot-token symbol of the underlying on a call |
| `escrow_per_unit` | Decimal string | What a writer locks for each whole unit, **in `settle_asset`**. The strike on a put, and `"1"` (one coin) on a call |

An empty registry returns `200` with `"series": []`.

**Rules**

- **Read `settle_asset` before you format anything.** A put escrows and pays
  USDC. A call escrows and pays the underlying coin: one coin for each unit, at
  any strike. An `escrow_per_unit` of `"1"` on a call is one BTC, not one
  dollar. A client that assumes dollars is wrong about every call by the whole
  asset class.
- **Call denomination.** A cash call pays `max(S* − K, 0)`. That payoff has no
  ceiling, so no finite cash escrow can cover it. In the coin, the same payoff
  is `max(1 − K / S*, 0)`, which is below one at every price. One coin for each
  contract therefore funds the worst case. This keeps the lane free of margin
  and of liquidation. See
  [why a call escrows one coin](../../../products/options.md#why-a-call-escrows-one-coin).
- **`settle_asset` does not control the premium.** An RFQ `price` is a premium
  for each whole unit in USDC on both kinds, and the taker fee is in USDC on
  both kinds. Only the escrow and the settlement payout follow `settle_asset`.
  See [the premium is always USDC](../../../products/options.md#the-premium-is-always-usdc).
- Sign `signing_id`. Do not calculate it. No public formula, base or arithmetic
  derives it from the series terms. The encoding is internal and it can change.
  A client that derives its own number signs a market that the chain may not
  resolve.
- The row has no option price, implied volatility or open interest. The chain
  never prices an option. The premium is what two accounts agree on in an
  [RFQ](../../../concepts/rfq.md). For your own holding in a series, read
  [`option_state`](#option_state).
- There is no `cap` field. The chain lists single legs only, so no series row
  can describe a spread.

### Open option legs of an account {#option_state}

This read returns every open [option](../../../products/options.md) leg that
one account holds. Each row has the series terms next to the position, so one
call answers both questions.

:::warning Renamed
**This read was called `option_positions`.** The old name is not an alias. It
answers `unknown info type`, the same as a name that never existed. Send the
new name.
:::

For the totals of the account (escrow, leg count and nearest expiry), read the
`option` lane of [`account_state`](./account.md#account_state) instead. This
read is the detail for each leg behind that summary. It is the only read that
gives a currency to the escrow of a call leg.

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
| `signing_id` | uint32 | — | **The number to sign.** It is the same value that [`option_series`](#option_series) serves for this series |
| `underlying` | string | — | Symbol of the underlying market that gives the settlement price |
| `kind` | enum | — | `"put"` or `"call"` |
| `strike` | Decimal string | money | Strike `K`, in whole USDC |
| `expiry` | uint64 | — | Expiry (consensus ms) |
| `long` | Decimal string | **units** | Units held, on the series size scale. Already in whole units |
| `short` | Decimal string | **units** | Units written, on the series size scale. Already in whole units |
| `settle_asset` | string | — | The currency of `escrow` on this row. `"USDC"` on a put. The spot-token symbol of the underlying on a call |
| `escrow` | Decimal string | **money, in `settle_asset`** | What this account has locked in the series pot. Whole USDC on a put, whole coins on a call |
| `height` | uint64 | — | The committed block height of this snapshot. A **bare integer**, not a Decimal string |
| `time` | uint64 | — | Consensus timestamp of that block, unix ms |

An account that is party to no series returns `200` with `"positions": []`. A
missing `address` returns `400` with `missing field: address`.

**Rules**

- `long` and `short` are unit counts, on the series size scale and already
  divided. The node applies `sz_decimals` for you, so `"2.5"` means two and a
  half whole units. `escrow` is money in `settle_asset`. All three are decimal
  strings. A caller that reads `escrow` as a unit count, or the `escrow` of a
  call as a dollar figure, reads a wrong number that still parses.
- **`escrow` is in dollars on a put and in coin on a call.** The rate is the
  strike on a put, and exactly one coin for each unit on a call. On a call row,
  `escrow` and `short` therefore have the same digits and different meanings:
  `"1.5"` units written, `"1.5"` BTC locked. Read `settle_asset` before you show
  either.
- `escrow` on a call is coin that the writer no longer holds on its spot
  balance. `option.escrow` on [`account_state`](./account.md#account_state)
  does not count it, because it sums put legs only.
- Exactly one of `long` and `short` is `"0"` on any row. A fill consumes the
  opposite leg of an account before it opens a new one. A holder that writes
  gives up long units, and a writer that buys closes short units. A row is
  therefore a holding or a written position, never both. `escrow` is what stays
  locked after that netting, and it is `"0"` on a pure holding.
- The row omits the terms that apply to the whole series: there is no
  `sz_decimals` and no `escrow_per_unit`. Read
  [`option_series`](#option_series) for those.
- An option fill writes no ledger row of its own. Between the fill and expiry,
  this is the only read where a writer sees the escrow that it locked and a
  holder sees the units that it owns.
