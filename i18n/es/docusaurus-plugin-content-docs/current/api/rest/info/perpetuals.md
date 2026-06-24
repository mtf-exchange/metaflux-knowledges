---
description: "Consultas de lectura POST /info para mercados perpetuos — información de mercado, libros de órdenes, operaciones, financiamiento, liquidación y estado del despliegue perpetuo."
---

# `POST /info` — consultas de contratos perpetuos

Consultas de lectura para mercados de **contratos perpetuos**. Mismo endpoint `POST /info`, sobre (envelope) y convenciones que la [página base](../info.md) — estos son los `type`s específicos para mercados perpetuos. (Las lecturas de libro de órdenes / operaciones / velas también sirven pares spot por id de `pair`.)

## Tipos de consulta de contratos perpetuos

### `market_info`

Metadatos por mercado.

```json
{ "type": "market_info", "asset_id": 0 }
```

O por nombre:

```json
{ "type": "market_info", "coin": "BTC" }
```

Respuesta:

```json
{
  "type": "market_info",
  "data": {
    "asset_id":        0,
    "name":            "BTC",
    "kind":            "perp",
    "sz_decimals":     5,
    "mark_px":         "67079.265",
    "oracle_px":       "67073.35",
    "mid_px":          "67079.27",
    "premium":         "0.0015",
    "tick_size":       "1000000",
    "step_size":       "1",
    "min_order":       "1",
    "max_leverage":    50,
    "maint_margin_ratio": "300",
    "init_margin_ratio":  "200",
    "funding": {
      "rate_per_hr":  "0",
      "cap_per_hr":   "400",
      "interval_ms":     3600000,
      "next_payment_ts": 0
    },
    "mark_source": "MedianOfOraclesAndMid",
    "fba_enabled": false,
    "open_interest": "0"
  }
}
```

:::info
**Plano de reporte de precios.** En esta lectura, tanto `mark_px` como `oracle_px` están en el
**plano decimal de USDC entero** (dólares legibles — `"67079.265"` / `"67073.35"`), la
misma unidad que el precio de marca de las posiciones en cuenta. `mark_px` es el precio de marca
en libro escalado hacia abajo desde la representación interna de punto fijo 1e8 del motor, con
retorno al precio del oráculo cuando el libro aún no tiene precio de marca; `oracle_px` es el
último precio de índice confirmado. Cualquiera de los dos es `"0"` cuando no está definido.
Nótese que el **plano de envío de órdenes/libro permanece en punto fijo 1e8** — los precios de
nivel de `l2_book` y `limit_px` de órdenes NO son USDC entero; MTF mantiene estos dos planos
de escala separados, y solo las lecturas orientadas a personas (`market_info`, `markets`,
posiciones) reportan precios en USDC entero. Los significados de los campos para el resto
del registro se encuentran en la tabla de [`markets`](#markets) más abajo.
:::

:::info
**Precisión de precio vs `sz_decimals`.** `mark_px` y `oracle_px` están **ajustados al
tick de precio del mercado** (`tick_size`, truncado hacia cero), por lo que una lectura nunca
muestra ruido de sub-tick — con un tick de `$0.01` (`tick_size: "1000000"` en el plano 1e8),
`66735.255` se reporta como `"66735.25"`. Nótese que `sz_decimals` es la precisión de **TAMAÑO**
(granularidad de la cantidad de la orden — `5` ⇒ `0.00001` unidades), **no** rige los decimales
del precio; el tick de precio sí lo hace. Los dos son ejes independientes (el mismo criterio que usa HL).
:::

### `markets`

Todos los mercados perpetuos MIP-3 registrados, en una sola llamada. Sin parámetros.

```json
{ "type": "markets" }
```

El payload `data` es un **arreglo** del mismo registro completo por mercado que
[`market_info`](#market_info) devuelve para un solo activo. Los registros están ordenados
de forma determinista por `asset_id` ascendente (el nodo itera el
`BTreeMap` de `mip3_market_specs`). Un universo vacío devuelve `"data": []`.

Respuesta:

```json
{
  "type": "markets",
  "data": [
    {
      "asset_id":        0,
      "name":            "BTC",
      "kind":            "perp",
      "sz_decimals":     5,
      "mark_px":         "67042.335",
      "oracle_px":       "67042.335",
      "mid_px":          "67042.33",
      "premium":         "0.0015",
      "tick_size":       "1000000",
      "step_size":       "1",
      "min_order":       "1",
      "max_leverage":    50,
      "maint_margin_ratio": "300",
      "init_margin_ratio":  "200",
      "funding": {
        "rate_per_hr":  "0",
        "cap_per_hr":   "400",
        "interval_ms":     3600000,
        "next_payment_ts": 0
      },
      "mark_source": "MedianOfOraclesAndMid",
      "fba_enabled": false,
      "open_interest": "0"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `asset_id` | uint32 | Id de activo canónico (clave de ordenamiento) |
| `name` | string | Símbolo del mercado, p. ej. `"BTC"` |
| `kind` | `"perp"` | Tipo de mercado (en minúsculas) |
| `sz_decimals` | uint8 | Decimales de visualización de tamaño (del registro de tokens spot subyacente; `0` si no hay especificación de token) |
| `mark_px` | Decimal string | Precio de marca en libro, **plano USDC entero** (precio de marca escalado fuera de 1e8, con retorno al oráculo; `"0"` si no está definido) |
| `oracle_px` | Decimal string | Precio de índice, **plano USDC entero** (`"0"` si no está definido) |
| `mid_px` | Decimal string \| null | Punto medio real del libro de órdenes `(mejor_compra + mejor_venta) / 2`, **plano USDC entero** (ajustado al tick); `null` cuando el libro es unilateral / está vacío |
| `premium` | Decimal string \| null | Última muestra de prima de financiamiento confirmada (con signo); `null` cuando no existe muestra |
| `tick_size` | i128 string | Incremento mínimo de precio, **punto fijo 1e8** (plano de envío de órdenes/libro) |
| `step_size` | u128 string | Incremento mínimo de tamaño (tamaño de lote), punto fijo |
| `min_order` | u128 string | Tamaño mínimo de orden |
| `max_leverage` | uint8 | Apalancamiento máximo |
| `maint_margin_ratio` | bps string | Ratio de margen de mantenimiento, bps decimales |
| `init_margin_ratio` | bps string | Ratio de margen inicial (`1 / max_leverage`), bps decimales |
| `funding.rate_per_hr` | bps string | Última muestra de prima de financiamiento, bps decimales |
| `funding.cap_per_hr` | bps string | Límite de tasa de financiamiento por hora, bps decimales |
| `funding.interval_ms` | uint64 | Cadencia del financiamiento (1h = `3600000`) |
| `funding.next_payment_ts` | uint64 | Marca de tiempo del próximo pago de financiamiento (`0` hasta que exista una muestra) |
| `mark_source` | string | Descriptor del precio de marca (`"MedianOfOraclesAndMid"`) |
| `fba_enabled` | bool | Subasta por lotes frecuentes habilitada para este mercado |
| `open_interest` | u128 string | Interés abierto actual, punto fijo |

Cada elemento es idéntico byte a byte al `data` de la respuesta `market_info` del activo individual
correspondiente — ambos se construyen a partir del mismo generador de registros por mercado, por lo que
las formas individual y masiva nunca divergen. Véase [`market_info`](#market_info) para los
significados a nivel de campo y las notas del proxy FLAGGED (`mark_source`,
`next_payment_ts`).

### `l2_book`

Niveles de compra/venta agregados con alcance de mercado.

```json
{ "type": "l2_book", "market_id": 0 }
```

| Arg | Tipo | Requerido |
|-----|------|----------|
| `market_id` | uint32 | sí |

Respuesta:

```json
{
  "type": "l2_book",
  "data": {
    "market_id": 0,
    "bids": [ { "px": "99000", "size": "700", "n_orders": 1 } ],
    "asks": [ { "px": "101000", "size": "750", "n_orders": 2 } ]
  }
}
```

Las ofertas de compra (bids) van del mejor al peor (precio descendente), las de venta (asks) ascendentes. Cada nivel agrega
el `size` sumado y el conteo `n_orders` de órdenes en reposo. Un mercado desconocido / vacío
devuelve arreglos `bids` / `asks` vacíos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `market_id` | uint32 | Id de mercado reflejado |
| `bids[*].px` / `asks[*].px` | i128 string | Precio del nivel, cadena decimal de punto fijo |
| `bids[*].size` / `asks[*].size` | u128 string | Tamaño sumado en el nivel |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Órdenes en reposo en el nivel |

### `recent_trades`

Cinta de operaciones públicas con alcance de mercado, servida directamente desde el estado
confirmado en nodo (un anillo de operaciones acotado por mercado incluido en el AppHash — sin indexador externo).

```json
{ "type": "recent_trades", "market_id": 0 }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `market_id` | uint32 | sí | Id de activo / mercado |
| `limit` | uint32 | no | Limita el número de registros **más recientes** devueltos; ausente / `0` ⇒ el anillo completo |

Respuesta:

```json
{
  "type": "recent_trades",
  "data": {
    "market_id":      0,
    "last_trade_ms":  1700000000555,
    "trades": [
      {
        "coin":  0,
        "side":  "B",
        "px":    "67042.50",
        "sz":    "0.125",
        "time":  1700000000555,
        "tid":   90123,
        "block": 562,
        "hash":  "0x2315b79b9e82c2deb279a59448bf7841f3767d30d874e5b544d75bb9fd1e9b0c"
      }
    ]
  }
}
```

Los registros están ordenados del más antiguo al más reciente (el más nuevo al final). El anillo está acotado, por lo que esto
es una ventana reciente, no todo el historial. Un mercado desconocido / que nunca ha operado devuelve
`"trades": []` y `last_trade_ms: 0`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `market_id` | uint32 | Id de mercado reflejado |
| `last_trade_ms` | uint64 | Marca de tiempo de la última operación (`0` si no hay ninguna) |
| `trades[*].coin` | uint32 | Id de activo / mercado en el que se ejecutó la operación |
| `trades[*].side` | `"B"` / `"A"` | Token de lado del tomador (agresor) — `"B"` = compra, `"A"` = venta |
| `trades[*].px` | Decimal string | Precio de ejecución, **USDC decimal** (legible para personas) |
| `trades[*].sz` | Decimal string | Tamaño ejecutado, **unidades base** (unidad entera) |
| `trades[*].time` | uint64 | Marca de tiempo de la operación (ms de consenso) |
| `trades[*].tid` | uint64 | Id de operación determinista (compartido por ambas patas del cierre) |
| `trades[*].block` | uint64 | Altura del bloque confirmado en que se liquidó la operación (localizador en cadena) |
| `trades[*].hash` | hex string | Hash de transacción de la orden originadora, hex con prefijo `0x` — permite rastrear un cierre en cadena |

### `candle`

Barras OHLCV históricas para `(coin, interval)` en una ventana de tiempo. El
complemento REST del canal WS en vivo [`candles`](../../ws/subscriptions.md#candles) —
el WS empuja la barra en formación a medida que llegan operaciones; esta lectura devuelve el
historial cerrado.

```json
{ "type": "candle", "coin": "BTC", "interval": "1m" }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `coin` | string | sí | Símbolo del mercado, p. ej. `"BTC"` |
| `interval` | string | sí | Token de intervalo — uno de `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | no | Inicio de la ventana (ms); filtra por apertura de barra. Por defecto `0` |
| `end_time` | uint64 | no | Fin de la ventana (ms); filtra por apertura de barra. Por defecto sin límite |

Los argumentos pueden pasarse de forma plana (como arriba) o anidados bajo un objeto `req`; `start_time` /
`end_time` también aceptan la forma en camelCase `startTime` / `endTime`. Si falta
`coin` o `interval` → `400 {"error":"missing field <name>"}`.

Respuesta:

```json
{
  "type": "candle",
  "data": [
    {
      "t": 1700000040000,
      "T": 1700000099999,
      "s": "BTC",
      "i": "1m",
      "o": "67000.00",
      "c": "67042.50",
      "h": "67080.00",
      "l": "66990.00",
      "v": "12.5",
      "q": "837843.75",
      "n": 37
    }
  ]
}
```

Las barras están ordenadas del más antiguo al más reciente por `t` (tiempo de apertura); el elemento más nuevo es la
barra en formación. Un arreglo vacío es la respuesta vacía honesta para un token de
`interval` no soportado, un mercado sin operaciones indexadas o un despliegue sin
indexador conectado.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `t` | uint64 | Marca de tiempo de **apertura** de la barra (ms, alineada al intervalo) |
| `T` | uint64 | Marca de tiempo de **cierre** de la barra (ms) — `t + intervalo − 1` |
| `s` | string | Símbolo de la moneda / mercado |
| `i` | string | Token del intervalo |
| `o` / `c` / `h` / `l` | Decimal string | Precio de **a**pertura / **c**ierre / **m**áximo / **m**ínimo, **USDC decimal** (dólares legibles, p. ej. `"67042.50"`) |
| `v` | Decimal string | **Volumen en activo base** — Σ tamaño operado en la barra (tamaño en la moneda, NO nocional) |
| `q` | Decimal string | **Volumen en quote (USD)** — `Σ precio × tamaño` sobre los cierres de la barra |
| `n` | uint64 | Conteo de operaciones (cierres) en la barra |

:::info
**La serie no tiene huecos.** Un intervalo **sin operaciones** aún emite una barra plana
que lleva hacia adelante el cierre de la barra anterior: `o = h = l = c = cierre anterior`, y
`v = q = 0`, `n = 0`. Los consumidores obtienen una serie continua de una barra por intervalo sin
huecos que interpolar. **No se emite ninguna barra antes de la primera operación del mercado** — la
serie comienza en el intervalo del primer cierre, por lo que un arreglo vacío significa que el mercado
nunca ha operado (o no hay historial conectado), no que los intervalos tempranos se descartaron.
:::

:::info
**Este tipo es servido por el gateway, no por el nodo.** Las velas son datos
de visualización derivados del flujo público de operaciones — **no** son estado
confirmado de la cadena, nunca tocan el app-hash y no tienen garantía de consenso. El
gateway responde `candle` desde su propio almacén rotativo; un nodo sin gateway consultado
directamente devuelve `unknown info type: candle`. Vacío honesto (`"data": []`) cuando
el gateway aún no tiene historial de operaciones para el mercado.
:::

### `funding_history`

Muestras de prima de financiamiento con alcance por mercado.

```json
{ "type": "funding_history", "market_id": 0 }
```

| Arg | Type | Required |
|-----|------|----------|
| `market_id` | uint32 | yes |

Respuesta:

```json
{
  "type": "funding_history",
  "data": {
    "market_id": 0,
    "samples": [
      { "ts_ms": 1700000000000, "premium": "0.0015", "funding_rate": "0.0015" },
      { "ts_ms": 1700000008000, "premium": "-0.0007", "funding_rate": "-0.0007" }
    ]
  }
}
```

Las muestras corresponden al anillo ordenado de instantáneas de prima del rastreador de financiamiento.
`premium` es el `Decimal` exacto previo al límite, representado como cadena (con signo, precisión
completa); `funding_rate` es dicha prima pasada por el tope de financiamiento por activo
(`±funding_rate_cap`, la anulación de riesgo dinámico o la tasa base de `0.04`/h si no hay anulación)
— es decir, la tasa realizada que se cobraría efectivamente. Cuando la prima está
dentro del tope, `funding_rate == premium`; si la supera, `funding_rate` queda limitado al
tope con signo. Un mercado desconocido o vacío devuelve `"samples": []`.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | uint32 | Id de mercado reflejado |
| `samples[*].ts_ms` | uint64 | Marca de tiempo de la muestra (ms de consenso) |
| `samples[*].premium` | decimal string | Muestra de prima de financiamiento sin procesar, previa al límite (con signo) |
| `samples[*].funding_rate` | decimal string | Tasa realizada = `premium` limitado al tope por activo (con signo) |

### `predicted_fundings`

Tasa de financiamiento prevista por mercado y tiempo del próximo pago, para todos los
mercados de contratos perpetuos registrados. Sin parámetros.

```json
{ "type": "predicted_fundings" }
```

El payload `data` es un **array** ordenado de forma determinista por `asset` ascendente
(el nodo itera el `BTreeMap` de especificaciones de mercado). Un universo vacío devuelve
`"data": []`.

Respuesta:

```json
{
  "type": "predicted_fundings",
  "data": [
    { "asset": 0, "predicted_rate": "0.0015", "next_funding_time": 1700003600000 }
  ]
}
```

`predicted_rate` es la última muestra de prima (el proxy de tasa por hora, como cadena
decimal) — `"0"` antes de la primera muestra. `next_funding_time` es la marca de tiempo
derivada del próximo pago (`last_sample_ts + 1h`), `0` antes de la primera muestra.

| Field | Type | Description |
|-------|------|-------------|
| `asset` | uint32 | Id de activo / mercado |
| `predicted_rate` | decimal string | Última muestra de prima (proxy de tasa por hora); `"0"` antes de la primera muestra |
| `next_funding_time` | uint64 | Marca de tiempo del próximo pago de financiamiento (ms de consenso); `0` antes de la primera muestra |

### `mip3_active_bids`

Instantánea de la subasta de gas para el despliegue permisionless de perpetuos MIP-3. Sin parámetros.

```json
{ "type": "mip3_active_bids" }
```

Respuesta:

```json
{
  "type": "mip3_active_bids",
  "data": {
    "auction_round":   2,
    "current_bid":     "12345",
    "current_winner":  "0x<bidder>",
    "auction_end_ms":  1700086400000,
    "started_at_ms":   1700000000000,
    "bids": [
      {
        "bidder":          "0x<bidder>",
        "amount":          "12345",
        "submitted_at_ms": 1700000000500,
        "tag":             "ETH-PERP"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `auction_round` | uint64 | Ronda de subasta actual |
| `current_bid` | decimal string | Importe de la oferta líder |
| `current_winner` | hex address \| null | Postor ganador actual; `null` si no hay ninguno |
| `auction_end_ms` | uint64 | Marca de tiempo de cierre de la subasta (ms de consenso) |
| `started_at_ms` | uint64 | Marca de tiempo de inicio de la subasta (ms de consenso) |
| `bids[*].bidder` | hex address | Dirección del postor |
| `bids[*].amount` | decimal string | Importe de la oferta |
| `bids[*].submitted_at_ms` | uint64 | Marca de tiempo de envío de la oferta (ms de consenso) |
| `bids[*].tag` | string | Etiqueta de la oferta (p. ej., el nombre de mercado propuesto) |

### `liquidatable`

Cuentas marcadas actualmente para liquidación. Sin parámetros.

```json
{ "type": "liquidatable" }
```

Respuesta:

```json
{
  "type": "liquidatable",
  "data": { "accounts": [ { "address": "0x<addr>", "tier": "PartialMarket50" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accounts[*].address` | hex address | Cuenta que requiere acción |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | Nivel BOLE |

Fuente de estado: `Exchange.bole_index.tier` (el índice BOLE de cuentas que requieren acción — **no** un reescaneo completo de cuentas).

> **MARCADO.** `bole_index` es estado derivado `#[serde(skip)]`, no canónico, reconstruido mediante un escaneo completo en el primer uso / tras la carga de una instantánea. En una instantánea recién publicada estará vacío hasta que el runtime haya ejecutado el paso BOLE al menos una vez.

### `active_asset_data`

Apalancamiento por activo, modo de margen y tamaño máximo de operación de un usuario. Requerido: `address` (hex 0x) + `asset_id` (u32).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "asset_id": 0 }
```

Respuesta:

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "asset_id": 0, "leverage": 7,
    "margin_mode": "isolated", "max_trade_size": "5000000000", "has_position": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `leverage` | uint32 | Apalancamiento de la posición si está abierta; si no, el valor predeterminado de la cuenta; si no, el máximo del mercado |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Modo de margen efectivo |
| `max_trade_size` | decimal string | Tope máximo de orden por activo (véase `max_market_order_ntls`) |
| `has_position` | bool | Indica si el usuario tiene una posición distinta de cero en este activo |

Fuente de estado: `locus.clearinghouses[asset].positions[addr]`, `locus.user_account_configs[addr]`, especificación de mercado / riesgo dinámico.

### `max_market_order_ntls`

Nocional máximo de órdenes de mercado por activo. Sin parámetros.

```json
{ "type": "max_market_order_ntls" }
```

Respuesta:

```json
{
  "type": "max_market_order_ntls",
  "data": { "ntls": [ { "asset_id": 0, "max_market_order_ntl": "5000000000" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | Id de activo |
| `ntls[*].max_market_order_ntl` | decimal string | Tope de tamaño derivado del límite de interés abierto |

Fuente de estado: `PerpAnnotation.oi_cap` por mercado, o bien `default_mip3_limits.max_oi_per_market`.

> **MARCADO.** No existe un campo dedicado de "nocional máximo de orden de mercado" por activo en el estado confirmado; el tope de interés abierto es el techo de riesgo confirmado más cercano, reportado en unidades de **tamaño** (la capa de matching convierte a nocional al precio de referencia en tiempo real).

### `perps_at_open_interest_cap`

Activos cuyo interés abierto está en el tope o lo supera. Sin parámetros.

```json
{ "type": "perps_at_open_interest_cap" }
```

Respuesta:

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `assets` | uint32[] | Ids de activos que están en su `oi_cap` o lo superan, en orden ascendente |

Fuente de estado: `open_interest` por libro frente a `PerpAnnotation.oi_cap` (se omiten los libros sin tope positivo).

### `margin_table`

La tabla de niveles de margen (apalancamiento → ratios de mantenimiento / inicial). Sin parámetros.

```json
{ "type": "margin_table" }
```

Respuesta:

```json
{
  "type": "margin_table",
  "data": { "tiers": [ { "asset_id": 0, "max_leverage": 50, "maint_margin_ratio": "300", "init_margin_ratio": "200" } ] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tiers[*].asset_id` | uint32 | Id de activo |
| `tiers[*].max_leverage` | uint8 | Apalancamiento máximo efectivo (anulación o estático) |
| `tiers[*].maint_margin_ratio` | bps string | Ratio de margen de mantenimiento (anulación o piso estático del 3%) |
| `tiers[*].init_margin_ratio` | bps string | `1 / max_leverage` |

Fuente de estado: `dynamic_risk_overrides[asset]` o la línea base estática.

> **MARCADO.** El estado confirmado almacena un único nivel de riesgo efectivo por mercado (anulación o estático), no la escala de apalancamiento multifila que sirve HL. El proxy es un nivel por mercado — la fila que aplica el motor actualmente.

### `perp_dexs`

Lista el/los DEX(es) de perpetuos. Sin parámetros.

```json
{ "type": "perp_dexs" }
```

Respuesta:

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Field | Type | Description |
|-------|------|-------------|
| `dexs[*].index` | uint64 | Índice del DEX en `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Número de libros de activos en el DEX |
| `dexs[*].assets` | uint32[] | Ids de activos en el DEX |

Fuente de estado: `Exchange.perp_dexs`.


## Véase también

- [`POST /info`](../info.md) — el endpoint de lectura base (envelope, convenciones, consultas de cuenta e infraestructura)
- [Consultas de spot y margen](./spot.md) — lecturas de spot / margen spot / Earn
- [Perpetuos](../../../products/perpetuals.md) — el producto
