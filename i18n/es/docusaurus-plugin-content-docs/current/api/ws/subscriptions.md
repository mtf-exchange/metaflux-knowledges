# Canales de suscripción WS

:::info
**Estado.** `l2_book`, `bbo`, `trades`, `active_asset_ctx`, `all_mids`, `fills`, `user_events`, `candles`, `order_updates`, `notifications`, `ledger_updates`, `active_asset_data`, `user_fundings`, `user_twap_slice_fills`, `user_twap_history`, `account_state`, `spot_state` y `web_data2` están activos y publican datos comprometidos en tiempo real — impulsados por cambios: un canal emite una trama solo cuando su estado ha cambiado realmente desde el último commit. Todo lo que figura en [Hoja de ruta](#hoja-de-ruta--no-disponible-aún) no está conectado. El ciclo de vida de la conexión y el formato de trama se describen en el [README de WS](./index.md). Los canales por mercado (`l2_book`, `bbo`, `trades`, `active_asset_ctx`) requieren un `coin`; `candles` requiere un `coin` **y** un `interval`; los canales por cuenta (`fills`, `user_events`) requieren un `user` (la dirección 0x); `active_asset_data` requiere **tanto** un `user` como un `coin`; `all_mids` no requiere ninguno de los dos.
:::

:::info
**Los nombres de canal van en snake_case (nativo de MTF).** Esta es la superficie nativa del nodo `/ws`, por lo que los nombres de canal en el protocolo son snake_case (`l2_book`, `user_events`, …). Los clientes que prefieran los nombres de canal en camelCase de HL (`l2Book`, `userEvents`, `userFills`, `candle`, …) deben conectarse al **`/hl/ws`** del gateway (compatible con HL), que los traduce internamente a estos canales snake_case nativos. Según el enrutamiento del gateway unificado: `<net>-gateway.mtf.exchange/ws` = snake_case nativo, `/hl/ws` = camelCase de HL.
:::

El protocolo de trama sigue el de HL; los **nombres de canal son snake_case nativos de MTF**. La suscripción se realiza con:

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

y se recibe un acuse de recibo (`subscriptionResponse`), un snapshot inicial (`is_snapshot: true`) y, a continuación, pushes impulsados por cambios en tiempo real: `{"channel":...,"data":...}` (`is_snapshot: false`). Un push se envía únicamente cuando el estado de ese canal ha cambiado realmente desde el último commit; si el canal no cambia, no se emite nada. El parámetro `coin` es **obligatorio** para los canales por mercado (`l2_book`, `bbo`); consulte [Parámetro coin](./index.md#coin-parameter) para ver cómo se canonicaliza (id numérico de activo o símbolo → clave de id de activo).

## Estado de los canales de un vistazo

| Canal | Estado | Clave | Fuente en vivo |
|---------|--------|:-------:|-------------|
| `l2_book` | **activo** | `coin` (obligatorio) | libro de órdenes comprometido, ante cambios |
| `bbo` | **activo** | `coin` (obligatorio) | libro de órdenes comprometido, ante cambios |
| `trades` | **activo** | `coin` (obligatorio) | ejecuciones del bloque comprometido, ante nuevas ejecuciones |
| `active_asset_ctx` | **activo** | `coin` (obligatorio) | mark/oracle/financiación/OI por mercado, ante cambios |
| `all_mids` | **activo** | ninguna | mark por mercado, ante cambios |
| `fills` | **activo** | `user`/`address` (obligatorio) | ejecuciones del bloque comprometido para esa cuenta |
| `user_events` | **activo** | `user`/`address` (obligatorio) | ejecuciones del bloque comprometido para esa cuenta (más tipos de eventos próximamente) |
| `candles` | **activo** | `coin` + `interval` (ambos obligatorios) | ejecuciones del bloque comprometido agrupadas en barras OHLCV, ante cambios |
| `order_updates` | **activo** | `user`/`address` (obligatorio) | ciclo de vida de órdenes por cuenta (colocación / ejecución / cancelación / rechazo), ante cambios |
| `notifications` | **activo** | `user`/`address` (obligatorio) | avisos de margen / liquidación por cuenta, ante cambios |
| `ledger_updates` | **activo** | `user`/`address` (obligatorio) | movimientos de fondos por cuenta (depósito / retiro / transferencia), ante cambios |
| `active_asset_data` | **activo** | `user` **y** `coin` (ambos obligatorios) | contexto de apalancamiento / modo de margen / tamaño máximo de operación por (usuario, coin), ante cambios |
| `user_fundings` | **activo** | `user`/`address` (obligatorio) | pagos de financiación realizados por cuenta, ante cambios |
| `user_twap_slice_fills` | **activo** | `user`/`address` (obligatorio) | ejecuciones de tramos TWAP por cuenta (`{fill, twapId}`), ante cambios |
| `user_twap_history` | **activo** | `user`/`address` (obligatorio) | ciclo de vida TWAP por cuenta (`{time, state, status}`: activado / finalizado / terminado), ante cambios |
| `account_state` | **activo** | `user`/`address` (obligatorio) | estado del clearing PERP por cuenta — escalares de margen, posiciones, saldos — ante cambios |
| `spot_state` | **activo** | `user`/`address` (obligatorio) | estado del clearing SPOT por cuenta — saldos por token — ante cambios |
| `web_data2` | **activo** | `user`/`address` (obligatorio) | snapshot compuesto de la interfaz por cuenta — clearing + saldos spot + órdenes abiertas + valores de vault + estado del exchange — ante cambios |

Al suscribirse a cualquier otro `type` se devuelve `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

---

## Canales activos

### `l2_book`

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

### `bbo`

Mejor oferta/demanda (best bid/offer) para un mercado. Una versión más ligera de `l2_book`. **Requiere `coin`.**

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

### `trades`

Cinta pública de operaciones para un mercado — un registro por ejecución en ese mercado, emitido en los commits donde ese mercado operó realmente. `px`/`sz` son strings enteros crudos en el **plano 1e8**; `side` es el lado del tomador (`"B"` compra / `"A"` venta); `time` es el timestamp del bloque de consenso (ms); `tid` es un id de operación determinista; `users` es `[taker, maker]` (el tomador primero, como agresor).

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

```json
{ "channel": "trades", "data": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] } }
```

### `active_asset_ctx`

Contexto por mercado para un mercado — precio mark / oracle, financiación e interés abierto — publicado cuando cambia. **Requiere `coin`.** El cuerpo contiene los mismos campos y unidades que la lectura REST [`market_info`](../rest/info.md#market_info): `mark_px` / `oracle_px` son **USDC entero**, ajustados al tick del mercado (truncados al tick de precio del mercado), y el bloque `funding` refleja `market_info.funding`. Se construye a partir del mismo generador de registros por mercado que la lectura REST, por lo que un push de contexto WS nunca difiere de `market_info`.

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

### `all_mids`

Mapa global de mids — el precio mark de cada mercado, publicado cuando los mids cambian. Con clave por coin; los valores son el mark en USDC entero ajustado al tick que reporta la lectura REST [`markets`](../rest/info.md#markets). No admite el parámetro `coin`.

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### `fills` <a id="fills"></a>

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

### `user_events` <a id="userevents"></a>

Feed de eventos por cuenta. Requiere `user` (la dirección 0x) — NO un `coin`. Actualmente etiqueta `fills`; los tipos de eventos de liquidación y financiación llegarán como claves hermanas.

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

El nombre de canal nativo es `user_events` (snake_case); en el `/hl/ws` del gateway (compatible con HL), el equivalente es `userEvents` de HL.

:::warning
`user_events` contiene datos por cuenta pero actualmente **no tiene autenticación** — cualquier conexión puede suscribirse al feed de cualquier dirección. No lo trate como un canal privado hasta que se implemente la compuerta de autenticación en la suscripción; para lecturas/escrituras autenticadas, use `post` con una acción firmada.
:::

### `candles`

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

Un almacén mantiene hasta **1000 barras por serie `(coin, interval)`**; las series frías (sin suscriptor) se desalojan, por lo que un mercado/intervalo no observado no tiene coste. En el `/hl/ws` del gateway (compatible con HL), el nombre de canal equivalente es `candle` de HL (en singular).

### `order_updates`

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

- `status` ∈ `open` (en reposo; `sz` es el remanente del libro tras el commit) / `filled` (un tomador lleva `filled_sz` + `avg_px` acumulados; un tramo de creador reporta el `filled_sz` del cruce individual con `status` aún `open` mientras queda tamaño en reposo) / `canceled` / `rejected` (+`reason`, `oid` null) / `cancel_rejected` (+`reason`).
- `limit_px` / `sz` / `orig_sz` / `avg_px` son strings decimales en el plano 1e8; `time` es el consenso en ms; los campos desconocidos son `null`.
- **No** se emiten hoy: `modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / transiciones TWAP y cancelaciones iniciadas por el motor (BOLE T0) — la observación de despacho para esas es un ok/err opaco sin payload por orden.

### `notifications`

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

### `ledger_updates`

Movimientos de fondos por cuenta, atribuidos a su **causa** (leída desde el payload del bloque comprometido — un registro aparece solo cuando la acción se aplicó). Requiere `user`; snapshot inicial `[]`.

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` ∈ `usd_send` / `usd_receive`, `spot_send` / `spot_receive` (+`token`), `asset_send` / `asset_receive` (+`asset`, `to_perp`), `withdraw` (`via`: `cctp` | `metabridge`), `deposit` (`amount` puede ser `null` para un crédito CCTP entrante), `system_credit`, `sub_account_transfer`, `sub_account_spot_transfer`, `vault_transfer`. Una transferencia emite un registro por cada parte (remitente + destinatario).
- Los importes son strings decimales en token entero, excepto `withdraw` vía MetaBridge, que lleva `amount_units` (unidades base crudas). Los importes de crédito entrante de bridge y las acciones retrasadas por CoreWriter (que se despachan en un bloque posterior) aún no están atribuidos.

### `active_asset_data`

Contexto de operación por (usuario, coin) — apalancamiento, modo de margen y el límite máximo de tamaño de operación para una cuenta en un mercado. Requiere **tanto** `user` (0x) como `coin`. El snapshot inicial es el contexto en vivo (valores predeterminados en cero cuando la cuenta no tiene posición), no un array vacío; un push lo re-emite solo cuando ese contexto cambia.

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "data": {
  "address": "0x<addr>", "asset_id": 0, "leverage": 7, "margin_mode": "isolated",
  "max_trade_size": "5000000000", "has_position": true } }
```

- `margin_mode` ∈ `cross` / `isolated` / `strict_iso`; `max_trade_size` es el límite de tamaño derivado del tope de OI (string de lotes crudos); los campos son idénticos a la lectura REST [`active_asset_data`](../rest/info.md).

En el `/hl/ws` del gateway (compatible con HL), el nombre de canal equivalente es `activeAssetData` de HL, y la trama se traduce a la forma camelCase de HL:

```json
{ "channel": "activeAssetData", "data": {
  "user": "0x<address>", "coin": "BTC", "leverage": 7,
  "maxTradeSzs": ["5.0", "5.0"], "availableToTrade": ["35000.00", "35000.00"] } }
```

- `user` — la dirección 0x de la cuenta; `coin` — el símbolo del mercado.
- `maxTradeSzs` — `[compra, venta]`: el **tamaño** máximo negociable en cada lado (unidades base), como strings decimales.
- `availableToTrade` — `[compra, venta]`: el nocional en **USD** disponible para operar en cada lado, como strings decimales.

### `account_state`

Estado del clearing **PERP** por cuenta — el resumen de margen, las posiciones abiertas y los saldos de una cuenta — publicado cuando cambia. Requiere `user` (la dirección 0x; también se acepta `address`) — NO un `coin`. El cuerpo se construye a partir del mismo generador de registros que la lectura REST de cuenta enfocada, por lo que un push WS nunca difiere de esa lectura. El snapshot inicial es el estado en vivo (en cero para una cuenta sin fondos), no un array vacío.

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

- Los escalares de margen (`account_value` / `free_collateral` / `maint_margin` / `init_margin` / `health`) son strings decimales en **USDC entero**, idénticos a los `MarginScalars` de la lectura REST de cuenta; `tier` es el índice de nivel de liquidación, `mode` el modo predeterminado de la cuenta, `pm_enabled` indica si el margen de cartera está activo.
- `positions[]` — una entrada por posición de contrato perpetuo abierta: `asset` (id numérico), `size` (string con signo en plano 1e8), `entry` / `upnl` (USDC entero), `isolated`, `lev` y `side` (`long` / `short`, presente en modo cobertura).
- `balances` — `{usdc, spot}`: `usdc` es la garantía en cotización (USDC entero); `spot` mapea token → `{total, hold}`.

Frecuencia: impulsada por cambios — una trama se envía solo cuando el estado de la cuenta ha cambiado realmente desde el último commit; una cuenta sin cambios no emite nada en ese commit.

:::warning
`account_state` contiene datos por cuenta pero actualmente **no tiene autenticación** — cualquier conexión puede suscribirse a cualquier dirección. No lo trate como privado hasta que se implemente la compuerta de autenticación en la suscripción.
:::

### `spot_state`

Estado del clearing **SPOT** por cuenta — los saldos spot por token para una cuenta — publicado cuando cambian. Requiere `user`. El snapshot inicial es el conjunto de saldos en vivo (`[]` para una cuenta sin tenencias spot).

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

- `balances[]` — una entrada por token spot en tenencia: `asset` (id numérico), `name` (símbolo del token), `total` (string decimal en token entero), `hold` (importe reservado por órdenes spot en reposo). Idéntico a la lectura REST de saldos spot.

Frecuencia: impulsada por cambios — una trama se envía solo cuando los saldos spot han cambiado realmente desde el último commit; una cuenta sin cambios no emite nada en ese commit.

### `web_data2`

Snapshot **compuesto** "todo para el frontend" por cuenta — el resumen del clearing de contratos perpetuos, saldos spot, órdenes abiertas, valores de vault y el estado global del exchange para una cuenta, todo en una sola trama, publicado cuando cambia. Requiere `user` (la dirección 0x; también se acepta `address`) — NO un `coin`. El cuerpo es byte a byte idéntico al compuesto que devuelve la lectura REST [`web_data2`](../rest/info.md#web_data2) (compone los mismos sub-lectores), por lo que un push WS nunca difiere de esa lectura. El snapshot inicial es el compuesto en vivo (valores predeterminados en cero cuando la cuenta no tiene fondos / posiciones / órdenes), no un array vacío.

```json
{ "method": "subscribe", "subscription": { "type": "web_data2", "user": "0x<address>" } }
```

```json
{
  "channel": "web_data2",
  "data": {
    "address": "0x<addr>",
    "clearinghouse": {
      "account_value": "10000",
      "margin_used": "300",
      "positions": [
        { "asset": 0, "size": "600", "entry_ntl": "2500", "mode": "cross", "lev": 10 }
      ]
    },
    "spot_balances": [
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ],
    "open_orders": [
      { "oid": 42, "market_id": 0, "side": "bid", "px": "6700000000000", "size": "10000000",
        "tif": "gtc", "cloid": "0xab..", "trigger": null, "inserted_at_ms": 1735689600123 }
    ],
    "vault_equities": [
      { "vault_id": 1, "vault_address": "0x<vault>", "shares": "1000", "equity": "1050" }
    ],
    "exchange_status": {
      "spot_disabled": false,
      "post_only_until_time_ms": 0,
      "post_only_until_height": 0,
      "scheduled_freeze_height": null,
      "mip3_enabled": true,
      "frozen": false,
      "replay_complete": true
    }
  }
}
```

El compuesto contiene exactamente estas secciones (cada una compuesta desde el sub-lector correspondiente, por lo que las formas nunca difieren de las lecturas independientes):

- `address` — la dirección 0x canónica en minúsculas a la que está asociada la trama.
- `clearinghouse` — el resumen de la cuenta de perpetuos: `account_value` (valor de cuenta cruzada, string decimal en USDC entero), `margin_used` (Σ margen de mantenimiento por activo utilizado, USDC entero) y `positions[]`. Cada fila de posición es `{asset, size, entry_ntl, mode, lev}`: `asset` es el id numérico de mercado, `size` es el string de tamaño con signo en el plano 1e8 (una fila por tramo distinto de cero, por lo que una cuenta en modo cobertura reporta ambos tramos), `entry_ntl` es USDC entero, `mode` ∈ `cross` / `isolated` / `strict_iso`, `lev` es el apalancamiento máximo de la posición. Los tramos con tamaño cero se omiten.
- `spot_balances` — el array `balances` de [`spot_state`](#spot_state) / REST `spot_clearinghouse_state`: una entrada por token spot en tenencia, `{asset, name, total, hold}`.
- `open_orders` — el array `orders` de REST `frontend_open_orders`: una entrada por orden en reposo **y** por TP/SL aparcado / disparador de stop, `{oid, market_id, side, px, size, tif, cloid, trigger, inserted_at_ms}`. `side` ∈ `bid` / `ask`; `px` / `size` son strings decimales en el plano 1e8; `tif` ∈ `alo` / `ioc` / `gtc` (o `trigger` para un stop aparcado fuera del libro); `cloid` es el id de orden del cliente o `null`; `trigger` es `null` para una orden de libro normal, de lo contrario `{trigger_px, trigger_above}` (los stops aparcados también llevan `is_parked: true`).
- `vault_equities` — el array `equities` de REST `user_vault_equities`: una entrada por vault en el que la cuenta tiene participaciones, `{vault_id, vault_address, shares, equity}` (`equity` es USDC entero, `shares` es un string de entero crudo). Vacío cuando la cuenta no sigue ningún vault.
- `exchange_status` — los escalares de estado de negociación global (mismo cuerpo que REST `exchange_status`): `{spot_disabled, post_only_until_time_ms, post_only_until_height, scheduled_freeze_height, mip3_enabled, frozen, replay_complete}`. Este bloque es idéntico para todos los suscriptores en un commit dado.

Frecuencia: impulsada por cambios — una trama se envía solo cuando el compuesto ha cambiado realmente desde el último commit; un commit que deja el compuesto de esta cuenta intacto no emite nada.

:::warning
`web_data2` contiene datos por cuenta pero actualmente **no tiene autenticación** — cualquier conexión puede suscribirse a cualquier dirección. No lo trate como privado hasta que se implemente la compuerta de autenticación en la suscripción; para lecturas autenticadas use `post` con una acción firmada.
:::

---

## `post` — solicitud/respuesta sobre WS

No es un canal de suscripción, sino la forma de realizar lecturas puntuales y escrituras firmadas sobre el mismo socket. El `request` es el mismo envoltorio `{type, payload}` que las rutas REST; se despacha a través de los manejadores idénticos (`POST /info`, `POST /exchange`). Consulte [`post` en el README de WS](./index.md#post-requestresponse-over-ws) para conocer las formas completas de solicitud/respuesta y las reglas de firma.

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

Esta es la ruta soportada para lecturas autenticadas y para enviar acciones firmadas sobre WS hoy en día.

---

## Hoja de ruta — no disponible aún

Los siguientes canales aparecieron en borradores anteriores pero **no están implementados** en la superficie WS del nodo. No son nombres de canal reconocidos; suscribirse a ellos devuelve un error `unknown channel`. Se listan aquí para que los integradores no se confundan con stubs de SDK más antiguos.

- **Datos de mercado públicos:** `meta` (metadatos del universo), `mark` (precio mark/oracle), `fundingTicks` (actualizaciones de tasa de financiación).
- **Por usuario (requeriría autenticación):** `vaultEvents`, `rfqEvents`.

Tampoco están implementados hoy:

- **`l2_book` basado en diffs** (tramas de `updates` parciales) — el `l2_book` actual siempre envía cuerpos completos de los 20 mejores niveles. La trama sí lleva un indicador `is_snapshot` (`true` en el snapshot inicial, `false` en los pushes impulsados por cambios), pero todos los cuerpos son snapshots completos — no existen tramas de `updates` de diff parcial.
- **`seq` / `resume` / tokens de reanudación** — cada (re)suscripción comienza desde un snapshot nuevo.
- **Envoltorio de autenticación en la suscripción** para canales privados — use `post` con una acción firmada para operaciones autenticadas.

---

## Orden y entrega

- **Por suscripción**, las tramas llegan en orden de commit (una trama se emite solo en los commits donde el estado del canal observado cambió). No hay `seq`; el orden es implícito en el orden de llegada sobre el socket único.
- **Entre suscripciones**, no hay garantía de orden — la intercalación es arbitraria. Desmultiplexe sobre `channel` + el `coin` dentro de `data`.
- La entrega es **como máximo una vez por cambio** y **no se almacena en búfer para reanudación**: una suscripción que se quede más de 256 tramas por detrás es descartada con una trama de error `lagged` (consulte [Contrapresión y lag](./index.md#backpressure--lag)). Vuelva a suscribirse para recuperarse; recibirá un snapshot nuevo.

## Véase también

- [README de WS](./index.md) — ciclo de vida de la conexión, tramas, parámetro coin, `post`, contrapresión
- [`POST /info`](../rest/info.md) — equivalentes REST para lecturas puntuales (también accesibles vía `post`)
- [`POST /exchange`](../rest/exchange.md) — envoltorio de acción firmada compartido por la ruta de acción `post`
