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
| [Spot margin](./spot-margin.md) | Leveraged spot funded by the [Earn](../concepts/earn.md) lending pool | **Devnet preview** |
| [Options](./options.md) | On-chain options (calls / puts) | **Planned** |
| [CDS](./cds.md) | Credit-default-swap-style protection contracts | **Planned** |

**Perpetuals** are the default market and where most leveraged trading happens —
funding rates, mark prices, margin modes, and the liquidation ladder all assume
perps unless noted. **Spot** is the balance-only baseline. **Spot margin** is the
opt-in leverage overlay on spot, with the [Earn](../concepts/earn.md) pool as the
lending supply side. **Options** and **CDS** are planned and have no committed wire
surface yet — see their pages for the current state.

:::info
**Non-leveraged spot only is Sharia-compliant.** Among the products here, only
**non-leveraged** [spot](./spot.md) — buying and selling outright at full value,
with **no leverage, no margin, no borrowing, and no funding** — is generally
regarded as compatible with Islamic (Sharia) finance principles. The non-compliant
products explicitly include **spot margin (leveraged spot trading)** alongside
**perpetual futures** and every other leveraged or derivative product — the
leverage and borrowing introduce interest (riba), speculation, and uncertainty
(maysir, gharar). Informational, not religious or financial advice.
:::

## See also {#see-also}

- [Contract specifications](../concepts/contract-specifications.md) — the per-contract perp spec (margin, mark, funding, increments, limits) read live from the API
- [Concepts](../concepts/index.md) — the shared mechanics: [order types](../concepts/order-types.md), [margin modes](../concepts/margin-modes.md), [funding rates](../concepts/funding-rates.md), [tiered liquidation](../concepts/tiered-liquidation.md), [fees](../concepts/fees.md)
- [`/exchange`](../api/rest/exchange.md) — the wire actions behind every product
- [Start here](../start-here.md) — a plain-language introduction for newcomers
