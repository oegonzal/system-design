/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

import { testDatabaseEnv } from '../../vite.nest';

/**
 * No `build` block, like notifications-client: `@nx/vite/plugin` infers only
 * `test`, and the package is consumed as TypeScript source through its path
 * alias. The specs that need the live stores — the Postgres store and the
 * Qdrant index — run in their own lane, one file at a time; the Qdrant filter's
 * spec needs neither and runs with the pure ones.
 */
const STORE_SPECS = [
  'src/adapters/mikro-orm/**/*.spec.ts',
  'src/adapters/qdrant/qdrant-vector-index.spec.ts',
];

const env = testDatabaseEnv('agentic_memory');

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/agentic-memory',
  plugins: [nxViteTsPaths()],
  test: {
    root: __dirname,
    reporters: ['default'],
    projects: [
      {
        extends: true,
        test: {
          name: 'pure',
          watch: false,
          globals: true,
          environment: 'node',
          env,
          include: ['src/**/*.{test,spec}.ts'],
          exclude: STORE_SPECS,
        },
      },
      {
        extends: true,
        test: {
          name: 'stores',
          watch: false,
          globals: true,
          environment: 'node',
          env,
          include: STORE_SPECS,
          fileParallelism: false,
        },
      },
    ],
  },
});
