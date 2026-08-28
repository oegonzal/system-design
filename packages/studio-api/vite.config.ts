/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig } from '../../vite.nest';

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    globals: true,
    root: __dirname,
    environment: 'node',

    // These suites are integration-level and share one Postgres. Several
    // reset state by truncating `prompt` (cascading through sessions,
    // revisions, evaluations and jobs), which would wipe a sibling file's
    // rows mid-test if the files ran concurrently.
    fileParallelism: false,

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/studio-api',
      provider: 'v8',
    },
  },
});
