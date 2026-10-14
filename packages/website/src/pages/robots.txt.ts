import type { APIRoute } from 'astro';

import { SITE } from '../data/site';

/**
 * robots.txt, prerendered with the rest of the site. Its sitemap URL names
 * SITE.origin, as every page's full URLs do.
 */
export const GET: APIRoute = () => {
  const sitemap = new URL('sitemap-index.xml', SITE.origin).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
