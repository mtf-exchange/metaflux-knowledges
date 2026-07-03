---
description: A plain-language introduction to MetaFlux for newcomers — what it is, what you can do, and the handful of ideas worth knowing before you trade.
---

# MetaFlux 101 — Start here

:::info
**New to MetaFlux?** This page assumes no prior knowledge of crypto or
derivatives. By the end you will understand what MetaFlux is, what you can do on
it today, and the few concepts worth knowing before your first trade.
:::

## What MetaFlux is

MetaFlux is an **open, on-chain exchange** — a marketplace where you can trade,
running entirely on a public network rather than inside one company's private
servers. Think of a traditional exchange as a single building with a locked back
office: you have to trust whoever holds the keys. MetaFlux is more like a public
ledger that everyone can read and that no single party controls. The rules are
fixed in software, every trade is recorded in the open, and you keep custody of
your own funds.

Because it lives on-chain, MetaFlux is **transparent** (anyone can verify what
happened), **open** (anyone can connect, build on it, or list a market), and
**always on** (it is run by many independent operators, not one company that can
flip a switch). You connect with a crypto wallet, deposit funds, and trade —
no account application, no gatekeeper.

## What you can do today

- **Trade perpetual futures.** Take a position on whether an asset's price will
  go up or down, with optional leverage, without ever holding the asset itself.
  (More on what "perpetual" means below.)
- **Trade spot.** Buy and sell the assets themselves, settled against your
  balance (balance-only — no leverage yet).
- **Hold two-way (hedge) positions** — keep a long and a short position open in
  the same market at the same time. See [hedge mode](concepts/hedge-mode.md).

And coming soon:

- **Earn yield on idle USDC** through [Earn](concepts/earn.md), a lending pool
  that pays interest.
- **Leveraged spot trading** (spot margin), arriving alongside Earn. See
  [spot margin](products/spot-margin.md).

For the full list of trading products and their status — perpetuals, spot, spot
margin, and the planned options and CDS tracks — see [Products](products/index.md).

## The handful of concepts to know

You do not need to be an expert to start, but a few ideas will make everything
else click. Each links to a fuller explanation.

**Perpetual vs. spot.** *Spot* is the straightforward kind of trade: you swap one
asset for another and own the result. A *perpetual future* ("perp") is a contract
that tracks an asset's price so you can profit from its moves — up or down —
without owning it, and with no expiry date, so the position stays open as long as
you keep it healthy. Perps are how most leveraged trading happens on MetaFlux.

**The order book.** This is the live list of everyone's buy and sell offers for a
market, sorted by price. When your buy offer meets someone's sell offer at the
same price, a trade happens. A *market order* takes the best price available now;
a *limit order* waits at a price you set. MetaFlux supports many
[order types](concepts/order-types.md) on top of these basics.

**Leverage & margin.** *Margin* is the collateral you put up to back a position.
*Leverage* lets that collateral control a larger position — 10x leverage means a
$100 deposit can hold a $1,000 position. Leverage amplifies gains **and** losses,
so it is powerful and risky in equal measure. How your collateral is shared or
walled off between positions is your *margin mode* — see
[margin modes](concepts/margin-modes.md).

**Liquidation.** If a leveraged position moves against you far enough that your
collateral can no longer cover it, the position is closed automatically to stop
the loss from going further. This is *liquidation*. MetaFlux uses a gradual,
[tiered liquidation](concepts/tiered-liquidation.md) process — an early warning
and partial steps rather than a single sudden wipeout — to give positions room to
recover.

**Funding rates.** A perpetual has no expiry, so a small periodic payment keeps
its price tethered to the real market price. When more traders are long, longs
pay shorts; when more are short, shorts pay longs. This is the
[funding rate](concepts/funding-rates.md), and it is paid directly between
traders, not to the exchange.

**Mark price.** Rather than trusting the last trade — which a single large or
stray order could distort — MetaFlux values your positions against a robust,
manipulation-resistant reference called the [mark price](concepts/mark-prices.md).
It is what drives your margin, your liquidation level, and your unrealized profit
and loss.

:::tip
**The short version:** put up *margin*, optionally use *leverage* to size up,
watch your position's health against the *mark price*, and avoid
*liquidation*. The [glossary](concepts/glossary.md) defines every term you will
meet.
:::

## What makes MetaFlux distinctive

- **Fully on-chain and transparent.** Every order, trade, and liquidation is
  recorded on a public ledger that anyone can verify. There is no hidden matching
  and no privileged view of the book — the same rules apply to everyone.
- **Open and permissionless.** Anyone can connect a wallet and trade, build tools
  and applications on top, or even list a new market — no approval required. See
  [permissionless market deploy](mip/mip-3.md).
- **Resilient by design.** MetaFlux is validated by a distributed set of
  independent operators rather than a single company. There is no one switch to
  flip, no single point of failure, and no operator who can freeze your funds.
- **Fast.** MetaFlux is engineered for high throughput and low latency, so
  trading feels responsive even under heavy load.

The deeper edge is *capability*, not price: MetaFlux invests in advanced market
microstructure, sophisticated risk and margin models, and a high-performance
execution layer — so the platform can support strategies and protections that
simpler venues cannot. You will see this throughout the [concepts](concepts/)
section.

## How to get started

:::info
**Just want to trade?** Connect a supported wallet and start from the
[networks & chain IDs](networks.md) page to point your wallet at the right
network and endpoints.
:::

- **Pick a network.** [Networks & chain IDs](networks.md) lists the devnet,
  testnet, and mainnet endpoints and their chain IDs. Start on a test network if
  you want to practice with no real funds at risk.
- **Building or running a bot?** The developer
  [integration quickstart](integration/quickstart.md) walks you from deposit to
  trade to withdraw in a few minutes.
- **Pick an SDK.** Ready-made clients in
  [TypeScript](integration/typescript-sdk.md) and
  [Rust](integration/rust-sdk.md) handle signing and the wire format for you.

## Where to next

- Want the big picture first? The [Architecture map](concepts/architecture.md)
  names every component inside MetaFlux Core and links each to its deep dive.
- Browse the [Concepts](concepts/) section for plain-language explanations of
  every core mechanism.
- New to derivatives terms? The [Glossary](concepts/glossary.md) defines them all.
- Ready to build? Head to the [Integration](integration/) guides.
