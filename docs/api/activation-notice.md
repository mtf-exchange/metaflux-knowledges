---
description: What changed on devnet chain 114514 at block 7,400,000 — an admission rule that refuses over-levered orders, a delist that cancels resting orders, the contract CoreWriter lane, permissionless spot deployment, and randomized TWAP slices.
---

# Activation notice — block 7,400,000

:::info
**LIVE since block 7,400,000 on devnet (chain 114514).** Everything on this page
is in force. It is kept as a record of what changed at that boundary, because a
client written against the older behaviour breaks on the rows below.

`{"type":"web_data","address":"0x…"}` carries the live `height` if you need to
check where the chain is.
:::

One release moves twenty behaviours at one height, so the chain gains ONE
boundary. The rows below are the ones a caller can observe. Everything else in
the release is internal and changes no request, response, or rejection you can
see.

## Rejections that are NEW {#new-rejections}

| Surface | Behaviour |
|---|---|
| `submit_order` on a perp | An order whose leverage cannot survive its own MAINTENANCE margin is refused with `InsufficientMargin`. See below. |
| `activate_pair` (governance) | A spot pair with no price/size grid is refused. A zero tick or zero lot IS "no grid". |
| `listing` (governance) | A market symbol outside the accepted bound is refused. |
| An account under `quarantine_user` | Its orders are refused at admission. The flag was recorded but never enforced below this height. |

### The admission maintenance floor {#admission-maintenance-floor}

**This is the row most likely to change what your client sees.** Below 7,400,000
admission reserves INITIAL margin while the liquidation engine demands
MAINTENANCE margin. On a market with high base leverage against a low maintenance
ratio — BTC and ETH both qualify — an order can be admitted and the position is
under water the moment it fills.

At and above the height the admission divisor is clamped by the maintenance
ratio, so that order is refused with `InsufficientMargin` instead. **No `oid` is
burned and nothing rests on the book** — the rejection is clean.

What to do: nothing, if you size positions to survive maintenance. If you place
orders at the leverage ceiling, expect a rejection that did not happen before,
and size down rather than retry.

## Behaviour that CHANGES {#behaviour-changes}

| Surface | Below | At and above |
|---|---|---|
| `delisting` (governance) | Halts admission only. A resting order SURVIVES the delist. | The delist cancels resting orders on that market. |
| A spot match's taker rate | Can resolve more than once; a relist is admitted with no taker override. | Resolved once, and a relist requires the override. |
| `vault_withdraw` refused for a leader | The reject text does not say what to use instead. | The text names `vault_transfer` as the lane. |
| `priority_bid` outcome text | Carries the word `(stub)`. The fee itself was always real. | The word is gone. |

The last two change an outcome STRING. If your client matches on outcome text
rather than on the action's status, it breaks at this height — match on status.

## Lanes that OPEN {#lanes-that-open}

These are new capability, not fixes. Each one is unreachable below the height.

### A contract may call CoreWriter {#corewriter-contract-lane}

Below 7,400,000 only a TOP-LEVEL transaction to `0x3333…3333` reaches L1; a call
from inside a contract emits nothing and, because CoreWriter never reverts on an
L1-side failure, it looks like it worked. At and above the height the contract
lane is live. See [Core ↔ EVM transfers](../evm/core-evm-transfers.md).

### Permissionless spot deployment {#spot-genesis}

A deployer may register a token, register a pair, set its parameters and set its
genesis distribution without a governance vote. This lane can create spot supply,
so it is the most consequential row on this page. The actions and their bounds
are documented with the [spot surface](rest/info/spot.md).

### TWAP slices may be randomized {#twap-slice-jitter}

A `twap_order` may ask for a randomized slice schedule: the begin-block executor
draws each slice size and each inter-slice delay from a digest over committed
inputs. It is deterministic — every validator draws the same numbers — and it
exists so a TWAP is harder to front-run. A `twap_order` that does not ask for it
keeps the fixed schedule, byte for byte.

## Governance-only {#governance-only}

`mb_configure_chain` writes the deposit-scan policy as CONSENSUS data at and
above this height. Below it the voted policy is discarded and each node reads its
own file. If you operate a validator, restate the scan-policy flags on every
rotation — see the bridge rotation procedure.

`listing` also registers the base token in `total_supply`, which is the
registration test `gov_adjust_spot_balance` reads. A listing below this height
leaves that key unwritten.

## What does NOT change {#what-does-not-change}

No field is renamed, removed, or re-typed. No endpoint changes availability. No
signing domain moves. A client that only reads and places ordinary orders needs
no change at all — unless it places them at the leverage ceiling, which is the
one row above.
