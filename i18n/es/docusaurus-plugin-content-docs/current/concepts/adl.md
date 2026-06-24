# Desapalancamiento automático (ADL)

:::info
**Vista previa.** El nivel T4 se activa únicamente cuando el fondo de seguros no puede cubrir por completo un déficit de T3 — poco frecuente en condiciones normales, pero diseñado para ser determinista cuando ocurre.
:::

## Resumen rápido

Cuando el fondo de seguros no puede absorber una pérdida residual de liquidación, el protocolo recupera fondos de las contrapartes con beneficios en el mismo instrumento, de forma proporcional a su PnL no realizado. La asignación de MetaFlux utiliza un ranking de aprendizaje en línea orientado a minimizar el **recorte excesivo** (recorte más allá de lo que el déficit requiere).

## Cuándo se activa el ADL

La [escalera por niveles](./tiered-liquidation.md):

```
T0 tarjeta amarilla  →  T1 parcial  →  T2 completo  →  T3 respaldo  →  T4 ADL
```

T3 transfiere la posición de la cuenta en quiebra a un multisig de respaldo y paga con cargo al fondo de seguros. Si `insurance_pool < shortfall`, el protocolo pasa a T4: la pérdida no financiada restante se asigna como recorte de posición a las contrapartes rentables.

```
shortfall  =  liquidation_loss - insurance_pool_drawn
if shortfall > 0:
    fire_adl(asset, shortfall)
```

La reducción del fondo de seguros tiene su propia limitación de velocidad — consulte [liquidación por niveles](./tiered-liquidation.md#t3-backstop--netting-at-mark).

## Cómo se calcula el ADL

> **Lectura adicional:** "Autodeleveraging as Online Learning" (arXiv:2602.15182).

MTF **no** utiliza una puntuación de ranking única. El ADL se divide en dos subproblemas independientes: una decisión de **severidad** en 1-D (cuánto recortar en esta ronda) aprendida en línea, y una **asignación pro-rata** determinista (quién paga, según capacidad de PnL).

> ⚠️ **Corrección respecto al texto anterior.** La documentación anterior describía un *ranking* de aprendizaje en línea único con `score = α·pnl% + β·leverage + γ·age`. Eso **no** es el algoritmo implementado. El controlador real usa la severidad `θ ∈ [0,1]` mediante OGD proyectado + asignación pro-rata por capacidad. La fórmula de ranking `α/β/γ` fue descartada ("OGD 2D — explosión dimensional"). La cola clásica de `pnl% × leverage` es la línea base de HL que MTF reemplaza, no lo que MTF ejecuta.

### 1. Severidad — descenso de gradiente en línea 1-D sobre θ

Cada ronda elige un escalar `θ_t ∈ [0,1]` = la fracción del déficit de esta ronda que se va a recortar:

```
B_t          = θ_t · D_t                                  # presupuesto para esta ronda
θ_needed_t   = clamp(B̂_needed / D_t, 0, 1)                 # estimación ex-ante de lo que realmente se necesita
grad         = D_t · sign(θ_t − θ_needed_t)
θ_{t+1}      = clamp(θ_t − η · grad, 0, 1)                 # paso de OGD proyectado
```

`D_t` = déficit de la ronda, `B̂_needed` = estimación del estimador de precio de ejecución sobre la necesidad real.

**Tamaño de paso η** (`AdlController::current_eta`):
- El modo predeterminado es **Adaptativo** (paper Cor. 1): `η* = sqrt( (1 + 2·P_T^θ) / Σ D_t² )`, recalculado en cada ronda a partir de la telemetría acumulada (`path_variation`, `cumulative_squared_deficit`).
- En la primera ronda (`Σ D_t² == 0`) recurre al `η₀ = 0.01` configurable por gobernanza (`default_eta`).
- Un modo `Fixed(c)` fija `η = c` (interruptor de gobernanza / reproducibilidad).

El controlador tiene una **cota de arrepentimiento dinámico** (Prop 1):

```
Reg_T^dyn  ≤  sqrt( (1 + 2·P_T^θ) · Σ D_t² )
```

expuesta como `analytical_bound()`; `check_bound(slack)` verifica que el arrepentimiento empírico ≤ `slack · bound` (slack por defecto 4) en las pruebas de caos.

Todos los campos fraccionarios (`θ`, `η`, `path_variation`, …) son `rust_decimal::Decimal`; `sqrt` es una raíz cuadrada `Decimal` mediante Newton entero (sin `f64`); cada acumulador usa `saturating_*` (un `Decimal::from(u128 > MAX)` de otro modo causaría pánico y detendría el kernel). El estado persiste en el acumulador BOLE **slot 5**.

### 2. Asignación — pro-rata por capacidad determinista

Dado el presupuesto `B_t`, se distribuye entre las contrapartes rentables `W_t` (cada una con capacidad de recorte `u_i` = PnL no realizado susceptible de recorte, `u128`):

```
total_u = Σ u_i
x_i     = floor( u_i · B_t / total_u )      capped at u_i        # mul de 128 bits luego div de 128 bits
```

El **residuo** de la división entera `B_t − Σ x_i` se redistribuye una unidad a la vez en **orden ascendente de AccountId** a cualquier ganador con capacidad restante (`BTreeMap` itera en orden de clave → idéntico byte a byte entre nodos). Si `B_t > total_u`, la ronda está limitada por capacidad y `Σ x_i = total_u`.

Esto reemplaza los asignadores de descenso espejo vectorial e ILP descartados (el ILP es óptimo pero utiliza un solucionador no determinista — no se puede ejecutar on-chain).

**Por qué pro-rata** (replay de HL del 10 de octubre de 2025):

| Algoritmo | Objetivo total del 10 de octubre (menor es mejor) |
|-----------|----------------------------------------------------|
| HL producción (heurística ROE) | ~$45M de exceso |
| **MTF pro-rata** | **$3.40M** (~13× mejor) |
| Descenso espejo vectorial | $4.41M |
| ILP mín-máx (óptimo, solo off-chain) | $106k |

El pro-rata también ofrece **0 %** de violaciones de monotonicidad (frente al 11,4 % de HL) y estabilidad de ranking ≈ 1.0 (frente a 0,34 de HL).

### Cotización del precio ADL (lado de lectura)

El precompilado EVM `0x0902 adl_pro_rata_price` permite que un helper de Solidity *cotice* el VWAP de ejecución que generaría un ADL de tamaño N al recorrer la cola con prioridad apropiada según el lado (ADL largo: precio más alto primero; ADL corto: precio más bajo primero) — **todos los precios en el plano de punto fijo 1e8** (`price_e8`, `capacity_e8`). Es exclusivamente pro-rata; el OGD de severidad reside en el estado del núcleo, no en el precompilado sin estado (la severidad es una decisión por ronda; la cotización de precios se realiza en muchas llamadas/segundo).

## Qué significa el «recorte» mecánicamente

El recorte no es una transferencia de posición — el tamaño de posición de la contraparte **disminuye** y su PnL no realizado se convierte en una pérdida realizada. La posición del lado contrario de la cuenta en quiebra desaparece en la misma cantidad.

Concretamente: supongamos que la cuenta A está larga 1 BTC con entrada en 100 y la cuenta B está corta 1 BTC con entrada en 100, mark = 110.

- A tiene beneficios (+10 USDC no realizados).
- B es la cuenta en quiebra, liquidada; la posición se resuelve al mark 110 pero B solo tiene 5 USDC de patrimonio. Déficit de 5 USDC.
- Fondo de seguros: 0 (agotado).
- El ADL se activa contra A:
  - El largo de A se reduce a 0,5 BTC.
  - A realiza +5 USDC de PnL (la parte recortada).
  - El largo restante de 0,5 BTC de A tiene entrada 100, mark 110, +5 USDC no realizados.
  - El corto de B se cierra completamente.

A conserva el PnL no realizado en su posición restante; A solo pierde el PnL de la *porción cerrada*.

## Notificación

Los eventos ADL se emiten en el [canal WS `userEvents`](../api/ws/subscriptions.md#userevents):

```json
{
  "kind":        "adl",
  "asset":       0,
  "haircut_sz": "50000000",
  "realised_pnl": "5000000",
  "block":       12345
}
```

Más una notificación a nivel de cuenta:

```json
{ "kind": "marginChange", "free": "...", ... }
```

Para bots automatizados, trate los eventos `adl` como lo haría con una ejecución forzada — su posición cambió, el protocolo le asignó el precio de ejecución (mark en el bloque del recorte), y lo habitual es que reevalúe su estrategia.

## Predicción de la exposición al ADL

Para monitores de riesgo, el estado de cuenta de [`/info`](../api/rest/info.md) incluye un campo `adl_rank_estimate`:

```json
"adl_rank_estimate": {
  "asset": 0,
  "percentile": 95,
  "score": 1.2
}
```

`percentile: 95` significa que usted está en el 5 % superior de cuentas en riesgo para este activo. Las cuentas en el decil superior tienen mayor exposición si se activa el ADL.

Esto es una estimación — el ranking real ocurre en el momento del activación del ADL contra el estado actual en ese instante. Para los creadores de mercado que gestionan libros grandes, el riesgo principal es la concentración (una posición grande que domina el interés abierto del activo); diversificar entre activos reduce la exposición al ADL.

## Casos extremos

<details>
<summary>Mostrar casos extremos</summary>

- **Múltiples déficits en un mismo bloque.** Cada uno se asigna de forma independiente contra el conjunto de contrapartes vigente en ese momento. Los rankings pueden cambiar entre eventos.
- **Conjunto de contrapartes vacío.** Si literalmente no existe ninguna contraparte rentable en el mismo instrumento, el déficit se socializa en el registro de «pérdidas no cubiertas» del fondo de seguros, pagadero en la próxima reposición del fondo. No debería ocurrir en un activo líquido; en teoría puede suceder en un mercado de cola larga bajo MIP-3.
- **Contraparte inscrita en PM.** El ADL sigue apuntando al PnL no realizado en el mismo instrumento — la inscripción en PM no cambia la granularidad por activo del ADL. El motor de escenarios de PM ve el estado tras el recorte en el siguiente bloque.
- **Mercados spot.** El spot no tiene PnL no realizado en el sentido de los contratos perpetuos. El ADL spot no está definido para V1; las posiciones spot quedan excluidas del ranking ADL.

</details>

## Secuencia — ADL en un activo de cola delgada

```
block T:   account X liquidates on asset 42 (MIP-3 market), loss = 100 USDC
           insurance pool on asset 42 = 60 USDC
           D_t (deficit) = 40 USDC
           severity controller: θ_t resolves to 1.0 (full deficit needed)
           B_t = θ_t · D_t = 40                  # budget this round
           winners W_t on asset 42 (by haircut capacity u_i):
             A: u_A = 30
             B: u_B = 50    →    total_u = 80
           pro-rata: x_i = floor(u_i · B_t / total_u)
             x_A = floor(30·40/80) = 15
             x_B = floor(50·40/80) = 25          # Σ = 40, no dust
           result:
             A's position haircut by 15 USDC of PnL realised, 15 kept
             B's position haircut by 25 USDC of PnL realised, 25 kept
```

(La asignación es **pro-rata por capacidad**, no un recorrido ordenado por puntuación: cada ganador cede la misma *fracción* de su capacidad — en este caso el 50 % — que es exactamente la propiedad de equidad mín-máx que ofrece el pro-rata. Compárese con el antiguo modelo de «ordenar por puntuación, agotar primero el nivel superior», que no es lo que hace el código.)

## Véase también

- [Liquidación por niveles](./tiered-liquidation.md) — escalera completa
- [Fondo de seguros](./vaults.md#insurance-pool) — mecanismo T3
- [Margen de cartera](./portfolio-margin.md) — cómo interactúa el PM con el ADL
- [WS `userEvents`](../api/ws/subscriptions.md#userevents) — recibir notificaciones de ADL

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Puedo excluirme del ADL?**
R: No. El ADL es un mecanismo de mutualización de pérdidas a nivel de protocolo; excluirse simplemente trasladaría la pérdida a otra persona. El objetivo de minimizar el recorte excesivo es la protección.

**P: ¿Por qué asignar pro-rata según capacidad de PnL en lugar de una cola ordenada por puntuación?**
R: El recorte pro-rata aplica a cada ganador la misma *fracción* de su PnL susceptible de recorte — equidad mín-máx incorporada, sin violaciones de monotonicidad (dos cuentas con la misma capacidad reciben el mismo trato) y estabilidad de ranking ≈ 1.0. Midió ~13× mejor que la cola de heurística ROE de HL en el replay del 10 de octubre de 2025, y dentro del ~30 % del óptimo ILP off-chain, manteniéndose completamente determinista y on-chain. La *severidad* (cuánto recortar en total) es la parte aprendida en línea; *quién paga* es simplemente pro-rata.

**P: ¿Respeta el ADL el modo Strict-Iso?**
R: Sí. El ADL es por activo por construcción; las posiciones Strict-Iso son candidatas a contraparte si y solo si mantienen el mismo activo.

**P: ¿Es el ranking determinista entre validadores?**
R: Sí — todas las entradas (la capacidad de PnL de cada ganador `u_i`, el déficit de la ronda `D_t`) se leen desde el estado comprometido, y el estado del controlador de severidad (`θ`, `path_variation`, `Σ D_t²`, `η`) reside en el slot 5 del acumulador BOLE, incorporado al LtHash para que cada nodo verifique byte a byte de forma idéntica. El pro-rata usa mul/div entero de 128 bits con manejo de residuos en orden ascendente de AccountId — sin punto flotante, sin `HashMap`.

</details>
