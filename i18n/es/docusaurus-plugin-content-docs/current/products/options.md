---
description: Opciones en MetaFlux — un mercado de calls/puts en cadena planificado. Solo intención general; la especificación del contrato y la interfaz de comunicación aún no están finalizadas.
---

# Opciones

:::info
**Planificado — aún no especificado.** Las opciones en cadena están en la hoja de ruta de MetaFlux, pero la especificación del contrato (estilo de liquidación, vencimientos, cuadrícula de strikes, margen y las acciones de la interfaz `/exchange`) **no está finalizada ni es pública**. Esta página describe únicamente la intención. Se completará con la mecánica concreta cuando el diseño se publique a través de una MIP. No construyas sobre ella todavía — no hay una interfaz de comunicación comprometida.
:::

## Qué es una opción

Una **opción** es un contrato que otorga al titular el derecho — pero no la obligación — de comprar (una **call**) o vender (una **put**) un activo subyacente a un **precio de ejercicio** fijo en o antes de un **vencimiento**. El comprador paga una **prima** por adelantado; el vendedor (emisor) cobra la prima y asume la obligación. Las opciones permiten a los operadores expresar visiones direccionales, de volatilidad y de cobertura con una pérdida máxima definida y acotada por la prima para los compradores.

## Dirección prevista en MetaFlux

El objetivo es un **mercado de opciones totalmente en cadena** que reutilice la infraestructura existente de la plataforma donde tenga sentido — el [libro de órdenes](../concepts/order-types.md) y el motor de emparejamiento, las [carteras de agente](../concepts/agent-wallets.md) para la firma, los [precios de marca/oráculo](../concepts/mark-prices.md) para la valoración y la liquidación, y la pila de [margen y liquidación](../concepts/tiered-liquidation.md) para colateralizar las posiciones emitidas. Si el vencimiento es en efectivo o físico, el calendario de vencimientos y el modelo de margen exacto son preguntas de diseño abiertas que aún se están resolviendo.

:::caution
Hasta que se publique la especificación, considera como no confirmado cualquier contenido más allá de esta página sobre las opciones de MetaFlux. La definición general anterior es estándar en finanzas; la mecánica específica de MetaFlux aún no está decidida.
:::

## Comisiones

**Aún no definidas.** Cuando las opciones estén disponibles, las comisiones de negociación seguirán el [marco de comisiones](../concepts/fees.md) de la plataforma — las tasas exactas de maker/taker y cualquier cargo basado en prima o liquidación forman parte de la especificación inacabada y se publicarán junto con ella.

## Véase también

- [Perpetuos](./perpetuals.md) — el mercado de derivados apalancados disponible hoy
- [Conceptos](../concepts/index.md) — la mecánica compartida sobre la que se construirán las opciones
- [Propuestas de mejora](../mip/index.md) — donde se especifican los nuevos tipos de mercado
