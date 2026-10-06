---
description: How to connect a client to MetaFlux. SDKs, signing, migration, idempotency and error handling.
---

# Integration

This section explains how to connect a client to MetaFlux. Pick the page that matches your
starting point.

## Starting points {#starting-points}

| Starting point | Page |
|----------------|------|
| No code yet, and you want to try the API | [Quickstart](./quickstart.md) |
| A working key, and you want to place real orders | [Placing orders](./placing-orders.md) |
| An existing Hyperliquid bot or tool | [Migrating from HL](./migrating-from-hl.md) |
| A new TypeScript or browser project | [TypeScript SDK](./typescript-sdk.md) |
| A new Rust service | [Rust SDK](./rust-sdk.md) |
| Any other language (Python, Go and others) | [Typed-data signing](./typed-data-signing.md). Implement the EIP-712 typed-data signature yourself. |

## Topics {#topics}

- [Quickstart](./quickstart.md): a 5-minute run from deposit to trade to withdrawal.
- [Placing orders](./placing-orders.md): the main order guide. It covers one order, batches,
  spot, cancels, and the order actions to skip.
- [Typed-data signing](./typed-data-signing.md): the EIP-712 signing scheme, end to end, with
  working examples.
- [Signing walkthrough](./signing.md): a pointer to typed-data signing, kept for older links.
- [Agent wallets howto](./agent-wallets-howto.md): code for the hot-key pattern.
- [Idempotency](./idempotency.md): nonce strategy and safe retry.
- [Error handling](./error-handling.md): a decision tree for admission, commit and network
  errors.
- [Risk-watcher pattern](./risk-watcher.md): automated margin addition.
- [Market-maker performance](./market-maker-performance.md): async confirm, batch quotes and
  cloid for a quote loop that does not wait on finality.
- [Optimizing latency](./latency.md): measure the block cadence, pick the write transport, and
  find where an order sits inside a block.
- [Migrating from HL](./migrating-from-hl.md): move a Hyperliquid bot to the MTF-native API.

## SDKs {#sdks}

| Language | Status | Package |
|----------|--------|---------|
| TypeScript / JavaScript | preview | [`@metaflux-dex/client`](./typescript-sdk.md) |
| Rust | preview | [`metaflux-client`](./rust-sdk.md) |

For other languages (Python, Go, Java, C++ and others), implement the EIP-712 typed-data
signature as [typed-data signing](./typed-data-signing.md) describes. That page documents every
step with worked examples. The wire format is small, so a hand-written client is a good choice
for less common stacks.

## Network endpoints {#network-endpoints}

The [networks](../networks.md) page is the full reference for each network.

The gateway (`https://api.<net>.mtf.exchange`) is the one public entry point.

| Path | Serves | Purpose |
|------|--------|---------|
| `POST /info` · `POST /exchange` · `GET /ws` | MTF-native | Native snake_case surface |
| `POST /evm` | EVM JSON-RPC | EVM sidechain RPC |
| `POST /faucet` | Faucet | Testnet faucet |

Production deployments terminate TLS at the gateway and put a CDN in front of it. The node is
not internet-facing by design. It sits behind the gateway. If you run the node yourself, it
serves the same native surface at `http://localhost:8080`, and raw EVM RPC at
`http://localhost:8545`.

## Common patterns {#common-patterns}

- **Maker bot.** Agent-signed, persistent quoting, a risk-watcher sidecar, and ALO orders for
  the guaranteed-maker tier.
- **Liquidation watcher.** A WS subscriber on
  [`notifications`](../api/ws/subscriptions.md#notifications) (`yellow_card`) and
  [`account_state`](../api/ws/subscriptions.md#account_state). It adds margin before T1.
- **TWAP wrapper.** It submits `twap_order` and watches
  [`user_twap_slice_fills`](../api/ws/subscriptions.md#user_twap_slice_fills) and
  [`user_twap_history`](../api/ws/subscriptions.md#user_twap_history) for slice telemetry. It
  can cancel by hand during the run.
- **Vault manager.** `VaultDeploy` once, then agent-signed orders for the vault address on each
  rebalance.
- **Institutional custody.** A multi-sig master, one agent per host, and multi-sig wrapping for
  high-value flows.
