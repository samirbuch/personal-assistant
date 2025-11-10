import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const main_template_jira_scripts = () => {
  if (process.env.ORG_NAME === 'ApplebaumIan'){
    return [    'https://temple-cis-projects-in-cs.atlassian.net/s/d41d8cd98f00b204e9800998ecf8427e-T/azc3hx/b/8/c95134bc67d3a521bb3f4331beb9b804/_/download/batch/com.atlassian.jira.collector.plugin.jira-issue-collector-plugin:issuecollector/com.atlassian.jira.collector.plugin.jira-issue-collector-plugin:issuecollector.js?locale=en-US&collectorId=50af7ec2',
      'https://temple-cis-projects-in-cs.atlassian.net/s/d41d8cd98f00b204e9800998ecf8427e-T/azc3hx/b/8/c95134bc67d3a521bb3f4331beb9b804/_/download/batch/com.atlassian.jira.collector.plugin.jira-issue-collector-plugin:issuecollector/com.atlassian.jira.collector.plugin.jira-issue-collector-plugin:issuecollector.js?locale=en-US&collectorId=160e88a6',]
  } else {
    return []
  }
}

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * The URL or reference to your projects logo!
 */
const logo = 'https://upload.wikimedia.org/wikipedia/commons/1/17/Temple_T_logo.svg';

// Fallback value if PROJECT_NAME is not defined:
const rawProjectName = process.env.PROJECT_NAME || 'personal-assistant';

// Transform PROJECT_NAME (or fallback) to a title-like string:
const title = rawProjectName
  .replace(/-/g, ' ')
  .split(' ')
  .map(word => {
    // Make sure the word has at least one character
    return word.length > 0
      ? word[0].toUpperCase() + word.substring(1)
      : '';
  })
  .join(' ');

const baseUrl = process.env.PROJECT_NAME || "personal-assistant";
const orgName = process.env.ORG_NAME || 'samirbuch';

const config: Config = {
  title: title,
  tagline: 'Who needs Jarvis?',
  favicon: 'img/favicon.ico',

  markdown: {
    mermaid: true
  },
  themes: [
    "@docusaurus/theme-live-codeblock",
    "@docusaurus/theme-mermaid"
  ],

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: `https://${orgName}.github.io/`,
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: `/${baseUrl}/`,
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: orgName, // Usually your GitHub org/user name.
  projectName: process.env.PROJECT_NAME || 'personal-assistant', // Usually your repo name.

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          showLastUpdateAuthor: true,
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          path: 'docs',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            `https://github.com/${orgName}/${process.env.PROJECT_NAME || 'personal-assistant'}/edit/main/docs/`,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
    [
      'redocusaurus',
      {
        // Plugin Options for loading OpenAPI files
        specs: [
          {
            id: 'using-single-yaml',
            spec: 'static/openapi.yml.yaml',
            route: '/api/',
          },
        ],
        // Theme Options for modifying how redoc renders them
        theme: {
          // Change with your site colors
          customCss: './src/css/custom.css',
        },
      },
    ] as any,
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    ...(process.env.NODE_ENV === 'development' ? {
      announcementBar: {
        id: 'dev_mode',
        content:
          'You are currently working on a local development version of your docs. This is <b>NOT</b> the live site.',
        backgroundColor: '#ffca00',
        textColor: '#091E42',
        isCloseable: false,
      }
    } : {}),
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: title,
      logo: {
        alt: 'My Site Logo',
        src: logo,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        // { to: '/blog', label: 'Blog', position: 'left' },
        {
          href: `https://github.com/${orgName}/${process.env.PROJECT_NAME || 'personal-assistant'}`,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      logo: {
        alt: 'My Site Logo',
        src: logo,
      },
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Documentation',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: `https://github.com/${orgName}/${process.env.PROJECT_NAME || 'personal-assistant'}`,
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} ${title}, Inc. Built with Docusaurus.`,
    },
    imageZoom: {
      // CSS selector to apply the plugin to, defaults to '.markdown img'
      selector: '.markdown img',
      // Optional medium-zoom options
      // see: https://www.npmjs.com/package/medium-zoom#options
      options: {
        margin: 24,
        zIndex: 100,
        background: 'white',
        // scrollOffset: 10,
        // container: '#zoom-container',
        // template: '#zoom-template',
      },
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,

  plugins: [
    [
      "docusaurus2-dotenv-2",
      {
        systemvars: true,
      },
    ],
    'plugin-image-zoom',
    ...(process.env.ORG_NAME !== 'ApplebaumIan' ? [[
      'docusaurus-plugin-remote-content',
      {
        name: 'open-source-usage',
        sourceBaseUrl: 'https://applebaumian.github.io/tu-cis-4398-docs-template/',
        outDir: 'tutorial',
        documents: ['open-source-usage.mdx'],
      },
    ]] : [])
  ],

  scripts: [
    'https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js',
    ...main_template_jira_scripts()
  ],
};

export default config;
