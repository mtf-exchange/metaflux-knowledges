---
description: "Send a token to another account, move USDC between Core and the EVM, send a payload with value, and withdraw to an external chain."
---

# Transfer & bridge actions

Actions on [`POST /exchange`](../exchange.md). The request envelope, the
EIP-712 signing rules, the number planes and the response shape are on that
page and apply to every action here.

### Send a token to another account {#send_asset}

The plain user-to-user transfer. It moves ONE asset from the recovered signer to
`destination`. **Sender-authorized** — no `owner` field; an agent signature
therefore moves the AGENT's own balance, never the master's.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:SendAsset`.

```json
{
  "type": "send_asset",
  "params": {
    "source_dex":      0,
    "destination_dex": 0,
    "asset":           100,
    "destination":     "0xabababababababababababababababababababab",
    "amount":          "25.5",
    "to_perp":         false
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `source_dex` | uint32 | `0` = spot, `1`+ = a perp dex | Which ledger the amount leaves. **Split `standard` sender, USDC:** with `to_perp: false` the amount leaves the spot wallet (`insufficient spot balance` when short); with `to_perp: true` it leaves the perp wallet whatever `source_dex` says — see [the standard-mode split](../../../concepts/usdc.md#standard-split) |
| `destination_dex` | uint32 | same | Which ledger it arrives on |
| `asset` | uint32 | a `signing_id` | The token. `100` is USDC — this is the `signing_id` from [`spot.balances[*]`](../info.md), not the market index |
| `destination` | hex address | 40 hex chars | Recipient |
| `amount` | decimal string | `> 0` | Amount, as a JSON string. Carried verbatim into the signed digest, then parsed |
| `to_perp` | bool | | `true` credits the recipient's perp cross-collateral, `false` their spot balance |
| `nonce` | uint64 | | Optional inside `params`; the envelope's own `nonce` is the replay guard |

**A send that crosses the spot/perp boundary is a CONVERSION, not a move.** When
`source_dex` and `destination_dex` sit on opposite sides of that boundary and the
asset is not USDC, the perp class has no per-asset row to receive units — it
holds only a USDC-denominated collateral value. So the send is priced at the
oracle mark. What is conserved is USD value, not unit count. A round trip out and
back at two different marks therefore returns a different number of units, and
that is profit or loss, not a defect. A same-class send, and every USDC send, is
a plain move.

That path is guarded: the mark is clamped to the oracle band, a stale or
unprotected mark is refused, and the perp debit is gated on free collateral.

### Move your own USDC between spot and perp {#usd_class_transfer}

Moves USDC between YOUR OWN spot balance and YOUR OWN perp cross-collateral. No
recipient: both sides are the signer.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:UsdClassTransfer`.

```json
{
  "type": "usd_class_transfer",
  "params": {
    "ntl":     "250.5",
    "to_perp": true
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `ntl` | decimal string | `> 0` | Amount in the **whole-USDC** plane |
| `to_perp` | bool | | `true` = spot to perp (post collateral); refused when the spot wallet is short (`insufficient spot balance`; **not live yet:** a live node says `insufficient spot USDC balance`). Only USDC that no resting spot order holds can move. `false` = perp to spot, gated on **free collateral**: refused when the perp wallet cannot spare the amount (`insufficient free collateral for class transfer`) |

:::info
Accepted only by a `standard` account that **entered** the mode at or after the
split arm (node 0.9.7, block 5,710,001). Every other account — `unified`, `portfolio`,
and a `standard` account that entered before the arm — holds ONE USDC balance and
is refused: there is no second wallet to move to. See
[the standard-mode split](../../../concepts/usdc.md#standard-split).
:::

:::warning There is no `spot_send` and no `usd_send`
Those two names are **ledger record kinds**, not actions. They appear on the
[`ledger_updates`](../../ws/subscriptions.md#ledger_updates) feed to say what a
committed transfer DID. Sending either as an `/exchange` action gets
`unknown variant`, the same error a misspelled action gets.

To send a token to someone, use `send_asset`. To move your own USDC between spot
and perp, use `usd_class_transfer`.
:::

### Transfer USDC from Core to EVM {#core_evm_transfer}

Move USDC from the **Core clearing ledger** to the **MetaFluxEVM** side: debits
the sender's USDC cross-collateral on Core and mints the scale-converted
6-decimal EVM USDC to `destination` on the next EVM block. The MTF analogue of a
Core → EVM asset transfer. **Sender-authorized** — no `owner` field; the
recovered signer is the account debited. An agent signature therefore acts on
the **agent's own** account, never the master's, so this is effectively
master only (consistent with the [signed-by table](../exchange.md#signed-by-semantics)).

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:CoreEvmTransfer`.

```json
{
  "type": "core_evm_transfer",
  "params": {
    "amount":      "250.5",
    "to_evm":      true,
    "destination": "0xabababababababababababababababababababab"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `amount` | decimal string | `> 0` | Amount in the **whole-USDC** plane (the Core cross-collateral unit), as a JSON string. Carried verbatim into the signed digest, then parsed. The EVM side receives `amount × 1e6` FiatToken base units (6-decimal scale) |
| `to_evm` | bool | `true` only | Direction. `true` = **Core → EVM** (the only supported direction on this path). `false` (**EVM → Core**) is **rejected** — see below |
| `destination` | hex address | 40 hex chars (`0x` optional) | EVM-side recipient (20-byte). The sender's own EVM address for a self-bridge; any EVM account otherwise (the EVM credit is a mint to this address, with no owner check) |
| `asset` | uint32 | market asset id | Optional, defaults to `0` (USDC cross-collateral). A non-zero asset moves that spot token instead, debiting the spot ledger |
| `data` | byte array | up to 4096 bytes | Optional EVM calldata. When present it is run against `destination` **after** the credit lands, as a real transaction with its own receipt. See the revert rule below |
| `destination_chain_id` | uint32 | `0` or the local EVM chain id | Optional delivery chain. **Any other value is rejected today** — cross-chain delivery is not built, and the field exists so the capability has a signed slot rather than being delivered locally in silence |

**The payload never unwinds the credit.** If `data` reverts, runs out of gas, or
fails for any reason, the transfer still stands: the Core side was debited, the
EVM side was credited, and the call is additional. Read its receipt to learn what
happened — without one you could not tell a delivered-and-executed transfer from
a delivered-and-reverted one.

**Signing: your envelope picks the type string.** An envelope carrying **neither**
`data` **nor** `destination_chain_id` signs under
`MetaFluxTransaction:CoreEvmTransfer`, byte-identically to before these fields
existed — an existing client needs no change. Including **either** key selects
`MetaFluxTransaction:CoreEvmTransferV2`. **Presence is the selector, not
emptiness**: `"data": []` and `"destination_chain_id": 0` both count as present.

**Direction (Core → EVM only).** Only `to_evm: true` is accepted here. An
**EVM → Core** move (`to_evm: false`) is **rejected at commit** (`EVM->Core
transfer must originate as an EVM burn tx, not /exchange`): the EVM-side USDC
debit is a FiatToken **burn** that only the node's EVM executor can perform, and
crediting Core without a confirmed burn would mint value out of nothing. To move
USDC EVM → Core, send an EVM transaction that burns the EVM USDC to the system
withdraw sink; the node mirrors the burn onto the Core ledger.

**Scale.** Core USDC is the whole-USDC decimal cross-collateral plane; EVM USDC
is a 6-decimal FiatToken integer. The conversion is `evm_units = whole_usdc ×
1e6`. The whole-USDC amount is debited from Core the moment the action commits,
so the queued EVM credit is always fully backed (zero-sum).

**Funding check.** The move is gated on **free collateral** (equity minus margin
held by open positions), not raw equity — collateral backing open positions is
not transferable, mirroring the [`bridge_withdraw`](#bridge_withdraw) /
withdrawable-collateral gate. An underfunded transfer errors at commit
(`insufficient free collateral for core->evm transfer`).

**The move also charges a fee, and the fee is a quantity of MTF.** It is a second
debit, on top of the amount, and it is `0` today — read [the fee](#core-evm-fee)
at the end of this section before you size a transfer.

**What commit does.** The debit and the EVM-mint queueing are atomic at commit:
`amount` leaves the sender's Core cross-collateral balance, and an L1 → EVM
transfer entry is enqueued so the node mints the scale-converted 6-decimal EVM
USDC to `destination` on the next EVM block. Because Core is debited at commit,
the queued credit is fully backed.

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The EVM-side mint is asynchronous: the Core debit is immediate at commit, the
EVM credit lands on the next EVM block.

**Common errors** (at commit): `amount must be positive`, `zero destination`,
`evm disabled` (the EVM side is not enabled on this chain), `EVM->Core transfer
must originate as an EVM burn tx, not /exchange`, `insufficient free collateral
for core->evm transfer`, `insufficient MTF or USDC for the core->evm fee`, `MTF
price unavailable; the core->evm fee cannot be quoted in USDC`, `the core->evm
fee does not convert to a positive USDC amount`. The last three are
[the fee](#core-evm-fee).

**Gotchas.**
- `destination` is the **EVM-side** recipient and is **not** owner-checked — the
  EVM credit is a mint to that address. Double-check it; a transfer to a
  wrong-but-well-formed address is unrecoverable.
- Set `to_evm: true`. The reverse direction is not a `/exchange` action — use an
  EVM burn transaction (see above).

#### The fee, in MTF {#core-evm-fee}

:::info
**No fee is charged today. The parameter is `0`.** The fee is a network parameter,
and a two-thirds-stake governance vote sets it. There is no height to wait for:
charging starts the moment a vote enacts a value above `0`. Watch for that
enactment on [`validator_votes`](../info/governance.md#validator_votes) — the row
carries `changes[*].field: "fee.core_evm_fee_mtf"`. Everything below states what
happens once the value is above `0`. The parameter itself is documented with
[the fee concepts](../../../concepts/fees.md#core-evm-transfer-fee).
:::

**The fee is a quantity of MTF, charged on top of the amount you move.** It is a
separate debit, and it has nothing to do with the asset in the transfer: a
transfer of BTC debits **BTC** for the amount and **MTF** for the fee. Both
Core → EVM actions charge the same fee under the same rule, so neither
[`core_evm_transfer`](#core_evm_transfer) nor
[`send_to_evm_with_data`](#send_to_evm_with_data) is the cheaper lane.

**Resolution order.** The chain takes the fee from the first source that covers
it:

| Order | Source | Rule |
|---|---|---|
| 1 | your **spot MTF** balance | Charged as the MTF quantity the parameter names. The fee may not re-spend a balance the transfer itself needs, so a transfer **of** MTF needs spot MTF for the amount **and** the fee together |
| 2 | your **USDC** | Only when spot MTF cannot cover the fee. The MTF quantity is quoted in USDC at the MTF reference price. The debit leaves the USDC cross-collateral balance and is gated on **free collateral**, so USDC held as margin by an open position cannot pay it. It must cover the fee on top of any USDC the transfer itself moves |
| 3 | — | **The transfer is refused.** `insufficient MTF or USDC for the core->evm fee` — one string for every cause, so it does not report which balance was short |

The fee is quoted before anything moves and charged after the amount leaves your
balance, so a transfer refused for any reason pays no fee. The proceeds are
validator revenue.

:::warning
**A transfer can be refused for a reason that has nothing to do with the asset you
are moving.** MTF is priced from its own book, so step 2 needs that reference
price. When the price is not usable, the chain refuses the transfer instead of
charging at a guessed price:

```
MTF price unavailable; the core->evm fee cannot be quoted in USDC
```

Neither the asset in the transfer nor your balance of it is the cause. **Hold
enough spot MTF to cover the fee and the reference price is never read**, because
step 1 answers first.
:::

---

### Send a token to MetaFluxEVM with a payload {#send_to_evm_with_data}

:::info
**Live.** Corrected 2026-08-19: this box used to say the network refused the action
and told you to use [`core_evm_transfer`](#core_evm_transfer) instead. That
stopped being true when the lane was restored and released, so the box was telling
callers a live action was refused.

Writing a page ahead of the code is deliberate here. The reverse is not, and this is
what it looks like. Everything below describes what runs today.
:::

Move a token from the **Core ledger** to **MetaFluxEVM**, and optionally run an
EVM payload against the recipient afterwards. Same lane and same credit as
[`core_evm_transfer`](#core_evm_transfer) — this is that move in the
**Hyperliquid-compatible field shape**. **Sender-authorized** — no `owner` field;
the recovered signer is the account debited. An agent signature therefore acts on
the **agent's own** account, never the master's, so this is effectively master
only (consistent with the [signed-by table](../exchange.md#signed-by-semantics)).

Its EIP-712 [typed-data](../exchange.md#signing) primary type is
`MetaFluxTransaction:SendToEvmWithData`.

```json
{
  "type": "send_to_evm_with_data",
  "params": {
    "token":                 0,
    "amount":                "250.5",
    "source_dex":            0,
    "destination_recipient": "0xabababababababababababababababababababab",
    "to_perp":               false,
    "destination_chain_id":  0,
    "data":                  [],
    "nonce":                 7
  }
}
```

**All eight fields are required.** No field has a default and no field may be
omitted — `data` may be an empty array, but the key must be there.

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `token` | uint32 | a registered asset id | Asset to move. For USDC send **`0`**, not `100`: [both ids mean USDC](../../../concepts/usdc.md#moving-usdc), but the spot id `100` carries no EVM contract binding and is refused with `asset not linked to an EVM contract` — the same rule `core_evm_transfer` applies to its `asset`. The native MTF gas token always crosses. Any **other** token must be bound to an EVM contract or it is refused the same way — ask the chain with the [`markets_meta`](../info/perpetuals.md#markets_meta) `kind: "spot"` read rather than guessing — see [which assets can cross](../../../evm/core-evm-transfers.md#which-assets-cross) |
| `amount` | decimal string | `> 0` | Amount in the **whole-token** plane, as a JSON string. Carried verbatim into the signed digest, then parsed. **An amount too small to credit is refused, not rounded down** — see [precision](#send_to_evm_with_data-precision) |
| `source_dex` | uint32 | `0` only | **Any other value is refused.** ⚠️ **This is the row an existing client hits** — a payload written for Hyperliquid carries `source_dex: 1`. This action debits exactly one ledger, the spot ledger, so no other source exists to name. The field used to be accepted and ignored; it now fails closed rather than quietly debiting a ledger you did not ask for |
| `destination_recipient` | hex address | 40 hex chars (`0x` optional) | EVM-side recipient (20-byte). **The zero address is refused** (`zero destination`), as on [`core_evm_transfer`](#core_evm_transfer). Every other well-formed address is accepted: the credit is a **mint to this address, with no owner check** — read the [gotchas](#send_to_evm_with_data-gotchas) before you send |
| `to_perp` | bool | `false` only | **`true` is refused.** The EVM side has no perp account — the credit is an EVM mint — so `true` selects nothing that exists. The field used to be accepted and ignored |
| `destination_chain_id` | uint32 | `0` or the local EVM chain id | Delivery chain. **Any other value is refused.** Delivery to a remote chain is not built on this lane. The field used to be signed and then ignored, so a caller who named a remote chain had the value delivered **locally, in silence**. It now refuses instead. To reach another chain use [`bridge_withdraw`](#bridge_withdraw) |
| `data` | byte array | up to **4096** bytes | EVM calldata, as an array of byte integers. Send `[]` for none. It runs against `destination_recipient` **after** the credit lands, as a real transaction with its own receipt. Over 4096 bytes is refused — the same bound [`core_evm_transfer`](#core_evm_transfer) carries, because both actions stage onto the one lane |
| `nonce` | uint64 | — | A transfer nonce carried **with the transfer**, distinct from the envelope `nonce`. It signs as `transferNonce`. The envelope `nonce` is still the value that orders and de-duplicates your actions |

#### The five refusals {#send_to_evm_with_data-refusals}

Each one **refuses** where the action once **accepted and ignored**. That is the
whole point of the change: an ignored field is a field you signed and did not get.

| What you send | Answer | Why it refuses rather than ignoring |
|---|---|---|
| `source_dex` other than `0` | refused | The action debits one ledger, the spot ledger. Ignoring the field debits a ledger the caller did not name. **Historical payloads carry `source_dex: 1`, so this is the refusal real callers meet first.** |
| `to_perp: true` | refused | There is no perp account on the EVM side to credit. Ignoring the field delivers an EVM mint to someone who asked for a perp credit. |
| `destination_chain_id` that is neither `0` nor the local EVM chain id | refused | Remote delivery is not built. Ignoring the field delivered the value **on the local chain, silently**, to a caller who signed for a different one. |
| `data` over 4096 bytes | refused | The payload bound is shared with [`core_evm_transfer`](#core_evm_transfer): both actions stage onto the same lane, so a bound enforced on one door only is a bound the other door walks past. |
| `amount` that truncates to a zero EVM credit | refused | The lane truncates twice (see below). Such an amount would debit your Core balance and credit **nothing** on the EVM side. |

Every refusal runs **before** anything moves, so a refused action changes no
balance. The envelope nonce **is** spent, as with any action that reaches commit.

#### Precision — a sub-quantum amount is refused, not silently rounded {#send_to_evm_with_data-precision}

Amounts are decimal strings in the whole-token plane. On the way to the EVM the
lane truncates **twice**, both times toward zero: first to 8 decimal places, then
to the token's own EVM decimals. So the smallest amount the EVM can credit is one
quantum:

```
quantum = 10 ^ -min(8, the token's EVM decimals)
```

| Token | EVM decimals | Smallest amount that credits |
|---|---|---|
| USDC | 6 | `0.000001` |
| Native MTF | 18 | `0.00000001` |
| Any bound ERC-20 | its own `wei_decimals` | `10 ^ -min(8, wei_decimals)` |

Two rules follow, and both exist to protect your balance:

- **Below one quantum is refused** (`amount truncates to a zero EVM credit`).
  Accepting it would debit Core and credit nothing.
- **Above one quantum, you are debited the amount that is actually credited** —
  not the amount you signed. Any sub-quantum remainder **stays in your balance**
  instead of being destroyed on the way across.

Send an amount that is already a whole number of quanta and the two values are
equal. That is the shape to prefer: what you sign is then exactly what you are
debited and exactly what lands.

#### Which Core → EVM action to use {#core-evm-which-action}

Both actions debit the sender's exchange ledger, queue one credit, and the node
mints it on the next EVM block. Neither can create value: Core is debited the
moment the action commits, so the queued credit is always backed. A payload, if
you send one, runs **after** the credit lands and **never unwinds it** — a revert
leaves the credit standing, so read the payload's receipt to tell a
delivered-and-executed transfer from a delivered-and-reverted one.

| | [`core_evm_transfer`](#core_evm_transfer) | `send_to_evm_with_data` |
|---|---|---|
| Availability | **live at every height** | **live** |
| Field shape | MTF-native (`asset`, `destination`, `to_evm`) | Hyperliquid-compatible (`token`, `destination_recipient`, `source_dex`, `to_perp`) |
| **Which ledger it debits** | `asset: 0` debits the **perp collateral pool**, gated on free collateral; a non-zero `asset` debits the spot ledger | **always the spot ledger**, `token: 0` included |
| Can move USDC held as collateral | **yes** — this is the lane for it | no |
| Omittable fields | `asset`, `data`, `destination_chain_id` | none — all eight required |
| Signing type string | one of two, selected by which keys you send | one, always |
| A zero recipient | refused (`zero destination`) | refused (`zero destination`) |
| The MTF fee | [the same fee](#core-evm-fee), `0` today | [the same fee](#core-evm-fee), `0` today |

**Use `core_evm_transfer`** unless you are porting a client that already builds
the Hyperliquid field shape. Both are live. `core_evm_transfer` keeps an existing
signature byte-identical through its omittable fields, and it is the only one of
the two that can move USDC out of the perp collateral pool.

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The EVM-side credit is asynchronous: the Core debit is immediate at commit, the
EVM credit lands on the next EVM block.

**Funding check — this action debits the SPOT balance, and only that.** For every
token, `token: 0` included, the debit comes out of your **spot balance** of that
token (`insufficient spot balance`).

:::warning
**It does not reach the perp collateral pool, and `core_evm_transfer` does.** USDC
held as perp collateral is the balance
[`account_value` / `withdrawable`](../../../concepts/usdc.md#moving-usdc) report, and
this action cannot move it. Send that USDC with
[`core_evm_transfer`](#core_evm_transfer), which addresses the collateral pool as
`asset: 0` and gates the move on free collateral. Use this action for a token that
sits on the spot ledger.
:::

#### The MTF fee on this lane {#send_to_evm_with_data-fee}

:::info
**No fee is charged today. The parameter is `0`.** A two-thirds-stake governance
vote sets it, and charging starts as soon as a vote enacts a value above `0`. The
enactment shows on [`validator_votes`](../info/governance.md#validator_votes) as
`changes[*].field: "fee.core_evm_fee_mtf"`. See
[the fee concepts](../../../concepts/fees.md#core-evm-transfer-fee).
:::

**This lane charges the same fee [`core_evm_transfer`](#core_evm_transfer)
charges.** One rule serves both, so neither lane avoids it. The fee is a quantity
of **MTF**, debited on top of the amount, and it has nothing to do with the token
you move: a transfer of a bound ERC-20 debits **that token** for the amount and
**MTF** for the fee.

**Resolution order:** your **spot MTF** balance first; then **USDC** at the MTF
reference price, when spot MTF cannot cover the fee on top of what the transfer
itself needs; otherwise the transfer is **refused** with `insufficient MTF or USDC
for the core->evm fee`. The USDC step debits the USDC cross-collateral balance and
is gated on free collateral, even though the amount leg debits the spot ledger.

:::warning
**A transfer can be refused for a reason that has nothing to do with the token you
are moving.** MTF is priced from its own book, so the USDC step needs that
reference price. When the price is not usable, the chain refuses the transfer
instead of charging at a guessed price:

```
MTF price unavailable; the core->evm fee cannot be quoted in USDC
```

Neither the token nor your balance of it is the cause. **Hold enough spot MTF to
cover the fee and the reference price is never read.**
:::

The fee is quoted before anything moves and charged after the amount leg, so a
refused transfer pays no fee. The proceeds are validator revenue. The full rule is
[the fee on `core_evm_transfer`](#core-evm-fee).

**Common errors** (at commit, once the action is live): `amount must be positive`,
`zero destination`, `sendToEvmWithData debits the spot ledger only; source_dex
must be 0`, `the EVM side has no perp account; to_perp must be false`,
`cross-chain delivery is not built; destination_chain_id must be 0 or the local
EVM chain id`, `sendToEvmWithData data is over the payload bound`, `amount
truncates to a zero EVM credit`, `asset not linked to an EVM contract`,
`core->evm queue is full; retry when it drains`, `insufficient spot balance`,
`insufficient MTF or USDC for the core->evm fee`, `MTF price unavailable; the
core->evm fee cannot be quoted in USDC`, `the core->evm fee does not convert to a
positive USDC amount`.

#### Gotchas {#send_to_evm_with_data-gotchas}

:::danger
**The chain catches only the ZERO address. Validate the rest yourself.** A
`destination_recipient` of `0x0000…0000` is refused with `zero destination`, the
same rule [`core_evm_transfer`](#core_evm_transfer) applies. Every other
well-formed address is accepted, your balance is debited, and the credit is minted
to that address with no owner check. **A transfer to a wrong address is
unrecoverable.**
:::

- `destination_recipient` is the **EVM-side** recipient and is **not**
  owner-checked. Any transfer to a wrong-but-well-formed address is
  unrecoverable, exactly as on `core_evm_transfer`.
- `core->evm queue is full; retry when it drains` is the one **retryable** error
  here. The rest mean the request itself is wrong; resending it unchanged fails
  the same way and spends another nonce.
- The payload's success is independent of the transfer's. Do not treat a
  successful transfer as proof the payload ran.

---

### Withdraw USDC to an external chain {#bridge_withdraw}

External withdrawal over [MetaBridge](../../../bridge/index.md): debits the
sender's USDC cross-collateral and queues an **Outbound** bridge message for
validator co-signing (⅔ of active stake), after which the funds are released to
`dst_addr` on the destination chain. **Sender-authorized** — no `owner` field;
the recovered signer is the account debited. An agent signature therefore acts
on the **agent's own** account, never the master's, so withdrawal authority is
effectively master only (consistent with the
[signed-by table](../exchange.md#signed-by-semantics)).

```json
{
  "type": "bridge_withdraw",
  "params": {
    "chain":    "Base",
    "asset":    0,
    "amount":   1000000,
    "dst_addr": "0xabababababababababababababababababababab"
  }
}
```

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `chain` | enum | `"Base"`, `"Arbitrum"` | Destination chain. Must have a registered MetaBridge contract and not be paused, or the action errors at commit |
| `asset` | uint32 | `0` | MetaFlux asset id. Only `0` (USDC cross-collateral) is bridgeable today; any other id errors at commit (`only USDC cross-collateral is bridgeable`) |
| `amount` | uint64 | `> 0` | Amount in 6-decimal USDC base units (`1000000` = 1 USDC); widened to `u128` internally |
| `dst_addr` | hex string | 40 hex chars (`0x` optional) | Destination: a 20-byte EVM address, left-padded internally to 32 bytes. A malformed value is rejected at admission (`400`) |

**Funding check.** The withdrawal is gated on **free collateral** (equity minus
margin held by open positions), not raw equity — collateral backing open
positions is not withdrawable, mirroring the pre-trade gate. An underfunded
withdrawal errors at commit (`insufficient free collateral for withdrawal`).

**What commit does.** The debit and the queueing are atomic at commit: the
amount leaves the cross-collateral balance, a pending-withdrawal entry is
recorded (the commit outcome carries its `withdrawal_id`, a per-account
counter), and an Outbound MetaBridge message is queued for validator
co-signing. Once ⅔ of active stake has co-signed, a relayer submits the release
on the destination chain — see [the bridge page](../../../bridge/index.md) for
the release pipeline and its dispute window.

**Response.** Non-order action →
[`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 2, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The HTTP response does **not** carry the `withdrawal_id`; track the commit via
the returned `action_hash`. The destination-chain release is asynchronous
(cross-chain): the L1 debit is immediate at commit, the payout follows
co-signing, relay submission, and the on-chain dispute window.

**Common errors** (at commit): `amount must be positive`, `chain paused
(per-chain or global)`, `chain not deployed (no registered MetaBridge
contract)`, `only USDC cross-collateral is bridgeable`, `insufficient free
collateral for withdrawal`.

**Gotchas.**
- `dst_addr` is validated for **length only** — there is no checksum or
  ownership check. Funds released to a wrong-but-well-formed address are
  unrecoverable; double-check the destination.
- A duplicate submission is a **second withdrawal**, not a retry — idempotency
  is per-nonce, and each committed `bridge_withdraw` debits again.

---

### Retired: the legacy CCTP withdrawal {#withdraw}

:::danger Retired — it has never succeeded on this chain
`withdraw` decodes and admits normally, so a probe reaches signature recovery and
an integrator reads that as progress. It is not. Commit then refuses it:

```json
{"error":{"code":"PRECONDITION_FAILED","message":"precondition failed: withdraw3 disabled; use bridge_withdraw"}}
```

**The disable height is `0` on both testnet and mainnet.** This action has been
refused at every commit since genesis. No height changes this,
and no release turns it on.

Use [`bridge_withdraw`](#bridge_withdraw). It is the only live path out of the
chain, it carries a real destination address, and it is gated on free collateral.
:::

The tag stays on the wire so that old fixtures still decode. Its four fields —
`asset`, `amount`, `destination_chain_id` and `use_cctp` — are all required at
decode, and they are listed here only so a reader can identify the action. They
are not a shape to build against, and the signed digest,
`MetaFluxTransaction:Withdraw`, is not one to implement.

There is no CCTP code path on this chain. `use_cctp` selects nothing.

---

### Non-bridged actions {#non-bridged-actions}

The following draft action names are **not** wired on the MTF-native `/exchange`
handler. Posting them returns `400` with `ACTION_UNSUPPORTED` (recognized-but-unmapped
stubs) or `INVALID_REQUEST` (no native tag at all). They are documented
here only to redirect integrators to the supported path.

| Draft name | Native tag | Disposition | Use instead |
|-----------|-----------|-------------|-------------|
| `Order` (multi) / `Cancel` (multi) | — | Single vs. batch are distinct tags | [`submit_order`](./orders.md#submit_order) + [`batch_order`](./orders.md#batch_order); [`cancel_order`](./orders.md#cancel_order) + [`batch_cancel`](./orders.md#batch_cancel) |
| `UpdateMarginMode` | — | No native action | `is_isolated` flag on [`update_leverage`](./margin-risk.md#update_leverage) |
| `MultiSig` | `multi_sig` | **Bridged and executing.** Post it as a normal `multi_sig` envelope | [`multi_sig`](./account.md#multi_sig) acts; [`convert_to_multi_sig_user`](./account.md#convert_to_multi_sig_user) *registers* the roster |
| `RegisterReferrer` | — | Not bridged | [`set_referrer`](./account.md#set_referrer) binds by address |
| `UsdcTransfer` / `SpotTransfer` | — | User-to-user transfer flows not bridged | — |
| `WithdrawUsdc` | [`withdraw`](#withdraw) | **Retired.** Recognized and admitted, then rejected at commit — `"withdraw3 disabled; use bridge_withdraw"`. The disable height is `0`, so it has never succeeded here | [`bridge_withdraw`](#bridge_withdraw) withdraws USDC cross-collateral externally |
| (BOLE pool) | `borrow_lend` | **Bridged and live.** `params.kind` `"Lend"` / `"UnLend"` / `"Repay"` open to any account; `"Borrow"` refused unless the sender is an approved liquidator | — |
| (vault distribute) | `vault_distribute` | **Bridged and live** — a follower's own self-service deposit | [vaults](../../../concepts/vaults.md#depositing) |
| (Earn pool config) | `create_earn_pool` | **Validator governance, never a user action.** `createEarnPool` (201) is a ⅔-stake vote submitted through node governance. It is the **only** way an Earn pool gets a non-zero borrow rate — see [why that matters](../exchange.md#spot-margin--earn) | [`earn_deposit`](./spot-margin.md#earn_deposit) auto-creates a pool at rate `0` |
| (PM lifecycle) | `pm_enroll` / `pm_unenroll` | `pm_enroll` has no native tag. `pm_unenroll` **is** a bridged alias (no params) for the canonical action's `enroll:false` form; `pm_rebalance` **retired** → rejected as an unknown action | [`user_portfolio_margin`](./margin-risk.md#user_portfolio_margin) |
| (cross-chain) | — | **Not an `/exchange` action at all.** Not in the action enum: it fails decode and returns `400` `INVALID_REQUEST` (`unknown variant`), **not** `ACTION_UNSUPPORTED` | [`CrossChainSend`, CoreWriter action 19](../../../evm/interacting-with-core.md) — a MetaFluxEVM call, not an `/exchange` post |
| (Metaliquidity set) | `set_metaliquidity_set` | **Validator governance, never a user action.** Decodes, then refused `ACTION_UNSUPPORTED` (read the code, not the message). A ⅔-stake vote; a valid validator signature is refused here too | [governance and validator actions](../exchange.md#governance-actions-refused) |
| (spot value adjust) | `gov_adjust_spot_value` | **Validator governance, never a user action.** Same decode-then-refuse answer. `params.value` is hashed **verbatim**, so quorum needs one byte-identical spelling | [governance and validator actions](../exchange.md#governance-actions-refused) |
| (validator lane) | `gov_vote` `vote_global` `set_mark_mode` `set_pm_shock_grid` `arm_features` `approve_upgrade` `c_validator` `vote_app_hash` | **Validator governance or self-service, never a user action.** Decode, then refused `ACTION_UNSUPPORTED`; a valid validator signature is refused here too | [governance and validator actions](../exchange.md#governance-actions-refused) |
| (retired alias) | [`encrypted_order_submit`](./utility.md#encrypted_order_submit) | Retired from the public surface — rejected `400`, error points at the canonical spelling | [`submit_encrypted_order`](./utility.md#submit_encrypted_order) |
| `UserDexAbstraction` | `user_dex_abstraction` | **Retired** at the `0.7.0` re-genesis → `ACTION_UNSUPPORTED`. One unified account, so nothing to abstract | — (no replacement) |

---
