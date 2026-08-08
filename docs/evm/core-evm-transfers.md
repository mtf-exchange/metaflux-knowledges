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
{ "type": "evm_contract_bindings" }
```

```json
{ "bindings": [
  { "asset": 101, "token": "BTC", "variant": 0,
    "address": "0x…" },
  { "asset": 5, "token": "asset:5", "variant": 2, "address": null }
] }
```

An `address` is the ERC-20 the asset is bound to, and its presence is the test:
the read resolves it through the SAME predicate the transfer path uses, so an
asset with an address can cross and one with `address: null` cannot. Two assets
cross without appearing here as a bound ERC-20: **USDC**, which is the fixed
FiatToken predeploy, and the **native gas token**, which is the EVM balance
itself rather than a contract.

Offer the transfer only for those. An asset the chain cannot resolve is the
silent-failure case above: the burn transaction succeeds and nothing moves.

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

Read the live height before you rely on this — `{"type":"meta"}` carries it.
:::

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
releases on the destination chain (Base / Solana) on a ⅔ validator co-signature
behind a dispute window.

## See also {#see-also}

- [Interacting with Core](interacting-with-core.md)
- [Interaction timings](interaction-timings.md)
- [Bridge](../bridge/)
