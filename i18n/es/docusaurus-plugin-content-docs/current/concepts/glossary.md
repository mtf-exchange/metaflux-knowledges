# Glosario

:::tip
**Estable.** Se agregan nuevos términos con cada expansión del protocolo.
:::

Términos definidos que se utilizan a lo largo de la documentación. Con referencias cruzadas donde el tema tiene su propia página.

## A

**ADL — Desapalancamiento automático.** Mecanismo de mutualización de pérdidas que recupera PnL no realizado de contrapartes rentables cuando el fondo de seguros no puede cubrir el déficit de una liquidación T3. Véase [ADL](./adl.md).

**Cartera de agente.** Clave de firma aprobada por una cuenta maestra para actuar en su nombre, **sin** autoridad de retiro. Véase [carteras de agente](./agent-wallets.md).

**ALO — Solo añadir límite (Add-Limit-Only).** TIF de orden que rechaza la orden por completo si alguna parte cruzaría el libro. Garantiza el rol de maker. Véase [tipos de orden](./order-types.md#time-in-force).

**ID de activo.** Identificador entero canónico de un mercado. Varía según la red; consúltese mediante la información de `meta`.

**Acción (Action).** Llamada que muta el estado a `POST /exchange`. Unión variante etiquetada con aproximadamente 30 tipos. Véase [exchange.md](../api/rest/exchange.md#action-catalog).

## B

**Backstop (T3).** Nivel de liquidación en el que el protocolo incauta la posición de una cuenta por debajo del umbral hacia el fondo de seguros. Véase [liquidación escalonada](./tiered-liquidation.md#t3-backstop--netting-at-mark).

**Banda de precio de mark.** Restricción por bloque sobre cuánto puede moverse el precio de mark. Protege contra la manipulación del oráculo o del mid. Véase [precios de mark](./mark-prices.md#sanity-bands).

**ID de lote (Batch ID).** Identificador de lote de subasta para mercados FBA. Véase [FBA](./fba.md).

**bps — Punto básico.** 0,01% (= `1e-4`). Las tasas de comisión se denominan en bps; `5 bps` = 0,05%.

**Rebote de constructor (Builder rebate).** Participación en comisiones pagada a la dirección que originó una orden (front-end, agregador, servicio de automatización). Véase [comisiones](./fees.md#builder-rebate).

## C

**CCTP — Protocolo de transferencia entre cadenas.** Protocolo Cross-Chain Transfer Protocol de Circle. MetaFlux **no** usa CCTP; en cambio, el USDC se puentea mediante [MetaBridge](../bridge/) (un puente de custodia con firma de validadores).

**chainId.** Campo de dominio EIP-712 que selecciona la red. `31337` devnet, `114514` testnet, `8964` mainnet. Véase [redes](../networks.md).

**Cloid — ID de orden del cliente.** Identificador de 16 bytes establecido por el cliente; permite `CancelByCloid` e idempotencia de órdenes. Véase [exchange.md `submit_order`](../api/rest/exchange.md#submit_order).

**Precio de liquidación (FBA).** El precio uniforme único al que se liquida un lote FBA. Véase [FBA](./fba.md).

**Margen cruzado (Cross margin).** Modo de margen en el que todas las posiciones comparten el colateral de toda la cuenta. Capital-eficiente; no aislado. Véase [modos de margen](./margin-modes.md).

## D

**Delegación (staking).** Participación MTF de un delegador asignada al pool de un validador. Genera recompensas y está expuesta a penalizaciones. Véase [staking](./staking.md).

**Separador de dominio (Domain separator).** Constante de 32 bytes por red según EIP-712; una de las entradas al hash firmado. Véase [firma](../integration/signing.md).

## E

**EIP-712.** Estándar de Ethereum para datos estructurados firmados con tipado. La firma de MetaFlux utiliza el sobre EIP-712 (`0x1901 || domain || hash`). Véase [firma](../integration/signing.md).

**EMA — Media móvil exponencial.** Se usa en el suavizado del precio mid para el cálculo del precio de mark. Véase [precios de mark](./mark-prices.md).

## F

**FBA — Subasta de lotes frecuentes (Frequent Batch Auction).** Alternativa de coincidencia en tiempo discreto al CLOB continuo. Véase [FBA](./fba.md).

**FIFO — Primero en entrar, primero en salir.** Prioridad de coincidencia de órdenes al mismo nivel de precio en el CLOB continuo.

**FOK — Llenar o cancelar (Fill-or-Kill).** TIF que llena la orden completa o cancela todo. Véase [tipos de orden](./order-types.md#time-in-force).

**Tasa de financiación (Funding rate).** Pago horario entre usuarios que ancla el precio del contrato perpetuo al oráculo subyacente. Véase [tasas de financiación](./funding-rates.md).

## G

**Agrupación (Grouping).** Parámetro de `Order` que enlaza tramos en una familia OCO (`NormalTpsl`) o llaves adjuntas a la posición (`PositionTpsl`). Véase [tipos de orden](./order-types.md#grouping).

**GTC — Válida hasta cancelación (Good-Till-Cancelled).** TIF predeterminado; la orden permanece en el libro indefinidamente. Véase [tipos de orden](./order-types.md#time-in-force).

## H

**Ratio de salud (Health ratio).** `account_value / maint_margin`. Determina la escalera de [liquidación escalonada](./tiered-liquidation.md).

**Marca de máximo histórico (High-water mark).** Precio de participación histórico más alto de un vault, utilizado para controlar la acumulación de comisiones de rendimiento. Véase [vaults](./vaults.md).

## I

**IOC — Inmediata o cancelar (Immediate-Or-Cancel).** TIF; coincide con lo disponible, cancela el remanente no ejecutado. Véase [tipos de orden](./order-types.md#time-in-force).

**Idempotencia.** Propiedad por la cual reintentar una solicitud produce el mismo efecto observable. Véase [idempotencia](../integration/idempotency.md).

**Fondo de seguros (Insurance pool).** Subconjunto del MFlux Vault reservado para la cobertura de backstop T3. Véase [vaults](./vaults.md#insurance-pool).

**Margen aislado (Isolated margin).** Modo de margen en el que un compartimento por activo limita la pérdida en ese activo. Véase [modos de margen](./margin-modes.md).

## L

**Libro L2.** El libro de órdenes a una profundidad determinada (top-N niveles por lado). Véase [`l2_book` info](../api/rest/info/perpetuals.md#l2_book).

**Nivel de liquidación (Liquidation tier).** Etapa en la [escalera escalonada](./tiered-liquidation.md): T0 tarjeta amarilla, T1 parcial, T2 completa, T3 backstop, T4 ADL.

**Período de bloqueo (Lock-up — staking / vault).** Tiempo requerido entre la señal de desapuesta/retiro y la disponibilidad de fondos. Véase [staking](./staking.md), [vaults](./vaults.md).

## M

**Margen de mantenimiento (Maintenance margin).** Colateral mínimo requerido para mantener una posición abierta. Salud = `account_value / maint_margin`. Véase [modos de margen](./margin-modes.md).

**Maker / Taker.** El maker proporciona liquidez (orden en reposo); el taker la retira (orden de cruce). Tasas de comisión diferentes. Véase [comisiones](./fees.md).

**Precio de mark.** Precio autorizado del protocolo para margen y liquidación. Composición de mediana entre mid, oráculo y EMA. Véase [precios de mark](./mark-prices.md).

**Cuenta maestra (Master account).** La cuenta cuyo estado es mutado por las acciones; puede ser firmada por sí misma o por un agente aprobado. Véase [carteras de agente](./agent-wallets.md).

**MFlux Vault.** Pool de seguros y creación de mercado operado por el protocolo. Véase [vaults](./vaults.md#mflux-vault).

**MIP — Propuesta de mejora de mercado (Market Improvement Proposal).** Mejora de protocolo numerada (análoga a los esquemas de propuestas de mejora utilizados por protocolos de contratos perpetuos on-chain consolidados). Véase [MIP](../mip/).

**msgpack.** Formato de serialización binaria. El payload firmado de una acción son bytes msgpack. Véase [firma](../integration/signing.md).

**MTF.** El token del protocolo MetaFlux. Se usa para staking, gobernanza y quema de comisiones.

**Multi-firma (Multi-sig).** Requisito de firma M-de-N para una cuenta. Véase [multi-firma](./multi-sig.md).

## N

**Nonce.** Uint64 estrictamente monótono por emisor incluido en cada acción; protección contra replay. Véase [idempotencia](../integration/idempotency.md).

## O

**Oid — ID de orden.** Uint64 asignado por el servidor; devuelto en la respuesta `Order` y en `userEvents`/`orderEvents`. Véase [exchange.md](../api/rest/exchange.md).

**Oráculo (Oracle).** Feed de precio externo compuesto a partir de precios de CEX mediante TWA. Entrada al precio de mark y a la financiación. Véase [precios de mark](./mark-prices.md#the-oracle-c1-anchor).

## P

**PnL.** Ganancia y pérdida. No realizada (mark-to-market sobre posición abierta) vs. realizada (cerrada al precio de salida).

**Margen de cartera (Portfolio margin — PM).** Modelo de margen basado en escenarios entre activos; capital-eficiente para libros con cobertura. Véase [margen de cartera](./portfolio-margin.md).

**Índice de prima (Premium index).** EMA de `mid - oracle`; entrada a la financiación. Véase [tasas de financiación](./funding-rates.md).

## R

**Solo reducir (Reduce-only).** Indicador de orden que rechaza la orden en admisión si ampliaría el tamaño de la posición. Véase [tipos de orden](./order-types.md#reduce-only).

**RFQ — Solicitud de cotización (Request for Quote).** Flujo de trabajo de cotización por maker para tamaños que no quieren publicarse en el libro público. Véase [RFQ](./rfq.md).

## S

**Emisor (Sender).** La dirección cuyo estado muta en una solicitud `POST /exchange`. Puede ser firmada por sí misma o por un agente aprobado.

**Participación (Share — vault).** Unidad de participación en el vault; acuñada al depositar al `share_price` actual y quemada al retirar al `share_price` actual. Véase [vaults](./vaults.md).

**Penalización (Slashing).** Castigo al validador por doble firma o tiempo de inactividad; reduce el stake del validador (y de los delegadores). Véase [staking](./staking.md#slashing).

**STP — Prevención de auto-operación (Self-Trade Prevention).** Parámetro de orden que selecciona qué ocurre cuando tu nueva orden coincidiría con tu propia orden en reposo. Véase [tipos de orden](./order-types.md#self-trade-prevention).

**Strict-Iso.** Modo de margen similar al aislado, con la propiedad adicional de que la posición queda excluida de cualquier compensación de margen de cartera. Véase [modos de margen](./margin-modes.md).

**Sub-cuenta (Sub-account).** Cuenta derivada bajo una cuenta maestra; posiciones y órdenes aisladas, comparte depósito/retiro solo con la cuenta maestra. Véase [sub-cuentas](./sub-accounts.md).

## T

**Taker.** Extractor de liquidez; el lado de una ejecución que cruza el libro.

**Tamaño mínimo de tick (Tick size).** Incremento mínimo de precio para un mercado. Las órdenes deben alinearse con él.

**TIF — Tiempo en vigencia (Time-In-Force).** Parámetro de orden: GTC / IOC / ALO / FOK. Véase [tipos de orden](./order-types.md#time-in-force).

**TPSL — Tomar ganancia / Parar pérdida (Take-Profit / Stop-Loss).** Agrupación de órdenes con disparador para llaves de protección. Véase [tipos de orden](./order-types.md#triggers).

**TVL — Valor total bloqueado (Total Value Locked).** Suma del NAV del vault entre todos los depositantes.

**TWAP — Precio promedio ponderado en el tiempo (Time-Weighted Average Price).** Primitiva de orden que divide una orden grande a lo largo del tiempo. Véase [tipos de orden](./order-types.md#twap).

## U

**Universo (Universe).** La lista activa de mercados (contratos perpetuos + spot) en el protocolo. Devuelta por la información de `meta`.

**PnL no realizado (Unrealised PnL).** Ganancia/pérdida mark-to-market sobre posiciones abiertas. Aún no realizada mediante cierre.

**USDC.** La moneda de cotización para los mercados de MetaFlux; se puentea hacia dentro y fuera mediante [MetaBridge](../bridge/).

## V

**Validador (Validator).** Participante de consenso; propone bloques y vota. Gana comisión sobre las recompensas de los delegadores; sujeto a penalizaciones.

**Vault.** Pool de USDC bajo la autoridad de firma de un gestor, con semántica de acuñación/quema de participaciones. Véase [vaults](./vaults.md).

## W

**Retirable (Withdrawable).** Saldo libre que puede salir de la cuenta (no retenido como margen contra posiciones abiertas, no en un compartimento aislado, no bloqueado en un vault).

## Y

**Tarjeta amarilla (T0) (Yellow card).** Primer nivel de liquidación. Se cancelan las órdenes ALO; las posiciones no se tocan; se notifica al cliente. Véase [liquidación escalonada](./tiered-liquidation.md#why-a-yellow-card).
