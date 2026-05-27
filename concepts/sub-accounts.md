# Sub-accounts

> Status: **preview**. The user-visible API is stable; the address-derivation scheme is finalised before mainnet.

A **sub-account** is a derived address under a master account that holds its own positions, margin, and orders, but transfers funds in and out only through the master. Use them to isolate strategies, separate trading desks, or run an A/B portfolio without re-onboarding.

## Mental model

```
master (0xAAA…)
   │
   ├── sub_0 (index 0, addr derived from master + 0)
   │     └─ own positions / orders / margin
   ├── sub_1 (index 1)
   │     └─ own positions / orders / margin
   └── sub_2 (index 2)
         └─ own positions / orders / margin
```

Each sub-account is a first-class account inside the state machine — it has its own balance, its own positions, its own liquidation threshold. From the chain's perspective there's nothing special about it being a sub; the relationship to the master is recorded in a side map.

Transfers between master and sub:

```
master  ──CreateSubAccount{ name }──►  spawn sub_n
master  ──SubAccountTransfer{ n, deposit=true,  amount }──►  master USDC → sub_n
master  ──SubAccountTransfer{ n, deposit=false, amount }──►  sub_n USDC → master
```

External withdrawals (off-chain or to a third address) must come from the **master** — sub-accounts can receive deposits and route them back to the master, but cannot withdraw directly.

## Address derivation

Each sub-account index `n` maps deterministically to an address derived from the master's 20-byte address. Anyone can compute a sub's address without on-chain state once the derivation is finalised. Until V1 launch, treat sub-account addresses as opaque values returned by `CreateSubAccount`.

## Creating

```json
{
  "type": "CreateSubAccount",
  "params": {
    "name":           "scalping-desk",
    "explicit_index": null
  }
}
```

- `name` is a label (≤ 64 chars; non-empty). Shows up in `subAccounts` info queries.
- `explicit_index` lets you ask for a specific slot. If `null`, the chain picks the next free slot.

Response includes the derived address and the assigned index.

## Funding

```json
{
  "type": "SubAccountTransfer",
  "params": {
    "sub_index": 0,
    "deposit":   true,
    "amount":    "1000000"
  }
}
```

`amount` is in the quote-asset (USDC) base units. `deposit: true` moves master → sub; `deposit: false` moves sub → master.

The same `SubAccountSpotTransfer` action exists for spot balances; same parameter shape, different ledger.

## Trading from a sub

Sign and submit just like a normal account, but use the sub's address as `sender`. The sub's [agent wallets](./agent-wallets.md) are configured separately from the master's. Common pattern: master signs `ApproveAgent` for each sub from the sub's address (this is allowed because the master holds delegation authority over its subs — enforcement at the dispatch layer recognises master-of-sub authority).

In practice your client SDK exposes a sub-account as just another `Client` instance with its own private key (the agent's hot key), pointing at the sub's address.

## Liquidation isolation

A sub's [tiered liquidation](./tiered-liquidation.md) is computed against its **own** account value and maintenance margin. A blowup in `sub_0` does not put `sub_1` or the master at risk — that's the entire point.

You can also enable [strict isolation](./portfolio-margin.md#strict-isolation) per-sub so a single sub's positions don't contribute to cross-asset portfolio margin even when the master is enrolled.

## Querying

```json
POST /info
{ "type": "subAccounts", "user": "0x<master>" }
```

Returns the list of subs with their indices, derived addresses, and labels. Each sub can also be queried as a first-class account via `clearinghouseState`, `openOrders`, `userFills`, etc., just by passing its address as `user`.

## Limits

- Hard cap on subs per master: 32 (subject to expansion in V2).
- Sub indices are monotonic — once allocated, they don't get reused, even after a sub is emptied. Use `explicit_index` carefully.

## See also

- [Agent wallets](./agent-wallets.md) — per-sub hot keys
- [Portfolio margin](./portfolio-margin.md) — interaction with cross-asset PM
- [`POST /info` `subAccounts`](../api/rest/hl-compat.md#info-types) — query API
