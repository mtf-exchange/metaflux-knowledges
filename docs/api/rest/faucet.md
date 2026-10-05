---
description: Testnet test faucet — one-shot transfer of test USDC + MTF from a funded reserve. The recipient signs the claim. Refused on mainnet.
---

# `POST /faucet` — testnet test funds

:::caution
**Signed claims, the mainnet balance rule and a fixed grant start with the next
node release. Not live yet.** From that release, the node refuses a claim that
has no valid `expires` and `signature`, and a recipient that holds less than
**0.01 ETH on Ethereum mainnet**. It grants a fixed amount and ignores
`amount`. Until then, the node ignores the two new fields, checks no balance,
and still caps the USDC grant at `amount`. A signed claim with no `amount` works
on both, so send that now. See
[the changelog](../../changelog/next-release.md#faucet-signed-claims).
:::

:::warning
**Test networks only.** It is **structurally refused on mainnet** (chain id
`8964`): the route is never even mounted there. Never depend on it in a
production flow.
:::

:::warning
**The reserve is finite, and an empty reserve refuses every claim.** The faucet
no longer creates tokens. It moves them out of a reserve account that ⅔-stake
governance votes fund. Read the reserve balance before you blame the endpoint:
testnet held **276,000 USDC + 920 MTF** on 2026-09-09 (about 92 grants), and
devnet holds nothing. See [the reserve](#reserve).
:::

## TL;DR {#tldr}

One `POST /faucet` claim transfers **3000 USDC** cross-collateral **and 10 MTF**
spot tokens (token id `104`) to an address. **Once-ever per address.** The
recipient [signs the claim](#sign), and it must
[hold at least 0.01 ETH on Ethereum mainnet](#eligibility). Both rules are not
live yet. The response is `"queued"` — the credits are staged for the next
block, not committed synchronously.

**`"queued"` is not acceptance.** The claim is checked again when the block
applies it, against the reserve balance and against a per-address cap held in
committed state. A claim that passes every HTTP check can still be refused there,
and nothing is returned to you when it is. Always confirm with
[`account_state`](./info/account.md#account_state). Served as `POST /faucet` on the
gateway front door, alongside the native `/info` + `/exchange` default path.

## URL {#url}

```
POST  https://api.<net>.mtf.exchange/faucet
```

Running the node yourself, the same `/faucet` route is served directly at
`http://localhost:8080`.

| Where | Mounted? |
|-------|----------|
| Devnet (`31337`) / testnet (`114514`), faucet enabled | yes |
| Mainnet (`8964`) | **no** — route never mounted; a stray hit gets `403` from the defensive handler guard |
| Faucet disabled in node config | no |

The route is merged into the main API router only when the node's faucet config
is **enabled AND off mainnet**. It carries its own handler state and is
structurally unreachable from the `/exchange` handler tree.

## Request {#request}

```json
{
  "address":   "0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f",
  "expires":   1791000300,
  "signature": "0x40cc298fe68bb92f1cc2877f7840a0be5332c8db90b840ba830d8b8a3c7c114c547db1a452ec9a05d8e522fb3607a7b8fe0edb8a7e50455fdf65e4e44e47c5d41c"
}
```

This body is the [worked example](#worked-example). Its `expires` is in the
past, so the node refuses it. Sign your own.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `0x`-hex 20-byte address | yes | Recipient, and the signer. Accepts 40 or 42 chars (`0x` optional). The zero address is rejected. |
| `expires` | uint64 (unix seconds) | yes, from the next node release | The claim is void after this time. Set it to the current time plus 300. The node refuses a value in the past and a value more than 600 s ahead of its clock. |
| `signature` | `0x`-hex, 65 bytes | yes, from the next node release | EIP-191 `personal_sign` by `address` over the [claim text](#sign). The layout is `r ‖ s ‖ v`, with `v` 27 or 28, as a wallet returns it. The node also accepts `v` 0 or 1. |

**The grant is fixed: 3000 USDC and 10 MTF.** From the next node release, an
`amount` field, if sent, is ignored. The signature does not cover `amount`, so
a node that honoured it would let anyone who saw a signed body send it first
with a tiny amount and spend the once-ever claim. Until the release, the running
node still caps the USDC grant at `amount`, so do not send it.

```bash
curl -s -X POST https://api.testnet.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<your address, lowercase>","expires":<unix seconds>,"signature":"0x<personal_sign result>"}'
```

## Sign the claim {#sign}

:::caution
**Not live yet.** The node checks the signature from the next node release.
:::

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
of the text in decimal, then the text, with keccak-256, and signs that digest.
A wallet does this itself. Give it the text, not a hash.

**Why the recipient signs.** Each address can claim once, ever. Without a
signature, any caller could spend the one claim of an address it does not
control. The signature proves that the holder of the recipient's key asked for
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

The digest, keccak-256 of `"\x19Ethereum Signed Message:\n107"` and then the
text:

```text
0x5933d4b85647840e64e70e23494315f589b01d6c45522f557a00d36ea57e961b
```

The signature. Its last byte is `v` = `0x1c` (28):

```text
0x40cc298fe68bb92f1cc2877f7840a0be5332c8db90b840ba830d8b8a3c7c114c547db1a452ec9a05d8e522fb3607a7b8fe0edb8a7e50455fdf65e4e44e47c5d41c
```

The signature is deterministic (RFC 6979), so a correct signer gives these exact
bytes. Use the example to test your signer, not to claim: its `expires` is in
the past.

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

The client SDKs sign for you from their next release:
`requestFaucet(baseUrl, privateKey)` in `@metaflux-dex/client`, and
`request_faucet(base_url, &wallet, chain_id, None)` in `metaflux-client`. Each
also sends a claim that a wallet signed.

## Who can claim {#eligibility}

An address can claim when both rules hold:

- **It holds at least 0.01 ETH on Ethereum mainnet.** Not live yet. The node
  reads the ETH balance of the address on Ethereum mainnet (chain id `1`) when
  the claim arrives. ETH on a layer 2, such as Base or Arbitrum, does not count.
  A token does not count. The node only reads the balance. It moves nothing, and
  it asks for no transaction.
- **It has never claimed.** See [Limits](#limits).

**Why a mainnet balance.** A grant is free, so a script can make many addresses
and claim with each. A balance on Ethereum mainnet costs real money to put in
place, so the rule ties each grant to an address that holds real value.

The node reads the balance at the `latest` block and keeps its answer for an
address for up to 10 minutes. A refused address that then gets the balance can
claim once that answer expires. Each source IP runs one balance check at a time
and at most 10 an hour; an IPv6 address counts by its /64.

## Response {#response}

### `200 OK` — queued {#200-ok--queued}

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
| `address` | `0x`-hex string | Echoed recipient, normalized lowercase |
| `usdc` | uint64 | Granted USDC, whole: 3000 on testnet |
| `mtf` | uint64 | Granted MTF spot tokens (whole, fixed at 10) |
| `status` | `"queued"` | The credits are **staged for the next block**, not yet committed |

`"queued"` is literal: the grant is two validator-injected system actions
(`SystemUserModify{AdjustCrossAccountValue}` for USDC + `SystemSpotSend` for MTF)
prepended to the next proposed block. **Each one is re-checked when that block
applies it, and either can be refused there** — see
[refused after queueing](#refused-after-queueing). Poll
[`account_state`](./info/account.md#account_state) ~1 block later to see the balance:

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
to the user as it is. The rows marked **Not live yet** start with the next node
release. The table is in the order the node checks.

| HTTP | Body | Cause |
|------|------|-------|
| 403 | `{"error":"faucet disabled on this network"}` | Defensive guard (should be unreachable — mainnet never mounts the route) |
| 400 | `{"error":"invalid address: <detail>"}` | `address` not valid `0x`-hex (e.g. wrong length) |
| 400 | `{"error":"zero address not allowed"}` | Recipient is the zero address |
| 400 | `{"error":"amount must be positive"}` | Explicit `amount` of `0`. Gone at the next node release, which ignores `amount` |
| 400 | `{"error":"faucet claim needs expires and signature: sign the claim text with the receiving wallet"}` | `expires` or `signature` is missing. **Not live yet** |
| 400 | `{"error":"faucet claim expired; sign a new one"}` | `expires` is before the node's clock. **Not live yet** |
| 400 | `{"error":"faucet claim expires more than 600 s ahead"}` | `expires` is more than 600 s after the node's clock. **Not live yet** |
| 400 | `{"error":"faucet claim signature must be 0x and 65 bytes"}` | `signature` is not `0x` and 130 hex digits. **Not live yet** |
| 403 | `{"error":"faucet claim signature is not from the receiving wallet"}` | The signature recovers to another address. Another key signed, or the signed text differs: check the lowercase address, the chain id and `expires`. **Not live yet** |
| 429 | `{"error":"address already funded"}` | This address claimed before (**once-ever**). The faucet reads the committed claim record before it queues, so the refusal holds across a node restart — see [Limits](#limits) |
| 503 | `{"error":"faucet reserve is empty; ask an operator to refill it"}` | The reserve cannot pay this grant. The node checks it before it queues, so the claim is refused, not silently dropped — see [the reserve](#reserve) |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | Source IP claimed inside the per-IP window. The window is a node setting — see [Limits](#limits) |
| 403 | `{"error":"faucet needs mainnet activity: this wallet must hold at least 0.01 ETH on Ethereum mainnet"}` | The recipient holds less than 0.01 ETH on Ethereum mainnet. **Not live yet.** See [who can claim](#eligibility) |
| 429 | `{"error":"rate limit: too many mainnet checks from this IP; try again later"}` | The source IP has a balance check running, or used its 10 checks this hour. **Not live yet** |
| 503 | `{"error":"faucet cannot check mainnet activity now; try again later"}` | The node could not read the Ethereum mainnet balance: the read did not answer, or the node already runs its maximum number of checks. **Not live yet** |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | Injection queue saturated (transient backpressure; retry) |

```json
// second claim for the same address:
{ "error": "address already funded" }   // HTTP 429
```

**From the next node release, the new checks leave the IP window open.** The
node checks the signature and the mainnet balance before it records the claim
in the per-IP window, so their refusals do not spend it. A balance check does
spend one of the source IP's 10 checks for the hour.

## A queued claim can be refused {#refused-after-queueing}

The HTTP checks are **not** the binding ones. The two credits are ordinary
consensus actions, and each is validated again at the moment the block applies
it. There is no reply channel from that point, so a refusal is silent: the
`200 queued` you already hold does not change, and the balance never
moves.

Four rules refuse a queued claim. All four are evaluated on committed state:

| Rule | Effect |
|---|---|
| **The reserve must hold the amount.** The lane debits a reserve account; it never creates tokens | A claim larger than the reserve balance is refused **whole**. It is not partly filled and not clamped down |
| **A per-address rule, in committed state.** One row per lane: the USDC leg, and each spot token id | The row is cumulative and bounds a lifetime VALUE: 3000 USDC, 10 tokens. It survives a node restart |
| **The recipient must not be the reserve itself** | Refused |
| **The amount must be positive** | Refused |

The two legs are independent. The USDC leg can commit while the MTF leg is
refused, or the reverse, so a partial credit is a normal outcome. Read both
balances back.

**Why the cap lives in committed state.** The node's `[faucet]` config flag and
its once-ever address set are host-local: the flag gates the HTTP route only, and
the set is in memory and resets on restart. Neither is read when the block
applies the action, so neither can bound what the lane hands out. Only the
committed cap can, so that is where the binding limit sits.

The handler does not read those per-address rows before it queues. It checks the
once-ever address set and the IP window first, both node-local, and only then the
reserve balance, which is committed. So a `200` can name a grant the committed
per-address cap then refuses. Read the balance back.

That order also decides what a `503` costs you. The address is already marked and
the IP window already advanced by the time either `503` fires, so a reserve-empty
or backlog-full refusal spends the slot on that node until it restarts.

## The reserve, and how it gets funded {#reserve}

The faucet's source is a fixed reserve account, `0x5555…5555`. **No private key
can produce that address**: an address is the low 20 bytes of `keccak256` over a
secp256k1 public key, so a repeated-byte image needs a 2^160 preimage search. The
reserve therefore accepts a pre-fund but no signer can ever spend it. The lane
accepts no other source; the source is not a request parameter.

Because the claim is a **transfer**, supply is unchanged across it:
`total_supply == sum(balances) + sum(reserved)` holds before and after. The
faucet used to create the value it handed out, which broke that identity by the
amount granted. It no longer does.

**The reserve starts empty and nothing funds it automatically.** Two ⅔-stake
validator governance votes fund it, one per leg:

| Leg | Vote | Note |
|---|---|---|
| USDC cross-value | `GovAdjustSpotValue` | Sets the reserve's cross-account value |
| MTF spot | `GovAdjustSpotBalance` | Sets the reserve's spot balance, and moves `total_supply` by the same delta |

Both appear on [`validator_votes`](./info/governance.md#validator_votes) with
those names in the `action` field once they land. Filter on `status: "enacted"`
to confirm the reserve was funded.

A claim the reserve cannot pay is refused, and nothing is credited. If you are
integrating against a network whose faucet appears dead, this is the first thing
to check: read `account_state` for `0x5555…5555` and see whether the reserve holds
anything. Testnet held 276,000 USDC + 920 MTF on 2026-09-09; devnet holds
nothing.

## Limits {#limits}

- **Once ever per address.** A second claim for the same address returns `429
  address already funded`, even from another IP, even much later.

  The committed row is a once-ever CLAIM record. The handler reads it before it
  queues and answers `429` at once. A set in the faucet node's
  memory closes the window between the queue and the commit inside one block.
  The rule is in force since
  [block 11,550,001](../../changelog/block-11550001.md#faucet-rules). Before
  that height the committed row was a VALUE cap, so an address that asked for
  less could come back for the rest.

  A `400` or `429` refusal records nothing. A `503` is different: the node has
  already marked the address and advanced the IP window by the time the queue
  refuses it, so that node refuses the address until it restarts. No committed row
  is written, so the address can claim again after that restart.
- **Per-IP window.** Distinct addresses behind one IP inside the window get
  `429 rate limit`. The window is a node setting. **The testnet faucet runs one
  MINUTE.** The default for a node that sets no value is one day (86400 s). From
  the next node release, an IPv6 address counts by its /64 and an IPv4 address
  counts whole, for this window and for the balance checks.

  **The window is a speed bump, not an anti-sybil control.** It
  lives in the faucet node's memory, it is not chain-wide, and it resets when that
  node restarts. What bounds the give-away is the committed per-address rule and
  the reserve balance.
- **Fixed grant.** 3000 USDC and 10 MTF. From the next node release the node
  ignores `amount`. Until then it caps the USDC grant at `amount`, so do not
  send it.
- **0.01 ETH on Ethereum mainnet.** Not live yet. The recipient must hold it
  when it claims. See [who can claim](#eligibility).

## Why this is NOT on `/exchange` {#why-this-is-not-on-exchange}

The faucet's two credits are **system / privileged actions**
(`SystemUserModify`, `SystemSpotSend`). These are in the System action-id range
and are **never** part of the
`/exchange` user-action allowlist. The faucet enqueues them into a **separate
validator-only injection queue** (not the public mempool); the runtime drains it
into the block payload exactly like the oracle feed, with the node's own
validator address as sender so the `require_system_authority` check admits them.
There is no code path from the public user mempool to this queue. See
[never expose system actions on /exchange](./exchange/transfers.md#non-bridged-actions).

## Determinism boundary {#determinism-boundary}

Everything in the faucet HTTP edge is non-deterministic (wall-clock IP throttle,
host-local claimed-set). The ONLY values that cross into consensus are the
recipient + amounts in the two system actions, which flow through the unchanged
deterministic handlers. The host-local rate-limit / claimed-set state is never
hashed into the AppHash.

## See also {#see-also}

- [`POST /info`](./info.md) — read `account_state` to confirm the credit
- [`POST /exchange`](./exchange.md) — the user-action write path (system actions like the faucet's credits never transit it)
- [Networks](../../networks.md) — chain ids per network
