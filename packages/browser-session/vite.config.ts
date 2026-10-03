/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig, testDatabaseEnv } from '../../vite.nest';

/** The spec that launches a real (headless, bundled) Chromium against `page.setContent` fixtures. */
const BROWSER_SPECS = ['src/adapters/playwright/playwright-browser.spec.ts'];
/** The specs that need Postgres: the ledger adapter and the scripted end-to-end dry run. */
const DB_SPECS = [
  'src/adapters/mikro-orm/*.spec.ts',
  'src/modules/session/session.service.spec.ts',
];

const env = testDatabaseEnv();

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    root: __dirname,
    reporters: ['default'],
    // Three projects: the pure suites run in parallel; the browser suite
    // launches one Chromium at a time; the Postgres suites share one lane.
    projects: [
      {
        extends: true,
        test: {
          name: 'pure',
          globals: true,
          environment: 'node',
          env,
          include: ['src/**/*.{test,spec}.{ts,mts}'],
          exclude: [...BROWSER_SPECS, ...DB_SPECS],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          globals: true,
          environment: 'node',
          env,
          include: BROWSER_SPECS,
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          env,
          include: DB_SPECS,
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
