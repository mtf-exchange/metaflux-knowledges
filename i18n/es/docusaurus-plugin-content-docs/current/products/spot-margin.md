# Margen spot

:::info
**Disponible en devnet (vista previa).** Operativa spot apalancada financiada por
el pool de préstamos [Earn](../concepts/earn.md). El [spot sin margen](./spot.md) funciona solo con saldo disponible
(sin apalancamiento); el margen spot es la capa adicional que permite tomar préstamos y operar con apalancamiento.
El ciclo completo de depósito → préstamo → compra apalancada → cierre Y la
[liquidación forzosa](#liquidation) automática funcionan de principio a fin en **devnet hoy** (consulta la
[superficie de acción](#action-surface) más abajo). Trátalo como una **vista previa**: los
**ratios de mantenimiento por par son parámetros de gobernanza que aún están siendo calibrados**.
El apalancamiento funciona en devnet; no des por supuesta su seguridad en producción a escala.
:::

## En resumen

El margen spot te permite **pedir prestado USDC (quote) contra tu colateral para comprar spot con apalancamiento**, en lugar de pagar el 100% por adelantado. El USDC prestado proviene del pool [Earn](../concepts/earn.md), pagas **intereses** sobre él, y la posición tiene un **margen de mantenimiento** y un **precio de liquidación** al igual que un contrato perpetuo.

En la primera versión, el margen spot es **aislado por par** — cada posición spot apalancada publica su propio margen y se liquida de forma independiente, separada de tu cuenta de margen cruzado en perpetuos.

## Cómo funciona

```
1. Post collateral (USDC) for the pair — a pure loss buffer.
2. Borrow quote from the Earn pool; the borrow funds the buy 100%.
3. IOC-buy the base asset on the spot book with the borrowed quote.
   The bought base is held SEGREGATED on the margin account.
4. Pay borrow interest continuously while the loan is open.
5. Close: sell the base, repay borrow + accrued interest, keep the remainder.
```

El colateral **no** financia la compra — lo hace el préstamo. El colateral es el
amortiguador de pérdidas que hace que la posición sea sobrecolateralizable, de modo que el apalancamiento ≈
`notional / collateral`. El activo base comprado se mantiene en una cuenta
**segregada** del margen, sin mezclarse con tus saldos spot disponibles, de forma que
un cierre (o una liquidación posterior) afecta exclusivamente a esa posición. La primera versión
permite **una posición abierta por `(account, pair)`** (sin adiciones); el IOC de apertura
**reembolsa de inmediato cualquier préstamo no utilizado**, por lo que el préstamo vivo equivale únicamente a lo que
la compra realmente consumió.

### Superficie de acción

Las seis acciones de [`/exchange`](../api/rest/exchange.md#spot-margin--earn) (todas
autorizadas por el remitente) controlan el ciclo. Confirma el estado comprometido a través de
[`/info` `spot_margin_state`](../api/rest/info/spot.md#spot_margin_state).

| Acción | Efecto |
|---|---|
| [`spot_margin_deposit`](../api/rest/exchange.md#spot_margin_deposit) | Depositar colateral en quote para el par (el margen debe estar habilitado) |
| [`spot_margin_open`](../api/rest/exchange.md#spot_margin_open) | Pedir prestado + comprar base con IOC apalancado; requiere cumplir el requisito de margen inicial |
| [`spot_margin_close`](../api/rest/exchange.md#spot_margin_close) | Vender el base retenido con IOC, reembolsar principal + intereses y devolver el remanente |
| [`spot_margin_withdraw`](../api/rest/exchange.md#spot_margin_withdraw) | Retirar el colateral libre (total si sin posición; restringido por el margen inicial mientras esté abierta) |

### Margen

```
position_value   = base_held × mark_px
debt             = borrowed + accrued_interest
equity           = position_value − debt
init_required    = position_value × spot_margin_initial_bps / 10000
maint_required   = position_value × spot_margin_maintenance_bps / 10000
health           = equity / maint_required
```

Una apertura se rechaza si dejaría `equity < init_required`. La posición se liquida cuando `health < 1` (el patrimonio cae al umbral de mantenimiento).

El **ratio de mantenimiento spot es un parámetro por par, fijado de forma conservadora** — y
generalmente superior al de un perpetuo de liquidez comparable. El motivo es mecánico: una
liquidación de margen spot **vende el activo base en el libro spot**, por lo que el buffer de mantenimiento
debe cubrir el **deslizamiento** realizado al deshacer la posición en el
umbral, o el pool de préstamos absorbe el déficit. Los libros más delgados (activos de cola larga)
generan mayor deslizamiento y por tanto requieren un ratio más alto. El valor exacto por par
**se calibra a partir de la profundidad del libro y la volatilidad de ese par frente a un límite de
deslizamiento de liquidación objetivo** — es un parámetro de riesgo fijado por gobernanza, no una
constante fija, y un par no habilita el margen spot hasta que su ratio esté calibrado.
**En devnet estos ratios por par aún están siendo calibrados** — un par sin
parámetros de riesgo calibrados rechaza toda acción de margen spot sobre él
(`spot margin not enabled for pair`).

### Intereses

El USDC prestado acumula intereses a una tasa por par (`spot_borrow_rate_bps`, anualizada, devengada en cada bloque). Los intereses fluyen al pool [Earn](../concepts/earn.md), incrementando el valor por participación — ese es el rendimiento para los prestamistas. En la primera versión la tasa es **fija**; una curva basada en la utilización es una mejora posterior.

### Liquidación

**Activa en devnet.** En cada bloque, la cadena revalúa cada cuenta de margen al
precio mark spot del par (el precio de la última operación en el libro) y cierra forzosamente
cualquier cuenta cuyo patrimonio haya caído por debajo del umbral de mantenimiento:

```
liquidate when   collateral + base_held × mark − debt  <  base_held × mark × maint_bps / 10⁴
```

El cierre forzoso sigue **la misma ruta liquidada que un cierre voluntario**
— el base retenido se vende con IOC en el libro spot, el pool Earn recibe el
principal + intereses, el remanente (menos una pequeña **comisión de liquidación**, que
capitaliza el fondo de seguro del protocolo) se devuelve y la cuenta se cierra.
Dos propiedades anticascada reflejan el [cierre forzoso de perpetuos](../concepts/tiered-liquidation.md#how-a-forced-close-executes-the-price-floor):

- **Piso de precio.** La venta forzosa es una orden LIMIT con límite en
  `mark × (1 − floor)` (por defecto: la mitad del ratio de mantenimiento, configurable por par).
  Un libro delgado nunca se barre — lo que no pueda venderse por encima del
  piso permanece retenido y se reevalúa en el siguiente bloque.
- **Los rellenos parciales mantienen la cuenta abierta.** Los ingresos realizados reembolsan la deuda
  de inmediato; el base no vendido se reintenta cuando retorna la liquidez.

Una quiebra se liquida contra el **colateral aislado de la propia posición** y el
pool Earn — nunca alcanza tu cuenta de margen cruzado en perpetuos.

**Gestión del déficit.** Cuando un desenrollamiento completo no puede cubrir la deuda (los ingresos +
el colateral son insuficientes), el principal completo del préstamo igualmente sale del libro
de préstamos del pool y el **déficit se socializa entre los proveedores de Earn** — el
total suministrado del pool se reduce (con suelo en cero), lo que baja el valor por participación.
El ratio de mantenimiento conservador por par y el liquidador automático existen
para que ese déficit sea poco frecuente.

## Comisiones

Una posición de margen spot conlleva tres cargos diferenciados:

| Cargo | Cuándo | Tasa |
|---|---|---|
| **Comisión de trading** | en los rellenos IOC de apertura y cierre | la [tasa maker/taker spot](./spot.md#matching-fills-and-fees) del par (el margen spot opera en el libro spot) |
| **Interés por préstamo** | de forma continua, sobre el préstamo USDC pendiente | `spot_borrow_rate_bps` — por par, anualizado, devengado en cada bloque; fluye al pool [Earn](../concepts/earn.md) como rendimiento para el prestamista |
| **Comisión de liquidación** | solo en un cierre forzoso | una pequeña comisión por par que capitaliza el fondo de seguro del protocolo |

Las aperturas y cierres son rellenos IOC spot ordinarios, por lo que pagan el esquema de comisiones
**spot**, no los niveles de perpetuos. El interés por préstamo es el coste específico del margen spot
— es exactamente el rendimiento que reciben los proveedores de [Earn](../concepts/earn.md). Todas las tasas
son parámetros de gobernanza por par; consúltalas mediante
[`/info spot_margin_state`](../api/rest/info/spot.md#spot_margin_state) y el
[`fee_schedule`](../api/rest/info.md#fee_schedule) spot.

## Alcance del colateral

| Versión | Colateral | Radio de impacto de la liquidación |
|---|---|---|
| V1 | **Aislado por par** — cada posición publica su propio USDC | Solo esa posición |
| Posterior | Elegible para margen cruzado (comparte el colateral de la cuenta) | A nivel de cuenta |

El aislamiento por par mantiene acotada la primera versión: una quiebra en spot apalancado no puede alcanzar tu saldo de margen cruzado en perpetuos.

## Relación con Earn

Los prestatarios de margen spot son el **lado de la demanda**; los depositantes de [Earn](../concepts/earn.md) son el **lado de la oferta**. Los intereses por préstamo pagados por los operadores de margen spot son exactamente el rendimiento que reciben los depositantes de Earn. Consulta [Earn](../concepts/earn.md) para el cálculo del rendimiento.

## Véase también

- [Earn](../concepts/earn.md) — el pool de préstamos que financia los préstamos de margen spot, y cómo se calcula el rendimiento
- [Modos de margen](../concepts/margin-modes.md) — modelo de margen compartido con los perpetuos
- [Liquidación por niveles](../concepts/tiered-liquidation.md) — la escalera de liquidación + cascada de seguro

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Se ve afectado el spot normal (sin apalancamiento)?**
R: No. Comprar spot con el 100% de tu propio saldo funciona exactamente igual que antes — el margen spot es una capa adicional de suscripción voluntaria.

**P: ¿Puede una pérdida en mi margen spot afectar mi cuenta de perpetuos?**
R: No en la primera versión — el margen spot está aislado por par. El colateral cruzado es una mejora posterior y voluntaria.

**P: ¿De dónde proviene el USDC prestado?**
R: Del pool de préstamos [Earn](../concepts/earn.md). Los préstamos están limitados a la liquidez disponible (no prestada) del pool.

**P: ¿Qué tasa pago?**
R: Una tasa anualizada fija por par en la primera versión, devengada en cada bloque. El precio basado en la utilización llegará más adelante.

</details>
