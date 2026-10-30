import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  observationFingerprint,
  OPTIONS_BOUND,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';

import { ActionFailed } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

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
 * A dialog that scrolls inside a page that does not — the shape of an
 * application form over a locked document, measured live 2026-10-07. Its
 * footer sits past the fold of its own scroll box, one select offers more
 * options than an observation keeps, one field is marked invalid, and one
 * input is parked off the page where no scrolling could show it.
 */
const SCROLLING_DIALOG = `<!doctype html><html style="height:100%;overflow:hidden"><head><title>Apply — contact</title>
<style>.hp{position:absolute;left:-9999px;top:0}</style></head>
<body style="height:100%;overflow:hidden;margin:0">
  <main style="height:100%">results behind the dialog</main>
  <div role="dialog" aria-modal="true" aria-label="Apply to Acme" style="position:fixed;top:20px;left:100px;width:600px;height:400px;background:#fff">
    <div id="content" style="height:360px;overflow:auto">
      <label>Email*<select id="email" required><option>a@example.test</option><option>b@example.test</option></select></label>
      <label>Country code*<select id="code" required></select></label>
      <label>Phone*<input id="phone" type="tel" required aria-invalid="true" value="not a number"></label>
      <div style="height:1200px">the rest of the form</div>
      <input class="hp" name="website" type="text" autocomplete="off">
      <footer><button type="button">Submit application</button></footer>
    </div>
  </div>
  <script>
    const code = document.getElementById('code');
    for (let i = 1; i <= 310; i += 1) {
      const option = document.createElement('option');
      option.textContent = 'Country ' + i + ' (+' + i + ')';
      code.appendChild(option);
    }
  </script>
</body></html>`;

/**
 * The shapes CSS clips differently from the DOM tree: a fixed bar inside a
 * clipped card is not clipped by it, an absolutely positioned popover escapes
 * a clipped card its containing block sits above, an inline box clips
 * nothing, and a scroller inside a clipped box reaches only what the clip
 * shows of it. One field declares a grammar error.
 */
const CLIPPING_PAGE = `<!doctype html><html><head><title>Clips</title></head><body style="margin:0">
  <div style="height:100px;overflow:hidden;position:relative">
    <div style="position:fixed;bottom:0;left:0;right:0;height:40px"><button type="button">Fixed bar</button></div>
  </div>
  <section style="position:relative">
    <div style="height:60px;overflow:hidden">
      <div style="position:absolute;top:200px;left:0"><button type="button">Escaping popover</button></div>
    </div>
  </section>
  <p><span style="overflow:hidden;display:inline"><a href="#x">Inline link</a></span></p>
  <div style="height:200px;overflow:hidden">
    <div id="inner" style="height:1000px;overflow:auto">
      <div style="height:1050px"></div>
      <button type="button">Beyond the clip</button>
    </div>
  </div>
  <label>Summary<textarea aria-invalid="grammar">ok</textarea></label>
</body></html>`;

/**
 * The two live shapes of 2026-10-07: a results page whose links carry their
 * words in child paragraphs, and whose search control is a button with an
 * icon and a hidden-to-the-tree span; and a modal application dialog open
 * over that page, holding its fields and a Next button.
 */
const DIALOG_PAGE = `<!doctype html><html><head><title>Jobs — apply</title></head><body>
  <header>
    <button id="search"><svg width="10" height="10"></svg><span aria-hidden="true">Describe the job you want</span></button>
    <a href="/jobs/123"><div><p>Senior Engineer</p><p>Acme</p></div></a>
    <a href="/jobs/124"><div><p>Staff Engineer</p><p>Globex</p></div></a>
  </header>
  <main><button>Easy Apply</button></main>
  <div role="dialog" aria-modal="true" aria-label="Apply to Acme">
    <h2>Contact info</h2>
    <label>First name*<input required value="Oscar"></label>
    <label>Phone<input type="tel"></label>
    <button>Next</button>
  </div>
  <div role="dialog" aria-label="Cookies">
    <button>Accept cookies</button>
  </div>
</body></html>`;

/** A page whose control arrives while it is being read: what a read taken too early misses. */
const LATE_PAGE = `<!doctype html><html><head><title>Landing</title></head><body>
  <header id="banner"><button>Menu</button></header>
  <script>
    setTimeout(() => {
      const input = document.createElement('input');
      input.placeholder = 'Describe the job you want';
      document.getElementById('banner').appendChild(input);
    }, 120);
  </script>
</body></html>`;

/** A results page whose chrome renders at once and whose main fills a moment later: two early reads agree on the chrome alone. */
const LATE_MAIN = `<!doctype html><html><head><title>Results</title></head><body>
  <header><button>Menu</button></header>
  <main id="results"></main>
  <script>
    setTimeout(() => {
      const link = document.createElement('a');
      link.href = '/jobs/1';
      link.textContent = 'Open result';
      document.getElementById('results').appendChild(link);
    }, 120);
  </script>
</body></html>`;

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
    browser = new PlaywrightBrowser(specBrowserOptions(profiles));
    await browser.open('spec', { headed: false, documents: [] });
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
    // "Choose…" is the required select's placeholder label option: choosing it is choosing nothing.
    expect(auth.options).toEqual(['Yes', 'No']);
    expect(auth.value).toBeNull();
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

    await browser.act({
      kind: 'fill',
      ref: years.ref,
      value: '6',
      reason: 'cv',
      expect: null,
      serves: [],
    });
    expect(await browser.readValue(years.ref)).toBe('6');
    await browser.act({
      kind: 'select',
      ref: auth.ref,
      option: 'No',
      reason: 'cv',
      expect: null,
      serves: [],
    });
    expect(await browser.readValue(auth.ref)).toBe('No');
    await browser.act({
      kind: 'click',
      ref: remote.ref,
      reason: 'remote',
      expect: null,
      serves: [],
    });
    await browser.highlight(years.ref);
    const again = await browser.observe();
    expect(byName(again, 'spinbutton', 'Years of experience with Python').value).toBe('6');
    expect(byName(again, 'combobox', 'Work authorisation').value).toBe('No');
    expect(byName(again, 'checkbox', 'Remote only').value).toBe('checked');
    expect((await browser.screenshot(null)).byteLength).toBeGreaterThan(100);
    await browser.act({ kind: 'press', key: 'Tab', reason: 'move on', expect: null, serves: [] });
    await browser.act({
      kind: 'scroll',
      direction: 'down',
      ref: null,
      reason: 'look',
      expect: null,
      serves: [],
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
      browser.act({ kind: 'click', ref: stale.ref, reason: 'old', expect: null, serves: [] }),
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
      serves: [],
    });
    const quick = new PlaywrightBrowser(specBrowserOptions(profiles, { actionTimeoutMs: 300 }));
    await quick.open('spec-quick', { headed: false, documents: [] });
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
          serves: [],
        }),
      ).rejects.toBeInstanceOf(ActionFailed);
    } finally {
      await quick.close();
    }
  });

  it('[BRW-2] names the open modal dialog, lists what is inside it first, and reads the words a person sees on an element the tree gave no name', async () => {
    await browser.page.setContent(DIALOG_PAGE);
    const observation = await browser.observe();
    // The modal dialog is the scope in front; the non-modal one is noted and binds nothing.
    expect(observation.activeScope).toEqual({ role: 'dialog', name: 'Apply to Acme' });
    expect(observation.snapshotRung).toBe('full');
    const first = byName(observation, 'textbox', 'First name*');
    expect(first.scope).toEqual({ role: 'dialog', name: 'Apply to Acme', modal: true });
    expect(byName(observation, 'button', 'Accept cookies').scope).toEqual({
      role: 'dialog',
      name: 'Cookies',
      modal: false,
    });
    expect(byName(observation, 'button', 'Easy Apply').scope).toBeNull();
    // Inside the dialog first, whatever the document order.
    expect(observation.elements.slice(0, 3).map((e) => e.name)).toEqual([
      'First name*',
      'Phone',
      'Next',
    ]);
    // An unnamed link carries its words; an unnamed button carries what the DOM renders.
    const links = observation.elements.filter((e) => e.role === 'link');
    expect(links.map((e) => [e.name, e.text])).toEqual([
      ['', 'Senior Engineer Acme'],
      ['', 'Staff Engineer Globex'],
    ]);
    // The tree gave the search button no name, so its id stands in and its rendered words travel beside it.
    expect(byName(observation, 'button', 'search').text).toBe('Describe the job you want');
    // A named element carries no text of its own.
    expect(byName(observation, 'button', 'Next').text).toBeNull();
  });

  it('[BRW-2] holds offscreen to what no scrolling could show: a footer past the fold of a dialog that scrolls is reachable, a field scrolled above it stays so, an input parked off the page is not, and a long select is counted past the bound', async () => {
    await browser.page.setContent(SCROLLING_DIALOG);
    const before = await browser.observe();
    expect(before.activeScope).toEqual({ role: 'dialog', name: 'Apply to Acme' });
    expect(byName(before, 'button', 'Submit application')).toMatchObject({
      visible: true,
      hiddenTraits: [],
    });
    expect(byName(before, 'textbox', 'website')).toMatchObject({
      visible: false,
      hiddenTraits: ['offscreen', 'autocomplete-off-bait'],
    });
    const code = byName(before, 'combobox', 'Country code*');
    expect(code.options).toHaveLength(OPTIONS_BOUND.target);
    expect(code.optionsOmitted).toBe(10);
    expect(byName(before, 'textbox', 'Phone*')).toMatchObject({
      invalid: true,
      value: 'not a number',
    });
    expect(byName(before, 'combobox', 'Email*').invalid).toBe(false);

    await browser.page.evaluate(() => {
      const content = document.getElementById('content');
      if (content !== null) content.scrollTop = 1400;
    });
    const after = await browser.observe();
    expect(byName(after, 'combobox', 'Email*')).toMatchObject({ visible: true, hiddenTraits: [] });
    expect(byName(after, 'button', 'Submit application')).toMatchObject({
      visible: true,
      hiddenTraits: [],
    });
    // A scroll of the dialog is not a page that changed.
    expect(observationFingerprint(after)).toBe(observationFingerprint(before));
  });

  it('[BRW-2] clips along containing blocks, as CSS does: a fixed bar or an escaping popover inside a clipped card is reachable, an inline box clips nothing, and what a scroller shows past an outer clip is not', async () => {
    await browser.page.setContent(CLIPPING_PAGE);
    const observation = await browser.observe();
    for (const name of ['Fixed bar', 'Escaping popover']) {
      expect(byName(observation, 'button', name)).toMatchObject({
        visible: true,
        hiddenTraits: [],
      });
    }
    expect(byName(observation, 'link', 'Inline link')).toMatchObject({
      visible: true,
      hiddenTraits: [],
    });
    expect(byName(observation, 'button', 'Beyond the clip')).toMatchObject({
      visible: false,
      hiddenTraits: ['offscreen'],
    });
    // Any invalid state the page declares counts, not only `true`.
    expect(byName(observation, 'textbox', 'Summary').invalid).toBe(true);
  });

  it('[BRW-2] reports a page only once two reads agree, so a control that renders a moment after the document is observed', async () => {
    // Measured live on 2026-10-07: thirteen observations in a row, each a
    // second after its own reload, reported a landing page without the search
    // control the screenshot taken moments later shows.
    const patient = new PlaywrightBrowser(specBrowserOptions(profiles, { settleRetryMs: 150 }));
    await patient.open('spec-patient', { headed: false, documents: [] });
    try {
      await patient.page.setContent(LATE_PAGE);
      const observation = await patient.observe();
      expect(observation.elements.map((e) => e.name)).toEqual([
        'Menu',
        'Describe the job you want',
      ]);
      // It took more than one read to see the control, the reads settled, and the time is on the record.
      expect(observation.reading.reads).toBeGreaterThanOrEqual(2);
      expect(observation.reading.settled).toBe(true);
      expect(observation.reading.durationMs).toBeGreaterThan(0);
    } finally {
      await patient.close();
    }
  });

  it('[BRW-2] reads a page again while its main landmark holds nothing, so content that renders after the chrome is observed and placed first', async () => {
    // Measured 2026-10-08: three observations of a results page agreed twice
    // over on 33 elements of banner, navigation and search box, with a main
    // that had nothing beneath it yet; each plan made on them was wasted.
    const patient = new PlaywrightBrowser(specBrowserOptions(profiles, { settleRetryMs: 150 }));
    await patient.open('spec-late-main', { headed: false, documents: [] });
    try {
      await patient.page.setContent(LATE_MAIN);
      const observation = await patient.observe();
      expect(observation.elements.map((e) => [e.name, e.landmark])).toEqual([
        ['Open result', 'main'],
        ['Menu', 'banner'],
      ]);
      expect(observation.reading.reads).toBeGreaterThanOrEqual(3);
      expect(observation.reading.settled).toBe(true);
    } finally {
      await patient.close();
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
      serves: [],
    });
    expect(await browser.readValue(search.ref)).toBe('playwright aria snapshot');
  });
});
