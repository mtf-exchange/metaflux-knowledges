# Guía de firma

:::info
**Esta página se ha trasladado.** Las acciones de `/exchange` se firman con **datos tipados estructurados EIP-712** (`eth_signTypedData_v4`). Ese es el único esquema de firma.
El recorrido completo — dominio, cadenas de tipo por acción, digest, ejemplos detallados y verificación local — está ahora disponible en
[**firma de datos tipados**](./typed-data-signing.md).
:::

Cada solicitud a `/exchange` lleva una firma de datos tipados EIP-712: la billetera muestra
cada campo de acción por nombre, el servidor reconstruye la estructura tipada a partir de
`action.type` + `action.params`, vuelve a calcular el digest y recupera el firmante
(la cuenta, o un [agente](../concepts/agent-wallets.md) autorizado por ella). No
existe un segundo esquema entre el que elegir.

Consulta [**firma de datos tipados**](./typed-data-signing.md) para ver la especificación
completa y ejemplos de TypeScript / Python listos para copiar y pegar.

## Ver también

- [Firma de datos tipados](./typed-data-signing.md) — el esquema de firma, de principio a fin
- [`POST /exchange`](../api/rest/exchange.md) — el endpoint
- [Billeteras de agente](../concepts/agent-wallets.md) — configuración con múltiples firmantes
- [Idempotencia](./idempotency.md) — estrategia de nonce y reintentos
- [Errores](../api/errors.md) — todos los errores que podrías encontrar durante el despliegue de la firma
- [Redes](../networks.md) — chainId por red
