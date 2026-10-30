import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PageObservation, StepAction } from '@sysdesign/contracts';

import { ActionFailed } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Against the Chromium Playwright bundles, headless, on a throwaway profile:
 * the file controls a page hides are observed all the same, and an upload
 * puts a supplied document into any of them. Run with the `browser` vitest
 * project.
 */
const FORM = `<!doctype html><html><head><title>Apply — documents</title>
<style>.d-none{display:none!important}.btn{display:inline-block;padding:4px;border:1px solid #999}</style></head>
<body>
  <main>
    <h1>Your documents</h1>
    <form>
      <label for="cv">Résumé</label>
      <input id="cv" type="file" accept=".pdf,.docx" required>
      <label class="btn">Upload résumé<input class="d-none" type="file" accept="application/pdf" name="profile-resume"></label>
      <div>
        <button type="button" onclick="document.getElementById('cover').click()">Attach cover letter</button>
        <input id="cover" class="d-none" type="file" aria-label="Cover letter" disabled>
      </div>
      <button type="button">Next</button>
    </form>
  </main>
</body></html>`;

const upload = (ref: string, document: string): Extract<StepAction, { kind: 'upload' }> => ({
  kind: 'upload',
  ref,
  document,
  reason: 'the form requires it',
  expect: null,
  serves: [],
});

const controlsOf = (observation: PageObservation) =>
  observation.elements.filter((element) => element.kind === 'uploadable');

describe('the Playwright browser and the file controls a page hides', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;
  let resume: string;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    resume = join(profiles, 'resume.pdf');
    writeFileSync(resume, '%PDF-1.4\n%spec\n');
    browser = new PlaywrightBrowser(specBrowserOptions(profiles));
    await browser.open('spec', { headed: false, documents: [{ name: 'resume', path: resume }] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-26] observes every file control — one the page shows through the tree, the hidden ones under refs of its own — with its label, what it accepts, where it sits and whether it is disabled', async () => {
    await browser.page.setContent(FORM);
    const observation = await browser.observe();
    const controls = controlsOf(observation);
    expect(controls.map((control) => [control.ref, control.name, control.visible])).toEqual([
      [expect.stringMatching(/^e\d+$/), 'Résumé', true],
      ['f1', 'Upload résumé', false],
      ['f2', 'Cover letter', false],
    ]);
    expect(controls.every((control) => control.inputType === 'file')).toBe(true);
    const [shown, profile, cover] = controls;
    expect(shown).toMatchObject({ required: true, context: expect.stringContaining('.pdf') });
    expect(profile).toMatchObject({
      hiddenTraits: [],
      landmark: 'main',
      disabled: false,
      value: null,
      context: 'accepts application/pdf',
    });
    expect(cover).toMatchObject({ disabled: true, hiddenTraits: [] });
    // Listed where a plan can reach them: the hidden ones are not among the unlisted.
    expect(observation.omittedElements).toBe(0);
  });

  it('[BRW-26] puts the supplied document into a shown or a hidden file control by its ref, and refuses a document nobody supplied', async () => {
    await browser.page.setContent(FORM);
    const observation = await browser.observe();
    const [shown, profile] = controlsOf(observation);
    if (shown === undefined || profile === undefined)
      throw new Error('the file controls were not observed');

    await browser.act(upload(shown.ref, 'resume'));
    await browser.act(upload(profile.ref, 'resume'));
    const chosen = await browser.page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).map(
        (input) => input.files?.[0]?.name ?? '',
      ),
    );
    expect(chosen).toEqual(['resume.pdf', 'resume.pdf', '']);
    // The next observation reads the file chosen as the control's value.
    const after = await browser.observe();
    expect(controlsOf(after).map((control) => control.value)).toEqual([
      'resume.pdf',
      'resume.pdf',
      null,
    ]);

    await expect(browser.act(upload(profile.ref, 'cover-letter'))).rejects.toThrow(ActionFailed);
    await expect(browser.act(upload(profile.ref, 'cover-letter'))).rejects.toThrow(
      'no file was supplied for document cover-letter',
    );
  });
});
