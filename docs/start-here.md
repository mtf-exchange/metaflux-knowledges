---
description: "A plain-language introduction to MetaFlux for newcomers: what it is, what you can do, and the ideas to know before you trade."
---

# MetaFlux 101 {#metaflux-101--start-here}

This page introduces MetaFlux. It assumes no prior knowledge of crypto or derivatives.

## What MetaFlux is {#what-metaflux-is}

MetaFlux is an open, on-chain exchange. It runs on a public network, not on the private servers of one company. The rules are fixed in software. Every trade is recorded in the open. You keep custody of your own funds.

Because it runs on-chain, MetaFlux has three properties:

- Transparent: anyone can verify what happened.
- Open: anyone can connect, build on it or list a market.
- Always on: many independent operators run it, and no single company can stop it.

You connect with a crypto wallet, deposit funds and trade. There is no account application.

## What you can do today {#what-you-can-do-today}

- Trade perpetual futures. You take a position on whether the price of an asset goes up or down. Leverage is optional, and you never hold the asset. See the definition of "perpetual" below.
- Trade spot. You buy and sell the assets themselves, settled against your balance. Spot is balance-only and has no leverage yet.
- Hold two-way (hedge) positions. You keep a long and a short position open in the same market at the same time. See [hedge mode](concepts/hedge-mode.md).

Also in preview on testnet:

- Supply idle USDC to [Earn](concepts/earn.md). Earn is a lending pool that pays the interest that spot-margin borrowers owe. It pays zero today: the borrow rate is `0` and no pair is calibrated for borrowing, so a redemption returns the principal. Two governance votes change that.
- Trade spot with leverage (spot margin), funded by Earn. See [spot margin](products/spot-margin.md).

For the full list of trading products and their status, see [Products](products/index.md). It covers perpetuals, spot, spot margin, options and the planned CDS track.

## Core concepts {#the-handful-of-concepts-to-know}

Each concept links to a fuller explanation.

Perpetual and spot. A *spot* trade swaps one asset for another, and you own the result. A *perpetual future* (perp) is a contract that tracks the price of an asset. You profit from price moves up or down without owning the asset. A perp has no expiry date, so the position stays open while it stays healthy. Most leveraged trading on MetaFlux uses perps.

The order book. The order book is the live list of all buy and sell offers for a market, sorted by price. A trade happens when a buy offer meets a sell offer at the same price. A *market order* takes the best price available now. A *limit order* waits at a price you set. MetaFlux supports many [order types](concepts/order-types.md) on top of these two.

Leverage and margin. *Margin* is the collateral that backs a position. *Leverage* lets that collateral control a larger position: with 10x leverage, a $100 deposit holds a $1,000 position. Leverage amplifies gains and losses equally. Your *margin mode* sets how collateral is shared or separated between positions. See [margin modes](concepts/margin-modes.md).

Liquidation. A leveraged position can move against you until your collateral no longer covers it. The system then closes the position to stop further loss. This is *liquidation*. MetaFlux uses a gradual process with early warning and partial steps, not one sudden close. See [tiered liquidation](concepts/tiered-liquidation.md).

Funding rates. A perpetual has no expiry, so a small periodic payment keeps its price close to the market price. When more traders are long, longs pay shorts. When more traders are short, shorts pay longs. Traders pay each other. The exchange does not receive the payment. See [funding rates](concepts/funding-rates.md).

Mark price. One large or stray order can distort the last trade price. MetaFlux values your positions against a reference price that resists manipulation, the [mark price](concepts/mark-prices.md). The mark price drives your margin, your liquidation level and your unrealized profit and loss.

:::tip
In short: put up margin, optionally use leverage to size up, watch the health of your position against the mark price, and avoid liquidation. The [glossary](concepts/glossary.md) defines every term.
:::

## What makes MetaFlux distinctive {#what-makes-metaflux-distinctive}

- On-chain and transparent. Every order, trade and liquidation is on a public ledger that anyone can verify. There is no hidden matching and no privileged view of the book.
- Open and permissionless. Anyone can connect a wallet and trade, build tools and applications, or list a new market without approval. See [permissionless market deploy](mip/mip-3.md).
- Resilient. A distributed set of independent operators validates MetaFlux, not one company. No single switch stops it, and no operator can freeze your funds.
- Fast. MetaFlux is built for high throughput and low latency.

The main advantage is capability, not price. MetaFlux invests in advanced market microstructure, risk and margin models, and a high-performance execution layer. The [concepts](concepts/) section shows each of these.

## Get started {#how-to-get-started}

To trade, connect a supported wallet. Use the [networks and chain IDs](networks.md) page to point your wallet at the right network and endpoints.

- Pick a network. [Networks and chain IDs](networks.md) lists the testnet and mainnet endpoints and their chain IDs. Start on testnet to practice with no real funds at risk.
- To build or run a bot, follow the [integration quickstart](integration/quickstart.md). It covers a deposit, a trade and a withdrawal.
- Pick an SDK. The [TypeScript](integration/typescript-sdk.md) and [Rust](integration/rust-sdk.md) clients handle signing and the wire format.

## Next steps {#where-to-next}

- Read the [architecture map](concepts/architecture.md). It names every component inside MetaFlux Core and links each to its page.
- Browse the [concepts](concepts/) section for an explanation of each core mechanism.
- Look up derivatives terms in the [glossary](concepts/glossary.md).
- To build, go to the [integration](integration/) guides.
