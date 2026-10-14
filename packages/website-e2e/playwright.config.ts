import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

/**
 * The site as Cloudflare serves it. Locally the suite starts `wrangler dev` over
 * the built dist/ (the website:preview target) on a port of its own and never
 * reuses a server, so it always tests this build under the routing, 404 handling
 * and headers production applies. With WEBSITE_E2E_BASE_URL set it starts nothing
 * and tests that site instead: the deploy workflow's production check, and the
 * runbook's.
 */
const PORT = 4205;
const BASE_URL = process.env['WEBSITE_E2E_BASE_URL'];

/** WCAG 2.2 SC 1.4.10 (Reflow): content works at 320 CSS px, a 1280 px screen at 400% zoom. */
const NARROW_VIEWPORT = { width: 320, height: 640 };

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),

  use: {
    baseURL: BASE_URL ?? `http://127.0.0.1:${PORT}`,
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'on-first-retry',
  },

  webServer:
    BASE_URL === undefined
      ? {
          command: `pnpm exec nx run website:preview --excludeTaskDependencies --port=${PORT}`,
          url: `http://127.0.0.1:${PORT}/`,
          cwd: workspaceRoot,
          reuseExistingServer: false,
          timeout: 120_000,
        }
      : undefined,

  /*
   * Chrome only, as in studio-e2e: the desktop layout, and the narrowest width
   * WCAG asks for. Printing to PDF is a Chromium feature whose result does not
   * depend on the window, so the print spec runs on the desktop project alone.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: NARROW_VIEWPORT },
      testIgnore: /print\.spec\.ts$/,
    },
  ],
});
