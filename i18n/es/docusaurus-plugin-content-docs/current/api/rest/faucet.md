---
description: Grifo de prueba para Devnet/testnet — concesión única de USDC de prueba + MTF. Rechazado en mainnet.
---

# `POST /faucet` — fondos de prueba en devnet/testnet

:::warning
**Solo Devnet / testnet.** El grifo acuña colateral libre + tokens spot de
la nada. Está **rechazado estructuralmente en mainnet** (chain id `8964`): la ruta
nunca llega a montarse allí. No dependas de ella en ningún flujo de producción.
:::

## TL;DR

Una sola solicitud `POST /faucet` otorga **3000 USDC** de colateral cruzado **y 10 MTF** en tokens
spot (token id `104`) a una dirección arbitraria. **Una única vez por dirección.** La
respuesta es `"queued"` — los créditos se reflejan tras ~1 bloque (se inyectan como
acciones de sistema del validador, no se confirman de forma sincrónica). Se sirve como `POST /faucet`
en la puerta principal del gateway, junto a las rutas nativas `/info` + `/exchange`.

## URL

```
POST  https://<net>-gateway.mtf.exchange/faucet
```

Si ejecutas el nodo tú mismo, la misma ruta `/faucet` se sirve directamente en
`http://localhost:8080`.

| Entorno | ¿Disponible? |
|---------|--------------|
| Devnet (`31337`) / testnet (`114514`), grifo habilitado | sí |
| Mainnet (`8964`) | **no** — la ruta nunca se monta; una petición errante recibe `403` del guard defensivo del handler |
| Grifo deshabilitado en la configuración del nodo | no |

La ruta se integra en el router principal de la API únicamente cuando la configuración
del grifo en el nodo está **habilitada Y fuera de mainnet**. Tiene su propio estado de
handler y es estructuralmente inalcanzable desde el árbol del handler de `/exchange`.

## Solicitud

```json
{ "address": "0x00000000000000000000000000000000000ca11e" }
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `address` | dirección hex `0x` de 20 bytes | sí | Destinatario. Acepta 40 o 42 caracteres (`0x` opcional). La dirección cero se rechaza. |
| `amount` | uint64 (USDC enteros) | no | Concesión opcional de USDC; **limita HACIA ABAJO** respecto al máximo configurado (3000) — un valor mayor se recorta a 3000, nunca por encima. `0` es rechazado. Los MTF (10) son fijos independientemente. |

```bash
curl -s -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x00000000000000000000000000000000000ca11e"}'
```

## Respuesta

### `200 OK` — en cola

```json
{
  "address": "0x00000000000000000000000000000000000ca11e",
  "usdc":    3000,
  "mtf":     10,
  "status":  "queued"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `address` | cadena hex `0x` | Destinatario repetido en la respuesta, normalizado en minúsculas |
| `usdc` | uint64 | USDC concedidos (enteros, tras el recorte descendente si aplica) |
| `mtf` | uint64 | Tokens spot MTF concedidos (enteros, fijos en 10) |
| `status` | `"queued"` | Los créditos están **programados para el siguiente bloque**, no confirmados aún |

`"queued"` es literal: la concesión consiste en dos acciones de sistema inyectadas por el validador
(`SystemUserModify{AdjustCrossAccountValue}` para USDC + `SystemSpotSend` para MTF)
que se anteponen al siguiente bloque propuesto. Consulta [`account_state`](./info.md#account_state)
(o [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state)) ~1 bloque
después para ver el saldo:

```json
// account_state tras confirmar el crédito:
{ "account_value": "3000", "balances": { "usdc": "3000", "spot": { "MTF": "10" } }, ... }
```

### Errores

| HTTP | Cuerpo | Causa |
|------|--------|-------|
| 400 | `{"error":"invalid address: <detail>"}` | `address` no es una dirección hex `0x` válida (p. ej., longitud incorrecta) |
| 400 | `{"error":"zero address not allowed"}` | El destinatario es la dirección cero |
| 400 | `{"error":"amount must be positive"}` | Se indicó explícitamente `amount` con valor `0` |
| 429 | `{"error":"address already funded"}` | Esta dirección ya reclamó fondos anteriormente (**una sola vez**, permanente durante la vida del nodo) |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | La IP de origen realizó una solicitud dentro del período de enfriamiento por IP (por defecto 1/min/IP) |
| 403 | `{"error":"faucet disabled on this network"}` | Guard defensivo (no debería ser alcanzable — mainnet nunca monta la ruta) |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | Cola de inyección saturada (contrapresión transitoria; vuelve a intentarlo) |

```json
// segunda reclamación para la misma dirección:
{ "error": "address already funded" }   // HTTP 429
```

## Límites

- **Una única vez por dirección.** Se registra en un conjunto en memoria (se reinicia al reiniciar el nodo;
  devnet es efímero). Una segunda reclamación para la misma dirección — incluso desde una IP distinta,
  incluso mucho después — devuelve `429 address already funded`. Una solicitud *rechazada*
  NO consume el cupo único.
- **Límite por IP.** Por defecto, 1 solicitud / minuto / IP de origen. Distintas direcciones
  desde la misma IP dentro de la ventana temporal reciben `429 rate limit`.
- **Límite de USDC.** El `amount` opcional solo recorta hacia abajo; nunca es posible obtener más
  que los 3000 USDC configurados.

## Por qué esto NO está en `/exchange`

Los dos créditos del grifo son **acciones de sistema / privilegiadas**
(`SystemUserModify`, `SystemSpotSend`) — acuñan colateral y spot de la
nada. Pertenecen al rango de IDs de acción del sistema y **nunca** forman parte de la
lista de acciones de usuario permitidas en `/exchange`. El grifo los encola en una **cola de
inyección exclusiva del validador** (no en el mempool público); el runtime la vacía
en el payload del bloque exactamente igual que el feed del oráculo, con la propia dirección del
validador como remitente, lo que hace que la comprobación `require_system_authority` los admita.
No existe ninguna ruta de código desde el mempool público de usuarios hasta esta cola. Consulta
[never expose system actions on /exchange](./exchange.md#non-bridged-actions).

## Frontera de determinismo

Todo en el borde HTTP del grifo es no determinista (límite de IP por reloj de pared,
conjunto de reclamaciones local al host). Los ÚNICOS valores que cruzan al consenso son el
destinatario y los importes en las dos acciones de sistema, que fluyen sin cambios por los
handlers deterministas. El estado local del host (límite de tasa / conjunto de reclamaciones) nunca
se hashea en el AppHash.

## Véase también

- [`POST /info`](./info.md) — leer `account_state` / `spot_clearinghouse_state` para confirmar el crédito
- [`POST /exchange`](./exchange.md) — la ruta de escritura de acciones de usuario (las acciones de sistema como los créditos del grifo nunca la transitan)
- [Redes](../../networks.md) — chain ids por red
