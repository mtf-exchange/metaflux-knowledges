# GitBook Space Configuration

This file documents the settings to apply in the GitBook **dashboard** (not in the repo). The repo carries logo / favicon / cover assets and content frontmatter; everything else lives in GitBook's Customization panel.

## Space settings

1. **Connect the GitHub repo** → Sync settings → Choose `mtf-exchange/metaflux-knowledges`, branch `main`.
2. **Custom domain** → set `docs.mtf.exchange`. DNS: CNAME `docs.mtf.exchange` → `hosting.gitbook.io` (verify the exact target in the dashboard).
3. **Visibility** → public (it's a public docs site).
4. **Disable** the GitBook "Edit on GitHub" button if you don't want external PRs.

## Customization → Theme

| Setting | Value |
|---------|-------|
| **Theme mode** | dark by default, with a light toggle |
| **Primary colour (dark)** | `#5BCEFA` (the brand blue) |
| **Primary colour (light)** | `#2BA8E0` (deeper blue for contrast on white) |
| **Heading font** | Cormorant Garamond (paid plan only — falls back to system serif on free) |
| **Body font** | Geist (paid plan only — falls back to Inter / system sans) |
| **Logo (light)** | `.gitbook/assets/logo.svg` |
| **Logo (dark)** | `.gitbook/assets/logo-dark.svg` |
| **Favicon** | `.gitbook/assets/favicon.svg` |
| **Cover image** | `.gitbook/assets/cover.svg` |

## Customization → Layout

| Setting | Value |
|---------|-------|
| **Header layout** | Centered, sticky |
| **Sidebar** | Filled (left), with section icons |
| **Page width** | Default (not extra-wide — code samples read best in 80-column-ish) |
| **Show "Last updated"** | Yes |
| **Pagination (prev/next at bottom)** | Yes |
| **TOC on the right** | Yes for desktop, hide on mobile |

## Customization → Header & footer

- **Header buttons** (right-aligned):
  - `Site →` linking to `https://mtf.exchange/`
  - `GitHub ↗` linking to `https://github.com/mtf-exchange/metaflux-knowledges`
- **Footer**: minimal. A line "© TzAI Foundation. MetaFlux is a TzAI Foundation series product." with a link to `tzai.net`.

## Custom CSS (paid plan only)

If on Premium or higher, paste this into Customization → Custom CSS:

```css
/* Pride accents */
:root {
  --brand-blue:  #5BCEFA;
  --brand-pink:  #F5A9B8;
  --brand-white: #ffffff;
}

/* Lift code blocks to glass */
.gitbook pre, .gitbook code {
  border-radius: 8px;
}

/* Hint blocks pick up the brand */
.gitbook [class*="hint--info"]    { border-color: var(--brand-blue); }
.gitbook [class*="hint--success"] { border-color: var(--brand-blue); }
.gitbook [class*="hint--warning"] { border-color: var(--brand-pink); }
.gitbook [class*="hint--danger"]  { border-color: var(--brand-pink); }

/* Heading accent (italic-via-color treatment, matches the site) */
.gitbook h1 em, .gitbook h2 em {
  color: var(--brand-pink);
  font-style: italic;
}

/* Subtle pride bar above the header */
.gitbook header::before {
  content: "";
  display: block;
  height: 2px;
  background: linear-gradient(
    to right,
    var(--brand-blue)  0%, var(--brand-blue)  25%,
    var(--brand-pink)  25%, var(--brand-pink)  50%,
    var(--brand-white) 50%, var(--brand-white) 62%,
    var(--brand-pink)  62%, var(--brand-pink)  80%,
    var(--brand-blue)  80%, var(--brand-blue)  100%
  );
}
```

Exact selectors depend on the current GitBook render. Use browser devtools to verify and tweak if a class name has changed.

## Free-plan fallback

On free tier (no custom CSS, restricted fonts):

- The brand colour pickers + dark mode toggle still work — set the primary colour to `#5BCEFA` and you'll get most of the visual identity for free.
- Header buttons, logo, favicon, cover all work without paid plan.
- Hint blocks render with GitBook's built-in style — close enough to the brand to ship.

## Synced content

The following repo assets are picked up automatically by GitBook (no dashboard action needed):

| Asset | Purpose |
|-------|---------|
| `README.md` | Landing page (cover + intro hints) |
| `*/README.md` | Section landing pages |
| `.gitbook/assets/*` | Referenceable images, logos, cover |
| Per-file YAML frontmatter (`description`, `cover`, `icon`, `layout.*`) | Page-level rendering knobs |

## Maintenance

When adding a new doc:

1. Start with YAML frontmatter:
   ```yaml
   ---
   description: One-line summary of the page.
   icon: book-open    # any Font Awesome name
   ---
   ```
2. Open with a `{% hint %}` status block (success / info / warning) instead of a `>` blockquote so it renders as a coloured callout.
3. Use `{% tabs %}` for multi-language code samples.
4. Reference images via `.gitbook/assets/<name>` so GitBook tracks them.
