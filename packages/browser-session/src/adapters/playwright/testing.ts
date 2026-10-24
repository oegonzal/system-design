/**
 * Spec support for the browser adapter: the options a spec opens a browser
 * with — Playwright's bundled Chromium and the observe policy the package
 * ships, with whatever the spec shortens — so a spec reads the declared
 * values and never a copy of them.
 */
import { PACKAGE_ROOT } from '../../config';
import { readSessionSettings } from '../../settings';
import type { ObservePolicy } from './observe-policy';
import type { PlaywrightBrowserOptions } from './playwright-browser';

export const specBrowserOptions = (
  profilesDir: string,
  observe: Partial<ObservePolicy> = {},
): PlaywrightBrowserOptions => ({
  profilesDir,
  channel: undefined,
  observe: { ...readSessionSettings(PACKAGE_ROOT).observe, ...observe },
});
