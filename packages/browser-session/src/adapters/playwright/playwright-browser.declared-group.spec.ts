import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { DRAWN_BOX, HIDDEN_INPUT, specBrowserOptions } from './testing';

/**
 * Questions answered by checkboxes a page draws itself, each nameless beside
 * its words, gathered in a box the page declares a group — a fieldset, a
 * `role="group"` — as two application forms drew them on 2026-11-06: a "Yes"
 * or "No" question, and a list to pick from. A click on an answer draws it
 * anew, ticked. Beside them, a declared group that also holds a field, whose
 * checkboxes stay as the tree lists them. Run with the `browser` project.
 */
const option = (words: string): string =>
  `<div class="opt"><div style="${DRAWN_BOX}"><input type="checkbox" style="${HIDDEN_INPUT}"></div><p>${words}</p></div>`;

const DECLARED = `<!doctype html><html><head><title>Apply — additional questions</title></head><body>
<script>
  // An answer clicked anywhere on it is drawn anew, holding the state the click gave it.
  document.addEventListener('click', (event) => {
    const clicked = event.target.closest('.opt');
    if (clicked === null) return;
    const next = clicked.cloneNode(true);
    next.querySelector('input').checked = !clicked.querySelector('input').checked;
    clicked.replaceWith(next);
  });
</script>
<form>
  <p>Are you a US Citizen or Permanent Resident? *</p>
  <fieldset>${option('Yes')}${option('No')}</fieldset>
  <p>Which have you used to build an agentic system? (Select all that apply) *</p>
  <div role="group">${option('LangGraph')}${option('CrewAI')}${option('A custom orchestrator')}</div>
  <p>Anything else?</p>
  <fieldset>${option('Mixed A')}${option('Mixed B')}<input aria-label="Tell us more"></fieldset>
  <h3 id="relocate">Are you open to relocation?</h3>
  <div role="group" aria-labelledby="relocate">${option('Open')}${option('Not open')}</div>
  <fieldset><legend>Work eligibility</legend>
    <p>Are you authorized to work here?</p>${option('Yes')}${option('No')}
    <p>Will you need sponsorship?</p>${option('Yes')}${option('No')}
  </fieldset>
</form>
</body></html>`;

const common = { reason: 'the procedure says so', expect: null, serves: [] };

describe('the Playwright browser and checkboxes a page draws in a group it declares', () => {
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

  it('[BRW-2] reads a declared group holding drawn checkboxes, no other control and one question as one question chosen from, with its question, and chooses the answer asked for', async () => {
    await browser.page.setContent(DECLARED);
    const observation = await browser.observe();
    const groups = observation.elements.filter((e) => e.role === 'listbox');
    expect(groups.map((g) => g.options)).toEqual([
      ['Yes', 'No'],
      ['LangGraph', 'CrewAI', 'A custom orchestrator'],
      ['Open', 'Not open'],
    ]);
    expect(groups[0]?.context).toContain('US Citizen or Permanent Resident');
    // A group its author names asks by its own name.
    expect(groups[2]?.name).toBe('Are you open to relocation?');
    // Never listed as checkboxes apart; a group that holds a field, or two questions, keeps its own as the tree lists them.
    const apart = observation.elements.filter((e) => e.role === 'checkbox');
    expect(apart).toHaveLength(6);
    // Nothing ticked reads back as nothing, never as every answer's words.
    expect(await browser.readValue(groups[0]?.ref ?? '')).toBeNull();
    await browser.act({ kind: 'select', ref: groups[0]?.ref ?? '', option: 'Yes', ...common });
    await browser.act({ kind: 'select', ref: groups[1]?.ref ?? '', option: 'CrewAI', ...common });
    const ticked = await browser.page.$$eval('.opt input', (inputs) =>
      inputs.map((input) => (input as HTMLInputElement).checked),
    );
    expect(ticked.slice(0, 7)).toEqual([true, false, false, true, false, false, false]);
  });
});
