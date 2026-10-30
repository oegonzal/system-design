import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StepAction } from '@sysdesign/contracts';

import { PlaywrightBrowser } from './playwright-browser';
import { specBrowserOptions } from './testing';

/**
 * Against the Chromium Playwright bundles, headless, on a throwaway profile:
 * how the adapter follows a page a link opened on a page of its own, and how
 * it closes the pages a unit of work opened. Run with the `browser` vitest
 * project.
 */
const LISTING = `<!doctype html><html><head><title>Listing</title></head><body>
  <a href="about:blank" target="_blank">Open job</a>
  <a href="about:blank" target="_blank">Open another</a>
</body></html>`;

const page = (title: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><button type="button">Apply</button></body></html>`;

const click = (ref: string): Extract<StepAction, { kind: 'click' }> => ({
  kind: 'click',
  ref,
  reason: 'the procedure says so',
  expect: null,
  serves: [],
});

describe('the Playwright browser and the pages a unit opens', () => {
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

  /** Observe the page in front and click the link named, waiting for the page it opens. */
  const open = async (name: string): Promise<void> => {
    const observation = await browser.observe();
    const link = observation.elements.find((e) => e.role === 'link' && e.name === name);
    if (link === undefined) throw new Error(`no link "${name}" observed`);
    const opened = browser.page.context().waitForEvent('page');
    await browser.act(click(link.ref));
    await opened;
  };

  it('[BRW-25] follows the page a link opened, closes every page the unit opened newest first and brings the opener back in front', async () => {
    const opener = browser.page;
    await opener.setContent(LISTING);
    const closedInOrder: string[] = [];

    await open('Open job');
    const job = browser.page;
    expect(job).not.toBe(opener);
    job.on('close', () => closedInOrder.push('job'));
    await job.setContent(page('Job'));
    expect((await browser.observe()).title).toBe('Job');

    // A second page over the first, as an employer's form opens over a job page.
    await job.setContent(LISTING.replace('Listing', 'Job'));
    await open('Open another');
    const form = browser.page;
    expect(form).not.toBe(job);
    form.on('close', () => closedInOrder.push('form'));
    await form.setContent(page('Form'));
    const onForm = (await browser.observe()).elements[0]?.ref ?? 'e1';

    expect(await browser.closeOpenedPages()).toEqual({ closed: 2, front: opener.url() });
    expect(closedInOrder).toEqual(['form', 'job']);
    expect(browser.page).toBe(opener);
    expect(opener.context().pages()).toHaveLength(1);
    // The refs of the closed page went with it.
    await expect(browser.act(click(onForm))).rejects.toThrow(
      'is not an element of the last observation',
    );
    expect((await browser.observe()).title).toBe('Listing');
  });

  it('[BRW-25] counts only what it closed: a page the site closed is not counted, and the kept set starts over after each close', async () => {
    const opener = browser.page;
    await opener.setContent(LISTING);

    await open('Open job');
    const popup = browser.page;
    expect(popup).not.toBe(opener);
    await popup.close(); // the site closed it
    expect(await browser.closeOpenedPages()).toEqual({ closed: 0, front: opener.url() });

    await open('Open another');
    expect(browser.page).not.toBe(opener);
    expect(await browser.closeOpenedPages()).toEqual({ closed: 1, front: opener.url() });
    expect(browser.page).toBe(opener);
    expect(await browser.closeOpenedPages()).toEqual({ closed: 0, front: opener.url() });
  });
});
