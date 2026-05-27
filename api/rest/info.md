# `POST /info` — read path (MTF-native)

> Status: **stable** shape; covered query types grow over time.

Single endpoint, multi-type. Dispatches on the request body's `type` field. Read-only — never mutates state, never requires a signature.

## URL

```
POST  http://{node}:8080/info
```

## Request shape

```json
{ "type": "<query_type>", ...query-specific fields }
```

`type` is required. Other fields depend on the variant.

## Response shape

```json
{ "type": "<query_type>", "data": { /* type-specific */ } }
```

On unknown `type`: HTTP 400 with `{ "error": "unknown info type: <foo>" }`.

## Query types

### `node_info`

Static node identity + protocol version. No parameters.

```json
{ "type": "node_info" }
```

Returns network variant, validator index, protocol version, build commit.

### `account_state`

Per-account snapshot: positions, balances, margin numbers, recent fills.

```json
{ "type": "account_state", "account_id": 42 }
```

`account_id` is the chain-internal numeric ID. Most clients use the address-keyed variant via the HL-compat `clearinghouseState` instead.

Returns:
- `account_value` — equity including unrealised PnL, in USDC base units (integer string)
- `maintenance_margin` — both classical and PM-derived if PM enrolled
- `positions` — per-asset position, entry price, unrealised PnL
- `margin_mode` — Cross / Isolated / Strict-Iso per asset
- `health` — computed `account_value / maintenance_margin`

### `market_info`

Per-market metadata: tick size, min order, oracle config, fee schedule.

```json
{ "type": "market_info", "market_id": 7 }
```

Returns the on-chain market spec including funding parameters and the active mark-price source.

### `vault_state`

Per-vault snapshot for MFlux Vaults and user-created vaults.

```json
{ "type": "vault_state", "vault_id": 99 }
```

Returns vault TVL, share price, depositor table (paginated), and the active strategy if any.

### `staking_state`

Per-account staking snapshot.

```json
{ "type": "staking_state", "account_id": 7 }
```

Returns active stakes, pending unstakes, and accrued rewards.

### `fee_schedule`

Network-level fee schedule. No parameters.

```json
{ "type": "fee_schedule" }
```

Returns taker / maker fee tiers, builder rebate config, and the current fee burn ratio.

## Errors

| HTTP | Body | Cause |
|------|------|-------|
| 200 | `{ "type": "...", "data": null }` | Query succeeded but the resource doesn't exist (e.g. `vault_state` for an unknown vault_id) |
| 400 | `{ "error": "unknown info type: <foo>" }` | Misspelled or unknown `type` |
| 400 | `{ "error": "missing field: <name>" }` | Required type-specific field omitted |
| 405 | (no body) | Method other than POST |

## Read-after-write consistency

`/info` reads from the most recent committed block. A `POST /exchange` that admits at time T may not be visible in `/info` queries until the leader commits the block containing it — typically <200 ms at default tick.

For read-your-writes semantics, the WebSocket `userEvents` channel (coming) streams admitted-then-committed events in order so clients don't need to poll.

## HL-compat alternative

If your client speaks HL's `/info` shape (camelCase, `user` instead of `account_id`, more query types like `allMids` and `userFills`), use the gateway's [HL-compat `/info`](./hl-compat.md#info) instead. Same data; different wire shape.

## See also

- [`POST /exchange`](./exchange.md) — write path
- [HL-compat `/info`](./hl-compat.md#info) — camelCase shape
