# MIP-1 — Spot token standard + market deployment

{% hint style="info" %}
**Preview.** Shipped as the spot-deploy action family; see note on numbering below.
{% endhint %}

MIP-1 is MetaFlux's native spot token standard and the mechanism for deploying a
spot market for a token through an on-chain auction. It is the spot counterpart
to [MIP-3](./mip-3.md)'s permissionless **perp** deployment — the analogous
primitive on established on-chain venues is a separate proposal from the perp one,
and MetaFlux mirrors that split.

## Why this exists

Spot listing, like perp listing, is part of the protocol rather than a curated
team decision. Anyone can register a token symbol and stand up a spot market by
winning the relevant gas auction and supplying seed parameters — no allow-list,
no review committee.

## Flow

1. **`TokenRegisterGasAuctionBid`** — claim a token symbol into the registry.
2. **`SpotPairDeployGasAuctionBid`** — deploy a spot market (pair) on a
   registered token; the pair auction activates the market.

Each bid escrows a USDC amount (refunded on loss minus a small fee) and carries
the market spec. Auction parameters (decay, refund window, slot interval) are
governance-configurable, shared with the MIP-3 machinery.

## Note on numbering

In the current implementation the spot-deploy actions are bundled in the same
module as the perp-deploy actions and were historically labelled "MIP-3". Per the
[MIP registry](./README.md) spot deployment is properly **MIP-1** and perp
deployment is **MIP-3** (mirroring the spot-vs-perp split on established venues).
The behaviour is unchanged; only the label is being realigned.
