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

    // The persistence specs run against a real Postgres, so they get their own
    // database unless the environment (CI) pins one, and share one lane. The
    // SAM.gov key is blanked because Nx loads a developer's `.env` for local
    // tasks and no suite may ever spend a real request.
    env: {
      DB_NAME: process.env['DB_NAME'] ?? 'sysdesign_test',
      SAM_GOV_API_KEY: '',
    },
    fileParallelism: false,

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/govcon',
      provider: 'v8',
    },
  },
});
