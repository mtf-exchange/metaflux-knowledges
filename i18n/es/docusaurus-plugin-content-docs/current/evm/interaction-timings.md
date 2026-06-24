# Tiempos de interacción

:::tip
**Activo en devnet.** La cadencia de bloques y los tiempos de interacción — los retrasos de las acciones CoreWriter y la materialización de créditos Core→EVM — funcionan tal como se describe. La cadencia y los límites podrían ajustarse antes del lanzamiento.
:::

Cuánto tarda cada interacción EVM↔Core, para que un bot pueda razonar sobre las ventanas de confirmación.

## Cadencia de bloques

Un único bloque unificado por ronda de consenso, con una cadencia **inferior al segundo** — no existe una vía lenta separada, por lo que las operaciones de trading, las transferencias, las llamadas CoreWriter, las lecturas de precompilados Y el despliegue de contratos se confirman en la misma ronda. `block.timestamp` se deriva del consenso (consulta [Modelo de ejecución](execution-model.md)).

## EVM → Core (CoreWriter)

1. El contrato llama a `sendRawAction`; la llamada consume gas y emite `RawAction`
   de inmediato.
2. La L1 consume la acción tras un breve **retraso de acción** (se encola, no se
   aplica en el mismo instante) y luego la aplica al estado de Core.
3. **No existe acuse de recibo en el lado EVM** — el contrato debe observar el
   resultado en Core (por ejemplo, a través de la API o una lectura posterior de precompilado), no a partir del valor de retorno de `sendRawAction`.

Implicación de diseño: trata una acción CoreWriter como **disparar y confirmar después**, nunca como una llamada síncrona.

## Core → EVM (créditos)

Un crédito Core→EVM (`SpotCredit` / `BridgeMint`) se materializa como una pseudo-transacción de sistema en un bloque **posterior**, ordenada por ronda L1 y acotada por una porción elástica de gas de sistema por bloque (consulta
[Transferencias Core ↔ EVM](core-evm-transfers.md)). **No** es visible en el mismo bloque que la desencadenó; espera que aparezca en un número reducido de bloques.

## Lecturas de precompilados

Las lecturas de precompilados mediante `staticcall` retornan dentro del bloque que realiza la llamada. Actualmente los precompilados de lectura son ayudantes de **cotización sin estado** (calculan sobre los datos que el llamante proporciona); las **lecturas respaldadas por el estado activo de Core** (que consultan directamente las posiciones o el libro de órdenes de la cadena) están próximas, momento en el que una lectura reflejará el estado de Core en el bloque de la llamada.

## Véase también

- [Modelo de ejecución](execution-model.md)
- [Transferencias Core ↔ EVM](core-evm-transfers.md)
- [Interactuando con Core](interacting-with-core.md)
