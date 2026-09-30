/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * No `build` block, like nest-kit: `@nx/vite/plugin` infers only `test`, and
 * the package is consumed as TypeScript source through its path alias.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/studio-testing',
  plugins: [nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/studio-testing',
      provider: 'v8',
    },
  },
});
