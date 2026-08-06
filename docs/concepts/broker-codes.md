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
  "type": "approve_builder_fee",
  "params": { "builder": "0x<your address>", "max_bps": 7 }
}
```

`max_bps` is whole basis points. Approving `0` is meaningful: it makes you a
recognized broker who charges nothing, which is different from not being approved
at all.

Read a trader's approvals with the `approved_brokers` query, or one specific
grant with `max_builder_fee`.

:::warning
**The wire still says `builder`.** The action type, the `builder` parameter and
the `max_builder_fee` query keep that name because they are frozen surfaces —
the action name is part of what every historical signature signed, so renaming it
would break signature verification and block replay. The rest of the system calls
this a broker. **This is deliberate. Do not report it as an inconsistency.**
:::

## Charging {#charging}

Attach the broker to the order:

| Field | Meaning |
|-------|---------|
| `builderFee` | Your rate for this order, in whole bps |
| `builderUser` | Your address |

Then, on every fill of that order:

```
taker pays = base taker fee + broker fee
```

The two are **separate debits**. The broker fee is `notional × rate`, rounded
toward zero, and credited to your address in full.

A **zero-rate broker is still validated.** Setting `builderFee: 0` is a no-op
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
{ "type": "claim_broker_rewards" }
```

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
