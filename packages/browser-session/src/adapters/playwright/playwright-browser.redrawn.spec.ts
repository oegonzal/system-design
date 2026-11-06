import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation, StepAction } from '@sysdesign/contracts';

import { ActionFailed } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * A field the page draws again between the observation and the action — a
 * form's section rerendered, or the page redrawn while the operator was
 * asked, as two live forms did on 2026-11-06 — beside two that cannot be
 * aimed at anew: one drawn again twice over, so two fields share its role
 * and name, and one gone. Run with the `browser` project.
 */
const FORM = `<!doctype html><html><head><title>Apply — details</title></head><body>
  <form>
    <label for="degree">Degree</label><input id="degree" name="degree">
    <input id="city" name="city" aria-label="City">
  </form>
</body></html>`;

const fill = (ref: string, value: string): Extract<StepAction, { kind: 'fill' }> => ({
  kind: 'fill',
  ref,
  value,
  reason: 'the procedure says so',
  expect: null,
  serves: [],
});

const byName = (observation: PageObservation, name: string): ObservedElement => {
  const element = observation.elements.find((e) => e.role === 'textbox' && e.name === name);
  if (element === undefined) throw new Error(`no textbox "${name}" observed`);
  return element;
};

/** The page draws the field again: the element replaced by a fresh one, with the same label. */
const redraw = (id: string, copies = 1) =>
  `(() => { const old = document.getElementById('${id}'); for (let i = 0; i < ${copies}; i++) { const fresh = old.cloneNode(); fresh.id = i === 0 ? '${id}' : '${id}-' + i; old.before(fresh); } old.remove(); })()`;

describe('the Playwright browser and a field the page drew again since it was observed', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    // A short action timeout: an action aimed at a field no longer on the page fails at it.
    browser = new PlaywrightBrowser(specBrowserOptions(profiles, { actionTimeoutMs: 1500 }));
    await browser.open('spec', { headed: false, documents: [] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-2] aims an action at the one field a fresh read names with the listed role and name; two such fields, or none, fail as before', async () => {
    await browser.page.setContent(FORM);
    const first = await browser.observe();
    await browser.page.evaluate(redraw('degree'));
    await browser.act(fill(byName(first, 'Degree').ref, 'Bachelor of Science'));
    expect(await browser.page.locator('#degree').inputValue()).toBe('Bachelor of Science');

    // Drawn again twice over: two fields share the role and name, and neither is guessed at.
    await browser.page.setContent(FORM);
    const second = await browser.observe();
    await browser.page.evaluate(redraw('city', 2));
    await expect(browser.act(fill(byName(second, 'City').ref, 'Long Beach'))).rejects.toThrow(
      ActionFailed,
    );
  });
});
