# MIP-1 — Estándar de token spot + despliegue de mercado

:::info
**Implementado.** Se incluye como la familia de acciones `spotDeploy`; consulta la nota sobre numeración más abajo.
:::

MIP-1 es el estándar nativo de tokens spot de MetaFlux y el mecanismo para
desplegar un mercado spot de un token mediante una subasta de gas on-chain. Es
la contraparte spot del despliegue de **perp** sin permisos de [MIP-3](./mip-3.md) —
el primitivo análogo en plataformas on-chain consolidadas es una propuesta
independiente a la del perp, y MetaFlux refleja esa separación.

## Por qué existe

La inclusión de tokens spot, al igual que la de contratos perpetuos, forma parte
del protocolo y no es una decisión curada por el equipo. Cualquiera puede
registrar un símbolo de token y poner en marcha un mercado spot ganando la
subasta de gas correspondiente y aportando los parámetros iniciales — sin lista
de acceso permitido, sin comité de revisión.

## Flujo

El despliegue spot corresponde a la acción `spotDeploy`, despachada mediante la
sub-variante `SpotDeployKind`, que cubre el ciclo de vida completo del par:

1. **`RegisterToken`** — registra un nuevo token spot; asigna un `AssetId`.
2. **`SetPair`** — registra un par de negociación `(base, quote)` (por ejemplo, `(BTC, USDC)`);
   asigna el `AssetId` del par.
3. **`SetFee`** — establece el nivel de comisión por par.
4. **`ActivatePair`** — activa el par (lo abre a la negociación).
5. **`DeactivatePair`** — desactiva el par (lo cierra a nuevas órdenes).

Ganar un slot de despliegue se realiza a través de la subasta de gas compartida:
un builder llama a **`submitGasAuctionBid`** contra el stream
`register_token_gas_auction` (para reclamar un símbolo de token) o el stream
`spot_pair_deploy_gas_auction` (para desplegar un par). Cada puja deposita en
custodia una cantidad en USDC (reembolsada en caso de pérdida menos una pequeña
comisión) y lleva la especificación del mercado. Los parámetros de la subasta
(decaimiento, ventana de reembolso, intervalo de slot) son configurables por
gobernanza y se comparten con la maquinaria de MIP-3.

## Nota sobre la numeración

En la implementación actual, las acciones `spotDeploy` residen en el mismo módulo
que las acciones `perpDeploy` y se etiquetaron históricamente como "MIP-3". Según
el [registro de MIP](./index.md), el despliegue spot corresponde correctamente a
**MIP-1** y el despliegue perp a **MIP-3** (reflejando la distinción spot/perp
en plataformas consolidadas). El comportamiento no cambia; únicamente se está
realineando la etiqueta.
