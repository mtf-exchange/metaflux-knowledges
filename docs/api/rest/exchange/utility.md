---
description: "Bid for priority block placement, and submit a threshold-encrypted order."
---

# Priority and encrypted-order actions {#priority--encrypted-order-actions}

These actions bid for priority block placement and submit a threshold-encrypted order.

They are actions on [`POST /exchange`](../exchange.md). That page describes the
request envelope, the EIP-712 signing rules, the number planes and the response
shape. These apply to every action here.

### Pay for priority block placement {#priority_bid}

This action pays a priority fee to move your flow toward the front of the next
block. The bid is a rate in basis points, and it applies to one asset.

```json
{
  "type": "priority_bid",
  "params": { "asset": 8, "bid_bps": 6 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | The asset that this bid is bound to |
| `bid_bps` | uint16 | Bid rate in basis points, `1` to `8` |

**Bounds.** `bid_bps` must be from `1` to `8`. The chain rejects a bid of `0`
and a bid above `8`. A rejected bid stores nothing and costs nothing.

**One bid per asset.** A second `priority_bid` on the same asset replaces the
first. Bids on different assets are independent.

**Charge.** The bid is a rate, not an amount. Your next perpetual order on that
asset pays the charge. The exchange multiplies the filled notional of that
order by `bid_bps / 10000` and truncates toward zero. The charge is in addition
to your usual taker fee, and it goes to the same protocol fee pools.

**Consumption.** Your next perpetual order on that asset consumes the bid. This
is true when the order fills and when it does not. It is also true when the
charge truncates to zero. An unused bid stays until an order on that asset uses
it. To keep priority for a later order, send a new `priority_bid`.

**Effect.** The bid moves your flow toward the front of the block. It is a
placement preference, not a guarantee. It does not reserve a price, it does not
change how the order matches, and it does not skip a risk check.

---

### Submit a threshold-encrypted order {#submit_encrypted_order}

**Status: available on testnet (preview).** The chain accepts the action, and
the pending-pool mechanics below apply. The threshold-encrypted order pipeline
is still a preview surface. Expect changes before it is production-grade.

This action posts a threshold-encrypted order ciphertext into the pending pool.
The plaintext stays hidden until `target_block` and a threshold of decryption
shares.

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
| `target_block` | uint64 | The block at or after which decryption can start |
| `reveal_deadline_ms` | uint64 | Consensus time (ms) after which a reveal is not allowed |

**Response.** This is a non-order action. It returns the
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).
The commit outcome has the pending-pool depth after the push. The HTTP body
does not. The action fails at commit on an empty or over-sized ciphertext, a
zero `threshold`, or a full pending pool.

---

### Retired `encrypted_order_submit` alias {#encrypted_order_submit}

:::danger Retired, do not call
`encrypted_order_submit` decodes, and then `/exchange` refuses it:

```json
{"error":{"code":"ACTION_UNSUPPORTED","message":"encrypted_order_submit is deprecated; use submit_encrypted_order"}}
```

Post [`submit_encrypted_order`](#submit_encrypted_order) instead. **It has the
same fields and the same signed digest.** The alias never had a second signing
form. A client changes one string and keeps its signing code.
:::

**The refusal is unconditional.** It is not a height gate, and no upgrade opens
the name again. Every well-formed post gets it, at every height, with any
signature. The refusal also occurs before signature recovery, so a valid
signature gets the same answer as a bad one.

The tag stays in the action enum so that every committed block still decodes.

---
