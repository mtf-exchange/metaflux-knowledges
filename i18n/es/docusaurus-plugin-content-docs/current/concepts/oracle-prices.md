# Precios de oráculo

:::tip
**Estable.**
:::

## Resumen

El **precio de oráculo** es el precio de referencia por activo que utiliza el protocolo para el subyacente. Se compone una vez por bloque como una **mediana ponderada de venues de spot externas**. Es el ancla externa sobre la que se construyen tanto el [precio de marca](./mark-prices.md) (su componente C1) como el [financiamiento](./funding-rates.md) (la referencia de liquidación). El oráculo es deliberadamente *derivado del mercado spot y lento en su actualización* — no es el precio del libro de MetaFlux ni el precio del último trade.

Dos conjuntos de feeds distintos alimentan el protocolo, y es fácil confundirlos:

| Conjunto de feeds | Venues | Agregación | Impulsa |
|-------------------|--------|------------|---------|
| **Oráculo spot** | hasta **10 venues spot** | mediana ponderada | `oracle_px`; el ancla C1 de marca; nocional de liquidación de financiamiento |
| **Mids de perps externos** | **5 venues de perps** (Binance, OKX, Bybit, Gate, MEXC) | mediana (≥ 2 presentes) | solo el componente **C3** de marca |

## ¿Por qué un oráculo (y no el libro)?

El margen, la liquidación y el financiamiento necesitan un precio que un adversario **no pueda** mover con un solo trade en un libro de MetaFlux con poca liquidez. Una mediana ponderada global de venues spot profundas es exactamente eso: para moverlo hay que mover el spot en muchas venues simultáneamente, lo cual es costoso y se auto-arbitra. El libro interno *sí* alimenta el precio de marca (a través de los términos C2 y de base C1), pero siempre combinado con esta ancla externa.

## Composición

`oracle_px` es la **mediana ponderada** de las venues spot presentes para el activo.

### Tabla de pesos spot por defecto (suma = 15)

| Venue | Peso | | Venue | Peso |
|-------|-----:|-|-------|-----:|
| Binance | 3 | | Kraken | 1 |
| OKX | 2 | | KuCoin | 1 |
| Bybit | 2 | | Gate | 1 |
| Coinbase | 2 | | MEXC | 1 |
| Bitget | 1 | | MetaFlux spot | 1 |

Se utiliza una **mediana ponderada** (no una media ponderada) para que un único venue que imprima un tick incorrecto no pueda arrastrar el resultado — solo desplaza qué muestra queda en el punto medio ponderado.

### Pesos de gobernanza por símbolo

La tabla por defecto es un respaldo. Una acción `SetOracleWeights { asset_id, weights }` (`ActionId 148`) exclusiva de gobernanza **reemplaza** (no fusiona) la tabla para un activo — necesario porque los mercados de cola larga y sin permisos ([MIP-3](../mip/mip-3.md)) frecuentemente no están listados en Binance o Coinbase, por lo que los pesos por defecto no resolverían nada utilizable. Los desplegadores de mercado **no pueden** establecer sus propios pesos (elegir las fuentes del oráculo equivale a elegir tu propio precio de marca); los nuevos mercados comienzan con la tabla por defecto y solo la gobernanza puede sobreescribirla.

El conjunto de fuentes comprometido por mercado es consultable — véase [`oracle_sources`](#querying) — como una máscara de subconjunto sobre la lista de venues.

## Reglas de fiabilidad

El agregador está diseñado para degradarse progresivamente en lugar de proporcionar datos erróneos. Por tick, en orden:

- **Obsolescencia por feed.** Un venue que no haya producido un nuevo print dentro de `feed_staleness_ms` (por defecto **60 s**) se trata como ausente para ese tick.
- **Rechazo de valores atípicos entre venues.** Un venue que se desvíe más de `feed_deviation_pct` (por defecto **5 %**) de la mediana entre venues se descarta antes de calcular la mediana ponderada — una defensa contra un único print congelado, en cero o con error tipográfico.
- **Renormalización sobre los supervivientes.** Los venues ausentes se tratan como peso 0 y los pesos restantes se renormalizan.
- **Retención por cobertura mínima.** Si **menos del 50 %** del peso total configurado está presente en un tick, el slot del oráculo **no se actualiza** — persiste el último valor válido. Este es el límite mínimo estricto que impide que uno o dos venues supervivientes definan el precio durante una interrupción generalizada de feeds.

Un venue cuyo peso se establece en 0 (p. ej., dado de baja para ese símbolo) simplemente nunca se consulta.

## Publicación

El `oracle_px` compuesto se publica **una vez por bloque**, derivado del timestamp de bloque de consenso (nunca del reloj del sistema), y es firmado por los validadores de oráculo del conjunto activo. Dado que la mediana, los filtros de obsolescencia/valores atípicos y el timestamp son todos derivados del consenso, cada validador honesto computa una **snapshot de oráculo idéntica byte a byte** para el bloque.

## Relación con el precio de marca y el financiamiento

- **Precio de marca.** El oráculo es el **ancla C1** del precio de marca: `C1 = oracle + EMA(book_mid − oracle)`. Sin libro interno y sin perps externos, el precio de marca se degrada hasta quedar igual al oráculo. Véase [precios de marca](./mark-prices.md).
- **Financiamiento.** El financiamiento es la diferencia entre el **precio de impacto** (precio del libro ponderado por profundidad) y el **oráculo**, y **se liquida contra el oráculo**. De forma importante, cuando el oráculo de un mercado está obsoleto o no es de confianza, el financiamiento de ese mercado *queda bloqueado* y decae hacia 0 en lugar de liquidarse contra un precio en el que nadie confía. Véase [tasas de financiamiento](./funding-rates.md#gating-when-the-oracle-is-untrusted).

## Consulta

El `oracle_px` compuesto se reporta en el **plano de USDC enteros** (p. ej. `"67042.335"`) mediante la lectura [`market_info`](../api/rest/info.md#market_info), junto con `mark_px`:

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

```json
{
  "type": "market_info",
  "data": {
    "asset_id":  0,
    "mark_px":   "67042.335",
    "oracle_px": "67042.335"
  }
}
```

El conjunto de fuentes comprometido por mercado es consultable mediante `oracle_sources` (el subconjunto de venues habilitadas para un mercado):

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"oracle_sources","asset_id":0}'
```

Las entradas brutas por venue y los pesos exactos utilizados en un tick se almacenan en el estado comprometido; aún no se exponen como campos de wire más allá del subconjunto de fuentes.

## Casos límite

<details>
<summary>Mostrar casos límite</summary>

- **Un venue con precio obsoleto.** Se descarta por el filtro de obsolescencia (> 60 s) o el filtro de valores atípicos (> 5 % de la mediana entre venues), el que se active primero; la mediana se calcula sobre los supervivientes.
- **Interrupción generalizada (< 50 % del peso presente).** El slot del oráculo conserva su último valor válido. El C1 del precio de marca sigue usando ese valor, de modo que el margen y la liquidación permanecen anclados en lugar de congelarse o ajustarse a un print de baja liquidez.
- **Mercado de cola larga no listado en los principales.** Comienza con la tabla por defecto (que en su mayor parte no resuelve nada) hasta que la gobernanza establece un override `SetOracleWeights` por símbolo apuntando a las venues que sí lo listan.
- **Oráculo spot en buen estado pero los perps divergen.** Normal — el perp puede cotizar con una prima o descuento persistente respecto al spot. El oráculo (spot) se mantiene; el precio de marca se mueve con el perp a través de C2/C3 y la EMA de base C1. Véase [marca vs oráculo](./mark-prices.md#mark-vs-oracle--why-they-diverge).

</details>

## Véase también

- [Precios de marca](./mark-prices.md) — el oráculo es el ancla C1 del precio de marca
- [Tasas de financiamiento](./funding-rates.md) — el financiamiento es precio de impacto vs oráculo, liquidado contra el oráculo
- [MIP-3 — despliegue de perp sin permisos](../mip/mip-3.md) — por qué existen los pesos de oráculo por símbolo

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿El oráculo es lo mismo que el precio de marca?**
R: No. El oráculo es una referencia puramente externa al spot. El precio de marca es una *composición* resistente a la manipulación que combina el oráculo con el libro de MetaFlux y los mids de perps externos. Coinciden cuando el perp sigue al spot y divergen cuando el perp lleva una base. Véase [precios de marca](./mark-prices.md).

**P: ¿Pueden los operadores del oráculo mover mi precio de liquidación?**
R: Un precio de marca basado únicamente en el oráculo lo permitiría. Es exactamente por eso que el precio de marca es una mediana de tres componentes: el oráculo es solo uno de los tres, por lo que un feed manipulado queda en minoría a menos que el libro y los perps externos también se muevan con él.

**P: ¿Qué venues determinan el precio de un mercado dado?**
R: La tabla de 10 venues por defecto, salvo que la gobernanza haya establecido un override por símbolo. Consulta `oracle_sources` para obtener el subconjunto comprometido de un mercado específico.

</details>
