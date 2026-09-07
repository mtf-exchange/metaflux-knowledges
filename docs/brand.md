# Brand guidelines

:::tip
**Stable.**
:::

How to show the MetaFlux mark, lockup, colour and type when you write about MetaFlux.

## TL;DR {#tldr}

- The **mark** is three stacked wave strokes. The **lockup** is the mark plus the drawn
  "MetaFlux" wordmark. Both ship as SVG under `/brand/`.
- Pick a file by two questions: mark alone or lockup, and light ground or dark ground. Each
  answer has a colour variant and a mono variant.
- Keep clear space of one third of the placed height around the lockup. Set the lockup at
  32 px tall or more; 22 px is the absolute floor.
- Amber (`--color-warn`) is reserved for risk and liquidation warnings. It is not a
  decorative accent.
- The files are published so you can refer to MetaFlux accurately. **The licence on the
  files is not a trademark licence.** Nobody may imply endorsement or partnership.

## The mark and the lockup {#mark-and-lockup}

### What ships {#what-ships}

Nine SVG files. Every file is vector, has a transparent ground, and carries no raster data.

| File | What it is | Paint | Ground | viewBox |
|---|---|---|---|---|
| `metaflux-lockup-color-light.svg` | Mark + wordmark | Gradient mark, gradient "Flux", ink "Meta" `#1a1e29` | Light | `-2 8 415 84` |
| `metaflux-lockup-color-dark.svg` | Mark + wordmark | Gradient mark, gradient "Flux", ink "Meta" `#f0f3f7` | Dark | `-2 8 415 84` |
| `metaflux-lockup-mono-light.svg` | Mark + wordmark | One ink, `#06070b` | Light | `-2 8 415 84` |
| `metaflux-lockup-mono-dark.svg` | Mark + wordmark | One ink, `#f0f3f7` | Dark | `-2 8 415 84` |
| `metaflux-mark.svg` | Mark alone | Gradient | Either | `6 12 52 45` |
| `metaflux-mark-mono.svg` | Mark alone | `currentColor` | Either | `6 12 52 45` |
| `metaflux-mark-square.svg` | Mark centred in a square frame | Gradient | Either | `0 0 64 64` |
| `metaflux-mark-square-mono.svg` | Mark centred in a square frame | `currentColor` | Either | `0 0 64 64` |
| `metaflux-mark-animated.svg` | Mark alone, with CSS hooks | Gradient | Either | `6 12 52 45` |

### Which one to use {#which-one}

- **Use the lockup** wherever MetaFlux is named for the first time, and wherever the reader
  may not know the mark: a press article, a listing page, a partner directory, a slide
  header, a footer.
- **Use the mark alone** only where the name is already present in text next to it, or where
  the space is too small for a wordmark: a favicon, an avatar, a tab strip, a chart legend.
- **Use the square variant** wherever a platform crops to a square or a circle: an app icon,
  an avatar, a social profile, a store listing.
- **Use a colour variant** on a plain light ground or a plain dark ground.
- **Use a mono variant** on a photograph, on a coloured ground, in one-colour print, in an
  embossing or an engraving, and wherever a gradient would fight the surrounding chrome.
- **Match the ground.** A file named `-light` is drawn for a light ground. A file named
  `-dark` is drawn for a dark ground. The two colour lockups differ only in the ink under
  the gradient, so the wrong one loses the word "Meta".

The two `-mono` mark files paint with `currentColor`. Inline them in a page and they take
the text colour of the parent element. This is the simplest way to put the identity in one
ink that already matches your design.

### Three details that surprise people {#asset-details}

**The mark is a crop.** In `metaflux-mark.svg` the three waves run past the left and the
right edge of the frame. The artwork is a window on a wider wave, and the cut edges are
deliberate. Keep the crop. Only `metaflux-mark-square.svg` holds the whole wave inside its
frame.

**No file names itself in its content.** No file carries a `<title>` or a `<desc>` element.
Each carries an `aria-label` only: "MetaFlux mark", "MetaFlux logo", or "MetaFlux animated
mark". If you inline the SVG, keep that label or supply your own. If you place the file with
an image element, supply alternative text.

**The animated mark ships no animation.** `metaflux-mark-animated.svg` tags its three paths
with CSS classes and nothing more. It has no `<style>` element and no `<animate>` element.
It renders as the static mark until the page that embeds it supplies the animation CSS.
Treat it as a starting point, not a finished asset.

## Clear space and minimum size {#clear-space-and-minimum-size}

The artwork sets its own spacing. The rules below come from measuring it, in the file's own
user units.

### What the artwork already encodes {#derivation}

**The lockup**, viewBox `-2 8 415 84`:

- The wordmark cap height is **52 units**. The cap of "M" sits at y = 22.88 and the baseline
  at y = 74.9.
- The mark ink ends at x = 75.1. The wordmark starts at x = 101.2. The artwork therefore
  puts **26.1 units** between the mark and the wordmark — half the cap height.
- The mark ink starts at y = 22.88, the same height as the cap of "M". The mark is
  cap-aligned, not centred on the x-height.

**The square variant**, viewBox `0 0 64 64`: the mark ink runs from x = 7.0 to x = 57.0 and
from y = 15.8 to y = 48.0. The frame is inset 7 units at each side and about 16 units at
top and bottom.

### The rules {#clear-space-rules}

| Asset | Clear space on all four sides |
|---|---|
| Lockup | One third of the placed height |
| Mark alone | One half of the placed height |
| Square variant | The frame is the clear space |

One third of the lockup's 84-unit frame is 28 units, which is the artwork's own 26.1-unit
gap rounded up. The mark rule carries the same measure across: in the lockup the mark ink is
48.4 units tall and the gap beside it is 26.1 units, or 0.54 of that height.

Place the square variant as it is. Do not crop it tighter, and do not add a second frame
inside it.

Nothing enters the clear space: no text, no rule, no image edge, no page trim.

### Minimum size {#minimum-size}

The mark draws three strokes: 5.4 units wide at full opacity, 2.4 units at 0.42 opacity, and
2.2 units at 0.20 opacity. The two light strokes set the floor, because they disappear
first.

| Asset | Screen floor | Print floor | Why |
|---|---|---|---|
| Mark | 22 px tall | 6 mm | At 22 px the 2.2-unit stroke covers 1.08 px of the 45-unit frame. |
| Lockup | 32 px tall; 22 px absolute floor | 9 mm; 6 mm floor | The lockup scales the mark by 1.223, so the faintest stroke is 2.69 units of an 84-unit frame and needs **32 px** to hold a whole pixel. Below that the echo strokes thin out but the wordmark still reads, which is why 22 px is a floor rather than a target — the product uses it in one compact menu and nowhere else. |
| Square variant | 16 px | 5 mm | At 16 px only the 5.4-unit stroke survives. A favicon needs no more. |

Below the floor the two echo strokes fade and the mark reads as a single wave. That is
acceptable in a favicon. It is not acceptable in a header.

## Colour {#colour}

The product theme is a set of CSS custom properties. Both columns below are the **default
build**: `mist` ground, `standard` rise and fall, in light and in dark.

**The surface values depend on the ground preset, not on the theme alone.** The product
always sets a ground; it never runs on the bare defaults. So a value read from a
`data-theme="dark"` rule alone is not what the shipped product paints — read the
`[data-theme="dark"][data-ground="mist"]` pair, which is what the table gives.

Quote these values. Do not re-derive them.

### Ground and ink {#ground-and-ink}

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--color-bg` | `#eaefe6` | `#1a1f1b` | The page ground |
| `--color-bg-elev` | `#dde5d7` | `#252c26` | A panel or a card on the ground |
| `--color-bg-elev-2` | `#d0dbc9` | `#2f382f` | One step further forward: a menu, a popover |
| `--color-seam` | `#ccd6c5` | `#0f1310` | The desk behind the app window and the gaps between tiles |
| `--color-line` | `rgba(28,36,28,0.16)` | `rgba(226,239,224,0.14)` | The default hairline |
| `--color-line-strong` | `rgba(28,36,28,0.34)` | `rgba(226,239,224,0.29)` | A hairline that must carry a boundary |
| `--color-content` | `#201e1d` | `#f2e7d5` | Body text and primary ink |
| `--color-content-mid` | 62% of `--color-content` | Same rule | Secondary text, labels |
| `--color-content-dim` | 45% of `--color-content` | Same rule | Placeholder and disabled text |

The two text mixes are stated as a percentage of `--color-content`, not as a hex value, so a
ground that changes the ink drags the whole ramp with it.

The ground has four presets. `mist` above is the default; the other three replace the four
surface values and the two hairlines only.

| Ground | Light `--color-bg` | Dark `--color-bg` |
|---|---|---|
| `paper` | `#f4f2ea` | `#1e1d1a` |
| `mist` (default) | `#eaefe6` | `#1a1f1b` |
| `slate` | `#e9eef0` | `#191d1f` |
| `hc` (high contrast) | `#ffffff` | `#000000` |

`hc` also replaces `--color-content` — `#101010` on light, `#ffffff` on dark — so the two
text mixes follow it.

### Accent {#accent}

Two voices, not one accent plus a highlight. `--color-accent` leads; `--color-accent-2` is a
genuine second voice.

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--color-accent` | `#24494f` | `#bdd6d8` | The primary voice: links, the active state, the primary button |
| `--color-accent-100` | `#dfe9e9` | `#22383b` | The lightest wash on the light plane |
| `--color-accent-200` | `#cddcdc` | `#2d474b` | A wash that must carry a hairline |
| `--color-accent-300` | `#a8c4c6` | `#6f9296` | A border or a mid-tone fill |
| `--color-accent-600` | `#1b393e` | `#cee3e4` | The pressed state |
| `--color-accent-700` | `#142c30` | `#dcecec` | Ink on an accent wash |
| `--color-accent-800` | `#11282c` | `#dbeaea` | The deepest step |
| `--color-accent-2` | `#6f8a5f` | `#a9c294` | The second voice: an alternate category, a second series |
| `--color-accent-2-100` | `#e9f0e0` | `#2b3a24` | As above, second voice |
| `--color-accent-2-200` | `#d6e3c9` | `#38492e` | |
| `--color-accent-2-300` | `#ccdbb2` | `#6f8a5f` | |
| `--color-accent-2-600` | `#5b7449` | `#bcd2a8` | |
| `--color-accent-2-700` | `#48603a` | `#cbdcbb` | |
| `--color-accent-2-800` | `#3a4e2f` | `#d8e6cb` | |

`teal` above is the default accent. Four more presets ship, each with a full ramp on both
planes. Their base values are:

| Accent | Light `--color-accent` | Light `--color-accent-2` | Dark `--color-accent` | Dark `--color-accent-2` |
|---|---|---|---|---|
| `teal` (default) | `#24494f` | `#6f8a5f` | `#bdd6d8` | `#a9c294` |
| `clay` | `#a5563a` | `#8a8f4f` | `#eda98d` | `#ccd18a` |
| `indigo` | `#3f4a8f` | `#5d8aa0` | `#a5b0e8` | `#9fc4d6` |
| `plum` | `#6b3f63` | `#8a7fa8` | `#d3a9cb` | `#bbb3d4` |
| `moss` | `#3d5c3a` | `#8a7a4f` | `#a8c7a3` | `#cdbd8a` |

Four aliases exist for compatibility with earlier markup, and they carry no colour of their
own:

| Alias | Points at |
|---|---|
| `--color-blue` | `--color-accent` |
| `--color-blue-deep` | `--color-accent-600` |
| `--color-pink` | `--color-accent-2` |
| `--color-pink-deep` | `--color-accent-2-600` |

The names are historical. `--color-blue` paints teal. Prefer the accent names in new work.

### Neutral ramp {#neutral-ramp}

Nine steps, and the only tokens with the **same value on both planes**.

| Token | Value | Token | Value |
|---|---|---|---|
| `--color-neutral-100` | `#f9f4ed` | `--color-neutral-600` | `#82796a` |
| `--color-neutral-200` | `#eee7db` | `--color-neutral-700` | `#645c50` |
| `--color-neutral-300` | `#dcd3c4` | `--color-neutral-800` | `#474238` |
| `--color-neutral-400` | `#c0b6a5` | `--color-neutral-900` | `#2e2b25` |
| `--color-neutral-500` | `#a19786` | | |

Use them for a tag that carries no meaning, and for the scrim behind a dialog.

### Rise and fall {#rise-and-fall}

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--color-up` | `#00b3cc` | `#2fcbdd` | A rise: positive PnL, a bid, an up tick |
| `--color-up-dim` | `#d4f0f3` | `#0d3239` | The wash behind a rise |
| `--color-down` | `#e0567a` | `#ee7794` | A fall: negative PnL, an ask, a down tick |
| `--color-down-dim` | `#fbdfe6` | `#48202c` | The wash behind a fall |

Three schemes ship. `standard` above is the default.

| Scheme | Light rise | Light fall | Dark rise | Dark fall |
|---|---|---|---|---|
| `standard` (default) | `#00b3cc` | `#e0567a` | `#2fcbdd` | `#ee7794` |
| `traditional` | `#27a69a` | `#f05350` | `#3fc4b6` | `#ff6f6c` |
| `cb` (colour blind) | `#1f7fc4` | `#d4802a` | `#6cb6e8` | `#eaa85e` |

A separate setting swaps the pair for traders who read the other convention. So a rise is
not reliably cyan and a fall is not reliably rose.

:::info
**Colour is never the only cue.** Every signed value also carries a sign, an arrow or a
label. Do not build a chart, a table or a badge in which direction is readable from colour
alone.
:::

### Risk {#risk}

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--color-warn` | `#b7791f` | `#f5c84b` | Risk and liquidation warnings |
| `--color-warn-dim` | `rgba(183,121,31,0.14)` | `rgba(245,200,75,0.16)` | The wash behind a warning |

**Amber is reserved.** It is its own hue and it belongs to one job: telling a user that a
position, an account or an action carries risk. It marks a margin ratio that is close to
liquidation, an invalid field, a deposit caution, and a warning notice. It is never a
decorative accent, never a brand colour, and never a fourth voice in a chart. If amber
appears where nothing is at risk, the real warning stops being read.

### The identity does not follow the accent {#identity-does-not-follow-accent}

**Do not repaint the brand.** The product palette and the identity are separate. An accent
preset changes the interface; it never changes a COLOUR file, which keeps its own
blue-to-rose gradient and its own ink whatever the surface does.

A mono file is the opposite by design: it paints in `currentColor`, so it takes whatever ink
you set. That is the sanctioned way to make the identity match a surface, and the product
itself uses it — the mark in the app rail inherits the active accent. Recolouring means
editing a colour file's fill; it does not mean using a mono file in your own ink.

## Typography {#typography}

Three faces, three jobs. Do not add a fourth.

| Face | Role | Token | Licence |
|---|---|---|---|
| Caprasimo | Display headings | `--font-heading` | SIL Open Font License 1.1 |
| Figtree | Body text and UI | `--font-body` (`--font-sans` is an alias) | SIL Open Font License 1.1 |
| Inter | Every number | `--font-num` | SIL Open Font License 1.1 |

### Where to get the faces {#font-sources}

**This site publishes no font files.** Take each family from its own project:

| Face | Source |
|---|---|
| Caprasimo | [Google Fonts](https://fonts.google.com/specimen/Caprasimo) — SIL Open Font License 1.1 |
| Inter | [rsms.me/inter](https://rsms.me/inter/) — SIL Open Font License 1.1 |
| Figtree | [Google Fonts](https://fonts.google.com/specimen/Figtree) — SIL Open Font License 1.1 |

The OFL lets you use, embed and redistribute these faces, including in a commercial product.
It asks two things in return: keep the licence with any copy you pass on, and do not sell the
fonts on their own. A renamed derivative may not use a Reserved Font Name.

### What the OFL asks of a redistributor {#ofl-obligations}

If you pass a copy of Caprasimo or Inter to anyone else — on its own, or bundled in a
product, a theme or a document — the SIL Open Font License 1.1 asks five things:

1. Ship the copyright notice and the full licence text with every copy.
2. Do not sell the font files on their own. Selling a product that contains them is fine.
3. Do not use a reserved font name for a modified version. Rename your version.
4. Keep any modified version under the same licence.
5. Do not claim the original authors made your modified version.

The licence covers the font software only. It never reaches the documents you set in the
font, or the product you ship.

### Rules of use {#type-rules}

- Caprasimo covers Latin only. Where the language is not English, set headings in Inter
  instead. The product does the same.
- Set every number in Inter, with tabular and lining figures, so columns align.
- Never set the word "MetaFlux" in a UI face when you mean the logo. Use the lockup file.

## Misuse {#misuse}

Each item is checkable by looking at the layout.

- **Do not recolour the mark or the wordmark.** The colour files carry a fixed gradient and
  a fixed ink. If you need another colour, use a mono file, which takes one ink.
- **Do not place a colour file on a mid-tone ground.** Read the wordmark, not the
  gradient. The gradient (`#5BCEFA` → `#cfc0e8` → `#F5A9B8`) is light against almost
  everything: it measures 1.5:1 on the recommended light ground and 2.1:1 on mid grey, so
  it is not what carries the mark. The legibility anchor is the ink half of the wordmark —
  `#1a1e29` "Meta" on light, which is 14.3:1 on `#eaefe6` and only 4.2:1 on mid grey. A
  mid-tone ground takes the anchor away and leaves three pale strokes. Use a mono file,
  which puts the whole lockup in one ink you control.
- **Do not put the light-ground file on a dark ground, or the reverse.** Check the word
  "Meta": if you cannot read it, the file is wrong.
- **Do not stretch the lockup.** Its frame is 415 by 84 units. Scale both sides by the same
  factor. Measure the frame in your layout: a ratio other than 4.94:1 is wrong.
- **Do not rebuild the mark.** Its three strokes are 5.4, 2.4 and 2.2 units wide at 1.00,
  0.42 and 0.20 opacity. Do not change a width, do not change an opacity, do not add a
  fourth stroke, and do not remove the two light ones.
- **Do not re-set the wordmark in a font.** The wordmark is drawn as outline paths, not as
  text. Typing "MetaFlux" in any face produces a different shape.
- **Do not rotate, skew, flip, outline or emboss the mark.**
- **Do not put the lockup in a box, a badge or a pill,** and do not add a drop shadow behind
  it. The files ship on a transparent ground and stay there.
- **Do not put anything in the clear space** — no text, no rule, no image edge, no page trim.
- **Do not crop the square variant tighter,** and do not add a plate behind the mark.
- **Do not use the mark as a bullet, a texture, a watermark or a repeating pattern.**
- **Do not use amber as an accent.** Amber is the risk colour. See
  [Risk](#risk).
- **Do not build a new lockup.** No "MetaFlux" plus a second word set as one unit, and no
  partner lockup that joins your mark to ours.

## Files and licence {#files-and-licence}

### Where to get the files {#where-to-get-the-files}

Every file is served from this site under `/brand/`.

**Lockup**

- [metaflux-lockup-color-light.svg](pathname:///brand/metaflux-lockup-color-light.svg)
- [metaflux-lockup-color-dark.svg](pathname:///brand/metaflux-lockup-color-dark.svg)
- [metaflux-lockup-mono-light.svg](pathname:///brand/metaflux-lockup-mono-light.svg)
- [metaflux-lockup-mono-dark.svg](pathname:///brand/metaflux-lockup-mono-dark.svg)

**Mark**

- [metaflux-mark.svg](pathname:///brand/metaflux-mark.svg)
- [metaflux-mark-mono.svg](pathname:///brand/metaflux-mark-mono.svg)
- [metaflux-mark-square.svg](pathname:///brand/metaflux-mark-square.svg)
- [metaflux-mark-square-mono.svg](pathname:///brand/metaflux-mark-square-mono.svg)
- [metaflux-mark-animated.svg](pathname:///brand/metaflux-mark-animated.svg)

Take the file as it is. Do not re-export it, do not run it through an optimiser that drops
the `aria-label`, and do not convert it to a raster format for any use that can carry SVG.

The two typefaces are not published here. Take Caprasimo and Inter from their own projects,
under the SIL Open Font License 1.1.

### What you may do {#what-you-may-do}

These files are published for one purpose: so that other people can **refer to MetaFlux
accurately**.

You may:

- show the mark or the lockup to name MetaFlux as a venue you integrate with, list, index,
  chart or report on;
- use the name "MetaFlux" in running text to refer to the protocol;
- place an unaltered file in an article, a listing page, a wallet, an aggregator, an
  integration document, a slide or a conference programme.

### What the licence does not grant {#trademark}

:::danger
**A licence on the files is not a trademark licence.** Copyright and trademark are separate
rights. Permission to copy the artwork is not permission to trade under it.
:::

"MetaFlux", the mark and the lockup are trademarks. They are **not** licensed by this page.

You may not:

- imply endorsement, sponsorship, partnership, affiliation or certification;
- use the mark, the lockup or the name in your own product name, company name, domain name,
  app-store listing, social-media handle or token ticker;
- alter the artwork in any way this page forbids;
- put the mark on merchandise, or on anything a reader could take for an official MetaFlux
  release;
- use the mark so that a reader could think MetaFlux audits, insures, endorses or takes
  responsibility for your product.

If a use is not on the list above and you are unsure, ask before you publish. Open an issue
on the [documentation repository](https://github.com/mtf-exchange/metaflux-knowledges), or
write through the contact route on [mtf.exchange](https://mtf.exchange/).
