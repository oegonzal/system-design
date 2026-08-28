import { test, type Page } from '@playwright/test';

/** Set by the `e2e-demo` target; see `playwright.config.ts`. */
export const DEMO = !!process.env['DEMO'];

/** How long to hold on a finished step before starting the next one. */
const BEAT_MS = 1200;

/**
 * A named step, with a beat after it when demoing.
 *
 * `slowMo` alone paces individual actions but runs the steps together, so a
 * viewer cannot tell where one finishes and the next begins. The pause is
 * what turns the run into a narrative — and it is a no-op outside demo mode,
 * which is why the normal suite loses nothing.
 *
 * The step name is what the Trace Viewer groups actions under afterwards.
 */
export async function step(page: Page, title: string, body: () => Promise<void>): Promise<void> {
  await test.step(title, body);

  if (DEMO) {
    // A deliberate pause for a human watching, not a wait for the app to
    // settle — every real synchronisation is an assertion inside the step.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(BEAT_MS);
  }
}
