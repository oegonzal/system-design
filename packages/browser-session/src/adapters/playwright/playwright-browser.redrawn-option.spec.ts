import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { DRAWN_BOX, HIDDEN_INPUT, specBrowserOptions } from './testing';

/**
 * A page that draws an option anew when it is chosen: a click on a question's
 * drawn checkbox, or on a radio of a group, replaces what was clicked with a
 * fresh copy showing the new state — measured 2026-11-06, an application form
 * whose "Yes" box came back under new refs, ticked, while the session read
 * the box it had clicked, saw it unticked, and clicked again. Every toggle
 * the page makes is counted. Run with the `browser` project.
 */
const REDRAWN = `<!doctype html><html><head><title>Apply — questions</title>
</head><body>
<script>
  window.toggles = 0;
  // An option clicked anywhere is drawn anew, holding the state the click gave it.
  document.addEventListener('click', (event) => {
    const option = event.target.closest('.opt, .choice');
    if (option === null) return;
    event.preventDefault();
    window.toggles += 1;
    const input = option.querySelector('input');
    const next = option.parentElement.cloneNode(true);
    const inputs = Array.from(next.querySelectorAll('input'));
    const at = Array.from(option.parentElement.querySelectorAll('input')).indexOf(input);
    inputs.forEach((each, index) => {
      each.checked = input.type === 'radio' ? index === at : index === at ? !input.checked : each.checked;
    });
    option.parentElement.replaceWith(next);
  });
</script>
  <form>
    <p>Are you able to work remotely?</p>
    <div class="question"><div class="opt"><div style="${DRAWN_BOX}"><input type="checkbox" style="${HIDDEN_INPUT}"></div><p>Yes</p></div></div>
    <div class="solo"><label class="choice"><input type="radio" name="solo" value="agree">I agree to be contacted</label></div>
    <fieldset><legend>Do you need sponsorship?</legend>
      <div class="radios"><label class="choice"><input type="radio" name="sponsor" value="yes">Yes</label><label class="choice"><input type="radio" name="sponsor" value="no">No</label></div>
    </fieldset>
  </form>
</body></html>`;

const common = { reason: 'the procedure says so', expect: null, serves: [] };

describe('the Playwright browser and an option the page draws anew when it is chosen', () => {
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

  it('[BRW-2] clicks a drawn checkbox once: the page answered by drawing it anew, so it is read by the next observation and never clicked back', async () => {
    await browser.page.setContent(REDRAWN);
    const observation = await browser.observe();
    const box = observation.elements.find((e) => e.role === 'checkbox');
    expect(box).toBeDefined();
    await browser.act({ kind: 'click', ref: box?.ref ?? '', ...common });
    expect(
      await browser.page.evaluate(() => (window as unknown as { toggles: number }).toggles),
    ).toBe(1);
    expect(await browser.page.locator('.opt input').isChecked()).toBe(true);
    const after = await browser.observe();
    expect(after.elements.find((e) => e.role === 'checkbox')?.value).toBe('checked');
  });

  it('[BRW-2] chooses a radio whose group the page draws anew, without a failure for the group it clicked having left the page', async () => {
    await browser.page.setContent(REDRAWN);
    const observation = await browser.observe();
    const group = observation.elements.find((e) => e.options?.includes('No') === true);
    expect(group).toBeDefined();
    await browser.act({ kind: 'select', ref: group?.ref ?? '', option: 'No', ...common });
    expect(await browser.page.locator('input[value="no"]').isChecked()).toBe(true);
  });

  it('[BRW-2] chooses a lone radio the page draws anew, by its click, without a failure for the radio it clicked having left the page', async () => {
    await browser.page.setContent(REDRAWN);
    const observation = await browser.observe();
    const radio = observation.elements.find(
      (e) => e.role === 'radio' && e.name === 'I agree to be contacted',
    );
    expect(radio).toBeDefined();
    await browser.act({
      kind: 'select',
      ref: radio?.ref ?? '',
      option: 'I agree to be contacted',
      ...common,
    });
    expect(await browser.page.locator('input[name="solo"]').isChecked()).toBe(true);
  });
});
