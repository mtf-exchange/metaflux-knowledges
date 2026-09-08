---
description: "Agent wallets, display name, referrer, broker-fee ceiling, credit claims, multi-sig conversion, sub-accounts, and the account's margin-mode configuration."
---

# Account & access actions

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

### Approve an agent wallet {#approve_agent}

Approve an agent wallet to sign on the account's behalf. See [agent wallets](../../../concepts/agent-wallets.md) for the lifecycle.

```json
{
  "type": "approve_agent",
  "params": {
    "agent":         "0x00000000000000000000000000000000000000aa",
    "name":          "trading-bot-1",
    "expires_at_ms": 1735689600000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agent` | hex address | 20-byte address of the agent's signing key |
| `name` | string \| null | Optional bookkeeping label |
| `expires_at_ms` | uint64 \| null | Unix-ms expiry; `null` = never expires |

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

There is no synchronous approval confirmation in the HTTP body — track the
commit via the returned `action_hash`.

**Common errors** (at commit): `cannot approve self` (the agent address equals
the sender), `zero address`. Re-approving an already-approved agent
**overwrites** its entry (`name` + `expires_at_ms`) rather than erroring.

Becomes effective **one block after commit**. Submitting an agent-signed action before then returns `401`.

---

### Set the account display name {#set_display_name}

Set the account's human-readable handle.

```json
{
  "type": "set_display_name",
  "params": { "display_name": "alice.mtf" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `display_name` | string | The handle (e.g. `alice.mtf`) |

---

### Bind the account to a referrer {#set_referrer}

Bind the account to a referrer **address** (not a code).

```json
{
  "type": "set_referrer",
  "params": { "referrer": "0x00000000000000000000000000000000000000bb" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `referrer` | hex address | 20-byte referrer address |

Settable **once** per account. A later attempt is refused with `PRECONDITION_FAILED`, whose `message` names the reason.

---

### Approve a broker fee ceiling {#approve_builder_fee}

Approve a broker address up to a fee ceiling (bps). `0` revokes; the core handler caps at 8 bps.

```json
{
  "type": "approve_broker_fee",
  "params": {
    "builder": "0x00000000000000000000000000000000000000aa",
    "max_bps": 7
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `builder` | hex address | 20-byte broker address. The field keeps the `builder` name |
| `max_bps` | uint16 | Max approved fee in bps (`0` revokes; capped at 8) |

:::note
**Both action types are accepted.** `approve_broker_fee` is the name to send.
`approve_builder_fee` still decodes and always will: a committed block keeps the
JSON the trader submitted, and replay reads it again. The EIP-712 type string
stays `ApproveBuilderFee`, which no signature lets you change — see
[broker codes](../../../concepts/broker-codes.md#approval).
:::

---

### Claim accrued referral credit {#claim_referral_rewards}

Drain the sender's whole accrued referral credit into spendable
cross-collateral. No parameters.

```json
{ "type": "claim_referral_rewards", "params": {} }
```

**The action reports no amount.** Read the balance first with
[`referral_state`](../info/fees-credit.md#referral_state). After the claim, the credit is `0`
and the read no longer tells you what moved.

**An agent wallet cannot claim for its owner.** The action is sender-authorized
and carries no `owner` field, so it always acts on the recovered signer's own
account. Sign it with the master key.

**The call is idempotent.** Claiming with nothing accrued claims `0` and is not
an error, so a retry after a timeout is safe.

---

### Claim accrued broker-code credit {#claim_builder_rewards}

Drain the sender's whole accrued broker-code fee credit into spendable
cross-collateral. No parameters.

```json
{ "type": "claim_broker_rewards", "params": {} }
```

**Both names are accepted.** `claim_broker_rewards` is the name to send.
`claim_builder_rewards` still decodes and always will, for the same reason
[`approve_broker_fee`](#approve_builder_fee) keeps its second name. The read
beside it keeps the `builder` spelling and is
[`builder_state`](../info/fees-credit.md#builder_state).

**The action reports no amount.** Read the balance first with
[`builder_state`](../info/fees-credit.md#builder_state).

**An agent wallet cannot claim for its owner.** The action is sender-authorized
and carries no `owner` field, so it always acts on the recovered signer's own
account. Sign it with the master key.

**The call is idempotent.** Claiming with nothing accrued claims `0` and is not
an error. See [broker codes](../../../concepts/broker-codes.md#claiming).

---

### Convert the account to multi-sig {#convert_to_multi_sig_user}

Register a multi-sig roster on the account. It takes effect at that commit.

```json
{
  "type": "convert_to_multi_sig_user",
  "params": {
    "signers": [
      "0x00000000000000000000000000000000000000aa",
      "0x00000000000000000000000000000000000000bb"
    ],
    "threshold": 2
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `signers` | array of hex addresses | The multi-sig signer set |
| `threshold` | uint32 | M-of-N threshold: at least `1`, and no more than the number of `signers`. The one exception is the disable form below, which pairs an empty `signers` with `threshold: 0` |

:::warning Only the roster can change the roster
From that commit on, a plain signed action from the account is refused. The
account acts only through the [`multi_sig`](#multi_sig) wrapper below — including
when it re-keys or turns multi-sig off. Both are the same action wrapped in a
`multi_sig` envelope that the current roster signs:

- **Re-key**: a new `signers` + `threshold`. It replaces the roster.
- **Disable**: `signers: []` with `threshold: 0`. It removes the roster and
  returns the account to its single key.

So register a roster you can still reach a quorum on. If you lose the quorum, you
lose the account, because nothing outside the roster can repair it.
:::

See [multi-sig](../../../concepts/multi-sig.md).

---

### Execute an inner action as a multi-sig account {#multi_sig}

This is the collect-and-execute wrapper. It is the **only** way a converted account acts.
It carries ONE inner action as opaque bytes, plus the roster signatures that
authorize it, and it runs that inner action **as `user`**. Register the roster
first with [`convert_to_multi_sig_user`](#convert_to_multi_sig_user); see
[multi-sig](../../../concepts/multi-sig.md#acting-as-multi-sig) for the worked flow
and the inner digest.

**Anyone may submit it.** The outer envelope is signed by the submitter with the
submitter's own key, and the submitter need not be on the roster — a coordinator,
or any one signer, can broadcast the assembled bundle. All authority comes from
the recovered addresses in `signatures`.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:MultiSig`.

```json
{
  "type": "multi_sig",
  "params": {
    "user":              "0x00000000000000000000000000000000000004a1",
    "inner_action_blob": "0x7b2274797065223a2263616e63656c5f616c6c5f6f7264657273227d",
    "signatures":        ["0x<65-byte sig>", "0x<65-byte sig>"],
    "nonce":             1735689600099
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `user` | hex address | 40 hex chars | The multi-sig account. It must already carry a registered roster |
| `inner_action_blob` | hex string | `0x`-hex, non-empty | The canonical JSON bytes of the inner action. These EXACT bytes are what every signer signs and what the server hashes. They are never re-serialized |
| `signatures` | array of hex strings | each 65 bytes | Roster signatures over the inner digest. There is no per-entry signer field — the signer is recovered |
| `nonce` | uint64 | | The inner nonce. It advances **`user`'s** nonce window, and every signer folds it into the inner digest |

There is no `signers` field on the wire. A declared list would not add authority:
the roster membership is what counts, and it is recovered, not declared.

**The two nonces are checked against two different accounts.** `params.nonce`
advances `user`'s window inside the handler. The envelope's own top-level `nonce`
advances the **submitter's** window before dispatch. Setting them equal is the
convention, and it is what the [worked flow](../../../concepts/multi-sig.md) shows,
but the chain does not compare them.

**The rules, written as rejections.**

| The call | Result |
|----------|--------|
| `user` has no registered roster, or a zero threshold | **Rejected** — `user not multi-sig` / `multi-sig threshold zero` |
| An empty `inner_action_blob` | **Rejected**, `InvalidParams` — `empty inner_action_blob` |
| A signature of the wrong length, or from a non-roster key | **Silently skipped.** One malformed entry must not block an otherwise valid quorum, so it is not an error — it does not count |
| Fewer than `threshold` **distinct** roster signers recovered | **Rejected**, `AUTH_UNAUTHORIZED` |
| A stale or replayed `params.nonce` | **Rejected** — `stale or replayed multi-sig nonce` |
| An inner action outside the executable set: a governance vote, a system write, or a nested `multi_sig` | **Rejected**, `AUTH_UNAUTHORIZED` — and `user`'s nonce has **already advanced**. This is deliberate: a valid quorum cannot retry the same nonce with a privileged body swapped in |
| An inner blob whose own `owner` field names an account other than `user` | **Rejected**, `InvalidParams` — `inner_action_blob owner must be the multisig user` |

**The nonce advances the moment the quorum verifies, and before the blob is
even decoded.** So a bad-signature attempt never burns `user`'s nonce, and
EVERY failure after a valid quorum does — an undecodable blob, the `owner`
mismatch, a non-executable inner, and an inner that fails its own handler.

That is deliberate: a valid quorum must not be able to retry one nonce with a
different body. The consequence for a caller is the part to remember. **After
any of those refusals, re-sign with the NEXT nonce.** Retrying the same one gets
`stale or replayed multi-sig nonce`, which reads like a replay guard firing on a
request that was never accepted.

:::warning Every authorization failure reads the same
`AUTH_UNAUTHORIZED` carries the flat message `"unauthorized"`. It does **not**
say which check failed: threshold not met, signer not in the roster, and inner
action not executable all answer with that one string. Diagnose by re-deriving
the inner digest and the recovered addresses on your own side.
:::

**The inner action runs as `user`**, so every rule that applies to `user` posting
it directly applies here too, including its own margin and balance gates.

---

### Create a sub-account {#create_sub_account}

Open a sub-account owned by the sender (the recovered signer becomes the sole
master). The sub-account gets a derived on-chain address that carries its own
balances. **Sender-authorized** — no `owner` field.

```json
{
  "type": "create_sub_account",
  "params": {
    "name":             "trading-bot-1",
    "explicit_index":   null,
    "shared_stp_group": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable label for the sub-account (non-empty) |
| `explicit_index` | uint32 \| null | Optional explicit sub-account index; `null` = use the next free index. An in-use explicit index is rejected at commit (`index in use`) |
| `shared_stp_group` | bool | Whether the sub-account shares the parent's self-trade-prevention group |

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission). The
assigned `sub_id` and derived sub-account address are carried in the **commit
outcome**, not the HTTP body — track the commit via the returned `action_hash`.

**Common errors** (at commit): `empty name`, `index in use`.

---

### Transfer collateral between master and sub-account {#sub_account_transfer}

Move perp cross-margin USDC collateral between the master account and one of its
sub-accounts. **Sender-authorized** — no `owner` field; the signer is the master.

```json
{
  "type": "sub_account_transfer",
  "params": {
    "sub_index": 0,
    "deposit":   true,
    "amount":    "150.5"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sub_index` | uint32 | Index of the sender's sub-account (as assigned at create time) |
| `deposit` | bool | `true` = master → sub; `false` = sub → master |
| `amount` | decimal string | Cross-margin USDC to move (`> 0`), as a JSON string |

The source must hold at least `amount` of free cross-collateral; debit + credit
are equal so the parent-plus-subs total is conserved.

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

**Common errors** (at commit): `amount must be positive`, `sub account not
found` (unknown/unowned `sub_index`), `insufficient cross collateral`.

---

### Transfer spot tokens between master and sub-account {#sub_account_spot_transfer}

Move a **spot token** balance between the master account and one of its
sub-accounts. **Sender-authorized** — no `owner` field.

```json
{
  "type": "sub_account_spot_transfer",
  "params": {
    "sub_index": 0,
    "token":     101,
    "deposit":   false,
    "amount":    "42"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sub_index` | uint32 | Index of the sender's sub-account |
| `token` | uint32 | Spot token id to move |
| `deposit` | bool | `true` = master → sub; `false` = sub → master |
| `amount` | decimal string | Token amount to move (`> 0`), as a JSON string |

The source must hold at least `amount` of the token; the per-token parent-plus-sub
total is conserved.

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

**Common errors** (at commit): `amount must be positive`, `sub account not
found`, `insufficient spot balance`.

---

### Toggle one-way vs hedge position mode {#set_position_mode}

Toggle the account between one-way (single net position per market) and
[hedge mode](../../../concepts/hedge-mode.md) (a separate long leg and short leg per
market). **Sender-authorized by default** — omit `owner` and the recovered
signer is the actor; an approved agent may toggle it **as** an `owner` it acts
for.

```json
{
  "type": "set_position_mode",
  "params": { "hedge": true }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional: toggle **as** this account (approved agents only). **Not** digest-bound — resolved at admission |
| `hedge` | bool | `true` / `false` | `true` = hedge (two-way), `false` = one-way (the default) |

**Precondition — flat on all markets.** The toggle is only legal when the sender
holds **no open position on any market** (every leg flat). If any position is
open, the action is rejected as a **clean no-op** (state is left byte-identical):
this prevents an existing net position from being silently re-interpreted as a
stranded leg. Setting the mode to the value it already has, while flat, is a
no-op success.

**Common errors**: `precondition failed: cannot change position mode with an
open position` (the account is not flat).

:::info
Once an account is in hedge mode, **every order must carry an explicit
`position_side`** (`"long"` / `"short"`) — see
[`position_side` on `submit_order`](./orders.md#position_side-hedge-mode). Per-leg margin /
liquidation and dual-leg position reporting are still rolling out; see
[hedge mode](../../../concepts/hedge-mode.md) for the current availability.
:::

---

### Toggle DEX-abstraction for the account — removed {#user_dex_abstraction}

:::danger
**Removed. Do not send this action.** `user_dex_abstraction` was deleted at the
`0.7.0` re-genesis and has no handler. A submit returns
`400` with `ACTION_UNSUPPORTED`.

MetaFlux runs one unified account with portfolio margin, so there are no separate
DEXes to abstract over. There is no replacement action and none is planned. The
action id stays permanently reserved and is never reused.
:::

---

### Set the account's margin mode and per-product reservations {#user_set_abstraction}

Chooses the margin mode, and — in `standard` mode — how much USDC each product may
encumber.

```json
{
  "type": "user_set_abstraction",
  "params": { "kind": 0, "value": "1" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `kind` | uint8 | `0` sets the mode; `1` perp, `2` spot, `3` option reservation. Any other value is rejected. |
| `value` | decimal (string or number) | For `kind: 0`, `0` = unified or `1` = standard. For a reservation, whole USDC; `0` removes it. |

**Modes.** `unified` is the default and the behaviour every account has today:
one collateral pool, any product may draw on all of it. `standard` splits that
pool by product — collateral one product has committed is not available to
another.

**A reservation is a CEILING ON ENCUMBRANCE, not on spending.** This is the rule
callers get wrong, so read it before you set one. A reservation caps how much
USDC a product may have COMMITTED at one time — perp margin, an option writer's
escrow, a spot-margin borrow. It does not cap what a product may SPEND. An option
PREMIUM and a plain spot BUY are conversions, not encumbrance: the USDC leaves the
account and something else arrives, so they are bounded by your balance, never by
a reservation. Only the escrow the option WRITER posts is bounded by the option
reservation.

**Entering `standard` with no reservations admits nothing.** Every product's
ceiling starts at zero, so a new standard-mode account can open no position until
it allocates. That is deliberate and fail-closed.

**A mode change needs a FLAT account.** Every perp leg, spot order, spot-margin
position, option position, live TWAP, parked trigger and open RFQ must be gone.
The rejection names the first surface it found. A RESERVATION change needs no
flat account — but lowering one below what is already committed does not release
anything, it only stops further commitment. Lowering a reservation is always
allowed, even when your equity has fallen below the total already reserved.

**`standard` and `portfolio` are mutually exclusive.** Each refuses the other, in
both directions.

Rejections, all `Precondition` unless noted:

| Message | Cause |
|---|---|
| `unknown abstraction kind` (`InvalidParams`) | `kind` above 3 |
| `abstraction mode must be 0 (unified) or 1 (standard)` (`InvalidParams`) | a `kind: 0` value that is neither |
| `reservation must be >= 0` (`InvalidParams`) | a negative reservation |
| `reservations require standard abstraction mode` | a reservation set on a unified account |
| `reservations exceed account value` | an INCREASE whose new total exceeds account value |
| `cannot change abstraction while enrolled in portfolio margin` | PM enrolled |
| `cannot change abstraction with <surface>` | the account is not flat |

---

### Set another user's abstraction config {#agent_set_abstraction}

Agent-scope abstraction config: an agent signs to update another user's config.
The core handler enforces the agent-approval check against `user` at dispatch.

```json
{
  "type": "agent_set_abstraction",
  "params": {
    "user":  "0x00000000000000000000000000000000000000bb",
    "kind":  1,
    "value": "9.9"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user` | hex address | The user whose config the agent is updating |
| `kind` | uint8 | Sub-type tag |
| `value` | decimal (string or number) | Setting value |

---
