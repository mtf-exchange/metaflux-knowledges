// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

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
    locales: ['en', 'zh-Hans', 'ar', 'fr', 'ru', 'es'],
    localeConfigs: {
      en: {label: 'English', htmlLang: 'en'},
      'zh-Hans': {label: '简体中文', htmlLang: 'zh-Hans'},
      ar: {label: 'العربية', htmlLang: 'ar', direction: 'rtl'},
      fr: {label: 'Français', htmlLang: 'fr'},
      ru: {label: 'Русский', htmlLang: 'ru'},
      es: {label: 'Español', htmlLang: 'es'},
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
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      mermaid: {
        theme: {light: 'neutral', dark: 'dark'},
        options: {
          themeVariables: {
            primaryColor: '#5BCEFA',
            lineColor: '#F5A9B8',
            fontFamily: 'Geist, system-ui, sans-serif',
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
        // Brand is the two-tone "Meta" + serif-italic-pink "Flux" wordmark (see custom.css).
        items: [
          {
            type: 'html',
            position: 'left',
            value:
              '<a class="mtf-brand" href="/" aria-label="MetaFlux"><img class="mtf-brand-mark" src="/img/logo.svg" alt="" /><span class="mtf-word"><span class="b-meta">Meta</span><span class="b-flux">Flux</span></span></a>',
          },
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
          {type: 'localeDropdown', position: 'right'},
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
        theme: prismThemes.github,
        darkTheme: prismThemes.vsDark,
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
