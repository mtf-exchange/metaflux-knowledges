# MIP-1 — Spot token standard + market deployment

:::info
**Implemented.** Ships as the `spotDeploy` action family; see the note on numbering below.
:::

MIP-1 is MetaFlux's native spot token standard and the mechanism for deploying a
spot market for a token through an on-chain gas auction. It is the spot
counterpart to [MIP-3](./mip-3.md)'s permissionless **perp** deployment — the
analogous primitive on established on-chain venues is a separate proposal from
the perp one, and MetaFlux mirrors that split.

## Why this exists {#why-this-exists}

Spot listing, like perp listing, is part of the protocol rather than a curated
team decision. Anyone can register a token symbol and stand up a spot market by
winning the relevant gas auction and supplying seed parameters — no allow-list,
no review committee.

## Flow {#flow}

Spot deployment is the `spotDeploy` action, dispatched by a `SpotDeployKind`
sub-variant covering the full pair lifecycle:

1. **`RegisterToken`** — register a fresh spot token; allocates an `AssetId`.
2. **`SetPair`** — register a `(base, quote)` trading pair (e.g. `(BTC, USDC)`);
   allocates the pair's `AssetId`.
3. **`SetFee`** — set the per-pair fee tier.
4. **`ActivatePair`** — flip the pair active (open to trading).
5. **`DeactivatePair`** — flip the pair inactive (close to new orders).

Winning a deployment slot goes through the shared gas auction: a builder calls
**`submitGasAuctionBid`** against the `register_token_gas_auction` stream (to
claim a token symbol) or the `spot_pair_deploy_gas_auction` stream (to deploy a
pair). Each bid escrows a USDC amount (refunded on loss minus a small fee) and
carries the market spec. Auction parameters (decay, refund window, slot interval)
are governance-configurable and shared with the MIP-3 machinery.

### What you pay in {#quote-currency}

The auction **floor is always governed and quoted in USDC**, and the descending
clock runs in USDC cents whichever currency settles.

Governance selects the **settlement currency**: USDC today, MTF once the MTF spot
pair is deep enough to price against. Under MTF the amount is derived from the
USDC ask at charge time. Nothing about how you bid changes — only which balance
is debited.

:::warning
**Every way the quote can fail is a REJECTION, never a free listing.** Under MTF
settlement a deploy is refused when there is no governed reference price, when the
reference and the last print disagree beyond the band, or when the amount would
round to zero base units. The price comes from a band-clamped anchor, not from
the live book, so lifting the pair for a block does not buy a cheap listing.
:::

The floor also has an **absolute lower bound** below which no vote can set it, so
the clock can never descend to free.

## Note on numbering {#note-on-numbering}

The `spotDeploy` actions were historically labelled "MIP-3" because they shipped
alongside `perpDeploy`. Per the [MIP registry](./index.md) spot deployment is
properly **MIP-1** and perp deployment is **MIP-3**, mirroring the spot-versus-perp
split on established venues.

**That realignment is more than a label.** The two lanes share no governance
switch. Turning off MIP-3 leaves MIP-1 spot deployment running, and turning off
MIP-1 leaves permissionless perp deployment running.
