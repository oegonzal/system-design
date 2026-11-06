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
  // An option clicked anywhere is drawn anew, holding the state the click gave it — none, in a box
  // marked to take no click at all.
  document.addEventListener('click', (event) => {
    const option = event.target.closest('.opt, .choice');
    if (option === null) return;
    event.preventDefault();
    const input = option.querySelector('input');
    const takes = option.closest('[data-never]') === null;
    const next = option.parentElement.cloneNode(true);
    const inputs = Array.from(next.querySelectorAll('input'));
    const at = Array.from(option.parentElement.querySelectorAll('input')).indexOf(input);
    if (takes) window.toggles += 1;
    // A box that takes no click draws its choices anew as they were before any: none chosen.
    inputs.forEach((each, index) => {
      each.checked = !takes
        ? false
        : input.type === 'radio'
          ? index === at
          : index === at
            ? !input.checked
            : each.checked;
    });
    option.parentElement.replaceWith(next);
  });
</script>
  <form>
    <p>Are you able to work remotely?</p>
    <div class="question"><div class="opt"><div style="${DRAWN_BOX}"><input type="checkbox" style="${HIDDEN_INPUT}"></div><p>Yes</p></div></div>
    <p>Do you hold a clearance?</p>
    <div class="never" data-never><div class="opt"><div style="${DRAWN_BOX}"><input type="checkbox" style="${HIDDEN_INPUT}"></div><p>Hold a clearance</p></div></div>
    <fieldset data-never><legend>Do you need relocation?</legend>
      <div class="radios"><label class="choice"><input type="radio" name="relocate" value="yes">Yes</label><label class="choice"><input type="radio" name="relocate" value="no">No</label></div>
    </fieldset>
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

  it('[BRW-2] clicks a drawn checkbox once: the page drew it anew, ticked, which is read where the click landed as the checkbox it was, so it is never clicked back', async () => {
    await browser.page.setContent(REDRAWN);
    const observation = await browser.observe();
    const [box] = observation.elements.filter((e) => e.role === 'checkbox');
    expect(box).toBeDefined();
    await browser.act({ kind: 'click', ref: box?.ref ?? '', ...common });
    expect(
      await browser.page.evaluate(() => (window as unknown as { toggles: number }).toggles),
    ).toBe(1);
    expect(await browser.page.locator('.question .opt input').isChecked()).toBe(true);
    const after = await browser.observe();
    expect(after.elements.filter((e) => e.role === 'checkbox')[0]?.value).toBe('checked');
  });

  it('[BRW-2] chooses a radio whose group the page draws anew, without a failure for the group it clicked having left the page', async () => {
    await browser.page.setContent(REDRAWN);
    const observation = await browser.observe();
    const group = observation.elements.find((e) => e.context?.includes('sponsorship') === true);
    expect(group).toBeDefined();
    await browser.act({ kind: 'select', ref: group?.ref ?? '', option: 'No', ...common });
    expect(await browser.page.locator('input[name="sponsor"][value="no"]').isChecked()).toBe(true);
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

  it('[BRW-2] reads a choice drawn anew where the click landed: one the page never takes fails rather than passing as chosen', async () => {
    await browser.page.setContent(REDRAWN);
    const observation = await browser.observe();
    const [, never] = observation.elements.filter((e) => e.role === 'checkbox');
    await expect(browser.act({ kind: 'click', ref: never?.ref ?? '', ...common })).rejects.toThrow(
      /reads unchecked where it was clicked/,
    );
    expect(await browser.page.locator('.never input').isChecked()).toBe(false);
    const relocate = observation.elements.find((e) => e.context?.includes('relocation') === true);
    expect(relocate).toBeDefined();
    await expect(
      browser.act({ kind: 'select', ref: relocate?.ref ?? '', option: 'No', ...common }),
    ).rejects.toThrow(/does not read chosen where it was clicked/);
  });
});
