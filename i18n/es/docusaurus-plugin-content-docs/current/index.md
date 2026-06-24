---
description: Referencia de integración, superficie de API y conceptos fundamentales del exchange de derivados MetaFlux.
slug: /
---

<img src="/img/og.svg" alt="MetaFlux — derivatives, on first principles" class="hero-banner" />

# Base de conocimiento de MetaFlux

Bienvenido. Comienza aquí si estás **integrando** o **construyendo sobre** MetaFlux.

:::info
**¿Es tu primera vez?** Empieza con la [Guía de inicio rápido](./integration/quickstart.md) (5 minutos: depósito → operación → retiro).
**¿Migrando desde otro DEX de perpetuos?** Ve directamente a [Migración desde HL](./integration/migrating-from-hl.md) — los patrones son aplicables a otros bots compatibles con HL.
**¿Construyendo on-chain?** Consulta el [despliegue de mercado sin permisos MIP-3](./mip/mip-3.md).
:::

## Explorar

<div class="mtf-cardgrid">

- [**Referencia de API**](./api/) — REST `/exchange` · `/info`, compatibilidad con HL y CCXT, WebSocket, errores, límites de tasa
- [**Conceptos**](./concepts/) — margen, liquidación por niveles, tipos de órdenes, financiación, bóvedas, comisiones
- [**Integración**](./integration/) — inicio rápido, firma, idempotencia, manejo de errores, SDKs
- [**EVM**](./evm/) — modelo de ejecución, transferencias Core ↔ EVM, precompilaciones
- [**Propuestas de mejora**](./mip/) — despliegue spot/perpetuo, metaliquidez, earn
- [**Bridge**](./bridge/) — puente de activos firmado por validadores

</div>

## Enlaces rápidos

- [Inicio rápido](./integration/quickstart.md) — depósito → operación → retiro en 5 minutos
- [Migración desde HL](./integration/migrating-from-hl.md) — reemplazo directo para bots compatibles con HL
- [`POST /exchange`](./api/rest/exchange.md) — ruta de escritura + catálogo completo de acciones
- [`POST /info`](./api/rest/info.md) — ruta de lectura
- [Liquidación por niveles](./concepts/tiered-liquidation.md) — escala T0 → T4
- [Glosario](./concepts/glossary.md)

La barra lateral izquierda es el índice completo; las tarjetas de arriba son el acceso rápido.

## Convenciones

- Los endpoints documentados aquí son la superficie de comunicación **estable y pública**.
- Los ejemplos de solicitud/respuesta utilizan estructuras reales — seguros para copiar y pegar.
- Los campos de precio y cantidad son enteros de punto fijo (escala de 8 decimales); los importes en USDC usan unidades base de 6 decimales. Ambos se transmiten como cadenas JSON para evitar la pérdida de precisión de IEEE-754.
- Todos los tiempos en los campos `_ts` / `_ms` son milisegundos Unix (derivados del consenso).

## Leyenda de estado

Cada documento incluye una etiqueta de "Estado" en la parte superior:

- **stable** — la estructura de comunicación está confirmada para V1; es seguro construir sobre ella.
- **preview** — funciona hoy; pueden producirse cambios menores antes del lanzamiento en mainnet (se indican expresamente).
- **planned** — descrito, pero aún no implementado.

Consulta [versioning](./versioning.md) para conocer la política de control de cambios.
