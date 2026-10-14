import { defineConfig } from 'vitest/config';

/**
 * The site's specs run in node: they read data modules and configuration, never
 * a DOM. Nx infers the `test` target from this file; project.json's typecheck
 * (astro check) replaces the tsc target it would infer beside it.
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/website',
  test: {
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
