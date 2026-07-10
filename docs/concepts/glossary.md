# Glossary

:::tip
**Stable.** New terms added with each protocol expansion.
:::

Defined terms used throughout the docs. Cross-linked where the topic has its own page.

## A {#a}

**ADL — Auto-deleverage.** Loss-mutualisation mechanism that claws back unrealised PnL from profitable counter-parties when the insurance pool can't cover a T3 liquidation shortfall. See [ADL](./adl.md).

**Agent wallet.** A signing key approved by a master account to act on its behalf, **without** withdrawal authority. See [agent wallets](./agent-wallets.md).

**ALO — Add-Limit-Only.** Order TIF that rejects the order entirely if any portion would cross the book. Guaranteed maker. See [order types](./order-types.md#time-in-force).

**Asset ID.** A market's canonical integer identifier. Different across networks; look up via `meta` info.

**Action.** A state-mutating call to `POST /exchange`. Tagged variant union with about 30 types. See [exchange.md](../api/rest/exchange.md#action-catalog).

## B {#b}

**Backstop (T3).** Liquidation tier where the protocol seizes a sub-threshold account's position into the insurance pool. See [tiered liquidation](./tiered-liquidation.md#t3-backstop--netting-at-mark).

**Band, mark-price.** Per-block clamp on how far the mark price can move. Defends against oracle/mid manipulation. See [mark prices](./mark-prices.md#sanity-bands).

**Batch ID.** Auction batch identifier for FBA markets. See [FBA](./fba.md).

**bps — Basis point.** 0.01% (= `1e-4`). Fee rates are denominated in bps; `5 bps` = 0.05%.

**Builder credit.** Fee share paid to the address that originated an order (front-end, aggregator, automation service). See [fees](./fees.md#builder-credit).

## C {#c}

**CCTP — Cross-Chain Transfer Protocol.** Circle's Cross-Chain Transfer Protocol. MetaFlux does **not** use CCTP; instead USDC is bridged via [MetaBridge](../bridge/) (a validator-signed custody bridge).

**chainId.** EIP-712 domain field selecting the network. `31337` devnet, `114514` testnet, `8964` mainnet. See [networks](../networks.md).

**Cloid — Client Order ID.** 16-byte identifier set by the client; enables `cancel_by_cloid` and order idempotency. See [exchange.md `submit_order`](../api/rest/exchange.md#submit_order).

**Clearing price (FBA).** The single uniform price at which an FBA batch settles. See [FBA](./fba.md).

**Cross margin.** Margin mode where all positions share account-wide collateral. Capital-efficient; not isolated. See [margin modes](./margin-modes.md).

## D {#d}

**Delegation (staking).** A delegator's MTF stake assigned to a validator's pool. Earns rewards, exposed to slashing. See [staking](./staking.md).

**Domain separator.** EIP-712 32-byte constant per network; one of the inputs to the signed hash. See [signing](../integration/signing.md).

## E {#e}

**EIP-712.** Ethereum standard for typed structured signed data. MetaFlux signing uses the EIP-712 envelope (`0x1901 || domain || hash`). See [signing](../integration/signing.md).

**EMA — Exponential Moving Average.** Used in mid-price smoothing for mark computation. See [mark prices](./mark-prices.md).

## F {#f}

**FBA — Frequent Batch Auction.** Discrete-time matching alternative to continuous CLOB. See [FBA](./fba.md).

**FIFO — First-In-First-Out.** Order matching priority at the same price level on the continuous CLOB.

**FOK — Fill-or-Kill.** TIF that fills the entire order or cancels everything. See [order types](./order-types.md#time-in-force).

**Funding rate.** Per-asset discrete user-to-user payment (default 1h period, governance-configurable per asset) that pegs perp price to underlying oracle. See [funding rates](./funding-rates.md).

## G {#g}

**Grouping.** `Order` parameter that links legs into an OCO family (`NormalTpsl`) or position-attached braces (`PositionTpsl`). See [order types](./order-types.md#grouping).

**GTC — Good-Till-Cancelled.** Default TIF; order rests on the book indefinitely. See [order types](./order-types.md#time-in-force).

## H {#h}

**Health ratio.** `account_value / maint_margin`. Drives the [tiered liquidation](./tiered-liquidation.md) ladder.

**High-water mark.** Highest historical share price for a vault, used to gate performance-fee accrual. See [vaults](./vaults.md).

## I {#i}

**IOC — Immediate-Or-Cancel.** TIF; match what's available, cancel any unfilled remainder. See [order types](./order-types.md#time-in-force).

**Idempotency.** Property whereby retrying a request causes the same observable effect. See [idempotency](../integration/idempotency.md).

**Insurance pool.** Subset of MFlux Vault reserved for T3 backstop coverage. See [vaults](./vaults.md#insurance-pool).

**Isolated margin.** Margin mode where a per-asset bucket caps the loss on that asset. See [margin modes](./margin-modes.md).

## L {#l}

**L2 book.** The order book at a given depth (top-N levels per side). See [`l2_book` info](../api/rest/info/perpetuals.md#l2_book).

**Liquidation tier.** Stage in the [tiered ladder](./tiered-liquidation.md): T0 yellow card, T1 partial, T2 full, T3 backstop, T4 ADL.

**Lock-up (staking / vault).** Time required between unstake/withdraw signal and funds availability. See [staking](./staking.md), [vaults](./vaults.md).

## M {#m}

**Maintenance margin.** Minimum collateral required to keep a position open. Health = `account_value / maint_margin`. See [margin modes](./margin-modes.md).

**Maker / Taker.** Maker provides liquidity (resting order); taker removes it (crossing order). Different fee rates. See [fees](./fees.md).

**Mark price.** Protocol's authoritative price for margin/liquidation. Median composition of mid + oracle + EMA. See [mark prices](./mark-prices.md).

**Master account.** The account whose state is mutated by actions; can be signed by itself or by an approved agent. See [agent wallets](./agent-wallets.md).

**MFlux Vault.** Protocol-operated insurance + market-making pool. See [vaults](./vaults.md#mflux-vault).

**MIP — Market Improvement Proposal.** Numbered protocol improvement (analogous to the improvement-proposal schemes used by established on-chain perp protocols). See [MIP](../mip/).

**msgpack.** Binary serialisation format. The signed payload of an action is msgpack bytes. See [signing](../integration/signing.md).

**MTF.** The MetaFlux protocol token. Used for staking, governance, fee burns.

**Multi-sig.** M-of-N signature requirement for an account. See [multi-sig](./multi-sig.md).

## N {#n}

**Nonce.** Per-sender strictly-monotonic uint64 included in every action; replay protection. See [idempotency](../integration/idempotency.md).

## O {#o}

**Oid — Order ID.** Server-assigned uint64; returned in the `Order` response and on `userEvents`/`orderEvents`. See [exchange.md](../api/rest/exchange.md).

**Oracle.** External price feed composed from CEX prices via TWA. Input to mark price + funding. See [mark prices](./mark-prices.md#the-oracle-c1-anchor).

## P {#p}

**PnL.** Profit-and-loss. Unrealised (mark-to-market on open position) vs realised (closed at exit fill).

**Portfolio margin (PM).** Cross-asset scenario-based margin model; capital-efficient for hedged books. See [portfolio margin](./portfolio-margin.md).

**Premium index.** EMA of `mid - oracle`; input to funding. See [funding rates](./funding-rates.md).

## R {#r}

**Reduce-only.** Order flag that rejects the order at admission if it would grow position size. See [order types](./order-types.md#reduce-only).

**RFQ — Request for Quote.** Maker-quote workflow for size that doesn't want to advertise on the public book. See [RFQ](./rfq.md).

## S {#s}

**Sender.** The address whose state mutates on a `POST /exchange` request. May be signed by itself or by an approved agent.

**Share (vault).** Unit of vault participation; minted at deposit at the current `share_price`, burned at withdrawal at the current `share_price`. See [vaults](./vaults.md).

**Slashing.** Validator punishment for double-signing or downtime; reduces validator (and delegator) stake. See [staking](./staking.md#slashing).

**STP — Self-Trade Prevention.** Order parameter selecting what happens when your new order would match your own resting order. See [order types](./order-types.md#self-trade-prevention).

**Strict-Iso.** Margin mode like Isolated, with the additional property that the position is excluded from any portfolio-margin netting. See [margin modes](./margin-modes.md).

**Sub-account.** Derived account under a master; isolated positions and orders, shares deposit/withdraw with master only. See [sub-accounts](./sub-accounts.md).

## T {#t}

**Taker.** Liquidity remover; the side of a fill that crosses the book.

**Tick size.** Minimum price increment for a market. Orders must align.

**TIF — Time-In-Force.** Order parameter: GTC / IOC / ALO / FOK. See [order types](./order-types.md#time-in-force).

**TPSL — Take-Profit / Stop-Loss.** Trigger-order grouping for protective braces. See [order types](./order-types.md#triggers).

**TVL — Total Value Locked.** Sum of vault NAV across all depositors.

**TWAP — Time-Weighted Average Price.** Order primitive that slices a large order over time. See [order types](./order-types.md#twap).

## U {#u}

**Universe.** The active list of markets (perp + spot) on the protocol. Returned by `meta` info.

**Unrealised PnL.** Mark-to-market profit/loss on open positions. Not yet realised by closing.

**USDC.** The quote currency for MetaFlux markets; bridged in/out via [MetaBridge](../bridge/).

## V {#v}

**Validator.** Consensus participant; proposes blocks and votes. Earns commission on delegator rewards; subject to slashing.

**Vault.** Pool of USDC under a manager's signing authority, with mint/burn share semantics. See [vaults](./vaults.md).

## W {#w}

**Withdrawable.** Free balance that can leave the account (not held as margin against open positions, not in an isolated bucket, not vault-locked).

## Y {#y}

**Yellow card (T0).** First liquidation tier. ALO orders cancelled; positions untouched; client notified. See [tiered liquidation](./tiered-liquidation.md#why-a-yellow-card).
