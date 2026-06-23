---
name: MetaFlux Docs
description: The documentation theme for MetaFlux — "The Honest Instrument" applied to a docs site. Near-black field, one quiet aurora, Liquid Glass panels, serif-display + mono pairing. Implemented in src/css/custom.css over Docusaurus 3 / Infima.
register: product
colors:
  # Brand accents (two-voice; identity carried by presence, never captioned)
  aurora-blue: "#5BCEFA"
  quartz-rose: "#F5A9B8"
  lavender: "#8B7CF6"        # aurora-only third bloom
  # Dark mode (default) — the marketing-site field
  dark-surface-base: "#06070b"
  dark-surface-raised: "#0c0e14"
  dark-surface-raised-2: "#12151d"
  dark-border: "#1c2130"
  dark-border-strong: "#2a3042"
  dark-ink: "#f0f3f7"
  dark-ink-mid: "#98a3b5"
  dark-ink-dim: "#757f92"     # raised from #5a6273 for AA
  dark-primary: "#5BCEFA"
  # Light mode (first-class, fully designed)
  light-bg: "#ffffff"
  light-surface: "#f7f8fb"
  light-surface-2: "#eef1f7"
  light-border: "#e6e9f0"
  light-ink: "#0d1117"
  light-ink-mid: "#4a5566"
  light-ink-dim: "#6b7585"    # AA on white
  light-primary: "#15749f"    # AA-safe brand blue for links/anchors
  # Signal
  signal-positive: "#6ee7a3"
  signal-negative: "#ff7a8c"
typography:
  display:
    role: "Headings h1–h3 (the serif 'carries the claim')"
    fontFamily: "Cormorant Garamond, Iowan Old Style, Cambria, Georgia, serif"
    fontWeight: 600
    h1: "clamp(2.05rem, 6.2vw, 3.7rem)"   # scales to ~33px on a 360px phone
    h2: "2.15rem (var --mtf-text-h2)"
    h3: "1.6rem (var --mtf-text-h3)"
    letterSpacing: "-0.02em to -0.025em"
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem / 16px"
    lineHeight: 1.6
    fontFeature: "'ss01', 'cv11'; tabular lining numerals"
  label:
    role: "The 'instrument readout' voice — sidebar category headers, breadcrumbs, table headers, admonition labels, h4"
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    transform: "UPPERCASE"
    letterSpacing: "0.08em (var --mtf-label-tracking)"
  code:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    lineHeight: 1.7
    ligatures: "none (API operators render literally)"
  wordmark-accent:
    role: "PT Serif italic — ONLY the 'Flux' in the MetaFlux wordmark"
    fontFamily: "PT Serif"
    fontStyle: italic
rounded:
  sm: "8px (--mtf-r-sm)"
  md: "16px (--mtf-r-md)"
  lg: "20px (--mtf-r-lg)"
  xl: "24px (--mtf-r-xl)"
motion:
  ease: "cubic-bezier(0.22, 1, 0.36, 1) — ease-out-quint (--mtf-ease)"
  duration: "180ms (--mtf-dur); UI transitions ≤250ms"
---

# Design System: MetaFlux Docs

This documents the **implemented** theme in `src/css/custom.css`. It is the canonical
[`../metaflux-site/DESIGN.md`](../metaflux-site/DESIGN.md) ("The Honest Instrument")
adapted to a developer documentation site (product register): readability and
scannability lead, the brand is carried in quiet, precise accents.

## 1. North Star

A precision instrument: a near-black machined field, faces of Liquid Glass, one quiet
aurora of light behind it all. The serif (Cormorant Garamond) carries the claim; the
mono (Geist Mono) carries the proof. Nothing shouts — confidence is restraint plus
specificity. Dark-first, with a fully-designed, AA-equal light mode.

## 2. Color

A near-black instrument body (`#06070b`), two restrained luminous accents (Aurora Blue +
Quartz Rose), one aurora of light. Color is a signal, never wallpaper. All tokens live in
`:root` (light) and `[data-theme='dark']`, mapped onto Infima `--ifm-*` variables.

**Named rules**
- **The Quiet Signal Rule.** The aurora's blue/rose/lavender/white palette is identity,
  never captioned, never explained in copy.
- **The Two-Voice Rule.** Blue and rose alternate as call-and-response (homepage cards:
  odd→blue glow, even→rose). Never wash one surface in both; never add a third accent role.
- **Color is never the sole signal.** Admonitions pair color with icon + label.
- **AA everywhere.** Body ≥4.5:1, large ≥3:1, both themes — verified (incl. small mono
  labels on their own surfaces: table headers and admonition labels carry per-theme,
  per-surface colors so they clear AA against tinted backgrounds, not just the page bg).

## 3. Typography

A genuine contrast-axis pairing: low-weight humanist display **serif** (Cormorant
Garamond) against a precise **monospace** (Geist Mono), bridged by a neutral grotesque
(**Geist**) for prose.

- **Serif-Says, Mono-Proves.** Headings/prose claims in the serif; facts, specs, labels,
  values, and all micro-labels in the mono. h4 is the sans "instrument readout" exception.
- **Committed scale** via `--mtf-text-*` tokens (no muddy 14/15/16 cluster). Measure
  capped at ~70ch (`.theme-doc-markdown { max-width: 46rem }`).
- **Light-on-dark compensation:** +0.008em tracking on dark-mode body.
- The "*Flux*" wordmark is PT Serif italic in Quartz Rose — the only place PT Serif appears.

## 4. Elevation — Liquid Glass

Not flat. Floating surfaces (navbar, dropdown, homepage cards, pagination, code frames,
hero) use one `--mtf-glass-*` recipe: translucent fill + 1px translucent ring + inner top
highlight (lit edge) + ambient drop shadow + `backdrop-filter: blur(22px) saturate(170%)`.
Glass is the structural language on the dark field — not decorative glassmorphism. In
**light mode** it degrades to clean translucent-white panels with a soft shadow.

- **Glow-on-touch.** Colored shadow (blue/rose) is an interaction reward on hover/focus,
  never a resting state. `:focus-within` mirrors the hover so keyboard users get parity.
- **Code frames** carry the glass *shadow* but keep an opaque code surface — the drifting
  aurora must never sit behind code text.

## 5. The Aurora

One `position: fixed` full-viewport layer behind content (`body::before`, `z-index:-1`):
blue / rose / lavender / white radial blooms over the near-black field, drifting on a 32s
alternating transform loop. Fully **stopped** (not merely slowed) under
`prefers-reduced-motion` and on phones, releasing the GPU layer. Light mode gets a far
subtler two-bloom version.

## 6. Components

- **Admonitions** — full tinted border + wash + bold mono uppercase label + icon. **No
  side-stripe** (banned). Radius `md`.
- **Cards (homepage hub)** — Liquid Glass, two-voice hover/focus glow, serif title. The
  markdown list inside `<div class="mtf-cardgrid">` keeps links locale-aware.
- **Tables** — horizontal scroll (`overflow-x:auto`); first two columns `nowrap`; mono
  uppercase headers (the "spec table" treatment); clean inline code in cells.
- **Navbar** — glass bar, hairline + lit edge; brand = mark + "Meta" (Geist) + "*Flux*"
  (PT Serif italic, rose). Brand left-aligns with the sidebar gutter (1.5rem).
- **Sidebar** — mono uppercase category headers; wash active state (no stripe).
- **Code** — `vsDark` (dark) / `github` (light) Prism; glass frame; ligatures off.
- **Pagination / breadcrumbs / TOC** — tokenized hover, focus parity, mono labels, active TOC rail.

## 7. Do / Don't

**Do:** keep one dark field + one aurora; build floating surfaces as full Liquid Glass with
the lit edge; serif for claims, mono for facts; alternate blue/rose deliberately; reserve
colored glow for hover/focus; ship a `prefers-reduced-motion` path for every animation;
verify dim inks against the surface they sit on.

**Don't:** side-stripe borders (>1px colored left/right accent); gradient text; caption or
sloganize the aurora; introduce a third accent hue or wash a surface in both blue+rose;
let any effect fight legibility; set running body text below 16px or in a dim ink.

## 8. Accessibility

WCAG 2.1 AA both themes (verified, incl. small mono labels on tinted/raised surfaces).
Visible keyboard focus on every interactive element — including tabs and native
`<summary>` (WCAG 2.4.7). `prefers-reduced-motion` honored throughout. Touch targets grow
toward 44px on coarse pointers; hover-only affordances are neutralized on touch.

## 9. Where it lives

- Tokens + all rules: `src/css/custom.css` (sections 1–14, commented).
- Site config (fonts loaded via CSS `@import`; Mermaid, local search, llms-txt, SEO
  JSON-LD): `docusaurus.config.js`.
- Brand assets: `static/img/` (logo, favicon, og). Strategy / register: `PRODUCT.md`.
