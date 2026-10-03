/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig } from '../../vite.nest';

/**
 * One CJS bundle at `dist/main.js`, like the Nest apps, with `pdf-parse` kept
 * as a runtime require: it is CJS-only and locates its worker beside its own
 * installed file, which an inlined copy could not. One pure vitest project —
 * nothing here touches Postgres or the network; the specs use the in-repo
 * fakes.
 */
export default defineConfig({
  root: __dirname,
  ...nestBuildConfig({ externals: ['pdf-parse'] }),
  test: {
    root: __dirname,
    name: 'pure',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
  },
});
