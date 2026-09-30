/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Deliberately declares no `build` block and ships no `index.html` — the same
 * arrangement as `design-system/vite.config.ts`: `@nx/vite/plugin` then infers
 * only a `test` target, and the package keeps being consumed as TypeScript
 * source through the path alias.
 *
 * Node environment on purpose. Contracts are pure data shapes and tuples; a
 * DOM would only slow the suite down and imply a dependency that must never
 * exist here.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/contracts',

  plugins: [nxViteTsPaths()],

  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
  },
});
