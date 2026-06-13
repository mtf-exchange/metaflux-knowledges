# Signing walkthrough

{% hint style="success" %}
**Stable.** The envelope shape is part of the V1 protocol commitment.
{% endhint %}

End-to-end with working examples in TypeScript and Python. Once this clicks, every action is the same — only the inner payload changes.

{% hint style="info" %}
**Want a human-readable wallet prompt?** A subset of actions (transfers,
withdrawals, agent approvals, account/staking/vault settings) can be signed as
structured EIP-712 typed data so wallets render each field by name. See
[typed-data signing](./typed-data-signing.md) (`sig_scheme: "typed"`). The scheme
on this page is the default and covers **all** actions.
{% endhint %}

## TL;DR

```
1. encode action      → msgpack bytes
2. hash payload       → keccak256(msgpack) = message_hash (32 bytes)
3. compute domain     → domain_separator (32 bytes; one per network, cache it)
4. wrap in envelope   → keccak256(0x1901 ‖ domain_sep ‖ message_hash) = signed_hash (32 bytes)
5. sign               → secp256k1.sign(signed_hash, private_key) = signature (65 bytes)
6. submit             → POST /exchange { sender, signature, action }
```

The chain re-computes steps 1–4 from your `action`, recovers the signer from `signed_hash + signature`, and matches against either `sender` directly or the [agent-approval map](../concepts/agent-wallets.md).

## Sequence

```
                   client                                    chain
                     │                                         │
   1. msgpack(action)
   2. message_hash = keccak256(msgpack)
   3. domain_sep   = keccak256(EIP712Domain components)
   4. signed_hash  = keccak256(0x1901 ‖ dom ‖ msg)
   5. sig          = secp256k1(signed_hash, key)
                     │                                         │
                     │ POST /exchange { sender, sig, action }  │
                     ├────────────────────────────────────────►│
                     │                                         │
                     │                                         │ 1'. msgpack(action)
                     │                                         │ 2'. message_hash'
                     │                                         │ 3'. domain_sep'  (cached)
                     │                                         │ 4'. signed_hash'
                     │                                         │ 5'. recovered = ecrecover(signed_hash', sig)
                     │                                         │
                     │                                         │  if recovered == sender:                     admit
                     │                                         │  else if recovered in agent_set(sender):      admit
                     │                                         │  else:                                        401
                     │ 202 Accepted                            │
                     │◄────────────────────────────────────────│
```

## Step-by-step

### 1. Encode action as msgpack

`action` is one of the supported action types (see [`POST /exchange`](../api/rest/exchange.md#action-catalog)). JSON-shape over the wire, but the **signed payload is its msgpack encoding**. The two are not interchangeable — sign the msgpack bytes, send the JSON.

**TypeScript**:

```typescript
import { encode } from '@msgpack/msgpack';

const action = {
  type: 'Order',
  params: {
    orders: [{
      asset:        0,
      side:         'Buy',
      px:     '10050000000',
      size:      '100000000',
      tif:          'Gtc',
      reduce_only:  false,
      stp:     'CancelNewest',
      cloid:        null,
      trigger:      null,
    }],
    grouping: 'Na',
  },
  nonce: Date.now(),
};

const msgpackBytes = encode(action);
```

**Python**:

```python
import msgpack, time

action = {
    'type': 'Order',
    'params': {
        'orders': [{
            'asset':        0,
            'side':         'Buy',
            'px':     '10050000000',
            'size':      '100000000',
            'tif':          'Gtc',
            'reduce_only':  False,
            'stp':     'CancelNewest',
            'cloid':        None,
            'trigger':      None,
        }],
        'grouping': 'Na',
    },
    'nonce': int(time.time() * 1000),
}

msgpack_bytes = msgpack.packb(action, use_bin_type=True)
```

The SDK calls this for you and exposes the bytes if you want to verify.

### 2. Keccak256 the payload

**TypeScript**:

```typescript
import { keccak256 } from 'ethereum-cryptography/keccak';

const messageHash = keccak256(msgpackBytes); // Uint8Array(32)
```

**Python**:

```python
from Crypto.Hash import keccak  # pip install pycryptodome
def keccak256(b: bytes) -> bytes:
    k = keccak.new(digest_bits=256); k.update(b); return k.digest()

message_hash = keccak256(msgpack_bytes)
```

Plain Ethereum keccak256 — same primitive used in `personal_sign`.

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

For devnet (`chainId = 31337`) the domain separator is a fixed 32-byte value — cache it. Compute once per network.

**TypeScript**:

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
  new DataView(chainIdBE.buffer).setBigUint64(24, BigInt(chainId), false);

  const verifyingContract = new Uint8Array(32); // address(0) zero-padded

  return keccak256(concat(TYPE_HASH, nameHash, versionHash, chainIdBE, verifyingContract));
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
```

**Python**:

```python
def domain_separator(chain_id: int) -> bytes:
    type_hash = keccak256(
        b'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    )
    name_hash    = keccak256(b'MetaFlux')
    version_hash = keccak256(b'1')
    chain_id_be  = chain_id.to_bytes(32, 'big')
    verifying    = b'\x00' * 32
    return keccak256(type_hash + name_hash + version_hash + chain_id_be + verifying)
```

### 4. Wrap in the EIP-712 envelope

**TypeScript**:

```typescript
const signedHash = keccak256(
  concat(new Uint8Array([0x19, 0x01]), domainSep, messageHash)
);
```

**Python**:

```python
signed_hash = keccak256(b'\x19\x01' + dom_sep + message_hash)
```

`0x1901` is the EIP-712 magic prefix. The result is the 32-byte digest you actually sign.

### 5. Sign

**TypeScript**:

```typescript
import { sign } from 'ethereum-cryptography/secp256k1';

const sig = sign(signedHash, privateKey, { recovered: true });
// returns { r, s, recovery: 0|1 }

const signature = new Uint8Array(65);
signature.set(numberToBytesBE(sig.r, 32), 0);
signature.set(numberToBytesBE(sig.s, 32), 32);
signature[64] = sig.recovery! + 27;  // legacy v ∈ {27, 28}; v ∈ {0, 1} also accepted
```

**Python**:

```python
from coincurve import PrivateKey  # pip install coincurve

priv = PrivateKey(bytes.fromhex(PRIVATE_KEY_HEX))
sig_compact_recoverable = priv.sign_recoverable(signed_hash, hasher=None)
# returns 65 bytes: r(32) ‖ s(32) ‖ v(1) where v ∈ {0, 1}

# normalise to legacy v
r = sig_compact_recoverable[:32]
s = sig_compact_recoverable[32:64]
v = sig_compact_recoverable[64] + 27
signature = r + s + bytes([v])
```

**Rust** (outline using any pure-Rust secp256k1 crate):

```rust
let key       = SigningKey::from_bytes(&priv_bytes)?;
let (sig, rec): (Signature, RecoveryId) =
    key.sign_prehash_recoverable(&signed_hash)?;
let r: [u8; 32] = sig.r().to_bytes().into();
let s: [u8; 32] = sig.s().to_bytes().into();
let v: u8       = rec.to_byte() + 27;
let signature: [u8; 65] = [&r[..], &s[..], &[v]].concat().try_into()?;
```

The official Rust SDK exposes a typed signing function that wraps this; the snippet above is for reference if you're building from scratch.

### 6. Submit

```typescript
const response = await fetch(`${BASE_URL}/exchange`, {
  method:  'POST',
  headers: { 'content-type': 'application/json' },
  body:    JSON.stringify({
    sender:    '0x' + toHex(addressOfPrivateKey(privateKey)),
    signature: '0x' + toHex(signature),
    action,
  }),
});

if (response.status === 202) {
  const { mempool_depth } = await response.json();
  // admitted
} else if (response.status === 401) {
  const { error } = await response.json();
  // signature / sender mismatch — see /api/errors.md
} else {
  const body = await response.json();
  // other failures
}
```

## Replay protection

Each action carries a `nonce` (already in your encoded payload). The chain enforces:

- **Strictly increasing per `sender`**: a request with `nonce ≤ last_seen_nonce_for_sender` is rejected with `400 nonce_must_increase`.
- **Per-master nonce space for agents**: an agent-signed action consumes a nonce against the master, not the agent. Two different agents of the same master share the same nonce series.

Convention: `nonce = Date.now()` (unix milliseconds). It's monotonic, human-readable in logs, and collision-safe across reasonable submission rates.

For more on retry semantics, see [idempotency](./idempotency.md).

## Common mistakes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401` on every request | Wrong `chainId` baked into the domain separator | Use `31337` for devnet; check [networks](../networks.md) for testnet/mainnet |
| `401` intermittently | Action serialisation is not deterministic | Use a standards-compliant msgpack library with default options |
| `400 signature: expected 130 hex chars, got 128` | Forgot the recovery byte. The signature is 65 bytes (130 hex), not 64. |
| `400 sender: expected 40 hex chars, got 42` | Mixed `0x` prefix handling | Decoder accepts both; mismatch usually means hex got mangled in transit |
| `400 nonce must increase` | Reused nonce (often from copying a request between scripts) | Use a fresh `Date.now()` per submission |
| `400 invalid msgpack` | Encoder added timestamps / canonical ordering options | Use defaults; the chain expects the standard encoding |

## Agent-signed variant

The same five steps with the **agent's** private key. The `sender` field stays as the master's address; the signature is recovered to the agent's address; admission goes through the agent-approval lookup.

```typescript
const signedHash = ...; // computed exactly as above
const sig = sign(signedHash, AGENT_PRIVATE_KEY, { recovered: true });

await fetch(`${BASE_URL}/exchange`, {
  method:  'POST',
  headers: { 'content-type': 'application/json' },
  body:    JSON.stringify({
    sender:    '0x' + toHex(MASTER_ADDRESS),  // master's address
    signature: '0x' + toHex(encode65(sig)),   // signed by agent
    action,
  }),
});
```

Detailed: [agent wallets](../concepts/agent-wallets.md).

## Verifying the chain isn't lying

Before submitting, recover the signer locally against your own assembled `signed_hash`:

```typescript
import { recoverPublicKey, publicKeyToAddress } from 'ethereum-cryptography/secp256k1';

const recovered = publicKeyToAddress(
  recoverPublicKey(signedHash, sig.signature, sig.recovery)
);
console.log('signer:', recovered);
```

If `recovered ≠ expected`, the bug is in your encoding — fix locally before sending.

## See also

- [`POST /exchange`](../api/rest/exchange.md) — the endpoint
- [Agent wallets](../concepts/agent-wallets.md) — multi-signer setup
- [Idempotency](./idempotency.md) — nonce strategy + retry
- [Errors](../api/errors.md) — every error you might hit during signing rollout
- [Networks](../networks.md) — chainId per network
