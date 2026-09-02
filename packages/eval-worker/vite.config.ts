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

    // Run dumps are always on, so a test run would otherwise fill `static/runs`
    // with fixtures. That tree means REAL runs; tests get a temp directory.
    // The poller suite truncates tables, so it gets its own database unless
    // the environment (CI) pins one — `ensureDatabase()` creates/migrates it.
    env: {
      EVAL_DUMP_DIR: join(tmpdir(), 'sysdesign-test-run-dumps'),
      DB_NAME: process.env['DB_NAME'] ?? 'sysdesign_test',
    },

    // The poller integration suite shares the one Postgres with everything
    // else; engine unit tests are pure but cheap, so a single lane is fine.
    fileParallelism: false,

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/eval-worker',
      provider: 'v8',
    },
  },
});
