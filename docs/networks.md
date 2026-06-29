# Networks

:::info
**Status.** **devnet stable**. Testnet (`chainId 114514`) and mainnet (`chainId 8964`) chainIds are assigned; their endpoints are published pre-launch.
:::

## Summary

| Network | Status | `chainId` | Stable wire? |
|---------|--------|-----------|:------------:|
| Devnet | open for integration | `31337` | yes |
| Testnet | preview before mainnet | `114514` | yes |
| Mainnet | not launched | `8964` | yes |

## Devnet

The integration sandbox. Free USDC via the faucet; ephemeral state (occasional resets).

The gateway is the single public front door. The MTF-native surface is served at
`/info` · `/exchange` · `/ws`; EVM JSON-RPC at `/evm`.

| Service | Endpoint |
|---------|----------|
| Gateway front door | `https://devnet-gateway.mtf.exchange` |
| MTF-native | `POST /info` · `POST /exchange` · `GET /ws` |
| EVM JSON-RPC | `POST /evm` |
| Faucet (devnet/testnet) | `POST /faucet` |
| Gateway WS (native) | `wss://devnet-gateway.mtf.exchange/ws` |
| Explorer | `https://devnet.mtf.exchange/explorer` |
| Status | `https://status.mtf.exchange/devnet` |

Running the node yourself? The node serves the same native surface directly at
`http://localhost:8080` (`/info` · `/exchange` · `/ws` · `/faucet`), and its raw
EVM RPC at `http://localhost:8545`. Those are the self-hosted ports, not public URLs.

| Signing parameters | Value |
|--------------------|-------|
| `chainId` | `31337` |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC bridging: via the **MetaBridge custody bridge** ([bridge](./bridge/)), not Circle CCTP. Testnet deposits use the Base Sepolia `MetaBridgeUSDC` deployment + Circle's Base Sepolia test USDC.

### Faucet

`POST /faucet` on the gateway front door credits an address with test funds.
Devnet/testnet only — the route is **never mounted on mainnet** (`chainId 8964`).
The grant is **`"queued"`** — staged for the next block, so the balance updates
after ~1 block, not synchronously. Full contract: [`POST /faucet`](api/rest/faucet.md).

```bash
curl -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- Grants **3000 USDC** cross-collateral **+ 10 MTF** spot — **once ever per
  address** (second claim → `429 address already funded`).
- `amount` optional (whole USDC); caps the USDC grant *downward* (≤ 3000). MTF fixed.
- Rate-limited 1 request / minute / IP (`429` when exceeded).
- `400` invalid address · `429` already funded / IP-throttled · `503` backlog full — body `{"error":"…"}`.

### State resets

Devnet may be reset for protocol upgrades. Cadence: on demand during pre-mainnet development; weekly notice when possible. Watch [status](https://status.mtf.exchange/devnet) for reset announcements.

## Testnet (planned)

Pre-mainnet rehearsal network with stability guarantees.

| Service | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Faucet | TBD (rate-limited) |
| Explorer | TBD |

Testnet `chainId`: `114514` (`0x1bf52`). MetaFlux is an independent network with its own chain ids.

Testnet differences from mainnet:
- USDC is bridged via MetaBridge from a testnet source chain (Base Sepolia test USDC), not real USDC.
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
- USDC is real, bridged via MetaBridge custody from Base (and later Arbitrum / Solana).
- Validator set is permissionless (governance-elected).
- Real economic value.
- Rate limits and fees per [rate limits](./api/rate-limits.md) and [fees](./concepts/fees.md).

## Bridge corridors

USDC (and other assets) bridge via the **MetaBridge custody bridge** — validator
⅔ stake-weighted co-signing, no Circle CCTP dependency. Source chains:

| Chain | Status |
|-------|--------|
| Base | **live on Base Sepolia** (`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)); mainnet pre-audit |
| Solana | **live on devnet** (`metabridge-solana` program [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet)); mainnet pre-audit |
| Arbitrum | planned |

See [bridge](./bridge/) for the deposit / withdraw flow + the deployment table.

## Status

Operational status, incident history, and planned maintenance:

- Devnet: `https://status.mtf.exchange/devnet`
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

- [Bridge](./bridge/) — MetaBridge custody bridge details
- [Versioning](./versioning.md) — wire-shape change policy
- [Quickstart](./integration/quickstart.md) — first call against devnet
- [Signing](./integration/signing.md) — chainId usage
