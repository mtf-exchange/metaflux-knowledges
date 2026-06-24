---
description: El modelo económico del token MTF — utilidad, oferta, asignación, emisión, el ciclo de acumulación de valor, economía del staking y alcance de la gobernanza.
---

# Tokenomics

:::info
**El modelo definitivo.** La capa de **utilidad** (gas, descuentos por staking, consenso,
gobernanza y recompra-y-quema impulsada por comisiones) está **ya construida y activa** —
el núcleo de valor del token. Los **parámetros económicos** (oferta total, asignación,
calendario de desbloqueo, el modelo de emisión vinculado a la población, la distribución
de la recompra y la curva del multiplicador de staking) están **finalizados** y
documentados a continuación. Los valores de nivel y la distribución de la recompra son
parámetros de red que la gobernanza puede ajustar posteriormente; la oferta total está
vinculada a la población de China y se revincula anualmente mediante votación de los validadores.
:::

## Resumen

**MTF** es el token nativo de MetaFlux — una L1 proof-of-stake independiente que
ejecuta un núcleo DEX de perpetuos y una sidechain EVM. MTF cumple cinco funciones:

1. **Gas** — paga la ejecución en la sidechain EVM de MetaFlux.
2. **Descuento de comisiones** — hacer staking de MTF descuenta tu comisión de taker por nivel.
3. **Seguridad** — el MTF en staking es la garantía que asegura el consenso.
4. **Gobernanza** — el MTF en staking es el peso de voto sobre los parámetros del protocolo.
5. **Acumulación de valor** — las comisiones netas del protocolo compran MTF en el mercado abierto; el **70% de cada recompra se quema**, vinculando la escasez del token al volumen del exchange.

El marco económico es **deflación impulsada por comisiones**. Las comisiones netas de trading (tras los reembolsos a makers) compran MTF en el mercado abierto; el MTF recomprado se divide en **70% quemado, 20% para validadores que lo trasladan a sus stakers como reparto de ingresos, 10% tesorería**.
El staking — especialmente el staking de tipo **vote-escrow con bloqueo temporal** — genera un descuento de comisión **y una parte de esa recompra**, retirando oferta de la circulación y poniéndola en manos de participantes a largo plazo que aseguran la cadena. Los beneficios de los niveles superiores son **ponderados por tiempo**: cuanto más bloquees, mayor será tu peso efectivo, nivel de descuento y parte del reparto de ingresos. Un canal **flexible (sin bloqueo)** ofrece a los market makers el descuento básico de comisión sin bloqueo ni reparto de ingresos. La oferta total es
**1.404.890.000 MTF**, **vinculada a la población de China** y re-vinculada mediante una votación anual de validadores — acuñando si la población creció, quemando MTF de la tesorería si disminuyó — de modo que la oferta sigue a la población en lugar de permanecer en un techo fijo. La recompra-y-quema por comisiones es una fuerza deflacionaria **independiente** adicional.

## Utilidad del token

Todo lo que figura en esta sección está **activo**, no es una propuesta. Estos son los
destinos y fuentes existentes que confieren valor al token.

### 1. Gas en la sidechain EVM

MTF es el token de gas de la sidechain EVM de MetaFlux. Es un activo de **18 decimales**
en la capa de ejecución EVM — cada despliegue de contrato y transacción en la sidechain
se mide y paga en MTF, exactamente como ETH mide el EVM en su cadena nativa. El núcleo
DEX y la sidechain EVM comparten el mismo activo nativo, por lo que la demanda de cómputo
en cadena es demanda de MTF.

### 2. Staking → descuento de comisión de taker

Hacer staking de MTF otorga un **descuento en tu comisión de trading de taker**, escalado
mediante una escalera administrativa de diez peldaños con hasta un **50%** de descuento en taker:

| Grado | Descuento de taker |
|-------|---------------:|
| Jefe de Sección (Alcalde de Municipio)            | 5%  |
| Subjefe de Sección                                | 8%  |
| Jefe de División (Jefe de Condado)                | 12% |
| Subjefe de División                               | 15% |
| Director General (Alcalde)                        | 20% |
| Subdirector General                               | 25% |
| Ministro (Gobernador)                             | 32% |
| Viceministro (Vicegobernador)                     | 35% |
| Consejero de Estado / Viceprimer Ministro         | 40% |
| Primer Ministro / Presidente / Secretario General *(#1)* | 50% |

Solo el grado más alto — **Primer Ministro / Presidente / Secretario General** (la única
cuenta #1 por peso efectivo) — tiene **cupo limitado y es competitivo**; todos los demás
grados, incluidos todos los grados de **Subdirector** y **Ministro (Gobernador)**, son umbrales
puros sin cupo. El puesto se reasigna en tiempo real a medida que los pesos cambian. Los
umbrales completos y las reglas de puesto se encuentran en el
[Baremo de comisiones](./fee-schedule.md#3-staking-discount-tiers-mtf-staked).

El descuento se aplica **solo a la tasa de taker** y se acumula con los niveles de comisión
basados en volumen y los niveles de reembolso a maker. El nivel de descuento **básico** está
disponible para todos los stakers, incluidos los **flexibles (sin bloqueo)** — el canal
deliberado para los market makers de alta frecuencia que necesitan capital desbloqueado.
Los niveles **superiores** se basan en tu **peso efectivo ponderado por tiempo**, por lo
que cuanto más bloquees, mayor será tu peso y mayor el nivel que alcanzarán los mismos
tokens (consulta [Staking ponderado por tiempo](#staking-ponderado-por-tiempo-estilo-ve)
más abajo para la curva del multiplicador y los umbrales de peso). El baremo completo
y las reglas de acumulación están en la página del
[Baremo de comisiones](./fee-schedule.md#3-staking-discount-tiers-mtf-staked). Esta
es la razón directa y mecánica por la que un trader activo mantiene y hace staking de MTF:
se amortiza sola gracias a la reducción de los costes de trading.

### 2b. Staking → reparto de ingresos en MTF

Además del descuento de comisión, los stakers **con bloqueo** reciben un **reparto de ingresos** pagado en
**MTF**. Se entrega a través del canal de validadores: el **20% de cada recompra**
(MTF recomprado con ingresos netos de comisiones) va a los validadores, quienes lo
distribuyen entre sus **stakers / delegadores**. Tu parte es proporcional a tu
**peso efectivo ponderado por tiempo**, por lo que los bloqueos más largos generan una
parte desproporcionadamente mayor.

El reparto de ingresos **requiere un bloqueo de al menos 1 mes** — los stakers flexibles
(sin bloqueo) obtienen **0** de reparto (siguen recibiendo el descuento de comisión básico).
Esto no es un fondo de comisiones independiente: es el 20% del MTF recomprado que
corresponde a los validadores, que lo trasladan a quienes hicieron staking con ellos.
Consulta [Acumulación de valor y ciclo de retroalimentación](#acumulación-de-valor-y-ciclo-de-retroalimentación)
para la distribución completa de la recompra.

### 3. Staking → seguridad de consenso (proof-of-stake)

MetaFlux es una cadena proof-of-stake. El MTF en staking **es** la garantía de los
validadores. Los validadores se auto-vinculan con MTF y aceptan delegaciones; el conjunto
activo de validadores, el peso de propuesta de bloques y el peso de voto en el consenso
derivan todos de la garantía comprometida. El comportamiento incorrecto es penalizado
(doble firma, tiempo de inactividad, votar un fork inválido), por lo que el presupuesto de
seguridad de la cadena está denominado en MTF y respaldado por él. Consulta
[Staking](./staking.md) para el modelo validador/delegador, penalizaciones y el ciclo
de vida del desbloqueo.

### 4. Staking → peso de gobernanza

El MTF en staking es el **peso de voto** en la gobernanza del protocolo. Los parámetros
de red — niveles de comisión, tasa de emisión, parámetros de riesgo, listas blancas de
vaults, listados de mercados — se modifican mediante votos en cadena ponderados por
garantía. Consulta el [Alcance de la gobernanza](#gobernanza) más abajo.

### 5. Acumulación de valor por comisiones → recompra y luego quema

Las comisiones de trading del protocolo se convierten en MTF y luego se distribuyen.
Tras pagar primero los reembolsos a makers y los créditos de referidos/constructores
**antes que nada**, **todos** los ingresos netos restantes de comisiones se utilizan para
**comprar MTF en el mercado abierto**. El MTF recomprado se divide luego en **70% quemado
/ 20% para validadores (que lo trasladan a sus stakers) / 10% tesorería**. Así, el
volumen de trading genera una presión de compra real y recurrente sobre MTF, y el
**70% de cada recompra se destruye para siempre**, mientras que el 20% se convierte en el
reparto de ingresos de los stakers y el 10% financia la tesorería.

Esta es la piedra angular del modelo: **no** es una quema de oferta abstracta, sino
que los ingresos reales del exchange compran MTF en el mercado y luego destruyen los
tokens adquiridos. La tasa de deflación es una función directa del volumen de trading.
El flujo paso a paso completo y la distribución se encuentran en
[Acumulación de valor y ciclo de retroalimentación](#acumulación-de-valor-y-ciclo-de-retroalimentación);
la mecánica de comisiones está en la página de [Comisiones](./fees.md#burn-buyback-and-burn).

## Oferta y asignación

:::info
**Definitivo.** La oferta total y la asignación en el génesis que se indican a continuación
están finalizadas. El total en el génesis es **1.404.890.000 MTF** — **vinculado a la
población de China** — distribuido entre los tres bloques de la tabla. El total se
**re-vincula anualmente mediante votación de los validadores** (consulta
[Emisión e inflación](#emisión-e-inflación)).
:::

### Oferta total

**Oferta total en el génesis: 1.404.890.000 MTF — vinculada a la población de China**
(equivale a la población de China en 2026).

El token **no tiene un techo fijo.** Su **objetivo de oferta es la población de China**,
y se **re-vincula una vez al año mediante una votación de gobernanza de los validadores**:
si la población creció, los validadores votan para **acuñar** nuevos MTF; si disminuyó,
votan para **quemar** MTF de la tesorería — de modo que la oferta total sigue a la
población actual a lo largo del tiempo. La cifra de población de cada año es la
**mediana entre varias fuentes autorizadas del gobierno central chino** (mediana, por
lo que una fuente atípica no puede mover la vinculación). El mecanismo completo se
encuentra en [Emisión e inflación](#emisión-e-inflación).

La **recompra-y-quema** impulsada por comisiones es una **fuerza deflacionaria
independiente y separada**: la población es el **objetivo** de oferta (fijado por la
re-vinculación anual), mientras que la recompra elimina continuamente MTF de la
circulación por encima de ese objetivo. Las dos son distintas — una es la re-vinculación
anual de la población con MTF de la tesorería, la otra es la quema impulsada por volumen.

Notas:

- **Margen de maniobra de gas con 18 decimales.** Como token de gas EVM con 18 decimales,
  los ~1.400 millones de unidades nominales dejan una granularidad suficiente para que las
  transacciones ordinarias en la sidechain cuesten una fracción pequeña y limpia de un token.
- **Escala de la escalera de staking.** Los grados de descuento de comisión y los umbrales
  de peso efectivo ponderado por tiempo (Jefe de Sección…Primer Ministro / Presidente /
  Secretario General) están denominados en tokens/peso; frente a una oferta de ~1.400 millones,
  el umbral del grado más alto (10.000.000) es una pequeña fracción de la oferta, alcanzable
  por una firma seria y comprometida, que es la señal pretendida.

### Asignación en el génesis

| Asignación | Porcentaje | Tokens | Bloqueo / calendario de desbloqueo | Propósito |
|------------|------:|-------:|------------------|---------|
| **Airdrop TGE** | 30% | 421.467.000 | Distribuido **en el TGE en la mainnet de MetaFlux** (tras la conclusión de los 6 meses de testnet) | Distribuido entre traders activos, market makers y titulares del programa de puntos. El evento de distribución a la comunidad. |
| **Colaboradores principales** | 20% | 280.978.000 | **1 año de bloqueo total (cliff)**, luego **6 años de desbloqueo lineal** | Fundadores y colaboradores principales. Ningún token de colaboradores se desbloquea en el primer año; un período lineal de 6 años a continuación. |
| **Tesorería / Comunidad / Ecosistema / Validadores** | 50% | 702.445.000 | Fondo combinado; liberado mediante gobernanza | Un único fondo a largo plazo que cubre la tesorería del protocolo, los incentivos a la comunidad y el ecosistema, el seed del vault de liquidez propiedad del protocolo y el bootstrap de recompensas de validadores / staking. **También es la fuente/destino para la re-vinculación anual de la población** (acuñar en / quemar de este fondo). |
| **Total** | **100%** | **1.404.890.000** | | |

Notas:

- **Distribución de mayoría comunitaria.** El mayor bloque individual (50%) es el fondo
  combinado de tesorería / comunidad / ecosistema / validadores, y con el airdrop del 30%
  del TGE, el **80% de la oferta está alineada con la comunidad y el protocolo**. La
  asignación a colaboradores es del 20%, el bloque más pequeño.
- **Airdrop TGE en mainnet.** El airdrop del 30% se distribuye en el evento de generación
  de tokens en la **mainnet de MetaFlux**, que sigue a la conclusión de la fase de testnet
  de 6 meses. Está dirigido a participantes demostrados — traders activos, market makers
  y titulares del programa de puntos — en lugar de una reclamación abierta.
- **Los colaboradores están bloqueados por más tiempo.** Los colaboradores principales
  tienen un **cliff de 1 año** (cero desbloqueos en el primer año) seguido de **6 años
  de desbloqueo lineal** — un período excepcionalmente largo que mantiene al equipo
  alineado mucho después del lanzamiento.
- **Un único fondo combinado a largo plazo.** La tesorería, los incentivos a la comunidad
  y el ecosistema, el seed del vault de liquidez y el bootstrap de validadores/staking
  se financian desde un único fondo del 50% liberado mediante gobernanza, en lugar de
  dividirse previamente en sub-asignaciones fijas. Esto mantiene la asignación legible y
  permite a la gobernanza dirigir el fondo donde sea necesario (incentivos, liquidez,
  seguridad) a medida que el venue madura (consulta
  [Acumulación de valor y ciclo de retroalimentación](#acumulación-de-valor-y-ciclo-de-retroalimentación)
  y [MIP-2 Metaliquidity](../mip/mip-2.md)).

### Trayectoria de la oferta en circulación

```text
total génesis        : 1.404.890.000 MTF (vinculado a la población de China)
TGE (mainnet)        : airdrop del 30% distribuido; porciones del fondo del 50%
                       crean liquidez / incentivos tempranos según gobernanza
año 1               : el cliff de los colaboradores se mantiene — CERO desbloqueos
                       de colaboradores; las liberaciones del fondo impulsan el
                       crecimiento inicial de la circulación
vence el cliff del año 1: comienza el desbloqueo lineal a 6 años de los colaboradores
años 2–7            : el desbloqueo lineal de colaboradores se completa en seis años;
                       las liberaciones del fondo continúan solo con votación de gobernanza
re-vinculación anual : los validadores votan para acuñar (si la población creció) o
                       quemar MTF de la tesorería (si disminuyó), re-vinculando la oferta
                       total a la cifra de población mediana del año
estado estable       : el float neto DISMINUYE a medida que la recompra-y-quema
                       supera los desbloqueos residuales, las liberaciones del fondo
                       y cualquier acuñación de re-vinculación
```

La intención de diseño es que, mucho antes de que se complete el desbloqueo de 6 años
de los colaboradores, el **sumidero de recompra-y-quema elimine oferta más rápido de
lo que los desbloqueos restantes, las liberaciones del fondo gobernado y cualquier
acuñación de re-vinculación anual la añaden**, de modo que la oferta en circulación
tienda a la baja en un volumen de estado estable. La re-vinculación de la población
mueve el **objetivo** de oferta lentamente (la población de China cambia en una fracción
de punto porcentual al año), mientras que la quema de la recompra es el sumidero
rápido impulsado por el volumen — las dos son independientes. Ese cruce es el objetivo
central del modelo.

## Emisión e inflación

:::info
**Oferta vinculada a la población, re-vinculada anualmente mediante votación de validadores.**
La oferta total no es un techo fijo — **sigue la población de China**, comenzando en
**1.404.890.000 MTF** en el génesis. Una vez al año, los validadores votan para **acuñar**
(si la población creció) o **quemar MTF de la tesorería** (si disminuyó) para re-vincular
la oferta a la cifra de población del año. Las recompensas de staking no se pagan por
dilución; la re-vinculación es un ajuste lento y gobernado del objetivo de oferta,
independiente de la recompra-y-quema impulsada por el volumen.
:::

### La vinculación a la población

La oferta total tiene como objetivo la **población de China** y se **re-vincula una vez
al año mediante una votación de gobernanza de los validadores**:

1. **Se toma la cifra de población del año** como la **mediana entre varias fuentes
   autorizadas del gobierno central chino**. La mediana (no una sola fuente, no una
   media) hace que la vinculación sea **robusta ante valores atípicos** — una fuente
   anómala no puede moverla.
2. **Los validadores votan para re-vincular.** Si la población mediana **creció**
   durante el año, los validadores votan para **acuñar** la diferencia en nuevos MTF;
   si **disminuyó**, votan para **quemar** esa cantidad de **MTF de la tesorería**.
   En cualquier caso, la oferta total se ajusta para coincidir con la nueva cifra de
   población.
3. **El flujo de acuñación/quema pasa por el fondo de tesorería** (el fondo combinado
   del 50%), por lo que la re-vinculación nunca toca los saldos de usuarios,
   colaboradores o stakers — solo la tesorería controlada por el protocolo.

Dado que la población de China varía solo en una fracción de punto porcentual al año,
la re-vinculación es un **pequeño y lento** ajuste anual al **objetivo** de oferta —
no una palanca de inflación recurrente que se activa para generar rendimiento.

### Las recompensas de staking no son dilutivas

Las recompensas de staking se pagan de dos fuentes, **ninguna de las cuales es la
re-vinculación de la población**:

1. El **bootstrap de recompensas de validadores / staking** financiado con el fondo
   combinado de tesorería/comunidad/ecosistema/validadores paga una APR con forma de
   curva de staking en el período inicial.
2. Una **parte de los ingresos por comisiones del protocolo** se canaliza a los stakers
   de forma continua (el rendimiento de staking financiado por comisiones y el
   [dividendo](#2b-staking--reparto-de-ingresos-en-mtf)), financiado por el volumen
   real del exchange.

La APR del período inicial sigue una **curva de staking** en lugar de una tasa fija:
es alta cuando poco está en staking (para arrancar la seguridad) y decae a medida que
el staking total crece, de modo que el presupuesto de recompensas no se agota
prematuramente. La forma es un techo plano en/por debajo de un staking mínimo, que
decae proporcionalmente a `1/√stake` por encima de él — es decir, más staking total
implica una parte menor por staker. La APR efectiva actual y sus parámetros comprometidos
son observables en la ruta de lectura en vivo de
[`staking_apr`](./staking.md#apr-estimation).

**La concesión que acepta esta elección.** El presupuesto de recompensas de bootstrap
es finito. Si los ingresos por comisiones no crecen para sostener el rendimiento antes
de que el presupuesto se consuma significativamente, la APR de staking nominal caerá.
Esto obliga a que el rendimiento sea **ganado por volumen**, no impreso — pero significa
que el presupuesto de recompensas inicial (extraído del fondo del 50%) debe dimensionarse
para cubrir la pista hasta que los ingresos por comisiones tomen el relevo. La
re-vinculación anual de la población **no** es una fuente de rendimiento: ajusta el
objetivo de oferta, no financia el staking.

### Por qué vinculado a la población en lugar de un techo fijo

La vinculación a la población otorga a MTF un **ancla de oferta legible y exógena** —
un número que nadie en el protocolo establece manualmente — mientras mantiene intacta
la tesis deflacionaria, porque la **recompra-y-quema es una fuerza independiente**
que elimina MTF de la circulación más rápido de lo que la lenta re-vinculación anual
puede añadirlo. El token es deflacionario por construcción a partir de la recompra;
la vinculación a la población simplemente mueve el objetivo hacia el que la recompra
se encoge.

La re-vinculación **no es inflación perpetua para generar rendimiento.** Acuñar un
porcentaje fijo de la oferta cada año para pagar a los validadores **lucharía
directamente contra el ciclo de recompra-y-quema** — quemando con una mano e
imprimiendo con la otra — y fue **rechazado**. La re-vinculación de la población es
diferente: es un ajuste pequeño, gobernado y bidireccional (también puede **quemar**
además de acuñar) vinculado a una cifra externa, no una dilución recurrente para
financiar recompensas. El rendimiento del staking se financia con el presupuesto de
bootstrap y los ingresos por comisiones, nunca con la re-vinculación.

## Acumulación de valor y ciclo de retroalimentación

El valor del token está vinculado a la actividad del exchange a través de un bucle de
refuerzo. La retroalimentación central es **volumen → comisiones → recomprar MTF →
70% quema / 20% para validadores (→ stakers) / 10% tesorería → escasez + rendimiento
de stakers**, con la seguridad PoS como el anillo estabilizador a su alrededor.

### Cómo los ingresos por comisiones se convierten en valor del token — el flujo

La ruta de acumulación de valor es una cadena de cuatro pasos limpia:

1. **Recaudar comisiones de trading.** Cada operación paga una comisión, denominada
   en el activo de cotización.
2. **Pagar primero los reembolsos a makers.** El subsidio de reembolso a makers
   se deduce **antes que nada** — se paga de las comisiones recaudadas antes que
   cualquier otra cosa (los créditos de referidos / constructores también se liquidan
   aquí). Lo que queda son los **ingresos netos de comisiones**.
3. **Recomprar MTF.** **Todos** los ingresos netos restantes de comisiones se utilizan
   para **comprar MTF en el mercado abierto**. Esta es una presión de compra real y
   recurrente proporcional al volumen del exchange — no existe un fondo de comisiones
   inactivo, la totalidad de los ingresos netos se convierte en MTF.
4. **Dividir el MTF recomprado** en tres partes:

| Destino | Porcentaje del MTF recomprado | Qué ocurre |
|-------------|-----------------------------:|--------------|
| **Quema** | **70%** | Destruido permanentemente — eliminado de la oferta para siempre. Deflación pura. |
| **Validadores → stakers** | **20%** | Distribuido a los validadores, que lo trasladan a **sus propios stakers / delegadores**. Este **es** el reparto de ingresos de los stakers — entregado a través del canal de validadores, no de un fondo separado. |
| **Tesorería** | **10%** | Reserva del protocolo, controlada por gobernanza. |

Así, el **70% de cada recompra se quema**, el 20% se convierte en el reparto de ingresos
de los stakers (pagado en MTF, canalizado a través de los validadores a sus delegadores)
y el 10% financia la tesorería. Como los inputs son MTF comprado, **las tres ramas
crean presión de compra primero**, y luego o destruyen el token (quema) o lo entregan
a participantes a largo plazo (stakers a través de validadores) y a la tesorería.

```text
            ┌──────────────┐    trading fees   ┌──────────────┐
            │   TRADERS    │ ────────────────▶ │   COLLECTED  │
            │  & volume    │                   │     FEES     │
            └──────────────┘                   └──────┬───────┘
                    ▲                                 │ pay maker rebates FIRST
                    │                                 ▼  (off the top)
                    │                          ┌──────────────┐
       lower taker  │                          │   NET FEE    │
       fees + MTF   │                          │   REVENUE    │
       revenue-share│                          └──────┬───────┘
                    │                                 │ buy MTF on the open market
                    │                                 ▼  (ALL of it)
                    │                          ┌──────────────┐
            ┌───────┴──────┐                   │ BOUGHT-BACK  │
            │   STAKERS    │                   │     MTF      │
            │  (locked,    │                   └──────┬───────┘
            │   via vals)  │           split:         │
            └───────┬──────┘     ┌──────────┬─────────┴────────┐
                    │            ▼          ▼                  ▼
       20% MTF      │      ┌──────────┐ ┌──────────┐    ┌──────────┐
       via          │      │ 70% BURN │ │   20%    │    │   10%    │
       validators ──┴──────│ (destroy)│ │VALIDATORS│    │ TREASURY │
                           └────┬─────┘ │→ STAKERS │    └──────────┘
                                │       └────┬─────┘
                                │ supply     │ MTF yield to
                                ▼ shrinks    │ long-term lockers
                          ┌────────────┐     │
                          │ SCARCITY / │◀────┘
                          │ TOKEN VALUE│
                          └────────────┘
```

Interpreta el ciclo como tres anillos de refuerzo:

1. **El anillo de quema (deflación).** El volumen genera comisiones; las comisiones
   netas compran MTF; el **70% del MTF comprado se quema**. Más volumen → más
   recompra → más quema → menos oferta → token más escaso. Esta es la ruta principal
   de acumulación de valor y ya está **activa**.

2. **El anillo de reparto de ingresos (flujo de caja para los bloqueadores).** El
   **20% del MTF recomprado** va a los validadores, que lo distribuyen entre
   **sus stakers / delegadores**. Este es el reparto de ingresos de los stakers —
   pagado **en MTF**, canalizado a través del validador. La parte de un staker escala
   con su participación en el fondo de un validador, y la posición de esa participación
   está **ponderada por tiempo** (consulta el [peso efectivo](#staking-ponderado-por-tiempo-estilo-ve)),
   por lo que los bloqueos más largos generan una parte mayor. Más volumen → mayor
   reparto de ingresos en MTF → mayor rendimiento real sobre el MTF bloqueado →
   incentivo más fuerte para adquirir y bloquear.

3. **El anillo de seguridad (PoS).** El MTF en staking asegura el consenso, y los
   validadores son el conducto para el reparto del 20% de ingresos — por lo que
   asegurar la cadena y ganar el reparto de ingresos son el **mismo acto**. A medida
   que el token se aprecia y se bloquea más para el descuento y el reparto de ingresos
   en MTF, el coste de atacar la cadena aumenta con el valor del token — un token
   más valioso es una cadena más segura, lo que hace que el venue sea más seguro para
   operar, lo que apoya el volumen.

El **vault de liquidez** de propiedad del protocolo ([MIP-2 Metaliquidity](../mip/mip-2.md))
se sitúa dentro del ciclo como acelerador: proporciona profundidad de libro de órdenes
desde el primer día para que el exchange pueda generar volumen — y por tanto comisiones
y quema — sin esperar a que lleguen market makers externos. Libros más ajustados →
más volumen → más quema.

El ciclo solo gira con **volumen real**. Ninguno de los anillos depende de la
emisión de tokens ni de la reflexividad especulativa para funcionar; son consecuencias
mecánicas de que la gente opere en el exchange.

## Staking

El staking está **activo**. Esta sección resume la economía desde una perspectiva de
tokenomics; el detalle operativo completo — acciones, selección de validadores,
penalizaciones, casos límite — está en la página dedicada de [Staking](./staking.md).

### Qué te ofrece el staking

| Beneficio | Fuente | Notas |
|---------|--------|-------|
| **Descuento de comisión de taker** | Escalera de diez grados por **peso efectivo ponderado por tiempo** | 5%→50% de descuento en taker, [Jefe de Sección→Primer Ministro / Presidente / Secretario General](./fee-schedule.md#3-staking-discount-tiers-mtf-staked) |
| **Reparto de ingresos en MTF** | **20% de cada recompra**, pagado en MTF a través de tu validador | Canalizado a través de los validadores a sus delegadores; ponderado por tu participación ponderada por tiempo |
| **Rendimiento de staking** | Bootstrap de recompensas (inicial) + parte de ingresos por comisiones (continuo) | APR con curva de staking, observable en vivo |
| **Peso de consenso** | Garantía de validador / delegación | Asegura la cadena, sujeto a penalizaciones |
| **Peso de gobernanza** | MTF en staking = peso de voto | Consulta [Gobernanza](#gobernanza) |

El **descuento de comisión** y el **reparto de ingresos en MTF** escalan ambos con tu
**peso efectivo ponderado por tiempo**, no con tu cantidad bruta de tokens — el
mecanismo se describe a continuación.

### Staking ponderado por tiempo (estilo ve)

La posición de staking está **ponderada por tiempo según la duración de bloqueo que
comprometiste por adelantado**. Tu posición no es tu cantidad bruta en staking sino
un **peso efectivo**:

```text
effective_weight = staked_amount × time_multiplier(committed_lock_duration)
```

Dos beneficios se leen de esto, pero tienen **diferentes puntos de entrada**:

- **El descuento de comisión de taker** está disponible para **todos los que hacen
  staking**, incluidos los stakers flexibles (sin bloqueo) — el nivel de descuento
  básico es la recompensa de nivel de entrada.
- **El reparto de ingresos en MTF (dividendo)** requiere un **bloqueo de al menos
  1 mes** — los stakers flexibles obtienen **0** de reparto de ingresos. Dentro del
  rango bloqueado, los bloqueos más largos generan una parte mayor.

#### La curva del multiplicador

| Modo de staking | `time_multiplier` (peso de dividendo) | Elegibilidad de descuento de comisión | Reparto de ingresos (dividendo) |
|------------|------------------------------------:|--------------------------|--------------------------|
| **Flexible / sin bloqueo** | **0×** | **Solo nivel básico** (descuento de nivel de entrada) | **Ninguno** — 0 peso de dividendo |
| **Bloqueo 1 mes** | **1,0×** | Escalera completa de niveles | El dividendo comienza aquí |
| **Bloqueo 6 meses** | **2,5×** | Escalera completa de niveles | Parte mayor |
| **Bloqueo 24 meses (tope)** | **4,0×** | Escalera completa de niveles | Parte máxima |

Entre los puntos marcados, el multiplicador aumenta con la duración comprometida;
**1 mes es la base del multiplicador bloqueado (1,0×)** y **24 meses es el tope (4,0×)**.

**El modo flexible / sin bloqueo es el canal de los market makers.** Los market makers
de alta frecuencia necesitan su capital desbloqueado y disponible para redistribuir —
no pueden comprometerse a un bloqueo de varios meses. Por ello, el staking flexible
les otorga deliberadamente el **descuento básico de comisión** en su flujo de taker
sin exigirles bloqueo, al coste de **cero reparto de ingresos**. El dividendo está
reservado para el capital que compromete tiempo; el capital flexible recibe un
descuento en comisiones pero no una parte de la recompra.

**La elegibilidad para el dividendo comienza en el bloqueo de 1 mes.** Por debajo de
un compromiso de 1 mes no hay ningún peso de dividendo. Desde 1 mes (1,0×) el peso
sube a 2,5× a los 6 meses y alcanza el tope de 4,0× a los 24 meses — por lo que
tanto los **niveles de descuento de comisión más altos** como la **parte del dividendo**
escalan según el tiempo que bloquees.

#### Cómo funciona el bloqueo

El mecanismo es el modelo estándar **vote-escrow (ve)** — **comprometerte por
adelantado, obtener el peso inmediatamente, no puedes salir antes**:

1. **Eliges una duración de bloqueo en el momento del staking** (1 mes … 24 meses,
   o flexible). Esa duración comprometida establece tu `time_multiplier` — y por lo
   tanto tu nivel y peso de dividendo — **inmediatamente**, no por tiempo transcurrido.
   Un staker que se compromete a un bloqueo de 6 meses tiene el peso de 6 meses (2,5×)
   desde el inicio; **no** espera 6 meses para alcanzarlo.

2. **El beneficio entra en vigor tras el período de activación universal de 24 horas** —
   el mismo período de activación que se aplica a todos los stakers. Así, un staker
   con bloqueo de 6 meses disfruta de su descuento (p. ej., Consejero de Estado /
   Viceprimer Ministro) y pleno peso de dividendo tras solo **24 horas**.

3. **El bloqueo es una restricción de salida anticipada.** A cambio del mayor peso,
   **no puedes deshacer el staking antes de que transcurra la duración comprometida**.
   El período de activación (24h, cuando el beneficio se activa) y la duración del
   bloqueo (el plazo antes del cual no puedes salir) son **dos cosas separadas**:
   24h para *activar*, el plazo elegido para *salir*.

Este es el diseño pionero de veCRV (Curve) — bloquear más tiempo, obtener más peso
y una mayor parte de las comisiones, inmediatamente al bloquear e irrevocable hasta
el vencimiento — y que se repite en los esquemas de tokens en custodia / puntos
multiplicadores en otros tokens DEX (p. ej., estilo esGMX en venues de clase GMX).
El modelo de MetaFlux aplica el multiplicador ve al **descuento de comisión y al
reparto de ingresos en MTF**, y reserva un canal flexible sin dividendo para los
market makers.

#### Umbrales de grado por peso efectivo

Los grados de descuento de comisión (y la asignación de dividendos, para stakers
bloqueados) se leen a partir de `effective_weight`, en la **misma escalera de diez
peldaños** que utiliza el baremo de comisiones — pero evaluados sobre el peso:

| Grado | Umbral de peso efectivo | Descuento de taker | Cupo de puestos |
|-------|---------------------------:|---------------:|----------|
| Jefe de Sección (Alcalde de Municipio)   | `> 100`        | 5%  | sin límite |
| Subjefe de Sección                        | `> 500`        | 8%  | sin límite |
| Jefe de División (Jefe de Condado)        | `> 2.000`      | 12% | sin límite |
| Subjefe de División                       | `> 8.000`      | 15% | sin límite |
| Director General (Alcalde)                | `> 30.000`     | 20% | sin límite |
| Subdirector General                       | `> 100.000`    | 25% | sin límite |
| Ministro (Gobernador)                     | `> 500.000`    | 32% | sin límite |
| Viceministro (Vicegobernador)             | `> 1.500.000`  | 35% | sin límite |
| Consejero de Estado / Viceprimer Ministro | `> 5.000.000`  | 40% | sin límite |
| Primer Ministro / Presidente / Secretario General | `> 10.000.000` **y clasificado #1 por peso** | 50% | **1 puesto** |

Aquí operan dos vías, igual que en el [baremo de comisiones](./fee-schedule.md#3-staking-discount-tiers-mtf-staked):
los grados de **Subdirector**, **Ministro (Gobernador)** y todos los grados por debajo
del más alto son **umbrales puros sin cupo**; solo **Primer Ministro / Presidente /
Secretario General** (el único #1) es un **puesto con cupo y competitivo** que se
reasigna en tiempo real. Los stakers flexibles (0×) alcanzan solo el **grado más bajo**
independientemente del umbral; los grados **superiores** requieren un bloqueo para que
`staked_amount × time_multiplier` supere el umbral (y, para el único grado con cupo,
una clasificación ganadora). Así, los **tokens en bruto solos no son suficientes para
los grados superiores** — deben comprometerse a un bloqueo suficientemente largo y,
para el grado más alto, también deben superar a los demás en clasificación.

#### Ejemplo práctico — corto / flexible NO sube; un bloqueo largo sí

La restricción estricta que el modelo está diseñado para satisfacer:

> Una ballena hace staking de **2.000.000 MTF** pero **no** se compromete a un bloqueo largo.

Una posición flexible o con bloqueo menor a 1 mes aporta **0× peso de dividendo** y se
mantiene en el **grado más bajo** — 2.000.000 tokens en bruto **no** superan los umbrales
de peso de los grados superiores sin un multiplicador de bloqueo:

```text
flexible:  2.000.000 × 0×   → 0 peso de dividendo, solo el grado más bajo (Jefe de Sección)
1 mes   :  2.000.000 × 1,0× = 2.000.000  → supera Viceministro (> 1.500.000)
                                            pero por debajo de Consejero de Estado (> 5.000.000)
                                          → Viceministro (35%)
```

Para ascender a **Consejero de Estado / Viceprimer Ministro** (40% de descuento de taker
**y** una parte de dividendo superior) con los **mismos** 2.000.000 tokens, la ballena
debe **comprometerse a un bloqueo de ≥ ~6 meses**, donde el multiplicador alcanza **2,5×**:

```text
effective_weight = 2.000.000 × time_multiplier(bloqueo 6 meses) = 2.000.000 × 2,5 = 5.000.000
```

5.000.000 **no** es estrictamente mayor que el umbral de `> 5.000.000`, por lo que un
peso ligeramente mayor (una participación un poco mayor o un bloqueo de 24 meses a 4,0×)
lo supera claramente hasta **Consejero de Estado / Viceprimer Ministro**. Es fundamental
que esto **no** sea "hacer staking y esperar 6 meses para ascender." Es **comprometerse
al bloqueo y alcanzar el grado tras el período de activación de 24 horas** — el grado
superior se otorga inmediatamente con el *compromiso*, no se gana por el tiempo
transcurrido. El precio es que los tokens queden entonces **bloqueados de forma firme
durante todo el plazo y no puedan desbloquearse antes**.

**El grado más alto añade un segundo obstáculo.** El único grado más alto — **Primer
Ministro / Presidente / Secretario General** (el único #1 por peso efectivo) — requiere
no solo superar el umbral sino **ganar el puesto**. Una ballena que supera `> 10.000.000`
sin ser #1 se mantiene en el grado **sin cupo** más alto que cumple (Consejero de Estado
/ Viceprimer Ministro). El puesto se reasigna en tiempo real a medida que los pesos
efectivos cambian.

Así, los grados superiores se **compran con un compromiso temporal, no solo con
tamaño** — y el más alto también exige un **rango competitivo**. Una ballena flexible
o con bloqueo corto queda limitada en niveles bajos y no gana dividendo; un staker
más pequeño que se compromete a un bloqueo más largo puede superarlos en clasificación
y obtener una parte del dividendo. El capital que se niega a bloquearse obtiene un
descuento en comisiones pero no una parte de la recompra — la propiedad anti-mercenaria
central del diseño ve, con un carril flexible deliberado para los market makers.

### Validadores vs delegadores

- Los **validadores** ejecutan un nodo de consenso, se auto-vinculan por encima de un
  mínimo, proponen y votan sobre bloques, y cobran una comisión de las recompensas de
  quienes delegan en ellos. Asumen la exposición completa a penalizaciones por mal
  comportamiento.
- Los **delegadores** tienen MTF, eligen un validador y ganan las recompensas de ese
  validador menos la comisión. Comparten la exposición proporcional a penalizaciones
  si su validador se comporta incorrectamente, pero no gestionan infraestructura.

### Modelo de tiempos del staking

Tres conceptos temporales distintos rigen el ciclo de vida del staking. Mantenlos
separados — son **cosas diferentes**:

| Concepto | Qué es | Establecido por | Mínimo |
|---------|------------|--------|:-----:|
| **Duración de bloqueo comprometida** | El plazo ve que **eliges en el momento del staking** — flexible, o 1 / 6 / hasta 24 meses. **No puedes deshacer el staking antes de que transcurra**; establece tu `time_multiplier` y por tanto tu nivel y peso de reparto de ingresos. **El peso de reparto de ingresos comienza en el bloqueo de 1 mes**; el flexible es 0×. | El staker, por posición de staking | flexible, si no ≥ 1 mes |
| **Período de activación** | El **retraso universal de 24 horas** antes de que tu beneficio (descuento de comisión + peso de reparto de ingresos) se active. Se aplica a **todos** los stakers independientemente de la duración del bloqueo. | Red (gobernanza) | ≥ 24h |
| **Período de enfriamiento de salida** (desvinculación) | Tras el vencimiento de tu bloqueo comprometido y la solicitud de deshacer el staking, un período de enfriamiento final antes de que el MTF sea retirado. | Red (gobernanza) | ≥ 24h |

Las duraciones establecidas por la red (período de activación, período de enfriamiento
de salida) son **votadas por gobernanza** pero tienen un límite mínimo fijo a nivel de
código de **24 horas** que nunca puede reducirse — la gobernanza puede aumentarlas por
encima de 24h, nunca por debajo.

**Las dos cosas que a menudo se confunden — activación vs bloqueo.** El **período de
activación** (24h, cuando tu beneficio se *activa*) y la **duración de bloqueo
comprometida** (el plazo antes del cual puedes *salir*) son **independientes**:

- Un staker que se compromete a un bloqueo de **6 meses** obtiene su descuento completo
  (p. ej., Consejero de Estado / Viceprimer Ministro) y pleno peso de reparto de
  ingresos **24 horas después del staking** — **no** espera 6 meses para el beneficio.
  Los 6 meses son solo el tiempo que está **impedido de deshacer el staking**.
- Un staker **flexible** (sin bloqueo) también se activa tras 24h, pero con **peso 0×**:
  solo el nivel de descuento **básico**, y **ningún** reparto de ingresos. Este es el
  carril de los market makers.

**Por qué no es manipulable.** Dado que el multiplicador mayor y cualquier reparto de
ingresos requieren comprometerse a un bloqueo **irrevocable** del que no puedes salir
antes, un trader no puede obtener un nivel alto e inmediatamente retirar sus tokens —
los niveles superiores y el dividendo solo están disponibles para el capital que acepta
el bloqueo. El período de activación de 24h adicionalmente bloquea el flash-staking
en un solo bloque alrededor de una operación. Juntos, mantienen una parte significativa
de la oferta bloqueada firmemente y fuera de la circulación, y garantizan que solo el
stake genuinamente comprometido con el tiempo alcance los niveles superiores y el
reparto de ingresos.

### Estados de bloqueo y desvinculación

| Estado | ¿Genera beneficios? | ¿Sujeto a penalizaciones? |
|-------|:---------------:|:----------:|
| Activando (primeras 24h tras el staking) | aún no | sí |
| Activo y bloqueado (dentro del plazo comprometido) | sí | sí |
| Desvinculando (tras el vencimiento del bloqueo, período de enfriamiento de salida) | no | sí (hasta madurar) |
| Desvinculado (reclamable) | no | no |

### De dónde proviene el rendimiento

Dos fuentes, en orden de dominancia a lo largo de la vida de la cadena:

1. **Inicial:** el bootstrap de recompensas de staking financiado con el fondo combinado
   de tesorería/comunidad/ecosistema/validadores, que paga una APR con curva de staking
   que es alta cuando poco está en staking y decae a medida que el staking crece.
2. **Continuo — el reparto de ingresos en MTF.** El **20% de cada recompra** (MTF
   recomprado con ingresos netos de comisiones) va a los validadores, que lo distribuyen
   entre sus **stakers bloqueados / delegadores**, ponderado por peso efectivo ponderado
   por tiempo. Este es el dividendo; se financia con el volumen real del exchange, no
   por dilución, y crece con el venue. **Solo stakers bloqueados (≥ 1 mes)** — los
   stakers flexibles obtienen el descuento de comisión pero ningún reparto de ingresos.

Así, a medida que el volumen escala, el sistema transiciona de rendimiento financiado
por bootstrap a rendimiento financiado por reparto de ingresos **sin emisión dilutiva**
— el rendimiento se paga en MTF que el protocolo compró en el mercado abierto, nunca
de la re-vinculación de la población. Los validadores son el conducto, por lo que
asegurar la cadena y ganar el reparto de ingresos son el mismo acto.

## Gobernanza

El MTF en staking es el **peso de voto en la gobernanza**. La gobernanza es el volante
de dirección del protocolo en cadena; los votos se ponderan por participación y se
ejecutan por la cadena cuando superan el umbral requerido.

### Alcance de la gobernanza

La gobernanza mueve **parámetros del protocolo**, no fondos de usuarios. Dentro del
alcance:

- **Parámetros de comisiones** — los niveles de comisión por volumen, los niveles de
  reembolso a maker, la escalera de descuento por staking y la distribución de la
  comisión del protocolo (las partes de quema / validador / tesorería).
- **Emisión y recompensas** — la tasa de recompensas de staking y los parámetros de
  la curva de recompensas.
- **Parámetros de riesgo** — parámetros de margen y liquidación, ponderación de
  oráculos y ajustes de riesgo por mercado.
- **Listados de mercados** — listado y configuración de mercados.
- **Vault y liquidez** — la lista blanca de proveedores reconocidos para el vault de
  liquidez propiedad del protocolo.
- **Tesorería** — liberaciones de la asignación de la tesorería del protocolo.

### Cómo pasan los votos

Las acciones de gobernanza requieren un **quórum ponderado por participación** para
ejecutarse; un único titular grande no puede cambiar un parámetro unilateralmente, y
los validadores que están inhabilitados por mal comportamiento quedan excluidos del
recuento. Los cambios de parámetros que se aprueban son aplicados de forma
determinista por la cadena.

### Lo que la gobernanza NO controla

- No puede acuñar ni quemar MTF arbitrariamente. La única palanca de oferta es la
  **re-vinculación anual de la población** — un ajuste restringido y bidireccional del
  MTF de la **tesorería** a la cifra de población mediana del año (consulta
  [Emisión e inflación](#emisión-e-inflación)) — no una palanca de inflación libre
  para financiar recompensas.
- No puede incautarse de los saldos o posiciones de los usuarios (la acuñación/quema
  de la re-vinculación solo afecta a la tesorería del protocolo, nunca a los saldos
  de usuarios, colaboradores o stakers).
- No puede alterar el estado comprometido en el pasado.

La gobernanza es un mecanismo de dirección de parámetros solo hacia el futuro, limitado
a las palancas económicas y de riesgo del protocolo.

## Véase también

- [Comisiones](./fees.md) — la distribución de comisiones y la mecánica de recompra-y-quema
- [Baremo de comisiones](./fee-schedule.md) — el baremo de volumen, reembolso a maker y descuento por staking
- [Staking](./staking.md) — validadores, delegadores, penalizaciones, desvinculación, APR
- [MIP-2 Metaliquidity](../mip/mip-2.md) — el vault de liquidez propiedad del protocolo
- [Vaults](./vaults.md) — las familias de vaults operados por el protocolo y por el usuario
- [Glosario](./glossary.md) — términos específicos del protocolo

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Es definitiva la oferta total?**
R: Sí. El total en el génesis (**1.404.890.000 MTF**, vinculado a la población de China),
la asignación en el génesis con tres bloques, el modelo de emisión vinculado a la
población, la distribución de la recompra/quema y la curva del multiplicador ve están
todos **finalizados**. La **utilidad** del token (gas, descuento de staking, consenso,
gobernanza, recompra-y-quema) está activa.

**P: ¿Qué tamaño tiene la oferta y es fija?**
R: Comienza en **1.404.890.000 MTF** en el génesis — **vinculada a la población de
China** — y **no es un techo fijo**. Una vez al año, los validadores votan para
**acuñar** (si la población creció) o **quemar MTF de la tesorería** (si disminuyó)
para re-vincular la oferta total a la cifra de población del año, tomada como la
**mediana entre varias fuentes autorizadas del gobierno central chino**. La
re-vinculación solo mueve MTF de la **tesorería**.

**P: ¿Es MTF inflacionario?**
R: No en el sentido dilutivo. Las recompensas de staking **nunca** se financian
acuñando — provienen de un presupuesto de bootstrap finito en las etapas iniciales
y del reparto de ingresos de la recompra de forma continua. Las únicas adiciones
de oferta son la **re-vinculación anual de la población** (un pequeño ajuste
bidireccional que también puede **quemar**), y sigue una cifra externa en lugar de
un objetivo de rendimiento. Combinado con la quema de la recompra — una fuerza
deflacionaria **independiente y más rápida** — la intención de diseño es un token
**neto deflacionario** a un volumen de estado estable.

**P: ¿Cómo se convierten los ingresos por comisiones en valor del token?**
R: Las comisiones netas de trading (tras pagar primero los reembolsos a makers) se
utilizan para **comprar MTF en el mercado abierto**. El MTF recomprado se divide en
**70% quemado / 20% para validadores (trasladado a sus stakers como reparto de
ingresos) / 10% tesorería**. Así: volumen → recompra → 70% destruido, 20% para
bloqueadores, 10% tesorería.

**P: ¿Qué es el reparto de ingresos / dividendo de los stakers?**
R: Es el **20% de cada recompra** correspondiente a los validadores, distribuido en
MTF a sus stakers / delegadores, de forma proporcional al **peso efectivo ponderado
por tiempo**. No es un fondo separado — va por el canal de los validadores. **Requiere
un bloqueo de al menos 1 mes**; los stakers flexibles no reciben nada.

**P: Soy market maker — ¿puedo hacer staking sin bloquear?**
R: Sí. El staking **flexible (sin bloqueo)** mantiene tu capital desbloqueado y
otorga el nivel de descuento de comisión de taker **básico** — el canal deliberado
para los market makers de alta frecuencia. La compensación es **peso 0×**: sin
niveles superiores y **ningún reparto de ingresos**.

**P: ¿Crece mi multiplicador cuanto más tiempo permanezco en staking?**
R: No. El multiplicador se establece por la **duración de bloqueo que comprometiste
por adelantado** (1 mes = 1,0×, 6 meses = 2,5×, 24 meses = tope de 4,0×) y se aplica
completamente tras la activación de 24h. Comprometerse a un bloqueo de 6 meses te da
2,5× de inmediato — no aumenta gradualmente con el tiempo.

**P: Si me comprometo a un bloqueo de 6 meses, ¿espero 6 meses para el descuento
máximo?**
R: No. Tu beneficio se activa tras el período de activación universal de **24 horas**,
no tras el bloqueo. Los 6 meses son solo el tiempo que estás **impedido de deshacer
el staking**. La activación (24h) y el bloqueo de salida (el plazo elegido) son dos
cosas separadas.

**P: ¿Puede una ballena comprar el grado más alto simplemente haciendo staking de mucho?**
R: No. Los grados superiores se basan en el **peso efectivo = cantidad × multiplicador
de tiempo**, por lo que una cantidad grande sin bloqueo o con bloqueo corto queda
limitada a un grado bajo y no gana reparto de ingresos. Ascender requiere **comprometerse
a un bloqueo largo**. El único grado más alto añade un segundo obstáculo: **Primer
Ministro / Presidente / Secretario General** es el **único #1** por peso (1 puesto)
— por lo que exige una **clasificación** ganadora, no solo tamaño, y se reasigna en
tiempo real a medida que los pesos cambian.

**P: ¿Tengo que hacer staking para usar la cadena?**
R: No. Necesitas MTF para pagar gas en la sidechain EVM, pero operar en el núcleo de
perpetuos no requiere tener MTF. El staking es **opcional** y te otorga un descuento
de comisión de taker, el reparto de ingresos en MTF (si estás bloqueado), un
rendimiento y peso de gobernanza.

**P: ¿Cómo se paga el rendimiento del staking si las recompensas no se acuñan?**
R: De fuentes no dilutivas — el presupuesto de recompensas de bootstrap en las etapas
iniciales y el **reparto de ingresos de la recompra del 20%** (MTF que el protocolo
compró en el mercado abierto, canalizado a través de los validadores a los stakers
bloqueados) de forma continua. A medida que el volumen escala, el reparto de ingresos
cada vez más sostiene el rendimiento. La re-vinculación anual de la población **no**
financia el rendimiento.

**P: ¿Cómo interactúa el descuento de comisión con la quema?**
R: Se refuerzan mutuamente. El descuento y el reparto de ingresos atraen a los traders
a mantener y bloquear MTF (demanda + bloqueo) y reducen su coste de trading (más
volumen), y más volumen significa más comisiones netas recomprando MTF — alimentando
tanto la quema del 70% como el reparto de ingresos del 20% de los stakers.

</details>
