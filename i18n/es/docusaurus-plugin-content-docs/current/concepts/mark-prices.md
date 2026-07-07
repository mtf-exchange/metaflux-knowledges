# Precios mark

:::tip
**Estable.**
:::

## Resumen

El **precio mark** es el precio autorizado del protocolo por activo para el margen, la liquidación, el financiamiento y la evaluación de órdenes disparadoras. Es la mediana de tres componentes — el ancla del oráculo (más una EMA de la base), el punto medio de la cotización interna y la mediana de los contratos perpetuos externos — recalculada de forma continua. NO es el precio de la última operación.

## Por qué mark ≠ última operación

Usar el precio de la última operación para el margen es explotable: una operación adversarial de pequeño tamaño a un precio manipulado puede forzar la liquidación de otros usuarios. El precio mark es una composición suavizada y de múltiples fuentes difícil de manipular.

## Composición

> El mark implementado es la **mediana de 3 componentes** que se describe a continuación (`mark_source: "MedianOfOraclesAndMid"`), no una simple `median(mid, oracle, ema_mid)`.

### Cómo se calcula

```
mark = median( componentes presentes de {C1, C2, C3} )
        # 3 presentes → median3   2 presentes → punto medio   1 presente → ese valor
        # un C2 único (sin ancla externa) no produce actualización — ver más abajo
```

con tres componentes:

| Componente | Definición |
|-----------|------------|
| **C1** (ancla del oráculo) | `C1 = oracle + EMA(quote_mid − oracle)` — el oráculo más una EMA de decaimiento fijo de la **base** del contrato perpetuo (≈ **150 s** de semivida al ritmo de recálculo) |
| **C2** (libro interno) | `mid(best_bid, best_ask)` — mejor oferta/demanda **únicamente**. Requiere ambos lados y un libro sin cruzar; de lo contrario, `None`. Deliberadamente **excluye la última operación** (incorporar la última operación haría que el recálculo fuera autoreferencial y podría congelar un libro unilateral con poca liquidez). |
| **C3** (contratos perpetuos externos) | `median(external perp mids)` sobre los **5 mercados de perpetuos** (Binance, OKX, Bybit, Gate, MEXC); requiere **≥ 2** mercados presentes; de lo contrario, `None` |

La mediana exterior es robusta ante un único valor atípico. **Los componentes ausentes simplemente se descartan** — con dos presentes, el mark es su punto medio; con uno, es ese valor. Sin libro interno ni contratos perpetuos externos, `mark = C1 = oracle + EMA(basis)`, degradándose de forma gradual hacia el oráculo de spot en lugar de congelarse.

**Un C2 único es rechazado.** Si el *único* componente presente es el punto medio de la cotización interna (sin oráculo, sin perpetuos externos), el mark no se actualiza en lugar de dejar que un único spread en reposo — que un adversario controla — defina el precio de liquidación/financiamiento. Un C1 único (oráculo externo) o un C3 único (que ya es una mediana de ≥ 2 mercados) sí están permitidos.

- La **EMA de C1** es la `DeterministicEma` con seguridad determinista (punto fijo `(num, denom)`, decaimiento fijo `0.9548` ≈ una semivida de 150 s al ritmo de recálculo de ~10 s). Incorpora `quote_mid − oracle` solo cuando existen tanto una cotización a dos lados utilizable como un oráculo, de modo que un libro vacío o unilateral no la alimenta con ruido. Un mercado que nunca ha tenido una cotización utilizable mantiene `EMA = 0`, es decir, `C1 = el oráculo puro`.
- La EMA es **por activo** (una por cada mercado de perpetuos).
- La mediana calculada se escribe en el **mark autoritativo** del mercado (el valor que leen todos los consumidores), por lo que el estampado de la última operación no puede sobreescribirlo — la mediana es autoritativa para los mercados activos, no solo para los tranquilos.

> ⚠️ **Corrección respecto al texto anterior.** La documentación anterior modelaba C2 como `median(bid, ask, last_trade)` y C3 como una mediana ponderada de 7 mercados. Las formas reales son: C2 = un **punto medio de cotización a dos lados** (solo mejor oferta/demanda, última operación excluida), C3 = la **mediana de 5 mercados de perpetuos externos** (se requieren ≥ 2), y C1 = el oráculo más una EMA de decaimiento fijo (`0.9548`) de la base del perpetuo. Los componentes ausentes caen fuera de la mediana (sin sustitución por `unwrap_or(C1)`), y un C2 único no produce actualización.

### Dos planos de precios (léase antes de cualquier cifra)

MTF maneja los precios en **dos planos numéricos distintos** — la principal fuente de confusión de escala:

| Plano | Tipo | Escala | Usado por |
|-------|------|-------|---------|
| **Plano libro / orden / mark** | `FixedPrice` (`i128`) / `price_e8` | **Punto fijo 1e8** (entero raw = precio × 10⁸) | libro de órdenes, `last_mark_px`, los precompilados EVM (`mark_px_e8`, `entry_px_e8`), nivel `px` de `l2_book`, `limit_px` de orden, `tick_size` |
| **Plano oráculo / nocional / colateral** | `rust_decimal::Decimal` | **USDC entero** (1 unidad = 1 USDC) | el agregador de oráculos + calculadora de mark (C1/C2/C3 todos en `Decimal`), `oracle_px` de financiamiento, motor de escenarios PM, margen/salud, y los campos de lectura humanizados `mark_px`/`oracle_px` de `market_info`/`markets` |

La calculadora de mark y la agregación de oráculos operan íntegramente en el **plano `Decimal` de USDC entero**. El resultado se convierte al **plano `FixedPrice` 1e8** al escribirse en el libro / `last_mark_px`. Sin embargo, la lectura humanizada de `market_info` / `markets` reporta `mark_px` y `oracle_px` ya reescalados al **plano de USDC entero** (p. ej. `"67042.335"`, no el raw 1e8) — solo los campos de *envío* de orden/libro (`px` de nivel en `l2_book`, `limit_px` de orden, `tick_size`) permanecen en 1e8. La *liquidación* de PnL/financiamiento opera bajo una tercera convención menor — USDC `1e6` (`accumulated_funding_e6` en `mark_settle`). Compruebe siempre en qué plano se encuentra una fórmula antes de comparar magnitudes.

## El oráculo (ancla de C1)

`oracle` — el ancla de C1 — es la **mediana ponderada** de hasta 10 mercados spot externos (Binance 3, OKX 2, Bybit 2, Coinbase 2, Bitget / Kraken / KuCoin / Gate / MEXC / MetaFlux-spot 1 cada uno; suma 15), publicada una vez por bloque y firmada por los validadores del oráculo. Los pesos por símbolo son configurables por gobernanza (`SetOracleWeights`, `ActionId 148`); un feed con más de 60 s de antigüedad o con una desviación de más del 5 % respecto a la mediana entre mercados se descarta; si hay menos del 50 % del peso disponible, el slot conserva su último valor válido.

El **componente C3 del mark es un conjunto de feeds separado** — puntos medios de perpetuos de los **5 mercados de perpetuos** (Binance, OKX, Bybit, Gate, MEXC), no la tabla del oráculo de spot. Consulte **[Precios del oráculo](./oracle-prices.md)** para ver la composición completa, las reglas de fiabilidad, las sobreescrituras por símbolo y la lectura de `oracle_sources`.

La lectura [`market_info`](../api/rest/info/perpetuals.md#market_info) expone `mark_source` (el descriptor `"MedianOfOraclesAndMid"`) y los campos compuestos `mark_px` / `oracle_px`; los componentes individuales C1/C2/C3 y la lista de fuentes ponderadas no se desglosan como campos en el wire.

## Mark vs. oráculo — por qué divergen

Es **normal y esperado** que el mark se aleje del oráculo. El oráculo sigue el **spot**; el mark sigue dónde cotiza el **perpetuo** — y un perpetuo puede mantener una **base** persistente (prima o descuento) respecto al spot:

- **C2** es el punto medio del libro de perpetuos de MetaFlux; **C3** es la mediana de los *perpetuos* externos — ambos reflejan el perpetuo, no el spot.
- **C1** es `oracle + EMA(quote_mid − oracle)` — la EMA de la base arrastra incluso el ancla del oráculo hacia la prima vigente del perpetuo, de modo que los tres componentes siguen al perpetuo.

Por tanto, cuando un perpetuo cotiza, por ejemplo, con un descuento del 30 % respecto a su índice spot, `mark ≈ perp` y `oracle ≈ spot` divergen legítimamente en ~30 %. Esa brecha es exactamente lo que el **[financiamiento](./funding-rates.md)** existe para cerrar — y nótese que si el propio oráculo no es fiable, el financiamiento se *bloquea y decae a 0* incluso cuando la brecha mark/oráculo es amplia (por lo que una brecha grande con un financiamiento ~0 significa que se está desconfiando del oráculo de ese mercado, no que el financiamiento esté roto). Véase [bloqueo del financiamiento](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Bandas de sanidad

> **Estado de implementación:** la mediana de 3 componentes (con componentes ausentes que se descartan y C2 único rechazado) está implementada actualmente. La limitación por bloque descrita en esta sección (un `clamp(candidate, prior ± max_step)` por encima de la mediana) es una **especificación de diseño, no una limitación discreta aún activa en la calculadora de mark** — la mediana estructural es actualmente la principal defensa contra manipulaciones. La protección más cercana en producción copia el oráculo en el `last_mark_px` de un libro obsoleto en lugar de hacer una rampa. Considere las cifras a continuación como el diseño de banda previsto; verifique los valores en producción antes de confiar en los números exactos de la limitación.

Incluso con la composición, un adversario puede empujar dos de las tres fuentes simultáneamente. Por ello, el mark está diseñado para imponer **bandas** por bloque:

```
prior_mark   = mark at block T-1
band_pct     = market parameter, default 0.5% per second
max_step     = prior_mark * band_pct * (block_time_ms / 1000)

candidate    = median(...)
mark_T       = clamp(candidate, prior_mark - max_step, prior_mark + max_step)
```

| Valor por defecto | Valor |
|---------|-------|
| `band_pct` | 0.5% por segundo |
| `block_time_ms` | 100 ms |
| `max_step_per_block` | ~0.05% |

A 0,05% por cada 100 ms, un movimiento del 5% tarda ≈10 segundos. Los movimientos genuinamente rápidos se recuperan en un pequeño número de bloques; los picos adversariales quedan limitados a una rampa corta.

Si el candidato supera la banda repetidamente durante `band_violation_blocks` (por defecto 50 = ~5 s), el protocolo asume un verdadero cambio de régimen y amplía la banda 2× durante una ventana. Esto evita una congelación permanente durante deslocalizaciones reales del mercado.

## Qué usa el mark

| Consumidor | ¿Por qué el mark? |
|----------|-----------|
| Margen (inicial + mantenimiento) | Base estable; resistente a manipulaciones |
| Evaluación del nivel de liquidación | Ídem |
| Financiamiento (vs. oráculo) | Requerido por la fórmula de financiamiento |
| Órdenes disparadoras (StopLoss / TakeProfit) | Resistente a picos por una sola operación |
| Visualización del PnL (no realizado) | Cifra estable para el usuario |
| Contabilidad del seguro | Estable |

Consumidores que usan el **precio de la última operación** en lugar del mark:
- Precios de ejecución en el libro (las operaciones se ejecutan a los precios reales del libro)
- Comisiones de maker / taker (calculadas sobre el precio de ejecución, no el mark)
- PnL realizado (calculado al precio de ejecución de la salida)

## Consulta

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

La lectura [`market_info`](../api/rest/info/perpetuals.md#market_info) reporta `mark_px` y
`oracle_px` en el **plano de USDC entero** (p. ej. `"67042.335"`), más el
descriptor `mark_source`:

```json
{
  "type": "market_info",
  "data": {
    "asset_id":    0,
    "mark_source": "MedianOfOraclesAndMid",
    "mark_px":     "67042.335",
    "oracle_px":   "67042.335"
  }
}
```

Los tres componentes internos `C1`/`C2`/`C3` (oráculo+ancla EMA / mediana del
libro interno / mediana ponderada de perpetuos externos) y el estado de banda (`Ok` / `Banded` /
`Frozen`) residen dentro de la calculadora de mark; **no** se detallan como campos wire de `market_info` en la actualidad — solo se publica el `mark_px` compuesto. Banded significa que la banda limitó el candidato en este bloque; Frozen significa que todas las fuentes fallaron y el protocolo mantiene el mark anterior.

Un canal WS dedicado `mark` está en la [hoja de ruta de WS](../api/ws/subscriptions.md#roadmap--not-yet-available) (aún no disponible en streaming); por ahora consulte [`market_info`](../api/rest/info/perpetuals.md#market_info) para obtener `mark_px`.

## Casos extremos

<details>
<summary>Mostrar casos extremos</summary>

- **Movimiento genuino del 5% en 1 s.** La banda limita los primeros 10 bloques; el mark se recupera a ~0,05% por bloque, luego la detección de cambio de régimen amplía la banda y el mark se recupera más rápido. El retraso total es de ~1–2 segundos; grande pero acotado.
- **Interrupción del oráculo con > 50% del peso ausente.** Cuando menos del 50% del peso spot está presente en un tick, el slot del oráculo **no se actualiza** — el último tick válido persiste. C1 sigue usando el último oráculo válido + su EMA, por lo que el mark permanece anclado.
- **Libro MTF vacío / unilateral.** C2 cae fuera. Mark = `midpoint(C1, C3)` (o `C1` solo si los perpetuos también están caídos) — sigue el ancla del oráculo mezclada con los perpetuos externos. El financiamiento sigue usando el oráculo disponible; las liquidaciones proceden contra el mark anclado al oráculo.
- **Todos los perpetuos externos caídos.** C3 cae fuera. Mark = `midpoint(C1, C2)` — punto medio de la cotización interna frente al ancla del oráculo.
- **Sin libro y sin perpetuos.** Solo queda C1 ⇒ `mark = C1 = oracle + EMA(basis)`. Puramente anclado al oráculo.
- **Solo una cotización unilateral/vacía sin oráculo.** Un C2 único es rechazado ⇒ sin actualización; el mark mantiene su último valor hasta que regrese un ancla externa (oráculo o perpetuos).
- **EMA de C1 obsoleta.** La EMA está siempre definida por construcción una vez que al menos un punto medio interno se ha incorporado; mantiene su último valor mientras no llegue un nuevo punto medio (solo se actualiza cuando C2 está presente).
- **Órdenes disparadoras durante una congelación.** La evaluación de disparadores usa el mark; durante la congelación, ningún disparador se activa. Las órdenes en reposo permanecen hasta que se reanude un mark real.

</details>

## Secuencia — la banda de mark se activa ante un pico

La mediana de 3 componentes ya neutraliza un pico de fuente única antes de que intervenga cualquier banda:

```
block T-1   C2(book mid)=100.0  C1(oracle+EMA)=100.0  C3(perps)=100.0  →  median3 = 100.0

block T:    thin MTF book; adversary lifts the internal mid to 110.0
            C2 = 110.0,  C1 = 100.05,  C3 = 100.05   (external perps + oracle unmoved)
            mark = median3(100.05, 110.0, 100.05) = 100.05
            ↑ the adversarial C2 is the OUTLIER → median discards it; mark ≈ oracle anchor

block T+1:  adversary persists at 110.0; oracle/perps drift up slowly
            C2 = 110.0,  C1 = 100.10,  C3 = 100.10
            mark = median3(100.10, 110.0, 100.10) = 100.10

... mark tracks the (C1, C3) consensus; a single manipulated source never wins the median
```

La defensa es estructural: para mover la mediana, un adversario debe mover al menos **dos** de los tres componentes, y precisamente C1 (oráculo) + C3 (mediana de perpetuos externos de 5 mercados) son los difíciles de mover. La banda de sanidad por bloque opcional descrita a continuación es una limitación adicional por encima.

## Véase también

- [Tasas de financiamiento](./funding-rates.md) — el financiamiento usa mark vs. oráculo
- [Liquidación por niveles](./tiered-liquidation.md) — evaluación del nivel frente al mark
- [Canal WS `mark` (hoja de ruta)](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [Precios del oráculo](./oracle-prices.md) — lista completa de fuentes, pesos, reglas de fiabilidad

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Por qué no usar el oráculo directamente?**
R: Un mark basado solo en el oráculo daría a los operadores del oráculo la capacidad de liquidar el libro manipulando el feed. La mediana de tres diversifica la superficie de confianza.

**P: ¿Puedo ver históricamente qué hizo la banda?**
R: El historial del mark con el estado de banda estará disponible una vez que el canal WS `mark` esté operativo (hoja de ruta) y mediante respuestas del indexador de archivo; aún no está en la superficie de lectura en producción.

**P: ¿Causará la banda liquidaciones injustas?**
R: La banda ralentiza el mark respecto al subyacente — por lo que durante una caída real, su mantenimiento permanece saludable aproximadamente 1 segundo más que en un mercado que usa el precio de la última operación. Lo contrario también aplica (el mark se recupera más lentamente). Efecto neto: el comportamiento de liquidación es más determinista y más difícil de weaponizar.

</details>
