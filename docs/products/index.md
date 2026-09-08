---
description: The trading products MetaFlux supports — perpetuals, spot, spot margin, and the planned options and CDS tracks — with their status and where to read more.
---

# Products

The distinct **trading products** MetaFlux offers. Each is a separate market type
with its own book, balances, and risk model; this section introduces what each one
is, its current status, and links to the full mechanics. For the cross-cutting
machinery they share — order types, margin, liquidation, fees — see
[Concepts](../concepts/index.md).

## What you can trade {#what-you-can-trade}

| Product | What it is | Status |
|---|---|---|
| [Perpetuals](./perpetuals.md) | Leveraged long/short on an asset's price, no expiry, anchored by funding | **Live** |
| [Spot](./spot.md) | Token-for-token CLOB, settled against your balance, no leverage | **Live** |
| [Spot margin](./spot-margin.md) | Leveraged spot funded by the [Earn](../concepts/earn.md) lending pool | **Testnet preview** — no pair is calibrated for borrowing yet |
| [Options](./options.md) | Standard European puts and calls, fully collateralized, traded through [RFQ](../concepts/rfq.md) only. A put settles in USDC; a call settles in the underlying coin | **Live** — series are listed by validator vote |
| [CDS](./cds.md) | Credit-default-swap-style protection contracts | **Planned** |

## Sharia compliance {#sharia}

:::info
Only **non-leveraged** [spot](./spot.md) — buying and selling outright at full
value, with no leverage, margin, borrowing or funding — is generally regarded as
compatible with Islamic finance principles. Every other product here is
leveraged or derivative, **spot margin included**, and introduces interest
(riba) and uncertainty (gharar, maysir).

Informational, not religious or financial advice.
:::

## See also {#see-also}

- [Contract specifications](../concepts/contract-specifications.md) — the per-contract perp spec (margin, mark, funding, increments, limits) read live from the API
- [Concepts](../concepts/index.md) — the shared mechanics: [order types](../concepts/order-types.md), [margin modes](../concepts/margin-modes.md), [funding rates](../concepts/funding-rates.md), [tiered liquidation](../concepts/tiered-liquidation.md), [fees](../concepts/fees.md)
- [`/exchange`](../api/rest/exchange.md) — the wire actions behind every product
- [Start here](../start-here.md) — a plain-language introduction for newcomers
