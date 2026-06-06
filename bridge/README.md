# Bridge

{% hint style="info" %}
**Status.** MetaBridge USDC custody bridge **live on Base Sepolia** (testnet,
`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)),
and a Solana custody program live on **devnet** under the same model. Both
directions are verified end-to-end on Base Sepolia: a real deposit
(watcher → cosign → auto-registered cosigner → ⅔-quorum credit) and a full
withdrawal round-trip (L1 cosign → relay loop → on-chain `batchWithdraw` →
dispute window → `claim`). Hardenings: gas-amortized `batchWithdraw`/`batchClaim`,
partial-success batches, a dual time+block dispute window, hot/cold validator key
separation, two-phase validator rotation with a single-hot-validator **cancel**
veto during the window, and domain- + epoch-bound signatures pinned byte-for-byte
across the EVM contract, the Solana program, and the L1 (cross-language
known-answer vectors). Arbitrum rollout + a pre-mainnet audit remain.
{% endhint %}

MetaFlux bridges **all assets — including USDC — through MetaBridge**, a
MetaFlux-validator-signed custody bridge (HL-Bridge2 equivalent). There is **no
third-party bridge and no Circle CCTP dependency** on the critical path.

## Why custody, not CCTP

CCTP only moves USDC between chains Circle has enrolled as CCTP *domains*. MetaFlux
is an independent L1; being added as a CCTP domain is a Circle business decision we
don't control. A deposit path that needs a third party's blessing to exist isn't a
foundation to build on, so MetaFlux runs its own custody bridge under the **same
validator-set trust assumption as the chain itself** — no external committee,
guardian network, or gatekeeper. (ADR-024.)

## Model

A custody **Bridge contract on the source chain** (Base first) holds deposited
tokens. MetaFlux validators observe deposits and credit the L1; withdrawals are
released by the contract on a ⅔ stake-weighted validator co-signature set behind a
dispute window.

### Deposit (source chain → MetaFlux)

```
Base:
  1. user.approve(USDC, bridge)
  2. bridge.deposit(mtfDest, amount)        // USDC pulled into custody
  3. bridge emits Deposit{user, mtfDest, amount, nonce, …}

MetaFlux:
  4. each validator observes the Deposit event and submits an mbAttest
     (an Inbound MetaBridgeMsg partial co-signature) — validator authority,
     NEVER the public /exchange path
  5. on ⅔ stake-weighted quorum the L1 credits the user's USDC cross-collateral
     (the same system-credit primitive the faucet uses); each deposit credits
     EXACTLY ONCE (idempotent by message id)
```

The `Deposit` event is byte-compatible with the L1 deterministic `message_id`:
`keccak256(chain ‖ direction ‖ user ‖ asset ‖ amount ‖ dst ‖ nonce)`.

### Withdraw (MetaFlux → source chain)

```
MetaFlux:
  1. user submits a withdraw action (Outbound MetaBridgeMsg)
  2. validators co-sign it to ⅔ quorum; the L1 retains the signature set in
     meta_bridge.mb_outbox + finalized_cosignatures

Base (two-phase: request → claim):
  3. each validator's RELAY LOOP polls the committed L1 state and submits a
     batchWithdraw(...) tx — signed with the validator's OWN key, gas paid by the
     validator's EVM address (no separate relayer key). The contract recovers
     each entry's signers, sums HOT-set stake, requires ≥⅔, and QUEUES it into
     the dispute window. A bad/raced entry in the batch is skipped (FailedWithdrawal
     event), not reverted.
  4. after BOTH the dispute window (seconds) AND a minimum block count elapse,
     claim(id) / batchClaim(ids) releases USDC to the user. Any single validator
     can dispute(id) a queued withdrawal, or the COLD ⅔-quorum can
     invalidateWithdrawal(id), as an emergency revoke during the window.
```

## Security model

- **Authority** — ⅔ stake-weighted MetaFlux validator multisig (secp256k1, the same
  keys that secure consensus; quorum `6700` bps). The validator multisig + the
  withdrawal dispute window are load-bearing: bridge-key compromise = fund loss, so
  the contracts get the consensus/signing review tier and a pre-mainnet audit.
- **Replay** — each `message_id` is honored once, keyed on the chain/source-nonce
  economic identity so a credit lands exactly once even across a validator-set
  rotation; enforced on both the L1 and the contract (`withdrawalSeen` / a permanent
  Solana spent-marker). Signatures are domain- and epoch-bound, so a cosignature
  can't be replayed across a different deployment, chain, or validator-set epoch.
- **Governance & rotation** — no admin account; every privileged op is
  validator-cosigned. Validator-set rotation is two-phase (request → finalize behind
  a dispute window); during that window any **single** hot validator can `pause`
  (bounded by a per-validator cooldown) or **cancel** the pending rotation outright,
  so a compromised governance quorum cannot silently swap the set. On Solana the same
  set carries a single-validator `pause`/`dispute` and a quorum `unpause` /
  `invalidateWithdrawal` emergency surface.
- **Off `/exchange`** — deposit credits inject via the validator system path and are
  structurally unreachable from the public user `/exchange` surface, tallied over the
  active validator set only.
- **Custody caveat** — USDC on MetaFlux is a bridged claim backed by the source
  contract's balance, not Circle-canonical on MetaFlux (same as the HL model).

## Deployments

| Network | Contract | Address |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` (v3) | [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af) |
| Solana **devnet** | `metabridge-solana` | [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet) |
| Base / Solana mainnet | — | (pre-audit) |

Custodies Circle's Base Sepolia USDC (`0x036CbD…f3dCF7e`); **⅔ stake-weighted
validator set, no admin** (all privileged ops are validator-cosigned), 300 s +
150-block dual dispute window. Domain-separated + epoch-bound signatures.
Contracts + deploy runbook live in the
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts)
repo; the L1-side co-signature / credit logic stays on the node. Pre-audit testnet —
not for value-bearing use.

## Contract methods

### Base — `MetaBridgeUSDC` (EVM)

| Method | Authorization | Purpose |
|--------|---------------|---------|
| `deposit(mtfDest, amount)` | anyone (depositor) | Pull USDC into custody, emit `Deposit` for validators to attest |
| `withdraw(...)` / `batchWithdraw(reqs)` | anyone relaying a **HOT ⅔** co-signature set | Verify quorum + queue the withdrawal(s) into the dispute window |
| `claim(mid)` / `batchClaim(mids)` | anyone | Release matured USDC after the dual time + block window (not pausable) |
| `dispute(mid)` | any single **HOT** validator | Cancel a queued withdrawal inside its dispute window |
| `cancelValidatorSetUpdate()` | any single **HOT** validator | Veto a pending validator-set rotation inside its window |
| `pause()` | any single **HOT** validator | Freeze new deposits + withdrawal-queueing (per-validator cooldown) |
| `unpause(...)` | **COLD ⅔** | Lift the pause |
| `invalidateWithdrawal(mid, ...)` | **COLD ⅔** | Revoke a queued, unclaimed fraudulent withdrawal |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **COLD ⅔** | File a two-phase hot+cold validator-set rotation |
| `finalizeValidatorSetUpdate()` | anyone (permissionless) | Apply the filed rotation after its dispute window |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **COLD ⅔** | Adjust the dispute window (bounded min/max) |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | Reproduce the exact bytes a validator co-signs |
| `hot*/cold*` getters | view | Validator stake, members, count, total, quorum bps / needed |

All co-signed calls take `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)` ordered by ascending signer, low-S, `v ∈ {27,28}`.

### Solana — `metabridge-solana`

| Instruction | Authorization | Purpose |
|-------------|---------------|---------|
| `initialize(params)` | deployer (one-time) | Pin the USDC mint, validator set, quorum, dual dispute window |
| `deposit(mtf_dest, amount)` | depositor (signer) | Pull SPL USDC into custody, emit `DepositEvent` |
| `withdraw(mid, user, amount, dst, nonce, cosigs)` | anyone relaying a **⅔** co-signature set | Verify quorum + create the `PendingWithdrawal` PDA (+ permanent spent marker) |
| `claim(message_id)` | anyone | Release custody USDC after the dual time + slot window |
| `dispute(mid, cosig)` | any single validator (1 co-sig) | Cancel a queued withdrawal inside its window |
| `pause(cosig)` | any single validator (1 co-sig) | Freeze deposit / withdraw / rotation-finalize |
| `unpause(gov_nonce, cosigs)` | **⅔** co-signature | Lift the pause |
| `invalidate_withdrawal(mid, gov_nonce, cosigs)` | **⅔** co-signature | Revoke a queued withdrawal |
| `request_validator_set_update(...)` | **⅔** co-signature | File a validator-set rotation |
| `finalize_validator_set_update()` | anyone (permissionless) | Apply the filed rotation after its window |

Solana uses ONE validator set (no hot/cold split) and has no `setDisputeWindow` / batch entrypoints; the recovery-id is the raw secp256k1 `{0,1}` (vs EVM `{27,28}`). Both chains reject high-S signatures and bind the program/contract id + epoch into every co-signed digest.

## Roadmap

- Real Base deposit-watcher + withdrawal relayer (the deterministic L1 core +
  the Base contract are done; the off-chain observers are wired and use the
  chain's `finalized` block tag to guard against reorgs).
- Multi-chain rollout: Solana custody program is live on devnet under the same
  model; Arbitrum is next.
- Security audit before any value-bearing (mainnet) deployment.
- Cross-chain composability (calling other-chain contracts from MTF) — V2.

## See also

- [Networks](../networks.md) — per-network endpoints + chain IDs
- ADR-024 (custody bridge, drop CCTP) + ADR-021 (MetaBridge co-signature core) in the node repo
