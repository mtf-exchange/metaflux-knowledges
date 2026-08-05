---
name: MetaFlux Docs
description: The documentation theme for MetaFlux — the app's "Perps Desktop v2" (Organic-derived) system applied to a docs site. Mist ground, deep-teal primary with a sage second voice, real elevation, Caprasimo/Figtree/Inter. Implemented in src/css/custom.css over Docusaurus 3 / Infima.
register: product
colors:
  # Accents — the two voices. Every value is measured against the page it sits on.
  accent-teal: "#1a6670"        # light primary        6.28:1
  accent-teal-dark: "#7fc7ce"   # dark primary         9.08:1
  accent-sage: "#5b7449"        # light second voice   4.94:1
  accent-sage-dark: "#a9c294"   # dark second voice    8.98:1
  # Light plane — mist chrome, neutral reading column
  light-bg: "#faf9f6"          # the reading column
  light-surface: "#f1f1ec"     # cards on it
  light-surface-2: "#e6e7e0"   # one step deeper
  light-chrome: "#e9ede4"      # navbar + sidebar (app mist)
  light-seam: "#dee4d8"        # the desk (app mist)
  light-ink: "#322f28"         # 12.68:1 — not the app's harder #201e1d
  light-ink-mid: "#625e53"     #  6.15:1
  light-ink-dim: "#6f6a5e"     #  5.12:1 on page, 4.75 on card — the AA floor
  light-line: "rgba(50, 47, 40, 0.14)"
  light-line-strong: "rgba(50, 47, 40, 0.30)"
  # Dark plane — not an inversion; warm near-black under warm off-white
  dark-bg: "#1b1a17"
  dark-surface: "#24231f"
  dark-surface-2: "#2d2c27"
  dark-chrome: "#232722"
  dark-seam: "#121310"
  dark-ink: "#e9e3d8"          # 13.63:1
  dark-ink-mid: "#aba598"      #  7.10:1
  dark-ink-dim: "#948e80"      #  5.34:1
  dark-line: "rgba(233, 227, 216, 0.14)"
  dark-line-strong: "rgba(233, 227, 216, 0.28)"
  # State — chosen at label-safe values, so no component darkens them per surface
  warn: "#8a5a12"               # 5.62:1  · dark plane #e0b450
  danger: "#a33b52"             # 6.04:1  · dark plane #e88b9f
  # Brand — NOT part of the UI palette; see §7
  brand-blue: "#5BCEFA"
  brand-rose: "#F5A9B8"
typography:
  display:
    role: "h1 + h2 only — the page title and its section heads"
    fontFamily: "Caprasimo, Georgia, serif"
    fontWeight: 400
    h1: "clamp(1.7rem, 4vw, 2.45rem)"
    h2: "1.6rem"
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem / 16px"
    lineHeight: 1.7
    role: "prose, sidebar, navbar, and h3–h6 at weight 800"
  numeric:
    role: "The 'readout' voice — table headers, breadcrumbs, admonition labels, pagination sublabels; and every figure in a table"
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 700
    letterSpacing: "0.02em"
    fontFeature: "tabular-nums lining-nums"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    lineHeight: 1.7
    ligatures: "none (API operators render literally)"
rounded:
  sm: "8px (--mtf-r-sm)"
  panel: "14px (--mtf-r-panel) — the tile radius"
  md: "16px (--mtf-r-md)"
  lg: "28px (--mtf-r-lg)"
  pill: "999px (--mtf-r-pill)"
elevation:
  sm: "0 1px 2px (--mtf-shadow-sm)"
  md: "0 3px 10px (--mtf-shadow-md)"
  lg: "0 12px 32px (--mtf-shadow-lg)"
motion:
  spring: "cubic-bezier(0.2, 0.9, 0.3, 1) — --mtf-ease-spring"
  soft: "cubic-bezier(0.22, 1, 0.36, 1) — --mtf-ease-soft"
  duration: "180ms (--mtf-dur); tactile press snaps in 70ms, springs back over 220ms"
---

# Design System: MetaFlux Docs

This documents the **implemented** theme in `src/css/custom.css`. Its canonical source is
the trading app's [`../metaflux-web/src/routes/layout.css`](../metaflux-web/src/routes/layout.css)
— the **"Perps Desktop v2"** system, derived from Organic — adapted to a developer
documentation site.

It replaces the previous theme ("The Honest Instrument", inherited from
`../metaflux-site`) wholesale: the near-black field, the drifting aurora, Liquid Glass on
data surfaces, the Cormorant Garamond / Geist / Geist Mono stack and the blue→rose accent
pair are all retired.

## 1. North Star

A warm, printed instrument, and a **soft** one. Mist-toned grounds sitting close together,
hairline-ruled panels, and exactly two accent voices — a deep teal that leads and a sage
that answers. Light-first, following the OS, with a fully-designed dark plane. Nothing
glows, nothing floats, and no surface shouts: structure comes from how surfaces are
stacked and from a hairline on every container, never from a jump in brightness.

## 2. What is inherited, and what isn't

The app is themeable on six axes (`theme · ground · accent · pnl · serif · density`). A docs
site has no appearance panel, so it **pins one point** in that space and maps its two
polarities onto Docusaurus' light / dark. Conveniently, the app's `data-theme` attribute is
the same one Infima toggles.

| Axis | Docs value | Why |
| --- | --- | --- |
| `ground` | `mist`, on the chrome | The app default frames the site — desk, navbar, sidebar. The reading column is deliberately *not* on it; see §5. |
| `accent` | `teal` | The app default. |
| `pnl` | n/a | Docs carry no directional values. |
| `serif` | on, for h1–h2 | See §3. |
| `density` | **not inherited** | The terminal sets body at 13px with a 30px row. Long-form docs stay at 16px / 1.7. |

Two other deliberate departures, both for legibility rather than taste:

- **The text ramp is lifted.** The app mixes secondary ink at 62% / 45% — tuned for 13px
  dense data. On a docs page those land under AA for running secondary copy, so the ramp is
  72% / 62% (6.0:1 / 4.4:1).
- **A monospace is added.** The terminal has no code surface and therefore ships no mono
  face. Rather than invent a fourth brand voice, the platform stack is used.

## 3. Typography

Three voices from the app, plus the mono above.

- **Caprasimo** (display) — **h1 and h2 only.** It is a heavy display serif with a single
  cut; below h2 it stops being a heading and becomes an obstacle, since an h3 lands every
  few paragraphs of API prose and is read rather than admired. The app treats this as a
  setting, not a law (`data-serif: off` swaps its whole heading stack to the body face), so
  drawing the line at h3 is inside the system.
- **Figtree** (body) — prose, navigation, and h3–h6 at weight 800.
- **Inter** (numerals + micro-labels) — the "readout" voice: uppercase, `0.02em` tracked,
  weight 700, on table headers, admonition labels, breadcrumbs and pagination sublabels; and
  tabular lining figures in every table cell. This replaces v1's uppercase **mono** label
  voice, which the app does not have.

**Named rule — The Readout Is Not Navigation.** The uppercase label voice belongs to data
chrome (headers, labels, legends). It is never used on nav items: the app's rail sets its
entries in plain bold ink, and mixing shouting section headers with quiet page links at the
same indent is what makes a deep sidebar read as noise.

## 4. Color

Two voices, never three. `--mtf-accent` (teal) leads — links, focus rings, active TOC rail,
hash anchors. `--mtf-accent-2` (sage) answers — the **selected** state, table row hover, tip
admonitions, and the even cards in the homepage grid.

**Named rules**

- **The Two-Voice Rule.** Teal and sage alternate as call-and-response (homepage cards:
  odd→teal, even→sage). Never wash one surface in both; never add a third accent role.
- **Selected Is Sage.** The active sidebar entry takes `accent-2-100 / accent-2-800`, the
  app's own selected idiom — *not* the teal primary. Teal is the link colour; if the
  selected page went teal too, every route in the tree would compete with it.
- **A Link Is Recognised By Hue.** The primary is a MID teal (`#1a6670`), not the app's
  near-black `#24494f`. That one cleared contrast at 8.5:1 and still failed, because at
  body size it read as "slightly blue-ish black" — a link nobody sees. Contrast is a
  floor, not the test; the test is whether a reader spots it mid-sentence.
- **Color is never the sole signal.** Admonitions pair colour with an icon and a label.
- **AA everywhere.** Body ≥4.5:1, large ≥3:1, both planes. Three of the four admonition
  hues fall under 4.5:1 as a 0.72rem label on their own tinted wash, so the light plane
  darkens *just the label* while the border and fill keep the true hue.

## 5. Surfaces — the stack

Mist **frames** the site. It is not what you read on.

| Tone | Role |
| --- | --- |
| `#dee4d8` mist | the desk — `<body>` |
| `#e9ede4` mist | chrome — navbar, doc sidebar |
| `#faf9f6` neutral | **the reading column** (`main`) |
| `#f1f1ec` neutral | cards on it — code frames, tables, callouts, cards |
| `#e6e7e0` neutral | one step deeper — table headers, nested callouts, inset fields |

**Named rule — Colour Where It Is Seen, Not Where It Is Read.** Every ground preset in the
app is chromatic, and it can afford to be: a terminal never holds 700px of unbroken prose.
A knowledge base does nothing else, and sustained reading on a colour-cast field tires the
eye. So the ground keeps the surround — which is what makes the site *look* like the app —
and the reading column steps to a near-neutral drawn from the same hue.

**Named rule — One Step, Never a Jump.** Chrome to column is a single gentle move. A
near-white column was tried and is wrong: against mist chrome it reads as a hard seam and
throws away the softness the ground was chosen for. If a surface is hard to place, give it
an edge or move it one step — never brighten it.

**Named rule — Contrast Is Not Readability.** Body ink is `#322f28`, not the app's
`#201e1d`: 12.68:1 rather than 14.6:1. Near-black on near-white haloes and is a known
fatigue source over long sessions. The secondary and tertiary inks are stated outright
rather than mixed as alphas off the body ink — a mix drifts with whatever it composites
over, and these have to hold 6:1 and 4.5:1 on *both* the page and the card.

**Named rule — Nothing Floats.** Infima's three global shadow tokens are set to `none`, and
so is every shadow this theme would otherwise draw. Elevation is reserved for the single
thing that genuinely floats over the page — the navbar dropdown. Hover and focus are
signalled by border and fill, not by a lift. Glass, likewise, is chrome only: navbar,
dropdown, mobile drawer, at `blur(28–36px) saturate(108%)`.

Hairlines: `--mtf-line` is the working weight and draws almost everything, container edges
included. `--mtf-line-strong` is held back for the few rules that must separate two filled
surfaces, such as a table header from its body.

## 6. Components

- **Sidebar** — the app's nav rail one level deeper. Recessed onto `surface-2`. Level 1 is
  plain bold ink (categories and standalone pages look identical; the caret says "this
  opens", not the type). Level 2+ steps down in size, weight and ink behind an indent rail,
  so depth is **drawn** rather than inferred. Active = sage tint. Hover = a text-alpha wash,
  so one rule reads on both planes.
- **Admonitions** — quiet cards, not colored slabs. A full tinted wash turned every callout
  into a block of colour, and a warning nested inside an info made two of them stacked. The
  panel is the ordinary card tone; the **type is carried by the icon and the label**, which
  is where it is read. Warning and danger keep a trace of hue in the border, since those two
  have to be noticed across a page. Nested callouts step to `surface-2` so they don't vanish
  into their parent. **No side-stripe** (banned).
- **Tables** — a card on the tile, `overflow-x: auto`; first column `nowrap`; Inter uppercase
  headers on `surface-2`; sage row hover.
- **Inline code** — **no chip.** The mono face is the signal. A filled, padded, rounded chip
  per token is fine when code is occasional, but this reference runs twenty to a sentence and
  each one became a blob with its own edge — the paragraph stopped being a paragraph.
- **Code** — a Prism theme built from these tokens (`codeTheme()` in
  `docusaurus.config.js`), on **three hues and nothing else**: the primary carries
  keywords, the second voice carries strings, the warn hue carries numbers, and everything
  structural — function names, tags, properties — is plain ink. Off-the-shelf themes reach
  for eight or ten, which on a reference page makes the code block louder than the prose
  explaining it. Neutrals come from the same ink ramp as body text, so a block reads as
  part of the page rather than a pasted-in terminal. The frame is a flat panel;
  `--prism-background-color` is overridden to the card surface. Ligatures off.
- **Cards (homepage hub)** — `surface` fill, `md` radius, two-voice hover/focus lift.
- **Navbar** — glass bar with a hairline; the brand is the lockup asset (§7).
- **Buttons / pagination** — the app's `.tactile` press: snap down in 70ms, spring back over
  220ms on `--mtf-ease-spring`.

## 7. The brand is not the palette

**The v2 retheme changed the product palette, not the identity.** The mark and the lockup
keep their own blue→rose *flux* gradient in the app, and they keep it here.

- The navbar brand is the **real lockup asset** — mark + drawn wordmark — copied from
  `../metaflux-web/static/brand/`, in the same two theme cuts the app's `BrandLockup` swaps
  between. It is **not** type set in the UI's faces, and it does **not** follow the accent.
- `static/img/favicon.svg` is the app's own favicon verbatim: the mark on a **transparent**
  ground, no plate.
- `static/img/og.svg` (the social card, and the homepage hero) is a brand artifact and is
  left untouched by this theme.

**Named rule — Don't Repaint the Brand.** Nothing in `custom.css` recolours the mark, the
wordmark or the lockup. If a surface needs the identity to match it, change the surface.

## 8. Do / Don't

**Do:** place a surface by its job in the stack (§5) and give it a hairline; keep the steps
between tones small; reserve glass for transient chrome; alternate teal and sage
deliberately; keep the display face to h1–h2; draw hierarchy with indent and rails rather
than typographic shouting; ship a `prefers-reduced-motion` path for every animation.

**Don't:** buy contrast with brightness (**No Bright Page**); add a shadow — anywhere but the
dropdown (**Nothing Floats**); wash a callout in its type colour; put a filled chip on inline
code; side-stripe borders (>1px colored left/right accent); use the uppercase readout voice
on navigation; introduce a third accent hue, or wash one surface in both voices; gradient
text; set body text below 16px or in a dim ink; and never recolour the brand.

## 9. Accessibility

WCAG 2.1 AA both planes, including small labels on tinted and raised surfaces. Visible
keyboard focus on every interactive element — including tabs and native `<summary>` (WCAG
2.4.7) — as a 2px accent outline at 2px offset, the app's own ring. `prefers-reduced-motion`
near-zeroes every transition and animation. Touch targets grow toward 44px on coarse
pointers; hover-only affordances are neutralized on touch, and the expensive full-viewport
`backdrop-filter` is reduced there.

## 10. Where it lives

- Tokens + all rules: `src/css/custom.css` (sections 1–15, commented).
- Site config (Prism themes, Mermaid colors, colorMode, navbar logo, local search,
  llms-txt, SEO JSON-LD): `docusaurus.config.js`.
- Brand: `static/brand/` (the two lockup cuts), `static/img/` (mark, favicon, og).
  Strategy / register: `PRODUCT.md`.
