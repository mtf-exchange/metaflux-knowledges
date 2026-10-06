---
description: "Agent wallets, display name, referrer and referral code, broker-fee ceiling, credit claims, multi-sig conversion, sub-accounts, and the margin-mode configuration of the account."
---

# Account & access actions

These actions manage agent wallets, referrals, broker fees, multi-sig, sub-accounts and the margin mode of an account, through [`POST /exchange`](../exchange.md).

That page defines the request envelope, the EIP-712 signing rules, the number planes and the response shape. They apply to every action here.

### Approve an agent wallet {#approve_agent}

`approve_agent` approves an agent wallet to sign for the account. See [agent wallets](../../../concepts/agent-wallets.md) for the lifecycle.

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
| `agent` | hex address | The 20-byte address of the signing key of the agent |
| `name` | string \| null | An optional bookkeeping label |
| `expires_at_ms` | uint64 \| null | The expiry in Unix ms. `null` means that the approval never expires |

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The HTTP body carries no synchronous approval confirmation. Track the commit through the returned `action_hash`.

Common errors at commit: `cannot approve self` (the agent address equals the sender) and `zero address`. If you approve an agent that is already approved, the node overwrites its entry (`name` and `expires_at_ms`) and does not error.

The approval takes effect one block after the commit. An agent-signed action that you submit before then returns `401`.

---

### Set the account display name {#set_display_name}

`set_display_name` sets the human-readable handle of the account.

```json
{
  "type": "set_display_name",
  "params": { "display_name": "alice.mtf" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `display_name` | string | The handle (for example `alice.mtf`) |

---

### Bind the account to a referrer {#set_referrer}

`set_referrer` binds the account to a referrer address. To bind by a referral code, send [`set_referrer_by_code`](#set_referrer_by_code). See [the referral program](../../../concepts/fees.md#referral-binding) for what a bind does.

:::info
Referral codes are on since 2026-10-05. So this action accepts only a referrer that holds a code. An address without a code fails with `referrer has no referral code`. Build an invite link from the code, not from the address, and bind with [`set_referrer_by_code`](#set_referrer_by_code).
:::

```json
{
  "type": "set_referrer",
  "params": { "referrer": "0x00000000000000000000000000000000000000bb" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `referrer` | hex address | The 20-byte referrer address |

You can set the referrer once per account. No action and no governance vote can change it later.

The commit rejects the action in the order below. `code` is `PRECONDITION_FAILED` on every row. `message` starts with `invalid parameters: ` on the first two rows and with `precondition failed: ` on the others. The text below follows that prefix.

| The call | `message` text |
|----------|----------------|
| `referrer` is the sender | `cannot refer self` |
| `referrer` is the zero address | `zero referrer` |
| The sender already has referees | `an account with referees cannot set a referrer` |
| The sender holds a referral code | `an account with a referral code cannot set a referrer` |
| `referrer` has a referrer of its own | `multi-level referral chains are not allowed` |
| The sender already has a referrer | `referrer already set (immutable per §L.5.1)` |
| Referral codes are on, and `referrer` holds no code | `referrer has no referral code` |

Referrals are single-level. The node refuses a referrer that is a referee, and it refuses a sender that is already a referrer. Without the second check, the order `carol` to `bob`, then `bob` to `alice`, builds a chain. A code holder cannot bind either. If it did, every later bind to its code would fail as a multi-level chain.

While codes are on, a bind by address needs a referrer that holds a code. Otherwise one trader could bind a fresh second address to itself and skip the 30-day volume that a code costs. While codes are off, a bind by address needs no code.

---

### Register a referral code {#register_referral_code}

:::info
Referral codes are on since 2026-10-05. The code minimum, `referral_code_min_volume_usd`, is 10,000 USDC of trailing 30-day volume. It is a governed value. Read the value in force from [`fee_schedule`](../info/fees-credit.md#fee_schedule). A vote that sets it to `0` turns codes off. The node then refuses this action with `referral codes are not enabled`.
:::

`register_referral_code` registers the referral code of the sender. A referee then binds to the sender with [`set_referrer_by_code`](#set_referrer_by_code).

```json
{
  "type": "register_referral_code",
  "params": { "code": "alice1" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | 3 to 16 characters, `a-z` and `0-9` only |

The EIP-712 type string is `MetaFluxTransaction:RegisterReferralCode(string metafluxChain,string code,uint64 nonce)`. Sign it with the master key. An agent wallet cannot register a code for its owner.

The commit rejects the action in the order below. `code` is `PRECONDITION_FAILED` on every row. `message` starts with `invalid parameters: ` on the first row and with `precondition failed: ` on the others. The text below follows that prefix.

| The call | `message` text |
|----------|----------------|
| `code` is shorter than 3, longer than 16, or holds a character outside `a-z0-9`, uppercase included | `referral code must be 3-16 characters, a-z and 0-9` |
| Referral codes are off: `referral_code_min_volume_usd` is `0` | `referral codes are not enabled` |
| `code` is a reserved word | `referral code is reserved` |
| The sender already holds a code | `account already has a referral code` |
| The sender has a referrer | `a referred account cannot hold a referral code` |
| Another account holds `code` | `referral code is taken` |
| The pooled 30-day taker plus maker volume of the sender is below `referral_code_min_volume_usd` | `30-day volume is below the referral code minimum` |

Each rule has a reason:

- The node refuses an uppercase letter and does not fold it. So the signed bytes and the stored code are the same, and one code has one spelling.
- A code never changes, because a referee that is bound to it must keep its referrer.
- A reserved word (`mtf`, `metaflux`, `admin`, `official`, `support`, `team`, `help`, `referral`, `hyperliquid`, `hl`) reads as the exchange and would mislead a referee.
- A referee cannot hold a code, because referrals are single-level.
- The volume rule makes each new referrer identity trade first.

Check the volume rule before you sign: [`referral_state`](../info/fees-credit.md#referral_state) `code_requirement.eligible`.

---

### Bind the account to a referrer by code {#set_referrer_by_code}

`set_referrer_by_code` binds the sender to the account that holds a referral code. The node resolves the code to its owner, then applies every [`set_referrer`](#set_referrer) rule to that owner.

```json
{
  "type": "set_referrer_by_code",
  "params": { "code": "alice1" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | The referral code of the referrer, in lowercase |

The EIP-712 type string is `MetaFluxTransaction:SetReferrerByCode(string metafluxChain,string code,uint64 nonce)`. Sign it with the master key.

The commit rejects the action with `PRECONDITION_FAILED`:

| The call | `message` text |
|----------|----------------|
| No account holds `code`. The node does not fold the case, so `Alice1` does not match `alice1` | `unknown referral code` |
| The owner fails a `set_referrer` rule | the same text as [`set_referrer`](#set_referrer) |

A bind is permanent. Show the referee the owner first, with [`referral_code`](../info/fees-credit.md#referral_code), and bind only after the referee confirms it. An invite link carries the code in the form `https://app.mtf.exchange/join/<code>`.

---

### Approve a broker fee ceiling {#approve_builder_fee}

`approve_broker_fee` approves a broker address up to a fee ceiling in bps. `0` revokes the approval. The core handler caps the ceiling at 8 bps.

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
| `builder` | hex address | The 20-byte broker address. The field keeps the `builder` name |
| `max_bps` | uint16 | The maximum approved fee in bps (`0` revokes, capped at 8) |

:::note
The node accepts both action types. Send `approve_broker_fee`. `approve_builder_fee` still decodes and always will, because a committed block keeps the JSON that the trader submitted, and replay reads it again. The EIP-712 type string stays `ApproveBuilderFee`, and no signature lets you change it. See [broker codes](../../../concepts/broker-codes.md#approval).
:::

---

### Claim accrued referral credit {#claim_referral_rewards}

`claim_referral_rewards` drains the whole accrued referral credit and the whole accrued broker-code credit of the sender into spendable cross-collateral. It takes no parameters.

```json
{ "type": "claim_referral_rewards", "params": {} }
```

Either claim action claims both credits. `claim_referral_rewards` and [`claim_broker_rewards`](#claim_builder_rewards) do the same thing. One fill can pay an account both credits, and a trader wants one button and not two. Send either one. A second claim right after the first claims `0`.

The response reports no amount. The `/exchange` reply is the admission payload. Read the two balances first, with [`referral_state`](../info/fees-credit.md#referral_state) and [`broker_state`](../info/fees-credit.md#broker_state). After the claim, both credits are `0`, and the reads no longer tell you what moved. The [`node_actions`](../../../nodes/data-streams.md#node_actions-result) row of the claim carries the total and the two parts.

Only the referral part counts as claimed referral credit. `referral_state.referrer_stats.claimed` grows by the referral part. The broker part does not change it.

An agent wallet cannot claim for its owner. The action is sender-authorized and carries no `owner` field, so it always acts on the account of the recovered signer. Sign it with the master key.

The call is idempotent. A claim with nothing accrued claims `0` and is not an error, so a retry after a timeout is safe.

---

### Claim accrued broker-code credit {#claim_builder_rewards}

`claim_broker_rewards` drains the whole accrued broker-code credit and the whole accrued referral credit of the sender into spendable cross-collateral. It takes no parameters.

```json
{ "type": "claim_broker_rewards", "params": {} }
```

This is the same claim as [`claim_referral_rewards`](#claim_referral_rewards). Either action claims both credits. The rules there apply here.

The node accepts both names. Send `claim_broker_rewards`. `claim_builder_rewards` still decodes and always will, for the same reason that [`approve_broker_fee`](#approve_builder_fee) keeps its second name. The read beside it keeps the `builder` spelling: [`broker_state`](../info/fees-credit.md#broker_state).

An agent wallet cannot claim for its owner. Sign it with the master key. See [broker codes](../../../concepts/broker-codes.md#claiming).

---

### Convert the account to multi-sig {#convert_to_multi_sig_user}

`convert_to_multi_sig_user` registers a multi-sig roster on the account. It takes effect at that commit.

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
| `signers` | array of hex addresses | The multi-sig signer set: at most 16, all distinct. The node refuses a longer list with `at most 16 signers`, and it refuses a repeated address with `signers must be distinct`. A repeat would let `threshold` exceed the distinct count that the quorum reads, and the account could then never act. See [multi-sig](../../../concepts/multi-sig.md#conversion) |
| `threshold` | uint32 | The M-of-N threshold: at least `1`, and no more than the number of `signers`. The one exception is the disable form below, which pairs an empty `signers` with `threshold: 0` |

:::warning Only the roster can change the roster
From that commit on, the node refuses a plain signed action from the account. The account acts only through the [`multi_sig`](#multi_sig) wrapper below. That includes a re-key and the move that turns multi-sig off. Both are the same action, wrapped in a `multi_sig` envelope that the current roster signs:

- Re-key: a new `signers` and `threshold`. It replaces the roster.
- Disable: `signers: []` with `threshold: 0`. It removes the roster and returns the account to its single key.

So register a roster that can still reach a quorum. If you lose the quorum, you lose the account, because nothing outside the roster can repair it.
:::

See [multi-sig](../../../concepts/multi-sig.md).

---

### Execute an inner action as a multi-sig account {#multi_sig}

`multi_sig` is the collect-and-execute wrapper. It is the only way that a converted account acts. It carries one inner action as opaque bytes, plus the roster signatures that authorize it. It runs that inner action as `user`. Register the roster first with [`convert_to_multi_sig_user`](#convert_to_multi_sig_user). See [multi-sig](../../../concepts/multi-sig.md#acting-as-multi-sig) for the worked flow and the inner digest.

Anyone can submit it. The submitter signs the outer envelope with the key of the submitter, and the submitter does not need to be on the roster. A coordinator, or any one signer, can broadcast the assembled bundle. All authority comes from the recovered addresses in `signatures`.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is `MetaFluxTransaction:MultiSig`.

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
| `inner_action_blob` | hex string | `0x`-hex, non-empty | The canonical JSON bytes of the inner action. Every signer signs these exact bytes, and the server hashes them. The node never serializes them again |
| `signatures` | array of hex strings | each 65 bytes | The roster signatures over the inner digest. There is no per-entry signer field, because the node recovers the signer |
| `nonce` | uint64 | | The inner nonce. It advances the nonce window of `user`, and every signer folds it into the inner digest |

There is no `signers` field on the wire. A declared list would add no authority. Roster membership is what counts, and the node recovers it and does not take it from a declaration.

Only `params.nonce` moves a window. It advances the window of `user` inside the handler, after the roster quorum verifies. The top-level `nonce` of the envelope advances no window, so the window of the submitter does not move. The convention is to set the two equal, and the [worked flow](../../../concepts/multi-sig.md) shows that. The chain does not compare them. The reason: anyone can submit the envelope, and the roster quorum is its only authority. So it moves only the window of the account that it acts for. The rule is in force since [block 16,450,001](../../../changelog/block-16450001.md#multi-sig-nonce).

These are the rules, written as rejections:

| The call | Result |
|----------|--------|
| `user` has no registered roster, or a zero threshold | Rejected: `user not multi-sig` / `multi-sig threshold zero` |
| An empty `inner_action_blob` | Rejected, `InvalidParams`: `empty inner_action_blob` |
| More than 16 entries in `signatures` | Rejected, `PRECONDITION_FAILED`: `at most 16 signatures`. A roster holds at most 16 signers, so extra entries never raise the count |
| A signature of the wrong length, or from a non-roster key | Skipped in silence. One malformed entry must not block an otherwise valid quorum, so it is not an error. It does not count |
| Fewer than `threshold` distinct roster signers recovered | Rejected, `AUTH_UNAUTHORIZED` |
| A stale or replayed `params.nonce` | Rejected: `stale or replayed multi-sig nonce` |
| An inner action outside the executable set: a governance vote, a system write, or a nested `multi_sig` | Rejected, `AUTH_UNAUTHORIZED`. The nonce of `user` has already advanced. This is deliberate: a valid quorum cannot retry the same nonce with a privileged body swapped in |
| An inner blob whose own `owner` field names an account other than `user` | Rejected, `InvalidParams`: `inner_action_blob owner must be the multisig user` |

The nonce advances the moment the quorum verifies, and before the node decodes the blob. So a bad-signature attempt never burns the nonce of `user`. Every failure after a valid quorum does burn it: an undecodable blob, the `owner` mismatch, a non-executable inner action, and an inner action that fails its own handler.

This is deliberate, because a valid quorum must not be able to retry one nonce with a different body. For a caller, the consequence is the part to remember. After any of those refusals, sign again with the next nonce. If you retry the same nonce, you get `stale or replayed multi-sig nonce`. That reads like a replay guard that fires on a request that the node never accepted.

:::warning Every authorization failure reads the same
`AUTH_UNAUTHORIZED` carries the flat message `"unauthorized"`. It does not say which check failed. A threshold that is not met, a signer that is not in the roster, and an inner action that is not executable all answer with that one string. To diagnose, derive the inner digest and the recovered addresses again on your own side.
:::

The inner action runs as `user`. So every rule that applies when `user` posts it directly applies here too, including its own margin and balance gates.

---

### Create a sub-account {#create_sub_account}

`create_sub_account` opens a sub-account that the sender owns. The recovered signer becomes the sole master. The sub-account gets a derived on-chain address that carries its own balances. The action is sender-authorized: it has no `owner` field.

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
| `name` | string | A human-readable label for the sub-account (non-empty) |
| `explicit_index` | uint32 \| null | An optional explicit sub-account index. `null` uses the next free index. The commit rejects an index that is in use (`index in use`) |
| `shared_stp_group` | bool | Whether the sub-account shares the self-trade-prevention group of the parent |

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission). The commit outcome carries the assigned `sub_id` and the derived sub-account address. The HTTP body does not carry them. Track the commit through the returned `action_hash`.

Common errors at commit: `empty name`, `index in use`.

---

### Transfer collateral between master and sub-account {#sub_account_transfer}

`sub_account_transfer` moves perp cross-margin USDC collateral between the master account and one of its sub-accounts. The action is sender-authorized: it has no `owner` field, and the signer is the master.

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
| `sub_index` | uint32 | The index of the sub-account of the sender, as assigned at create time |
| `deposit` | bool | `true` moves master to sub. `false` moves sub to master |
| `amount` | decimal string | The cross-margin USDC to move (`> 0`), as a JSON string |

The source must hold at least `amount` of free cross-collateral. The debit and the credit are equal, so the total of the parent and its subs is conserved.

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

Common errors at commit: `amount must be positive`, `sub account not found` (an unknown or unowned `sub_index`), `insufficient cross collateral`.

---

### Transfer spot tokens between master and sub-account {#sub_account_spot_transfer}

`sub_account_spot_transfer` moves a spot token balance between the master account and one of its sub-accounts. The action is sender-authorized: it has no `owner` field.

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
| `sub_index` | uint32 | The index of the sub-account of the sender |
| `token` | uint32 | The spot token id to move |
| `deposit` | bool | `true` moves master to sub. `false` moves sub to master |
| `amount` | decimal string | The token amount to move (`> 0`), as a JSON string |

The source must hold at least `amount` of the token. The per-token total of the parent and the sub is conserved.

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission).

Common errors at commit: `amount must be positive`, `sub account not found`, `insufficient spot balance`. A split `standard` leg moves USDC through its spot wallet. So on that leg, the USDC rejection is `insufficient spot balance` and not `insufficient cross collateral`. A pooled leg keeps `insufficient cross collateral`.

---

### Toggle one-way and hedge position mode {#set_position_mode}

`set_position_mode` toggles the account between one-way mode (one net position per market) and [hedge mode](../../../concepts/hedge-mode.md) (a separate long leg and short leg per market). The action is sender-authorized by default: omit `owner` and the recovered signer is the actor. An approved agent can toggle it as an `owner` that it acts for.

```json
{
  "type": "set_position_mode",
  "params": { "hedge": true }
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `owner` | hex address \| omitted | 40 hex chars | Optional. Toggle as this account (approved agents only). The digest does not bind it. Admission resolves it |
| `hedge` | bool | `true` / `false` | `true` is hedge (two-way). `false` is one-way (the default) |

The account must be flat on all markets. The toggle is legal only when the sender holds no open position on any market, so every leg is flat. If any position is open, the node rejects the action as a clean no-op, and the state stays byte-identical. This prevents the node from re-interpreting an existing net position as a stranded leg in silence. If you set the mode to the value that it already has while the account is flat, the action succeeds as a no-op.

Common error: `precondition failed: cannot change position mode with an open position` (the account is not flat).

:::info
Once an account is in hedge mode, every order must carry an explicit `position_side` (`"long"` or `"short"`). See [`position_side` on `submit_order`](./orders.md#position_side-hedge-mode). Per-leg margin and liquidation, and dual-leg position reporting, are still rolling out. See [hedge mode](../../../concepts/hedge-mode.md) for the current availability.
:::

---

### Toggle DEX abstraction for the account (removed) {#user_dex_abstraction}

:::danger
Removed. Do not send this action. The `0.7.0` re-genesis deleted `user_dex_abstraction`, and it has no handler. A submit returns `400` with `ACTION_UNSUPPORTED`.

MetaFlux runs one unified account with portfolio margin, so there are no separate DEXes to abstract over. There is no replacement action and none is planned. The action id stays reserved for good, and the chain never reuses it.
:::

---

### Set the margin mode and per-product reservations {#user_set_abstraction}

`user_set_abstraction` chooses the account mode. On a pooled `standard` account, it also sets how much USDC each product can encumber.

```json
{
  "type": "user_set_abstraction",
  "params": { "kind": 0, "value": "1" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `kind` | uint8 | `0` sets the mode. `1` is the perp reservation, `2` the spot reservation and `3` the option reservation. The node rejects any other value. Kinds 1–3 apply to a pooled `standard` account only. |
| `value` | decimal (string or number) | For `kind: 0`, `0` is unified and `1` is standard. For a reservation, whole USDC. `0` removes it. |

`unified` is the default mode. It has one USDC balance, and any product can draw on all of it. `standard` holds two USDC wallets, a perp wallet and a spot wallet, and only [`usd_class_transfer`](./transfers.md#usd_class_transfer) moves USDC between them. A `standard` account that entered below block 5,710,001 is pooled (`split: false` on `account_state`). It keeps one balance, and reservations divide it by product.

A reservation is a ceiling on encumbrance, not on spending. Reservations exist on a pooled account only. Callers often get this rule wrong, so read it before you set a reservation. A reservation caps how much USDC a product can have committed at one time: perp margin, the escrow of an option writer, a spot-margin borrow. It does not cap what a product can spend. An option premium and a plain spot buy are conversions, not encumbrance. The USDC leaves the account and something else arrives. So your balance bounds them, and a reservation never does. Only the escrow that the option writer posts is bounded by the option reservation.

A pooled account admits nothing that its reservations do not cover. An unset reservation is zero, and zero admits nothing. This is deliberate and fails closed.

A split account has no reservations. The node admits its perp and option orders against the free collateral of the perp wallet, and its spot orders against the spot wallet, with no cap. The node refuses kinds 1–3 on a split account, whatever the value.

A mode change needs a flat account. Every perp leg, spot order, spot-margin position, option position, live TWAP, parked trigger and open RFQ must be gone. The rejection names the first surface that the node found. A reservation change does not need a flat account. But if you lower a reservation below what the account has already committed, nothing is released. It only stops further commitment. On a pooled account, lowering a reservation is always allowed, even when your equity has fallen below the total that is already reserved.

`standard` and `portfolio` are mutually exclusive. Each refuses the other, in both directions.

From node 0.9.7 (block 5,710,001), an account that enters `standard` also splits its USDC. All of it stays in the perp wallet, the spot wallet starts empty, and only [`usd_class_transfer`](./transfers.md#usd_class_transfer) crosses. The node refuses entry while the perp wallet is below zero. An account that is already in `standard` at the swap is not split until it leaves and enters again. Leaving folds the spot wallet back into the pool, and the node refuses it while that wallet is below zero. See [the standard-mode split](../../../concepts/usdc.md#standard-split).

Rejections, all `Precondition` unless noted:

| Message | Cause |
|---|---|
| `unknown abstraction kind` (`InvalidParams`) | `kind` above 3 |
| `abstraction mode must be 0 (unified) or 1 (standard)` (`InvalidParams`) | a `kind: 0` value that is neither |
| `reservation must be >= 0` (`InvalidParams`) | a negative reservation |
| `reservations require standard abstraction mode` | a reservation set on a unified account |
| `reservations exceed account value` | an increase whose new total exceeds account value |
| `cannot change abstraction while enrolled in portfolio margin` | PM enrolled |
| `cannot change abstraction with <surface>` | the account is not flat |
| `a split standard account has no reservations` | `kind` 1, 2 or 3, any value, on a split `standard` account |
| `perp wallet is negative; cannot enter standard mode` | `kind: 0, value: 1` while the perp wallet is below zero |
| `spot wallet is negative; cannot leave standard mode` | `kind: 0, value: 0` while the spot wallet of the split account is below zero |

---

### Set the abstraction config of another user {#agent_set_abstraction}

:::danger
`agent_set_abstraction` is not available, and it never worked. This page once described a working action. That was wrong. The handler accepted the call and wrote nothing, so the config that it named never changed. The correction is the whole rule: no version of this action sets a config.

The node now refuses every call with `PRECONDITION_FAILED` and the message `agentSetAbstraction is not available; the account owner must sign userSetAbstraction`. The refusal does not depend on the sender, the target account or the `kind`. It also does not depend on whether the sender is an approved agent of `params.user`.

The reason: an approved agent holds trading authority only. It can place, cancel, modify and tune position risk on the account of the owner. The abstraction mode is not a trading setting. Leaving `standard` mode moves the spot wallet of the account into its perp wallet, and a reservation refuses later orders of the owner. Both are owner-only. So the owner signs [`user_set_abstraction`](#user_set_abstraction) with the master key.

The action stays on the wire and keeps its type and its EIP-712 type string. It never succeeds. The refusal is in force since [block 11,550,001](../../../changelog/block-11550001.md#refusals).
:::

The request shape below is what the action still accepts on the wire.

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
| `user` | hex address | The user whose config the agent updates |
| `kind` | uint8 | The sub-type tag |
| `value` | decimal (string or number) | The setting value |

---
