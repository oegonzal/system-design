import { join } from 'node:path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

/**
 * `tooling/` belongs to no Nx project on purpose — it is repo infrastructure,
 * not shippable code — which means `nx run-many` never reaches it. The
 * `test:tooling` and `typecheck:tooling` scripts, both wired into CI and the
 * pre-commit hook, are what cover it.
 *
 * The cache lives inside `tooling/` so that clearing the workspace-level Nx and
 * Vite caches never invalidates (or is invalidated by) this suite.
 */
export default defineConfig({
  root: __dirname,
  // The review reaches Claude Code through `@sysdesign/llm`, so workspace
  // aliases resolve here the way they do in every package.
  plugins: [nxViteTsPaths()],
  cacheDir: join(__dirname, 'node_modules/.vite'),
  test: {
    watch: false,
    environment: 'node',
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
});
