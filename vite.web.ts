import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export interface WebTestOptions {
  /** Run before every spec file, relative to the package: DOM shims jsdom lacks. */
  setupFiles?: string[];
}

/**
 * Shared Vitest config for the React packages (the three Next apps,
 * design-system, web-kit, web-testing): jsdom, and Emotion's JSX runtime —
 * the Vite half of what `next.web.js` does with `compiler.emotion` for the
 * app builds (plugin-react v6 is oxc-based; no babel pass). Workspace
 * packages resolve through `nxViteTsPaths`, as TypeScript sources.
 *
 * Deliberately no `build` block: `@nx/vite/plugin` gates its build, serve and
 * preview targets on one, so a package configured here infers exactly `test`
 * (and, for a library, `typecheck`) — the apps' build and serve are Next's,
 * owned by their project.json.
 */
export function webTestConfig(dir: string, name: string, options: WebTestOptions = {}) {
  return defineConfig({
    root: dir,
    cacheDir: `../../node_modules/.vite/packages/${name}`,
    plugins: [react({ jsxImportSource: '@emotion/react' }), nxViteTsPaths()],
    test: {
      watch: false,
      globals: true,
      environment: 'jsdom',
      setupFiles: options.setupFiles ?? [],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      reporters: ['default'],
    },
  });
}
