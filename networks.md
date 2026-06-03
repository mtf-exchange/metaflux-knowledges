# Networks

{% hint style="info" %}
**Status.** **devnet stable**. Testnet (`chainId 114514`) and mainnet (`chainId 8964`) chainIds are assigned; their endpoints are published pre-launch.
{% endhint %}

## Summary

| Network | Status | `chainId` | Stable wire? |
|---------|--------|-----------|:------------:|
| Devnet | open for integration | `31337` | yes |
| Testnet | preview before mainnet | `114514` | yes |
| Mainnet | not launched | `8964` | yes |

## Devnet

The integration sandbox. Free USDC via the faucet; ephemeral state (occasional resets).

| Service | Endpoint |
|---------|----------|
| Gateway REST | `https://gateway.devnet.mtf.exchange` |
| Gateway WS | `wss://gateway.devnet.mtf.exchange/ws` |
| Faucet | `https://faucet.devnet.mtf.exchange` |
| Explorer | `https://explorer.devnet.mtf.exchange` |
| Status | `https://status.devnet.mtf.exchange` |

| Signing parameters | Value |
|--------------------|-------|
| `chainId` | `31337` |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC bridging: CCTP sandbox attestation pubkey. Sandbox transfers only — do not use production CCTP keys against devnet.

### Faucet

`POST /usdc` with a JSON body credits an address with test USDC cross-collateral.
Devnet/testnet only (mainnet refuses). The grant is **`"queued"`** — staged for
the next block, so the balance updates after ~1 block, not synchronously.

```bash
curl -X POST https://faucet.devnet.mtf.exchange/usdc \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>","amount":10000}'
# -> {"address":"0x…","amount":10000,"status":"queued"}
```

- `amount` is optional (whole USDC); omitted or above the cap → the default 10 000.
- Rate-limited: 1 request / hour / address **and** 1 request / minute / IP (`429` when exceeded).
- `400` invalid address · `429` rate-limited · `503` backlog full — body `{"error":"…"}`.

### State resets

Devnet may be reset for protocol upgrades. Cadence: on demand during pre-mainnet development; weekly notice when possible. Watch [status](https://status.devnet.mtf.exchange) for reset announcements.

## Testnet (planned)

Pre-mainnet rehearsal network with stability guarantees.

| Service | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Faucet | TBD (rate-limited) |
| Explorer | TBD |

Testnet `chainId`: `114514` (`0x1bf52`). (Never 998 — that is Hyperliquid's testnet id; MetaFlux is an independent network.)

Testnet differences from mainnet:
- USDC is sandbox CCTP (not real USDC).
- Validator set is operator-controlled.
- No real economic value.

Testnet's wire shape is identical to mainnet's. Clients tested against testnet should require **only the `chainId` and base URL change** to flip to mainnet.

## Mainnet (planned)

Production network. Real USDC, real value, real validators.

| Service | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Explorer | TBD |

Mainnet `chainId`: `8964` (`0x2304`).

Mainnet differences from devnet/testnet:
- USDC is production CCTP (real USDC).
- Validator set is permissionless (governance-elected).
- Real economic value.
- Rate limits and fees per [rate limits](./api/rate-limits.md) and [fees](./concepts/fees.md).

## CCTP corridors

USDC bridging via Circle CCTP. Supported source/destination chains:

| Chain | CCTP domain |
|-------|------------:|
| Ethereum mainnet | 0 |
| Avalanche | 1 |
| OP mainnet | 2 |
| Arbitrum | 3 |
| Base | 6 |
| MetaFlux mainnet | TBD |
| MetaFlux testnet | TBD |

See [bridge](./bridge/) for the full flow.

## Status

Operational status, incident history, and planned maintenance:

- Devnet: `https://status.devnet.mtf.exchange`
- Testnet: TBD
- Mainnet: TBD

The status page exposes:
- Current network state (`operational`, `degraded`, `partial outage`, `major outage`)
- Recent incidents with timelines
- Planned maintenance windows
- Latest committed block height
- Active validator set size

## Compatibility windows

| Network | Wire-shape commitment |
|---------|-----------------------|
| Devnet | Best effort; breaking changes announced 24h ahead |
| Testnet | Stable; breaking changes require 30-day deprecation notice |
| Mainnet | Stable; breaking changes per [versioning policy](./versioning.md) |

## See also

- [Bridge](./bridge/) — CCTP details
- [Versioning](./versioning.md) — wire-shape change policy
- [Quickstart](./integration/quickstart.md) — first call against devnet
- [Signing](./integration/signing.md) — chainId usage
