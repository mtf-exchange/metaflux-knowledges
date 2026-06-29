// @ts-check
// Mirrors the curated order/grouping of the former GitBook SUMMARY.md.

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {type: 'doc', id: 'index', label: 'Overview'},

    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['start-here', 'networks', 'security', 'versioning'],
    },

    {type: 'doc', id: 'concepts/consensus', label: 'Consensus'},

    {
      type: 'category',
      label: 'Products',
      link: {type: 'doc', id: 'products/index'},
      items: [
        'products/perpetuals',
        'products/spot',
        'products/spot-margin',
        'products/options',
        'products/cds',
      ],
    },

    {
      type: 'category',
      label: 'Concepts',
      link: {type: 'doc', id: 'concepts/index'},
      items: [
        {
          type: 'category',
          label: 'Trading',
          items: [
            'concepts/order-types',
            'concepts/fba',
            'concepts/rfq',
            'concepts/fees',
            'concepts/fee-schedule',
            'concepts/funding-rates',
            'concepts/oracle-prices',
            'concepts/mark-prices',
          ],
        },
        {
          type: 'category',
          label: 'Margin & risk',
          items: [
            'concepts/margin-modes',
            'concepts/hedge-mode',
            'concepts/portfolio-margin',
            'concepts/tiered-liquidation',
            'concepts/adl',
          ],
        },
        {
          type: 'category',
          label: 'Account & access',
          items: [
            'concepts/sub-accounts',
            'concepts/agent-wallets',
            'concepts/multi-sig',
            'concepts/staking',
            'concepts/vaults',
          ],
        },
        'concepts/earn',
        'concepts/tokenomics',
        'concepts/glossary',
      ],
    },

    {type: 'doc', id: 'bridge/index', label: 'Bridge'},

    {
      type: 'category',
      label: 'Improvement proposals',
      link: {type: 'doc', id: 'mip/index'},
      items: ['mip/mip-1', 'mip/mip-2', 'mip/mip-3', 'mip/mip-4', 'mip/mip-5', 'mip/mip-6'],
    },

    {
      type: 'category',
      label: 'API',
      link: {type: 'doc', id: 'api/index'},
      items: [
        {
          type: 'category',
          label: 'REST',
          items: [
            'api/rest/exchange',
            {
              type: 'category',
              label: 'info',
              link: {type: 'doc', id: 'api/rest/info'},
              items: ['api/rest/info/perpetuals', 'api/rest/info/spot'],
            },
            'api/rest/faucet',
          ],
        },
        {
          type: 'category',
          label: 'WebSocket',
          link: {type: 'doc', id: 'api/ws/index'},
          items: ['api/ws/subscriptions'],
        },
        {
          type: 'category',
          label: 'Reference',
          items: ['api/errors', 'api/rate-limits'],
        },
      ],
    },

    {
      type: 'category',
      label: 'EVM',
      link: {type: 'doc', id: 'evm/index'},
      items: [
        'evm/execution-model',
        'evm/interacting-with-core',
        'evm/core-evm-transfers',
        'evm/interaction-timings',
      ],
    },

    {
      type: 'category',
      label: 'Integration',
      link: {type: 'doc', id: 'integration/index'},
      items: [
        'integration/quickstart',
        'integration/signing',
        'integration/typed-data-signing',
        'integration/agent-wallets-howto',
        'integration/idempotency',
        'integration/error-handling',
        'integration/risk-watcher',
        'integration/migrating-from-hl',
        {
          type: 'category',
          label: 'SDKs',
          items: ['integration/typescript-sdk', 'integration/rust-sdk'],
        },
      ],
    },
  ],
};

export default sidebars;
