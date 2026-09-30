/// <reference types='vitest' />
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from 'vitest/config';

import { nestBuildConfig } from '../../vite.nest';

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    globals: true,
    root: __dirname,
    environment: 'node',

    // Run dumps are always on; `static/runs` means REAL runs, so tests get a
    // temp directory. Runs persist in Postgres too: the HTTP suites truncate
    // `quality_run` between files, so they get their own database unless the
    // environment (CI) pins one, and share one lane like studio-api.
    env: {
      EVAL_DUMP_DIR: join(tmpdir(), 'sysdesign-test-run-dumps'),
      DB_NAME: process.env['DB_NAME'] ?? 'sysdesign_test',
    },
    fileParallelism: false,

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
  },
});
