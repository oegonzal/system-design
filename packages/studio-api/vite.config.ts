/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig, testDatabaseEnv } from '../../vite.nest';

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    globals: true,
    root: __dirname,
    environment: 'node',

    // The suites truncate tables between tests, so they run against the
    // test database (or a lane of it the environment names) — the harness
    // creates and migrates it on first boot, and refuses any other. The
    // quality loop is never reached: the harness binds a fake client, so no
    // URL is set here.
    env: testDatabaseEnv(),

    // These suites are integration-level and share one Postgres. Several
    // reset state by truncating `prompt` (cascading through sessions,
    // revisions and generations), which would wipe a sibling file's rows
    // mid-test if the files ran concurrently.
    fileParallelism: false,

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
  },
});
