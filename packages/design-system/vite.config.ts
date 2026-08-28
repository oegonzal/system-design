/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Deliberately declares no `build` block and ships no `index.html`.
 *
 * `@nx/vite/plugin` gates its build/serve/preview targets on `isBuildable`
 * (`build.lib || build.rolldownOptions.input || index.html`). With none of those
 * present it infers exactly two targets — `test` and `typecheck` — which is all
 * this package wants: it is consumed as TypeScript source through the path alias
 * and inlined by whichever app imports it, same as `@sysdesign/contracts`.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/design-system',

  plugins: [
    react({
      // The css prop and styled components compile through Emotion's JSX
      // runtime (plugin-react v6 is oxc-based; no babel pass).
      jsxImportSource: '@emotion/react',
    }),
    nxViteTsPaths(),
  ],

  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    // jsdom lacks matchMedia, ResizeObserver and scrollIntoView; see the file
    // for why the matchMedia stub is controllable rather than a constant.
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/design-system',
      provider: 'v8',
    },
  },
});
