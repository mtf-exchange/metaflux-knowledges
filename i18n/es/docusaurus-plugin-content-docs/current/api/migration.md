---
description: "Cambios disruptivos de la API en node + gateway 0.7.14 — direccionamiento por coin/address, tipos de consulta eliminados, niveles de margen en línea y actualizaciones de canales WS. Una lista de verificación de migración para integradores y creadores de mercado."
---

# Migración de la API — 0.7.14

:::warning
**Cambios disruptivos.** Esta versión cambia la forma en que se direccionan los mercados y las cuentas
en la API de lectura, elimina tres tipos de consulta y actualiza varios canales WS.
Las acciones firmadas de `/exchange` **no cambian**. Revise la siguiente lista de verificación
antes de actualizar un cliente.
:::

## Panorama general {#at-a-glance}

| Área | Antes | Ahora |
|------|-----|-----|
| Direccionar un mercado (lecturas) | `asset_id` / `market_id` (numérico) | **`coin`** (símbolo, p. ej. `"BTC"`) |
| Direccionar una cuenta (lecturas) | `account_id` **o** `address` | **`address`** (hex 0x) únicamente |
| Historial de velas | `candle` | **`candle_snapshot`** (la consulta de una sola vela) |
| Instantánea compuesta de frontend | `web_data2` (REST + WS) | **eliminado** — componga lecturas específicas |
| Escalera de margen | consulta `margin_table` | **`margin_tiers`** en línea en `market_info` / `markets` |
| Operaciones recientes por ventana | — | **`trades_by_time`** (nuevo) |
| Límite de suscripciones WS | 256 / conexión | **64 / conexión** |

## 1. Los mercados se direccionan por `coin` {#1-markets-are-addressed-by-coin}

Toda lectura con alcance de mercado ahora resuelve el mercado mediante su **símbolo `coin`**. Los
argumentos numéricos `asset_id` / `market_id` de la solicitud se **eliminan** — una solicitud
que los incluya (y omita `coin`) se rechaza con
`400 {"error":"missing field coin"}`.

Lecturas afectadas: `market_info`, `markets`, `l2_book`, `recent_trades`,
`trades_by_time`, `funding_history`, `oracle_sources`, `active_asset_data`,
`fba_batch_state`.

```diff
- {"type":"l2_book","market_id":0}
+ {"type":"l2_book","coin":"BTC"}

- {"type":"market_info","asset_id":0}
+ {"type":"market_info","coin":"BTC"}
```

Las respuestas reflejan el símbolo `coin` (p. ej., las filas de `recent_trades` incluyen
`"coin":"BTC"`). `market_info` / `markets` conservan por ahora un campo **`asset_id`** como
recurso de compatibilidad obsoleto para indexadores — **no construya nada que dependa de él**;
puede eliminarse sin un incremento de la versión de wire.

## 2. Las cuentas se direccionan por `address` {#2-accounts-are-addressed-by-address}

Las lecturas con alcance de cuenta ya no aceptan `account_id`; pase `address` (hex 0x).

Lecturas afectadas: `open_orders`, `user_fills`, `user_fills_by_time`, `agents`,
`sub_accounts`, `rfq_user`, `pm_summary`.

```diff
- {"type":"open_orders","account_id":42}
+ {"type":"open_orders","address":"0x<addr>"}
```

El campo de eco `account_id` desapareció de estas respuestas.

## 3. Tipos de consulta eliminados {#3-removed-query-types}

| Eliminado | Devuelve ahora | Use en su lugar |
|---------|-------------|-------------|
| `candle` | `400 unknown info type: candle` | [`candle_snapshot`](./rest/info/perpetuals.md#candle_snapshot) |
| `margin_table` | `400 unknown info type: margin_table` | `margin_tiers` en línea en [`market_info`](./rest/info/perpetuals.md#market_info) / [`markets`](./rest/info/perpetuals.md#markets) |
| `web_data2` (REST) | `400 unknown info type: web_data2` | [`account_state`](./rest/info.md#account_state) + [`spot_clearinghouse_state`](./rest/info/spot.md#spot_clearinghouse_state) + [`frontend_open_orders`](./rest/info.md#frontend_open_orders) + [`user_vault_equities`](./rest/info.md#user_vault_equities) + [`exchange_status`](./rest/info.md#exchange_status) |
| `web_data2` (canal WS) | `unknown channel: web_data2` | canales WS `account_state` + `spot_state` |

## 4. `margin_tiers` — escalera en línea por bandas de nocional {#4-margin_tiers--inline-notional-banded-ladder}

La escalera de margen de mantenimiento ahora viaja **en línea** en cada registro de mercado
como `margin_tiers`, una lista ascendente de bandas de límite superior:

```json
"margin_tiers": [
  { "max_open_interest": "100000",  "max_leverage": 50, "maint_margin_ratio": "100" },
  { "max_open_interest": "500000",  "max_leverage": 20, "maint_margin_ratio": "250" },
  { "max_open_interest": "2000000", "max_leverage": 10, "maint_margin_ratio": "500" },
  { "max_open_interest": null,      "max_leverage": 5,  "maint_margin_ratio": "1000" }
]
```

- `max_open_interest` — **límite superior** de la banda (cadena decimal, en unidades de tamaño);
  `null` = el **nivel superior sin límite**.
- `max_leverage` — apalancamiento máximo en esta banda (`u8`).
- `maint_margin_ratio` — ratio de margen de mantenimiento, **cadena decimal en bps**
  (`"100"` = 1.00%).

El nivel es la primera banda cuyo límite de `max_open_interest` no se supera. El apalancamiento
baja y el margen de mantenimiento sube conforme crece el interés abierto.

## 5. Nuevo: `trades_by_time` {#5-new-trades_by_time}

Impresiones públicas recientes de un mercado durante una ventana `[start_time, end_time]` (el
anillo acotado; para historial profundo use el archivo del gateway):

```json
{ "type": "trades_by_time", "coin": "BTC", "start_time": 1783000000000, "end_time": 1783011600000 }
```

Las filas comparten la forma de [`recent_trades`](./rest/info/perpetuals.md#recent_trades).

## 6. Forma de `markets` {#6-markets-shape}

`markets.data` ahora es un **objeto**, no un arreglo:

```json
{ "type": "markets", "data": { "perp": [ /* market records */ ],
  "spot": { "pairs": [ /* … */ ], "tokens": [ /* … */ ] } } }
```

Cada elemento de `perp[]` incluye únicamente los campos **dinámicos** de un mercado — el mismo
subconjunto dinámico que `market_info` incluye para un `coin`. Los campos **estáticos** (grillas
de precisión, escaleras de apalancamiento/margen, indicadores de control de operaciones) viven
por separado en [`markets_meta`](./rest/info/perpetuals.md#markets_meta); `market_info` devuelve
la unión de ambos.

## 7. Cambios en WebSocket {#7-websocket-changes}

- **Canal `web_data2` eliminado** — vea el reemplazo arriba.
- **`trades`**: `data` es un **arreglo**; el frame al suscribirse (`is_snapshot: true`) es un
  arreglo **no vacío** de impresiones recientes (vacío solo si el mercado nunca operó), y las
  filas de instantánea llevan **`users: null`**. Las emisiones en vivo llevan
  `users: [taker, maker]`.
- **`user_fundings`**: los registros ahora llevan `{coin, payment, szi, fundingRate, time}`
  (`payment` en USDC entero con signo: negativo = pagado, positivo = recibido).
- Las filas de **`explorer_txs`** llevan un campo **`hash`** (el hash de acción `0x`; vacío
  `""` para una entrada sistémica). **`explorer_block`** transmite el encabezado del bloque
  confirmado.
- **`order_updates`**: en un registro `filled`, `order.sz` es el tamaño **EJECUTADO** y
  `order.orig_sz` el tamaño **original** de la orden.
- **Canales activos**: `account_state`, `spot_state`, `order_updates`, `fills`,
  `user_events`, `user_fundings`, `ledger_updates`, `l2_book`, `bbo`, `trades`,
  `candles`, `all_mids`, `active_asset_ctx`, `active_asset_data`,
  `explorer_block`, `explorer_txs`.

## 8. Semántica de `predicted_fundings` {#8-predicted_fundings-semantics}

Indexado por `coin`; cada entrada es
`{coin, predicted_rate, next_funding_time}`:

- `predicted_rate` es la tasa **acotada** que realmente se cobra en el límite (la prima pasada
  por el `±cap` propio del activo), no la prima bruta.
- `next_funding_time` es el **próximo límite de liquidación alineado por activo** (ms).

El funding se liquida de forma **discreta** en límites por activo (1 h por defecto); las
muestras de `funding_history` siguen siendo el anillo de la prima bruta. `market_info.funding`
lleva `interval_ms` (cadencia por activo) y `next_payment_ts` (el límite).

## 9. Límites de tasa {#9-rate-limits}

- Por IP: **1200 de peso / minuto** — las IP en lista blanca están exentas.
- Token bucket de `/exchange` por cuenta — **los firmantes configurados por metaliquidez están
  exentos**.
- WS: **64 suscripciones por conexión** (antes 256) — las conexiones en lista blanca están
  exentas.

Vea [límites de tasa](./rate-limits.md).

## 10. Sin cambios {#10-unchanged}

- **IDs de orden / operación**: `oid`, `tid`, `cloid` no cambian (`tid` es un `u64` — interprételo
  como entero grande, puede superar 2⁵³).
- **Acciones firmadas de `/exchange`**: los digests de acción tipada están **congelados por
  consenso** — `asset` sigue siendo un `u32` numérico en las acciones firmadas. El cambio de
  `coin`/`address` es solo un cambio de la **API de lectura**; **no** afecta cómo firma una
  orden o una cancelación. Vea [`POST /exchange`](./rest/exchange.md).

## Véase también {#see-also}

- [`POST /info`](./rest/info.md) · [consultas de perpetuos](./rest/info/perpetuals.md) · [consultas de spot y margen](./rest/info/spot.md)
- [Suscripciones WS](./ws/subscriptions.md)
- [Límites de tasa](./rate-limits.md) · [Errores](./errors.md)
