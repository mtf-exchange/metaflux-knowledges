# MIP-2 — Metaliquidity

:::info
**En curso.** El vault está desplegado en cadena; la estrategia de creación de mercado se ejecuta fuera de cadena.
:::

Metaliquidity es el **vault de provisión de liquidez** del protocolo y la comunidad de MetaFlux: el núcleo de liquidez nativa, análogo a las propuestas de provisión automatizada de liquidez en plataformas on-chain consolidadas. Los proveedores de liquidez depositan USDC en el vault y participan en el PnL de una estrategia de creación de mercado que publica órdenes en los libros de órdenes. Proporciona la liquidez en reposo contra la que operan los tomadores, de modo que los mercados no dependan exclusivamente de creadores de mercado externos desde el primer día.

## Qué está en cadena vs fuera de cadena

Una separación deliberada mantiene la superficie de consenso reducida:

- **En cadena — solo el vault.** Capital LP agrupado, contabilidad de participaciones, NAV
  (marcado a mercado contra el oráculo), un bloqueo de retiro y una lista blanca de
  direcciones de proveedores reconocidos.
- **Fuera de cadena — la estrategia.** La lógica de creación de mercado (cotización, gestión
  de inventario) se ejecuta como un cliente MTF nativo ordinario: una clave de estrategia incluida en la lista blanca firma órdenes **en nombre de la cuenta del vault** y las envía a través de la ruta normal de órdenes firmadas. Ninguna lógica de estrategia está integrada en el consenso.

## Para los proveedores de liquidez

- **Deposita** USDC de forma sin permisos y recibe participaciones del vault con precio al
  NAV actual (`efectivo + marcado a mercado de las posiciones abiertas del vault`).
- **Retira** canjeando participaciones por su cuota del NAV, sujeto a un bloqueo de retiro de **7 días** desde tu depósito más reciente.
- Tus participaciones se aprecian o deprecian con el PnL realizado y no realizado de la estrategia — existe riesgo de mercado; esto no es una garantía de rendimiento.

## Lista blanca de proveedores

Las direcciones de proveedores Metaliquidity reconocidas forman una **lista**, inicializada en la génesis y modificable mediante gobernanza. Solo una dirección incluida en la lista blanca puede operar un vault Metaliquidity y estar autorizada a operar con el capital agrupado; los depósitos permanecen abiertos a cualquier persona.

## Estado e historial

Metaliquidity suministra la liquidez nativa en el libro de órdenes que un proveedor de propiedad del protocolo está destinado a impulsar en sus inicios. El vault de protocolo equivalente a HLP fue originalmente diferido tras el lanzamiento (a V2) en favor de creadores de mercado externos; se ha adelantado porque la liquidez nativa en reposo se necesita antes de lo que ese plan preveía. El vault en cadena está disponible ahora; la estrategia fuera de cadena y la semilla de la lista blanca de proveedores se incorporan junto con él.
