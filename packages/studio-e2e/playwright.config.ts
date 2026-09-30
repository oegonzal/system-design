import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

/* For CI, you may want to set BASE_URL to the deployed application. */
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * Demo mode: the same tests, paced so a human can follow them.
 *
 * Off by default, because CI wants the suite over in seconds. On, it opens a
 * real browser, slows every action to a readable rhythm, and records both a
 * video and a full trace so the run can be watched again afterwards:
 *
 *     nx run studio-e2e:e2e-demo
 *     npx playwright show-trace <output>/trace.zip
 */
const DEMO = !!process.env['DEMO'];

/**
 * The suite never starts Postgres: the local stack provides the server at
 * the connection defaults `@sysdesign/db` declares, and CI's `DB_*` variables
 * reach the API server and the global setup unchanged. What the suite owns is
 * the *database*: it defaults to its own `sysdesign_test` (created, migrated
 * and seeded by `global-setup.ts`), so an e2e run never truncates the
 * developer's real practice history. CI pins `DB_NAME` explicitly and keeps
 * its ephemeral service database.
 */
const DB_NAME = process.env['DB_NAME'] ?? 'sysdesign_test';

/**
 * The grader is a stub, not the real quality loop: every grade in the suite
 * is a pure function of what was submitted (three nodes score 64), a run
 * completes in 400 ms, and no model or network is involved. The studio API
 * reaches it through the same `QUALITY_LOOP_URL` it would use for the real
 * service, so the API under test is exactly the production wiring.
 */
const QUALITY_LOOP_STUB_PORT = process.env['QUALITY_LOOP_STUB_PORT'] ?? '3103';
const QUALITY_LOOP_URL = `http://127.0.0.1:${QUALITY_LOOP_STUB_PORT}`;

/** The one spec that takes the stub grader down; it must never share a phase with the others. */
const GRADER_DOWN = /grader-down\.spec\.ts$/;
/** The specs that assert the single-column layout; they run only at the narrow width. */
const NARROW = /narrow-viewport\.spec\.ts$/;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),

  /* Truncates prompts and stories once, so the suite starts from a known state. */
  globalSetup: require.resolve('./src/support/global-setup'),

  /*
   * The practice loop does two full submit → grade rounds on top of a dev
   * server's first-hit compile, so the Playwright default of 30s per test is
   * too tight on a cold run.
   */
  timeout: 120_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    headless: !DEMO,

    /**
     * Animations are an actionability hazard: `click()` waits for an element
     * to hold still across two consecutive frames, so an entrance transition
     * is that long of retry per interaction. `reducedMotion` sets the
     * `prefers-reduced-motion` media feature, which the design system's
     * stylesheet honours globally (spinners, shimmers, the async-edge dash
     * animation) — the same mechanism a motion-sensitive user would use, and
     * it cannot leak between parallel workers.
     *
     * The demo run keeps animation, because being watchable is its point.
     *
     * Under `contextOptions`: Playwright 1.59 moved it there, and the
     * top-level spelling is a type error rather than a silently ignored
     * option.
     */
    contextOptions: { reducedMotion: DEMO ? 'no-preference' : 'reduce' },
    launchOptions: { slowMo: DEMO ? 600 : 0 },
    /* Demo runs are meant to be re-watched; normal runs keep the default. */
    video: DEMO ? 'on' : 'off',
    /* Collect trace when retrying the failed test. */
    trace: DEMO ? 'on' : 'on-first-retry',
  },

  /*
   * Three processes: the stub grader, the real API against a real database,
   * and the real UI. Nothing in the studio is mocked — only the service
   * behind its one outbound port.
   */
  webServer: [
    {
      command: `pnpm exec tsx --tsconfig tsconfig.base.json packages/studio-e2e/src/support/quality-loop-stub.ts`,
      url: `${QUALITY_LOOP_URL}/health`,
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 60_000,
      env: { QUALITY_LOOP_STUB_PORT },
    },
    {
      command: 'pnpm exec nx run studio-api:serve',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 180_000,
      env: { DB_NAME, QUALITY_LOOP_URL },
    },
    {
      command: 'pnpm exec nx run studio-ui:serve',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 180_000,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],

  /*
   * Chrome only: every project is Desktop Chrome. `chromium` runs the suite
   * at full width, and `narrow` is the same browser at a width under the
   * dock's breakpoint, for the specs that assert the single-column layout.
   * Both share one stub process and run their files in parallel; a spec that
   * flips the stub's global health switch would race them. `grader-down`
   * therefore runs alone: `dependencies` places it in the phase after every
   * dependency-free project (phases run one after another, and a dependent
   * project is never selected implicitly — CI names it), and one worker keeps
   * its own files serial.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [GRADER_DOWN, NARROW],
    },

    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 700, height: 900 } },
      testMatch: NARROW,
    },

    {
      name: 'grader-down',
      use: { ...devices['Desktop Chrome'] },
      testMatch: GRADER_DOWN,
      dependencies: ['chromium'],
      fullyParallel: false,
      workers: 1,
    },
  ],
});
