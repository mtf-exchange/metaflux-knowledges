# MIP-6 — Mercados de resultados / predicción

:::info
**Aplazado a V3.** Fuera del alcance de v1 y v2. Renumerado desde MIP-4.
:::

MIP-6 es el mecanismo de **mercados de resultados / predicción** de MetaFlux — mercados
on-chain donde los usuarios operan sobre la resolución de resultados binarios o categóricos
(el análogo de la propuesta de mejora de mercados de predicción en plataformas on-chain
consolidadas). Es una capacidad futura, aplazada a **V3**.

## Por qué existe con un número separado

Los Resultados estaban **originalmente numerados como MIP-4**. Cuando el proyecto reutilizó
MIP-4 para el [Agregador/Internalizador de Liquidez de Perps](./mip-4.md), el concepto de
Resultados fue renumerado a **MIP-6** y desplazado de V2 al backlog de V3. Asignarle un
número nuevo evita la confusión de reutilizar MIP-4 para dos mecanismos no relacionados.
No debe referirse a Resultados como "MIP-4".

## Por qué está aplazado

- Es una capacidad de menor prioridad: los derivados / contratos perpetuos son el campo
  de batalla principal, y los ingresos minoristas del agregador MIP-4 superan ampliamente
  la oportunidad que ofrecen los Resultados.
- La liquidación de Resultados agrega complejidad de compensación que el núcleo del
  protocolo no requiere de otro modo: depende de resolución por oráculos externos,
  ventanas de tiempo y manejo de disputas.
- Los mercados de predicción conllevan sensibilidad regulatoria específica por jurisdicción,
  que es preferible abordar una vez que el protocolo principal haya madurado.

Cuando Resultados sea lanzado, lo será como MIP-6 con su propio diseño de resolución /
oráculo / disputas — ninguno de los cuales se reserva de forma anticipada hoy.

## Ver también

- [MIP-4 — agregador/internalizador de liquidez de perps](./mip-4.md) — la propuesta
  que tomó el número MIP-4.
