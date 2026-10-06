# Signing walkthrough

This page points to the signing reference, which now lives on another page.

:::info This page has moved
`/exchange` actions are signed with structured EIP-712 typed data (`eth_signTypedData_v4`).
That is the one signing scheme. The end-to-end walkthrough now lives in
[typed-data signing](./typed-data-signing.md). It covers the domain, the type string per action,
the digest, worked examples and local verification.
:::

Every `/exchange` request carries an EIP-712 typed-data signature. The wallet shows each action
field by name. The server rebuilds the typed struct from `action.type` and `action.params`,
recomputes the digest, and recovers the signer. The signer is the account, or an approved
[agent](../concepts/agent-wallets.md) of the account. There is no second scheme.

[Typed-data signing](./typed-data-signing.md) has the full specification and TypeScript and
Python examples.

## See also {#see-also}

- [Typed-data signing](./typed-data-signing.md): the signing scheme, end to end, including the
  optional [action `expiresAfter`](./typed-data-signing.md#action-expiry-expiresafter) expiry
- [`POST /exchange`](../api/rest/exchange.md): the endpoint
- [Agent wallets](../concepts/agent-wallets.md): setup with more than one signer
- [Idempotency](./idempotency.md): nonce strategy and retry
- [Errors](../api/errors.md): the errors you can get while you roll out signing
- [Networks](../networks.md): the chainId of each network
