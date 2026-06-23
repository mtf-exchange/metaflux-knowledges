# Security model

:::tip
**Stable.**
:::

What the protocol guarantees, what it doesn't, and where you carry the risk.

## TL;DR

- The protocol guarantees: deterministic state-machine semantics, signature-bound authorisation, on-chain auditability of every action.
- The protocol does NOT guarantee: oracle correctness beyond the published composition, your private-key storage, or absence of governance risk.
- Bug bounties run on third-party platforms; coordinated disclosure expected.

## Trust surface

### What the protocol owns

| Layer | Protocol guarantee |
|-------|--------------------|
| Consensus | M-of-N validator agreement; deterministic state transitions; signed blocks |
| State machine | Identical execution across validators; deterministic time; integer-only arithmetic |
| Signature recovery | EIP-712 over msgpack; secp256k1 recovery; agent-approval map |
| Mark price | Composition formula + sanity band as documented in [mark prices](./concepts/mark-prices.md) |
| Liquidation | Tiered ladder fires deterministically against committed state |
| Fee math | Tier table + burn ratio applied identically per fill |

A node not following these rules is not a valid validator; consensus rejects it.

### What the user owns

| Layer | User responsibility |
|-------|--------------------|
| Private-key storage | Cold storage for master; hot storage for agents; rotation hygiene |
| Off-chain bot logic | What orders to place, when to top up, when to unwind |
| Risk management | Position sizing relative to bucket / equity |
| Bridge counterparty risk | Choice of source-chain wallet & bridge route |

### Where trust is shared

| Layer | Trust assumption |
|-------|------------------|
| Oracle composition | Trust the validator-published oracle within the documented composition |
| MetaBridge | Trust the MetaFlux validator set's ⅔ stake-weighted co-signature on ALL bridge transfers — USDC included — behind a withdrawal dispute window (same keys as consensus; no third-party attestation service; see [bridge](./bridge/)) |
| Governance | Parameter changes are governance-controlled; trust governance to act in the protocol's interest |

The principle: trust is minimised, not eliminated. Where shared trust is unavoidable (oracles, attestation services), the trust surface is documented and bounded.

## Threat model

### Out of scope for the protocol

- A user signs an order they regret.
- A user's hot key is stolen and the thief signs trades (this is why agents have no withdrawal authority).
- A user fails to top up margin and gets liquidated under the documented tiered ladder.
- A user accepts an RFQ quote at a bad price.
- A user deposits into a vault that loses money.
- A governance-set parameter changes within its bounds and affects a user's position.

These are not security issues. They are operational risk users carry.

### In scope (report these)

- Signature forgery / acceptance of invalid signatures.
- Non-deterministic state-machine execution (two validators disagree on committed state).
- Replay of valid signatures across networks (chainId domain isolation bypass).
- Privilege escalation (agent gains withdrawal authority; non-master triggers master-only action).
- Loss of funds outside the documented liquidation / ADL / fee mechanics.
- Bridge integration flaws (MetaBridge cosignature / ⅔-quorum verification, message-id replay, dispute-window bypass).
- WS auth bypass (subscribe to private channels without auth).
- DoS that prevents valid actions from being admitted at documented rate limits.
- Documented invariants that don't hold (e.g. nonce monotonicity bypass).

## Disclosure policy

For security vulnerabilities:

1. **Do not** open a public GitHub issue.
2. Email `security@mtf.exchange` (PGP key on the website pre-launch) with:
   - A description of the vulnerability
   - Reproduction steps
   - Your assessment of impact
   - Your contact for follow-up
3. Expect a response within 48 hours acknowledging receipt.
4. Coordinated disclosure timeline: 90 days from acknowledgement, or earlier if patched + deployed.

A bug-bounty program with tiered rewards runs on a third-party platform; details published pre-launch.

## On-chain auditability

Every action is permanently on-chain. Forensic tooling can reconstruct:

- The full action history per address (signer, action_hash, commit block).
- The full liquidation history (account, tier, mark, realised loss).
- The agent-approval lifecycle (master, agent, approve / expire / re-approve events).
- The vault NAV trajectory and depositor table.

Explorers expose these; indexers ship the data in queryable form.

## Deterministic execution

The state machine is a pure function:

```
state_{t+1} = apply(state_t, ordered_actions_in_block)
```

Validators that disagree on `state_{t+1}` are non-conformant. Sources of non-determinism (floating-point, unordered map iteration, system time) are prohibited in the consensus path. Audits target this property explicitly.

If your bot computes a future state value (e.g. expected PM margin after an order), it can compute it identically to what the chain would compute, given the same inputs. The wire spec captures everything you need.

## Operational security recommendations

For institutional / production users:

| Recommendation | Why |
|----------------|-----|
| Multi-sig the master account | Single-key compromise = single-point failure |
| One agent per host / strategy | Compromise blast radius is bounded |
| Tight agent expiries (≤ 30 d) | Forced rotation cadence |
| HSM / hardware wallet for master & sub-account master | Cold-storage signing surface |
| Rate-limit your own bot's outbound | Prevent runaway loops from exhausting per-account budget |
| Maintain a separate risk-watcher agent | Margin top-ups independent of trading logic |
| Run dual nodes for WS feeds | Latency / reconnect resilience |
| Subscribe to status alerts | Operator-side incidents affect your latency / availability |
| Audit your action_hash → commit reconciliation | Catch silent drops |
| Test breaking-change migrations against testnet 60 days ahead | Avoid mainnet-day surprises |

## What if the chain goes wrong

Consensus halts (e.g. partition that prevents quorum) are operationally rare but possible. During a halt:

- `/info` continues to serve from the last committed state.
- `/exchange` rejects with `503 chain_unavailable`.
- WS keep-alive; no new pushes until resume.
- Liquidations halt — mark stays at the last value; no tier transitions during halt.

Upon resume, the chain replays from the last committed block. No state is lost. Time advances based on consensus-derived block time, not wall clock; funding payments queue and execute on resume.

If a node sees consensus halt, switch to another node / gateway (the validator set is distributed). The protocol's design assumes ≥ 2/3 of validators are honest and online; transient halts < that threshold's outage are expected.

## See also

- [Bridge](./bridge/) — MetaBridge custody trust surface
- [Versioning](./versioning.md) — change policy
- [Networks](./networks.md) — operational endpoints
- [Multi-sig](./concepts/multi-sig.md) — institutional custody

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Is the consensus formally verified?**
A: The consensus model is formally specified; formal verification (TLA+ / Stateright) covers safety + liveness invariants. The production implementation is audited against the spec.

**Q: Are oracles slashable?**
A: Oracle data is signed by the validator set. A validator publishing demonstrably-wrong oracle data (outside sanity bands repeatedly) is slashable under the [staking](./concepts/staking.md) rules.

**Q: What's the worst-case loss for a user given a known protocol bug?**
A: Depends on the bug. The architecture caps blast radius — sub-account isolation, agent withdrawal-blocking, per-corridor bridge caps, insurance pool — but a deep state-machine bug could in principle drain accounts. This is why disclosure matters and audits are continuous.

**Q: Can the protocol roll back state?**
A: Not unilaterally. A rollback requires a coordinated validator-set decision and is treated as a hard fork. The standard policy: never rollback for individual user losses; rollback only for protocol-wide bugs that compromise consensus correctness. The exact threshold is governance.

</details>
