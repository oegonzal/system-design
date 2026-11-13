/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

import { testDatabaseEnv } from '../../vite.nest';

/**
 * The package's own specs: the guard that keeps every suite off real data.
 * The executor's spec opens one, on the test database the environment names,
 * after the guard; the rest open none — the guard must refuse before one exists.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/db',
  plugins: [nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    env: testDatabaseEnv(),
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
  },
});
