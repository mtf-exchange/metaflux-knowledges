---
description: Los productos de trading que MetaFlux ofrece — contratos perpetuos, spot, spot con margen, y las líneas de opciones y CDS planificadas — con su estado actual y enlaces para leer más.
---

# Productos

Los distintos **productos de trading** que ofrece MetaFlux. Cada uno es un tipo de mercado independiente con su propio libro de órdenes, saldos y modelo de riesgo; esta sección presenta qué es cada uno, su estado actual y enlaces a la mecánica completa. Para la maquinaria transversal que comparten — tipos de órdenes, margen, liquidación, comisiones — consulta [Conceptos](../concepts/index.md).

## Qué puedes operar

| Producto | Qué es | Estado |
|---|---|---|
| [Contratos perpetuos](./perpetuals.md) | Posición larga/corta apalancada sobre el precio de un activo, sin vencimiento, anclada mediante financiación | **Activo** |
| [Spot](./spot.md) | CLOB de token por token, liquidado contra tu saldo, sin apalancamiento | **Activo** |
| [Spot con margen](./spot-margin.md) | Spot apalancado financiado por el pool de préstamos de [Earn](../concepts/earn.md) | **Vista previa en Devnet** |
| [Opciones](./options.md) | Opciones on-chain (calls / puts) | **Planificado** |
| [CDS](./cds.md) | Contratos de protección al estilo credit default swap | **Planificado** |

Los **contratos perpetuos** son el mercado predeterminado y donde ocurre la mayor parte del trading apalancado — las tasas de financiación, los precios mark, los modos de margen y el esquema de liquidación por niveles asumen contratos perpetuos salvo que se indique lo contrario. **Spot** es la línea base que opera únicamente con saldo. **Spot con margen** es la capa de apalancamiento opcional sobre spot, con el pool de [Earn](../concepts/earn.md) como lado oferente de préstamos. **Opciones** y **CDS** están planificados y aún no tienen una superficie de API definida — consulta sus páginas para conocer el estado actual.

:::info
**El spot sin apalancamiento es compatible con la ley islámica.** Entre los productos aquí descritos, solo el [spot](./spot.md) **sin apalancamiento** — compra y venta directa a valor completo, **sin apalancamiento, sin margen, sin préstamos y sin financiación** — se considera generalmente compatible con los principios de las finanzas islámicas (Sharia). Los productos no compatibles incluyen explícitamente el **spot con margen (trading spot apalancado)**, los **futuros perpetuos** y cualquier otro producto apalancado o derivado — el apalancamiento y los préstamos introducen interés (riba), especulación e incertidumbre (maysir, gharar). Esta información es orientativa y no constituye asesoramiento religioso ni financiero.
:::

## Véase también

- [Conceptos](../concepts/index.md) — la mecánica compartida: [tipos de órdenes](../concepts/order-types.md), [modos de margen](../concepts/margin-modes.md), [tasas de financiación](../concepts/funding-rates.md), [liquidación por niveles](../concepts/tiered-liquidation.md), [comisiones](../concepts/fees.md)
- [`/exchange`](../api/rest/exchange.md) — las acciones de API detrás de cada producto
- [Empieza aquí](../start-here.md) — una introducción en lenguaje sencillo para nuevos usuarios
