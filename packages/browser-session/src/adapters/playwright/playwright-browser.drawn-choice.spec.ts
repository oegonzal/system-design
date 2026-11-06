import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservedElement, PageObservation, StepAction } from '@sysdesign/contracts';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * A checkbox a design system draws: its own input made invisible over the box
 * it draws, inside the label a person reads — the consent box a form gated
 * its fields behind on 2026-11-06 — beside the shapes that stay unseen: an
 * invisible box with no label shown, and one a drawn cover lies over, where a
 * click at its centre lands on the cover. Run with the `browser` project.
 */
const CONSENT = `<!doctype html><html><head><title>Apply — consent</title>
<style>
  .box { position: relative; display: inline-block; width: 16px; height: 16px; }
  .box input { position: absolute; inset: 0; margin: 0; opacity: 0; width: 16px; height: 16px; cursor: pointer; }
  .box .drawn { display: block; width: 14px; height: 14px; border: 1px solid #333; }
  .cover { position: absolute; inset: 0; background: white; }
</style></head><body>
<script>
  // A list the box opens on a click: its options a person picks, the choice shown in the box.
  document.addEventListener('mousedown', (event) => {
    const input = document.getElementById('contact');
    if (event.target !== input || document.getElementById('contact-list')) return;
    const list = document.createElement('div');
    list.id = 'contact-list';
    list.setAttribute('role', 'listbox');
    for (const name of ['Email', 'Mobile Phone', 'Home Phone']) {
      const option = document.createElement('div');
      option.setAttribute('role', 'option');
      option.textContent = name;
      option.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.setAttribute('data-chosen', name);
        list.remove();
      });
      list.appendChild(option);
    }
    document.body.appendChild(list);
  });
</script>
  <form>
    <label><span class="box"><input type="checkbox" name="agree"><span class="drawn"></span></span><span>I agree to the Privacy Statement</span></label>
    <span class="box"><input type="checkbox" name="bait" aria-label="Leave this empty"><span class="drawn"></span></span>
    <label><span class="box"><input type="checkbox" name="covered"><span class="cover"></span></span><span>Covered option</span></label>
    <label for="contact">Preferred Contact Method</label>
    <span class="select"><input id="contact" type="search" role="combobox" readonly aria-controls="contact-list" style="opacity: 0; width: 200px; height: 30px"></span>
    <div style="height: 3000px"></div>
    <label><span class="box"><input type="checkbox" name="current"><span class="drawn"></span></span><span>Current Job</span></label>
  </form>
</body></html>`;

const click = (ref: string): Extract<StepAction, { kind: 'click' }> => ({
  kind: 'click',
  ref,
  reason: 'the procedure says so',
  expect: null,
  serves: [],
});

const byName = (observation: PageObservation, name: string): ObservedElement => {
  const element = observation.elements.find((e) => e.role === 'checkbox' && e.name === name);
  if (element === undefined) throw new Error(`no checkbox "${name}" observed`);
  return element;
};

describe('the Playwright browser and a checkbox the page draws over its own invisible input', () => {
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

  it('[BRW-2] sees the invisible input a click at its centre lands on beside its shown label — a checkbox ticked by a click, a list’s box chosen from, and below the window seen by its label alone; an invisible box with no label shown, or under a cover, stays unseen', async () => {
    await browser.page.setContent(CONSENT);
    const observation = await browser.observe();
    const consent = byName(observation, 'I agree to the Privacy Statement');
    expect(consent).toMatchObject({ visible: true, value: 'unchecked', hiddenTraits: [] });
    expect(observation.elements.find((e) => e.name === 'Leave this empty')?.visible ?? false).toBe(
      false,
    );
    expect(observation.elements.find((e) => e.name === 'Covered option')?.visible ?? false).toBe(
      false,
    );
    await browser.act(click(consent.ref));
    expect(await browser.page.locator('input[name="agree"]').isChecked()).toBe(true);
    // A list's box drawn so is seen, and its choice is made as for any typed control: its own list opened, the option clicked.
    const contact = observation.elements.find(
      (e) => e.role === 'combobox' && e.name === 'Preferred Contact Method',
    );
    expect(contact).toMatchObject({ visible: true });
    await browser.act({
      kind: 'select',
      ref: contact?.ref ?? '',
      option: 'Mobile Phone',
      reason: 'the procedure says so',
      expect: null,
      serves: [],
    });
    expect(await browser.page.locator('#contact').getAttribute('data-chosen')).toBe('Mobile Phone');
    // Below the window it is not hit-tested, and rests on its shown label.
    expect(byName(observation, 'Current Job')).toMatchObject({ visible: true, hiddenTraits: [] });
  });
});
