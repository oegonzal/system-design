/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig, testDatabaseEnv } from '../../vite.nest';

/** The specs that need Postgres — the persistence adapter and the HTTP surface — once they land. */
const DB_SPECS = ['src/**/persistence/mikro-orm-*.spec.ts', 'src/app/http.spec.ts'];

const env = testDatabaseEnv();

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    root: __dirname,
    reporters: ['default'],
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
