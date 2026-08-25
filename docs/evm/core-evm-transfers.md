# Core ↔ EVM transfers

:::tip
**Live on devnet.** The EVM→Core value-transfer actions (`SpotSend`, `SendAsset`,
`UsdClassTransfer`, `VaultTransfer` via CoreWriter) and Core→EVM credit
materialization are operational and tested. The [bridge](../bridge/) (cross-chain
custody) is live.
:::

Value moves between **Core** (the L1 clearinghouse / spot ledger) and the **EVM**
side in two directions. Both are deterministic and account-scoped.

## Moving VALUE from EVM to Core {#evm--core-value}

**This is the lane you want if you are moving a balance.** Send an ordinary EVM
transaction to the system withdraw sink:

```
to:   0x0000000000000000000000000000000000000602
data: abi.encode(uint256 asset_id, uint256 amount)   // 64 bytes, exactly two words
```

The node burns `amount` of your system token on the EVM side and credits the
SAME account on Core — USDC (`asset_id` 0) to your perp cross-collateral, any
other asset to your spot balance. The credit is always backed: it credits only
what the burn actually removed, so the lane cannot mint.

| Requirement | Why |
|---|---|
| The transaction must SUCCEED | A reverted tx is skipped by the scan |
| `data` is at least 64 bytes | Shorter calldata is ignored, silently |
| `asset_id` is the LOW 4 bytes of word 0 | It is read as a `uint32` |
| `amount` is the LOW 16 bytes of word 1 | It is read as a `uint128` |
| The asset must be registered | An unresolvable `asset_id` is ignored |

:::warning
**A short or malformed calldata is IGNORED, not rejected.** The transaction
succeeds, gas is spent, and nothing moves. There is no revert to catch, so check
your balance on Core rather than the EVM receipt.
:::

:::info
**The `/exchange` action `core_evm_transfer` with `to_evm: false` is REFUSED, on
purpose.** Crediting Core without a confirmed EVM burn would create value out of
nothing, so that path fails closed and points here instead.
:::

### Which assets can cross {#which-assets-cross}

Not every token you hold can. Ask the chain rather than guessing:

```json
{ "type": "markets_meta", "kind": "spot" }
```

```json
{ "spot": { "tokens": [
  { "id": 101, "name": "BTC",
    "evm_contract": { "address": "0x…", "variant": 0, "evm_extra_wei_decimals": 0 } },
  { "id": 5, "name": "TOKEN5", "evm_contract": null }
] } }
```

**`evm_contract` is the test.** A token with an object can cross; a token with
`null` cannot. The read resolves the address through the SAME predicate the
transfer path uses, so it can never offer a binding the chain would then refuse.
`variant` names how the token is bound — `0` a deployed contract, `1` and `2`
storage-slot forms — and it does not change whether the asset crosses.

The [token registry](../api/rest/info/spot.md#spot_meta) is one section of
[`markets_meta`](../api/rest/info/perpetuals.md#markets_meta), so the same call
that gives you the tradable universe gives you this. There is no separate
bindings read.

Two assets cross without a bound ERC-20 row: **USDC**, which is the fixed
FiatToken predeploy, and the **native gas token**, which is the EVM balance
itself rather than a contract.

:::warning
**The bound address ROTATES — read it, never freeze it.** A validator-quorum
vote can re-bind a token to a different contract. An address copied into your
config, your source, or your own documentation then points at a contract the
chain no longer credits. Ask `markets_meta` on each use, and key your own
records on the asset id, which does not move.
:::

Offer the transfer only for the assets that resolve. An asset the chain cannot
resolve is the silent-failure case above: the burn transaction succeeds and
nothing moves.

## EVM → Core (via CoreWriter) {#evm--core-via-corewriter}

A contract submits an L1 ACTION through
[CoreWriter](interacting-with-core.md#writing-to-core--corewriter) (`0x3333…3333`).
The acting account is the calling contract (`msg.sender`):

| Action | Effect |
|--------|--------|
| `SpotSend` | Transfer a spot token to another account on Core |
| `SendAsset` | Generic asset transfer (perp / spot / vault classes) |
| `UsdClassTransfer` ⚠️ | **Rejected.** One USDC pool, so there is no second class to move to. The call still burns gas and emits `RawAction`; the L1 rejection is silent, per the atomicity rule below. See [USDC](../concepts/usdc.md#moving-usdc). |
| `VaultTransfer` | Deposit to / withdraw from a vault |

These are subject to CoreWriter's atomicity rule: the call burns gas + emits
`RawAction`; any L1-side failure afterwards is **silent** (no EVM revert).

:::danger
**A CONTRACT's CoreWriter call does not reach Core BELOW BLOCK 7,400,000.** Below
that height `0x3333…3333` holds no code, and only a TOP-LEVEL transaction sent
directly to that address reaches L1. A call made from inside a contract emits
nothing and changes nothing on Core — and because the atomicity rule above means
no revert, it looks like it worked.

**The contract lane opens at block 7,400,000 on devnet (chain 114514).** At and
above that height a contract's CoreWriter call reaches Core. Below it, send the
CoreWriter transaction top-level from an EOA, or move value through the
[withdraw sink](#evm--core-value) above, which is live at every height.

Read the live height before you rely on this —
`{"type":"account_state","address":"0x…"}` carries it as `height`.
:::

## Moving VALUE from Core to EVM {#core--evm-value}

**This is the lane you want if you are moving a balance the other way.** Two
`/exchange` actions do it, and both reach the same queue and land the same credit:

| Action | Field shape | Debits | Availability |
|---|---|---|---|
| [`core_evm_transfer`](../api/rest/exchange.md#core_evm_transfer) | MTF-native | the perp collateral pool for `asset: 0`, else the spot ledger | **live at every height** |
| [`send_to_evm_with_data`](../api/rest/exchange.md#send_to_evm_with_data) | Hyperliquid-compatible | the spot ledger, always | **live** |

Use `core_evm_transfer` if you have a choice. Both are live, and it is the only one
of the two that can move USDC out of the perp collateral pool — the balance
`account_value` / `withdrawable` report. Reach for `send_to_evm_with_data` when you
are porting a client that already builds the Hyperliquid field shape. The full
comparison is
[which Core → EVM action to use](../api/rest/exchange.md#core-evm-which-action).

Both debit the sender's exchange ledger the moment the action commits, and queue
one EVM credit that the node mints on the next EVM block. Because the debit lands
first, the queued credit is always backed — the lane cannot mint. Both may carry
an optional EVM payload of up to **4096 bytes**, which runs against the recipient
**after** the credit lands. The payload **never unwinds the credit**: a revert
leaves the credit standing, so read its receipt.

Only assets the chain can resolve may cross — see
[which assets can cross](#which-assets-cross).

:::warning
**Amounts are decimal strings, and an amount too small to credit is REFUSED, not
rounded to nothing.** The lane truncates twice toward zero: to 8 decimal places,
then to the token's own EVM decimals. So the smallest creditable amount is
`10 ^ -min(8, the token's EVM decimals)` — `0.000001` for USDC, `0.00000001` for
native MTF. Below that the action refuses. Above it you are debited exactly what
is credited, so no sub-quantum remainder is destroyed in transit.
:::

### Both lanes charge a fee, and the fee is MTF {#core-to-evm-fee}

**No fee is charged today: the parameter is `0`.** A two-thirds-stake governance
vote sets it, and charging starts as soon as a vote enacts a value above `0`. Once
it does, both actions charge the same fee, so neither lane is cheaper.

The fee is a **quantity of MTF**, debited on top of the amount, and it is
independent of the asset you move: a transfer of USDC debits USDC for the amount
and MTF for the fee. The chain takes it from your **spot MTF** balance first, then
from your **USDC** at the MTF reference price, and **refuses the transfer** when
neither covers it.

:::warning
**A transfer can be refused for a reason that has nothing to do with the asset you
are moving.** MTF is priced from its own book, so the USDC step needs that
reference price. When the price is not usable the chain refuses the transfer rather
than charge at a guessed price. Hold enough spot MTF to cover the fee and the
reference price is never read.
:::

The rule, the rejection strings and the governance parameter are in
[the fee](../api/rest/exchange.md#core-evm-fee) and
[Fees](../concepts/fees.md#core-evm-transfer-fee).

## Core → EVM (system pseudo-transactions) {#core--evm-system-pseudo-transactions}

When an L1 begin-block effect needs to land on the EVM side — e.g. a spot send
whose recipient is an EVM-side address, or a bridge inbound mint — it is queued
and materialized as a **deterministic system pseudo-transaction on the next EVM
block**:

| Op | Source | Amount scale |
|----|--------|--------------|
| `SpotCredit` | an L1 spot balance credited to a 20-byte EVM recipient | `1e8` fixed-point |
| `BridgeMint` | a [MetaBridge](../bridge/) inbound mint (e.g. USDC) | `1e6` (USDC native) |

Ordering + throughput:

- Queued by **L1 round**, drained in ascending round order, FIFO within a round —
  so two validators materialize the same ops in the same order (determinism).
- Each op is billed a **system-gas** cost and drained against an **elastic
  per-block system-gas slice** (it scales with the block gas budget); leftover ops
  carry to the next block. Expect Core→EVM credits to land within a small number of
  blocks, not instantly in the same block they were triggered.

## Cross-chain (a different surface) {#cross-chain-a-different-surface}

`CrossChainSend` (CoreWriter action 19) does **not** move value to the local EVM —
it queues a withdrawal into the [MetaBridge custody bridge](../bridge/), which
releases on the destination chain (Base / Arbitrum) on a ⅔ validator co-signature
behind a dispute window.

## See also {#see-also}

- [Interacting with Core](interacting-with-core.md)
- [Interaction timings](interaction-timings.md)
- [Bridge](../bridge/)
