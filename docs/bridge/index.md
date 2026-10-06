# Bridge

MetaBridge is the custody bridge that moves every asset, USDC included, between MetaFlux and
Base or Arbitrum.

:::danger Bring-up is not complete
Do not deposit or withdraw until this notice is gone.

The current testnet chain started on 2026-09-01. Bring-up on it is part done, so the state
differs per chain:

- Base Sepolia and Arbitrum Sepolia each have a new contract, and the chain is configured for
  both. Both contracts are paused: `paused()` returns `true` on 2026-09-26, so a `deposit` call
  reverts. Withdrawals are halted, so value that goes in cannot come out yet. Do not send a
  plain USDC transfer to either address.
- Every address published before 2026-09-17 is paused and holds nothing. A transfer to one of
  those addresses cannot be credited and cannot be recovered.

Read the address from the table below for each deposit. Do not cache it. Do not reuse an
address from an older integration or an older copy of this page.
:::

:::info Status
The custody bridge is deployed on two testnets:

- Base Sepolia: `Bridge` [`0x655ab51b607cb0ef94af69525e3c98e28a8af6ad`](https://sepolia.basescan.org/address/0x655ab51b607cb0ef94af69525e3c98e28a8af6ad)
- Arbitrum Sepolia: `Bridge` [`0x3f1f93c8ce4b7285f9923de9783f29625b84a9d2`](https://sepolia.arbiscan.io/address/0x3f1f93c8ce4b7285f9923de9783f29625b84a9d2)

Base and Arbitrum are the supported chains. Both directions are verified end to end on Base
Sepolia:

- A real deposit: watcher, cosign, auto-registered cosigner, then a ⅔-quorum credit.
- A full withdrawal round trip: L1 cosign, relay loop, `batchWithdraw` on the source chain,
  dispute window, then `claim`.

The contracts have these hardenings:

- Gas-amortized `batchWithdraw` and `batchClaim`.
- Batches that can succeed in part.
- A dual dispute window, bounded by time and by block count.
- Separate hot and cold validator keys.
- Two-phase validator rotation. During the window, a single hot validator can veto it with
  **cancel**.
- Signatures bound to the domain and the epoch. The EVM contract and the L1 encode them byte for
  byte the same, and cross-language known-answer vectors check this.

A pre-mainnet audit remains before mainnet.
:::

MetaFlux bridges all assets, USDC included, through MetaBridge. MetaBridge is a custody bridge
that MetaFlux validators sign for. It is the MetaFlux equivalent of the Hyperliquid Bridge2. No
third-party bridge and no Circle CCTP dependency is on the critical path.

## Custody instead of CCTP {#why-custody-not-cctp}

CCTP moves USDC only between chains that Circle enrolls as CCTP *domains*. MetaFlux is an
independent L1. Enrollment as a CCTP domain is a Circle business decision that MetaFlux does not
control. A deposit path that needs a third party's approval to exist is not a base to build on.
MetaFlux therefore runs its own custody bridge. The bridge uses the same validator-set trust
assumption as the chain itself. It has no external committee, guardian network or gatekeeper.

## Model {#model}

A custody Bridge contract on the source chain holds deposited tokens. Base is the first source
chain. MetaFlux validators observe deposits and credit the L1. For a withdrawal, the contract
releases tokens on a ⅔ stake-weighted validator co-signature set, after a dispute window.

### Deposit from a source chain {#deposit-source-chain--metaflux}

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

:::danger Use `deposit`. A raw transfer credits the sender, so use it from self-custody only
The recommended deposit is the contract call `deposit(mtfDest, amount)`. It credits the
MetaFlux address you pass as `mtfDest`, so it works from any wallet, an exchange withdrawal
included.

On EVM chains (Base), the bridge also credits a plain USDC `transfer` to the custody address.
It credits the sender's own address. The watcher indexes the `Transfer(→ custody)` log, and a
bare transfer carries no `mtfDest`. This is safe only from a self-custody wallet whose address
you also control on MetaFlux. A transfer from an exchange (Coinbase, Binance and others) or from
a contract wallet credits that sending address. You do not control that address on MetaFlux, so
the funds are unrecoverable. If you are not sure, use `deposit(mtfDest, amount)`.
:::

**MetaFlux destination (`mtfDest`).** Both contracts expose
`deposit(bytes32 mtfDest, uint128 amount)` (selector `0x56d2e1ea`). Call it after
`USDC.approve(bridge, amount)`.

- `mtfDest` is a `bytes32`. The contract credits its low 20 bytes. These bytes are your
  MetaFlux (L1) address, the same address you sign and trade with. Left-pad the address with 12
  zero bytes: `bytes32(uint256(uint160(addr)))`. For `0xAbC…123`, the value is
  `0x000000000000000000000000abc…123`.
- The contract rejects an `mtfDest` of zero, and an `mtfDest` whose low 20 bytes are zero.

`amount` is a `uint128` in USDC base units. USDC has 6 decimals on every source chain, so
100 USDC is `100_000000`. The `Deposit` event reports the amount that the contract received. The
custody contract address for each chain is in the [Deployments](#deployments) table below.

**Credit timing.** Validators attest only finalized source-chain deposits. The watchers gate on
the chain's `finalized` tag, so a reorg cannot mint unbacked L1 balance. The source chain
finalizes your deposit. Then the validator set reaches ⅔ stake-weighted attestation. Then the L1
credits `mtfDest` exactly once, idempotent by `message_id`. The L1 never credits a deposit twice,
also across a validator-set rotation.

### Withdrawal to a source chain {#withdraw-metaflux--source-chain}

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

- **Authority.** A ⅔ stake-weighted MetaFlux validator multisig signs. It uses secp256k1 and the
  same keys that secure consensus. The quorum is `6700` bps. The validator multisig and the
  withdrawal dispute window are load-bearing: a bridge-key compromise is a fund loss. The
  contracts therefore get the consensus and signing review tier, and a pre-mainnet audit.
- **Replay.** Each `message_id` is honored once. The key is the chain and source-nonce economic
  identity, so a credit lands exactly once, also across a validator-set rotation. Both the L1
  and the contract (`withdrawalSeen`) enforce this. Signatures are bound to the domain and the
  epoch, so a cosignature cannot be replayed on a different deployment, chain or validator-set
  epoch.
- **Governance and rotation.** The contracts have no admin account. Validators cosign every
  privileged operation. Validator-set rotation has two phases: a request, then a finalize after
  a dispute window. During that window, any single hot validator can `pause` the contract or
  cancel the pending rotation. A per-validator cooldown bounds `pause`. A compromised governance
  quorum therefore cannot swap the set without notice.
- **Off `/exchange`.** Deposit credits enter through the validator system path. The public user
  `/exchange` surface cannot reach them by construction. The L1 tallies them over the active
  validator set only.
- **Custody caveat.** USDC on MetaFlux is a bridged claim backed by the source contract's
  balance. It is not Circle-canonical USDC on MetaFlux. Hyperliquid uses the same model.

## Deployments {#deployments}

| Network | Contract | Address |
|---------|----------|---------|
| Base **Sepolia** | `Bridge` | [`0x655ab51b607cb0ef94af69525e3c98e28a8af6ad`](https://sepolia.basescan.org/address/0x655ab51b607cb0ef94af69525e3c98e28a8af6ad) |
| Arbitrum **Sepolia** | `Bridge` | [`0x3f1f93c8ce4b7285f9923de9783f29625b84a9d2`](https://sepolia.arbiscan.io/address/0x3f1f93c8ce4b7285f9923de9783f29625b84a9d2) |
| Base / Arbitrum mainnet | — | (pre-audit) |

:::danger Use only the addresses above
Two earlier contracts are retired. Neither can pay out, and USDC sent to either one is
unrecoverable:

| Retired address | Retired on | State |
|---|---|---|
| `0x10f1A0F6153B8B77a355098E5F19C659A9a0965A` | 2026-09-17 | paused on both chains, custody drained to zero |
| `0xA6c914Cd59F8B3A8551B5f24b047d78542063a00` | 2026-08-16 | validator set cannot be changed, so every withdrawal reverts |

Read the address from this page for each deposit. Do not cache it. Do not reuse an address from
an older integration.

Each retired pair shared one address on the two chains. The deploy account created both
contracts as its first transaction on each chain. Treat that as a coincidence of those
deployments, and not as a rule. The current contracts have a different address on each chain.
:::

The contracts hold Circle's USDC: Base Sepolia `0x036CbD…f3dCF7e`, Arbitrum Sepolia
`0x75faf1…46AA4d`. Both contracts have these properties:

- A ⅔ stake-weighted validator set and no admin. Validators cosign all privileged operations.
- A dual dispute window of 300 s and 150 blocks.
- Domain-separated, epoch-bound signatures.

The contracts and the deploy runbook are in the
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts)
repository. The L1-side co-signature and credit logic stays on the node. These are pre-audit
testnet contracts. Do not use them for value.

## Contract methods {#contract-methods}

### Base `Bridge` (EVM) {#base--metabridgealpha-evm}

| Method | Authorization | Purpose |
|--------|---------------|---------|
| `deposit(bytes32 mtfDest, uint128 amount)` | anyone (depositor) | Pulls USDC into custody and emits `Deposit` for validators to attest |
| `withdraw(...)` / `batchWithdraw(reqs)` | anyone relaying a **HOT ⅔** co-signature set | Verifies the quorum and queues the withdrawals into the dispute window |
| `claim(mid)` / `batchClaim(mids)` | anyone | Releases matured USDC after the dual time and block window (not pausable) |
| `dispute(mid)` | any single **HOT** validator | Cancels a queued withdrawal inside its dispute window |
| `cancelValidatorSetUpdate()` | any single **HOT** validator | Vetoes a pending validator-set rotation inside its window |
| `pause()` | any single **HOT** validator | Freezes new deposits and withdrawal queueing (per-validator cooldown) |
| `unpause(...)` | **COLD ⅔** | Lifts the pause |
| `invalidateWithdrawal(mid, ...)` | **COLD ⅔** | Revokes a queued, unclaimed fraudulent withdrawal |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **COLD ⅔** | Files a two-phase hot and cold validator-set rotation |
| `finalizeValidatorSetUpdate()` | anyone (permissionless) | Applies the filed rotation after its dispute window |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **COLD ⅔** | Adjusts the dispute window (bounded min and max) |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | Reproduces the exact bytes a validator co-signs |
| `hot*/cold*` getters | view | Validator stake, members, count, total, quorum bps and quorum needed |

All co-signed calls take `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)`. Order the signatures
by ascending signer, use low-S, and use `v ∈ {27,28}`. The contract rejects high-S signatures. It
binds the contract id and the epoch into every co-signed digest.

## Roadmap {#roadmap}

- A real Base deposit watcher and withdrawal relayer. The deterministic L1 core and the Base
  contract are done. The off-chain observers are wired. They use the chain's `finalized` block
  tag to guard against reorgs.
- Multi-chain rollout. Arbitrum Sepolia runs under the same model, next to Base Sepolia.
- A security audit before any value-bearing (mainnet) deployment.
- Cross-chain composability, which lets a caller call other-chain contracts from MTF. Planned
  for V2.

## See also {#see-also}

- [Networks](../networks.md): endpoints and chain IDs per network
