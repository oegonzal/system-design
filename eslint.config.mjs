import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import nxEslintPlugin from '@nx/eslint-plugin';
import eslintReact from '@eslint-react/eslint-plugin';
import playwright from 'eslint-plugin-playwright';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out-tsc/**',
      '**/coverage/**',
      '**/storybook-static/**',
      '**/vite.config.*',
      '**/vitest.config.*',
      '**/next-env.d.ts',
    ],
  },
  {
    plugins: {
      '@nx': nxEslintPlugin,
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          // Two constraint dimensions:
          //   type:*  — the ownership rule: the design system may never reach
          //             into an app, which is what stops it drifting into a
          //             dumping ground for domain components.
          //   scope:* — the runtime rule: browser code may never import the
          //             ORM layer, and node code may never import the design
          //             system. `scope:universal` (contracts, criteria) is the
          //             only vocabulary both sides share.
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:ui', 'type:shared'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:shared'],
            },
            {
              sourceTag: 'type:shared',
              onlyDependOnLibsWithTags: ['type:shared'],
            },
            {
              // Storybook and the e2e suite are the projects that legitimately
              // see both sides.
              sourceTag: 'type:tooling',
              onlyDependOnLibsWithTags: ['*'],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:universal'],
            },
            {
              sourceTag: 'scope:node',
              onlyDependOnLibsWithTags: ['scope:node', 'scope:universal'],
            },
            {
              sourceTag: 'scope:universal',
              onlyDependOnLibsWithTags: ['scope:universal'],
            },
          ],
        },
      ],
    },
  },
  ...compat.config({ extends: ['plugin:@nx/typescript'] }).map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    rules: { ...config.rules },
  })),
  ...compat.config({ extends: ['plugin:@nx/javascript'] }).map((config) => ({
    ...config,
    files: ['**/*.js', '**/*.jsx'],
    rules: { ...config.rules },
  })),
  {
    // Catches the class of bug an e2e suite attracts: an unawaited expect, a
    // conditional assertion, a test left focused.
    ...playwright.configs['flat/recommended'],
    files: ['packages/studio-e2e/**/*.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Assertions live on the page objects, so the rule cannot see them from
      // the spec. It matches called property names exactly — no globs — so the
      // page objects' assertion methods are listed by name.
      'playwright/expect-expect': [
        'warn',
        {
          assertFunctionNames: [
            'expect',
            // canvas.page.ts
            'expectNodeCount',
            'expectNodeHighlighted',
            'expectEvaluationComplete',
            'expectFindingCount',
            'expectScoreTrendIncreasing',
            'expectEdgePill',
            'expectNodeMeta',
            'expectBindingVerdict',
            'expectFlowComplete',
            'expectDimensionScored',
            'expectNoSuggestionsOffered',
            'expectWorkflowVerdict',
            // app-nav.ts
            'expectActiveNav',
            // stories.page.ts
            'expectStoryListed',
            // settings.page.ts
            'expectColorMode',
            'expectAccent',
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/studio-ui/**/*.ts',
      'packages/studio-ui/**/*.tsx',
      'packages/design-system/**/*.ts',
      'packages/design-system/**/*.tsx',
      'packages/storybook/**/*.ts',
      'packages/storybook/**/*.tsx',
    ],
    ...eslintReact.configs.recommended,
  },
];
