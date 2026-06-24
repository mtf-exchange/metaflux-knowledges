# Redes

:::info
**Estado.** **devnet estable**. Los `chainId` de Testnet (`chainId 114514`) y mainnet (`chainId 8964`) están asignados; sus endpoints se publicarán antes del lanzamiento.
:::

## Resumen

| Red | Estado | `chainId` | ¿Wire estable? |
|---------|--------|-----------|:------------:|
| Devnet | abierta para integración | `31337` | sí |
| Testnet | vista previa antes de mainnet | `114514` | sí |
| Mainnet | no lanzada | `8964` | sí |

## Devnet

El entorno de integración. USDC gratuito a través del faucet; estado efímero (se reinicia ocasionalmente).

El gateway es la única puerta de entrada pública. MTF-native es la ruta por defecto
(`/info` · `/exchange` · `/ws`); la compatibilidad HL está disponible en `/hl/*`; CCXT en
`/ccxt/*`; EVM JSON-RPC en `/evm`.

| Servicio | Endpoint |
|---------|----------|
| Puerta de entrada del gateway | `https://devnet-gateway.mtf.exchange` |
| MTF-native (por defecto) | `POST /info` · `POST /exchange` · `GET /ws` |
| Compatibilidad HL | `POST /hl/info` · `POST /hl/exchange` · `GET /hl/ws` |
| Compatibilidad CCXT | `/ccxt/*` |
| EVM JSON-RPC | `POST /evm` |
| Faucet (devnet/testnet) | `POST /faucet` |
| Gateway WS (nativo) | `wss://devnet-gateway.mtf.exchange/ws` |
| Explorador | `https://devnet.mtf.exchange/explorer` |
| Estado | `https://status.mtf.exchange/devnet` |

¿Ejecutas el nodo localmente? El nodo expone la misma interfaz nativa directamente en
`http://localhost:8080` (`/info` · `/exchange` · `/ws` · `/faucet`), y su EVM RPC
en `http://localhost:8545`. Estos son los puertos para autoalojamiento, no URLs públicas.

| Parámetros de firma | Valor |
|--------------------|-------|
| `chainId` | `31337` |
| EIP-712 domain `name` | `"MetaFlux"` |
| EIP-712 domain `version` | `"1"` |
| EIP-712 domain `verifyingContract` | `0x0000000000000000000000000000000000000000` |

Puente USDC: a través del **puente de custodia MetaBridge** ([bridge](./bridge/)), no Circle CCTP. Los depósitos en testnet utilizan el despliegue de `MetaBridgeUSDC` en Base Sepolia + el USDC de prueba de Circle en Base Sepolia.

### Faucet

`POST /faucet` en la puerta de entrada del gateway acredita una dirección con fondos de prueba.
Solo disponible en devnet/testnet — la ruta **nunca se monta en mainnet** (`chainId 8964`).
La concesión queda en estado **`"queued"`** — programada para el siguiente bloque, por lo que el saldo se actualiza
tras ~1 bloque, no de forma sincrónica. Contrato completo: [`POST /faucet`](api/rest/faucet.md).

```bash
curl -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x<YOUR_ADDRESS>"}'
# -> {"address":"0x…","usdc":3000,"mtf":10,"status":"queued"}
```

- Otorga **3000 USDC** como colateral cruzado **+ 10 MTF** spot — **una sola vez por
  dirección** (segunda solicitud → `429 address already funded`).
- `amount` opcional (USDC entero); limita la concesión de USDC *hacia abajo* (≤ 3000). MTF es fijo.
- Límite de tasa: 1 solicitud / minuto / IP (`429` al superarlo).
- `400` dirección inválida · `429` ya financiada / IP bloqueada · `503` cola llena — cuerpo `{"error":"…"}`.

### Reinicios de estado

Devnet puede reiniciarse para actualizaciones de protocolo. Cadencia: bajo demanda durante el desarrollo pre-mainnet; aviso semanal cuando sea posible. Consulta [el estado](https://status.mtf.exchange/devnet) para anuncios de reinicios.

## Testnet (planificada)

Red de ensayo pre-mainnet con garantías de estabilidad.

| Servicio | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Faucet | TBD (con límite de tasa) |
| Explorador | TBD |

`chainId` de Testnet: `114514` (`0x1bf52`). MetaFlux es una red independiente con sus propios chain ids.

Diferencias entre testnet y mainnet:
- USDC se puentea a través de MetaBridge desde una cadena fuente de testnet (USDC de prueba de Base Sepolia), no USDC real.
- El conjunto de validadores está controlado por el operador.
- Sin valor económico real.

La estructura wire de testnet es idéntica a la de mainnet. Los clientes probados contra testnet solo deberían requerir **el cambio de `chainId` y la URL base** para pasar a mainnet.

## Mainnet (planificada)

Red de producción. USDC real, valor real, validadores reales.

| Servicio | Endpoint |
|---------|----------|
| Gateway REST | TBD |
| Gateway WS | TBD |
| Explorador | TBD |

`chainId` de Mainnet: `8964` (`0x2304`).

Diferencias entre mainnet y devnet/testnet:
- USDC es real, puenteado a través de la custodia MetaBridge desde Base (y más adelante Arbitrum / Solana).
- El conjunto de validadores no tiene permisos (elegido por gobernanza).
- Valor económico real.
- Límites de tasa y comisiones según [límites de tasa](./api/rate-limits.md) y [comisiones](./concepts/fees.md).

## Corredores de puente

USDC (y otros activos) se puentean a través del **puente de custodia MetaBridge** — cofirma ponderada por participación ⅔ de los validadores, sin dependencia de Circle CCTP. Cadenas fuente:

| Cadena | Estado |
|-------|--------|
| Base | **activo en Base Sepolia** (`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)); mainnet pre-auditoría |
| Solana | **activo en devnet** (programa `metabridge-solana` [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet)); mainnet pre-auditoría |
| Arbitrum | planificado |

Consulta [bridge](./bridge/) para el flujo de depósito/retiro y la tabla de despliegues.

## Estado

Estado operativo, historial de incidentes y mantenimiento planificado:

- Devnet: `https://status.mtf.exchange/devnet`
- Testnet: TBD
- Mainnet: TBD

La página de estado expone:
- Estado actual de la red (`operational`, `degraded`, `partial outage`, `major outage`)
- Incidentes recientes con sus cronologías
- Ventanas de mantenimiento planificadas
- Última altura de bloque confirmada
- Tamaño del conjunto de validadores activo

## Ventanas de compatibilidad

| Red | Compromiso de estructura wire |
|---------|-----------------------|
| Devnet | Mejor esfuerzo; cambios incompatibles anunciados con 24 h de antelación |
| Testnet | Estable; los cambios incompatibles requieren un aviso de desuso de 30 días |
| Mainnet | Estable; cambios incompatibles según la [política de versiones](./versioning.md) |

## Ver también

- [Bridge](./bridge/) — detalles del puente de custodia MetaBridge
- [Versiones](./versioning.md) — política de cambios en la estructura wire
- [Inicio rápido](./integration/quickstart.md) — primera llamada contra devnet
- [Firma](./integration/signing.md) — uso del chainId
