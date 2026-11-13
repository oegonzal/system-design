import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * The sign-in moved as storage state: planted in one profile through
 * Playwright directly, exported by the adapter, and set into a fresh profile
 * the adapter opens. The page's origin is served by a route, so nothing
 * listens on a port: a page on an opaque origin (`setContent`, a data URL)
 * has no local storage to keep.
 */
const ORIGIN = 'https://seed.test';
const PAGE = `<!doctype html><html><head><title>Seeded</title></head><body><p>signed in</p></body></html>`;

describe('a profile’s sign-in as storage state', () => {
  let profiles: string;

  beforeAll(() => {
    profiles = mkdtempSync(join(tmpdir(), 'browser-session-state-'));
  });

  afterAll(() => {
    rmSync(profiles, { recursive: true, force: true });
  });

  it('[BRW-31] is exported from the profile that holds it — cookies and local storage — and seeds a fresh profile the browser opens, which holds nothing unseeded', async () => {
    const planted = await chromium.launchPersistentContext(join(profiles, 'signed-in'), {
      headless: true,
    });
    try {
      await planted.route(`${ORIGIN}/**`, (route) =>
        route.fulfill({ contentType: 'text/html', body: PAGE }),
      );
      const page = planted.pages()[0] ?? (await planted.newPage());
      await page.goto(`${ORIGIN}/`);
      await page.evaluate(() => localStorage.setItem('session', 'kept'));
      await planted.addCookies([
        {
          name: 'li_at',
          value: 'secret',
          domain: '.seed.test',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 86_400,
        },
      ]);
    } finally {
      await planted.close();
    }

    const browser = new PlaywrightBrowser(specBrowserOptions(profiles));
    // The origin is named: an export reports the local storage of the origins it visited, and no other.
    const state = await browser.exportState('signed-in', [ORIGIN]);
    expect(
      state.cookies.map((cookie) => [cookie.name, cookie.value, cookie.domain, cookie.httpOnly]),
    ).toEqual([['li_at', 'secret', '.seed.test', true]]);
    expect(state.origins).toHaveLength(1);
    expect(state.origins[0]).toMatchObject({
      origin: ORIGIN,
      localStorage: [{ name: 'session', value: 'kept' }],
    });

    await browser.open('fresh', { headed: false, documents: [], seed: state });
    try {
      const context = browser.page.context();
      expect((await context.cookies()).map((cookie) => [cookie.name, cookie.value])).toEqual([
        ['li_at', 'secret'],
      ]);
      await context.route(`${ORIGIN}/**`, (route) =>
        route.fulfill({ contentType: 'text/html', body: PAGE }),
      );
      await browser.page.goto(`${ORIGIN}/`);
      expect(await browser.page.evaluate(() => localStorage.getItem('session'))).toBe('kept');
    } finally {
      await browser.close();
    }

    // Opened with no seed, a fresh profile holds nothing: the seed is what moved the sign-in.
    await browser.open('bare', { headed: false, documents: [] });
    try {
      expect(await browser.page.context().cookies()).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
