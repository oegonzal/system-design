import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';

/**
 * A dialog in front of the page that says it is still loading is read again
 * until it has loaded, against the Chromium Playwright bundles, headless. The
 * loading dialog is drawn the way a live one drew it on 2026-10-10: its close
 * button, its heading and a progressbar with no value, the form arriving a
 * moment later. Run with the `browser` project.
 */
const dialogLoading = (
  busy: string,
): string => `<!doctype html><html><head><title>Apply</title></head><body>
  <main><a href="#listing">The listing</a></main>
  <div role="dialog" aria-modal="true" aria-label="Apply" ${busy === 'aria-busy' ? 'aria-busy="true"' : ''}>
    <button type="button">Dismiss</button>
    <h2>Apply</h2>
    <div id="body">${busy === 'progressbar' ? '<div role="progressbar"></div>' : ''}</div>
  </div>
  <script>
    setTimeout(() => {
      const dialog = document.querySelector('[role="dialog"]');
      dialog.removeAttribute('aria-busy');
      document.getElementById('body').innerHTML =
        '<label for="first">First name</label> <input id="first"> <button type="button">Next</button>';
    }, 1500);
  </script>
</body></html>`;

const DIALOG_LOADED = `<!doctype html><html><head><title>Apply</title></head><body>
  <main><a href="#listing">The listing</a></main>
  <div role="dialog" aria-modal="true" aria-label="Apply">
    <button type="button">Dismiss</button>
    <h2>Apply</h2>
    <progress value="11" max="100"></progress> 1/9 pages
    <label for="first">First name</label> <input id="first"> <button type="button">Next</button>
  </div>
</body></html>`;

describe('the Playwright browser, on a dialog still loading', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    browser = new PlaywrightBrowser({ profilesDir: profiles, channel: undefined });
    await browser.open('spec', { headed: false });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it.each(['progressbar', 'aria-busy'])(
    '[BRW-2] reads a dialog that says it is loading (%s) again until its form has rendered',
    async (busy) => {
      await browser.page.setContent(dialogLoading(busy));
      const observation = await browser.observe();
      // Two reads of the shell agree; without the rule the plan was made on it.
      expect(observation.elements.map((element) => element.name)).toEqual(
        expect.arrayContaining(['First name', 'Next']),
      );
      expect(observation.reading.reads).toBeGreaterThan(2);
    },
  );

  it('[BRW-2] takes no extra read for a dialog whose progress bar carries its value', async () => {
    await browser.page.setContent(DIALOG_LOADED);
    const observation = await browser.observe();
    expect(observation.elements.map((element) => element.name)).toEqual(
      expect.arrayContaining(['First name', 'Next']),
    );
    expect(observation.reading).toMatchObject({ settled: true, reads: 2 });
  });
});
