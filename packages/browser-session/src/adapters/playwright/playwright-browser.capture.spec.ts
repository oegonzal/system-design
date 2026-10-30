import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * The images a session keeps, against the Chromium Playwright bundles,
 * headless: the page at CSS scale, and a field entry outlined while its image
 * is taken and left unmarked after. Run with the `browser` project.
 */
const FORM = `<!doctype html><html><head><title>Apply</title></head><body>
  <form><label for="years">Years of experience</label> <input id="years" type="number"></form>
</body></html>`;

/** A PNG's width and height, from its header. */
const sizeOf = (png: Uint8Array): [number, number] => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

describe('the Playwright browser, imaging the page', () => {
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

  it('[BRW-9] images the page at CSS scale, a field entry outlined only while its image is taken', async () => {
    await browser.page.setContent(FORM);
    const observation = await browser.observe();
    const years = observation.elements.find((element) => element.name === 'Years of experience');
    if (years === undefined) throw new Error('the fixture lists no years field');
    await browser.act({
      kind: 'fill',
      ref: years.ref,
      value: '6',
      reason: 'cv',
      expect: null,
      serves: [],
    });

    const plain = await browser.screenshot(null);
    const viewport = await browser.page.evaluate(() => [window.innerWidth, window.innerHeight]);
    expect(sizeOf(plain)).toEqual(viewport);

    const outlined = await browser.screenshot(years.ref);
    expect(sizeOf(outlined)).toEqual(viewport);
    // The outline is in the image, and nowhere on the page once it is taken.
    expect(Buffer.from(outlined).equals(Buffer.from(plain))).toBe(false);
    expect(await browser.page.locator('[data-session-capture]').count()).toBe(0);
    expect(Buffer.from(await browser.screenshot(null)).equals(Buffer.from(plain))).toBe(true);

    // A ref the page no longer has is imaged unmarked, never a failure.
    expect((await browser.screenshot('e9999')).byteLength).toBeGreaterThan(100);
  });
});
