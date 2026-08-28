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
 * Postgres connection details ride through to all three servers. `tilt up`
 * (or the compose file) provides the database itself — the suite never
 * starts one.
 */
const DB_PORT = process.env['DB_PORT'] ?? '5432';

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),

  /* Truncates prompts and stories once, so the suite starts from a known state. */
  globalSetup: require.resolve('./src/support/global-setup'),

  /*
   * The practice loop does two full submit → evaluate rounds on top of a dev
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
   * All three processes, because these tests exercise the real API and the
   * real evaluation worker against a real database rather than stubs.
   * `EVAL_DETERMINISTIC=1` pins the critic to the rule engine alone, so a
   * grade is a pure function of the submitted graph — no model, no network.
   */
  webServer: [
    {
      command: 'pnpm exec nx run studio-api:serve',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 180_000,
      env: { DB_PORT, EVAL_DETERMINISTIC: '1' },
    },
    {
      command: 'pnpm exec nx run eval-worker:serve',
      url: 'http://localhost:3002/health',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 180_000,
      /* A 300ms poll keeps submit → verdict under two seconds in the specs. */
      env: { DB_PORT, EVAL_DETERMINISTIC: '1', EVAL_POLL_INTERVAL_MS: '300' },
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

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
