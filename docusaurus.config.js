// @ts-check

/**
 * Syntax highlighting, on the theme's own palette.
 *
 * Three hues and nothing else: the primary carries keywords, the second voice
 * carries strings, the warn hue carries numbers, and everything structural —
 * function names, tags, properties — is plain ink. Off-the-shelf themes reach for
 * eight or ten, which on a reference page means the code block is louder than the
 * prose explaining it. Neutrals are the same ink ramp the body text uses, so the
 * block reads as part of the page rather than a pasted-in terminal.
 *
 * Each entry is measured against the card surface it sits on, not against white.
 */
const codeTheme = (p) => ({
  plain: {color: p.ink2, backgroundColor: p.card},
  styles: [
    {types: ['comment', 'prolog', 'cdata', 'doctype'], style: {color: p.ink3, fontStyle: 'italic'}},
    {types: ['punctuation', 'operator', 'entity'], style: {color: p.ink3}},
    {
      types: ['keyword', 'atrule', 'rule', 'important', 'builtin', 'boolean', 'null', 'unit'],
      style: {color: p.key},
    },
    {types: ['string', 'char', 'attr-value', 'regex', 'url', 'inserted'], style: {color: p.str}},
    {types: ['number', 'constant', 'symbol'], style: {color: p.num}},
    {
      types: ['function', 'class-name', 'tag', 'selector', 'property', 'attr-name', 'variable'],
      style: {color: p.ink},
    },
    {types: ['deleted'], style: {color: p.del}},
    {types: ['namespace'], style: {opacity: 0.7}},
  ],
});

const prismLight = codeTheme({
  card: '#f1f1ec', ink: '#322f28', ink2: '#625e53', ink3: '#6f6a5e',
  key: '#1a6670', str: '#4e6b3a', num: '#8a5a12', del: '#a33b52',
});
const prismDark = codeTheme({
  card: '#24231f', ink: '#e9e3d8', ink2: '#aba598', ink3: '#948e80',
  key: '#7fc7ce', str: '#a9c294', num: '#e0b450', del: '#e88b9f',
});

// Use Algolia only when real creds are present; otherwise fall back to the
// credential-free local search so search works in dev / PR previews / any deploy.
const useAlgolia = Boolean(process.env.ALGOLIA_APP_ID && process.env.ALGOLIA_API_KEY);

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'MetaFlux Knowledge Base',
  tagline: 'Integration reference, API surface, and core concepts for the MetaFlux derivatives exchange.',
  favicon: 'img/favicon.svg',

  url: 'https://docs.mtf.exchange',
  baseUrl: '/',

  organizationName: 'mtf-exchange',
  projectName: 'metaflux-knowledges',
  trailingSlash: false,

  // Build-speed: Rspack bundler + SWC loader/minifier + Lightning CSS (Docusaurus 3.6).
  // Requires the @docusaurus/faster package. Cuts cold build time substantially.
  future: {
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
    },
    faster: true,
  },

  // 'warn' not 'throw': the machine-translated zh-Hans locale inevitably has some
  // relative-link / heading-anchor drift (e.g. bare `../bridge` links that don't carry
  // the locale prefix). The English locale builds clean; don't let zh drift block deploys.
  onBrokenLinks: 'warn',
  onBrokenAnchors: 'warn',

  markdown: {
    // Treat .md as CommonMark (no JSX parsing) so JSON/`{type}`/`<T>` snippets don't break the build.
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    localeConfigs: {
      en: {label: 'English', htmlLang: 'en'},
    },
  },

  // SEO: JSON-LD structured data (Organization + WebSite with sitelinks search).
  headTags: [
    {
      tagName: 'script',
      attributes: {type: 'application/ld+json'},
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'MetaFlux',
        url: 'https://mtf.exchange/',
        logo: 'https://docs.mtf.exchange/img/logo-square.svg',
      }),
    },
    {
      tagName: 'script',
      attributes: {type: 'application/ld+json'},
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'MetaFlux Knowledge Base',
        url: 'https://docs.mtf.exchange/',
        description:
          'Integration reference, API surface, and core concepts for the MetaFlux derivatives exchange.',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://docs.mtf.exchange/search?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      }),
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/mtf-exchange/metaflux-knowledges/edit/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
        },
      }),
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    // Local, credential-free search (unless real Algolia creds are provided).
    ...(useAlgolia
      ? []
      : [
          [
            '@easyops-cn/docusaurus-search-local',
            {
              hashed: true,
              indexDocs: true,
              docsRouteBasePath: '/',
              language: ['en', 'zh'],
              highlightSearchTermsOnTargetPage: true,
              explicitSearchResultPath: true,
            },
          ],
        ]),
  ],

  plugins: [
    // Emits /llms.txt + /llms-full.txt so AI coding assistants can consume the API reference.
    [
      '@signalwire/docusaurus-plugin-llms-txt',
      {
        siteTitle: 'MetaFlux Knowledge Base',
        siteDescription: 'Integration reference, API surface, and core concepts for MetaFlux.',
        depth: 2,
        content: {
          enableLlmsFullTxt: true,
        },
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/og.png',
      // Light-first, following the OS — the same default the app resolves to
      // (app.html stamps `theme: 'system'` pre-paint).
      colorMode: {
        defaultMode: 'light',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      mermaid: {
        theme: {light: 'neutral', dark: 'dark'},
        options: {
          themeVariables: {
            // The two voices: teal primary, sage second.
            primaryColor: '#1a6670',
            lineColor: '#5b7449',
            fontFamily: 'Figtree, system-ui, sans-serif',
          },
        },
      },
      // Algolia DocSearch — only active when real creds are in the environment
      // (ALGOLIA_APP_ID / ALGOLIA_API_KEY / ALGOLIA_INDEX_NAME). Apply for the free
      // hosted crawler at https://docsearch.algolia.com/. Otherwise local search is used.
      ...(useAlgolia && {
        algolia: {
          appId: process.env.ALGOLIA_APP_ID,
          apiKey: process.env.ALGOLIA_API_KEY,
          indexName: process.env.ALGOLIA_INDEX_NAME || 'metaflux',
          contextualSearch: true,
          searchPagePath: 'search',
        },
      }),
      navbar: {
        // The brand is the real lockup asset — mark + drawn wordmark — straight
        // from ../metaflux-web/static/brand, in the same two theme cuts the app's
        // BrandLockup swaps between. It is NOT type set in the UI's own faces, and
        // it does NOT follow the accent: the v2 retheme changed the product
        // palette, not the identity, so the wordmark keeps its own flux gradient.
        logo: {
          alt: 'MetaFlux',
          src: 'brand/metaflux-lockup-color-light.svg',
          srcDark: 'brand/metaflux-lockup-color-dark.svg',
          href: '/',
        },
        items: [
          {type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs'},
          {to: '/integration/quickstart', label: 'Quickstart', position: 'left'},
          {to: '/api', label: 'API', position: 'left'},
          {
            type: 'dropdown',
            label: 'SDKs',
            position: 'left',
            items: [
              {to: '/integration/typescript-sdk', label: 'TypeScript SDK'},
              {to: '/integration/rust-sdk', label: 'Rust SDK'},
            ],
          },
          {href: 'https://mtf.exchange/', label: 'Site', position: 'right'},
          {
            href: 'https://github.com/mtf-exchange/metaflux-knowledges',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      // Footer intentionally omitted (removed per request).
      prism: {
        theme: prismLight,
        darkTheme: prismDark,
        additionalLanguages: ['rust', 'bash', 'json', 'typescript', 'solidity'],
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: false,
        },
      },
    }),
};

export default config;
