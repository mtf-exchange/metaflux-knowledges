---
description: "The volume-tiered fee card, the referral program reads, and the accrued broker credit on one account."
---

# Fee & credit reads

These queries read fees, referrals and broker credit through [`POST /info`](../info.md). That page defines the endpoint, the request envelope, the number planes and the error shape. They apply to every query here.

### Volume-tiered maker and taker fees {#fee_schedule}

This read returns the maker and taker fee schedule and its volume tiers.

**Request**

```json
{ "type": "fee_schedule" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `address` | hex address | no | Adds the per-account `user` block described below |
| `days` | uint | no | Bounds `user.daily_volume` to its newest `days` buckets. Range `1` to `30`. Default `30` |

`days` does nothing without an `address`, because only the `user` block carries a
series. A `days` that is not an integer in `1`–`30` does not fail. It falls
back to the full 30-day window. This is by design: a typo cannot turn the
series into an empty array.

**Response**

```json
{
  "data": {
    "type": "fee_schedule",
    "tiers": [
      { "volume_30d": "0",         "maker_bps": "2.0", "taker_bps": "5.0" },
      { "volume_30d": "100000000", "maker_bps": "1.5", "taker_bps": "4.5" },
      { "volume_30d": "1000000000","maker_bps": "1.0", "taker_bps": "4.0" }
    ],
    "pooled_volume_sunset_day": 20340,
    "pooled_volume_sunset_ms":  "1757376000000",
    "pooled_volume_counts":     true,
    "burn_ratio":         "0.30",
    "referrer_share_bps": "1000",
    "referee_discount_permille":    50,
    "referral_code_min_volume_usd": "10000",
    "referee_discount_cap_usd":     "25000000",
    "referrer_reward_cap_usd":      "1000000000"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `tiers[*].volume_30d` | Decimal string | 30-day trailing volume threshold for this tier |
| `tiers[*].maker_bps` | Decimal string | Maker fee rate at this tier, in basis points |
| `tiers[*].taker_bps` | Decimal string | Taker fee rate at this tier, in basis points |
| `pooled_volume_sunset_day` | uint64 | The day the pooled volume counter stops buying a discount. `0` means not armed yet |
| `pooled_volume_sunset_ms` | Decimal string | The same instant in milliseconds. `"0"` means not armed yet |
| `pooled_volume_counts` | bool | `true` while pooled volume still feeds a tier |
| `burn_ratio` | Decimal string | Fraction of fees burned |
| `referrer_share_bps` | Decimal string | The referrer's share of the taker fee a referee paid, in basis points of that fee. `"1000"` is 10%. It is a share of the fee, not a fee rate, so it has no fractional digit |
| `referee_discount_permille` | uint32 | The referee discount off the taker rate, per mille. `0` means no discount |
| `referral_code_min_volume_usd` | Decimal string | The trailing 30-day volume, whole USDC, that a referral code needs. `"0"` means codes are off |
| `referee_discount_cap_usd` | Decimal string | Referee taker volume since the bind, whole USDC, at which the discount stops. `"0"` means no cap |
| `referrer_reward_cap_usd` | Decimal string | Referee taker volume since the bind, whole USDC, at which the referrer share stops. `"0"` means no cap |

**Rules**

- Fee rates are decimal basis points as strings with one fractional digit (for example `"2.0"` is 2 bps or 0.02%, and `"0.5"` is 0.5 bps or 0.005%). This gives sub-basis-point precision.
- `burn_ratio` is a decimal fraction (`"0.30"` means the chain burns 30% of fees).
- Governance sets the five referral fields, and the read serves the values in force.
  The example shows the values that governance set on 2026-10-05. Before those votes
  the node served the defaults: `"1000"`, `0`, `"0"`, `"0"` and `"0"`. A later
  vote can change any of them without a release, so read the field and not this
  page. See
  [the referral program](../../../concepts/fees.md#referral-parameters).
- This read has no builder-rebate field, and there is no protocol rebate to a broker.
  A broker is paid the `builder.fee` it sets on each order. The ceiling that the trader granted caps that rate.
  Read the ceiling from
  [`approved_brokers`](./node.md#approved_brokers) `max_fee_bps`. The chain charges the broker fee on top of
  the schedule above, so no field here changes when a broker is paid. See
  [broker codes](../../../concepts/broker-codes.md#claiming).

Send an `address` to get the resolved rates of that account. The response then also
carries a `user` block:

```json
{
  "data": {
    "type": "fee_schedule",
    "tiers": [],
    "user": {
      "address":                   "0x<addr>",
      "taker_volume_30d":          "12500000",
      "maker_volume_30d":          "3100000",
      "taker_bps":                 "4.5",
      "maker_bps":                 "1.5",
      "effective_taker_bps":       "4.05",
      "effective_maker_bps":       "1.2",
      "staking_discount_permille": 100,
      "referee_discount_permille": 0,
      "maker_rebate_bps":          "0.3",
      "vip_tier":                  0,
      "mm_tier":                   0,
      "referrer":                  null,
      "referrer_credit":           "0",
      "products": [
        { "product": "perp",        "taker_bps": "4.05", "maker_bps": "1.2",
          "taker_volume_30d": "12500000", "maker_volume_30d": "3100000" },
        { "product": "spot",        "taker_bps": "9.0",  "maker_bps": "2.0",
          "taker_volume_30d": "12500000", "maker_volume_30d": "3100000" },
        { "product": "spot_margin", "taker_bps": "9.0",  "taker_volume_30d": "12500000" },
        { "product": "option",      "option_taker_bps": "0.5", "option_premium_cap_ppm": 150000 }
      ],
      "daily_volume": [
        { "day": 0, "taker_volume": "1416854.124376258", "maker_volume": "0",
          "exchange_maker_volume": "140430596.722835936" }
      ]
    }
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user.taker_volume_30d` | Decimal string | Pooled trailing 30-day taker volume, every product together |
| `user.maker_volume_30d` | Decimal string | Pooled trailing 30-day maker volume |
| `user.taker_bps` / `maker_bps` | Decimal string | The perp base rate, before the discount and the rebate |
| `user.effective_taker_bps` | Decimal string | The perp rate a fill charges, discount applied. The discount is the larger of `staking_discount_permille` and `referee_discount_permille`, never their sum |
| `user.effective_maker_bps` | Decimal string | The perp rate a fill charges, rebate subtracted. A negative value is a credit |
| `user.staking_discount_permille` | uint32 | Taker-only staking discount, per mille (`100` is 10%) |
| `user.referee_discount_permille` | uint32 | The referee discount this account gets now, per mille. `0` when the account has no referrer, when the program is off, or when its volume reached the discount cap |
| `user.maker_rebate_bps` | Decimal string | The perp maker rebate, before it is subtracted |
| `user.vip_tier` | uint | The account's VIP-tier override index. `0` when the account holds no override, which is the common case |
| `user.mm_tier` | uint | The account's market-maker-tier override index. `0` when the account holds no override |
| `user.referrer` | hex address \| null | The referrer this account is bound to. `null`, not absent, when the account has no referrer |
| `user.referrer_credit` | Decimal string | Credit this account has accrued AS a referrer, whole USDC. It is the credit owed TO this address, not the discount it receives |
| `user.daily_volume` | array | Per-day volume buckets, oldest day first. See the rules below |
| `user.daily_volume[*].day` | uint64 | Consensus day index, that is `consensus_time_ms / 86400000`. It is not a calendar date and not an offset from today. `0` is a real day index, not an unset marker. A bucket rolled at consensus time zero reports `0`, and the current chain serves such a row |
| `user.daily_volume[*].taker_volume` | Decimal string | This account's taker volume on that day |
| `user.daily_volume[*].maker_volume` | Decimal string | This account's maker volume on that day |
| `user.daily_volume[*].exchange_maker_volume` | Decimal string | Exchange-wide maker volume on that day. There is no exchange-wide taker total. Do not read this as total traded volume |
| `user.products[*].product` | string | `perp`, `spot`, `spot_margin` or `option` |
| `user.products[*].taker_bps` | Decimal string | The rate a fill on this product charges, discount applied |
| `user.products[*].maker_bps` | Decimal string | The rate a fill on this product charges, rebate subtracted. Absent on a product with no maker leg |
| `user.products[*].taker_volume_30d` | Decimal string | The volume the tier of this product reads |
| `user.products[*].maker_volume_30d` | Decimal string | The volume the maker tier of this product reads. Absent on a product with no maker leg |
| `user.products[*].option_taker_bps` | Decimal string | Option row only. The rate charged on the strike face of the option (`strike` x `size`), for puts and calls alike |
| `user.products[*].option_premium_cap_ppm` | uint32 | Option row only. The fee ceiling as a fraction of the premium, in ppm |

The four products price apart. Read `products`, not the top-level pair. The
top-level `effective_*_bps` fields are the perp rate, as they have
always been. A spot or an option fill can charge a different rate. See
[Each product has its own fee table](../../../concepts/fees.md#per-product-fees).

The `option` row has a different shape, because an option does not price on a
volume ladder. It carries no `taker_bps` and no volume. It carries
`option_taker_bps` and `option_premium_cap_ppm` instead. The fee charged is the
smaller of a rate on the strike face of the option and that fraction of the premium.
Both start unset, which charges nothing. The strike face is `strike` x `size` on
both kinds. A
[call escrows one coin](../../../products/options.md#why-a-call-escrows-one-coin),
and the chain cannot read the dollar worth of that coin without a price, so the strike is the
notional that it uses. The fee is charged in USDC on both kinds. See
[the option fee](../../../products/options.md#option-fee).

A row with no `maker_bps` has no maker leg. A maker rests on the shared spot
book and never carries a lane, so the chain always prices a maker as `spot`. That leaves
`spot_margin` and `option` with a taker leg only. Those two rows omit both
maker keys, because no rate exists that the chain could charge.

Every `products[*]` row can carry the same volume today, but not later.
Until the pooled window sunsets, the tier of a product reads the larger of your pooled
volume and the volume you traded on that product, so the rows agree. After the
sunset each row reads only its own product. `pooled_volume_sunset_ms` in the same
response is the date. The rule is in
[the pooled window](../../../concepts/fees.md#pooled-volume-sunset).

`daily_volume` is sparse. A quiet day has no row, and it is not a zero row.
All three series roll only when a fill charges a positive protocol fee. A
zero-fee market and a fully rebated maker leg never reach them. So a day on
which the account traded can still be missing, and a gap does not mean that the
account was idle. Index the array by `day`. Never assume that row `n` is `n` days
ago, and never assume that the array length is the number of days elapsed.

The rows are a union of three sources: the taker buckets of the account, its
maker buckets and the exchange-wide maker buckets. A day that carries only
exchange volume still appears, with the two figures of the account at `"0"`.
Those zeros are real zeros. A missing day is not a zero.

`days` bounds each source separately, not the union. Each of the three
sources contributes its own newest `days` buckets. The three ranges can be
disjoint, so the returned array can hold more than `days` rows. Treat `days` as
a bound on work, not as an exact row count.

See [fees](../../../concepts/fees.md).

### Referral state of one account {#referral_state}

This read returns the referral state of one account: its claimable credit, its referrer, its own
referral code, its counters as a referee and as a referrer, and whether it can
register a code.

**Request**

```json
{ "type": "referral_state", "address": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `address` | hex address | yes | The account to read. `user` is the older name and still answers |

**Response** for a referee, with the program values of 2026-10-05 in force:

```json
{
  "data": {
    "type": "referral_state",
    "user":              "0x00000000000000000000000000000000000ca11e",
    "address":           "0x00000000000000000000000000000000000ca11e",
    "claimable_rewards": "0",
    "referrer":          "0x00000000000000000000000000000000000000bb",
    "referrer_code":     "alice1",
    "code":              null,
    "referee": {
      "bound_ms":                  1759104000000,
      "volume_since_bind":         "12500",
      "fees_paid":                 "4.125",
      "rewarded":                  "0.4125",
      "discount_permille":         50,
      "discount_volume_remaining": "24987500",
      "share_volume_remaining":    "999987500"
    },
    "referrer_stats": {
      "referee_count": 0,
      "referred_fees": "0",
      "rewarded":      "0",
      "claimed":       "0"
    },
    "code_requirement": {
      "enabled":        true,
      "min_volume_30d": "10000",
      "volume_30d":     "12500",
      "eligible":       false
    }
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user` / `address` | hex address | The account read, under both names |
| `claimable_rewards` | Decimal string | USDC credit this account can claim right now, as a referrer |
| `referrer` | hex address \| null | The referrer this account is bound to. `null` means never bound |
| `referrer_code` | string \| null | The referral code of that referrer. `null` when the account has no referrer, or when the referrer holds no code |
| `code` | string \| null | This account's own referral code. `null` means none |
| `referee` | object \| null | This account's counters as a referee. `null` when it has no referrer |
| `referee.bound_ms` | uint64 | Consensus time of the bind, in ms. `0` for a bind made before block 25,599,540 |
| `referee.volume_since_bind` | Decimal string | Taker volume since the bind, whole USDC. Both caps read this number |
| `referee.fees_paid` | Decimal string | USDC taker fees paid since the bind |
| `referee.rewarded` | Decimal string | USDC share those fees paid to the referrer |
| `referee.discount_permille` | uint32 | The referee discount in force now. `0` when the program is off or the discount cap is reached |
| `referee.discount_volume_remaining` | Decimal string \| null | Volume left before the discount stops. `null` when the discount has no cap |
| `referee.share_volume_remaining` | Decimal string \| null | Volume left before the referrer share stops. `null` when the share has no cap |
| `referrer_stats.referee_count` | uint | Accounts bound to this account |
| `referrer_stats.referred_fees` | Decimal string | USDC taker fees those referees paid while bound |
| `referrer_stats.rewarded` | Decimal string | USDC share this account earned from them |
| `referrer_stats.claimed` | Decimal string | Referral credit this account claimed, in USDC. The broker part of a claim is not in it |
| `code_requirement.enabled` | bool | `true` while referral codes are on |
| `code_requirement.min_volume_30d` | Decimal string | The 30-day volume a code needs, whole USDC |
| `code_requirement.volume_30d` | Decimal string | This account's pooled 30-day taker plus maker volume |
| `code_requirement.eligible` | bool | `true` when a `register_referral_code` from this account would pass the volume, code and referee rules now |

**Rules**

- Read the credit here before you claim it. The claim reply reports no
  amount. [`claim_referral_rewards`](../exchange/account.md#claim_referral_rewards)
  drains the whole balance and answers with no figure, so this read and
  [`broker_state`](#broker_state) are the only way to show a claimable balance
  or to decide whether a claim is worth sending.
- One claim drains this credit and the broker credit. Show the sum of this
  `claimable_rewards` and the `broker_state` one behind one claim button. Each
  claim action drains both credits.
- `claimable_rewards` of `"0"` is normal, not an error state. Claiming with
  nothing accrued claims `0` and succeeds. Do not block the button on it.
- `referrer: null` means the account never bound one. It does not mean the
  node is old and it does not mean the referrer is unknown. A referrer is bound
  once and is immutable after that, so `null` is a durable answer until the
  account binds.
- A `null` in `*_volume_remaining` means no cap, not zero. A cap of `0` is
  the "no cap" setting, so the node serves `null` instead of a number a caller
  could read as "used up". `"0"` means the cap is reached.
- `discount_permille` is the discount the next fill can get, not the
  schedule value. It reads `0` when the program is off or the cap is reached.
  The rate a fill charges uses the larger of this value and the staking
  discount. [`fee_schedule`](#fee_schedule) `user.effective_taker_bps` shows the
  result.
- A bind made before block 25,599,540 reads `bound_ms: 0` and zero
  counters. The chain did not record the time or the volume before that
  block. The caps count that referee's volume from that block on.
- The counters are USDC only. A referrer share on a spot buy arrives in the
  base token, paid at the fill. It adds to no counter and to no
  `claimable_rewards`. The base-token volume still counts in
  `volume_since_bind`. See
  [in-kind fees](../../../concepts/fees.md#spot-buy-fee-in-base).
- To list the accounts you referred, use
  [`referral_referees`](#referral_referees). This read carries the count only.

### Owner of a referral code {#referral_code}

This read resolves a referral code to the account that holds it. Use it to show a referee
who a code binds to, before the referee signs
[`set_referrer_by_code`](../exchange/account.md#set_referrer_by_code).

**Request**

```json
{ "type": "referral_code", "code": "alice1" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `code` | string | yes | The referral code to resolve |

**Response**

```json
{
  "data": {
    "type":  "referral_code",
    "code":  "alice1",
    "owner": "0x00000000000000000000000000000000000000bb"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `code` | string | The code asked for, echoed back |
| `owner` | hex address \| null | The account that holds the code. `null` means no account holds it |

**Rules**

- An unknown code is a `200` with `owner: null`, not an error. A malformed
  code, such as one with an uppercase letter, answers the same way: no account
  can hold it. A request with no `code` field answers `400` `INVALID_REQUEST`.
- The node does not fold the case. `Alice1` is not `alice1`. Send the code
  in lowercase.
- An owner never changes. A code is immutable, so you can cache a non-null
  answer.

### Accounts one referrer referred {#referral_referees}

This read returns the accounts bound to one referrer, with the counters of each since the bind.

**Request**

```json
{ "type": "referral_referees", "address": "0x<addr>", "limit": 100 }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `address` | hex address | yes | The referrer. `user` also answers |
| `limit` | uint | no | Rows returned. Default `100`, clamped to at most `500` |

**Response**

```json
{
  "data": {
    "type":    "referral_referees",
    "address": "0x00000000000000000000000000000000000000bb",
    "referees": [
      { "user": "0x00000000000000000000000000000000000ca11e", "bound_ms": 1759104000000,
        "volume_since_bind": "12500", "fees_paid": "4.125", "rewarded": "0.4125" },
      { "user": "0x0000000000000000000000000000000000000c01", "bound_ms": 0,
        "volume_since_bind": "0", "fees_paid": "0", "rewarded": "0" }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `referees[*].user` | hex address | A referee of this referrer |
| `referees[*].bound_ms` | uint64 | Consensus time of the bind, in ms. `0` for a bind made before block 25,599,540 |
| `referees[*].volume_since_bind` | Decimal string | The referee's taker volume since the bind, whole USDC |
| `referees[*].fees_paid` | Decimal string | USDC taker fees the referee paid since the bind |
| `referees[*].rewarded` | Decimal string | USDC share those fees paid to this referrer |

**Rules**

- Rows sort by `rewarded`, largest first, then by `user` ascending. The
  order is total, so two calls on the same block answer the same rows.
- There is no cursor. A referrer with more referees than `limit` sees the
  `limit` referees that paid it the most. `referral_state`
  `referrer_stats.referee_count` gives the full count.
- An address with no referees answers `referees: []`, not an error.

### Referral leaderboard {#referral_leaderboard}

This read ranks referrers by the share they earned, over all time.

**Request**

```json
{ "type": "referral_leaderboard", "limit": 50 }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `limit` | uint | no | Rows returned. Default `50`, clamped to at most `200` |

**Response**

```json
{
  "data": {
    "type": "referral_leaderboard",
    "rows": [
      { "address": "0x00000000000000000000000000000000000000bb", "code": "alice1",
        "referee_count": 12, "referred_fees": "8210.5", "rewarded": "821.05", "claimed": "800" }
    ]
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `rows[*].address` | hex address | The referrer |
| `rows[*].code` | string \| null | Its referral code. `null` for a referrer bound by address only |
| `rows[*].referee_count` | uint | Accounts bound to it |
| `rows[*].referred_fees` | Decimal string | USDC taker fees its referees paid while bound |
| `rows[*].rewarded` | Decimal string | USDC share it earned |
| `rows[*].claimed` | Decimal string | USDC it claimed |

**Rules**

- Rows sort by `rewarded`, largest first, then `referee_count`, largest
  first, then `address` ascending. The order is total.
- Every referrer appears, with or without a code. A referrer that earned
  nothing yet appears with zeros, below every referrer that earned a share.
- The totals are all-time and USDC only. A share paid in kind on a spot buy
  is not in `rewarded`. The counters start at block 25,599,540, so a share
  earned before that block is not in `rewarded` either.

### Accrued broker credit for one account {#broker_state}

This read returns the claimable broker-code fee credit of one broker.

**Request**

```json
{ "type": "broker_state", "address": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `user` | hex address | yes | The broker account to read |

**Response**

```json
{
  "data": {
    "type": "broker_state",
    "user":              "0x00000000000000000000000000000000000000aa",
    "claimable_rewards": "308.9"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user` | hex address | The account read, echoed back |
| `claimable_rewards` | Decimal string | USDC credit this broker can claim right now |

**Rules**

- Read the credit here before you claim it. The claim reply reports no
  amount. [`claim_broker_rewards`](../../../concepts/broker-codes.md#claiming)
  drains the whole balance and answers with no figure.
- `builder_state` is the old name and still answers. Send `broker_state`.
  The reply echoes back whichever name you sent.
- A broker credit and a referral credit are separate balances with one
  claim. One fill can pay both. Reading one tells you nothing about the
  other, so read [`referral_state`](#referral_state) too. Either claim action
  drains both balances. See
  [broker credit is not referrer credit](../../../concepts/fees.md#referrer-credit).
- This is a credit balance, not a fee rate. The rate a broker charges is the
  `builder.fee` on each order, capped by its
  [`approved_brokers`](./node.md#approved_brokers) grant.
