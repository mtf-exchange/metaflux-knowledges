---
description: What changed on the public wire and when — activation boundaries and migration checklists for an existing client. A new integration does not need this section.
---

# Changelog

**Building a new client? Skip this section.** Everything here describes how the
wire USED to behave. The current contract is the
[API reference](../api/index.md), and it is already correct.

Read a page here when you have a client written against an older release and it
started failing, or when you want to know at which block a behaviour changed.

## How a change reaches the chain {#how-a-change-lands}

One release moves every behaviour at ONE height. The chain gains one boundary
per release, not one per change, so a page here covers a whole release rather
than a single field.

The pin sits one block ABOVE the swap height. The outgoing binary commits the
swap block and only then halts, so that block still runs the old rules. Pinning
at the swap height itself would make the live chain and a replay of it disagree
about that one block.

`{"type":"account_state","address":"0x…"}` carries the live `height`, so you can
check where the chain is against any boundary below.

## Entries {#entries}

| Entry | What it covers |
|---|---|
| [Migrations](./migrations.md) | Five breaking changes to the READ surface, newest first, each with a checklist. Signed `/exchange` actions are unchanged by all five. |
| [Ids and wire shapes](./ids-and-wire-shapes.md) | `oid` and `tid` became decimal-digit strings, `order_status` gained its fill legs and terminal states, a fill labels its fee token, margin and funding moved onto one plane. Two rows corrupt data silently rather than erroring. |
| [Next release and unverified wire rows](./next-release.md) | One row in the shipped code that is not yet read on the running chain: the size plane on archive candles. Also two corrections to this reference. |
| [Block 17,113,494](./block-17113494.md) | The signed `action` is capped at 1 MiB, and a `batch_cancel` answers and pushes an `order_updates` record for each leg. |
| [Block 16,450,001](./block-16450001.md) | A multi-sig roster holds at most 16 distinct signers, a `multi_sig` envelope carries at most 16 signatures, and the envelope no longer moves the posting account's nonce window. |
| [Block 11,550,001](./block-11550001.md) | `vault_modify` signs a new type, every raw-size row states its size plane, one faucet claim per address, a `parked` status, a `NONCE_REPLAYED` verdict, per-leg `cloid` dedup, three silent accepts that become refusals, a spot order refused when unfunded, a split `standard` account with no reservations, a delist that settles every position. Also the gateway rows that shipped the same day: four reads that answer `410`, one snapshot frame per subscribe, a `trades` limit that caps the merged answer. |
| [Block 5,710,001](./block-5710001.md) | The two-wallet `standard` account, one force-close vote for both legs, `start_position` on the size plane, `reservations` and `split` on `account_state`. |
| [Block 13,350,001](./block-13350001.md) | A future-nonce refusal, TWAP slices that fill, cancel-all reaching TWAP parents, an isolated extend that posts margin, a bounded EVM block, the buyback drip. |
| [Block 7,400,000](./block-7400000.md) | An admission rule that refuses over-levered orders, a delist that cancels resting orders, the contract CoreWriter lane, permissionless spot deployment, randomized TWAP slices. |

## See also {#see-also}

- [Versioning](../versioning.md) — the policy: what counts as breaking, and the notice period
- [API reference](../api/index.md) — the current contract
