---
description: "Consultas de lectura POST /info para mercados spot, margen spot apalancado y el pool de préstamos Earn."
---

# `POST /info` — consultas de spot y margen

Consultas de lectura para mercados [spot](../../../products/spot.md), [margen spot](../../../products/spot-margin.md) apalancado, y el pool [Earn](../../../concepts/earn.md). Mismo endpoint `POST /info` y estructura que la [página base](../info.md).

## Tipos de consulta para spot, margen spot y Earn

### `spot_meta`

Universo de pares spot más registro por token. Sin parámetros.

```json
{ "type": "spot_meta" }
```

Respuesta:

```json
{
  "type": "spot_meta",
  "data": {
    "pairs": [
      { "id": 100, "name": "USDC", "base": 100, "quote": 100, "taker_fee_bps": 0, "min_notional": "0", "active": true },
      { "id": 101, "name": "BTC",  "base": 101, "quote": 101, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 104, "name": "MTF",  "base": 104, "quote": 104, "taker_fee_bps": 0, "min_notional": "0", "active": false },
      { "id": 110, "name": "BTC/USDC", "base": 101, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true },
      { "id": 113, "name": "MTF/USDC", "base": 104, "quote": 100, "taker_fee_bps": 5, "min_notional": "100", "active": true }
    ],
    "tokens": [
      { "id": 100, "name": "USDC", "sz_decimals": 2, "wei_decimals": 6 },
      { "id": 101, "name": "BTC",  "sz_decimals": 5, "wei_decimals": 8 },
      { "id": 102, "name": "ETH",  "sz_decimals": 4, "wei_decimals": 18 },
      { "id": 103, "name": "SOL",  "sz_decimals": 2, "wei_decimals": 9 },
      { "id": 104, "name": "MTF",  "sz_decimals": 2, "wei_decimals": 8 }
    ]
  }
}
```

:::info
**`pairs` contiene dos tipos de entrada.** Los "auto-pares" por token (`id` = id del token, `base == quote`, p. ej. `100`/USDC, `101`/BTC, …, `104`/MTF) son el registro de tokens proyectado como pares; los **pares realmente negociables** tienen ids `110+` (`BTC/USDC`=110, `ETH/USDC`=111, `SOL/USDC`=112, `MTF/USDC`=113) con `base`/`quote` distintos y `active:true`. El campo `active` de un auto-par indica si el libro de órdenes independiente de ese token está activo (solo USDC lo está, en Devnet).
:::

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `pairs[*].id` | uint32 | Id del par (`SpotPairSpec.pair_id`); `110+` = pares reales `BASE/USDC` |
| `pairs[*].name` | string | Nombre del par (p. ej. `"BTC/USDC"`) |
| `pairs[*].base` / `quote` | uint32 | Id del activo base / cotización (igual en auto-pares) |
| `pairs[*].taker_fee_bps` | uint16 | Comisión de tomador (bps); `0` si no está configurada |
| `pairs[*].min_notional` | decimal string | Nocional mínimo (centavos USDC); `"0"` si no está configurado |
| `pairs[*].active` | bool | Si el par está activo para operar |
| `tokens[*].id` | uint32 | Id del activo spot (`100`=USDC, `101`=BTC, `102`=ETH, `103`=SOL, `104`=MTF) |
| `tokens[*].name` | string | Nombre del token (p. ej. `"USDC"`, `"MTF"`) |
| `tokens[*].sz_decimals` | uint8 | Precisión de visualización / tamaño |
| `tokens[*].wei_decimals` | uint8 | Decimales nativos del token (estilo ERC-20) (USDC=6, BTC=8, ETH=18, SOL=9, MTF=8) |

`tokens` y `pairs` están en el orden confirmado de `BTreeMap` (por id de activo / par).

Fuente de estado: `Exchange.mip3_spot_pair_specs` (pares) + `Exchange.mip3_spot_token_specs` (tokens).

### `spot_clearinghouse_state`

Saldos de tokens spot por cuenta. Requerido: `address` (hex con prefijo 0x).

```json
{ "type": "spot_clearinghouse_state", "address": "0x<addr>" }
```

Respuesta:

```json
{
  "type": "spot_clearinghouse_state",
  "data": {
    "address": "0x<addr>",
    "balances": [ { "asset": 104, "name": "MTF", "total": "10", "hold": "0" } ]
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `balances[*].asset` | uint32 | Id del activo spot (`104` = MTF) |
| `balances[*].name` | string | Nombre del token / par, o `asset:<id>` si no se reconoce |
| `balances[*].total` | decimal string | Saldo total, truncado hacia cero |
| `balances[*].hold` | decimal string | Monto bloqueado en órdenes spot en espera (custodia); disponible = `total − hold` |

El conjunto de tokens es la unión de los saldos y las claves de custodia (`reserved`) de la cuenta — un token que está completamente bloqueado con cero disponible igualmente aparece. Se obtiene mediante un escaneo por rango por cuenta (no es un recorrido de tabla completo). Fuente de estado: `locus.spot_clearinghouse.{balances, reserved}` (ambos indexados por `(owner, asset)`).

### `spot_margin_state`

:::info
**Disponible en Devnet (vista previa).** Superficie de lectura para [margen spot](../../../products/spot-margin.md) apalancado; consulte la página de conceptos para conocer las advertencias de la vista previa.
:::

Todas las posiciones de margen spot mantenidas por una cuenta. Requerido: `user` (hex con prefijo 0x).

```json
{ "type": "spot_margin_state", "user": "0x<addr>" }
```

Respuesta:

```json
{
  "type": "spot_margin_state",
  "data": {
    "user": "0x<addr>",
    "accounts": [
      {
        "pair": 200,
        "collateral": "5",
        "borrowed": "20",
        "borrow_index_snapshot": "1",
        "base_held": "9.99",
        "current_debt": "22",
        "params": { "init_bps": 2000, "maint_bps": 1000 }
      }
    ]
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `accounts[*].pair` | uint32 | Id del par spot sobre el que está la posición |
| `accounts[*].collateral` | decimal string | Garantía de cotización aportada (reserva ante pérdidas) |
| `accounts[*].borrowed` | decimal string | **Principal** del préstamo pendiente (al índice del snapshot) |
| `accounts[*].borrow_index_snapshot` | decimal string | Índice de préstamo del pool capturado al abrir (base para el devengo de deuda) |
| `accounts[*].base_held` | decimal string | Base segregada comprada con apalancamiento (no incluida en los saldos disponibles) |
| `accounts[*].current_debt` | decimal string | Deuda acumulada hasta ahora: `borrowed × (pool_index / snapshot)` |
| `accounts[*].params` | object \| null | `{ init_bps, maint_bps }` por par; `null` = margen no habilitado / sin calibrar para el par |

Las posiciones se listan en orden de id de par. Una cuenta sin posiciones devuelve un array `accounts` vacío.

### `earn_state`

:::info
**Disponible en Devnet (vista previa).** Superficie de lectura para los pools de préstamos [Earn](../../../concepts/earn.md); consulte la página de conceptos para conocer las advertencias de la vista previa.
:::

Todos los pools de préstamos Earn, más la participación de una cuenta cuando se proporciona `user`. Opcional: `user` (hex con prefijo 0x).

```json
{ "type": "earn_state", "user": "0x<addr>" }
```

Respuesta:

```json
{
  "type": "earn_state",
  "data": {
    "pools": [
      {
        "asset": 100,
        "total_supplied": "1000",
        "total_borrowed": "20",
        "idle": "980",
        "shares_total": "1000",
        "share_value": "1",
        "borrow_index": "1",
        "reserve_factor_bps": 1000,
        "borrow_rate_bps_annual": 0,
        "reserve_accrued": "0",
        "user_shares": "100",
        "user_value": "100"
      }
    ]
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `pools[*].asset` | uint32 | Id del activo de cotización prestable (clave del pool) |
| `pools[*].total_supplied` | decimal string | VAN del pool — principal aportado más intereses reembolsados incorporados |
| `pools[*].total_borrowed` | decimal string | Cotización actualmente prestada a tomadores de margen spot |
| `pools[*].idle` | decimal string | `total_supplied − total_borrowed` — límite retirable de forma inmediata |
| `pools[*].shares_total` | decimal string | Total de participaciones en circulación |
| `pools[*].share_value` | decimal string | `total_supplied / shares_total` (`0` cuando no hay participaciones) |
| `pools[*].borrow_index` | decimal string | Índice de préstamo acumulado (base para el devengo de deuda) |
| `pools[*].reserve_factor_bps` | uint16 | Porción del protocolo sobre el interés de préstamos (bps) |
| `pools[*].borrow_rate_bps_annual` | uint32 | Tasa de préstamo anualizada (bps) |
| `pools[*].reserve_accrued` | decimal string | Reserva del protocolo acumulada a partir de intereses |
| `pools[*].user_shares` | decimal string | **Solo con `user`** — participaciones que la cuenta tiene en el pool |
| `pools[*].user_value` | decimal string | **Solo con `user`** — `user_shares × share_value` |

Los pools se listan en orden de id de activo. Si se omite `user`, los campos `user_shares` / `user_value` no aparecen.

### `spot_deploy_state`

Estado de la subasta de gas para el despliegue de pares spot según MIP-1. Sin parámetros.

```json
{ "type": "spot_deploy_state" }
```

Respuesta:

```json
{
  "type": "spot_deploy_state",
  "data": {
    "auction_round": 3, "current_bid": "999", "current_winner": "0x<bidder>",
    "auction_end_ms": 0, "started_at_ms": 0, "total_burned": "4200", "deposit": "0"
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `auction_round` | uint64 | Ronda actual |
| `current_bid` | decimal string | Oferta líder |
| `current_winner` | hex address \| null | Mejor postor actual |
| `auction_end_ms` / `started_at_ms` | uint64 | Ventana de la subasta (ms de consenso) |
| `total_burned` | decimal string | Nocional acumulado quemado de las ofertas ganadoras |
| `deposit` | decimal string | Depósito total en custodia (unidades base) |

Fuente de estado: `Exchange.spot_pair_deploy_gas_auction`.


## Véase también

- [`POST /info`](../info.md) — el endpoint base de lectura (estructura, convenciones, consultas de cuenta e infraestructura)
- [Consultas de perpetuos](./perpetuals.md) — lecturas del mercado de contratos perpetuos
- [Spot](../../../products/spot.md) / [Margen spot](../../../products/spot-margin.md) — los productos
