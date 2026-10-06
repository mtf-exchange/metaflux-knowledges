# MIP-2: Metaliquidity

MIP-2 defines Metaliquidity, the protocol liquidity-provider vault.

:::info In progress
The on-chain vault is landing. The market-making strategy runs off-chain.
:::

Metaliquidity is the protocol and community *liquidity-provider vault* of MetaFlux. It supplies
native liquidity. It is the analogue of the automated liquidity-provision proposal on
established on-chain venues. Liquidity providers deposit USDC into the vault. They share in the
PnL of a market-making strategy that quotes on the order books. The vault provides resting
liquidity for takers, so markets do not depend only on external market makers from day one.

## On-chain and off-chain parts {#whats-on-chain-vs-off-chain}

The design splits the parts on purpose, to keep the consensus surface small:

- **On-chain: the vault only.** Pooled LP capital, share accounting, NAV marked to market against
  the oracle, a withdrawal lock, and a whitelist of recognised provider addresses.
- **Off-chain: the strategy.** The market-making logic (quoting, inventory management) runs as a
  normal MTF-native client. A whitelisted strategy key signs orders for the vault account. It
  submits them through the normal signed-order path. Consensus contains no strategy logic.

## Scope {#scope}

The vault trades core markets only. It never takes the risk of a
[deployer market](./mip-3.md). A deployer market is a market that a builder deployed, with an
asset id of 1000 or more.

- **Orders.** The chain refuses a vault order that opens, extends or flips a position on a
  deployer market. The error is `PRECONDITION_FAILED`, with the message
  `metaliquidity vault cannot open or extend a position on a MIP-3 market`. An order that only
  closes a position passes.
- **Backstop.** The vault never absorbs the liquidation of a deployer market. This is live. See
  [Liquidation on a deployed market](./mip-3.md#liquidation).
- **Strategy.** The reference market maker refuses to start when its list names a deployer
  market.

**Reason.** A deployer market gets its price from its own deployer, and its deployer sets its
open-interest cap. The protocol controls neither. Liquidity providers did not deposit to carry
that risk.

## Liquidity providers {#for-liquidity-providers}

- **Deposit** USDC without permission. You receive vault shares priced at the current NAV
  (`cash + mark-to-market of the vault's open positions`).
- **Withdraw** by redeeming shares for their part of the NAV. A 7-day withdrawal lock applies
  from your most recent deposit.
- Your shares gain or lose value with the strategy's realised and unrealised PnL. There is
  market risk. The vault does not guarantee a yield.

## Provider whitelist {#provider-whitelist}

The recognised Metaliquidity provider addresses are a list. Genesis seeds the list, and
governance can change it. Only a whitelisted address can operate a Metaliquidity vault and trade
its pooled capital. Deposits stay open to anyone.

## Status and history {#status--history}

Metaliquidity supplies the native order-book liquidity that a protocol-owned provider is meant
to bootstrap. On established on-chain venues, the equivalent protocol-owned vault was first
deferred until after launch (to V2), in favour of external market makers. MetaFlux moved it
earlier, because native resting liquidity is needed sooner than that plan assumed. The on-chain
vault is landing now. The off-chain strategy and the provider whitelist seed arrive with it.
