import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import { ActionFailed } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';

/**
 * Against the Chromium Playwright bundles (no channel), headless, on a
 * throwaway profile: what the adapter reads from a page and how a ref
 * behaves across observations. Run with the `browser` vitest project.
 */
const FORM = `<!doctype html><html><head><title>Apply — step 2</title>
<style>.hp{position:absolute;left:-9999px;top:0}.zero{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head>
<body>
  <h1>Additional questions</h1>
  <form>
    <label for="years">Years of experience with Python</label>
    <input id="years" name="years" type="number" required maxlength="3" aria-describedby="years-help">
    <small id="years-help">Whole years, professional only.</small>
    <label for="auth">Work authorisation</label>
    <select id="auth" name="auth" required><option value="">Choose…</option><option>Yes</option><option>No</option></select>
    <input class="hp" name="website" type="text" autocomplete="off">
    <label><input type="checkbox" name="remote"> Remote only</label>
    <button type="button" tabindex="-1">Hidden helper</button>
    <button type="button" class="zero">Zero size</button>
    <button type="button" disabled>Save</button>
    <button type="button">Next</button>
    <a href="#back">Back</a>
  </form>
</body></html>`;

const NEXT_PAGE = `<!doctype html><html><head><title>Review</title></head><body><button type="button">Submit</button></body></html>`;

/**
 * The two shapes an ARIA combobox comes in, both met in live runs. The first
 * is a search box: a textarea the author gave the combobox role, typed into
 * like any search field. The second is a dropdown built on a div, which pops
 * its list and is never typed into. The role is identical on both.
 */
const COMBOBOXES = `<!doctype html><html><head><title>Search</title></head><body>
  <textarea role="combobox" aria-label="Search the web" aria-controls="suggestions" required></textarea>
  <div id="suggestions"></div>
  <div role="combobox" aria-label="Country" aria-controls="countries" tabindex="0">United States</div>
  <ul id="countries"><li role="option">United States</li><li role="option">Canada</li></ul>
</body></html>`;

const byName = (observation: PageObservation, role: string, name: string): ObservedElement => {
  const element = observation.elements.find((e) => e.role === role && e.name === name);
  if (element === undefined) throw new Error(`no ${role} "${name}" observed`);
  return element;
};

describe('the Playwright browser', () => {
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

  it('[BRW-2] observes the interactive elements with their refs, roles, names, options, DOM facts and hidden traits', async () => {
    await browser.page.setContent(FORM);
    const observation = await browser.observe();
    expect(observation.title).toBe('Apply — step 2');
    expect(observation.omittedElements).toBe(0);
    expect(observation.ariaSnapshot).toContain('[ref=e');
    expect(observation.elements.every((e) => /^e\d+$/.test(e.ref))).toBe(true);
    expect(new Set(observation.elements.map((e) => e.ref)).size).toBe(observation.elements.length);
    expect(observation.elements.some((e) => e.role === 'heading')).toBe(false);

    const years = byName(observation, 'spinbutton', 'Years of experience with Python');
    expect(years).toMatchObject({
      kind: 'fillable',
      inputType: 'number',
      required: true,
      disabled: false,
      visible: true,
      maxLength: 3,
      hiddenTraits: [],
      context: 'Whole years, professional only.',
    });
    const auth = byName(observation, 'combobox', 'Work authorisation');
    expect(auth).toMatchObject({ kind: 'selectable', inputType: 'select', required: true });
    expect(auth.options).toEqual(['Choose…', 'Yes', 'No']);
    expect(byName(observation, 'checkbox', 'Remote only')).toMatchObject({ value: 'unchecked' });
    expect(byName(observation, 'button', 'Save').disabled).toBe(true);
    expect(byName(observation, 'button', 'Hidden helper').hiddenTraits).toEqual([
      'tabindex-negative',
    ]);
    expect(byName(observation, 'button', 'Zero size').hiddenTraits).toContain('zero-size');
    expect(byName(observation, 'link', 'Back').kind).toBe('clickable');

    const website = observation.elements.find((e) =>
      e.hiddenTraits.includes('autocomplete-off-bait'),
    );
    expect(website).toMatchObject({
      role: 'textbox',
      name: 'website',
      inputType: 'text',
      visible: false,
      hiddenTraits: ['offscreen', 'autocomplete-off-bait'],
    });
    // Visible, enabled elements are listed first.
    const firstHidden = observation.elements.findIndex((e) => !e.visible || e.disabled);
    const lastVisible = observation.elements.map((e) => e.visible && !e.disabled).lastIndexOf(true);
    expect(firstHidden === -1 || lastVisible < firstHidden).toBe(true);
  });

  it('[BRW-2] fills and selects through the refs, reads values back, highlights, and screenshots', async () => {
    await browser.page.setContent(FORM);
    const observation = await browser.observe();
    const years = byName(observation, 'spinbutton', 'Years of experience with Python');
    const auth = byName(observation, 'combobox', 'Work authorisation');
    const remote = byName(observation, 'checkbox', 'Remote only');

    await browser.act({ kind: 'fill', ref: years.ref, value: '6', reason: 'cv', expect: null });
    expect(await browser.readValue(years.ref)).toBe('6');
    await browser.act({ kind: 'select', ref: auth.ref, option: 'No', reason: 'cv', expect: null });
    expect(await browser.readValue(auth.ref)).toBe('No');
    await browser.act({ kind: 'click', ref: remote.ref, reason: 'remote', expect: null });
    await browser.highlight(years.ref);
    const again = await browser.observe();
    expect(byName(again, 'spinbutton', 'Years of experience with Python').value).toBe('6');
    expect(byName(again, 'combobox', 'Work authorisation').value).toBe('No');
    expect(byName(again, 'checkbox', 'Remote only').value).toBe('checked');
    expect((await browser.screenshot()).byteLength).toBeGreaterThan(100);
    await browser.act({ kind: 'press', key: 'Tab', reason: 'move on', expect: null });
    await browser.act({
      kind: 'scroll',
      direction: 'down',
      ref: null,
      reason: 'look',
      expect: null,
    });
  });

  it('[BRW-2] refuses a ref that is not in the last observation: a stale ref is a failure, not a guess', async () => {
    await browser.page.setContent(FORM);
    const before = await browser.observe();
    await browser.page.setContent(NEXT_PAGE);
    const after = await browser.observe();
    expect(after.elements.map((e) => e.name)).toEqual(['Submit']);
    const live = new Set(after.elements.map((e) => e.ref));
    const stale = before.elements.find((e) => !live.has(e.ref));
    if (stale === undefined)
      throw new Error('every old ref was re-minted; the fixture needs more elements');
    await expect(
      browser.act({ kind: 'click', ref: stale.ref, reason: 'old', expect: null }),
    ).rejects.toBeInstanceOf(ActionFailed);
    await expect(browser.highlight(stale.ref)).rejects.toThrow(
      'is not an element of the last observation',
    );
    expect(await browser.readValue(stale.ref)).toBeNull();
    // A fresh ref still works, and a failing wait is an ActionFailed too.
    await browser.act({
      kind: 'click',
      ref: after.elements[0]?.ref ?? '',
      reason: 'go',
      expect: null,
    });
    const quick = new PlaywrightBrowser({
      profilesDir: profiles,
      channel: undefined,
      actionTimeoutMs: 300,
    });
    await quick.open('spec-quick', { headed: false });
    try {
      await quick.page.setContent(NEXT_PAGE);
      await quick.observe();
      await expect(
        quick.act({
          kind: 'waitFor',
          until: 'text',
          value: 'never appears',
          reason: 'w',
          expect: null,
        }),
      ).rejects.toBeInstanceOf(ActionFailed);
    } finally {
      await quick.close();
    }
  });

  it('[BRW-2] reads what an element affords from the control beneath it, so a textarea given the combobox role is typed into and a div given it is chosen from', async () => {
    await browser.page.setContent(COMBOBOXES);
    const observation = await browser.observe();

    // The live defect this pins: decided from the role name alone, the search
    // box came out `selectable`, the `limits` validator refused `fill` on it
    // as "cannot be typed into", and every plan the brain wrote was escalated
    // until the session hit its failure rail with the search never run.
    const search = byName(observation, 'combobox', 'Search the web');
    expect(search).toMatchObject({ kind: 'fillable', inputType: 'textarea', options: null });

    // Same role, no control to type into, and a list to choose from.
    const country = byName(observation, 'combobox', 'Country');
    expect(country).toMatchObject({ kind: 'selectable', inputType: null });
    expect(country.options).toEqual(['United States', 'Canada']);

    // Both are still offered: the pre-filter reads the role, which is non-static either way.
    await browser.act({
      kind: 'fill',
      ref: search.ref,
      value: 'playwright aria snapshot',
      reason: 'spec',
      expect: null,
    });
    expect(await browser.readValue(search.ref)).toBe('playwright aria snapshot');
  });
});
