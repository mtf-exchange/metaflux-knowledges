---
description: The testnet faucet. One claim transfers test USDC and MTF from a funded reserve. The recipient signs the claim. Mainnet refuses it.
---

# Testnet faucet {#post-faucet--testnet-test-funds}

`POST /faucet` sends test USDC and MTF to an address on testnet.

:::info
**Signed claims and a fixed grant are in effect since node 0.9.17**, from
[block 34,135,466](../../changelog/block-34135466.md#faucet-signed-claims). The
node refuses a claim that has no valid `expires` and `signature`, and it
ignores `amount`.
:::

:::warning
**Test networks only.** Mainnet (chain id `8964`) refuses it by design: the
route is not mounted there. Never depend on it in a production flow.
:::

:::warning
**The reserve is finite, and an empty reserve refuses every claim.** The faucet
no longer creates tokens. It moves them out of a reserve account that ⅔-stake
governance votes fund. Read the reserve balance before you blame the endpoint.
Testnet held **276,000 USDC + 920 MTF** on 2026-09-09 (about 92 grants), and
devnet holds nothing. See [the reserve](#reserve).
:::

## Summary {#tldr}

One `POST /faucet` claim transfers 3000 USDC of cross collateral and 10 MTF
spot tokens (token id `104`) to an address. Each address can claim once only.
The recipient [signs the claim](#sign). The response is `"queued"`. The credits are staged for the next block.
They are not committed synchronously.

**`"queued"` is not acceptance.** When the block applies the claim, the chain
checks it again against the reserve balance and against a per-address cap in
committed state. A claim that passes every HTTP check can still be refused
there, and you get no reply when that happens. Always confirm with
[`account_state`](./info/account.md#account_state). The gateway serves
`POST /faucet` next to the native `/info` and `/exchange` default path.

## URL {#url}

```
POST  https://api.<net>.mtf.exchange/faucet
```

A node that you run yourself serves the same `/faucet` route directly at
`http://localhost:8080`.

| Where | Mounted? |
|-------|----------|
| Devnet (`31337`) / testnet (`114514`), faucet enabled | yes |
| Mainnet (`8964`) | **no**. The route is never mounted. A stray request gets `403` from the defensive handler guard |
| Faucet disabled in node config | no |

The node merges the route into the main API router only when its faucet config
is enabled and the network is not mainnet. The route has its own handler state.
The `/exchange` handler tree cannot reach it.

## Request {#request}

```json
{
  "address":   "0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f",
  "expires":   1791000300,
  "signature": "0x40cc298fe68bb92f1cc2877f7840a0be5332c8db90b840ba830d8b8a3c7c114c547db1a452ec9a05d8e522fb3607a7b8fe0edb8a7e50455fdf65e4e44e47c5d41c"
}
```

This body is the [worked example](#worked-example). Its `expires` is in the
past, so the node refuses it. Sign your own claim.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `0x`-hex 20-byte address | yes | Recipient and signer. Accepts 40 or 42 chars (`0x` optional). The zero address is rejected. |
| `expires` | uint64 (unix seconds) | yes | The claim is void after this time. Set it to the current time plus 300. The node refuses a value in the past and a value more than 600 s ahead of its clock. |
| `signature` | `0x`-hex, 65 bytes | yes | EIP-191 `personal_sign` by `address` over the [claim text](#sign). The layout is `r ‖ s ‖ v`, with `v` 27 or 28, as a wallet returns it. The node also accepts `v` 0 or 1. |

**The grant is fixed: 3000 USDC and 10 MTF.** The node ignores an `amount`
field. The signature does not cover `amount`. If the node used it, anyone who
saw a signed body could send it first with a small amount and use the one claim
of that address.

```bash
curl -s -X POST https://api.testnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<your address, lowercase>","expires":<unix seconds>,"signature":"0x<personal_sign result>"}'
```

## Sign the claim {#sign}

The recipient signs this text with EIP-191 `personal_sign`. The text has four
lines joined by `\n` (byte `0x0a`), with no newline at the end:

```text
MetaFlux faucet claim
address: <the recipient, 0x and 40 lowercase hex digits>
chain: <the chain id, decimal>
expires: <the expires field, decimal>
```

- **The address is lowercase.** A checksummed (mixed-case) address makes a
  different text, and the signature does not verify.
- **`chain` is the chain id of the network that serves the faucet**, `114514`
  on testnet. A claim signed for one chain does not verify on another.
- **`expires` is the same number in the text and in the body.**

`personal_sign` hashes `"\x19Ethereum Signed Message:\n"`, then the byte length
of the text in decimal, then the text, with keccak-256. It signs that digest.
A wallet does this itself. Give it the text, not a hash.

**Why the recipient signs.** Each address can claim once only. Without a
signature, any caller can use the one claim of an address that it does not
control. The signature proves that the holder of the recipient key asked for
the grant.

### Worked example {#worked-example}

The key is the example key of the EIP-155 specification. It is public, so never
send funds to it.

| Input | Value |
|---|---|
| Private key | `0x4646464646464646464646464646464646464646464646464646464646464646` |
| Address | `0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f` |
| Chain id | `114514` |
| `expires` | `1791000300` |

The text is 107 bytes:

```text
MetaFlux faucet claim
address: 0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f
chain: 114514
expires: 1791000300
```

The digest is keccak-256 of `"\x19Ethereum Signed Message:\n107"` and then the
text:

```text
0x5933d4b85647840e64e70e23494315f589b01d6c45522f557a00d36ea57e961b
```

The signature. Its last byte is `v` = `0x1c` (28):

```text
0x40cc298fe68bb92f1cc2877f7840a0be5332c8db90b840ba830d8b8a3c7c114c547db1a452ec9a05d8e522fb3607a7b8fe0edb8a7e50455fdf65e4e44e47c5d41c
```

The signature is deterministic (RFC 6979), so a correct signer gives these
exact bytes. Use the example to test your signer, not to claim: its `expires`
is in the past.

### Sign in a browser wallet {#sign-in-a-browser-wallet}

```js
const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
const addr = address.toLowerCase();
const expires = Math.floor(Date.now() / 1000) + 300;
const text = `MetaFlux faucet claim\naddress: ${addr}\nchain: 114514\nexpires: ${expires}`;
const hex = '0x' + [...new TextEncoder().encode(text)]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
const signature = await window.ethereum.request({
  method: 'personal_sign',
  params: [hex, address],
});
const res = await fetch('https://api.testnet.mtf.exchange/faucet', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ address: addr, expires, signature }),
});
```

## Response {#response}

### `200 OK` queued {#200-ok--queued}

```json
{
  "address": "0x00000000000000000000000000000000000ca11e",
  "usdc":    3000,
  "mtf":     10,
  "status":  "queued"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `address` | `0x`-hex string | The recipient, normalized to lowercase |
| `usdc` | uint64 | Granted USDC, whole: 3000 on testnet |
| `mtf` | uint64 | Granted MTF spot tokens (whole, fixed at 10) |
| `status` | `"queued"` | The credits are staged for the next block. They are not committed yet |

`"queued"` is literal. The grant is two system actions that a validator
injects: `SystemUserModify{AdjustCrossAccountValue}` for USDC and
`SystemSpotSend` for MTF. The validator puts them at the start of the next
proposed block. **The block checks each one again when it applies it, and it
can refuse either one.** See [refused after queueing](#refused-after-queueing).
Poll [`account_state`](./info/account.md#account_state) about 1 block later to
see the balance:

```json
// account_state after the credit commits:
{
  "account_value": "3000",
  "spot": { "balances": [
    { "name": "USDC", "signing_id": 100, "total": "3000", "hold": "0", "avg_entry_px": null },
    { "name": "MTF",  "signing_id": 3,   "total": "10",   "hold": "0", "avg_entry_px": null }
  ] }
}
```

### Errors {#errors}

Every refusal answers `{"error":"<text>"}` and a non-2xx status. Show the text
to the user as it is.

| HTTP | Body | Cause |
|------|------|-------|
| 400 | `{"error":"invalid address: <detail>"}` | `address` is not valid `0x`-hex, for example the wrong length |
| 400 | `{"error":"zero address not allowed"}` | The recipient is the zero address |
| 400 | `{"error":"faucet claim needs expires and signature: sign the claim text with the receiving wallet"}` | `expires` or `signature` is missing. |
| 400 | `{"error":"faucet claim expired; sign a new one"}` | `expires` is before the node clock. |
| 400 | `{"error":"faucet claim expires more than 600 s ahead"}` | `expires` is more than 600 s after the node clock. |
| 400 | `{"error":"faucet claim signature must be 0x and 65 bytes"}` | `signature` is not `0x` and 130 hex digits. |
| 403 | `{"error":"faucet claim signature is not from the receiving wallet"}` | The signature recovers to a different address. A different key signed, or the signed text is different: check the lowercase address, the chain id and `expires`. |
| 429 | `{"error":"address already funded"}` | This address claimed before. Each address claims once only. The faucet reads the committed claim record before it queues, so the refusal holds across a node restart. See [Limits](#limits) |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | The source IP claimed inside the per-IP window. The window is a node setting. See [Limits](#limits) |
| 403 | `{"error":"faucet disabled on this network"}` | Defensive guard. It should be unreachable, because mainnet never mounts the route |
| 503 | `{"error":"faucet reserve is empty; ask an operator to refill it"}` | The reserve cannot pay this grant. The node checks the reserve before it queues, so it refuses the claim and does not drop it silently. See [the reserve](#reserve) |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | The injection queue is full. This is temporary backpressure. Retry |

```json
// second claim for the same address:
{ "error": "address already funded" }   // HTTP 429
```

**A signature refusal does not use the IP window.** The node checks the claim before it records the claim in the per-IP window.

## Refusal after queueing {#refused-after-queueing}

The HTTP checks are not the binding checks. The two credits are ordinary
consensus actions. The block validates each one again when it applies it.
There is no reply channel at that point, so a refusal is silent. The
`200 queued` that you hold does not change, and the balance does not move.

Four rules can refuse a queued claim. The chain evaluates all four on committed
state:

| Rule | Effect |
|---|---|
| **The reserve must hold the amount.** The lane debits a reserve account. It never creates tokens | The chain refuses a claim larger than the reserve balance in full. It does not fill it in part and does not clamp it down |
| **A per-address rule in committed state.** There is one row for each lane: the USDC leg, and each spot token id | The row is cumulative and limits a lifetime value: 3000 USDC, 10 tokens. It survives a node restart |
| **The recipient must not be the reserve** | Refused |
| **The amount must be positive** | Refused |

The two legs are independent. The USDC leg can commit while the chain refuses
the MTF leg, or the reverse. A partial credit is a normal outcome. Read both
balances back.

**The cap is in committed state for a reason.** The `[faucet]` config flag of
the node and its claimed-address set are local to the host. The flag gates only
the HTTP route. The set is in memory and resets on restart. The block does not
read either one when it applies the action, so neither can limit what the lane
gives out. Only the committed cap can, so the binding limit is there.

The handler does not read the per-address rows before it queues. It first
checks the claimed-address set and the IP window, which are both local to the
node. It then checks the reserve balance, which is committed. A `200` can
therefore name a grant that the committed per-address cap then refuses. Read
the balance back.

That order also decides the cost of a `503`. When either `503` fires, the node
has already marked the address and advanced the IP window. A reserve-empty or
backlog-full refusal therefore uses the slot on that node until the node
restarts.

## The reserve {#reserve}

The faucet takes funds from a fixed reserve account, `0x5555…5555`. **No
private key can produce that address.** An address is the low 20 bytes of
`keccak256` over a secp256k1 public key. A repeated-byte address needs a 2^160
preimage search. The reserve accepts a pre-fund, but no signer can spend it.
The lane accepts no other source, and the source is not a request parameter.

The claim is a transfer, so supply does not change:
`total_supply == sum(balances) + sum(reserved)` holds before and after. The
faucet used to create the value that it gave out. That broke the identity by
the granted amount. It no longer does.

**The reserve starts empty, and nothing funds it automatically.** Two ⅔-stake
validator governance votes fund it, one for each leg:

| Leg | Vote | Note |
|---|---|---|
| USDC cross-value | `GovAdjustSpotValue` | Sets the cross-account value of the reserve |
| MTF spot | `GovAdjustSpotBalance` | Sets the spot balance of the reserve, and moves `total_supply` by the same delta |

When they land, both appear on
[`validator_votes`](./info/governance.md#validator_votes) with those names in
the `action` field. Filter on `status: "enacted"` to confirm that the reserve
was funded.

The chain refuses a claim that the reserve cannot pay, and credits nothing. If
the faucet of a network seems dead, check this first: read `account_state` for
`0x5555…5555` and see if the reserve holds anything. Testnet held
276,000 USDC + 920 MTF on 2026-09-09. Devnet holds nothing.

## Limits {#limits}

- **One claim per address.** A second claim for the same address returns
  `429 address already funded`, also from a different IP and also much later.

  The committed row is a one-time claim record. The handler reads it before it
  queues and answers `429` at once. A set in the memory of the
  faucet node closes the window between the queue and the commit inside one
  block. The rule is in force since
  [block 11,550,001](../../changelog/block-11550001.md#faucet-rules). Before
  that height, the committed row was a value cap, so an address that asked for
  less could come back for the rest.

  A `400` or `429` refusal records nothing. A `503` is different. When the
  queue refuses the claim, the node has already marked the address and advanced
  the IP window. That node then refuses the address until it restarts. No
  committed row is written, so the address can claim again after the restart.
- **Per-IP window.** Different addresses behind one IP inside the window get
  `429 rate limit`. The window is a node setting. The testnet faucet uses one
  minute. The default for a node that sets no value is one day (86400 s).

  **The window slows claims. It is not an anti-sybil control.** It is in the
  memory of the faucet node, it is not chain-wide, and it resets when that node
  restarts. The committed per-address rule and the reserve balance limit what
  the faucet gives out.
- **Fixed grant.** 3000 USDC and 10 MTF. The node ignores `amount`.

## Separation from `/exchange` {#why-this-is-not-on-exchange}

The two faucet credits are system actions with privileges (`SystemUserModify`,
`SystemSpotSend`). They are in the System action-id range, and they are never
part of the `/exchange` user-action allowlist. The faucet puts them into a
separate injection queue that only validators use. This is not the public
mempool. The runtime drains the queue into the block payload in the same way as
the oracle feed. The sender is the validator address of the node, so the
`require_system_authority` check admits them. No code path goes from the public
user mempool to this queue. See
[never expose system actions on /exchange](./exchange/transfers.md#non-bridged-actions).

## Determinism boundary {#determinism-boundary}

The faucet HTTP edge is fully non-deterministic: the IP throttle uses the wall
clock, and the claimed-address set is local to the host. Only the recipient and
the amounts in the two system actions go into consensus. They go through the
unchanged deterministic handlers. The local rate-limit and claimed-address
state is never hashed into the AppHash.

## See also {#see-also}

- [`POST /info`](./info.md): read `account_state` to confirm the credit
- [`POST /exchange`](./exchange.md): the user-action write path. System actions, such as the faucet credits, never go through it
- [Networks](../../networks.md): the chain id of each network
