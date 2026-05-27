# 002 — Tiered liquidation grace (T0 yellow card)

> 2026-05-27 · Module C (liquidation) · S14 wave 1 · extends `BoleEngine` decision matrix from 3 tiers to 4 (5 counting ADL).

## The change

The pre-existing BOLE engine implemented a 3-tier liquidation ladder for accounts with `health = account_value / maintenance_margin`:

| Tier | Band | Action |
|------|------|--------|
| T1 | `0.8 ≤ health < 1.0` | `PartialMarket50` (50 % close, cooldown-gated) |
| T2 | `0.667 ≤ health < 0.8` | `FullMarket` |
| T3 | `health < 0.667` | `Backstop` (multisig treasury takeover) |

This commit (`crates/liquidation/src/bole.rs`) adds **T0 — yellow card grace**:

| Tier | Band | Action |
|------|------|--------|
| **T0** | **`1.0 ≤ health < 1.1`** | **`YellowCard { account }` — no positions touched** |

The `BoleEngine` carries a configurable `yellow_card_threshold` (default `1.1`); `decide()` returns `YellowCard` when `1.0 ≤ health < threshold`. The caller (begin-block effect) turns the decision into:
- force-cancel of the account's resting ALO orders (frees collateral that's parked but inaccessible),
- a UX notification to the wallet client.

Positions are **not** touched at T0 — this is hysteresis, not a partial liquidation. The intent is to give users a block-step (~100 ms today, ~1 s in production) to add margin or de-leverage before the engine escalates to T1.

## Why hysteresis, not immediate T1

The motivation comes from observed cascades in production-grade on-chain CLOBs (HL Oct 10 2025 case study referenced in `crates/liquidation/src/adl.rs`):

- Once an account crosses `health = 1.0`, the engine immediately fires a partial market close, which depresses mark price, which propagates to neighbouring accounts via the same shared book, which trips them across `health = 1.0` too.
- The cascade depth is largely a function of how many accounts cluster around the maintenance boundary at the moment of the price shock.
- A grace tier at `1.0 ≤ health < 1.1` lets accounts that were *temporarily* knocked into the warning zone (by a multi-tick volatility spike) recover via passive position decay, mark-price reversion, or active margin top-up — without contributing to the cascade.

This is structurally analogous to a TradFi broker's "margin call" — phone the customer, wait some hours — except the wait window is one consensus block.

## Comparison with prior art

- **CME ladder margin calls** — multi-tier with a human-call grace period. Not directly comparable since timescales are different (CME: minutes-to-hours grace; MTF: one-block grace).
- **Hyperliquid's published liquidation logic** — 3-tier (Partial/Market/Backstop), no T0 yellow-card grace. Our T0 is novel relative to HL's published spec.
- **Aave / Compound liquidations** — single-tier, no grace; liquidators are external bots with profit motive. Different model entirely.
- **dYdX V4 partial deleveraging** — bears similarities to our `PartialMarket50` (T1) but does not have an explicit warning tier.

## Determinism

- Threshold is `Decimal::new(11, 1) = 1.1` — exact, no float. Compared via `Decimal::cmp` which is deterministic.
- `decide()` remains a pure function. `BoleEngine` is unchanged in field set except for an added field; serde tolerates old payloads via `#[serde(default = "default_yellow_card_threshold")]`.
- Cooldown semantics: `BoleKind::YellowCard` is recorded for telemetry but does NOT arm the partial cooldown — see test `test_bole_yellow_card_does_not_arm_partial_cooldown`.

## Open empirical questions

These are the unknowns that turn this into paper material if pursued:

1. **Cascade-depth reduction.** How much does the T0 grace actually shave off cascade size? Requires simulating a population of accounts with realistic margin distributions against a recorded price shock (HL Oct 10 trace is the obvious benchmark). Expected: ≥30 % reduction in T1 actions because the median over-margin transient eats the grace window.
2. **Liquidator opportunity cost.** A grace tier delays profitable liquidation work for external keepers (T1 partials) by ≥1 block. Quantify the bp-cost imposed on the keeper market vs. the bp-savings to liquidated accounts. Asymmetry here might matter for keeper economics.
3. **Cliff-effect at `health = 1.1`**. Does the threshold itself become a clustering target for over-leveraged strategies that aim for "just barely above T0"? Behavioural game-theory question; would need on-chain data from a live deployment.
4. **Threshold sensitivity.** 1.05 vs 1.1 vs 1.2 — what's optimal? Tradeoff between false-positives (warning healthy accounts after a brief dip) and false-negatives (missing accounts that needed warning). Probably workload-dependent.

## What's worth saving for the eventual paper

Combined with [001-slab-linked-list-price-levels.md](./001-slab-linked-list-price-levels.md) and the (planned) cascade-simulator infra, this design could anchor a section in a "Tiered liquidation policies on a deterministic L1: design and empirical impact" paper. Candidate venue: FC (Financial Cryptography) or DeFi workshop. Key empirical work needed: (1), (2) above using replayed HL traces.

## Open follow-ups (engineering, not research)

- ALO force-cancel side effect: needs an `Action::ForceCancelAccountAlos` wired from begin-block effect 3 into the match engine. **Not done in this commit** — the engine emits `YellowCard` but no caller yet consumes it.
- Notification path: the `YellowCard` decision needs a `BalanceEvent::MarginWarning` (or similar) emitted into the per-account event stream so wallets can surface it. **Not done in this commit.**

Both are short, well-scoped follow-up tasks tracked outside this note.
