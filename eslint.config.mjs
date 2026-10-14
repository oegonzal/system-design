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

/**
 * The unused-binding policy, shared with the packages that own a config of
 * their own (packages/website applies it to `.astro` files, which the ts/js
 * block below never matches). A rest destructure that drops fields
 * (`const { stored, ...document } = row`) is the idiom for a projection; the
 * dropped names are not unused work.
 */
export const unusedBindings = [
  'warn',
  { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.next-dev/**',
      '**/.next-e2e/**',
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
      '@typescript-eslint/no-unused-vars': unusedBindings,
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
    /**
     * The run inspector's layering, enforced rather than described.
     *
     * `model/` is pure: it is specced without a DOM and must stay reachable
     * from a node test, so nothing React-, Emotion-, Next- or network-shaped
     * may enter it. `view/` is presentational and has to render in the
     * catalog, where `@sysdesign/web-kit`'s barrel would drag the Next runtime
     * in; it also must not reach the differ directly, because a delta's
     * encoding is decoded in exactly one place.
     *
     * Only the container may know about the router, the API and the clock, and
     * it is the one file in neither folder.
     */
    files: ['packages/quality-loop-ui/src/features/inspector/model/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'The inspector model is pure; keep React in view/.' },
            { name: 'next/navigation', message: 'The inspector model knows no router.' },
            { name: '@emotion/styled', message: 'The inspector model renders nothing.' },
            {
              name: '@sysdesign/design-system',
              message: 'The inspector model renders nothing.',
            },
            {
              name: '@sysdesign/web-kit',
              message: 'The inspector model fetches nothing and polls nothing.',
            },
          ],
          patterns: [
            {
              group: ['**/api/client', '../../../api/*'],
              message: 'The inspector model takes the wire as an argument; it never reads it.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/quality-loop-ui/src/features/inspector/view/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@sysdesign/web-kit',
              message:
                "The barrel imports next/navigation, which does not exist in the catalog's builder.",
            },
            {
              name: 'jsondiffpatch',
              message: "A delta's encoding is decoded in model/changes.ts and nowhere else.",
            },
          ],
          patterns: [
            {
              group: ['**/api/client', '../../../api/*', '**/model/differ'],
              message: 'A view takes what it shows as props.',
            },
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
