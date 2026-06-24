---
description: CDS en MetaFlux — un mercado de protección al estilo de swap de incumplimiento crediticio previsto para el futuro. Solo describe la intención general; la especificación del contrato y la interfaz de comunicación aún no están finalizadas.
---

# CDS

:::info
**Previsto — aún sin especificar.** Un mercado de protección al estilo de swap de incumplimiento crediticio (CDS) figura en la hoja de ruta de MetaFlux, pero la especificación del contrato (eventos de referencia, calendario de primas, garantías, liquidación y diseño de oráculos/resolución, así como las acciones de la interfaz `/exchange`) **no está finalizada ni es pública**. Esta página describe únicamente la intención. Se completará con mecánicas concretas cuando el diseño se publique bajo un MIP. No construyas sobre esta base todavía — no existe ninguna interfaz de comunicación comprometida.
:::

## Qué es un CDS

Un **swap de incumplimiento crediticio (CDS, por sus siglas en inglés)** es un contrato en el que el **comprador** de protección paga una prima periódica al **vendedor** de protección; a cambio, el vendedor compensa al comprador si se produce un **evento crediticio** definido sobre una entidad u obligación de referencia (por ejemplo, un incumplimiento de pago). Es, en la práctica, un seguro contra un evento crediticio: el comprador transfiere el riesgo de impago al vendedor a cambio de una prima continua.

## Dirección prevista en MetaFlux

El objetivo es un **mercado de protección en cadena** que, al igual que el resto de MetaFlux, reutilice las primitivas de la plataforma donde encajen: el [libro de órdenes](../concepts/order-types.md) para el descubrimiento de precios en las primas, las [carteras de agentes](../concepts/agent-wallets.md) para la firma de operaciones, y el sistema de [margen y liquidación](../concepts/tiered-liquidation.md) para garantizar la obligación del vendedor de protección. Las preguntas de diseño más difíciles son las mismas que hacen que los productos crediticios en cadena sean escasos: **cómo se define y resuelve un evento crediticio en cadena** (oráculo, ventanas de tiempo, gestión de disputas) — estrechamente relacionado con el mecanismo de resolución que la propuesta diferida de [Outcomes / mercados de predicción](../mip/mip-6.md) también debe resolver. Nada de esto está acordado aún.

:::caution
Hasta que la especificación se publique, considera cualquier información más allá de esta página sobre el CDS de MetaFlux como no confirmada. La definición general anterior es estándar en finanzas; las mecánicas específicas de MetaFlux aún no están decididas.
:::

## Comisiones

**Aún sin definir.** Cuando se lance un mercado CDS, las comisiones seguirán el [marco de comisiones](../concepts/fees.md) de la plataforma — la estructura de primas y cualquier cargo por liquidación de eventos de protección forman parte de la especificación incompleta y se publicarán junto con ella.

## Véase también

- [Perpetuos](./perpetuals.md) — el mercado de derivados apalancados activo hoy en día
- [Conceptos](../concepts/index.md) — las mecánicas compartidas sobre las que se construiría un mercado CDS
- [MIP-6 — Outcomes / mercados de predicción](../mip/mip-6.md) — el problema relacionado de resolución en cadena
- [Propuestas de mejora](../mip/index.md) — donde se especifican los nuevos tipos de mercado
