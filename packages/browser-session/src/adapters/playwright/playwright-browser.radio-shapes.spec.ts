import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement } from '@sysdesign/contracts';

import type { BrowserAction } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Radio questions in the shapes a review of the radio reading probed on
 * 2026-10-31, against the Chromium Playwright bundles, headless: an option is
 * read by the words a person reads on it — never by a name every option
 * shares, nor by words the page hides, announces apart or uses for the
 * question — chosen where a person's click on it lands, inside its own row,
 * and read back by those words. Run with the `browser` project.
 */
const page = (title: string, body: string): string =>
  `<!doctype html><html><head><title>${title}</title><style>
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
    .row { display: flex; align-items: center; gap: 8px; }
    .boxless { position: absolute; width: 0; height: 0; margin: 0; opacity: 0; }
  </style></head><body>${body}</body></html>`;

/** Each radio named after the question by a visually hidden `<label for>`; its words in a paragraph beside it. */
const NAMED_BY_LABELS = page(
  'Named by labels',
  `<p>Do you agree to the additional application terms?*</p>
  <div role="radiogroup">
    <div class="row"><input id="terms-yes" type="radio" name="terms"><label for="terms-yes" class="sr-only">Do you agree to the additional application terms?</label><p>Yes</p></div>
    <div class="row"><input id="terms-no" type="radio" name="terms"><label for="terms-no" class="sr-only">Do you agree to the additional application terms?</label><p>No</p></div>
  </div>`,
);

/** A grid row: each radio named after the row's question, its words only in its column's header. */
const GRID_ROW = page(
  'Grid row',
  `<table>
    <thead><tr><th scope="col"></th><th scope="col">Strongly disagree</th><th scope="col">Disagree</th><th scope="col">Neutral</th><th scope="col">Agree</th><th scope="col">Strongly agree</th></tr></thead>
    <tbody><tr role="radiogroup" aria-labelledby="team">
      <th scope="row" id="team">I enjoy working in a team.</th>
      <td><input type="radio" name="team" aria-labelledby="team"></td>
      <td><input type="radio" name="team" aria-labelledby="team"></td>
      <td><input type="radio" name="team" aria-labelledby="team"></td>
      <td><input type="radio" name="team" aria-labelledby="team"></td>
      <td><input type="radio" name="team" aria-labelledby="team"></td>
    </tr></tbody>
  </table>`,
);

/** Rows that also hold words a person does not read as the option: clipped, hidden, aria-hidden, an alert, a description. */
const ROWS_WITH_ASIDES = page(
  'Rows with asides',
  `<p>Are you authorized to work in the United States?*</p>
  <div role="radiogroup">
    <div class="row"><input type="radio" name="auth" aria-label="Are you authorized to work in the United States?" aria-describedby="auth-note"><span class="sr-only">option 1 of 2</span><p>Yes</p><span role="alert">Required</span><small id="auth-note">You can prove it</small></div>
    <div class="row"><input type="radio" name="auth" aria-label="Are you authorized to work in the United States?"><p>No</p><span hidden>Choosing No ends the application</span><i aria-hidden="true">●</i></div>
  </div>`,
);

/** A group of one, its statement in the same row as the radio. */
const ONE_WITH_STATEMENT = page(
  'One with its statement',
  `<div role="radiogroup">
    <div class="row"><p>I certify that the information provided is accurate.</p><input type="radio" name="certify" aria-label="I certify that the information provided is accurate."><span>Yes</span></div>
  </div>`,
);

/**
 * Rows whose boxes overlap: the second row's words cover the middle of the
 * first's. In the second group a cover inside the group hides the second
 * row whole.
 */
const OVERLAPPING = page(
  'Overlapping rows',
  `<style>
    .wide { position: relative; display: inline-block; width: 260px; height: 40px; line-height: 40px; vertical-align: top; }
    .wide + .wide { margin-left: -150px; }
    .wide span { display: inline-block; padding: 0 8px; background: #fff; }
    /* Spans the whole row: the row's own centre is among the points a click is aimed at, and the row is as wide as the window the browser opened. */
    .cover { position: absolute; left: 0; top: 0; width: 100%; height: 120px; background: #fff; }
  </style>
  <p>Are you legally authorized to work in this country?*</p>
  <div role="radiogroup">
    <label class="wide"><input class="boxless" type="radio" name="legal" aria-label="Are you legally authorized to work in this country?"><span>Yes</span></label>
    <label class="wide"><input class="boxless" type="radio" name="legal" aria-label="Are you legally authorized to work in this country?"><span>No</span></label>
  </div>
  <p>Can you travel?*</p>
  <div role="radiogroup" style="position: relative; height: 120px">
    <div style="height: 40px"><label class="row"><input type="radio" name="travel"><span>Yes</span></label></div>
    <div style="height: 40px"><label class="row"><input type="radio" name="travel"><span>No</span></label></div>
    <div class="cover" style="top: 40px"></div>
  </div>`,
);

/** An option the page disables reads as an enabled one does; another pair is enabled and reads alike. */
const TWINS = page(
  'Twins',
  `<p>Can you start within two weeks?*</p>
  <div role="radiogroup">
    <label><input type="radio" name="start" disabled data-twin="disabled"> Yes</label>
    <label><input type="radio" name="start" data-twin="enabled"> Yes</label>
    <label><input type="radio" name="start"> No</label>
  </div>
  <p>Are you willing to relocate?*</p>
  <div role="radiogroup">
    <label><input type="radio" name="relocate" aria-disabled="true" data-twin="aria-disabled"> Yes</label>
    <label><input type="radio" name="relocate" data-twin="aria-enabled"> Yes</label>
    <label><input type="radio" name="relocate"> No</label>
  </div>
  <p>Shift preference?*</p>
  <div role="radiogroup">
    <label><input type="radio" name="shift"> Day</label>
    <label><input type="radio" name="shift"> Day</label>
  </div>`,
);

const choose = (ref: string, option: string): BrowserAction => ({
  kind: 'select',
  ref,
  option,
  reason: 'from the evidence',
  expect: null,
  serves: [],
});

describe('the Playwright browser, on radio questions in every shape a person reads', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  /** The page's radio groups, in order, as one observation lists them. */
  const groups = async (html: string): Promise<ObservedElement[]> => {
    await browser.page.setContent(html);
    return (await browser.observe()).elements.filter((element) => element.role === 'radiogroup');
  };
  const valuesNow = async (): Promise<(string | null)[]> =>
    (await browser.observe()).elements
      .filter((element) => element.role === 'radiogroup')
      .map((group) => group.value);

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    // Short waits, so a choice that fails says so quickly.
    browser = new PlaywrightBrowser(
      specBrowserOptions(profiles, { actionTimeoutMs: 3_000, optionWaitMs: 500 }),
    );
    await browser.open('spec-radio-shapes', { headed: false, documents: [] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-2] reads options every `<label for>` names after the question by their rows, and chooses and reads back by those words', async () => {
    const [terms] = await groups(NAMED_BY_LABELS);
    expect(terms).toMatchObject({
      options: ['Yes', 'No'],
      value: null,
      context: 'Do you agree to the additional application terms?',
    });
    await browser.act(choose(terms.ref, 'No'));
    expect(await valuesNow()).toEqual(['No']);
    expect(await browser.readValue(terms.ref)).toBe('No');
  });

  it('[BRW-2] reads a grid row’s options by their column headers, and chooses the one asked for', async () => {
    const [team] = await groups(GRID_ROW);
    expect(team).toMatchObject({
      options: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
      context: 'I enjoy working in a team.',
    });
    await browser.act(choose(team.ref, 'Agree'));
    expect(await valuesNow()).toEqual(['Agree']);
  });

  it('[BRW-2] leaves out of an option’s words what the page hides, clips away, announces apart or uses to describe it', async () => {
    const [auth] = await groups(ROWS_WITH_ASIDES);
    expect(auth.options).toEqual(['Yes', 'No']);
  });

  it('[BRW-2] leaves the statement out of the words of a lone option in the same row, and keeps it as the question', async () => {
    const [certify] = await groups(ONE_WITH_STATEMENT);
    expect(certify).toMatchObject({
      options: ['Yes'],
      context: 'I certify that the information provided is accurate.',
    });
    await browser.act(choose(certify.ref, 'Yes'));
    expect(await valuesNow()).toEqual(['Yes']);
  });

  it('[BRW-2] clicks an option only where the click lands in its own row, and chooses nothing when no such point shows', async () => {
    const [legal, travel] = await groups(OVERLAPPING);
    await browser.act(choose(legal.ref, 'Yes'));
    expect(await valuesNow()).toEqual(['Yes', null]);
    await expect(browser.act(choose(travel.ref, 'No'))).rejects.toThrow(
      'select: the option "No" shows nowhere a click would reach it',
    );
    expect(await valuesNow()).toEqual(['Yes', null]);
  });

  it('[BRW-2] chooses among the options the observation offers — never one the page disables — and refuses words two options share', async () => {
    const [start, relocate, shift] = await groups(TWINS);
    expect(start.options).toEqual(['Yes', 'No']);
    expect(relocate.options).toEqual(['Yes', 'No']);
    await browser.act(choose(start.ref, 'Yes'));
    await browser.act(choose(relocate.ref, 'Yes'));
    const checked = await browser.page.evaluate(() =>
      Array.from(document.querySelectorAll('input[data-twin]:checked'), (input) =>
        input.getAttribute('data-twin'),
      ),
    );
    expect(checked).toEqual(['enabled', 'aria-enabled']);
    await expect(browser.act(choose(shift.ref, 'Day'))).rejects.toThrow(
      'select: 2 options read "Day" — the field cannot tell them apart',
    );
  });
});
