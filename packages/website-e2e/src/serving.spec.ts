import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { declaredHeaders, sitemapLocations } from './support/served';
import { builtPages, MISSING, servedFiles } from './support/site';

test('[SITE-2] the sitemap lists exactly the pages the build produced', async ({ page }) => {
  const locations = await sitemapLocations(page);

  expect([...locations.keys()].sort()).toEqual(builtPages());
});

test('[SITE-2] every page has a title and description of its own', async ({ page, request }) => {
  const heads = await Promise.all(
    builtPages().map(async (path) => {
      const markup = await (await request.get(path)).text();
      return page.evaluate((html) => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        return {
          title: document.title,
          description:
            document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
        };
      }, markup);
    }),
  );

  expect(new Set(heads.map(({ title }) => title)).size).toBe(heads.length);
  expect(new Set(heads.map(({ description }) => description)).size).toBe(heads.length);
});

test('[SITE-2] robots.txt points crawlers at the sitemap index on the canonical origin', async ({
  page,
}) => {
  await page.goto('/');
  const canonical = new URL(
    (await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '',
  );
  const robots = await (await page.request.get('/robots.txt')).text();

  expect(robots.split('\n')).toContain(
    `Sitemap: ${new URL('sitemap-index.xml', canonical.origin).href}`,
  );
});

test('[SITE-2] the link-preview image and touch icon are PNGs of their declared sizes', async ({
  page,
}) => {
  await page.goto('/');
  const og = page.locator('meta[property="og:image"]');
  const touch = page.locator('link[rel="apple-touch-icon"]');
  const [touchWidth, touchHeight] = ((await touch.getAttribute('sizes')) ?? '').split('x');
  const images = [
    {
      src: (await og.getAttribute('content')) ?? '',
      width: Number(await page.locator('meta[property="og:image:width"]').getAttribute('content')),
      height: Number(
        await page.locator('meta[property="og:image:height"]').getAttribute('content'),
      ),
    },
    {
      src: (await touch.getAttribute('href')) ?? '',
      width: Number(touchWidth),
      height: Number(touchHeight),
    },
  ];

  for (const { src, width, height } of images) {
    // Absolute URLs name the production origin; the file is fetched from the site under test.
    const response = await page.request.get(new URL(src, page.url()).pathname);
    expect(response.status(), src).toBe(200);
    expect(response.headers()['content-type'], src).toBe('image/png');
    const {
      format,
      width: actualWidth,
      height: actualHeight,
    } = await sharp(await response.body()).metadata();
    expect({ format, width: actualWidth, height: actualHeight }, src).toEqual({
      format: 'png',
      width,
      height,
    });
  }
});

test('[SITE-2] the home page describes the organization in schema.org JSON-LD', async ({
  page,
}) => {
  await page.goto('/');
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

  expect(blocks).toHaveLength(1);
  const data = JSON.parse(blocks[0] ?? '{}') as { '@context'?: string; '@graph'?: unknown[] };
  expect(data['@context']).toBe('https://schema.org');
  expect(data['@graph']).toEqual(
    expect.arrayContaining([expect.objectContaining({ '@type': 'Organization', url: canonical })]),
  );
});

test('[SITE-5] an unknown path answers 404 with the 404 page', async ({ page }) => {
  const response = await page.goto(MISSING);

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('[SITE-5] a page asked for without its trailing slash is redirected to it', async ({
  request,
}) => {
  for (const path of builtPages().filter((candidate) => candidate !== '/')) {
    const response = await request.get(path.slice(0, -1), { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(new URL(response.headers()['location'] ?? '', 'http://site').pathname, path).toBe(path);
  }
});

test('[SITE-5] every response carries the headers _headers declares: each built file, the 404 page and each trailing-slash redirect', async ({
  request,
}) => {
  const declared = declaredHeaders('/*');
  // Every built file at the URL it answers on (the 404 page at MISSING), and every 307 to a page.
  const paths = [
    ...servedFiles().map(({ url }) => url),
    ...builtPages()
      .filter((path) => path !== '/')
      .map((path) => path.slice(0, -1)),
  ];

  for (const path of paths) {
    const served = (await request.get(path, { maxRedirects: 0 })).headers();
    for (const [name, value] of declared) expect(served[name], `${name} on ${path}`).toBe(value);
  }
});

test('[SITE-5] every built file the /_astro/* rule names carries the caching headers it declares', async ({
  request,
}) => {
  const declared = declaredHeaders('/_astro/*');
  // URLPattern reads the rule's `*` as _headers does: any run of characters.
  const rule = new URLPattern({ pathname: '/_astro/*' });
  const assets = servedFiles().filter(({ url }) => rule.test({ pathname: url }));

  expect(declared.has('cache-control'), '/_astro/* declares Cache-Control').toBe(true);
  expect(assets.length).toBeGreaterThan(0);
  for (const { url } of assets) {
    const served = (await request.get(url)).headers();
    for (const [name, value] of declared) expect(served[name], `${name} on ${url}`).toBe(value);
  }
});

test('[SITE-5] the headers file itself is never served', async ({ request }) => {
  expect((await request.get('/_headers')).status()).toBe(404);
});
