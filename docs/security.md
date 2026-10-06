# Security model

:::tip
Status: stable.
:::

This page states what the protocol guarantees, what it does not guarantee, and where you carry the risk.

## Summary {#tldr}

- The protocol guarantees deterministic state-machine semantics, signature-bound authorization and on-chain auditability of every action.
- The protocol does not guarantee oracle correctness beyond the published composition. It does not guarantee your private-key storage. It does not remove governance risk.
- Bug bounties run on third-party platforms. Report vulnerabilities by coordinated disclosure.

## Trust surface {#trust-surface}

### What the protocol owns {#what-the-protocol-owns}

| Layer | Protocol guarantee |
|-------|--------------------|
| Consensus | M-of-N validator agreement, deterministic state transitions, signed blocks |
| State machine | Identical execution across validators, deterministic time, integer-only arithmetic |
| Signature recovery | EIP-712 typed data, secp256k1 recovery, agent-approval map |
| Mark price | Composition formula + sanity band as documented in [mark prices](./concepts/mark-prices.md) |
| Liquidation | Tiered ladder fires deterministically against committed state |
| Fee math | Tier table + burn ratio applied identically per fill |

A node that does not follow these rules is not a valid validator. Consensus rejects it.

### What the user owns {#what-the-user-owns}

| Layer | User responsibility |
|-------|--------------------|
| Private-key storage | Cold storage for the master key, hot storage for agent keys, key rotation |
| Off-chain bot logic | What orders to place, when to add margin, when to unwind |
| Risk management | Position sizing relative to bucket / equity |
| Bridge counterparty risk | Choice of source-chain wallet and bridge route |

### Where trust is shared {#where-trust-is-shared}

| Layer | Trust assumption |
|-------|------------------|
| Oracle composition | Trust the validator-published oracle within the documented composition |
| MetaBridge | Trust the ⅔ stake-weighted co-signature of the MetaFlux validator set on all bridge transfers, USDC included. A withdrawal dispute window applies. The co-signing keys are the consensus keys, and no third-party attestation service takes part. See [bridge](./bridge/) |
| Governance | Governance controls parameter changes. You trust governance to act in the interest of the protocol |

The protocol minimizes trust but does not remove it. Where shared trust is unavoidable, such as oracles and attestation services, the trust surface is documented and bounded.

## Threat model {#threat-model}

### Out of scope for the protocol {#out-of-scope-for-the-protocol}

- A user signs an order they regret.
- A thief steals a hot key of the user and signs trades. This is why agents have no withdrawal authority.
- A user fails to add margin and gets liquidated under the documented tiered ladder.
- A user accepts an RFQ quote at a bad price.
- A user deposits into a vault that loses money.
- A governance-set parameter changes within its bounds and affects a user's position.

These are not security issues. They are operational risks that users carry.

### In scope (report these) {#in-scope-report-these}

- Signature forgery, or acceptance of an invalid signature.
- Non-deterministic state-machine execution: two validators disagree on committed state.
- Replay of a valid signature across networks (a bypass of `chainId` domain isolation).
- Privilege escalation: an agent gains withdrawal authority, or a non-master triggers a master-only action.
- Loss of funds outside the documented liquidation, ADL and fee mechanics.
- Bridge integration flaws: MetaBridge cosignature or ⅔-quorum verification, message-id replay, dispute-window bypass.
- WS auth bypass: a subscription to a private channel without auth.
- DoS that stops valid actions from admission at the documented rate limits.
- A documented invariant that does not hold, such as a bypass of nonce monotonicity.

## Disclosure policy {#disclosure-policy}

To report a security vulnerability:

1. Do not open a public GitHub issue.
2. Email `security@mtf.exchange` (the PGP key is on the website before launch) with:
   - A description of the vulnerability.
   - Reproduction steps.
   - Your assessment of the impact.
   - Your contact for follow-up.
3. Expect a response within 48 hours that acknowledges receipt.
4. The coordinated disclosure timeline is 90 days from acknowledgement, or earlier if the fix is patched and deployed.

A bug-bounty program with tiered rewards runs on a third-party platform. The details are published before launch.

## On-chain auditability {#on-chain-auditability}

Every action is permanently on-chain. Forensic tooling can reconstruct:

- The full action history per address: signer, action_hash and commit block.
- The full liquidation history: account, tier, mark and realized loss.
- The agent-approval lifecycle: master, agent, and the approve, expire and re-approve events.
- The vault NAV trajectory and depositor table.

Explorers show this data. Indexers provide it in queryable form.

## Deterministic execution {#deterministic-execution}

The state machine is a pure function:

```
state_{t+1} = apply(state_t, ordered_actions_in_block)
```

A validator that disagrees on `state_{t+1}` is non-conformant. The consensus path prohibits sources of non-determinism: floating point, unordered map iteration and system time. Audits target this property.

A bot can compute a future state value, such as the expected PM margin after an order. With the same inputs, it gets the same result as the chain. The wire spec has everything you need.

## Operational security recommendations {#operational-security-recommendations}

These recommendations apply to institutional and production users:

| Recommendation | Why |
|----------------|-----|
| Multi-sig the master account | One compromised key is a single point of failure |
| One agent per host / strategy | A compromise stays bounded |
| Tight agent expiries (≤ 30 d) | Forces a rotation cadence |
| HSM or hardware wallet for the master and the sub-account master | Cold-storage signing surface |
| Rate-limit the outbound calls of your own bot | Stops a runaway loop from using the per-account budget |
| Maintain a separate risk-watcher agent | Margin top-ups do not depend on trading logic |
| Run dual nodes for WS feeds | Resilience in latency and reconnects |
| Subscribe to status alerts | Operator-side incidents affect your latency and availability |
| Audit your reconciliation of action_hash to commit | Catches silent drops |
| Test breaking-change migrations on testnet 60 days ahead | Avoids surprises on mainnet day |

## Verifying release binaries {#verifying-release-binaries}

Node release binaries are published with a detached GPG signature (`.asc`) produced by an offline release root key. Before you run a downloaded `mtf-node`, verify it against that key:

```sh
# one-time: import the release root public key
curl -fsSL https://binaries.mtf.exchange/testnet/pub_key.asc | gpg --import

# verify the binary against its detached signature
gpg --verify mtf-node.asc mtf-node
```

The signing key fingerprint is `5AF6597573B2E475B0C646BAD8E6D0B3D187F583`; confirm `gpg` reports it as the signer.

:::info
The node supervisor pins this same root key and refuses to stage or activate any binary whose `.asc` does not verify against it, so the network only ever upgrades to signed builds.
:::

## Consensus halts {#what-if-the-chain-goes-wrong}

A consensus halt is rare but possible. A partition that prevents quorum is one cause. During a halt:

- `/info` continues to serve from the last committed state.
- `/exchange` rejects with `503 chain_unavailable`.
- WS keep-alive continues. No new pushes arrive until the chain resumes.
- Liquidations halt. The mark stays at the last value, and no tier transitions happen during the halt.

On resume, the chain replays from the last committed block. No state is lost. Time advances by consensus-derived block time, not wall clock. Funding payments queue and execute on resume.

If a node sees a consensus halt, switch to another node or gateway. The validator set is distributed. The protocol assumes that at least 2/3 of validators are honest and online. Transient halts that stay below that threshold are expected.

## See also {#see-also}

- [Bridge](./bridge/): the MetaBridge custody trust surface.
- [Versioning](./versioning.md): the change policy.
- [Networks](./networks.md): operational endpoints.
- [Multi-sig](./concepts/multi-sig.md): institutional custody.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Is the consensus formally verified?**
A: The consensus model is formally specified. Formal verification (TLA+ and Stateright) covers the safety and liveness invariants. Audits check the production implementation against the spec.

**Q: Are oracles slashable?**
A: The validator set signs oracle data. A validator that publishes demonstrably wrong oracle data, repeatedly outside the sanity bands, is slashable under the [staking](./concepts/staking.md) rules.

**Q: What's the worst-case loss for a user given a known protocol bug?**
A: It depends on the bug. The architecture caps the damage with sub-account isolation, agent withdrawal blocking, per-corridor bridge caps and the insurance pool. A deep state-machine bug could still drain accounts. This is why disclosure matters and audits are continuous.

**Q: Can the protocol roll back state?**
A: Not unilaterally. A rollback needs a coordinated decision of the validator set, and the chain treats it as a hard fork. The standard policy is to never roll back for the losses of one user. A rollback is only for protocol-wide bugs that compromise consensus correctness. Governance sets the exact threshold.

</details>
