# Bridge

:::info
**Status.** MetaBridge custody bridge **live on Base Sepolia** (testnet,
`MetaBridgeAlpha` [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00)),
and a Solana custody program live on **devnet** under the same model. Both
directions are verified end-to-end on Base Sepolia: a real deposit
(watcher → cosign → auto-registered cosigner → ⅔-quorum credit) and a full
withdrawal round-trip (L1 cosign → relay loop → on-chain `batchWithdraw` →
dispute window → `claim`). Hardenings: gas-amortized `batchWithdraw`/`batchClaim`,
partial-success batches, a dual time+block dispute window, hot/cold validator key
separation, two-phase validator rotation with a single-hot-validator **cancel**
veto during the window, and domain- + epoch-bound signatures pinned byte-for-byte
across the EVM contract, the Solana program, and the L1 (cross-language
known-answer vectors). A pre-mainnet audit remains before mainnet.
:::

MetaFlux bridges **all assets — including USDC — through MetaBridge**, a
MetaFlux-validator-signed custody bridge (HL-Bridge2 equivalent). There is **no
third-party bridge and no Circle CCTP dependency** on the critical path.

## Why custody, not CCTP {#why-custody-not-cctp}

CCTP only moves USDC between chains Circle has enrolled as CCTP *domains*. MetaFlux
is an independent L1; being added as a CCTP domain is a Circle business decision we
don't control. A deposit path that needs a third party's blessing to exist isn't a
foundation to build on, so MetaFlux runs its own custody bridge under the **same
validator-set trust assumption as the chain itself** — no external committee,
guardian network, or gatekeeper.

## Model {#model}

A custody **Bridge contract on the source chain** (Base first) holds deposited
tokens. MetaFlux validators observe deposits and credit the L1; withdrawals are
released by the contract on a ⅔ stake-weighted validator co-signature set behind a
dispute window.

### Deposit (source chain → MetaFlux) {#deposit-source-chain--metaflux}

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

:::danger `deposit` is the safe path — a raw transfer credits the SENDER (self-custody only)
The recommended way in is the contract's `deposit(mtfDest, amount)` call: it
credits the MetaFlux address you pass as `mtfDest`, so it works from **any**
wallet, including an exchange withdrawal.

On **EVM chains (Base)** a plain USDC `transfer` straight to the custody address
is now **also** credited — but to the **sender's own address** (the watcher
indexes the `Transfer(→ custody)` log; a bare transfer carries no `mtfDest`).
That is safe **only** from a self-custody wallet whose address you also control
on MetaFlux. A transfer sent from an **exchange (Coinbase, Binance, …) or a
contract wallet** credits THAT address — you do not control it on MetaFlux and
the funds are **unrecoverable**. When in doubt, use `deposit(mtfDest, amount)`.

**Solana** has no raw-transfer credit yet — bridge in only via the program's
`deposit`.
:::

**Encoding the MetaFlux destination (`mtfDest`).** `mtfDest` is your 20-byte
MetaFlux (L1) address — the same address you sign and trade with.

- **EVM (Base / Arbitrum)** — pass the 20-byte address directly:
  `deposit(address mtfDest, uint256 amount)`, after `USDC.approve(bridge, amount)`.
- **Solana** — the instruction takes a fixed 32-byte field, so left-pad the
  address: `mtf_dest = 12 zero bytes ‖ 20-byte address` (the low 20 bytes are the
  recipient). A zero recipient is rejected on-chain, so a mis-padded destination
  fails fast rather than crediting the wrong account.

`amount` is in USDC base units — **6 decimals** on every source chain (100 USDC =
`100_000000`). The custody contract / program address for each chain is in the
[Deployments](#deployments) table below.

**When the credit lands.** Only **finalized** source-chain deposits are attested
(the watchers gate on the chain's `finalized` tag, so a reorg cannot mint
unbacked L1 balance). After the source chain finalizes your deposit and the
validator set reaches ⅔ stake-weighted attestation, the L1 credits `mtfDest`
**exactly once** (idempotent by `message_id`). A given deposit is never
double-credited, even across a validator-set rotation.

### Withdraw (MetaFlux → source chain) {#withdraw-metaflux--source-chain}

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

## Security model {#security-model}

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

## Deployments {#deployments}

| Network | Contract | Address |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeAlpha` | [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00) |
| Arbitrum **Sepolia** | `MetaBridgeAlpha` | [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.arbiscan.io/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00) |
| Solana **devnet** | `metabridge-solana` | [`8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi`](https://solscan.io/account/8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi?cluster=devnet) |
| Base / Arbitrum / Solana mainnet | — | (pre-audit) |

Custodies Circle's Base Sepolia USDC (`0x036CbD…f3dCF7e`); **⅔ stake-weighted
validator set, no admin** (all privileged ops are validator-cosigned), 300 s +
150-block dual dispute window. Domain-separated + epoch-bound signatures.
Contracts + deploy runbook live in the
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts)
repo; the L1-side co-signature / credit logic stays on the node. Pre-audit testnet —
not for value-bearing use.

## Contract methods {#contract-methods}

### Base — `MetaBridgeAlpha` (EVM) {#base--metabridgealpha-evm}

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

### Solana — `metabridge-solana` {#solana--metabridge-solana}

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

## Roadmap {#roadmap}

- Real Base deposit-watcher + withdrawal relayer (the deterministic L1 core +
  the Base contract are done; the off-chain observers are wired and use the
  chain's `finalized` block tag to guard against reorgs).
- Multi-chain rollout: Solana custody program (devnet) and Arbitrum Sepolia are
  live under the same model, alongside Base Sepolia.
- Security audit before any value-bearing (mainnet) deployment.
- Cross-chain composability (calling other-chain contracts from MTF) — V2.

## See also {#see-also}

- [Networks](../networks.md) — per-network endpoints + chain IDs
