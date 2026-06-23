# MetaFlux Knowledge Base

Integration reference, API surface, and core concepts for the MetaFlux derivatives exchange.

Published at **https://docs.mtf.exchange** — built with [Docusaurus](https://docusaurus.io/).
The documentation content lives in [`docs/`](./docs).

## Local development

```bash
npm install
npm start          # dev server with hot reload at http://localhost:3000
```

## Build

```bash
npm run build      # static site into ./build
npm run serve      # preview the production build locally
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site
and publishes it to GitHub Pages. The custom domain (`docs.mtf.exchange`) is set
via [`static/CNAME`](./static/CNAME).

> **DNS:** point `docs.mtf.exchange` at GitHub Pages with a CNAME record →
> `mtf-exchange.github.io`. Then in the repo's **Settings → Pages**, set the
> source to **GitHub Actions** and confirm the custom domain.

## Structure

| Path | Purpose |
|------|---------|
| `docs/` | All documentation (Markdown) |
| `sidebars.js` | Navigation tree |
| `docusaurus.config.js` | Site config (title, URL, navbar, footer, theme) |
| `src/css/custom.css` | Brand theme (aligned with the marketing site) |
| `static/` | Assets, favicon, logo, `CNAME` |
