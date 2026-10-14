import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { DIST } from './site';

/**
 * The headers `_headers` declares for a rule, by lower-cased name — read from
 * the built file, so the suite checks what the site declares rather than a copy
 * of it. The format is Cloudflare's: a URL pattern on its own line, then
 * indented `Name: value` lines.
 */
export function declaredHeaders(pattern: string): Map<string, string> {
  const headers = new Map<string, string>();
  let inRule = false;
  for (const line of readFileSync(join(DIST, '_headers'), 'utf8').split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inRule = line.trim() === pattern;
      continue;
    }
    if (!inRule) continue;
    const separator = line.indexOf(':');
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  // A rule that declares nothing would make every check against it pass vacuously.
  if (headers.size === 0) throw new Error(`_headers declares no headers for ${pattern}`);
  return headers;
}

const locationsIn = (page: Page, xml: string): Promise<string[]> =>
  page.evaluate(
    (markup) =>
      [...new DOMParser().parseFromString(markup, 'application/xml').querySelectorAll('loc')].map(
        (loc) => loc.textContent ?? '',
      ),
    xml,
  );

/** Every URL the served sitemap lists, by path. */
export async function sitemapLocations(page: Page): Promise<Map<string, string>> {
  const index = await (await page.request.get('/sitemap-index.xml')).text();
  const sitemaps = await locationsIn(page, index);
  const urls = await Promise.all(
    sitemaps.map(async (sitemap) =>
      locationsIn(page, await (await page.request.get(new URL(sitemap).pathname)).text()),
    ),
  );
  return new Map(urls.flat().map((url) => [new URL(url).pathname, url]));
}
