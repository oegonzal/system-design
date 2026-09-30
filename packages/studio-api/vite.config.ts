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

    // The suites truncate tables between tests, so they get their own
    // database unless the environment (CI) pins one — the harness creates and
    // migrates it on first boot. The quality loop is never reached: the
    // harness binds a fake client, so no URL is set here.
    env: {
      DB_NAME: process.env['DB_NAME'] ?? 'sysdesign_test',
    },

    // These suites are integration-level and share one Postgres. Several
    // reset state by truncating `prompt` (cascading through sessions,
    // revisions and generations), which would wipe a sibling file's rows
    // mid-test if the files ran concurrently.
    fileParallelism: false,

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/studio-api',
      provider: 'v8',
    },
  },
});
