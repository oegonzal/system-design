/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig, testDatabaseEnv } from '../../vite.nest';

/** The specs that need Postgres: the persistence adapter and the HTTP surface. */
const DB_SPECS = ['src/**/persistence/*.spec.ts', 'src/app/http.spec.ts'];

const env = testDatabaseEnv();

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    root: __dirname,
    reporters: ['default'],
    // Two projects: the pure suites run in parallel; the Postgres suites
    // share one database, so they share one lane.
    projects: [
      {
        extends: true,
        test: {
          name: 'pure',
          globals: true,
          environment: 'node',
          env,
          include: ['src/**/*.{test,spec}.{ts,mts}'],
          exclude: DB_SPECS,
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
        },
      },
    ],
  },
});
