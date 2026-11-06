import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { DRAWN_BOX, HIDDEN_INPUT, specBrowserOptions } from './testing';

/**
 * A field typed into and chosen from on a form a page embeds in a frame of
 * its own — measured 2026-11-06, an employer's careers page held its
 * application form in an iframe, and the phone's country field there was
 * answered with words none of its options had: its list was never read, and
 * the choosing waited for it in the page around the frame. Its list opens on
 * a click or a key and exists only while open. Run with the `browser` project.
 */
const FORM = `<!doctype html><html><body><form>
  <label for="country">Country</label>
  <input id="country" type="text" role="combobox" aria-expanded="false" aria-controls="country-list">
  <div><div>Will you require sponsorship? *</div>
    <div>
      <div><input type="radio" id="sponsor-yes" name="sponsor" value="yes" style="${HIDDEN_INPUT}"><label for="sponsor-yes" style="cursor:pointer">Yes</label></div>
      <div><input type="radio" id="sponsor-no" name="sponsor" value="no" style="${HIDDEN_INPUT}"><label for="sponsor-no" style="cursor:pointer">No</label></div>
    </div></div>
  <div><div style="${DRAWN_BOX}"><input type="checkbox" id="terms" style="${HIDDEN_INPUT}"></div>
    <label for="terms">I agree to the terms</label></div>
</form>
<script>
  const NAMES = ['United Kingdom', 'United States +1'];
  const input = document.getElementById('country');
  let list = null;
  const close = () => { list?.remove(); list = null; input.setAttribute('aria-expanded', 'false'); };
  const render = () => {
    if (list === null) {
      list = document.createElement('ul');
      list.id = 'country-list';
      list.setAttribute('role', 'listbox');
      input.after(list);
      input.setAttribute('aria-expanded', 'true');
    }
    list.innerHTML = '';
    for (const name of NAMES.filter((n) => n.toLowerCase().includes(input.value.toLowerCase()))) {
      const option = document.createElement('li');
      option.setAttribute('role', 'option');
      option.textContent = name;
      option.addEventListener('mousedown', (event) => { event.preventDefault(); input.value = name; close(); });
      list.appendChild(option);
    }
  };
  input.addEventListener('keydown', (event) => (event.key === 'Escape' ? close() : setTimeout(render, 0)));
  input.addEventListener('mousedown', () => setTimeout(render, 0));
  input.addEventListener('input', () => { if (list !== null) render(); });
</script></body></html>`;

/** The careers page and the form it embeds, each served from an origin of its own, as such forms are. */
const CAREERS = 'https://careers.example.test/apply';
const FORM_URL = 'https://forms.example.test/application';
const PAGE = `<!doctype html><html><head><title>Careers — apply</title></head><body>
  <h1>Apply</h1>
  <iframe title="Application" style="margin: 90px 0 0 140px; border: 3px solid #999; width: 600px; height: 400px" src="${FORM_URL}"></iframe>
</body></html>`;

const COMMON = { reason: 'the procedure says so', expect: null, serves: [] };

describe('the Playwright browser and the choices of a form a page embeds in a frame of its own', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    browser = new PlaywrightBrowser(specBrowserOptions(profiles));
    await browser.open('spec', { headed: false, documents: [] });
    await browser.page.route(CAREERS, (route) =>
      route.fulfill({ contentType: 'text/html', body: PAGE }),
    );
    await browser.page.route(FORM_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: FORM }),
    );
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-27] reads its options and chooses one by its words in the frame that holds it', async () => {
    await browser.page.goto(CAREERS);
    await browser.page.frameLocator('iframe').locator('#country').waitFor();
    const observation = await browser.observe();
    const country = observation.elements.find((e) => e.role === 'combobox' && e.name === 'Country');
    expect(country?.ref).toMatch(/^f\d+e\d+$/);
    expect(await browser.readChoices(country?.ref ?? '')).toEqual([
      'United Kingdom',
      'United States +1',
    ]);
    await browser.act({
      kind: 'select',
      ref: country?.ref ?? '',
      option: 'United States +1',
      ...COMMON,
    });
    expect(await browser.page.frameLocator('iframe').locator('#country').inputValue()).toBe(
      'United States +1',
    );
  });

  it('[BRW-2] chooses a drawn radio and turns a drawn checkbox where a person clicks them in the frame that holds them, the frame placed away from the page’s corner', async () => {
    await browser.page.goto(CAREERS);
    await browser.page.frameLocator('iframe').locator('#terms').waitFor({ state: 'attached' });
    const observation = await browser.observe();
    const sponsor = observation.elements.find((e) => e.role === 'radiogroup');
    const terms = observation.elements.find((e) => e.role === 'checkbox');
    expect(sponsor?.options).toEqual(['Yes', 'No']);
    await browser.act({ kind: 'select', ref: sponsor?.ref ?? '', option: 'No', ...COMMON });
    await browser.act({ kind: 'click', ref: terms?.ref ?? '', ...COMMON });
    const form = browser.page.frameLocator('iframe');
    expect(await form.locator('#sponsor-no').isChecked()).toBe(true);
    expect(await form.locator('#terms').isChecked()).toBe(true);
  });
});
