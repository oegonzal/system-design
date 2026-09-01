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

    // Determinism specs ([GEN-2]) must hold on machines where a developer
    // has an ANTHROPIC_API_KEY exported — enrichment stays off under test.
    // Run dumps are always on, so tests also get a temp directory: `static/runs`
    // means REAL runs.
    env: {
      EVAL_DETERMINISTIC: '1',
      EVAL_DUMP_DIR: join(tmpdir(), 'sysdesign-test-run-dumps'),
    },

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
