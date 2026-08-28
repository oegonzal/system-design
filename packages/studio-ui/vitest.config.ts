/// <reference types='vitest' />
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

/**
 * Deliberately `vitest.config.ts`, not `vite.config.ts`: project.json owns
 * build/serve (they are Next's, run through run-commands), so this file must
 * not tempt `@nx/vite` into inferring build targets. A vitest-named config
 * yields exactly the inferred `test` target and nothing else.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/studio-ui',

  plugins: [
    react({
      // Emotion's JSX runtime + babel plugin: the Vite half of what
      // next.config.js does with compiler.emotion for the app build.
      jsxImportSource: '@emotion/react',
      babel: { plugins: ['@emotion/babel-plugin'] },
    }),
    nxViteTsPaths(),
  ],

  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    // React Flow needs more of a browser than jsdom provides; see the file.
    setupFiles: ['./src/vitest.setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/studio-ui',
      provider: 'v8',
    },
  },
});
