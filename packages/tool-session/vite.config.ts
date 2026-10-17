/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * No `build` block, like nest-kit: `@nx/vite/plugin` infers only `test`, and
 * the package is consumed as TypeScript source through its path alias by the
 * programs that run tool sessions. The Nest surface is specced here over a
 * booted application with the loop, the bus and the operator faked.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/tool-session',
  plugins: [nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
  },
});
