---
description: El mercado de futuros perpetuos en vivo — posiciones largas/cortas apalancadas sin vencimiento, ancladas al precio spot mediante financiación, valoradas contra el precio de marca y protegidas por liquidación escalonada.
---

# Perpetuos

:::tip
**En vivo.** Los futuros perpetuos son el mercado insignia de MetaFlux y la opción predeterminada de la plataforma — las tasas de financiación, los precios de marca, los modos de margen y el esquema de liquidación describen los perpetuos salvo que una página indique lo contrario.
:::

## Resumen

Un **futuro perpetuo** ("perp") es un contrato apalancado que sigue el precio de un activo **sin fecha de vencimiento** — puedes tomar una posición larga o corta, depositar [margen](../concepts/margin-modes.md) como respaldo y mantener la posición mientras se encuentre en buen estado. Como no existe fecha de liquidación, un pago periódico de [financiación](../concepts/funding-rates.md) entre posiciones largas y cortas mantiene el precio del contrato vinculado al subyacente. Las posiciones se valoran contra un [precio de marca](../concepts/mark-prices.md) resistente a manipulaciones, y una posición que ya no puede cubrir su margen se cierra mediante [liquidación escalonada](../concepts/tiered-liquidation.md) en lugar de un único cierre repentino.

Los perps son completamente independientes del mercado [spot](./spot.md): una posición en perp es una exposición apalancada respaldada por colateral, no la propiedad del activo.

## Cómo funciona un perp

- **Dirección y apalancamiento.** Compra para ponerte largo, vende para ponerte corto. El [apalancamiento](../concepts/margin-modes.md) permite que una cantidad determinada de colateral controle una posición mayor; amplifica ganancias y pérdidas por igual. Configura el apalancamiento por activo y el modo cruzado/aislado con [`update_leverage`](../api/rest/exchange.md#update_leverage).
- **Sin vencimiento.** Un perp nunca se liquida en una fecha de entrega — la posición persiste hasta que la cierres o sea liquidada.
- **La financiación mantiene el equilibrio.** Cada hora, las posiciones largas y cortas intercambian un [pago de financiación](../concepts/funding-rates.md) calibrado para acercar el precio del perp al subyacente. Se paga **entre traders**, no a la plataforma.
- **El precio de marca rige el riesgo.** Tu margen, PnL no realizado, nivel de liquidación y órdenes con disparador se calculan todos contra el [precio de marca](../concepts/mark-prices.md), no contra la última operación — de modo que un precio aislado fuera de rango no puede distorsionar tu posición.

## Acciones de trading

Una orden de perp apunta a un id de **`market`** de perp (distinto de un `pair` spot). La superficie de órdenes es el CLOB compartido que se usa en toda la plataforma MetaFlux.

| Acción | Efecto |
|---|---|
| [`submit_order`](../api/rest/exchange.md#submit_order) | Enviar una orden de perp (limitada / mercado / disparador), cualquier [tipo de orden](../concepts/order-types.md) |
| [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`batch_cancel`](../api/rest/exchange.md#batch_cancel) | Cancelar por `oid`, una o varias por firma |
| [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) / [`cancel_all_orders`](../api/rest/exchange.md#cancel_all_orders) | Cancelar por id de cliente, o cancelar todas (filtro de activo opcional) |
| [`update_leverage`](../api/rest/exchange.md#update_leverage) | Cambiar el apalancamiento o alternar el margen aislado en un activo |
| [`set_position_mode`](../api/rest/exchange.md#set_position_mode) | Alternar entre modo unidireccional y [modo cobertura](../concepts/hedge-mode.md) (largo + corto simultáneos) |

`submit_order` devuelve un estado **sincrónico** por orden una vez confirmada — el `oid` asignado con una entrada `resting` / `filled` / `error`, o `pending` si no se recibe confirmación dentro de la ventana de espera. Las órdenes pueden ser firmadas por la cuenta maestra o por una [billetera agente](../concepts/agent-wallets.md) activa.

## Margen y riesgo

Los perps comparten toda la pila de margen y riesgo de la plataforma:

- [**Modos de margen**](../concepts/margin-modes.md) — Cruzado / Aislado / Iso-Estricto, y cómo el colateral se comparte o se segmenta entre posiciones.
- [**Modo cobertura**](../concepts/hedge-mode.md) — mantener una posición larga y una corta en el mismo mercado de forma simultánea.
- [**Margen de cartera**](../concepts/portfolio-margin.md) — margen entre activos, similar a SPAN, para exposiciones compensatorias.
- [**Liquidación escalonada**](../concepts/tiered-liquidation.md) — una escala gradual (aviso temprano T0 → pasos parciales → T4) en lugar de una liquidación total única.
- [**ADL**](../concepts/adl.md) — desapalancamiento automático como último recurso cuando el fondo de seguros se agota.

## Comisiones

Las ejecuciones en perps cobran una comisión de **maker** y otra de **taker**. Tu tarifa base proviene de tu nivel de volumen de los últimos 30 días; sobre ella se aplican un nivel de rebate de maker y un descuento por staking (consulta el [Esquema de comisiones](../concepts/fee-schedule.md) para ver cómo se combinan los tres).

| Volumen en 30 días | Taker | Maker |
|---------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

Un nivel de rebate de maker (participación en volumen maker) puede llevar tu **tarifa neta de maker a valores negativos** (recibes pago por hacer mercado); un descuento por staking reduce tu **tarifa de taker hasta en un 50%**. Las tarifas son parámetros de gobernanza — consulta el cuadro actualizado con [`/info fee_schedule`](../api/rest/info.md#fee_schedule). **La financiación no es una comisión** — es un [pago periódico entre posiciones largas y cortas](../concepts/funding-rates.md), no un ingreso para la plataforma. Consulta [Comisiones](../concepts/fees.md) para la mecánica completa.

## Listado de nuevos mercados de perps

Los mercados de perps son **permisionless** para su despliegue: cualquier desarrollador puede listar un nuevo perpetuo ganando una subasta de gas en cadena y proporcionando parámetros iniciales de riesgo (ratio de mantenimiento inicial, apalancamiento máximo, límite de financiación), acotados por los rangos establecidos por la gobernanza. Sin comité de revisión, sin lista de aprobados. Consulta [MIP-3](../mip/mip-3.md) para el flujo de despliegue, y [MIP-4](../mip/mip-4.md) para el agregador de liquidez planificado que canaliza el flujo minorista sobre él.

## Ver también

- [Tasas de financiación](../concepts/funding-rates.md) — el pago horario entre posiciones largas y cortas
- [Precios de marca](../concepts/mark-prices.md) / [precios oracle](../concepts/oracle-prices.md) — qué valores usa tu posición
- [Tipos de orden](../concepts/order-types.md) — TIF, STP, disparadores, TWAP, escala
- [Modos de margen](../concepts/margin-modes.md) — Cruzado / Aislado / Iso-Estricto
- [Liquidación escalonada](../concepts/tiered-liquidation.md) — la escala de liquidación
- [`submit_order`](../api/rest/exchange.md#submit_order) — la acción de wire y las tablas de campos
- [MIP-3](../mip/mip-3.md) — despliegue permisionless de mercados de perps
- [Spot](./spot.md) — el mercado no apalancado basado en propiedad del activo
