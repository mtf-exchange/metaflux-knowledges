# Glossary

This page defines the terms that the docs use. Each term links to its own page where one exists.

:::tip
**Stable.** New terms are added with each protocol expansion.
:::

## A {#a}

**ADL (auto-deleverage).** A loss-mutualization mechanism. When the insurance pool cannot cover a T3 liquidation shortfall, it takes back unrealized PnL from profitable counter-parties. See [ADL](./adl.md).

**Agent wallet.** A signing key that a master account approves to act for it. It has no withdrawal authority. See [agent wallets](./agent-wallets.md).

**ALO (add-limit-only).** A TIF that rejects the whole order if any portion would cross the book. The order is always a maker. See [order types](./order-types.md#time-in-force).

**Asset ID.** The canonical integer identifier of a market. On the wire, the field is `signing_id`, on [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta). It has that name because it is the value that a signed action puts in `market` (perp) or `pair` (spot). There is no `asset_id` field. Ids are different on each network, so read them at start-up.

**Action.** A state-mutating call to `POST /exchange`. It is a tagged variant union with about 30 types. See [exchange.md](../api/rest/exchange.md#action-catalog).

## B {#b}

**Backstop (T3).** The liquidation tier in which the protocol moves the position of an account below the threshold into the insurance pool. See [tiered liquidation](./tiered-liquidation.md#t3-backstop--netting-at-mark).

**Band, mark-price.** A per-block clamp on how far the mark price can move. It protects against manipulation of the oracle or the mid. See [mark prices](./mark-prices.md#sanity-bands).

**Batch ID.** The identifier of an auction batch on an FBA market. See [FBA](./fba.md).

**bps (basis point).** 0.01% (= `1e-4`). Fee rates are in bps: `5 bps` = 0.05%.

**Broker credit.** An extra fee on top of the taker fee. It goes to the address that originated the order (a front end, an aggregator or an automation service). See [fees](./fees.md#broker-credit) and [broker codes](./broker-codes.md).

## C {#c}

**CCTP (Cross-Chain Transfer Protocol).** The cross-chain transfer protocol of Circle. MetaFlux does not use CCTP. USDC moves through [MetaBridge](../bridge/), a custody bridge that validators sign.

**chainId.** The EIP-712 domain field that selects the network: `31337` for a node you run yourself, `114514` for testnet, `8964` for mainnet. See [networks](../networks.md).

**Cloid (client order ID).** A 16-byte identifier that the client sets. It enables `cancel_by_cloid` and order idempotency. See [exchange.md `submit_order`](../api/rest/exchange/orders.md#submit_order).

**Clearing price (FBA).** The single uniform price at which an FBA batch settles. See [FBA](./fba.md).

**Cross margin.** A margin mode in which all positions share the collateral of the account. It is capital-efficient and not isolated. See [margin modes](./margin-modes.md).

## D {#d}

**Delegation (staking).** MTF stake that a delegator assigns to the pool of a validator. It earns rewards and is exposed to slashing. See [staking](./staking.md).

**Domain separator.** A 32-byte EIP-712 constant per network. It is one of the inputs to the signed hash. See [signing](../integration/signing.md).

## E {#e}

**EIP-712.** The Ethereum standard for typed structured signed data. MetaFlux signing uses the EIP-712 envelope (`0x1901 || domain || hash`). See [signing](../integration/signing.md).

**EMA (exponential moving average).** The smoothing of the mid price in the mark computation. See [mark prices](./mark-prices.md).

## F {#f}

**FBA (frequent batch auction).** A discrete-time alternative to matching on a continuous CLOB. See [FBA](./fba.md).

**FIFO (first in, first out).** The matching priority at one price level on the continuous CLOB.

**Funding rate.** A discrete payment between users, per asset, that keeps the perp price near the underlying oracle. The default period is 1h. Governance can configure it per asset. See [funding rates](./funding-rates.md).

## G {#g}

**Grouping.** An `Order` parameter that links legs into an OCO family (`NormalTpsl`) or into braces attached to a position (`PositionTpsl`). See [order types](./order-types.md#grouping).

**GTC (good till cancelled).** The default TIF. The order rests on the book until it fills or is cancelled. See [order types](./order-types.md#time-in-force).

## H {#h}

**Health ratio.** `account_value / cross_maintenance_margin_used`. It drives the [tiered liquidation](./tiered-liquidation.md) ladder. The default [`account_state`](../api/rest/info/account.md#account_state) body gives the computed `health` but not `cross_maintenance_margin_used`. To get that denominator, ask for `detail: "margin"`.

**High-water mark.** The highest historical share price of a vault. Performance fees accrue only above it. See [vaults](./vaults.md).

## I {#i}

**IOC (immediate or cancel).** A TIF that matches what is available and cancels any unfilled remainder. See [order types](./order-types.md#time-in-force).

**Idempotency.** The property that a retried request has the same observable effect. See [idempotency](../integration/idempotency.md).

**Insurance pool.** The part of the Metaliquidity vault that is reserved for T3 backstop coverage. See [vaults](./vaults.md#insurance-pool).

**Isolated margin.** A margin mode in which a per-asset bucket caps the loss on that asset. See [margin modes](./margin-modes.md).

## L {#l}

**L2 book.** The order book at a given depth (top N levels per side). See [`l2_book` info](../api/rest/info/perpetuals.md#l2_book).

**Liquidation tier.** A stage in the [tiered ladder](./tiered-liquidation.md): T0 yellow card, T1 partial, T2 full, T3 backstop, T4 ADL.

**Lock-up (staking / vault).** The time between an unstake or withdraw request and the moment the funds are available. See [staking](./staking.md) and [vaults](./vaults.md).

## M {#m}

**Maintenance margin.** The minimum collateral to keep a position open. Health = `account_value / cross_maintenance_margin_used`. The account-level field covers the cross bucket only. An isolated leg has its own `maint_margin` on its position row. Read `cross_maintenance_margin_used` from [`account_state`](../api/rest/info/account.md#account_state) with `detail: "margin"`. The default body omits it. See [margin modes](./margin-modes.md).

**Maker / Taker.** A maker provides liquidity with a resting order. A taker removes it with a crossing order. They have different fee rates. See [fees](./fees.md).

**Mark price.** The authoritative price of the protocol for margin and liquidation. It is a median of the mid, the oracle and the EMA. See [mark prices](./mark-prices.md).

**Master account.** The account whose state an action changes. The account itself or an approved agent can sign. See [agent wallets](./agent-wallets.md).

**Metaliquidity vault.** The insurance and market-making pool that the protocol operates (vault `kind: "Metaliquidity"`). See [vaults](./vaults.md#metaliquidity-vault).

**MIP (Market Improvement Proposal).** A numbered protocol improvement. It is similar to the improvement-proposal schemes of established on-chain perp protocols. See [MIP](../mip/).

**Action JSON.** An action goes on the wire as JSON. The signature covers the EIP-712 typed-data digest of the action, not the JSON bytes. The JSON bytes are hashed separately for the `action_hash` correlation key. See [signing](../integration/signing.md).

**MTF.** The MetaFlux protocol token. It is used for gas, staking, governance and the fee buyback.

**Multi-sig.** An M-of-N signature requirement for an account. See [multi-sig](./multi-sig.md).

## N {#n}

**Nonce.** A strictly monotonic uint64 per sender, included in every action for replay protection. See [idempotency](../integration/idempotency.md).

## O {#o}

**Oid (order ID).** A uint64 that the server assigns. The `Order` response returns it, and so do the [`order_updates`](../api/ws/subscriptions.md#order_updates), [`fills`](../api/ws/subscriptions.md#fills) and [`open_orders`](../api/ws/subscriptions.md#open_orders) WS channels. See [exchange.md](../api/rest/exchange.md).

**Oracle.** An external price feed built from CEX prices with a TWA. It is an input to the mark price and funding. See [mark prices](./mark-prices.md#the-oracle-c1-anchor).

## P {#p}

**PnL.** Profit and loss. Unrealized PnL is mark-to-market on an open position. Realized PnL is fixed at the exit fill.

**Portfolio margin (PM).** A cross-asset margin model based on scenarios. It is capital-efficient for hedged books. See [portfolio margin](./portfolio-margin.md).

**Premium index.** The EMA of `mid - oracle`. It is an input to funding. See [funding rates](./funding-rates.md).

## R {#r}

**Reduce-only.** An order flag. Admission rejects the order if it would increase the position size. See [order types](./order-types.md#reduce-only).

**RFQ (request for quote).** The trade path for options. A taker asks makers for a premium on one option series and accepts one quote. RFQ refuses every market that is not a live option series. See [RFQ](./rfq.md).

## S {#s}

**Sender.** The address whose state a `POST /exchange` request changes. The address itself or an approved agent can sign.

**Share (vault).** The unit of vault participation. It is minted at deposit and burned at withdrawal, at the current `share_price`. See [vaults](./vaults.md).

**Slashing.** A penalty on a validator for double-signing or downtime. It reduces validator and delegator stake. See [staking](./staking.md#slashing).

**STP (self-trade prevention).** An order parameter that selects what happens when your new order would match your own resting order. See [order types](./order-types.md#self-trade-prevention).

**Strict-Iso.** A margin mode like Isolated. In addition, the position is excluded from any portfolio-margin netting. See [margin modes](./margin-modes.md).

**Sub-account.** A derived account under a master. It has isolated positions and orders. It moves deposits and withdrawals only to and from its master. See [sub-accounts](./sub-accounts.md).

## T {#t}

**Taker.** The side of a fill that crosses the book and removes liquidity.

**Tick size.** The minimum price increment of a market. Order prices must align to it.

**TIF (time in force).** An order parameter: GTC, IOC or ALO. There is no FOK (fill-or-kill) or all-or-none value. See [order types](./order-types.md#time-in-force).

**TPSL (take-profit / stop-loss).** A trigger-order grouping for protective braces. See [order types](./order-types.md#triggers).

**TVL (total value locked).** The sum of vault NAV across all depositors.

**TWAP (time-weighted average price).** An order primitive that splits a large order over time. See [order types](./order-types.md#twap).

## U {#u}

**Universe.** The active list of markets (perp and spot) on the protocol. Read [`markets`](../api/rest/info/perpetuals.md#markets) for the dynamic figures, or [`markets_meta`](../api/rest/info/perpetuals.md#markets_meta) for the static grids and ids. There is no `meta` read. It answers `UNKNOWN_TYPE`.

**Unrealized PnL.** Mark-to-market profit or loss on open positions, before a close realizes it.

**USDC.** The quote currency for MetaFlux markets. It moves in and out through [MetaBridge](../bridge/).

## V {#v}

**Validator.** A consensus participant. It proposes blocks and votes. It earns commission on delegator rewards and is subject to slashing.

**Vault.** A pool of USDC under the signing authority of a manager, with shares that are minted and burned. See [vaults](./vaults.md).

## W {#w}

**Withdrawable.** The free balance that can leave the account. It excludes margin held against open positions, isolated buckets and vault lock-ups.

## Y {#y}

**Yellow card (T0).** The first liquidation tier. The engine cancels ALO orders and notifies the client. Positions do not change. See [tiered liquidation](./tiered-liquidation.md#why-a-yellow-card).
