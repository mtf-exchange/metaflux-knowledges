# Networks

:::warning
**The hosted sandbox signs with `chainId` 114514, not 31337.** `31337` is the
default a node uses when you run one yourself and set no chain id. It is NOT the
network behind `api.devnet.mtf.exchange`. Sign for 114514 there, or every
signature is rejected — the chain id is part of the EIP-712 domain, so a wrong
one does not "mostly work", it fails on the first write.

Confirm it yourself at any time:

```bash
curl -s https://api.devnet.mtf.exchange/evm -X POST \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# {"id":1,"jsonrpc":"2.0","result":"0x1bf52"}   0x1bf52 = 114514
```
:::

## Summary {#summary}

| Network | Status | `chainId` | Stable wire? |
|---------|--------|-----------|:------------:|
| Hosted sandbox (`api.devnet.mtf.exchange`) | open for integration | `114514` | yes |
| Your own node, default config | self-hosted | `31337` | yes |
| Mainnet | not launched | `8964` | yes |

The hosted sandbox is the only network with a public endpoint today. Mainnet
endpoints are published pre-launch.

## The hosted sandbox {#devnet}

The integration sandbox. Free USDC via the faucet; ephemeral state (occasional resets).

The gateway is the single public front door. The MTF-native surface is served at
`/info` · `/exchange` · `/ws`; EVM JSON-RPC at `/evm`.

| Service | Endpoint |
|---------|----------|
| Gateway front door | `https://api.devnet.mtf.exchange` |
| MTF-native | `POST /info` · `POST /exchange` · `GET /ws` |
| EVM JSON-RPC | `POST /evm` |
| Faucet (devnet/testnet) | `POST /faucet` |
| Gateway WS (native) | `wss://api.devnet.mtf.exchange/ws` |
| Explorer | `https://app.mtf.exchange/explorer` |
| Status | `https://status.mtf.exchange/devnet` |

Running the node yourself? The node serves the same native surface directly at
`http://localhost:8080` (`/info` · `/exchange` · `/ws` · `/faucet`), and its raw
EVM RPC at `http://localhost:8545`. Those are the self-hosted ports, not public URLs.

| Signing parameters | Value |
|--------------------|-------|
| `chainId` | `114514` — the hosted sandbox. Use `31337` ONLY against a node you run yourself that sets no chain id. |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC bridging: via the **MetaBridge custody bridge** ([bridge](./bridge/)), not Circle CCTP. Testnet deposits use the Base Sepolia `Bridge` deployment + Circle's Base Sepolia test USDC.

### Faucet {#faucet}

`POST /faucet` on the gateway front door credits an address with test funds.
Devnet/testnet only — the route is **never mounted on mainnet** (`chainId 8964`).
The grant is **`"queued"`** — staged for the next block, so the balance updates
after ~1 block, not synchronously. Full contract: [`POST /faucet`](api/rest/faucet.md).

:::warning
**`"queued"` is not a credit.** The faucet transfers out of a reserve account
rather than creating tokens, and the claim is checked again when the block
applies it. **The reserve is empty on the live chain**, so every claim currently
returns `200 queued` and credits nothing. Confirm with `account_state`, and see
[the reserve](api/rest/faucet.md#reserve).
:::

```bash
curl -X POST https://api.devnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- Grants **3000 USDC** cross-collateral **+ 10 MTF** spot — **once ever per
  address** (second claim → `429 address already funded`).
- `amount` optional (whole USDC); caps the USDC grant *downward* (≤ 3000). MTF fixed.
- Rate-limited 1 request / minute / IP (`429` when exceeded).
- `400` invalid address · `429` already funded / IP-throttled · `503` backlog full — body `{"error":"…"}`.

### State resets {#state-resets}

Devnet may be reset for protocol upgrades. Cadence: on demand during pre-mainnet development; weekly notice when possible. Watch [status](https://status.mtf.exchange/devnet) for reset announcements.

## Testnet {#testnet-planned}

Pre-mainnet rehearsal network with stability guarantees.

**This is the SAME chain as the hosted sandbox above.** `chainId` `114514`
(`0x1bf52`), reached at `https://api.devnet.mtf.exchange`. There is no second
endpoint to wait for, and no second chain id to switch to. The name "devnet"
in that host name is historical.

MetaFlux is an independent network with its own chain ids.

Testnet differences from mainnet:
- USDC is bridged via MetaBridge from a testnet source chain (Base Sepolia test USDC), not real USDC.
- Validator set is operator-controlled.
- No real economic value.

Testnet's wire shape is identical to mainnet's. Clients tested against testnet should require **only the `chainId` and base URL change** to flip to mainnet.

## Mainnet (planned) {#mainnet-planned}

Production network. Real USDC, real value, real validators.

| Service | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Explorer | TBD |

Mainnet `chainId`: `8964` (`0x2304`).

Mainnet differences from devnet/testnet:
- USDC is real, bridged via MetaBridge custody from Base (and later Arbitrum).
- Validator set is permissionless (governance-elected).
- Real economic value.
- Rate limits and fees per [rate limits](./api/rate-limits.md) and [fees](./concepts/fees.md).

## Bridge corridors {#bridge-corridors}

USDC (and other assets) bridge via the **MetaBridge custody bridge** — validator
⅔ stake-weighted co-signing, no Circle CCTP dependency. Source chains:

| Chain | Status |
|-------|--------|
| Base | **live on Base Sepolia** (`Bridge` [`0x10f1A0F6153B8B77a355098E5F19C659A9a0965A`](https://sepolia.basescan.org/address/0x10f1A0F6153B8B77a355098E5F19C659A9a0965A)); mainnet pre-audit |
| Arbitrum | **live on Arbitrum Sepolia** (`Bridge` [`0x10f1A0F6153B8B77a355098E5F19C659A9a0965A`](https://sepolia.arbiscan.io/address/0x10f1A0F6153B8B77a355098E5F19C659A9a0965A)); mainnet pre-audit |

See [bridge](./bridge/) for the deposit / withdraw flow + the deployment table.

## Status {#status}

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

## Compatibility windows {#compatibility-windows}

| Network | Wire-shape commitment |
|---------|-----------------------|
| Devnet | Best effort; breaking changes announced 24h ahead |
| Testnet | Stable; breaking changes require 30-day deprecation notice |
| Mainnet | Stable; breaking changes per [versioning policy](./versioning.md) |

## See also {#see-also}

- [Bridge](./bridge/) — MetaBridge custody bridge details
- [Versioning](./versioning.md) — wire-shape change policy
- [Quickstart](./integration/quickstart.md) — first call against devnet
- [Signing](./integration/signing.md) — chainId usage
