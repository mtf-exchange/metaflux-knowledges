---
description: "Send a token to another account, move USDC between Core and the EVM, send a payload with value, and withdraw to an external chain."
---

# Transfer & bridge actions

These actions move value between accounts, between Core and the EVM, and off the chain, through [`POST /exchange`](../exchange.md).

That page defines the request envelope, the EIP-712 signing rules, the number planes and the response shape. They apply to every action here.

### Send a token to another account {#send_asset}

`send_asset` is the plain user-to-user transfer. It moves one asset from the recovered signer to `destination`. The action is sender-authorized: it has no `owner` field. So an agent signature moves the balance of the agent, never the balance of the master.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is `MetaFluxTransaction:SendAsset`.

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
| `source_dex` | uint32 | `0` = spot, `1`+ = a perp dex | The ledger that the amount leaves. For a `standard` sender that sends USDC, the ledger splits. With `to_perp: false`, the amount leaves the spot wallet (`insufficient spot balance` when it is short). With `to_perp: true`, it leaves the perp wallet, whatever `source_dex` says. See [the standard-mode split](../../../concepts/usdc.md#standard-split) |
| `destination_dex` | uint32 | same | The ledger that the amount arrives on |
| `asset` | uint32 | a `signing_id` | The token. `100` is USDC. This is the `signing_id` from [`spot.balances[*]`](../info.md), not the market index |
| `destination` | hex address | 40 hex chars | The recipient |
| `amount` | decimal string | `> 0` | The amount, as a JSON string. The signed digest carries it verbatim, then the node parses it |
| `to_perp` | bool | | `true` credits the perp cross-collateral of the recipient. `false` credits the spot balance of the recipient |
| `nonce` | uint64 | | Optional inside `params`. The `nonce` of the envelope is the replay guard |

A send that crosses the spot/perp boundary is a conversion, not a move. Suppose `source_dex` and `destination_dex` sit on opposite sides of that boundary and the asset is not USDC. The perp class has no per-asset row to receive units, because it holds only a USDC-denominated collateral value. So the node prices the send at the oracle mark. The send conserves USD value, not unit count. A round trip out and back at two different marks returns a different number of units. That is profit or loss, not a defect. A same-class send and every USDC send is a plain move.

The path has guards. The node clamps the mark to the oracle band, refuses a stale or unprotected mark, and gates the perp debit on free collateral.

### Move your own USDC between spot and perp {#usd_class_transfer}

`usd_class_transfer` moves USDC between your own spot balance and your own perp cross-collateral. It has no recipient: both sides are the signer.

Its EIP-712 [typed-data](../exchange.md#signing) primary type is `MetaFluxTransaction:UsdClassTransfer`.

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
| `ntl` | decimal string | `> 0` | The amount in the whole-USDC plane |
| `to_perp` | bool | | `true` moves spot to perp (posts collateral). The node refuses it when the spot wallet is short (`insufficient spot balance`, code `ASSET_INSUFFICIENT_BALANCE`). Only USDC that no resting spot order holds can move. `false` moves perp to spot and is gated on free collateral. The node refuses it when the perp wallet cannot spare the amount (`insufficient free collateral for class transfer`) |

:::info
Only a `standard` account that entered the mode at or after the split arm (node 0.9.7, block 5,710,001) can use this action. Every other account holds one USDC balance, and the node refuses the action, because there is no second wallet to move to. These accounts are `unified`, `portfolio`, and a `standard` account that entered before the arm. See [the standard-mode split](../../../concepts/usdc.md#standard-split).
:::

:::warning There is no `spot_send` and no `usd_send`
Those two names are ledger record kinds, not actions. They appear on the [`ledger_updates`](../../ws/subscriptions.md#ledger_updates) feed and say what a committed transfer did. If you send either as an `/exchange` action, you get `unknown variant`, the same error as a misspelled action.

To send a token to someone, use `send_asset`. To move your own USDC between spot and perp, use `usd_class_transfer`.
:::

### Transfer USDC from Core to EVM {#core_evm_transfer}

`core_evm_transfer` moves USDC from the Core clearing ledger to the MetaFluxEVM side. It debits the USDC cross-collateral of the sender on Core. On the next EVM block, it mints the scale-converted 6-decimal EVM USDC to `destination`. It is the MTF analogue of a Core to EVM asset transfer.

The action is sender-authorized: it has no `owner` field, and the recovered signer is the account that the node debits. An agent signature acts on the account of the agent, never on the master. So the action is effectively master only, in line with the [signed-by table](../exchange.md#signed-by-semantics).

Its EIP-712 [typed-data](../exchange.md#signing) primary type is `MetaFluxTransaction:CoreEvmTransfer`.

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
| `amount` | decimal string | `> 0` | The amount in the whole-USDC plane (the Core cross-collateral unit), as a JSON string. The signed digest carries it verbatim, then the node parses it. The EVM side receives `amount × 1e6` FiatToken base units (6-decimal scale) |
| `to_evm` | bool | `true` only | The direction. `true` is Core to EVM, the only supported direction on this path. The node rejects `false` (EVM to Core). See below |
| `destination` | hex address | 40 hex chars (`0x` optional) | The EVM-side recipient (20 bytes). For a self-bridge, use the EVM address of the sender. Any EVM account is valid otherwise. The EVM credit is a mint to this address, with no owner check |
| `asset` | uint32 | market asset id | Optional. It defaults to `0` (USDC cross-collateral). A non-zero asset moves that spot token instead and debits the spot ledger |
| `data` | byte array | up to 4096 bytes | Optional EVM calldata. When present, the node runs it against `destination` after the credit lands, as a real transaction with its own receipt. See the revert rule below |
| `destination_chain_id` | uint32 | `0` or the local EVM chain id | The optional delivery chain. The node rejects any other value today. Cross-chain delivery is not built. The field exists so that the capability has a signed slot, and the node does not deliver locally in silence |

The payload never unwinds the credit. If `data` reverts, runs out of gas or fails for any reason, the transfer still stands. The node debited the Core side and credited the EVM side, and the call is additional. Read its receipt to learn what happened. Without it, you cannot tell a transfer that was delivered and executed from one that was delivered and reverted.

Your envelope picks the type string. An envelope that carries neither `data` nor `destination_chain_id` signs under `MetaFluxTransaction:CoreEvmTransfer`. The digest is byte-identical to the digest before these fields existed, so an existing client needs no change. An envelope that includes either key selects `MetaFluxTransaction:CoreEvmTransferV2`. Presence selects the type, not emptiness: `"data": []` and `"destination_chain_id": 0` both count as present.

The action supports Core to EVM only. Only `to_evm: true` is accepted. The commit rejects an EVM to Core move (`to_evm: false`) with `EVM->Core transfer must originate as an EVM burn tx, not /exchange`. The EVM-side USDC debit is a FiatToken burn, and only the EVM executor of the node can perform it. Crediting Core without a confirmed burn would mint value out of nothing. To move USDC from EVM to Core, send an EVM transaction that burns the EVM USDC to the system withdraw sink. The node mirrors the burn onto the Core ledger.

Core USDC is the whole-USDC decimal cross-collateral plane. EVM USDC is a 6-decimal FiatToken integer. The conversion is `evm_units = whole_usdc × 1e6`. The node debits the whole-USDC amount from Core when the action commits, so the queued EVM credit is always fully backed (zero-sum).

The move is gated on free collateral (equity minus the margin that open positions hold), not raw equity. Collateral that backs open positions is not transferable. The [`bridge_withdraw`](#bridge_withdraw) gate on withdrawable collateral works the same way. An underfunded transfer errors at commit (`insufficient free collateral for core->evm transfer`).

The move also charges a fee, and the fee is a quantity of MTF. It is a second debit on top of the amount, and it is `0` today. Read [the fee](#core-evm-fee) at the end of this section before you size a transfer.

The debit and the EVM-mint queueing are atomic at commit. `amount` leaves the Core cross-collateral balance of the sender. The node enqueues an L1 to EVM transfer entry, and it mints the scale-converted 6-decimal EVM USDC to `destination` on the next EVM block. Core is debited at commit, so the queued credit is fully backed.

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The EVM-side mint is asynchronous. The Core debit is immediate at commit, and the EVM credit lands on the next EVM block.

Common errors at commit:

- `amount must be positive`
- `zero destination`
- `evm disabled` (the EVM side is not enabled on this chain)
- `EVM->Core transfer must originate as an EVM burn tx, not /exchange`
- `insufficient free collateral for core->evm transfer`
- `insufficient MTF or USDC for the core->evm fee`
- `MTF price unavailable; the core->evm fee cannot be quoted in USDC`
- `the core->evm fee does not convert to a positive USDC amount`

The last three errors come from [the fee](#core-evm-fee).

Two cautions apply:

- `destination` is the EVM-side recipient. The node does not check its owner, and the EVM credit is a mint to that address. Check it twice. A transfer to a wrong but well-formed address is unrecoverable.
- Set `to_evm: true`. The reverse direction is not a `/exchange` action. Use an EVM burn transaction (see above).

#### The fee in MTF {#core-evm-fee}

:::info
No fee is charged today. The parameter is `0`. The fee is a network parameter, and a two-thirds-stake governance vote sets it. There is no height to wait for. Charging starts when a vote enacts a value above `0`. Watch for that enactment on [`validator_votes`](../info/governance.md#validator_votes). The row carries `changes[*].field: "fee.core_evm_fee_mtf"`. The text below states what happens once the value is above `0`. The parameter itself is documented with [the fee concepts](../../../concepts/fees.md#core-evm-transfer-fee).
:::

The fee is a quantity of MTF, charged on top of the amount that you move. It is a separate debit and does not depend on the asset in the transfer. A transfer of BTC debits BTC for the amount and MTF for the fee. Both Core to EVM actions charge the same fee under the same rule. So neither [`core_evm_transfer`](#core_evm_transfer) nor [`send_to_evm_with_data`](#send_to_evm_with_data) is the cheaper lane.

The chain takes the fee from the first source that covers it:

| Order | Source | Rule |
|---|---|---|
| 1 | Your spot MTF balance | The node charges the MTF quantity that the parameter names. The fee may not re-spend a balance that the transfer itself needs. So a transfer of MTF needs spot MTF for the amount and the fee together |
| 2 | Your USDC | Only when spot MTF cannot cover the fee. The node quotes the MTF quantity in USDC at the MTF reference price. The debit leaves the USDC cross-collateral balance and is gated on free collateral, so USDC that an open position holds as margin cannot pay it. The USDC must cover the fee on top of any USDC that the transfer itself moves |
| 3 | — | The node refuses the transfer with `insufficient MTF or USDC for the core->evm fee`. One string covers every cause, so it does not report which balance was short |

The node quotes the fee before anything moves and charges it after the amount leaves your balance. A transfer that the node refuses for any reason pays no fee. The proceeds are validator revenue.

:::warning
The node can refuse a transfer for a reason that has nothing to do with the asset that you move. MTF is priced from its own book, so step 2 needs that reference price. When the price is not usable, the chain refuses the transfer and does not charge at a guessed price:

```
MTF price unavailable; the core->evm fee cannot be quoted in USDC
```

The asset in the transfer and your balance of it are not the cause. If you hold enough spot MTF to cover the fee, the node never reads the reference price, because step 1 answers first.
:::

---

### Send a token to MetaFluxEVM with a payload {#send_to_evm_with_data}

:::info
Live. An older version of this notice (2026-08-19) said that the network refused the action and told you to use [`core_evm_transfer`](#core_evm_transfer). That stopped being true when the lane was restored and released. Everything below describes what runs today.
:::

`send_to_evm_with_data` moves a token from the Core ledger to MetaFluxEVM. It can also run an EVM payload against the recipient afterwards. It uses the same lane and gives the same credit as [`core_evm_transfer`](#core_evm_transfer). It is that move in the Hyperliquid-compatible field shape.

The action is sender-authorized: it has no `owner` field, and the recovered signer is the account that the node debits. An agent signature acts on the account of the agent, never on the master. So the action is effectively master only, in line with the [signed-by table](../exchange.md#signed-by-semantics).

Its EIP-712 [typed-data](../exchange.md#signing) primary type is `MetaFluxTransaction:SendToEvmWithData`.

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

All eight fields are required. No field has a default, and you cannot omit any field. `data` can be an empty array, but the key must be there.

| Field | Type | Range / values | Description |
|-------|------|----------------|-------------|
| `token` | uint32 | a registered asset id | The asset to move. For USDC, send `0` and not `100`. [Both ids mean USDC](../../../concepts/usdc.md#moving-usdc), but the spot id `100` carries no EVM contract binding, and the node refuses it with `asset not linked to an EVM contract`. `core_evm_transfer` applies the same rule to its `asset`. The native MTF gas token always crosses. The node refuses any other token that has no EVM contract binding in the same way. Ask the chain with the [`markets_meta`](../info/perpetuals.md#markets_meta) `kind: "spot"` read, and do not guess. See [which assets can cross](../../../evm/core-evm-transfers.md#which-assets-cross) |
| `amount` | decimal string | `> 0` | The amount in the whole-token plane, as a JSON string. The signed digest carries it verbatim, then the node parses it. The node refuses an amount that is too small to credit, and does not round it down. See [precision](#send_to_evm_with_data-precision) |
| `source_dex` | uint32 | `0` only | The node refuses any other value. An existing client hits this row first, because a payload written for Hyperliquid carries `source_dex: 1`. This action debits exactly one ledger, the spot ledger, so no other source exists to name. The field used to be accepted and ignored. It now fails closed and does not quietly debit a ledger that you did not ask for |
| `destination_recipient` | hex address | 40 hex chars (`0x` optional) | The EVM-side recipient (20 bytes). The node refuses the zero address (`zero destination`), as on [`core_evm_transfer`](#core_evm_transfer). It accepts every other well-formed address. The credit is a mint to this address, with no owner check. Read the [cautions](#send_to_evm_with_data-gotchas) before you send |
| `to_perp` | bool | `false` only | The node refuses `true`. The EVM side has no perp account, because the credit is an EVM mint, so `true` selects nothing that exists. The field used to be accepted and ignored |
| `destination_chain_id` | uint32 | `0` or the local EVM chain id | The delivery chain. The node refuses any other value. Delivery to a remote chain is not built on this lane. The field used to be signed and then ignored. A caller who named a remote chain had the value delivered locally, in silence. It now refuses instead. To reach another chain, use [`bridge_withdraw`](#bridge_withdraw) |
| `data` | byte array | up to 4096 bytes | EVM calldata, as an array of byte integers. Send `[]` for none. The node runs it against `destination_recipient` after the credit lands, as a real transaction with its own receipt. The node refuses a payload over 4096 bytes. [`core_evm_transfer`](#core_evm_transfer) carries the same bound, because both actions stage onto the one lane |
| `nonce` | uint64 | — | A transfer nonce that travels with the transfer. It differs from the `nonce` of the envelope. It signs as `transferNonce`. The `nonce` of the envelope still orders and de-duplicates your actions |

#### The five refusals {#send_to_evm_with_data-refusals}

Each case below refuses where the action once accepted and ignored the field. That is the point of the change: an ignored field is a field that you signed and did not get.

| What you send | Answer | Why it refuses and does not ignore |
|---|---|---|
| `source_dex` other than `0` | refused | The action debits one ledger, the spot ledger. Ignoring the field debits a ledger that the caller did not name. Historical payloads carry `source_dex: 1`, so real callers meet this refusal first. |
| `to_perp: true` | refused | The EVM side has no perp account to credit. Ignoring the field delivers an EVM mint to someone who asked for a perp credit. |
| `destination_chain_id` that is neither `0` nor the local EVM chain id | refused | Remote delivery is not built. Ignoring the field delivered the value on the local chain, silently, to a caller who signed for a different one. |
| `data` over 4096 bytes | refused | This action shares the payload bound with [`core_evm_transfer`](#core_evm_transfer). Both actions stage onto the same lane. A bound that only one door enforces is a bound that the other door walks past. |
| `amount` that truncates to a zero EVM credit | refused | The lane truncates twice (see below). Such an amount would debit your Core balance and credit nothing on the EVM side. |

Every refusal runs before anything moves, so a refused action changes no balance. The envelope nonce is spent, as with any action that reaches commit.

#### Precision {#send_to_evm_with_data-precision}

The node refuses an amount below one quantum. It does not round it down in silence.

Amounts are decimal strings in the whole-token plane. On the way to the EVM, the lane truncates twice, both times toward zero. It truncates first to 8 decimal places, then to the EVM decimals of the token. So the smallest amount that the EVM can credit is one quantum:

```
quantum = 10 ^ -min(8, the token's EVM decimals)
```

| Token | EVM decimals | Smallest amount that credits |
|---|---|---|
| USDC | 6 | `0.000001` |
| Native MTF | 18 | `0.00000001` |
| Any bound ERC-20 | its own `wei_decimals` | `10 ^ -min(8, wei_decimals)` |

Two rules follow. Both protect your balance:

- The node refuses an amount below one quantum (`amount truncates to a zero EVM credit`). Accepting it would debit Core and credit nothing.
- For an amount above one quantum, the node debits the amount that it actually credits, not the amount that you signed. Any sub-quantum remainder stays in your balance and is not destroyed on the way across.

If you send an amount that is already a whole number of quanta, the two values are equal. Prefer that shape. What you sign is then exactly what the node debits and exactly what lands.

#### Which Core to EVM action to use {#core-evm-which-action}

Both actions debit the exchange ledger of the sender and queue one credit. The node mints the credit on the next EVM block. Neither action can create value. The node debits Core when the action commits, so the queued credit is always backed. A payload runs after the credit lands and never unwinds it. A revert leaves the credit standing. Read the receipt of the payload to tell a transfer that was delivered and executed from one that was delivered and reverted.

| | [`core_evm_transfer`](#core_evm_transfer) | `send_to_evm_with_data` |
|---|---|---|
| Availability | live at every height | live |
| Field shape | MTF-native (`asset`, `destination`, `to_evm`) | Hyperliquid-compatible (`token`, `destination_recipient`, `source_dex`, `to_perp`) |
| Ledger it debits | `asset: 0` debits the perp collateral pool, gated on free collateral. A non-zero `asset` debits the spot ledger | always the spot ledger, `token: 0` included |
| Can move USDC held as collateral | yes. This is the lane for it | no |
| Omittable fields | `asset`, `data`, `destination_chain_id` | none. All eight are required |
| Signing type string | one of two, selected by which keys you send | one, always |
| A zero recipient | refused (`zero destination`) | refused (`zero destination`) |
| The MTF fee | [the same fee](#core-evm-fee), `0` today | [the same fee](#core-evm-fee), `0` today |

Use `core_evm_transfer` unless you port a client that already builds the Hyperliquid field shape. Both are live. `core_evm_transfer` keeps an existing signature byte-identical through its omittable fields. It is also the only one of the two that can move USDC out of the perp collateral pool.

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 1, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The EVM-side credit is asynchronous. The Core debit is immediate at commit, and the EVM credit lands on the next EVM block.

This action debits the spot balance, and only that. For every token, `token: 0` included, the debit comes out of your spot balance of that token (`insufficient spot balance`).

:::warning
This action does not reach the perp collateral pool. `core_evm_transfer` does. USDC that you hold as perp collateral is the balance that [`account_value` / `withdrawable`](../../../concepts/usdc.md#moving-usdc) report, and this action cannot move it. Send that USDC with [`core_evm_transfer`](#core_evm_transfer). It addresses the collateral pool as `asset: 0` and gates the move on free collateral. Use this action for a token that sits on the spot ledger.
:::

#### The MTF fee on this lane {#send_to_evm_with_data-fee}

:::info
No fee is charged today. The parameter is `0`. A two-thirds-stake governance vote sets it, and charging starts when a vote enacts a value above `0`. The enactment shows on [`validator_votes`](../info/governance.md#validator_votes) as `changes[*].field: "fee.core_evm_fee_mtf"`. See [the fee concepts](../../../concepts/fees.md#core-evm-transfer-fee).
:::

This lane charges the same fee that [`core_evm_transfer`](#core_evm_transfer) charges. One rule serves both, so neither lane avoids it. The fee is a quantity of MTF, debited on top of the amount. It does not depend on the token that you move. A transfer of a bound ERC-20 debits that token for the amount and MTF for the fee.

The resolution order is:

1. Your spot MTF balance.
2. Your USDC at the MTF reference price, when spot MTF cannot cover the fee on top of what the transfer itself needs.
3. Otherwise the node refuses the transfer with `insufficient MTF or USDC for the core->evm fee`.

The USDC step debits the USDC cross-collateral balance and is gated on free collateral, even though the amount leg debits the spot ledger.

:::warning
The node can refuse a transfer for a reason that has nothing to do with the token that you move. MTF is priced from its own book, so the USDC step needs that reference price. When the price is not usable, the chain refuses the transfer and does not charge at a guessed price:

```
MTF price unavailable; the core->evm fee cannot be quoted in USDC
```

The token and your balance of it are not the cause. If you hold enough spot MTF to cover the fee, the node never reads the reference price.
:::

The node quotes the fee before anything moves and charges it after the amount leg, so a refused transfer pays no fee. The proceeds are validator revenue. The full rule is [the fee on `core_evm_transfer`](#core-evm-fee).

Common errors at commit:

- `amount must be positive`
- `zero destination`
- `sendToEvmWithData debits the spot ledger only; source_dex must be 0`
- `the EVM side has no perp account; to_perp must be false`
- `cross-chain delivery is not built; destination_chain_id must be 0 or the local EVM chain id`
- `sendToEvmWithData data is over the payload bound`
- `amount truncates to a zero EVM credit`
- `asset not linked to an EVM contract`
- `core->evm queue is full; retry when it drains`
- `insufficient spot balance`
- `insufficient MTF or USDC for the core->evm fee`
- `MTF price unavailable; the core->evm fee cannot be quoted in USDC`
- `the core->evm fee does not convert to a positive USDC amount`

#### Cautions {#send_to_evm_with_data-gotchas}

:::danger
The chain catches only the zero address. Validate the rest yourself. The node refuses a `destination_recipient` of `0x0000…0000` with `zero destination`, the same rule that [`core_evm_transfer`](#core_evm_transfer) applies. The node accepts every other well-formed address, debits your balance and mints the credit to that address with no owner check. A transfer to a wrong address is unrecoverable.
:::

- `destination_recipient` is the EVM-side recipient. The node does not check its owner. Any transfer to a wrong but well-formed address is unrecoverable, as on `core_evm_transfer`.
- `core->evm queue is full; retry when it drains` is the one retryable error here. The other errors mean that the request itself is wrong. If you resend it unchanged, it fails the same way and spends another nonce.
- The payload succeeds or fails independently of the transfer. A successful transfer is no proof that the payload ran.

---

### Withdraw USDC to an external chain {#bridge_withdraw}

`bridge_withdraw` is the external withdrawal over [MetaBridge](../../../bridge/index.md). It debits the USDC cross-collateral of the sender and queues an Outbound bridge message for validator co-signing (⅔ of active stake). After that, the funds are released to `dst_addr` on the destination chain.

The action is sender-authorized: it has no `owner` field, and the recovered signer is the account that the node debits. An agent signature acts on the account of the agent, never on the master. So withdrawal authority is effectively master only, in line with the [signed-by table](../exchange.md#signed-by-semantics).

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
| `chain` | enum | `"Base"`, `"Arbitrum"` | The destination chain. It must have a registered MetaBridge contract and must not be paused. Otherwise the action errors at commit |
| `asset` | uint32 | `0` | The MetaFlux asset id. Only `0` (USDC cross-collateral) is bridgeable today. Any other id errors at commit (`only USDC cross-collateral is bridgeable`) |
| `amount` | uint64 | `> 0` | The amount in 6-decimal USDC base units (`1000000` = 1 USDC). The node widens it to `u128` internally |
| `dst_addr` | hex string | 40 hex chars (`0x` optional) | The destination: a 20-byte EVM address, left-padded internally to 32 bytes. Admission rejects a malformed value (`400`) |

The withdrawal is gated on free collateral (equity minus the margin that open positions hold), not raw equity. Collateral that backs open positions is not withdrawable. The pre-trade gate works the same way. An underfunded withdrawal errors at commit (`insufficient free collateral for withdrawal`).

The debit and the queueing are atomic at commit. The amount leaves the cross-collateral balance. The node records a pending-withdrawal entry (the commit outcome carries its `withdrawal_id`, a per-account counter). It also queues an Outbound MetaBridge message for validator co-signing. Once ⅔ of active stake has co-signed, a relayer submits the release on the destination chain. See [the bridge page](../../../bridge/index.md) for the release pipeline and its dispute window.

This is a non-order action. It returns the [`202 Accepted` admission envelope](../exchange.md#202-accepted--non-order-admission):

```json
{ "data": { "accepted": true, "mempool_depth": 2, "nonce": 1735689600001, "action_hash": "0x..." } }
```

The HTTP response does not carry the `withdrawal_id`. Track the commit through the returned `action_hash`. The release on the destination chain is asynchronous (cross-chain). The L1 debit is immediate at commit. The payout follows co-signing, relay submission and the on-chain dispute window.

Common errors at commit:

- `amount must be positive`
- `chain paused (per-chain or global)`
- `chain not deployed (no registered MetaBridge contract)`
- `only USDC cross-collateral is bridgeable`
- `insufficient free collateral for withdrawal`

Two cautions apply:

- The node validates `dst_addr` for length only. There is no checksum or ownership check. Funds that the node releases to a wrong but well-formed address are unrecoverable. Check the destination twice.
- A duplicate submission is a second withdrawal, not a retry. Idempotency is per nonce, and each committed `bridge_withdraw` debits again.

---

### Retired: the legacy CCTP withdrawal {#withdraw}

:::danger Retired. It has never succeeded on this chain
`withdraw` decodes and admits normally, so a probe reaches signature recovery, and an integrator reads that as progress. It is not progress. The commit then refuses it:

```json
{"error":{"code":"PRECONDITION_FAILED","message":"precondition failed: withdraw3 disabled; use bridge_withdraw"}}
```

The disable height is `0` on both testnet and mainnet. The commit has refused this action since genesis. No height changes this, and no release turns it on.

Use [`bridge_withdraw`](#bridge_withdraw). It is the only live path out of the chain, it carries a real destination address, and it is gated on free collateral.
:::

The tag stays on the wire so that old fixtures still decode. Its four fields are `asset`, `amount`, `destination_chain_id` and `use_cctp`. All four are required at decode. This page lists them only so that a reader can identify the action. They are not a shape to build against. Do not implement the signed digest, `MetaFluxTransaction:Withdraw`.

There is no CCTP code path on this chain. `use_cctp` selects nothing.

---

### Non-bridged actions {#non-bridged-actions}

The draft action names below are not wired on the MTF-native `/exchange` handler. A post of one returns `400` with `ACTION_UNSUPPORTED` (a recognized stub with no mapping) or `INVALID_REQUEST` (no native tag at all). This page documents them only to redirect integrators to the supported path.

| Draft name | Native tag | Disposition | Use instead |
|-----------|-----------|-------------|-------------|
| `Order` (multi) / `Cancel` (multi) | — | Single and batch are distinct tags | [`submit_order`](./orders.md#submit_order) + [`batch_order`](./orders.md#batch_order); [`cancel_order`](./orders.md#cancel_order) + [`batch_cancel`](./orders.md#batch_cancel) |
| `UpdateMarginMode` | — | No native action | `is_isolated` flag on [`update_leverage`](./margin-risk.md#update_leverage) |
| `MultiSig` | `multi_sig` | Bridged and executing. Post it as a normal `multi_sig` envelope | [`multi_sig`](./account.md#multi_sig) acts. [`convert_to_multi_sig_user`](./account.md#convert_to_multi_sig_user) registers the roster |
| `RegisterReferrer` | `register_referral_code` | Bridged and live since [block 25,599,540](../../../changelog/block-25599540.md#referral-program). Referral codes are on since 2026-10-05 | [`register_referral_code`](./account.md#register_referral_code) registers a code. [`set_referrer_by_code`](./account.md#set_referrer_by_code) binds to it. [`set_referrer`](./account.md#set_referrer) binds by address |
| `UsdcTransfer` / `SpotTransfer` | — | The user-to-user transfer flows are not bridged | — |
| `WithdrawUsdc` | [`withdraw`](#withdraw) | Retired. The node recognizes and admits it, then rejects it at commit with `"withdraw3 disabled; use bridge_withdraw"`. The disable height is `0`, so it has never succeeded here | [`bridge_withdraw`](#bridge_withdraw) withdraws USDC cross-collateral externally |
| (BOLE pool) | `borrow_lend` | Bridged and live. `params.kind` `"Lend"`, `"UnLend"` and `"Repay"` are open to any account. The node refuses `"Borrow"` unless the sender is an approved liquidator | — |
| (vault distribute) | `vault_distribute` | Bridged and live. It is the self-service deposit of a follower | [vaults](../../../concepts/vaults.md#depositing) |
| (Earn pool config) | `create_earn_pool` | Validator governance, never a user action. `createEarnPool` (201) is a ⅔-stake vote that goes through node governance. It is the only way for an Earn pool to get a non-zero borrow rate. See [why that matters](../exchange.md#spot-margin--earn) | [`earn_deposit`](./spot-margin.md#earn_deposit) creates a pool at rate `0` |
| (PM lifecycle) | `pm_enroll` / `pm_unenroll` | `pm_enroll` has no native tag. `pm_unenroll` is a bridged alias (no params) for the `enroll:false` form of the canonical action. `pm_rebalance` is retired, and the node rejects it as an unknown action | [`user_portfolio_margin`](./margin-risk.md#user_portfolio_margin) |
| (cross-chain) | — | Not an `/exchange` action at all. It is not in the action enum. It fails decode and returns `400` `INVALID_REQUEST` (`unknown variant`), not `ACTION_UNSUPPORTED` | [`CrossChainSend`, CoreWriter action 19](../../../evm/interacting-with-core.md). It is a MetaFluxEVM call, not an `/exchange` post |
| (Metaliquidity set) | `set_metaliquidity_set` | Validator governance, never a user action. It decodes, then the node refuses it with `ACTION_UNSUPPORTED` (read the code, not the message). It is a ⅔-stake vote. The node refuses a valid validator signature here too | [governance and validator actions](../exchange.md#governance-actions-refused) |
| (spot value adjust) | `gov_adjust_spot_value` | Validator governance, never a user action. It gets the same decode-then-refuse answer. The node hashes `params.value` verbatim, so quorum needs one byte-identical spelling | [governance and validator actions](../exchange.md#governance-actions-refused) |
| (validator lane) | `gov_vote` `vote_global` `set_mark_mode` `set_pm_shock_grid` `arm_features` `approve_upgrade` `c_validator` `vote_app_hash` | Validator governance or self-service, never a user action. These tags decode, then the node refuses them with `ACTION_UNSUPPORTED`. The node refuses a valid validator signature here too | [governance and validator actions](../exchange.md#governance-actions-refused) |
| (retired alias) | [`encrypted_order_submit`](./utility.md#encrypted_order_submit) | Retired from the public surface. The node rejects it with `400`, and the error points at the canonical spelling | [`submit_encrypted_order`](./utility.md#submit_encrypted_order) |
| `UserDexAbstraction` | `user_dex_abstraction` | Retired at the `0.7.0` re-genesis, so it returns `ACTION_UNSUPPORTED`. One unified account leaves nothing to abstract | None |

---
