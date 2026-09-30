import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import nxEslintPlugin from '@nx/eslint-plugin';
import eslintReact from '@eslint-react/eslint-plugin';

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
      '**/.next-dev/**',
      '**/out-tsc/**',
      '**/storybook-static/**',
      '**/vite.config.*',
      '**/vitest.config.*',
      '**/next.config.js',
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
      // A rest destructure that drops fields (`const { stored, ...document } = row`)
      // is the idiom for a projection; the dropped names are not unused work.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
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
    files: [
      'packages/studio-ui/**/*.ts',
      'packages/studio-ui/**/*.tsx',
      'packages/design-system/**/*.ts',
      'packages/design-system/**/*.tsx',
      'packages/storybook/**/*.ts',
      'packages/storybook/**/*.tsx',
      'packages/web-kit/**/*.ts',
      'packages/web-kit/**/*.tsx',
      'packages/web-testing/**/*.ts',
      'packages/web-testing/**/*.tsx',
      'packages/quality-loop-ui/**/*.ts',
      'packages/quality-loop-ui/**/*.tsx',
      'packages/govcon-ui/**/*.ts',
      'packages/govcon-ui/**/*.tsx',
    ],
    ...eslintReact.configs.recommended,
  },
];
