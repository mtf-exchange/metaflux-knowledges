# Interactuando con Core

:::tip
**Activo en devnet.** Las acciones de CoreWriter están operativas, al igual que los
precompilados MTF de derivados sin estado (`0x0900`–`0x0904`). Los precompilados de
lectura respaldados por el estado de Core — que consultan directamente las posiciones y
el libro del chain — y los precompilados entre cadenas están próximos. El puente
([Bridge](../bridge/)) ya está activo.
:::

Un contrato en el EVM de MetaFlux se comunica con **Core** (el centro de compensación
de contratos perpetuos L1 + CLOB on-chain) en dos direcciones:

- **Lectura** — `staticcall` a un **precompilado** del sistema para obtener un valor
  derivado de Core.
- **Escritura** — llamar al contrato del sistema **CoreWriter** para enviar una acción L1.

La separación entre precompilado de lectura y contrato de escritura permite que un
contrato EVM se componga directamente con el estado en vivo del L1 — cotizar contra
las propias fórmulas del chain y luego actuar sobre el centro de compensación — sin
salir de la VM.

## Escritura en Core — CoreWriter

Envía una acción L1 llamando a **CoreWriter** en
`0x3333333333333333333333333333333333333333`:

```solidity
interface ICoreWriter {
    /// Emitted on every successful call; the L1 scanner consumes this log.
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` es un payload con prefijo de versión e id:

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=20)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

La cuenta actuante es `msg.sender` (el contrato que realiza la llamada). Tras un
breve retraso de acción, el L1 despacha la acción decodificada.

:::info
**Atomicidad.** Una llamada a `sendRawAction` solo consume gas y emite `RawAction`.
Cualquier fallo en el lado del L1 **posterior** a eso es silencioso — **no hay revert
en el EVM**. Un contrato debe auto-recuperarse y tratar el evento `RawAction` como el
único vínculo causal entre la llamada EVM y el resultado en el L1.
:::

### Acciones

CoreWriter expone 20 acciones L1 (id, big-endian, en el slot `uint24` anterior):

| id | Acción | Propósito |
|---:|--------|-----------|
| 1 | `LimitOrder` | Colocar una orden limitada en un mercado de perpetuos o spot |
| 2 | `VaultTransfer` | Depositar o retirar fondos de un vault |
| 3 | `TokenDelegate` | Delegar stake a un validador |
| 4 | `StakingDeposit` | Mover tokens al saldo de staking |
| 5 | `StakingWithdraw` | Retirar tokens del saldo de staking |
| 6 | `SpotSend` | Transferir un token spot a otra cuenta |
| 7 | `UsdClassTransfer` | Mover USDC entre las cuentas de clase perp y spot |
| 8 | `FinalizeEvmContract` | Vincular un contrato EVM a su token / id de contrato en Core |
| 9 | `AddApiWallet` | Autorizar una subclave (wallet agente) para operar |
| 10 | `CancelByOid` | Cancelar una orden por id de orden del servidor |
| 11 | `CancelByCloid` | Cancelar una orden por id de orden del cliente |
| 12 | `ApproveBuilderFee` | Autorizar a un builder a cobrar una comisión (con tope) |
| 13 | `SendAsset` | Transferencia genérica de activos (perp / spot / vault) |
| 14 | `ReflectEvmSupplyChange` | Sincronizar un cambio de suministro ERC-20 del lado EVM con Core |
| 15 | `BorrowLend` | Abrir / cerrar una posición de préstamo |
| 16 | `PortfolioMarginEnroll` | Inscribir o excluir al emisor en el margen de cartera entre activos |
| 17 | `RfqSubmit` | Enviar una cotización RFQ (id, mercado, lado, tamaño, precio límite) |
| 18 | `FbaConfigure` | Configuración de subasta por lotes frecuente por mercado |
| 19 | `CrossChainSend` | Transferencia entre cadenas agnóstica (encolada en [MetaBridge](../bridge/)) |
| 20 | `EncryptedOrderSubmit` | Orden cifrada con umbral (compromiso + texto cifrado) |

Los structs de parámetros tipados y un caller Solidity listo para usar se encuentran en
el repositorio público
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts);
el CoreWriter on-chain en `0x3333…` es el objetivo de producción (en pruebas, un
sustituto determinista en Solidity emite el mismo payload `RawAction`).

## Lectura de Core — precompilados

Cada precompilado es un `staticcall` a una dirección fija con una entrada **empaquetada**
big-endian hecha a medida (no ABI de Solidity). Los tamaños y precios están en el plano
de **punto fijo 1e8** (`px_e8`, `size_e8`); los márgenes en USDC son **1e6**.

| Dirección | Precompilado | Devuelve |
|-----------|--------------|----------|
| `0x0900` | `portfolio_margin_eval` | Margen de mantenimiento requerido tipo SPAN, índice del peor escenario, penalización por concentración |
| `0x0901` | `vault_nav` | NAV total del vault, total de participaciones, NAV por participación, PnL no realizado |
| `0x0902` | `adl_pro_rata_price` | VWAP al que se liquida un ADL de un tamaño dado, recorriendo la cola por prioridad de lado |
| `0x0903` | `mark_settle` | Delta de PnL por posición, financiación acumulada nueva, PnL no realizado a un precio de marca |
| `0x0904` | `rfq_book_depth` | Profundidad del libro RFQ (filtrada por lado, profundidad limitada) |
| `0x0906` | `clob_bbo` | Mejor precio de compra / mejor precio de venta + tamaño (tope del libro) |
| `0x0907` | `clob_l2_depth` | Niveles `(precio, tamaño)` agregados Top-N por lado |
| `0x0908` | `inventory_risk` | Nocional neto / bruto, concentración, umbral de límite de riesgo |

Hoy son precompilados de **cotización sin estado**: el llamante pasa los inputs
(posiciones, niveles de cola, cotizaciones, …) y el precompilado devuelve el resultado
calculado, de modo que un contrato puede reproducir un cálculo de Core a partir de las
propias fórmulas del chain. Las **lecturas en vivo respaldadas por el estado de Core**
(que consultan directamente las posiciones y el libro del chain) están próximas.

## Transferencias de valor Core ↔ EVM

- **Hacia Core** desde un contrato EVM: `SpotSend` / `SendAsset` / `UsdClassTransfer`
  / `VaultTransfer` a través de CoreWriter (ver arriba).
- **Entre cadenas**: `CrossChainSend` se encola en el
  [puente de custodia MetaBridge](../bridge/), que libera los fondos en la cadena de
  destino mediante co-firma de ⅔ de los validadores.

## Ver también

- [Bridge](../bridge/) — custodia entre cadenas (el destino de `CrossChainSend`)
- [Mark prices](../concepts/mark-prices.md) — el plano de precios de punto fijo 1e8 que usan los precompilados
- [Portfolio margin](../concepts/portfolio-margin.md) / [ADL](../concepts/adl.md) — la matemática de Core que cotizan los precompilados `0x0900` / `0x0902`
