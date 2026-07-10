---
description: "Consultas de lectura POST /info para mercados perpetuos — información de mercado, libros de órdenes, operaciones, financiamiento, liquidación y estado del despliegue de contratos perpetuos."
---

# `POST /info` — consultas de contratos perpetuos

Consultas de lectura para mercados **perpetuos**. Mismo endpoint `POST /info`, el mismo sobre (envelope) y las mismas convenciones que la [página base](../info.md) — estos son los `type`s específicos para mercados perpetuos.

:::info
**Los mercados se identifican por `coin` (símbolo).** Toda lectura con alcance de
mercado (`market_info`, `l2_book`, `recent_trades`, `trades_by_time`,
`funding_history`, `oracle_sources`, `active_asset_data`, `fba_batch_state`, …)
resuelve el mercado por su **símbolo `coin`** (`"BTC"`, `"ETH"`, …). Los
argumentos numéricos heredados `asset_id` / `market_id` han sido **eliminados** —
una solicitud que los incluya (y omita `coin`) se rechaza con
`400 {"error":"missing field coin"}`. Estas lecturas de mercado reflejan el
símbolo `coin` en sus respuestas. (Solo la ruta de escritura firmada `/exchange`
sigue direccionando los mercados por el `asset` numérico — ese campo está
congelado por consenso; véase [`POST /exchange`](../exchange.md).)
:::

## Tipos de consulta de contratos perpetuos {#perpetual-query-types}

### Obtener metadatos por mercado {#market_info}

Metadatos por mercado. Resuelve el mercado por su símbolo `coin`.

```json
{ "type": "market_info", "coin": "BTC" }
```

| Arg | Tipo | Requerido |
|-----|------|----------|
| `coin` | symbol | sí |

Si falta `coin` → `400 {"error":"missing field coin"}`; símbolo desconocido → `404 {"error":"market not found"}`.

Respuesta:

```json
{
  "type": "market_info",
  "data": {
    "coin":               "BTC",
    "kind":               "perp",
    "sz_decimals":        5,
    "mark_px":            "61550.2",
    "oracle_px":          "61501.7",
    "mid_px":             "61669.4",
    "premium":            "0.00209225",
    "tick_size":          "0.1",
    "step_size":          "0.00001",
    "min_order":          "0.00001",
    "max_leverage":       50,
    "maint_margin_ratio": "1320",
    "init_margin_ratio":  "200",
    "margin_tiers": [
      { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
      { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
      { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
      { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
    ],
    "funding": {
      "rate_per_hr":     "21",
      "cap_per_hr":      "1120",
      "interval_ms":     3600000,
      "next_payment_ts": 1783011600000
    },
    "mark_source":   "oracle_median",
    "fba_enabled":   false,
    "open_interest": "0.02346",
    "day_ntl_vlm":   "3772.890084",
    "change_24h":    "-0.00274143",
    "prev_day_px":   "61719.4",
    "disable_open":  false,
    "disable_close": false,
    "halted":        false,
    "strict_isolated": false,
    "asset_id":      0
  }
}
```

:::warning
**`asset_id` está OBSOLETO (DEPRECATED).** Se conserva temporalmente solo como
una comodidad de shim para el indexador — **no** construya nada que dependa de
él, ni lo use como argumento de solicitud (ya no se acepta). Direccione los
mercados por `coin` en todos los casos. Puede eliminarse sin un incremento de
versión de wire.
:::

:::info
**Plano de reporte de precios.** `mark_px`, `oracle_px`, `mid_px`, `tick_size`,
`step_size` y `min_order` se reportan en el **plano decimal legible para
humanos** (`"61550.2"`, `"0.1"`, `"0.00001"`), la misma unidad que el precio de
marca de las posiciones en cuenta. `mark_px` es el precio de marca en libro, con
retorno al precio del oráculo cuando el libro aún no tiene precio de marca;
`oracle_px` es el último precio de índice confirmado; cualquiera de los dos es
`"0"` cuando no está definido. El **plano de envío de órdenes/libro es un plano
de punto fijo 1e8 separado** — el `px` de nivel de `l2_book` y el `limit_px` de
las órdenes son magnitudes 1e8 en bruto, NO decimales legibles para humanos; MTF
mantiene estos dos planos de escala separados.
:::

:::info
**`margin_tiers` — la escalera de apalancamiento por bandas de nocional, en
línea.** `market_info` (y cada fila de [`markets`](#markets)) lleva la escalera
de margen de mantenimiento del mercado **en línea** como `margin_tiers` — una
lista ascendente de bandas por límite superior:

- `max_open_interest` — **límite superior** de la banda (cadena decimal, en las
  unidades de tamaño del mercado); `null` marca el **nivel superior sin
  límite**.
- `max_leverage` — apalancamiento máximo permitido mientras el interés abierto
  se encuentre en esta banda (`u8`).
- `maint_margin_ratio` — ratio de margen de mantenimiento de la banda, **cadena
  de bps decimales** (`"100"` = 1.00%).

El nivel de una posición es la primera banda cuyo límite `max_open_interest` no
excede su interés abierto (la banda superior `null` captura todo lo que quede
por encima del último límite finito). El apalancamiento baja y el ratio de
mantenimiento sube a medida que crece el interés abierto. Esto reemplaza la
consulta independiente `margin_table`, ya eliminada — la escalera ahora viaja en
el propio registro del mercado.
:::

:::info
**Precisión de precio vs `sz_decimals`.** `sz_decimals` es la precisión de
**TAMAÑO** (granularidad de la cantidad de la orden — `5` ⇒ `0.00001`
unidades); **no** rige los decimales del precio, que están determinados por el
tick de precio (`tick_size`). Los dos son ejes independientes.
:::

`market_info` devuelve el registro **completo** — la unión de los campos
**dinámicos** que sirve [`markets`](#markets) (`mark_px`, `oracle_px`, `mid_px`,
`premium`, `funding`, `open_interest`, `day_ntl_vlm`, `prev_day_px`,
`change_24h`, `halted`) y los campos **estáticos** que sirve
[`markets_meta`](#markets_meta) (`sz_decimals`, `tick_size`, `step_size`,
`min_order`, `max_leverage`, los ratios de margen, `margin_tiers`,
`strict_isolated`, `disable_open` / `disable_close`, `mark_source`,
`fba_enabled`, `asset_id`). Véanse esas dos lecturas para la semántica de cada
campo.

### Obtener el estado en vivo de todos los mercados {#markets}

El estado **en vivo (dinámico)** de cada mercado registrado — los campos por
commit que cambian en cada bloque (precio de marca / oráculo / mid, prima de
financiamiento, interés abierto, el ticker rotativo de 24h, `halted`) más las
claves de unión `(coin, kind)` — junto con el registro de pares/tokens spot. Los
metadatos **estáticos** de larga vida (rejillas de precisión, escaleras de
apalancamiento/margen, fuente de marca, banderas de control de operaciones) se
sirven por separado en [`markets_meta`](#markets_meta); [`market_info`](#market_info)
devuelve ambas mitades para una sola moneda.

```json
{ "type": "markets" }
```

Filtra a un solo producto con `kind` (ausente ⇒ ambas secciones):

```json
{ "type": "markets", "kind": "perp" }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Filtro de sección — ausente = ambas; `"perp"` = solo el arreglo de perpetuos; `"spot"` = solo la sección spot |

El payload `data` es un **objeto** con un arreglo `perp` (cada uno una fila
**dinámica**) y un objeto `spot` `{pairs, tokens}`. Las filas de `perp` están
ordenadas de forma determinista por id de mercado ascendente; `spot.pairs` /
`spot.tokens` en orden de id de par/token.

Respuesta (truncada a una entrada por lista):

```json
{
  "type": "markets",
  "data": {
    "perp": [
      {
        "coin":            "BTC",
        "kind":            "perp",
        "mark_px":         "61521.1",
        "oracle_px":       "61529.3",
        "mid_px":          "61669.4",
        "premium":         "0.0018587",
        "funding": {
          "rate_per_hr":     "20",
          "cap_per_hr":      "1120",
          "interval_ms":     3600000,
          "next_payment_ts": 1783011600000
        },
        "open_interest":   "0.02346",
        "day_ntl_vlm":     "3772.890084",
        "prev_day_px":     "61719.4",
        "change_24h":      "-0.00300293",
        "halted":          false
      }
    ],
    "spot": {
      "pairs": [
        {
          "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100,
          "active": true, "mark_px": "50000", "mid_px": "50000", "prev_day_px": null,
          "day_ntl_vlm": "0", "min_notional": "1", "taker_fee_bps": "5",
          "circulating_supply": "0"
        }
      ],
      "tokens": [
        {
          "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6,
          "is_canonical": true, "evm_contract": null,
          "system_address": "0x80abd3bd8c42d2a279e4fa00f20bb30637734371",
          "token_id": "0xf23ea17597e324c04f842e6d8bfffe75636f0af88e7c7ab93ea755d9056396bc"
        }
      ]
    }
  }
}
```

Cada fila de `perp` es la mitad **dinámica** del paquete de
[`market_info`](#market_info) — construida a partir del mismo generador, por lo
que ambas nunca divergen; la contraparte **estática** vive en
[`markets_meta`](#markets_meta), unida por `(coin, kind)`. `mid_px` se **omite**
de una fila cuando el libro es unilateral (nunca se envía como `null`). El
canal WS en vivo [`markets`](../../ws/subscriptions.md#markets) transmite estas
mismas filas dinámicas (una instantánea completa al suscribirse, y luego deltas
de filas modificadas).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `perp[*].coin` | string | Símbolo del mercado, p. ej. `"BTC"` (la clave de unión) |
| `perp[*].kind` | `"perp"` | Tipo de mercado (en minúsculas, clave de unión) |
| `perp[*].mark_px` | Decimal string | Precio de marca en libro, **plano decimal legible para humanos**, ajustado al tick (con retorno al oráculo; `"0"` si no está definido) |
| `perp[*].oracle_px` | Decimal string | Precio de índice, plano decimal legible para humanos, ajustado al tick (`"0"` si no está definido) |
| `perp[*].mid_px` | Decimal string | Punto medio del libro de órdenes `(mejor_compra + mejor_venta) / 2`, decimal legible para humanos, ajustado al tick; **se omite** cuando el libro es unilateral / está vacío |
| `perp[*].premium` | Decimal string \| null | Última muestra de prima de financiamiento confirmada (con signo), una cadena de **8 decimales** (truncada hacia cero); `null` cuando no existe |
| `perp[*].funding.rate_per_hr` | bps string | Última muestra de tasa de financiamiento por hora (previa al tope), bps decimales |
| `perp[*].funding.cap_per_hr` | bps string | Límite de tasa de financiamiento por hora, bps decimales |
| `perp[*].funding.interval_ms` | uint64 | Cadencia de financiamiento por activo (1h = `3600000`) |
| `perp[*].funding.next_payment_ts` | uint64 | Próximo límite alineado de liquidación de financiamiento (epoch-ms); `0` hasta la primera muestra |
| `perp[*].open_interest` | Decimal string | Interés abierto actual (unidades de tamaño) |
| `perp[*].day_ntl_vlm` | Decimal string | Volumen nocional de 24h |
| `perp[*].prev_day_px` | Decimal string \| null | Precio de hace 24h; `null` si se desconoce |
| `perp[*].change_24h` | Decimal string \| null | Cambio de precio en 24h (fracción, con signo); `null` cuando no hay precio previo |
| `perp[*].halted` | bool | Mercado detenido |
| `spot.pairs` | array | Registro de pares spot (mismas filas que [`spot_meta`](./spot.md#spot_meta) `pairs`, más `mark_px` / `mid_px` / `day_ntl_vlm` en vivo) |
| `spot.tokens` | array | Registro de tokens spot (mismas filas que [`spot_meta`](./spot.md#spot_meta) `tokens`) |

Los campos **estáticos** por mercado (`sz_decimals`, `tick_size`, `step_size`,
`min_order`, `max_leverage`, `maint_margin_ratio`, `init_margin_ratio`,
`margin_tiers`, `strict_isolated`, `disable_open` / `disable_close`,
`mark_source`, `fba_enabled`, `asset_id`) **no** están en esta lectura —
obténgalos de [`markets_meta`](#markets_meta). Para la semántica de los campos
de pares/tokens spot véase [`spot_meta`](./spot.md#spot_meta).

### Obtener metadatos estáticos de todos los mercados {#markets_meta}

Los metadatos **estáticos** de cada mercado registrado — los campos de larga
vida que un mercado publica una vez y rara vez cambia (rejillas de precisión,
escaleras de apalancamiento/margen, banderas de control de operaciones, fuente
de marca) más las claves de unión `(coin, kind)` — junto con el registro de
pares/tokens spot. La contraparte estática de [`markets`](#markets): las dos
mitades juntas cubren cada campo que devuelve [`market_info`](#market_info), de
modo que un cliente puede almacenar en caché la mitad estática y sondear solo
la mitad dinámica de [`markets`](#markets). El mismo filtro opcional `kind`.

```json
{ "type": "markets_meta" }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `kind` | `"perp"` \| `"spot"` | no | Filtro de sección — ausente = ambas; `"perp"` = solo el arreglo de perpetuos; `"spot"` = solo la sección spot |

El payload `data` es un **objeto** con un arreglo `perp` (cada uno una fila
**estática**) y el mismo objeto `spot` `{pairs, tokens}` que devuelve
[`markets`](#markets). Las filas de `perp` están ordenadas por id de mercado
ascendente.

Respuesta (perp truncado a una entrada; la sección `spot` es idéntica a
[`markets`](#markets)):

```json
{
  "type": "markets_meta",
  "data": {
    "perp": [
      {
        "coin":               "BTC",
        "kind":               "perp",
        "sz_decimals":        5,
        "tick_size":          "0.1",
        "step_size":          "0.00001",
        "min_order":          "0.00001",
        "max_leverage":       50,
        "maint_margin_ratio": "1320",
        "init_margin_ratio":  "200",
        "margin_tiers": [
          { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
          { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
          { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
          { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
        ],
        "strict_isolated": false,
        "disable_open":    false,
        "disable_close":   false,
        "mark_source":     "oracle_median",
        "fba_enabled":     false,
        "asset_id":        0
      }
    ],
    "spot": { "pairs": [ /* … same as `markets` */ ], "tokens": [ /* … */ ] }
  }
}
```

Cada fila de `perp` es la mitad **estática** del paquete de
[`market_info`](#market_info), unida a su fila dinámica de
[`markets`](#markets) por `(coin, kind)`. Ninguno de los campos dinámicos por
commit (`mark_px`, `oracle_px`, `mid_px`, `premium`, `funding`,
`open_interest`, `day_ntl_vlm`, `prev_day_px`, `change_24h`, `halted`) aparece
aquí.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `perp[*].coin` | string | Símbolo del mercado (la clave de unión) |
| `perp[*].kind` | `"perp"` | Tipo de mercado (en minúsculas, clave de unión) |
| `perp[*].sz_decimals` | uint8 | Decimales de visualización de tamaño |
| `perp[*].tick_size` | Decimal string | Incremento mínimo de precio (decimal legible para humanos, p. ej. `"0.1"`) |
| `perp[*].step_size` | Decimal string | Incremento mínimo de tamaño / tamaño de lote (decimal legible para humanos) |
| `perp[*].min_order` | Decimal string | Tamaño mínimo de orden (decimal legible para humanos) |
| `perp[*].max_leverage` | uint8 | Apalancamiento máximo (el escalón superior de la escalera de niveles de margen) |
| `perp[*].maint_margin_ratio` | bps string | Ratio base de margen de mantenimiento, bps decimales |
| `perp[*].init_margin_ratio` | bps string | Ratio base de margen inicial, bps decimales |
| `perp[*].margin_tiers` | array | Escalera de apalancamiento por bandas de nocional (véase [`market_info`](#market_info)); cada elemento `{max_open_interest: string\|null, max_leverage: u8, maint_margin_ratio: bps-string}`, bandas ascendentes por límite superior, `null` = nivel superior sin límite |
| `perp[*].strict_isolated` | bool | El mercado fuerza margen estrictamente aislado |
| `perp[*].disable_open` / `disable_close` | bool | Apertura / cierre deshabilitados para este mercado |
| `perp[*].mark_source` | string | Descriptor del precio de marca (p. ej. `"oracle_median"`) |
| `perp[*].fba_enabled` | bool | Subasta por lotes frecuentes habilitada para este mercado |
| `perp[*].asset_id` | uint32 | Campo de shim de indexador **OBSOLETO** — no construya nada que dependa de él |
| `spot.pairs` / `spot.tokens` | array | Registro de pares/tokens spot, idéntico a [`markets`](#markets) (véase [`spot_meta`](./spot.md#spot_meta)) |

Para la semántica de los campos de pares/tokens spot véase [`spot_meta`](./spot.md#spot_meta).

### Obtener niveles agregados del libro de órdenes {#l2_book}

Niveles de compra/venta agregados con alcance de mercado.

```json
{ "type": "l2_book", "coin": "BTC" }
```

| Arg | Tipo | Requerido |
|-----|------|----------|
| `coin` | symbol | sí |

Si falta `coin` → `400 {"error":"missing field coin"}`.

Respuesta:

```json
{
  "type": "l2_book",
  "data": {
    "coin": "BTC",
    "bids": [ { "px": "61663.1", "size": "0.04862", "n_orders": 1 } ],
    "asks": [ { "px": "61675.7", "size": "0.04862", "n_orders": 1 } ]
  }
}
```

Las ofertas de compra (bids) van del mejor al peor (precio descendente), las de
venta (asks) ascendentes. Cada nivel agrega el `size` sumado y el conteo
`n_orders` de órdenes en reposo. Un mercado desconocido / vacío devuelve
arreglos `bids` / `asks` vacíos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coin` | string | Símbolo de mercado reflejado |
| `bids[*].px` / `asks[*].px` | i128 string | Precio del nivel, cadena decimal de punto fijo (plano 1e8 de órdenes/libro) |
| `bids[*].size` / `asks[*].size` | u128 string | Tamaño sumado en el nivel |
| `bids[*].n_orders` / `asks[*].n_orders` | uint64 | Órdenes en reposo en el nivel |

### Obtener operaciones públicas recientes {#recent_trades}

Cinta de operaciones públicas con alcance de mercado, servida directamente
desde el estado confirmado en nodo (un anillo de operaciones acotado por
mercado incluido en el AppHash — sin indexador externo).

```json
{ "type": "recent_trades", "coin": "BTC" }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `coin` | symbol | sí | Símbolo del mercado |
| `limit` | uint32 | no | Limita el número de registros **más recientes** devueltos; ausente / `0` ⇒ el anillo completo |

Respuesta:

```json
{
  "type": "recent_trades",
  "data": {
    "coin":           "BTC",
    "last_trade_ms":  1783001424768,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783001424768,
        "tid":   17691615279761551171,
        "block": 38997,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

Los registros están ordenados del más antiguo al más reciente (el más nuevo al
final). El anillo está acotado, por lo que esto es una ventana reciente, no
todo el historial. Un mercado desconocido / que nunca ha operado devuelve
`"trades": []` y `last_trade_ms: 0`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coin` | string | Símbolo de mercado reflejado |
| `last_trade_ms` | uint64 | Marca de tiempo de la última operación (`0` si no hay ninguna) |
| `trades[*].coin` | string | Símbolo del mercado en el que se ejecutó la operación |
| `trades[*].side` | `"B"` / `"A"` | Token de lado del tomador (agresor) — `"B"` = compra, `"A"` = venta |
| `trades[*].px` | Decimal string | Precio de ejecución, **USDC decimal** (legible para personas) |
| `trades[*].sz` | Decimal string | Tamaño ejecutado, **unidades base** (unidad entera) |
| `trades[*].time` | uint64 | Marca de tiempo de la operación (ms de consenso) |
| `trades[*].tid` | uint64 | Id de operación determinista (compartido por ambas patas del cierre); puede superar 2⁵³ — analícelo como un entero de 64 bits / big integer, no como un número de JS |
| `trades[*].block` | uint64 | Altura del bloque confirmado en que se liquidó la operación (localizador en cadena) |
| `trades[*].hash` | hex string | Hash de transacción de la orden originadora, hex con prefijo `0x` — permite rastrear un cierre en cadena |

### Obtener operaciones en una ventana de tiempo {#trades_by_time}

Similar a [`recent_trades`](#recent_trades), pero filtrada a una ventana
`[start_time, end_time]` sobre el anillo de operaciones por mercado — la
ventana reciente acotada. Para historial profundo más allá del anillo, use los
tipos de archivo del gateway.

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `coin` | symbol | sí | Símbolo del mercado |
| `start_time` | uint64 | no | Inicio de la ventana (ms, inclusive); filtra por el `time` de la operación. Ausente ⇒ límite inferior abierto |
| `end_time` | uint64 | no | Fin de la ventana (ms, inclusive). Ausente ⇒ límite superior abierto |

Respuesta:

```json
{
  "type": "trades_by_time",
  "data": {
    "coin":       "BTC",
    "start_time": 1783000000000,
    "end_time":   1783011600000,
    "trades": [
      {
        "coin":  "BTC",
        "side":  "A",
        "px":    "61643.70000000",
        "sz":    "0.00024",
        "time":  1783000781368,
        "tid":   4898317237641214538,
        "block": 37692,
        "hash":  "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c"
      }
    ]
  }
}
```

`trades` usa la misma forma por operación que [`recent_trades`](#recent_trades),
del más antiguo al más reciente. `start_time` / `end_time` se reflejan de vuelta
(cualquiera de los dos es `null` cuando se omite). Un mercado fuera de ventana /
que nunca ha operado devuelve `"trades": []`.

### Obtener velas OHLCV históricas {#candle_snapshot}

Barras OHLCV históricas para `(coin, interval)`. La única consulta de velas
(el tipo independiente `candle` ha sido **eliminado**): prioriza el archivo —
servida desde el archivo cuando hay uno conectado, con retorno a barras
plegadas desde el flujo público de operaciones en caso contrario. El
complemento REST del canal WS en vivo [`candles`](../../ws/subscriptions.md#candles).

```json
{ "type": "candle_snapshot", "coin": "BTC", "interval": "1m", "start_time": 1783000000000, "end_time": 1783011600000 }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `coin` | symbol | sí | Símbolo del mercado, p. ej. `"BTC"` |
| `interval` | string | sí | Token del intervalo — uno de `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `start_time` | uint64 | no | Inicio de la ventana (ms); filtra por apertura de barra. Por defecto `0` |
| `end_time` | uint64 | no | Fin de la ventana (ms); filtra por apertura de barra. Por defecto sin límite |

Si falta `coin` → `400 {"error":"missing field coin"}`; si falta `interval` →
`400 {"error":"missing field interval"}`.

Respuesta:

```json
{
  "type": "candle_snapshot",
  "data": {
    "candles": [
      {
        "t": 1783000020000,
        "T": 1783000080000,
        "i": "1m",
        "o": "6164610000000",
        "c": "6165270000000",
        "h": "6165270000000",
        "l": "6164610000000",
        "v": "576",
        "n": 24
      }
    ]
  }
}
```

Las barras están ordenadas del más antiguo al más reciente por `t` (tiempo de
apertura); el elemento más nuevo es la barra en formación. Un arreglo `candles`
vacío es la respuesta vacía honesta para un mercado sin historial (o sin
fuente de archivo/plegado conectada).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `t` | uint64 | Marca de tiempo de **apertura** de la barra (ms, alineada al intervalo) |
| `T` | uint64 | Marca de tiempo de **cierre** de la barra (ms) |
| `i` | string | Token del intervalo |
| `o` / `c` / `h` / `l` | Decimal string | Precio de **a**pertura / **c**ierre / **m**áximo / **m**ínimo, cadena de **punto fijo 1e8** (p. ej. `"6165270000000"` = `61652.7`) |
| `v` | Decimal string | **Volumen en activo base** — Σ tamaño operado en la barra (unidades de tamaño, NO nocional) |
| `n` | uint64 | Conteo de operaciones (cierres) en la barra |

### Obtener historial de primas de financiamiento {#funding_history}

Muestras de prima de financiamiento con alcance por mercado (el anillo de
primas).

```json
{ "type": "funding_history", "coin": "BTC" }
```

| Arg | Tipo | Requerido | Descripción |
|-----|------|----------|-------------|
| `coin` | symbol | sí | Símbolo del mercado |
| `start_time` | uint64 | no | Inicio de la ventana (ms); filtra por `ts_ms` de la muestra |
| `end_time` | uint64 | no | Fin de la ventana (ms) |

Si falta `coin` → `400 {"error":"missing field coin"}`.

Respuesta:

```json
{
  "type": "funding_history",
  "data": {
    "coin": "BTC",
    "samples": [
      { "ts_ms": 1783008579269, "premium": "0.00027179", "funding_rate": "0.00027179" },
      { "ts_ms": 1783008587316, "premium": "0.0005469",  "funding_rate": "0.0005469" }
    ]
  }
}
```

Las muestras corresponden al anillo ordenado de instantáneas de prima del
rastreador de financiamiento. `premium` es el `Decimal` exacto previo al
límite, representado como cadena (con signo, precisión completa);
`funding_rate` es esa prima pasada por el tope de financiamiento por activo —
la tasa realizada que se cobraría efectivamente. Cuando la prima está dentro
del tope, `funding_rate == premium`; por encima de él, `funding_rate` queda
limitado al tope con signo. Un mercado desconocido / vacío devuelve
`"samples": []`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coin` | string | Símbolo de mercado reflejado |
| `samples[*].ts_ms` | uint64 | Marca de tiempo de la muestra (ms de consenso) |
| `samples[*].premium` | decimal string | Muestra de prima de financiamiento sin procesar, previa al límite (con signo) |
| `samples[*].funding_rate` | decimal string | Tasa realizada = `premium` limitado al tope por activo (con signo) |

### Obtener tasas de financiamiento previstas {#predicted_fundings}

Tasa de financiamiento prevista por mercado + próximo momento de liquidación,
para todos los mercados de contratos perpetuos registrados. Sin parámetros.

```json
{ "type": "predicted_fundings" }
```

El payload `data` es un **arreglo**, una entrada por cada mercado de contratos
perpetuos registrado, en orden de mercado ascendente. Un universo vacío
devuelve `"data": []`.

Respuesta:

```json
{
  "type": "predicted_fundings",
  "data": [
    { "coin": "BTC", "predicted_rate": "0.0020702132945825193491902456", "next_funding_time": 1783011600000 },
    { "coin": "ETH", "predicted_rate": "0.0091563951859402408793685995", "next_funding_time": 1783011600000 }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coin` | string | Símbolo del mercado |
| `predicted_rate` | decimal string | La tasa **limitada** que se cobraría efectivamente en el próximo límite — la prima pasada por el `±cap` por activo, con signo (`"0"` antes de la primera muestra) |
| `next_funding_time` | uint64 | El **próximo límite alineado de liquidación por activo** (epoch-ms); `0` antes de la primera muestra |

:::info
**`predicted_rate` es la tasa cobrada, no la prima sin procesar.** Refleja el
tope de financiamiento por activo aplicado — el número que se
debitaría/acreditaría a una posición si el financiamiento se liquidara ahora.
El financiamiento se liquida de forma **discreta** en el límite por activo
(`next_funding_time`), con una cadencia `interval_ms` por activo (1h por
defecto). Para la serie de primas sin procesar previa al límite véase
[`funding_history`](#funding_history); para la cadencia / el límite véase
[`market_info`](#market_info) `funding.interval_ms` / `funding.next_payment_ts`.
:::

### Obtener el estado de la subasta de gas para el despliegue de contratos perpetuos {#mip3_active_bids}

Instantánea de la subasta de gas para el despliegue permisionless de
perpetuos MIP-3. Sin parámetros.

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

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `auction_round` | uint64 | Ronda de subasta actual |
| `current_bid` | decimal string | Importe de la oferta líder |
| `current_winner` | hex address \| null | Postor ganador actual, `null` si no hay ninguno |
| `auction_end_ms` | uint64 | Marca de tiempo de cierre de la subasta (ms de consenso) |
| `started_at_ms` | uint64 | Marca de tiempo de inicio de la subasta (ms de consenso) |
| `bids[*].bidder` | hex address | Dirección del postor |
| `bids[*].amount` | decimal string | Importe de la oferta |
| `bids[*].submitted_at_ms` | uint64 | Marca de tiempo de envío de la oferta (ms de consenso) |
| `bids[*].tag` | string | Etiqueta de la oferta (p. ej., el nombre de mercado propuesto) |

### Listar cuentas marcadas para liquidación {#liquidatable}

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

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `accounts[*].address` | hex address | Cuenta que requiere acción |
| `accounts[*].tier` | `"YellowCard" \| "PartialMarket50" \| "FullMarket" \| "BackstopTakeover"` | Nivel BOLE |

Fuente de estado: `Exchange.bole_index.tier` (el índice BOLE de cuentas que
requieren acción — **no** un reescaneo completo de cuentas).

> **MARCADO.** `bole_index` es estado derivado `#[serde(skip)]`, no canónico,
> reconstruido mediante un escaneo completo en el primer uso / tras la carga
> de una instantánea. En una instantánea recién publicada estará vacío hasta
> que el runtime haya ejecutado el paso BOLE al menos una vez.

### Obtener los límites de operación de mercado de un usuario {#active_asset_data}

Apalancamiento por mercado, modo de margen y tamaño máximo de operación de un
usuario. Requerido: `address` (hex 0x) + `coin` (símbolo).

```json
{ "type": "active_asset_data", "address": "0x<addr>", "coin": "BTC" }
```

| Arg | Tipo | Requerido |
|-----|------|----------|
| `address` | hex address | sí |
| `coin` | symbol | sí |

Si falta `address` → `400 {"error":"missing field: address"}`; si falta `coin`
→ `400 {"error":"missing field coin"}`.

Respuesta:

```json
{
  "type": "active_asset_data",
  "data": {
    "address": "0x<addr>", "coin": "BTC", "leverage": 50,
    "margin_mode": "cross", "mark_px": "61550.29664777",
    "max_trade_size": "0", "max_trade_szs": ["0", "0"],
    "available_to_trade": ["0", "0"], "has_position": false
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coin` | string | Símbolo de mercado reflejado |
| `leverage` | uint32 | Apalancamiento de la posición si está abierta; si no, el valor predeterminado de la cuenta; si no, el máximo del mercado |
| `margin_mode` | `"cross" \| "isolated" \| "strict_iso"` | Modo de margen efectivo |
| `mark_px` | decimal string | Precio de marca actual, plano decimal legible para humanos |
| `max_trade_size` | decimal string | Tope máximo de orden por mercado (véase [`max_market_order_ntls`](#max_market_order_ntls)) |
| `max_trade_szs` | [decimal string, decimal string] | Tamaño máximo operable `[compra, venta]` |
| `available_to_trade` | [decimal string, decimal string] | Nocional disponible para abrir `[compra, venta]` |
| `has_position` | bool | Indica si el usuario tiene una posición distinta de cero en este mercado |

### Obtener los topes de nocional máximo de órdenes de mercado {#max_market_order_ntls}

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

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ntls[*].asset_id` | uint32 | Id de activo |
| `ntls[*].max_market_order_ntl` | decimal string | Tope de tamaño derivado del límite de interés abierto |

Fuente de estado: `PerpAnnotation.oi_cap` por mercado, o bien
`default_mip3_limits.max_oi_per_market`.

> **MARCADO.** No existe un campo dedicado de "nocional máximo de orden de
> mercado" por activo en el estado confirmado; el tope de interés abierto es
> el techo de riesgo confirmado más cercano, reportado en unidades de
> **tamaño** (la capa de matching convierte a nocional al precio de marca en
> vivo).

### Listar activos en el tope de interés abierto {#perps_at_open_interest_cap}

Activos cuyo interés abierto está en el tope o lo supera. Sin parámetros.

```json
{ "type": "perps_at_open_interest_cap" }
```

Respuesta:

```json
{ "type": "perps_at_open_interest_cap", "data": { "assets": [0] } }
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `assets` | uint32[] | Ids de activos en/sobre su `oi_cap`, en orden ascendente |

Fuente de estado: `open_interest` por libro frente a `PerpAnnotation.oi_cap`
(se omiten los libros sin tope positivo).

### `margin_table` — eliminado {#margin_table--removed}

:::warning
**`margin_table` ha sido ELIMINADO.** La escalera de margen ahora viaja **en
línea** en cada registro de mercado como `margin_tiers` — léala desde
[`market_info`](#market_info) (un solo mercado) o [`markets`](#markets) (todos
los mercados). Cada nivel es `{max_open_interest: string|null, max_leverage:
u8, maint_margin_ratio: bps-string}`: bandas ascendentes por límite superior,
`null` = nivel superior sin límite. Una solicitud `margin_table` ahora
devuelve `400 {"error":"unknown info type: margin_table"}`.
:::

### Listar los DEX de contratos perpetuos {#perp_dexs}

Lista el/los DEX(es) de perpetuos. Sin parámetros.

```json
{ "type": "perp_dexs" }
```

Respuesta:

```json
{ "type": "perp_dexs", "data": { "dexs": [ { "index": 0, "n_assets": 1, "assets": [0] } ] } }
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `dexs[*].index` | uint64 | Índice del DEX en `Exchange.perp_dexs` |
| `dexs[*].n_assets` | uint64 | Número de libros de activos en el DEX |
| `dexs[*].assets` | uint32[] | Ids de activos en el DEX |

Fuente de estado: `Exchange.perp_dexs`.


## Véase también {#see-also}

- [`POST /info`](../info.md) — el endpoint de lectura base (envelope, convenciones, consultas de cuenta e infraestructura)
- [Consultas de spot y margen](./spot.md) — lecturas de spot / margen spot / Earn
- [Perpetuos](../../../products/perpetuals.md) — el producto
