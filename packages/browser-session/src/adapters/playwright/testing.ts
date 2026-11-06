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

/** An input a page hides inside the box it draws: no size, no paint, no pointer — the tree gives it no ref. */
export const HIDDEN_INPUT =
  'position:absolute;width:0;height:0;margin:0;opacity:0;pointer-events:none';

/** The box a page draws for a choice whose own input it hides. */
export const DRAWN_BOX =
  'display:inline-block;position:relative;width:16px;height:16px;border:1px solid #333';
