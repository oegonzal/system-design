import { join } from 'node:path';
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
  cacheDir: join(__dirname, 'node_modules/.vite'),
  test: {
    watch: false,
    environment: 'node',
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
});
