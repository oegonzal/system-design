import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import { PlaywrightBrowser } from './playwright-browser';

/**
 * What a person can answer with, against the Chromium Playwright bundles,
 * headless. The consent dropdown is drawn as a live form drew it on
 * 2026-10-11 — a required select resting on a disabled "Select an option" —
 * beside the HTML standard's own placeholder label option, a disabled
 * group of options, a radio question with one answer withdrawn, and a
 * listbox with one option marked unavailable. Run with the `browser` project.
 */
const CHOICES = `<!doctype html><html><head><title>Apply — additional questions</title></head><body>
  <form>
    <label for="consent">Do you consent to texts from the recruiting team?*</label>
    <select id="consent" required>
      <option disabled selected>Select an option</option><option>Yes</option><option>No</option>
    </select>
    <label for="state">State*</label>
    <select id="state" required><option value="">Choose…</option><option>Alaska</option><option>California</option></select>
    <label for="plan">Plan</label>
    <select id="plan">
      <option>Basic</option><optgroup label="Retired" disabled><option>Legacy</option></optgroup><option>Pro</option>
    </select>
    <fieldset role="radiogroup">
      <legend>Preferred shift</legend>
      <label><input type="radio" name="shift"> Day</label>
      <label><input type="radio" name="shift" disabled> Night</label>
      <label><input type="radio" name="shift"> Either</label>
    </fieldset>
    <label id="size-label">Team size</label>
    <div role="listbox" aria-labelledby="size-label" tabindex="0">
      <div role="option" aria-selected="false">Small</div>
      <div role="option" aria-selected="false" aria-disabled="true">Medium</div>
      <div role="option" aria-selected="false">Large</div>
    </div>
  </form>
</body></html>`;

const named = (observation: PageObservation, name: string): ObservedElement => {
  const element = observation.elements.find((candidate) => candidate.name.startsWith(name));
  if (element === undefined) throw new Error(`${name} was not observed`);
  return element;
};

describe('the Playwright browser, on what a person can answer with', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    browser = new PlaywrightBrowser({ profilesDir: profiles, channel: undefined });
    await browser.open('spec', { headed: false });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-2] offers no option the page disables nor a required select’s placeholder, and reads a select resting on either as holding nothing', async () => {
    await browser.page.setContent(CHOICES);
    const observation = await browser.observe();
    expect(named(observation, 'Do you consent')).toMatchObject({
      options: ['Yes', 'No'],
      value: null,
    });
    expect(named(observation, 'State')).toMatchObject({
      options: ['Alaska', 'California'],
      value: null,
    });
    // An optional select's first option is an answer like any other.
    expect(named(observation, 'Plan')).toMatchObject({ options: ['Basic', 'Pro'], value: 'Basic' });
    expect(named(observation, 'Preferred shift').options).toEqual(['Day', 'Either']);
    expect(named(observation, 'Team size').options).toEqual(['Small', 'Large']);
  });

  it('[BRW-2] reads back nothing from a select left on its placeholder, and the answer once one is chosen', async () => {
    await browser.page.setContent(CHOICES);
    const consent = named(await browser.observe(), 'Do you consent');
    expect(await browser.readValue(consent.ref)).toBeNull();
    await browser.act({
      kind: 'select',
      ref: consent.ref,
      option: 'Yes',
      reason: 'the operator agreed',
      expect: null,
      serves: [],
    });
    const after = named(await browser.observe(), 'Do you consent');
    expect(after.value).toBe('Yes');
    expect(await browser.readValue(after.ref)).toBe('Yes');
  });
});
