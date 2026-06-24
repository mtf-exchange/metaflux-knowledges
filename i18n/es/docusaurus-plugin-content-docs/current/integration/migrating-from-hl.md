# Migración desde HL

:::info
**Vista previa.** La capa de compatibilidad con HL cubre `POST /info` (15 tipos de consulta) y `POST /exchange` (órdenes y cancelaciones hoy; más tipos de acciones en versiones posteriores).
:::

Si tu bot ya habla el protocolo de HL, puedes apuntarlo a MetaFlux **sin cambiar el código** para la superficie cubierta: mismos esquemas de URL, mismo JSON de petición/respuesta, mismo sobre EIP-712.

## Qué funciona de inmediato

- `POST /info` para: `meta`, `allMids`, `userState`, `clearinghouseState`, `openOrders`, `frontendOpenOrders`, `userFills`, `historicalOrders`, `metaAndAssetCtxs`, `l2Book`, `vaultDetails`, `delegations`, `userFees`, `subAccounts`, `referral`
- `POST /exchange` para: `order` (colocar orden límite / IOC / ALO), `cancel` (cancelar por OID)
- Las suscripciones WS (próximamente) usarán los mismos nombres de canal que HL

## Qué es diferente

### 1. Chain ID

MetaFlux es su propia L1, no un despliegue de HL. Firma contra el chain ID de MetaFlux, **no** el de HL:

| Red | HL `chainId` | MTF `chainId` |
|---------|--------------|---------------|
| Mainnet | 1337 | **8964** (`0x2304`) |
| Testnet | 998 | **114514** (`0x1bf52`) |
| Devnet / local | 1337 | **31337** (`0x7a69`) |

Actualiza una constante en tu código de firma y el resto del sobre EIP-712 es idéntico. El dominio MTF usa `name = "MetaFlux"`, `version = "1"`, `verifyingContract = 0x0`.

### 2. URL base

```
HL:  https://<your-current-hl-api-base>/{info,exchange}
MTF: https://gateway.<your-deployment>/hl/{info,exchange}
```

El gateway es la puerta de entrada única. La compatibilidad con HL reside bajo `/hl/*`
(`/hl/info`, `/hl/exchange`, `/hl/ws`), por lo que un cliente HL solo gana el prefijo `/hl`.
La ruta de nivel superior predeterminada del gateway (`/info`, `/exchange`) es
MTF nativo; si ejecutas el nodo tú mismo, la misma superficie se sirve en
`http://localhost:8080`.

### 3. Tipos de acción aún no disponibles en la capa de compatibilidad

Si tu bot usa acciones de HL más allá de `order` / `cancel`, el gateway devuelve hoy:

```json
{ "status": "err", "response": "unimplemented action: <type>" }
```

con HTTP 200. La convención de HL es que los errores son 200 con `status: "err"`, y MTF lo preserva.

La cobertura completa de acciones HL se incorporará en versiones sucesivas. Para las nuevas acciones que prefieras tener hoy, usa directamente la [superficie de acciones MTF nativa](../api/rest/exchange.md), que tiene cobertura completa de funcionalidades, incluidas las que HL no tiene (RFQ, FBA, inscripción en margen de cartera, primitivas entre cadenas).

### 4. IDs de activos

HL y MTF usan IDs de activos enteros, pero **los enteros no son los mismos**. `0` en HL es el contrato perpetuo de BTC; `0` en MTF puede ser ETH o cualquier otro activo según el despliegue. Consulta siempre tus IDs de activos mediante `POST /info { "type": "meta" }` al arrancar; nunca los codifiques de forma fija.

### 5. Precisión numérica

Ambas cadenas usan enteros escalados (p. ej., `px`) y los representan como cadenas en JSON porque IEEE-754 pierde precisión más allá de 2^53. Si tu bot hace parsing de JSON con el `JSON.parse` predeterminado de JS, cambia a un parser consciente de big-int para estos campos: el formato en la red es el mismo que en HL, pero el modo de fallo (pérdida silenciosa de precisión) también lo es.

### 6. Comportamiento de liquidación

MetaFlux añade un [nivel de aviso T0 (tarjeta amarilla)](../concepts/tiered-liquidation.md) que HL no tiene. Efecto práctico: con un nivel de salud en el rango `[1.0, 1.1)`, las órdenes ALO en reposo de tu cuenta se cancelan forzosamente y se emite un evento de advertencia, pero las posiciones no se tocan. A continuación, T1 / T2 / T3 se comportan como los niveles Parcial / Mercado / Backstop de HL.

Si tu bot escucha eventos de liquidación para activar recargas de margen, **añade un manejador para el nuevo evento T0**: esa es la señal de alerta temprana que HL no te da. Detectarla te da un bloque de gracia para actuar.

### 7. Semántica de las carteras de agente

HL: un agente es una clave sin autoridad de retiro. Igual en MTF; consulta [carteras de agente](../concepts/agent-wallets.md). El nombre de acción es `ApproveAgent`; el formato en la red refleja el de HL. La única diferencia mecánica: la aprobación del agente en MTF entra en vigor **un bloque después del commit**, frente a la latencia típica de dos bloques de HL. Ligeramente más rápido; el mismo proceso de calentamiento.

### 8. Vaults

Los vaults de HL y los de MetaFlux no son el mismo producto. `vaultDetails` devuelve información sobre los tipos de vault propios de MTF (MFlux Vault, vaults de usuario). Las direcciones de vaults de HL no se resolverán. El esquema de consulta es el mismo; simplemente espera entidades MTF, no de HL.

## Migración paso a paso

### Día 0 — apuntar a MetaFlux

1. Cambia la URL base en la configuración de tu cliente.
2. Cambia la constante `chainId` en tu firmante.
3. Ejecuta tu suite de pruebas existente contra el devnet de MTF. Las consultas `order` / `cancel` / y todas las de `info` deberían pasar sin cambios en el código.

### Día 1 — gestionar la brecha en la superficie de acciones

Para las acciones de HL que aún no están en la capa de compatibilidad de MTF:

- **Modificar órdenes** — por ahora, cancela y reenvía. La acción `modify` llega en una actualización de compatibilidad posterior.
- **Configurar apalancamiento / modo de margen** — usa la acción MTF nativa mediante `POST /exchange` en la ruta predeterminada del gateway (`UpdateLeverage`, `UpdateIsolatedMargin`). Mismo sobre EIP-712; nombre de variante de acción diferente.
- **Transferir / retirar** — MTF nativo.

### Día 2 — conectar las nuevas señales

- Suscríbete a la información de `subAccounts` si operas subcuentas (la semántica difiere ligeramente: MTF permite hasta 32 subcuentas por cuenta maestra).
- Añade un manejador para los eventos de tarjeta amarilla T0. El lugar más sencillo es el mismo feed de fills/liquidaciones que ya consumes; el formato del evento es `{ "type": "yellowCard", "user": "0x...", "block": N }`.
- Si dependes del margen de cartera: vuelve a inscribirte en MTF (`UserPortfolioMargin { enabled: true }`). El umbral y el conjunto de escenarios son parámetros de red; consulta [margen de cartera](../concepts/portfolio-margin.md).

### Día 3+ — adoptar funcionalidades exclusivas de MTF

Opcional. Si quieres usar funcionalidades que HL no tiene:

- **RFQ** — primitivas de solicitud de cotización, útiles para volumen que no quiere anunciarse en el libro de órdenes
- **FBA** — emparejamiento por subasta por lotes frecuente para mercados designados, reduce el MEV
- **Primitivas entre cadenas** — primitivas de puente invocables de forma nativa desde contratos EVM

Estas son acciones MTF nativas, enviadas en la ruta predeterminada del gateway (`POST /exchange`; MTF nativo es el predeterminado; la compatibilidad con HL está bajo `/hl/*`; consulta la [descripción general de la API](../api/index.md)).

## Los 5 patrones de bot HL más comunes — migración concreta

### 1. Creador de mercado con órdenes límite simples (el patrón canónico)

```diff
- const HL_URL = 'https://<your-current-hl-api-base>';
+ const MTF_URL = 'https://gateway.mtf.exchange/hl';   // HL-compat is under /hl/*

- const HL_CHAIN_ID = 1337;
+ const MTF_CHAIN_ID = 114514;    // testnet (mainnet 8964, devnet 31337)

- const HL_DOMAIN_NAME = 'HLSignTransaction';   // varies by mode
+ const MTF_DOMAIN_NAME = 'MetaFlux';
+ const MTF_DOMAIN_VERSION = '1';

  // asset lookup runs against /info { type: "meta" } — same call, different result
  const meta = await fetch(MTF_URL + '/info', {
    method: 'POST',
    body: JSON.stringify({ type: 'meta' }),
  }).then(r => r.json());

  const BTC = meta.universe.findIndex(m => m.name === 'BTC');  // may not be 0

  // order, cancel — unchanged HL wire shape
  await place_order(BTC, 'B', '100', '0.1', 'Gtc');
```

Cambiar el `chainId` y la URL base es aproximadamente 5 minutos de trabajo para un cliente típico.

### 2. Bot de vigilancia de liquidaciones (recarga de margen)

HL emite eventos `liquidation` cuando las cuentas alcanzan el nivel parcial / mercado. MTF añade **`yellowCard`** como la señal más temprana.

```diff
  ws.subscribe('userEvents', { user: address }, (event) => {
    switch (event.data.kind) {
+     case 'yellowCard':
+       // T0 — one block to act. ALO orders already cancelled.
+       deposit(YELLOW_CARD_DEPOSIT);
+       break;
      case 'liquidation':
-       // HL partial / market
+       // T1 partial OR T2 full — too late for prevention
        emergency_unwind();
        break;
    }
  });
```

Consulta [risk-watcher](./risk-watcher.md) para el patrón completo.

### 3. Bot de arbitraje de tasa de financiación

La cadencia de financiación es similar (HL es por hora; MTF es por hora de forma predeterminada, pero configurable por mercado). La estructura de la fórmula es idéntica.

```diff
  // URL is the /hl base from pattern 1 (gateway .../hl) — HL-compat shape
  const funding = await fetch(URL + '/info', {
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC' }),
  }).then(r => r.json());

- // HL funding rate at funding[0].fundingRate
+ // MTF same shape; values may differ because oracle composition differs
  const rate = funding[0].fundingRate;
```

La composición del oráculo de MTF se rige por mercado (mediante `SetOracleWeights` confirmado). Si tu arbitraje depende de proveedores de oráculo específicos, verifica que la lista de fuentes ponderadas coincida con tus expectativas. Consulta [precios de marca](../concepts/mark-prices.md).

### 4. Configuración multiusuario / institucional

HL: cuenta maestra + agentes por host. MTF: igual, más **cuentas multi-firma** de primera clase.

```diff
  // existing: master + agents
  await master.approveAgent(host1_agent);
  await master.approveAgent(host2_agent);

+ // new on MTF: convert master to multi-sig for cold custody
+ await master.convertToMultiSigUser({
+   threshold: 2,
+   signers: [signer1, signer2, signer3],
+ });
+ // every subsequent master-level action requires 2 sigs
+ // agents still work as before for trading actions
```

Consulta [multi-firma](../concepts/multi-sig.md).

### 5. Gestor de cartera con subcuentas

Subcuentas de HL: hasta 8. MTF: hasta 32. El formato en la red coincide:

```diff
- // HL: create one of up to 8 subs
+ // MTF: create one of up to 32 subs (otherwise identical)
  await master.createSubAccount({ name: 'desk-A' });
  await master.subAccountTransfer({ subIndex: 0, deposit: true, amount: '10000' });
```

La gestión de agentes por subcuenta, la inscripción en margen de cartera por subcuenta y los modos de margen por subcuenta son todos compatibles de forma idéntica.

## Tabla de referencia

| Acción usada en HL | Estado en MTF |
|----------------------|---------------|
| `order` (colocar límite / IOC / ALO) | ✅ Compatible con el formato HL |
| `cancel` (por OID) | ✅ Compatible con el formato HL |
| `cancelByCloid` | en despliegue |
| `modify` | en despliegue |
| `batchModify` | en despliegue |
| `usdSend` / transferencias spot | usa MTF nativo |
| `withdraw3` | usa MTF nativo |
| `approveAgent` | Formato MTF nativo; consulta [carteras de agente](../concepts/agent-wallets.md) |
| `updateLeverage` / `updateIsolatedMargin` | Formato MTF nativo |
| `usdClassTransfer` | usa el equivalente MTF nativo |
| `convertToMultiSigUser` | MTF nativo, vista previa |
| `setReferrer` / `createReferral` | MTF nativo; la semántica puede diferir |

(La tabla se actualiza a medida que crece el soporte de la capa de compatibilidad.)

## Obtener ayuda

- Este repositorio (`mtf-exchange/metaflux-knowledges`) — abre un issue
- Consulta [`POST /exchange`](../api/rest/exchange.md) y la [guía de firma](./signing.md) para la referencia a nivel de red
