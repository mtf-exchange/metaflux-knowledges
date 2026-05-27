# 001 — Slab-linked-list price levels for O(1) cancel

> 2026-05-27 · Module B (match engine) · S14 wave 1 · supersedes the `VecDeque<RestingOrder>` baseline from S1.

## The problem

S1's price-level layout — `BTreeMap<Price, PriceLevel { orders: VecDeque<RestingOrder>, alive_qty: u128 }>` — was the only S12 target miss in `PERF_S13.md`: cancel ran at **611 ns/op** against a 500 ns p50 budget. The cost was concentrated in `mark_dead_in_level`, which after the O(1) `IndexMap` lookup had to **linearly scan the VecDeque** for the matching `OrderId` to flip its `alive = false` flag. At 200 orders/level on a 1 M-order book that scan dominated.

The trade-off the S1 design took was deliberate: keeping cancel lookups in the global `IndexMap<OrderId, OrderLocation>` and using a lazy-cancel `alive` flag means cancel does *no* memory writes in the price level itself — only a flag flip — and match's `pop_front` opportunistically reaps dead heads. For sparse cancel ratios that's fine. For HFT-style 10:1+ cancel/insert ratios, the per-cancel scan is the dominant cost.

## The change

Replace `VecDeque<RestingOrder>` with a **slab-backed doubly-linked list** (`OrderList` in `crates/match-engine/src/book.rs`):

- `slots: Vec<Option<Node>>`, `head: u32`, `tail: u32`, `free: u32` (all `u32::MAX` for None).
- `Node = { value: RestingOrder, next: u32, prev: u32 }`.
- `push_back` allocates from the `free` chain if non-empty, otherwise grows `slots`; returns the slot index.
- `pop_front` and `remove_at(slot_idx)` unlink in O(1) and push the slot onto the `free` chain.
- `front`/`front_mut` deref `slots[head]`.

The slot index produced by `push_back` is stashed in `OrderLocation` alongside `{side, price}`. Cancel becomes:

```rust
let loc = self.orders.swap_remove(&id)?;           // O(1)
let lv = ladder.get_mut(&loc.price)?;              // O(log P)
let removed = lv.orders.remove_at(loc.slot_idx)?;  // O(1) — was O(level depth)
lv.alive_qty -= removed.qty as u128;
```

The `alive` flag on `RestingOrder` is kept but is now always `true` — physical removal supersedes the lazy-cancel semantics. Match-engine call sites that flip `head.alive = false` immediately followed by `pop_front()` are functionally no-ops on the flag itself; the pop is what does the work. Kept unchanged to minimise churn (8 call sites in `match_engine.rs` would otherwise need editing); a follow-up cleanup commit can drop the field.

## Measurements

Bench harness: `cargo bench -p match-engine --bench clob_bench`, Apple Silicon dev box, release profile (`opt-level=3, lto="thin", codegen-units=1`). Workload PRNG seeded for bit-exact reproducibility. Numbers are batch-averaged Criterion samples.

| Bench | S1 baseline | post-feature-accretion (S13) | After slab-linked-list (this note) | vs S13 | vs S12 target |
|-------|-------------|------------------------------|------------------------------------|--------|---------------|
| `insert_100k_orders` | 91 ns | 105 ns | **115 ns** | +9.5 % | 1000 ns ✅ |
| `match_100k_marketable` | 57 ns | 74 ns | **65 ns** | −12 % | 2000 ns ✅ |
| **`cancel_100k_of_1m`** | 595 ns | 611 ns | **338 ns** | **−45 %** | **500 ns ✅** |
| `e2e_sustained_70_20_10` | 173 ns | 200 ns | **172 ns** | −14 % | — — 5.83 M ops/sec |

The only S12 p50 miss in `PERF_S13.md` is now resolved. Insert regressed 9.5 % — within noise but real (slab `push_back` does `Vec<Option<Node>>` indirection vs. `VecDeque`'s direct contiguous push). Net trade is worth it given cancel dominates the realistic mix.

Match also dropped ~12 %: the old "skip-dead-at-head" trim loop is now a no-op (cancel physically removes), so the first `front()` always lands on a real order. Match-engine code was not touched.

## Comparison with prior art

The slab-linked-list pattern is textbook (Knuth TAOCP vol 1, `intrusive-collections` crate, every kernel's `list_head`). Applying it inside a price level isn't novel.

What might be note-worthy if framed for a paper:

1. **Cancel-dominant workloads change the constant-factor optimum.** S1's lazy-cancel design is correct for *match-dominant* workloads (a few hundred ns per match, sparse cancels). For HFT-style ratios where cancels dominate by an order of magnitude, the physical-removal slab approach wins by ~2× per cancel even though it costs ~10 % more per insert. We should fold this measurement into the eventual systems paper as a workload-sensitivity micro-result.
2. **The `alive` flag is now vestigial.** Carrying it costs 1 byte per resting order × ~1 M orders ≈ 1 MB plus a branch in the match loop. Future cleanup will drop it. The interesting bit: this exposes a "feature creep cost" — design choices made for one workload regime ($lazy$) leave dead weight when the regime shifts.
3. **`OrderLocation` now embeds the slot index.** It's 16 bytes (side+price+slot_idx + padding) up from 12. At 1 M live orders that's a 4 MB extra in the IndexMap — tractable but not free.

## Open questions / follow-ups

- **S15 target is 200 ns p50 cancel.** Current 338 ns is 1.7× over. Likely paths: cache-resident `PriceLevel` allocator (slab-of-slabs), drop the `alive` field, drop the `IndexMap` indirection for cancel by storing a `*mut PriceLevel` directly in `OrderLocation`. Need to measure where the 338 ns is actually spent — `BTreeMap::get_mut` cache miss vs. `swap_remove` from the index vs. the unlink itself. Hot-path profiling with `perf`/`samply` on Linux is the obvious next move.
- **Match could be sped up further** by dropping the redundant `alive = false` flips in `match_engine.rs` (8 sites) — would shave a few ns/op. Trivial follow-up.
- **Slab fragmentation under churn**: if cancel/insert ratios diverge persistently, `slots.len()` grows unbounded relative to live orders. For S15+ a slab-of-slabs with periodic compaction would put a ceiling on the memory footprint.
- **`OrderList` could be made `unsafe`-internal with `Box<Node>` + raw pointers** for a marginal speedup. Probably not worth the unsafe surface.

## What's worth saving for the eventual paper

This single change is too narrow to carry a paper. But the *measurement framework* — fixed-seed PRNG, batch-averaged Criterion samples, S6/S12/S15/S18 latency targets, deterministic single-core baseline — is a re-usable comparison harness for a workload-sensitivity micro-study. Save this note + `PERF_BASELINE.md` + `PERF_S13.md` + this note as the empirical backbone for "On the workload-sensitivity of on-chain CLOB data structures" (working title), candidate venue: HotChains workshop or systems track at FC.
