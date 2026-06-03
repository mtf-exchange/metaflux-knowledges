# MIP-2 — Metaliquidity

{% hint style="info" %}
**In progress.** On-chain vault landing; market-making strategy runs off-chain.
{% endhint %}

Metaliquidity is MetaFlux's protocol/community **liquidity-provider vault** — the
native-liquidity backbone, analogous to the automated liquidity-provision
proposal on established on-chain venues. Liquidity providers deposit USDC into the
vault and share in the PnL of a market-making strategy that quotes on the order
books. It provides the resting liquidity that takers trade against, so markets are
not dependent solely on external market makers from day one.

## What's on-chain vs off-chain

A deliberate split keeps the consensus surface small:

- **On-chain — the vault only.** Pooled LP capital, share accounting, NAV
  (marked-to-market against the oracle), a withdrawal lock, and a whitelist of
  recognised provider addresses.
- **Off-chain — the strategy.** The market-making logic (quoting, inventory
  management) runs as an ordinary MTF-native client: a whitelisted strategy key
  signs orders **on behalf of the vault account** and submits them through the
  normal signed-order path. No strategy logic is baked into consensus.

## For liquidity providers

- **Deposit** USDC, permissionlessly, and receive vault shares priced at the
  current NAV (`cash + mark-to-market of the vault's open positions`).
- **Withdraw** by redeeming shares for their NAV share, subject to a **7-day**
  withdrawal lock from your most recent deposit.
- Your shares appreciate or depreciate with the strategy's realised and
  unrealised PnL — there is market risk; this is not a yield guarantee.

## Provider whitelist

The recognised Metaliquidity provider addresses are a **list**, seeded at genesis
and mutable by governance. Only a whitelisted address may operate a Metaliquidity
vault and be authorised to trade its pooled capital; deposits remain open to
anyone.

## Status & history

Metaliquidity supplies the native order-book liquidity that a protocol-owned
provider is meant to bootstrap. The HLP-equivalent protocol vault was originally
deferred post-launch (to V2) in favour of external market makers; it has been
pulled forward into this sprint because native resting liquidity is needed
earlier than that plan assumed. The on-chain vault is landing now; the off-chain
strategy and provider whitelist seed in alongside it.

## Governing reference

- ADR-017 — MFlux Vault deferred to V2 (the deferral that MIP-2 partially reverses).
- ADR-024 *(pending)* — will formalize the MIP-2 Metaliquidity vault design once
  the implementation lands.
