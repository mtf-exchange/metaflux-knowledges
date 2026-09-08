---
description: "The volume-tiered fee card, and the accrued referral and broker credit on one account."
---

# Fee & credit reads

Read queries on [`POST /info`](../info.md). The endpoint, the request
envelope, the number planes and the error shape are on that page and apply
to every query here.

### Volume-tiered maker and taker fees {#fee_schedule}

Returns the maker/taker fee schedule and its volume tiers.

**Request**

```json
{ "type": "fee_schedule" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `address` | hex address | no | Adds the per-account `user` block described below |
| `days` | uint | no | Bounds `user.daily_volume` to its newest `days` buckets. Range `1` to `30`. Default `30` |

`days` does nothing without an `address`, because only the `user` block carries a
series. **A `days` that is not an integer in `1`–`30` does not fail — it falls
back to the full 30-day window.** That is deliberate: a typo cannot turn the
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
    "referrer_share_bps": "1.0"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `tiers[*].volume_30d` | Decimal string | 30-day trailing volume threshold for this tier |
| `tiers[*].maker_bps` | Decimal string | Maker fee rate at this tier, in basis points |
| `tiers[*].taker_bps` | Decimal string | Taker fee rate at this tier, in basis points |
| `pooled_volume_sunset_day` | uint64 | The day the pooled volume counter stops buying a discount. `0` = not armed yet |
| `pooled_volume_sunset_ms` | Decimal string | The same instant in milliseconds. `"0"` = not armed yet |
| `pooled_volume_counts` | bool | `true` while pooled volume still feeds a tier |
| `burn_ratio` | Decimal string | Fraction of fees burned |
| `referrer_share_bps` | Decimal string | Referrer's share of fees, in basis points |

**Rules**

- Fee rates are decimal basis points as strings with one fractional digit (e.g. `"2.0"` = 2 bps = 0.02%, `"0.5"` = 0.5 bps = 0.005%), for sub-basis-point precision.
- `burn_ratio` is a decimal fraction (`"0.30"` = 30% of fees burned).
- **There is no builder-rebate field on this read, and there is no protocol rebate to a broker.**
  A broker is paid the `builder.fee` it sets on each order, and that rate is capped by the
  ceiling the trader granted it — read the ceiling from
  [`approved_builders`](./node.md#approved_builders) `max_fee_bps`. The broker fee is charged ON TOP of
  the schedule above, so no field here changes when a broker is paid. See
  [broker codes](../../../concepts/broker-codes.md#claiming).

**Send an `address` to get that account's resolved rates.** The response then also
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
| `user.taker_bps` / `maker_bps` | Decimal string | The PERP base rate, before the discount and the rebate |
| `user.effective_taker_bps` | Decimal string | The PERP rate a fill charges, discount applied |
| `user.effective_maker_bps` | Decimal string | The PERP rate a fill charges, rebate subtracted. Negative = a credit |
| `user.staking_discount_permille` | uint32 | Taker-only staking discount, per mille (`100` = 10%) |
| `user.maker_rebate_bps` | Decimal string | The PERP maker rebate, before it is subtracted |
| `user.vip_tier` | uint | The account's VIP-tier override index. `0` when the account holds no override, which is the common case |
| `user.mm_tier` | uint | The account's market-maker-tier override index. `0` when the account holds no override |
| `user.referrer` | hex address \| null | The referrer this account is bound to. **`null`, not absent, when the account is bound to nobody** |
| `user.referrer_credit` | Decimal string | Credit this account has accrued AS a referrer, whole USDC. It is the credit owed TO this address, not the discount it receives |
| `user.daily_volume` | array | Per-day volume buckets, oldest day first. See the rules below |
| `user.daily_volume[*].day` | uint64 | **Consensus day index**, that is `consensus_time_ms / 86400000`. It is not a calendar date and not an offset from today. **`0` is a real day index, not an unset marker** — a bucket rolled at consensus time zero reports `0`, and the current chain serves such a row |
| `user.daily_volume[*].taker_volume` | Decimal string | This account's taker volume on that day |
| `user.daily_volume[*].maker_volume` | Decimal string | This account's maker volume on that day |
| `user.daily_volume[*].exchange_maker_volume` | Decimal string | Exchange-wide **maker** volume on that day. There is no exchange-wide taker total — do not read this as total traded volume |
| `user.products[*].product` | string | `perp`, `spot`, `spot_margin` or `option` |
| `user.products[*].taker_bps` | Decimal string | The rate a fill on THIS product charges, discount applied |
| `user.products[*].maker_bps` | Decimal string | The rate a fill on THIS product charges, rebate subtracted. ABSENT on a product with no maker leg |
| `user.products[*].taker_volume_30d` | Decimal string | The volume THIS product's tier reads |
| `user.products[*].maker_volume_30d` | Decimal string | The volume THIS product's maker tier reads. ABSENT on a product with no maker leg |
| `user.products[*].option_taker_bps` | Decimal string | OPTION ROW ONLY. The rate charged on the option's STRIKE FACE (`strike` x `size`), for puts and calls alike |
| `user.products[*].option_premium_cap_ppm` | uint32 | OPTION ROW ONLY. The fee ceiling as a fraction of the premium, in ppm |

**The four products price apart. Read `products`, not the top-level pair.** The
top-level `effective_*_bps` fields are the PERP rate, which is what they have
always meant. A spot or an option fill can charge a different rate. See
[Each product has its own fee table](../../../concepts/fees.md#per-product-fees).

**The `option` row has a DIFFERENT shape, because an option does not price on a
volume ladder.** It carries no `taker_bps` and no volume; instead it carries
`option_taker_bps` and `option_premium_cap_ppm`, and the fee charged is the
SMALLER of a rate on the option's strike face and that fraction of the premium.
Both start unset, which charges nothing. The strike face is `strike` x `size` on
BOTH kinds: a
[call escrows one coin](../../../products/options.md#why-a-call-escrows-one-coin),
whose dollar worth the chain cannot read without a price, so the strike is the
notional it uses. The fee is charged in USDC on both kinds. See
[the option fee](../../../products/options.md#option-fee).

**A row with no `maker_bps` has no maker leg.** A maker rests on the shared spot
book and never carries a lane, so a maker is always priced as `spot`. That leaves
`spot_margin` and `option` with a taker leg only, and those two rows omit both
maker keys rather than render a rate nothing can charge.

**Every `products[*]` row can carry the same volume today, and later cannot.**
Until the pooled window sunsets, a product's tier reads the LARGER of your pooled
volume and the volume you traded on that product, so the rows agree. After the
sunset each row reads only its own product. `pooled_volume_sunset_ms` in the same
response is the date; the rule is in
[the pooled window](../../../concepts/fees.md#pooled-volume-sunset).

**`daily_volume` is SPARSE. A quiet day has NO ROW — it is not a zero row.**
All three series roll only when a fill charges a **positive protocol fee**. A
zero-fee market and a fully rebated maker leg never reach them. So a day on
which the account traded can still be missing, and a gap does not mean the
account was idle. Index the array by `day`; never assume row `n` is `n` days
ago, and never assume the array length is the number of days elapsed.

**The rows are a UNION of three sources**: the account's taker buckets, its
maker buckets, and the exchange-wide maker buckets. A day that carries only
exchange volume still appears, with the account's own two figures at `"0"`.
Those zeros are real zeros; a missing day is not.

**`days` bounds each source separately, not the union.** Each of the three
sources contributes its own newest `days` buckets. The three ranges can be
disjoint, so the returned array can hold more than `days` rows. Treat `days` as
a bound on work, not as an exact row count.

See [fees](../../../concepts/fees.md).

### Accrued referral credit for one account {#referral_state}

One account's claimable referral credit, and the referrer it is bound to.

**The parameter is `user`, not `address`.** Most reads on this page take
`address`. These two fee-credit reads take `user`. Sending `address` answers
`400 INVALID_REQUEST`, with `details.field` set to `user`.

**Request**

```json
{ "type": "referral_state", "user": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `user` | hex address | yes | The account to read |

**Response**

```json
{
  "data": {
    "type": "referral_state",
    "user":              "0x00000000000000000000000000000000000ca11e",
    "claimable_rewards": "12.451",
    "referrer":          "0x00000000000000000000000000000000000000bb"
  }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `user` | hex address | The account read, echoed back |
| `claimable_rewards` | Decimal string | USDC credit this account can claim right now |
| `referrer` | hex address \| null | The referrer this account is bound to. `null` = never bound |

**Rules**

- **Read the credit here before you claim it. The claim action reports no
  amount.** [`claim_referral_rewards`](../exchange/account.md#claim_referral_rewards)
  drains the whole balance and answers with no figure, so this read is the only
  way to show a claimable balance or to decide whether a claim is worth sending.
- **`claimable_rewards` of `"0"` is normal, not an error state.** Claiming with
  nothing accrued claims `0` and succeeds. Do not block the button on it.
- **`referrer: null` means the account never bound one.** It does not mean the
  node is old and it does not mean the referrer is unknown. A referrer is bound
  once with [`set_referrer`](../exchange/account.md#set_referrer) and is immutable after
  that, so `null` is a durable answer until the account sends that action.
- **This read cannot list the accounts YOU referred.** The referral graph is
  address-based and one-directional: the chain stores each referee's referrer,
  and no reverse map. There is no read that enumerates a referrer's referees,
  and no referral code to enumerate them by. Track your own referees off-chain.
- **`claimable_rewards` can under-report what a referrer earned.** A referrer
  share on a spot BUY arrives in the base token, paid at the fill, and a base
  amount cannot join this USDC-denominated credit. Only the USDC shares
  accumulate here. See
  [in-kind fees](../../../concepts/fees.md#referrer-credit).

### Accrued broker credit for one account {#builder_state}

One broker's claimable broker-code fee credit.

**Request**

```json
{ "type": "builder_state", "user": "0x<addr>" }
```

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `user` | hex address | yes | The broker account to read |

**Response**

```json
{
  "data": {
    "type": "builder_state",
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

- **Read the credit here before you claim it. The claim action reports no
  amount.** [`claim_builder_rewards`](../../../concepts/broker-codes.md#claiming)
  drains the whole balance and answers with no figure.
- **The read keeps the `builder` spelling.** The wire type is `builder_state`.
  There is no `broker_state` read.
- **A broker credit and a referral credit are separate balances with separate
  claims.** One fill can pay both. Reading one tells you nothing about the
  other. See [broker credit is not referrer credit](../../../concepts/fees.md#referrer-credit).
- **This is a credit balance, not a fee rate.** The rate a broker charges is the
  `builder.fee` on each order, capped by its
  [`approved_builders`](./node.md#approved_builders) grant.
