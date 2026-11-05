import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import type { BrowserAction } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Choices a page groups by their name alone — the HTML standard's radio
 * button group, and checkboxes sent as one field's values — with no group
 * role and no fieldset around them, drawn as employer forms drew them: a list
 * of labelled radios or checkboxes under the question's own box
 * (2026-11-01), and radios drawn by their labels over inputs with no box,
 * which the tree lists with no ref (2026-11-05); and a checkbox its page drew
 * the same way, alone in its group, as a job site's "Follow <company>" box
 * was from 2026-10-29. Beside them, the layouts that must stay as the tree
 * lists them: options laid out flat among other fields, a box another control
 * shares, and a radio alone in its group. Run with the `browser` project.
 */
const HIDDEN_INPUT = 'position:absolute;width:0;height:0;margin:0;opacity:0;pointer-events:none';

const LISTED = `<!doctype html><html><head><title>Apply</title></head><body><form>
  <ul>
    <li><div class="label"><div class="text">Are you legally authorized to work in the country in which this role will be located?<span>✱</span></div></div>
      <div class="field"><ul>
        <li><label><input type="radio" name="cards[a][field1]" value="Yes"><span>Yes</span></label></li>
        <li><label><input type="radio" name="cards[a][field1]" value="No"><span>No</span></label></li>
      </ul></div></li>
  </ul>
  <button type="button">Submit application</button>
</form></body></html>`;

const DRAWN = `<!doctype html><html><head><title>Apply</title></head><body><form>
  <div><div>Will you now or in the future require visa sponsorship to work legally in the United States? *</div>
    <div>
      <div><input type="radio" id="sponsor-yes" name="sponsor" value="yes" style="${HIDDEN_INPUT}"><label for="sponsor-yes" style="cursor:pointer">Yes</label></div>
      <div><input type="radio" id="sponsor-no" name="sponsor" value="no" style="${HIDDEN_INPUT}"><label for="sponsor-no" style="cursor:pointer">No</label></div>
    </div></div>
  <button type="button">Submit</button>
</form></body></html>`;

const UNGROUPED = `<!doctype html><html><head><title>Apply</title></head><body>
  <form>
    <p>Do you hold a degree?</p>
    <label><input type="radio" name="degree"> Yes</label><label><input type="radio" name="degree"> No</label>
    <p>Do you prefer remote work?</p>
    <label><input type="radio" name="remote"> Yes</label><label><input type="radio" name="remote"> No</label>
  </form>
  <div><p>Preferred contact</p>
    <label><input type="radio" name="contact"> Email</label><label><input type="radio" name="contact"> Phone</label>
    <input aria-label="Other contact"></div>
  <div><p>Terms</p><label><input type="radio" name="terms"> I agree</label></div>
</body></html>`;

const CHECKBOXES = `<!doctype html><html><head><title>Apply</title></head><body><form>
  <ul>
    <li><div class="label"><div class="text">Availability?<span>✱</span></div></div>
      <div class="field"><ul>
        <li><label><input type="checkbox" name="cards[a][field2][]" value="Immediately"><span>Immediately</span></label></li>
        <li><label><input type="checkbox" name="cards[a][field2][]" value="2 weeks"><span>2 weeks</span></label></li>
        <li><label><input type="checkbox" name="cards[a][field2][]" value="1 month"><span>1 month</span></label></li>
      </ul></div></li>
  </ul>
  <button type="button">Submit application</button>
</form></body></html>`;

const DRAWN_BOX =
  'display:inline-block;position:relative;width:16px;height:16px;border:1px solid #333';

const FOLLOW = `<!doctype html><html><head><title>Review your application</title></head><body>
  <div role="dialog" aria-modal="true" aria-label="Apply to Acme">
    <h3>Review your application</h3>
    <div><div style="${DRAWN_BOX}"><input type="checkbox" id="follow" checked style="${HIDDEN_INPUT}"></div>
      <label for="follow">Follow Acme to stay up to date with their page</label></div>
    <div><div style="${DRAWN_BOX}"><input type="checkbox" id="terms" style="${HIDDEN_INPUT}"></div>
      <label for="terms">I agree to the <a href="#terms-page">terms of use</a></label></div>
    <input type="checkbox" id="hp" name="hp" style="display:none"><label for="hp" style="display:none">Leave unticked</label>
    <button type="button">Submit application</button>
  </div>
</body></html>`;

const choose = (ref: string, option: string): BrowserAction => ({
  kind: 'select',
  ref,
  option,
  reason: 'from the evidence',
  expect: null,
  serves: [],
});

const groupsOf = (observation: PageObservation): ObservedElement[] =>
  observation.elements.filter((element) => element.role === 'radiogroup');

describe('the Playwright browser, on radios a page groups by name alone', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    browser = new PlaywrightBrowser(
      specBrowserOptions(profiles, { actionTimeoutMs: 3_000, optionWaitMs: 500 }),
    );
    await browser.open('spec-name-groups', { headed: false, documents: [] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it.each([
    [
      'in a list of their own under the question',
      LISTED,
      'Are you legally authorized to work in the country in which this role will be located?✱',
    ],
    [
      'drawn by their labels over inputs with no box',
      DRAWN,
      'Will you now or in the future require visa sponsorship to work legally in the United States? *',
    ],
  ])(
    '[BRW-2] reads radios %s as one question with its options, never as fields apart, and chooses and reads back an answer',
    async (_shape, html, question) => {
      await browser.page.setContent(html);
      const observation = await browser.observe();
      const [group, ...more] = groupsOf(observation);
      expect(more).toEqual([]);
      expect(group).toMatchObject({
        kind: 'selectable',
        name: '',
        options: ['Yes', 'No'],
        value: null,
        context: question,
      });
      expect(observation.elements.filter((element) => element.role === 'radio')).toEqual([]);
      await browser.act(choose(group?.ref ?? '', 'No'));
      const [after] = groupsOf(await browser.observe());
      expect(after?.value).toBe('No');
      expect(await browser.readValue(after?.ref ?? '')).toBe('No');
    },
  );

  it('[BRW-2] reads checkboxes sharing a name in a box of their own as one question chosen from, ticks the option asked for, and leaves an option already ticked as it is', async () => {
    await browser.page.setContent(CHECKBOXES);
    const observation = await browser.observe();
    const [group, ...more] = observation.elements.filter((element) => element.role === 'listbox');
    expect(more).toEqual([]);
    expect(group).toMatchObject({
      kind: 'selectable',
      name: '',
      options: ['Immediately', '2 weeks', '1 month'],
      value: null,
      context: 'Availability?✱',
    });
    expect(observation.elements.filter((element) => element.role === 'checkbox')).toEqual([]);
    await browser.act(choose(group?.ref ?? '', '2 weeks'));
    await browser.act(choose(group?.ref ?? '', '2 weeks'));
    const [after] = (await browser.observe()).elements.filter((e) => e.role === 'listbox');
    expect(after?.value).toBe('2 weeks');
    expect(await browser.readValue(after?.ref ?? '')).toBe('2 weeks');
  });

  it('[BRW-2] lists a checkbox its page drew under the box that holds it, seen where its box is seen, and turns it the other way where a person clicks — never through a link in its label, never one the page hides', async () => {
    await browser.page.setContent(FOLLOW);
    const observation = await browser.observe();
    const checkboxes = observation.elements.filter((element) => element.role === 'checkbox');
    expect(
      checkboxes.map(({ name, value, visible, kind }) => ({ name, value, visible, kind })),
    ).toEqual([
      {
        name: 'Follow Acme to stay up to date with their page',
        value: 'checked',
        visible: true,
        kind: 'clickable',
      },
      { name: 'I agree to the terms of use', value: 'unchecked', visible: true, kind: 'clickable' },
    ]);
    const [follow, terms] = checkboxes;
    await browser.act({
      kind: 'click',
      ref: follow?.ref ?? '',
      reason: 'never follow',
      expect: null,
      serves: [],
    });
    await browser.act({
      kind: 'click',
      ref: terms?.ref ?? '',
      reason: 'required consent',
      expect: null,
      serves: [],
    });
    const [followAfter, termsAfter] = (await browser.observe()).elements.filter(
      (e) => e.role === 'checkbox',
    );
    expect(followAfter?.value).toBe('unchecked');
    expect(termsAfter?.value).toBe('checked');
    expect(await browser.readValue(followAfter?.ref ?? '')).toBe('unchecked');
    // The link in the consent's label was never followed.
    expect(browser.page.url()).not.toContain('#terms-page');
  });

  it('[BRW-2] leaves radios as the tree lists them where no box holds their group alone: a flat layout, a box another control shares, a radio alone', async () => {
    await browser.page.setContent(UNGROUPED);
    const observation = await browser.observe();
    expect(groupsOf(observation)).toEqual([]);
    expect(
      observation.elements.filter((element) => element.role === 'radio').map((e) => e.name),
    ).toEqual(['Yes', 'No', 'Yes', 'No', 'Email', 'Phone', 'I agree']);
  });
});
