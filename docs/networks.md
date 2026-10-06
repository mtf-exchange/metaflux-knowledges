---
description: The one hosted MetaFlux network, its endpoints and signing parameters, the faucet, and what changes when mainnet launches.
---

# Networks

This page lists the hosted MetaFlux network, its endpoints and signing parameters, the faucet, and what changes at mainnet launch.

:::warning
Sign with `chainId` 114514, not 31337. A node that you run yourself uses `31337` when you set no chain id. The network behind `api.testnet.mtf.exchange` does not use it. The chain id is part of the EIP-712 domain, so a wrong chain id fails: the node rejects the first signed write.

To confirm the chain id:

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

Testnet is the only network with a public endpoint. Mainnet endpoints are published before launch.

:::info
`api.devnet.mtf.exchange` is not the integration endpoint. An earlier revision of this page named it. It resolves and answers `/info`, so a client looks connected. But its faucet reserve is empty and its books are one-sided. A claim credits nothing, and an order finds no counterparty. Point your client at `api.testnet.mtf.exchange`.
:::

## Testnet {#testnet}

Testnet is the integration network. It has real matching and real consensus, and the faucet gives free USDC and MTF. The tokens have no economic value.

The gateway is the single public front door. It serves the MTF-native surface at `/info`, `/exchange` and `/ws`, and EVM JSON-RPC at `/evm`.

| Service | Endpoint |
|---------|----------|
| Gateway front door | `https://api.testnet.mtf.exchange` |
| MTF-native | `POST /info` · `POST /exchange` · `GET /ws` |
| EVM JSON-RPC | `POST /evm` |
| Faucet | `POST /faucet` |
| Gateway WS (native) | `wss://api.testnet.mtf.exchange/ws` |
| Explorer | `https://app.mtf.exchange/explorer` |

A node that you run yourself serves the same native surface at `http://localhost:8080` (`/info`, `/exchange`, `/ws` and `/faucet`). It serves its raw EVM RPC at `http://localhost:8545`. These are self-hosted ports, not public URLs.

| Signing parameter | Value |
|--------------------|-------|
| `chainId` | `114514`. Use `31337` ONLY against a node you run yourself that sets no chain id |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

USDC bridging uses the MetaBridge custody bridge ([bridge](./bridge/)), not Circle CCTP. Testnet deposits use the Base Sepolia `Bridge` deployment and Circle's Base Sepolia test USDC.

Differences from mainnet:

- USDC is bridged from a testnet source chain (Base Sepolia test USDC), not real USDC.
- The validator set is operator-controlled.
- No real economic value.

The wire shape is identical to mainnet. A client tested here needs only a new `chainId` and base URL to use mainnet.

### Faucet {#faucet}

`POST /faucet` on the gateway front door credits an address with test funds. The route is never mounted on mainnet (`chainId 8964`). See [`POST /faucet`](api/rest/faucet.md) for the full contract.

```bash
curl -X POST https://api.testnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- The grant is 3000 USDC cross-collateral and 10 MTF spot, once ever per address. A second claim returns `429 address already funded`.
- `amount` is optional (whole USDC). It caps the USDC grant downward (at most 3000). The MTF grant is fixed. See [Limits](api/rest/faucet.md#limits).
- Each source IP gets one claim per minute. The per-IP window combines with the per-address rule: a new address behind a used IP waits, and a used address is refused from any IP.
- Errors: `400` invalid address, `429` already funded or IP-throttled, `503` backlog full. The body is `{"error":"…"}`.

:::info
`"queued"` means staged, not credited. The faucet transfers out of a reserve account and does not create tokens, so the grant lands about one block later. The faucet checks the reserve before it responds, so a `200` means the reserve could pay at that moment. Confirm the balance with `account_state` before you trade. See [the reserve](api/rest/faucet.md#reserve).
:::

### State resets {#state-resets}

Testnet may reset for protocol upgrades. Resets happen on demand during pre-mainnet development, with notice where possible.

## Mainnet (planned) {#mainnet-planned}

Mainnet is the production network. It has real USDC, real value and real validators.

| Service | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Explorer | TBD |

Mainnet `chainId`: `8964` (`0x2304`).

Differences from testnet:

- USDC is real. It bridges through MetaBridge custody from Base, and later from Arbitrum.
- The validator set is permissionless (governance-elected).
- Real economic value.
- Rate limits and fees per [rate limits](./api/rate-limits.md) and [fees](./concepts/fees.md).

## Bridge corridors {#bridge-corridors}

USDC and other assets bridge through the MetaBridge custody bridge. Validators co-sign with ⅔ stake weight. The bridge has no Circle CCTP dependency. The source chains are:

| Chain | Status |
|-------|--------|
| Base | Deployed on Base Sepolia (`Bridge` [`0x655ab51b607cb0ef94af69525e3c98e28a8af6ad`](https://sepolia.basescan.org/address/0x655ab51b607cb0ef94af69525e3c98e28a8af6ad)); bring-up is not complete and withdrawals are halted; mainnet pre-audit |
| Arbitrum | Deployed on Arbitrum Sepolia (`Bridge` [`0x3f1f93c8ce4b7285f9923de9783f29625b84a9d2`](https://sepolia.arbiscan.io/address/0x3f1f93c8ce4b7285f9923de9783f29625b84a9d2)); bring-up is not complete and withdrawals are halted; mainnet pre-audit |

See [bridge](./bridge/) for the deposit and withdraw flow and the deployment table.

## Compatibility windows {#compatibility-windows}

| Network | Wire-shape commitment |
|---------|-----------------------|
| Testnet | Stable; a breaking change carries a 30-day deprecation notice |
| Mainnet | Stable; breaking changes per the [versioning policy](./versioning.md) |

## See also {#see-also}

- [Quickstart](./integration/quickstart.md): a first call against testnet.
- [Signing](./integration/signing.md): how `chainId` enters the digest.
- [Bridge](./bridge/): MetaBridge custody bridge details.
- [Versioning](./versioning.md): the wire-shape change policy.
