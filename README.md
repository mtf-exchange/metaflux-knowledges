# MetaFlux Knowledge Base

> Research notes, design rationale, and paper material for the MetaFlux L1 derivatives chain. Synced to GitBook.

This repo is the public-facing companion to the [`mtf-exchange/metaflux`](https://github.com/mtf-exchange/metaflux) source tree. Source code, RFCs, and tightly-coupled module docs live there. This repo holds:

- **Research notes** — captured during implementation, mined for paper material at end-of-project. See [`research/`](./research/).
- **Architecture deep-dives** — long-form essays that span modules. See [`architecture/`](./architecture/).
- **Sprint reports** — quarterly retrospectives + measurements.
- **Paper drafts** — eventual arxiv preprints.

## Why a separate repo

- **Release cadence decoupling**: source repo ships behind code review on each commit; knowledge base is allowed to be more leisurely + speculative.
- **External readability**: ordered with a reader (not contributor) in mind. Markdown that renders on GitBook.
- **No build-system overhead**: pure markdown + figures, no Rust/Docker mixed in.
- **Per CLAUDE.md §仓库结构**: client SDKs, docs, tooling each live in their own repo so the server repo's release cadence isn't dictated by their churn.

## Sync model

Research notes are authored in the source repo under [`docs/research/`](https://github.com/mtf-exchange/metaflux/tree/main/docs/research) first (so the implementation commit and the note ship together). They are then copied here. A future CI job can automate the sync; for now the mirror is manual.

## GitBook

Connected via GitBook's GitHub integration — pushes to `main` rebuild the published space. The TOC follows the structure below.

## Layout

```
research/        — numbered notes (NNN-topic.md), append-order. README.md is the index.
architecture/    — module-spanning deep-dives.
sprint-reports/  — quarterly + ad-hoc.
papers/          — drafts.
```
