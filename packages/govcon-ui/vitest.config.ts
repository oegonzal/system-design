/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Deliberately `vitest.config.ts`, not `vite.config.ts`: project.json owns
 * build/serve through Next, and a vitest-named config yields exactly the
 * inferred `test` target and nothing else.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/govcon-ui',
  plugins: [react({ jsxImportSource: '@emotion/react' }), nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    reporters: ['default'],
  },
});
