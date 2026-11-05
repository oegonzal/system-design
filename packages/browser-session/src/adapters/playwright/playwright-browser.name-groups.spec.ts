import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import type { BrowserAction } from '../../core/ports';
import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Radios a page groups by their name alone — the HTML standard's radio
 * button group — with no radiogroup role and no fieldset around them, drawn
 * as two employer forms drew them: a list of labelled radios under the
 * question's own box (2026-11-01), and radios drawn by their labels over
 * inputs with no box, which the tree lists with no ref (2026-11-05). Beside
 * them, the layouts that must stay as the tree lists them: radios laid out
 * flat among other fields, a box another control shares, and a radio alone
 * in its group. Run with the `browser` project.
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

  it('[BRW-2] leaves radios as the tree lists them where no box holds their group alone: a flat layout, a box another control shares, a radio alone', async () => {
    await browser.page.setContent(UNGROUPED);
    const observation = await browser.observe();
    expect(groupsOf(observation)).toEqual([]);
    expect(
      observation.elements.filter((element) => element.role === 'radio').map((e) => e.name),
    ).toEqual(['Yes', 'No', 'Yes', 'No', 'Email', 'Phone', 'I agree']);
  });
});
