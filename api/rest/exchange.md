# `POST /exchange` — submit a signed action

> Status: **stable**. Endpoint shape is committed for V1.

The write path. Every state-mutating user action — order, cancel, transfer, agent approval, vault deposit, … — submits here as a single EIP-712-signed JSON envelope.

## URL

```
POST  https://<node-or-gateway>/exchange
```

## Request

```json
{
  "sender":    "0x1234567890abcdef1234567890abcdef12345678",
  "signature": "0xabcd…1b",
  "action":    { /* see below */ }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sender` | hex string, 20 bytes (40 hex chars, optional `0x` prefix) | The EVM-shape address whose state will be mutated. **Not necessarily the signer** — see [Agent wallets](#agent-wallets) below. |
| `signature` | hex string, 65 bytes (130 hex chars) | secp256k1 ECDSA over the EIP-712 envelope. `r ‖ s ‖ v`. Both legacy `v ∈ {27, 28}` and EIP-2098 `v ∈ {0, 1}` are accepted. |
| `action` | JSON object | One of the supported action variants. Schema is part of the wire protocol. |

## Signing

The 32-byte digest the signer must commit to is:

```
signed_hash = keccak256( 0x1901 ‖ domain_separator ‖ keccak256( msgpack(action) ) )
```

where:

- `msgpack(action)` is the canonical msgpack encoding of the `action` object. Clients must encode it the same way the server deserializes — field ordering and tag names matter. The official SDKs handle this for you.
- `domain_separator = keccak256(EIP712Domain_typeHash ‖ keccak256("MetaFlux") ‖ keccak256("1") ‖ chain_id ‖ 0x0…0)` — i.e. an EIP-712 domain with `name="MetaFlux"`, `version="1"`, `chainId` configured per network (see [chain ids](#chain-ids)), `verifyingContract = 0x0`.

There is **no per-action `typeHash` step** — the digest goes straight from the msgpack payload through the envelope.

### Chain ids

| Network | `chainId` |
|---------|-----------|
| devnet (default) | `31337` |
| testnet | TBD |
| mainnet | TBD pre-launch |

Sign against the **wrong chain id** and every request comes back `401`.

## Action variants

The `action` object's `type` field selects the variant. Most commonly used:

```json
// place a limit order
{
  "type": "Order",
  "params": {
    "asset": 0,
    "side": "Buy",
    "price_e8": "10050000000",
    "size_e8": "100000000",
    "tif": "Gtc",
    "reduce_only": false,
    "stp_mode": "CancelNewest"
  }
}

// cancel by oid
{
  "type": "Cancel",
  "params": { "asset": 0, "oid": 12345 }
}

// approve an agent wallet to sign as this account
{
  "type": "ApproveAgent",
  "params": {
    "agent": "0xaaaa…",
    "expires_at_ms": null,
    "name": "trading-bot-1"
  }
}
```

Numeric fields > 2^53 (anything `_e8` scaled, or any 128-bit value) **must** be JSON strings; native JSON numbers silently lose precision past 2^53.

## Response

### `202 Accepted` — admitted to the mempool

```json
{
  "accepted": true,
  "mempool_depth": 3
}
```

`mempool_depth` is the queue size at admission time. It is informational only — the proposal builder drains FIFO and an action may be evicted under cap pressure.

### `401 Unauthorized` — signature failed

```json
{
  "accepted": false,
  "error": "signer is not the sender and not an approved agent",
  "mempool_depth": 3
}
```

Triggers:
- Recovery failed (malformed signature)
- Recovered address ≠ `sender` AND `sender` has no approved agent matching the recovered address
- Approved agent is expired
- Wrong `chainId` baked into the signing domain (recovers a phantom address)

### `400 Bad Request` — body malformed

```json
{
  "accepted": false,
  "error": "sender: expected 40 hex chars, got 38",
  "mempool_depth": 3
}
```

Triggers: hex parse failure on `sender` or `signature`, missing fields, unknown action variant.

## Admission ≠ commit

`202` means the action made it into the mempool. It does **not** mean:

- the action was included in a block (it may be evicted before the next leader's turn — particularly under sustained load)
- the action succeeded in the state machine (e.g. an order with bad price levels accepts at the mempool but errors at dispatch)

Tracking commit status is via WS subscription (coming) or by polling the indexer.

## Agent wallets

If `sender` ≠ recovered address, MetaFlux looks up the on-chain approval set for `sender`. If the recovered address is in that set AND not expired, the request is admitted. Otherwise `401`.

This is how Hyperliquid-style "API wallets" work: a master account does an [`ApproveAgent`](#action-variants) once, then a hot trading key with no withdrawal privileges signs every order. The master key stays in cold storage.

**Propagation delay**: approval comes into effect **one block after the `ApproveAgent` commits**. Submitting an agent-signed request before the approval block commits returns `401`.

## Rate limits

Currently none enforced at the node. The gateway adds per-IP and per-account limits (see gateway docs — coming).

## See also

- [`POST /info`](./info.md) — read path
- [Agent wallets](../../concepts/agent-wallets.md) — the user-perspective explanation
- [Signing walkthrough](../../integration/signing.md) — end-to-end working example
