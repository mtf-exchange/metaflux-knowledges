---
description: "The reserved system addresses of the protocol: the null address, the system senders, the treasury, the buyback fund, the burn sink and the spot backstop. Every one is a keyless constant."
---

# System addresses

:::tip
**Stable.** These are fixed protocol constants. They do not change between releases.
:::

This page lists the reserved system addresses of MetaFlux and says what each one is.

## Summary {#tldr}

MetaFlux reserves a small set of well-known addresses with a special meaning. They are the null address, the senders the protocol writes as, the treasury, the buyback fund and a reserved burn sink. Integrators and explorers see these addresses on-chain.

Every address on this page is keyless. Each is a hand-picked constant, mostly a repeated-nibble pattern such as `0x7777…7777`. None is derived from a public key. A normal MetaFlux address is the last 20 bytes of the keccak-256 hash of a public key, as on every EVM chain. These constants were not made that way, so no private key maps to any of them. To find one, you would have to invert keccak-256 onto a chosen 20-byte target. That is cryptographically infeasible. So none of these addresses can sign a transaction. When value moves in or out of them, the protocol moves it under system authority. A user with a key never does.

## The addresses {#the-addresses}

| Address | Name | Purpose | Operated by |
|---|---|---|---|
| `0x0000000000000000000000000000000000000000` | Null | The zero address. It stands for an unset or absent value. | Nobody (sentinel) |
| `0x2222222222222222222222222222222222222222` | System | Generic protocol/system-authority sender for internal writes | Protocol |
| `0x3333333333333333333333333333333333333333` | Oracle feeder | The system sender that publishes oracle price updates | Protocol |
| `0x5555555555555555555555555555555555555555` | Faucet | Testnet faucet that funds test accounts | Protocol (test networks only) |
| `0x7777777777777777777777777777777777777777` | Treasury | Protocol treasury. It holds the treasury fee share and the buyback MTF. It is the mint and burn point for supply changes. | Protocol |
| `0x8888888888888888888888888888888888888888` | Assistance fund | Holds collected fee USDC destined for buyback and executes the on-market MTF buy | Protocol |
| `0x000000000000000000000000000000000000dead` | Burn | Reserved, provably-unspendable sink | Nobody. A spend from it is always rejected. |
| `0x0000000000000000000000000000000000005b07` | Spot backstop | Custody sink for collateral the protocol takes in on a liquidation: base bought off a starved book, and portfolio-margin collateral seized to cover a USDC deficit | Nobody (keyless reserved address) |

All hex is in canonical lowercase, `0x`-prefixed, 40 characters. This is the form an explorer displays.

## What each one is {#what-each-one-is}

### Null (`0x0000…0000`) {#null--0x00000000}

The all-zero address. It is a sentinel, not an account. In protocol data it means "unset", "absent" or "no address here". Nothing is meant to hold a balance at the null address, and no one operates it. It is keyless.

### System (`0x2222…2222`) {#system--0x22222222}

The generic system-authority sender. The protocol writes as this address when it makes an internal state write that no single user or more specific role owns. The address is keyless and only the protocol operates it. No user stands behind it.

### Oracle feeder (`0x3333…3333`) {#oracle-feeder--0x33333333}

The oracle price feeder. The oracle updates are the per-block reference prices described in [Oracle prices](./oracle-prices.md). The protocol publishes them from this system sender. The address is keyless and the protocol operates it as part of consensus. You cannot submit oracle prices by sending from this address.

### Faucet (`0x5555…5555`) {#faucet--0x55555555}

The test-network faucet. On testnet it funds test accounts, so integrators can use the API without real funds. The address is keyless and the protocol operates it. On mainnet the faucet does not dispense. Real assets have no free mint.

This address is also the reserve of the faucet. A claim transfers out of the balance held here and creates nothing. The address is keyless, so the reserve accepts a pre-fund, but no signer can spend it. An empty reserve refuses every claim. Read its `account_state` to see whether the faucet can pay. See [`POST /faucet`](../api/rest/faucet.md#reserve).

### Treasury (`0x7777…7777`) {#treasury--0x77777777}

The protocol treasury. It holds the treasury's share of collected fees and the MTF accumulated by the [buyback](./tokenomics.md#value-accrual--flywheel). On testnet, an operator vote mints MTF into or burns MTF from the treasury balance. Mainnet has no such vote, and its total supply is fixed ([Total supply](./tokenomics.md#total-supply)). The address is keyless and the protocol operates it under governance. See [Tokenomics](./tokenomics.md) for the economic model and [Fees](./fees.md) for where fees go.

### Assistance fund (`0x8888…8888`) {#assistance-fund--0xafafafaf}

The buyback operational fund. Fee revenue for the buyback collects here as a real USDC balance that an explorer shows. The protocol spends it on the open MTF/USDC market to run the buyback. No key can move its funds, but the protocol operates it. The buy is a protocol action, not a user transaction. The bought-back MTF then goes to the treasury and the buyback split described in [Tokenomics](./tokenomics.md#value-accrual--flywheel).

:::warning
This address accepts an ordinary transfer, and nothing comes back. The protocol guards it as a transfer *source*, not as a destination, so a spot transfer to it succeeds. No key can return the funds, and the only spend path of the protocol is buying MTF. USDC sent here is a permanent donation to the buyback. Check the destination before you sign.

USDC sent here does count toward the next buyback fire. No read reports that balance. See [deleted reads](../api/rest/info.md#retired-reads). The USDC cannot keep an already-started drain running below the governed trigger. Only the buyback schedule does that. See [Fees](./fees.md#buyback-drip).
:::

### Burn (`0x0000…dEaD`) {#burn--0x0000dead}

The canonical EVM burn sink. It is keyless. It is also the only address on this page that is provably unspendable. The protocol rejects every transfer whose source is the burn address, on any path. Nothing can ever move value out of it.

The address is reserved. No burn path routes through it. On testnet, an operator vote reduces supply by decreasing the treasury balance. It does not send tokens here.

### Spot backstop (`0x0000…5b07`) {#spot-backstop--0x00005b07}

This address is the custody sink for collateral that the protocol takes in when it settles a liquidation. Two paths park tokens here, both as ordinary token balances:

- The forced spot-margin liquidation waterfall. When the book is too thin to
  absorb a forced close, the insurance fund buys the base and parks it here.
- A portfolio-margin collateral seizure. When a PM account ends a liquidation
  in a USDC deficit and holds eligible non-USDC collateral, the protocol takes
  that collateral at its haircut-valued mark and settles that much of the USDC
  debt. The seized units land here.

A balance at this address is not the residue of one product. Read it as collateral that the protocol now holds and has not yet disposed of.

This address is not the treasury. The treasury also holds unissued MTF supply, and a testnet supply-cut vote burns from that row. Collateral that stands behind a settled debt must not sit there.

The address is keyless, and provably so. To land on this fixed image of eighteen zero bytes followed by `0x5b07`, a signer would need a `2^160` preimage search. So no signer can ever act as it.

:::warning
The portfolio-margin seizure path needs a governance vote that sets a collateral haircut. No such vote has been enacted on either running chain (measured 2026-09-03 over the full archive). So only the spot-margin waterfall credits this address.
:::

## Two categories {#two-categories}

Every address here is keyless, but they form two groups:

- Protocol-operated (system authority): System, Oracle feeder, Faucet, Treasury and Assistance fund. No key signs for them, but the protocol writes to or from them as part of its own operation. Examples are oracle publication, faucet credits on test networks, testnet treasury supply changes and buyback execution. The legacy Spot fee sink was in this group and is now inert.
- Never spendable: the Burn address. No key and no protocol path can ever move value out of it.

The Null address is in neither group. It is a sentinel value, not an account that anyone acts on.

## FAQ {#faq}

<details>
<summary>Show FAQ</summary>

**Q: Could someone find the private key to the treasury or the burn address?**
A: No. These addresses are fixed constants, not derived from any public key. To recover a key for one, you would have to invert keccak-256 onto a specific 20-byte target. That is infeasible. There is no key to find.

**Q: Can I send tokens to the burn address to destroy them?**
A: No. The burn address is reserved and no supply path uses it. Mainnet supply is fixed. On testnet, an operator vote reduces the treasury balance instead.

**Q: The faucet gave me funds on testnet. Will it on mainnet?**
A: No. The faucet only credits on test networks. On mainnet there is no faucet dispense.

**Q: I see a balance at the assistance fund on the explorer, and whose is it?**
A: Mostly fee revenue that the protocol collected for the buyback. The protocol spends it on the open market to buy MTF. No user controls it. The balance may also include USDC that a user sent by mistake. The protocol accepts that transfer and it is not reversible, so it joins the buyback budget.

</details>

## See also {#see-also}

- [Tokenomics](./tokenomics.md): the treasury, the buyback and the supply model.
- [Fees](./fees.md): how collected fees are routed.
- [Oracle prices](./oracle-prices.md): what the oracle feeder publishes.
- [Glossary](./glossary.md): protocol terms.
