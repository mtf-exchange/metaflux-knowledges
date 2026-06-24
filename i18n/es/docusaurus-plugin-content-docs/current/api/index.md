---
description: "Superficie REST y WebSocket — tres familias de protocolos, todas respaldadas por la misma cadena."
---

# Referencia de API

Tres familias de protocolos, todas servidas por la misma puerta de entrada
(`https://<net>-gateway.mtf.exchange`) — la elección del formato de comunicación
del cliente es simplemente una elección de ruta.

| Familia | Dónde | Cuándo usar |
|--------|-------|----------|
| **MTF-native** | Ruta **predeterminada** del gateway: `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Clientes nuevos. Formato compacto en snake_case. Expone todo, incluidas las funciones avanzadas de MTF (RFQ, FBA, inscripción en PM, cross-chain). |
| **HL-compat** | Gateway bajo `/hl/*`: `POST /hl/exchange`, `POST /hl/info`, `GET /hl/ws` | Migrar un cliente HL existente. Los formatos JSON coinciden exactamente con HL. Sin cambios de código para `order`, `cancel` (se añaden más variantes con el tiempo). |
| **CCXT-compat** | Gateway bajo `/ccxt/*` | Frameworks quant que ya hablan CCXT. Subconjunto REST mínimo disponible; CCXT Pro WS próximamente. |

> El gateway es la puerta de entrada unificada — MTF-native es la ruta predeterminada
> (`/info`, `/exchange`), HL-compat está bajo el espacio de nombres `/hl/*`, CCXT bajo
> `/ccxt/*`. ¿Ejecutas el nodo tú mismo? Sirve la misma superficie nativa
> directamente en `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native; catálogo completo de acciones
- [`POST /info`](./rest/info.md) — MTF-native; esquemas por tipo
- [HL-compat](./rest/hl-compat.md) — espejo del protocolo de HL
- [CCXT-compat](./rest/ccxt-compat.md) — métodos REST de CCXT

## WebSocket

- [Protocolo WS](./ws/index.md) — ciclo de vida de la conexión, frames, autenticación, reanudación
- [Suscripciones](./ws/subscriptions.md) — catálogo completo de canales

## Transversales

- [Errores](./errors.md) — catálogo completo de errores con instrucciones de resolución
- [Límites de tasa](./rate-limits.md) — presupuestos de peso por IP y QPS por cuenta

## Ver también

- [Inicio rápido de integración](../integration/quickstart.md) — end-to-end en 5 minutos
- [Guía de firma](../integration/signing.md) — sobre EIP-712
- [Redes](../networks.md) — endpoints por red
