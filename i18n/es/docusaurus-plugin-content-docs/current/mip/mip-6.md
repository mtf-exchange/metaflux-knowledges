# MIP-6 — Mercados de resultados / predicción

:::info
**Aplazado a V3.** No está en el alcance de v1 ni v2. Renumerado desde MIP-4.
:::

MIP-6 es el mecanismo de **mercados de resultados / predicción** de MetaFlux — mercados
on-chain donde los usuarios operan sobre la resolución de resultados binarios o
categóricos (el análogo a la propuesta de mejora de mercados de predicción en plataformas
on-chain consolidadas). Es un eje de diferenciación futuro, aplazado a **V3**.

## Por qué existe con un número propio

Outcomes fue **numerado originalmente como MIP-4**. Cuando el proyecto reasignó MIP-4
al [Agregador / Internalizador de Liquidez de Perps](./mip-4.md), el concepto de
Outcomes fue renumerado a **MIP-6** y trasladado del backlog de V2 al de V3.
Asignarle un número nuevo evita la confusión de reutilizar MIP-4 para dos mecanismos
no relacionados. No se debe hacer referencia a Outcomes como "MIP-4".

## Por qué está aplazado

- Es un eje de diferenciación de menor prioridad: los derivados / perps son el
  principal campo de batalla, y los ingresos minoristas del agregador MIP-4 superan
  ampliamente la oportunidad que representa Outcomes.
- La liquidación de Outcomes añade complejidad de compensación que el núcleo del
  protocolo no requiere de otro modo: depende de la resolución por oráculos externos,
  ventanas de tiempo y gestión de disputas.
- Los mercados de predicción conllevan una sensibilidad regulatoria específica por
  jurisdicción, que es preferible abordar una vez que el protocolo principal haya
  madurado.

Cuando Outcomes se lance, lo hará como MIP-6 con su propio diseño de resolución /
oráculo / disputas — ninguno de los cuales se reserva anticipadamente hoy.

## Ver también

- [MIP-4 — agregador / internalizador de liquidez de perps](./mip-4.md) — la propuesta
  que tomó el número MIP-4.
