# HL-compat REST surface

> Status: **preview**. `/info` covers 15 query types; `/exchange` covers `order` + `cancel`. More HL action types ship over time.

The gateway exposes URLs and request/response shapes that match Hyperliquid's exactly, so HL bots can be pointed at MetaFlux with [zero code change](../../integration/migrating-from-hl.md).

## URL

```
POST  https://<gateway>/info
POST  https://<gateway>/exchange
```

Both mount on the gateway, not on the bare node. The node's `/info` and `/exchange` use MTF-native shapes; do not point HL clients there.

## `/info`

Read-only. Dispatches on `type`. Mirrors HL's `/info` API.

### Supported types

| `type` | Returns |
|--------|---------|
| `meta` | Universe metadata: asset list with names, sizes, maintenance ratios |
| `metaAndAssetCtxs` | `meta` + per-asset funding / mark / oracle context |
| `allMids` | Mid-price per asset, single map |
| `userState` | Per-user clearinghouse snapshot (positions, margin, balances) |
| `clearinghouseState` | Alias for `userState` (HL exposes both) |
| `openOrders` | Live order book entries for a user |
| `frontendOpenOrders` | Same as `openOrders` plus extra UI-oriented fields |
| `userFills` | Recent fills for a user (paginated) |
| `historicalOrders` | Historical orders for a user (paginated) |
| `l2Book` | L2 order book snapshot for one asset |
| `vaultDetails` | Vault state (MFlux Vault / user vaults) |
| `delegations` | Active staking delegations |
| `userFees` | Per-user fee tier and recent volume |
| `subAccounts` | List of sub-accounts under a master |
| `referral` | Referral relationships for a user |

Each type has its own required body fields beyond `type`. The shapes mirror HL's; consult HL's docs for field-level reference and they apply here unchanged unless noted in [migrating from HL](../../integration/migrating-from-hl.md).

### Examples

```bash
# All asset metadata
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"meta"}'

# A user's clearinghouse state
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"clearinghouseState","user":"0x..."}'

# L2 book for asset 0
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"l2Book","coin":"BTC"}'
```

### Response shape

```json
{
  "status": "ok",
  "response": { /* type-specific payload */ }
}
```

On error:

```json
{ "status": "err", "response": "unknown info type: <type>" }
```

at HTTP 200. This is HL's convention: errors are 200s with `status: "err"`, not 4xx. Failures that prevent the request from being parsed at all are 4xx as normal.

## `/exchange`

Write path. Submits HL-shape signed actions.

### Request shape

```json
{
  "action": { /* HL action object */ },
  "nonce": 1234567890,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

`vaultAddress`:
- `null` → action targets the signer's account
- `"0x<vault>"` → action targets a vault the signer manages

Signature is over the EIP-712 envelope per [signing walkthrough](../../integration/signing.md), using the MetaFlux domain (`chainId = 31337` on devnet; TBD per network).

### Supported action types

| `action.type` | Status |
|---------------|--------|
| `order` | ✅ supported (limit / IOC / ALO; Trigger TPSL semantics collapse to IOC for now) |
| `cancel` | ✅ supported (by OID) |
| All other 95+ HL action types | ⏳ return `{"status":"err","response":"unimplemented action: <type>"}` |

### `order` example

```json
{
  "action": {
    "type": "order",
    "orders": [
      {
        "a": 0,
        "b": true,
        "p": "100.5",
        "s": "1.0",
        "r": false,
        "t": { "limit": { "tif": "Gtc" } }
      }
    ],
    "grouping": "na"
  },
  "nonce": 1735689600000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Field shorthand matches HL's wire (`a` = asset, `b` = is_buy, `p` = price string, `s` = size string, `r` = reduce_only, `t.limit.tif` = time-in-force).

Response:

```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "resting": { "oid": 12345 } }
      ]
    }
  }
}
```

Or:

```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": { "statuses": [{ "error": "<reason>" }] }
  }
}
```

Per-order status entries match HL's: `resting`, `filled`, `error`.

### `cancel` example

```json
{
  "action": {
    "type": "cancel",
    "cancels": [{ "a": 0, "o": 12345 }]
  },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Response:

```json
{
  "status": "ok",
  "response": {
    "type": "cancel",
    "data": { "statuses": ["success"] }
  }
}
```

## Differences from HL worth knowing

See [migrating from HL](../../integration/migrating-from-hl.md) for the full reference. Quick highlights:

- **`chainId`** in the signing domain is MetaFlux's (`31337` devnet / TBD prod), NOT HL's.
- **Asset IDs are not numerically the same** as HL's. Always look up via `info { "type": "meta" }`.
- **T0 yellow card** liquidation tier exists on MTF (between healthy and HL's "Partial Liquidation"). Bots that watch liquidation events get one more event type to handle.
- **HL action types beyond `order` / `cancel`** return `err` for now. Use MTF-native [`POST /exchange`](./exchange.md) on the node port for anything else, or wait for compat-layer expansion.

## See also

- [`POST /exchange`](./exchange.md) — MTF-native equivalent
- [Migrating from Hyperliquid](../../integration/migrating-from-hl.md)
- [Signing walkthrough](../../integration/signing.md)
