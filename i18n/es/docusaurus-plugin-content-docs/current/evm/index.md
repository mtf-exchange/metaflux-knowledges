# EVM

:::tip
**Activo en devnet.** La ejecución de EVM y las acciones de CoreWriter están operativas, al igual que las precompilaciones estáticas de derivados MTF (`0x0900`–`0x0904`). Las precompilaciones de lectura respaldadas por el estado del Core (que consultan directamente las posiciones y el libro de órdenes de la cadena) y las precompilaciones entre cadenas están próximamente. El [puente](../bridge/) está activo.
:::

El EVM de MetaFlux es una **cadena lateral** basada en [revm](https://github.com/bluealloy/revm) que ejecuta contratos Solidity convencionales y expone el **Core** de MetaFlux — la cámara de compensación de contratos perpetuos L1 y el CLOB on-chain — a dichos contratos: una capa de ejecución EVM conectada directamente al L1 contra el que liquida.

## Diferencias respecto a un EVM estándar

- **Bloque unificado, estratos paralelos** — un bloque por ronda de consenso (sub-segundo); sus transacciones se reparten en estratos de conflicto paralelos, de modo que el rendimiento escala con los núcleos disponibles e incluso el despliegue de contratos se confirma en el siguiente bloque (sin carril de bloque pesado de 60 segundos). Consulta el [Modelo de ejecución](execution-model.md).
- **Acceso al Core integrado** — los contratos leen el Core mediante **precompilaciones del sistema** y escriben en el Core a través del contrato del sistema **CoreWriter**. Consulta [Interactuando con el Core](interacting-with-core.md).
- **Determinista** — marcas de tiempo inyectadas por consenso, sin números en coma flotante, ejecución paralela con un estado confirmado equivalente al secuencial.
- **Quema de comisión base EIP-1559** hacia una dirección de quema coinbase.

## Páginas

| Página | Contenido |
|------|------|
| [Modelo de ejecución](execution-model.md) | Bloque unificado, estratos de conflicto paralelos, gas/comisiones, operaciones resistentes al MEV |
| [Interactuando con el Core](interacting-with-core.md) | Ruta de escritura del CoreWriter (las 20 acciones) y las precompilaciones de lectura |
| [Transferencias Core ↔ EVM](core-evm-transfers.md) | Mover valor entre el Core y el EVM (y entre cadenas) |
| [Tiempos de interacción](interaction-timings.md) | Cuándo se aplica efectivamente una acción de CoreWriter o un crédito de Core→EVM |

## Direcciones del sistema (resumen)

| Dirección | Función |
|---------|------|
| `0x3333…3333` | **CoreWriter** — envía acciones L1 (`sendRawAction`) |
| `0x0900`–`0x0904` | precompilaciones de lectura de derivados (margen, NAV, ADL, mark-settle, RFQ) |
| `0x0906`–`0x0908` | precompilaciones de lectura de datos de mercado (BBO, profundidad L2, riesgo de inventario) |
| `0x0a01`–`0x0a02` | precompilaciones entre cadenas (envío / verificación) |

## JSON-RPC

`eth_*` JSON-RPC estándar en `POST /evm` en el gateway; la cadena reporta su propio identificador mediante `eth_chainId` (consulta [Redes e identificadores de cadena](../networks.md)). Los contratos desplegables se encuentran en el repositorio público [`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts).
