/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * The package's own specs: the guard that keeps every suite off real data.
 * None of them opens a connection — the guard must refuse before one exists.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/db',
  plugins: [nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
  },
});
