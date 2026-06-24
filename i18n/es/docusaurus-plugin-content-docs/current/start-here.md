---
description: Una introducción en lenguaje sencillo a MetaFlux para nuevos usuarios — qué es, qué puedes hacer y los conceptos esenciales que conviene conocer antes de operar.
---

# MetaFlux 101 — Empieza aquí

:::info
**¿Nuevo en MetaFlux?** Esta página no requiere conocimientos previos de criptomonedas ni de
derivados. Al terminar entenderás qué es MetaFlux, qué puedes hacer en
él hoy, y los pocos conceptos que vale la pena conocer antes de tu primera operación.
:::

## Qué es MetaFlux

MetaFlux es un **exchange abierto y en cadena** — un mercado donde puedes operar,
que funciona íntegramente sobre una red pública en lugar de dentro de los servidores
privados de una sola empresa. Piensa en un exchange tradicional como en un edificio con
una trastienda cerrada bajo llave: tienes que confiar en quien guarda las llaves. MetaFlux
se parece más a un libro de contabilidad público que cualquiera puede leer y que ninguna
parte controla de forma exclusiva. Las reglas están fijadas en el software, cada operación
queda registrada de manera abierta, y tú mantienes la custodia de tus propios fondos.

Al vivir en cadena, MetaFlux es **transparente** (cualquiera puede verificar lo que
ocurrió), **abierto** (cualquiera puede conectarse, construir sobre él o listar un mercado) y
**siempre disponible** (lo operan muchos operadores independientes, no una sola empresa que
pueda apagar el interruptor). Te conectas con una billetera de criptomonedas, depositas
fondos y operas — sin solicitud de cuenta, sin intermediarios.

## Qué puedes hacer hoy

- **Operar futuros perpetuos.** Toma una posición sobre si el precio de un activo
  subirá o bajará, con apalancamiento opcional, sin necesidad de poseer el activo
  en sí. (Más adelante explicamos qué significa "perpetuo".)
- **Operar al contado.** Compra y vende los propios activos, liquidados contra tu
  saldo (solo saldo — sin apalancamiento aún).
- **Mantener posiciones bidireccionales (cobertura)** — mantén abiertas al mismo tiempo
  una posición larga y una corta en el mismo mercado. Consulta el [modo cobertura](concepts/hedge-mode.md).

Y próximamente:

- **Genera rendimiento sobre USDC inactivo** a través de [Earn](concepts/earn.md), un grupo de
  préstamos que paga intereses.
- **Operaciones al contado con apalancamiento** (margen spot), disponible junto con Earn. Consulta
  [margen spot](products/spot-margin.md).

Para la lista completa de productos de trading y su estado — perpetuos, spot, margen spot
y las líneas planificadas de opciones y CDS — consulta [Productos](products/index.md).

## Los conceptos clave que debes conocer

No necesitas ser un experto para empezar, pero unas pocas ideas harán que todo
encaje. Cada una enlaza a una explicación más detallada.

**Perpetuo vs. al contado.** *Al contado* es el tipo de operación más sencillo: intercambias un
activo por otro y eres propietario del resultado. Un *futuro perpetuo* ("perp") es un contrato
que sigue el precio de un activo para que puedas beneficiarte de sus movimientos — al alza o a
la baja — sin poseerlo, y sin fecha de vencimiento, por lo que la posición permanece abierta
mientras la mantengas en buen estado. Los perps son la forma en que se realiza la mayor parte
del trading con apalancamiento en MetaFlux.

**El libro de órdenes.** Es la lista en tiempo real de todas las ofertas de compra y venta de un
mercado, ordenadas por precio. Cuando tu oferta de compra coincide con la oferta de venta de
alguien al mismo precio, se ejecuta una operación. Una *orden de mercado* toma el mejor precio
disponible en ese momento; una *orden límite* espera al precio que tú fijes. MetaFlux admite
muchos [tipos de órdenes](concepts/order-types.md) además de estos básicos.

**Apalancamiento y margen.** El *margen* es la garantía que depositas para respaldar una posición.
El *apalancamiento* permite que esa garantía controle una posición más grande — con un apalancamiento
de 10x, un depósito de $100 puede sostener una posición de $1,000. El apalancamiento amplifica
tanto las ganancias **como** las pérdidas, así que es tan poderoso como arriesgado. La forma en
que tu garantía se comparte o se aísla entre posiciones es tu *modo de margen* — consulta
[modos de margen](concepts/margin-modes.md).

**Liquidación.** Si una posición apalancada se mueve en tu contra lo suficiente como para que
tu garantía ya no pueda cubrirla, la posición se cierra automáticamente para evitar que la
pérdida continúe. Esto es la *liquidación*. MetaFlux utiliza un proceso de
[liquidación escalonada](concepts/tiered-liquidation.md) gradual — con aviso temprano y
pasos parciales en lugar de un cierre repentino total — para dar a las posiciones margen de
recuperación.

**Tasas de financiación.** Un perpetuo no tiene vencimiento, por lo que un pequeño pago periódico
mantiene su precio anclado al precio real de mercado. Cuando hay más operadores en largo, los
largos pagan a los cortos; cuando hay más en corto, los cortos pagan a los largos. Esta es la
[tasa de financiación](concepts/funding-rates.md), y se paga directamente entre operadores, no
al exchange.

**Precio mark.** En lugar de confiar en la última operación — que una sola orden grande o errática
podría distorsionar — MetaFlux valora tus posiciones usando una referencia robusta y resistente
a la manipulación llamada [precio mark](concepts/mark-prices.md).
Es lo que determina tu margen, tu nivel de liquidación y tus pérdidas y ganancias no realizadas.

:::tip
**La versión corta:** deposita *margen*, usa opcionalmente *apalancamiento* para aumentar
el tamaño de tu posición, vigila la salud de tu posición frente al *precio mark* y evita
la *liquidación*. El [glosario](concepts/glossary.md) define cada término que encontrarás.
:::

## Qué hace a MetaFlux distintivo

- **Completamente en cadena y transparente.** Cada orden, operación y liquidación queda
  registrada en un libro de contabilidad público que cualquiera puede verificar. No hay
  emparejamiento oculto ni vista privilegiada del libro — las mismas reglas se aplican a todos.
- **Abierto y sin permisos.** Cualquiera puede conectar una billetera y operar, crear herramientas
  y aplicaciones encima, o incluso listar un nuevo mercado — sin necesidad de aprobación. Consulta
  [despliegue de mercado sin permisos](mip/mip-3.md).
- **Resiliente por diseño.** MetaFlux es validado por un conjunto distribuido de operadores
  independientes en lugar de una sola empresa. No hay un único interruptor que apagar, ningún
  punto único de fallo y ningún operador que pueda congelar tus fondos.
- **Rápido.** MetaFlux está diseñado para alta capacidad de procesamiento y baja latencia, de modo
  que operar se siente ágil incluso bajo alta carga.

La verdadera ventaja radica en la *capacidad*, no en el precio: MetaFlux invierte en
microestructura de mercado avanzada, modelos sofisticados de riesgo y margen, y una capa de
ejecución de alto rendimiento — para que la plataforma pueda soportar estrategias y protecciones
que venues más simples no pueden ofrecer. Lo verás reflejado a lo largo de la sección
[conceptos](concepts/).

## Cómo empezar

:::info
**¿Solo quieres operar?** Conecta una billetera compatible y comienza desde la página
[redes e IDs de cadena](networks.md) para apuntar tu billetera a la red y los
endpoints correctos.
:::

- **Elige una red.** [Redes e IDs de cadena](networks.md) lista los endpoints de devnet,
  testnet y mainnet junto con sus IDs de cadena. Empieza en una red de prueba si quieres
  practicar sin arriesgar fondos reales.
- **¿Construyendo o ejecutando un bot?** El
  [inicio rápido de integración](integration/quickstart.md) para desarrolladores te guía
  desde el depósito hasta la operación y el retiro en pocos minutos.
- **Elige un SDK.** Los clientes listos para usar en
  [TypeScript](integration/typescript-sdk.md) y
  [Rust](integration/rust-sdk.md) gestionan la firma y el formato de mensajes por ti.

## A dónde ir después

- Explora la sección [Conceptos](concepts/) para obtener explicaciones en lenguaje sencillo de
  cada mecanismo central.
- ¿Nuevo en términos de derivados? El [Glosario](concepts/glossary.md) los define todos.
- ¿Listo para construir? Dirígete a las guías de [Integración](integration/).
