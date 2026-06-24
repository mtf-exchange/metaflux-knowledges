# Modelo de ejecución

:::tip
**En vivo en devnet.** El modelo de bloque unificado — un bloque por ronda de consenso y ejecución en estratos de conflicto paralelos — está operativo y probado. La cadencia y los valores de gas podrían ajustarse antes del lanzamiento. El [puente](../bridge/) está activo.
:::

La EVM de MetaFlux produce **un bloque unificado por ronda de consenso** — no existen tamaños de bloque "pequeño" y "grande" separados. Dentro de cada bloque, la ejecución se divide en **estratos de conflicto paralelos**, de modo que el rendimiento escala con los núcleos disponibles y **cada clase de transacción — incluidas las implementaciones de contratos — se confirma en la misma ronda de sub-segundo**.

## Un bloque, estratos paralelos

- **Un bloque por ronda de consenso** a una cadencia de sub-segundo. No existe un carril de bloque pesado de 60 segundos: una implementación de contrato o un asentamiento voluminoso aterriza en el siguiente bloque inmediato, junto con el flujo de trading — no tras una espera de un minuto.
- Las transacciones del bloque se agrupan en **estratos** según sus conjuntos de acceso de lectura/escritura. Las transacciones independientes se ejecutan **de forma concurrente**; las que presentan conflictos se ejecutan en orden. El rendimiento agregado es `presupuesto por carril × anchura paralela`, por lo que escala con los núcleos disponibles en lugar de depender de un nivel de gas fijo por bloque.
- La partición es **orientativa** — solo determina qué se ejecuta en paralelo. El resultado confirmado (estado + raíz de estado) lo produce la misma ejecución determinista que una reproducción en orden simple, por lo que es **idéntico en cada nodo honesto** independientemente del número de núcleos o de la planificación de hilos.

## Formación de bloques

`ASSEMBLE → PARTITION → EXECUTE → COMMIT`:

1. **Assemble** — Los créditos de Core→EVM (envíos spot a destinatarios en el lado EVM, acuñaciones del puente) se colocan primero, luego las transacciones de usuario en el orden canónico de consenso.
2. **Partition** — Las transacciones se agrupan en estratos de conflicto mediante una regla derivada del contenido que cada nodo recalcula de forma idéntica.
3. **Execute** — Los estratos se ejecutan en paralelo bajo el ejecutor Block-STM. Un conjunto de acceso mal estimado es detectado por la revalidación del conjunto de lectura y se vuelve a ejecutar, de modo que la corrección nunca depende de la partición — solo la velocidad sí.
4. **Commit** — Las escrituras finalizadas se confirman en orden de índice de transacción; la raíz de estado se toma sobre el estado confirmado.

## Gas y comisiones

- Un **límite de gas agregado por bloque** (techo anti-DoS) más un **límite de gas por transacción**. El límite por transacción absorbe el antiguo rol del bloque pesado: las implementaciones y operaciones `CREATE` obtienen un límite alto **en cada bloque**; las operaciones ordinarias de trading tienen un límite bajo.
- Un único mercado de tarifa base **EIP-1559**; la tarifa base se **quema**. El presupuesto de gas del bloque es **elástico** — se amplía bajo carga sostenida y se reduce en reposo — con un **suelo mínimo** fijo, de modo que la capacidad en el peor caso nunca cae por debajo de un nivel base predeterminado.
- La cadencia la marca la frecuencia de las rondas de consenso; `block.timestamp` se deriva del consenso (determinista — no depende del reloj del sistema).

## Trading resistente a MEV (opcional, por mercado)

La microestructura de mercado es una preocupación de primer orden, por lo que la resistencia a MEV es una propiedad de la **construcción del bloque**, no un añadido del mercado de comisiones — y es opcional por mercado:

- Un mercado en modo **subasta por lotes frecuentes (FBA)** recoge sus intenciones de órdenes de una ronda en **un único lote atómico** que liquida a un **único precio uniforme**. No existe prioridad intra-lote para el front-running, el sandwiching carece de sentido (todos obtienen el mismo precio) y la carrera de latencia no mueve el precio.
- Las intenciones de órdenes pueden estar **cifradas con umbral** — su contenido permanece oculto para el proponente del bloque hasta que el orden ya ha sido confirmado.
- Las transacciones que una subasta no puede cubrir reciben un **ordenamiento justo verificable** (una semilla derivada del hash del bloque padre y su número), eliminando la discrecionalidad del proponente en el ordenamiento.
- Los mercados operan de forma predeterminada en **modo continuo** (ampliamente compatible con las expectativas estándar de EVM) y pueden activar el modo FBA por mercado de forma individual, por lo que el despliegue es incremental y reversible.

La liquidación se ejecuta en el motor de emparejamiento de MetaFlux Core; el bloque EVM **sincroniza** su flujo de intenciones de trading con esa subasta — existe exactamente **una** ruta de liquidación, no una duplicada dentro de la EVM.

## Niveles de confirmación

- Confirmación **final** (de consenso) en cada ronda — el único nivel que entra en el estado confirmado.
- Opcionalmente puede exponerse un **acuse de recibo provisional** para UX sensible a la latencia; este acuse **no** forma parte del consenso. Las acciones que implican riesgo — acuñaciones del puente, retiros — dependen únicamente de la confirmación **final**.

## Véase también

- [Interactuar con Core](interacting-with-core.md) — precompilaciones (lectura) + CoreWriter (escritura)
- [Transferencias Core ↔ EVM](core-evm-transfers.md)
- [Tiempos de interacción](interaction-timings.md)
