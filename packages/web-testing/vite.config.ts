/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * No `build` block and no `index.html`, like design-system: `@nx/vite/plugin`
 * then infers only `test` and `typecheck`, and the package is consumed as
 * TypeScript source through its path alias.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/web-testing',

  plugins: [react({ jsxImportSource: '@emotion/react' }), nxViteTsPaths()],

  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/web-testing',
      provider: 'v8',
    },
  },
});
