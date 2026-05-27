# Signing walkthrough

> Status: **stable**. The envelope shape is part of the V1 protocol commitment.

End-to-end, with a working example, showing exactly what bytes you sign and how to produce them. Once this clicks, every action is the same — only the inner payload changes.

## The five steps

```
1. encode action      → msgpack bytes
2. hash payload       → keccak256(msgpack) = message_hash (32 bytes)
3. compute domain     → domain_separator (32 bytes; one per network)
4. wrap in envelope   → keccak256(0x1901 ‖ domain_sep ‖ message_hash) = signed_hash (32 bytes)
5. sign               → secp256k1.sign(signed_hash, private_key) = signature (65 bytes)
```

Submit `{ sender, signature, action }` to [`POST /exchange`](../api/rest/exchange.md). The chain re-computes steps 1-4 from your action and recovers the signer from `signed_hash` + `signature`, then matches against either `sender` directly or the [agent-approval map](../concepts/agent-wallets.md).

## Step-by-step

### 1. Encode action as msgpack

`action` is one of the supported action types (see [`POST /exchange`](../api/rest/exchange.md#action-variants)). JSON-shape over the wire, but the **signed payload is its msgpack encoding**. The two are not interchangeable — sign the msgpack bytes, send the JSON.

```typescript
import { encode } from '@msgpack/msgpack';

const action = {
  type: 'Order',
  params: {
    asset:        0,
    side:         'Buy',
    price_e8:     '10050000000',
    size_e8:      '100000000',
    tif:          'Gtc',
    reduce_only:  false,
    stp_mode:     'CancelNewest',
  },
};

const msgpackBytes = encode(action);
```

The official TypeScript SDK calls this for you and exposes the bytes if you want to verify.

### 2. Keccak256 the payload

```typescript
import { keccak256 } from 'ethereum-cryptography/keccak';

const messageHash = keccak256(msgpackBytes); // Uint8Array(32)
```

This is plain Ethereum keccak256 — same primitive used in `personal_sign` and elsewhere in the EVM stack.

### 3. Compute the domain separator

```
domain_separator = keccak256(
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") ‖
    keccak256("MetaFlux")            ‖
    keccak256("1")                   ‖
    chain_id_as_uint256_big_endian   ‖
    address(0).left_padded_to_32
)
```

For devnet (`chainId = 31337`) the domain separator is a fixed 32-byte value — the SDK caches it. Compute once per network.

```typescript
function domainSeparator(chainId: number): Uint8Array {
  const TYPE_HASH = keccak256(
    new TextEncoder().encode(
      'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    )
  );
  const nameHash    = keccak256(new TextEncoder().encode('MetaFlux'));
  const versionHash = keccak256(new TextEncoder().encode('1'));

  const chainIdBE = new Uint8Array(32);
  // chain_id is uint256 BE; for 31337 only the low 4 bytes are non-zero
  const view = new DataView(chainIdBE.buffer);
  view.setBigUint64(24, BigInt(chainId), false);

  const verifyingContract = new Uint8Array(32); // address(0) zero-padded

  return keccak256(concat(TYPE_HASH, nameHash, versionHash, chainIdBE, verifyingContract));
}
```

### 4. Wrap in the EIP-712 envelope

```typescript
const signedHash = keccak256(
  concat(new Uint8Array([0x19, 0x01]), domainSep, messageHash)
);
```

`0x1901` is the EIP-712 magic prefix. The result is the 32-byte digest you actually sign.

### 5. Sign

```typescript
import { sign } from 'ethereum-cryptography/secp256k1';
import { utils } from 'ethereum-cryptography/secp256k1';

const sig = sign(signedHash, privateKey, { recovered: true });
//        ^ returns { r, s, recovery: 0 | 1 }

const signature = new Uint8Array(65);
signature.set(numberToBytesBE(sig.r, 32), 0);
signature.set(numberToBytesBE(sig.s, 32), 32);
signature[64] = sig.recovery! + 27; // legacy v ∈ {27, 28}; v ∈ {0, 1} also accepted by the chain
```

Either `v` encoding is accepted server-side. The TS SDK emits 27/28 by default to maximise compatibility with EVM tooling.

### 6. Submit

```typescript
const response = await fetch('http://localhost:8080/exchange', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sender:    '0x' + toHex(addressOfPrivateKey(privateKey)),
    signature: '0x' + toHex(signature),
    action,
  }),
});

if (response.status === 202) {
  const { mempool_depth } = await response.json();
  // admitted
} else {
  const { error } = await response.json();
  // 400 = malformed, 401 = signature / sender mismatch
}
```

## Common mistakes

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong `chainId` baked into the domain separator. Make sure devnet uses `31337`, not `1` or `999`. |
| `401` intermittently | Action serialisation is not deterministic. Field ordering and tag names must match the canonical msgpack encoding — some encoders reorder map keys non-deterministically. Use a standards-compliant msgpack library with default options. |
| `400 signature: expected 130 hex chars, got 128` | You forgot the recovery byte. The signature is 65 bytes (130 hex), not 64. |
| `400 sender: expected 40 hex chars, got 42` | You included the `0x` prefix in the hex AND the server's hex parser was strict. Either include `0x` everywhere or never. (The decoder accepts both, so this usually means your hex got mangled in transit.) |

## Agent-signed variant

The same five steps with the **agent's** private key. The `sender` field stays as the master's address; the signature is recovered to the agent's address; admission goes through the agent-approval lookup.

```typescript
const signedHash = ...; // computed exactly as above
const sig = sign(signedHash, AGENT_PRIVATE_KEY, { recovered: true });

await fetch('http://localhost:8080/exchange', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sender:    '0x' + toHex(MASTER_ADDRESS),  // master's address
    signature: '0x' + toHex(encode65(sig)),   // signed by agent
    action,
  }),
});
```

Detailed explanation: [agent wallets](../concepts/agent-wallets.md).

## Verifying the chain isn't lying

You can recover the signer locally before submitting, against your own assembled `signed_hash`:

```typescript
import { recoverPublicKey } from 'ethereum-cryptography/secp256k1';
import { publicKeyToAddress } from 'ethereum-cryptography/secp256k1';

const recovered = publicKeyToAddress(
  recoverPublicKey(signedHash, sig.signature, sig.recovery)
);
console.log('signer:', recovered);  // expect the address whose key signed
```

If `recovered ≠ expected`, the bug is in your encoding — fix locally before sending.

## See also

- [`POST /exchange`](../api/rest/exchange.md) — the endpoint
- [Agent wallets](../concepts/agent-wallets.md) — multi-signer setup
- TypeScript SDK (coming)
- Rust SDK (coming)
