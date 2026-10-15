import playwright from 'eslint-plugin-playwright';

import workspace, { moduleBoundaries } from '../../eslint.config.mjs';

/**
 * The site suite's lint config: the workspace rules, plus the Playwright
 * recommended set owned here and its one exception to the module boundaries. Flat config does not cascade — ESLint uses the
 * nearest config file — so the workspace config is restated.
 */
const recommended = playwright.configs['flat/recommended'];

export default [
  ...workspace,
  {
    ...recommended,
    files: ['**/*.ts'],
    rules: {
      ...recommended.rules,
      // `expect-expect` matches called names exactly, so an assertion helper
      // is listed by name, under the spec that defines it.
      'playwright/expect-expect': [
        'warn',
        {
          assertFunctionNames: [
            'expect',
            // build-served.spec.ts
            'expectServedAsBuilt',
          ],
        },
      ],
    },
  },
  {
    // The suite compares the built pages with the company and founder data the
    // site declares, and reads dates the way the site formats them: its only
    // imports from the site. An allow entry is a regular expression, so each is
    // anchored and escaped.
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          ...moduleBoundaries,
          allow: [
            '^\\.\\./\\.\\./website/src/data/(company|founder)$',
            '^\\.\\./\\.\\./website/src/lib/dates$',
          ],
        },
      ],
    },
  },
];
