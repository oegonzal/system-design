import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import type { BrowserAction } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

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

/**
 * Radio questions drawn the way a live job-site form drew them on
 * 2026-10-31: native radios each named after their question — by
 * `aria-labelledby` in the first, by `aria-label` in the others — showing
 * "Yes" and "No" only beside them, and taking no click of their own. The
 * first's radios have no box: the circle drawn around each takes the click.
 * The second's take no pointer events: each row is a label, which passes a
 * click to its radio. The third is drawn like the first, with nothing that
 * takes a click.
 */
const NAMED_AFTER_QUESTION = `<!doctype html><html><head><title>Apply — additional questions</title>
  <style>
    .circle { display: inline-block; width: 16px; height: 16px; border: 1px solid #555; border-radius: 50%; }
    .boxless { position: absolute; width: 0; height: 0; margin: 0; opacity: 0; }
    .untouchable { pointer-events: none; opacity: 0; width: 16px; height: 16px; margin: 0; }
  </style>
</head><body>
  <div role="dialog" aria-modal="true" aria-label="Apply to Acme">
    <p>Are you licensed to practise in the state?*</p>
    <span id="licensed" hidden>Are you licensed to practise in the state?</span>
    <div role="radiogroup">
      <div><span class="circle"><input class="boxless" type="radio" name="licensed" aria-labelledby="licensed"></span><p>Yes</p></div>
      <div><span class="circle"><input class="boxless" type="radio" name="licensed" aria-labelledby="licensed"></span><p>No</p></div>
    </div>
    <p>Would your last employers recommend you?*</p>
    <div role="radiogroup">
      <label><input class="untouchable" type="radio" name="recommend" aria-label="Would your last employers recommend you?"><span>Yes</span></label>
      <label><input class="untouchable" type="radio" name="recommend" aria-label="Would your last employers recommend you?"><span>No</span></label>
    </div>
    <p>Do you hold a clearance?*</p>
    <div role="radiogroup">
      <div><span class="inert circle"><input class="boxless" type="radio" name="clearance" aria-label="Do you hold a clearance?"></span><p>Yes</p></div>
      <div><span class="inert circle"><input class="boxless" type="radio" name="clearance" aria-label="Do you hold a clearance?"></span><p>No</p></div>
    </div>
    <button type="button">Review</button>
  </div>
  <script>
    for (const circle of document.querySelectorAll('.circle:not(.inert)')) {
      circle.addEventListener('click', () => {
        const radio = circle.querySelector('input');
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  </script>
</body></html>`;

const groups = (observation: PageObservation): ObservedElement[] =>
  observation.elements.filter((element) => element.role === 'radiogroup');

const choose = (ref: string, option: string): BrowserAction => ({
  kind: 'select',
  ref,
  option,
  reason: 'from the evidence',
  expect: null,
  serves: [],
});

describe('the Playwright browser, on radio questions', () => {
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
    const quick = new PlaywrightBrowser(specBrowserOptions(profiles, { actionTimeoutMs: 1_500 }));
    await quick.open('spec-quick', { headed: false, documents: [] });
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

  it('[BRW-2] reads the answers of a question every radio is named after by the words of their rows, chooses one where a person’s click lands, and reads the choice back by its words', async () => {
    await browser.page.setContent(NAMED_AFTER_QUESTION);
    const [licensed, recommend] = groups(await browser.observe());
    expect(licensed).toMatchObject({
      options: ['Yes', 'No'],
      value: null,
      context: 'Are you licensed to practise in the state?',
    });
    expect(recommend).toMatchObject({
      options: ['Yes', 'No'],
      value: null,
      context: 'Would your last employers recommend you?',
    });

    await browser.act(choose(licensed.ref, 'No'));
    await browser.act(choose(recommend.ref, 'Yes'));
    const [licensedAfter, recommendAfter] = groups(await browser.observe());
    expect(licensedAfter.value).toBe('No');
    expect(recommendAfter.value).toBe('Yes');
    // A read-back finds the choice, never the words of every option.
    expect(await browser.readValue(licensedAfter.ref)).toBe('No');
    expect(await browser.readValue(recommendAfter.ref)).toBe('Yes');
  });

  it('[BRW-2] fails a radio select naming the options when none reads its words, and after the declared wait when its click took nowhere', async () => {
    const quick = new PlaywrightBrowser(specBrowserOptions(profiles, { optionWaitMs: 300 }));
    await quick.open('spec-radio-quick', { headed: false, documents: [] });
    try {
      await quick.page.setContent(NAMED_AFTER_QUESTION);
      const [licensed, , clearance] = groups(await quick.observe());
      expect(await quick.readValue(clearance.ref)).toBeNull();
      await expect(quick.act(choose(licensed.ref, 'Maybe'))).rejects.toThrow(
        `select: no option reads "Maybe": the field offered "Yes", "No" — answer it with one of its options' exact words`,
      );
      await expect(quick.act(choose(clearance.ref, 'Yes'))).rejects.toThrow(
        'select: clicked the option "Yes", and the field then held nothing',
      );
    } finally {
      await quick.close();
    }
  });
});
