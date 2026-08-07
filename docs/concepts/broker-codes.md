---
description: Broker codes — how a front end or bot charges its own fee on a MetaFlux order, what bounds it, and how the fee is claimed.
---

# Broker codes

A **broker** is anyone who routes orders for someone else — a front end, a
trading bot, a terminal. A broker code lets you charge your own fee on the orders
you route, collected on-chain, with no agreement with MetaFlux.

The fee is **additive**. It is charged on top of the exchange fee, not carved out
of it, and it goes to you in full.

## TL;DR {#tldr}

1. The trader approves you once, naming a **maximum** rate.
2. You set a rate on each order, at or below that maximum.
3. The taker pays your fee on every fill.
4. You claim the accrued balance whenever you want.

You cannot charge a trader who has not approved you. You cannot charge more than
they approved. Both checks run before the order is accepted.

## The two ceilings {#ceilings}

Every broker fee passes **two** independent limits. The lower one wins.

| Limit | Set by | Default | Bounds |
|-------|--------|---------|--------|
| Protocol cap | Governance | **8 bps** | 1–100 bps |
| Per-trader cap | The trader | none until approved | 0 – protocol cap |

The protocol cap is a global ceiling on the whole exchange. The per-trader cap is
the number that trader approved for you specifically. An order naming a rate
above either one is **rejected before it rests** — it does not fill and then
refund.

:::info
Both ceilings are read live, on every order. If governance lowers the protocol
cap below a rate a trader already approved, the lower cap applies immediately.
The stored approval is not rewritten.
:::

## Approval {#approval}

The trader signs one action:

```json
{
  "type": "approve_broker_fee",
  "params": { "builder": "0x<your address>", "max_bps": 7 }
}
```

`max_bps` is whole basis points. Approving `0` is meaningful: it makes you a
recognized broker who charges nothing, which is different from not being approved
at all.

Read a trader's approvals with the `approved_builders` query, or one specific
grant with `max_builder_fee`.

:::warning
**The action type is `approve_broker_fee`. Some older `builder` names stay, on
purpose.** Read this before you file an inconsistency.

**Both action names work.** Send `approve_broker_fee` in new code.
`approve_builder_fee` is still accepted, and always will be. A committed block
keeps the exact JSON that the trader submitted, and every node reads those blocks
again when it replays the chain. An accepted action name is therefore never
withdrawn.

**These names do not move.** Committed data fixes each one:

| Name | Where you meet it |
|------|-------------------|
| `builder` | the parameter of `approve_broker_fee`, and the broker block on an order |
| `max_builder_fee` | the single-grant query |
| `approved_builders` | the enumerated-grant query |

**The EIP-712 type string still reads `ApproveBuilderFee`.** You send
`approve_broker_fee`, but you sign
`MetaFluxTransaction:ApproveBuilderFee(string metafluxChain,address builder,uint16 maxFeeBps,uint64 nonce)`.
**This mismatch is deliberate. Do not report it as a bug.** The type string is
hashed into every signature ever made for this action. Change one byte of it and
every one of those signatures stops verifying. A `broker` spelling can only
arrive later as a SECOND type string, selected per request. It can never be an
edit to this one. See
[typed-data signing](../integration/typed-data-signing.md#account-staking--vault).
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
and `builderUser`. Your signing library reads them; you do not send them.

Then, on every fill of that order:

```
taker pays = base taker fee + broker fee
```

The two are **separate debits**. The broker fee is `notional × rate`, rounded
toward zero, and credited to your address in full.

A **zero-rate broker is still validated.** Setting `"fee": 0` is a no-op
charge, but the address must still be real and still approved. This keeps the
attribution path identical whether or not you charge.

**Makers never pay a broker fee.** Only the taker side of a fill is charged.

## Where the fee sits in the waterfall {#waterfall}

This is the part that surprises people. Your fee is **outside** the exchange's
fee split, not inside it.

```text
taker pays = base_taker_fee + broker_fee     ← two separate debits

base_taker_fee → referrer share, if the trader has a referrer
               → the remainder is split by the protocol

broker_fee     → the broker, in full
```

So your fee does not dilute the referrer share, does not feed the protocol split,
and is not reduced by either. Equally, the exchange's own fee is not reduced by
yours — the trader pays both.

## Claiming {#claiming}

Fees accrue to a running balance. Claim it with:

```json
{ "type": "claim_builder_rewards" }
```

This action keeps the `builder` spelling. Only `approve_broker_fee` has a second
name today.

The whole accrued balance moves into your spendable collateral and the entry is
removed. The call is **idempotent**: claiming again with nothing accrued claims
`0` and is not an error, so a retry after a timeout is safe.

There is no minimum, no schedule, and no expiry.

## Limits and failure modes {#limits}

| Situation | Result |
|-----------|--------|
| Trader never approved you | Order **rejected** |
| Your rate exceeds their approval | Order **rejected** |
| Your rate exceeds the protocol cap | Order **rejected** |
| Broker address is zero | Order **rejected** |
| Your rate is `0`, and you are approved | Accepted, nothing charged |
| Nothing accrued when you claim | Claims `0`, not an error |

Every rejection happens **before** the order rests, so a misconfigured broker
code never produces a partially charged fill.

## See also {#see-also}

- [Fees](./fees.md) — the base taker and maker schedule, and the protocol split
- [Order types](./order-types.md) — where the broker fields sit on an order
