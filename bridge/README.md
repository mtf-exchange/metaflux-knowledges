# Bridge

{% hint style="info" %}
**Status.** MetaBridge USDC custody bridge **live on Base Sepolia** (testnet,
`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)).
Both directions implemented end-to-end on the L1 side: deposit (watcher → cosign →
auto-registered cosigner → ⅔-quorum credit) and withdraw (L1 cosign → relay loop →
on-chain `batchWithdraw`). v3 hardenings: gas-amortized `batchWithdraw`/`batchClaim`,
partial-success batches, a dual time+block dispute window, hot/cold validator key
separation, and two-phase validator rotation. Multi-chain (Arbitrum/Solana) rollout
+ a pre-mainnet audit remain. Governed by ADR-024 (supersedes the CCTP-hybrid plan).
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

The `Deposit` event is byte-compatible with the L1 deterministic `message_id`
(`crates/bridge/meta_bridge.rs`): `keccak256(chain ‖ direction ‖ user ‖ asset ‖
amount ‖ dst ‖ nonce)`.

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
- **Replay** — each `message_id` is honored once, on both the L1 (finalized set) and
  the contract (`withdrawalSeen`).
- **Off `/exchange`** — deposit credits inject via the validator system path and are
  structurally unreachable from the public user `/exchange` surface.
- **Custody caveat** — USDC on MetaFlux is a bridged claim backed by the Base
  contract's balance, not Circle-canonical on MetaFlux (same as the HL model).

## Deployments

| Network | Contract | Address |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` | [`0x95e36Ef0442c02293d9553Fb77b15f23f2101473`](https://sepolia.basescan.org/address/0x95e36Ef0442c02293d9553Fb77b15f23f2101473) |
| Base mainnet | — | (pre-audit) |

Custodies Circle's Base Sepolia USDC (`0x036CbD…f3dCF7e`); **5-validator ⅔ set, no
admin** (all privileged ops are validator-cosigned), 300 s dispute window. Hardened
after two independent security audits — domain-separated + epoch-bound signatures.
Contracts + deploy runbook live in the
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts)
repo; the L1-side co-signature / credit logic stays on the node. Pre-audit testnet —
not for value-bearing use.

## Roadmap

- Real Base deposit-watcher + withdrawal relayer (the deterministic L1 core +
  the Base contract are done; the off-chain observers are being wired).
- Multi-chain rollout: Arbitrum + Solana custody contracts under the same model.
- Security audit before any value-bearing (mainnet) deployment.
- Cross-chain composability (calling other-chain contracts from MTF) — V2.

## See also

- [Networks](../networks.md) — per-network endpoints + chain IDs
- ADR-024 (custody bridge, drop CCTP) + ADR-021 (MetaBridge co-signature core) in the node repo
