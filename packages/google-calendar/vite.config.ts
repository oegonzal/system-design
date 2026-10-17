/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig } from '../../vite.nest';

/** One lane: the service reaches no database, and its HTTP surface is specced over fakes. */
export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    root: __dirname,
    reporters: ['default'],
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,mts}'],
  },
});
