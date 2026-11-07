import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * A page that refuses a value says so in an alert it ties to the control —
 * by `aria-errormessage`, or by `aria-describedby` as a payroll vendor's form
 * did on 2026-11-06, "Mobile Number is required." beside a field marked
 * neither required nor invalid — and that mark is read as the page's invalid
 * mark; an error element with nothing to say marks nothing. Run with the
 * `browser` project.
 */
const REFUSALS = `<!doctype html><html><head><title>Apply — contact</title></head><body>
<form>
  <label>Mobile<input id="mobile" type="tel" aria-describedby="mobile-hint mobile-alert" value="+1"></label>
  <div id="mobile-hint">Country code was added to the field.</div>
  <div role="alert"><span id="mobile-alert">Mobile Number is required.</span></div>
  <label>Postal code<input id="postal" aria-errormessage="postal-error" value="90802"></label>
  <div id="postal-error" role="alert"></div>
  <label>Email<input id="email" type="email" aria-errormessage="email-error" value="a@b"></label>
  <p id="email-error" role="alert">Enter a valid email address.</p>
</form>
</body></html>`;

describe('the Playwright browser, on a field the page refuses in an alert', () => {
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

  it('[BRW-2] reads an alert the page ties to a control as its invalid mark, by aria-describedby or aria-errormessage, and an error element that says nothing as none', async () => {
    await browser.page.setContent(REFUSALS);
    const observation = await browser.observe();
    const byName = (name: string) => observation.elements.find((e) => e.name === name);
    expect(byName('Mobile')).toMatchObject({
      invalid: true,
      required: false,
      context: 'Country code was added to the field. Mobile Number is required.',
    });
    // An error message is the page's refusal, not the words a person reads beside the field.
    expect(byName('Email')).toMatchObject({ invalid: true, context: null });
    expect(byName('Postal code')?.invalid).toBe(false);
  });
});
