# Bridge

> Status: **CCTP preview**, third-party bridges TBD.

MetaFlux deliberately picks a **hybrid bridge model** rather than building one in-house monolith:

- **USDC** — Circle CCTP (Cross-Chain Transfer Protocol). Native, Circle-attested, no extra trust assumption beyond Circle itself.
- **All other assets** — third-party general-purpose bridges (LayerZero / Across / Wormhole — selection TBD).

The hybrid reduces blast radius: USDC is the dominant asset by volume and gets the cleanest path; the long tail rides infrastructure whose security model already covers many other chains. We don't build a single critical-path bridge whose failure would compromise everything.

## CCTP (USDC)

Circle's official USDC bridge. The chain holds Circle's published attestation pubkey and verifies attestation signatures on inbound transfers; outbound transfers emit the standard burn event Circle's other-chain MessageTransmitter recognises.

Domain mapping (CCTP "domain" ≠ chain ID):

| Chain | CCTP domain | MetaFlux domain |
|-------|-------------|-----------------|
| Ethereum mainnet | 0 | — |
| Avalanche | 1 | — |
| OP mainnet | 2 | — |
| Arbitrum | 3 | — |
| Base | 6 | — |
| MetaFlux mainnet | TBD | — |
| MetaFlux testnet | TBD | (publicly assigned by Circle pre-mainnet) |

CCTP attestation pubkeys are network-specific. Sandbox and production use distinct keys. The on-chain verifier loads the appropriate key per environment.

### Deposit flow

```
EVM source chain (e.g. Arbitrum):
  1. user.approve(USDC, TokenMessenger)
  2. TokenMessenger.depositForBurn(amount, dst_domain=MTF, dst_recipient)
  3. Circle attests after ~13 finality blocks
  4. attestation served at iris-api(.sandbox).circle.com

MetaFlux side:
  5. anyone submits ReceiveMessage(message, attestation) action
  6. chain verifies attestation against the network's Circle pubkey
  7. on success, USDC is minted on MTF to `dst_recipient`
```

The same flow runs in reverse for withdrawals — MTF emits the burn event, Circle attests after MTF finality, the destination chain's MessageTransmitter accepts the attestation.

### Caps

Per-corridor runtime caps prevent any single direction from concentrating attestation risk. Caps are governance-controlled.

## Third-party bridges (TBD)

A single general-purpose bridge gets selected via a published ADR before mainnet. Candidates differ on:

- **Validation model** — committee-based (LayerZero), optimistic (Across), guardian network (Wormhole)
- **Latency** — minutes for committee/guardian; ≤30s optimistic challenge window
- **Asset support** — LayerZero is widest, Wormhole is broadest non-EVM, Across is EVM-only
- **Audit history** — all three have been audited multiple times; incident histories differ

The chosen bridge handles all non-USDC asset transfers. The selection ADR will be published here when finalised.

## Out of scope for V1

- An MTF-built general bridge (`MetaBridge`) — V2 post-mainnet. Will eventually replace the third-party route for assets where MTF can offer a tighter security model.
- Cross-chain composability (calling EVM contracts on other chains from MTF) — V2.

## See also

- [Concepts: USDC vs other-asset accounting](../concepts/balances.md) — coming
