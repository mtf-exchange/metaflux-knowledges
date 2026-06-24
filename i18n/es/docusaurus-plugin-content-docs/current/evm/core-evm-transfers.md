# Transferencias Core ↔ EVM

:::tip
**Disponible en devnet.** Las acciones de transferencia de valor EVM→Core (`SpotSend`, `SendAsset`,
`UsdClassTransfer`, `VaultTransfer` a través de CoreWriter) y la materialización de créditos Core→EVM
están operativas y han sido probadas. El [puente](../bridge/) (custodia entre cadenas) está activo.
:::

El valor se mueve entre **Core** (el sistema de liquidación L1 / libro mayor spot) y el lado **EVM**
en dos direcciones. Ambas son deterministas y están delimitadas por cuenta.

## EVM → Core (a través de CoreWriter)

Un contrato introduce valor en Core enviando una acción L1 a través de
[CoreWriter](interacting-with-core.md#writing-to-core--corewriter) (`0x3333…3333`).
La cuenta actuante es el contrato que realiza la llamada (`msg.sender`):

| Acción | Efecto |
|--------|--------|
| `SpotSend` | Transfiere un token spot a otra cuenta en Core |
| `SendAsset` | Transferencia genérica de activos (clases perp / spot / vault) |
| `UsdClassTransfer` | Mueve USDC entre las cuentas de clase perp y spot |
| `VaultTransfer` | Depósito en / retiro de un vault |

Estas acciones están sujetas a la regla de atomicidad de CoreWriter: la llamada consume gas y emite
`RawAction`; cualquier fallo posterior en el lado L1 es **silencioso** (sin reversión en EVM).

## Core → EVM (pseudotransacciones del sistema)

Cuando un efecto de inicio de bloque L1 debe aterrizarse en el lado EVM — por ejemplo, un envío spot
cuyo destinatario es una dirección EVM, o una acuñación de entrada por puente — se encola y materializa
como una **pseudotransacción del sistema determinista en el siguiente bloque EVM**:

| Operación | Origen | Escala de cantidad |
|-----------|--------|--------------------|
| `SpotCredit` | un saldo spot L1 acreditado a un destinatario EVM de 20 bytes | punto fijo `1e8` |
| `BridgeMint` | una acuñación de entrada de [MetaBridge](../bridge/) (p. ej. USDC) | `1e6` (nativo de USDC) |

Orden y rendimiento:

- Se encolan por **ronda L1**, se drenan en orden de ronda ascendente, FIFO dentro de una ronda —
  de modo que dos validadores materializan las mismas operaciones en el mismo orden (determinismo).
- Cada operación se factura con un costo de **gas del sistema** y se drena contra una **cuota elástica
  de gas del sistema por bloque** (que escala con el presupuesto de gas del bloque); las operaciones
  sobrantes se pasan al siguiente bloque. Se espera que los créditos Core→EVM lleguen en un número
  reducido de bloques, no de forma instantánea en el mismo bloque en que fueron desencadenados.

## Entre cadenas (una superficie distinta)

`CrossChainSend` (acción CoreWriter 19) **no** mueve valor al EVM local —
encola un retiro hacia el [puente de custodia MetaBridge](../bridge/), que
se libera en la cadena de destino (Base / Solana) mediante una cofirma de ⅔ de los validadores
tras una ventana de disputa.

## Véase también

- [Interacción con Core](interacting-with-core.md)
- [Tiempos de interacción](interaction-timings.md)
- [Puente](../bridge/)
