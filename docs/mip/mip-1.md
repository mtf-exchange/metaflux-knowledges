# MIP-1: Spot token standard + market deployment

MIP-1 defines the MetaFlux spot token standard and the deployment of spot markets.

:::info Implemented
MIP-1 ships as the `spotDeploy` action family. See the note on numbering below.
:::

MIP-1 is the native spot token standard of MetaFlux. It is also the mechanism that deploys a spot
market for a token through an on-chain gas auction. It is the spot counterpart to the
permissionless perp deployment of [MIP-3](./mip-3.md). On established on-chain venues, the spot
primitive is a separate proposal from the perp one, and MetaFlux uses the same split.

## Purpose {#why-this-exists}

Spot listing, like perp listing, is part of the protocol. It is not a curated team decision.
Anyone can register a token symbol and open a spot market. To do this, win the related gas
auction and supply the seed parameters. There is no allow-list and no review committee.

## Flow {#flow}

Spot deployment is the `spotDeploy` action. A `SpotDeployKind` sub-variant selects the step. The
sub-variants cover the full pair lifecycle:

1. **`RegisterToken`**: registers a new spot token and allocates an `AssetId`.
2. **`SetPair`**: registers a `(base, quote)` trading pair, for example `(BTC, USDC)`, and
   allocates the pair's `AssetId`.
3. **`SetFee`**: sets the fee tier of the pair.
4. **`ActivatePair`**: sets the pair active, open to trading.
5. **`DeactivatePair`**: sets the pair inactive, closed to new orders.

A deployment slot goes through the shared gas auction. A builder calls `submitGasAuctionBid`
against one of two streams:

- `register_token_gas_auction`, to claim a token symbol.
- `spot_pair_deploy_gas_auction`, to deploy a pair.

Each bid escrows a USDC amount and carries the market spec. A losing bid gets the amount back,
less a small fee. Governance configures the auction parameters (decay, refund window, slot
interval). The MIP-3 auctions share these parameters.

### Quote currency {#quote-currency}

Governance always sets the auction floor, and the floor is always quoted in USDC. The descending
clock runs in USDC cents, whatever currency settles.

Governance selects the settlement currency. Today it is USDC. It becomes MTF when the MTF spot
pair is deep enough to price against. Under MTF, the amount derives from the USDC ask at charge
time. The way you bid does not change. Only the debited balance changes.

:::warning
Every failure of the quote is a rejection, never a free listing. Under MTF settlement, the chain
refuses a deploy in three cases:

- There is no governed reference price.
- The reference price and the last print differ by more than the band.
- The amount rounds to zero base units.

The price comes from a band-clamped anchor and not from the current book. A trader who lifts the
pair for one block therefore cannot buy a cheap listing.
:::

The floor also has an absolute lower bound. No vote can set the floor below it, so the clock
never descends to free.

## Note on numbering {#note-on-numbering}

The `spotDeploy` actions had the label "MIP-3" in the past, because they shipped with
`perpDeploy`. The [MIP registry](./index.md) assigns spot deployment to MIP-1 and perp deployment
to MIP-3. This follows the spot and perp split on established venues.

The change is more than a label. The two lanes share no governance switch. When governance turns
off MIP-3, MIP-1 spot deployment keeps running. When governance turns off MIP-1, permissionless
perp deployment keeps running.
