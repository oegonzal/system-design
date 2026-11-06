import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * A page embedding frames that never load — lazy frames far below the fold,
 * as job pages embed their videos — whose every read of the accessibility
 * tree waited for them for the whole action timeout. Measured 2026-11-06: two
 * job pages read as empty, every element unread, observation after
 * observation, until the session's unreadable rail ended it. Run with the
 * `browser` project.
 */
const LAZY_FRAMES = `<!doctype html><html><head><title>Senior Engineer — a job page</title></head><body>
  <main>
    <h1>Senior Engineer</h1>
    <a href="#apply">Apply to job</a>
    ${Array.from(
      { length: 8 },
      (_, i) =>
        `<iframe loading="lazy" title="video ${i}" src="https://lazy-frame-${i}.example.invalid/" style="display:block;margin-top:3000px;width:300px;height:200px"></iframe>`,
    ).join('\n    ')}
  </main>
</body></html>`;

describe('the Playwright browser, on a page with frames that never load', () => {
  let profiles: string;
  let browser: PlaywrightBrowser;

  beforeAll(async () => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-profiles-'));
    browser = new PlaywrightBrowser(specBrowserOptions(profiles));
    await browser.open('spec-frames', { headed: false, documents: [] });
  });

  afterAll(async () => {
    await browser.close();
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-2] reads the page within the declared snapshot bound, leaving out the frames that have not answered, so its elements are read rather than all reported unread', async () => {
    await browser.page.setContent(LAZY_FRAMES);
    const started = Date.now();
    const observation = await browser.observe();
    expect(observation.unread).toBeNull();
    expect(observation.elements.map((element) => element.name)).toContain('Apply to job');
    // Every read bounded: well inside the observation budget the action timeout used to spend whole.
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});
