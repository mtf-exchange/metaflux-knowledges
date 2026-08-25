---
description: What changes on devnet chain 114514 at block 13,350,001 — a future-nonce refusal, TWAP slices that finally fill, cancel-all that reaches TWAP parents, an isolated extend that posts margin, a bounded EVM block, and the buyback drip.
---

# Activation notice — block 13,350,001

:::info
**LIVE since block 13,350,001.** Node 0.8.9 swapped in at block 13,350,000 and
every rule below turned on one block later. This page is kept as the record of
what changed at that boundary, because a client written against the older
behaviour breaks on the rows below.

`{"type":"account_state","address":"0x…"}` carries the live `height` if you need to
check where the chain is.
:::

Eleven behaviours move at ONE height, so the chain gains one boundary rather than
eleven. The rows below are the ones a caller can observe. Anything else in the
release changes no request, response, or rejection you can see.

**Why the pin is one block above the swap.** The outgoing binary commits block
13,350,000 and only then halts, so that block still runs the old rules. Pinning
the change at the swap height itself would mean the live chain and a replay of it
disagreed about that one block.

## Rejections that are NEW {#new-rejections}

| Surface | Behaviour |
|---|---|
| Any signed action | A `nonce` more than **24 hours** above the chain's own clock is refused. See below — **this is the row most likely to break a working client.** |
| An isolated position that EXTENDS | The extend now posts margin. An extend that the account cannot fund is refused where it previously succeeded. |

### The future-nonce ceiling {#future-nonce-ceiling}

**Read this one even if you skip the rest.** Below the height, any nonce above
the account's replay window is accepted and becomes the new high-water mark. One
action carrying an absurd value therefore pins the window forever, and every
honest nonce afterwards reads as too old.

At and above the height a nonce is refused when it exceeds the chain's last EVM
block timestamp by more than 24 hours.

Two ways a working client trips this:

- **A clock more than a day fast.** The nonce convention is unix milliseconds, so
  a machine whose clock runs ahead signs ahead. Fix the clock; nothing else
  helps, because every action it signs is refused.
- **A different time unit.** A client signing MICROSECONDS or nanoseconds is a
  thousand or a million times above the ceiling and is refused on every action.
  Send milliseconds.

An account whose window was already pushed above the ceiling by a past action
**repairs itself**: its next accepted action re-seeds the window rather than
locking the account out. No support request is needed for that case.

## Behaviour that CHANGES {#behaviour-changes}

| Surface | Before 13,350,001 | Now |
|---|---|---|
| `twap_order` slices | A slice's synthesized price and size miss the market's grid, so **no slice has ever filled**. Every fill in the archive carries a null `twapId`. | Slices snap to the grid and FILL. Fills begin to carry the parent's `twapId`. |
| A `twap_order` slice with no usable mark | Prices off the raw mark, ignoring the oracle-presence, staleness and band checks the rest of the engine applies. | The slice PARKS: it does not fire and does not count against the schedule. |
| `cancel_all_orders`, and the dead-man `schedule_cancel` | Walks the resting books only. A swept account keeps its TWAP schedule running and its parked auction orders live. | The sweep also retires TWAP parents and parked auction orders. |
| A full position close | The row survives with its `margin_mode`. A later CROSS re-open then settles against the stale isolated bucket. | The flat row is pruned, so a re-open starts clean. |
| An EVM block whose declared gas exceeds the block limit | Every committed transaction executes, so one oversized payload stalls the round. | The block admits the prefix that fits, defers the next transaction to a later block, and drops the rest. **A transaction may take an extra block to execute.** |
| Governance `force_close_position`, partial | Leaves the full entry notional, open interest and isolated margin on the residual. | Settles the residual. |
| The fee buyback | One fire spends the whole available balance. | One fire spends one slice (`buyback_status.drip_active` reads `true`). |

## Votes that become castable {#new-votes}

Four `vote_global` kinds ship in this release. A node below it does not know the
names and answers a cast for one exactly the way it answers a name that never
existed.

| `kind_name` | What it sets |
|---|---|
| `set_funding_ema_decay` | The funding EMA decay. The fold keeps reading the compiled default until this height. |
| `set_target_block_interval_ms` | The proposer's own pacing period. Needs no activation height of its own. |
| `set_mtf_asset_id` | Binds the canonical MTF spot asset. **Refused below this height** — see the sequencing note in [Fees](../concepts/fees.md). |
| `set_buyback_slice_usdc` | The per-fire buyback slice. |

## Read surface {#read-surface}

`buyback_status` ships with the binary and is live **at the swap**, one block
before everything else on this page. Its `drip_active` field is `false` until
13,350,001 and `true` after. It is read through the operator-lane
[`protocol_metrics`](./rest/info.md#operator-reads) query, not the public API.

## What does NOT change {#unchanged}

The spot lane for `twap_order`, `scale_order` and `chase_order` stays OFF. Those
three still refuse a spot pair id at every height in this release, and the
[order types](../concepts/order-types.md) page still describes that lane as not
live.
