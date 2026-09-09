---
description: The one hosted MetaFlux network, its endpoints and signing parameters, the faucet, and what changes when mainnet launches.
---

# Networks

:::warning
**Sign with `chainId` 114514, not 31337.** `31337` is what a node picks when you
run one yourself and set no chain id. It is not the network behind
`api.testnet.mtf.exchange`. The chain id is part of the EIP-712 domain, so a
wrong one does not mostly work — the first signed write is rejected.

Confirm it at any time:

```bash
curl -s https://api.testnet.mtf.exchange/evm -X POST \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# {"id":1,"jsonrpc":"2.0","result":"0x1bf52"}   0x1bf52 = 114514
```
:::

## Summary {#summary}

| Network | Status | `chainId` | Stable wire? |
|---------|--------|-----------|:------------:|
| Testnet (`api.testnet.mtf.exchange`) | open for integration | `114514` | yes |
| Your own node, default config | self-hosted | `31337` | yes |
| Mainnet | not launched | `8964` | yes |

**Testnet is the only network with a public endpoint.** Mainnet endpoints are
published before launch.

:::info
**`api.devnet.mtf.exchange` is not the integration endpoint.** An earlier
revision of this page named it. It resolves, and it answers `/info`, so a client
pointed at it looks connected — but its faucet reserve is empty and its books are
one-sided, so a claim credits nothing and an order finds no counterparty. Point
your client at `api.testnet.mtf.exchange`.
:::

## Testnet {#testnet}

The integration network. Free USDC and MTF from the faucet, real matching, real
consensus, no economic value.

The gateway is the single public front door. The MTF-native surface is served at
`/info` · `/exchange` · `/ws`; EVM JSON-RPC at `/evm`.

| Service | Endpoint |
|---------|----------|
| Gateway front door | `https://api.testnet.mtf.exchange` |
| MTF-native | `POST /info` · `POST /exchange` · `GET /ws` |
| EVM JSON-RPC | `POST /evm` |
| Faucet | `POST /faucet` |
| Gateway WS (native) | `wss://api.testnet.mtf.exchange/ws` |
| Explorer | `https://app.mtf.exchange/explorer` |

Running the node yourself? It serves the same native surface directly at
`http://localhost:8080` (`/info` · `/exchange` · `/ws` · `/faucet`), and its raw
EVM RPC at `http://localhost:8545`. Those are self-hosted ports, not public URLs.

| Signing parameter | Value |
|--------------------|-------|
| `chainId` | `114514`. Use `31337` ONLY against a node you run yourself that sets no chain id |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC bridging goes through the **MetaBridge custody bridge**
([bridge](./bridge/)), not Circle CCTP. Testnet deposits use the Base Sepolia
`Bridge` deployment and Circle's Base Sepolia test USDC.

Differences from mainnet:

- USDC is bridged from a testnet source chain (Base Sepolia test USDC), not real USDC.
- The validator set is operator-controlled.
- No real economic value.

The wire shape is identical to mainnet's. A client tested here should need
**only the `chainId` and the base URL** changed to flip to mainnet.

### Faucet {#faucet}

`POST /faucet` on the gateway front door credits an address with test funds. The
route is **never mounted on mainnet** (`chainId 8964`). Full contract:
[`POST /faucet`](api/rest/faucet.md).

```bash
curl -X POST https://api.testnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- Grants **3000 USDC** cross-collateral and **10 MTF** spot — **once ever per
  address** (a second claim returns `429 address already funded`).
- `amount` is optional (whole USDC) and caps the USDC grant *downward* (≤ 3000).
  The MTF grant is fixed. **After the next release a small `amount` forfeits the
  rest of the grant**, so ask for the full 3000 — see
  [Limits](api/rest/faucet.md#limits).
- Per source IP: one claim per minute today, **one claim per day after the next
  release**. The per-IP window crosses with the per-address rule: a new address
  behind a used IP waits, and a used address is refused from any IP.
- `400` invalid address · `429` already funded or IP-throttled · `503` backlog
  full — body `{"error":"…"}`.

:::info
**`"queued"` means staged, not credited.** The faucet transfers out of a reserve
account rather than creating tokens, so the grant lands about one block later.
The reserve is checked before the response, so a `200` means the reserve could
pay at that moment. Confirm the balance with `account_state` before you trade —
see [the reserve](api/rest/faucet.md#reserve).
:::

### State resets {#state-resets}

Testnet may be reset for protocol upgrades: on demand during pre-mainnet
development, with notice where possible.

## Mainnet (planned) {#mainnet-planned}

Production network. Real USDC, real value, real validators.

| Service | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Explorer | TBD |

Mainnet `chainId`: `8964` (`0x2304`).

Differences from testnet:

- USDC is real, bridged via MetaBridge custody from Base (and later Arbitrum).
- The validator set is permissionless (governance-elected).
- Real economic value.
- Rate limits and fees per [rate limits](./api/rate-limits.md) and [fees](./concepts/fees.md).

## Bridge corridors {#bridge-corridors}

USDC and other assets bridge through the **MetaBridge custody bridge** —
validator ⅔ stake-weighted co-signing, no Circle CCTP dependency. Source chains:

| Chain | Status |
|-------|--------|
| Base | Deployed on Base Sepolia (`Bridge` [`0x10f1A0F6153B8B77a355098E5F19C659A9a0965A`](https://sepolia.basescan.org/address/0x10f1A0F6153B8B77a355098E5F19C659A9a0965A)); mainnet pre-audit |
| Arbitrum | Deployed on Arbitrum Sepolia (`Bridge` [`0x10f1A0F6153B8B77a355098E5F19C659A9a0965A`](https://sepolia.arbiscan.io/address/0x10f1A0F6153B8B77a355098E5F19C659A9a0965A)); mainnet pre-audit |

See [bridge](./bridge/) for the deposit and withdraw flow and the deployment table.

## Compatibility windows {#compatibility-windows}

| Network | Wire-shape commitment |
|---------|-----------------------|
| Testnet | Stable; a breaking change carries a 30-day deprecation notice |
| Mainnet | Stable; breaking changes per the [versioning policy](./versioning.md) |

## See also {#see-also}

- [Quickstart](./integration/quickstart.md) — a first call against testnet
- [Signing](./integration/signing.md) — how `chainId` enters the digest
- [Bridge](./bridge/) — MetaBridge custody bridge details
- [Versioning](./versioning.md) — wire-shape change policy
