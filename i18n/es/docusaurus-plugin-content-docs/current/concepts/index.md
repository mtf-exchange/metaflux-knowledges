---
description: Mecanismos fundamentales — carteras de agente, margen, liquidación, tipos de orden, bóvedas, comisiones y el glosario.
---

# Conceptos

Explicaciones en lenguaje claro de los mecanismos fundamentales de MetaFlux — qué hacen, cómo utilizarlos y qué esperar en situaciones de estrés.

## Orden de lectura para integradores

1. [Carteras de agente](./agent-wallets.md) — delegación de hot-key, la configuración estándar para creadores de mercado
2. [Tipos de orden](./order-types.md) — TIF, STP, órdenes condicionales, TWAP, escala
3. [Modos de margen](./margin-modes.md) — Cruzado / Aislado / Aislado-Estricto
4. [Precios de marca](./mark-prices.md) — qué impulsa el margen, la liquidación y las órdenes condicionales
5. [Liquidación escalonada](./tiered-liquidation.md) — T0 tarjeta amarilla → T4 ADL
6. [Tasas de financiación](./funding-rates.md) — pago horario entre usuarios
7. [Comisiones](./fees.md) — niveles de maker/taker + quema
8. [Calendario de comisiones](./fee-schedule.md) — niveles por volumen, rebate de maker y descuento por staking
9. [Subcuentas](./sub-accounts.md) — aislamiento de estrategia y riesgo
10. [Margen de cartera](./portfolio-margin.md) — margen estilo SPAN entre activos

## Earn y productos relacionados

Los mercados negociables ahora están en [Productos](../products/index.md) — consulta
[Perpetuos](../products/perpetuals.md), [Spot](../products/spot.md) y
[Spot con margen](../products/spot-margin.md). El fondo de liquidez que financia los
préstamos de spot con margen es un concepto:

- [Earn](./earn.md) — **planificado**: fondo de préstamos en USDC que financia los préstamos de spot con margen
- [Spot](../products/spot.md) — **activo**: CLOB token por token, saldo reservado en custodia, sin apalancamiento
- [Spot con margen](../products/spot-margin.md) — **vista previa en devnet**: spot apalancado financiado por el fondo Earn

:::info
**Solo el spot sin apalancamiento cumple con la Sharia.** Únicamente el trading
spot **sin apalancamiento** — comprar y vender a valor íntegro, sin apalancamiento,
sin margen, sin préstamos y sin financiación — es el producto de MetaFlux
generalmente considerado compatible con los principios de las finanzas islámicas
(Sharia). Los productos no conformes incluyen explícitamente el **spot con margen
(trading spot apalancado)**, junto con los futuros perpetuos y cualquier otro
producto apalancado o derivado — el apalancamiento y los préstamos introducen
interés (riba), especulación e incertidumbre (maysir, gharar). Consulta [Trading
spot](../products/spot.md). Esta información es de carácter informativo y no
constituye asesoramiento religioso ni financiero.
:::

## Avanzado

- [ADL](./adl.md) — matemáticas del desapalancamiento automático T4
- [Multi-sig](./multi-sig.md) — M-de-N institucional
- [Bóvedas](./vaults.md) — MFlux Vault + bóvedas de usuario
- [Staking](./staking.md) — delegar MTF, obtener recompensas
- [RFQ](./rfq.md) — solicitud de cotización para grandes volúmenes
- [FBA](./fba.md) — emparejamiento por subasta por lotes frecuente
