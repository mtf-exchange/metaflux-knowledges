---
description: "Bid for priority block placement, and submit a threshold-encrypted order."
---

# Priority & encrypted-order actions

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

### Pay for priority block placement {#priority_bid}

Pay a priority fee to move your flow toward the front of the next block. The bid
is a RATE in basis points, and it applies to ONE asset.

```json
{
  "type": "priority_bid",
  "params": { "asset": 8, "bid_bps": 6 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Asset this bid is bound to |
| `bid_bps` | uint16 | Bid rate in basis points, `1` to `8` |

**Bounds.** `bid_bps` must be `1` or more and `8` or less. A bid of `0`, or a bid
above `8`, is rejected. A rejected bid stores nothing and costs nothing.

**One bid per asset.** A second `priority_bid` on the same asset REPLACES the
first. Bids on different assets are independent.

**What you pay.** The bid is a rate, not an amount. Your next perpetual order on
that asset carries the charge. The exchange multiplies the FILLED notional of
that order by `bid_bps / 10000` and truncates toward zero. The charge is
additional to your usual taker fee, and it goes to the same protocol fee pools.

**When the bid is used up.** Your next perpetual order on that asset consumes the
bid. This is true whether the order fills or not, and true when the charge
truncates to zero. An unused bid stays until an order on that asset uses it. To
keep priority for a later order, send a new `priority_bid`.

**What you get.** The bid moves your flow toward the front of the block. It is a
placement preference, not a guarantee. It does not reserve a price, it does not
change how the order matches, and it does not skip a risk check.

---

### Submit a threshold-encrypted order {#submit_encrypted_order}

**Status: available on testnet (preview).** The action is accepted and the
pending-pool mechanics below apply, but the threshold-encrypted order pipeline
is still a preview surface — expect changes before it is production-grade.

Post a threshold-encrypted order ciphertext into the pending pool. The plaintext
is hidden until `target_block` and a threshold of decryption shares.

```json
{
  "type": "submit_encrypted_order",
  "params": {
    "ciphertext":         [1, 2, 3],
    "commitment":         [0, 0, /* … 32 bytes … */ 0],
    "threshold":          2,
    "target_block":       100,
    "reveal_deadline_ms": 5000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ciphertext` | byte array | Wire bytes of the encrypted order (bounded) |
| `commitment` | 32-byte array | `keccak(plaintext‖salt)` commitment |
| `threshold` | uint8 | Shares required to reveal (`≥ 1`) |
| `target_block` | uint64 | Block at/after which decryption may proceed |
| `reveal_deadline_ms` | uint64 | Consensus-time (ms) after which reveal is barred |

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission). The
pending-pool depth after the push is carried in the **commit outcome**, not the
HTTP body. An empty or over-sized ciphertext, a zero `threshold`, or a full
pending pool errors at commit.

---

### Retired alias: `encrypted_order_submit` {#encrypted_order_submit}

:::danger Retired — do not call
`encrypted_order_submit` decodes, and `/exchange` then refuses it:

```json
{"error":{"code":"ACTION_UNSUPPORTED","message":"encrypted_order_submit is deprecated; use submit_encrypted_order"}}
```

Post [`submit_encrypted_order`](#submit_encrypted_order) instead. **Same fields,
same signed digest** — the alias never had a second signing form, so a client
changes one string and keeps its signing code unchanged.
:::

**The refusal is unconditional.** It is not a height gate and no upgrade re-opens
the name: every well-formed post gets it, at every height, whatever the
signature. The refusal also lands **before** signature recovery, so a valid
signature reads the same as a bad one.

The tag stays in the action enum so that every committed block still decodes.

---
