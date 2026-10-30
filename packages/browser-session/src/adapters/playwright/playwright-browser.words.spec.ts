import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * The one production seam of a unit's statement: `observe()` keeps the tree it
 * read, and `wordsUnder()` answers from that tree — never from the page as it
 * stands now. Against the Chromium Playwright bundles, headless, on a
 * throwaway profile; run with the `browser` vitest project.
 */
const LISTING = `<!doctype html><html><head><title>Listing</title></head><body>
  <header><nav><a href="/jobs">Jobs</a></nav></header>
  <main>
    <h1>Senior Engineer</h1>
    <p>Acme builds tools for teams.</p>
    <label for="notes">Notes</label><textarea id="notes">typed so far</textarea>
    <section aria-label="Similar"><a href="/jobs/2">Staff Engineer</a></section>
    <nav aria-label="Jump"><a href="#top">Top</a></nav>
    <button type="button">Easy Apply</button>
  </main>
  <footer><a href="/help">Help</a></footer>
</body></html>`;

const NEXT_LISTING = `<!doctype html><html><head><title>Listing</title></head><body>
  <main><h1>Staff Engineer</h1><p>Globex ships software.</p><button type="button">Apply</button></main>
</body></html>`;

const NO_MAIN = `<!doctype html><html><head><title>Plain</title></head><body><button type="button">Only</button></body></html>`;

describe('what the Playwright browser states under a landmark', () => {
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

  it('[BRW-16] answers from the tree of the last observation — a nested landmark left to its own role, what a control holds left out — unchanged until the next observe, and nothing for a landmark the page lacks', async () => {
    await browser.page.setContent(LISTING);
    // Nothing observed yet: nothing to answer from.
    expect(browser.wordsUnder('main')).toEqual([]);
    await browser.observe();
    const words = browser.wordsUnder('main');
    for (const word of [
      'Senior Engineer',
      'Acme builds tools for teams.',
      'Staff Engineer',
      'Easy Apply',
    ]) {
      expect(words).toContain(word);
    }
    // The nested navigation's words are its own; a control's value is what it holds, not a word.
    expect(words.join('\n')).not.toMatch(/Jump|Top|typed so far|Jobs|Help/);
    expect(browser.wordsUnder('navigation')).toEqual(['Jobs', 'Jump', 'Top']);
    expect(browser.wordsUnder('banner')).toEqual([]);
    expect(browser.wordsUnder('contentinfo')).toEqual(['Help']);
    expect(browser.wordsUnder('complementary')).toEqual([]);

    // The page moves on under the browser; the statement is the page as the plan saw it, until it is observed again.
    await browser.page.setContent(NEXT_LISTING);
    expect(browser.wordsUnder('main')).toEqual(words);
    await browser.observe();
    expect(browser.wordsUnder('main')).toEqual([
      'Staff Engineer',
      'Globex ships software.',
      'Apply',
    ]);

    await browser.page.setContent(NO_MAIN);
    await browser.observe();
    expect(browser.wordsUnder('main')).toEqual([]);
  });
});
