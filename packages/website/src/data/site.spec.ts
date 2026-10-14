import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import config from '../../astro.config';
import { SITE } from './site';

/** wrangler.jsonc as wrangler reads it — JSON with comments and trailing commas — through TypeScript's JSONC reader. */
const wranglerConfig = (): { routes?: { pattern: string; custom_domain?: boolean }[] } => {
  const path = join(__dirname, '..', '..', 'wrangler.jsonc');
  const { config: parsed, error } = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, ' '));
  return parsed;
};

describe('the site', () => {
  it('[SITE-1] is statically generated: no adapter, nothing rendered on demand', () => {
    // Without an adapter Astro can only prerender, and a route that asks to
    // render on demand fails the build — so this is the whole guarantee.
    expect(config.adapter).toBeUndefined();
    expect(config.output ?? 'static').toBe('static');
  });

  it('[SITE-6] is served from exactly one custom domain, its own origin', () => {
    // Canonical URLs, the sitemap and robots.txt name SITE.origin; the Worker
    // answers on the domains wrangler.jsonc lists. www redirects at the zone
    // instead of being a second domain serving the same pages.
    const domains = (wranglerConfig().routes ?? [])
      .filter((route) => route.custom_domain === true)
      .map((route) => route.pattern);
    expect(domains).toEqual([new URL(SITE.origin).host]);
  });
});
