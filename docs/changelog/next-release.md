---
description: "One change waits for the next node release: signed faucet claims, a 0.01 ETH Ethereum mainnet balance rule and a fixed grant. One wire row is in the shipped code but not verified on the running chain: the size plane on archive candles. Also five corrections to this reference."
---

# Next release and unverified wire rows

:::caution
**One change on this page waits for the next node release:**
[signed faucet claims](#faucet-signed-claims). Every section the page staged
for node 0.9.16 is live, and each one moved to
[block 25,599,540](./block-25599540.md). Gateway 0.9.16 shipped in the
same window. The action byte cap and the per-leg `batch_cancel` reply went live
at [block 17,113,494](./block-17113494.md). The rules staged for the releases
after 0.9.7 moved to [block 11,550,001](./block-11550001.md).

**The [archive candle row](#archive-candle-plane) waits for a MEASUREMENT.** It
is in the shipped code, but nobody has yet read it on the running chain. It says
what would settle it.

The page also keeps [five corrections](#corrections) to this reference. They are
not chain changes.
:::

## Faucet claims are signed {#faucet-signed-claims}

**Not live yet.** It waits for the next node release.

[`POST /faucet`](../api/rest/faucet.md) gains two required fields and one
eligibility rule:

- **`expires`**, unix seconds. The node refuses a value in the past and a value
  more than 600 s ahead of its clock. Set it to the current time plus 300.
- **`signature`**, an EIP-191 `personal_sign` by the recipient over a four-line
  text that names the address, the chain id and `expires`. See
  [sign the claim](../api/rest/faucet.md#sign), with a worked example.
- **The recipient must hold at least 0.01 ETH on Ethereum mainnet.** See
  [who can claim](../api/rest/faucet.md#eligibility).
- **The grant is fixed, and `amount` is ignored.** The signature does not cover
  `amount`, so a node that honoured it would let anyone who saw a signed body
  send it first with a tiny amount and spend the once-ever claim. The running
  node still caps the USDC grant at `amount`, so send none.
- **Every per-IP limit counts an IPv6 address by its /64.** An IPv4 address
  counts whole. One IP runs one balance check at a time, and at most 10 an hour.

Each new refusal and its exact text is in the
[errors table](../api/rest/faucet.md#errors). The once-per-address rule does
not change.

**Why.** Each address can claim once, ever. Without a signature, any caller
could spend the one claim of an address it does not control. The balance rule
ties each grant to an address that holds real value.

**What to do now.** Sign every claim, and send no `amount`. The running node
ignores the two new fields, so a signed claim works before and after the
release. An unsigned claim stops working at the release. A refused claim answers
`{"error":"<text>"}`; show the text to the user as it is.

## Archive candles state their size plane {#archive-candle-plane}

**Unverified on the running chain.**

The candle archive records the size plane each trade bar was folded on. The
[`candle`](../api/rest/info/perpetuals.md#candle_snapshot) read divides the bar's
volume by that plane, and falls back to the market's current precision for a bar
that states none. The gateway half is live — see
[block 11,550,001](./block-11550001.md#read-side). The archive half ships
separately, and the date it went live is not confirmed.

Bars folded before the archive recorded the plane state none. A backfill to
stamp them has not run.

**Why it matters only after a raise.** The fallback is exact until the first
governance raise of a market's precision. After a raise, a bar with no stated
plane reads `10^Δ` too small.

**What settles it:** an archive bar that states its plane, read back from the
store, and the backfill run.

**Until then:** treat archive trade-bar volume from before a raise on that market
as unconfirmed.

## Five corrections to this reference {#corrections}

None is a change to the chain. The reference was wrong and the code was right.

- [`top_up_isolated_only_margin`](../api/rest/exchange/margin-risk.md#top_up_isolated_only_margin)
  accepts a PLAIN isolated position, not strict-isolated only.
- [`candle_snapshot`](../api/rest/info/perpetuals.md#candle_snapshot-volume-join)
  serves real trade volume in `v`, `q` and `n` on a `mark` or `oracle` bar. They
  are not `"0"`, and `n` is not a sample count.
- [`node_gov`](../nodes/data-streams.md#node_gov) `action` is the protocol
  action name with a capital first letter, such as `"SetDynamicRiskParam"`. The
  example showed `"setDynamicRiskParam"`.
- WS [`l2_book`](../api/ws/subscriptions.md#l2_book) and `bbo` on a spot pair
  carry the time of the newest print on the pair in `time`. The reference said
  a spot book always reads `time: 0`.
- [`order_status`](../api/rest/info/orders-fills.md#order_status) serves
  `fills` newest first. The reference said oldest first.
