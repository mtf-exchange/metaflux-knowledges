---
description: How a front end or bot charges its own fee on a MetaFlux order with a broker code, what limits that fee, and how the broker claims it.
---

# Broker codes

A broker code lets a front end or bot charge its own fee on the orders it routes.

A **broker** is anyone who routes orders for someone else: a front end, a
trading bot or a terminal. With a broker code, you charge your own fee on the
orders you route. The chain collects it. You need no agreement with MetaFlux.

The fee is *additive*. It comes on top of the exchange fee, not out of it, and
all of it goes to you.

## Summary {#tldr}

1. The trader approves you once, with a maximum rate.
2. You set a rate on each order, at or below that maximum.
3. The taker pays your fee on every fill.
4. You claim the accrued balance at any time.

You cannot charge a trader who has not approved you. You cannot charge more than
the trader approved. The node runs both checks before it accepts the order.

## The two ceilings {#ceilings}

Every broker fee must pass two independent limits. The lower one applies.

| Limit | Set by | Default | Bounds |
|-------|--------|---------|--------|
| Protocol cap | Governance | **8 bps** | 1–100 bps |
| Per-trader cap | The trader | none until approved | 0 – protocol cap |

The protocol cap is a global ceiling for the whole exchange. The per-trader cap
is the rate that the trader approved for you. The node rejects an order with a
rate above either cap before the order rests. The order does not fill and then
get a refund.

:::info
The node reads both ceilings live, on every order. If governance lowers the
protocol cap below a rate that a trader already approved, the lower cap applies
at once. The stored approval does not change.
:::

## Approval {#approval}

The trader signs one action:

```json
{
  "type": "approve_broker_fee",
  "params": { "builder": "0x<your address>", "max_bps": 7 }
}
```

`max_bps` is in whole basis points. `max_bps: 0` revokes the approval. The
chain removes the row, so the result is the same as no approval for that broker.
After a revoke, the chain rejects every order from that trader that names the
broker, also with a `fee` of `0`. To keep a broker that charges nothing, approve
it at `1` or more and send its orders with `fee: 0`.

To read the approvals of a trader, use the `approved_brokers` query.

:::warning
The action type is `approve_broker_fee`. Some older `builder` names stay
deliberately. Read this before you report an inconsistency.

Both action names work. Send `approve_broker_fee` in new code. The node still
accepts `approve_builder_fee`, and always will. A committed block keeps the
exact JSON that the trader sent, and every node reads those blocks again when it
replays the chain. Thus the node never withdraws an action name that it once
accepted.

Committed data fixes these two names, so they do not change:

| Name | Where you see it |
|------|-------------------|
| `builder` | the parameter of `approve_broker_fee`, and the broker block on an order |
| `approve_builder_fee` | the accepted alias of the action name |

The read names changed, because no committed block fixes them. The caller picks
a query type at read time. `broker_state` and `approved_brokers` are the names
to use. `broker_state` and `approved_brokers` still answer, and the reply
returns the name that you sent.

The EIP-712 type string still reads `ApproveBuilderFee`. You send
`approve_broker_fee`, but you sign
`MetaFluxTransaction:ApproveBuilderFee(string metafluxChain,address builder,uint16 maxFeeBps,uint64 nonce)`.
This mismatch is deliberate. It is not a bug. The type string is hashed into
every signature ever made for this action. A change of one byte stops every one
of those signatures from verifying. A `broker` spelling can only come later as a
second type string, selected per request. It can never be an edit to this one.
See [typed-data signing](../integration/typed-data-signing.md#account-staking--vault).
:::

## Charging {#charging}

Attach a `builder` block to the order:

```json
"builder": { "fee": 5, "user": "0x<your address>" }
```

| Field | Meaning |
|-------|---------|
| `fee` | Your rate for this order, in whole bps |
| `user` | Your address |

The EIP-712 `submit_order` type string names the same two values `builderFee`
and `builderUser`. Your signing library reads them. You do not send them.

Then, on every fill of that order:

```
taker pays = base taker fee + broker fee
```

The two are separate debits. The broker fee is `notional × rate`, rounded toward
zero. All of it goes to your address.

The node still validates a zero-rate broker. `"fee": 0` charges nothing, but the
address must still be real and approved. Thus the attribution path is the same
whether or not you charge.

Makers never pay a broker fee. The node charges only the taker side of a fill.

## Fee waterfall {#waterfall}

Your fee is outside the exchange's fee split, not inside it. This often
surprises users.

```text
taker pays = base_taker_fee + broker_fee     ← two separate debits

base_taker_fee → referrer share, if the trader has a referrer
               → the remainder is split by the protocol

broker_fee     → the broker, in full
```

Thus your fee does not reduce the referrer share and does not go into the
protocol split. Neither of them reduces your fee. Your fee also does not reduce
the exchange's own fee. The trader pays both.

## Claiming {#claiming}

Fees accrue to a running balance. To claim it, send:

```json
{ "type": "claim_broker_rewards" }
```

One claim moves the broker credit and the referral credit together.
`claim_broker_rewards` and
[`claim_referral_rewards`](../api/rest/exchange/account.md#claim_referral_rewards)
do the same thing: each one empties both credits of the sender. An account that
is a broker and a referrer claims once, not twice.

The node accepts both names. Send `claim_broker_rewards`. The node still decodes
`claim_builder_rewards` and always will. This is the same second-name rule that
[`approve_broker_fee`](#approval) follows.

Read the balances before you claim them, because the `/exchange` reply reports
no amount. Query [`broker_state`](../api/rest/info/fees-credit.md#broker_state)
and [`referral_state`](../api/rest/info/fees-credit.md#referral_state) with your
address. `broker_state` keeps the `builder` spelling. The claimable amount is the
sum of the two `claimable_rewards` values. After the claim, both balances are
`0`, so a later read cannot tell you what moved. The
[`node_actions`](../nodes/data-streams.md#node_actions-result) row of the claim
has the total and the two parts.

The full accrued balance moves into your spendable collateral, and the node
removes the entry. The call is *idempotent*: a claim with nothing accrued claims
`0` and is not an error. A retry after a timeout is thus safe.

There is no minimum, no schedule and no expiry.

## Limits and failure modes {#limits}

| Situation | Result |
|-----------|--------|
| Trader never approved you | Order **rejected** |
| Your rate exceeds their approval | Order **rejected** |
| Your rate exceeds the protocol cap | Order **rejected** |
| Broker address is zero | Order **rejected** |
| Your rate is `0`, and you are approved | Accepted, nothing charged |
| Nothing accrued when you claim | Claims `0`, not an error |

Every rejection occurs before the order rests. A broker code with a bad
configuration thus never produces a partly charged fill.

## See also {#see-also}

- [Fees](./fees.md): the base taker and maker schedule, and the protocol split.
- [Order types](./order-types.md): where the broker fields are on an order.
