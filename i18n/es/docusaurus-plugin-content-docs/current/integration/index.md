---
description: Conecta un cliente a MetaFlux — SDKs, firma, migración, idempotencia y manejo de errores.
---

# Integración

Cómo conectar un cliente a MetaFlux. Elige el punto de partida que mejor se adapte a tu situación.

## Puntos de partida

| Si estás empezando desde… | Ve a |
|--------------------------|-------|
| Cero — solo quieres probarlo | [Inicio rápido](./quickstart.md) |
| Un bot/herramienta HL existente | [Migración desde HL](./migrating-from-hl.md) |
| TypeScript / browser desde cero | [SDK de TypeScript](./typescript-sdk.md) |
| Servicio Rust desde cero | [SDK de Rust](./rust-sdk.md) |
| Cualquier otro (Python, Go, …) | [Firma con typed-data](./typed-data-signing.md) — implementa tú mismo la firma EIP-712 typed-data |

## Temas

- [Inicio rápido](./quickstart.md) — flujo completo en 5 minutos (depósito → operación → retiro)
- [Firma con typed-data](./typed-data-signing.md) — el esquema de firma EIP-712, de principio a fin con ejemplos funcionales
- [Guía de firma paso a paso](./signing.md) — referencia a la firma con typed-data (mantenida para enlaces anteriores)
- [Guía de carteras de agente](./agent-wallets-howto.md) — código concreto para el patrón de hot-key
- [Idempotencia](./idempotency.md) — estrategia de nonce y reintentos seguros
- [Manejo de errores](./error-handling.md) — árbol de decisión para admisión, confirmación y red
- [Patrón risk-watcher](./risk-watcher.md) — recarga automática de margen
- [Migración desde HL](./migrating-from-hl.md) — cambia un bot de Hyperliquid a la API nativa de MTF

## SDKs

| Lenguaje | Estado | Paquete |
|----------|--------|---------|
| TypeScript / JavaScript | preview | [`@metaflux/sdk`](./typescript-sdk.md) |
| Rust | preview | [`metaflux-client`](./rust-sdk.md) |

Para otros lenguajes (Python, Go, Java, C++ …), implementa la firma EIP-712 typed-data según la [firma con typed-data](./typed-data-signing.md) — cada paso está documentado con ejemplos resueltos. El protocolo de red es lo suficientemente simple como para que un cliente escrito a mano sea la opción correcta para stacks de nicho.

## Endpoints de red

Consulta [redes](../networks.md) para la referencia completa por red.

El gateway (`https://api.<net>.mtf.exchange`) es el único punto de entrada público.

| Ruta | Sirve | Propósito |
|------|--------|---------|
| `POST /info` · `POST /exchange` · `GET /ws` | MTF-native | Superficie nativa en snake_case |
| `POST /evm` | EVM JSON-RPC | RPC de la sidechain EVM |
| `POST /faucet` | Faucet | Grifo de prueba para devnet/testnet |

Los despliegues en producción terminan TLS en el gateway y lo colocan detrás de una CDN; el nodo intencionalmente no está expuesto a internet — se encuentra detrás del gateway. Si ejecutas el nodo tú mismo, la misma superficie nativa se sirve directamente en `http://localhost:8080` (RPC EVM sin cifrar en `http://localhost:8545`).

## Patrones comunes

- **Bot maker** — firmado por agente, cotización persistente, sidecar risk-watcher, órdenes ALO para nivel de maker garantizado
- **Monitor de liquidación** — suscriptor WS en `marginEvents` + `userEvents` (`yellowCard`); dispara recargas de margen antes de T1
- **Wrapper TWAP** — envía `TwapOrder`, observa `twapEvents` para telemetría de slices, cancelación manual opcional durante la ejecución
- **Gestor de vault** — `VaultDeploy` una vez, luego órdenes firmadas por agente para la dirección del vault durante el rebalanceo
- **Custodia institucional** — master multi-sig + agentes por host + envoltura multi-sig para flujos de alto valor
