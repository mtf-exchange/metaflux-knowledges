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

A Metaliquidity vault trades the markets its operator quotes. A
[deployer market](./mip-3.md) is a market that a builder deployed, with an asset id of 1000 or
more. The rules below separate a deployer market from the core markets.

- **Orders.** A vault order on a deployer market follows the same rules as any account: the open
  must be isolated, and a stale deployer feed makes the market reduce-only. A vault has no key of
  its own, so its operator sets the margin mode with
  [`update_leverage`](../api/rest/exchange/margin-risk.md#update_leverage) and the `owner` field.

  :::caution Not live yet
  The running chain still refuses a vault order that opens, extends or flips a position on a
  deployer market, with `PRECONDITION_FAILED` and the message
  `metaliquidity vault cannot open or extend a position on a MIP-3 market`. The refusal is
  removed in the next node release. See [Next release](../changelog/next-release.md#vault-mip3).
  :::

- **Backstop.** A vault never absorbs the liquidation of a deployer market. This is active. See
  [Liquidation on a deployed market](./mip-3.md#liquidation).
- **One vault, one risk.** The protocol runs a separate Metaliquidity vault for deployer markets.
  The core vault lists no deployer market, so a core depositor carries no deployer-oracle risk.
  A depositor in the deployer-market vault carries that risk. The reason below says what the
  risk is.

**Reason.** A deployer market gets its price from its own deployer, and its
deployer sets its open-interest cap. The protocol controls neither. A deployer can move its
oracle by up to 10% per update. The vault that quotes such a market holds only deposits made for
that purpose.

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
