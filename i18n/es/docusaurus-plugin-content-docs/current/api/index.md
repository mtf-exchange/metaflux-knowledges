---
description: "Superficie REST y WebSocket — el protocolo MTF-native, respaldado por la cadena."
---

# Referencia de API

Un único protocolo MTF-native, servido por la puerta de entrada del gateway
(`https://<net>-gateway.mtf.exchange`).

| Superficie | Dónde | Notas |
|---------|-------|-------|
| **MTF-native** | `POST /exchange`, `POST /info`, `GET /ws`, `POST /faucet` | Formato compacto en snake_case. Expone todo, incluidas las funciones avanzadas de MTF (RFQ, FBA, inscripción en PM, cross-chain). |

> El gateway es la puerta de entrada de la superficie MTF-native
> (`/info`, `/exchange`, `/ws`). ¿Ejecutas el nodo tú mismo? Sirve la misma
> superficie nativa directamente en `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native; catálogo completo de acciones
- [`POST /info`](./rest/info.md) — MTF-native; esquemas por tipo

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
