# Margen de cartera

:::info
**Activo en devnet.** El motor de escenarios está completamente operativo: los usuarios se inscriben mediante la
acción `UserPortfolioMargin` (con requisito mínimo de capital, por defecto ≥ 100 K USDC), y la
cuadrícula de escenarios de estilo SPAN (±5/10/20 % de precio × ±20/50 % de volatilidad) calcula el margen de mantenimiento en
tiempo real. Tanto la acción como el motor de escenarios están implementados y probados
en una ejecución de consenso de 4 nodos.
:::

## Resumen

PM trata toda tu cuenta como un único número de riesgo. Las posiciones cubiertas o correlacionadas se compensan entre sí; el protocolo cobra el margen en función del peor escenario posible dentro de una cuadrícula calibrada de perturbaciones `(precio, vol)`. Eficiencia de capital típica para una cartera equilibrada: **2–5×** respecto al modelo clásico.

PM es opcional, tiene requisito mínimo de capital (por defecto ≥ 100 K USDC) y es reversible.

## Clásico vs PM — comparativa

Ejemplo de cartera cubierta: largo en 1 BTC a $100, corto en 25 ETH a $4 (perfectamente neutro en $ si BTC y ETH están perfectamente correlacionados, lo que prácticamente ocurre).

**Clásico:**

```
maint(BTC) = 1 BTC × $100 × 5% = $5
maint(ETH) = 25 ETH × $4 × 5% = $5
total maint = $10
```

**PM:**

```
scenario grid: (BTC ±10%, ETH ±10% × ±50% vol)
worst-case loss (correlated -10% on both): -$10 on BTC + (-$10) profit on short ETH = $0
worst-case loss (decorrelated, BTC -10% / ETH +10%): -$10 + (-$10) = -$20  ← worst
+ concentration penalty (basket is balanced; small)
total maint ≈ $20  (vs classical $10) ?
```

Un momento — eso es peor. Recalculemos: corto en 25 ETH a $4 = $100 de nocional corto, opuesto al largo de $100 en BTC.

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

Pérdida máxima: $20 — pero solo en el escenario de descorrelación. Ponderado por probabilidad, el shock de descorrelación es infrecuente (correlación BTC/ETH a 30 días ≈ 0,85). El conjunto de escenarios calibrado de PM pondera esto de forma realista; el mantenimiento real suele ser ~$5–10 en lugar del $20 teórico.

El $10 clásico simplemente no tiene en cuenta la correlación. PM sí.

## Cómo funciona PM

> El motor de margen de cartera opera internamente en **centavos de USD** (plano `Decimal` de USDC entero × 100). El número PM **reemplaza** la suma de mantenimiento clásica por activo; no se suma a ella. También existe un precompilado EVM de solo lectura (`portfolio_margin_eval`) para cotización fuera de cadena.

Bajo PM, el número de mantenimiento proviene de un **motor de escenarios de estilo SPAN** que recorre una cuadrícula determinista de `(perturbación de precio, perturbación de vol)` sobre toda la cartera:

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · |size_i| · mark_i · iv_i · δσ · δp²   # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

La cuadrícula y los coeficientes de concentración son los valores por defecto del motor (`PortfolioMarginEngine::default`):

| Parámetro | Valor por defecto (código) |
|-----------|----------------------------|
| Perturbaciones de precio | **±5 %, ±10 %, ±20 %** (`default_price_shocks` — 6 valores) |
| Perturbaciones de volatilidad | **±20 %, ±50 %** (`default_vol_shocks` — 4 valores) |
| Tamaño de cuadrícula | **6 × 4 = 24 escenarios** |
| Volatilidad implícita de respaldo | `0.50` (50 % anualizado) cuando el oráculo no proporciona `iv` |
| Umbral de concentración | **50 %** del valor neto (`default_concentration_threshold`) |
| Penalización por concentración | **1 000 bps = 10 %** (`DEFAULT_CONCENTRATION_PENALTY_BPS`) |
| Capital mínimo para inscripción | `10_000_000` centavos = **100 000 USDC** |

> ⚠️ **Correcciones respecto a documentación anterior.** El motor implementado: (1) incluye un **término de gamma/convexidad** impulsado por la volatilidad implícita por posición — la documentación anterior modelaba los escenarios como PnL puramente lineal; (2) utiliza una **cuadrícula única de 24 escenarios (±5/10/20 × ±20/50)** sin tabla por clase de activo — la cuadrícula por niveles "BTC/alts/long-tail" del documento anterior no está en el código (la cuadrícula es un valor por defecto único del motor, ajustable mediante riesgo dinámico); (3) el umbral de concentración es **50 %**, no 60 %; (4) la penalización por concentración es **10 %** (1000 bps), no 5 %.

Los escenarios se aplican **simultáneamente** sobre toda la cartera. La compensación surge de forma natural: las posiciones `delta_pnl_i` de una cartera cubierta se cancelan en `scenario_total`, por lo que `worst` es pequeño. (Nota: el motor actual aplica cada `δp` de forma uniforme sobre todas las posiciones — una matriz de correlación explícita por par es una extensión documentada, aún no implementada como campo en el motor.)

`concentration_penalty` añade margen adicional cuando un único activo domina la cartera:

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

(Se omite cuando `net_value ≤ 0` — el camino de capital negativo de BOLE captura esa cuenta en su lugar.)

## Inscripción

```json
{ "type": "UserPortfolioMargin", "params": { "enabled": true } }
```

Solo para la cuenta principal. Simétrico para deshabilitar.

| Restricción | Valor |
|-------------|-------|
| `pm_min_equity` | por defecto 100 000 USDC; definido por gobernanza |
| Vigente desde | el siguiente bloque tras la confirmación |
| Posiciones en violación actual | inscripción rechazada si PM te situaría en T1+; cierra las posiciones primero |

Deshabilitar revierte al modelo clásico en el siguiente bloque. Deshabilitar mientras se está en T0+ está permitido (siempre puedes volver a un modelo más conservador).

## Aislamiento estricto

Incluso bajo PM, es posible marcar activos específicos como **estrictamente aislados**. Una posición con aislamiento estricto:

- Calcula su propio margen de forma independiente (modelo clásico)
- NO entra en el motor de escenarios de PM
- Se liquida de forma independiente — la quiebra queda contenida en ese activo

Casos de uso:
- Activos nuevos o con poca liquidez cuya matriz de correlación no está calibrada
- Presupuesto especulativo separado de la cartera cubierta principal
- Experimentos de alto riesgo

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 7, "mode": "StrictIso" }
}
```

Ver [modos de margen](./margin-modes.md).

## Liquidación bajo PM

Las cuentas PM siguen la escalera estándar de [liquidación por niveles](./tiered-liquidation.md), pero `maint_margin` es el número de PM, no la suma clásica.

Una consideración específica de PM: un cierre parcial en T1 puede desplazar el peor caso del escenario lo suficiente para que la posición restante sea saludable bajo PM pero no lo sería bajo el modelo clásico. Esto es intencional — el cierre parcial se dimensiona contra PM en ambas direcciones.

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## Riesgo para el operador

PM es más eficiente en capital para los usuarios, lo cual es precisamente por qué representa un riesgo para el protocolo — una especificación incorrecta de los escenarios puede permitir que una cuenta asuma más riesgo del que la cadena puede liquidar limpiamente. MetaFlux mitiga esto con:

- `concentration_penalty` (umbral del 50 % / tasa del 10 %) para neutralizar el abuso de PM con un único activo — **implementado** en el motor.
- El piso de `min_enroll_account_value_cents` (100K USDC) — **implementado** (`meets_enrollment_floor`; el valor neto negativo siempre falla).
- Conservadurismo del conjunto de escenarios, calibración dinámica conforme cambian los regímenes de volatilidad, un límite de PM por cuenta (`pm_max_account_notional`, valor de diseño 100M USDC), y una reversión obligatoria al modelo clásico ante fallo del motor de escenarios — **intención de diseño / aún no implementado como campos en `PortfolioMarginEngine`**; el motor actualmente solo contiene la cuadrícula, los parámetros de concentración y el piso de inscripción.

El conjunto de escenarios, las magnitudes de las perturbaciones y los coeficientes de concentración son parámetros de gobernanza (riesgo dinámico). Suscríbete a las actualizaciones de parámetros si operas cerca de los límites de margen.

## Ejemplo práctico — penalización por concentración

La penalización compara el **mayor nocional absoluto de un único activo** con el **valor neto** de la cuenta (`efectivo + Σ tamaño × mark`), con los valores por defecto del código: umbral **50 %**, tasa **10 %**.

Cuenta: valor neto `$1000`, posición más grande `|notional_BTC| = $700`.

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

Si el barrido de escenarios de PM calcula (por ejemplo) una pérdida máxima de `$25`, `pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`.

Una cartera más equilibrada donde ningún activo supera el 50 % del valor neto **no** paga penalización — `pm_margin` es únicamente el peor caso del escenario. La penalización desincentiva la concentración en un único activo dentro de PM; el margen clásico no aplica tal penalización.

## Consulta

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<addr>"}'
```

La lectura nativa de [`account_state`](../api/rest/info.md#account_state) expone
`pm_enabled` (si PM está activo para la cuenta) junto con `maint_margin`,
`init_margin`, `health` y `tier`. Cuando PM está habilitado, `maint_margin` ya
refleja el mantenimiento derivado de PM:

```json
{
  "pm_enabled":   true,
  "maint_margin": "8",
  "init_margin":  "12",
  "health":       "...",
  "tier":         "Safe"
}
```

> **Lectura planificada.** La comparativa entre el modelo clásico y PM, así como el desglose del peor escenario
> (qué combinación de perturbación de precio/vol impulsó el número de PM), **aún no están
> desglosados** como campos separados en la
> respuesta de [`account_state`](../api/rest/info.md#account_state) — el motor de escenarios de PM
> los calcula internamente, pero hoy solo se expone el `maint_margin` final. Una futura
> lectura (un campo de detalles de PM por escenario en `account_state`) expondrá el desglose.

## Casos extremos

<details>
<summary>Mostrar casos extremos</summary>

- **Interrupción del motor de escenarios de PM**: poco frecuente; el protocolo recurre a `max(classical_maint, prior_pm_maint)` para ese bloque. Las liquidaciones en ese bloque usan el valor de respaldo conservador.
- **Apertura de posición entre activos durante un régimen de perturbación**: la nueva posición es admitida contra el motor de PM en el momento de admisión — pero el motor lee los pesos de escenario desde el estado confirmado, por lo que el abuso mediante cambio adversarial de régimen queda bloqueado.
- **Inscripción estando en T0**: permitido. PM puede sacarte de T0 (si PM da un mantenimiento menor) o mantenerte en T0 (si no lo hace). No hay reversión automática si PM da un número peor.
- **Deshabilitar estando en T0+**: permitido. Útil para volver al modelo clásico si PM presenta un fallo a nivel de protocolo.

</details>

## Ver también

- [Liquidación por niveles](./tiered-liquidation.md) — cómo interactúa PM con la escalera
- [Modos de margen](./margin-modes.md) — Cruzado / Aislado / Aislamiento estricto
- [Subcuentas](./sub-accounts.md) — inscripción de PM por subcuenta

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Pueden las subcuentas tener configuraciones de PM distintas?**
R: Sí. Cada subcuenta es independiente. Una cuenta principal puede estar inscrita en PM mientras sus subcuentas usan el modelo clásico, y viceversa.

**P: ¿Cuál es el costo en gas de la evaluación de PM?**
R: Mayor que el modelo clásico (cuadrícula de escenarios), pero acotado. El protocolo almacena en caché los resultados de escenarios por cuenta y solo los recalcula ante cambios de posición o actualizaciones de parámetros de escenario.

**P: ¿Es PM transparente — puedo ver el número exacto de mantenimiento antes de colocar una orden?**
R: Sí. `/info clearinghouseState` devuelve tanto el clásico como el PM. Los SDK exponen esto en su función auxiliar `getOrderImpact()`.

**P: ¿Los listados de MIP-3 reciben crédito de PM?**
R: Solo si la especificación de mercado del listado incluye el activo en la matriz de correlación de PM. Muchos listados de cola larga tendrán por defecto el modo Strict-Iso por seguridad. Consulta `market_info.pm_eligible` por mercado.

</details>
