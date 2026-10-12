import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import { PlaywrightBrowser } from './playwright-browser';

/**
 * A form's radio questions, against the Chromium Playwright bundles, headless.
 * The first question is drawn the way a live form drew it on 2026-10-09:
 * each answer a styled `role="radio"` named after the question, its native
 * input inside it unlabelled, "Yes" and "No" only as the words it shows, and
 * no required or invalid attribute anywhere. The second is plain HTML: native
 * radios in a fieldset, one of them required. The third is drawn the way a
 * live form drew its acknowledgment on 2026-10-12: one radio, named after the
 * statement it acknowledges, showing "Yes", in a group with no name, no legend
 * and no description. Run with the `browser` project.
 */
const QUESTIONS = `<!doctype html><html><head><title>Apply — additional questions</title></head><body>
  <div role="dialog" aria-modal="true" aria-label="Apply to Acme">
    <p>Do you agree to the additional application terms?*</p>
    <fieldset role="radiogroup" aria-describedby="error-for-terms">
      <div role="radio" tabindex="0" aria-label="Do you agree to the additional application terms?" aria-checked="false">
        <div><input id="terms-yes" type="radio" name="terms"><label for="terms-yes"></label></div><p>Yes</p>
      </div>
      <div role="radio" tabindex="0" aria-label="Do you agree to the additional application terms?" aria-checked="false">
        <div><input id="terms-no" type="radio" name="terms"><label for="terms-no"></label></div><p>No</p>
      </div>
    </fieldset>
    <fieldset role="radiogroup">
      <legend>Willing to relocate?</legend>
      <label><input type="radio" name="relocate" required> Yes</label>
      <label><input type="radio" name="relocate"> No</label>
    </fieldset>
    <p>I certify that the information provided is accurate to the best of my knowledge.</p>
    <div role="radiogroup">
      <div role="radio" tabindex="0" aria-label="I certify that the information provided is accurate to the best of my knowledge." aria-checked="false">
        <div><input id="certify-yes" type="radio" name="certify"><label for="certify-yes"></label></div><p>Yes</p>
      </div>
    </div>
    <button type="button">Next</button>
  </div>
  <script>
    for (const radio of document.querySelectorAll('[role="radio"]')) {
      radio.addEventListener('click', () => {
        for (const other of radio.parentElement.querySelectorAll('[role="radio"]')) {
          other.setAttribute('aria-checked', String(other === radio));
          other.querySelector('input').checked = other === radio;
        }
      });
    }
  </script>
</body></html>`;

const groups = (observation: PageObservation): ObservedElement[] =>
  observation.elements.filter((element) => element.role === 'radiogroup');

describe('the Playwright browser, on radio questions', () => {
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

  it('[BRW-2] reads each answer by the words it shows, the question its answers are named after, and a required radio as the group required', async () => {
    await browser.page.setContent(QUESTIONS);
    const observation = await browser.observe();
    const [terms, relocate, certify] = groups(observation);
    expect(terms).toMatchObject({
      options: ['Yes', 'No'],
      value: null,
      required: false,
      context: 'Do you agree to the additional application terms?',
    });
    expect(relocate).toMatchObject({ options: ['Yes', 'No'], value: null, required: true });
    expect(relocate.context).toBe('Willing to relocate?');
    // A group of one is still named after its question: the statement the lone answer acknowledges.
    expect(certify).toMatchObject({
      name: '',
      options: ['Yes'],
      context: 'I certify that the information provided is accurate to the best of my knowledge.',
    });

    // The two answers share the question as their name; their words tell them apart.
    const answers = observation.elements.filter(
      (element) =>
        element.role === 'radio' &&
        element.name === 'Do you agree to the additional application terms?',
    );
    expect(answers.map((answer) => answer.text)).toEqual(['Yes', 'No']);
  });

  it('[BRW-2] says why an action gave up: the call log’s last reason travels with the failure', async () => {
    const quick = new PlaywrightBrowser({
      profilesDir: profiles,
      channel: undefined,
      actionTimeoutMs: 1_500,
    });
    await quick.open('spec-quick', { headed: false });
    try {
      await quick.page.setContent(`<!doctype html><html><body>
        <button type="button">Covered</button>
        <div style="position:fixed;inset:0;background:transparent"></div>
      </body></html>`);
      const covered = (await quick.observe()).elements.find((e) => e.name === 'Covered');
      if (covered === undefined) throw new Error('the covered button was not observed');
      await expect(
        quick.act({ kind: 'click', ref: covered.ref, reason: 'try', expect: null, serves: [] }),
      ).rejects.toThrow(/Timeout 1500ms exceeded.*intercepts pointer events/);
    } finally {
      await quick.close();
    }
  });

  it('[BRW-2] picks an answer by the words it shows when its name is the question, and reads the choice back as the group value', async () => {
    await browser.page.setContent(QUESTIONS);
    const [terms, relocate] = groups(await browser.observe());
    await browser.act({
      kind: 'select',
      ref: terms.ref,
      option: 'Yes',
      reason: 'the mission agrees to the terms',
      expect: null,
      serves: [],
    });
    await browser.act({
      kind: 'select',
      ref: relocate.ref,
      option: 'No',
      reason: 'from the evidence',
      expect: null,
      serves: [],
    });
    const [termsAfter, relocateAfter] = groups(await browser.observe());
    expect(termsAfter.value).toBe('Yes');
    expect(relocateAfter.value).toBe('No');
  });
});
