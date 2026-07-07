# Migración desde HL

:::info
**MetaFlux habla su propio protocolo MTF-native — no existe ninguna capa de compatibilidad con Hyperliquid.** Tu bot conserva su estrategia y su lógica de trading; lo que cambia es la capa de cliente/wire. La vía más rápida es el SDK oficial de [TypeScript](./typescript-sdk.md) o [Rust](./rust-sdk.md), que construye por ti el envelope nativo y la firma EIP-712. Para otros lenguajes, implementa directamente la [firma con typed-data](./typed-data-signing.md).
:::

Si tu bot ya opera en un DEX de perpetuos al estilo de Hyperliquid, el cambio a MetaFlux es una **reescritura de la capa de cliente, no de la estrategia**. Los conceptos de los que dependes — órdenes límite, ejecuciones, financiación, margen cruzado / aislado, carteras de agente, subcuentas, vaults — todos existen en MTF. Lo que sustituyes es el formato de wire, los nombres de acciones / consultas, el chain ID y los IDs de activos.

## La forma del cambio

- **Formato de wire.** MTF-native es JSON en snake_case sobre `POST /exchange` (escritura), `POST /info` (lectura) y `GET /ws` (streaming), cada uno firmado con EIP-712 cuando se requiere. Adopta el SDK o implementa el [esquema de firma nativo](./typed-data-signing.md).
- **Lógica de estrategia y de riesgo.** Sin cambios — tu código de cotización, dimensionamiento y cobertura se conserva.
- **Nombres y algunas semánticas.** Los tipos de acción y de consulta se renombran (tabla más abajo) y un puñado de comportamientos difieren (IDs de activos, el nivel de liquidación T0, la latencia de aprobación de agentes).

## Qué funciona igual

- Órdenes límite / IOC / ALO, reduce-only, IDs de orden de cliente (`cloid`).
- Firma EIP-712 — misma primitiva de firma, dominio y chain ID diferentes.
- Margen cruzado / aislado, pagos de financiación, ejecuciones y lecturas de estado de órdenes.
- Carteras de agente (claves calientes sin autoridad de retiro), subcuentas, vaults.

## Qué cambia

### 1. Superficie de protocolo

Hay una única superficie MTF-native; la llamas a través del SDK o construyes el envelope tú mismo. Los nombres se corresponden de forma directa:

| Lo que usabas en HL | Equivalente MTF-native |
|----------------|-----------------------|
| `POST /exchange` `order` | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `POST /exchange` `cancel` | [`cancel_order`](../api/rest/exchange.md#cancel_order) / [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `POST /exchange` `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `POST /info` `meta` | [`markets`](../api/rest/info/perpetuals.md#markets) |
| `POST /info` `clearinghouseState` | [`account_state`](../api/rest/info.md#account_state) |
| `POST /info` `openOrders` / `frontendOpenOrders` | [`open_orders`](../api/rest/info.md#open_orders) / [`frontend_open_orders`](../api/rest/info.md#frontend_open_orders) |
| `POST /info` `userFills` | [`user_fills`](../api/rest/info.md#user_fills) |
| WS `userEvents`, `l2Book`, `candle` | `user_events`, `l2_book`, `candles` (snake_case) — consulta [suscripciones WS](../api/ws/subscriptions.md) |

Los catálogos completos son [`POST /exchange`](../api/rest/exchange.md) y [`POST /info`](../api/rest/info.md).

### 2. Chain ID

MetaFlux es su propia L1, no un despliegue de HL. Firma contra el chain ID de MetaFlux, **no** el de HL:

| Red | MTF `chainId` |
|---------|---------------|
| Mainnet | **8964** (`0x2304`) |
| Testnet | **114514** (`0x1bf52`) |
| Devnet / local | **31337** (`0x7a69`) |

El dominio EIP-712 de MTF usa `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`. Consulta [redes](../networks.md) y [firma](./signing.md).

### 3. URL base

```
MTF: https://api.<net>.mtf.exchange/{info,exchange,ws}
```

El gateway es la única puerta de entrada para la superficie MTF-native. Si ejecutas el nodo tú mismo, la misma superficie se sirve en `http://localhost:8080`.

### 4. IDs de activos

Tanto HL como MTF usan IDs de activos enteros, pero **los enteros no son los mismos**. `0` en HL es el perpetuo de BTC; `0` en MTF podría ser ETH o cualquier otro activo según el despliegue. Consulta siempre tus IDs de activos mediante `POST /info { "type": "markets" }` al arrancar; nunca los codifiques de forma fija.

### 5. Precisión numérica

Los campos de precio y tamaño son enteros escalados transmitidos como strings JSON porque IEEE-754 pierde precisión más allá de 2^53. Si tu bot hace parsing con el `JSON.parse` predeterminado de JS, cambia a un parser consciente de big-int para estos campos.

### 6. Comportamiento de liquidación

MetaFlux añade un [nivel de gracia T0 (tarjeta amarilla)](../concepts/tiered-liquidation.md) que HL no tiene. Efecto práctico: con un nivel de salud en `[1.0, 1.1)`, las órdenes ALO en reposo de tu cuenta se cancelan forzosamente y se emite un evento de advertencia, pero las posiciones no se tocan. A continuación, T1 / T2 / T3 se comportan como los niveles Parcial / Mercado / Backstop de HL.

Si tu bot escucha eventos de liquidación para activar recargas de margen, **añade un manejador para el nuevo evento T0**: esa es la señal de alerta temprana que HL no te da. Detectarla te da un bloque de gracia para actuar.

### 7. Semántica de las carteras de agente

Un agente es una clave sin autoridad de retiro — el mismo modelo que HL (consulta [carteras de agente](../concepts/agent-wallets.md)). La acción es [`approve_agent`](../api/rest/exchange.md#approve_agent). La única diferencia mecánica: la aprobación de agente en MTF entra en vigor **un bloque después del commit**, frente a la latencia típica de dos bloques de HL. Ligeramente más rápido; el mismo proceso de calentamiento.

### 8. Vaults

Los vaults de HL y los de MetaFlux no son el mismo producto. La lectura [`vault_state`](../api/rest/info.md#vault_state) devuelve los tipos de vault propios de MTF (MFlux Vault, vaults de usuario). Las direcciones de vaults de HL no se resolverán. Espera entidades MTF, no de HL.

## Migración paso a paso

### Día 0 — adoptar el cliente nativo

1. Instala el SDK de [TypeScript](./typescript-sdk.md) o [Rust](./rust-sdk.md) (o implementa la [firma con typed-data](./typed-data-signing.md) para tu lenguaje).
2. Apunta `baseUrl` al gateway de MTF y configura `chainId` para tu red objetivo.
3. Reimplementa la búsqueda de activos contra `POST /info { "type": "markets" }`.

### Día 1 — mapear tus acciones

Traduce cada acción que envía tu bot a su equivalente MTF-native (consulta la tabla en [§1](#1-superficie-de-protocolo)). `order` → `submit_order`, `cancel` → `cancel_order`, los cambios de apalancamiento / margen → `update_leverage` / `update_isolated_margin`. El envelope EIP-712 lo construye el SDK; solo difieren el nombre de la variante de acción y el casing de los campos.

### Día 2 — conectar las nuevas señales

- Suscríbete a las lecturas de `sub_accounts` si operas subcuentas (MTF permite hasta 32 subcuentas por cuenta maestra).
- Añade un manejador para los eventos de tarjeta amarilla T0 en el canal WS `user_events`.
- Si dependes del margen de cartera, inscríbete en MTF con [`user_portfolio_margin`](../api/rest/exchange.md#user_portfolio_margin). El umbral y el conjunto de escenarios son parámetros de red — consulta [margen de cartera](../concepts/portfolio-margin.md).

### Día 3+ — adoptar funcionalidades exclusivas de MTF

Opcional. Si quieres usar funcionalidades que HL no tiene:

- **RFQ** — primitivas de solicitud de cotización, útiles para volumen que no quiere anunciarse en el libro de órdenes.
- **FBA** — emparejamiento por subasta por lotes frecuente para mercados designados, reduce el MEV.
- **Primitivas entre cadenas** — primitivas de puente invocables de forma nativa desde contratos EVM.

Estas son acciones MTF-native en `POST /exchange`; consulta la [descripción general de la API](../api/index.md).

## Principales patrones de bot HL — migración concreta

### 1. Creador de mercado con órdenes límite simples (el patrón canónico)

```typescript
import { MetaFluxClient } from '@metaflux/sdk';

const client = new MetaFluxClient({
  privateKey: process.env.PRIVATE_KEY!,
  baseUrl:    'https://api.devnet.mtf.exchange',
  chainId:    114514,   // testnet (mainnet 8964, devnet 31337)
});

// búsqueda de activos: HL `meta.universe` → MTF `markets`
const markets = await client.info.markets();
const BTC = markets.findIndex(m => m.name === 'BTC');   // puede que no sea 0

// order / cancel — tu lógica de estrategia, nombres de acción nativos
await client.exchange.order({
  asset: BTC, isBuy: true, price: '100', size: '0.1', tif: 'Gtc', reduceOnly: false,
});
```

La estrategia se mantiene; la capa de cliente se convierte en la llamada al SDK.

### 2. Bot de vigilancia de liquidaciones (recarga de margen)

HL emite eventos `liquidation` en el nivel parcial / mercado. MTF añade **`yellowCard`** como la señal más temprana en el canal `user_events`.

```typescript
const ws = client.ws();
ws.subscribe('user_events', { user: client.address }, (event) => {
  switch (event.data.kind) {
    case 'yellowCard':
      // T0 — un bloque para actuar; las órdenes ALO ya están canceladas
      deposit(YELLOW_CARD_DEPOSIT);
      break;
    case 'liquidation':
      // T1 parcial O T2 completa — demasiado tarde para prevenir
      emergency_unwind();
      break;
  }
});
```

Consulta [risk-watcher](./risk-watcher.md) para el patrón completo.

### 3. Bot de arbitraje de tasa de financiación

La cadencia de financiación es similar (por hora de forma predeterminada, configurable por mercado en MTF). La estructura de la fórmula es idéntica; la lectura es la consulta nativa `funding`.

```typescript
const funding = await client.info.fundingHistory({ coin: 'BTC' });
// los valores pueden diferir de HL porque la composición del oráculo difiere
const rate = funding[0].rate_per_hr;
```

La composición del oráculo de MTF se rige por mercado (`SetOracleWeights` confirmado) — si tu arbitraje depende de proveedores de oráculo específicos, verifica la lista de fuentes ponderadas. Consulta [precios de marca](../concepts/mark-prices.md).

### 4. Configuración multiusuario / institucional

HL: cuenta maestra + agentes por host. MTF: igual, más **cuentas multi-firma** de primera clase.

```typescript
// existente: cuenta maestra + agentes
await master.approveAgent(host1_agent);
await master.approveAgent(host2_agent);

// nuevo en MTF: convierte la cuenta maestra a multi-firma para custodia en frío
await master.convertToMultiSigUser({
  threshold: 2,
  signers: [signer1, signer2, signer3],
});
// cada acción posterior a nivel de cuenta maestra requiere entonces 2 firmas;
// los agentes siguen funcionando como antes para las acciones de trading
```

Consulta [multi-firma](../concepts/multi-sig.md).

### 5. Gestor de cartera con subcuentas

Subcuentas de HL: hasta 8. MTF: hasta 32.

```typescript
// MTF: crea una de hasta 32 subcuentas
await master.createSubAccount({ name: 'desk-A' });
await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

La gestión de agentes por subcuenta, la inscripción en margen de cartera por subcuenta y los modos de margen por subcuenta son todos compatibles.

## Tabla de referencia

| Acción que usabas en HL | Acción MTF-native |
|-----------------------|-------------------|
| `order` (colocar límite / IOC / ALO) | [`submit_order`](../api/rest/exchange.md#submit_order) / [`batch_order`](../api/rest/exchange.md#batch_order) |
| `cancel` (por OID) | [`cancel_order`](../api/rest/exchange.md#cancel_order) |
| `cancelByCloid` | [`cancel_by_cloid`](../api/rest/exchange.md#cancel_by_cloid) |
| `modify` / `batchModify` | [`modify`](../api/rest/exchange.md#modify) / [`batch_modify`](../api/rest/exchange.md#batch_modify) |
| `usdSend` / transferencias spot | acciones nativas de transferencia spot |
| `withdraw3` | [`mb_withdraw`](../api/rest/exchange.md#mb_withdraw) |
| `approveAgent` | [`approve_agent`](../api/rest/exchange.md#approve_agent) |
| `updateLeverage` / `updateIsolatedMargin` | [`update_leverage`](../api/rest/exchange.md#update_leverage) / [`update_isolated_margin`](../api/rest/exchange.md#update_isolated_margin) |
| `convertToMultiSigUser` | [`convert_to_multi_sig_user`](../api/rest/exchange.md#convert_to_multi_sig_user) |
| `setReferrer` / `createReferral` | [`set_referrer`](../api/rest/exchange.md#set_referrer) (la semántica puede diferir) |

## Obtener ayuda

- Este repositorio (`mtf-exchange/metaflux-knowledges`) — abre un issue.
- Consulta [`POST /exchange`](../api/rest/exchange.md) y la [guía de firma](./signing.md) para la referencia a nivel de wire.
