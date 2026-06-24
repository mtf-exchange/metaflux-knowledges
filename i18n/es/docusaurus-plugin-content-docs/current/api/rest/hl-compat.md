# Superficie REST compatible con HL

:::info
**Vista previa.** El gateway responde a cada tipo de solicitud HL `/info` con la misma estructura de datos que HL. Algunos tipos están **conectados** al estado en vivo del nodo hoy; el resto devuelve la forma **honest-empty** de HL (nunca `null`, nunca un valor fabricado) hasta que la lectura correspondiente del nodo esté disponible. El estado de cada tipo aparece en la [tabla de traducción](#tipo-hl-info--tipo-nativo-mtf-del-nodo) a continuación.
:::

## TL;DR

El gateway expone URLs y estructuras de solicitud/respuesta idénticas a las de HL. Los bots de HL apuntan a MetaFlux con [cero cambios de código](../../integration/migrating-from-hl.md) para la superficie cubierta. El formato de datos — el envelope `{"error":...}` 400 de HL, campos en camelCase, tuplas `[bids, asks]`, magnitudes monetarias como cadenas decimales — se preserva exactamente.

**El gateway es el ÚNICO lugar donde viven las formas HL/camelCase.** El nodo es nativo MTF de extremo a extremo (snake_case, ids enteros/`u32` — véase [`/info`](./info.md)). Cada respuesta HL aquí es una *traducción* de una lectura nativa MTF del nodo; el nodo nunca habla HL.

## URL

```
POST  https://<gateway>/hl/info
POST  https://<gateway>/hl/exchange
```

La compatibilidad con HL está bajo el espacio de nombres `/hl/*` en la puerta principal del gateway. Los endpoints de nivel superior del gateway `/info` · `/exchange` son nativos MTF (la ruta predeterminada) — apunte los clientes HL a `/hl/*`, no a las rutas base, o accederá a la superficie nativa (que rechaza los campos exclusivos de HL). La traducción HL↔nativo vive únicamente en el gateway.

## Convención de envelope

- Lecturas de `/info`: HTTP 200 con el cuerpo JSON específico del tipo. Ante una solicitud incorrecta (`type` desconocido, `user` ausente o inválido), HTTP 400 con `{"error":"<mensaje>"}`. Un fallo en el backhaul del nodo se expone de forma honesta: 502 `{"error":...}` para errores de transporte/5xx, 400 para parámetros rechazados por el nodo — **nunca** un éxito vacío fabricado.
- Escrituras de `/exchange`: la convención HL de `{"status":"ok"|"err", "response":<...>}` (los errores devuelven 200). Véase [`/exchange` más abajo](#exchange--ruta-de-escritura).

---

## `/info` — ruta de lectura

Solo lectura. Despacha según el campo `type` del cuerpo de la solicitud. Refleja el `/info` de HL.

### Tipo HL info → tipo nativo MTF del nodo

Este es el mapa maestro. La **traducción** siempre implica: snake_case → camelCase, entero/centavos/`u32`-id → cadena decimal / dirección `0x`, envelope `{type,data}` del nodo desenvuelto. La capa de traducción vive únicamente en el gateway.

| Tipo HL `/info` | Estado | Fuente nativa MTF del nodo | Notas |
|-----------------|--------|---------------------------|-------|
| `clearinghouseState` / `userState` | **conectado** | [`account_state`](./info.md#account_state) | `marginSummary` proviene de `balance_quote` del nodo; `assetPositions:[]` hasta que el nodo exponga el estado por posición |
| `delegations` | **conectado** | [`staking_state`](./info.md#staking_state) | el nodo usa `account_id` compacto como clave; una dirección keccak real sin id compacto devuelve un error honesto (no una lista vacía fabricada) |
| `userFees` | **conectado** | [`fee_schedule`](./info.md#fee_schedule) | `feeSchedule` está en vivo; `activeReferrer`/`userVolumes`/`dailyUserVlm` esperan las lecturas `user_referrer`/`user_volume` del nodo |
| `l2Book` | stub | [`l2_book`](./info/perpetuals.md#l2_book) | la lectura del nodo existe; la traducción del gateway a `{coin,levels,time}` aún no está conectada — devuelve un libro vacío conforme a HL |
| `meta` | stub | — | requiere una lectura de todos los mercados/universo del nodo (el `market_info` del nodo es por id); devuelve `{universe:[],marginTables:[]}` |
| `allMids` | stub | — | requiere la lectura del universo (mismo bloqueador que `meta`); devuelve `{}` |
| `metaAndAssetCtxs` | **conectado** | [`markets`](./info/perpetuals.md#markets) | `[meta, [assetCtx...]]`; cada `assetCtx` de perp lleva `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `funding` / `openInterest` / `oraclePx`, todos como cadenas decimales en USDC |
| `openOrders` | stub | [`open_orders`](./info.md#open_orders) | la lectura del nodo existe; la traducción del gateway aún no está conectada — devuelve `[]` |
| `frontendOpenOrders` | stub | [`open_orders`](./info.md#open_orders) | `openOrders` + indicaciones de UI; devuelve `[]` |
| `vaultDetails` | stub | [`vault_state`](./info.md#vault_state) | requiere un registro de dirección líder → `vault_id` (el nodo usa `vault_id` como clave); refleja el `user` de la solicitud con datos financieros en cero |
| `subAccounts` | **conectado** | [`sub_accounts`](./info.md#sub_accounts) | mapea `{index,address}` del nodo → `{subAccountUser,name,master}`; `clearinghouseState` omitido (sin join de estado por subcuenta en la lectura del nodo) |
| `referral` | stub | — | el referidor se establece con `Action::setReferrer`, es inmutable; devuelve `referredBy:null` |
| `spotClearinghouseState` | **conectado** | [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state) | `{asset,name,balance}` del nodo → `{coin,token,total}`; `hold:"0"` / `entryNtl:null` (sin retención/base de costo en la lectura del nodo) |
| `spotMeta` / `spotMetaAndAssetCtxs` | **conectado** | [`spot_meta`](./info/spot.md#spot_meta) | los `pairs` del nodo → `universe`; registro de `tokens` a partir del `name` / `szDecimals` / `weiDecimals` reales por token del nodo (USDC con `isCanonical`); cada `assetCtx` spot lleva `dayNtlVlm` / `prevDayPx` / `markPx` / `midPx` / `circulatingSupply`, cadenas decimales en USDC |
| `predictedFundings` | stub | — | devuelve `[]` |
| `orderStatus` | stub | — | resuelve a `{status:"unknownOid",order:null}` |
| `maxBuilderFee` | **conectado** | [`max_builder_fee`](./info.md#max_builder_fee) | proyecta el `max_fee_bps` del nodo como el número HL sin envolver; par no aprobado → `0` |
| `userRateLimit` | **conectado** | [`user_rate_limit`](./info.md#user_rate_limit) | `lifetime_count` del nodo → `nRequestsUsed`, `nRequestsCap` de referencia; `cumVlm:"0.0"` (sin volumen del nodo en esta lectura) |
| `userNonFundingLedgerUpdates` | stub | — | devuelve `[]` |
| `userFunding` / `userFundings` | no servido | — | historial de pagos de financiación por usuario — servido por el indexador del gateway (hoja de ruta) |
| `fundingHistory` | **conectado** | [`funding_history`](./info/perpetuals.md#funding_history) | muestras de prima/tasa realizada por moneda en una ventana de tiempo, desde el rastreador de financiación en vivo del nodo |
| `userFills` | **conectado** | [`user_fills`](./info.md#user_fills) | registro detallado de ejecuciones, desde la cinta de ejecuciones por cuenta comprometida |
| `userFillsByTime` | **conectado** | [`user_fills_by_time`](./info.md#user_fills_by_time) | `userFills` filtrado por tiempo, misma cinta de ejecuciones comprometida |
| `historicalOrders` | no servido | — | lista de órdenes en estado terminal — servida por el indexador del gateway (hoja de ruta) |
| `candleSnapshot` | no servido | — | historial OHLCV — servido por el indexador del gateway (hoja de ruta) |

Leyenda: **conectado** = estado en vivo del nodo hoy · stub = forma vacía correcta conforme a HL, sin respaldo del nodo aún · no servido = sin respaldo del nodo aún, servido por el indexador del gateway (hoja de ruta).

:::info
El contrato **honest-empty** es fundamental: los clientes HL iteran estas respuestas de forma incondicional. Un stub debe emitir `[]` / `{}` / el cero tipado — **nunca** `null` donde el cliente espera un objeto — para que los SDKs de HL sin modificar deserialicen de forma idéntica tanto si el dato está en vivo como si está pendiente.
:::

### Tipos conectados

#### `clearinghouseState` / `userState`

Dos alias — ambos devuelven el estado del clearinghouse por usuario. **Conectado** al nodo [`account_state`](./info.md#account_state). El `balance_quote` del nodo (colateral USDC en dólares enteros) se mapea sobre el resumen de margen de HL. El detalle por posición aún no está en la superficie del nodo, por lo que `assetPositions` es `[]`.

```json
{"type":"clearinghouseState", "user":"0x..."}
```

Respuesta (forma HL):

```json
{
  "assetPositions": [],
  "marginSummary": {
    "accountValue":    "1000.0",
    "totalNtlPos":     "0.0",
    "totalRawUsd":     "1000.0",
    "totalMarginUsed": "0.0"
  },
  "crossMarginSummary":         { "accountValue": "1000.0", "totalNtlPos": "0.0", "totalRawUsd": "1000.0", "totalMarginUsed": "0.0" },
  "crossMaintenanceMarginUsed": "0.0",
  "withdrawable":               "1000.0",
  "time":                       0
}
```

Una vez que el nodo exponga el estado por posición, `assetPositions[]` se llenará con la forma de HL:

```json
{
  "type":     "oneWay",
  "position": {
    "coin":           "BTC",
    "szi":            "1.0",
    "entryPx":        "100.0",
    "leverage":       { "type": "cross", "value": 10 },
    "marginUsed":     "10.5",
    "unrealizedPnl":  "0.5",
    "returnOnEquity": "0.05",
    "liquidationPx":  "92.5",
    "positionValue":  "100.5",
    "maxLeverage":    50,
    "cumFunding":     { "allTime": "0.123", "sinceOpen": "0.05" }
  }
}
```

#### `userFees`

**Conectado**: `feeSchedule` se obtiene en vivo desde el nodo [`fee_schedule`](./info.md#fee_schedule) (renombrando snake→camel; los bps permanecen como números JSON, acotados < 65536). Los datos por usuario (`activeReferrer`, `userVolumes`, `dailyUserVlm`) esperan las lecturas `user_referrer` / `user_volume` del nodo.

```json
{"type":"userFees","user":"0x..."}
```

```json
{
  "activeReferrer": null,
  "userVolumes":    [],
  "feeSchedule": {
    "takerBps":         5,
    "makerBps":         2,
    "referrerShareBps": 0,
    "builderCapBps":    8,
    "deployerCapBps":   0,
    "burnBps":          0,
    "vaultBps":         0,
    "validatorBps":     0,
    "treasuryBps":      0
  },
  "dailyUserVlm":   "0.0"
}
```

#### `delegations`

**Conectado** al nodo [`staking_state`](./info.md#staking_state). El nodo indexa el staking por `account_id` compacto (u64), por lo que el gateway invierte su incrustación de dirección; una dirección keccak real sin id compacto devuelve un error honesto en lugar de una lista vacía fabricada.

```json
{"type":"delegations","user":"0x..."}
```

```json
[
  { "validator": "0x<val>", "amount": "100.0", "lockedUntilTimestamp": 1735000000000 }
]
```

#### `subAccounts`

**Conectado** al nodo [`sub_accounts`](./info.md#sub_accounts). Cada `{index, address}` del nodo se mapea a `{"subAccountUser","name","master"}` — `subAccountUser` es la dirección de la subcuenta del nodo, `master` es el propietario consultado, `name` es una etiqueta `sub-<index>` (sin etiqueta de subcuenta en cadena). `clearinghouseState` se omite: la lectura del nodo no incluye un join del estado de cuenta por subcuenta.

```json
{"type":"subAccounts","user":"0x..."}
```

```json
[
  { "subAccountUser": "0x...", "name": "sub-0", "master": "0x..." }
]
```

#### `spotClearinghouseState`

**Conectado** al nodo [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state) (por `address` en formato 0x). El `{asset, name, balance}` del nodo → HL `{coin, token, total, hold, entryNtl}`: `coin` proviene del `name` del nodo, `token` del id `asset` del nodo, `total` del `balance` del nodo. `hold` es `"0"` y `entryNtl` es `null` — la lectura del nodo no incluye retención ni base de costo por saldo.

```json
{"type":"spotClearinghouseState","user":"0x..."}
```

```json
{ "balances": [ { "coin": "MTF", "token": 104, "total": "10", "hold": "0", "entryNtl": null } ] }
```

#### `spotMeta` / `spotMetaAndAssetCtxs`

**Conectado** al nodo [`spot_meta`](./info/spot.md#spot_meta). Cada par del nodo se mapea a una entrada de `universe` (`tokens:[base,quote]`, `index` = id del par, `isCanonical` = `active` del nodo). El registro de `tokens` se construye a partir del registro real por token del nodo: el `name` / `sz_decimals` / `wei_decimals` de cada entrada se mapean directamente a `name` / `szDecimals` / `weiDecimals` de HL; `index` es el id del activo del token, `tokenId` es el hex de 32 bytes del id, y USDC se marca con `isCanonical`.

```json
{"type":"spotMeta"}
```

```json
{
  "tokens":   [ { "name": "USDC", "szDecimals": 2, "weiDecimals": 6, "index": 100, "tokenId": "0x...", "isCanonical": true },
                { "name": "MTF",  "szDecimals": 2, "weiDecimals": 8, "index": 104, "tokenId": "0x...", "isCanonical": false } ],
  "universe": [ { "name": "MTF/USDC", "tokens": [104, 100], "index": 113, "isCanonical": true } ]
}
```

Los ids de token del nodo comienzan en `100` (USDC) — véase [`spot_meta`](./info/spot.md#spot_meta) para el registro completo — por lo que `index` refleja esos ids, no el esquema base `0` de HL.

`spotMetaAndAssetCtxs` devuelve `[spotMeta, [spotAssetCtx...]]`; el segundo elemento es un `spotAssetCtx` por par, alineado por índice con `spotMeta.universe`. Cada `spotAssetCtx` lleva el `coin` del par junto con contexto en vivo:

```json
{
  "coin":              "MTF/USDC",
  "dayNtlVlm":         "42000.00",
  "prevDayPx":         "4.95",
  "markPx":            "5.00",
  "midPx":             "5.00",
  "circulatingSupply": "21000000.0"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `dayNtlVlm` | cadena decimal | Volumen nocional de las últimas 24 horas, en **USD** |
| `prevDayPx` | cadena decimal | Precio hace 24 horas, en **USDC decimal** |
| `markPx` | cadena decimal | Precio de marca actual, en **USDC decimal** |
| `midPx` | cadena decimal | Punto medio del libro de órdenes actual, en **USDC decimal** |
| `circulatingSupply` | cadena decimal | Suministro circulante del token base |

Todos los precios son cadenas en USDC decimal (legibles por humanos), no enteros en bruto.

#### `maxBuilderFee`

**Conectado** al nodo [`max_builder_fee`](./info.md#max_builder_fee) (`address` en 0x + `builder`). Devuelve el `max_fee_bps` del nodo como el número HL sin envolver (HL emite el entero, no un objeto); un par `(user, builder)` no aprobado → `0`.

```json
{"type":"maxBuilderFee","user":"0x...","builder":"0x..."}
```

#### `userRateLimit`

**Conectado** al nodo [`user_rate_limit`](./info.md#user_rate_limit) (por `address` en 0x). El `lifetime_count` del nodo se mapea a `nRequestsUsed`; `nRequestsCap` es la referencia de HL (1200). `cumVlm` permanece en `"0.0"` — la lectura de límite de tasa del nodo está basada en estadísticas de acciones, no en volumen (a la espera de una lectura de volumen del nodo).

```json
{ "cumVlm": "0.0", "nRequestsUsed": 123, "nRequestsCap": 1200 }
```

### Tipos stub (forma vacía correcta conforme a HL)

Estos devuelven la forma exacta de HL con contenidos vacíos o en cero. La lectura del nodo existe para varios (`l2Book`, `openOrders`, `vaultDetails`) — solo la *traducción* en el gateway está pendiente; para el resto, el propio respaldo del nodo está pendiente.

#### `l2Book`

```json
{"type":"l2Book","coin":"BTC"}
```

```json
{
  "coin": "BTC",
  "levels": [ [ /* bids */ ], [ /* asks */ ] ],
  "time": 0
}
```

`levels` es una tupla `[bids, asks]` (forma HL); cada nivel es `{"px":"...","sz":"...","n":N}`. Se respaldará en el nodo [`l2_book`](./info/perpetuals.md#l2_book) una vez que la traducción esté conectada.

#### `meta`

```json
{"type":"meta"}
```

```json
{ "universe": [], "marginTables": [] }
```

Cada entrada de `universe` (una vez disponible la lectura del universo del nodo): `{"name":"BTC","szDecimals":5,"maxLeverage":50,"onlyIsolated":false}`.

#### `metaAndAssetCtxs`

`[meta, [assetCtx...]]` (forma de tupla de HL). El segundo elemento es un `assetCtx` por mercado de contratos perpetuos, alineado por índice con `meta.universe`. Cada `assetCtx` se popula con el estado de mercado en vivo:

```json
{
  "dayNtlVlm":    "1850000.00",
  "prevDayPx":    "66800.00",
  "markPx":       "67042.50",
  "midPx":        "67042.33",
  "funding":      "0.0000125",
  "openInterest": "1250.5",
  "oraclePx":     "67040.00"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `dayNtlVlm` | cadena decimal | Volumen nocional de las últimas 24 horas, en **USD** |
| `prevDayPx` | cadena decimal | Precio hace 24 horas, en **USDC decimal** |
| `markPx` | cadena decimal | Precio de marca actual, en **USDC decimal** |
| `midPx` | cadena decimal | Punto medio del libro de órdenes actual, en **USDC decimal** |
| `funding` | cadena decimal | Tasa de financiación actual (por intervalo) |
| `openInterest` | cadena decimal | Interés abierto, en unidades base |
| `oraclePx` | cadena decimal | Último precio de oráculo / índice, en **USDC decimal** |

Todos los precios son cadenas en USDC decimal (legibles por humanos), no enteros en bruto.

#### `allMids`

```json
{"type":"allMids"}
```

Mapa de nombre de activo → precio medio: `{"BTC":"100.55","ETH":"3200.0"}`. Stub: `{}`.

#### `openOrders` / `frontendOpenOrders`

```json
{"type":"openOrders","user":"0x..."}
```

Array de `{"coin","side","limitPx","sz","oid","timestamp","origSz","reduceOnly","orderType","tif","cloid"}`. `side`: `"B"` (compra) / `"A"` (venta). `frontendOpenOrders` agrega campos de UI (`triggerPx`, `isTrigger`, `isPositionTpsl`, `orderType`). Se respalda en el nodo [`open_orders`](./info.md#open_orders). Stub: `[]`.

#### `vaultDetails`

```json
{"type":"vaultDetails","user":"0x..."}
```

```json
{
  "vaultAddress":     "0x...",
  "leader":           "0x...",
  "shares":           "0.0",
  "navUsd":           "0.0",
  "isPaused":         false,
  "managementFeeBps": 1000,
  "withdrawalLockMs": 345600000,
  "createdAtMs":      0,
  "followerCount":    0
}
```

Los vaults de MetaFlux no son vaults de HL — misma forma de consulta, entidades distintas (véase [vaults](../../concepts/vaults.md), [MIP-2](../../mip/mip-2.md)). Se respaldará en el nodo [`vault_state`](./info.md#vault_state) una vez que el registro líder→`vault_id` esté conectado. `managementFeeBps` / `withdrawalLockMs` son números JSON acotados (HL usa números para parámetros y cadenas para cantidades monetarias).

#### `referral`

```json
{
  "referredBy": null,
  "referrerState": {
    "cumVlm": "0.0",
    "cumRewardedFeesSinceReferred": "0.0",
    "cumFeesRewardedToReferrer": "0.0",
    "claimedRewards": "0.0"
  },
  "rewardHistory": []
}
```

`referredBy` es `null` (no `{}`) — los clientes HL distinguen "nunca se estableció un referidor" de "establecido pero inactivo". El referidor es inmutable una vez fijado con `setReferrer`.

#### Otros stubs

| Tipo | Respuesta stub |
|------|----------------|
| `predictedFundings` | `[]` |
| `orderStatus` | `{"status":"unknownOid","order":null}` |
| `userNonFundingLedgerUpdates` | `[]` |

### Tipos aún no servidos

Estos no tienen respaldo del nodo todavía y devuelven la forma vacía de HL hoy; están previstos para el indexador del gateway (hoja de ruta):

| Tipo | Stub vacío | Notas |
|------|------------|-------|
| `historicalOrders` | `[]` | lista de órdenes en estado terminal |
| `candleSnapshot` | `[]` | historial OHLCV (use el canal WS [`candle`](../ws/subscriptions.md) para barras en vivo) |
| `userFunding` / `userFundings` | `[]` | historial de pagos de financiación por usuario |

`userFills` / `userFillsByTime` y `fundingHistory` ya están **conectados** al estado en vivo del nodo — véase la [tabla de traducción](#tipo-hl-info--tipo-nativo-mtf-del-nodo) anterior. La forma del registro de ejecuciones HL: `{coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, feeToken}`.

### Errores en `/info`

| HTTP | Cuerpo | Causa |
|------|--------|-------|
| 400 | `{"error":"missing field \`type\`"}` | Sin discriminador `type` |
| 400 | `{"error":"unknown request type: <X>"}` | `type` mal escrito o no soportado |
| 400 | `{"error":"missing field user"}` | `user` requerido omitido |
| 400 | `{"error":"invalid user address: <X>"}` | `user` no es `0x` + 40 hex |
| 400 | `{"error":"missing field coin"}` | `l2Book` / `fundingHistory` / `candleSnapshot` sin `coin` |
| 502 | `{"error":"<node error>"}` | Tipo conectado cuyo backhaul del nodo falló (transporte/5xx) |

El `/info` de HL usa códigos de estado HTTP estándar con `{"error":...}` (a diferencia de `/exchange`, que usa el envelope 200-con-`status`).

---

## `/exchange` — ruta de escritura

### Envelope de solicitud

```json
{
  "action":       { /* objeto de acción HL */ },
  "nonce":        1735689600000,
  "signature":    { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

| Campo | Descripción |
|-------|-------------|
| `action` | Acción en forma HL (véase más abajo) |
| `nonce` | Unix en ms, estrictamente creciente por firmante |
| `signature` | Objeto RSV — tres cadenas hex + uint `v` (27/28 o 0/1) |
| `vaultAddress` | `null` para la propia cuenta; `"0x<vault>"` para actuar como gestor de vault |

La firma es sobre el envelope EIP-712 (véase la [guía de firma](../../integration/signing.md)) usando el dominio de **MetaFlux** (`chainId = 31337` devnet / `114514` testnet / `8964` mainnet — véase [redes](../../networks.md)). El `chainId` debe coincidir con el `chain_id` de consenso del nodo (consulte [`/info` `node_info`](./info.md#node_info)).

### Envelope de respuesta

Las escrituras usan la convención HL de `{"status":"ok"|"err","response":<...>}` (los errores devuelven 200):

```json
{ "status": "ok",  "response": <específico del tipo> }
{ "status": "err", "response": "<cadena de error>" }
```

### Tipos de acción soportados

| `action.type` | Estado | Notas |
|---------------|--------|-------|
| `order` | soportado | limit / IOC / ALO; conjunto completo de TIF |
| `cancel` | soportado | por `oid` |
| `cancelByCloid` | en despliegue | por `cloid` |
| `modify` / `batchModify` | en despliegue | cancelar-y-reemplazar |
| `scheduleCancel` | en despliegue | interruptor de seguridad automático |
| `updateLeverage` / `updateIsolatedMargin` | en despliegue | — |
| `usdSend` / `spotSend` / `usdClassTransfer` | en despliegue | transferencias |
| `withdraw3` | en despliegue | retiro externo (MetaBridge) |
| `approveAgent` | en despliegue | aprobación de cartera agente |
| `vaultTransfer` / `subAccountTransfer` | en despliegue | movimiento de fondos |
| `setReferrer` / `convertToMultiSigUser` | en despliegue | — |
| `twapOrder` / `twapCancel` | en despliegue | — |
| (todo lo demás que HL incluye) | devuelve `{"status":"err","response":"unimplemented action: <type>"}` | Use [MTF nativo](./exchange.md) para esos casos |

### Ejemplo de `order`

```json
{
  "action": {
    "type": "order",
    "orders": [
      { "a": 0, "b": true, "p": "100.5", "s": "1.0", "r": false, "t": { "limit": { "tif": "Gtc" } } }
    ],
    "grouping": "na"
  },
  "nonce": 1735689600000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Abreviatura de campos (convención HL): `a`=id de activo · `b`=es_compra · `p`=precio límite · `s`=tamaño · `r`=solo_reducir · `t.limit.tif`=`"Gtc"`/`"Ioc"`/`"Alo"` · `c`=`cloid` opcional de 16 bytes.

Órdenes de tipo trigger: `"t": { "trigger": { "isMarket": false, "triggerPx": "96.0", "tpsl": "sl" } }`.

### Respuesta de `order`

```json
{
  "status": "ok",
  "response": { "type": "order", "data": { "statuses": [ { "resting": { "oid": 12345, "cloid": "0x..." } } ] } }
}
```

Estado por orden (uno por entrada en `orders[]`, en orden):

| Variante | Significado |
|----------|-------------|
| `{"resting":{"oid":N,"cloid":"0x..."}}` | Publicada en el libro |
| `{"filled":{"totalSz":"...","avgPx":"...","oid":N,"cloid":"0x..."}}` | Ejecutada de inmediato |
| `{"error":"<motivo>"}` | Esta entrada fue rechazada (otras pueden tener éxito) |

### Ejemplo de `cancel`

```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 0, "o": 12345 }] },
  "nonce": 1735689600001,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Respuesta: `{"status":"ok","response":{"type":"cancel","data":{"statuses":["success"]}}}`. Por entrada de cancelación: `"success"` o `{"error":"<motivo>"}`.

### Errores en `/exchange`

| Cuerpo | Causa |
|--------|-------|
| `{"status":"err","response":"signature_invalid"}` | Dirección recuperada ≠ firmante / chainId incorrecto |
| `{"status":"err","response":"unimplemented action: <type>"}` | La superficie de compatibilidad aún no cubre esta acción |
| `{"status":"err","response":"nonce too small"}` | Nonce reutilizado |
| `{"status":"err","response":"agent_not_approved"}` | El agente firmó pero no existe aprobación |

---

## Diferencias con HL que conviene conocer

Véase [migración desde HL](../../integration/migrating-from-hl.md) para la referencia completa. Puntos destacados:

- **`chainId`** en el dominio de firma es el de MetaFlux (`31337` devnet / `114514` testnet / `8964` mainnet), NO el de HL (`998`/`999`).
- **Los IDs de activo no son numéricamente iguales** a los de HL. Consúltelos via `info { "type": "meta" }` una vez que esa lectura esté conectada; nunca los codifique de forma fija.
- **El nivel de liquidación tarjeta amarilla T0** existe en MTF (entre sano y la "Liquidación Parcial" de HL). Los bots que observan eventos de liquidación verán un tipo de evento adicional.
- **Los tipos de acción HL más allá de `order` / `cancel`** devuelven `err` durante el despliegue. Use [`POST /exchange`](./exchange.md) nativo MTF, o espere.
- **Las lecturas detalladas** `userFills` / `userFillsByTime` / `fundingHistory` ya se sirven en vivo desde el estado del nodo comprometido. Las lecturas de historial restantes (`historicalOrders`, `candleSnapshot`, `userFunding`) aún no están disponibles — previstas para el indexador del gateway (hoja de ruta). Use los canales WS [`userFills`](../ws/subscriptions.md) / [`candle`](../ws/subscriptions.md) para datos en vivo mientras tanto.

## Véase también

- [`POST /info`](./info.md) — lecturas nativas MTF del nodo de las que estos tipos HL se traducen
- [`POST /exchange`](./exchange.md) — ruta de escritura nativa MTF
- [Compatibilidad con CCXT](./ccxt-compat.md) — la otra superficie de compatibilidad
- [Migración desde HL](../../integration/migrating-from-hl.md) · [Guía de firma](../../integration/signing.md) · [Errores](../errors.md)
