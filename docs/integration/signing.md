# Signing walkthrough

:::info
**This page has moved.** `/exchange` actions are signed with **structured
EIP-712 typed data** (`eth_signTypedData_v4`). That is the single signing scheme.
The end-to-end walkthrough — domain, per-action type strings, digest, worked
examples, and local verification — now lives in
[**typed-data signing**](./typed-data-signing.md).
:::

Every `/exchange` request is an EIP-712 typed-data signature: the wallet renders
each action field by name, the server reconstructs the typed struct from
`action.type` + `action.params`, recomputes the digest, and recovers the signer
(the account, or an approved [agent](../concepts/agent-wallets.md) of it). There
is no second scheme to choose between.

Go to [**typed-data signing**](./typed-data-signing.md) for the full
specification and copy-pasteable TypeScript / Python examples.

## See also

- [Typed-data signing](./typed-data-signing.md) — the signing scheme, end to end
- [`POST /exchange`](../api/rest/exchange.md) — the endpoint
- [Agent wallets](../concepts/agent-wallets.md) — multi-signer setup
- [Idempotency](./idempotency.md) — nonce strategy + retry
- [Errors](../api/errors.md) — every error you might hit during signing rollout
- [Networks](../networks.md) — chainId per network
