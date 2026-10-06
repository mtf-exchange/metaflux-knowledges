// @ts-check

// Monochrome code: weight and grey steps carry the syntax. Green and red mark
// inserted and deleted lines only, the one place direction means something.
const codeTheme = (p) => ({
  plain: {color: p.ink2, backgroundColor: p.card},
  styles: [
    {types: ['comment', 'prolog', 'cdata', 'doctype'], style: {color: p.ink3, fontStyle: 'italic'}},
    {types: ['punctuation', 'operator', 'entity'], style: {color: p.ink3}},
    {
      types: ['keyword', 'atrule', 'rule', 'important', 'builtin', 'boolean', 'null', 'unit'],
      style: {color: p.ink, fontWeight: 600},
    },
    {types: ['string', 'char', 'attr-value', 'regex', 'url'], style: {color: p.str}},
    {types: ['number', 'constant', 'symbol'], style: {color: p.ink}},
    {
      types: ['function', 'class-name', 'tag', 'selector', 'property', 'attr-name', 'variable'],
      style: {color: p.ink},
    },
    {types: ['inserted'], style: {color: p.ins}},
    {types: ['deleted'], style: {color: p.del}},
    {types: ['namespace'], style: {opacity: 0.7}},
  ],
});

// Code panels stay dark in both colour modes.
const prismCode = codeTheme({
  card: '#17191d', ink: '#ffffff', ink2: '#e8e9eb', ink3: '#9aa1ac', str: '#c3c7ce',
  ins: '#3dd68c', del: '#ff6b70',
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
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

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

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..800&family=Geist+Mono:wght@400;500&display=swap',
  ],

  // SEO: JSON-LD structured data (Organization + WebSite with sitelinks search).
  headTags: [
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
    {
      tagName: 'link',
      attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'},
    },
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
          showLastUpdateTime: false,
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
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      mermaid: {
        theme: {light: 'neutral', dark: 'dark'},
        options: {
          themeVariables: {
            fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
            // Both stock themes paint sequence notes yellow.
            noteBkgColor: '#f4f5f7',
            noteTextColor: '#0b0c0e',
            noteBorderColor: '#9aa1ac',
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
        title: 'MetaFlux Docs',
        // The mono mark draws in currentColor, which an <img> resolves to black; CSS inverts it in dark mode.
        logo: {
          src: 'brand/metaflux-mark-mono.svg',
          href: '/',
        },
        // The tab row. Each tab claims its own paths; Docs takes the rest.
        items: [
          {
            to: '/',
            label: 'Docs',
            activeBaseRegex: '^/(?!api(/|$)|integration/(typescript|rust)-sdk$|changelog(/|$)|search$)',
          },
          {to: '/api', label: 'API', activeBaseRegex: '^/api(/|$)'},
          {
            to: '/integration/typescript-sdk',
            label: 'SDKs',
            activeBaseRegex: '^/integration/(typescript|rust)-sdk$',
          },
          {to: '/changelog', label: 'Changelog', activeBaseRegex: '^/changelog(/|$)'},
        ],
      },
      footer: {
        links: [
          {label: 'Launch app', href: 'https://app.mtf.exchange/'},
          {label: 'mtf.exchange', href: 'https://mtf.exchange/'},
          {label: 'Whitepaper', href: 'https://mtf.exchange/whitepaper.html'},
          {label: 'GitHub', href: 'https://github.com/mtf-exchange/metaflux-knowledges'},
          {label: 'X', href: 'https://x.com/MetaFluxDex'},
          {label: 'Terms', href: 'https://mtf.exchange/terms.html'},
          {label: 'Privacy', href: 'https://mtf.exchange/privacy.html'},
        ],
        copyright: '© 2026 MetaFlux Foundation',
      },
      prism: {
        theme: prismCode,
        darkTheme: prismCode,
        additionalLanguages: ['rust', 'bash', 'json', 'typescript', 'solidity'],
      },
      docs: {
        sidebar: {
          autoCollapseCategories: false,
        },
      },
    }),
};

export default config;
