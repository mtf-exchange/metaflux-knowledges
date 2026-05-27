# HL-compat REST surface

> Status: **preview**. `/info` covers 15 query types; `/exchange` covers `order` + `cancel` at parity. The remaining HL actions ship over time.

## TL;DR

The gateway exposes URLs and request/response shapes identical to Hyperliquid's. HL bots point at MetaFlux with [zero code change](../../integration/migrating-from-hl.md) for the covered surface. The wire format, including HL's `{"status":"ok"|"err"}` envelope and `errors-are-200s` convention, is preserved exactly.

## URL

```
POST  https://<gateway>/info
POST  https://<gateway>/exchange
```

Both mount on the **gateway**, not the bare node. Pointing HL clients at `node:8080` returns 400s because the bare node speaks MTF-native shapes.

## Envelope convention

All responses are HTTP 200 with:

```json
{ "status": "ok",  "response": <type-specific> }
{ "status": "err", "response": "<error string>" }
```

This is HL's convention. Transport-level errors (malformed JSON, wrong method) still surface as 4xx; application-level errors are 200s with `status:"err"`.

---

## `/info` — read path

Read-only. Dispatches on `type`. Mirrors HL's `/info`.

### Query types

#### `meta`

```bash
curl -X POST https://gateway/info \
  -H 'content-type: application/json' \
  -d '{"type":"meta"}'
```

Response (HL shape):

```json
{
  "status": "ok",
  "response": {
    "universe": [
      {
        "name":         "BTC",
        "szDecimals":   5,
        "maxLeverage":  50,
        "onlyIsolated": false
      }
    ]
  }
}
```

#### `metaAndAssetCtxs`

```json
{"type":"metaAndAssetCtxs"}
```

Returns `[meta, [assetCtx_per_universe_entry...]]` (HL's tuple shape):

```json
{
  "status": "ok",
  "response": [
    { "universe": [...] },
    [
      {
        "funding":      "0.0000125",
        "openInterest": "1234.567",
        "prevDayPx":    "100.0",
        "markPx":       "100.5",
        "oraclePx":     "100.45",
        "midPx":        "100.6"
      }
    ]
  ]
}
```

#### `allMids`

```json
{"type":"allMids"}
```

```json
{
  "status": "ok",
  "response": { "BTC": "100.55", "ETH": "3200.0" }
}
```

#### `userState` / `clearinghouseState`

Two aliases — both return per-user clearinghouse state. HL exposes both for compat.

```json
{"type":"clearinghouseState", "user":"0x..."}
```

Response (HL shape):

```json
{
  "status": "ok",
  "response": {
    "assetPositions": [
      {
        "type":     "oneWay",
        "position": {
          "coin":              "BTC",
          "szi":               "1.0",
          "entryPx":           "100.0",
          "leverage":          { "type": "cross", "value": 10 },
          "marginUsed":        "10.5",
          "unrealizedPnl":     "0.5",
          "returnOnEquity":    "0.05",
          "liquidationPx":     "92.5",
          "positionValue":     "100.5",
          "maxLeverage":       50,
          "cumFunding":        { "allTime": "0.123", "sinceOpen": "0.05" }
        }
      }
    ],
    "marginSummary": {
      "accountValue":    "1000.0",
      "totalNtlPos":     "100.5",
      "totalRawUsd":     "899.5",
      "totalMarginUsed": "10.5"
    },
    "crossMarginSummary": { /* same shape, cross-only */ },
    "crossMaintenanceMarginUsed": "5.0",
    "withdrawable":              "899.5",
    "time":                      1735689600000
  }
}
```

#### `openOrders`

```json
{"type":"openOrders","user":"0x..."}
```

```json
{
  "status": "ok",
  "response": [
    {
      "coin":           "BTC",
      "side":           "B",
      "limitPx":        "100.5",
      "sz":             "1.0",
      "oid":            12345,
      "timestamp":      1735689600000,
      "origSz":         "1.0",
      "reduceOnly":     false,
      "orderType":      "Limit",
      "tif":            "Gtc",
      "cloid":          "0x..."
    }
  ]
}
```

`side`: `"B"` (buy) or `"A"` (ask/sell), per HL.

#### `frontendOpenOrders`

Same as `openOrders` plus UI-oriented fields (`triggerCondition`, `isPositionTpsl`, `isTrigger`, etc.) for displays.

```json
{"type":"frontendOpenOrders","user":"0x..."}
```

#### `userFills`

```json
{"type":"userFills","user":"0x..."}
```

```json
{
  "status": "ok",
  "response": [
    {
      "coin":          "BTC",
      "px":            "100.55",
      "sz":            "0.5",
      "side":          "B",
      "time":          1735689600000,
      "startPosition": "0.0",
      "dir":           "Open Long",
      "closedPnl":     "0.0",
      "hash":          "0x...",
      "oid":           12345,
      "crossed":       true,
      "fee":           "0.005",
      "tid":           987654321,
      "feeToken":      "USDC"
    }
  ]
}
```

#### `userFillsByTime`

```json
{"type":"userFillsByTime","user":"0x...","startTime":1735000000000,"endTime":1735100000000}
```

Time-bounded variant; same record shape as `userFills`.

#### `historicalOrders`

```json
{"type":"historicalOrders","user":"0x..."}
```

Returns paginated historical (terminal-state) orders.

#### `l2Book`

```json
{"type":"l2Book","coin":"BTC"}
```

```json
{
  "status": "ok",
  "response": {
    "coin": "BTC",
    "levels": [
      [ /* bids */ { "px": "100.5", "sz": "1.0", "n": 3 } ],
      [ /* asks */ { "px": "100.6", "sz": "2.0", "n": 5 } ]
    ],
    "time": 1735689600000
  }
}
```

`levels` is a `[bids, asks]` tuple — HL shape.

#### `vaultDetails`

```json
{"type":"vaultDetails","vaultAddress":"0x..."}
```

Returns vault summary. MetaFlux vaults are not HL vaults — same query shape, different entities (MFlux Vault / user vaults).

#### `delegations`

```json
{"type":"delegations","user":"0x..."}
```

```json
{
  "status": "ok",
  "response": [
    {
      "validator":      "0x<val>",
      "amount":         "100.0",
      "lockedUntilTimestamp": 1735000000000
    }
  ]
}
```

#### `userFees`

```json
{"type":"userFees","user":"0x..."}
```

```json
{
  "status": "ok",
  "response": {
    "dailyUserVlm":           [{ "date": "2026-05-27", "userCross": "100", "userAdd": "50", "exchange": "0" }],
    "feeSchedule": {
      "cross":       "0.00025",
      "add":         "0.00005",
      "spotCross":   "0.0005",
      "spotAdd":     "0.00015",
      "tiers": {
        "vip": [
          { "ntlCutoff": "1000000", "cross": "0.0002", "add": "0.00003" }
        ]
      }
    },
    "userAddRate":   "0.00005",
    "userCrossRate": "0.00025",
    "activeReferralDiscount": "0.04"
  }
}
```

#### `subAccounts`

```json
{"type":"subAccounts","user":"0x<master>"}
```

```json
{
  "status": "ok",
  "response": [
    {
      "name":          "scalping-desk",
      "subAccountUser":"0x<sub_addr>",
      "master":        "0x<master>",
      "clearinghouseState": { /* same shape as userState */ }
    }
  ]
}
```

#### `referral`

```json
{"type":"referral","user":"0x..."}
```

```json
{
  "status": "ok",
  "response": {
    "referredBy":           { "referrer": "0x...", "code": "FRIEND2026" },
    "cumVlm":               "100000.0",
    "unclaimedRewards":     "10.5",
    "claimedRewards":       "100.0",
    "referrerState":        { "stage": "ready", "data": { "code": "MYCODE", "referralStates": [...] } },
    "rewardHistory":        []
  }
}
```

### Errors on `/info`

| HTTP | Body | Cause |
|------|------|-------|
| 200 | `{"status":"err","response":"unknown info type: <X>"}` | Misspelled `type` |
| 200 | `{"status":"err","response":"missing field: user"}` | Required arg omitted |
| 200 | `{"status":"err","response":"unknown user"}` | Account never seen |
| 200 | `{"status":"err","response":"unknown coin"}` | Asset name unknown |
| 400 | `{"error":"<X>"}` | Malformed body / wrong content-type |
| 429 | `{"error":"rate limit exceeded","retry_after_ms":N}` | See [rate limits](../rate-limits.md) |

---

## `/exchange` — write path

### Request envelope

```json
{
  "action":       { /* HL action object */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| Field | Description |
|-------|-------------|
| `action` | HL-shape action (see below) |
| `nonce` | Unix ms, strictly increasing per signer |
| `signature` | RSV object — three hex strings + uint `v` (27/28 or 0/1) |
| `vaultAddress` | `null` for own account; `"0x<vault>"` to act as a vault manager |

Signature is over the EIP-712 envelope (see [signing walkthrough](../../integration/signing.md)) using the **MetaFlux** domain (`chainId = 31337` on devnet; TBD per network — see [networks](../../networks.md)).

### Supported action types

| `action.type` | Status | Notes |
|---------------|--------|-------|
| `order` | supported | limit / IOC / ALO; full TIF set |
| `cancel` | supported | by `oid` |
| `cancelByCloid` | rolling out | by `cloid` |
| `modify` | rolling out | single cancel-replace |
| `batchModify` | rolling out | batched modifies |
| `scheduleCancel` | rolling out | dead-man's switch |
| `updateLeverage` | rolling out | — |
| `updateIsolatedMargin` | rolling out | — |
| `usdSend` | rolling out | USDC transfer between accounts |
| `spotSend` | rolling out | spot asset transfer |
| `withdraw3` | rolling out | external withdraw (CCTP) |
| `usdClassTransfer` | rolling out | spot/perp class transfer |
| `approveAgent` | rolling out | agent wallet approval |
| `vaultTransfer` | rolling out | user vault deposit/withdraw |
| `subAccountTransfer` | rolling out | sub-account fund movement |
| `setReferrer` | rolling out | — |
| `convertToMultiSigUser` | rolling out | — |
| `twapOrder` | rolling out | — |
| `twapCancel` | rolling out | — |
| (everything else HL ships) | returns `{"status":"err","response":"unimplemented action: <type>"}` | Use [MTF-native](./exchange.md) for those |

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

Field shorthand (HL convention):
- `a` = asset id
- `b` = is_buy (true=buy, false=sell)
- `p` = limit price (string)
- `s` = size (string)
- `r` = reduce_only
- `t.limit.tif` = `"Gtc"` / `"Ioc"` / `"Alo"`
- `c` = optional 16-byte `cloid`

Trigger orders:

```json
{
  "a": 0, "b": false, "p": "95.0", "s": "1.0", "r": true,
  "t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }
}
```

### `order` response

```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "resting": { "oid": 12345, "cloid": "0x..." } }
      ]
    }
  }
}
```

Per-order status entries (one per `orders[]` entry, in order):

| Variant | Meaning |
|---------|---------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | Posted to book |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | Filled immediately |
| `{"error":"<reason>"}` | This entry rejected (others may succeed) |

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

Per-cancel status entries: `"success"` or `{"error":"<reason>"}`.

### Errors on `/exchange`

| HTTP | Body | Cause |
|------|------|-------|
| 200 | `{"status":"err","response":"signature_invalid"}` | Recovered address ≠ signer / wrong chainId |
| 200 | `{"status":"err","response":"unimplemented action: <type>"}` | Compat surface doesn't yet cover this action |
| 200 | `{"status":"err","response":"nonce too small"}` | Reused nonce |
| 200 | `{"status":"err","response":"agent_not_approved"}` | Agent signed but no approval exists |
| 200 | `{"status":"err","response":"agent_expired"}` | Agent approval has expired |
| 400 | (4xx body) | Body malformed at parse |
| 429 | (4xx body) | Rate-limited |

---

## Differences from HL worth knowing

See [migrating from HL](../../integration/migrating-from-hl.md) for the full reference. Quick highlights:

- **`chainId`** in the signing domain is MetaFlux's (`31337` devnet / TBD prod), NOT HL's.
- **Asset IDs are not numerically the same** as HL's. Look up via `info { "type": "meta" }` at startup; never hard-code.
- **T0 yellow card** liquidation tier exists on MTF (between healthy and HL's "Partial Liquidation"). Bots that watch liquidation events see one more event type.
- **HL action types beyond `order` / `cancel`** return `err` on the compat surface during rollout. Use MTF-native [`POST /exchange`](./exchange.md) for unsupported actions, or wait for compat expansion.
- **Per-corridor caps on withdrawals via CCTP** — see [bridge](../../bridge/).

## See also

- [`POST /exchange`](./exchange.md) — MTF-native equivalent
- [`POST /info`](./info.md) — MTF-native equivalent
- [Migrating from HL](../../integration/migrating-from-hl.md)
- [Signing walkthrough](../../integration/signing.md)
- [Errors](../errors.md)
