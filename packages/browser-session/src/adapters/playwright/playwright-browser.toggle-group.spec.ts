import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { HIDDEN_INPUT, specBrowserOptions } from './testing';

/**
 * Questions answered by buttons that declare whether they are pressed
 * (`aria-pressed`), in a box of their own — as an employer's application form
 * drew a yes-or-no question on 2026-11-06, two buttons beside the hidden
 * checkbox that keeps the answer, pressing one releasing the other — a row of
 * them pressed one by one, chips each in a list item, styled buttons, a box
 * its author names, a box the page draws anew on each click, a table's cell,
 * and boxes beside inputs parked off the page, transparent or clipped away.
 * Beside them, the boxes that are no such question. Run with the `browser`
 * project.
 */
const toggle = (words: string, pressed = false, attrs = ''): string =>
  `<button type="button" aria-pressed="${pressed}" ${attrs}>${words}</button>`;

/** A one-pixel image, drawn where an image's words are its alternative text. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const TOGGLES = `<!doctype html><html><head><title>Apply — application</title>
<style>.schedule::before { content: "Schedule?"; }</style></head><body>
<script>
  // One answer at a time: pressing one releases the others, and the hidden checkbox keeps the answer.
  const pressOne = (box, pressed) => {
    for (const other of box.querySelectorAll('[aria-pressed]')) other.setAttribute('aria-pressed', String(other === pressed));
    const kept = box.querySelector('input');
    if (kept !== null) kept.checked = pressed.textContent === 'Yes';
  };
  document.addEventListener('click', (event) => {
    const pressed = event.target.closest('[aria-pressed]');
    if (pressed === null) return;
    const box = pressed.closest('.one, .many, .redrawn, .stuck');
    if (box === null) return;
    if (box.classList.contains('redrawn')) {
      // The page draws the whole box anew, the clicked answer pressed.
      const next = box.cloneNode(true);
      const at = Array.from(box.querySelectorAll('[aria-pressed]')).indexOf(pressed);
      pressOne(next, next.querySelectorAll('[aria-pressed]')[at]);
      box.replaceWith(next);
    } else if (box.classList.contains('many')) {
      pressed.setAttribute('aria-pressed', String(pressed.getAttribute('aria-pressed') !== 'true'));
    } else {
      pressOne(box, pressed);
      // A pressed answer takes no more clicks, as some widgets draw it.
      if (box.classList.contains('stuck')) for (const each of box.querySelectorAll('[aria-pressed]')) each.style.pointerEvents = each === pressed ? 'none' : '';
    }
  });
</script>
<form>
  <div><span>Will you now, or in the future, require visa sponsorship? *</span>
    <div class="one">${toggle('Yes')}${toggle('No')}<input type="checkbox" name="sponsorship" style="display: none"></div>
  </div>
  <div><span>Which time zones can you work in?</span>
    <div class="many">${toggle('Pacific', true)}${toggle('Eastern')}${toggle('Central')}</div>
  </div>
  <div><span>Which stacks have you shipped?</span>
    <ul class="many"><li>${toggle('React')}</li><li>${toggle('Vue')}</li><li>${toggle('Svelte')}</li></ul>
  </div>
  <div><span>Are you open to relocation?</span>
    <div class="one"><div role="button" tabindex="0" aria-pressed="false">Open</div><div role="button" tabindex="0" aria-pressed="false">Not open</div></div>
  </div>
  <div><span>Can you start within a month?</span>
    <div class="one">${toggle('Yes')}${toggle('No')}<input type="checkbox" style="${HIDDEN_INPUT}"><input type="checkbox" style="visibility: hidden"></div>
  </div>
  <div class="one" role="group" aria-label="Do you hold a security clearance?">${toggle('Yes')}${toggle('No')}</div>
  <div><span>Did you graduate?</span>
    <div class="redrawn">${toggle('Yes')}${toggle('No')}</div>
  </div>
  <div><span>Are you a veteran?</span>
    <div class="stuck">${toggle('Yes')}${toggle('No')}</div>
  </div>
  <table><tr><td>Will you relocate?</td><td class="one">${toggle('Yes')}${toggle('No')}</td></tr></table>
  <div><span>Do you hold a driver's license?</span>
    <div class="one">${toggle('Yes')}${toggle('No')}<input type="checkbox" style="position: absolute; left: -9999px"><input style="position: fixed; top: -100px"></div>
  </div>
  <div><span>Can you work weekends?</span>
    <div class="one">${toggle('Yes')}${toggle('No')}<input style="opacity: 0"><select style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0)"><option>Yes</option><option>No</option></select></div>
  </div>
  <div><div><span>Will you need sponsorship later?</span><div class="one">${toggle('Yes')}${toggle('No')}</div></div><div>${toggle('I agree to the terms')}</div></div>
  <fieldset><legend>Which shift do you prefer?</legend>
    <div class="one" role="group" aria-label="Shift">${toggle('Early')}${toggle('Late')}</div>
  </fieldset>
  <div class="actions"><button type="button">Save draft</button><button type="button">Cancel</button></div>
  <div class="many">${toggle('Agree')}${toggle('Disagree')}<input aria-label="Tell us why"></div>
  <div class="many">${toggle('Remote')}${toggle('Onsite')}<input type="checkbox" aria-label="Either works"></div>
  <div class="many">${toggle('Same')}${toggle('Same')}</div>
  <div class="many">${toggle('Bold')}${toggle('<svg width="12" height="12"></svg>')}</div>
  <div class="many">First? ${toggle('Alpha')}${toggle('Beta')} Second? ${toggle('Gamma')}${toggle('Delta')}</div>
  <div role="toolbar" aria-label="Formatting">${toggle('Italic')}${toggle('Underline')}</div>
  <div role="toolbar" aria-label="Marks"><div class="many">${toggle('Strike')}${toggle('Code')}</div></div>
  <nav><div class="one">${toggle('1')}${toggle('2')}${toggle('3')}</div></nav>
  <div class="many">Work model? ${toggle('Hybrid')}${toggle('On-site')}<span class="schedule"></span>${toggle('Full-time')}${toggle('Part-time')}</div>
  <div class="many">${toggle('Mornings')}${toggle('Evenings')}<img alt="Shift length?" src="${PIXEL}">${toggle('Short')}${toggle('Long')}</div>
  <div class="many">${toggle('Day')}${toggle('Night')}<span id="shadowed"></span>${toggle('Weekdays')}${toggle('Weekends')}</div>
  <div class="one">${toggle('Accept')}${toggle('Decline')}<a href="#terms" style="opacity: 0">Read the terms</a></div>
  <div class="one">${toggle('Red')}${toggle('Blue')}<button type="button" style="opacity: 0">Reset</button></div>
</form>
<script>document.getElementById('shadowed').attachShadow({ mode: 'open' }).textContent = 'Which days?';</script>
</body></html>`;

const common = { reason: 'the procedure says so', expect: null, serves: [] };

describe('the Playwright browser and buttons a page declares pressed or not, in a box of their own', () => {
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

  it('[BRW-2] reads a box of toggle buttons holding no other control a person sees and one question as one question, with its question and what is pressed, and chooses the answer asked for by pressing it', async () => {
    await browser.page.setContent(TOGGLES);
    const observation = await browser.observe();
    const groups = observation.elements.filter((e) => e.role === 'listbox');
    expect(groups.map((g) => g.options)).toEqual([
      ['Yes', 'No'],
      ['Pacific', 'Eastern', 'Central'],
      ['React', 'Vue', 'Svelte'],
      ['Open', 'Not open'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Yes', 'No'],
      ['Early', 'Late'],
    ]);
    const [sponsorship, zones, stacks, relocation, start, clearance, graduated, veteran] = groups;
    const [, , , , , , , , relocate, license, weekends, later, shift] = groups;
    expect(sponsorship?.context).toContain('require visa sponsorship');
    expect(start?.context).toContain('start within a month');
    // Inputs parked off the page, transparent or clipped away are no control a person sees.
    expect(license?.context).toContain("driver's license");
    expect(weekends?.context).toContain('work weekends');
    // A lone toggle beside another question's box is not one of its answers.
    expect(later?.context).toContain('sponsorship later');
    // A box its author names asks by that name.
    expect(clearance?.name).toBe('Do you hold a security clearance?');
    // Its name is not its question when words beside it ask one.
    expect(shift?.name).toBe('');
    expect(shift?.context).toContain('Which shift do you prefer?');
    expect(groups.map((g) => g.value)).toEqual([
      null,
      'Pacific',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    // Plain buttons, toggles beside a field, a checkbox a person sees, any link or a button that is no
    // toggle, toggles that read alike or not at all, a lone toggle, two questions in one box — their
    // words drawn by CSS, an image's or in a shadow root included — and a toolbar or a navigation,
    // around them or around their box, stay as the tree lists them.
    const buttons = observation.elements.filter((e) => e.role === 'button').map((e) => e.name);
    expect(buttons).toEqual([
      'I agree to the terms',
      'Save draft',
      'Cancel',
      'Agree',
      'Disagree',
      'Remote',
      'Onsite',
      'Same',
      'Same',
      'Bold',
      '',
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      'Italic',
      'Underline',
      'Strike',
      'Code',
      '1',
      '2',
      '3',
      'Hybrid',
      'On-site',
      'Full-time',
      'Part-time',
      'Mornings',
      'Evenings',
      'Short',
      'Long',
      'Day',
      'Night',
      'Weekdays',
      'Weekends',
      'Accept',
      'Decline',
      'Red',
      'Blue',
      'Reset',
    ]);
    const select = (ref: string | undefined, option: string) =>
      browser.act({ kind: 'select', ref: ref ?? '', option, ...common });
    expect(await browser.readValue(sponsorship?.ref ?? '')).toBeNull();
    await select(sponsorship?.ref, 'No');
    expect(await browser.readValue(sponsorship?.ref ?? '')).toBe('No');
    // Another answer presses it, and the page releases the first.
    await select(sponsorship?.ref, 'Yes');
    expect(await browser.readValue(sponsorship?.ref ?? '')).toBe('Yes');
    // One pressed already is left as it is; another is pressed beside it, and both read back.
    await select(zones?.ref, 'Pacific');
    await select(zones?.ref, 'Eastern');
    expect(await browser.readValue(zones?.ref ?? '')).toBe('Pacific, Eastern');
    await select(stacks?.ref, 'Vue');
    await select(relocation?.ref, 'Not open');
    expect(await browser.readValue(relocation?.ref ?? '')).toBe('Not open');
    // A box the page draws anew on the click is read anew, pressed as the click meant.
    await select(graduated?.ref, 'Yes');
    const redrawn = await browser.page.$$eval('.redrawn button', (all) =>
      all.map((button) => button.getAttribute('aria-pressed')),
    );
    expect(redrawn).toEqual(['true', 'false']);
    // A pressed answer that takes no more clicks still leaves its box one question.
    await select(veteran?.ref, 'No');
    await select(relocate?.ref, 'No');
    await select(license?.ref, 'Yes');
    const again = (await browser.observe()).elements.filter((e) => e.role === 'listbox');
    expect(again.map((g) => g.value)).toEqual([
      'Yes',
      'Pacific, Eastern',
      'Vue',
      'Not open',
      null,
      null,
      'Yes',
      'No',
      'No',
      'Yes',
      null,
      null,
      null,
    ]);
  });
});
