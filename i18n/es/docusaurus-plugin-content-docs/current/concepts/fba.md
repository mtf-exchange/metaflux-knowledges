# Subastas por lotes frecuentes (FBA)

:::info
**Vista previa.** Habilitación por mercado mediante [MIP-3](../mip/mip-3.md); no todos los mercados ejecutan FBA.
:::

## Resumen

FBA reemplaza el emparejamiento continuo con lotes de subasta discretos cada `batch_interval_ms`. Las órdenes en cola dentro de un lote se liquidan simultáneamente a un único precio de compensación uniforme. Esto neutraliza el MEV basado en latencia: no hay ninguna ventaja en ser un microsegundo más rápido.

## Continuo vs. por lotes

| Propiedad | CLOB continuo | FBA |
|-----------|---------------|-----|
| Cadencia de emparejamiento | En cada llegada de orden | Cada `batch_interval_ms` |
| Descubrimiento de precio | Por operación | Por lote (un precio de compensación) |
| Valor de latencia | Alto (el primero en llegar gana los empates en precio) | Cero dentro de un lote |
| Excedente por latencia | Capturado por HFT | Devuelto a los participantes mediante precio uniforme |
| Visibilidad pública de órdenes | Pre-operación (libro en reposo) | Pre-lote (cola visible) |

## Mecanismo

```
batch t:        aceptar órdenes durante [t, t + batch_interval_ms)
batch close t:  congelar la cola
                calcular precio de compensación p*:
                  p* = precio en el que |demanda de compra agregada| = |oferta de venta agregada|
                ejecutar todas las órdenes cruzadas a p*
                trasladar las órdenes no cruzadas al batch t+1 (o cancelar según TIF)
batch t+1:      abierto
```

Reglas de compensación:
- Todas las compras con precio ≥ p* se ejecutan a p*.
- Todas las ventas con precio ≤ p* se ejecutan a p*.
- El precio de compensación único p* maximiza el volumen total liquidado (equivalente a recorrer las curvas de demanda/oferta hasta su intersección).

El precio de ejecución es **uniforme** para todos los participantes del lote — nadie obtiene un precio peor por haber llegado más tarde.

## Cuándo usar FBA

| Clase de activo | Valor predeterminado | Por qué |
|-----------------|---------------------|---------|
| Perps principales (BTC, ETH) | CLOB continuo | Líquidos; las ventajas de latencia son pequeñas en relación con el spread |
| Listados de cola larga (MIP-3) | FBA opcional | Libro poco profundo; la toxicidad del HFT supera la provisión de liquidez |
| Pares spot | CLOB continuo | Convención |
| Productos indexados / estructurados | FBA | La fijación de precios compuesta requiere liquidación sincrónica |

El modo de emparejamiento de cada mercado se indica en [`market_info.fba_enabled`](../api/rest/info/perpetuals.md#market_info). Los mercados con FBA habilitado aceptan tanto `FbaOrder` (dirigido al lote) como [`submit_order`](../api/rest/exchange.md#submit_order) (tratado como orden FBA para el siguiente lote). Consulta el [catálogo de acciones de `/exchange`](../api/rest/exchange.md#action-catalog) — `FbaOrder` es un stub reconocido pero sin mapeo actualmente.

## Intervalo de lote

Valor predeterminado: 1 segundo (10 bloques a 100 ms por bloque). Establecido por gobernanza por mercado en `market_info.fba_batch_interval_ms`. Rango típico: 100 ms – 5 s.

Los intervalos más cortos reducen la espera pero aumentan el costo computacional. El valor predeterminado de 1 segundo equilibra la neutralización del HFT con la experiencia de usuario.

## Estructura de la orden

```json
{
  "type": "FbaOrder",
  "params": {
    "asset":     42,
    "side":      "Buy",
    "px":  "10050000000",
    "size":   "100000000",
    "batch_id":  9876,
    "cloid":     "0x..."
  }
}
```

`batch_id` selecciona a qué lote se une la orden. El ID de lote actual se encuentra en [`market_info`](../api/rest/info/perpetuals.md#market_info) bajo `fba_current_batch_id`. Las órdenes con `batch_id < current` son rechazadas (`{"error":"batch already closed"}`); las órdenes con `batch_id` > current se encolan para ese lote futuro.

Omite `batch_id` para apuntar al siguiente lote — el servidor selecciona el que está aceptando órdenes actualmente.

## Ejemplo práctico

El lote t contiene las siguientes órdenes para el activo 42:

```
compras:
  bob:    5 @ 100.10
  alice:  3 @ 100.05
  carol:  2 @ 100.00

ventas:
  dave:   3 @ 99.95
  eve:    4 @ 100.00
  frank:  2 @ 100.05
```

Recorrido de la demanda (tamaño acumulado a cada precio ≥ candidato):

```
buy-side  cumulative at price ≥ p:
  100.10:  5
  100.05:  5+3 = 8
  100.00:  8+2 = 10
  99.95:   10  (none here)
```

Recorrido de la oferta (tamaño acumulado a precio ≤ candidato):

```
sell-side cumulative at price ≤ p:
  99.95:   3
  100.00:  3+4 = 7
  100.05:  7+2 = 9
  100.10:  9   (none here)
```

Intersección: a p = 100.00, el acumulado del lado comprador = 10, el acumulado del lado vendedor = 7. A p = 100.05, el acumulado comprador = 8, el acumulado vendedor = 9. La intersección está entre 100.00 y 100.05.

La regla de compensación maximiza el volumen:

| p | min(buy, sell) |
|---|----------------|
| 99.95  | min(10, 3) = 3 |
| 100.00 | min(10, 7) = 7 |
| 100.05 | min(8, 9)  = 8 |
| 100.10 | min(5, 9)  = 5 |

El volumen máximo liquidado es 8 a `p* = 100.05`. Por lo tanto:

- Todas las compras ≥ 100.05 se ejecutan: bob (5) + alice (3) = 8 BTC comprados a 100.05.
- Todas las ventas ≤ 100.05 se ejecutan: dave (3) + eve (4) + frank (2) = 9 BTC ofrecidos. Prorrateo: 8/9 = 88,9% de cada uno → dave 2,67, eve 3,56, frank 1,78.
- Carol (compra 2 @ 100.00) no se ejecuta — pasa a t+1 o vence según TIF.

Todos los ganadores se ejecutan a 100.05. Bob no obtiene un precio peor por haber llegado "antes" — en FBA no existe el antes.

## Equidad en la compensación

Cuando la oferta > la demanda a p*, el lado mayor se llena de forma **prorrateada** — cada vendedor por encima recibe la misma fracción. Sin FIFO, sin prioridad de precio entre el lado sobreofertado (todos ya están en p* o mejor).

Esta es la propiedad de equidad de FBA: al precio de compensación, ningún participante obtiene mejores condiciones que otro.

## Casos límite

<details>
<summary>Mostrar casos límite</summary>

- **Lote vacío.** Sin órdenes → no hay evento de compensación. El siguiente lote comienza de inmediato.
- **Lote unilateral.** Solo compras (o solo ventas). Sin compensación — todas las órdenes pasan al siguiente lote (Gtc) o se cancelan (Ioc).
- **Empate en la compensación.** Cuando dos precios maximizan igualmente el volumen, el protocolo elige el precio más cercano al mark anterior (reduce la ambigüedad en el cambio de mark).
- **Órdenes de mercado en FBA.** Se envían como IOC a precio extremo; participan en el lote y se ejecutan a p* si cruzan.
- **Reduce-only en FBA.** Se verifica al cierre del lote, frente al estado posterior a la ejecución de las liquidaciones previas dentro del mismo lote. Se liquida de forma atómica.

</details>

## Secuencia

```
t=0.0s   batch_id = 9876 opens
t=0.2s   bob:    FbaOrder buy 5 @ 100.10, batch 9876
t=0.4s   alice:  FbaOrder buy 3 @ 100.05, batch 9876
t=0.5s   carol:  FbaOrder buy 2 @ 100.00, batch 9876
t=0.6s   dave:   FbaOrder sell 3 @ 99.95, batch 9876
t=0.7s   eve:    FbaOrder sell 4 @ 100.00, batch 9876
t=0.8s   frank:  FbaOrder sell 2 @ 100.05, batch 9876
t=1.0s   batch_id 9876 closes; clearing fires
         p* = 100.05; 8 BTC clears
         fills published on `trades` WS with batch_id and "kind":"fba"
t=1.0s   batch_id = 9877 opens
```

## Consultas

El pool FBA en vivo y la compensación indicativa se exponen en la ruta de lectura `/info` del nodo
mediante [`fba_batch_state`](../api/rest/info.md#fba_batch_state) — consulta esa entrada para
conocer la forma completa de la respuesta y la tabla de campos. Acepta `market_id` (u32). FBA es una
habilitación por mercado, por lo que un mercado no registrado **no devuelve 404** — devuelve un 200
con campos en cero (`enabled:false`, `orders` vacío, `indicative:null`).

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"fba_batch_state","market_id":42}'
```

```json
{
  "type": "fba_batch_state",
  "data": {
    "market_id":      42,
    "enabled":        true,
    "period_ms":      1000,
    "min_lot":        "1",
    "last_settle_ms": 1735689600000,
    "next_settle_ms": 1735689601000,
    "order_count":    11,
    "bid_count":      5,
    "ask_count":      6,
    "bid_size":       "1000000000",
    "ask_size":       "900000000",
    "orders":         [ /* {oid, owner, side, price, size, stp_group, submitted_at_ms} */ ],
    "indicative":     { "clearing_px": "10050000000", "matched_size": "800000000" }
  }
}
```

Los precios y tamaños son cadenas enteras en **punto fijo 1e8** (el plano de libro/órdenes). `next_settle_ms` se **deriva** como `last_settle_ms + period_ms`. El bloque `indicative` es el precio uniforme que maximiza el volumen más el tamaño emparejado que el **siguiente** lote *liquidaría* dada la ventana actual — calculado en modo lectura, aún no liquidado — y es `null` cuando no hay cruce (ventana unilateral o vacía). Este es el valor que tendría p\* si el lote cerrara ahora, útil para que los traders decidan si agregar al lote.

## Véase también

- [Tipos de orden](./order-types.md)
- [Catálogo de acciones de `/exchange`](../api/rest/exchange.md#action-catalog) — `FbaOrder` (stub reconocido pero sin mapeo actualmente)
- [MIP-3](../mip/mip-3.md) — los mercados se incorporan a FBA al despliegue
- [`market_info`](../api/rest/info/perpetuals.md#market_info) — verifica `fba_enabled` por mercado

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Acaso FBA sacrifica el descubrimiento de precios?**
R: No — dentro de un lote el protocolo sigue descubriendo `p*` a partir de las órdenes de los participantes. El descubrimiento ocurre a cadencia fija en lugar de de forma continua.

**P: ¿Por qué un lote de 1 s en lugar de 100 ms?**
R: 100 ms es demasiado corto para neutralizar la latencia de manera significativa — incluso dentro de 100 ms, las máquinas más rápidas pueden reenviar. 1 s ofrece suficiente margen para que la latencia de red física domine sobre la latencia dentro del lote, eliminando la ventaja del HFT.

**P: ¿Pueden coexistir mercados FBA con mercados CLOB?**
R: Sí — cada mercado es FBA o CLOB de forma independiente. Una cuenta puede mantener posiciones en ambos al mismo tiempo.

**P: ¿Reduce FBA el costo de gas / cómputo del emparejamiento?**
R: Aproximadamente. El emparejamiento continuo realiza trabajo O(1) por llegada; FBA realiza O(N log N) al cierre del lote. Para N órdenes por lote, FBA es comparable, con la ventaja de tener un costo por bloque más predecible.

</details>
