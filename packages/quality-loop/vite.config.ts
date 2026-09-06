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
    // temp directory. No database here — the loop's only persistence is the
    // dump — so the suites may run in parallel.
    env: {
      EVAL_DUMP_DIR: join(tmpdir(), 'sysdesign-test-run-dumps'),
    },

    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/quality-loop',
      provider: 'v8',
    },
  },
});
