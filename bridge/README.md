# Bridge

{% hint style="info" %}
**Status.** **CCTP preview**, **MetaBridge in design** (ADR-021).
{% endhint %}

MetaFlux runs a **hybrid bridge model**:

- **USDC** — Circle CCTP (Cross-Chain Transfer Protocol). Native, Circle-attested, no extra trust assumption beyond Circle itself.
- **All other assets** — **MetaBridge**, a MetaFlux validator-signed bridge across Solana, Base, and Arbitrum (ADR-021). Inbound transfers are admitted on an M-of-N validator signature over the source-chain event; no third-party bridge sits on the critical path.

The hybrid reduces blast radius: USDC is the dominant asset by volume and gets the cleanest path; everything else rides MetaBridge under the same validator-set trust assumption as the chain itself, rather than an external bridge whose failure would compromise the long tail.

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

## MetaBridge (non-USDC assets)

MetaBridge is a MetaFlux-operated, validator-signed bridge for all non-USDC assets (ADR-021). It carries no third-party bridge on the critical path:

- **Validation model** — M-of-N MetaFlux validator signatures over the source-chain deposit event; the same validator set that secures consensus. No external committee, guardian network, or optimistic challenge window.
- **Supported chains** — Solana, Base, Arbitrum at launch. Each chain runs a MetaBridge lock/mint contract whose authority is the validator set's threshold key.
- **Trust assumption** — equal to the chain's own consensus trust assumption, not an additional external bridge.

The detailed design is in ADR-021; this page is updated as MetaBridge ships per network.

## Out of scope for V1

- Cross-chain composability (calling EVM contracts on other chains from MTF) — V2.
- MetaBridge support beyond Solana / Base / Arbitrum — added per-chain as governance approves.

## See also

- Concepts: USDC vs other-asset accounting — *coming*
