import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation } from '@sysdesign/contracts';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Where a person reads a field's question when nothing names the field but
 * its placeholder — a hint, never a label, by the HTML standard: the nearest
 * words before it, in the boxes it fills alone. Drawn as an employer's form
 * drew its questions on 2026-11-01 — the question in the row's label box, the
 * textarea alone in the field box beside it — and as another drew its
 * location on 2026-11-07, a label tied to no field above a box holding the
 * field and an icon-only button that opens its list; beside the shapes that
 * must read no question: a field whose box is shared, one labelled by its own
 * name, and one whose nearest words belong to another field. Run with the
 * `browser` project.
 */
const QUESTIONS = `<!doctype html><html><head><title>Apply — questions</title></head><body>
  <form>
    <ul>
      <li><div class="label"><div class="text">Desired Salary?<span>✱</span></div></div>
        <div class="field"><textarea name="cards[a][field0]" placeholder="Type your response" required></textarea></div></li>
      <li><div class="label">Notice period</div>
        <div class="field"><input name="cards[a][field1]" aria-label="Type your response" placeholder="Type your response"></div></li>
      <li><div class="label">When could you start?</div>
        <div><i class="icon"></i><div><input name="cards[a][field2]" placeholder="Your answer"></div></div></li>
      <li><div class="label">Start date</div><div><input name="start" aria-label="Start date" placeholder="MM/DD/YYYY"></div></li>
    </ul>
    <div><input name="first" placeholder="First name"></div>
    <div><input name="last" placeholder="Last name"></div>
    <p>Portfolio <input name="site" placeholder="https://"></p>
    <div><span>City</span><input name="city" placeholder="City"><button type="button">Use my location</button></div>
    <div><label for="nowhere">Current Location</label>
      <div><input role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" placeholder="Start typing..."><button type="button"><svg width="12" height="12"></svg></button></div></div>
    <div><span>Region</span>
      <div><input name="region" placeholder="Search regions"><button type="button" aria-label="Clear"><svg width="12" height="12"></svg></button></div></div>
  </form>
</body></html>`;

describe('the Playwright browser, on the question a person reads above a field', () => {
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

  const fieldsNamed = (observation: PageObservation, name: string): ObservedElement[] =>
    observation.elements.filter((element) => element.name === name);
  const fieldNamed = (observation: PageObservation, name: string): ObservedElement => {
    const [element] = fieldsNamed(observation, name);
    if (element === undefined) throw new Error(`no field "${name}" observed`);
    return element;
  };

  it('[BRW-2] reads the question of a field named only by its placeholder in the box before the one it fills alone, climbing past boxes that show no words', async () => {
    await browser.page.setContent(QUESTIONS);
    const observation = await browser.observe();
    // The tree names each by its placeholder; the question is its context, and the placeholder is not repeated there.
    const [salary, notice] = fieldsNamed(observation, 'Type your response');
    expect(salary).toMatchObject({ role: 'textbox', required: true, context: 'Desired Salary?✱' });
    // An ARIA name that is only the placeholder's words names nothing either.
    expect(notice?.context).toBe('Notice period');
    expect(fieldNamed(observation, 'Your answer').context).toBe('When could you start?');
    // Words right before it in its own box, and in the box it shares with its own words only.
    expect(fieldNamed(observation, 'https://').context).toBe('Portfolio');
    // A button that shows no words and that nothing names asks nothing: the climb passes the box it shares.
    expect(fieldNamed(observation, 'Start typing...')).toMatchObject({
      role: 'combobox',
      context: 'Current Location',
    });
  });

  it('[BRW-2] reads no question where a person would not: a field named by its label keeps its placeholder as a hint, and words past a box another control shares belong to that control', async () => {
    await browser.page.setContent(QUESTIONS);
    const observation = await browser.observe();
    expect(fieldNamed(observation, 'Start date').context).toBe('MM/DD/YYYY');
    // The first field's box sits after the list of questions, the second's after the first field's box.
    expect(fieldNamed(observation, 'First name').context).toBeNull();
    expect(fieldNamed(observation, 'Last name').context).toBeNull();
    // A box holding a button besides the field: the words before the field are still its own.
    expect(fieldNamed(observation, 'City').context).toBe('City');
    // An icon-only button its page names owns words, and the words before the box it shares are not the field's.
    expect(fieldNamed(observation, 'Search regions').context).toBeNull();
  });
});
