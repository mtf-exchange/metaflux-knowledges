# Canales de suscripción WS

:::info
**Estado.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `markets`, `fills`, `user_events`, `candles`, `order_updates`, `open_orders`, `notifications`, `ledger_updates`, `active_asset_data`, `user_fundings`, `user_twap_slice_fills`, `user_twap_history`, `account_state`, `spot_state`, `explorer_block` y `explorer_txs` están activos y publican datos comprometidos en tiempo real — impulsados por cambios: un canal emite una trama solo cuando su estado ha cambiado realmente desde el último commit. Todo lo demás bajo [Hoja de ruta](#roadmap--not-yet-available) no está conectado. El ciclo de vida de la conexión y el formato de trama se describen en el [README de WS](./index.md). Los canales por mercado (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) requieren un `coin`; `candles` requiere un `coin` **y** un `interval`; los canales por cuenta (`fills`, `user_events`, `open_orders`) requieren un `user` (la dirección 0x); `active_asset_data` requiere **tanto** un `user` como un `coin`; los canales globales `all_mids`, `markets`, `explorer_block` y `explorer_txs` no requieren ninguno de los dos.

:::warning
**`web_data2` (REST + WS) ha sido ELIMINADO.** Componga el equivalente a partir de
[`account_state`](#account_state) + [`spot_state`](#spot_state) + `order_updates`
(o las lecturas focalizadas de REST). Suscribirse a `web_data2` ahora devuelve
`{"channel":"error","data":{"error":"unknown channel: web_data2"}}`.
:::
:::

:::info
**Los nombres de canal van en snake_case (nativo de MTF).** Esta es la superficie nativa del nodo `/ws`, por lo que los nombres de canal en el protocolo son snake_case (`l2_book`, `user_events`, …). El gateway sirve este mismo WS nativo en `api.<net>.mtf.exchange/ws`.
:::

El protocolo de trama sigue el de HL; los **nombres de canal son snake_case nativos de MTF**. La suscripción se realiza con:

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

y se recibe un acuse de recibo (`subscriptionResponse`), un snapshot inicial (`is_snapshot: true`) y, a continuación, pushes impulsados por cambios en tiempo real: `{"channel":...,"data":...}` (`is_snapshot: false`). Un push se envía únicamente cuando el estado de ese canal ha cambiado realmente desde el último commit; si el canal no cambia, no se emite nada. El parámetro `coin` es **obligatorio** para los canales por mercado (`l2_book`, `bbo`); consulte [Parámetro coin](./index.md#coin-parameter) para ver cómo se canonicaliza (id numérico de activo o símbolo → clave de id de activo).

## Estado de los canales de un vistazo {#channel-status-at-a-glance}

| Canal | Estado | Clave | Fuente en vivo |
|---------|--------|:-------:|-------------|
| `l2_book` | **activo** | `coin` (obligatorio) | libro de órdenes comprometido, ante cambios |
| `bbo` | **activo** | `coin` (obligatorio) | libro de órdenes comprometido, ante cambios |
| `trades` | **activo** | `coin` (obligatorio) | ejecuciones del bloque comprometido, ante nuevas ejecuciones |
| `active_asset_ctx` | **activo** | `coin` (obligatorio) | mark/oracle/financiación/OI por mercado, ante cambios |
| `all_mids` | **activo** | ninguna | mark por mercado, ante cambios |
| `markets` | **activo** | ninguna | estado dinámico por mercado (mark / oracle / mid / prima / financiación / OI / ticker 24h / detenido) — snapshot completo, luego deltas de filas cambiadas |
| `fills` | **activo** | `user`/`address` (obligatorio) | ejecuciones del bloque comprometido para esa cuenta |
| `user_events` | **activo** | `user`/`address` (obligatorio) | ejecuciones del bloque comprometido para esa cuenta (más tipos de eventos próximamente) |
| `candles` | **activo** | `coin` + `interval` (ambos obligatorios) | ejecuciones del bloque comprometido agrupadas en barras OHLCV, ante cambios |
| `order_updates` | **activo** | `user`/`address` (obligatorio) | ciclo de vida de órdenes por cuenta (colocación / ejecución / cancelación / rechazo), ante cambios |
| `open_orders` | **activo** | `user`/`address` (obligatorio) | conjunto de órdenes en reposo por cuenta — un snapshot COMPLETO reemitido en cada cambio |
| `notifications` | **activo** | `user`/`address` (obligatorio) | avisos de margen / liquidación por cuenta, ante cambios |
| `ledger_updates` | **activo** | `user`/`address` (obligatorio) | movimientos de fondos por cuenta (depósito / retiro / transferencia), ante cambios |
| `active_asset_data` | **activo** | `user` **y** `coin` (ambos obligatorios) | contexto de apalancamiento / modo de margen / tamaño máximo de operación por (usuario, coin), ante cambios |
| `user_fundings` | **activo** | `user`/`address` (obligatorio) | pagos de financiación realizados por cuenta, ante cambios |
| `user_twap_slice_fills` | **activo** | `user`/`address` (obligatorio) | ejecuciones de tramos TWAP por cuenta (`{fill, twapId}`), ante cambios |
| `user_twap_history` | **activo** | `user`/`address` (obligatorio) | ciclo de vida TWAP por cuenta (`{time, state, status}`: activado / finalizado / terminado), ante cambios |
| `account_state` | **activo** | `user`/`address` (obligatorio) | estado del clearing PERP por cuenta — escalares de margen, posiciones, saldos — ante cambios |
| `spot_state` | **activo** | `user`/`address` (obligatorio) | estado del clearing SPOT por cuenta — saldos por token — ante cambios |
| `explorer_block` | **activo** | ninguna | encabezado del último bloque comprometido, en cada bloque nuevo |
| `explorer_txs` | **activo** | ninguna | transacciones del último bloque comprometido, en cada bloque nuevo |

Al suscribirse a cualquier otro `type` se devuelve `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

---

## Canales activos {#live-channels}

### Libro de órdenes L2 agregado para un mercado {#l2_book}

Libro de órdenes L2 agregado para un mercado. **Requiere `coin`.**

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC" } }
```

El snapshot inicial y cada push comparten esta estructura:

```json
{
  "channel": "l2_book",
  "data": {
    "coin": "BTC",
    "levels": [
      [ { "px": "10050000000", "sz": "12", "n": 2 }, { "px": "10049000000", "sz": "3", "n": 1 } ],
      [ { "px": "10051000000", "sz": "4", "n": 1 }, { "px": "10052000000", "sz": "6", "n": 1 } ]
    ],
    "time": 1735689600000
  }
}
```

- `levels` es `[bids, asks]`. Las pujas se ordenan de mejor (más alta) a peor; las ofertas, de mejor (más baja) a peor.
- Cada nivel es `{ px, sz, n }`: `px` / `sz` son magnitudes brutas de punto fijo como **strings** decimales (el escalado de tick por activo se aplica en el gateway), y `n` es el número de órdenes en reposo a ese precio.
- Cada lado está limitado a **20 niveles agregados**.
- `time` es el `last_trade_ms` del libro (derivado del consenso); `0` hasta que el libro haya tenido operaciones.

Cada push es un **snapshot completo de los 20 niveles superiores**, no un diff parcial. El envoltorio de trama lleva un booleano `is_snapshot` — `true` en el snapshot inicial al suscribirse, `false` en los pushes posteriores impulsados por cambios — pero el **cuerpo es el libro completo de los 20 mejores niveles en ambos casos**, por lo que el campo es informativo: basta con reemplazar el libro local en cada trama para mantenerse actualizado.

Frecuencia: impulsada por cambios — una trama se envía solo cuando el libro ha cambiado realmente desde el último commit; un commit que no modifica este libro no emite nada. Si el coin no corresponde a ningún mercado conocido, se recibirá el acuse de recibo pero el cuerpo del snapshot será el libro vacío (`"levels": [[], []]`, `"time": 0`) y no seguirán pushes.

### Mejor oferta y demanda del libro para un mercado {#bbo}

Mejor oferta / demanda (best bid/offer) para un mercado. Una versión más ligera de `l2_book`. **Requiere `coin`.**

```json
{ "method": "subscribe", "subscription": { "type": "bbo", "coin": "BTC" } }
```

```json
{
  "channel": "bbo",
  "data": {
    "coin": "BTC",
    "time": 1735689600000,
    "bbo": [
      { "px": "10050000000", "sz": "12", "n": 2 },
      { "px": "10051000000", "sz": "4", "n": 1 }
    ]
  }
}
```

- `bbo` es `[best_bid, best_ask]`. Cada entrada es un nivel `{ px, sz, n }`, o `null` cuando ese lado está vacío.
- `time` es `last_trade_ms`, igual que en `l2_book`.

Frecuencia: impulsada por cambios — una trama se envía solo cuando el top del libro ha cambiado realmente desde el último commit; un libro sin cambios no emite nada en ese commit.

---

### Cinta pública de operaciones para un mercado {#trades}

Cinta pública de operaciones para un mercado. **Requiere `coin`.** El `data` de cada
trama es un **array** de registros de operación; `px`/`sz` son strings enteros crudos
en el **plano 1e8**; `side` es el lado del tomador (`"B"` compra / `"A"` venta); `time`
es el timestamp del bloque de consenso (ms); `tid` es un id de operación determinista.

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

**Snapshot al suscribirse** (`is_snapshot: true`) — un array **no vacío** con las
impresiones recientes acotadas del mercado (hasta las **64** más recientes, de la más
nueva a la más antigua; vacío solo si el mercado nunca operó). Las filas del snapshot
llevan **`users: null`** — las direcciones de la contraparte no se reconstruyen para
impresiones históricas:

```json
{ "channel": "trades", "is_snapshot": true, "data": [
  { "coin": "BTC", "side": "A", "px": "6164370000000", "sz": "24000", "time": 1735689500000, "tid": 4898317237641214538, "users": null }
] }
```

**Pushes en vivo** (`is_snapshot: false`) — las nuevas impresiones del bloque recién
comprometido; el `users` de cada fila es `[taker, maker]` (el tomador primero, como
agresor):

```json
{ "channel": "trades", "is_snapshot": false, "data": [
  { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] }
] }
```

- `tid` puede superar 2⁵³ — trátelo como un entero de 64 bits / big integer, no como un número de JS.

### Contexto de mark, oracle y financiación por mercado {#active_asset_ctx}

Contexto por mercado para un mercado — precio mark / oracle, financiación e interés
abierto — publicado cuando cambia. **Requiere `coin`.** El cuerpo contiene los mismos
campos y unidades que la lectura REST [`market_info`](../rest/info/perpetuals.md#market_info):
`mark_px` / `oracle_px` son **USDC entero**, ajustados al tick (truncados al tick de
precio del mercado), y el bloque `funding` refleja `market_info.funding`. Se construye
a partir del mismo generador de registros por mercado que la lectura REST, por lo que
un push de contexto WS nunca difiere de `market_info`.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_ctx", "coin": "BTC" } }
```

```json
{
  "channel": "active_asset_ctx",
  "data": {
    "coin": "BTC",
    "mark_px": "66735.25",
    "oracle_px": "66700",
    "funding": {
      "rate_per_hr": "0",
      "cap_per_hr": "400",
      "interval_ms": 3600000,
      "next_payment_ts": 0
    },
    "open_interest": "5000000000"
  }
}
```

- `mark_px` / `oracle_px` — USDC entero, ajustados al tick (`"0"` cuando no están definidos). Mismo plano que `market_info`, NO el plano de libro 1e8.
- `funding` — `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, idéntico al bloque `market_info.funding` de REST (`null` para un mercado desconocido — ver más abajo). `rate_per_hr` es la última muestra de tasa de financiación horaria (antes de aplicar el límite) y `cap_per_hr` es el límite de tasa por mercado; ambos son **strings en bps** truncados hacia cero (p. ej., `"400"` = 0,04/hr); `interval_ms` es la cadencia de financiación (`3600000` = 1h); `next_payment_ts` es epoch-ms, `0` hasta que el mercado tenga su primera muestra de financiación.
- `open_interest` — interés abierto actual, string de punto fijo (`"0"` cuando no hay libro).

Frecuencia: impulsada por cambios — una trama se envía solo cuando el contexto de este mercado ha cambiado realmente desde el último commit; un contexto sin cambios no emite nada en ese commit.

Si el coin no corresponde a ningún mercado conocido, se recibirá el acuse de recibo, pero el snapshot será el cuerpo **vacío honesto** — precios e interés abierto en cero y un bloque `funding` en `null` — y no seguirán pushes (de modo que un cliente que deserializa una estructura de contexto fija nunca falla):

```json
{ "channel": "active_asset_ctx", "data": { "coin": "DOGE", "mark_px": "0", "oracle_px": "0", "funding": null, "open_interest": "0" } }
```

### Mapa global de precios medios para todos los mercados {#all_mids}

Mapa global de mids — el precio mark de cada mercado, publicado cuando los mids cambian. Con clave por coin; los valores son el mark en USDC entero ajustado al tick que reporta la lectura REST [`markets`](../rest/info/perpetuals.md#markets). No admite el parámetro `coin`.

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### Estado dinámico global para todos los mercados {#markets}

Cinta global de estado **dinámico** por mercado — el mark / oracle / mid en vivo de cada mercado, la prima de financiación, el interés abierto, el ticker 24h y el flag de detenido, una fila por mercado. GLOBAL: no admite **ni `coin` ni `user`** (como [`all_mids`](#all_mids)). Las filas comparten el generador dinámico REST [`markets`](../rest/info/perpetuals.md#markets), por lo que el feed WS y la lectura REST nunca difieren.

```json
{ "method": "subscribe", "subscription": { "type": "markets" } }
```

La trama **al suscribirse** (`is_snapshot: true`) es un **array con la fila de cada mercado** (perp **y** spot):

```json
{ "channel": "markets", "is_snapshot": true, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "66735.25", "oracle_px": "66700",
    "mid_px": "66735.30", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.01", "halted": false },
  { "coin": "BTC/USDC", "kind": "spot", "mark_px": "66730", "mid_px": "66731",
    "day_ntl_vlm": "58000", "prev_day_px": "66000" }
] }
```

Cada **push** posterior (`is_snapshot: false`) lleva **solo las filas cambiadas** — la fila completa de cada mercado cuya fila se movió en este commit, omitiendo los mercados sin cambios (un commit tranquilo no publica nada):

```json
{ "channel": "markets", "is_snapshot": false, "data": [
  { "coin": "BTC", "kind": "perp", "mark_px": "70000", "oracle_px": "70000",
    "mid_px": "70001", "premium": "0.0015",
    "funding": { "rate_per_hr": "0", "cap_per_hr": "400", "interval_ms": 3600000, "next_payment_ts": 0 },
    "open_interest": "50000", "day_ntl_vlm": "530", "prev_day_px": "66000",
    "change_24h": "0.06", "halted": false }
] }
```

Así, el **snapshot son todas las filas** y un **delta son solo las filas cambiadas** — desmultiplexe cada fila por su `(coin, kind)` y reemplácela en su tabla local. Cada fila se autoetiqueta con `kind` (`"perp"` / `"spot"`). Las filas perp llevan:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coin` | string | Símbolo del mercado (clave de unión) |
| `kind` | `"perp"` | Tipo de mercado (clave de unión) |
| `mark_px` | String decimal | Precio mark, **USDC entero**, ajustado al tick (`"0"` cuando no está definido) |
| `oracle_px` | String decimal | Precio índice, **USDC entero**, ajustado al tick (`"0"` cuando no está definido) |
| `mid_px` | String decimal | Mid real del libro de órdenes, **USDC entero**, ajustado al tick — **se omite** cuando el libro es unilateral (nunca se envía como `null`) |
| `premium` | String decimal \| null | Última muestra de prima de financiación, un string de **8 decimales** (truncado hacia cero); `null` cuando no existe muestra |
| `funding` | objeto | `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`, idéntico al bloque `market_info.funding` de REST |
| `open_interest` | String decimal | Interés abierto actual, tamaño en unidad entera |
| `day_ntl_vlm` | String decimal | Volumen nocional rodante de 24h (USDC entero) |
| `prev_day_px` | String decimal \| null | Mark de hace ~24h (USDC entero); `null` cuando no hay muestra de hace 24h |
| `change_24h` | String decimal \| null | Fracción de cambio en 24h con signo (`"0.05"` = +5%); `null` cuando no hay px previo |
| `halted` | bool | Si el mercado está detenido |

Las filas spot llevan solo los campos con análogo spot — `coin`, `kind` (`"spot"`), `mark_px`, `mid_px` (omitido cuando es unilateral), `day_ntl_vlm`, `prev_day_px`; los campos exclusivos de perp (`oracle_px` / `premium` / `funding` / `open_interest` / `change_24h` / `halted`) están ausentes.

Frecuencia: impulsada por cambios — una trama de delta llega solo en los commits donde al menos la fila de un mercado se movió; un commit que no cambia nada no emite nada.

### Flujo de ejecuciones por cuenta {#fills}

Flujo de ejecuciones por cuenta. Requiere `user` (la dirección 0x; también se acepta `address`) — NO un `coin`. Cada cruce ejecutado entrega un registro a AMBAS partes, cada una desde su propia perspectiva, con el mismo conjunto de campos `{coin, side, px, sz, time, oid, cloid, tid, crossed}`:

- el registro del **tomador** — el propio `oid` del tomador, su `cloid` (o `null`), el lado del tomador, `crossed: true`;
- el registro del **creador** — el propio `oid` del creador, `cloid: null` (no se captura cloid para el lado en reposo), el lado **opuesto**, `crossed: false`.

Ambos lados de un mismo cruce comparten el mismo `tid` (el mismo valor que lleva la cinta pública `trades`). `px`/`sz` son strings en el plano 1e8. Los registros de ejecución por cuenta **no llevan array `users`** — las direcciones de la contraparte aparecen únicamente en la cinta pública [`trades`](#trades), nunca en el feed con alcance de cuenta.

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

El snapshot inicial es el array vacío `[]`; cada push es un array con un registro de ejecución:

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] }
```

### Feed de eventos por cuenta {#userevents}

Feed de eventos por cuenta. Requiere `user` (la dirección 0x) — NO un `coin`. Actualmente etiqueta `fills`; los tipos de eventos de liquidación y financiación llegarán como claves hermanas.

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

El nombre de canal nativo es `user_events` (snake_case).

:::warning
`user_events` contiene datos por cuenta pero actualmente **no tiene autenticación** — cualquier conexión puede suscribirse al feed de cualquier dirección. No lo trate como un canal privado hasta que se implemente la compuerta de autenticación en la suscripción; para lecturas/escrituras autenticadas, use `post` con una acción firmada.
:::

### Barras OHLCV continuas para un mercado {#candles}

Barras OHLCV continuas para un mercado a un tamaño de barra determinado. **Requiere tanto `coin` como `interval`** — juntos forman la clave de enrutamiento, por lo que una suscripción `1m` y una `5m` sobre el mismo mercado son suscripciones independientes, cada una con su propio snapshot y pushes.

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m" } }
```

- `interval` ∈ `1m` / `5m` / `15m` / `1h` / `4h` / `1d`. Un `interval` ausente o no reconocido se normaliza a **`1m`** (el acuse de recibo refleja el intervalo usado realmente).
- El acuse de recibo devuelve `interval` en la suscripción para que el cliente pueda correlacionar `(coin, interval)`.

El **snapshot inicial** es un **array** con las barras recientes (cerradas + la barra abierta), de la más antigua a la más reciente — `[]` hasta que el mercado haya operado:

```json
{ "channel": "candles", "data": [
  { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 }
] }
```

Cada **push** es un **único objeto de barra** (no el array) — la barra abierta actual para ese `(coin, interval)`, re-emitida en cada bloque comprometido cuyas ejecuciones caigan en este mercado:

```json
{ "channel": "candles", "data": { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 } }
```

- `t` / `T` — epoch-ms de apertura / cierre de la barra (derivado del consenso); la barra cubre `[t, T]` y una ejecución pasa a una nueva barra cuando el timestamp de su bloque supera `T`.
- `s` — símbolo de coin / mercado; `i` — token de intervalo.
- `o` / `c` / `h` / `l` — apertura / cierre / máximo / mínimo, strings en **USDC decimal** (dólares legibles, p. ej. `"67002.50"`).
- `v` — volumen del activo base acumulado en la barra (tamaño en coin). `q` — volumen en USD (cotización) = `Σ precio × tamaño` de las ejecuciones de la barra. `n` — número de ejecuciones en la barra.

La serie es **continua**: un intervalo sin operaciones emite una barra plana que lleva el cierre anterior hacia adelante (`o = h = l = c = cierre anterior`, `v = q = 0`, `n = 0`). No se emite ninguna barra antes de la primera operación del mercado — la serie comienza en el bucket de la primera ejecución.

Un almacén mantiene hasta **1000 barras por serie `(coin, interval)`**; las series frías (sin suscriptor) se desalojan, por lo que un mercado/intervalo no observado no tiene coste.

### Eventos del ciclo de vida de órdenes por cuenta {#order_updates}

Ciclo de vida de órdenes por cuenta. Requiere `user` (la dirección 0x). Cada push es un array de registros de actualización de órdenes para esa cuenta del bloque recién comprometido; el snapshot inicial es `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": 42, "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` ∈ `open` (en reposo; `order.sz` es el remanente del libro tras el commit, `order.orig_sz` el tamaño con el que se colocó la orden) / `filled` / `canceled` / `rejected` (+`reason`, `oid` null) / `cancel_rejected` (+`reason`).
- En un registro **`filled`**, `order.sz` = el tamaño **EJECUTADO** y `order.orig_sz` = el tamaño **original** de la orden (por lo que `sz / orig_sz` es la fracción ejecutada); un tomador también lleva `filled_sz` + `avg_px` acumulados, mientras que un tramo de creador reporta el `filled_sz` del cruce individual con `status` aún `open` mientras queda tamaño en reposo.
- `limit_px` / `sz` / `orig_sz` / `avg_px` son strings decimales en el plano 1e8; `time` es el consenso en ms; los campos desconocidos son `null`.
- **No** se emiten hoy: `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / transiciones TWAP y cancelaciones iniciadas por el motor (BOLE T0) — la observación de despacho para esas es un ok/err opaco sin payload por orden.

### Snapshot de órdenes en reposo por cuenta {#open_orders}

Conjunto de órdenes en reposo por cuenta. Requiere `user` (la dirección 0x; también se acepta `address`) — NO un `coin`. A diferencia de [`order_updates`](#order_updates) (deltas por evento), **cada** trama de `open_orders` es un snapshot COMPLETO de las órdenes en reposo actuales de la cuenta — `is_snapshot` es `true` en la trama al suscribirse **y en cada reemisión**. El nodo reemite el conjunto completo cada vez que un cambio en el ciclo de vida de una orden lo toca (colocación / ejecución / cancelación / modificación / cancelación iniciada por el motor), por lo que un cliente simplemente **reemplaza todo su conjunto de órdenes abiertas en cada trama**; no hay deltas parciales que reconciliar. Esto evita la brecha de [`order_updates`](#order_updates) donde `modify` / `batchModify` / cancelaciones iniciadas por el motor no llevan delta por orden.

```json
{ "method": "subscribe", "subscription": { "type": "open_orders", "user": "0x<address>" } }
```

El snapshot es un **array** de registros, cada uno con la misma forma fija que un elemento `status: "open"` de [`order_updates`](#order_updates) — `[]` cuando la cuenta no tiene órdenes en reposo:

```json
{ "channel": "open_orders", "is_snapshot": true, "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": null,
             "oid": 42, "cloid": null, "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- Cada elemento es una orden en reposo: el objeto `order` anidado (`coin`, `side`, `limit_px`, `sz` = tamaño restante, `orig_sz`, `oid`, `cloid`, `tif`, `reduce_only`), con `filled_sz` / `avg_px` / `reason` todos `null` (una orden estable, no un evento) y `time` el timestamp de inserción de la orden (consenso ms). En este snapshot `orig_sz` es `null` (el tamaño colocado no se rederiva para una orden estable) y `reduce_only` es `false`; `cloid` es el id de cliente o `null`. `limit_px` está en USDC entero, `sz` está en el plano de tamaño.
- Como cada trama es un snapshot completo, `is_snapshot` es siempre `true` aquí — trate cada trama como el conjunto completo actual de órdenes en reposo de la cuenta, no como un cambio incremental.

### Avisos de margen y liquidación por cuenta {#notifications}

Avisos de margen / liquidación por cuenta, derivados al comparar estados comprometidos consecutivos. Requiere `user`. Una trama de array por commit afectado; snapshot inicial `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "notifications", "user": "0x<address>" } }
```

```json
{ "channel": "notifications", "data": [
  { "kind": "yellow_card", "tier": "yellow_card", "message": "...", "time": 1735689600123 },
  { "kind": "forced_close_tier", "tier": "partial_market_50", "message": "...", "time": 1735689600123 },
  { "kind": "tier_cleared", "tier": null, "message": "...", "time": 1735689600123 },
  { "kind": "forced_close", "coin": "BTC", "side": "long", "closed_sz": "600", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual", "coin": "BTC", "side": "long", "lots": "120", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual_cleared", "coin": "BTC", "side": "long", "message": "...", "time": 1735689600123 } ] }
```

- `kind` es la etiqueta de máquina; `message` es el texto legible por el ser humano. `tier` ∈ `yellow_card` / `partial_market_50` / `full_market` / `backstop_takeover` (o `null` al limpiar).
- `yellow_card` es la gracia de aviso de margen de un bloque (el contrato T0 de [liquidación escalonada](../../concepts/tiered-liquidation.md)); `forced_close` se activa cuando una liquidación se ejecuta efectivamente contra la cuenta.

### Historial de movimientos de fondos por cuenta {#ledger_updates}

Movimientos de fondos por cuenta, atribuidos a su **causa** (leída desde el payload del bloque comprometido — un registro aparece solo cuando la acción se aplicó). Requiere `user`. El snapshot al suscribirse es un **array** con los registros de ledger más recientes de la cuenta, **del más nuevo al más antiguo**, acotado a los últimos **100** (`[]` cuando la cuenta no tiene registros recientes); cada push posterior es un array con el/los nuevo(s) registro(s) del bloque recién comprometido.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` ∈ `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (+`token`), `asset_send` / `asset_receive` (+`asset`, `to_perp`), `withdraw` (`via`: `cctp` | `metabridge`), `deposit` (`amount` puede ser `null` para un crédito CCTP entrante), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer`, `vault_transfer`. Una transferencia emite un registro por cada parte (remitente + destinatario).
- Los importes son strings decimales en token entero, excepto `withdraw` vía MetaBridge, que lleva `amount_units` (unidades base crudas). Los importes de crédito entrante de bridge y las acciones retrasadas por CoreWriter (que se despachan en un bloque posterior) aún no están atribuidos.

### Contexto de operación para una cuenta y un mercado {#active_asset_data}

Contexto de operación por (usuario, coin) — apalancamiento, modo de margen y el
límite máximo de tamaño de operación vigente para una cuenta en un mercado. Requiere
**tanto** `user` (0x) como `coin`. El snapshot inicial es el contexto en vivo
(valores predeterminados en cero cuando la cuenta no tiene posición), no un array
vacío; un push lo re-emite solo cuando ese contexto cambia.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "is_snapshot": true, "data": {
  "address": "0x<addr>", "coin": "BTC", "leverage": 50, "margin_mode": "cross",
  "mark_px": "61742.69625702", "max_trade_size": "0", "max_trade_szs": ["0", "0"],
  "available_to_trade": ["0", "0"], "has_position": false } }
```

- Con clave por `coin` (símbolo). `margin_mode` ∈ `cross` / `isolated` / `strict_iso`;
  `max_trade_size` es el límite de tamaño derivado del tope de OI, `max_trade_szs` /
  `available_to_trade` son pares `[compra, venta]`; los campos son idénticos a la
  lectura REST [`active_asset_data`](../rest/info/perpetuals.md#active_asset_data).

### Estado del clearing de perpetuos por cuenta {#account_state}

Estado del clearing **PERP** por cuenta — el resumen de margen, las posiciones
abiertas y los saldos de una cuenta — publicado cuando cambia. Requiere `user` (la
dirección 0x; también se acepta `address`) — NO un `coin`. El cuerpo se construye a
partir del mismo generador de registros que la lectura REST de cuenta enfocada, por
lo que un push WS nunca difiere de esa lectura. El snapshot inicial es el estado en
vivo (en cero para una cuenta sin fondos), no un array vacío.

```json
{ "method": "subscribe", "subscription": { "type": "account_state", "user": "0x<address>" } }
```

```json
{
  "channel": "account_state",
  "data": {
    "address": "0x<addr>",
    "account_value": "10000", "free_collateral": "8500", "maint_margin": "300",
    "init_margin": "1500", "health": "0.97", "tier": 0,
    "mode": "cross", "pm_enabled": false,
    "positions": [
      { "asset": 0, "size": "600", "entry": "62000", "upnl": "441",
        "isolated": false, "lev": 7, "side": "long" }
    ],
    "balances": { "usdc": "10000", "spot": { "MTF": { "total": "12.5", "hold": "0" } } }
  }
}
```

- Los escalares de margen (`account_value` / `free_collateral` / `maint_margin` /
  `init_margin` / `health`) son strings decimales en **USDC entero**, idénticos a los
  `MarginScalars` de la lectura REST de cuenta; `tier` es el índice de nivel de
  liquidación, `mode` el modo predeterminado de la cuenta, `pm_enabled` indica si el
  margen de cartera está activo.
- `positions[]` — una entrada por posición de contrato perpetuo abierta: `asset` (id
  numérico), `size` (string con signo en plano 1e8), `entry` / `upnl` (USDC entero),
  `isolated`, `lev` y `side` (`long` / `short`, presente en modo cobertura).
- `balances` — `{usdc, spot}`: `usdc` es la garantía en cotización (USDC entero);
  `spot` mapea token → `{total, hold}`.

Frecuencia: impulsada por cambios — una trama se envía solo cuando el estado de la cuenta ha cambiado realmente desde el último commit; una cuenta sin cambios no emite nada en ese commit.

:::warning
`account_state` contiene datos por cuenta pero actualmente **no tiene autenticación** — cualquier conexión puede suscribirse a cualquier dirección. No lo trate como privado hasta que se implemente la compuerta de autenticación en la suscripción.
:::

### Estado del clearing spot por cuenta {#spot_state}

Estado del clearing **SPOT** por cuenta — los saldos spot por token para una
cuenta — publicado cuando cambian. Requiere `user`. El snapshot inicial es el conjunto
de saldos en vivo (`[]` para una cuenta sin tenencias spot).

```json
{ "method": "subscribe", "subscription": { "type": "spot_state", "user": "0x<address>" } }
```

```json
{
  "channel": "spot_state",
  "data": {
    "address": "0x<addr>",
    "balances": [
      { "asset": 1, "name": "USDC", "total": "2500", "hold": "100" },
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ]
  }
}
```

- `balances[]` — una entrada por token spot en tenencia: `asset` (id numérico), `name`
  (símbolo del token), `total` (string decimal en token entero), `hold` (importe
  reservado por órdenes spot en reposo). Idéntico a la lectura REST de saldos spot.

Frecuencia: impulsada por cambios — una trama se envía solo cuando los saldos spot han cambiado realmente desde el último commit; una cuenta sin cambios no emite nada en ese commit.

### Pagos de financiación realizados por cuenta {#user_fundings}

Pagos de financiación **realizados** por cuenta — un registro cada vez que la
financiación se liquida contra la cuenta en un mercado. Requiere `user` (la dirección
0x; también se acepta `address`) — NO un `coin`. El `data` de cada trama es un array
de registros de financiación de la liquidación recién comprometida; el snapshot
inicial es `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "user_fundings", "user": "0x<address>" } }
```

```json
{ "channel": "user_fundings", "data": [
  { "coin": "BTC", "payment": "-0.42", "szi": "600", "fundingRate": "0.0001", "time": 1735689600123 }
] }
```

- `coin` — símbolo del mercado sobre el que se liquidó el pago.
- `payment` — el importe de financiación aplicado, string decimal en **USDC entero**, **con signo**:
  negativo = la cuenta pagó, positivo = la cuenta recibió.
- `szi` — el tamaño de posición con signo contra el que se calculó el pago (unidades base).
- `fundingRate` — la tasa por activo aplicada en esta liquidación (string decimal).
- `time` — timestamp de liquidación (consenso ms).

### Encabezado del último bloque comprometido {#explorer_block}

Encabezado del último bloque **comprometido**, publicado en cada bloque nuevo. Sin
parámetro `coin` / `user`. El `data` de cada trama es un array (el/los nuevo(s)
encabezado(s) recién comprometido(s)); `is_snapshot: true` en la primera trama tras
suscribirse.

```json
{ "method": "subscribe", "subscription": { "type": "explorer_block" } }
```

```json
{ "channel": "explorer_block", "is_snapshot": true, "data": [
  { "height": 72399, "round": 72399, "epoch": 0, "proposer": 5,
    "hash": "0x3a0572f514cb6bf4517c40b1511728d460b4f7c9b98a68932c6801f5aee80dfd",
    "time": 1783009348137, "tx_count": 0 }
] }
```

- `height` / `round` — altura de bloque comprometido / ronda de consenso.
- `epoch` — época de staking.
- `proposer` — índice del validador proponente.
- `hash` — hash del bloque (prefijado con `0x`).
- `time` — timestamp del bloque (consenso ms).
- `tx_count` — número de transacciones en el bloque.

### Transacciones del último bloque {#explorer_txs}

Transacciones del último bloque comprometido, publicadas en cada bloque nuevo. Sin
parámetro `coin` / `user`. El `data` de cada trama es un array de registros de
transacción (vacío para un bloque sin transacciones); `is_snapshot: true` en la
primera trama tras suscribirse.

```json
{ "method": "subscribe", "subscription": { "type": "explorer_txs" } }
```

```json
{ "channel": "explorer_txs", "is_snapshot": false, "data": [
  { "hash": "0x4660d9ccf52ef1abde5e03d1b3f1c110b948d2f71331f086239666781dbde91c" }
] }
```

- Cada fila lleva un campo `hash` — el hash de acción `0x` de la transacción —
  que está **vacío (`""`)** para una entrada **sistémica** (una acción interna del
  motor sin hash firmado por el usuario). Un bloque sin transacciones publica
  `"data": []`.

---

## `post` — solicitud/respuesta sobre WS {#post--requestresponse-over-ws}

No es un canal de suscripción, sino la forma de realizar lecturas puntuales y escrituras firmadas sobre el mismo socket. El `request` es el mismo envoltorio `{type, payload}` que las rutas REST; se despacha a través de los manejadores idénticos (`POST /info`, `POST /exchange`). Consulte [`post` en el README de WS](./index.md#post-requestresponse-over-ws) para conocer las formas completas de solicitud/respuesta y las reglas de firma.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

Esta es la ruta soportada para lecturas autenticadas y para enviar acciones firmadas sobre WS hoy en día.

---

## Hoja de ruta — no disponible aún {#roadmap--not-yet-available}

Los siguientes canales aparecieron en borradores anteriores pero **no están implementados** en la superficie WS del nodo. No son nombres de canal reconocidos; suscribirse a ellos devuelve un error `unknown channel`. Se listan aquí para que los integradores no se confundan con stubs de SDK más antiguos.

- **Datos de mercado públicos:** `meta` (metadatos del universo), `mark` (precio mark/oracle), `fundingTicks` (actualizaciones de tasa de financiación).
- **Por usuario (requeriría autenticación):** `vaultEvents`, `rfqEvents`.

Tampoco están implementados hoy:

- **`l2_book` basado en diffs** (tramas de `updates` parciales) — el `l2_book` actual siempre envía cuerpos completos de los 20 mejores niveles. La trama sí lleva un indicador `is_snapshot` (`true` en el snapshot inicial, `false` en los pushes impulsados por cambios), pero todos los cuerpos son snapshots completos — no existen tramas de `updates` de diff parcial.
- **`seq` / `resume` / tokens de reanudación** — cada (re)suscripción comienza desde un snapshot nuevo.
- **Envoltorio de autenticación en la suscripción** para canales privados — use `post` con una acción firmada para operaciones autenticadas.

---

## Orden y entrega {#ordering--delivery}

- **Por suscripción**, las tramas llegan en orden de commit (una trama se emite solo en los commits donde el estado del canal observado cambió). No hay `seq`; el orden es implícito en el orden de llegada sobre el socket único.
- **Entre suscripciones**, no hay garantía de orden — la intercalación es arbitraria. Desmultiplexe sobre `channel` + el `coin` dentro de `data`.
- La entrega es **como máximo una vez por cambio** y **no se almacena en búfer para reanudación**: una suscripción que se quede más de 256 tramas por detrás es descartada con una trama de error `lagged` (consulte [Contrapresión y lag](./index.md#backpressure--lag)). Vuelva a suscribirse para recuperarse; recibirá un snapshot nuevo.

## Véase también {#see-also}

- [README de WS](./index.md) — ciclo de vida de la conexión, tramas, parámetro coin, `post`, contrapresión
- [`POST /info`](../rest/info.md) — equivalentes REST para lecturas puntuales (también accesibles vía `post`)
- [`POST /exchange`](../rest/exchange.md) — envoltorio de acción firmada compartido por la ruta de acción `post`
