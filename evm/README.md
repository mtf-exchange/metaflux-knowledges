# EVM

{% hint style="warning" %}
**Preview.** The MetaFlux EVM is a revm-based sidechain with a **dual-block
architecture** (a small, frequent block for latency-sensitive transactions plus a
larger throughput block). The EVM JSON-RPC and the **Core interaction surface**
(read precompiles + the CoreWriter write path) are design-stable, but the
end-to-end EVM↔Core path is **not yet live on devnet**. Build against the ABIs and
addresses now; do not assume execution on devnet yet.
{% endhint %}

The MetaFlux EVM runs standard Solidity contracts and exposes MetaFlux **Core**
(the L1 perps clearinghouse + on-chain CLOB) to those contracts through:

- **system precompiles** — read Core-derived values (`staticcall`), and
- the **CoreWriter** system contract — submit L1 actions (write).

## Pages

- [Interacting with Core](interacting-with-core.md) — the read precompiles + the CoreWriter action ABI

## JSON-RPC

The EVM JSON-RPC is served at `POST /evm` on the gateway (standard `eth_*`
methods); see [Networks & chain IDs](../networks.md) for endpoints and the chain
id. Deployable contracts live in the public
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo.
