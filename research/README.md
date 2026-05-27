# `docs/research/` — running research log

Working notes captured *during* implementation, not retrofitted at the end. Each note answers:

1. What did we change and why?
2. What did we measure?
3. How does this relate to prior art?
4. Open questions / follow-ups.

The goal is to keep a paper trail thick enough that at end-of-project we can mine this directory for an arxiv preprint or workshop submission instead of trying to reconstruct contributions from `git log`.

## Naming

`{NNN}-{kebab-case-topic}.md`. NNN is just an append-order counter so the directory listing reads chronologically. Topic is the one-line takeaway of the note.

## What belongs here

- **Yes** — design choices with non-obvious trade-offs; measurements that disambiguate two options; novel encoding / data-structure tweaks; comparisons against published prior art.
- **No** — straight engineering changelogs (those live in commit messages); routine refactors; bug fixes.

## Index

- [001 — Slab-linked-list price levels for O(1) cancel](./001-slab-linked-list-price-levels.md)
- [002 — Tiered liquidation grace (T0 yellow card)](./002-tiered-liquidation-grace.md)
