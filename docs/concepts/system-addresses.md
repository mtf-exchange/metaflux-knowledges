---
description: The protocol's reserved system addresses — the null address, the protocol-operated system senders, the treasury, the buyback fund, the reserved burn sink, and the legacy spot-fee address — every one a keyless constant.
---

# System addresses

:::tip
**Stable.** These are fixed protocol constants. They do not change between releases.
:::

## TL;DR

MetaFlux reserves a small set of **well-known addresses** with special protocol meaning — the null address, the senders the protocol itself writes as, the treasury, the buyback fund, and a reserved burn sink. Integrators and explorers will see these on-chain; this page says what each one is.

**Every address on this page is keyless.** Each is a hand-picked constant (mostly a repeated-nibble "vanity" pattern like `0x7777…7777`), **not** derived from any public key. A normal MetaFlux address is the last 20 bytes of the keccak-256 hash of an account's public key — exactly the derivation every EVM chain uses. Because these constants were never produced that way, **no private key maps to any of them**: finding one would mean inverting keccak-256 onto a chosen 20-byte target, which is cryptographically infeasible. So none of these addresses can sign a transaction. Where value moves in or out of them, it is the **protocol itself** doing it under system authority — never a user with a key.

## The addresses

| Address | Name | Purpose | Operated by |
|---|---|---|---|
| `0x0000000000000000000000000000000000000000` | Null | The zero / null address — an unset or absent value | Nobody (sentinel) |
| `0x2222222222222222222222222222222222222222` | System | Generic protocol/system-authority sender for internal writes | Protocol |
| `0x3333333333333333333333333333333333333333` | Oracle feeder | The system sender that publishes oracle price updates | Protocol |
| `0x5555555555555555555555555555555555555555` | Faucet | Testnet / devnet faucet that funds test accounts | Protocol (test networks only) |
| `0x7777777777777777777777777777777777777777` | Treasury | Protocol treasury — holds the treasury fee share and buyback MTF; the mint / burn point for supply changes | Protocol |
| `0xafafafafafafafafafafafafafafafafafafafaf` | Assistance fund | Holds collected fee USDC destined for buyback and executes the on-market MTF buy | Protocol |
| `0x000000000000000000000000000000000000dead` | Burn | Reserved, provably-unspendable sink | Nobody — spends **from** it are always rejected |
| `0x5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f` | Spot fee sink | Legacy spot-fee holding address, now inert | Protocol (historical) |

All hex is shown in canonical lowercase, `0x`-prefixed, 40 characters — the exact form an explorer displays.

## What each one is

### Null — `0x0000…0000`

The all-zero address. It is a **sentinel**, not an account: it stands for "unset", "absent", or "no address here" in protocol data. Nothing is meant to hold a balance at the null address, and no one operates it. Keyless.

### System — `0x2222…2222`

The generic **protocol/system-authority sender**. When the protocol needs to make an internal state write that is not attributable to any single user or more specific role, it writes as this address. It is keyless and operated only by the protocol — there is no user behind it.

### Oracle feeder — `0x3333…3333`

The **oracle price feeder**. The protocol's oracle updates — the per-block reference prices described on the [Oracle prices](./oracle-prices.md) page — are published from this system sender. Keyless; operated by the protocol as part of consensus. You cannot submit oracle prices by "sending from" this address.

### Faucet — `0x5555…5555`

The **test-network faucet**. On testnet and devnet, the faucet credits test accounts with play balances so integrators can exercise the API without real funds. It is keyless and protocol-operated. **On mainnet the faucet does not dispense** — there is no free mint of real assets.

### Treasury — `0x7777…7777`

The **protocol treasury**. It holds the treasury's share of collected fees and the MTF accumulated by the [buyback](./tokenomics.md#value-accrual--flywheel). It is also the single point through which **supply changes flow**: when governance changes total supply, MTF is minted into or burned from the treasury balance. Keyless; operated by the protocol under governance. See [Tokenomics](./tokenomics.md) for the economic model and [Fees](./fees.md) for where fees go.

### Assistance fund — `0xafaf…afaf`

The **buyback operational fund**. Fee revenue destined for buyback is collected here as a real, explorer-visible USDC balance, and the protocol spends it on the open MTF/USDC market to execute the buyback. It is keyless — there is no key that can move its funds — but it is **protocol-operated**: the buy is a protocol action, not a user transaction. The bought-back MTF then flows to the treasury and the buyback split described in [Tokenomics](./tokenomics.md#value-accrual--flywheel).

### Burn — `0x0000…dEaD`

The canonical EVM **burn sink**. It is keyless and, uniquely on this page, **provably unspendable**: the protocol rejects every attempted transfer whose source is the burn address, under any path. Nothing can ever move value out of it.

It is **reserved, not yet active.** Today, supply is reduced by **decreasing the treasury balance** through a governance vote — not by sending tokens to this address. The burn address is defined and set aside for a possible future explicit "send-to-burn" mechanism; until then you will not see the active burn path route through it.

### Spot fee sink — `0x5f5f…5f5f`

A **legacy** address that once held collected spot-trading fees as per-token balances. It is now **inert**: spot fees route to the fee-distribution pools instead (see [Fees](./fees.md)). It remains a reserved constant so its historical role is unambiguous, but nothing new accrues to it. Keyless.

## Two categories

Every address here is keyless, but they split into two kinds:

- **Protocol-operated (system authority).** System, Oracle feeder, Faucet, Treasury, and Assistance fund. No key signs for them, but the **protocol** writes to or from them as part of its own operation (oracle publication, faucet credits on test networks, treasury supply changes, buyback execution). The legacy Spot fee sink was in this group and is now inert.
- **Never-spendable.** The Burn address. No key and no protocol path can ever move value out of it.

The Null address is neither — it is a sentinel value, not an account anyone acts on.

## FAQ

<details>
<summary>Show FAQ</summary>

**Q: Could someone find the private key to the treasury or the burn address?**
A: No. These are not derived from any public key; they are fixed constants. Recovering a key for one would require inverting keccak-256 onto a specific 20-byte target, which is infeasible. There is no key to find.

**Q: Can I send tokens to the burn address to destroy them?**
A: The burn address is reserved but not wired into the active supply path today — supply reductions happen by governance reducing the treasury balance, not by sending here. Treat the burn address as reserved.

**Q: The faucet gave me funds on devnet. Will it on mainnet?**
A: No. The faucet only credits on test networks. On mainnet there is no faucet dispense.

**Q: I see a balance at the assistance fund on the explorer — whose is it?**
A: It is fee revenue the protocol has collected for buyback and will spend on the open market to buy MTF. No user controls it; the protocol operates it.

</details>

## See also

- [Tokenomics](./tokenomics.md) — treasury, buyback, and supply model
- [Fees](./fees.md) — how collected fees are routed
- [Oracle prices](./oracle-prices.md) — what the oracle feeder publishes
- [Glossary](./glossary.md) — protocol terms
