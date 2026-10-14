import type { APIRoute } from 'astro';

/**
 * robots.txt, prerendered with the rest of the site. The sitemap URL is built
 * from Astro's `site`, so it can never name a different host than the pages.
 */
export const GET: APIRoute = ({ site }) => {
  if (site === undefined) throw new Error('astro.config.ts must set `site`.');
  const sitemap = new URL('sitemap-index.xml', site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
