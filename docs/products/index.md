---
description: The trading products MetaFlux supports, with the status of each and a link to its mechanics. Perpetuals, spot and options are active; spot margin is a testnet preview; CDS is planned.
---

# Products

This section lists the trading products of MetaFlux and the status of each.

Each product is a separate market type. It has its own book, balances and risk model.
Each page below gives the mechanics of one product. For the mechanics that the products
share, such as order types, margin, liquidation and fees, see [Concepts](../concepts/index.md).

## Products and status {#what-you-can-trade}

| Product | Description | Status |
|---|---|---|
| [Perpetuals](./perpetuals.md) | A leveraged long or short position on the price of an asset. It has no expiry. Funding anchors its price. | Active |
| [Spot](./spot.md) | A token-for-token CLOB. Trades settle against your balance. There is no leverage. | Active |
| [Spot margin](./spot-margin.md) | Leveraged spot. The [Earn](../concepts/earn.md) lending pool funds the borrow. | Testnet preview. No pair is calibrated for borrowing yet. |
| [Options](./options.md) | Standard European puts and calls. They are fully collateralized and trade through [RFQ](../concepts/rfq.md) only. A put settles in USDC. A call settles in the underlying coin. | Active. Validators list each series by vote. |
| [CDS](./cds.md) | Protection contracts in the style of a credit default swap. | Planned |

## Sharia compliance {#sharia}

:::info
Only non-leveraged [spot](./spot.md) is generally regarded as compatible with
Islamic finance principles. Non-leveraged spot is a purchase or a sale at full value,
with no leverage, margin, borrowing or funding. Every other product here is leveraged
or derivative. This includes spot margin. These products add interest (riba) and
uncertainty (gharar, maysir).

This is information only. It is not religious or financial advice.
:::

## See also {#see-also}

- [Contract specifications](../concepts/contract-specifications.md): the specification of each perp contract (margin, mark, funding, increments and limits), read from the API.
- [Concepts](../concepts/index.md): the shared mechanics. These are [order types](../concepts/order-types.md), [margin modes](../concepts/margin-modes.md), [funding rates](../concepts/funding-rates.md), [tiered liquidation](../concepts/tiered-liquidation.md) and [fees](../concepts/fees.md).
- [`/exchange`](../api/rest/exchange.md): the wire actions for every product.
- [MetaFlux 101](../start-here.md): a plain-language introduction to MetaFlux.
