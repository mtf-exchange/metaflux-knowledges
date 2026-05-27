# Versioning & deprecation

{% hint style="info" %}
**Status.** **stable** policy. Specific version transitions are in the change log.
{% endhint %}

## TL;DR

- Protocol version is a semver-shaped triplet (`MAJOR.MINOR.PATCH`).
- Breaking wire changes go in `MAJOR`; non-breaking additions in `MINOR`; fixes in `PATCH`.
- Mainnet breaking changes require a 90-day deprecation window with both old and new wire shapes accepted.
- Testnet runs ahead of mainnet to surface migration issues before production.

## Version components

The protocol's `protocol_version` is exposed via `/info node_info`:

```json
{
  "type": "node_info",
  "data": { "protocol_version": "1.2.0", ... }
}
```

| Component | Meaning | Examples |
|-----------|---------|----------|
| MAJOR | Breaking wire change | Renamed `Order` fields; removed action variant; changed signing domain; changed RPC URL shape |
| MINOR | Additive non-breaking | New action variant; new info type; new WS channel; new error string |
| PATCH | Behaviour-only fix | Bug fixes that preserve wire shape; performance |

## What's "wire shape"

Wire shape is everything a client commits to in its serialisation / signing logic. Specifically:

| Wire-shape | Examples |
|-----------|----------|
| Yes | Action `type` strings, field names, field types, enum values, response shape, status codes, error strings, EIP-712 domain |
| Yes | Numerical scaling conventions (`_e8`, `_e6`) |
| Yes | WS channel names, payload shapes, frame format |
| No | Server-internal storage; consensus implementation; mark/oracle source weights (governance-controlled, not protocol-versioned); fee tier thresholds (governance) |

Governance-mutable parameters (fee tiers, mark composition weights, scenario shocks, liquidation thresholds) are **not** part of the wire-shape commitment. Their **shape** is committed; their values can move at any time.

## Mainnet promise

| Change class | Notification | Grace period |
|--------------|--------------|--------------|
| MAJOR (breaking) | 90 days before activation | Both old + new shape accepted for ≥ 90 days |
| MINOR (additive) | 0 days; announced in change log | n/a |
| PATCH (fix) | 0 days | n/a |

A MAJOR change is rolled out as:

```
day -90:  announcement; new shape available on testnet
day -60:  new shape available on mainnet alongside old
day -30:  old shape begins emitting deprecation warnings in responses
day  0:   new shape becomes the only accepted shape
```

The 90-day window matches institutional change-management cycles. Bot operators have plenty of time to migrate; clients can run dual-wire code during the overlap.

## Deprecation warnings

During the overlap window, responses to the old shape include a non-fatal warning:

```json
{
  "accepted": true,
  "mempool_depth": 3,
  "_deprecation": {
    "field":      "params.price",
    "deprecated_at_version": "2.0.0",
    "removal_at_version":    "3.0.0",
    "migration": "use price_e8 (string, fixed-point 10^8)"
  }
}
```

The `_deprecation` field is always optional in your parser — clients on the new shape never see it.

## Change log

The protocol change log is published at `https://metaflux.dev/changelog` (TBD URL pre-launch) and mirrored in this repo at `CHANGELOG.md`. Each entry has:

- Version triple
- Date of activation
- Class (MAJOR / MINOR / PATCH)
- Per-change description with migration notes for MAJOR / MINOR

Subscribe via:
- RSS at `https://metaflux.dev/changelog.rss`
- GitHub Releases on this repo
- WS push on a planned `_meta` channel (TBD)

## Testnet ahead of mainnet

Testnet typically runs 1–2 minor versions ahead of mainnet. Migration discoveries from testnet shake out before the mainnet rollout date. Bot operators with testnet integration get early warning of breaking changes.

```
mainnet  v2.0.0  ────────────────────────► v2.1.0  ────────────────► v2.2.0
testnet  v2.1.0  ────────────► v2.2.0  ────────► v3.0.0-rc
                              (mainnet ships v2.1.0)
                                          (mainnet ships v2.2.0)
                                                          (mainnet ships v3.0.0 after 90d)
```

## What governance can change without versioning

The protocol layer is wire-versioned. Governance can mutate:

- Per-market parameters (tick size, leverage cap, maintenance ratio, mark composition, funding cap)
- Fee tier thresholds and rates
- PM scenario shock magnitudes and correlation matrix
- Liquidation tier thresholds and cooldowns (within bounds — substantial changes require MAJOR)
- Rate-limit budgets
- Insurance pool replenishment ratios

These changes do NOT bump the protocol version. They DO emit events on the planned `_governance` WS channel and are queryable via `/info` for their current values.

Clients that compute against current parameter values (e.g. computing PM margin client-side) must read parameters live; never hard-code.

## Client SDK versioning

SDKs (`@metaflux/sdk`, `metaflux-client` for Rust, `metaflux-client` for Python) follow semver independently of the protocol:

- `0.x.y` — pre-mainnet; breaking changes allowed each minor bump
- `1.x.y` — post-mainnet; semver-strict on the API surface

An SDK's `1.x` API surface targets a specific protocol MAJOR. When the protocol bumps MAJOR, the SDK bumps MAJOR; SDK 1.x supports protocol 2.x, SDK 2.x supports protocol 3.x, with overlap support during the 90-day window.

## Pre-mainnet caveats

Until mainnet launch:
- Devnet may break wire shape with 24h notice.
- Testnet runs the latest protocol MINOR/MAJOR ahead of mainnet's planned release; breakage on testnet is expected.
- Status banners in each doc reflect what's stable vs preview vs planned.

## See also

- [Networks](./networks.md) — per-network endpoints + chainIds
- [Security](./security.md) — security model and disclosure policy
