---
description: El CLOB de spot en vivo — intercambios token por token con escrow de saldo reservado, sin apalancamiento.
---

# Trading spot

:::tip
**En producción.** El trading spot básico está disponible — un libro de órdenes token por token, independiente
de los perps, sin apalancamiento y sin posiciones. (El spot con apalancamiento es la
pista separada y planificada de [spot-margin](./spot-margin.md).)
:::

:::info
**El spot sin apalancamiento es compatible con la Sharia.** Entre los productos de MetaFlux,
únicamente el trading spot **sin apalancamiento** — comprar y vender activos directamente a su
valor completo, **sin apalancamiento, sin margen, sin préstamos y sin financiación** — se
considera generalmente compatible con los principios de las finanzas islámicas (Sharia). No
interprete "spot" en términos generales como compatible: solo la modalidad sin apalancamiento lo es. Los
productos no compatibles incluyen explícitamente el **spot margin (spot con apalancamiento)**,
así como los contratos perpetuos y cualquier otro producto apalancado, derivado o
que implique préstamos. El apalancamiento y los préstamos introducen intereses (riba), y
la especulación e incertidumbre resultantes introducen gharar y maysir — por lo tanto, estos productos
generalmente NO son compatibles con la Sharia. Los usuarios musulmanes deben operar en consecuencia y consultar
a sus propios eruditos. Esto es información, no asesoramiento religioso ni financiero.
:::

## Resumen

Spot es un **libro de órdenes central de límite token por token**: intercambias un token por
otro al precio que elijas. Está completamente separado de los perps — libros independientes,
saldos independientes, **sin apalancamiento y sin posiciones**. Solo operas con lo que posees.
Una orden spot en reposo bloquea los fondos que adeuda al ejecutarse en un
**saldo reservado** (escrow); esos fondos se pagan a la contraparte al ejecutarse la orden,
o se te devuelven al cancelarla.

Una orden spot es simplemente otra acción de [`/exchange`](../api/rest/exchange.md) —
[`spot_order`](../api/rest/exchange.md#spot_order) para colocar,
[`spot_cancel`](../api/rest/exchange.md#spot_cancel) para cancelar. Ambas están
**autorizadas por el emisor** (el firmante recuperado es el trader; no existe campo `owner`)
y pueden ser firmadas por la cuenta principal o un
[agente wallet](../concepts/agent-wallets.md) activo.

## Qué es un par spot

Un par spot intercambia un token **base** contra un token **cotización** (p. ej. `B/Q`). El
lado de la orden define la dirección:

| `side` | Entregas | Recibes | Escrow bloqueado en reposo |
|--------|----------|---------|---------------------------|
| `bid` (compra) | cotización | base | **cotización** — nocional al precio límite |
| `ask` (venta) | base | cotización | **base** — la base que estás ofreciendo |

El campo de la orden es el **id del par spot** (`pair`), que es distinto de un id de
`market` de perp y de un id de token. Los pares se despliegan bajo
[MIP-1](../mip/mip-1.md) (estándar de token spot + despliegue de mercado); cada uno tiene sus
propios tokens base/cotización, decimales de tamaño, nocional mínimo opcional y
anulaciones de comisiones.

## Escrow de saldo reservado

Este es el núcleo de cómo el spot mantiene la solvencia sin apalancamiento. Cuando una orden `gtc` / `alo`
(o el residuo no cruzado de una) **reposa** en el libro, el protocolo
mueve los fondos que adeuda al ejecutarse completamente desde tu saldo disponible hacia un
**saldo reservado**:

- Una **bid** en reposo reserva **cotización** equivalente a su nocional al precio límite
  (`size × limit_px`).
- Una **ask** en reposo reserva la **base** que ofrece.

Los fondos reservados no son gastables. Son:

- **pagados a la contraparte** cuando la orden se ejecuta,
- **devueltos a tu saldo disponible** al [cancelar](#lifecycle--cancel-refunds-escrow),
  por prevención de auto-operación, o si el mercado se desactiva.

Los saldos por token se conservan exactamente en cada evento de reposo, ejecución, cancelación y
STP — el disponible más el reservado es invariante por token por cuenta (verificado con
fuzzing sobre flujos aleatorizados de reposo/cruce/cancelación).

## Ajuste por asequibilidad

Nunca puedes reposar ni ejecutar más de lo que puedes financiar. En la admisión, el tamaño de la orden se
**ajusta** a lo que cubre tu saldo:

- una **bid** se ajusta por `quote_balance ÷ limit_px`,
- una **ask** se ajusta por la base que realmente posees.

Una orden completamente inasequible es una **no-operación aceptada** — nada se ejecuta,
nada reposa, no se consume ningún id de orden. Una orden parcialmente asequible opera/reposa
la porción asequible. Dado que el ajuste se ejecuta **antes** del emparejamiento, cada
ejecución resultante y cada reserva de escrow están financiadas; no hay descarte de ejecución post-emparejamiento.

## Emparejamiento, ejecuciones y comisiones

El emparejamiento spot utiliza el mismo CLOB de precio-tiempo que el resto de MetaFlux. Una ejecución intercambia
base por cotización al **precio en reposo del maker**.

Las comisiones se cobran **de la pata que cada lado recibe**:

- la comisión del **taker** se toma de la pata que recibe el taker,
- la comisión del **maker** se toma de la pata que recibe el maker.

Así, un comprador (que recibe base) paga su comisión en base; un vendedor (que recibe cotización) paga
su comisión en cotización. Las comisiones se acumulan en una cuenta de comisiones spot dedicada, separada del
pool de comisiones de perp.

| Lado | Comisión cobrada de | Tasa |
|------|---------------------|------|
| **Taker** | la pata que recibes (comprador → base, vendedor → cotización) | `taker_fee_bps` del par, o bien el valor global spot predeterminado |
| **Maker** | la pata que recibes | `maker_fee_bps` del par, o bien el valor global spot predeterminado |

Las comisiones spot son **por par**: un par puede establecer sus propios `taker_fee_bps` /
`maker_fee_bps`, y cuando no están configurados se aplica el valor global spot predeterminado. Spot utiliza una tasa
fija por par — los niveles de volumen perp / rebate de maker / staking **no** aplican al
spot. Consulta los valores en tiempo real en la respuesta de [`/info fee_schedule`](../api/rest/info.md#fee_schedule);
consulta [comisiones](../concepts/fees.md#spot-fees) para el modelo de liquidación.

## Tiempo de vigencia (TIF)

Las órdenes spot tienen el mismo conjunto de TIF que los perps, con una regla específica para spot:

| `tif` | Comportamiento en spot |
|-------|------------------------|
| `gtc` | Cruza lo que puede; cualquier residual **reposa** (respaldado por escrow) hasta ejecutarse o cancelarse |
| `alo` | Solo agrega liquidez; una `alo` que cruza es **rechazada** (nunca toma). Una `alo` que no cruza reposa |
| `ioc` | Cruza lo que puede de inmediato; el residual se descarta — **nunca reposa**, nunca genera escrow |

`aon` es rechazado (sin equivalente en el núcleo). La prevención de auto-operación utiliza el mismo
conjunto de [`stp_mode`](../concepts/order-types.md) que los perps (`cancel_oldest` / `cancel_newest` /
`cancel_both`); `reject` no está soportado.

:::info
**Solo órdenes límite (por ahora).** Cada orden spot debe llevar un `limit_px` positivo. Una
orden de mercado (`limit_px = 0`) **aún no está soportada** — una compra de mercado sin límite
requiere un ajuste de asequibilidad por recorrido del libro que aún está en la hoja de ruta. Envía una orden límite;
el coste queda entonces acotado por `limit_px × size`.
:::

## Ciclo de vida — la cancelación devuelve el escrow

[`spot_cancel`](../api/rest/exchange.md#spot_cancel) retira una de **tus**
órdenes en reposo por `oid` en un par y devuelve el escrow bloqueado a tu saldo disponible.

- **Solo el propietario.** Solo el propietario de la orden puede cancelarla; un tercero es rechazado
  (`not the order owner`).
- **Fallo tipado.** Un `oid` desconocido o ya eliminado devuelve `order not found`
  (inofensivo).
- **Siempre disponible.** Las cancelaciones **no** están bloqueadas por la suspensión spot — incluso cuando
  las nuevas órdenes están desactivadas, siempre puedes salir de una orden en reposo y recuperar su
  escrow.

## Límites y gobernanza

- **Límite de órdenes en reposo.** Cada cuenta puede tener hasta **1000** órdenes en reposo por par spot;
  una nueva orden en reposo que supere el límite es rechazada (`spot resting-order cap
  reached — cancel some orders first`). Las cuentas de market maker reconocidas están
  exentas. Las órdenes `ioc` nunca reposan, por lo que nunca están sujetas al límite.
- **Nocional mínimo.** Un par puede establecer un nocional mínimo; una orden por debajo de él es
  rechazada.
- **Suspensión spot (gobernanza).** El trading spot puede ser habilitado o deshabilitado globalmente por
  la gobernanza. Cuando está deshabilitado, las **nuevas** órdenes son rechazadas (`spot trading
  disabled`), pero las cancelaciones siguen funcionando para que el escrow en reposo nunca quede bloqueado.

## Consultar el estado spot

Los saldos spot y las órdenes spot abiertas se pueden consultar mediante
[`POST /info`](../api/rest/info.md). Un `spot_order` devuelve un estado **síncrono**
por orden una vez que se confirma — el `oid` real asignado con una entrada `resting` o
`filled` (o `error`), o `pending` si no se confirma ningún commit dentro de la
ventana de espera de orden — la misma unión de estado que el perp
[`submit_order`](../api/rest/exchange.md#submit_order).

## Relación con spot-margin y Earn

El spot básico es la **base**: opera solo con lo que posees, sin apalancamiento, sin
liquidación. Dos capas planificadas se construyen sobre él:

- [**Spot margin**](./spot-margin.md) (planificado) — toma prestada cotización contra colateral
  para comprar spot con apalancamiento, con un margen de mantenimiento y un precio de liquidación.
- [**Earn**](../concepts/earn.md) (planificado) — un pool de préstamos USDC que financia los
  préstamos de spot-margin y genera intereses como rendimiento.

Ambas son **capas opcionales**; el spot básico no se ve afectado por ellas.

## Ver también

- [`spot_order`](../api/rest/exchange.md#spot_order) / [`spot_cancel`](../api/rest/exchange.md#spot_cancel) — las acciones wire y las tablas de campos
- [Tipos de orden](../concepts/order-types.md) — semántica de TIF y STP compartida con perps
- [Comisiones](../concepts/fees.md#spot-fees) — el esquema de comisiones spot y el cobro en la pata recibida
- [Spot margin](./spot-margin.md) — la pista de spot con apalancamiento planificada
- [MIP-1](../mip/mip-1.md) — estándar de token spot y despliegue de mercado

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Necesito colateral o margen para operar en spot?**
R: No. Spot es solo de saldo — operas con lo que posees. No hay margen, no hay
apalancamiento y no hay liquidación. (El apalancamiento es la pista separada y planificada de
[spot-margin](./spot-margin.md).)

**P: ¿Qué ocurre con mis fondos cuando mi orden está en reposo?**
R: Se mantienen en un saldo reservado (escrow) — no son gastables, pero son tuyos. Se
pagan a la contraparte al ejecutarse, o regresan a tu saldo disponible al cancelar.

**P: ¿Por qué mi gran compra solo se ejecutó o reposó parcialmente?**
R: Ajuste por asequibilidad. El tamaño de la orden se reduce a lo que cubre tu saldo de cotización
al precio límite. Una orden completamente inasequible es una no-operación aceptada.

**P: ¿Puedo colocar una orden de mercado spot?**
R: Todavía no — siempre envía un `limit_px` positivo. Las órdenes de mercado spot están en la
hoja de ruta.

**P: ¿Las ejecuciones spot y las ejecuciones perp están en el mismo libro?**
R: No. Spot tiene sus propios libros, saldos y cuenta de comisiones, completamente separados de
los perps.

</details>
