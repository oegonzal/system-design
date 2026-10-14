import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

import { axeViolations } from './support/axe';
import { cspViolations, inlineAttributeAllowances, recordCspViolations } from './support/csp';
import { overflowPastRightEdge } from './support/reflow';
import { sitemapLocations } from './support/served';
import { builtPages, MISSING } from './support/site';

/** Every page the build produced, plus the 404 page. */
const PAGES = [...builtPages(), MISSING];

/** Search results cut a longer description short. */
const DESCRIPTION_MAX = 160;

/** The status a path answers with: the 404 page is served with 404. */
const statusOf = (path: string): number => (path === MISSING ? 404 : 200);

/** Loads a page, collecting every console error, page error and failed request on the way. */
async function visit(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  // The 404 page's own document is the one expected failure.
  const expected = (url: string): boolean =>
    statusOf(path) === 404 && url !== '' && new URL(url).pathname === path;
  page.on('console', (message) => {
    if (message.type() === 'error' && !expected(message.location().url)) {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('requestfailed', (request) =>
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`),
  );
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(statusOf(path));
  await page.waitForLoadState('load');
  return problems;
}

/** A link into the document it is on, like the skip link: resolved there rather than fetched. */
const isSameDocument = (url: URL, here: URL): boolean =>
  url.pathname === here.pathname && url.search === here.search;

/** The markup a link's fragment must be found in: the page it is on, or the page it leads to. */
async function markupFor(page: Page, request: APIRequestContext, url: URL): Promise<string> {
  return isSameDocument(url, new URL(page.url()))
    ? page.content()
    : (await request.get(url.pathname + url.search)).text();
}

for (const path of PAGES) {
  test.describe(path, () => {
    test(`[SITE-3] ${path} passes axe and reflows without sideways scrolling`, async ({ page }) => {
      await visit(page, path);

      expect(await axeViolations(page)).toEqual([]);
      expect(await overflowPastRightEdge(page)).toEqual({ scroll: 0, past: [] });
    });

    test(`[SITE-5] ${path} loads cleanly, with nothing inline for the CSP to allow`, async ({
      page,
    }) => {
      await recordCspViolations(page);
      const problems = await visit(page, path);

      expect(problems).toEqual([]);
      expect(await cspViolations(page)).toEqual([]);
      const inline = await page.evaluate(() => ({
        scripts: [...document.scripts].filter((s) => !s.src && s.type !== 'application/ld+json')
          .length,
        styleElements: document.querySelectorAll('style').length,
        styleAttributes: document.querySelectorAll('[style]').length,
      }));
      expect(inline).toEqual({ scripts: 0, styleElements: 0, styleAttributes: 0 });
    });

    test(`[SITE-5] every link on ${path} lands, unredirected, on a page and fragment that exist`, async ({
      page,
      request,
    }) => {
      await visit(page, path);
      const here = new URL(page.url());
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
      const urls = [...new Set(hrefs)].map((href) => new URL(href));
      const internal = urls.filter((url) => url.origin === here.origin);

      for (const url of internal.filter((candidate) => !isSameDocument(candidate, here))) {
        // No redirects followed: every href must already be the URL that answers.
        const response = await request.get(url.pathname + url.search, { maxRedirects: 0 });
        expect(response.status(), url.href).toBe(200);
      }
      for (const url of internal.filter((candidate) => candidate.hash !== '')) {
        const markup = await markupFor(page, request, url);
        const found = await page.evaluate(
          ([html, id]) =>
            new DOMParser().parseFromString(html, 'text/html').getElementById(id) !== null,
          [markup, decodeURIComponent(url.hash.slice(1))] as const,
        );
        expect(found, url.href).toBe(true);
      }
    });
  });
}

for (const path of builtPages()) {
  test(`[SITE-2] ${path} declares its language, one h1, a description and its canonical URL`, async ({
    page,
  }) => {
    await visit(page, path);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveCount(1);
    const description =
      (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    // The canonical URL is the one the sitemap lists, and link previews name the same.
    const listed = (await sitemapLocations(page)).get(path);
    expect(listed, `the sitemap lists ${path}`).toBeDefined();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', listed ?? '');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', listed ?? '');
  });
}

test('[SITE-2] the 404 page is kept out of search: noindex, and no canonical URL', async ({
  page,
}) => {
  await visit(page, MISSING);

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
});

test('[SITE-5] the served policy refuses an inline handler and an inline style, which is what lets the checks above see one', async ({
  page,
}) => {
  await recordCspViolations(page);
  await visit(page, '/');
  const policy = (await page.request.get('/')).headers()['content-security-policy'] ?? '';
  await page.evaluate(() => {
    const probe = document.createElement('p');
    probe.setAttribute('onclick', 'void 0');
    probe.setAttribute('style', 'color: red');
    document.body.append(probe);
  });

  // Refused, not merely reported, and no hash or keyword in the policy lets one particular attribute run.
  expect(await cspViolations(page)).toEqual(
    expect.arrayContaining(['enforce script-src-attr inline', 'enforce style-src-attr inline']),
  );
  expect(inlineAttributeAllowances(policy)).toEqual([]);
});
